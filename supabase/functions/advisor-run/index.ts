// Advisor agent (BLUEPRINT §4.4, US-A2). Weekly, and after a month closes.
//
// SQL detectors (advisor_candidates) compute every payload. The model only chooses, ranks
// and explains: create_proposal takes a candidate_id, so it cannot invent an amount even
// if it tried. Without an API key (or consent) a deterministic ranking + template text is used.

import type Anthropic from "npm:@anthropic-ai/sdk@^0.128.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { addUsage, aiClient, flatten, logRun, MODELS, namesIn, validateText } from "../_shared/ai.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const WEEKLY_LIMIT = 3; // US-A2 AC4
const MAX_TURNS = 6;

type Candidate = {
  candidate_id: string;
  kind: "create_recurring" | "update_estimate" | "adjust_budget" | "recategorize_merchant" | "flag_duplicate";
  payload: Record<string, any>;
  evidence: Record<string, any>;
};

type Pick = { candidate: Candidate; priority: number; text: string };

const SYSTEM = `You review candidate suggestions for a two-person household's expense tracker and decide
which ones are worth showing them this week.

Each candidate already has its exact payload and evidence computed by the system. You never
change a number in a payload. You choose, you rank, and you explain.

Propose at most {{LIMIT}}. Prefer candidates with money impact, then ones that remove manual work.
Skip anything that looks like noise, a one-off, or something they already rejected recently
(you'll see rejected history). For each one you propose, write one or two sentences they will
read on a card: why this, in plain words. Cite every number through the candidate's evidence
as {{evidence.<field>}} (for example {{evidence.new_cap}}); the text must contain no digits
of its own. Call dismiss_candidate for the ones you skip, with a short reason, so every
candidate is resolved.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_merchant_history",
    description: "Monthly totals and purchase count for one merchant over the last six months.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["merchant_id"],
      properties: { merchant_id: { type: "string" } },
    },
  },
  {
    name: "get_category_trend",
    description: "Cap and spent per month for one category over the last six months.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["category_id"],
      properties: { category_id: { type: "string" } },
    },
  },
  {
    name: "create_proposal",
    description: "Show this candidate to the household as a one-tap suggestion.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["candidate_id", "priority", "rationale"],
      properties: { candidate_id: { type: "string" }, priority: { type: "integer" }, rationale: { type: "string" } },
    },
  },
  {
    name: "dismiss_candidate",
    description: "Do not show this candidate. Recorded so it is not re-evaluated for 30 days.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["candidate_id", "reason"],
      properties: { candidate_id: { type: "string" }, reason: { type: "string" } },
    },
  },
];

// ───────── deterministic path ─────────

const money = (e: any) => (e && typeof e === "object" && "money" in e ? Number(e.money) : 0);

function impact(c: Candidate): number {
  const p = c.payload;
  switch (c.kind) {
    case "flag_duplicate":
      return money(c.evidence.amount) * 100; // money already spent twice: most urgent
    case "update_estimate":
      return Math.abs(p.new_amount_minor - p.old_amount_minor) * 12;
    case "adjust_budget":
      return Math.abs(p.new_cap_minor - p.old_cap_minor) * (c.evidence.direction === "up" ? 2 : 1);
    case "create_recurring":
      return money(c.evidence.amount);
    case "recategorize_merchant":
      return 1;
  }
}

export function templateText(c: Candidate): string {
  switch (c.kind) {
    case "create_recurring":
      return "You've entered {{evidence.name}} by hand {{evidence.count}} times, about a month apart, at {{evidence.amount}}. Make it recurring and it will log itself.";
    case "update_estimate":
      return "Recent {{evidence.name}} bills averaged {{evidence.actual_avg}}, but the estimate is {{evidence.estimate}}. Updating it keeps the budget honest.";
    case "adjust_budget":
      return c.evidence.direction === "up"
        ? "{{evidence.name}} went over budget in {{evidence.over_months}} of the last {{evidence.months}} months. A cap of {{evidence.new_cap}} matches how you actually spend."
        : "{{evidence.name}} stayed well under its {{evidence.old_cap}} budget for {{evidence.months}} months. Lowering it to {{evidence.new_cap}} frees the rest for savings.";
    case "recategorize_merchant":
      return "You've moved {{evidence.name}} from {{evidence.from}} to {{evidence.to}} {{evidence.times}} times. Make {{evidence.to}} its default?";
    case "flag_duplicate":
      return "{{evidence.name}} for {{evidence.amount}} was logged twice within a day. Remove the second one?";
  }
}

function deterministic(cands: Candidate[], limit: number): Pick[] {
  return [...cands]
    .sort((a, b) => impact(b) - impact(a))
    .slice(0, limit)
    .map((c, i) => ({ candidate: c, priority: i + 1, text: templateText(c) }));
}

// A purchase entered three times yields two overlapping pairs; one card is enough.
function dropOverlappingDuplicates(cands: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return cands.filter((c) => {
    if (c.kind !== "flag_duplicate") return true;
    const ids = [c.payload.keep_transaction_id, c.payload.duplicate_transaction_id];
    if (ids.some((id) => seen.has(id))) return false;
    ids.forEach((id) => seen.add(id));
    return true;
  });
}

// ───────── AI path ─────────

async function merchantHistory(householdId: string, merchantId: string) {
  const since = new Date(Date.now() - 183 * 86_400_000).toISOString();
  const { data } = await db
    .from("transactions")
    .select("budget_month,amount_base_minor")
    .eq("household_id", householdId)
    .eq("merchant_id", merchantId)
    .is("deleted_at", null)
    .gte("occurred_at", since);
  const by = new Map<string, { spent: number; count: number }>();
  for (const t of data ?? []) {
    const k = t.budget_month.slice(0, 7);
    const v = by.get(k) ?? { spent: 0, count: 0 };
    by.set(k, { spent: v.spent + t.amount_base_minor, count: v.count + 1 });
  }
  return [...by.entries()].sort().map(([month, v]) => ({ month, ...v }));
}

async function categoryTrend(householdId: string, categoryId: string) {
  const { data: closes } = await db
    .from("month_closes")
    .select("budget_month,snapshot")
    .eq("household_id", householdId)
    .order("budget_month", { ascending: false })
    .limit(6);
  return (closes ?? []).map((c: any) => {
    const row = (c.snapshot as any[]).find((s) => s.category_id === categoryId);
    return { month: c.budget_month.slice(0, 7), cap: row?.cap ?? 0, spent: row?.spent ?? 0 };
  });
}

async function withAI(householdId: string, cands: Candidate[], limit: number, rejected: unknown[]) {
  const client = aiClient();
  if (!client) return null;
  const started = performance.now();
  const usage = { input_tokens: 0, output_tokens: 0 };
  const byId = new Map(cands.map((c) => [c.candidate_id, c]));
  const picks: Pick[] = [];
  const dismissed: Array<{ id: string; reason: string }> = [];

  const messages: any[] = [
    {
      role: "user",
      content: JSON.stringify({
        candidates: cands.map((c) => ({ candidate_id: c.candidate_id, kind: c.kind, evidence: c.evidence, payload: c.payload })),
        rejected_recently: rejected,
      }),
    },
  ];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res: any = await client.messages.create({
        model: MODELS.advisor,
        max_tokens: 6000,
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        system: SYSTEM.replace("{{LIMIT}}", String(limit)),
        tools: TOOLS,
        messages,
      });
      addUsage(usage, res.usage);
      if (res.stop_reason === "refusal") break;
      messages.push({ role: "assistant", content: res.content });
      const calls = res.content.filter((b: any) => b.type === "tool_use");
      if (calls.length === 0) break;

      const results: any[] = [];
      for (const call of calls) {
        const reply = (content: unknown, isError = false) =>
          results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(content), ...(isError ? { is_error: true } : {}) });

        if (call.name === "get_merchant_history") {
          reply(await merchantHistory(householdId, call.input.merchant_id));
        } else if (call.name === "get_category_trend") {
          reply(await categoryTrend(householdId, call.input.category_id));
        } else if (call.name === "create_proposal") {
          const c = byId.get(call.input.candidate_id);
          if (!c) reply({ error: "Unknown candidate_id." }, true);
          else if (picks.length >= limit) reply({ error: `Limit of ${limit} reached. Dismiss the rest.` }, true);
          else {
            const values = flatten({ evidence: c.evidence });
            const err = validateText(call.input.rationale, values, namesIn(values));
            if (err) reply({ error: err }, true);
            else {
              picks.push({ candidate: c, priority: call.input.priority, text: call.input.rationale.trim() });
              byId.delete(c.candidate_id);
              reply({ ok: true });
            }
          }
        } else if (call.name === "dismiss_candidate") {
          if (byId.delete(call.input.candidate_id)) dismissed.push({ id: call.input.candidate_id, reason: call.input.reason });
          reply({ ok: true });
        } else {
          reply({ error: "Unknown tool." }, true);
        }
      }
      messages.push({ role: "user", content: results });
      if (byId.size === 0) break;
    }
    const run = await logRun(db, { household_id: householdId, agent: "advisor", status: "ok", started, usage });
    return { picks, dismissed, run };
  } catch (e) {
    await logRun(db, { household_id: householdId, agent: "advisor", status: "error", started, usage, error: String(e) });
    return null;
  }
}

Deno.serve(async () => {
  const { data: households } = await db.from("households").select("id,ai_consent_at").is("deleted_at", null);
  const summary: Array<{ household: string; proposed: number; dismissed: number; mode: string }> = [];

  for (const h of households ?? []) {
    const { data: raw, error } = await db.rpc("advisor_candidates", { p_household: h.id });
    if (error) {
      console.error("ADVISOR_CANDIDATES_ERROR", h.id, error);
      continue;
    }
    const cands = dropOverlappingDuplicates((raw ?? []) as Candidate[]);
    if (cands.length === 0) continue;

    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { count } = await db
      .from("agent_proposals")
      .select("id", { count: "exact", head: true })
      .eq("household_id", h.id)
      .gte("created_at", weekAgo);
    const limit = WEEKLY_LIMIT - (count ?? 0);
    if (limit <= 0) continue;

    const { data: rejected } = await db
      .from("agent_proposals")
      .select("kind,dedupe_key,decided_at")
      .eq("household_id", h.id)
      .eq("status", "rejected")
      .order("decided_at", { ascending: false })
      .limit(10);

    const ai = h.ai_consent_at ? await withAI(h.id, cands, limit, rejected ?? []) : null;
    const picks = ai ? ai.picks : deterministic(cands, limit);
    const runId = ai?.run ?? (await logRun(db, { household_id: h.id, agent: "advisor", status: "fallback", started: performance.now() }));

    if (picks.length > 0) {
      await db.from("agent_proposals").upsert(
        picks.map((p) => ({
          household_id: h.id,
          kind: p.candidate.kind,
          payload: p.candidate.payload,
          rationale: { text: p.text, evidence: p.candidate.evidence, priority: p.priority },
          dedupe_key: p.candidate.candidate_id,
          agent_run_id: runId,
        })),
        { onConflict: "household_id,dedupe_key", ignoreDuplicates: true },
      );
    }
    for (const d of ai?.dismissed ?? []) {
      await db.rpc("advisor_dismiss", { p_household: h.id, p_candidate_id: d.id, p_reason: d.reason });
    }
    summary.push({ household: h.id, proposed: picks.length, dismissed: ai?.dismissed.length ?? 0, mode: ai ? "ai" : "template" });
  }
  return Response.json({ households: summary });
});

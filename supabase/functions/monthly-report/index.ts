// Monthly report agent (BLUEPRINT §4.3, US-A1). Drains monthly_reports rows in 'pending'.
// Woken by the DB when a month closes (or "Regenerate") and by a 15-minute backstop.
//
// SQL computed every number (app.report_metrics). The model writes words and cites numbers
// as {{path}} placeholders; the app fills them in. A report never blocks on the AI: any
// failure falls back to a template built from the same metrics.

import type Anthropic from "npm:@anthropic-ai/sdk@^0.128.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { addUsage, aiAllowed, aiClient, flatten, logRun, MODELS, namesIn, validateText } from "../_shared/ai.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const MAX_TURNS = 6;

type Metrics = {
  month: string;
  currency: string;
  totals: Record<string, number>;
  categories: Array<{ key: string; id: string; name: string; cap: number; spent: number; pct: number | null; prev_spent: number }>;
  top_merchants: Array<{ key: string; merchant_id: string | null; name: string; spent: number; tx_count: number }>;
  anomalies: Array<{ key: string; title: string; amount: number }>;
  [k: string]: unknown;
};

type Narrative = {
  headline: string;
  summary: string;
  highlights: Array<{ tone: "positive" | "warning" | "neutral"; text: string }>;
  category_notes: Array<{ category_key: string; text: string }>;
  recommendations: Array<{ text: string }>;
  extra?: Record<string, unknown>;
};

const SYSTEM = `You write the monthly spending review for a household that shares its expenses.

All numbers are already computed and live in the metrics object you receive. You never
calculate, round, compare or restate a number yourself. Whenever you refer to a value,
write a placeholder with its path, like {{totals.net}} or {{categories.c1.pct}}.
Your text must contain no digits outside placeholders. Money values in the data are in
minor units (agorot/cents); the app formats them, so just cite the path.

Paths: totals.<field>, categories.<key>.<field>, top_merchants.<key>.<field>,
anomalies.<key>.<field>, and extra.<key>.<field> for anything a tool returned.

Voice: direct, warm, specific, like a sharp friend who is good with money. English.
No generic tips ("track your spending", "make a budget"). Every recommendation must
point at a specific category, merchant or recurring item from the data.
At most five highlights and three recommendations.

Use the read tools only when a number in metrics raises a question you cannot answer
from metrics alone (e.g. which purchases drove a spike). When done, call submit_report
exactly once.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_category_transactions",
    description: "List the purchases of one category in the report month, largest first. Use to explain a spike or an alert.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["category_key", "limit"],
      properties: { category_key: { type: "string" }, limit: { type: "integer" } },
    },
  },
  {
    name: "get_merchant_history",
    description: "Monthly totals for one of the top merchants over the last six months.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["merchant_key"],
      properties: { merchant_key: { type: "string" } },
    },
  },
  {
    name: "submit_report",
    description: "Submit the final report. Call exactly once, last.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["headline", "summary", "highlights", "category_notes", "recommendations"],
      properties: {
        headline: { type: "string" },
        summary: { type: "string" },
        highlights: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["tone", "text"],
            properties: { tone: { type: "string", enum: ["positive", "warning", "neutral"] }, text: { type: "string" } },
          },
        },
        category_notes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["category_key", "text"],
            properties: { category_key: { type: "string" }, text: { type: "string" } },
          },
        },
        recommendations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["text"],
            properties: { text: { type: "string" } },
          },
        },
      },
    },
  },
];

// ───────── tools ─────────

async function categoryTransactions(householdId: string, month: string, m: Metrics, key: string, limit: number, extra: Record<string, unknown>) {
  const cat = m.categories.find((c) => c.key === key);
  if (!cat) return { error: `Unknown category_key ${key}.` };
  const { data } = await db
    .from("transactions")
    .select("title,amount_base_minor,occurred_at")
    .eq("household_id", householdId)
    .eq("category_id", cat.id)
    .eq("budget_month", `${month}-01`)
    .is("deleted_at", null)
    .order("amount_base_minor", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 10)));
  const rows = (data ?? []).map((t, i) => {
    const k = `${key}_t${i + 1}`;
    extra[k] = { title: t.title, amount: t.amount_base_minor, date: t.occurred_at.slice(0, 10) };
    return { key: k, title: t.title, amount: t.amount_base_minor, cite_as: `{{extra.${k}.amount}}` };
  });
  return { category: cat.name, purchases: rows };
}

async function merchantHistory(householdId: string, month: string, m: Metrics, key: string, extra: Record<string, unknown>) {
  const mer = m.top_merchants.find((x) => x.key === key);
  if (!mer) return { error: `Unknown merchant_key ${key}.` };
  const [y, mo] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, mo - 6, 1)).toISOString().slice(0, 10);
  let q = db
    .from("transactions")
    .select("budget_month,amount_base_minor,title")
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .gte("budget_month", from)
    .lte("budget_month", `${month}-01`);
  q = mer.merchant_id ? q.eq("merchant_id", mer.merchant_id) : q.ilike("title", mer.name);
  const { data } = await q;
  const byMonth = new Map<string, number>();
  for (const t of data ?? []) byMonth.set(t.budget_month.slice(0, 7), (byMonth.get(t.budget_month.slice(0, 7)) ?? 0) + t.amount_base_minor);
  const hk = `${key}_history`;
  const months = [...byMonth.entries()].sort().map(([mm, spent]) => ({ key: mm, spent }));
  extra[hk] = months;
  return { merchant: mer.name, months: months.map((x) => ({ ...x, cite_as: `{{extra.${hk}.${x.key}.spent}}` })) };
}

// ───────── validation & template ─────────

function checkNarrative(n: Narrative, m: Metrics, extra: Record<string, unknown>): string | null {
  const values = flatten({ ...m, extra } as any);
  const names = namesIn(values);
  const texts = [
    n.headline,
    n.summary,
    ...n.highlights.map((h) => h.text),
    ...n.category_notes.map((c) => c.text),
    ...n.recommendations.map((r) => r.text),
  ];
  for (const t of texts) {
    const err = validateText(t, values, names);
    if (err) return `${err} In: "${t.slice(0, 120)}"`;
  }
  const badKey = n.category_notes.find((c) => !m.categories.some((x) => x.key === c.category_key));
  if (badKey) return `Unknown category_key ${badKey.category_key} in category_notes.`;
  return null;
}

export function template(m: Metrics): Narrative {
  const t = m.totals;
  const over = m.categories.filter((c) => c.cap > 0 && c.spent > c.cap);
  const headline =
    t.cap > 0
      ? t.net >= 0
        ? "You kept {{totals.net}} under budget"
        : "You went {{totals.overrun}} over budget"
      : "You spent {{totals.spent}} this month";
  const summary =
    "You spent {{totals.spent}}" +
    (t.cap > 0 ? " of {{totals.cap}} budgeted" : "") +
    (t.prev_spent > 0 ? ", against {{totals.prev_spent}} the month before." : ".");
  const highlights: Narrative["highlights"] = over.slice(0, 3).map((c) => ({
    tone: "warning",
    text: `${c.name} finished at {{categories.${c.key}.pct}} of its budget.`,
  }));
  if (m.top_merchants[0]) {
    highlights.push({ tone: "neutral", text: `Biggest merchant: ${m.top_merchants[0].name}, {{top_merchants.m1.spent}}.` });
  }
  if (m.anomalies[0]) {
    highlights.push({ tone: "neutral", text: `Unusual purchase: ${m.anomalies[0].title}, {{anomalies.a1.amount}}.` });
  }
  if (t.cap > 0 && t.net >= 0) highlights.unshift({ tone: "positive", text: "{{totals.net}} moved to savings." });
  return {
    headline,
    summary,
    highlights: highlights.slice(0, 5),
    category_notes: [],
    recommendations: over[0] ? [{ text: `Start with ${over[0].name}: it went over its budget this month.` }] : [],
  };
}

// ───────── agent ─────────

async function writeWithAI(r: { household_id: string; budget_month: string; metrics: Metrics }) {
  const client = aiClient();
  if (!client || !(await aiAllowed(db, r.household_id))) return null;
  const started = performance.now();
  const usage = { input_tokens: 0, output_tokens: 0 };
  const extra: Record<string, unknown> = {};
  const month = r.metrics.month;

  // ids are for tools, not for the model's reasoning
  const forModel = {
    ...r.metrics,
    categories: r.metrics.categories.map(({ id: _id, ...c }) => c),
    top_merchants: r.metrics.top_merchants.map(({ merchant_id: _m, ...x }) => x),
  };
  const messages: any[] = [{ role: "user", content: `Metrics for ${month}:\n${JSON.stringify(forModel)}` }];
  let retried = false;

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res: any = await client.messages.create({
        model: MODELS.monthly_report,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: SYSTEM,
        tools: TOOLS,
        messages,
      });
      addUsage(usage, res.usage);
      if (res.stop_reason === "refusal") break;
      messages.push({ role: "assistant", content: res.content });

      const calls = res.content.filter((b: any) => b.type === "tool_use");
      if (calls.length === 0) {
        messages.push({ role: "user", content: "Call submit_report now." });
        continue;
      }
      const results: any[] = [];
      for (const call of calls) {
        if (call.name === "submit_report") {
          const n = call.input as Narrative;
          n.highlights = n.highlights.slice(0, 5);
          n.recommendations = n.recommendations.slice(0, 3);
          const err = checkNarrative(n, r.metrics, extra);
          if (!err) {
            const run = await logRun(db, { household_id: r.household_id, agent: "monthly_report", status: "ok", started, usage });
            return { narrative: { ...n, extra }, run };
          }
          if (retried) {
            await logRun(db, { household_id: r.household_id, agent: "monthly_report", status: "invalid_output", started, usage, error: err });
            return null;
          }
          retried = true;
          results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: err });
        } else if (call.name === "get_category_transactions") {
          const out = await categoryTransactions(r.household_id, month, r.metrics, call.input.category_key, call.input.limit, extra);
          results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(out) });
        } else if (call.name === "get_merchant_history") {
          const out = await merchantHistory(r.household_id, month, r.metrics, call.input.merchant_key, extra);
          results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(out) });
        } else {
          results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: "Unknown tool." });
        }
      }
      messages.push({ role: "user", content: results });
    }
    await logRun(db, { household_id: r.household_id, agent: "monthly_report", status: "invalid_output", started, usage, error: "no submit_report" });
    return null;
  } catch (e) {
    await logRun(db, { household_id: r.household_id, agent: "monthly_report", status: "error", started, usage, error: String(e) });
    return null;
  }
}

Deno.serve(async () => {
  const { data, error } = await db.rpc("claim_monthly_reports");
  if (error) {
    console.error("REPORT_CLAIM_ERROR", error);
    return Response.json({ error: "claim_failed" }, { status: 500 });
  }
  const reports = (data ?? []) as Array<{ id: string; household_id: string; budget_month: string; metrics: Metrics; ai_enabled: boolean }>;
  const done: Array<{ id: string; status: string }> = [];

  for (const r of reports) {
    const ai = r.ai_enabled ? await writeWithAI(r) : null;
    const status = ai ? "ready" : "fallback";
    let runId = ai?.run ?? null;
    if (!ai) {
      runId = await logRun(db, { household_id: r.household_id, agent: "monthly_report", status: "fallback", started: performance.now() });
    }
    await db
      .from("monthly_reports")
      .update({ narrative: ai?.narrative ?? template(r.metrics), status, agent_run_id: runId, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    done.push({ id: r.id, status });
  }
  return Response.json({ reports: done });
});

// POST /capture          ← iOS Shortcut, at the register (BLUEPRINT §3.6)
// POST /capture/confirm  ← same Shortcut, after the category menu
//
// verify_jwt is off: a Shortcut cannot hold a Supabase session, so it sends a per-device
// token and this function checks its hash. All DB work goes through service-role RPCs.

import { createClient } from "npm:@supabase/supabase-js@2";
import { parseAmount } from "./amount.ts";
import { classify } from "./classify.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

// The option text comes from the server so it can change without re-sharing the Shortcut.
const NEW_CATEGORY_OPTION = "➕ New category";
// Starting points; calibrated against the eval set in Phase 4 (BLUEPRINT §4.5).
const FUZZY_AUTO = 0.75;
const FUZZY_SUGGEST = 0.45;
const LLM_CONFIDENT = 0.85;
// G8: a person taps Apple Pay a few times a day. These only stop a loop or a leaked token.
const LIMITS = { devicePerMinute: 20, householdPerDay: 300 };

type Device = {
  device_id: string;
  household_id: string;
  user_id: string;
  base_currency: string;
  ai_enabled: boolean;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IL", { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

// Pre-LLM title: drop branch numbers and title-case Latin words ("AROMA ESPRESSO 0231" → "Aroma Espresso").
function tidyTitle(raw: string): string {
  const t = raw
    .replace(/[‎‏‪-‮⁦-⁩]/g, "")
    .replace(/\d{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[A-Za-z]+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  return (t || raw.trim() || "Unknown").slice(0, 60);
}

// Wallet may omit the time; a wildly off clock must not file the expense in the wrong month.
function parseOccurredAt(v: unknown): Date {
  const d = typeof v === "string" ? new Date(v) : null;
  const now = Date.now();
  if (!d || isNaN(d.getTime()) || d.getTime() > now + 10 * 60_000 || d.getTime() < now - 30 * 86_400_000) {
    return new Date(now);
  }
  return d;
}

// The token normally comes in the Authorization header. A Shortcut can also send it as a
// "token" field in the JSON body, which is easier to get right when building it by hand.
// Forgive a missing or lower-case "Bearer", and any spaces, line breaks or invisible
// characters picked up when copying.
async function authenticate(req: Request, body: Record<string, unknown> | null): Promise<Device | null> {
  const clean = (v: unknown) =>
    typeof v === "string" ? v.replace(/^\s*bearer/i, "").replace(/[\s\u200B-\u200F\u2060\uFEFF]/g, "") : "";
  const token = [req.headers.get("authorization"), req.headers.get("x-device-token"), body?.token]
    .map(clean)
    .find((t) => t.length > 0) ?? "";
  if (!/^hl_dev_[0-9a-f]{48}$/.test(token)) {
    // Shape only, never the value: enough to tell "nothing arrived" from "cut short".
    console.warn("CAPTURE_BAD_TOKEN_SHAPE", {
      length: token.length,
      prefix: token.slice(0, 7),
      headers: [...req.headers.keys()].filter((k) => !k.startsWith("x-forwarded") && !k.startsWith("cf-")),
      body_keys: body ? Object.keys(body) : null,
    });
    return null;
  }
  const { data, error } = await db.rpc("capture_auth", { p_token_hash: await sha256Hex(token) });
  if (error) throw error;
  return (data as Device[] | null)?.[0] ?? null;
}

async function capture(body: Record<string, any> | null, dev: Device): Promise<Response> {
  const rawMerchant = typeof body?.merchant === "string" ? body.merchant.trim() : "";
  if (!body || !rawMerchant) return json({ error: "missing_merchant" }, 422);

  const amount = parseAmount(String(body.amount ?? ""), dev.base_currency);
  if (!amount) return json({ error: "unparseable_amount", received: body.amount ?? null }, 422);

  const occurredAt = parseOccurredAt(body.occurred_at);

  const { data: match, error: matchErr } = await db.rpc("capture_match", {
    p_household: dev.household_id,
    p_raw: rawMerchant,
  });
  if (matchErr) throw matchErr;

  const normalized: string | null = match.normalized;
  const categories: Array<{ id: string; name: string }> = match.categories;
  const best = match.fuzzy?.[0] as
    | { merchant_id: string; display_name: string; category_id: string | null; similarity: number }
    | undefined;

  const minute = new Date(Math.floor(occurredAt.getTime() / 60_000) * 60_000).toISOString();
  const idempotencyKey = await sha256Hex(
    [dev.device_id, normalized ?? rawMerchant, amount.minor, amount.currency, minute].join("|"),
  );

  let status: "confirmed" | "pending_review";
  let merchantId: string | null = null;
  let categoryId: string;
  let title: string;
  let aliasSource: "fuzzy" | "llm" | null = null;
  let classification: Record<string, unknown>;

  if (match.exact?.category_id) {
    status = "confirmed";
    merchantId = match.exact.merchant_id;
    categoryId = match.exact.category_id;
    title = match.exact.display_name;
    classification = { method: "alias", confidence: 1 };
  } else if (best && best.similarity >= FUZZY_AUTO && best.category_id) {
    // H2: a clearly-same merchant (another branch) is "known" and logs silently
    status = "confirmed";
    merchantId = best.merchant_id;
    categoryId = best.category_id;
    title = best.display_name;
    aliasSource = "fuzzy";
    classification = { method: "fuzzy", confidence: best.similarity };
  } else {
    const candidates = (match.fuzzy ?? []) as Array<{
      merchant_id: string;
      display_name: string;
      category_id: string | null;
      similarity: number;
    }>;
    const ai = dev.ai_enabled
      ? await classify(db, {
          householdId: dev.household_id,
          rawMerchant,
          normalized,
          amount: String(amount.minor / 100),
          currency: amount.currency,
          card: typeof body.card === "string" ? body.card : null,
          categories,
          candidates,
        })
      : null;
    const matched = ai?.matchedMerchantId ? candidates.find((c) => c.merchant_id === ai.matchedMerchantId) : undefined;

    if (ai && matched?.category_id && ai.confidence >= LLM_CONFIDENT) {
      // H2: the model recognised a known merchant under a new string (e.g. another city)
      status = "confirmed";
      merchantId = matched.merchant_id;
      categoryId = matched.category_id;
      title = matched.display_name;
      aliasSource = "llm";
      classification = { method: "llm", confidence: ai.confidence, model: "classifier" };
    } else {
      // H1: a new merchant always asks; the AI (or the closest fuzzy match) is pre-selected.
      status = "pending_review";
      categoryId =
        ai?.categoryId ??
        (best && best.similarity >= FUZZY_SUGGEST && best.category_id ? best.category_id : match.fallback_category_id);
      title = ai?.title ?? tidyTitle(rawMerchant);
      classification = {
        method: ai ? "llm" : "none",
        ...(ai ? { confidence: ai.confidence, suggested: true } : {}),
        candidates: candidates.map((f) => ({ merchant_id: f.merchant_id, similarity: f.similarity })),
      };
    }
  }

  const { data: rec, error: recErr } = await db.rpc("capture_record", {
    p: {
      device_id: dev.device_id,
      household_id: dev.household_id,
      user_id: dev.user_id,
      status,
      title,
      raw_merchant: rawMerchant,
      merchant_id: merchantId,
      category_id: categoryId,
      amount_minor: amount.minor,
      currency: amount.currency,
      occurred_at: occurredAt.toISOString(),
      card_label: typeof body.card === "string" ? body.card.slice(0, 60) : null,
      classification,
      idempotency_key: idempotencyKey,
      normalized,
      alias_source: aliasSource,
    },
  });
  if (recErr) {
    if (recErr.code === "P0002") return json({ error: "no_fx_rate", currency: amount.currency }, 422);
    throw recErr;
  }

  const amountDisplay = formatMoney(amount.minor, amount.currency);

  if (rec.status !== "pending_review") {
    return json({
      status: "logged",
      transaction_id: rec.transaction_id,
      title: rec.title,
      category: { id: rec.category_id, name: rec.category_name },
      amount_display: amountDisplay,
    });
  }

  const suggested = categories.find((c) => c.id === rec.category_id);
  const names = [
    ...(suggested ? [suggested.name] : []),
    ...categories.filter((c) => c.id !== rec.category_id).map((c) => c.name),
    NEW_CATEGORY_OPTION,
  ];
  return json({
    status: "needs_input",
    transaction_id: rec.transaction_id,
    suggested_title: rec.title,
    category_names: names,
    new_category_option: NEW_CATEGORY_OPTION,
    prompt: `New place: ${rec.title} · ${amountDisplay}`,
  });
}

async function confirm(body: Record<string, any> | null, dev: Device): Promise<Response> {
  if (!body?.transaction_id) return json({ error: "missing_transaction_id" }, 422);

  // A Shortcut sends every field every time, so an empty string means "not given".
  // The option text itself as the category name means "new category".
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const newCategoryName = text(body.new_category_name);
  const picked = text(body.category_name);
  const categoryName = newCategoryName || picked === NEW_CATEGORY_OPTION ? null : picked;

  const { data, error } = await db.rpc("capture_confirm", {
    p_device_id: dev.device_id,
    p_household: dev.household_id,
    p_transaction_id: body.transaction_id,
    p_category_name: categoryName,
    p_new_category_name: newCategoryName,
    p_title: text(body.title),
  });
  if (error) {
    if (error.code === "P0002") return json({ error: "not_found", detail: error.message }, 404);
    if (error.code === "22023") return json({ error: "invalid_input", detail: error.message }, 422);
    throw error;
  }
  return json(data);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => null);
    const dev = await authenticate(req, body);
    if (!dev) return json({ error: "unauthorized" }, 401);
    const [perDevice, perHousehold] = await Promise.all([
      db.rpc("rate_hit", { p_key: `capture:dev:${dev.device_id}`, p_window_seconds: 60, p_max: LIMITS.devicePerMinute }),
      db.rpc("rate_hit", { p_key: `capture:hh:${dev.household_id}`, p_window_seconds: 86400, p_max: LIMITS.householdPerDay }),
    ]);
    if (perDevice.data === false || perHousehold.data === false) return json({ error: "rate_limited" }, 429);
    const path = new URL(req.url).pathname.replace(/\/+$/, "");
    return path.endsWith("/confirm") ? await confirm(body, dev) : await capture(body, dev);
  } catch (e) {
    console.error("CAPTURE_ERROR", e);
    return json({ error: "server_error" }, 500);
  }
});

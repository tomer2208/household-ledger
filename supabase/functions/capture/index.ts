// POST /capture          ← iOS Shortcut, at the register (BLUEPRINT §3.6)
// POST /capture/confirm  ← same Shortcut, after the category menu
//
// Every answer is HTTP 200 with `status` and a `message` the Shortcut shows as its notification,
// in the iPhone owner's language: Shortcuts drops the body of a 4xx, which left an empty
// "FinPace:" notification. The purchase fields come at the top level (merchant, amount, card,
// name) or, from the shared FinPace Shortcut, inside `wallet` (the automation's Dictionary).
//
// verify_jwt is off: a Shortcut cannot hold a Supabase session, so it sends a token and this
// function checks its hash. All DB work goes through service-role RPCs. The token is the
// household's key (hl_hh_…, one Shortcut for everyone, shared by AirDrop) with the iPhone's
// name in `device`, or an older per-device token (hl_dev_…).

import { createClient } from "npm:@supabase/supabase-js@2";
import { parseAmount } from "./amount.ts";
import { classify } from "./classify.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

// The option text comes from the server so it can change without re-sharing the Shortcut.
// P1-6: the menu speaks the phone owner's language. The Hebrew option still contains
// "New category", because the Shortcut's If (step 7 of the guide) looks for those words.
const NEW_CATEGORY_OPTION = { en: "➕ New category", he: "➕ קטגוריה חדשה (New category)" } as const;
type Lang = keyof typeof NEW_CATEGORY_OPTION;
const isNewCategoryOption = (v: string) => Object.values(NEW_CATEGORY_OPTION).includes(v as never);
// Starting points; calibrated against the eval set in Phase 4 (BLUEPRINT §4.5).
const FUZZY_AUTO = 0.75;
const FUZZY_SUGGEST = 0.45;
const LLM_CONFIDENT = 0.85;
// G8: a person taps Apple Pay a few times a day. These only stop a loop or a leaked token.
const LIMITS = { devicePerMinute: 20, householdPerDay: 300 };

type Device = {
  device_id: string;
  household_id: string;
  // null until someone says whose iPhone it is (household key only)
  user_id: string | null;
  base_currency: string;
  ai_enabled: boolean;
  language?: Lang;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// What the notification says when something goes wrong; the purchase can always be added by hand.
const ERRORS = {
  unauthorized: {
    en: "FinPace: the key isn't valid. Replace it in the app (Settings → Shortcut & Devices) and put the new one in the Shortcut.",
    he: "FinPace: המפתח לא תקין. מחליפים אותו באפליקציה (הגדרות ← שורטקאט ומכשירים) ושמים את החדש בשורטקאט.",
  },
  missing_merchant: {
    en: "FinPace didn't get the place of this purchase. Check the automation's Dictionary has merchant, then add this one in the app.",
    he: "FinPace לא קיבלה את שם המקום של הקנייה. כדאי לבדוק שיש merchant ב-Dictionary של האוטומציה, ולהוסיף את הקנייה באפליקציה.",
  },
  unparseable_amount: {
    en: "FinPace couldn't read the amount of this purchase. Add it in the app.",
    he: "FinPace לא הצליחה לקרוא את הסכום של הקנייה. אפשר להוסיף אותה באפליקציה.",
  },
  no_fx_rate: {
    en: "FinPace has no exchange rate for this currency yet. Add the purchase in the app.",
    he: "ל-FinPace עוד אין שער המרה למטבע הזה. אפשר להוסיף את הקנייה באפליקציה.",
  },
  rate_limited: {
    en: "FinPace got too many purchases at once. Add this one in the app.",
    he: "FinPace קיבלה יותר מדי קניות בבת אחת. אפשר להוסיף את זו באפליקציה.",
  },
  not_found: {
    en: "FinPace couldn't find this purchase anymore. Check it in the app.",
    he: "FinPace כבר לא מצאה את הקנייה הזו. כדאי לבדוק באפליקציה.",
  },
  invalid_input: {
    en: "FinPace couldn't save that category. Pick one in the app.",
    he: "FinPace לא הצליחה לשמור את הקטגוריה. אפשר לבחור אותה באפליקציה.",
  },
  server_error: {
    en: "FinPace couldn't log this purchase. Add it in the app.",
    he: "FinPace לא הצליחה לרשום את הקנייה. אפשר להוסיף אותה באפליקציה.",
  },
} as const;
type ErrorCode = keyof typeof ERRORS;

// The key is checked before the owner is known, so a bad key answers in both languages.
const fail = (error: ErrorCode, lang: Lang | null, extra: Record<string, unknown> = {}) =>
  json({ status: "error", error, message: lang ? ERRORS[error][lang] : `${ERRORS[error].he}\n${ERRORS[error].en}`, ...extra });

// "Aroma · ₪25 → Eating out · ₪340 left": where the purchase went and what the envelope has left.
async function loggedMessage(
  dev: Device,
  tx: { title: string; amount_minor: number; currency: string; category_id: string; category_name: string },
): Promise<string> {
  const lang: Lang = dev.language === "he" ? "he" : "en";
  const amount = formatMoney(tx.amount_minor, tx.currency, lang);
  const { data: left } = await db.rpc("capture_left", { p_household: dev.household_id, p_category: tx.category_id });
  const rest =
    typeof left !== "number"
      ? ""
      : left >= 0
        ? lang === "he" ? ` · נשארו ${formatMoney(left, dev.base_currency, lang)}` : ` · ${formatMoney(left, dev.base_currency, lang)} left`
        : lang === "he" ? ` · חריגה של ${formatMoney(-left, dev.base_currency, lang)}` : ` · ${formatMoney(-left, dev.base_currency, lang)} over`;
  return lang === "he"
    ? `✓ ${tx.title} · ${amount} ← ${tx.category_name}${rest}`
    : `✓ ${tx.title} · ${amount} → ${tx.category_name}${rest}`;
}

async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function formatMoney(minor: number, currency: string, lang: Lang = "en"): string {
  try {
    // whole amounts without ".00", as the app shows them
    const digits = minor % 100 === 0 ? 0 : 2;
    return new Intl.NumberFormat(lang === "he" ? "he-IL" : "en-IL", {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: 2,
    }).format(minor / 100);
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
  if (!/^hl_(dev|hh)_[0-9a-f]{48}$/.test(token)) {
    // Shape only, never the value: enough to tell "nothing arrived" from "cut short".
    console.warn("CAPTURE_BAD_TOKEN_SHAPE", {
      length: token.length,
      prefix: token.slice(0, 7),
      headers: [...req.headers.keys()].filter((k) => !k.startsWith("x-forwarded") && !k.startsWith("cf-")),
      body_keys: body ? Object.keys(body) : null,
    });
    return null;
  }
  // With the household key, the iPhone's name tells the household's phones apart.
  const device = typeof body?.device === "string" ? body.device : req.headers.get("x-device-name");
  const { data, error } = await db.rpc("capture_auth", {
    p_token_hash: await sha256Hex(token),
    ...(token.startsWith("hl_hh_") ? { p_device_name: device ?? "" } : {}),
  });
  if (error) throw error;
  return (data as Device[] | null)?.[0] ?? null;
}

async function capture(input: Record<string, any> | null, dev: Device): Promise<Response> {
  const lang: Lang = dev.language === "he" ? "he" : "en";
  // the shared Shortcut sends the automation's Dictionary as `wallet`
  const body = { ...(input ?? {}), ...(input?.wallet && typeof input.wallet === "object" ? input.wallet : {}) };
  const rawMerchant = typeof body.merchant === "string" ? body.merchant.trim() : "";
  if (!rawMerchant) {
    // ▶ in the Shortcut, with no purchase at all: the key works
    const purchase = ["amount", "card", "name"].some((k) => typeof body[k] === "string" && body[k].trim());
    if (!purchase) {
      return json({ status: "ready", error: "missing_merchant", message: lang === "he" ? "FinPace מחובר ✓" : "FinPace is connected ✓" });
    }
    // a purchase came without its merchant: the automation isn't passing it on
    return fail("missing_merchant", lang);
  }

  const amount = parseAmount(String(body.amount ?? ""), dev.base_currency);
  if (!amount) return fail("unparseable_amount", lang, { received: body.amount ?? null });

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
    if (recErr.code === "P0002") return fail("no_fx_rate", lang, { currency: amount.currency });
    throw recErr;
  }

  const amountDisplay = formatMoney(amount.minor, amount.currency, lang);

  if (rec.status !== "pending_review") {
    return json({
      status: "logged",
      transaction_id: rec.transaction_id,
      title: rec.title,
      category: { id: rec.category_id, name: rec.category_name },
      amount_display: amountDisplay,
      message: await loggedMessage(dev, rec),
    });
  }

  const suggested = categories.find((c) => c.id === rec.category_id);
  const names = [
    ...(suggested ? [suggested.name] : []),
    ...categories.filter((c) => c.id !== rec.category_id).map((c) => c.name),
    NEW_CATEGORY_OPTION[lang],
  ];
  const prompt = lang === "he" ? `מקום חדש: ${rec.title} · ${amountDisplay}` : `New place: ${rec.title} · ${amountDisplay}`;
  return json({
    status: "needs_input",
    transaction_id: rec.transaction_id,
    suggested_title: rec.title,
    category_names: names,
    new_category_option: NEW_CATEGORY_OPTION[lang],
    prompt,
    message: prompt,
  });
}

async function confirm(body: Record<string, any> | null, dev: Device): Promise<Response> {
  const lang: Lang = dev.language === "he" ? "he" : "en";
  if (!body?.transaction_id) return fail("not_found", lang);

  // A Shortcut sends every field every time, so an empty string means "not given".
  // The option text itself as the category name means "new category".
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const newCategoryName = text(body.new_category_name);
  const picked = text(body.category_name);
  const categoryName = newCategoryName || (picked && isNewCategoryOption(picked)) ? null : picked;

  const { data, error } = await db.rpc("capture_confirm", {
    p_device_id: dev.device_id,
    p_household: dev.household_id,
    p_transaction_id: body.transaction_id,
    p_category_name: categoryName,
    p_new_category_name: newCategoryName,
    p_title: text(body.title),
  });
  if (error) {
    if (error.code === "P0002") return fail("not_found", lang, { detail: error.message });
    if (error.code === "22023") return fail("invalid_input", lang, { detail: error.message });
    throw error;
  }
  // the same notification as a known place: where it went and what's left
  const { data: tx } = await db
    .from("transactions")
    .select("title,amount_minor,currency,category_id")
    .eq("id", body.transaction_id)
    .eq("household_id", dev.household_id)
    .single();
  const message = tx
    ? await loggedMessage(dev, { ...tx, category_name: data?.category_name ?? "" })
    : lang === "he" ? "✓ נשמר" : "✓ Saved";
  return json({ ...data, message });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => null);
    const dev = await authenticate(req, body);
    if (!dev) return fail("unauthorized", null);
    const [perDevice, perHousehold] = await Promise.all([
      db.rpc("rate_hit", { p_key: `capture:dev:${dev.device_id}`, p_window_seconds: 60, p_max: LIMITS.devicePerMinute }),
      db.rpc("rate_hit", { p_key: `capture:hh:${dev.household_id}`, p_window_seconds: 86400, p_max: LIMITS.householdPerDay }),
    ]);
    if (perDevice.data === false || perHousehold.data === false) {
      return fail("rate_limited", dev.language === "he" ? "he" : "en");
    }
    const path = new URL(req.url).pathname.replace(/\/+$/, "");
    return path.endsWith("/confirm") ? await confirm(body, dev) : await capture(body, dev);
  } catch (e) {
    console.error("CAPTURE_ERROR", e);
    return fail("server_error", null);
  }
});

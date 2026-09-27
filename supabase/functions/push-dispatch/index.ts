// Drains the budget_alerts queue into Expo push notifications (US-S2, BLUEPRINT §3.6).
// Woken by a DB trigger on every new alert and by a 5-minute cron backstop.
//
// verify_jwt is off on purpose: the request carries no data and grants nothing. The
// function only ever sends alerts that the database already queued.

import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type Alert = {
  category_id: string;
  budget_month: string;
  threshold: 90 | 100;
  spent_minor: number;
  cap_minor: number;
  category_name: string;
  currency: string;
  days_left: number;
  suppressed: boolean;
  tokens: string[];
};

type Result = { category_id: string; budget_month: string; threshold: number; status: "sent" | "suppressed" | "failed" };

function money(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

// Copy per BLUEPRINT US-S2 AC4: what happened, the numbers, and how much month is left.
export function compose(a: Alert) {
  const title = a.threshold >= 100 ? `${a.category_name} is over budget` : `${a.category_name} is at 90%`;
  const days = a.days_left === 1 ? "1 day left" : `${a.days_left} days left`;
  const body = `${money(a.spent_minor, a.currency)} of ${money(a.cap_minor, a.currency)} · ${days}`;
  return { title, body };
}

const isExpoToken = (t: string) => /^Expo(nent)?PushToken\[.+\]$/.test(t);

Deno.serve(async () => {
  const { data, error } = await db.rpc("claim_push_alerts");
  if (error) {
    console.error("PUSH_CLAIM_ERROR", error);
    return Response.json({ error: "claim_failed" }, { status: 500 });
  }
  const alerts = (data ?? []) as Alert[];
  if (alerts.length === 0) return Response.json({ sent: 0 });

  const results: Result[] = [];
  const messages: Array<Record<string, unknown>> = [];
  const owner: number[] = []; // messages[i] belongs to alerts[owner[i]]

  alerts.forEach((a, i) => {
    const key = { category_id: a.category_id, budget_month: a.budget_month, threshold: a.threshold };
    if (a.suppressed) {
      results.push({ ...key, status: "suppressed" });
      return;
    }
    const tokens = a.tokens.filter(isExpoToken);
    if (tokens.length === 0) {
      // Nobody to notify yet (e.g. permission never granted). The alert still counts as handled.
      results.push({ ...key, status: "sent" });
      return;
    }
    const { title, body } = compose(a);
    for (const to of tokens) {
      messages.push({
        to,
        title,
        body,
        sound: "default",
        // Opens the category's expenses (Expo Router path).
        data: { url: `/transactions?category=${a.category_id}` },
      });
      owner.push(i);
    }
  });

  const okByAlert = new Map<number, boolean>();
  const dead: string[] = [];

  for (let start = 0; start < messages.length; start += 100) {
    const chunk = messages.slice(start, start + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(chunk),
      });
      const json = await res.json();
      const tickets: Array<{ status: string; details?: { error?: string } }> = json.data ?? [];
      tickets.forEach((t, j) => {
        const alertIdx = owner[start + j];
        if (t.status === "ok") okByAlert.set(alertIdx, true);
        else {
          if (!okByAlert.has(alertIdx)) okByAlert.set(alertIdx, false);
          if (t.details?.error === "DeviceNotRegistered") dead.push(chunk[j].to as string);
          console.warn("PUSH_TICKET_ERROR", t);
        }
      });
    } catch (e) {
      console.error("PUSH_SEND_ERROR", e);
    }
  }

  alerts.forEach((a, i) => {
    if (results.some((r) => r.category_id === a.category_id && r.budget_month === a.budget_month && r.threshold === a.threshold)) {
      return;
    }
    results.push({
      category_id: a.category_id,
      budget_month: a.budget_month,
      threshold: a.threshold,
      status: okByAlert.get(i) ? "sent" : "failed",
    });
  });

  const { error: finishErr } = await db.rpc("finish_push_alerts", { p_results: results, p_dead_tokens: dead });
  if (finishErr) console.error("PUSH_FINISH_ERROR", finishErr);

  return Response.json({ alerts: alerts.length, messages: messages.length, results });
});

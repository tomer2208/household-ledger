// Drains the budget_alerts queue, and "your report is ready" notices (P1-19, migration 40),
// into push notifications (US-S2, BLUEPRINT §3.6):
// Web Push for the installed web app (VAPID keys in Vault), Expo push for a native build.
// Woken by a DB trigger on every new alert and by a 5-minute cron backstop.
//
// verify_jwt is off on purpose: the request carries no data and grants nothing. The
// function only ever sends alerts that the database already queued.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

import { isReport, keyOf, type Item, type Result, sameKey, tagOf, textOf, urlOf } from "./compose.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Sends to every browser in the household. 404/410 means the subscription is gone for good.
async function sendWeb(alerts: Item[], okByAlert: Map<number, boolean>, dead: string[]) {
  if (!alerts.some((a) => !a.suppressed && a.web.length > 0)) return;
  const { data: vapid } = await db.rpc("web_push_vapid");
  if (!vapid?.public_key || !vapid?.private_key) {
    console.error("WEB_PUSH_NO_VAPID");
    return;
  }
  webpush.setVapidDetails("mailto:support@finpace.app", vapid.public_key, vapid.private_key);
  await Promise.all(
    alerts.flatMap((a, i) =>
      a.suppressed
        ? []
        : a.web.map(async (w) => {
            const { title, body } = textOf(a, w.lang ?? "en");
            const payload = JSON.stringify({ title, body, url: urlOf(a), tag: tagOf(a) });
            try {
              await webpush.sendNotification({ endpoint: w.endpoint, keys: { p256dh: w.p256dh, auth: w.auth } }, payload, {
                TTL: 60 * 60 * 24,
                urgency: isReport(a) ? "normal" : "high",
              });
              okByAlert.set(i, true);
            } catch (e) {
              const status = (e as { statusCode?: number }).statusCode;
              if (status === 404 || status === 410) dead.push(w.endpoint);
              if (!okByAlert.has(i)) okByAlert.set(i, false);
              console.warn("WEB_PUSH_ERROR", status, (e as Error).message);
            }
          }),
    ),
  );
}

const isExpoToken = (t: string) => /^Expo(nent)?PushToken\[.+\]$/.test(t);

Deno.serve(async () => {
  const { data, error } = await db.rpc("claim_push_alerts");
  if (error) {
    console.error("PUSH_CLAIM_ERROR", error);
    return Response.json({ error: "claim_failed" }, { status: 500 });
  }
  const alerts = (data ?? []) as Item[];
  if (alerts.length === 0) return Response.json({ sent: 0 });

  const results: Result[] = [];
  const messages: Array<Record<string, unknown>> = [];
  const owner: number[] = []; // messages[i] belongs to alerts[owner[i]]

  alerts.forEach((a, i) => {
    const key = keyOf(a);
    if (a.suppressed) {
      results.push({ ...key, status: "suppressed" } as Result);
      return;
    }
    const tokens = a.tokens.filter(isExpoToken);
    if (tokens.length === 0 && a.web.length === 0) {
      // Nobody to notify yet (e.g. permission never granted). The alert still counts as handled.
      results.push({ ...key, status: "sent" } as Result);
      return;
    }
    for (const to of tokens) {
      const { title, body } = textOf(a, a.token_lang?.[to] ?? "en");
      messages.push({
        to,
        title,
        body,
        sound: "default",
        // Opens the category's expenses, or the report (Expo Router path).
        data: { url: urlOf(a) },
      });
      owner.push(i);
    }
  });

  const okByAlert = new Map<number, boolean>();
  const dead: string[] = [];
  const deadWeb: string[] = [];
  await sendWeb(alerts, okByAlert, deadWeb);

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
    if (results.some((r) => sameKey(r, a))) return;
    results.push({ ...keyOf(a), status: okByAlert.get(i) ? "sent" : "failed" } as Result);
  });

  const { error: finishErr } = await db.rpc("finish_push_alerts", {
    p_results: results,
    p_dead_tokens: dead,
    p_dead_endpoints: deadWeb,
  });
  if (finishErr) console.error("PUSH_FINISH_ERROR", finishErr);

  return Response.json({ alerts: alerts.length, messages: messages.length, results });
});

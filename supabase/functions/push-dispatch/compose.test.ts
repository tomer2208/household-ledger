// Run: node --test supabase/functions/push-dispatch/compose.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeReport, keyOf, type Report, sameKey, tagOf, textOf, urlOf } from "./compose.ts";

const report = (spent: number, cap: number): Report => ({
  kind: "report", report_id: "r1", budget_month: "2026-09-01", currency: "ILS", spent_minor: spent, cap_minor: cap,
  suppressed: false, tokens: [], web: [],
});

test("a report notice says the month and how it went, in each language", () => {
  assert.deepEqual(composeReport(report(820000, 1000000), "en"), { title: "Your September report is ready", body: "₪8,200 of ₪10,000 · ₪1,800 under budget" });
  assert.equal(composeReport(report(1100000, 1000000), "en").body, "₪11,000 of ₪10,000 · ₪1,000 over budget");
  assert.equal(composeReport(report(50000, 0), "en").body, "₪500 spent");
  const he = composeReport(report(820000, 1000000), "he");
  assert.equal(he.title, "הדוח של ספטמבר מוכן");
  assert.match(he.body, /מתחת לתקציב$/);
  assert.match(composeReport(report(50000, 0), "he").body, /^הוצאתם /);
});

test("a report notice opens the report; a budget alert still opens its category", () => {
  const alert = {
    category_id: "c1", budget_month: "2026-10-01", threshold: 100 as const, spent_minor: 1, cap_minor: 1, category_name: "Food",
    currency: "ILS", days_left: 3, suppressed: false, tokens: [], web: [],
  };
  assert.equal(urlOf(report(1, 1)), "/reports/2026-09-01");
  assert.equal(tagOf(report(1, 1)), "report-2026-09-01");
  assert.equal(urlOf(alert), "/transactions?category=c1");
  assert.equal(textOf(alert, "en").title, "Food is over budget");
  // a budget alert from before migration 40 has no kind and is matched on its own key
  assert.deepEqual(keyOf(alert), { category_id: "c1", budget_month: "2026-10-01", threshold: 100 });
  assert.ok(sameKey({ ...keyOf(alert), status: "sent" }, alert));
  assert.ok(sameKey({ report_id: "r1", status: "failed" }, report(1, 1)));
  assert.ok(!sameKey({ report_id: "r2", status: "sent" }, report(1, 1)));
});

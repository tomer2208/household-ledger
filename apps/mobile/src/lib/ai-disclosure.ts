// What the AI features send to Anthropic, in one place so onboarding, Settings and the
// consent dialog say the same thing (privacy law: consent must be informed and specific).
// Keep in step with supabase/functions/{capture,monthly-report,advisor-run} and privacy.html.
export const AI_DISCLOSURE =
  'Sends merchant names, expense titles, amounts, currencies, the card name Wallet shows (like “Max Visa”) and your category names to Anthropic’s Claude, to suggest categories and write the monthly report. Never card numbers, notes, names or emails. You can turn it off anytime.';

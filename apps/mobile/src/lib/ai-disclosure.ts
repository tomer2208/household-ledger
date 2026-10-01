import { t } from './i18n';

// What the AI features send to Anthropic, in one place so onboarding, Settings and the
// consent dialog say the same thing (privacy law: consent must be informed and specific).
// The text is `ai.disclosure` in i18n/en.ts and i18n/he.ts.
// Keep in step with supabase/functions/{capture,monthly-report,advisor-run} and privacy.html.
export const aiDisclosure = () => t.ai.disclosure;

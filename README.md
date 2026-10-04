# Household Ledger

A shared household budget app for couples and families: expenses are captured the moment you pay with Apple Pay, sorted into categories automatically, and synced live to everyone in the household.

**Live demo:** [household-ledger-murex.vercel.app](https://household-ledger-murex.vercel.app) · Installable PWA (Expo / React Native for Web)

![CI](https://github.com/tomer2208/household-ledger/actions/workflows/ci.yml/badge.svg)

---

## What it does

- **Zero-effort capture.** An iOS Shortcut fires on every Apple Pay (Wallet) transaction and posts it to a capture endpoint. Known merchants are logged silently; a new merchant asks for a category once and is remembered.
- **Smart classification cascade.** Merchant name normalization → exact alias → fuzzy match (`pg_trgm`) → LLM suggestion (Claude) → learning from every user choice.
- **Budgets with alerts.** A monthly cap per category, with one push notification at 90% and one at 100%, per category per month.
- **Month close and savings.** On the 1st of each month the previous month closes automatically; the net (caps minus spend) rolls into a running savings ledger. Late edits to a closed month create adjustment entries instead of rewriting history.
- **Recurring payments.** Fixed and estimated recurring charges, with catch-up of missed runs and no duplicates.
- **Monthly AI report.** Charts computed in SQL plus a written summary. Iron rule: the LLM never calculates numbers; every figure in the text is a placeholder filled from SQL metrics.
- **Real-time sync.** Changes by one household member appear for the others within seconds (Supabase Realtime).
- **Hebrew and English**, with a full right-to-left layout and correct bidi handling of Hebrew merchant names.

## Tech stack

| Layer | Technology |
|---|---|
| App | Expo, React Native, React Native Web, Expo Router, TypeScript |
| Data fetching | TanStack Query with offline persistence |
| Backend | Supabase: Postgres, Row Level Security, Realtime, Edge Functions (Deno) |
| Database extensions | `pg_trgm`, `pg_cron`, `pg_net` |
| AI | Anthropic Claude API (classification, monthly report, advisor) |
| Notifications | Expo Push |
| Hosting | Vercel (static PWA) |
| CI | GitHub Actions |

## Architecture

```
iOS Shortcut ──POST /capture (device token)──▶ Edge Functions (Deno) ──▶ Claude API / Expo Push
                                                     │
Expo app ◀──── supabase-js (JWT + RLS) ────────▶ Postgres (RLS · triggers · RPC · pg_cron)
         ◀──── Realtime (postgres_changes) ──────────┘
```

Design principles:

- **Business logic lives in Postgres:** budget math, month close, recurring rules and alert thresholds are SQL functions and triggers. Edge Functions only handle what SQL cannot: outbound HTTP calls and device-token auth.
- **Money is never a float.** Every amount is stored as `bigint` in minor units (agorot / cents), with the exchange rate frozen on the transaction date.
- **Nothing is hard-deleted.** Soft delete everywhere, plus an audit log for every change.
- **Security by default:** every household table is protected by RLS through a single membership check; device tokens are stored only as SHA-256 hashes; CSP and security headers on the hosted app.

## Quality

- **CI on every push and pull request:** type checking, lint, unit tests, web build, and a database job that applies all migrations from scratch, runs the SQL test suite and verifies the generated schema types.
- **Unit tests run in three time zones** (New York, Jerusalem, Auckland) to catch month-boundary bugs.
- **36 pgTAP database tests** and **41 versioned migrations** (migrations are the only way the schema changes).

## Repository layout

```
apps/mobile/          Expo app (routes, query hooks, money / bidi / FX helpers)
supabase/
  migrations/         numbered SQL migrations
  functions/          capture, push-dispatch, monthly-report, advisor-run, delete-account
  tests/              pgTAP tests
shortcuts/            iOS Shortcut build spec
docs/                 product blueprint, design plan and roadmap
.github/workflows/    CI
```

## Running locally

```bash
# App
cd apps/mobile
cp .env.example .env      # set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY
npm ci
npm run web               # or: npm run ios

# Checks
npm run typecheck && npm run lint && npm test

# Database (requires the Supabase CLI)
supabase start
supabase db reset         # applies all migrations and the seed
supabase test db          # runs the pgTAP suite
```

## Development process

Built iteratively from a written product blueprint ([`docs/BLUEPRINT.md`](docs/BLUEPRINT.md)) with user stories and testable acceptance criteria, using AI-assisted development (Claude) for implementation and review.

## Author

**Tomer Ciubotariu** · B.Sc. Computer Science student, The Academic College of Tel Aviv-Yaffo  
[LinkedIn](https://www.linkedin.com/in/tomer-ciubotariu) · [GitHub](https://github.com/tomer2208)

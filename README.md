# Household Ledger

A budget app I built for my wife and me, so we could stop keeping track of expenses in a spreadsheet.

When one of us pays with Apple Pay, an iOS Shortcut sends the purchase to the app. If we've bought from that store before, it's filed automatically. If it's a new store, the phone asks once which category it belongs to and remembers the answer. Everything syncs between our phones, and we get a notification when a category gets close to its monthly budget.

Live version: [household-ledger-murex.vercel.app](https://household-ledger-murex.vercel.app)

![CI](https://github.com/tomer2208/household-ledger/actions/workflows/ci.yml/badge.svg)

## Features

- Automatic capture of Apple Pay purchases through an iOS Shortcut
- Category guessing: exact match on known stores first, then fuzzy matching in Postgres (`pg_trgm`), and only then an LLM suggestion
- Monthly budget per category, with a push notification at 90% and at 100%
- Month close: on the 1st, whatever's left over (or overspent) goes into a running savings balance
- Recurring payments like rent and bills, including ones where the amount changes every month
- A monthly report with charts. The text is written by Claude, but all the numbers come from SQL
- Hebrew and English, with proper right-to-left support

## Stack

Expo and React Native (running as a web app for now), TypeScript, TanStack Query, and Supabase for the backend: Postgres, row level security, Realtime and Edge Functions. Hosted on Vercel.

## A few design decisions

Most of the logic is in Postgres, not in the app. Budget totals, month close, recurring payments and alert thresholds are all SQL functions and triggers, so both phones always see the same result. The Edge Functions only do things SQL can't, like calling external APIs.

Money is stored as integers (agorot), never floats, and the exchange rate is saved with each transaction.

Nothing is really deleted. Deleted rows are just marked, and every change goes into an audit log, so a mistake can always be undone.

## Tests and CI

Every push runs type checks, lint and unit tests. The unit tests run in three different time zones, because month boundaries turned out to be a reliable source of bugs. A second job builds the database from scratch with all 41 migrations and runs the pgTAP tests against it.

## Running it locally

```bash
cd apps/mobile
cp .env.example .env   # add your Supabase URL and publishable key
npm ci
npm run web

# database (needs the Supabase CLI)
supabase start
supabase db reset
supabase test db
```

The full product spec I worked from is in [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) (in Hebrew).

# Marketing Batch 4B — Staging Scaffolding Result

**Doc ID:** MARKETING-BATCH-4B-STAGING-SCAFFOLD-RESULT
**Date:** 2026-06-28
**Branch:** `marketing-run-a` (isolated worktree `blh-marketing.nosync`)
**Scope:** Staging scaffolding only — `.env.sandbox.example`, migration procedure, smoke harness skeleton, result doc.

| Field | Value |
|---|---|
| Batch completed | **Yes** |
| `.env.sandbox.example` created | **Yes** |
| Migration apply procedure created | **Yes** |
| Smoke harness created | **Yes** |
| Migration applied | **No** |
| App booted | **No** |
| Production touched | **No** |
| Any live integration called | **No** |

---

## Files created (Batch 4B)

| File | Purpose |
|---|---|
| `.env.sandbox.example` | Committable env template — placeholders only, all groups, staging-only comments |
| `docs/planning/MARKETING_STAGING_MIGRATION_122_APPLY_PROCEDURE.md` | Manual apply procedure with stop conditions, two schema paths, verification SQL, PostgREST reload |
| `scripts/marketing-smoke-check.mjs` | Inert read-only smoke harness — dry-run by default, refuses localhost without `--confirm-local`, redacts tokens, prints pass/fail table |
| `docs/planning/MARKETING_BATCH_4B_STAGING_SCAFFOLD_RESULT.md` | This file |

**Files modified:** none.

---

## Static checks

| Check | Result |
|---|---|
| `node --check scripts/marketing-smoke-check.mjs` | **PASS** |
| Dry-run mode (`node scripts/marketing-smoke-check.mjs` no args) | **PASS** — prints help, exits 0 |
| `npm run lint` | Not run (no product code changed) |
| `npm run build` | Not run (no product code changed) |

---

## Smoke harness safety properties

- **Inert by default:** exits with help if `--base-url` or `--token` not supplied.
- **Localhost guard:** refuses to run against `localhost` without `--confirm-local` flag.
- **No `.env` reads:** harness does not import dotenv or read any `.env` file.
- **No migration apply:** no DB connection, no DDL.
- **No writes by default:** all checks are `GET` requests only.
- **Token redacted:** only first 8 chars of JWT printed in output.
- **Write-flow stubs:** `--include-writes` flag prints stubs marked `[MANUAL] / WARN` — never executes writes.

---

## Migration apply procedure — key safety properties

- Staging-only warning on every section header.
- Two schema paths documented (Option A schema clone, Option B full chain) — Sam chooses.
- Pre-apply check SQL to confirm 122 not already applied.
- Five post-apply verification queries (templates count, stub tables, columns, RLS).
- PostgREST reload instruction for stale schema cache.
- Stop conditions listed at the top.

---

## `.env.sandbox.example` — groups covered

| Group | Setting for marketing smoke |
|---|---|
| Supabase (server + frontend) | Staging project only — required |
| App/API URL | Staging host (default: `localhost:8787`) |
| AI (Anthropic) | Blank (demo-only) or low-limit test key |
| Email / Resend / SMTP | Blank (no campaign sends in smoke scope) |
| Gmail / IMAP | Blank (marketing has no inbound mail dependency) |
| Buildexact | Blank (marketing does not call Buildexact) |
| Dropbox | Blank (marketing media uses Supabase Storage) |
| Meta / Facebook | Blank (no live social publishing in smoke scope) |
| Google (GA4/GSC/GBP) | Blank (legacy SEO module degrades gracefully) |

---

## Runtime checks deferred — reason

No staging Supabase project has been provisioned. Migration 122 has not been applied anywhere. Batch 4C (the actual smoke execution) is gated on Sam completing the §11 prerequisites from `MARKETING_BATCH_4A_STAGING_STRATEGY.md`.

---

## Blockers

| Blocker | Owner | Notes |
|---|---|---|
| Staging Supabase project | Sam | Dedicated non-production project required |
| Staging credentials | Sam | Into local `.env.sandbox` (from `.env.sandbox.example`) |
| Migration 122 applied to staging | Sam | Via staging SQL editor per procedure doc |
| Admin + non-admin test users seeded | Sam | For role-gate smoke |
| Test data seeded (12 records from §7 strategy doc) | Sam | Or produced through UI during smoke |

---

## What's left before merge can be planned

1. Sam provisions staging Supabase project and creates local `.env.sandbox`.
2. Sam applies migration 122 to staging (procedure doc ready).
3. Sam (or Batch 4C agent) boots app against staging, runs:
   - `scripts/marketing-smoke-check.mjs --base-url=... --token=...`
   - SOP 18-08 write-flow checks manually
4. All §6 smoke checklist items pass → **ACCEPT** decision.
5. Merge prep: rebase `marketing-run-a` onto current `main` (pick up `portal-v2` and any interim commits), resolve conflicts in `dev-api.mjs`, `AppShell.jsx`, `App.jsx`, confirm migration 122 is still the next unapplied number.

---

Next safe action: Sam provisions the staging Supabase project, creates local `.env.sandbox` from `.env.sandbox.example`, applies migration 122 to staging only, then runs Batch 4C smoke verification.

Recommended next model: Opus for reviewing staging credentials/risk plan if uncertain. Sonnet for executing Batch 4C once staging is confirmed safe.

Code changed: yes
Tests changed: no
Docs changed: yes

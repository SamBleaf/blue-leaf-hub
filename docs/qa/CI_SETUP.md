# GitHub Actions E2E — Setup Guide

Run `npm run test:e2e:ci` on every PR against a **dedicated Supabase test project**. Never point CI at production or your daily dev database.

---

## Overview

```
GitHub Actions (ubuntu)
  ├── npm ci
  ├── playwright install chromium
  ├── verify_migrations.mjs  → fails fast if schema missing
  └── npm run test:e2e:ci
        ├── global-setup → create E2E users + __E2E_ seed data
        ├── npm run dev (API :8787 + Vite :5174)
        └── ~40 Playwright tests (browser + API security)
```

Workflow file: [`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml)

---

## Step 1 — Create a dedicated Supabase test project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Name it something obvious, e.g. `blue-leaf-hub-e2e`
3. Pick a region close to GitHub Actions (e.g. `ap-southeast-1`) — latency only matters a little
4. Save the database password somewhere safe (you need it for SQL editor / CLI)

**Note the project ref** — the subdomain in your API URL:

```
https://abcdefghijklmnop.supabase.co
         ^^^^^^^^^^^^^^^^
         this is E2E_SUPABASE_PROJECT_REF
```

---

## Step 2 — Apply all migrations (one-time)

CI expects the same schema as production. Apply every file in `supabase/migrations/` **in numeric order** (001 → 113).

### Option A — Supabase SQL Editor (simplest)

1. Dashboard → **SQL Editor** → New query
2. For each migration file, paste contents and **Run**
3. Start at `001_blue_leaf_schema.sql`, work up through `113_…`
4. Skip nothing (018/019 were never created — numbering jumps are normal)

### Option B — Supabase CLI

```bash
# One-time on your machine
npm install -g supabase
supabase login
supabase link --project-ref YOUR_E2E_PROJECT_REF

# Push migrations (if you add supabase/config.toml later)
supabase db push
```

### Verify schema before wiring CI

```bash
SUPABASE_URL=https://YOUR_REF.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
node scripts/verify_migrations.mjs
```

All checks should be ✓. Fix any ✗ before continuing.

---

## Step 3 — Add GitHub repository secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret name | Where to find it | Required |
|-------------|------------------|----------|
| `SUPABASE_URL` | Project Settings → API → Project URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` (secret) | Yes |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API → `anon` `public` | Yes |
| `E2E_SUPABASE_PROJECT_REF` | Subdomain from URL (e.g. `abcdefghijklmnop`) | Yes |
| `ANTHROPIC_API_KEY` | Real key or any non-empty placeholder | Optional* |

\* The API server logs a warning if missing; E2E tests do not call Claude. You can set `ci-placeholder` or leave unset (workflow uses a default).

**Do not** reuse production or personal dev project credentials.

---

## Step 4 — Push and watch the workflow

```bash
git add .github/workflows/e2e.yml
git commit -m "Add GitHub Actions E2E workflow"
git push
```

Then: GitHub → **Actions** → **E2E** → open the latest run.

On failure, download the **playwright-report** artifact for traces and screenshots.

---

## Step 5 — (Optional) Branch protection

Repo → **Settings** → **Branches** → Add rule for `main`:

- ✅ Require status check: **Playwright E2E** (or `e2e`)

PRs cannot merge until E2E passes.

---

## What CI runs vs local

| | CI (`test:e2e:ci`) | Local (`test:e2e`) |
|--|-------------------|-------------------|
| Projects | `chromium-desktop`, `api-security` | All (desktop, mobile, tablet, API) |
| Visual snapshots | Skipped (OS-specific) | Included |
| `E2E_REQUIRE_TEST_PROJECT` | `true` | not set |
| Cleanup `__E2E_` data | No (`E2E_CLEANUP=false`) | No by default |

To wipe E2E seed data on the test project locally:

```bash
E2E_CLEANUP=true npm run test:e2e
# or
node scripts/seed-e2e-suite.mjs --cleanup
```

---

## Troubleshooting

### `E2E_REQUIRE_TEST_PROJECT=true but E2E_SUPABASE_PROJECT_REF does not match`

`SUPABASE_URL` secret must contain the same ref as `E2E_SUPABASE_PROJECT_REF`.

### `verify_migrations.mjs` fails

A migration was not applied to the test project. Re-run missing SQL files in order.

### Playwright timeout waiting for `http://localhost:5174`

- Check Actions log for API boot errors
- Ensure `SUPABASE_*` secrets are valid (bad key → API may error on first DB call)

### Tests pass locally but fail in CI

- CI skips visual tests — if only visual fails locally, that's expected on Linux
- CI uses a fresh seed each run; local stale data can mask issues — run `node scripts/seed-e2e-suite.mjs`

### Accidentally used production Supabase

1. Rotate `service_role` and `anon` keys in production immediately
2. Create a new E2E-only project
3. Update GitHub secrets

---

## Cost / usage notes

- Supabase free tier is usually enough for E2E (short runs, small seed)
- Each PR push runs the full suite (~2–3 min)
- `concurrency` cancels duplicate runs on the same branch

---

## Related docs

- [E2E Testing Master Plan](./E2E_TESTING_MASTER_PLAN.md)
- [E2E Test Report](./e2e-test-report.md)
- [Deployment Readiness Checklist](./deployment-readiness-checklist.md)

# Whole-Hub Deployment Push — Result

> **Date:** 2026-06-28 · **Branch:** `portal-v2` · **Mode:** P0/P1 only, low-token.
> Sweep across auth/roles, Sales, Tender/RFQ, Procurement, Ops/Schedule, Finance,
> Workforce, Field/Worker, Client Portal, Server/API, migrations/env, build.

## Files changed (this push)
| File | Change |
|---|---|
| `server/lib/operationsRoutes.mjs` | P0 fix — add `CRON_SECRET` guard to `POST /api/cron/trade-ghost-check` |
| `docs/deployment/WHOLE_HUB_DEPLOYMENT_PUSH_RESULT.md` | this report |

(Workforce Batch 1 fixes in `server/lib/workforceRoutes.mjs` landed in the prior batch and are part of this release — see `docs/ui-redesign/h4-finance-workforce/WORKFORCE_HARDENING_BATCH_1_RESULT.md`.)

## P0/P1 blockers found
| ID | Module | Sev | Issue | Evidence | Fixed? |
|---|---|---|---|---|---|
| B1 | Ops/Server | P0 | `POST /api/cron/trade-ghost-check` had **no auth** — unauthenticated mutation (marks trades unresponsive). Comment claimed "same pattern as rfq-reminders" but that endpoint uses `requireCronSecretOrAdmin`. | `operationsRoutes.mjs:496` | ✅ yes |
| B2 | Workforce | P0×3 | Worker could log/move hours to any job; negative/NaN per-entry hours; non-idempotent approval. | `workforceRoutes.mjs` (prior batch) | ✅ yes (prior) |
| B3 | Workforce | P1 | Pay-derived cost leaked to non-directors on `/api/projects/:id/labour`. | `workforceRoutes.mjs` (prior batch) | ✅ yes (prior) |
| B4 | Server/env | P1 | Cron endpoints (`portal-sync`, `cost-insights`, `trade-ghost-check`) are **open unless `CRON_SECRET` is set**. Inline guards are no-ops without the env var. | `dev-api.mjs:1657,1671`, `operationsRoutes.mjs:496` | ⚠ env, not code — set `CRON_SECRET` in Railway before deploy |

## Clean (no P0/P1)
Auth/roles & frontend routing (App.jsx role gates correct, all route imports present);
Sales; Tender/RFQ; Procurement; Operations/Schedule (UI); Finance; Field app
(FieldWHS/FieldDiary render-guarded); Worker PWA (workerAuth + emp-scoped); Client
Portal v2 (project-access enforced). Confirmed via two read-only sweeps + spot reads.

## P2/P3 deferred (document only — do NOT fix now)
| ID | Module | Sev | Issue |
|---|---|---|---|
| D1 | Field | P2 | `field-whs` / `field-diary` fail in **UI-review mock mode** only (fixture wiring). Production components are guarded; not a route crash. Belongs to H4-B. |
| D2 | Workforce | P2 | Some worker handlers lack try/catch envelopes (defensive only). |
| D3 | Build | P2 | `main` chunk >500 kB (pre-existing, benign). Code-split later. |

## Verification
| Command | Result |
|---|---|
| `npm run build` | ✅ built in ~3.0s (only benign chunk-size warning) |
| `node --check server/lib/operationsRoutes.mjs` | ✅ |
| `node --check server/lib/workforceRoutes.mjs` | ✅ |
| `eslint --no-ignore` (both changed server files) | ✅ clean (`server/` is normally lint-ignored) |
| Frontend blocker sweep | ✅ no P0/P1 |
| Server auth/role sweep | 1 P0 found (B1) → fixed |

No automated test harness exists (per CLAUDE.md). B1 fix is a guard insertion mirroring
the verified `portal-sync` pattern; behaviour with `CRON_SECRET` set = `403` on bad/absent
secret, unchanged when unset (so existing cron-job.org callers keep working once the secret
is configured on both ends).

## Module-by-module verdict
| Module | Verdict |
|---|---|
| Auth / roles / routing | **GO** |
| Sales | **GO** |
| Tender / RFQ | **GO** |
| Procurement | **GO** |
| Operations / Schedule | **GO** (after B1) |
| Finance | **GO** |
| Workforce | **GO** (Batch 1 + this) |
| Field / Worker app | **CONDITIONAL GO** — D1 is UI-review-only; verify the two field routes load in a real browser session once (smoke), then GO |
| Client Portal | **GO** |
| Server / API | **GO** (after B1) |
| Migrations / env | **CONDITIONAL GO** — see steps below |
| Build / deploy | **GO** |

## Exact remaining steps before deploy
1. **Set `CRON_SECRET`** in Railway and on every cron-job.org caller (header `x-cron-secret`). Without it, B1/B4 guards are inert. *(blocking for B4)*
2. **Apply outstanding migrations in order** on prod Supabase. This branch assumes portal v2 migrations (103/104/108/109) are live; main was last recorded at 102 and marketing's 122 applies separately. Verify the live DB matches before pointing the API at it. *(blocking)*
3. **One real-browser smoke** of `/field/whs` and `/field/diary` to clear D1 (expected fine — components are guarded).
4. Workforce live smoke (from prior batch): worker submit vs non-visible job → `403`; double-click approve → `alreadyApproved:true`; supervisor labour view → cost `null`.
5. Confirm required env present: `ANTHROPIC_API_KEY`, Supabase URL/keys, mail transport (Resend), Dropbox, Buildexact (optional). Integrations show status at Settings → `/api/integrations/status`.

## Recommended clean commits (do NOT commit yet — staging groups only)
- **`fix(ops): require CRON_SECRET on trade-ghost-check cron`** — `server/lib/operationsRoutes.mjs`
- **`fix(workforce): deployment hardening batch 1 (job visibility, hours, idempotency, cost leak)`** — `server/lib/workforceRoutes.mjs` + `docs/ui-redesign/h4-finance-workforce/WORKFORCE_HARDENING_BATCH_1_RESULT.md`
- **`docs(deployment): whole-hub deployment push result + workforce audit`** — `docs/deployment/WHOLE_HUB_DEPLOYMENT_PUSH_RESULT.md` + `docs/qa/WORKFORCE_DEPLOYMENT_AUDIT.md`
- **DO NOT bundle** the unrelated uncommitted H2/H3/H4 redesign work in the tree (`src/App.jsx`, `AppShell.jsx`, Operations/Schedule/Procurement/Tender/Finance pages, fixtures, new component dirs) — separate redesign commit(s), owner's call.

## Overall: **CONDITIONAL GO**
Code is deployable. Gating items are operational, not code: set `CRON_SECRET`, apply migrations in order, and run the two smokes above.

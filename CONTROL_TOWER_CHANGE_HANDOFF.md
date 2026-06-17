# Change Handoff — for System Architect review

**From:** HUB TOWER / Control Tower
**Date:** 2026-06-17
**Purpose:** Document every change made in this session so you can review it and confirm it rolls in safely before commit/apply.
**Status:** NOT committed, NOT applied. Awaiting your review.

> Note on scope: the Control Tower's mandate is observe/analyse/recommend. Two of the work-streams below (the read-only Control Tower layer) are infrastructure for that mandate; the other (the four data-flow fixes) is operational/business-logic code that should normally be executed by a developer/specialist agent behind a human gate. It is handed to you here for exactly that review rather than being committed directly.

---

## 1. Apply / review order

Migrations must be applied in number order, and only after you've reviewed them:

```
095_control_tower.sql        (read-only Control Tower layer — additive)
096_auto_project_on_win.sql  (auto-create project on win)
097_procurement_plan_stale.sql (procurement staleness flag)
```

Then a local `npm run lint` (zero-warnings policy) and `npm run build` before commit. ESLint could not be run in my environment (sandbox filesystem error reading `node_modules`), so the lint gate is **unverified** — please run it. All server `.mjs` files pass `node --check`; the one JSX change was reviewed by hand only.

---

## 2. Work-stream A — Control Tower read-only layer (additive, low risk)

Self-contained; touches no existing business logic.

| File | Type | What it does |
|---|---|---|
| `supabase/migrations/095_control_tower.sql` | NEW | Creates `ct_findings` + `ct_action_queue`; creates the `control_tower_ro` Postgres role; RLS + GRANTs so the role can SELECT all tables and INSERT/UPDATE only the two ct_* tables (no DELETE anywhere); adds a permissive SELECT policy for that role on every existing public table. |
| `server/lib/controlTower/ctData.mjs` | NEW | Read-only data accessor. Connects as `control_tower_ro` via a role-claim JWT (`SUPABASE_CT_JWT`); fail-closed (no fallback to service role); `ctWrite()` whitelists only the two ct_* tables. |
| `server/lib/controlTower/controlTowerRoutes.mjs` | NEW | `GET /api/control-tower/status` — admin-only; returns wiring state only, no business data. |
| `server/dev-api.mjs` | EDIT | One import + `registerControlTowerRoutes(app)`. |
| `.env.example` | EDIT | Documents `SUPABASE_ANON_KEY` + `SUPABASE_CT_JWT` (placeholders only). |
| `CONTROL_TOWER_DATA_LAYER_PROPOSAL.md` | NEW | Design doc / charter. |

**Points to verify (095):**
- Role creation: `CREATE ROLE control_tower_ro NOLOGIN` and `GRANT control_tower_ro TO authenticator` — confirm your Supabase project's migration role has privilege to create roles and grant to `authenticator`.
- The role does **not** use `BYPASSRLS`; instead it gets an explicit permissive `SELECT ... USING (true)` policy per table via a `DO` loop over `pg_tables`. Confirm you're comfortable with a loop that adds one policy (`ct_ro_select`) to every public table, and that none of your tables already has a policy of that name.
- Runtime auth uses a long-lived JWT with `role: control_tower_ro` signed by the project JWT secret. Confirm that approach fits your security posture; the alternative is a direct Postgres connection string for the role (would need a `pg` driver, not currently a dependency).
- `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ... FROM control_tower_ro` runs before the targeted grants — confirm the order reads correctly.

---

## 3. Work-stream B — Data-flow fixes (business logic — review carefully)

These are the higher-risk changes. Each implements one item from the architecture review's Phase 0.

### B1. Auto-create project on job win
| File | Type | Change |
|---|---|---|
| `supabase/migrations/096_auto_project_on_win.sql` | NEW | (1) Backfills a `projects` row for any existing `status='won'` job missing one. (2) Adds a **guarded** unique index `projects_job_id_uq` — skipped with a NOTICE if duplicate projects already exist (no auto-delete). (3) `SECURITY DEFINER` trigger `ensure_project_for_won_job` on `jobs` that inserts a minimal project when a job becomes `won`, idempotent (`WHERE NOT EXISTS`). |
| `server/lib/module4Routes.mjs` | EDIT | `win-finalize` changed from a plain `projects.insert` to an idempotent select-then-update-or-insert, so it enriches the trigger-created row instead of duplicating it. No longer nulls `buildexact_job_id`. |

**Verify:**
- Run the dup check before applying (query in the migration footer). If duplicates exist, the unique index is **not** created and the guarantee is weaker until consolidated.
- Confirm `win-finalize` is still the only server path that sets `status='won'` (I found no others; `PATCH /api/jobs/:id` does not allow `status`). If a future Buildexact sync sets `won`, the trigger now covers it — please confirm that's desired.
- Trigger is `AFTER INSERT OR UPDATE OF status`; the upsert in win-finalize runs right after the status flip, so the row will usually already exist. Confirm no race/ordering concern in your environment.

### B2. Procurement plan staleness on schedule change
| File | Type | Change |
|---|---|---|
| `supabase/migrations/097_procurement_plan_stale.sql` | NEW | Adds `procurement_plan_stale` + `_since` to `projects`; `SECURITY DEFINER` trigger on `schedule_tasks` (`AFTER INSERT OR DELETE OR UPDATE OF start_date, end_date, duration_days, depends_on`) that flags the project's plan stale — only when a procurement plan exists for the job. |
| `server/lib/procurementRoutes.mjs` | EDIT | Clears the flag after a successful plan regenerate; `command-centre` now returns a `staleProjects[]`. |

**Verify:**
- The trigger fires per-row. A full schedule regenerate inserts ~50 rows → ~50 trigger fires, each doing a small lookup + conditional update. Confirm acceptable at your scale (fine at 5–50 projects; flag if you expect far more).
- The cascade/ripple updates `schedule_tasks` dates, which will set the flag during an automatic reschedule. That's intended (prompt a refresh), but confirm it won't be noisy for your workflow.
- Clearing keys on `projects.job_id` — relies on one project per job (now enforced by B1's index).
- No frontend banner is wired yet; `staleProjects[]` is exposed but unused until the UI reads it.

### B3. Schedule generator reads building facts
| File | Type | Change |
|---|---|---|
| `server/lib/scheduleRoutes.mjs` | EDIT | Loads `project_metrics` (13 columns, all verified to exist) for the project's job and passes them as `buildingFacts` to the generator. |
| `server/lib/scheduleClaudePlan.mjs` | EDIT | Renders the facts as a prompt block with sequencing guidance (multi-storey gate, suspended slab/steel hold points, demolition phase, etc.). Optional — no facts = previous behaviour. |

**Verify:** prompt-only behavioural change; confirm token budget is fine and the guidance matches how you actually sequence these builds.

### B4. Batch portfolio KPI endpoint
| File | Type | Change |
|---|---|---|
| `server/lib/financeCCRoutes.mjs` | EDIT | New `GET /api/finance/portfolio/kpi-summary` — same KPI shape as the per-job summary, keyed by `job_id`, for all active jobs in ~5 batched queries instead of one round-trip per job. Uses the same `contractValueOf` helper. |
| `src/pages/RfqEngine.jsx` | EDIT | New `useEffect` prefills floor area / storeys / building specs from `/api/cost-intelligence/jobs/:id/metrics`; fills empty fields only. |

**Verify:**
- The batch endpoint computes `claims_paid` correctly (selects claim `id`). The existing per-job `/summary` endpoint appears to have a latent bug — it does **not** select `id`, so its `claims_paid` is effectively always 0. I did not touch that endpoint; flagging it because the two will now disagree on `claims_paid`. Decide whether to fix the per-job one to match.
- Confirm the RFQ metrics endpoint returns the snake_case keys assumed (`storeys`, `floor_area_m2`, `wall_type`, `roof_type`, `roof_complexity`, `site_slope`, `wet_areas`).
- The batch route is `requireAuth` only (no role gate), matching the per-job summary.

---

## 4. Standards / Canonical Data Law check (please confirm)

- **No duplicate canonical facts introduced.** Building facts are *read* from `project_metrics` (canonical), not copied. The only new columns are `projects.procurement_plan_stale/_since` — an operational flag, not a fact.
- **Response standard:** the new batch endpoint uses direct `res.json({ ok: true, ... })` to match the neighbouring `/summary` route's existing style. Per `CLAUDE.md` the canonical helpers are `ok()/err()` — the procurement edits use them, but the finance batch endpoint matches local convention instead. Flag if you want it switched to `ok()`.
- **camelCase boundary:** batch endpoint returns the same hand-shaped keys as the per-job summary (mixed snake/camel exactly as the original). Confirm that's acceptable or should be normalised.

---

## 5. SOP obligations (outstanding)

Per `CLAUDE.md`'s SOP law, changes here touch Tendering (096), Operations/Schedule (097 + B3), Procurement (097), Finance (B4), and the RFQ engine (B4). SOPs + Section-14 test cases and `SOP_INDEX`/`SOP_CHANGELOG` entries have **not** been written. Decide whether these go in before or alongside commit.

---

## 6. Rollback

Each change is reversible:
- Migrations: drop the triggers/functions, the two `projects` columns, the unique index, the ct_* tables, and the `control_tower_ro` role.
- Code: revert the edits via git (all changes are isolated to the files listed above).

No data is destroyed by any migration (096's index is guarded against existing duplicates; nothing is deleted).

---

## 7. Verification already done vs. still needed

| Done | Still needed (you) |
|---|---|
| `node --check` on all changed server `.mjs` files — pass | `npm run lint` (zero warnings) |
| Confirmed all `project_metrics` columns referenced exist (migrations 032/069) | `npm run build` |
| Confirmed only win-finalize sets `status='won'` server-side | Apply 095/096/097 + run each migration's footer verification queries |
| Manual review of the RfqEngine JSX edit | Functional test: win a job → project auto-created; change a schedule → procurement flagged stale; portfolio endpoint vs per-job parity |

# Marketing Run A — Staging Smoke Result

**Doc ID:** MARKETING-RUN-A-STAGING-SMOKE-01
**Date:** 2026-06-28
**Author:** Claude (verification)
**Branch:** `marketing-run-a` (worktree `blh-marketing.nosync`)
**Mode:** Verification only — **BLOCKED before execution** (no safe staging environment).

---

## Outcome: BLOCKED — did not apply migration, did not boot app

The verification cannot be performed safely. There is **no provisioned staging / sandbox
environment**, so applying migration 122 or booting the app would hit **production**. Two stop
conditions are triggered: *"environment is not staging/safe"* and *"production would be touched."*
Nothing was applied; nothing was booted; no production side effects.

## Environment check (read-only, no secrets printed)

| Check | Finding |
|---|---|
| Branch | `marketing-run-a` ✅ |
| Worktree tree clean | Yes (before this doc) ✅ |
| `.env.staging` / `.env.sandbox` present | **No — none exist** |
| `.env` present | Only in main tree (`blue-leaf-hub.nosync`) — the real/shared (production) env; the marketing worktree has **no `.env`** |
| Separate staging DB confirmed | **No** |
| Migration-apply tooling | No `supabase` CLI; no `db:migrate` script; only a one-off `scripts/apply-migration-117.mjs` that would target whatever `.env` is loaded (production) |
| Dev server running | No |

**Conclusion:** the only available environment points at production. Per CLAUDE.md, migrations are
applied manually via the Supabase dashboard — there is no safe automated path to a staging DB, and
no staging DB to target.

## Results

| Field | Value |
|---|---|
| Migration 122 applied | **No** (blocked — no safe staging target) |
| Environment used | **None** — no staging/sandbox available; refused to use production |
| Templates seeded | **No** (migration not applied) |
| Production touched | **No** (deliberately did not apply or boot) |
| Schema changed | **No** |
| Code changed | **No** |
| Tests changed | **No** |
| Docs changed | **Yes** (this result doc only) |
| Screenshots captured | **No** |
| Bugs found | **None** (verification not executed) |
| Files changed | `docs/planning/MARKETING_RUN_A_STAGING_SMOKE_RESULT.md` (this doc) |

### Smoke checks — all BLOCKED (cannot run without a staging app + migration applied)

| Check | Status |
|---|---|
| `/marketing` loads Command Centre | ⛔ Blocked — no running staging app |
| `/marketing/studio` loads Content Studio shell | ⛔ Blocked |
| `/marketing/studio/legacy` loads Legacy Studio | ⛔ Blocked |
| Legacy generate/stream/save still works | ⛔ Blocked |
| Media CTA navigates with `?asset_id=` | ⛔ Blocked |
| Legacy Studio rehydrates from `?asset_id=` | ⛔ Blocked |
| `/marketing/planner` loads | ⛔ Blocked |
| 7 templates visible | ⛔ Blocked (needs 122 applied) |
| Template creates campaign + slots | ⛔ Blocked (needs 122 applied) |
| Planner CTA passes `campaign_id` + `week_start` | ⛔ Blocked |
| Non-admin blocked from marketing routes | ⛔ Blocked (needs test users + running app) |
| Reserved stubs return 501 without shadowing | ⛔ Blocked |

## What Sam needs to provide to unblock (Go-Live P1 — sandbox)

1. **Provision a non-prod staging/sandbox** — a separate Supabase project (or sanctioned scratch),
   captured in `.env.staging` / `.env.sandbox` with **integration creds blanked or pointed at sinks**
   (Resend test key; empty `BUILDEXACT_*` / `DROPBOX_*` so they no-op; `IMAP_*` blanked).
2. **Apply migration 122 to that staging DB** (Supabase SQL editor, or an apply script pointed at the
   staging connection — not production). Confirm 7 templates seed and stub tables exist.
3. **Stand up a staging app instance** (API + frontend) against the staging env.
4. Seed non-admin test users for the role-gate check.

Once that exists, re-run `/verify MARKETING-RUN-A-STAGING-SMOKE-01` against staging and I'll execute
the full smoke list + capture screenshots.

## Recommendation

**Do not proceed** with applying migration 122 or running smokes against the current (production)
environment. Run A remains **conditionally accepted as code-complete**; the staging runtime gate
stays **open** until a safe staging environment is provisioned (Go-Live P1). This is an
infrastructure prerequisite owned by Sam, not a defect in Run A.

---

Next safe action: Sam reviews `MARKETING_RUN_A_STAGING_SMOKE_RESULT.md` and decides whether Run A is accepted and whether Run B can be planned.

Blocked by: No safe staging/sandbox environment (no `.env.staging`/`.env.sandbox`; only production `.env`); migration 122 cannot be applied without touching production; app cannot be booted safely.

Code changed: no
Tests changed: no
Docs changed: yes

# Marketing Run A — Result

**Doc ID:** MARKETING-RUN-A-RESULT
**Date:** 2026-06-28
**Author:** Claude (Run A implementation)
**Branch:** `marketing-run-a` (isolated worktree `blh-marketing.nosync`)
**Authority:** Sam approved H1 (handoff) + H2 (migration `122_marketing_command_centre_mvp.sql`).
**Scope:** Run A = Batch 1 + Batch 2 only. No Run B / 3a / packages / queue / calendar / vault / drone / intelligence.

---

## 1. Status

| Item | Result |
|---|---|
| Run A completed | **Yes (code-complete; lint + build green)** — runtime smokes deferred to staging (see §7) |
| Code changed | **Yes** |
| Tests changed | **No** (no automated suite; manual SOP TCs added in 18-01 §14) |
| Docs changed | **Yes** |
| Migration file created | **Yes** |
| Migration file number | **`122_marketing_command_centre_mvp.sql`** (highest pre-existing was 121; verified free on `marketing-run-a` and `portal-v2`) |
| Schema changed | **Yes (migration file authored; NOT yet applied to a live DB — manual Supabase step)** |
| 7 templates seeded | **In the migration (ON CONFLICT DO NOTHING)** — seeds on apply; not yet applied |

## 2. Files changed (16)

**New — frontend (6):** `src/components/marketing/MarketingRouter.jsx`, `MarketingCommandCentre.jsx`,
`ContentCreatorShell.jsx`, `LegacyStudio.jsx`, `WeeklyPlanner.jsx`, `CampaignTemplatePicker.jsx`

**New — backend (2):** `server/lib/marketingCommandRoutes.mjs`, `server/lib/marketingCampaignRoutes.mjs`

**New — schema (1):** `supabase/migrations/122_marketing_command_centre_mvp.sql`

**New — docs (2):** `docs/planning/MARKETING_API_SECURITY_AUDIT_RUN_A.md`, `docs/planning/MARKETING_RUN_A_RESULT.md`

**Modified (5):** `src/App.jsx` (routing → `/marketing/*`), `src/pages/Marketing.jsx` (legacy-tab
container; `?asset_id=` nav), `src/components/AppShell.jsx` (nav: Command Centre first + Planner +
Studio), `server/dev-api.mjs` (register 2 new route modules), `docs/sops/18_marketing_agent/18-01_content_studio_overview.md` (draft update)

## 3. Routes changed

| Route | Behaviour |
|---|---|
| `/marketing/*` | Single admin-gated route → `MarketingRouter` (lazy) with internal `<Routes>` |
| `/marketing` | **Command Centre** (new default) |
| `/marketing/planner` | Weekly Planner (new) |
| `/marketing/studio` | Content Studio shell placeholder (new) |
| `/marketing/studio/legacy` | Legacy `ContentGenerator` (unchanged logic) + `?asset_id=` seeding |
| `/marketing/create` | Redirect → `/marketing/studio` |
| `/marketing/library` `/campaigns` `/media` `/lists` `/intelligence` `/music` | Legacy tabs (preserved, 1 sprint) |

## 4. APIs changed (all under the existing `/api/marketing` blanket admin gate)

| Method | Path | Action |
|---|---|---|
| GET | `/api/marketing/command-centre` | **New** — weekly snapshot (reads existing tables; works pre-122) |
| GET | `/api/marketing/templates` | **New** — list seeded templates (needs 122) |
| POST | `/api/marketing/campaigns/from-template` | **New** — instantiate campaign + slots (needs 122) |
| GET | `/api/marketing/planner?week=` | **New** — week slots + gaps + active campaigns |
| ALL | `/api/marketing/{automation,publish,paid,video/editor}` | **New stubs** — 501, non-shadowing exact paths |

No existing route behaviour changed. `crmRoutes.mjs` / W22 / W17 / W18 untouched.

## 5. Schema (migration 122 — idempotent, additive)

- **New tables:** `marketing_campaign_templates` (+7 seeds), `marketing_weekly_plans`,
  `marketing_content_packages` (stub), `drone_shot_plans` (stub), `marketing_paid_campaigns` (stub),
  `marketing_publish_jobs` (stub).
- **Columns added (ADD COLUMN IF NOT EXISTS):** `marketing_campaigns` (`template_key`,
  `weekly_target_posts`); `marketing_content_items` (`package_id`, `operational_labels`,
  `risk_level`, `approval_required_from`, `generation_metadata`, `scheduled_at`, `evergreen_score`);
  `marketing_media_assets` (capture/drone/sequence spine — 14 cols); `social_post_publishes`
  (`publish_mode`, `publish_status`, `failed_reason`, `rollback_status`, `scheduled_at`, `approval_status`).
- **Name discipline (confirmed, no duplicates):** reused `approval_mode` (not `approval_policy`),
  `stage_detected` (not `stage_tag`), `capture_date` (not `captured_at`), `analysis` (not
  `photo_analysis`), `analysis_status` (not `pipeline_status`).
- RLS: authenticated policy on new tables; `NOTIFY pgrst` at end.

## 6. Security audit result

See `MARKETING_API_SECURITY_AUDIT_RUN_A.md`. **No code changes needed.** `/api/marketing` +
`/api/intelligence` already admin-gated by the blanket middleware in `dev-api.mjs`; new Run A routes
inherit it. No per-route `requireRole` bulk-added; auth middleware not edited; public
attribution/enquiry untouched (hardening-owned). Future marketing-role chokepoint documented.

## 7. Verification

| Check | Result |
|---|---|
| `npm run lint` | **Pass** (0 errors, 0 warnings) |
| `npm run build` | **Pass** (`MarketingRouter` lazy chunk emitted; pre-existing main-bundle size warning only) |
| `node --check` on new/edited server `.mjs` | **Pass** (lint's `--ext js,jsx` skips `.mjs`, so checked explicitly) |
| Screenshots captured | **No** |

**Runtime / browser smokes — DEFERRED to staging.** Not run in this worktree because: (a) migration
122 is a manual Supabase step and is not applied to the shared DB, so Templates/Planner queries
would error; (b) booting the worktree dev server would start the shared API with live integrations,
hit a DB without 122, and clash with the server already on `:8787`. The following must be run on
staging after 122 is applied:
`/marketing` loads Command Centre · `/marketing/studio` shell · `/marketing/studio/legacy` legacy
generate/stream/save · Media CTA → `?asset_id=` rehydrate · `/marketing/planner` + 7 templates +
template→campaign/slots · Planner CTA passes `campaign_id` + `week_start` · non-admin blocked ·
reserved stubs return 501 without shadowing.

Code-review confidence: legacy generation is preserved (`ContentGenerator.jsx` logic unchanged;
only re-homed in `LegacyStudio`), and `?asset_id=` rehydration fetches `GET /api/marketing/media/:id`
→ `{asset}` and hands it to `ContentGenerator` as `seedAsset` exactly as the old prop flow did.

## 8. Defects found
None from lint/build/parse. Open verification gap: runtime UAT pending staging + migration apply (§7).

## 9. Unresolved decisions / follow-ups
- **Apply migration 122** in the target environment (manual Supabase SQL editor), then run §7 smokes.
- Slot-status / content-status strings are inline in new code (consistent with existing marketing
  code, which hardcodes them). A shared `SLOT_STATUSES` constant is a future cleanup, not a Run A blocker.
- `marketing-run-a` is behind `portal-v2` (does not include W22 etc.). Catch-up merge at integration.

## 10. Recommendation for Run B readiness
Run A foundation is in place and standards-clean. **Run B is ready to plan after:** (1) migration 122
applied on staging, (2) the §7 runtime smokes pass (especially legacy generate/save + `?asset_id=`
rehydration), and (3) Sam signs off this Run A result. Run B then replaces the Studio shell with the
media-first Creator (angles, ReviewSummary), reusing the `?asset_id=` seeding delivered here.

---

Next safe action: Sam reviews `MARKETING_RUN_A_RESULT.md` and decides whether Run B can be planned/approved.

Blocked by: Migration failure, routing failure, broken legacy generator, failed asset seeding, failed security audit, failed build, wrong branch, dirty tree, or unexpected W17/W18/W22 changes. (None encountered; runtime smokes pending staging + migration apply.)

Code changed: yes
Tests changed: no
Docs changed: yes

# Marketing Batch 3 — Result

**Doc ID:** MARKETING-BATCH-3-RESULT
**Date:** 2026-06-28
**Branch:** `marketing-run-a` (isolated worktree `blh-marketing.nosync`)
**Scope:** Intelligence dashboard, Leads & Attribution foundation, Marketing SOP suite, persistence polish assessment.

| Field | Value |
|---|---|
| Batch completed | **Yes** (code-complete; static checks green; runtime deferred) |
| Intelligence dashboard implemented | **Yes** — `/marketing/intelligence` content pipeline health (pipeline tiles, platform mix, media stats, campaign activity, recent publishes, next actions) |
| Attribution foundation implemented | **Yes** — `/marketing/attribution` read-only lead source breakdown, recent enquiries, data capture recommendations |
| Persistence polish completed | **Already done in prior runs** — `generation_metadata`, `operational_labels`, `risk_level`, `evergreen_score`, `package_id` all saved in marketingPackageRoutes + marketingLibraryRoutes (verified, no new work needed) |
| SOP suite completed | **Yes** — 8 SOPs: 18-01 kept, 18-02 through 18-07 replaced, 18-08 new; all 14-section template; Section 14 TC-01..TC-05+ on each |
| Migration created | **No** |
| Migration applied | **No** |
| Legacy Studio preserved | **Yes** |
| Run A / B / C1 / Batch 2 preserved | **Yes** |

---

## Routes added (Batch 3)

| Route | Component |
|---|---|
| `/marketing/intelligence` | `MarketingDashboard.jsx` (content pipeline health; not the SEO intelligence module) |
| `/marketing/attribution` | `MarketingAttribution.jsx` (lead source summary, read-only) |

Nav entries added in `AppShell.jsx` MARKETING_MODULES: **Intelligence**, **Attribution** (between Evergreen and Library).

---

## APIs added (Batch 3)

New module: `server/lib/marketingBatch3Routes.mjs` (registered in `dev-api.mjs`)

| Endpoint | Purpose |
|---|---|
| `GET /api/marketing/intelligence` | Content pipeline counts (draft/in_review/approved/scheduled/published), platform mix, media stats, campaign activity, recent publishes, next actions. Demo fallback on any error. |
| `GET /api/marketing/attribution` | Lead source breakdown from `leads.lead_source`/`first_touch_source`, recent leads, unknown source count, capture gap recommendations. `?days=` param (30/90/180). Demo fallback. |

Both endpoints:
- Under existing blanket `/api/marketing` admin gate
- Read-only, no mutations
- Handle missing migration 122 tables gracefully (try-catch per section)
- Handle missing migration 062 `enquiry_attribution` table gracefully
- Return demo data when DB is unavailable

---

## Files changed (Batch 3)

**New (10):**
- `server/lib/marketingBatch3Routes.mjs`
- `src/components/marketing/MarketingDashboard.jsx`
- `src/components/marketing/MarketingAttribution.jsx`
- `docs/sops/18_marketing_agent/18-02_weekly_marketing_planning.md`
- `docs/sops/18_marketing_agent/18-03_media_capture_and_upload.md`
- `docs/sops/18_marketing_agent/18-04_content_package_review_and_approval.md`
- `docs/sops/18_marketing_agent/18-05_calendar_scheduling_and_manual_publishing.md`
- `docs/sops/18_marketing_agent/18-06_evergreen_library.md`
- `docs/sops/18_marketing_agent/18-07_marketing_intelligence_and_attribution.md`
- `docs/sops/18_marketing_agent/18-08_staging_runtime_smoke_checklist.md`

**Modified (5):**
- `server/dev-api.mjs` — import + register `registerMarketingBatch3Routes`
- `src/components/marketing/MarketingRouter.jsx` — add `intelligence` + `attribution` routes; import new components
- `src/components/AppShell.jsx` — 2 nav entries added to `MARKETING_MODULES`
- `docs/sops/SOP_INDEX.md` — 18-02..18-07 rows updated; 18-08 added; total 120→122; date updated
- `docs/sops/SOP_CHANGELOG.md` — entry added

**Cleanup candidates (old SOP files, not deleted):**
- `18-02_generate_content_ai.md`
- `18-03_upload_photo_generate_content.md`
- `18-04_review_approve_content.md`
- `18-05_create_manage_campaigns.md`
- `18-06_upload_manage_media.md`
- `18-07_music_library.md`

---

## Persistence polish assessment

All 5 metadata fields already persisted correctly from prior runs:
- `generation_metadata` — saved in `marketingPackageRoutes.mjs` POST /packages (line 72)
- `operational_labels` — saved in `marketingPackageRoutes.mjs` POST /packages (line 70)
- `risk_level` — saved in `marketingPackageRoutes.mjs` POST /packages (line 71)
- `evergreen_score` — saved/updated in `marketingLibraryRoutes.mjs` POST /content/:id/evergreen
- `package_id` — set on child content items in `marketingPackageRoutes.mjs` POST /packages (line 69)

Legacy `POST /api/marketing/content` is intentionally untouched (pre-122 safe). No new migration required.

---

## Static checks

- `npm run lint` — **Pass** (0 warnings, 0 errors)
- `npm run build` — **Pass** (pre-existing main-bundle size warning only — not from Batch 3)
- `node --check marketingBatch3Routes.mjs` — **Pass**
- `node --check dev-api.mjs` — **Pass**

---

## Runtime checks deferred — reason

No safe staging/sandbox (no `.env`; needs migration 122 applied + DB). Both new components have clearly-labelled demo fallbacks (`demo: true` from the API). No production touched, no migration applied, no external APIs called.

---

## SOP suite delivered (Batch 3)

| SOP | File | Sections | Status |
|---|---|---|---|
| 18-01 | 18-01_content_studio_overview.md | 14 | Kept (updated Run A) |
| 18-02 | 18-02_weekly_marketing_planning.md | 14 | New |
| 18-03 | 18-03_media_capture_and_upload.md | 14 | New |
| 18-04 | 18-04_content_package_review_and_approval.md | 14 | New |
| 18-05 | 18-05_calendar_scheduling_and_manual_publishing.md | 14 | New |
| 18-06 | 18-06_evergreen_library.md | 14 | New |
| 18-07 | 18-07_marketing_intelligence_and_attribution.md | 14 | New |
| 18-08 | 18-08_staging_runtime_smoke_checklist.md | 14 | New |

All Section 14 test scripts have TC-01 through TC-05+ and are `test_status: untested`.

---

## Defects / blockers

None from static checks. Open verification gap: runtime UAT on staging (Intelligence pipeline counts; Attribution source breakdown; SOP 18-08 smoke checklist).

Note: The existing `MarketingIntelligence.jsx` is the legacy SEO intelligence component (used by the legacy `/marketing/intelligence` tab in `Marketing.jsx`). The new `/marketing/intelligence` route renders `MarketingDashboard.jsx` (content pipeline health). These are separate surfaces — no collision.

---

## Cleanup candidates (do NOT delete now)

- `ContentCreatorShell.jsx` — orphaned Run A placeholder
- Old SOP files (18-02 through 18-07 with old names) — superseded; retire after verification
- Legacy Marketing.jsx tab routes — retire once all surfaces are runtime-verified
- Demo data helpers — keep until staging, then gate/remove

---

## Recommendation for Batch 4

**Priority: Staging + runtime verification** before any further feature work.

Batch 4 candidates (in priority order):
1. **Staging/sandbox provision** — `.env.sandbox`, apply migration 122, run SOP 18-08 smoke checklist end-to-end
2. **Merge prep** — merge `portal-v2` into `marketing-run-a` (catch up W22), resolve conflicts in `dev-api.mjs`, `AppShell.jsx`, `App.jsx`; confirm migration 122 is still the next unapplied number
3. **Integration/smoke harness** — automated `node:test` runner for the 13-item smoke checklist (complements SOP 18-08)
4. **Legacy tab retirement** — remove `/marketing/library`, `/campaigns`, `/media`, `/lists` tabs from `MARKETING_MODULES` once new surfaces are runtime-verified and Josh confirms the replacement
5. **Old SOP cleanup** — delete pre-rebuild SOP files (18-02 through 18-07 old names) after SOP audit confirms the new files are complete

---

Next safe action: Sam reviews `MARKETING_BATCH_3_RESULT.md` and decides whether Batch 4 should focus on staging/sandbox/smoke harness or final integration cleanup.

Code changed: yes
Tests changed: no
Docs changed: yes

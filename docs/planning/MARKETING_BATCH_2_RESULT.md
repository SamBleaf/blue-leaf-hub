# Marketing Batch 2 — Result

**Doc ID:** MARKETING-BATCH-2-RESULT
**Date:** 2026-06-28
**Branch:** `marketing-run-a` (isolated worktree `blh-marketing.nosync`)
**Scope:** Calendar, manual publishing foundation, approval→calendar link, Media Vault refinement, Evergreen Library. Build-only; no migration applied; no production; static checks only.

| Field | Value |
|---|---|
| Batch completed | **Yes** (code-complete; static checks green; runtime deferred) |
| Calendar implemented | **Yes** — `/marketing/calendar` week view of scheduled content + slots |
| Manual publish foundation | **Yes** — "Mark as posted" → `social_post_publishes` (publish_mode=manual); no external API |
| Approval Queue linked to Calendar | **Yes** — approved packages are schedule-ready; header link added |
| Media Vault refined | **Yes** — `/marketing/vault` browse + filters (stage/type/analysis/project) |
| Evergreen Library foundation | **Yes** — `/marketing/evergreen` (evergreen_score > 0) |
| Migration created | **No** (uses migration 122 columns) |
| Migration applied | **No** |
| Legacy Studio preserved | **Yes** |
| Run A / B / C1 preserved | **Yes** |

## Routes added
`/marketing/calendar`, `/marketing/vault`, `/marketing/evergreen` (admin-gated, under `/marketing/*`). Nav entries added in AppShell.

## APIs added (all under existing `/api/marketing` admin gate)
- `GET /api/marketing/calendar?from=&to=` — scheduled content + campaign slots
- `POST /api/marketing/schedule` — set `content_items.scheduled_at` (+ optional slot link)
- `POST /api/marketing/publish-log` — manual "mark as posted" (publish_mode=manual, publish_status=logged); marks item published. **No external API.**
- `GET /api/marketing/publish-log` — recent manual log
- `GET /api/marketing/evergreen` — evergreen content (evergreen_score > 0)
- `POST /api/marketing/content/:id/evergreen` — mark/adjust evergreen score

New server modules: `marketingScheduleRoutes.mjs`, `marketingLibraryRoutes.mjs` (registered in `dev-api.mjs`).

## Files changed (10)
**New (5):** `server/lib/marketingScheduleRoutes.mjs`, `server/lib/marketingLibraryRoutes.mjs`, `src/components/marketing/MarketingCalendar.jsx`, `MediaVault.jsx`, `EvergreenLibrary.jsx`
**Modified (5):** `server/dev-api.mjs`, `src/components/marketing/MarketingRouter.jsx`, `ApprovalQueue.jsx` (Calendar link), `src/components/AppShell.jsx` (nav), `docs/planning/MARKETING_BATCH_2_RESULT.md`

## Static checks
- `npm run lint` — **Pass** (0/0)
- `npm run build` — **Pass** (pre-existing main-bundle size warning only)
- `node --check` (marketingScheduleRoutes, marketingLibraryRoutes, dev-api) — **Pass**

## Runtime checks deferred — reason
No safe staging/sandbox (no `.env`; needs migration 122 applied + DB). Calendar/evergreen/publish endpoints return translated DB errors without 122; every new screen has a clearly-labelled demo fallback. No production touched, no migration applied, no external publishing.

## Defects / blockers
None from static checks. Open verification gap: runtime UAT on staging (schedule → calendar → mark-posted; evergreen list; vault filters; approve→schedule path).

## Recommendation for Marketing Batch 3
Foundation for the weekly loop (plan → create → review → schedule → log) is now in place behind the UI. **Batch 3 candidates:** basic Intelligence dashboard + Leads & Attribution (read-only), SOP suite for the marketing module (18-xx), and persistence polish (wire `generation_metadata`/evergreen marking from the Creator/Review surfaces). All still gated on a safe staging environment for runtime verification + migration 122 apply.

---

Next safe action: Sam reviews `MARKETING_BATCH_2_RESULT.md` and decides whether Marketing Batch 3 can proceed.

Code changed: yes
Tests changed: no
Docs changed: yes

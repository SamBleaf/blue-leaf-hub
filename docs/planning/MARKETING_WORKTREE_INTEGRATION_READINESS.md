# Marketing Worktree — Integration & Readiness Pack

**Doc ID:** MARKETING-WORKTREE-INTEGRATION-READINESS
**Date:** 2026-06-28
**Branch:** `marketing-run-a` · **Worktree:** `~/Desktop/blh-marketing.nosync` (isolated)
**Purpose:** Single source of truth for what's built, what's deferred, what must happen before merge, and Batch 3 options. Source-of-truth over the individual run docs.

---

## 1. Branch / worktree state

- Branch: `marketing-run-a`; dirty tree: **clean** (before this doc).
- Base: branched from `portal-v2` @ `f656d63`. **Behind** current `portal-v2` (which has W22 + later commits); **ahead** by the marketing commits below.
- Marketing commits (newest first): `770cea3` Batch 2 · `8110883` Run C1 · `a381482` Run B · `359b1fc` Run A smoke (blocked) · `6d3bbe7` Run A · `92f8c3a` doc-align/parking.

## 2. Completed build summary

| Run | Purpose | Routes | Components | APIs | Schema dep | Runtime |
|---|---|---|---|---|---|---|
| **Run A** | Command Centre + Weekly Planner + Studio shell + Legacy route; nested `/marketing/*` routing; admin-gate audit | `/marketing`, `/marketing/planner`, `/marketing/studio`(shell), `/marketing/studio/legacy` | MarketingRouter, MarketingCommandCentre, ContentCreatorShell, WeeklyPlanner, CampaignTemplatePicker, LegacyStudio | command-centre, templates, planner, campaigns/from-template | **migration 122** (templates, weekly_plans, columns, stubs) | **Deferred** |
| **Run B** | Media-first Content Studio (Creator); `?asset_id=` seeding; demo fallbacks | `/marketing/studio` → ContentCreator | ContentCreator, AngleCards, ReviewSummary, JoshLabelBadge, WhyThisPanel, MediaPickerModal, creatorData | reuses `/generate`, `/content`, `/media` (no new) | none new (uses 122 cols) | **Deferred** |
| **Run C1** | Content package persistence + Approval Queue | `/marketing/approval` | ApprovalQueue (+ ContentCreator "Send package") | packages CRUD + approve | 122 (`marketing_content_packages`, content_items cols) | **Deferred** |
| **Batch 2** | Calendar, manual publish log, Media Vault, Evergreen Library, approval→calendar link | `/marketing/calendar`, `/marketing/vault`, `/marketing/evergreen` | MarketingCalendar, MediaVault, EvergreenLibrary | calendar, schedule, publish-log, evergreen | 122 (`scheduled_at`, publish cols, `evergreen_score`) | **Deferred** |

## 3. Route inventory (`/marketing/*`, admin-only)

| Route | Purpose |
|---|---|
| `/marketing` | Command Centre (weekly snapshot) |
| `/marketing/planner` | Weekly Planner + template picker |
| `/marketing/studio` | Media-first Content Creator |
| `/marketing/studio/legacy` | Legacy prompt-first generator (temporary, **must stay**) |
| `/marketing/approval` | Approval Queue (package approve/request/reject) |
| `/marketing/calendar` | Scheduled content + manual "mark as posted" |
| `/marketing/vault` | Media browse + filters |
| `/marketing/evergreen` | Evergreen content library |
| `/marketing/create` | Redirect → `/marketing/studio` |
| `/marketing/library`,`/campaigns`,`/media`,`/lists`,`/intelligence`,`/music` | Preserved legacy tabs (`Marketing.jsx`), 1 sprint |

## 4. API inventory (added/changed; all under blanket `/api/marketing` admin gate)

- **Command/Planner/Templates:** `GET /command-centre`, `GET /templates`, `POST /campaigns/from-template`, `GET /planner`
- **Media/Creator:** reuses `GET /media`, `GET /media/:id`, `POST /generate`, `POST /content` (unchanged)
- **Packages/Approval:** `POST /packages`, `GET /packages(+/:id)`, `PATCH /packages/:id/approve`
- **Calendar/Schedule/Manual publish:** `GET /calendar`, `POST /schedule`, `POST`+`GET /publish-log`
- **Vault/Evergreen:** vault uses `GET /media`; `GET /evergreen`, `POST /content/:id/evergreen`
- **Reserved stubs (501):** `/automation`, `/publish`, `/paid`, `/video/editor`

New server modules: `marketingCommandRoutes`, `marketingCampaignRoutes`, `marketingPackageRoutes`, `marketingScheduleRoutes`, `marketingLibraryRoutes` (legacy `marketingRoutes` + `marketingIntelligenceRoutes` unchanged).

## 5. Migration inventory

- **`122_marketing_command_centre_mvp.sql` exists; NOT applied anywhere.**
- Adds: `marketing_campaign_templates` (+7 seeds), `marketing_weekly_plans`, `marketing_content_packages`, stub tables (`drone_shot_plans`, `marketing_paid_campaigns`, `marketing_publish_jobs`); additive columns on `marketing_campaigns`/`marketing_content_items`/`marketing_media_assets`/`social_post_publishes`; RLS on new tables. Idempotent; reuses existing names.
- Runtime testing requires **staging/sandbox with 122 applied**. **Production must not be used.**

## 6. Deferred runtime smoke checklist (consolidated)

- [ ] `/marketing` Command Centre loads snapshot
- [ ] `/marketing/planner` loads; 7 templates; template → campaign + slots; CTA passes `campaign_id`+`week_start`
- [ ] `/marketing/studio` Creator: select media → analysis → angle → IG/FB drafts → labels/why → save
- [ ] Idea-first → Needs photo nudge
- [ ] `?asset_id=` rehydrates Creator + Legacy Studio
- [ ] Package persistence: "Send package" → `marketing_content_packages` + child items
- [ ] Approval Queue: package shows → approve/request/reject updates status (cascades)
- [ ] Calendar: scheduled content shows; `POST /schedule` works
- [ ] Manual publish log: "Mark as posted" → `social_post_publishes` (publish_mode=manual)
- [ ] Vault filters (stage/type/analysis/project)
- [ ] Evergreen list (evergreen_score>0)
- [ ] Non-admin blocked from `/marketing/*` (UI + API)
- [ ] Legacy Studio generate/stream/save intact

## 7. Merge readiness (before merging to `portal-v2`/main)

1. Provision staging/sandbox (`.env.sandbox`, integrations blanked).
2. Apply migration **122 in staging only**; confirm 7 templates + stub tables.
3. Run §6 smoke checklist green.
4. Confirm no production env used.
5. Merge `portal-v2` into `marketing-run-a` (catch up W22 etc.); resolve conflicts (watch `dev-api.mjs`, `AppShell.jsx`, `App.jsx`).
6. Inspect nav/routes for duplication; confirm migration sequence (122 still next, else renumber).
7. Review orphan files (§9).
8. Final `npm run lint` + `npm run build`.

## 8. Known risks

- No staging/sandbox yet → all runtime unverified.
- Migration 122 unapplied → package/calendar/evergreen/templates endpoints error until applied (UI shows demo fallback).
- Possible conflict with `portal-v2`/W22 on shared files (`dev-api.mjs`, `AppShell.jsx`, `App.jsx`) at merge.
- Demo fallbacks can mask real data/shape issues — must verify against real data in staging.
- Legacy Studio must remain until media-first Creator is fully runtime-verified.
- Migration number 122 may be taken on `portal-v2` by then → re-check at merge.

## 9. Cleanup candidates (do NOT delete now)

- `ContentCreatorShell.jsx` — orphaned (Run A placeholder, superseded by `ContentCreator`).
- Legacy `Marketing.jsx` tab routes (`/marketing/library` etc.) — retire once new surfaces fully replace them.
- Multiple Run A result docs (`RUN_A_RESULT`, `RUN_A_BRANCH_DOC_ALIGNMENT_RESULT`, `RUN_A_DOC_CORRECTION_RESULT`, `RUN_A_FREEZE_PARKING_RESULT`, `RUN_A_STAGING_SMOKE_RESULT`) — consolidate later.
- Demo data helpers (`creatorData.js` demo exports, per-component DEMO consts) — keep until staging, then gate/remove.

## 10. Recommended Batch 3 (do not implement here)

Token-efficient, read-only / additive:
- Basic **Marketing Intelligence** dashboard (`/marketing/intelligence`) from existing data + demo fallback.
- **Leads & Attribution** read-only (`/marketing/attribution`).
- **Marketing SOP suite** (18-xx) refresh for the new IA.
- **Persistence polish** (package-path metadata).
- (When staging exists) an **integration/smoke harness** to run §6.

---

Next safe action: Sam reviews the integration readiness doc and decides whether to set up staging or approve Batch 3.

Code changed: no
Tests changed: no
Docs changed: yes

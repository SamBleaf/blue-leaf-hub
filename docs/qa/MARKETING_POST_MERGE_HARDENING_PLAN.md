# Marketing — Post-Merge Hardening Plan

**Status:** 2026-06-28 · **GATE: do not execute until `marketing-run-a` is merged into the main tree.**
Governed by [COMPREHENSIVE_HARDENING_MASTER_PLAN.md](./COMPREHENSIVE_HARDENING_MASTER_PLAN.md).

Marketing Command Centre is **paused (Option A)**. In UI Wave 01A it is recorded only as
**`MARKETING — PAUSED UNTIL MERGE`** in [ui_review/UI_MODULE_LOCK_MATRIX.md](./ui_review/UI_MODULE_LOCK_MATRIX.md).
Once merged, Marketing gets **this** dedicated wave before it can be marked deployable. The
machine drives it as one wave.

---

## 1. Scope

Command Centre · Weekly Planner · Content Studio · Legacy Studio · Approval Queue · Calendar ·
Media Vault · Evergreen Library · Intelligence · Attribution · Marketing API routes · Marketing
admin/security gates · UI Review fixtures and screenshots.

## 2. Route render checks (10)

Verify each renders correctly with real authenticated **admin** access:

`/marketing` · `/marketing/planner` · `/marketing/studio` · `/marketing/studio/legacy` ·
`/marketing/approval` · `/marketing/calendar` · `/marketing/vault` · `/marketing/evergreen` ·
`/marketing/intelligence` · `/marketing/attribution`

Each route × :
- **states:** real data · empty · demo/fallback · error (where practical)
- **viewports:** desktop **1440×900** · tablet **834×1112** · mobile **390×844**
- first-viewport clarity · one obvious next action · no undefined/null/test-data leaks ·
  **no demo data masking a live-empty state**.

## 3. API / runtime tests (before deployable)

- 401 without token
- 403 for non-admin on sensitive write routes
- admin can read command-centre data
- planner / templates load
- package creation works
- package approval / request / reject flow works
- approval cascade updates child content status correctly
- calendar scheduling writes `scheduled_at`
- manual publish log writes `publish_mode=manual`
- evergreen mark persists `evergreen_score`
- attribution reads lead-source data **admin-only**
- legacy Studio generate/save still works **or** is formally accepted as deprecated
- AI generate failure **falls back safely without pretending live success**
- **no auto-posting occurs**
- **no email / Buildxact / Dropbox / Xero / Gmail / Resend action fires from Marketing UI flows**

## 4. Database / schema checks (after merge)

- migration **122** file exists in the merged tree
- migration number has **not** conflicted
- migration 122 remains **additive / non-destructive**
- main Supabase **already has migration 122 applied**
- reads still pass against the required tables/columns:
  - `marketing_content_packages`
  - `marketing_weekly_plans`
  - `drone_shot_plans`
  - `marketing_paid_campaigns`
  - `marketing_publish_jobs`
  - `marketing_campaign_templates`
  - `marketing_content_items.package_id`
  - `marketing_content_items.operational_labels`
  - `marketing_content_items.risk_level`
  - `marketing_content_items.generation_metadata`
  - `marketing_content_items.scheduled_at`
  - `marketing_content_items.evergreen_score`
  - `social_post_publishes.publish_mode`

## 5. Security / hardening — did it survive the merge?

- explicit `requireRole("admin")` remains on mutation-bearing Marketing routes
- public attribution/enquiry routes remain **intentionally public** and are **not** accidentally admin-gated
- client/staff non-admin users **cannot** access Marketing write endpoints
- Marketing nav is **admin-only**
- frontend hiding is **not** relied on as the only security layer
- **no route registration was dropped** during the `server/dev-api.mjs` merge

## 6. Shared server boot safety

Before any live or shared `.env` runtime smoke, confirm background jobs are disabled or running
in staging. A safe shared-env smoke boot **must** include:

```text
PORTAL_SYNC_ENABLED=false
IMAP_POLL_ENABLED=false
INVOICE_IMAP_POLL_ENABLED=false
```

**Do not full-boot against live `.env`** until the finance invoice IMAP poller flag is confirmed
present and honoured.

## 7. UI acceptance (Sales-standard rubric)

- clear module home
- weekly / action loop visible
- content workflow clear
- approval state clear
- scheduled vs posted state clear
- manual posting boundary clear
- demo / live state clear
- mobile screens usable (no squeezed desktop tables on mobile)
- clear next action per route
- **no external publishing implied from approval / scheduling**

## 8. Marketing lock status

Marketing **cannot** be marked **UI LOCKED** or release-ready until:

- all ten routes render
- admin / non-admin gates pass
- write-flow smoke passes
- manual-publish boundary is verified
- legacy Studio is verified **or** formally accepted as deprecated
- UI Review screenshots are captured
- BUG_REGISTER has all remaining issues logged
- [RELEASE_READINESS.md](./RELEASE_READINESS.md) is updated with evidence

Until then, the [UI_MODULE_LOCK_MATRIX](./ui_review/UI_MODULE_LOCK_MATRIX.md) Marketing row stays
`MARKETING — PAUSED UNTIL MERGE`, then moves to `UI NOT ASSESSED` at merge, then through
`CONDITIONAL`/`LOCKED` as evidence lands.

---

## 9. Trigger

When Sam confirms `marketing-run-a` is merged, the Hardening Controller seeds a
`MARKETING-POST-MERGE-WAVE-01` task into [hardening_loop/NEXT_CURSOR_TASK.md](./hardening_loop/NEXT_CURSOR_TASK.md)
referencing this plan. Until then this plan is **inert**.

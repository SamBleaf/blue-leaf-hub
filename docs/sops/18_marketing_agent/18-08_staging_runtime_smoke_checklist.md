---
sop_version: 1.0
last_reviewed: 2026-06-28
app_version: marketing-run-a
screenshot_status: not_required
owner: Admin / Developer
test_status: untested
---

# SOP 18-08: Staging Runtime Smoke Checklist

**Module:** Marketing — Staging / QA
**SOP ID:** 18-08
**Status:** Draft (Batch 3)
**Priority:** High

---

## 1. Who uses this
Developer or Admin running runtime smoke tests before merging the marketing worktree to the main branch.

## 2. When to use it
Before merging `marketing-run-a` → `portal-v2` / main. All items in this checklist must be green before the merge is considered safe.

## 3. What this does
Provides the consolidated smoke checklist for every new marketing surface added in Run A through Batch 3. Designed to be run against a **staging or sandbox environment** with migration 122 applied and integrations blanked (no production Supabase, no production email, no live social APIs).

## 4. Before you start
- **Staging environment provisioned** — `.env.sandbox` with sandbox Supabase project and blank integration keys.
- **Migration 122 applied** in the staging DB (`122_marketing_command_centre_mvp.sql`). Confirm 7 templates in `marketing_campaign_templates`.
- API server started: `node server/dev-api.mjs` (staging `.env`)
- Vite dev server started: `npm run dev`
- Admin login available in the staging DB
- Non-admin login available for access gate tests
- No production env active

## 5. Environment setup

```bash
# 1. Clone / enter the blh-marketing.nosync worktree
cd ~/Desktop/blh-marketing.nosync

# 2. Copy sandbox env
cp .env.sandbox .env

# 3. Start both servers
npm run dev

# 4. Apply migration 122 in staging Supabase SQL editor (paste file contents)
# Confirm: SELECT COUNT(*) FROM marketing_campaign_templates; → should return 7

# 5. Log in as Admin in the browser (staging URL)
```

## 6. Smoke checklist

### Access gates
- [ ] `/marketing/*` is hidden from non-admin users (sidebar + route guard)
- [ ] Direct navigation to `/marketing/studio` as non-admin redirects to `/home`
- [ ] `GET /api/marketing/command-centre` returns 401 without auth token

### Command Centre
- [ ] `/marketing` loads the Command Centre snapshot tiles (no JS error)
- [ ] Tiles show real counts (not "0 / 0 / 0 / 0 / 0" when data exists)

### Weekly Planner
- [ ] `/marketing/planner` loads with the current week
- [ ] Week navigation (← Prev / Next →) works
- [ ] Template picker lists all 7 templates
- [ ] Applying a template creates a campaign + slots in the DB
- [ ] "Create from media" on a slot navigates to `/marketing/studio?campaign_id=<uuid>&week_start=<YYYY-MM-DD>`

### Content Studio (Creator)
- [ ] `/marketing/studio` loads the media-first Content Creator
- [ ] Media picker opens and shows vault assets
- [ ] `?asset_id=<uuid>` seeds the Creator with the correct asset + analysis
- [ ] Angle cards populate from `analysis.content_opportunities`
- [ ] Platform toggles (IG / FB) generate drafts sequentially
- [ ] Josh labels + risk badge render on each draft
- [ ] "Save to Library" saves a single draft item
- [ ] "Send package to Approval Queue" saves the full package and sets `status = in_review`

### Legacy Studio
- [ ] `/marketing/studio/legacy` loads the prompt-first generator with "Legacy Studio (temporary)" banner
- [ ] `?asset_id=<uuid>` pre-fills the photo in Legacy Studio
- [ ] Generate → Save still works end-to-end (creates a `marketing_content_items` row)

### Approval Queue
- [ ] `/marketing/approval` loads `in_review` packages
- [ ] Approve → `status = approved` for package and child items
- [ ] Request changes → `status = changes_requested`
- [ ] Reject → `status = rejected`
- [ ] Calendar link in header navigates to `/marketing/calendar`
- [ ] Demo package shown when queue is empty (no crash)

### Calendar
- [ ] `/marketing/calendar` loads the current week
- [ ] Week navigation works
- [ ] Scheduled items appear on their correct day
- [ ] "Mark as posted" creates a `social_post_publishes` row with `publish_mode = manual`
- [ ] Item status updates to `published` after marking
- [ ] Demo data shown when no real data (no crash)

### Media Vault
- [ ] `/marketing/vault` loads the asset grid
- [ ] Stage / Type / Analysis / Project filters narrow the grid correctly
- [ ] "Create from this →" navigates to `/marketing/studio?asset_id=<uuid>`
- [ ] 3 demo assets shown when API is unavailable

### Evergreen Library
- [ ] `/marketing/evergreen` loads items with `evergreen_score > 0`
- [ ] Items sorted by score descending
- [ ] `POST /api/marketing/content/:id/evergreen` updates the score and the item reappears with the new score

### Intelligence dashboard
- [ ] `/marketing/intelligence` loads pipeline tiles with real counts
- [ ] Next actions reflect actual pipeline state
- [ ] Platform mix shows correct channel distribution
- [ ] Media stats match `marketing_media_assets` counts
- [ ] Demo banner absent when real data is available

### Attribution dashboard
- [ ] `/marketing/attribution` loads source breakdown
- [ ] 30 / 90 / 180 day window filter works
- [ ] Unknown source bucket appears for leads without a source
- [ ] Data capture recommendations appear

## 7. Pass criteria
All checklist items must be green. If any item fails:
1. Note the exact failure in a comment on this SOP or in the merge PR
2. Create a bug fix and re-run the failing section before merging

## 8. Screenshot placeholders
Not required for this checklist SOP.

## 9. Troubleshooting
| Problem | Solution |
|---|---|
| "DB not configured" on all APIs | Check `.env` — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must point to staging, not production |
| Templates not loading | Migration 122 not applied — paste the SQL into the staging Supabase SQL editor |
| Auth failing on admin routes | Staging Supabase project may not have the user seeded; create an admin user via the Auth dashboard |
| Creator angle cards empty | Check the media asset has `analysis.content_opportunities` in the DB — may need a re-analysis |

## 10. Related SOPs
All 18-01 through 18-07 SOPs describe individual workflows. This SOP links them into an end-to-end verification run.

## 11. Automation notes
There is no automated test suite for the marketing module. Verification is manual using this checklist. An integration/smoke harness (automated) is a Batch 4 candidate.

## 12. Edge cases and limits
- Run this checklist only on a **staging/sandbox** database. Never run against production.
- Migration 122 must be applied in staging before the checklist can be completed (most items fail without it).
- The checklist covers the marketing worktree (`marketing-run-a`). After merging to `portal-v2`, re-run the critical items (access gates, Creator, Approval Queue) against the merged branch.

## 13. Owner of the process
Developer / Admin (Sam)
Next review: after merge to portal-v2

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Staging environment provisioned and started
- [ ] Migration 122 applied; 7 templates seeded
- [ ] Admin and non-admin users available in staging

### Test cases

**TC-01 — Access gate: non-admin blocked**
1. Log in as non-admin → navigate to `/marketing`
2. Expected: redirect to `/home`; Marketing not in sidebar
- [ ] Pass  [ ] Fail

**TC-02 — Command Centre → Creator → Package → Approval → Calendar full flow**
1. Open `/marketing` → click "Create from media"
2. Select an asset → pick angle → generate IG + FB → "Send package to Approval Queue"
3. Open Approval Queue → Approve
4. Open Calendar → "Mark as posted"
5. Expected: item moves from draft → in_review → approved → published in DB
- [ ] Pass  [ ] Fail

**TC-03 — Legacy Studio remains functional**
1. Open `/marketing/studio/legacy` → generate content → save
2. Expected: new `marketing_content_items` row; no crash; no regression
- [ ] Pass  [ ] Fail

**TC-04 — Intelligence reflects updated pipeline**
1. After TC-02, open `/marketing/intelligence`
2. Expected: "Published" count is at least 1; "In Review" count is 0 (package approved)
- [ ] Pass  [ ] Fail

**TC-05 — Attribution reflects new lead source**
1. Create a new lead via `/api/public/enquiry` with `utm_source = instagram`
2. Open `/marketing/attribution`
3. Expected: "instagram" appears in source breakdown
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
- [ ] Document any failures with reproduction steps

# CRM / Sales Control System — Deploy Runbook (Batches 1A–1C)

> Hold-and-deploy-all sequence. The code is committed on `portal-v2` but NOT pushed.
> **Migrations must be applied to Supabase BEFORE the code is deployed** — Batch 1A's
> runtime code already references columns that only exist after migration 127.

## What ships

| Commit | Batch | Summary |
|--------|-------|---------|
| `2bedcac` | 1A | Fit (quality × readiness), driven action queue, mandatory source category, lead_signals table |
| `f9aca32` | 1B | `v_lead_timeline` unified stream, trust rail, lead_signals CRUD, convert backfill |
| `fa238a1` | 1C | `fee_proposals.lead_id`, `lead_touch_events`, ROI view + endpoint, won-value writeback |
| `7b38cd7` | docs | SOPs 02-08, 02-09, 19-09 |
| (+ harden commit) | audit | RLS on lead_touch_events + any adversarial-audit fixes |

Also queued on the branch: the Planner mobile fix (touch-drag delay + responsive columns) — unrelated, ships in the same push.

## Migrations — apply IN ORDER in the Supabase SQL editor (paste, run, confirm each)

All are additive, idempotent, and safe to re-run. Apply strictly in numeric order — 130 depends on 129 (`fee_proposals.lead_id`) and on its own earlier `enquiry_attribution` columns.

1. **127_crm_control_spine.sql** — leads: fit_quality, readiness, fit_set_by/at, action_type, action_due_at, snoozed_until, lead_source_category; `lead_signals` table (RLS on).
2. **128_lead_timeline_view.sql** — `v_lead_timeline` (CREATE OR REPLACE VIEW, read-only).
3. **129_fee_proposals_lead_id.sql** — fee_proposals.lead_id + backfill from jobs.lead_id + BEFORE-trigger.
4. **130_attribution_roi.sql** — `lead_touch_events` (RLS on) + enquiry_attribution revenue cols + `v_lead_attribution_roi`.

### Sanity check after applying (SQL editor)
```sql
select column_name from information_schema.columns
  where table_name='leads' and column_name in
  ('fit_quality','readiness','action_type','snoozed_until','lead_source_category');   -- 5 rows
select count(*) from lead_signals;                    -- table exists (0+ ok)
select * from v_lead_timeline limit 1;                -- view resolves
select column_name from information_schema.columns
  where table_name='fee_proposals' and column_name='lead_id';   -- 1 row
select * from v_lead_attribution_roi limit 1;         -- view resolves
```

## Verify the write suites (server running, migrations applied)
```
npm run test:w1a-crm-control-spine:write
npm run test:w1b-timeline-signals:write
npm run test:w1c-attribution-roi:write
```
All should report Passed with 0 Failed (gap-documented lines should now be Pass).

## One-time backfill (optional but recommended)
```
node scripts/backfill-crm-timeline.mjs            # dry-run — review counts
node scripts/backfill-crm-timeline.mjs --write     # apply: crm_interactions.lead_id + seed lead_signals from wo_*
```
Idempotent. Safe to re-run.

## Deploy the code
```
git push origin portal-v2:main      # Railway (API) + Vercel (SPA) auto-deploy from main
```
**Only after migrations 127–130 are applied.** Because every new endpoint and UI path
degrades softly (returns empty / available:false, never 500) when a migration is missing,
a brief window where code is live before a migration is applied is non-fatal — but the
correct order is migrations first, then push.

## Rollback posture
- All migrations additive — nothing to roll back on the DB (columns/tables/views can stay).
- Code rollback = revert the 4 commits (or reset origin/main to the prior SHA) and redeploy.
- The fee_proposals trigger is the only behavioural DB change: to disable, `DROP TRIGGER trg_fee_proposals_set_lead_id ON fee_proposals;` (leaves the column intact).

## Post-deploy smoke (production, quick)
- Sales → open a lead → set Fit; confirm chips on the pipeline table.
- Pipeline → Actions → toggle Urgency/Action type; snooze a lead.
- Lead Detail → Trust rail: add an objection, mark addressed; Timeline shows activity.
- Convert a CRM contact → its interactions appear in the lead timeline.
- Marketing → Intelligence → Attribution ROI table renders; pipeline value KPI is a number.

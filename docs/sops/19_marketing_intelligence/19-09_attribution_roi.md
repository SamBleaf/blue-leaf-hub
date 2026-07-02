---
sop_version: 1.0
last_reviewed: 2026-07-02
app_version: 1.0 — built (Batch 1C, migrations 129 + 130)
screenshot_status: pending
owner: Admin / Marketing
test_status: untested
---

# SOP 19-09: Attribution ROI — Source → Fit → Won

**Module:** Marketing Intelligence — Dashboard
**SOP ID:** 19-09
**Status:** Draft
**Priority:** Medium

---

## 1. Who uses this
Admin, Marketing

## 2. When to use it
When you want to answer: **which marketing sources produce good leads, and what did they actually return?** Review monthly, or whenever deciding where to spend marketing budget.

## 3. What this does
Closes the marketing→revenue loop. A per-lead read model (`v_lead_attribution_roi`) joins each lead to its attribution source, its fit quality, its fee proposals and its won/pipeline value. The marketing dashboard groups this into a **source → fit → proposal → won** table and fills the previously-null pipeline value KPI.

## 4. Before you start
- Migrations 129 (`fee_proposals.lead_id`) and 130 (ROI view + revenue columns) must be applied
- Leads should have a source category (SOP 02-08) and fit (SOP 02-08) set for the table to be meaningful

## 5. Step-by-step

1. Open **Marketing → Intelligence**
2. Find the **Attribution ROI — source → fit → won** table
3. Each row is a source, showing: Leads, Good fit, Proposals, Won, Won value, Pipeline
4. The Total row sums each column
5. Use it to compare sources: e.g. "referral" with 3 leads, 3 good-fit, 2 won, $1.5m beats "advertising" with 20 leads, 1 good-fit, 0 won

## 6. Reading the columns

| Column | Meaning |
|--------|---------|
| Leads | Count of leads attributed to this source |
| Good fit | Leads tagged `strong` or `possible` fit quality |
| Proposals | Leads with ≥1 fee proposal |
| Won | Leads at stage `won` |
| Won value | Realised revenue (contract value, else proposal, else estimate) for won leads |
| Pipeline | Open value still in flight (not won, not lost) |
| ROI | (won value − acquisition cost) / cost, when `lead_source_cost` is recorded |

Grouping defaults to first-touch source; the endpoint also supports grouping by source category (`?groupBy=category`).

## 7. Where the numbers come from

- **Won value** on a won lead: `enquiry_attribution.won_value` (snapshotted at win), else the job's contract value, else the summed fee-proposal value, else the lead's estimated value.
- **Proposal value:** summed `fee_proposals.total_inc_gst` for the lead (joined via `fee_proposals.lead_id`, derived from the job by a DB trigger).
- **Cost:** `leads.lead_source_cost`.

## 8. Won-value writeback

When a lead is moved to **won**, the system snapshots its value onto `enquiry_attribution.won_value` + `won_at`. This makes the ROI stable even if the job or proposals are edited later. It is best-effort — if migration 130 isn't applied, the win still succeeds and the view falls back to the job/proposal/estimate value.

## 9. Common mistakes

| Mistake | How to avoid it |
|---------|-----------------|
| Treating pipeline value as revenue | Pipeline = open, not yet won. Won value = realised. |
| Comparing sources by lead count alone | A source with fewer, better-fit, higher-won leads is better. Read the whole row. |
| Expecting ROI without cost | ROI is blank unless `lead_source_cost` is recorded on the leads. |

## 10. Troubleshooting

| Problem | Solution |
|---------|----------|
| ROI table not shown | Migration 130 not applied — endpoint returns `available:false` and the section hides. Apply 130. |
| Won value is 0 for a won lead | No contract/proposal/estimate value on the lead or its job — set an estimated value or link a job/proposal |
| Pipeline value KPI still null | Migration 130 not applied, or no in-flight leads this month |

## 11. Related SOPs
- [Classify fit & work the action queue](../02_sales/02-08_classify_fit_and_action_queue.md) — SOP 02-08
- [Attribution dashboard](19-05_attribution_dashboard.md) — SOP 19-05

## 12. Screenshot placeholders
[insert screenshot: Attribution ROI table on the Marketing Intelligence dashboard]

## 13. Automation notes
- View: `v_lead_attribution_roi` (per-lead grain) — leads ⋈ enquiry_attribution ⋈ jobs ⋈ (fee_proposals grouped by lead_id).
- Endpoint: `GET /api/intelligence/attribution-roi[?groupBy=category]` → `{ available, groupBy, groups[], totals }`; returns `{ available:false }` if the view is missing.
- Dashboard KPI: `GET /api/intelligence/dashboard` now returns `won_value` + `pipeline_value` from the view (null only if 130 unapplied).
- Writeback: `PATCH /api/sales/leads/:id { stage:"won" }` upserts `enquiry_attribution` won_value/won_at (best-effort).
- `fee_proposals.lead_id`: trigger `fee_proposals_set_lead_id` derives it from `jobs.lead_id` on insert/update of job_id.

## 14. Owner of the process
Admin / Marketing
Next review: 2026-12-02

---

## 15. Troubleshoot Agent Test Script

Automated: `npm run test:w1c-attribution-roi:write` (requires migrations 129+130 + server). Gap-documents if migrations not applied.

### Pre-test setup
- [ ] Migrations 129 + 130 applied
- [ ] Logged in as Admin

### Test cases

**TC-01 — fee_proposal trigger derives lead_id**
1. Create lead → job (with lead_id) → fee_proposal (with job_id)
2. Expected: `fee_proposals.lead_id` = the lead id (set by trigger)
- [ ] Pass  [ ] Fail

**TC-02 — ROI view returns a row for a won lead**
1. Seed a won lead with estimated_value + linked job + proposal
2. Query `v_lead_attribution_roi` for that lead
3. Expected: one row with won_value > 0
- [ ] Pass  [ ] Fail

**TC-03 — Attribution ROI endpoint groups by source**
1. `GET /api/intelligence/attribution-roi`
2. Expected: `available:true`, `groups[]` with leads/good_fit/proposals/won/won_value/pipeline_value, `totals`
- [ ] Pass  [ ] Fail

**TC-04 — Dashboard KPI no longer null**
1. `GET /api/intelligence/dashboard`
2. Expected: `this_month.pipeline_value` and `won_value` are numbers (not null) when 130 applied
- [ ] Pass  [ ] Fail

**TC-05 — Soft-degrade when view missing**
1. (If 130 not applied) call the ROI endpoint
2. Expected: 200 `{ available:false }`, dashboard KPIs null — NOT 500
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Trigger, view, endpoint and KPI all behave as specified
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

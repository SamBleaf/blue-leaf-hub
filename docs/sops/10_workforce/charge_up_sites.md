---
sop_version: 1.0
last_reviewed: 2026-07-18
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 10-05: BLB Charge Up — Site-Level Charge-Up Tracking

**Module:** Workforce / Carpentry
**SOP ID:** 10-05
**Status:** Draft
**Priority:** Medium

---

## 1. Who uses this
Admin/supervisors set up the charge-up sites and read the per-site invoicing figures. Site workers pick a location when they log hours against BLB Charge Up on the Worker app.

## 2. When to use it
- When ad-hoc chargeable work is done at a specific site that doesn't warrant a full carpentry job.
- Weekly, to see hours + charge-out $ per site for invoicing.

## 3. What this does
**BLB Charge Up** is a permanent carpentry job (reference `BL-CHARGEUP`) used as a **category** of small "sites". Opening it (Carpentry → BLB Charge Up) shows its own layout — an **add-site list**, not the standard job tabs.

- **Sites** (`charge_up_jobs`) are lightweight: a location label + optional address/notes. No full job setup.
- **Workers** pick BLB Charge Up on the app, then a required **Location** (site), and log hours. Their hours tag to that site (`timesheet_entries.charge_up_job_id`).
- **Cost** rolls up to the whole Charge Up category; **hours track per site + per person**.
- **Charge-out $** per site = approved hours × each person's charge-up rate (from the cost model) — the ready-to-invoice figure. Internal cost is director-only; charge-out is shown to admin/supervisor.

In the **Planner**, dropping BLB Charge Up on a shift cell opens a **site picker** — a charge-up shift always names its site (address), so everyone can see where the boys are before they log hours. (The site is also confirmed when logging hours, so it's captured either way.)

## 4. Before you start
- Migrations 145 (sites) and 146 (Planner shift → site link) applied.
- The cost model synced (Workforce → Buildexact sync) for charge-out $ to compute.
- Workers use the Worker app to log hours (they must have BLB Charge Up visible/assignable).

## 5. Step-by-step process

### Add a charge-up site (admin/supervisor)
1. Carpentry → open **BLB Charge Up**.
2. Under **Add a charge-up site**, type the site/location (and an optional address/info the boys see).
3. Click **Add site**. It appears in the list and in the workers' Location picker.
4. Edit a site inline (click the label/address); **Archive** a finished site (its logged hours stay in the analytics; it's hidden from the picker).

### Assign a charge-up shift in the Planner (admin/supervisor)
1. Workforce → **Planner**. Drag **BLB Charge Up** onto a person's shift cell (or tap an empty cell on mobile and choose it).
2. A **"Which charge-up site?"** sheet appears — pick the site (its address shows). The shift can't be saved without one.
3. The cell then shows the **site** (not just "BLB Charge Up"), so the crew can see where they're going. Drag-fill across days / down workers copies that site; moving the shift keeps it.

### Log hours against a site (worker, Worker app)
1. Log Hours → pick **Charge Up** in the Site dropdown.
2. A **Location** dropdown appears — pick the site (its address shows underneath).
3. Add what you worked on + hours, **Submit**. You can't submit charge-up without a location.

### Read the invoicing figures (admin/supervisor)
1. Carpentry → BLB Charge Up → the **Hours & charge-out by site** table.
2. Each row: Location · Hours · Charge-out $ (· Cost, directors). Click a row for the per-person breakdown.
3. Use the charge-out $ (or hours) to raise the invoice for that site.

## 6. What happens after
Hours become part of the site's totals once the worker's timesheet is **approved** (approval books the cost; charge-out is computed from the rate). Archiving a site keeps its historical hours visible. Deleting a site (rare) leaves its hours counting at the category level (never orphaned).

## 7. Common mistakes
- **Making a charge-up site a full carpentry job** — it's just a site here; don't create a real job for it.
- **Logging charge-up without a location** — the app blocks it; if you can't see the site, an admin needs to add it.
- **Expecting figures before approval** — hours only appear in the analytics once the timesheet is approved.

## 8. Troubleshooting
- **"Apply migration 145" note** — the sites table isn't enabled yet; apply mig 145.
- **No Location dropdown on the app** — the category has no active sites yet, or the worker's app is cached (hard-refresh).
- **Charge-out shows $0** — the cost model isn't synced, or that person has no charge-up rate.
- **A site says "(deleted site)" in analytics** — hours were logged then the site hard-deleted; they still count.

## 9. Related SOPs
- SOP 10-01 Workforce Overview (timesheets/approvals)
- SOP 10-04 Workforce Pipeline; SOP 14-xx Cost Intelligence (the charge-up rate lives in the cost model)

## 10. Automation notes
- Sites CRUD: `GET/POST /api/carpentry/jobs/:id/charge-up-jobs`, `PATCH/DELETE /api/carpentry/charge-up-jobs/:id` (admin/supervisor). Analytics: `GET /api/carpentry/jobs/:id/charge-up-summary` (charge-out $ + per person; cost director-gated).
- Worker: `/api/worker/jobs/:id/subtasks` returns `chargeUpSites` for BL-CHARGEUP; `POST /api/worker/timesheets` accepts + guards `charge_up_job_id`.
- Planner: `POST /api/workforce/allocations/assign` (+ POST/move) accept `chargeUpJobId`; `resolveAllocChargeUpSite` requires a valid site when the allocation's job is BL-CHARGEUP and it has active sites (belongs-to via `validateChargeUpSite`, a pure helper). `workforce_allocations.charge_up_job_id` (mig 146) stores it; `GET /api/workforce/allocations` echoes `chargeUpSiteLabel`/`chargeUpSiteAddress`.
- Rollup + Planner site-choice maths in `server/lib/chargeUpService.mjs` (no calc in routes/UI). Tables `charge_up_jobs` + `timesheet_entries.charge_up_job_id` (mig 145) + `workforce_allocations.charge_up_job_id` (mig 146). Unit tests: `scripts/tests/charge-up.test.mjs`.

## 11. Screenshots
Not yet captured — capture on first live use (the site list + the by-site analytics table).

## 12. Edge cases
- No cost model → charge-out $0 (hours still tracked).
- Untagged charge-up hours (logged before sites existed) show as an "Untagged" row.
- Archived sites: hidden from the picker, still in analytics.

## 13. Owner of the process
Admin
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin/Supervisor; migration 145 applied
- [ ] BLB Charge Up job exists (reference BL-CHARGEUP)
- [ ] Cost model synced (else charge-out is expected to be $0)

**TC-01 — BLB Charge Up opens its own layout**
1. Carpentry → BLB Charge Up
2. Expected: the site-list layout (add-site + list), NOT the standard Overview/Schedule/Costs tabs
3. Expected: BL-INTERNAL still opens the standard tabs
- [ ] Pass  [ ] Fail

**TC-02 — Add a charge-up site**
1. Add a site "Test — 1 Example St" → Add site
2. Expected: it appears in the list; `POST /api/carpentry/jobs/:id/charge-up-jobs` returns the row
- [ ] Pass  [ ] Fail

**TC-03 — Worker must pick a location for charge-up**
1. Worker app → Log Hours → Site = Charge Up
2. Expected: a required Location dropdown listing the sites; submit is blocked until one is picked
3. Log 4h → Submit → Expected: entry saved with `charge_up_job_id` set
- [ ] Pass  [ ] Fail

**TC-04 — Site analytics after approval**
1. Approve the worker's timesheet (Workforce → Approvals)
2. Open BLB Charge Up → Hours & charge-out by site
3. Expected: the site shows 4h + charge-out $ (= 4 × the person's charge-up rate); click → per-person row
- [ ] Pass  [ ] Fail

**TC-05 — Archive keeps hours**
1. Archive the site
2. Expected: it leaves the worker's Location picker but still appears in the analytics with its hours
- [ ] Pass  [ ] Fail

**TC-06 — Cost is director-gated**
1. As a supervisor (non-director), open the analytics
2. Expected: Hours + Charge-out shown; the internal Cost column is hidden
- [ ] Pass  [ ] Fail

**TC-07 — Graceful before migration / no sites**
1. Before mig 145 (or a category with no sites): open BLB Charge Up; log hours to Charge Up
2. Expected: an "apply 145" note (or no Location dropdown); logging still works untagged; no crash
- [ ] Pass  [ ] Fail

**TC-08 — Planner charge-up shift requires a site**
1. Workforce → Planner → drag BLB Charge Up onto a shift cell (mig 146 applied, ≥1 active site)
2. Expected: a "Which charge-up site?" sheet; the shift isn't saved until a site is picked
3. Pick a site → Expected: the cell shows the site label; a second GET shows `chargeUpSiteLabel` on that allocation
4. Drag-fill the shift across days / down to another worker → Expected: the same site carries; move it → site stays
5. With NO active sites (or before mig 146): Expected: a "add a charge-up site first" message (before mig, the shift saves untagged — no crash)
- [ ] Pass  [ ] Fail

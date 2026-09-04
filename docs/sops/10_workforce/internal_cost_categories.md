---
sop_version: 1.0
last_reviewed: 2026-09-03
app_version: main — built (BL-INTERNAL cost-category sub-layer, migs 200/201). Worked categories + report + retro-assign + leave-typing UI (approval leave-type selector + "Record sick day" button in TimeOffApprovalsTab.jsx) all wired. Annual-vs-sick split is forward-only for historic untyped leave — see §8/§12.
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 10-07: BL-INTERNAL — Internal Cost Categories

**Module:** Workforce / Carpentry
**SOP ID:** 10-07
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
- **Admin/supervisors** set up the internal categories and read the cost-by-category report (internal cost is director/admin-only; hours are visible to supervisors).
- **Site workers** pick an internal category when they log hours against **BL-INTERNAL** on the Worker app (ATEC / Logistics / Personal work only).
- **Directors** see the dollar figures (cost is pay-derived, so it is director-gated).

## 2. When to use it
- When a worker's day is spent on non-site overhead (trade school, yard/logistics, an owner's house) and you want it split by category rather than dumped into one bucket.
- Weekly/quarterly/yearly, to read internal overhead cost by category by AU financial year and quarter.
- The leave block (Annual / Sick / RDO) is read-only reporting — you don't log it here; it is derived from the existing leave/RDO spine.

## 3. What this does
**BL-INTERNAL** is a permanent carpentry job (reference `BL-INTERNAL`, mig 125) that swallows every non-site hour. This layer gives it the **same sub-entity backbone Charge Up has**, re-purposed **cost-only** — no charge-out, no margin, no invoice. Opening it (Carpentry → BL-INTERNAL) shows a **cost-by-category report layout** (`InternalJobDetail`), not the standard job tabs.

Six seeded categories (mig 200) split by **cost source**:

- **Worked (booked)** — **ATEC / trade school**, **Logistics**, **Personal work**. Worker-logged: hours tag to `timesheet_entries.internal_category_id`, valued at the booked `cost_amount` (the loaded cost already computed at approval — accurate to the hour).
- **Leave (modelled/derived)** — **Annual leave**, **Sick leave**, **RDO**. **Never worker-logged.** They are computed at report time from the *existing* leave/RDO spine (the same `/non-working-days` union the planner reads), so they can never double-count a day or collide with the one-timesheet-per-day rule.

**Leave cost formulas (locked — money-critical):**
- **RDO** = `hours × break_even_hourly` (super is already inside break-even — never re-added)
- **Annual leave** = `hours × base_hourly × 1.175 × (1 + SG)` (base wage + 17.5% annual-leave loading + employer super; excludes travel)
- **Sick leave** = `hours × base_hourly × (1 + SG)` (base + super; no loading, no travel)
- **Unpaid** = $0 (shown, never dropped)
- `SG` = employer super-guarantee % **per financial year**: 2023-24 = 11%, 2024-25 = 11.5%, **2025-26 onward = 12%** (default 12%). `hours` = the row's hours, else the employee's standard day (fallback 7.6).

**Report surfaces:**
- **Category KPI cards** — hours + cost per category (worked rows read as **booked**, leave rows carry an **"estimated"** badge because they're modelled).
- **By financial year** table with a **quarter toggle** (Q1 Jul–Sep … Q4 Apr–Jun).
- **Per-category rows** + an **Untagged** bucket with **retro-assign** (assign targets are limited to worked categories).
- A per-category **Shifts** drill-in modal (Shifts only — no Tasks/Diary/Plans; a leave category has no shifts and shows as derived).
- A **rate-missing** warning chip on any leave row for a worker with no wage rate (e.g. a terminated employee) — never a silent $0.

Cost is director/admin-only everywhere; hours stay visible to supervisors.

## 4. Before you start
- Migrations **200** (categories + `internal_category_id` tag + seed) and **201** (leave-type + hours columns on the leave spine) applied. Apply **200 then 201**.
- The **cost model** synced (Workforce → Buildexact sync) so worked cost and the leave base/break-even rates resolve. Without it, worked cost and leave cost fall to $0 or `rate_missing`.
- The BL-INTERNAL standing job exists (mig 125). If it doesn't, mig 200 warns and seeds nothing.
- To read cost you need the **admin/director** role; supervisors see hours only.

## 5. Step-by-step process

### Log hours against an internal category (worker, Worker app)
1. Log Hours → pick **BL-INTERNAL** in the Site dropdown.
2. A required **Internal category \*** dropdown appears — pick **ATEC / trade school**, **Logistics**, or **Personal work**.
3. Add hours and **Submit**. You can't submit BL-INTERNAL without a category. (There is no "what did you do?" free-text for internal work — it's just the category + hours.)
4. Re-opening that day on the app pre-fills the category you chose, so you can edit and resubmit without being blocked.

### Read the cost-by-category report (admin/supervisor)
1. Carpentry → open **BL-INTERNAL**.
2. The **category KPI cards** show hours (+ cost for directors) per category. Leave categories carry an **"estimated"** badge.
3. The **By financial year** table shows hours + cost per FY. Toggle **Show quarters** to break each FY into Q1–Q4.
4. Click a **category row** to open its **Shifts** modal — every approved shift tagged to that category (date · worker · task · hours · cost for directors). Leave categories show as derived (no shifts).

### Add / edit / archive a category (admin/supervisor)
1. On BL-INTERNAL, use the categories management list. The **six seeded** categories are the default set; an ad-hoc worked category can be added (rare).
2. Edit a category's **label / notes / sort order**; **cost source and leave type are fixed at create** (identity — never re-typed, so the report join can't drift).
3. **Archive** a category to hide it while keeping its history. **Leave categories are archive-only** — they can't be hard-deleted (that would erase their historical report line); the report still renders a removed leave category's history via a built-in fallback label.

### Assign untagged internal hours to a category (admin/supervisor)
1. Internal hours approved **without a category** (e.g. logged before the picker existed, or office-entered) show in an **Untagged** card.
2. Pick a **worked** category from the row's dropdown (or assign in bulk). The hours move into that category immediately.
3. You **cannot** assign untagged hours to a **leave** category — the app and the API both reject it (leave is derived, not logged).

### Type approved leave (admin) — backend ready, UI pending
> The leave dollars (Annual / Sick / RDO) are **derived from the leave/RDO spine** — you don't log them here. To split *annual vs sick* the underlying leave row must carry a `leave_type`. The endpoints exist:
> - Approving a day-off request accepts an optional **leave type** + **hours** (`POST /api/workforce/day-off-requests/:id/approve`).
> - **Record a sick day** writes a typed sick leave row directly (`POST /api/workforce/record-sick-day`).
>
> The "Time off" approve modal's **Leave type** selector and the **"Record sick day"** button (in `TimeOffApprovalsTab.jsx`) capture the leave type going forward. Leave approved **before** this UI was used — or approved without picking a type — is stored untyped and the report reads it as RDO. RDO history is therefore complete from day one; the **annual-vs-sick split is forward-only**. See §8 and §12.

## 6. What happens next
- Worked hours become part of a category's totals once the worker's timesheet is **approved** (approval books the loaded cost). Before approval, nothing shows.
- Leave cost is a **live computation** over the leave/RDO spine every time the report loads — there is no stored copy. Public-holiday dates are subtracted first, so a leave day that lands on a public holiday is costed once (or not at all if it's the holiday).
- Archiving a category keeps its history in the report. The BL-CHARGEUP report is completely unaffected by anything here.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Trying to log Annual/Sick/RDO on the Worker app | People expect all six categories in the picker | Only the three **worked** categories appear; leave is derived from the leave/RDO spine, never logged |
| Expecting the annual/sick split for past leave | Historic leave rows are untyped → read as RDO | The split is **forward-only** once leave typing is captured; RDO history is complete |
| Reading cost as a supervisor | Cost is pay-derived and director-gated | Supervisors see hours; ask a director for the dollar figures |
| Assigning untagged hours to "Annual leave" | Leave looks like a normal category | Leave targets are rejected — assign only to ATEC/Logistics/Personal work |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| "Apply migration 200/201" note, or no categories | Migrations not applied | Apply mig 200 then 201 in the Supabase SQL editor |
| No Internal category dropdown on the app | Job has no active worked categories, or the app is cached | Confirm the seeded categories exist; hard-refresh the app |
| Annual/Sick both show as **RDO** in the report | Those leave rows are untyped — approved before the leave-type UI was used, or approved without picking a type | Use the "Time off" approve modal's **Leave type** selector + the **"Record sick day"** button going forward; historic untyped leave stays RDO (forward-only split) |
| A leave row shows a **rate-missing** chip | The worker has no base/break-even wage rate (e.g. terminated) | Sync the cost model / set the employee's rate; the row shows hours but no cost until then |
| Worked cost is $0 | Cost model not synced, or the timesheet isn't approved yet | Run Workforce → Buildexact sync and approve the timesheet |
| "Leave categories can't be hard-deleted" | You tried `?hard=1` on a leave category | Archive it instead — history must survive |

## 9. Related SOPs
- [SOP 10-05 BLB Charge Up](charge_up_sites.md) — the billable backbone this cost-only layer mirrors
- [SOP 10-01 Workforce Overview](workforce_overview.md) — timesheets, approvals (approval books the cost)
- [SOP 10-04 Workforce Pipeline](workforce_pipeline.md) — the capacity math that reads the same leave/RDO spine
- SOP 14-xx Cost Intelligence — the cost model that supplies base / break-even / super rates

## 10. Screenshots
Not yet captured — capture on first live use (the category KPI cards + the by-FY/quarter table + the retro-assign card).

## 11. Automation notes
- **Categories CRUD** (admin/supervisor): `GET/POST /api/carpentry/jobs/:id/internal-categories`, `PATCH/DELETE /api/carpentry/internal-categories/:id` (soft-archive default; `?hard=1` blocked for leave categories). No margin/charge-out fields anywhere.
- **Per-category shifts:** `GET /api/carpentry/internal-categories/:id/shifts` — worked shifts (date · worker · task · notes · hours · cost[director]); a leave category returns `derived:true` with no shifts.
- **Untagged + retro-assign:** `GET /api/carpentry/jobs/:id/internal-untagged`; `POST /api/carpentry/jobs/:id/internal-assign` — the target **must be a worked (`cost_source='timesheet'`) category on this job**; a leave target returns **400** and only this job's approved entries can be re-tagged.
- **Report:** `GET /api/carpentry/internal-cost-summary` (admin/supervisor) returns both standing jobs. **BL-CHARGEUP element is byte-identical to before** (`{ reference, address, fyTotals, periods }`); the **BL-INTERNAL element** adds `categories[]` — worked rollup (by `internal_category_id` × FY × quarter) merged with derived leave on the same axis, each period flagged `estimated` / `rateMissing`, cost director-gated (`canViewCost`).
- **Worker ingest:** `GET /api/worker/jobs/:id/subtasks` returns `internalCategories` (active, `cost_source='timesheet'` only) for BL-INTERNAL; `POST /api/worker/timesheets`, **mass-fill**, and **submit-on-behalf** all accept + server-guard `internal_category_id` (verified to belong to the job AND be a worked category; a stale/leave id is rejected). Both the office **and worker** timesheet-detail reads return `internal_category_id` so re-editing a day prefills the picker.
- **Leave typing (backend):** `POST /api/workforce/day-off-requests/:id/approve` accepts optional `leaveType` (`annual|sick|rdo|unpaid`) + `hours`, stamped onto the generated `workforce_employee_rdo_dates` rows and the request row; `POST /api/workforce/record-sick-day` writes a typed `leave_type='sick'` row directly. Both require mig 201. **No timesheet row is ever written for a leave day** (no double-count). The Workforce-side UI is wired: the "Time off" approve modal's leave-type selector + the "Record sick day" button in `TimeOffApprovalsTab.jsx`.
- **Derived leave engine:** `computeLeaveCost` (pure) + `deriveLeaveCost` (DB wrapper) in `server/lib/internalCategoryService.mjs`; FY/quarter + super-guarantee lookup in `server/lib/financialYear.mjs` (`auFyQuarter`, `superGuaranteeForFy`). Team RDO is fanned across **active** employees and typed `rdo`; recurring patterns are expanded read-only; explicit per-employee rows win on a same-day collision. Unit test: `scripts/test/internalLeaveCost.test.mjs`.
- **Tables:** `internal_categories` (mig 200) + `timesheet_entries.internal_category_id` (mig 200, ON DELETE SET NULL); `workforce_employee_rdo_dates.leave_type` + `.hours` and `workforce_day_off_requests.leave_type` (mig 201). `workforce_team_rdo_dates` deliberately gets no column (team RDO is `rdo` + full-day by definition).

## 12. Edge cases and limits
- **No cost model / no rate** → worked cost $0; leave rows flag `rate_missing` (hours still count).
- **Half-day leave** → the leave row carries `hours` (e.g. 3.8 = 0.5 × 7.6); the worker can log the other half as Logistics, and the day sums to exactly one paid day — not 1.5.
- **A leave day on a public holiday** → the public-holiday date is subtracted before costing, so it's counted once (as the holiday), never double.
- **Same employee + date in two leave sources** → an explicit per-employee row beats a team RDO, which beats a recurring pattern — the day is costed once, with its explicit type/hours.
- **Untyped historic leave** → reads as RDO (backfill parity); annual/sick split is forward-only.
- **Deleting a category** → worked `internal_category_id` becomes NULL (hours fall to the Untagged bucket, never orphaned); leave categories can't be hard-deleted.
- **Before migration** → every route fails soft (empty categories / `migrationPending`); the report still returns the job-level FY totals and BL-CHARGEUP is unaffected.

## 13. Owner of the process
Admin / Director
Next review: 2027-03-03

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run these in order; record pass/fail against each. If any fails, document it and do **not** set `test_status: passed`. Money and no-double-count cases (TC-09..TC-13) are the acceptance criteria for the leave half.

### Pre-test setup
- [ ] Migrations **200** then **201** applied; `NOTIFY pgrst` ran (schema cache fresh)
- [ ] Logged in as **Admin/Director** for the report + CRUD cases; have a **Supervisor** login for the gating case
- [ ] The BL-INTERNAL standing job exists (mig 125); the six seeded categories are present
- [ ] Cost model synced (else worked cost / leave rates are expected $0 or `rate_missing`)
- [ ] A worker account that can log hours against BL-INTERNAL

**TC-01 — Happy path: worker tags a worked category, round-trip (prefill/resubmit)**
1. Worker app → Log Hours → Site = **BL-INTERNAL** → Expected: a required **Internal category** dropdown listing ATEC / Logistics / Personal work only (no leave categories)
2. Pick **Logistics**, log 6h → Submit → Expected: entry saved with `internal_category_id` = the Logistics category
3. Re-open the same day on the app → Expected: the Logistics category is **pre-filled**; change to **ATEC**, resubmit → Expected: the tag updates (no "pick a category" block on resubmit)
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. Worker app → Log Hours → Site = BL-INTERNAL → leave the Internal category unset → Submit
2. Expected: blocked with "Pick an internal category before submitting."; **no** timesheet entry created
- [ ] Pass  [ ] Fail

**TC-03 — Category CRUD (create / edit / archive / leave hard-delete rejected)**
1. `POST /api/carpentry/jobs/:id/internal-categories` `{categoryLabel:"Test overhead"}` → Expected: created as a **worked** (`cost_source='timesheet'`) category, `sortOrder = max+10`
2. `PATCH /api/carpentry/internal-categories/:id` `{categoryLabel:"Test overhead 2", notes:"x"}` → Expected: label/notes update; cost_source/leave_type unchanged
3. `DELETE /api/carpentry/internal-categories/:id` (no `?hard`) → Expected: status → `archived`, still visible in history
4. `DELETE /api/carpentry/internal-categories/<a LEAVE category id>?hard=1` → Expected: **400** "Leave categories can't be hard-deleted — archive it instead"
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role (cost director-gating)**
1. As a **Supervisor**, open BL-INTERNAL and call `GET /api/carpentry/internal-cost-summary`
2. Expected: hours visible; **all cost fields null** (`canViewCost:false`); as an **Admin/Director** the same call returns cost values
3. As a non-admin/supervisor, the category CRUD/assign endpoints return 403
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (worked hours land tagged, report reflects)**
1. Approve the TC-01 worker's timesheet (Workforce → Approvals)
2. Open BL-INTERNAL → Expected: the ATEC (or last-tagged) category card shows the hours (+ cost for directors)
3. `GET /api/carpentry/internal-cost-summary` → Expected: the BL-INTERNAL element's `categories[]` has that category with a matching FY/quarter period, `estimated:false`
- [ ] Pass  [ ] Fail

**TC-06 — Retro-assign untagged worked hours**
1. Ensure ≥1 approved BL-INTERNAL entry with `internal_category_id` NULL (or clear one) → open BL-INTERNAL
2. Expected: an **Untagged** card lists it (date · worker · hours)
3. Assign it to **Logistics** → Expected: it leaves Untagged and appears under Logistics; `POST …/internal-assign` returns `assigned:1`
- [ ] Pass  [ ] Fail

**TC-07 — Retro-assign REJECTS a leave target**
1. `POST /api/carpentry/jobs/:id/internal-assign` with `internalCategoryId` = a **leave** category id + a valid `entryIds`
2. Expected: **400** "Leave categories are derived — you can't assign worked hours to them"; no entry re-tagged
- [ ] Pass  [ ] Fail

**TC-08 — FY / quarter rollup**
1. With approved worked hours spanning ≥2 quarters (or seed dates), open BL-INTERNAL
2. Expected: the **By financial year** table sums per FY; toggle **Show quarters** → each FY splits into Q1 Jul–Sep … Q4 Apr–Jun; the quarter sums reconcile to the FY total and to the category grand total
3. Expected: FY label format is `"2025-26"` (matching `auFyQuarter`)
- [ ] Pass  [ ] Fail

**TC-09 — NO DOUBLE-COUNT: a leave day is derived, never a timesheet row**
1. Record a leave/RDO day for an employee via the leave spine (approve a day-off, or `POST /api/workforce/record-sick-day`)
2. Confirm **no** `timesheet_entries` row exists for that employee+date on BL-INTERNAL (the leave day is not logged)
3. `GET /api/carpentry/internal-cost-summary` → Expected: the day appears **only** in the derived leave block (`estimated:true`) for the correct category; attempting to also write a timesheet row for that date would hit `UNIQUE(employee_id,date)` (mig 059)
- [ ] Pass  [ ] Fail

**TC-10 — NO DOUBLE-COUNT: half-day leave + half-day Logistics = one paid day**
1. For a full-timer (std day 7.6): record a **half-day** leave (`hours = 3.8`) and have them log **3.8h Logistics** on BL-INTERNAL the same day
2. Expected: the day totals **7.6h** across the two categories (3.8 leave + 3.8 worked), **not** 11.4 — no double paid day
- [ ] Pass  [ ] Fail

**TC-11 — NO DOUBLE-COUNT: a leave day on a public holiday is not double-costed**
1. Add a `workforce_public_holidays` date that coincides with an employee's leave/RDO row
2. `GET /api/carpentry/internal-cost-summary` → Expected: that date is **subtracted before costing** — it does not appear as both a public holiday and a costed leave day (the derived `days` set excludes it)
- [ ] Pass  [ ] Fail

**TC-12 — Money-formula check of the three leave rates (unit test)**
1. Run `node scripts/test/internalLeaveCost.test.mjs`
2. Expected: **all 11 assertions pass**, proving `RDO = hours × break_even_hourly` (never double-super'd), `Annual = hours × base × 1.175 × (1+SG)`, `Sick = hours × base × (1+SG)`, half-day = 0.5 × std, PH excluded, dedup (explicit row beats team RDO), part-timer non-7.6 hours, and `rate_missing` flagged (not silent $0)
3. Spot-check one live row against the formula for the FY's SG (2025-26 → 12%)
- [ ] Pass  [ ] Fail

**TC-13 — Derived rows flagged estimated / rate-missing**
1. Open BL-INTERNAL with derived leave present → Expected: Annual/Sick/RDO rows carry an **"estimated"** badge; worked rows do not
2. For a terminated/no-rate employee with a leave day → Expected: a **rate-missing** chip on that leave row (hours shown, cost not silently $0)
- [ ] Pass  [ ] Fail

**TC-14 — Graceful before migration**
1. On a DB without mig 200/201 (or simulate the missing column): open BL-INTERNAL and log internal hours
2. Expected: `migrationPending` / empty categories, no Internal category picker, logging still works (untagged); the report still returns job-level FY totals; **no 500**
- [ ] Pass  [ ] Fail

**TC-15 — BL-CHARGEUP element unchanged (regression)**
1. `GET /api/carpentry/internal-cost-summary` and inspect the **BL-CHARGEUP** element
2. Expected: exactly `{ reference, address, fyTotals, periods }` — **no** `categories` key, shape byte-identical to before this build; the Charge Up report screen (SOP 10-05) still renders normally
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors during testing
- [ ] No unexpected network errors (devtools Network tab)
- [ ] DB records correct: worked entries carry `internal_category_id`; leave rows carry `leave_type`/`hours`; no timesheet row exists for any leave day
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

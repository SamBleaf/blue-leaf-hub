---
sop_version: 2.0
last_reviewed: 2026-09-09
app_version: main — built (BL-INTERNAL cost-category sub-layer, migs 200/201) PLUS the internal-work build (migs 202/203, no-migration finance read-through): the two internal house jobs (BL-JOSH-HOUSE / BL-SAM-HOUSE), the planner "Blue Leaf Internal" 3-option picker (Logistics / Josh / Sam) with Logistics auto-tag + PWA autofill, and the finance→carpentry cost read-through. "Personal work" is archived (mig 202): hidden from all new tagging, still shown in historical reports. Annual-vs-sick split is forward-only for historic untyped leave — see §8/§12.
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 10-07: BL-INTERNAL — Internal Cost Categories & Internal House Jobs

**Module:** Workforce / Carpentry / Finance
**SOP ID:** 10-07
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
- **Admin/supervisors** set up the internal categories, drop internal shifts on the **Planner**, and read the cost-by-category report (internal cost is director/admin-only; hours are visible to supervisors).
- **Site workers** pick an internal category when they log hours against **BL-INTERNAL** on the Worker app (ATEC / Logistics only — "Personal work" is archived), and log hours against **Josh's / Sam's house** the same way they log any job.
- **Directors** see the dollar figures (cost is pay-derived, so it is director-gated), including the material spend that flows in from **Finance-allocated supplier invoices**.

## 2. When to use it
- When a worker's day is spent on non-site overhead (trade school, yard/logistics) and you want it split by category rather than dumped into one bucket.
- When a worker's day is spent on **Josh's or Sam's house** — two cost-only internal jobs that track hours + labour $ + material $ (no quote, no budget/variance).
- On the **Planner**, when you drop "Blue Leaf Internal" on a shift and need to say *which* internal work it is (Logistics / Josh's / Sam's).
- Weekly/quarterly/yearly, to read internal overhead cost by category by AU financial year and quarter.
- The leave block (Annual / Sick / RDO) is read-only reporting — you don't log it here; it is derived from the existing leave/RDO spine.

## 3. What this does
**BL-INTERNAL** is a permanent carpentry job (reference `BL-INTERNAL`, mig 125) that swallows every non-site hour. This layer gives it the **same sub-entity backbone Charge Up has**, re-purposed **cost-only** — no charge-out, no margin, no invoice. Opening it (Carpentry → BL-INTERNAL) shows a **cost-by-category report layout** (`InternalJobDetail`), not the standard job tabs.

Six seeded categories (mig 200) split by **cost source**:

- **Worked (booked)** — **ATEC / trade school**, **Logistics** (and, historically, **Personal work**, now **archived** — see below). Worker-logged: hours tag to `timesheet_entries.internal_category_id`, valued at the booked `cost_amount` (the loaded cost already computed at approval — accurate to the hour).
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
- **Per-category rows** + an **Untagged** bucket with **retro-assign** — **Tag as worked** (ATEC/Logistics/Personal) or **Convert to leave** (Sick/Annual/RDO, which moves the hours to the planner leave spine).
- A per-category **Shifts** drill-in modal (Shifts only — no Tasks/Diary/Plans; a leave category has no shifts and shows as derived).
- A **rate-missing** warning chip on any leave row for a worker with no wage rate (e.g. a terminated employee) — never a silent $0.

Cost is director/admin-only everywhere; hours stay visible to supervisors.

### "Personal work" is archived (mig 202)
"Personal work" used to be a worked category on BL-INTERNAL. That work now lives in its **own two cost-only jobs** (Josh's & Sam's house, below), so the category is **archived** — non-destructively:
- It is **hidden from every place a category is picked for NEW tagging**: the worker app's Internal-category picker, the report's retro-assign dropdown, and the Planner's Blue Leaf Internal picker.
- Its **historical hours still show** in the BL-INTERNAL report's "Cost by category" table (with an *Archived* badge; toggle **Show archived** if it has no live cost). Nothing that was logged is lost or re-costed.
- An admin can **Restore** it from the report if genuinely-personal, non-house internal work ever needs the category again.

### Internal house jobs — Josh's & Sam's house (mig 202)
Two **real, cost-only carpentry jobs** — references `BL-JOSH-HOUSE` and `BL-SAM-HOUSE` (`project_type='other'`, `status='active'`, client "Blue Leaf Building"). They are **real jobs** (not Charge-Up "sites" and not BL-INTERNAL categories) so **timesheet hours and Finance supplier invoices attach directly**. They carry **NO Buildxact quote and NO budget/allowance** — actuals only.
- **List:** they sit under the **"Internal"** heading of the Carpentry list (with BL-INTERNAL and BLB Charge Up), not in the client pipeline.
- **Detail = a bespoke Charge-Up-STYLE glance panel** (`InternalHouseJobDetail`), NOT the standard budget/variance tabs and NOT the BL-INTERNAL cost-by-category report. It shows: **KPI tiles** (Total hours · Labour $ · Material $ · Total $ — every $ director-gated), a **Labour by category** table (from approved timesheets), a **Materials & other by category** table (manual costs **plus Finance-allocated invoices**, with an *invoiced* tag on any category that carries invoice spend), and a **Tasks done** list. No budget, no variance.
- **Hours:** the houses appear in the Worker app **Site dropdown automatically** (they're real jobs) — standard logging, no internal-category picker, **no PWA change**. On the Planner they're reached through the grouped "Blue Leaf Internal" picker (below).
- **Material $:** allocate the supplier invoice to the house **in Finance** and it flows into the glance view via the read-through (below). The Finance inbound **auto-matcher only matches jobs with a `buildexact_job_id`**, so the houses **never auto-match — allocate them manually**.

### Planner — the "Blue Leaf Internal" 3-option picker (mig 203)
On **Workforce → Planner**, "Blue Leaf Internal" is **one grouped legend chip** standing in for three real jobs. Dropping it on a shift cell (or tapping an empty cell on mobile and choosing it) opens a **3-option picker** — the exact sibling of the Charge Up site picker (SOP 10-05):
- **Logistics** → allocates to **BL-INTERNAL** *and* stamps the **Logistics** internal cost category on the shift (`workforce_allocations.internal_category_id`, mig 203). The chip reads "Logistics" and the **Worker app autofills** the Logistics category when the person logs the day (full Charge-Up parity).
- **Josh's house / Sam's house** → allocates to that **real job**; the chip reads the job label and the app autofills the job naturally (it's a real job).
- **ATEC and Personal work are deliberately NOT offered** in the planner picker — ATEC is excluded by design; Personal work is archived. (A worker logging *directly* to BL-INTERNAL can still pick ATEC or Logistics in the app — that picker is unchanged.)
- **Drag-fill** across days / down workers **carries the sub-tag**, and **moving or swapping** a shift **preserves both** the charge-up site *and* the internal category (mig 203 fixes the old mig-143 move RPC that dropped the sub-tag on a swap).

### Finance-allocated invoices (finance → carpentry cost read-through, no migration)
Historically a supplier invoice allocated to a carpentry job in Finance **never appeared** in that job's costs/budget — the Finance write-side (`financial_documents`) and the carpentry read-side (`carpentry_job_costs`) touched **disjoint tables**. The **read-through fix** closes that for **every carpentry job** (the two houses included) with **no migration**:
- Carpentry `/summary`, `/budget` and `/costs` now **also read approved carpentry `financial_documents`** (status **`approved` / `filed` / `xero_synced`**) and fold the invoice spend into **material actuals**.
- The **job-level total is category-blind** (a plain sum). **Per budget line**, the Finance category name is resolved to the material budget-line UUID via `carpentry_job_budgets` (`job_id` + `category_name` + `cost_type='material'`, `UNIQUE` mig 067). Finance spend whose category doesn't map to a material budget line is still counted in the total but shown separately as **"unlinked"**, so it's never silently misattributed to a line.
- **No double-count:** Finance invoices live **only** in `financial_documents` (read at query time — un-allocate / reject / amount edits reflect live), are **never copied** into `carpentry_job_costs`, and surface in `/costs` as **read-only** rows (edit them in Finance). So the same invoice can never be both a manual cost entry and a Finance doc.

## 4. Before you start
- Migrations **200** (categories + `internal_category_id` tag + seed) and **201** (leave-type + hours columns on the leave spine) applied. Apply **200 then 201**.
- Migration **202** (seeds the two house jobs **and** archives "Personal work") and **203** (`workforce_allocations.internal_category_id` for the planner Logistics auto-tag + the mig-143 move-RPC fix) applied for the house jobs + the full planner picker. Apply **202 then 203**.
- The **finance → carpentry cost read-through needs no migration** — it's live as soon as the code ships and benefits every carpentry job.
- The **cost model** synced (Workforce → Buildexact sync) so worked cost and the leave base/break-even rates resolve. Without it, worked cost and leave cost fall to $0 or `rate_missing`.
- The BL-INTERNAL standing job exists (mig 125). If it doesn't, mig 200 warns and seeds nothing; mig 202 still seeds the two houses (they don't depend on BL-INTERNAL).
- To read cost you need the **admin/director** role; supervisors see hours only.
- **Everything fails soft** across the migration gap: pre-202 there are simply no house jobs and "Personal work" stays live; pre-203 the planner still offers the picker but a Logistics drop can't stamp the category (worker picks it in the app) and a swap can't yet carry it. No 500s.

## 5. Step-by-step process

### Log hours against an internal category (worker, Worker app)
1. Log Hours → pick **BL-INTERNAL** in the Site dropdown.
2. A required **Internal category \*** dropdown appears — pick **ATEC / trade school**, **Logistics**, or **Personal work**.
3. Add hours and **Submit**. You can't submit BL-INTERNAL without a category. (There is no "what did you do?" free-text for internal work — it's just the category + hours.)
4. Re-opening that day on the app pre-fills the category you chose, so you can edit and resubmit without being blocked.

### Assign an internal shift in the Planner (admin/supervisor)
1. Workforce → **Planner**. Drag the **Blue Leaf Internal** chip onto a person's shift cell (or tap an empty cell on mobile and choose it).
2. A **"Pick where these internal hours belong"** sheet appears with three options: **Logistics**, **Josh's house**, **Sam's house**. (ATEC and Personal work are not offered.)
3. Pick one:
   - **Logistics** → the shift is a BL-INTERNAL shift **tagged Logistics**; the cell chip reads "Logistics" and the worker's app **autofills** the Logistics category for that day.
   - **Josh's / Sam's house** → the shift is on that real job; the chip reads the job label and the app autofills the job.
4. **Drag-fill** across days / down workers copies the choice; **moving or swapping** the shift keeps both the internal category and (for Charge Up) the site.

### Log hours against a house job (worker, Worker app)
1. Log Hours → pick **Josh's house** or **Sam's house** in the Site dropdown (they appear automatically — they're real jobs). If it was planned for you, it's pre-selected.
2. Add what you worked on + hours and **Submit** — exactly like any carpentry job. There is **no** internal-category picker for a house job (that's only BL-INTERNAL).

### Read the cost-by-category report (admin/supervisor)
1. Carpentry → open **BL-INTERNAL**.
2. The **category KPI cards** show hours (+ cost for directors) per category. Leave categories carry an **"estimated"** badge.
3. The **By financial year** table shows hours + cost per FY. Toggle **Show quarters** to break each FY into Q1–Q4.
4. Click a **category row** to open its **Shifts** modal — every approved shift tagged to that category (date · worker · task · hours · cost for directors). Leave categories show as derived (no shifts).

### Read a house job's glance view (admin/supervisor)
1. Carpentry → under the **Internal** heading, open **Josh's house** or **Sam's house**.
2. The **glance panel** shows: **Total hours** (always), and for directors **Labour $ · Material $ · Total $** KPI tiles (the Material $ tile notes how much came *from invoices*).
3. **Labour by category** lists approved hours + labour $ by cost category. **Materials & other by category** lists manual costs **and** Finance-allocated supplier invoices — a category carrying invoice spend shows an **invoiced** tag. **Tasks done** lists completed site tasks.
4. There is deliberately **no budget or variance** here — these jobs have no quote/allowance; the view is actuals-at-a-glance.

### Allocate a supplier invoice to a house / carpentry job (Finance)
1. In **Finance**, open the supplier invoice and **allocate** it to the job (set the carpentry job + cost category) and **approve** it. The houses **never auto-match** (no Buildxact id) — do this **manually**.
2. Once the doc is **approved / filed / xero_synced**, the amount appears in that job's **Materials & other** table and Material $ total (and, on a job that has a budget, against the matching material budget line). No re-entry in Carpentry — the invoice is read through live from Finance.
3. **Do not** also enter the same invoice as a manual carpentry cost — it would double-count. Finance is the one place invoices are edited; Carpentry shows them read-only.

### Add / edit / archive a category (admin/supervisor)
1. On BL-INTERNAL, use the categories management list. The **six seeded** categories are the default set; an ad-hoc worked category can be added (rare).
2. Edit a category's **label / notes / sort order**; **cost source and leave type are fixed at create** (identity — never re-typed, so the report join can't drift).
3. **Archive** a category to hide it while keeping its history. **Leave categories are archive-only** — they can't be hard-deleted (that would erase their historical report line); the report still renders a removed leave category's history via a built-in fallback label.

### Assign untagged internal hours to a category (admin/supervisor)
1. Internal hours approved **without a category** (e.g. logged before the picker existed, or office-entered) show in an **Untagged** card. The dropdown has two groups: **Tag as worked** and **Convert to leave**.
2. **Tag as worked** (ATEC / Logistics / Personal work): the hours move into that worked category immediately (still costed at the booked worked rate).
3. **Convert to leave** (Sick / Annual / RDO / Unpaid): use this for hours that were actually a leave day mis-logged as worked time. On confirm, the app **removes the worked timesheet entry and writes a typed leave day** to the planner (same worker / date / hours) — so it's costed at the leave rate via the derived path and lives on one spine only (no double-count). If that date already has a leave/RDO row, the existing row is **retyped** (no duplicate). This is the "assign via the normal route" alternative to the Workforce → "Record sick day" action.

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
| Trying to log Annual/Sick/RDO on the Worker app | People expect all categories in the picker | Only the **worked** categories appear (now **ATEC / Logistics** — "Personal work" is archived); leave is derived from the leave/RDO spine, never logged |
| Expecting the annual/sick split for past leave | Historic leave rows are untyped → read as RDO | The split is **forward-only** once leave typing is captured; RDO history is complete |
| Reading cost as a supervisor | Cost is pay-derived and director-gated | Supervisors see hours; ask a director for the dollar figures |
| Assigning untagged hours to a leave category (Sick/Annual/RDO) | Those hours were a mis-logged leave day | Use **Convert to leave** — it removes the worked entry and writes a planner leave day (costed at the leave rate). To keep them as worked time, use **Tag as worked** instead |
| Logging house work under BL-INTERNAL "Personal work" | Old habit; the category is now archived | Log against **Josh's / Sam's house** (real jobs in the Site dropdown) instead — that's where the hours + invoices now belong |
| A house invoice doesn't show up in the glance view | The Finance inbound matcher only auto-matches Buildxact jobs, so a house never auto-matches | **Manually allocate** the invoice to the house in Finance and **approve** it; it then reads through automatically |
| Entering a supplier invoice as a manual carpentry cost *and* in Finance | Not realising Finance invoices already read through | Enter invoices **only in Finance** — the carpentry view shows them read-only; a manual copy double-counts |
| Expecting a budget/variance tab on a house job | Every other carpentry job has one | The houses are cost-only (no quote/budget) — the glance view is actuals only, by design |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| "Apply migration 200/201" note, or no categories | Migrations not applied | Apply mig 200 then 201 in the Supabase SQL editor |
| No Internal category dropdown on the app | Job has no active worked categories, or the app is cached | Confirm the seeded categories exist; hard-refresh the app |
| Annual/Sick both show as **RDO** in the report | Those leave rows are untyped — approved before the leave-type UI was used, or approved without picking a type | Use the "Time off" approve modal's **Leave type** selector + the **"Record sick day"** button going forward; historic untyped leave stays RDO (forward-only split) |
| A leave row shows a **rate-missing** chip | The worker has no base/break-even wage rate (e.g. terminated) | Sync the cost model / set the employee's rate; the row shows hours but no cost until then |
| Worked cost is $0 | Cost model not synced, or the timesheet isn't approved yet | Run Workforce → Buildexact sync and approve the timesheet |
| "Leave categories can't be hard-deleted" | You tried `?hard=1` on a leave category | Archive it instead — history must survive |
| Josh's / Sam's house missing from the carpentry list or Planner picker | Mig 202 not applied | Apply mig 202; the two jobs seed under the **Internal** list heading and appear in the Blue Leaf Internal picker |
| Dropped "Logistics" in the Planner but the chip doesn't say "Logistics" / the app didn't autofill it | Mig 203 not applied (the alloc `internal_category_id` column is missing) | Apply mig 203; before that the Logistics option still allocates to BL-INTERNAL but the worker picks Logistics in the app |
| A swapped/moved internal (or charge-up) shift lost its Logistics / site tag | Old mig-143 move RPC (pre-203) dropped the sub-tag on a swap | Apply mig 203 — the move RPC now re-inserts the displaced shift carrying **both** the charge-up site and the internal category |
| Finance-allocated invoice not showing in a carpentry job's costs/materials | Doc isn't in an approved state, or it was allocated to a different job/category | Only **`approved` / `filed` / `xero_synced`** docs read through; confirm the doc's carpentry job + category in Finance |
| Invoice $ shows in the job total but not against a budget line ("unlinked") | Its Finance category name doesn't match any **material** budget line on that job | Rename the Finance category to match a material budget line (or add the line); it always counts in the total regardless |

## 9. Related SOPs
- [SOP 10-05 BLB Charge Up](charge_up_sites.md) — the billable backbone this cost-only layer mirrors; the Planner "Blue Leaf Internal" picker is the direct sibling of the Charge Up site picker
- [SOP 10-01 Workforce Overview](workforce_overview.md) — timesheets, approvals (approval books the cost)
- [SOP 10-04 Workforce Pipeline](workforce_pipeline.md) — the capacity math that reads the same leave/RDO spine
- [SOP 09-03 Match an invoice to a job](../09_finance/finance_match_invoice_to_job.md) + [SOP 09-04 Approve an invoice](../09_finance/finance_approve_invoice.md) — how a supplier invoice is allocated + approved in Finance (the source of the material $ that reads through into the house / carpentry job)
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
- **House jobs (mig 202):** `BL-JOSH-HOUSE` / `BL-SAM-HOUSE` are seeded `carpentry_jobs` (`project_type='other'`, `status='active'`, `on conflict (reference) do nothing`). Refs live in `constants.js` (`BL_JOSH_HOUSE_REFERENCE`, `BL_SAM_HOUSE_REFERENCE`, `INTERNAL_HOUSE_REFERENCES`). `CarpentryJobDetail` branches on `INTERNAL_HOUSE_REFERENCES` → renders `InternalHouseJobDetail` (they deliberately do NOT hit the BL-CHARGEUP / BL-INTERNAL detail branches). The glance view reads existing endpoints only — `GET /api/carpentry/jobs/:id/summary`, `/costs`, `/tasks` — and does no writes. Mig 202 also `UPDATE internal_categories SET status='archived' WHERE slug='personal_work'` (guarded — no-ops if mig 200 isn't applied yet).
- **Finance → carpentry read-through (Phase 0, no migration):** `readFinanceCarpentryCosts(sb, jobId)` in `carpentryRoutes.mjs` sums `financial_documents` where `carpentry_job_id=:id` AND `status IN ('approved','filed','xero_synced')` (`FINANCE_APPROVED_STATUSES`), grouped by `carpentry_cost_category`. `/summary` returns `otherActual` (manual + finance), plus `manualOtherActual` / `financeActual` / `financeInvoiceCount` and a `labourByCategory[]`. `/budget` folds finance into `materialActual` (per-line resolve of category name → `carpentry_job_budgets` material-line UUID via `job_id`+`category_name`+`cost_type='material'`, UNIQUE mig 067) and returns `financeMaterialActual` + `financeUnlinkedActual`. `/costs` lists finance docs as **read-only** rows (`source:"finance"`, supplier/invoice/date). Fail-soft: pre-mig-088/089 or missing `financial_documents` → returns empties, callers keep prior behaviour. **No copy into `carpentry_job_costs`** — the disjoint tables are the double-count guard.
- **Planner internal picker (mig 203):** `workforce_allocations.internal_category_id uuid REFERENCES internal_categories(id) ON DELETE SET NULL` (kept outside the project/carpentry XOR, like `charge_up_job_id`). `workforceRoutes.mjs`: `resolveAllocInternalCategory` (sibling of `resolveAllocChargeUpSite`) validates the category belongs to the allocation's carpentry job; `ALLOCATION_SELECT` embeds it; `formatAllocation` echoes `internalCategoryId` + `internalCategoryLabel`; set (guarded) on POST `/allocations`, `assign`, PUT; echoed on worker `/allocations/today` + `/week`. Probe-guarded so mig-200-present / mig-203-absent still works. `WorkforcePlannerTab.jsx`: the grouped "Blue Leaf Internal" chip → a 3-option picker (`internalOptions` = **only** `logisticsCat` (slug `logistics`) + the two house jobs; ATEC/Personal never pushed). `WorkerLogHours.jsx` prefills `internalCategoryId` from the allocation. The **mig-143 move RPC** `workforce_allocation_move` is `CREATE OR REPLACE`d to re-insert a displaced/swapped shift carrying **both** `charge_up_job_id` AND `internal_category_id`.
- **Tables:** `internal_categories` (mig 200) + `timesheet_entries.internal_category_id` (mig 200, ON DELETE SET NULL); `workforce_employee_rdo_dates.leave_type` + `.hours` and `workforce_day_off_requests.leave_type` (mig 201); the two house `carpentry_jobs` + archived `personal_work` (mig 202); `workforce_allocations.internal_category_id` (mig 203). `workforce_team_rdo_dates` deliberately gets no column (team RDO is `rdo` + full-day by definition).

## 12. Edge cases and limits
- **No cost model / no rate** → worked cost $0; leave rows flag `rate_missing` (hours still count).
- **Half-day leave** → the leave row carries `hours` (e.g. 3.8 = 0.5 × 7.6); the worker can log the other half as Logistics, and the day sums to exactly one paid day — not 1.5.
- **A leave day on a public holiday** → the public-holiday date is subtracted before costing, so it's counted once (as the holiday), never double.
- **Same employee + date in two leave sources** → an explicit per-employee row beats a team RDO, which beats a recurring pattern — the day is costed once, with its explicit type/hours.
- **Untyped historic leave** → reads as RDO (backfill parity); annual/sick split is forward-only.
- **Deleting a category** → worked `internal_category_id` becomes NULL (hours fall to the Untagged bucket, never orphaned); leave categories can't be hard-deleted.
- **Before migration** → every route fails soft (empty categories / `migrationPending`); the report still returns the job-level FY totals and BL-CHARGEUP is unaffected.
- **House jobs never auto-match a Finance invoice** → they have no `buildexact_job_id`, so the inbound matcher skips them; they're **manual-allocation only** (correct — no false matches).
- **Un-allocate / reject / amount-edit a Finance invoice** → the carpentry material $ reflects it **live** (the read-through queries `financial_documents` at request time; nothing is stored/copied, so there's no stale mirror to reconcile).
- **A house job with no hours and no invoices** → the glance view renders empty tables + a prompt to allocate invoices in Finance; no crash.
- **Pre-mig-203 planner** → a Logistics drop still allocates to BL-INTERNAL but can't stamp the category (worker picks it in the app), and a swap can't yet carry it; post-203 both work. Josh/Sam allocations work either way (real jobs).

## 13. Owner of the process
Admin / Director
Next review: 2027-03-03

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run these in order; record pass/fail against each. If any fails, document it and do **not** set `test_status: passed`. Money and no-double-count cases (TC-09..TC-13) are the acceptance criteria for the leave half.

### Pre-test setup
- [ ] Migrations **200** then **201** applied; then **202** then **203**; `NOTIFY pgrst` ran (schema cache fresh)
- [ ] Logged in as **Admin/Director** for the report + CRUD cases; have a **Supervisor** login for the gating case
- [ ] The BL-INTERNAL standing job exists (mig 125); the six seeded categories are present; **BL-JOSH-HOUSE / BL-SAM-HOUSE** exist (mig 202) and **"Personal work" is archived**
- [ ] Cost model synced (else worked cost / leave rates are expected $0 or `rate_missing`)
- [ ] A worker account that can log hours against BL-INTERNAL and the house jobs
- [ ] A **supplier invoice** available in Finance to allocate (for the read-through case)

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

**TC-07 — Retro-assign guards (belongs-to-job; leave target CONVERTS not rejects)**
1. `POST /api/carpentry/jobs/:id/internal-assign` with an `internalCategoryId` from a **different** job → Expected: **400** "That category isn't part of this job"; no entry re-tagged
2. Assigning to a **leave** category does **not** 400 — it **converts** the worked hours to a typed leave day (see **TC-16** for the full convert path). Confirm the current code branches (worked → tag in place; leave → convert), so a leave target is a valid — not rejected — target
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

**TC-16 — Convert untagged worked hours to a leave day (Sick/Annual/RDO)**
1. In the Untagged card, on a worked entry pick a **Convert to leave** option (e.g. Sick) and confirm the prompt
2. Expected: the entry disappears from Untagged; a leave day appears for that worker/date on the planner; the report's **Sick** category cost increases by `hours × base × (1+super)` (NOT the worked rate); no `timesheet_entries` row remains for that entry (no double-count)
3. Convert onto a date that already has a leave/RDO row → the existing row is **retyped** (no duplicate); worked entry still removed
4. Automated equivalent: `node scripts/test/internalJobE2E.test.mjs` scenarios 7 + 10 (10/10)
- [ ] Pass  [ ] Fail

**TC-17 — Internal house jobs: list grouping · glance view · PWA visibility (mig 202)**
1. Carpentry list → Expected: **Josh's house** and **Sam's house** appear under an **"Internal"** heading (alongside BL-INTERNAL / BLB Charge Up), **not** in the client pipeline
2. Open **Josh's house** → Expected: the **glance panel** (`InternalHouseJobDetail`) — Total hours tile always; for a director, **Labour $ / Material $ / Total $** tiles; a **Labour by category** table, a **Materials & other by category** table, and a **Tasks done** list. Expected: **NO** budget/variance tabs and **NO** BL-INTERNAL cost-by-category report
3. Worker app → Log Hours → Site dropdown → Expected: **Josh's house / Sam's house** are selectable (real jobs, no internal-category picker); log 4h + submit → after approval the glance view's Labour tiles/table reflect the hours
4. As a **Supervisor**: Expected: hours visible, all **$** hidden
- [ ] Pass  [ ] Fail

**TC-18 — Planner "Blue Leaf Internal" 3-option picker + Logistics auto-tag + PWA autofill (mig 203)**
1. Workforce → Planner → drop **Blue Leaf Internal** on a shift cell → Expected: a picker with exactly **Logistics · Josh's house · Sam's house** (ATEC and Personal work are **not** offered)
2. Pick **Logistics** → Expected: the cell chip reads **"Logistics"**; a second `GET /api/workforce/allocations` shows that allocation with `internalCategoryId` set + `internalCategoryLabel:"Logistics"` and the BL-INTERNAL job
3. That worker opens the planned day on the Worker app → Expected: BL-INTERNAL is selected and the **Logistics** internal category is **autofilled**
4. Pick **Josh's house** on another cell → Expected: the chip reads the house label; the allocation is on `BL-JOSH-HOUSE`; the app autofills the job
5. **Drag-fill** a Logistics shift across days / down workers → Expected: every filled cell carries Logistics. Then **swap** a Logistics shift onto an occupied cell → Expected: the displaced shift keeps its own sub-tag after the swap (mig-143 move-RPC fix — no sub-tag loss on a swap)
6. Before mig 203 (or simulate the missing column): Expected: the picker still works, Logistics allocates to BL-INTERNAL untagged (worker picks it in the app), no 500
- [ ] Pass  [ ] Fail

**TC-19 — Finance → carpentry cost read-through + NO DOUBLE-COUNT (no migration)**
1. In Finance, **allocate** a supplier invoice to **Josh's house** (or any carpentry job) with a cost category, and **approve** it (status → `approved`/`filed`/`xero_synced`)
2. Open the job → Expected: the invoice amount appears in **Materials & other by category** (the category shows an **invoiced** tag) and in the **Material $** total; `GET …/summary` shows `financeActual` > 0 and `otherActual` = manual + finance; `GET …/costs` lists the invoice as a **read-only** `source:"finance"` row (supplier · invoice # · date)
3. On a job **with a budget**: `GET …/budget` → the invoice folds into `materialActual` on the matching material line (name→UUID resolve); an invoice whose category matches **no** material line is counted in the total and reported as **`financeUnlinkedActual`** ("unlinked"), not misattributed
4. **No double-count:** confirm the invoice is **not** written to `carpentry_job_costs` (it lives only in `financial_documents`); do **not** also enter it manually
5. **Un-allocate / reject** the invoice in Finance → reload the job → Expected: the material $ drops back **live** (nothing stale) — pending/rejected docs are excluded
6. Before mig 088/089 (or `financial_documents` absent): Expected: read-through returns empty, the job's costs behave exactly as before, no 500
- [ ] Pass  [ ] Fail

**TC-20 — "Personal work" archived: excluded from all NEW tagging, still in historical reports (mig 202)**
1. Worker app → Log Hours → Site = BL-INTERNAL → Expected: the Internal category picker lists **ATEC / Logistics** only — **no "Personal work"**
2. BL-INTERNAL report → Untagged retro-assign dropdown → Expected: **Personal work is not** an assign target; Planner Blue Leaf Internal picker → Expected: Personal work not offered
3. BL-INTERNAL report → **Cost by category** → Expected: "Personal work" **still renders** with an **Archived** badge and its historical hours/cost intact (toggle **Show archived** if it has no live cost); its history was not deleted or re-costed
4. As admin, click **Restore** on the archived Personal work row → Expected: it goes active again (and would reappear in the pickers); re-archive to leave the intended state
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors during testing
- [ ] No unexpected network errors (devtools Network tab)
- [ ] DB records correct: worked entries carry `internal_category_id`; leave rows carry `leave_type`/`hours`; no timesheet row exists for any leave day
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

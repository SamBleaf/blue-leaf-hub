# Labour Burn-Rate + Company Cost Model — Build Plan

> **Status:** PLAN (planning session 2026-06-15). Not built.
> **Source of truth for inputs:** Sam's "Blue Leaf Budget and expenses.xlsx" (2 sheets) → to be live-linked as a Google Sheet.
> **Core goal:** turn each carpentry category's **labour $** into **how many crew-days the team can stay on it before it stops being profitable**, and feed that into schedule, costs, budget — and make the company overheads a live knowledge base for Financials/Operations.

---

## 1. The idea in one line
`category labour budget ÷ crew's fully-loaded day-rate = profitable days on that task.`
Two thresholds per category:
- **At-margin days** = labour value ÷ (crew **charge-up** rate/day)  *(stays at target margin)*
- **Break-even days** = labour value ÷ (crew **with-overhead** rate/day)  *(past this = losing money)*

Worked example (crew Dylan+Brayden+Ben, from the sheet):
- charge-up ($67.32+$57.56+$66.62)×8h = **$1,532/day**; with-overhead = **$1,277/day**
- "First Fix Framing" labour budget **$9,000** → **5.9 days at 20% margin**, **7.0 days break-even**.

---

## 2. Inputs — what the spreadsheet gives us (already computed there)
The sheet is the **calculator**; the Hub **consumes its outputs**. We read:

**Tab "Business costs"**
- Overhead line items (Workcover, insurance, licences, Buildxact, vehicles, fuel, software…) → **Total $120,220.88/yr**
- Employee-related on-costs (super, leave loading, LSL, fuel cards…) → **$75,842.01/yr**
- Operating roll-up: total **$693,647.77/yr**, **43 working weeks**, **$16,131/week**
- Productive factor: **78%** of paid time is billable on-site

**Tab "Employee true cost"** (the gold — per-employee build-up)
- base hourly → +super → +leave loading → **true hourly cost** (e.g. Joshua $69.68)
- → **with business overhead** ($88.35) → **charge-up @20%** ($106.02)
- Whole team: **$358/hr true → $454/hr with-overhead → $545/hr charge-up**

These three per-employee rates (**true / with-overhead / charge-up**) + the operating params are the canonical numbers every module will use.

---

## 3. Decisions (locked 2026-06-15)
| # | Decision | Choice |
|---|---|---|
| Live doc | how the overheads live in the system | **Live-linked Google Sheet** — Sam edits in Sheets, Hub syncs (costs change constantly) |
| Crew basis | rate for the "profitable days" calc | **Planned = whole-team rate** to start → **Actual = real crew from timesheets** live, shown side-by-side. "Typical crew per category" is a later refinement |
| BX labour rate | what flows to Buildexact actuals | **Switch to true-cost** (wages+super+loading); overhead+margin stay in the Hub |
| Preferred margin | target margin | **20%** default (from sheet), editable |

---

## 4. Architecture

### 4a. Company Cost Model (canonical store + Google Sheet sync)
Owned at the **company level** (extends Knowledge Core `company_profile`, mig 069; Canonical Data Law — facts on the company spine, stamped with provenance `source='google_sheet'`, `synced_at`).

- **Sync contract:** the Hub reads defined **named ranges** from the linked Google Sheet (not raw cell coords — robust to row edits):
  - `Overheads` → line items + total
  - `OperatingParams` → working_weeks, productive_pct, margin_pct, hours_per_day
  - `EmployeeRates` → per-employee {name, base_hourly, true_hourly, with_overhead, charge_up}
- **Sync:** `POST /api/cost-model/sync` (manual button) + a daily cron. Reuses Google Drive OAuth + **`spreadsheets.readonly`** scope (re-run `auth:drive`). Stores the spreadsheet id in env/settings.
- **Validation + status:** on each sync, validate the named ranges exist and numbers parse; surface "Last synced 2h ago ✓ / ⚠ ranges missing" in the UI. Keep the previous good snapshot if a sync fails (never wipe to a bad read).
- **Robustness note:** live-linked sheets are inherently fragile (renamed tabs, deleted ranges). Named ranges + validation + last-good-snapshot are the mitigations. If drift becomes painful, fall back to "re-import on demand."

### 4b. Employee→name reconciliation
The sheet keys on **names** (Joshua Manning, etc.); the Hub `employees` table keys on id + `hourly_rate`. Match sheet rows to employees by name (the workforce push is already name-based). Store the synced rates against each employee with provenance. **Surface a mismatch report** when a sheet name doesn't map to an active employee (or the base rate diverges from `employees.hourly_rate`).

### 4c. Rate engine (Generated)
Per employee / crew / day, derived (never stored editable; recompute when the sync brings new inputs or margin changes):
- `trueDay = true_hourly × hours_per_day`
- `withOverheadDay = with_overhead × hours_per_day`
- `chargeUpDay = charge_up × hours_per_day`
- **Whole-team rate** = Σ active field staff (the "work backward from full team" default)
- **Actual crew rate** = Σ (worker hours × worker rate) from approved timesheets

### 4d. Burn-rate per carpentry category
Join `carpentry_job_budgets` (cost_type='labour', `category_name`, labour value) with the rate engine:
- **Planned:** at-margin days = value ÷ chargeUpDay(whole-team); break-even days = value ÷ withOverheadDay(whole-team)
- **Actual (live from timesheets for that category):**
  - actual cost = Σ (hours × true_hourly) ; days = Σ crew-hours ÷ hours_per_day
  - actual margin $ = value − actual cost ; margin % = (value − actual cost) ÷ value
  - **days remaining at margin** = (value × (1 − margin) − actual cost) ÷ currentCrewDay(true)
- **Status:** 🟢 within budget-days · 🟡 within break-even · 🔴 over break-even

---

## 5. Buildexact true-cost switch
- The labour Work Order push (`workforceRoutes.syncTimesheetToBuildexact`) currently uses `employees.hourly_rate`. Switch the line `unitCost` to the synced **true_hourly** (the real cost of that labour), so BX actuals reflect true cost.
- Keep base pay separate (payroll) and charge-up separate (pricing). Only **true cost** goes to BX actuals.
- ⚠ One-off: this changes BX actuals vs the existing base-rate history — note it; only applies to new pushes.

---

## 6. Cross-module integration
| Module | What it gets |
|---|---|
| **Carpentry job detail** | per-category card: labour budget · planned days · actual days/cost/margin · days remaining · 🟢🟡🔴 |
| **Operations / Schedule** | budget-days as a **guardrail** on a carpentry task's duration — flag "scheduled 8d, budget supports 6d at margin"; option to seed task duration from budget-days |
| **Workforce** | timesheet approval feeds the actual burn; true-cost rate feeds the BX push |
| **Financials** | charge-up rates → pre-tender estimating, WIPAA, margin tracking; overheads as the company knowledge base |
| **Cost Intelligence** | loaded $/hr and $/m² become benchmarks |

---

## 7. Data model (proposed migrations)
- **`company_cost_model`** (or extend `company_profile`): overheads jsonb, operating params (working_weeks, productive_pct, margin_pct, hours_per_day), google_sheet_id, last_synced_at, last_sync_status.
- **`company_overhead_items`**: name, annual_cost, category — for line-item display/analysis (optional; could live in the jsonb).
- **`employee_cost_rates`** (or columns on `employees`): base_hourly, true_hourly, with_overhead_hourly, charge_up_hourly, source, synced_at. (Versioned — write history on change.)
- No change to `carpentry_job_budgets` (already has labour values + categories).

---

## 8. Phasing (each ships independently; verify before relying on the BX write)
- **P1 — Company Cost Model + Google Sheet sync.** Scope: Sheets read, named-range contract, store overheads + per-employee rates, name reconciliation, sync status UI. *Foundation; nothing else works without it.*
- **P2 — Rate engine + employee loaded rates.** Compute true/with-overhead/charge-up per employee + whole-team + crew. Surface a "Company Cost Model" view (Financials/Settings) reading the live numbers.
- **P3 — Carpentry burn-rate.** Per-category planned + live-actual days/margin on the carpentry job detail.
- **P4 — Buildexact true-cost push** (switch unitCost). Verify on a disposable order first.
- **P5 — Operations/schedule guardrail** (budget-days on carpentry tasks).
- **P6 — Financials / Cost Intelligence surfacing** (pre-tender, benchmarks).

---

## 8b. Cross-module integration map (from a 2026-06-15 code scan)

**Best foundation (confirmed against the code):**
- **Extend `company_profile`** (mig 069, already exists, currently unpopulated) as the single company-level store — add overhead %, target margin, sync metadata. Don't create a parallel table for params.
- **Add a `company` spine to the facts service** (`factsService.mjs` / `jobFactRegistry.mjs` are job/lead/party only today) — register `company_overhead_pct`, `company_margin_target_pct` (versioned), `company_avg_loaded_rate` (generated). Add `getCompanyProfile()` parallel to `getJobProfile()`.
- **New `company_cost_model_rates`** table (per trade/employee × effective_date): base_hourly, overhead_pct, generated loaded_hourly, source ('manual'|'google_sheet'). Versioned history.
- **Reuse `googleDriveClient.mjs`** (proven by Module 5 fee proposals) — add a `readGoogleSheet(id, range)` and a `companyCostModelRoutes.mjs` with `POST /sync-from-sheet`. No new auth flow.

**Where each module hooks in (highest-value first):**
| Module | File · entry point | Hook |
|---|---|---|
| **Workforce** | `workforceRoutes.mjs` `computeCost()` (~61) | swap base `hourly_rate` → **loaded/true rate**; flows into `cost_amount` → the BX push automatically (no API change) |
| **Carpentry** | `carpentryRoutes.mjs` budget seed (~948) + `GET .../budget` (~1014) | per-category **estimated_crew_days = labour budget ÷ loaded rate**; actual labour already from timesheets → switch to loaded rate |
| **Schedule** | `scheduleGenerate.mjs` duration defaults (~10–85) | **inverse calc**: seed/cap a task's `duration_days` from labour budget ÷ (loaded rate × crew); warn if a phase runs unprofitable |
| **Finance** | `financeCCRoutes.mjs` WIPAA (~706) + budget seed (~219) | re-derive `forecast_total_cost` labour leg via loaded rate (kills the "labour undercosted in forecast" drift); add a burn-rate KPI |
| **Cost Intelligence** | `costIntelligenceEstimate.mjs` (~118) · `normalizedCosts.mjs` (~36) | enrich estimates/benchmarks with a per-trade loaded labour rate + labour-vs-material split |

**Note:** the BX labour push (`syncTimesheetToBuildexact`) needs **no change** for the true-cost switch — it sends the pre-computed `cost_amount`, so swapping the rate inside `computeCost()` is the single lever.

## 9. Open items / to confirm during build
- **Google Sheet prep:** Sam converts the xlsx → Google Sheet in Drive and adds the named ranges (Overheads / OperatingParams / EmployeeRates). Hub needs the spreadsheet id + the Sheets scope.
- **"Whole-team" definition:** all active field staff, or a flagged "field crew" subset (excludes office-only)? (Default: active employees with a trade.)
- **Productive 78%:** apply to the day-rate (a 7.8h productive day on 10 paid?) or leave day-rate at hours_per_day and use 78% only for overhead recovery? (Match the sheet's treatment at build time.)
- **Margin source:** single company target (20%) vs per-job target (jobs already have `target_margin_pct`). Use company default, allow per-job override.
- **Typical-crew-per-category (ladder step 3):** add after a few jobs of timesheet data reveal the real crews.

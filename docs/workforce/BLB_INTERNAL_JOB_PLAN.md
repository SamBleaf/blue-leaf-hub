# BL-INTERNAL Category Sub-Layer — Definitive Build Plan

*Final author's synthesis of U1–U5 subsystem maps + adversarial critique resolution. Root worktree: `/Users/samuelmorris/Desktop/blh-workforce.nosync`. Migration tree at 196 → new work starts at **200**. Every valid critique defect is resolved inline; the two places the critic overreached are noted with one-line rebuttals.*

---

## 1. Executive summary

BL-INTERNAL is today a bare `carpentry_jobs` row (mig 125) that swallows every non-site hour with no breakdown. We give it the **same sub-entity backbone Charge Up already has** (mig 145's `charge_up_jobs` "sites" → per-entry FK tag → FY/quarter rollup), re-purposed for **cost-only overhead** — no charge-out, no margin, no invoice. Workers pick an internal category the way they pick a Charge Up location.

The crux — and the hard half of this build — is that Sam's six categories split by cost source:

- **Three are worked hours** (ATEC, Logistics, Personal work) → a clean Charge Up mirror: worker-logged timesheet entries tagged `internal_category_id`, valued at the `cost_amount` already booked at approval.
- **Three are paid non-productive days** (Annual leave, Sick, RDO) → **derived, never re-logged**, from the *existing* leave/RDO spine (migs 119/124/139) so they can never double-count against the planner or collide with the `UNIQUE(employee_id, date)` timesheet constraint.

The critique correctly found the draft's derived-leave half under-built. This version fully specifies it: the leave-day source is the **existing `/non-working-days` feed** (the same union the planner's capacity math reads — team RDO + per-employee RDO + read-expanded patterns), leave days are valued at **base wage, not loaded rate**, using **per-employee standard hours** with an explicit **half-day hours model**, and `leave_type` gets a **capture UI + a stated backfill**. One unified report — cost by category by AU financial year + quarter — merges both sources on a single category axis and lives on a new `InternalJobDetail` page mirroring `ChargeUpJobDetail`.

**Single source of truth, per fact (the spine of this plan):**

| Fact | The one source | Never a second copy |
|---|---|---|
| Which days are non-working (leave/RDO) | The existing `/non-working-days` feed (`workforceRoutes.mjs`), unioning team RDO (124) + per-employee RDO (119/139) + expanded patterns (119) | No timesheet row is ever written for a leave day |
| What *kind* of leave a day is | `leave_type` column on the underlying leave rows (mig 201); team RDO is definitionally `'rdo'` | Not re-typed on the timesheet |
| Hours in a leave day | `hours` column on the per-employee leave row (mig 201), default = per-employee standard day | Not inferred from a global constant at read time |
| Worked internal hours + $ | `timesheet_entries.cost_amount` tagged `internal_category_id` (cost_source `timesheet` only) | Not re-derived from allocations |
| Category label + sort order | `internal_categories` table (mig 200) | `leave_type` is only the join key, never a duplicate label |
| Costing rate | worked = booked `cost_amount` (loaded, correct); leave = **base wage** (`true_hourly`/`employees.hourly_rate`) | Loaded rate never applied to a non-productive day |

---

## 2. Current state — BL-INTERNAL vs BL-CHARGEUP today

| | BL-CHARGEUP | BL-INTERNAL |
|---|---|---|
| Row | `carpentry_jobs` ref `BL-CHARGEUP` (mig 125) | `carpentry_jobs` ref `BL-INTERNAL` (mig 125) |
| Sub-entities | `charge_up_jobs` "sites" (mig 145) | **none** |
| Per-entry tag | `timesheet_entries.charge_up_job_id` (mig 145, SET NULL) | **none** — hours roll to the bare `carpentry_job_id` |
| PWA picker | required Location `<select>` (`WorkerLogHours.jsx:389-405`) | no picker; worker sees only base `task_category` set |
| Detail page | bespoke `<ChargeUpJobDetail>` via `CarpentryJobDetail.jsx:2399` | falls through to standard carpentry tabs |
| Cost basis | `cost_amount` **+ charge-out + margin** (billable) | `cost_amount` only (correct — cost is what we want) |
| Rollup | `charge-up-summary` per-site + per-FY (`chargeUpService`) | `GET /api/carpentry/internal-cost-summary` — FY+quarter, **whole-job, no category split**, wired to no frontend |
| CRUD | `chargeUpRoutes.mjs` full site CRUD | none |

The `internal-cost-summary` endpoint (`carpentryRoutes.mjs:1705`, `auFyQuarter` at `:1693`) already targets **both** standing jobs (`.in("reference",["BL-INTERNAL","BL-CHARGEUP"])` at `:1709`) and already does FY+quarter off approved `cost_amount`. It is missing exactly one dimension — the category — plus a derived-leave block and a UI. **Because it serves BL-CHARGEUP too, the category/derived-leave extension must be gated to the BL-INTERNAL element only and preserve the existing payload shape for the other (critique A6).**

---

## 3. Target model — internal category sub-layer on the Charge Up backbone

```
carpentry_jobs (BL-INTERNAL, mig 125)
        │  1─N   (mirror of charge_up_jobs → BL-CHARGEUP)
        ▼
internal_categories                     ← NEW table, mig 200
   • ATEC / trade school   (cost_source = timesheet)          ┐
   • Logistics             (cost_source = timesheet)          │ worker-logged
   • Personal work         (cost_source = timesheet)          ┘
   • Annual leave          (cost_source = leave, leave_type=annual) ┐
   • Sick leave            (cost_source = leave, leave_type=sick)   │ derived
   • RDO                   (cost_source = leave, leave_type=rdo)    ┘
        │
        ├── cost_source = timesheet ──►  timesheet_entries.internal_category_id
        │        (NEW FK, SET NULL, mig 200; set via PWA / mass-fill /
        │         submit-on-behalf / retro-assign — assign targets FILTERED to
        │         cost_source='timesheet' so leave can never receive worked hours)
        │
        └── cost_source = leave ──►  DERIVED, never stored as timesheet rows:
                 leave-day source  = the existing /non-working-days feed
                    = union( team RDO 124  ×  active employees,
                             per-employee RDO 119/139  (+ leave_type, hours),
                             expanded RDO patterns 119 )   minus public holidays
                 valued at  hours(row or per-employee std)  ×  BASE wage
        │
        ▼
   GET /api/carpentry/internal-cost-summary
        (BL-INTERNAL element only: GROUP BY category + merge derived leave;
         BL-CHARGEUP element unchanged)
        │
        ▼
   InternalJobDetail.jsx — cost by category by FY / quarter (cost + hours only;
        derived rows visually flagged as modelled, not booked)
```

One category registry (`internal_categories`) defines all six for a unified report axis. `cost_source` routes each to its correct engine: the PWA picker filters to `cost_source='timesheet'`; the report unions the derived-leave block onto the same category axis.

---

## 4. SAME as Charge Up vs DIFFERENT

| Dimension | SAME (mirror mig 145 / chargeUp stack) | DIFFERENT (diverge) — and why |
|---|---|---|
| **Sub-entity table** | New `internal_categories` cloned from `charge_up_jobs`: `id, carpentry_job_id→BL-INTERNAL (CASCADE), label, notes, status, sort_order, timestamps + updated_at trigger + RLS + parent/status indexes` | Adds `cost_source`, `leave_type`, `slug`. **Drops** `margin_pct` and `charge_out_hourly` — internal is cost-only. |
| **timesheet_entries tag** | New `internal_category_id uuid NULL … ON DELETE SET NULL` — exact sibling of `charge_up_job_id`; partial index `WHERE … IS NOT NULL` | Only ever set for `cost_source='timesheet'` categories — enforced **server-side**, not just in the picker (critique D1). |
| **PWA picker** | Required `<select>` cloned from the Location block (`WorkerLogHours.jsx:389-405`); options from `/subtasks`; server + client dual-guard | Options = only the 3 worked categories. **No free-text "What did you do?"** row (U3 gotcha #4). |
| **Per-entity rollup** | Clone `chargeUpService` rollups + `stripCost` director-gating; untagged bucket + retro-assign UX | **Drop `chargeOutFromMargin`, `validateChargeUpSite`.** Cost + hours only. **Add quarter** (Charge Up has none). **Retro-assign targets filtered to `cost_source='timesheet'`** (critique B1). |
| **Admin CRUD** | Clone `chargeUpRoutes` CRUD: list / create / PATCH / DELETE (soft-archive default, `?hard=1`) | **No margin endpoint.** Seeded six are the default set; ad-hoc add allowed but rare. |
| **Tasks / diary / documents** | — | **DIVERGE — skip entirely.** Do not clone `site_tasks`/`carpentry_site_diary`/`job_documents` tags; do not widen the `site_tasks` `num_nonnulls=1` CHECK. The detail modal ships **Shifts tab only** (critique B3). |
| **Cost model** | Reuse the booked `cost_amount` for worked categories | Leave categories valued at **base wage, not loaded rate** (critique E1). |
| **Charge-out / margin / invoice / Xero** | — | **None.** Pure overhead; no Buildexact WO match, no Finance surface. |
| **Category list shape** | Child-table-driven picker | **Fixed seeded set of 6.** |
| **Reporting cadence** | FY rollup in both | **Yearly + quarterly** is first-class here. |
| **Paid-vs-unpaid / leave** | — | **DIVERGE — dual cost source** (§5). This is the one place the backbone doesn't answer the design. |

---

## 5. The six categories — cost treatment & double-count reconciliation (airtight)

The dividing line: **"paid hours worked on a normal day against an internal bucket"** (timesheet-log) vs **"a paid day NOT worked"** (owned by the leave/RDO spine — derive, never re-log). Re-logging a leave day as a timesheet entry would collide with `UNIQUE(employee_id, date)` (mig 059) and contradict the planner, which already subtracts that day from capacity (`workforcePipelineRoutes.mjs:111-128`).

### 5.1 The three worked categories — clean Charge Up mirror

| Category | Nature | Cost | Source | Reconciliation |
|---|---|---|---|---|
| **ATEC / trade school** | Training — at work | Booked `cost_amount` (loaded, correct — paid, non-billable) | Timesheet → `internal_category_id` | None. Normal working day; no planner overlap. |
| **Logistics** (yard, pickups, deliveries) | Overhead — worked | Booked `cost_amount` | Timesheet → `internal_category_id` | None. Working day. |
| **Personal work** (Josh's / Sam's house) | Overhead — worked on an owner job | Booked `cost_amount` | Timesheet → `internal_category_id` | None. **Policy flag (critique B6):** BL-INTERNAL is visible to every worker, so every worker can attribute to "Personal work". v1 leaves it open (matches today's single-bucket behaviour); §11 decision 7 raises optional worker-scoping. |

These three are booked cost — accurate to the hour. No change to how cost is computed; we only add the category tag.

### 5.2 The three leave categories — fully-specified derivation

**Leave-day source of truth = the existing `/non-working-days` feed** (`workforceRoutes.mjs:2156-2177`), which already unions the *complete* non-working set the planner trusts:

1. **Team RDO** — `workforce_team_rdo_dates` (mig 124, whole-crew last-Friday-of-month). **Has no `employee_id` and no per-row leave_type.** To attribute cost, **fan out each team-RDO date across all employees active on that date** and type it `'rdo'` definitionally (critique A1). Mig 201 does **not** add a column to this table — its type is implicit.
2. **Per-employee RDO / leave** — `workforce_employee_rdo_dates` (migs 119/139). Carries the new `leave_type` + `hours` columns (mig 201).
3. **Recurring RDO patterns** — `workforce_rdo_patterns` (mig 119), **expanded on read** (never materialized). The derived query must run the same expansion the feed uses, then cost the expanded dates, typed `'rdo'` (critique A2).

| Category | Day source | Valuation | Notes |
|---|---|---|---|
| **Annual leave** | per-employee rows where `leave_type='annual'` | `hours × base_hourly × 1.175 × (1 + SG)` — base + **17.5% AL loading** + **employer super**, **excl. travel** | `base_hourly` (mig 090) confirmed to EXCLUDE travel. `hours` = employee std day; half-days honoured (§5.3). SG = super-guarantee % (§5.5). |
| **Sick leave** | per-employee rows where `leave_type='sick'` | `hours × base_hourly × (1 + SG)` — base + **super**, no loading, no travel | Captured via admin "record sick day" (§7/§F2). |
| **RDO** | team RDO (fanned out) ∪ per-employee `leave_type='rdo'` ∪ expanded patterns | `hours × break_even_hourly` — **fully-loaded break-even** (already includes super) | `break_even_hourly` (mig 090). Largest source is **team RDO**; primary read. Do NOT add super again (already in true_hourly). |

### 5.3 Five reconciliation rules that make double-counting structurally impossible

1. **No leave day is ever a timesheet row.** The derived block reads the leave spine; timesheet cost reads `cost_amount`. The two sets are disjoint by construction — mig 119/124 tables carry **no dollars** ("display-only" invariant preserved).
2. **Half-day model (critique A4, resolved).** Mig 201 adds an `hours numeric` column to `workforce_employee_rdo_dates`, defaulting to the employee's standard day. A half-day leave stores `hours = 0.5 × std`; the worker may log the other half as Logistics on BL-INTERNAL, and the day sums to exactly one paid day — not 1.5. Team RDO is always a full standard day (no half-day team RDO exists). **Same-day full-leave + internal-timesheet is not forbidden; it is made arithmetically correct by the hours column.**
3. **Public holidays excluded, with de-dup (critique A5, resolved).** `workforce_public_holidays` (mig 119) is **not** one of Sam's six categories and is **excluded** from this report (stated, not silent). To prevent a leave/RDO row that lands on a public holiday from being both a PH and a costed leave day, the derived query **subtracts public-holiday dates from the leave-day set before costing** — a day is a holiday *or* a costed leave day, never both.
4. **Rate = per-category, per Sam's payroll model (FULLY LOCKED 2026-09-03).** Three distinct treatments, all off `employee_cost_rates` (mig 090); `base_hourly` confirmed to EXCLUDE travel; employer super added to the two paid-leave types (report = cost-to-business):
   - **RDO → `break_even_hourly`** (fully-loaded break-even; already includes super via `true_hourly` — never add super again).
   - **Annual leave → `base_hourly × 1.175 × (1 + SG)`** (base + 17.5% AL loading + super; no travel).
   - **Sick leave → `base_hourly × (1 + SG)`** (base + super; no loading, no travel).
   - **Worked categories** keep their booked loaded `cost_amount` (productive — correct).
   `SG` = super-guarantee rate, see §5.5. Rationale for splitting: the 17.5% loading is annual-leave-specific; RDO is costed fully-loaded (Sam's call); sick carries base+super only.
5. **Hours = per-employee standard day, not a global 7.6 (critique E2, resolved).** The derived side reads each employee's standard hours (from `workforce_settings`/employee record; fall back to 7.6 only if unset), so part-timers and apprentices aren't overstated. Both halves of the report then use employee-accurate hours.

### 5.4 leave_type population — capture + backfill (critique A3, F2, F3, resolved)

- **Backfill:** existing `workforce_employee_rdo_dates` rows carry the note `"Approved leave"` with no annual/sick signal. Mig 201 **backfills all pre-existing untyped per-employee rows to `leave_type='rdo'`**, and team RDO is `'rdo'` by definition. Consequence, **stated loudly:** the annual-vs-sick split is **forward-only** (accrues from typed capture onward); RDO history is complete from day one. Prior-FY annual/sick therefore reads as RDO, not zero — the report is never blank.
- **Capture — ordinary day-off approval (F3):** the "Time off" approvals tab gets a `leave_type` selector (annual / sick / rdo / unpaid); approval writes it onto both the `workforce_day_off_requests` row and the generated `workforce_employee_rdo_dates` rows, alongside `hours`.
- **Capture — sick days (F2):** a dedicated admin **"Record sick day"** action (endpoint + a small surface on the "Time off" tab) writes a typed `workforce_employee_rdo_dates` row (`leave_type='sick'`, `hours`) directly — sick isn't pre-requested. This is a first-class deliverable on the critical path, not a footnote.
- **Terminated employees (critique E4):** the base-wage lookup falls back to `employees.hourly_rate`; if that is null for an archived employee the derived row is flagged `rate_missing` in the payload (not silently $0) so a historical yearly view surfaces the gap.

**Net:** one `internal_categories` registry holds all six for a unified axis; `cost_source` routes each to its correct engine; nothing is counted twice; the annual/sick/RDO dollars are a report *computation* over the leave spine, never a stored second copy.

### 5.5 The super-guarantee rate (SG) — per financial year

Employer super is added to Annual + Sick leave-day cost (Sam, 2026-09-03). Because the report buckets by FY and the statutory SG rate has stepped up, `SG` is a **per-FY lookup**, not a constant, so a historical FY costs correctly:

| Financial year (AU, Jul–Jun) | SG rate |
|---|---|
| 2023-24 | 11.0% |
| 2024-25 | 11.5% |
| **2025-26 onward** | **12.0%** |

Implement as a small map in the shared `financialYear.mjs` helper (default to the latest, 12%, for any FY ≥ 2025-26). **Two accept-the-default fine points (flag at build, override cheaply):**
- **SG basis:** statutory SG guarantee rate (above). If Blue Leaf pays a different flat super %, set one constant instead.
- **Super on the 17.5% loading:** default = **yes, super applies to the loading** (loading treated as OTE — the common case). If Blue Leaf's leave loading is treated as non-OTE (overtime-referable carve-out), compute annual as `base × (1.175·(1) )` with super on base only — a one-line change. Defaulting to super-on-loading keeps annual = `base × 1.175 × (1+SG)`.
- **RDO never gets super re-added** — `break_even_hourly` already contains it.

---

## 6. Data model — migrations 200+ (idempotent, self-contained)

### `200_internal_categories.sql`

```sql
-- Internal cost category sub-layer under BL-INTERNAL (mirror of charge_up_jobs, cost-only).

-- Self-contained updated_at fn (CREATE OR REPLACE = idempotent; removes the mig-145
-- set_updated_at() name dependency entirely — resolves critique C1).
create or replace function public.internal_categories_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create table if not exists public.internal_categories (
  id                uuid primary key default gen_random_uuid(),
  carpentry_job_id  uuid not null references public.carpentry_jobs(id) on delete cascade,
  category_label    text not null,
  slug              text not null,
  cost_source       text not null default 'timesheet'
                       check (cost_source in ('timesheet','leave')),
  leave_type        text check (leave_type in ('annual','sick','rdo','unpaid')), -- aligned w/ mig 201 (C2)
  notes             text,
  status            text not null default 'active'
                       check (status in ('active','archived')),
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists internal_categories_job_slug_uidx
  on public.internal_categories (carpentry_job_id, slug);
create index if not exists internal_categories_parent_idx
  on public.internal_categories (carpentry_job_id);
create index if not exists internal_categories_status_idx
  on public.internal_categories (status);

alter table public.internal_categories enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where tablename='internal_categories' and policyname='auth_users') then
    create policy auth_users on public.internal_categories
      for all to authenticated using (true) with check (true);
  end if;
end $$;

drop trigger if exists trg_internal_categories_updated_at on public.internal_categories;
create trigger trg_internal_categories_updated_at
  before update on public.internal_categories
  for each row execute function public.internal_categories_touch_updated_at();

-- Per-entry tag (exact sibling of timesheet_entries.charge_up_job_id, mig 145).
alter table public.timesheet_entries
  add column if not exists internal_category_id uuid
    references public.internal_categories(id) on delete set null;
create index if not exists timesheet_entries_internal_category_idx
  on public.timesheet_entries (internal_category_id)
  where internal_category_id is not null;

-- Assert BL-INTERNAL parent exists before seeding (resolves silent no-op, critique C3).
do $$
declare parent_count int;
begin
  select count(*) into parent_count from public.carpentry_jobs where reference='BL-INTERNAL';
  if parent_count = 0 then
    raise warning 'mig 200: no BL-INTERNAL carpentry_jobs row found (mig 125 not seeded in this env); internal categories NOT seeded.';
  end if;
end $$;

-- Seed the six categories (idempotent on slug).
insert into public.internal_categories
  (carpentry_job_id, category_label, slug, cost_source, leave_type, sort_order)
select j.id, v.label, v.slug, v.cost_source, v.leave_type, v.sort_order
from public.carpentry_jobs j
cross join (values
  ('ATEC / trade school','atec','timesheet',null,10),
  ('Logistics','logistics','timesheet',null,20),
  ('Personal work','personal_work','timesheet',null,30),
  ('Annual leave','annual_leave','leave','annual',40),
  ('Sick leave','sick_leave','leave','sick',50),
  ('RDO','rdo','leave','rdo',60)
) as v(label,slug,cost_source,leave_type,sort_order)
where j.reference = 'BL-INTERNAL'
on conflict (carpentry_job_id, slug) do nothing;

notify pgrst, 'reload schema';
```

### `201_leave_type_and_hours.sql`

```sql
-- Type + hour the per-employee leave spine so derived cost can group by category & honour half-days.
-- NOTE: workforce_team_rdo_dates (mig 124) intentionally gets NO column — team RDO is 'rdo' by
-- definition and full-day by definition; costing fans it out over active employees at read time.

alter table public.workforce_day_off_requests
  add column if not exists leave_type text
    check (leave_type in ('annual','sick','rdo','unpaid'));

alter table public.workforce_employee_rdo_dates
  add column if not exists leave_type text
    check (leave_type in ('annual','sick','rdo','unpaid'));
alter table public.workforce_employee_rdo_dates
  add column if not exists hours numeric;  -- null => cost uses per-employee standard day

-- Backfill: existing untyped per-employee rows become 'rdo' (annual/sick split is forward-only).
update public.workforce_employee_rdo_dates
  set leave_type='rdo'
  where leave_type is null;

notify pgrst, 'reload schema';
```

**Enum alignment (critique C2):** both migrations allow `('annual','sick','rdo','unpaid')`. `'unpaid'` days are **shown at $0** in the report (present but zero-cost), not silently dropped — so an admin can create an "unpaid" category without hitting a CHECK and unpaid days remain visible.

**Redundancy note (critique C4):** `internal_categories.leave_type` and the row-level `leave_type` both exist. **Authority split, stated:** the row-level `leave_type` is authoritative for *which bucket a day belongs to*; `internal_categories` is authoritative for the *display label + sort order*. The report joins leave rows → category via `leave_type`, so the two cannot drift the total — only the label comes from the category.

---

## 7. Backend changes

**New `server/lib/internalCategoryService.mjs`** — clone `chargeUpService.mjs`, strip charge-out/margin:
- `rollupByCategory(entries, {directorView})` — per `internal_category_id` `{cost, hours}` + `__untagged` bucket (mirror `rollupBySubJob`).
- `rollupByFyQuarter(entries)` — per category × FY × quarter, using the **one canonical** `auFyQuarter` (below).
- `categoryTotals`, `stripCost` (null cost for `role!=='admin'`).
- **New `deriveLeaveCost({from, to, costModel})`** — the fully-specified derived block (see below).
- **Drop** `chargeOutFromMargin`, `validateChargeUpSite`.

**Canonical FY helper (critique-endorsed reconciliation win).** Two implementations exist — `auFyQuarter` (`carpentryRoutes.mjs:1693`, label `"2025-26"`, has quarters) and `auFinancialYear` (`chargeUpService.mjs:88`, label `"2025/26"`, no quarters). Promote **`auFyQuarter`** into shared `server/lib/financialYear.mjs`; import it in carpentry, chargeUp, and the new internal service. One label format: `"2025-26"`.

**`deriveLeaveCost` — the specification a builder can implement directly:**
1. **Day source** = call/reuse the existing `/non-working-days` union (`workforceRoutes.mjs:2156-2177`) for `[from,to]`, yielding, per employee, the set of non-working dates from: per-employee RDO rows (with `leave_type`,`hours`), team RDO dates (fanned across employees active on each date, typed `'rdo'`, full standard day), and **read-expanded** RDO patterns (typed `'rdo'`).
2. **Subtract public-holiday dates** (`workforce_public_holidays`) from the set before costing (§5.3 rule 3).
3. **Per (employee, date):** `hours = row.hours ?? standardHours(employee)`; `rate = baseWage(employee)` (`true_hourly`/`employees.hourly_rate`, **not** loaded); flag `rate_missing` if null.
4. **Bucket** each costed day by `leave_type` → matching `internal_categories` label, and by `auFyQuarter(date)`.
5. Return rows on the **same category × FY × quarter axis** as the timesheet block, each marked `estimated:true` (critique E3 — the UI flags modelled rows).

**New `server/lib/internalCategoryRoutes.mjs`** — clone `chargeUpRoutes.mjs`, register in `dev-api.mjs` beside line 1042; all handlers fail soft via `isMissingTable` pre-migration:
- `GET /api/carpentry/jobs/:id/internal-categories` (list, `requireAuth`)
- `POST …/internal-categories` (admin/supervisor; `sort_order = max+10`)
- `PATCH /api/carpentry/internal-categories/:id` (label/notes/sortOrder/status — **no margin**)
- `DELETE /api/carpentry/internal-categories/:id` (soft-archive default, `?hard=1`)
- `GET /api/carpentry/internal-categories/:id/shifts` (lazy per-category shift detail)
- `GET …/internal-untagged` + `POST …/internal-assign` — retro-assign untagged internal hours. **The assign endpoint filters valid targets to `cost_source='timesheet'`** and rejects a `'leave'` target with 400 (critique B1 — prevents writing costed leave into the timesheet ledger).

**Extend `GET /api/carpentry/internal-cost-summary`** (`carpentryRoutes.mjs:1705`, admin/supervisor). This is a **structured rewrite, not a light extend** (critique G4), scoped carefully:
1. **BL-CHARGEUP element: unchanged shape** (critique A6) — the existing per-job payload for the charge-up standing job is preserved byte-compatibly.
2. **BL-INTERNAL element only:** add the `internal_category_id` dimension (`GROUP BY internal_category_id, fy, quarter`, join `internal_categories` for labels, keep `__untagged`), **then merge `deriveLeaveCost` output** onto the same category axis. Director-gate cost via `stripCost`. Each derived row carries `estimated:true` and any `rate_missing` flag.

**Extend `server/lib/workforceRoutes.mjs`** *(collision-heavy — FLAG each edit; add a BL-INTERNAL branch beside every BL-CHARGEUP branch)*:
- Add `INTERNAL_REFERENCE = "BL-INTERNAL"` beside `CHARGE_UP_REFERENCE` (`:20`) and `isInternalJob()` beside `isChargeUpJob()` (`:571`).
- `GET /api/worker/jobs/:id/subtasks` (`:2801-2843`): sibling block — if reference is BL-INTERNAL, load `internal_categories` where `status='active' AND cost_source='timesheet'`, return `internalCategories:[{id,label}]`.
- `POST /api/worker/timesheets` (`:2466-2605`): mirror the charge-up required-location block — require `internal_category_id` when the job has active timesheet-source categories; verify it **belongs to the job AND `cost_source='timesheet'`** (critique D1 — reject a stale/crafted `'leave'` id); set `row.internal_category_id` behind the column-exists guard.
- **Tag every office write path (critique B4):** worker POST, **mass-fill** (`:988`), **submit-on-behalf** (`:990-1062` — confirm whether one endpoint or two; tag both), and retro-assign. Anywhere today stamps `charge_up_job_id`, add the internal tag so office-entered hours don't fall to `__untagged`.
- **Both timesheet-detail read paths get the column (critique B2):** the office echo select (`:3045-3047`) **and** the *worker* `GET /api/worker/timesheets/:date` select — the PWA prefill reads the latter, a different path; without it the required-category guard blocks resubmit of an existing internal timesheet.
- Day-off approval (`:3801+`): write `leave_type` + `hours` onto the `workforce_employee_rdo_dates` rows and the `workforce_day_off_requests` row (from the new approvals selector).
- **New "Record sick day" endpoint** (§5.4/F2): admin/supervisor; writes a typed `workforce_employee_rdo_dates` row (`leave_type='sick'`, `hours`).

**`taskAudit.mjs:20` (critique B5) — decision: OUT of v1.** The audit echo currently mirrors `charge_up_job_id` for charge-out traceability; internal categories have no billing/audit consequence, so we deliberately do **not** add `internal_category_id` to the audit echo. Noted so a future reviewer knows it was a choice, not an omission.

**Allocation/planner gate (critique B7) — verified-inert requirement.** Deferring `workforce_allocations.internal_category_id` to v2 is safe **only if** `resolveAllocChargeUpSite`/`validateChargeUpSite` (`workforceRoutes.mjs:578-583`, `chargeUpService.mjs:130-139`) cannot fire for a BL-INTERNAL allocation. They are gated on `isChargeUpJob`; Phase 4 must **assert that gate excludes BL-INTERNAL** (a one-line check, not an assumption) before shipping.

**Reuse unchanged:** `getCostModel`/`loadedRate` (worked categories only), `computeCost`/`approveSingleTimesheet`, `apiResponse.mjs`, `requireAuth.mjs`. **Do NOT touch** the leave/RDO tables' role in `workforcePipelineRoutes.mjs:111-128` — capacity math stays intact and remains the shared day-source authority.

---

## 8. PWA changes (`src/pages/worker/WorkerLogHours.jsx` — frontend only, no hotspot edits)

Data-driven off `/subtasks`, exactly like Charge Up — no reference string leaks into the PWA.

1. State (`:61-62`): add `internalCategories`, `internalCategoryId` beside the charge-up pair.
2. Subtasks `useEffect` (`:150,154`): `setInternalCategories(j.internalCategories || [])`; clear in the non-carpentry branch.
3. Derived flag (`:164`): `const isInternal = selectedProject?.type === "carpentry" && internalCategories.length > 0;`.
4. Render (clone the Location block `:389-405`): a required **"Internal category *"** `<select>` bound to `internalCategoryId`.
5. Task-entry UI (`:411-461`): gate on `isInternal` — hide the category grid **and** the charge-up free-text button; show a single description-less **"+ Add hours"** seed (trimmed `addChargeUpTask`, `task_category:"other"`, no "What did you do?" — U3 gotcha #4).
6. Submit guard (`:270`): sits **alongside** the existing charge-up guard, not replacing it (critique D2) — `if (internalCategories.length > 0 && !internalCategoryId) { alert("Pick an internal category before submitting."); return; }`. (A job can't be both charge-up and internal, but both guards coexist safely.)
7. Submit body (`:286`, carpentry branch): add `internal_category_id: internalCategoryId || null`.
8. Edit/reset (`:118,375`): restore from `timesheet_entries[0].internal_category_id` (now populated by the patched **worker** detail read, step §7); clear on site change alongside `setChargeUpJobId("")`.

**Gotchas honoured:** native `<select>` (renders above the un-z-indexed sticky submit bar); `todayStr()`/`addDaysYmd`, never `toISOString().slice(0,10)` (AEST day-shift). No roster autofill for internal categories (leave/overhead aren't rostered like charge-up sites); `workforce_allocations` gets **no** `internal_category_id` in v1.

---

## 9. Module-by-module continuity (airtight)

**Workforce** — **CHANGES:** `isInternalJob` gate; `/subtasks` internal block; `internal_category_id` tagging on **all four** write paths (worker POST, mass-fill, submit-on-behalf, retro-assign); the new column added to **both** timesheet-detail read paths (worker + office); `leave_type`+`hours` capture on day-off approval (new selector) + the new "Record sick day" action. **STAYS:** cost computation, approval lifecycle, planner shading, capacity math — mig 119/124/139 tables stay dollar-free and remain the **single day-source authority** the derived block reads. **No double-count:** leave dollars are computed over the *same* rows the planner reads, never a second timesheet; public holidays subtracted; half-days honoured via the `hours` column.

**Carpentry** — **CHANGES:** new `internalCategoryRoutes.mjs`; `internal-cost-summary` rewritten (BL-INTERNAL element only) to per-category + merged derived-leave, BL-CHARGEUP element byte-preserved; `CarpentryJobDetail.jsx:2399` gains a second branch → `<InternalJobDetail>`. **STAYS:** all standard carpentry plumbing; BL-INTERNAL still routes through `/carpentry/:jobId`.

**PWA / worker app** — **CHANGES:** the 8-point `WorkerLogHours.jsx` picker branch; the worker timesheet-detail read now returns `internal_category_id` for prefill. **STAYS:** Site dropdown, submit path, cost pipeline, all charge-up behaviour. No new route.

**Financials** — **NO new surface.** Internal categories are overhead/downtime with no client, invoice, or margin; Finance is entirely `:jobId`-scoped client billing (`financeRoutes`/`jobFinanceRoutes`/`financeCCRoutes`) — wrong home. The report lives in Carpentry/Workforce. *Optional future:* surface the same numbers read-only on `GET /api/finance/portfolio/kpi-summary` by consuming the Carpentry route (additive, not required).

**Shared collision-hotspot files (all flagged):**
- `src/lib/constants.js` — **EDIT (FLAG):** add `export const INTERNAL_REFERENCE = "BL-INTERNAL";` beside `CHARGE_UP_REFERENCE` (`:880`) + a `LEAVE_TYPES` enum. Coordinate with the constants owner.
- `src/pages/CarpentryJobDetail.jsx` — **EDIT (FLAG):** one-line branch at `:2399`. Shared page, not one of the three named hotspots.
- `src/App.jsx` / `src/components/AppShell.jsx` — **NO EDIT.** BL-INTERNAL renders inline through the CarpentryJobDetail routing switch; no new top-level route/nav. (Only touch if Sam later wants a dedicated Workforce "Internal costs" nav entry — flag then.)

---

## 10. Reporting — internal cost by category by FY/quarter

- **Home:** new `src/pages/InternalJobDetail.jsx`, cloned from `ChargeUpJobDetail.jsx` with charge-out/margin columns deleted and a **quarter toggle added**. Rendered inside `CarpentryJobDetail` for `reference === INTERNAL_REFERENCE`, admin/supervisor + `can.accessCarpentry` gated.
- **Surfaces:** category KPI cards (hours + cost only); a "By financial year" table with quarter breakdown; a per-category row table (with `__untagged` + retro-assign UX cloned from `chargeUpRoutes.mjs:334-387`, **assign targets limited to worked categories**); and a per-category **Shifts-only** drill-in modal `InternalCategoryDetailModal.jsx` (critique B3 — the cloned modal's Tasks/Diary/Plans tabs are **removed**, not just "no margin line"; keeping them would call non-existent endpoints and 500).
- **Actual vs modelled clarity (critique E3):** ATEC/Logistics/Personal rows render as **booked**; Annual/Sick/RDO rows are visually flagged **"estimated"** (badge + footnote), since they're synthetic (`estimated:true` from the API). `rate_missing` rows show a warning chip, never a silent $0 (critique E4).
- **Data:** `GET /api/carpentry/internal-cost-summary` (§7) — timesheet-sourced + derived-leave on one axis.
- **AU FY:** Jul–Jun, canonical `auFyQuarter` (Q1 Jul–Sep … Q4 Apr–Jun), label `"2025-26"`. Cost is a wage figure — GST-irrelevant. Cost director-gated (`stripCost`); hours visible to supervisors.
- **Archive semantics for derived categories (critique F1):** a leave category has **no FK**, so archiving/deleting "RDO" would erase its historical line. Rule: **leave categories are soft-archive-only and still render historical periods** — the report resolves the label from the category if present, else falls back to a built-in `LEAVE_TYPES` label, so history survives even a hard delete. Hard-delete of a leave category is disabled in the UI.

---

## 11. Open decisions for Sam

1. ✅ **LOCKED (2026-09-03) — Leave derived, not logged.** Annual/Sick/RDO derived from the leave/RDO spine; only ATEC/Logistics/Personal are worker-logged.
2. ✅ **FULLY LOCKED (2026-09-03) — Per-category leave rate** (see §5.3 rule 4 + §5.5): **RDO = `break_even_hourly`** (super already inside); **Annual = `base_hourly × 1.175 × (1+SG)`**; **Sick = `base_hourly × (1+SG)`**.
   - **2a. RESOLVED — `base_hourly` EXCLUDES travel allowance** (Sam confirmed). So `base_hourly × 1.175` is a clean annual-leave base+loading with no travel.
   - **2b. RESOLVED — add employer super** to Annual + Sick (report = cost-to-business). SG per-FY (§5.5, default 12%). Residual accept-the-defaults in §5.5 (SG basis; super-on-loading = yes).
3. ✅ **LOCKED (2026-09-03) — All six built in one pass** (not worked-3-first). Two-track internally (worked = low-risk mirror; leave = test-first behind a review gate) but one delivery.
4. ✅ **LOCKED (2026-09-03) — Personal work open to all workers in v1** (matches today; optional worker-scoping in v2).
5. **`leave_type` history.** *Recommend: backfill existing leave/RDO to `'rdo'`; annual-vs-sick split is forward-only.* Confirm this is acceptable for prior-FY reporting.
6. **Sick-day capture.** *Recommend: a small admin "Record sick day" action writing a typed leave row.* Built here. Alt: workers request retroactively via day-off flow.
7. **Standard hours for derived cost.** *Recommend: per-employee standard hours (fallback 7.6), plus a `hours` column for half-days.* Confirm the source field.
8. **Ad-hoc categories / tasks-diary-plans / planner allocation tagging.** *Recommend: seed the fixed six (admin-add allowed, not prominent); skip tasks/diary/plans and the `site_tasks` XOR; defer `workforce_allocations.internal_category_id` to v2.*
9. **Public holidays.** *Recommend: EXCLUDE from this six-category report (stated), de-duped against leave/RDO.* Raise as an optional 7th derived line later if wanted.

---

## 12. Phased build steps

Each step is self-contained and sized for one build workflow.

**Phase 1 — Data + FY reconciliation.** Migs `200_internal_categories.sql` (table + tag + seed + RLS + self-contained trigger + parent-assert) and `201_leave_type_and_hours.sql` (typed columns + `hours` + rdo backfill; team RDO intentionally untouched). Promote `auFyQuarter` into shared `server/lib/financialYear.mjs`; repoint carpentry + chargeUp imports (`"2025-26"`). *Deliverable: migrations ready for Sam; FY helper unified. No behaviour change until applied.*

**Phase 2 — Backend service + CRUD routes.** New `internalCategoryService.mjs` (cost-only clone + `deriveLeaveCost` skeleton) + `internalCategoryRoutes.mjs` (list/create/patch/delete/shifts/untagged/assign with `cost_source='timesheet'` assign filter), registered in `dev-api.mjs`. Fail-soft pre-migration. *Deliverable: admin CRUD via API; retro-assign can't target leave.*

**Phase 3 — Report endpoint (the hard phase).** Rewrite `internal-cost-summary`: BL-INTERNAL element → per-category grouping + full `deriveLeaveCost` (team-RDO fan-out + per-employee typed rows + expanded patterns, minus public holidays, base wage × per-employee/`hours`, `estimated`/`rate_missing` flags, FY/quarter buckets), `stripCost` gated; BL-CHARGEUP element byte-preserved. *Deliverable: unified, correctly-costed cost-by-category-by-FY/quarter payload.*

**Phase 4 — Workforce ingest + leave capture.** In `workforceRoutes.mjs`: `INTERNAL_REFERENCE` + `isInternalJob`; `/subtasks` internal block; tag all four write paths (dual-guard, `cost_source='timesheet'` server check); add the column to **both** detail read paths; `leave_type`+`hours` on approval (new selector) + the "Record sick day" action; assert `resolveAllocChargeUpSite`/`validateChargeUpSite` stay inert for BL-INTERNAL. *Deliverable: internal hours land tagged; leave rows typed + houred.* **FLAG all edits (shared file).**

**Phase 5 — PWA picker.** The 8-point `WorkerLogHours.jsx` branch. *Deliverable: workers pick an internal category on BL-INTERNAL; prefill/resubmit works via the patched worker read path.*

**Phase 6 — Admin report UI.** `InternalJobDetail.jsx` + `InternalCategoryDetailModal.jsx` (**Shifts tab only**, no charge-out/margin, quarter toggle, untagged retro-assign, estimated/rate-missing badges, leave-category archive-safe labels). Add `INTERNAL_REFERENCE`+`LEAVE_TYPES` to `constants.js` and the branch to `CarpentryJobDetail.jsx:2399`. *Deliverable: the yearly/quarterly report screen.* **FLAG constants.js + CarpentryJobDetail.jsx edits.**

**Phase 7 — SOPs + tests.** SOP under `docs/sops/10_workforce/` (or `14_cost_intelligence/`) per CLAUDE.md SOP law, with a Section-14 test script covering: category CRUD; worker tag round-trip (incl. prefill/resubmit via worker read path); FY/quarter rollup; retro-assign rejecting a leave target; and the **no-double-count assertion** (a leave day appears in the derived block, never as a timesheet row; a half-day leave + half-day Logistics sums to one paid day; a PH-day leave is not double-costed). Unit-test `internalCategoryService` rollups **and `deriveLeaveCost`** (pure — feed it fixture leave rows across all three tables + a public holiday + a part-timer + a null-rate archived employee).

---

## 13. Build workflow shape (how the follow-up session runs)

The build is **two tracks with a hard dependency line**, because the critique's verdict is exact: the three worked categories are a clean Charge Up mirror and ship low-risk; the three leave categories are the genuine engineering and must not be rushed.

**Orchestration:** one session, a lead build agent, three specialist sub-agents dispatched by phase, a mandatory review gate before the leave logic is trusted, then a docs/test agent. Phases 1→7 are mostly sequential; the only safe parallelism is Track A vs the *back end* of Track B.

- **Phase 1 (lead, solo, first — blocks everything).** Migrations 200/201 + shared `financialYear.mjs`. Self-contained trigger and the team-RDO "no column" decision are load-bearing; get them right before any code depends on the schema. Output: migrations + a one-paragraph "apply me" note for Sam.

- **Track A — Worked categories (agent A, can run as soon as Phase 1 lands).** Phases 2 (CRUD + service skeleton), 4-worked-slice (the four tagging write paths + both read paths + PWA in Phase 5), 6-worked-slice (report UI for the three booked rows + retro-assign filtered to `timesheet`). This track is the low-risk Charge Up mirror; it can be built and even demoed against real timesheet data **before** the leave engine exists (leave rows simply show empty).

- **Track B — Leave engine (agent B, gated).** Phase 3's `deriveLeaveCost` is the crux and must be built **test-first** against fixtures (three-table union, team-RDO fan-out, pattern expansion, PH subtraction, base-wage rate, per-employee/half-day hours, terminated-employee flag). Phase 4's leave-capture slice (approval selector + "Record sick day" + `leave_type`/`hours` writes) feeds it. **Hard gate:** Track B does not merge into the report UI until a **review agent** verifies the five no-double-count invariants (§5.3) and the rate/hours decisions (§5.4) against the actual `/non-working-days` feed and cost model — this is where the draft was wrong, so it gets an explicit adversarial check, not a self-review.

- **Merge + Phase 6 leave slice (lead).** Once both tracks pass their gates, the report UI merges the two axes with the estimated/rate-missing badges and archive-safe labels. Re-run the review agent on the *combined* payload to confirm BL-CHARGEUP's element is byte-unchanged (critique A6 regression check).

- **Phase 7 (docs/test agent, last).** SOP + Section-14 script + the pure-function unit tests for both `internalCategoryService` and `deriveLeaveCost`. The no-double-count and half-day assertions are the acceptance criteria for calling the leave half "done".

**Collision discipline throughout:** every edit to `workforceRoutes.mjs`, `constants.js`, and `CarpentryJobDetail.jsx` is FLAGGED in the session log the moment it's made, since other agents own overlapping surfaces; the lead agent serializes those three files and never lets Track A and Track B write them concurrently. Migrations stay ≥200 and idempotent; nothing is applied to prod inside the build — the session ends with migrations staged and an apply-order note (200 then 201) for Sam.
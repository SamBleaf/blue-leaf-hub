# Blue Leaf Hub — Master Data Dictionary & Normalisation Plan

> Created: 2026-05-30
> Purpose: One authoritative cross-reference of every piece of information the Hub
> captures, which module owns it, where the same fact is duplicated under different
> names, and the phased plan to make all data **uniform, universal, linked, and
> stored against the job's address** — from the first Sales lead through to handover.
>
> **Companion docs (do not duplicate — this extends them at field level):**
> - `SOURCE_OF_TRUTH.md` — per-entity authoritative source (entity level)
> - `DATA_FLOW_MAP.md` — lifecycle flow narrative
> - `WHS_ENGINE_PLAN.md` — the job-facts layer (this generalises it to all modules)

---

## 0. Locked decisions (2026-05-30)

| Decision | Choice |
|---|---|
| Universal key | **`job_id` is the single spine.** Address is a *display attribute* of the job, normalised once. Every satellite references `job_id`/`project_id` — no independent address copies. Leads stamp onto the job at conversion; nothing is re-typed. |
| Carpentry island | **Link via `carpentry_jobs.job_id`** so carpentry rolls up with the main builder spine (costs, marketing, WHS, reporting) while staying its own record. |
| Deliverable | This reference doc + the phased normalisation plan below, **for sign-off before any code**. |

---

## 1. The record spine (verified against migrations 001–069)

```
CRM contact ──(referred_by / converted_lead_id / linked_job_id)──┐
                                                                  ▼
   LEAD ────────convert (jobs.lead_id)────────►   JOB   ──1:1──► PROJECT ──► operations/
 (Sales, 57 cols)                              (commercial    (execution,   portal/workforce
   site_address, email, phone, suburb,          37 cols)       25 cols)
   project_type, estimated_value, architect,    address +      job_id,
   wo_* (winning offer), ptsa_*, attribution    address_norm   accepted_trades
                                                 lead_id        portal_client_*
        │                                          │                │
        │            ┌── fee_proposals (address, client, totals, building_type)
        │            ├── project_metrics (45-col building-facts table)
        │            ├── financial_documents / progress_claims / job_variations / wipaa_reviews
        │            ├── cost_intelligence / normalized_costs / pretender_estimates
        │            └── marketing_content_items / reference_projects
        │
  CARPENTRY_JOB ◄── parallel island today (own address/client/contact/type/area,
   (25 cols)         buildexact_job_id is TEXT, NO job_id FK) → to be linked
```

- **`job_id`** is a FK in **28 tables**; **`project_id`** in **27 tables**. The spine is real and broad.
- **`jobs.lead_id`** already links back to Sales (migration 035). ✓
- Existing job-keyed stores that already serve "store against the job": **`job_knowledge`** (per-job `kind/content/data` bag, migration 013) and **`project_metrics`** (building facts, migration 032).

---

## 2. Information required across all modules (compiled I/O)

| Module | Consumes | Produces / owns |
|---|---|---|
| **Sales** | — | site_address, client name+email+phone, project_type, suburb, estimated_value, architect, qualify scores, budget, timeframe, attribution |
| **Tender / RFQ** | address, project_type, client, architect | fee proposal totals, building_type, **extraction facts** (storeys, areas, frame/roof/site), accepted trades, cost rates |
| **Job / Finance** | address, client, project_type, areas, contract_value | contract_value, budgets, actual costs, claims, variations, margin, WIPAA |
| **Operations** | job_id, address, accepted_trades | schedule, site diary, POs, WHS profile + risk-derived outputs |
| **Workforce** | project_id/job_id, trade tasks | timesheets, labour hours/cost by task category |
| **WHS** | building facts, site facts, trades, **address** | SWMS/permits/registers/toolbox/board, induction URL |
| **Marketing / CRM** | job_id, suburb, project_type, completed project, client | content, attribution, reference_projects, relationship score, past-client status |
| **Portal / Handover** | project_id, client contact, claims, milestones | portal updates, decisions, warranty, finishes, NPS |

---

## 3. Master cross-reference — one concept, many names

Each row is **one real-world fact** currently stored under different names across modules.
"Owner (target)" is the single authoritative home under the locked decisions.

| Canonical concept | Owner (target) | Stored today as | Status / drift |
|---|---|---|---|
| **Site address** ⭐ | `jobs.address` (+ `address_normalised/suburb/state/postcode`) | `leads.site_address`, `projects.address`, `fee_proposals.address`, `buildexact_estimates.address`, `carpentry_jobs.address`, `job_knowledge.address` | jobs↔projects synced (trigger 036). Normalised cols exist (mig 040) but **unwired & unpopulated**. Other copies free-text. |
| **Client identity** | `jobs.client_name` (+ crm link) | `leads.first_name+last_name`, `jobs.client_name`, `fee_proposals.client_name`, `buildexact_estimates.client_name`, `carpentry_jobs.client_name`, `site_walks.client_name`, `crm_contacts.first/last` | re-keyed per stage |
| **Client contact** (email/phone) | `jobs.client_email/phone` *(to add)* | `leads.email/phone`, `projects.portal_client_email`, `carpentry_jobs.client_email/phone`, `crm_contacts.email/phone` | **fragmented across 4 tables; not on jobs** |
| **Suburb** | `jobs.address_suburb` *(exists, unpopulated)* | `leads.suburb`, `crm_contacts.suburb`, `reference_projects.suburb` | not derived onto jobs yet |
| **Project type** | one enum in `constants.js` | `leads.project_type`, `jobs.project_type` (free text), `project_metrics.project_type`, `fee_proposals.building_type`, `carpentry_jobs.project_type`, `rfq_packages.project_type`, `crm_contacts.project_type`, `cost_benchmarks/pretender` | **~6 vocabularies** for one concept |
| **Architect** | `jobs.architect_name` | `leads.architect_name`, `jobs.architect_name`, `fee_proposals.architect_name` | re-keyed |
| **Building facts** (storeys, areas, frame/roof/slope/BAL) | `project_metrics` | `jobs.storeys/floor_area_m2/slab_area_m2/roof_area_m2`, `cost_intelligence`, `pretender_estimates`, `carpentry_jobs`, `reference_projects`, **`projects.project_metrics` jsonb** | multiple copies; projects has a rogue jsonb mirror |
| **Contract / value** | `jobs.contract_value` + `original_contract_value` | `leads.estimated_value` → `fee_proposals.net_total/total_inc_gst` → `jobs.contract_value` → `wipaa_reviews.contract_value`, **`projects.contract_value`** | value re-keyed each stage; `projects.contract_value` duplicates the canonical `jobs.contract_value` |
| **Buildexact job id** | `jobs.buildexact_job_id` | `jobs`, `projects`, `carpentry_jobs` (text) | no enforced sync (noted in SOURCE_OF_TRUTH) |
| **Trade taxonomy** | `trade_categories` | `subcontractors.trade`, `rfqs.trade`, `cost_intelligence.trade`, `purchase_orders.trade`, `employees.trade`, `swms_templates.trade`, RFQ trade keys, workforce task categories | several parallel lists |

⭐ = the join key everything must tie to.

---

## 4. Structural findings (what blocks "universal" today)

1. **Canonical address is half-built.** Migration 040 added `address_normalised/suburb/state/postcode/is_duplicate_of` + index to `jobs`, but **no code reads or writes them** and the backfill only lowercased `address` (suburb/postcode never parsed). The pieces exist; they're not wired.
2. **`carpentry_jobs` is an island** — duplicates the spine (address/client/type/area) with no `job_id`. Excluded from all cross-module rollups.
3. **Client contact is fragmented across 4 tables** — `leads`, `projects.portal_client_email`, `carpentry_jobs`, `crm_contacts` — and **not on `jobs`**, the spine. Portal/claims/variations email the client from whichever copy is handy.
4. **`project_type` has ~6 vocabularies** → no clean cross-module reporting.
5. **`projects` carries duplicates** — `projects.contract_value` (vs canonical `jobs.contract_value`) and a `projects.project_metrics` jsonb (vs the `project_metrics` table). Both are drift.
6. **Value is re-keyed** lead → proposal → job with no automatic carry → the three never reconcile without manual effort.

---

## 5. Canonical owners registry (the target state)

| Concept | Single owner | Source-of-first-capture | Read by |
|---|---|---|---|
| Address (raw + normalised + suburb/state/postcode) | `jobs` | Sales lead → stamped at conversion; standardised on write | every module via Job Profile |
| Client name + email + phone | `jobs` (+ `crm_contacts` bridge) | Sales lead | portal, claims, variations, marketing |
| Project type (enum) | `jobs.project_type` | Sales lead (mapped to enum) | tender, cost intel, WHS, marketing, reporting |
| Architect | `jobs.architect_name` | Sales / extraction | fee proposal, WHS, marketing |
| Building facts | `project_metrics` | RFQ extraction / manual / Buildxact | cost intel, WHS, pretender, carpentry |
| Contract value | `jobs.contract_value` / `original_contract_value` | fee proposal accept → win | finance, WIPAA, portal, projects |
| Trade taxonomy | `trade_categories` | seed | RFQ, finance, cost intel, workforce, WHS |
| Per-job knowledge (free) | `job_knowledge` | any stage | any module |

**Read layer:** a single server accessor **`getJobProfile(jobId)`** assembles `jobs` + `project_metrics` + `job_knowledge` (+ derived address parts) and returns every canonical fact **with provenance** (`source`, `confidence`, `status`). Modules read the Profile; they never keep their own copy.

---

## 6. Phased normalisation plan (for sign-off — no code yet)

> Each phase: what already exists → what to add → backfill → risk. Ordered low-risk-first.
> SOURCE_OF_TRUTH.md is updated as each phase lands.

### Phase 0 — Job Profile read layer (non-disruptive)
- Build `getJobProfile(jobId)` accessor + a `jobFactRegistry` (canonical concept → owner column → consumers). No schema change to writers.
- Modules begin **reading** from the Profile incrementally. Lowest risk; immediate value; enables everything else.

### Phase 1 — Address as canonical identity (wire the half-built infra)
- Existing: `jobs.address_normalised/suburb/state/postcode/is_duplicate_of` (mig 040) + index.
- Add: a proper normaliser (expand abbreviations, parse suburb/state/postcode, optional geocode) run on job create/update; populate `address_suburb`/`postcode`; dedupe via `is_duplicate_of`.
- Make `jobs.address_normalised` the **match key**. Extend so `fee_proposals` / `buildexact_estimates` / `carpentry_jobs` read job address (projects already synced via trigger 036).
- Backfill: standardise existing addresses; link orphan records by normalised match.

### Phase 2 — Client identity + contact on the job
- Add `jobs.client_email`, `jobs.client_phone` (suburb already exists as `address_suburb`).
- Lead→job conversion **stamps** name/email/phone/suburb/project_type/architect/estimated_value onto the job.
- Reconcile `projects.portal_client_email` + `carpentry_jobs.client_email` + `crm_contacts` to read the job as source; use existing `crm_contacts.linked_job_id` bridge.
- Backfill from `leads` where `jobs.lead_id` is set.

### Phase 3 — One `project_type` enum
- Define canonical enum in `constants.js` + a mapping layer (e.g. "new build" → `new_home`).
- Converge `jobs`, `leads`, `carpentry_jobs`, `project_metrics`, `fee_proposals.building_type`, `crm_contacts`, `rfq_packages`. Writers map on input; readers get the enum.

### Phase 4 — Building facts unified on `project_metrics` (aligns with WHS_ENGINE_PLAN Phase 1)
- `project_metrics` is canonical (+ provenance). Extraction + WHS + cost intel read it.
- Deprecate `projects.project_metrics` jsonb; make `jobs.floor_area_m2`/areas mirrors of the table.

### Phase 5 — Carpentry de-island
- Add `carpentry_jobs.job_id` FK (nullable for standalone subsidiary work).
- Backfill links by normalised-address match where a builder job exists.
- Carpentry costs/marketing/WHS roll up via `job_id`.

### Phase 6 — Value carry-through
- Auto-carry `leads.estimated_value` → accepted `fee_proposal` total → `jobs.original_contract_value` at each transition, with a reconciliation view.
- Make `projects.contract_value` read `jobs.contract_value` (drop the independent copy).

### Phase 7 — Trade taxonomy convergence
- `trade_categories` canonical; map `subcontractors.trade`, RFQ trade keys, `employees.trade`, workforce task categories to it.

### Cross-cutting — provenance
- Every canonical fact carries `source` / `confidence` / `status` (`extracted_applied` ≥0.90 / `extracted_flagged` / `confirmed` / `manual`), per the WHS job-facts decision.

---

## 7. Recommended order & open questions

**Order:** Phase 0 → 1 → 2 → 4 → 3 → 5 → 6 → 7 (read layer first; address + client highest value/lowest risk; building facts align with the in-flight WHS work).

**Open questions for sign-off:**
1. Standalone carpentry jobs (no builder parent) — give them their own `jobs` row, or leave `carpentry_jobs.job_id` nullable?
2. Address geocoding — use a provider (Google/Mapbox) for normalisation+dedupe, or rule-based normaliser only (no external dependency)?
3. `project_type` canonical vocabulary — adopt the CRM set (`new_home/renovation/extension/knockdown_rebuild`) as the standard?

**Dependency:** every project must have `job_id` set (extraction writes to `jobs`; WHS/operations read via the project bridge).

---

## 8. Maintenance
- This doc is the field-level cross-reference. `SOURCE_OF_TRUTH.md` remains the entity-level authority — update both together when a canonical owner changes.
- When a new table/field is added, check §3: is it a new concept, or a copy of an existing canonical fact? If a copy, reference the owner instead.

---
---

# PART 2 — Universal Fact Registry v1

> Approach: **Blue Leaf Hub knows facts; modules consume facts; no module owns a fact.**
> Pre-data, so the foundation is built properly now. Store = `project_metrics` (typed columns)
> + `job_fact_history` (versioned changes) + provenance. The RFQ extractor is renamed
> conceptually to **Project Intelligence Extraction**: one extraction per project feeds every
> module; RFQ is just one consumer.

## 9. The three data types (different handling)

| Type | Behaviour | Examples | Storage rule |
|---|---|---|---|
| **Static** | Set once, rarely changes; a change is a notable event | address, storeys, frame_type, site_slope, BAL | typed column + provenance; log change to history |
| **Versioned** | Legitimately changes over time; needs a full audit trail | contract_value, client details, architect, status, project_type | typed column + **every change written to `job_fact_history`** with source + reason |
| **Generated** | Never entered by a human — a *function* of other facts | forecast_margin, HRCW list, WHS hazards, risk_rating, claimed/paid value | **not stored as editable**; computed by a named function; dependents marked **stale** on input change, recomputed on read |

The cardinal rule: **a Generated fact is never typed in.** If a human can edit it, it isn't Generated.

## 10. The 8 fact families

1. **Project Identity** — project_id, job_id (canonical key), address (+ normalised/suburb/state/postcode), client_name, project_name, status
2. **Project Facts** — the building/site characteristics (storeys, areas, frame/roof/cladding/foundation, slab/basement/retaining, BAL, energy, slope, height, age, demolition, structural steel, pool/lift/solar/battery/tank, overlays)
3. **Project Relationships** — architect, engineer, building surveyor, client contact, subcontractors, suppliers
4. **Project Documents** — architecturals, engineering, specification, geotech, survey, BAL report, energy report, contracts, variations (each is a *fact source*)
5. **Project Metrics** — contract_value, original_contract_value, budget, actual_costs, forecast_margin, claimed_value, paid_value
6. **Project Risks** — risk_rating, HRCW list, WHS hazards (all Generated)
7. **Business Intelligence** — target_margin, client_quality_score, build_complexity, tender_success_pct, lead_source, project_type_group (Generated/assigned)
8. **Site Intelligence** — nearest hospital/medical (address lookup), powerlines/services/adjacent road/trees (survey), parking/skip/amenities (site knowledge, manual)

## 11. Universal Fact Registry (v1 — representative; full set lives in `jobFactRegistry.mjs`)

Per-fact attribute schema: `canonical_name · family · type · first_creator · source_doc · extraction_method · update_method · versioned · editable · approval · derived · consumers · validation`.
Condensed view (key columns):

| Canonical fact | Family | Type | First creator | Source doc | Consumers | Ver. | Edit | Appr. |
|---|---|---|---|---|---|---|---|---|
| `job_id` | Identity | Static | System | — (job create) | ALL | N | N | N |
| `address` | Identity | Versioned | Sales | Lead form | ALL | Y | Y | N |
| `client_name` | Identity | Versioned | Sales | Lead form | finance, portal, mktg | Y | Y | N |
| `client_email` / `client_phone` | Relationships | Versioned | Sales | Lead form | portal, claims, variations | Y | Y | N |
| `project_type` | Facts | Versioned | Sales | Lead form (enum) | all + reporting | Y | Y | N |
| `storeys` | Facts | Static | **Project Intelligence Extraction** | Architecturals/Eng | WHS, schedule, cost, RFQ, portal, mktg | N | Y(confirm) | Y |
| `floor_area_m2` | Facts | Static | Extraction | Architecturals | cost, RFQ, fee proposal, carpentry | N | Y | Y |
| `roof_area_m2` | Facts | Static | Extraction | Roof plan | cost, RFQ, roof plumber | N | Y | Y |
| `frame_type` | Facts | Static | Extraction | Engineering | WHS, RFQ, cost | N | Y | Y |
| `roof_structure_type` | Facts | Static | Extraction | Roof plan | WHS, RFQ | N | Y | Y |
| `has_suspended_slab` | Facts | Static | Extraction | Structural | WHS (HRCW), cost | N | Y | Y |
| `has_retaining_walls` | Facts | Static | Extraction | Site plan/civil | WHS, cost | N | Y | Y |
| `site_slope` | Facts | Static | Extraction | Site plan/classification | WHS, cost benchmarks | N | Y | Y |
| `bal_rating` | Facts | Static | Extraction | BAL report | WHS, RFQ, compliance | N | Y | Y |
| `architect` | Relationships | Versioned | Sales/extraction | Lead / title block | fee proposal, WHS, mktg | Y | Y | N |
| `contract_value` | Metrics | Versioned | Fee proposal accepted | Tender | finance, WIPAA, portal, projects | Y | Y(controlled) | Y |
| `original_contract_value` | Metrics | Static | Win | Tender | finance, margin | N | N | N |
| `actual_costs` | Metrics | **Generated** | Invoice processing | Supplier invoices | finance, margin, cost intel | — | N | — |
| `labour_cost` | Metrics | **Generated** | Time tracker | Employee entries | finance, carpentry | — | N | — |
| `forecast_margin` | Metrics | **Generated** | Derived | — | finance, director portfolio | — | N | — |
| `HRCW list` | Risks | **Generated** | Derived (whsRiskRules) | Building facts | WHS docs | — | N | — |
| `risk_rating` | Risks | **Generated** | Derived | facts + history | director, WHS | — | N | — |
| `expected_duration_crew_days` | Schedule | **Generated** | Derived (scheduleIntelligence) | labour hours + crew + comparable-job history | workforce pipeline, director | — | N | — |
| `expected_completion_date` | Schedule | **Generated** | Derived (scheduleIntelligence) | expected duration + inter-stage gaps + calendar | workforce pipeline | — | N | — |
| `break_even_allowance_days` | Schedule | **Generated** | Derived (scheduleIntelligence) | labour value ÷ team break-even rate × headcount/crew | workforce pipeline, margin | — | N | — |
| `schedule_margin_risk` | Schedule | **Generated** | Derived (scheduleIntelligence) | expected productive crew-days > break-even allowance | workforce pipeline, director | — | N | — |
| `carpentry_stage_planned_start` / `_end` | Schedule | Versioned | Auto-layout (budget-driven), then edited by drag | `carpentry_job_stage_schedule` (mig 144); stage = budget subsection, duration from labour value ÷ team rate | workforce pipeline calendar, carpentry Schedule tab | Y | Y | N |
| `carpentry_stage_actual_start` / `_end` | Schedule | **Generated** | Derived (timesheets by task_category) | approved `timesheet_entries` | workforce pipeline calendar | — | N | — |
| `charge_up_job_id` (on timesheet_entries) | Labour | Static (per entry) | Worker submit (PWA Location pick) | `charge_up_jobs` (mig 145); the BLB Charge Up site the hour was worked at | charge-up analytics + invoicing | N | N | N |
| `charge_up_job_id` (on workforce_allocations) | Labour | Static (per allocation) | Planner assign (site picker) | `charge_up_jobs` (mig 146, ON DELETE SET NULL); the BLB Charge Up site a shift is planned at | Planner shift label + crew visibility | N | N | N |
| `canonical_key` (on timesheet_entries) | Labour | Static (per entry) | Worker submit (PWA sub-task pick, required) | `carpentry_budget_line_items.canonical_key` (mig 147); the budget SUB-TASK an hour was worked on. Sub-task identity = (task_category, canonical_key) — the single spine shared by budget, schedule, PWA | per-sub-task actual + earned value (budget) | N | N | N |
| `crew_size` (on carpentry_job_stage_schedule) | Schedule | Versioned (editable per category) | Schedule tab (Workers cell); default from CREW_DEFAULTS | mig 148; the number of workers on a labour category. Duration = ceil(labour_sell/team_charge_up_per_day × headcount/crew_size). Persists through re-auto-layout | stage duration / planned_end (generated) | N | N | N |
| `target_margin` | BI | Versioned | Assigned | — | finance, pretender | Y | Y | Y |
| `lead_source` | BI | Static | Sales/marketing | Lead form / attribution | marketing, reporting | N | Y | N |
| `nearest_hospital` | Site Intel | Static | **Lookup** | Address geocode | WHS emergency | N | Y | N |
| `site_induction_url` | Site Intel | Static | System | Project creation | WHS, inductions | N | N | N |

(Facts like pool/lift/solar/battery/tank, overlays, building_height, site_coverage, foundation_type, wall/roof cladding are **registered now** with consumers TBD, and **wired to extraction only when a module needs them.**)

## 12. Fact Creation Matrix (what *creates* each fact — where the write code lives)

| Fact | First created by | Source event/document |
|---|---|---|
| Address, Client, Project type, Lead source | **Sales** | Lead form |
| Storeys, Floor/Roof area, Frame/Roof type, Slab, Retaining, Slope, BAL | **Project Intelligence Extraction** | Architecturals / Engineering / Roof plan / BAL report |
| Contract value | **Fee proposal accepted** | Tender |
| Actual cost | **Invoice processing** | Supplier invoice |
| Labour cost | **Time tracker** | Employee timesheet |
| HRCW, WHS hazards, Forecast margin, Risk rating | **Derived** | Building facts + metrics |
| Site induction URL | **System** | Project creation |
| Nearest hospital/medical | **Lookup** | Address geocode |

## 13. Fact lifecycle

```
Created (source + confidence)  →  Confirmed (human accept, for approval facts)
   →  Consumed (read by modules via getJobProfile)
   →  Updated (new source / revision → write job_fact_history, mark dependents STALE)
   →  Archived (job closed → facts locked, is_final)
```

- **Approval facts** (storeys, areas, frame/roof, BAL, etc.): confidence ≥ 0.90 auto-applied; < 0.90 flagged. Either way they render with **source + confidence + [Confirm] [Override]**.
- **Updated**: when a Static/Versioned input changes, every **Generated** dependent is marked `stale` and recomputed on next read (no message bus — a `stale` flag, like WHS `is_stale` already does).
- **`job_fact_history`** row written for every change to a Versioned fact (and logged for Static): `job_id, fact_key, old_value, new_value, source, source_doc, confidence, reason, changed_by, changed_at`.

## 14. Foundation sprint — build order (modules paused)

1. **`jobFactRegistry.mjs`** — the registry config (the §11 table, full attribute set). Single naming authority.
2. **Migration** — extend `project_metrics` with the missing Project-Facts columns (frame_type, roof_structure_type, has_basement, has_structural_steel, has_demolition, building_age, foundation_type, wall/roof cladding, overlays, pool/lift/solar/etc.) + `fact_provenance jsonb`; create **`job_fact_history`**.
3. **Facts service (write-at-source)** — `setFact(jobId, key, value, {source, confidence})` → typed column + provenance + history; enforces type rules (rejects writes to Generated facts).
4. **`getJobProfile(jobId)`** — assembles Identity + Facts + Relationships + Metrics + Generated (recompute-on-read) with provenance. The one read API.
5. **Confirm/Override component** — the provenance UI, reused everywhere.
6. **First two consumers** — WHS m0 + Project Intelligence Extraction read/write via the facts service. Then migrate Schedule, Finance, Cost Intelligence, Portal, Marketing one at a time.

## 15. Canonical Data Law (mirrored into CLAUDE.md)

> 1. Facts belong to the project, not the module. Before adding a column, check the Registry — if the fact exists, **read it via `getJobProfile`**; never copy it.
> 2. A new fact must be **registered first** (name, type, creator, source, consumers, lifecycle, audit).
> 3. **Generated facts are never stored as editable** — derive via a named function; mark dependents stale on input change.
> 4. **Versioned facts write to `job_fact_history`** on change (source + reason).
> 5. All writes go through the facts service, which stamps provenance (source, confidence, status).
> 6. Everything keys to `job_id`; address is a normalised attribute of the job, never re-stored elsewhere.

---
---

# PART 3 — Module Interaction Audit (verified against code, 2026-05-30)

> Five deep code reads across every cluster (Sales/CRM/Blueprint · Tender/RFQ/Cost/Procurement ·
> Operations/Schedule/Diary/WHS · Finance/Variations/Claims/Workforce · Portal/Marketing/MI/SOP).
> This is the "how everything interacts" map + the duplicate/conflict/missing audits, and it
> revises some earlier decisions.

## 16. Verified spine + the forked/broken edges

**Spine:** `leads` → (UI-driven conversion) → `jobs` → (win-finalize creates) → `projects` → operations/portal/workforce. `projects.job_id` is the only bridge; the job↔project hop is made ad-hoc per request.

| Edge | Reality | Problem |
|---|---|---|
| lead → job | `LeadDetail.jsx createJobFromLead()` (UI, not API) copies site_address→address, first+last→client_name, project_type | **Lossy re-type**: estimated_value, floor_area_estimate, design_stage, budgets, discovery fields NOT carried |
| contact → lead | `crmRoutes /convert` inserts a `leads` row | crm_contacts + leads are near-duplicate identity tables; `budget_range` enum dropped |
| transcript → lead | `POST /conversations` flattens AI suggestions onto `leads` | **2nd writer of canonical lead facts**, no provenance — AI can overwrite human entry |
| RFQ extract → job | client-side `persistJobFromExtraction` → `jobs` cols + `jobs.extracted_data` + `rfq_packages.extraction_data` | Stateless extractor; building facts land in jobs + JSON, **not project_metrics** |
| fee proposal → job | `resolveJobIdByAddress` (fuzzy address, not job_id) | Address mismatch forks/spawns a job |
| win-finalize → project + cost_intelligence | `module4Routes:296` creates `projects`, sets `jobs.status='won'`, **inserts `cost_intelligence` copying job areas/storeys/type** | **3rd building-facts write path**; **never sets `jobs.contract_value`** |
| Cost Intel plan-PDF → project_metrics(table) | `costIntelligenceRoutes:152` | 2nd building-facts writer; `/sync` coalesces jobs vs cost_intelligence "last sync wins", no provenance |
| schedule generate | reads `projects.accepted_trades` + Buildexact only | **Ignores project_type/storeys/project_metrics**; 50-row hardcoded template |
| WHS Module 0 prefill | reads `jobs.project_type`/`storeys` | **Does NOT read `project_metrics` table** (the richer source); re-asks storeys/retaining/slab/slope |
| WHS derivation → project_swms | — | **No writer**: induction reads `project_swms`, WHS engine never inserts it. Broken. |
| portal | keyed to `project_id`; hand-typed `projects.portal_client_email` | Claims/variations/milestones **re-entered**, disconnected from finance/schedule |
| marketing content | `job_id`/`project_id`/`lead_id` columns exist | **Orphan** — bulk-save never sets them |
| enquiry form → lead | `POST /api/public/enquiry` inserts `leads` + attribution | First creator (parallel to manual + transcript writers) |

## 17. Duplicate & Conflict Audit (E)

| Fact | Copies (table.column) | Conflict | Resolution |
|---|---|---|---|
| **Building facts** (storeys, floor/roof area) | `jobs`, **`project_metrics` table**, **`projects.project_metrics` jsonb**, `cost_intelligence`, `pretender_estimates` | 3 independent write paths, no reconciliation, "last sync wins" | One store = `project_metrics` table via facts service; **resolve the table-vs-jsonb name collision first** |
| **contract_value** | `jobs.contract_value` (034 trigger **stores** it) **vs** every KPI route **recomputes live & distrusts stored**; `projects.contract_value`; `wipaa_reviews.contract_value` | Trigger and live JS maintained in parallel; routes say "never trust jobs.contract_value" | Make it **Generated** (single recompute) — drop the trigger **or** drop the recompute, not both |
| **Client identity+contact** | `leads`, `crm_contacts`, `jobs.client_name`, `jobs.portal_client_email` (read by jobFinance), `projects.portal_client_name/email` | 4 copies, no sync, re-typed at every boundary | Canonical on job (client_name+email+phone); others read it |
| **Trade taxonomy** | `trade_categories` (FK) **vs** free-text `rfqs.trade`, `subcontractors.trade`, `purchase_orders.trade`, `cost_intelligence.trade` **vs** workforce `task_category` enum **vs** Buildexact names (fuzzy-matched) | 3+ vocabularies; FK migration 043 only reached 2 tables | `trade_categories` canonical; add FK everywhere; map workforce + Buildexact |
| **address** | `jobs` (+ normalised cols), `projects`, `fee_proposals`, `buildexact_estimates`, `carpentry_jobs`, `job_knowledge` | One-way sync (jobs→projects) only; fuzzy match elsewhere | job_id key; address normalised on job |
| **claims** | `progress_claims` (finance) vs `portal_claims` (portal) | **Zero cross-writes** — re-entered | Portal reads finance claims |
| **variations** | `job_variations` (finance) vs `portal_decisions` type=variation | Separate records; portal budget sums its own | Portal reads finance variations |
| **start date** | `jobs.won_at`, `projects.commencement_date`, `projects.tentative_start_date` | 3 overlapping "start" facts | Define distinct canonical roles |
| **labour cost** | `timesheet_entries.cost_amount` (by `task_category`) never mapped to `trade_category_id` | Labour never lands in per-trade `budget_vs_actual` | Map task_category → trade_category |

## 18. Critical prerequisites (active bugs/landmines — fix BEFORE the SSOT foundation)

These aren't just duplication; they'll corrupt the foundation if built on top of.

1. **Finance triple-route shadowing** (`dev-api.mjs:774-776`): `financeRoutes` + `financeCCRoutes` + `jobFinanceRoutes` define the same endpoints; Express serves first-registered → **`jobFinanceRoutes` is dead code**, WIPAA logic differs by endpoint, and the in-code comment claiming CC registers last is **wrong**. Collapse to one finance module first.
2. **`project_metrics` name collision**: a job-keyed **table** (032, Cost Intelligence) AND a `projects.project_metrics` **jsonb column** (015, Buildexact) — same name, two stores, divergent writers, neither read by WHS/Schedule. Must resolve before making the table the canonical store.
3. **Broken value chain**: win-finalize sets `status='won'` but **never writes `jobs.contract_value`**; it's only computed in Finance CC from `original_contract_value` + signed variations, which nothing populates at win. A won job has no contract value until someone PATCHes it.
4. **`project_swms` has no writer**: WHS engine derives `applicable_swms` but never inserts `project_swms`; induction reads `project_swms`. Disconnected.
5. **`slab_area_m2`/`roof_area_m2`** written by `extractionJobFields` from keys the extraction prompt **never emits** → silently null every time.
6. **Phantom `lead_qualifying_scores`**: referenced in CLAUDE.md + 5 `agent_knowledge` docs but **never created**; qualifying scores are columns on `leads`. The SSOT docs are wrong — fix them.

## 19. Missing Data / broken carries (F)

- **Value chain doesn't carry**: `leads.estimated_value` → `fee_proposals.total_inc_gst`/`buildexact_estimates.estimate_total` → `jobs.original_contract_value` is not wired.
- **Lead→job conversion is lossy**: discovery fields, budgets, floor_area_estimate, design_stage left behind.
- **Client contact never reaches the spine** in a canonical way (scattered across 4 tables).
- **`building_specs`** (roof_type, glazing, energy_rating) trapped in `jobs.extracted_data` JSON — never promoted to typed columns, while Cost Intel separately re-derives roof_type/wall_type.
- **Labour actuals** never reach per-trade `budget_vs_actual` (taxonomy gap).
- **reference_projects** hand-entered, not auto-sourced from completed jobs.

## 20. Revised architecture decisions (changed by the audit)

- **Canonical building-facts store = `project_metrics` TABLE** — but first **retire `projects.project_metrics` jsonb** and route all 3 write paths (RFQ extract, Cost Intel plan extract, win-finalize→cost_intelligence) through the facts service into the table. Deprecate the `jobs`/`cost_intelligence`/`pretender_estimates` building-fact copies (read from `getJobProfile`).
- **`contract_value` is a Generated fact** (`original_contract_value` + SUM signed variations), surfaced via `getJobProfile`. Pick ONE mechanism (recommend: drop the 034 trigger, keep the single recompute) and delete the other.
- **Value chain carry** becomes a facts-service responsibility at each stage transition.
- **Client identity/contact canonical on the job**; portal/leads/crm read it; wire `crm_contacts.linked_job_id`.
- **One trade taxonomy** (`trade_categories`) with FK added to rfqs/subcontractors/purchase_orders/cost_intelligence + workforce task mapping.
- **Lead→job conversion moves to the API** and stamps ALL canonical facts (stop the lossy UI re-type).
- **WHS reads `project_metrics` via `getJobProfile`**, and its derivation writes `project_swms`.

## 21. Revised roadmap (Phase −1 added)

- **Phase −1 — Prerequisite cleanup (do FIRST; mostly deletion/consolidation, low risk, pre-data):** collapse the three finance route files into one; resolve the `project_metrics` table-vs-jsonb collision; decide `contract_value` stored-vs-generated and delete the loser; connect WHS→`project_swms`; fix the phantom-table references in CLAUDE.md + agent_knowledge docs.
- **Phase 0 — Foundation:** registry + `project_metrics` extension + `job_fact_history` + facts service + `getJobProfile` + Confirm/Override (as §14).
- **Phase 1+ — Migrate consumers** one at a time, now routed correctly: building-facts writers → facts service; lead→job carry; WHS m0; value chain; trade-taxonomy FK; portal reads finance.

---
---

# PART 4 — Knowledge Core, Registries & Confirmation Policy (2026-05-30)

> Integrates the external review (Events, Documents, Dependency Matrix) with the code-grounded
> audit. Supersedes the roadmap in §21.

## 22. Confirmation policy — consequence-tiered (LOCKED)

A fact does **not** auto-become canonical based on confidence alone. The gate is **consequence of being wrong**, not a flat threshold:

| Tier | Rule | Test |
|---|---|---|
| **🔴 Consequential** | **Always require human confirmation** (even at 99%) | Could a wrong value cause **physical/legal harm, lost income, or a client dispute**? → safety (WHS), money (contract/claims/variations), client-facing documents, compliance |
| **🟢 Internal** | **Auto-apply at ≥ 0.90 confidence**; flag below | Internal estimating / benchmarking / marketing metadata — a wrong value is low-impact and easily corrected |

The tier of each fact is set in the Registry and is driven by the Dependency Matrix (§26). Every fact — auto-applied or confirmed — still renders with **source · confidence · status** and a one-click override.

## 23. The Project Knowledge Core = Facts + Events + Documents

These are not three subsystems — they are one chain. Seeing that is the architecture:

```
Architect uploads Rev 4        → DOCUMENT (job_documents, version++, supersedes Rev 3)
   → emits EVENT (document.uploaded)
   → Project Intelligence Engine re-extracts
   → FACT change: storeys 2 → 3   (project_metrics + job_fact_history)
   → emits EVENT (fact.changed, fact=storeys)
   → dependents (WHS, schedule, cost) marked STALE → recompute on read
```

- **Facts** = current canonical state (the Registry; stored on `project_metrics`/`jobs` + `fact_provenance`).
- **Events** = how state changed (the log; powers feeds, notifications, AI summaries, audit, and the stale/recompute trigger).
- **Documents** = where facts came from (provenance `source` = a `document_id` + version).

## 24. Event Registry — `job_events`

Today there are ~8 **fragmented, module-private** logs: `lead_activities`, `financial_approvals`, `email_delivery_events`, `trade_communication_log`, `buildexact_webhook_events`, `job_budget_history`, `crm_interactions`, `ai_call_log`. Unify the business-significant ones into one job-keyed stream.

```
job_events(
  id, job_id, event_type, occurred_at, actor_id, source,   -- source: manual|extraction|system|buildexact|resend
  entity_type, entity_id,        -- the thing affected (claim, variation, document, fact...)
  metadata jsonb
)
```

Core `event_type`s: lead.created/qualified, meeting.held, document.uploaded, fact.changed, rfq.sent, quote.received, quote.awarded, contract.signed, variation.signed, invoice.approved, claim.issued, claim.paid, diary.created, milestone.reached, practical_completion.

Migration approach: new events write to `job_events`; legacy logs are **left in place** and either feed it or are migrated later (don't rip them out day 1). `job_fact_history` is the typed detail behind `fact.changed` events.

## 25. Document Registry — `job_documents`

Today file paths are ad-hoc columns on **~15 tables** (`jobs` ×3 dropbox cols, `projects` ×2, `fee_proposals`, `purchase_orders`, `site_diary`, `progress_claims`, `job_variations` ×2, `lead_documents`, `marketing_media_assets`, `project_photos`, `site_inductions`, `whs_documents`, `rfqs`/`rfq_recipients`). No registry, no document type, no version. This blocks both provenance and the extraction engine.

```
job_documents(
  id, job_id, document_type,    -- architectural|structural|specification|geotech|survey|bal_report|
                                --   energy_report|contract|variation|quote|invoice|photo|whs|other
  title, source,                -- upload|email|buildexact|generated
  version int, supersedes_document_id,
  status,                       -- current|superseded|draft
  storage_provider,             -- dropbox|supabase
  storage_path, uploaded_by, uploaded_at
)
```

Rules: **everything references a document; nothing owns it.** A fact's provenance `source` points at `document_id` (+ page/ref), not free text. New uploads route through the registry; the scattered path columns backfill incrementally. Document versioning (Rev 4 supersedes Rev 3) is what triggers fact re-extraction (§23).

## 26. Fact Dependency Matrix — blast radius drives the tier

"What breaks if this is wrong?" → sets the confirmation tier. ~25 highest-impact facts:

| Fact | Consumers (blast radius) | If wrong → | Tier |
|---|---|---|---|
| `address` | every module, all legal docs, claims, WHS site | everything mis-keyed; wrong contracts | 🔴 |
| `storeys` | WHS (heights/scaffold HRCW), schedule, cost, RFQ, portal, marketing | wrong safety controls (legal); wrong benchmarks | 🔴 |
| `bal_rating` | WHS, RFQ bushfire construction, compliance | non-compliant build | 🔴 |
| `has_suspended_slab` | WHS (formwork HRCW), cost | missing formwork SWMS | 🔴 |
| `has_retaining_walls` | WHS, cost, schedule | missing controls | 🔴 |
| `site_slope` | WHS (falls), cost benchmarks | missing fall controls | 🔴 |
| `demolition_required` | WHS (demolition/asbestos HRCW), schedule | missing demo/asbestos controls | 🔴 |
| `frame_type` | WHS (steel→hot works/crane), RFQ, cost | missing controls; wrong procurement | 🔴 |
| `building_age / pre_1990` | WHS (asbestos) | asbestos risk missed | 🔴 |
| `building_height` | WHS, compliance/planning | compliance breach | 🔴 |
| `bushfire/flood overlay` | WHS, compliance | non-compliant | 🔴 |
| `energy_rating` | compliance sign-off | compliance breach | 🔴 |
| `contract_value` / `original_contract_value` | finance, margin, claims, WIPAA, portal | wrong billing/margin; client dispute | 🔴 |
| `variation amount / signed` | contract value, client billing | wrong billing; dispute | 🔴 |
| `claim amount / stage` | client billing, income | wrong billing; dispute | 🔴 |
| `client_name / client_email` | portal, claims, variations (client docs) | wrong person billed; dispute | 🔴 |
| `project_type` | WHS module derivation, schedule template, cost, reporting | wrong WHS/schedule | 🔴 |
| `invoice trade_category_id` | budget vs actual, margin | wrong cost attribution → wrong margin | 🔴 |
| `accepted_trades` | schedule generation, RFQ, procurement | wrong schedule/POs (spend) | 🔴 |
| `floor_area_m2 / roof_area_m2` | cost benchmarks (internal), marketing | benchmark slightly off | 🟢 |
| `roof_structure / cladding / wall_cladding` | RFQ scope, marketing | RFQ scope tweak | 🟢 |
| `wet_areas, windows, doors` | cost benchmarks | benchmark off | 🟢 |
| `complexity scores` | internal estimating | estimate off | 🟢 |
| `suburb` | marketing/SEO, lookups | wrong targeting | 🟢 |
| `lead_source` | marketing attribution | attribution off | 🟢 |
| `pool / lift / solar / tank` | marketing, future modules | cosmetic until wired | 🟢 |

Pattern: **WHS-feeding, money-feeding, client-facing, and compliance facts = 🔴 confirm. Internal estimating / benchmarking / marketing = 🟢 auto-apply >90%.** (Note: a 🟢 fact escalates to 🔴 if it ever feeds a client quote — e.g. floor area used for client pricing.)

## 27. Revised integrated roadmap (supersedes §21)

```
Phase −1  Prerequisite cleanup     finance route shadowing · project_metrics collision ·
                                    contract_value dual-source · WHS→project_swms · phantom-table docs
Phase  0  Read layer + Knowledge Core scaffold   getJobProfile · facts service · job_events · job_documents
Phase  1  Address                  wire normalised cols · one identity
Phase  2  Client + contact         onto the job spine; lead→job carry (API, non-lossy)
Phase  3  Fact Registry + Dependency Matrix      criticality tiers → confirmation policy
Phase  4  Building Facts via Project Intelligence Engine    (one extraction → all consumers; tiered confirm)
Phase  5  Contract value / financial truth       collapse dual source to one Generated fact
Phase  6  Trade taxonomy           one vocabulary + FKs (rfqs/subs/POs/cost_intelligence/workforce)
Phase  7  Carpentry integration    last — easiest once the core is stable
```

Events + Documents are woven through from Phase 0, not bolted on at the end.

---
---

# PART 5 — Completeness Pass (full SOP + .md scope, 2026-05-30)

> Scoped all 115 SOPs + 16 agent-knowledge docs + the WHS template pack + root specs against
> Parts 1–4. This pass found structural gaps the code audit couldn't see (intended-but-unbuilt
> outcomes, party/pre-job data, whole sub-domains) and the docs that must be corrected. **The
> biggest finding revises a core assumption: there is not one spine, there are three.**

## 28. THREE identity spines (revises "everything keys to job_id")

Much of the system is **pre-job** and **party-centric**; a job may not exist until conversion/win. Forcing everything onto `job_id` is wrong. There are three spines; a fact keys to its natural one:

| Spine | Key | Holds | Examples |
|---|---|---|---|
| **Party** (person/org) | `contact_id` / `subcontractor_id` / `user_id` | identity, contact, relationship, consent, referrals, roles | clients, architects, engineers, surveyors, subbies, suppliers, referrers |
| **Lead / Opportunity** (pre-job) | `lead_id` | qualifying, estimated_value, PTSA/winning-offer, tender hierarchy, scopes, quotes | everything from enquiry → tender, before a job exists |
| **Job / Project** (construction) | `job_id` (→ `project_id`) | all building facts, operations, finance, WHS, portal | the spine Parts 1–4 already model |

**Stamp-forward at boundaries** (via the facts service, never re-type): lead → job conversion carries lead facts onto the job; Party links to Lead/Job via **roles** (client, architect, builder, PCBU). This means the registry keys are `party_id` / `lead_id` / `job_id`, and `getJobProfile` has siblings `getLeadProfile` / `getPartyProfile`.

## 29. Event streams are plural (don't force into one)

| Stream | Key | Purpose |
|---|---|---|
| `job_events` | `job_id` | business events (construction lifecycle, finance, WHS) |
| `contact_events` | `contact_id` | interactions, email delivery/opens, **consent/unsubscribe (Spam Act, append-only)** |
| `attribution_events` | `session_id` | web telemetry, pre-job, high-volume — only the **outcome** (`lead.created` + attributed source) crosses into the business log |

Rule: pick the stream by the subject's spine. Never put session telemetry in `job_events`.

## 30. Company / Config layer (above all spines)

Currently homeless: company identity (name, ABN, building licence, address, phone, **logo** — merged into every WHS doc/proposal/portal header), users + roles, and **integration credentials/status** (Buildexact, Xero, Gmail, Drive, Dropbox, Resend, Meta, GSC/GA4/GBP). Company-scoped, not job-keyed. Register a **Config layer** so document merge-fields have a canonical company source and integration status is consistent.

## 31. Expanded fact families (additions the scope found)

- **Relationships — ADD duty-holders (🔴):** `site_supervisor`, `project_manager`, `whs_manager`, `principal_contractor`, `pcbu` (+ engineer, building_surveyor). Every WHS plan/permit/SWMS needs these; **none have a canonical owner today** (`projects.supervisor` doesn't even exist).
- **Site Intelligence — ADD the full WHS site-setup + emergency set as universal facts:** first_aid / fire_extinguisher / spill_kit / assembly_point / evacuation_signal / emergency_vehicle_access / defibrillator location, parking / delivery / skip / amenities / toilet / lunch, site_fenced, nearest_hospital(+address/phone), nearest_medical_centre. ("Enter once, reuse everywhere" ⇒ universal, not WHS-private.)
- **Generated — ADD the full WHS derived set** (applicable_swms/permits/inspections/registers/toolbox/board/training/ppe, **compliance_health_score**) **and the full financial set** (claims_issued/paid, working_margin, WIPAA value, underclaim, cashflow in/out/net, portfolio priority, benchmark $/m²).
- **Sales/BI metrics (Generated, party/lead spine):** speed_to_lead, relationship_score, qualifying %, weighted-pipeline value.
- **Compliance/Consent (🔴 class):** consent_source/at, unsubscribe — legally mandated, append-only.
- **PTSA / Winning Offer (🔴 client-facing money):** `ptsa_*`, `wo_*`, preconstruction_fee, proposal token/views; the value-carry must include the PTSA fee.
- **Carpentry parallel financial spine (Phase 7):** quoted_value, budgeted_cost, **`carpentry_job_budgets` (mig 067 — absent from the dictionary)**, milestones, closeout snapshot, its own client contact. Carpentry labour is job-level, not per-trade.
- **Earned-value costing (2026-07-14, migs 140–142 — flagged for the facts sprint, not yet routed through the facts service):** `carpentry_budget_line_items` (estimate leaf → canonical sub-task mapping + per-line sell/cost; the mapping is a **🔴 money-tier, human-confirmed fact** via the `status` suggested→confirmed flag — Canonical Data Law pt 6); `timesheet_entries.budget_line_item_id` + `carpentry_job_costs.carpentry_budget_line_item_id` (sub-task actual-cost links); **projected margin & realised margin are Generated** (derived in the budget/pricing endpoints from sell + actual + % complete — never stored as editable columns, Law pt 3).

## 32. Expanded Document & Event enums

- **`job_documents.document_type` ADD:** fee_proposal, quote, tender_doc, buildxact_estimate, addendum, progress_claim, variation_doc, deposit_invoice, **supplier_invoice (in) vs client_invoice (out)**, purchase_order, remittance, whs_plan, emp, site_safety_plan, swms, permit, register, site_board, induction_pdf, compliance_doc, toolbox, rescue_plan, client_guide, weekly_update, handover_pack, photo. **ADD columns:** `direction(in/out)`, `template_key`, `template_version`, `profile_version`, `supersedes_document_id`, `audience_layer`, `is_stale`.
- **`job_events.event_type` ADD:** invoice.uploaded/extracted/held/rejected, claim.drafted/partially_paid/overdue/voided, payment.recorded, variation.sent/rejected, budget.seeded/changed, wipaa.reviewed, target_margin.changed(+reason), supplier.auto_tag_learned; induction.completed, swms.signed, incident.logged/resolved, inspection.completed/overdue, permit.issued/closed, toolbox.held, consultation.recorded, corrective_action.raised/closed, whs_document.generated/stale, compliance.expiring; eot.raised/applied, po.issued, trade.responded; quote.received/accepted, addendum.issued.

## 33. Tier refinement — tier = MAX consequence across consumers

A fact's confirmation tier is **not intrinsic** — it's the highest-consequence consumer. `roof_type` is 🟢 for marketing but 🔴 for WHS roof-work / truss-lift HRCW → net **🔴**. `floor_area` is 🟢 for benchmarking but **🔴 if it feeds a client quote**. Compute each fact's tier as the **max** across its dependency-matrix consumers. The 🔴 classes are: **safety/WHS · money · client-facing · compliance · consent**.

## 34. Two extractors, not one (correction to §16 framing)

The **Project Intelligence Engine** = the **building-facts** extractor (→ `project_metrics`). The **RFQ scope-of-works** extraction (→ `rfq_trade_scopes`, trade scope bullets) is a **separate** extractor. The Engine can emit trade scope as one output, but they are distinct pipelines — don't conflate them.

## 35. Sub-domains still to register (were missing from Parts 1–4)

- **Tender hierarchy** (lead-spine satellites): `rfq_packages → trade_scopes → recipients → addenda`, `buildexact_estimates`, the legacy `rfqs` mirror.
- **Marketing/attribution model**: content_items, campaigns, media, keyword_targets, website_pages, attribution/enquiry_attribution (party/web streams).
- **WHS engine**: `whs_site_profiles` questionnaire (M0–M10) as the **canonical WHS consumer of Project-Facts**; planned `whs_permits/inspections/plant/training/corrective_actions/consultation`.
- **reference_projects** auto-sourced from completed jobs (currently hand-entered).
- **Xero**, **Procurement Intelligence** (lead-time), **Workforce** `task_category → trade_category` mapping (promote to a phase).

## 36. Doc-truth corrections (one-time sweep — makes the dictionary undisputed)

- **Phantom `lead_qualifying_scores`** — remove from SOURCE_OF_TRUTH, MODULE_RELATIONSHIPS, DATA_FLOW_MAP, both MASTER_PLAN, ONBOARDING_FINAL, AGENT_OVERVIEW, CLAUDE.md (scores are columns on `leads`, mig 016).
- **SOURCE_OF_TRUTH.md** (most-drifted): contract_value is **dual-sourced** not just trigger; address sync is **one-way**; `trade_categories ↔ trade_master_library` FK **exists** (mig 043) — fix "not linked".
- **Migration numbering** in CLAUDE.md + AGENT_OVERVIEW (014 = schedule_templates; lead docs = 060; max mig = 069, not 045).
- **PRODUCT_PRINCIPLES.md #5** ("AI never auto-applies without confirmation") **conflicts** with the consequence-tiered policy (🟢 auto-apply ≥0.90) — reconcile. **#7** states the broken contract_value behaviour as fact — correct it.
- **Retire** stale `agent_knowledge/MASTER_PLAN.md` (root is newer); make SOURCE_OF_TRUTH / DATA_FLOW_MAP / MODULE_RELATIONSHIPS **subordinate** to this dictionary.
- **Mark superseded:** MODULE_6_7_SPEC tables (`buildexact_categories`, `cost_allocations`, `category_mapping_templates`); declare `whsOutputsMatrix.md` (agent_knowledge copy) canonical.

## 37. Roadmap impact

Phase −1 **adds** the doc-correction sweep (docs only). Phase 0 scaffolding now registers **three spine keys** (`party_id` / `lead_id` / `job_id`) and **three event streams**, plus the **Config layer** — not just `job_id`. Everything else in §27 stands.

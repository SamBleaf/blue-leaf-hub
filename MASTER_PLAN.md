# Blue Leaf Hub — Master Plan
## Live Planning Document

> **Last updated:** 2026-06-10 (reconciled — BUILD QUEUE BQ-1…8 complete; shipped since: Universal Data Phases 1–7, CRM job_contact_roles + smart-lists, contract-value/role-guard fixes; added: Estimating-OS division + Procurement Intelligence plan). Prior: 2026-05-24 (Winning Offer).
> **Maintained by:** Planning Agent
> **Read this first.** Then read `AGENT_OVERVIEW.md` for technical orientation.

---

## HOW TO USE THIS DOCUMENT

**HUB BUILDER** — Find the next unchecked item in BUILD QUEUE. Read its prompt. Build it.
**TROUBLESHOOT AGENT** — Find the module in KNOWN ISSUES or MODULE STATUS. Read its prompt.
**PLANNING AGENT** — Update build status after each session. Keep checklists current.

Migrations: applied via Supabase SQL editor in order. Current max = **047**. Next = **048** (Winning Offer fields + reference_projects table).

---

## QUICK STATUS SNAPSHOT

| Module | Status | Next action |
|--------|--------|-------------|
| Sales Manager | 🟡 Winning Offer extended | Phase 1 (data + form + ref projects) prompt ready to run |
| Tender Manager — RFQ | ✅ Complete | — |
| Tender Manager — Fee Proposals | ✅ Complete | — |
| Tender Manager — Cost Intelligence | ✅ Complete | Benchmarks/comparison/similar/trends/pre-tender endpoints all built (Phase J shipped, verified 2026-06-10). Nightly AI-insight batch (CI-3.2/3.3) still pending |
| Operations — Schedule | ✅ Complete (Sprint 2) | Baseline ghost bars + EOT fully built |
| Operations — WHS / Diary | ✅ Complete | — |
| Finance — Invoice Inbox | ✅ Complete | — |
| Finance — Command Centre | ✅ Built | Cashflow forecast + Director portfolio both built (verified 2026-06-10); contract value now a single Generated fact (Phase 5). Xero + committed-cost (BQ-10) deferred |
| Client Portal | ✅ Complete | Variation signing (deferred to Stage 3) |
| Blueprint AI | ✅ Complete | Proactive alerts (deferred) |
| Home Dashboard | ✅ Built | Live KPIs (pipeline value, weighted forecast, won, hit rate) + pipeline stages + active jobs + quick links (verified 2026-06-10) |
| PTSA Module | ✅ Complete | Built into Lead detail right column |
| Marketing Stage 1 | ✅ Complete | ContentGenerator, ContentLibrary, CampaignManager, MediaUpload, marketingAgent — all built + routed |
| Marketing Stage 2 | 🟡 Partial | FinalAssembly.jsx + marketingMedia.mjs built — verify wiring |
| Xero Integration | 🔴 Not started | Deferred |

---

## RECENTLY SHIPPED (2026-06) — not in the original snapshot

All on `main`, since the 2026-05-24 snapshot:
- **Universal Data Architecture / Knowledge Core — Phases 1–7** (migs 077–083 applied): facts service wired across the job spine — address-as-identity, non-lossy lead→job carry, **contract value as a single Generated fact** (mig 079 dropped the storage trigger), building facts via `setFact` into `project_metrics` + **Confirm Queue**, trade-category FKs everywhere, carpentry `job_id` de-island + labour double-count guard.
- **CRM**: smart-list membership visibility + Notes + "Referred by" picker; **`job_contact_roles`** (referrer/consultant — value brought in vs consulting fees, admin-only, mig 083).
- **Fixes**: 2026-06-02 audit triage (10/17 incl. BUG-009/010); contract-value-truth N1/N2 (canonical via `getCanonicalContractValue`); role-guard deep-link/refresh race (`AuthContext`).
- **Buildxact**: client corrected + verified live; reconcile tool + job→Hub sync. Linking is a data-state thing (auto-links by normalised address once real jobs flow in) — see `AUDIT_2026-06-02_TRIAGE.md`.
- **Estimating platform planning**: Bestimator scope-intelligence adapter (`server/lib/scopeIntelligence/`) + full engine brief; **Estimating Operating System** division-of-labour + **BQ-9** Estimate Confidence Score, **BQ-10** Procurement Intelligence (full plan → `docs/agent_knowledge/PROCUREMENT_INTELLIGENCE_PLAN.md`), **BQ-11** Trade Intelligence (see ESTIMATING OPERATING SYSTEM section).

Audit trail: `AUDIT_REPORT_2026-06-02.md`, `AUDIT_REPORT_2026-06-03.md` (+ a full 2026-06-10 re-audit in progress).

---

## BUILD QUEUE
### Next items to build, in priority order

- [x] **BQ-1** PTSA — built in Lead detail right column. Tiny fix: auto-set ptsa_sent_date on status → sent
- [x] **BQ-4** Schedule Sprint 2 — baseline ghost bars + EOT tab fully built (DelaysTab.jsx, scheduleRoutes.mjs)
- [x] **BQ-7** Marketing Stage 1 — ContentGenerator, ContentLibrary, CampaignManager, MediaUpload, marketingAgent all built + routed
- [x] **BQ-2** Home dashboard — ✅ BUILT (verified rendering 2026-06-10: live KPIs, weighted forecast, active jobs, pipeline stages, quick links)
- [x] **BQ-3** Cost Intelligence Phase J — ✅ BUILT (benchmarks/comparison/similar-projects/trends/pre-tender endpoints all live in `costIntelligenceRoutes.mjs`, verified 2026-06-10)
- [x] **BQ-5** Finance cashflow — ✅ BUILT (Cashflow Forecast accordion in JobCommandCentre + `financeCCRoutes.mjs`, verified present 2026-06-10)
- [x] **BQ-6** Director portfolio — ✅ BUILT (`JobDashboardSelector` "Director Portfolio" ranked by Risk/Value/A–Z, verified rendering 2026-06-10)
- [x] **BQ-8** Marketing Stage 2 — `FinalAssembly.jsx` + `marketingMedia.mjs` built (full pipeline wiring being confirmed in the 2026-06-10 audit)

> **Reconciled 2026-06-10:** BUILD QUEUE BQ-1…8 all complete. Major work shipped since 2026-05-24 is captured in **RECENTLY SHIPPED (2026-06)** below + the **ESTIMATING OPERATING SYSTEM** section (BQ-9/10/11 are the live planning items).
- [ ] **BQ-9** Estimate Confidence Score — Hub OS-level feature, surfaced at the FEE-PROPOSAL stage (see ESTIMATING OS section)
- [ ] **BQ-10** Procurement Intelligence — one-stop procurement hub in Operations, triggered at job-lock (see ESTIMATING OS section) — PLANNING
- [ ] **BQ-11** Trade Intelligence (subbie market) — collect in Hub, feed to Bestimator (see ESTIMATING OS section)

### DOCUMENT TEMPLATES WORKSTREAM (full audit → `docs/templates/TEMPLATE_MASTER_AUDIT.md`)
> 32 templates exist, 47 missing. HTML emails → `server/lib/emailTemplates/`; client DOCX → `docs/templates/*.docx`; server PDFs → `server/lib/pdfKit.mjs`. Each ships with an SOP (Section 14). DB columns still needed (mig): `jobs.practical_completion_date`, `jobs.contract_signed_at`, `projects.supervisor_phone` (bank fields done in mig 106).

**Batch 1 — critical (blocks real workflows)**
- [ ] **BQ-12** Portal invite email (HTML) — trigger: job created + portal enabled
- [x] **BQ-13** Progress-claim HTML email — replaces the `<pre>` block (financeCCRoutes) — DONE (Phase 0); bank block needs mig 106 + backfill
- [x] **BQ-14** Variation HTML email — replaces the `<pre>` block — DONE (Phase 0)
- [ ] **BQ-15** WHS generation UI — engine + markdown templates exist; build the builder-facing page
- [ ] **BQ-16** Proposal acceptance letter (DOCX) — signed acceptance record
- [ ] **BQ-17** Practical completion notice (DOCX/PDF) — legal trigger for DLP + final payment
- [ ] **BQ-18** Handover checklist (DOCX/PDF)
- [ ] **BQ-19** Client onboarding welcome email (HTML)
- [ ] **BQ-20** SOPA overdue-payment notice (PDF)
- [ ] **BQ-21** Selections schedule (DOCX) — #1 variation source has no formal process

**Batch 2 — client experience:** BQ-22 enquiry confirmation · BQ-23 weekly client update · BQ-24 payment reminder · BQ-25 payment receipt · BQ-26 warranty pack · BQ-27 certificates index · BQ-28 completion thank-you + testimonial · BQ-29 portal action-required · BQ-30 meeting minutes · BQ-31 PTSA covering email
**Batch 3 — operational:** BQ-32 quote comparison · BQ-33 quality inspection checklist · BQ-34 defect list · BQ-35 pre-start checklist · BQ-36 sub onboarding · BQ-37 sub compliance reminder · BQ-38 long-lead register · BQ-39 budget-vs-actual · BQ-40 margin-risk report · BQ-41 6-month defect reminder
**Batch 4 — polish/marketing:** BQ-42 appliance/finishes register · BQ-43 maintenance guide · BQ-44 neighbour letter · BQ-45 onboarding pack · BQ-46 photo-usage approval · BQ-47 case-study brief · BQ-48 discovery questionnaire · BQ-49 meeting agenda · BQ-50 defect-liability form · BQ-51 construction commencement notice

---

## ESTIMATING OPERATING SYSTEM — division of labour + data flows

> Added 2026-06-03. **Blue Leaf Hub is the Estimating Operating System.** It consumes the external
> engines (Bestimator = the autonomous QS/estimator Sam is building; Buildxact) and adds the
> history / relationship / ops / confidence layer that turns an estimate into a managed outcome.
> The estimate is one output of a much larger system:
>
> `Lead → Project Intelligence → Scope Intelligence → Building Elements → Quantity Intelligence`
> `→ Recipe Intelligence → Estimate → RFQ → Quote Returns → Cost/Budget Intelligence`
> `→ Construction → Actual Costs → Historical Learning`

### Who owns what (locked 2026-06-03)

| Layer | Owner | Notes |
|---|---|---|
| Project Intelligence (building facts) | Hub stores · Bestimator extracts | `project_metrics` + facts service — **built** |
| Scope Intelligence (trades/scope/packages) | **Bestimator** | Hub RFQ extractor = v1; Bestimator = v2 |
| Building Element Engine (substructure/frame/bathrooms…) | **Bestimator** | the scope→quantity bridge; NOT a Hub concern |
| Quantity Intelligence (takeoff) | **Bestimator / Buildxact** | remote |
| Recipe Intelligence (qty→materials/labour/subs) | **Buildxact** | Hub consumes |
| Historical / Cost Intelligence (benchmarks, similar, trends) | **Hub** | **built** (Module 2 — Cost Intelligence) |
| Cost Plan (pre-takeoff budget) | **Hub** | = the **Pre-Tender assistant** (built) |
| Trade Intelligence (subbie market) | **Hub collects → feeds Bestimator** | BQ-11 |
| Procurement Intelligence | **Hub (Operations)** | BQ-10 |
| Estimate Review (cost critique) | Hub (cost) + Bestimator (scope) | split |
| Estimate Confidence Score | **Hub** | BQ-9 — composes all signals |

### Data flows (engines run externally; they intertwine via interfaces)
- **Bestimator → Hub:** extracted scope, building facts, element/quantity candidates, confidence + provenance — via the `ScopeIntelligence` adapter (`server/lib/scopeIntelligence/`). Hub renders/confirms via the facts service + Confirm Queue.
- **Hub → Bestimator:** learning outcomes — final RFQ set, accepted quotes, **trade-market data (BQ-11)**, POs, invoices, actuals — via the adapter's LearningAdapter / `submitOutcome`. Pricing stays **tenant-private**; only anonymised market patterns may be pooled.
- **Buildxact ↔ Hub:** estimate line items, recipes, POs, claims, variations — via the Buildxact client + reconcile (within $1).

### BQ-9 — Estimate Confidence Score (Hub, at the fee-proposal stage)
Surfaces in the **Fee Proposal wizard (Module 5), just before the proposal is drafted/presented to the client** — the OS-level output, the only point that sees every signal.
- **Composes:** scope coverage % (RFQ) · quantity confidence (Bestimator) · recipe/cost confidence (Buildxact) · historical validation (`cost_benchmarks` similar-project delta) · risk factors (missing-trade/floor + below-p25 allowances).
- **Outputs:** a composite confidence % (with sub-scores) + a **likely-final-build-cost range** ($X–$Y).
- **Internal memory + continuous improvement (Sam's spec):** absorbs & analyses ALL retrievable data per job; keeps an internal memory to spot **trends** across jobs; continuously improves as data arrives; and **feeds deep analysis back to the other modules** (warn Cost Intelligence of drift, flag Procurement risk, nudge Scope coverage). It both *scores* a proposal and *teaches* the rest of the system.
- Hub-only v1 can run today on RFQ coverage + cost benchmarks + pre-tender confidence; full version waits on the Bestimator/Buildxact feeds.

### BQ-10 — Procurement Intelligence (Hub · Operations) — FULL PLAN 2026-06-10
> **Full module plan → `docs/agent_knowledge/PROCUREMENT_INTELLIGENCE_PLAN.md`** (A–T: purpose, roles, workflow, data model, statuses, views, schedule/supplier/finance/selection integration, AI, phases, risks, testing).
> It's a core operations module (a **procurement command centre**), not a side feature.
> **Grounding finding:** the Hub already has a procurement layer — `schedule_tasks.procurement_*` (mig 011/014), `portal_decisions` for client selections (mig 027), `purchase_orders`, `subcontractors`/`supplier_trade_defaults`. So P1 **consolidates** these (the new `procurement_items` register = single source of truth) rather than rebuilding; the one genuinely-new entity is a material `suppliers` table.
Goal: a **one-stop procurement hub** — every material ordered through it, **no lead-time surprises** (shortages, catalogue clearances).

**Decisions (locked 2026-06-03):**
- **Trigger:** generate the full procurement plan at **job-lock** (contract signed + won). `order_by_date = required-on-site − lead time`; long-lead items flagged "order now".
- **Scope:** **every PO** — all materials, one hub.
- **Lives:** **Operations** (alongside POs + schedule).
- **Source = HYBRID:** a **build-type procurement template** provides the skeleton (categories, lead times, order sequence, builder-supplied vs subbie-supplied vs PC); the **Buildxact estimate** fills real items / quantities / costs. Template works at job-lock even before a detailed estimate; the estimate enriches.
- **Output = LAYERED:** P1 = "order this week" **worklist** (daily action) + procurement **calendar** (horizon) + status tracking; P2 = **auto-draft POs** into the existing PO flow.

**Data model (~mig 084):**
- `procurement_templates` — build_type, trade_category_id, item_name, default_unit, supply_type (`builder_supplied`|`subbie_supplied`|`pc_item`), default_lead_time_days, order_sequence/phase, is_active.
- `procurement_items` — job_id, trade_category_id, item_name, quantity, unit, supply_type, supplier_id?, lead_time_days, required_on_site_date, order_by_date (computed), status (`pending`|`to_order`|`ordered`|`confirmed`|`delivered`|`cancelled`), source (`template`|`estimate`|`manual`), buildexact_line_ref?, unit_cost?, total_cost?, purchase_order_id?, notes.

**Generation (at job-lock):** seed items from the build-type template → enrich from the Buildxact estimate (map by `trade_category_id` + name; classify orderable vs subbie-supplied) → compute required-on-site from the schedule phase the item feeds → `order_by = on-site − lead time` → flag long-lead.

**Endpoints (Operations):** `POST .../jobs/:jobId/procurement/generate` · `GET .../jobs/:jobId/procurement` · `GET .../procurement/worklist` (cross-job "order this week") · `PUT .../procurement/items/:id` · `POST .../procurement/items/:id/draft-po` (P2) · template CRUD.

**Integrations:** trigger off win-finalize (`module4Routes`); source = Buildxact estimate + `trade_category_id` FK (Phase 6); dates from `schedule_tasks` (+ `procurementStatus` util); P2 auto-draft → existing `purchase_orders` + Buildxact PO create; emit `procurement.generated` / `item.ordered` events.

**Phasing:** P1 = schema + generation (template→estimate) + worklist + calendar + status. P2 = auto-draft POs + lead-time learning (actual vs expected lead times feed back).

**Human input needed (gates P1 usefulness):** seed the **build-type procurement templates** — Blue Leaf's standard items + typical lead times + supply-type per build type (new build / reno / extension).

### BQ-11 — Trade Intelligence (subbie market) — Hub collects → feeds Bestimator
Hub captures (byproduct of RFQ / Quote-Tracker): avg quote per trade, award rate, response rate, lead time, region, capacity → **feeds Bestimator** as a pricing/market signal ("roofing avg $26k → this quote +46%"). Pricing tenant-private; anonymised patterns poolable.

---

## MODULE STATUS

---

### SALES MANAGER ✅

**Route:** `/sales`, `/sales/:id`
**Files:** `salesRoutes.mjs`, `SalesPipeline.jsx`, `LeadDetail.jsx`
**DB:** `leads`, `pipeline_stages`, `lead_documents`, `lead_notes`, `lead_conversations` (qualifying scores live as `qualify_*` columns on `leads` (migration 016), not a separate table)
**Migration 045:** Adds PTSA fields to `leads` — UI built in Lead detail right column (contextual card, appears when stage ≥ winning_offer)

**What's built:**
- [x] APB 8-stage pipeline (enquiry → qualify → discovery → winning_offer → fee_proposal → accepted → tender → won)
- [x] Nurture + lost holding states
- [x] Lead card view + list view toggle
- [x] Qualifying scorecard (weighted scoring across project type, budget, timeline, fit)
- [x] Lead detail tabs: Overview, Documents, Notes, Qualifying Score, Blueprint Insight, Conversations
- [x] Transcript analysis → SuggestionReviewPanel → apply suggestions to lead
- [x] Blueprint Insight tab (conversational AI coaching with lead context)
- [x] PTSA fields on `leads` table (migration 045)
- [x] PTSA card in Lead detail right column — status, services checklist, fee, scope notes, validity, credit toggle, special terms, signed date, generate DOCX button

**What's missing:**
- [ ] Auto-set `ptsa_sent_date = today` when status changes to `sent` (1-line fix in LeadDetail.jsx PTSA status select onChange)

**PTSA Build Prompt (for HUB BUILDER):**
```
Task: Build the PTSA (Pre-Tender Service Agreement) tab on Lead detail.

Context:
- Migration 045 has been applied. Fields already exist on `leads` table:
  ptsa_services (JSONB array), ptsa_scope_notes (text), ptsa_validity_days (int, default 14),
  ptsa_status (draft/sent/signed/declined), ptsa_sent_date (date),
  ptsa_special_terms (text), ptsa_credit_to_contract (boolean, default true)
- preconstruction_fee (from migration 016) is the PTSA dollar amount — already on leads
- pretender_signed_date + pretender_notes (from migration 024) are reused for PTSA signing

Files to modify:
- src/pages/LeadDetail.jsx — add "PTSA" tab after "Blueprint Insight"
- server/lib/salesRoutes.mjs — add PATCH /api/sales/leads/:id/ptsa endpoint

PTSA tab should contain:
1. Status badge (draft / sent / signed / declined) with stage-change buttons
2. Services checklist (ptsa_services JSONB array) — list of services included in the PTSA fee
3. Scope notes (ptsa_scope_notes textarea)
4. Fee amount (read from leads.preconstruction_fee — already exists)
5. Validity days (ptsa_validity_days number input, default 14)
6. Credit to contract toggle (ptsa_credit_to_contract checkbox)
7. Special terms (ptsa_special_terms textarea)
8. Sent date (ptsa_sent_date read-only, set when status → sent)
9. "Send to client" button → sets status=sent, sent_date=today, triggers email (Gmail)
10. PDF generation (Blue Leaf branded PTSA document)

No new migration needed. No schema changes.
requireAuth.mjs is already applied to /api/sales routes — no auth changes needed.
```

---

### TENDER MANAGER — RFQ ENGINE ✅

**Route:** `/tender-manager/rfq-engine`, `/tender-manager/rfq-packages`, `/tender-manager/rfq-packages/:id`
**Files:** `module4Routes.mjs`, `rfqPackageRoutes.mjs`, `rfqTradeRoutes.mjs`, `RfqEngine.jsx`, `RfqPackageList.jsx`, `RfqPackageDetail.jsx`
**DB:** `rfqs`, `rfq_packages`, `rfq_trade_scopes`, `rfq_recipients`, `trade_master_library`

**What's built:**
- [x] RFQ extraction from tender docs (Claude AI)
- [x] RFQ packages (trade scopes + recipients)
- [x] Send RFQs via Gmail with Dropbox copy
- [x] IMAP polling for quote replies — auto-extract amounts, auto-match to RFQ
- [x] Quote tracker + unmatched queue
- [x] Trade master library (37 trades, seeded migration 033)
- [x] Trade taxonomy FK link (migration 043 — `trade_master_library.trade_category_id`)
- [x] Quote accepted → sync to Buildexact automatically
- [x] Tender board + tender detail

**What's missing:**
- Nothing critical. Future: addendum workflow improvements.

---

### TENDER MANAGER — FEE PROPOSALS ✅

**Route:** `/tender-manager/fee-proposal/*`
**Files:** `module5Routes.mjs`, `FeeProposalList.jsx`, `FeeProposalWizard.jsx`
**DB:** `fee_proposals`

**What's built:**
- [x] XLSX/PDF import from Buildexact
- [x] Fee proposal wizard (structured fields)
- [x] DOCX generation with docxtemplater (template from Supabase Storage)
- [x] Google Drive upload + edit URL
- [x] PDF export → Dropbox → email to client
- [x] Fee schedule (6 stages summing to 100% — Deposit/Slab/Frame/Lock-up/Linings/PC)
- [x] Buildexact sync on acceptance

**What's missing:**
- Nothing critical. Template stored in Supabase Storage (not localStorage — risk mitigated).

---

### TENDER MANAGER — COST INTELLIGENCE 🟡

**Route:** `/tender-manager/cost-intelligence`
**Files:** `costIntelligenceRoutes.mjs`, `costIntelligenceEstimate.mjs`, `CostIntelligence.jsx`, `src/lib/costIntelUtils.js`
**DB:** `cost_intelligence`, `project_metrics`, `normalized_costs`, `cost_benchmarks`, `cost_intelligence_insights`, `pretender_estimates`

**Phase I — BUILT ✅**
- [x] 4-tab navigation (Benchmarks / Intelligence / Trends / Pre-Tender)
- [x] Benchmarks tab: existing $/m² table + bar chart + job history (unchanged)
- [x] Intelligence tab: job selector, project metrics form (manual entry), sync from job fields, AI plan PDF extraction, normalized cost rates table
- [x] Trends tab: placeholder (Phase J)
- [x] Pre-Tender tab: placeholder (Phase K)
- [x] `normalizedCosts.mjs`: `upsertNormalizedCost()` hooked into invoice approval + variation sign
- [x] `costIntelligenceRoutes.mjs`: metrics CRUD + normalized-costs read endpoint

**Phase J — NOT STARTED 🔴**
- [ ] `cost_benchmarks` computation job (runs on PC + weekly)
- [ ] Historical comparison view — current job vs benchmark range (p25/p50/p75)
- [ ] Similar project matching (7-dimension weighted similarity)
- [ ] Cost Trend Analysis — Trends tab (3/6/12 month rolling per trade)

**Phase K — NOT STARTED 🔴**
- [ ] Pre-Tender input form + output (ranges, confidence score, similar projects)
- [ ] `pretender_estimates` CRUD + CSV export
- [ ] AI insights batch generation (Claude, nightly)
- [ ] Insights surfaced on Command Centre + Cost Intelligence

**Phase J Build Prompt (for HUB BUILDER):**
```
Task: Build Cost Intelligence Phase J — benchmarks computation + Intelligence tab content.

Context: Phase I is complete. The tables exist (cost_benchmarks, normalized_costs, project_metrics).
Data starts flowing into normalized_costs when invoices are approved or variations signed.

Files to modify:
- server/lib/costIntelligenceRoutes.mjs — add benchmark computation + comparison + similar project endpoints
- src/pages/CostIntelligence.jsx — implement Intelligence tab content + Trends tab

Step 1: Benchmark computation endpoint
POST /api/cost-intelligence/benchmarks/recompute
- Groups normalized_costs by trade_category_id + project_type + site_slope + storey_range
- Computes avg, p25, p50, p75 for rate_per_m2_floor and total cost
- Requires minimum 3 data points to show (sample_count < 3 → skip)
- Upserts into cost_benchmarks
- Only runs if caller has admin role

Step 2: Job comparison endpoint
GET /api/cost-intelligence/jobs/:jobId/comparison
- Fetches normalized_costs for job
- For each trade, finds matching cost_benchmark (by trade + project_type + site_slope + storeys)
- Falls back to benchmark with null filters if no match
- Returns: [{trade_name, actual_amount, rate_per_m2, benchmark_p25, benchmark_p50, benchmark_p75, risk_level}]
- Risk levels: low (within p25–p75), medium (p75–p90), high (above p90), insufficient (< 3 samples)

Step 3: Similar project matching endpoint
GET /api/cost-intelligence/jobs/:jobId/similar
- Fetches project_metrics for target job
- Compares against all other jobs with is_complete=true
- Weighted similarity: project_type(30%) floor_area(20%) site_slope(15%) storeys(10%) overall_complexity_score(15%) wet_areas(5%) has_raked_ceilings(5%)
- Returns top 5 by similarity score with their normalized_costs summary

Step 4: Intelligence tab UI
- For selected job: show comparison table (trade | actual | $/m² | benchmark range | risk badge)
- Risk badges: 🟢 Low | 🟡 Medium | 🔴 High | ⬜ Insufficient data
- Similar projects panel: top 5 cards with similarity % + key dimensions
- "Recompute benchmarks" button (admin only)

Step 5: Trends tab UI
GET /api/cost-intelligence/trends/:tradeCategoryId
- Groups normalized_costs by recorded_at month for that trade
- Computes 3/6/12-month rolling average of rate_per_m2_floor
- Returns series for charting
- UI: trade selector dropdown, line chart with 12-month window, trend arrow + % change

Architecture rules:
- cost_benchmarks are pre-computed (never aggregate live)
- Similar project matching: only projects with project_metrics.is_complete = true
- Minimum 3 data points for benchmarks — show "Insufficient data — more jobs needed" below that
- requireAuth middleware already on /api/cost-intelligence routes
```

---

### OPERATIONS — SCHEDULE ✅

**Route:** `/operations/:projectId/schedule`
**Files:** `module6Routes.mjs` → `scheduleRoutes.mjs`, `ScheduleManager.jsx`, `src/lib/scheduleUtils.js`
**DB:** `schedule_tasks`, `schedule_eot` (migration 018)

**Sprint 1 — BUILT ✅**
- [x] 4 views: Gantt, Sheet, Calendar, Dashboard
- [x] Colour coding system (phase-semantic, consistent across all views)
- [x] AI schedule generation from project description (39-task template)
- [x] Gantt: column toggle, right-click context menu, drag + resize
- [x] Ripple cascade on date changes
- [x] Critical path computation
- [x] Dependency map view (DependencyMap.jsx using @xyflow/react)
- [x] Global Gantt across all projects
- [x] Trade conflict detection

**Sprint 2 — NOT STARTED 🔴**
- [ ] Baseline ghost bars — UI to lock snapshot + render semi-transparent overlay
- [ ] EOT tab — raise EOT, approve, push schedule forward

**Note:** `schedule_eot` table and `baseline_start_date/baseline_end_date` columns exist from migration 018. The UI is not built. A `DelaysTab.jsx` file may exist as a stub — check before building.

**Sprint 2 Build Prompt (for HUB BUILDER):**
```
Task: Build Schedule Sprint 2 — Baseline ghost bars + EOT tracking tab.

Context:
- schedule_tasks has baseline_start_date, baseline_end_date columns (from migration 018)
- schedule_eot table exists (from migration 018) with: project_id, reason_code, days_claimed, status, approved_by, applied_at
- The Gantt library is gantt-task-react
- All schedule logic is in scheduleRoutes.mjs (imported by module6Routes.mjs)
- scheduleUtils.js has getTaskGanttStyles() — extend this for ghost bars

Files to modify:
- server/lib/scheduleRoutes.mjs — add baseline lock endpoint + EOT CRUD
- src/pages/ScheduleManager.jsx — add baseline UI + Delays tab
- src/lib/scheduleUtils.js — add ghost bar style computation

Step 1: Baseline lock
POST /api/schedule/projects/:projectId/lock-baseline
- Copies start_date → baseline_start_date, end_date → baseline_end_date for all tasks
- Sets projects.schedule_baseline_locked_at = now()
- Idempotent (can re-lock, overwrites previous baseline)

"Lock Baseline" button appears in ScheduleManager header, only if no baseline locked yet.
Once locked, button changes to "Baseline locked [date] · Reset" (reset requires confirmation).

Step 2: Ghost bars in Gantt
In getTaskGanttStyles(): if task.baseline_start_date exists AND baseline differs from current:
- Render an additional semi-transparent overlay bar at baseline position
- Use the gantt-task-react CustomTaskContent prop to overlay SVG ghost bar
- Ghost bar colour: same phase hue at 30% opacity, dashed border

Step 3: EOT tab
New "Delays" tab in ScheduleManager (alongside Gantt/Sheet/Calendar/Dashboard).
Delays tab:
- List of EOTs for this project (from schedule_eot table)
- "Raise EOT" button → modal: reason_code (dropdown: weather/design_change/client_instruction/contractor_delay/other), description, days_claimed
- Director can approve → sets status=approved, applied_at=now()
- On approval: all task end_dates pushed forward by days_claimed (ripple from earliest affected task)
- Timeline: shows EOT history with status badges

API endpoints needed:
GET  /api/schedule/projects/:projectId/eot      — list
POST /api/schedule/projects/:projectId/eot      — raise new EOT
PUT  /api/schedule/projects/:projectId/eot/:id  — update status (approve/reject)
```

---

### OPERATIONS — WHS / DIARY ✅

**Route:** `/operations/:projectId/whs`, `/operations/:projectId/diary`
**Files:** `whsRoutes.mjs`, `siteDiaryRoutes.mjs` (both imported by module6Routes.mjs)
**DB:** `contractor_compliance`, `site_inductions`, `swms_templates`, `project_swms`, `site_reports`, `site_diary`

**What's built:**
- [x] WHS compliance docs per project
- [x] SWMS templates + project SWMS
- [x] Site diary with voice capture and AI structuring
- [x] Site inductions (QR code + public form at `/induct/:projectId`)

---

### FINANCE — INVOICE INBOX ✅

**Route:** `/finance` (inbox tab)
**Files:** `financeRoutes.mjs`, `FinanceInbox.jsx`, `ApprovalQueue.jsx`
**DB:** `financial_documents`, `financial_approvals`, `supplier_trade_defaults`, `unmatched_quote_emails`

**What's built:**
- [x] IMAP polling (admin@ + accounts@) for inbound invoices
- [x] Drag-drop upload + photo upload
- [x] AI extraction cascade (regex → Haiku → Sonnet)
- [x] Job matching (5-tier deterministic-first)
- [x] Approval queue: approve/reject/rematch
- [x] Trade tagging required before approval (`trade_category_id` required field)
- [x] AI trade inference — auto-tag after 3 confirmed invoices from same ABN
- [x] Dropbox auto-file on approval
- [x] `normalizedCosts.mjs` upsertNormalizedCost() called on approval

---

### FINANCE — COMMAND CENTRE 🟡

**Route:** `/finance/jobs/:jobId`
**Files:** `financeCCRoutes.mjs`, `JobCommandCentre.jsx`, `ProgressClaims.jsx`, `Variations.jsx`
**DB:** `job_budgets`, `job_budget_history`, `progress_claims`, `progress_claim_payments`, `job_variations`, `wipaa_reviews`

**Stage 1 — BUILT ✅**
- [x] Trade categories (37, migration 031)
- [x] Budget seeding from Buildexact (`POST /api/finance/jobs/:id/budget/seed`)
- [x] Budget edit with mandatory reason field + history logging
- [x] Budget vs Actual table in Command Centre
- [x] Progress claims CRUD + PDF + Gmail send + payment recording
- [x] Variations CRUD + PDF + Gmail send + sign/reject/void
- [x] WIPAA: editable forecast_total_cost + monthly First-Friday scheduler
- [x] Navigation wiring (AppShell dynamic, JobDashboardSelector)

**Stage 2 — BUILT ✅**
- [x] KPI bar: Contract / Claims Issued / Claims Paid / Actual Costs / Working Margin / Forecast Margin
- [x] Margin health badges (🟢🟡🔴)
- [x] Underclaim alert (>10% gap between build% and claims%)
- [x] Requires Action section (pending invoices + overdue claims)
- [x] WIPAA accordion (forced red if >30 days since review)
- [x] Budget edit modal with inline pencil icon on each row

**Stage 3 — NOT STARTED 🔴**
- [ ] Cashflow forecast (3-month rolling)
- [ ] AI insights surfaced on Command Centre
- [ ] Director portfolio view (all active jobs, ranked by margin risk)
- [ ] Xero integration (payment matching)
- [ ] Client portal variation signing

**Finance Stage 3 Prompt (for HUB BUILDER):**
```
Task: Build Finance Stage 3 — Cashflow forecast + Director portfolio view.

Context:
- JobCommandCentre.jsx is the main file. It's at src/pages/JobCommandCentre.jsx (~534 lines).
- financeCCRoutes.mjs has all the backend (all claims/variations/wipaa endpoints).
- KPIs are fetched from GET /api/finance/jobs/:jobId/command-centre

Step 1: Cashflow forecast section
Add below the WIPAA accordion in JobCommandCentre.jsx.
Data needed from backend (add to command-centre aggregate endpoint):
- Upcoming progress claims: all draft/issued claims with their due_date + amount_inc_gst
- Expected costs: approved financial_documents for this job in next 90 days (use document date)
- PO schedules: purchase_orders for this job that aren't yet invoiced

Frontend: 3-column layout for each of the next 3 months:
- Month label (e.g. "June 2026")
- Incoming (claims expected to be paid — sum of claims due that month)
- Outgoing (invoices + PO payments expected that month)
- Net cashflow (incoming - outgoing)
- Colour: 🟢 net positive, 🔴 net negative

Step 2: Director portfolio view
New route: /finance/jobs (no jobId — the selector screen)
File: src/pages/JobDashboardSelector.jsx

Currently JobDashboardSelector.jsx just shows a job picker. Replace with a director overview table.
Fetch all active jobs: GET /api/finance/jobs/portfolio (new endpoint needed)

Returns per job:
- address, contract_value, forecast_margin_pct, target_margin_pct, last_wipaa_review_date
- claims_issued total, claims_paid total, actual_costs total
- has_underclaim (bool), days_since_wipaa_review (int)

Table columns: Job | Contract $ | Forecast Margin | WIPAA Age | Underclaim | Action
Sort by: days_since_wipaa_review DESC (most overdue first)
Margin colour: 🟢 above target | 🟡 within ±1% | 🔴 below floor
WIPAA age: 🔴 >30 days, 🟡 21-30 days, 🟢 <21 days
Underclaim: amber badge if flagged
Click row → /finance/jobs/:jobId

API: GET /api/finance/jobs/portfolio
- Auth: requireAuth (admin only or all authenticated — use authenticated for now)
- Joins jobs + progress_claims + financial_documents + wipaa_reviews
```

---

### CLIENT PORTAL ✅

**Route:** `/portal/:token/*`
**Files:** `portalRoutes.mjs`, `MyPortal.jsx`, `PortalAdmin.jsx`
**DB:** `projects` (portal_token, is_portal_enabled)

**What's built:**
- [x] Token-based public access (no login)
- [x] Portal admin: enable/disable, set client name/email, custom branding
- [x] Schedule view (milestone-level tasks)
- [x] Variations view (client-facing only — no internal cost breakdown)
- [x] Site diary weekly digest

**What's deferred:**
- [ ] Variation client sign-off (currently email link — portal integration is Stage 3)

---

### BLUEPRINT AI ✅

**Files:** `blueprintRoutes.mjs`, `src/blueprint/` (agent/, lib/, components/, api/)
**DB:** Knowledge stored via `job_knowledge` table + Supabase vector

**Modes:**
| Mode | Endpoint | Model |
|------|----------|-------|
| Chat widget | `/api/blueprint/chat` → `{ reply }` | claude-sonnet-4-6 |
| Transcript analysis | inline in `salesRoutes.mjs` | claude-opus-4-5 |
| Blueprint Insight tab | `/api/blueprint/chat` + lead context | claude-sonnet-4-6 |
| RFQ QC | `blueprintQc.js` | claude-sonnet-4-6 |
| Document review | `/api/blueprint/review-document` | claude-sonnet-4-6 |
| SOP generation | `/api/blueprint/generate-sop` | claude-sonnet-4-6 |

**Critical:** Response field is `reply`, NOT `response` or `message`. Every frontend call must use `j.reply`.

---

### HOME DASHBOARD 🔴

**Route:** `/home`
**File:** `src/pages/Home.jsx`
**Current state:** Minimal stub

**Home Dashboard Build Prompt (for HUB BUILDER):**
```
Task: Build the Home dashboard — meaningful director + staff landing page.

Context:
- Home.jsx is currently a stub. It should be the first thing a user sees after login.
- ProjectContext and ProjectBar are available (project selection is global)
- All data is accessible via existing endpoints

Layout concept:
┌─ Good morning, Sam ──────────────────────────────────┐
│  [today's date]   [project: 21 Folkstone Rd ▼]      │
└──────────────────────────────────────────────────────┘

Row 1 — Requires action (pull from requires-action endpoints):
- Invoices pending approval (count + oldest)
- Overdue progress claims (count)
- RFQs awaiting quotes (count)
- Leads needing follow-up (count — leads not updated in 7+ days)

Row 2 — Today's schedule (for selected project):
- Tasks starting today or overdue (from schedule_tasks)
- Site diary: did today's diary get submitted? (if not, link to diary)

Row 3 — Active jobs snapshot (top 3 by margin risk):
- Address, forecast margin, WIPAA age
- Link to /finance/jobs/:jobId for each

Row 4 — Pipeline snapshot:
- Leads by stage (counts only, no names)
- Link to /sales

All data via existing endpoints — no new backend needed except possibly a
GET /api/home/summary that aggregates the requires-action data in one call.

RequireAuth is already wired. Mobile-responsive is important for site staff.
```

---

### MARKETING + VIDEO PRODUCTION 🔴

**Route:** `/marketing`
**Auth:** `requireAuth` — admin + supervisor only
**NOT Blueprint.** Separate route, separate system prompt, separate data. Blueprint is internal ops. Marketing writes for external audiences who have never heard of Blue Leaf.

**New server files:**
- `server/lib/marketingRoutes.mjs` — register in `dev-api.mjs`
- `server/lib/marketingAgent.mjs` — system prompt + mode router (6 generators + 7 review checks)
- `server/lib/marketingMedia.mjs` — upload handler + full video pipeline

**New frontend files:**
- `src/pages/Marketing.jsx` — main shell, tab nav
- `src/components/marketing/ContentGenerator.jsx` — 6-mode content creation
- `src/components/marketing/ReviewPanel.jsx` — inline review scores
- `src/components/marketing/MediaUpload.jsx` — upload + auto-pipeline trigger
- `src/components/marketing/FinalAssembly.jsx` — human approval screen before export
- `src/components/marketing/ContentLibrary.jsx` — filter/browse approved content
- `src/components/marketing/MusicLibrary.jsx` — curated track picker

**DB:** `marketing_campaigns`, `marketing_content_items`, `marketing_media_assets`, `marketing_media_exports`, `marketing_music_library` (migration 046)

**Video processing tools (all free/near-zero, run on Railway):**

| Tool | Purpose | Cost |
|------|---------|------|
| FFmpeg | Cut, merge, trim, reformat, LUT, smart crop, captions, timelapse | Free |
| DJI D-Log M LUT | Colour grade DJI Mini Pro 5 footage automatically | Free (official DJI file) |
| Blue Leaf brand LUT | Consistent visual tone across all content | Free (configured once) |
| Remotion | Animated branded intro, lower thirds, outro — React-rendered | Free (self-hosted) |
| FFmpeg minterpolate | Timelapse smoothing (frame interpolation, no Python dependency) | Free |
| Whisper API | Audio transcription → SRT → burned captions | ~$0.50/month |
| YouTube Audio Library | Pre-curated free music tracks stored in Supabase Storage | Free |

**Stage 1 — NOT STARTED 🔴**
- [ ] Migration 046 applied
- [ ] `marketingRoutes.mjs` + `marketingAgent.mjs` + `marketingMedia.mjs` created
- [ ] Registered in `dev-api.mjs`
- [ ] `/marketing` route + `Marketing.jsx` shell + sidebar entry in `AppShell.jsx`
- [ ] Content generator (6 modes: website, social, email, client guide, CTA, basic photo → caption)
- [ ] Inline review panel (7 checkers run before user sees draft)
- [ ] Basic photo upload → Claude Vision analysis → caption ideas
- [ ] `marketing_content_items` + `marketing_campaigns` tables live

**Stage 2 — NOT STARTED 🔴**
- [ ] Full video pipeline (FFmpeg + LUT + Remotion + Whisper + reframe + timelapse)
- [ ] `marketing_media_assets` + `marketing_media_exports` + `marketing_music_library` tables
- [ ] DJI D-Log M auto-detection + LUT application
- [ ] Remotion templates (intro card, lower third, outro)
- [ ] Final Assembly screen (preview + music + colour + text edit + export)
- [ ] Music library (curated YouTube tracks, mood-tagged, Supabase Storage)
- [ ] Content library (filter by channel, status, campaign, project, tags)

**Stage 3 — PLANNED**
- [ ] Campaign management + calendar view
- [ ] Lead/job/project linkers (attach content to CRM records)
- [ ] Portal photo import with consent gate
- [ ] Nurture sequence attachment to lead stages

---

**MARKETING MODULE — STAGE 1 BUILD PROMPT (for HUB BUILDER)**

```
You are working inside the Blue Leaf Hub codebase.

Before writing any code, read:
  /AGENT_OVERVIEW.md
  /MASTER_PLAN.md (Marketing module section)
  /CLAUDE.md

Task: Build Marketing Module Stage 1.

━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL SEPARATION FROM BLUEPRINT
━━━━━━━━━━━━━━━━━━━━━━━━

Blueprint = internal ops coach for Sam and the team.
Marketing Agent = writes for external audiences who
have never heard of Blue Leaf.

They do NOT share:
  - system prompts
  - API routes (/api/blueprint vs /api/marketing)
  - UI location
  - tone or voice

Do not touch any Blueprint files. Do not reference
Blueprint's system prompt or voice in marketing prompts.

━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1: MIGRATION 046
━━━━━━━━━━━━━━━━━━━━━━━━

Create supabase/migrations/046_marketing_agent.sql

Tables needed for Stage 1:

  marketing_campaigns
    id uuid PRIMARY KEY DEFAULT gen_random_uuid()
    name text NOT NULL
    objective text
    channels text[] DEFAULT '{}'
    start_at date
    end_at date
    status text DEFAULT 'active'
      CHECK (status IN ('active','paused','complete','archived'))
    tags text[] DEFAULT '{}'
    created_by uuid REFERENCES auth.users(id)
    created_at timestamptz DEFAULT now()
    updated_at timestamptz DEFAULT now()

  marketing_content_items
    id uuid PRIMARY KEY DEFAULT gen_random_uuid()
    channel text NOT NULL
      CHECK (channel IN (
        'website','instagram','facebook',
        'email','client_guide','landing_page','other'))
    pillar text
      CHECK (pillar IN (
        'how_we_build','what_to_expect',
        'the_work','community_craft'))
    campaign_id uuid REFERENCES marketing_campaigns(id)
    project_id uuid REFERENCES projects(id)
    job_id uuid REFERENCES jobs(id)
    lead_id uuid REFERENCES leads(id)
    media_source_id uuid  -- FK to marketing_media_assets (Stage 2)
    topic text NOT NULL
    client_stage text
      CHECK (client_stage IN (
        'awareness','consideration','enquiry',
        'nurture','pre_construction',
        'on_site','post_handover'))
    title text
    body text
    cta text
    hashtags text[]
    structured_body jsonb DEFAULT '{}'
    status text NOT NULL DEFAULT 'draft'
      CHECK (status IN (
        'draft','in_review','approved',
        'published','archived'))
    review_scores jsonb DEFAULT '{}'
      -- { brand_voice, apb_reference, overpromise,
      --   lead_quality, specificity, local_relevance,
      --   educational_value }
    publish_date date
    reviewed_by uuid REFERENCES auth.users(id)
    approved_at timestamptz
    tags text[] DEFAULT '{}'
    performance_notes text
    version integer DEFAULT 1
    created_by uuid REFERENCES auth.users(id)
    created_at timestamptz DEFAULT now()
    updated_at timestamptz DEFAULT now()

RLS on both tables: authenticated only.
CREATE POLICY "auth_users" ON marketing_campaigns
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
(same pattern for marketing_content_items)

Indexes:
  CREATE INDEX idx_mkt_content_channel
    ON marketing_content_items(channel);
  CREATE INDEX idx_mkt_content_status
    ON marketing_content_items(status);
  CREATE INDEX idx_mkt_content_campaign
    ON marketing_content_items(campaign_id);

━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2: SERVER FILES
━━━━━━━━━━━━━━━━━━━━━━━━

Create server/lib/marketingAgent.mjs

This file contains:
  - MARKETING_SYSTEM_PROMPT (full system prompt below)
  - CONTENT_PILLARS definition
  - MODE_PROMPTS for each of the 6 generators
  - runReviewChecks(draft, channel) function
  - generateContent(mode, context, userRequest) function

MARKETING_SYSTEM_PROMPT must contain:

  WHO BLUE LEAF IS:
  High-end Adelaide residential builder.
  Custom homes and architecturally designed homes.
  Craftsmanship, weather-tightness, passive design
  principles, better building practice as standard.
  Core message: Blue Leaf builds better as standard.
  Director: Sam Morris.
  Location: Adelaide, South Australia.

  VOICE PROFILE:
  Writes like a senior builder who is also genuinely
  interested in architecture and materials.
  Not a marketer. Not a salesperson.
  Explains decisions, not just outcomes.
  Restrained, specific, confident.

  DO: specific construction details, material choices,
  method reasoning, honest timelines, Adelaide-specific
  references, passive design education,
  "we decided to use..." framing, architect partnership
  language, site-specific observations.

  DON'T: "quality" as noun or adjective, "dream home",
  "stress-free", "trusted builder", "passion for building",
  urgency CTAs ("limited spots"), fear-based copy,
  generic claims any builder could make,
  opening with "At Blue Leaf Building, we...",
  APB or Association of Professional Builders
  (never in any public output — hard rule),
  fixed price or timeline guarantees,
  energy ratings without a cited source.

  DUAL JOB OF EVERY CONTENT PIECE:
  ATTRACT: clients who value craftsmanship, work with
  architects, have realistic expectations, are not
  shopping on price.
  REPEL: clients expecting the cheapest quote,
  impossible timelines, or who are not the right fit.
  Content that does both is better than content that
  only sounds professional.

  CONTENT PILLARS (ask which pillar before which channel):
  how_we_build (40%) — construction methods, building
    envelope, materials, why we do it this way
  what_to_expect (30%) — pre-construction, decisions,
    timelines, honest cost factors
  the_work (20%) — project progress, completions,
    proof without hard sell
  community_craft (10%) — Adelaide-specific, architect
    relationships, local materials, SA building conditions

  CLIENT STAGE RULES:
  awareness: no CTAs, educational only, demonstrate
    expertise, never mention process or pricing
  consideration: gentle proof, process transparency,
    what-to-expect framing
  enquiry/nurture: direct, addresses specific anxieties,
    light CTA to continue conversation only
  pre_construction/on_site: client-facing guides,
    what is happening and why, confidence-building
  post_handover: review prompts, referral-ready,
    testimonial seeding

  OUTPUT FORMAT:
  Always return JSON:
  {
    "title": "",
    "body": "",
    "cta": "",
    "hashtags": [],
    "alt_text": "",
    "notes": ""
  }

  For email sequences return array of
  { subject, preview_text, body, cta } objects.

MODE_PROMPTS — one for each generator:

  website: Include Adelaide local SEO signals naturally
  (suburb names, "custom home builder Adelaide",
  "architecturally designed homes SA"). F-pattern
  scannable. 15-word hero headline max. One primary CTA.

  social_instagram: 150-200 words max. Single idea.
  Strong specific opening hook (not a question).
  5-8 hashtags, local-first (#adelaidehomes,
  #adelaidebuilder, #customhomesadelaide).

  social_facebook: Slightly longer than Instagram.
  More conversational. Educational angle preferred.

  email: 3-5 email sequence. One email per stage
  of the nurture journey. Subject under 50 chars.
  Single CTA per email. No hard sell.

  client_guide: Practical, educational sections.
  Genuine information a client needs.
  Not a sales brochure dressed as a guide.

  cta: Low-pressure, filtering.
  "If you're working with an architect or considering
  one, we'd like to have a conversation."
  Never urgency-based.

runReviewChecks(draft, channel) returns:
{
  brand_voice: { pass: bool, flags: [] },
  apb_reference: { pass: bool, matches: [] },
  overpromise: { pass: bool, flags: [] },
  lead_quality: { score: 1-10, notes: "" },
  specificity: { score: 1-10, pass: bool },
  local_relevance: { score: 1-10, pass: bool },
  educational_value: { score: 1-10, pass: bool },
  overall_pass: bool,
  block_reason: "" or null
}

apb_reference: regex check for "APB", "Association of
Professional Builders", any APB course names.
If any match: overall_pass = false, block_reason set.
Cannot be overridden. Approval blocked until removed.

specificity: score < 7 → flag (not hard block).
User sees warning but can override with justification.

---

Create server/lib/marketingRoutes.mjs

Endpoints (all behind requireAuth):

  POST /api/marketing/generate
    body: { mode, pillar, client_stage, context,
            campaign_id, project_id, job_id, topic,
            user_request }
    calls generateContent() from marketingAgent.mjs
    runs runReviewChecks() on output
    returns { content, review_scores }
    does NOT auto-save — user reviews first

  POST /api/marketing/content
    saves approved or draft content item
    body: full marketing_content_items fields
    returns saved record

  GET /api/marketing/content
    query params: channel, status, campaign_id,
    project_id, tags, limit, offset
    returns paginated list

  GET /api/marketing/content/:id
    single item

  PUT /api/marketing/content/:id
    update (status change, edits, approve)
    if status → approved: sets approved_at + reviewed_by

  DELETE /api/marketing/content/:id
    soft delete (status → archived)

  POST /api/marketing/campaigns
  GET  /api/marketing/campaigns
  PUT  /api/marketing/campaigns/:id

  POST /api/marketing/media/analyse-photo
    body: multipart — image file
    calls Claude Vision with construction analysis prompt
    returns analysis JSON (see media prompt below)
    does NOT save — user reviews first

Register in server/dev-api.mjs:
  import { registerMarketingRoutes }
    from "./lib/marketingRoutes.mjs";
  registerMarketingRoutes(app);

━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3: PHOTO ANALYSIS PROMPT
━━━━━━━━━━━━━━━━━━━━━━━━

Used in POST /api/marketing/media/analyse-photo
Model: claude-sonnet-4-6 with vision

System context: You are analysing construction site
photography for Blue Leaf Building, a high-end
Adelaide residential builder. Your job is to identify
what is visible and what content opportunities exist.
Be specific about construction details. Flag anything
that should not be published.

Output JSON:
{
  "project_stage": "frame|lock_up|fit_out|
    completion|site_prep|slab|unknown",
  "workmanship_observations": [],
  "weather_tightness_details": [],
  "passive_design_details": [],
  "construction_methods": [],
  "educational_angles": [],
  "caption_ideas": [
    { "platform": "instagram",
      "text": "",
      "angle": "",
      "pillar": "" }
  ],
  "website_content_ideas": [],
  "client_guide_topics": [],
  "visual_quality": "high|medium|low",
  "brand_fit": "strong|moderate|weak",
  "lead_quality_potential": "high|medium|low",
  "risks": [],
  "do_not_publish": false,
  "do_not_publish_reason": ""
}

━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4: FRONTEND
━━━━━━━━━━━━━━━━━━━━━━━━

src/pages/Marketing.jsx
  Tab nav: Create | Library | Campaigns | Media
  Sidebar entry: "Marketing" — admin + supervisor only
  Add to AppShell.jsx DEPARTMENTS array

src/components/marketing/ContentGenerator.jsx
  Left panel:
    Channel selector (icons for each channel)
    Pillar selector (4 pills)
    Client stage selector (7 options)
    Campaign picker (dropdown, optional)
    Project/job picker (optional, reads existing jobs)
    Topic input (free text)
    Prompt input ("what do you want to say?")
    Generate button

  Right panel (after generation):
    Preview of generated content
    ReviewPanel component (inline scores display)
    Edit area (user can edit before saving)
    Save as draft button
    Approve button (disabled if apb_reference fails)

src/components/marketing/ReviewPanel.jsx
  Shows all 7 review scores inline
  apb_reference fail: red banner, approve blocked
  specificity < 7: amber warning, approve allowed
  Other fails: amber warnings, approve allowed
  Pass: green indicators

src/components/marketing/ContentLibrary.jsx
  Filter bar: channel, status, campaign, tags
  Card grid (reuse Sales Pipeline card pattern)
  Card: title, channel badge, status badge, date,
    pillar tag, action buttons (edit, approve, copy)
  List view toggle (reuse existing pattern)

src/components/marketing/MediaUpload.jsx (Stage 1 — photo only)
  Drag-drop or file picker (images only in Stage 1)
  On upload: POST to /api/marketing/media/analyse-photo
  Show analysis results in structured panel
  "Generate content from this" button →
    pre-fills ContentGenerator with analysis data

━━━━━━━━━━━━━━━━━━━━━━━━
STYLE + PATTERNS
━━━━━━━━━━━━━━━━━━━━━━━━

Reuse existing Hub patterns:
  rounded-card, Lato font, primary #006c9b
  Card/list toggle — same as SalesPipeline
  Slide-in right panel — same as Blueprint Insight
  requireAuth middleware — same as all other modules

Do not invent new design patterns.

━━━━━━━━━━━━━━━━━━━━━━━━
VALIDATION BEFORE MARKING COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━

Stop after Stage 1 is built. Ask permission to test:
  - Generate Instagram caption → confirm specificity
    score appears, APB checker runs
  - Type "APB" in a draft → confirm approve is blocked
  - Upload a site photo → confirm analysis returns
    construction-specific observations
  - Save draft → confirm appears in Content Library
  - Approve content → confirm reviewed_by + approved_at set
  - Confirm Blueprint module is completely untouched
  - Run npm run lint → zero warnings

━━━━━━━━━━━━━━━━━━━━━━━━
BEFORE DEPLOYMENT — MANDATORY
━━━━━━━━━━━━━━━━━━━━━━━━

Do not deploy Stage 1 to production.
Pass all code to TROUBLESHOOT AGENT first.

Hand over:
  - All new files created in this stage
  - All modified files (dev-api.mjs, AppShell.jsx)
  - Migration 046 SQL
  - The validation test checklist above

TROUBLESHOOT AGENT must confirm:
  - No regressions in existing modules
  - All endpoints return correct status codes
  - Review checks fire correctly on every generate call
  - APB hard-block cannot be bypassed
  - lint passes with zero warnings
  - Blueprint is untouched

Only after TROUBLESHOOT AGENT sign-off
does this stage go to production.
```

---

**MARKETING MODULE — STAGE 2 BUILD PROMPT (for HUB BUILDER)**

```
You are working inside the Blue Leaf Hub codebase.

Before writing any code, read:
  /AGENT_OVERVIEW.md
  /MASTER_PLAN.md (Marketing module section)
  /CLAUDE.md
  server/lib/marketingRoutes.mjs (Stage 1 — already built)
  server/lib/marketingAgent.mjs  (Stage 1 — already built)

Task: Build Marketing Module Stage 2 — full video pipeline
+ content library upgrades + music library.

Stage 1 must be complete and passing lint before starting.

━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1: MIGRATION 046 ADDITIONS
━━━━━━━━━━━━━━━━━━━━━━━━

Add to migration 046 (or create 047 if 046 is already
applied to production):

  marketing_media_assets
    id uuid PRIMARY KEY DEFAULT gen_random_uuid()
    storage_path text NOT NULL
      -- Supabase Storage path
    storage_bucket text DEFAULT 'marketing-media'
    mime_type text NOT NULL
    media_type text NOT NULL
      CHECK (media_type IN (
        'photo','video','drone_video','timelapse',
        'testimonial_video','transcript','notes'))
    original_filename text
    file_size_bytes bigint
    duration_seconds numeric
    project_id uuid REFERENCES projects(id)
    job_id uuid REFERENCES jobs(id)
    capture_date date
    is_dji_dlog_m boolean DEFAULT false
      -- auto-detected from file metadata
    stage_detected text
    analysis jsonb DEFAULT '{}'
    thumbnail_path text
    consent_for_marketing boolean DEFAULT false
    created_by uuid REFERENCES auth.users(id)
    created_at timestamptz DEFAULT now()

  marketing_media_exports
    id uuid PRIMARY KEY DEFAULT gen_random_uuid()
    media_asset_id uuid NOT NULL
      REFERENCES marketing_media_assets(id)
    content_item_id uuid
      REFERENCES marketing_content_items(id)
    export_format text NOT NULL
      CHECK (export_format IN (
        '9x16','1x1','16x9','4x5'))
    storage_path text
    status text DEFAULT 'processing'
      CHECK (status IN (
        'processing','ready','failed'))
    pipeline_log jsonb DEFAULT '[]'
      -- step-by-step processing record
    music_track_id uuid
      REFERENCES marketing_music_library(id)
    music_volume numeric DEFAULT 0.6
    colour_preset text DEFAULT 'brand'
      CHECK (colour_preset IN (
        'brand','warm','natural'))
    captions_burned boolean DEFAULT false
    created_at timestamptz DEFAULT now()

  marketing_music_library
    id uuid PRIMARY KEY DEFAULT gen_random_uuid()
    title text NOT NULL
    artist text
    source text DEFAULT 'youtube_audio_library'
    storage_path text NOT NULL
      -- Supabase Storage path
    duration_seconds numeric
    mood text
      CHECK (mood IN (
        'calm_educational','confident_progress',
        'warm_handover'))
    bpm integer
    is_active boolean DEFAULT true
    added_by uuid REFERENCES auth.users(id)
    created_at timestamptz DEFAULT now()

RLS on all three: authenticated only (same pattern).

━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2: VIDEO PIPELINE SERVER FILE
━━━━━━━━━━━━━━━━━━━━━━━━

Create server/lib/marketingMedia.mjs

Dependencies required (add to package.json):
  fluent-ffmpeg       — FFmpeg Node.js wrapper
  @ffmpeg-installer/ffmpeg — bundled FFmpeg binary
  remotion            — programmatic video rendering
  @remotion/renderer  — Remotion render engine
  openai              — Whisper transcription
    (already installed if used elsewhere — check first)
  sharp               — thumbnail generation

LUT FILES — store in server/luts/:
  dji_dlog_m_to_rec709.cube
    Download: DJI official LUT (free, public)
    URL: https://dl.djicdn.com/downloads/mini_4_pro/
         DJI_Mini_4_Pro_D-Log_M_LUT.zip
    Note: DJI Mini Pro 5 uses same D-Log M profile
    Store the .cube file in server/luts/
    Never commit to git — add to .gitignore
    Load from filesystem on Railway

  bluelaf_brand.cube
    Created once by Sam or designer (warm/natural tone)
    Store same location
    Can be a simple warm-neutral grade as starting point

REMOTION TEMPLATES — create in server/remotion/:
  templates/LowerThird.jsx
    Props: suburb, build_stage, week_number (optional)
    Animated slide-up, 3 seconds, Blue Leaf font/colours
    Semi-transparent dark background strip
  templates/BrandedOutro.jsx
    Props: website_url, phone (optional)
    3 seconds, Blue Leaf logo + contact details
  templates/BrandedIntro.jsx
    Props: (none required — just logo)
    2 seconds, Blue Leaf logo fade in

marketingMedia.mjs must export:

  detectDLogM(filePath)
    Reads MP4/MOV metadata using ffprobe
    Returns boolean — true if D-Log M detected
    DJI writes color_space or color_transfer tags

  extractFrames(filePath, intervalSeconds = 5)
    Returns array of temp image paths

  analyseFramesWithClaude(framePaths, projectContext)
    Sends frames to Claude Vision (claude-sonnet-4-6)
    Returns structured analysis JSON
    (same schema as photo analysis in Stage 1)

  identifyBestSegments(analysis, targetDurationSecs = 30)
    Returns array of { startSec, endSec, reason }
    Based on Claude's frame analysis scores

  cutSegments(inputPath, segments, outputPath)
    FFmpeg: cuts and concatenates identified segments

  applyLUTs(inputPath, isDLogM, colourPreset, outputPath)
    If isDLogM: apply dji_dlog_m_to_rec709.cube first
    Then apply bluelaf_brand.cube variant
    (warm/natural/brand — three LUT variants of brand file)

  smartReframe(inputPath, targetAspect, outputPath)
    FFmpeg: subject-aware crop for 9:16 output
    Uses FFmpeg cropdetect + motion analysis
    Target aspect: '9:16' | '1:1' | '16x9' | '4:5'

  renderRemotionOverlays(
    inputPath, outputPath,
    { suburb, build_stage, week_number, show_outro })
    Remotion renders lower third + outro as transparent
    overlay video, FFmpeg composites onto main clip

  transcribeAudio(filePath)
    OpenAI Whisper API (model: whisper-1)
    Returns SRT string

  burnCaptions(inputPath, srtContent, outputPath)
    FFmpeg: burns SRT into video
    Blue Leaf caption style:
      font: Lato, size 18, white with dark shadow
      position: bottom centre, 10% from bottom

  smoothTimelapse(framePaths, outputPath, fps = 24)
    FFmpeg minterpolate filter (not RIFE — no Python needed)
    Assembles frames → smooth timelapse at 24fps
    Applies LUT after assembly

  generateThumbnail(videoPath, atSecond, outputPath)
    FFmpeg: extract single frame as JPEG
    Used for content library preview

  runFullDronePipeline(filePath, projectContext, options)
    Orchestrates the full drone auto-pipeline:
      1. detectDLogM()
      2. extractFrames(5s intervals)
      3. analyseFramesWithClaude()
      4. identifyBestSegments()
      5. cutSegments()
      6. applyLUTs()
      7. smartReframe() — creates 9:16 version
      8. renderRemotionOverlays()
      9. transcribeAudio() if speech detected
      10. burnCaptions() if transcription returned
      11. generateThumbnail()
    Returns { analysis, exports: { '9x16': path,
      '16x9': path }, thumbnail, captions_srt }
    Saves to marketing_media_assets + marketing_media_exports
    Status: processing → ready (or failed with log)

━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3: NEW API ENDPOINTS
━━━━━━━━━━━━━━━━━━━━━━━━

Add to marketingRoutes.mjs:

  POST /api/marketing/media/upload
    Accepts: multipart file (image or video)
    Saves to Supabase Storage bucket 'marketing-media'
    Detects file type (image → analyse only,
      video → trigger pipeline)
    For images: runs analyse-photo (same as Stage 1)
    For video: runs runFullDronePipeline() async
      Returns immediately with { media_asset_id, status: 'processing' }
      Pipeline updates status to 'ready' when complete

  GET /api/marketing/media/:id
    Returns media_asset + all exports

  GET /api/marketing/media/:id/status
    Pipeline progress check (processing/ready/failed)
    Returns pipeline_log for progress display

  POST /api/marketing/media/:id/export
    Trigger additional export format
    body: { format, colour_preset, music_track_id,
            music_volume, show_captions }

  POST /api/marketing/media/:id/consent
    Set consent_for_marketing = true/false
    Required before content can use this media

  GET /api/marketing/music
    List music library (mood filter available)

  POST /api/marketing/music
    Upload new track (admin only)
    Saves to Supabase Storage 'marketing-music'
    Saves record to marketing_music_library

  POST /api/marketing/assemble
    Final assembly — apply music + export final cut
    body: { export_id, music_track_id, music_volume,
            colour_preset, export_formats[] }
    Returns: final export paths per format

━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4: FINAL ASSEMBLY SCREEN
━━━━━━━━━━━━━━━━━━━━━━━━

src/components/marketing/FinalAssembly.jsx

Props: mediaAssetId, contentItemId (optional)

Layout:
  Left: video preview player (HTML5 video, auto-play muted)
  Right panel:
    Music section:
      Mood filter tabs (Calm | Confident | Warm)
      Track list (title, artist, duration, play button)
      Selected track indicator
      Volume slider (music vs ambient, default 0.6)
    Colour preset:
      3 buttons: Brand Standard / Warm / Natural
    Text overlays:
      Review lower-third text (suburb, stage)
      Edit inline before render
    Caption toggle:
      Show/hide burned captions (if transcription exists)
    Export formats:
      Checkbox: 9:16 Reels ✓ (default on)
      Checkbox: 1:1 Feed
      Checkbox: 16:9 Website
      Checkbox: 4:5 Facebook
    Approve + Export button:
      Disabled until music selected
      On click: POST /api/marketing/assemble
      Shows progress bar during export
      On complete: download links per format
        + content moved to approved in library

Nothing exports without this screen being completed.
Music selection is always human — never auto-applied.

━━━━━━━━━━━━━━━━━━━━━━━━
SUPABASE STORAGE BUCKETS
━━━━━━━━━━━━━━━━━━━━━━━━

Create two buckets in Supabase Storage:

  marketing-media (private)
    Raw uploads, processed exports, thumbnails
    Folder structure:
      raw/{year}/{month}/{uuid}_original.mp4
      exports/{year}/{month}/{uuid}_{format}.mp4
      thumbnails/{uuid}.jpg

  marketing-music (private)
    Pre-downloaded YouTube Audio Library tracks
    Folder structure:
      tracks/{mood}/{title}.mp3
    Seed with initial curated tracks (see below)

Initial music track seed (download from YouTube
Audio Library before seeding — these are examples
of the type, not exact titles — choose appropriate
tracks when building):
  calm_educational: 2-3 tracks (acoustic, understated)
  confident_progress: 2-3 tracks (upbeat, forward-moving)
  warm_handover: 2-3 tracks (warm, resolved, gentle)
Upload to Supabase Storage + insert to music_library table.

━━━━━━━━━━━━━━━━━━━━━━━━
VALIDATION BEFORE MARKING COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━

Stop after Stage 2. Ask permission to run full test:
  - Upload DJI drone footage → confirm D-Log M detected
  - Confirm LUT applied (check output visually)
  - Confirm 9:16 reframe generated
  - Confirm Remotion lower third rendered on clip
  - Confirm Whisper captions generated (if speech in test clip)
  - Open Final Assembly screen → confirm music picker works
  - Select music + approve → confirm export generated
  - Upload progress photos → confirm timelapse created
  - Confirm consent_for_marketing gate works
  - Run npm run lint → zero warnings

━━━━━━━━━━━━━━━━━━━━━━━━
BEFORE DEPLOYMENT — MANDATORY
━━━━━━━━━━━━━━━━━━━━━━━━

Do not deploy Stage 2 to production.
Pass all code to TROUBLESHOOT AGENT first.

Hand over:
  - All new files created in this stage
  - All modified files (marketingRoutes.mjs, package.json)
  - Migration additions (media + music tables)
  - The full validation test checklist above
  - A sample exported video file for review

TROUBLESHOOT AGENT must confirm:
  - FFmpeg pipeline completes without errors
  - D-Log M detection fires correctly on DJI footage
  - LUT application does not corrupt output file
  - Remotion renders complete and composite correctly
  - Whisper transcription returns valid SRT
  - Captions burn into video at correct position/style
  - Final Assembly screen blocks export without music
  - Consent gate prevents unapproved media use
  - Storage buckets accept uploads and return paths
  - No regressions in Stage 1 or any existing module
  - lint passes with zero warnings

Only after TROUBLESHOOT AGENT sign-off
does this stage go to production.
```

---

## SYSTEM AUDIT FINDINGS — 2026-05-23
> Source: TROUBLESHOOT AGENT full system audit
> Planning Agent corrections applied below — read these BEFORE implementing fixes

---

### ⚠ PLANNING AGENT CORRECTIONS TO AUDIT RECOMMENDATIONS

**C-01 — requireAuth implementation method is WRONG in the audit**
The audit recommends adding a global `app.use(['/api/sales', ...], requireAuth)` after route registration. **This will not work in Express** — middleware added after routes are registered does not apply to those routes. They have already been handled.

**Correct approach:** Add `requireAuth` as the second argument directly on each individual route handler in every unprotected route file. Use `marketingRoutes.mjs` as the reference pattern — it correctly applies `requireAuth` per route. Do NOT use a global `app.use()` shortcut.

Files that need per-route requireAuth added:
- `server/lib/salesRoutes.mjs`
- `server/lib/financeRoutes.mjs`
- `server/lib/financeCCRoutes.mjs`
- `server/lib/module4Routes.mjs`
- `server/lib/module6Routes.mjs`
- `server/lib/jobsApiRoutes.mjs`
- `server/lib/operationsRoutes.mjs`
- `server/lib/buildexactIntegrationRoutes.mjs`
- `server/lib/scheduleRoutes.mjs`

Exception: public routes that must remain unauthenticated:
- `POST /api/auth/*` (login/signup)
- `GET /induct/:projectId` (site induction QR — public by design)
- `GET /portal/*` (client portal — token-auth, not JWT)

---

**C-03 — Director Portfolio fix needs cleaner implementation**
The audit's `?portfolio=true` query param is fragile. Correct fix:

1. In `src/App.jsx` — split the route into two:
   - `/finance/jobs` → `JobDashboardSelector` with prop `forcePortfolio={true}` (skips auto-redirect)
   - `/finance/jobs/:jobId` → `JobCommandCentre` directly (no selector needed)

2. In `JobDashboardSelector.jsx` — only auto-redirect when `forcePortfolio` prop is false (default behaviour for sidebar nav)

3. In `JobCommandCentre.jsx` — add `← Portfolio` breadcrumb link at top that navigates to `/finance/jobs` with `forcePortfolio={true}`

---

**M-11 — MISSING FROM AUDIT: PTSA sent date never auto-sets**
When `ptsa_status` changes to `"sent"` in the PTSA status select in `src/pages/LeadDetail.jsx` (around line 1067), `ptsa_sent_date` is never populated. Add to the fix list:

In `LeadDetail.jsx`, find the PTSA status select onChange and replace:
```js
onChange={e => patch({ ptsa_status: e.target.value })}
```
with:
```js
onChange={e => {
  const updates = { ptsa_status: e.target.value };
  if (e.target.value === "sent" && !lead.ptsa_sent_date) {
    updates.ptsa_sent_date = new Date().toISOString().slice(0, 10);
  }
  patch(updates);
}}
```

---

### AUDIT ISSUES TABLE (from TROUBLESHOOT AGENT)

| ID | Severity | Issue | Recommended fix |
|----|----------|-------|-----------------|
| C-01 | CRITICAL | API-wide auth breach — Sales, Finance, Operations, RFQ, Jobs routes serve data unauthenticated | Add `requireAuth` per-route in each file — see correction above |
| C-02 | CRITICAL | Forecast margin shows -11,832% (contract $11,900 vs forecast $1.4M from different sources) | Guard in UI: if `|forecast_margin_pct| > 200` show "⚠ Data mismatch — check Buildxact sync". Add `data_quality_warning` flag on server response |
| C-03 | CRITICAL | Director Portfolio unreachable — auto-redirect bypasses it when project in context | Split routes in App.jsx — see correction above |
| C-04 | CRITICAL | Duplicate job records for same address ("21 Folkestone Rd" variants) | One-time SQL dedup keeping record with most data. Add normalised address UNIQUE constraint |
| M-01 | MODERATE | Cost Intelligence Trends + Pre-Tender tabs are still stubs — backend done, frontend not wired | Wire frontend in `CostIntelligence.jsx` — see BQ-3 prompt |
| M-02 | MODERATE | Cashflow always blank — no progress claims have due_date, no pending_approval invoices | Expected for new system. Add in-UI hint: "Cashflow populates as claims are issued with due dates" |
| M-03 | MODERATE | Home dashboard shows $0 contract for all jobs | Show "Contract TBC" when `contract_value` is null |
| M-04 | MODERATE | Lead names not normalised on save ("bill" not "Bill") | Auto-capitalise `first_name` and `last_name` on save in `salesRoutes.mjs` PATCH handler |
| M-05 | MODERATE | Close rate = 0%, FP hit rate = 0% on dashboard — no context | Show "No completed deals yet — stats will populate as leads are won" when `won_last_12m.count === 0` |
| M-06 | MODERATE | Xero integration is a stub | Deferred — Finance Stage 3 |
| M-07 | MODERATE | No calendar integration — next_action_date is dead data | Deferred — future roadmap |
| M-08 | MODERATE | Supabase Storage RLS missing — media uploads fail | Add 3 SQL policies for `marketing-media` bucket in Supabase dashboard |
| M-09 | MODERATE | No nodemon — stale server binary during dev | Add `"dev:api": "nodemon --watch server server/dev-api.mjs"` to `package.json` |
| M-10 | MODERATE | 3 of 4 leads have no job_id at advanced stages | Add automation: fee proposal acceptance → auto-create Buildxact job + link lead.job_id |
| M-11 | MINOR | PTSA sent date never auto-sets when status → sent | See Planning Agent correction above |
| m-01 | MINOR | Mobile bottom nav: 6 items compress unreadably | Remove "Clients" from bottom nav — accessible via sidebar only |
| m-02 | MINOR | "$2.4M weighted" — no tooltip explaining APB weighting model | Add tooltip/info icon showing APB probability % by stage |
| m-03 | MINOR | "bill Hartley" case bug visible on pipeline cards | Covered by M-04 fix |
| m-04 | MINOR | Home Active Jobs filters to project-linked jobs only — shows 1 of 5 | Show all jobs, use address as fallback if no project link |
| m-05 | MINOR | Quick Links "New Lead" just navigates — doesn't open form | Pass `{ state: { openNewLead: true } }` on navigate, check in SalesPipeline.jsx |
| m-06 | MINOR | Cost Intelligence: no empty-state message when no data | Add "Select a job with cost data to view comparisons" |
| m-07 | MINOR | Site induction URL not surfaced in Operations UI | Add QR code display + copyable link in Operations project detail |
| m-08 | MINOR | Marketing review "Educational Value: 1/10" — no guidance | Add tooltip: "Educational Value measures whether the post teaches something useful. Score under 5 = revise to include a tip or insight." |
| m-09 | MINOR | Supabase Storage RLS (duplicate of M-08) | Covered by M-08 |
| m-10 | MINOR | Buildxact sync is fire-and-forget with no status | Show spinner + "Last synced at [time]" after sync |

### PRIORITY ORDER FOR TROUBLESHOOT AGENT

1. **C-01** — requireAuth per-route (follow correction above — NOT global app.use())
2. **M-08** — Supabase Storage RLS (10 min, SQL only)
3. **M-09** — Add nodemon (2-line package.json change)
4. **C-03** — Director Portfolio route fix (follow correction above)
5. **C-02** — Forecast margin guard + server data_quality_warning flag
6. **M-11** — PTSA sent date auto-set (1-line fix in LeadDetail.jsx)
7. **M-03** — Home dashboard "Contract TBC" null guard
8. **M-04** — Lead name auto-capitalise on save
9. **m-01** — Remove "Clients" from mobile bottom nav
10. **m-05** — Quick Links "New Lead" open form on navigate
11. **m-10** — Buildxact sync status feedback
12. **M-01** — BQ-3 frontend wiring (see BQ-3 build prompt — larger task)
13. **M-10** — Lead → Job auto-creation on fee proposal acceptance (larger task)

### AUTOMATION OPPORTUNITIES (from audit, for future backlog)

- Lead stage change → APB-aligned email sequence trigger
- Fee proposal accepted → auto-create Buildxact job + link lead.job_id
- Progress claim due in 7 days + unpaid → auto-email client
- Schedule milestone complete → auto-update client portal timeline
- Underclaim > 10% → email alert to Sam
- cost_benchmarks → nightly recompute cron (POST /api/cost-intelligence/benchmarks/recompute)
- Quote expiry alert when RFQ validity period nears end
- Duplicate lead detection on create (same phone/email)
- Media consent reminder after 7 days if consent_for_marketing = false

---

| ID | Severity | Module | Description | Fix |
|----|----------|--------|-------------|-----|
| ISSUE-001 | Medium | Deploy | `vercel.json` has `YOUR-RAILWAY-HOST` placeholder | Railway-only now — vercel.json is irrelevant but tidy it up |
| ISSUE-006 | Medium | All | No automated test suite for critical paths | Add integration tests for finance approval + RFQ send |
| ISSUE-007 | Low | Schedule | module6Routes.mjs was monolith | ✅ FIXED — now imports sub-files |
| ISSUE-008 | Low | Fee Proposals | DOCX template was in localStorage | ✅ FIXED — now Supabase Storage |
| ISSUE-009 | Low | Blueprint | Lint warnings in src/blueprint/ files | Pre-existing, low priority |
| ISSUE-014 | Low | Portal | No token expiry/revocation | Deferred to Sprint 5 |
| ISSUE-016 | Medium | Home | Home.jsx is a stub | ✅ FIXED — see BQ-2 |
| ISSUE-017 | Low | Supervisor | SupervisorHome.jsx separate entry point | Review if needed or merge |
| ISSUE-018 | Low | Xero | Credential table exists, no sync logic | Deferred to Finance Stage 3 |

**Previously flagged issues that are now FIXED:**
- ISSUE-002: AGENT_OVERVIEW.md stale schema — ✅ Updated to migration 045
- ISSUE-003: No FK between trade_categories ↔ trade_master_library — ✅ Fixed by migration 043
- ISSUE-005: RLS used anon access — ✅ Fixed by migration 044

---

## ARCHITECTURE RULES FOR ALL AGENTS

These are non-negotiable. Reference them before every build.

### Data Integrity
- `jobs.contract_value` is trigger-maintained — never compute by summing variations ad-hoc
- Unsigned variations NEVER appear in P&L (`status='signed'` only)
- Cumulative claimed: only `issued/overdue/partially_paid/paid/disputed` — never drafts or void
- `original_budget` in job_budgets: set once at seed, never updated by any endpoint
- Trade required before invoice approval — API returns 400 if `trade_category_id` null

### Auth
- Server: service role key (bypasses RLS). Frontend: anon key (RLS applies).
- Never use service role key in VITE_* variables.
- `requireAuth.mjs` validates Supabase Bearer JWT — apply to all business API routes.
- After migration 044: all tables require `auth.uid() IS NOT NULL` (no anon access).

### External Services
- Dropbox reads: ALWAYS sequential `for...of` loop — never `Promise.all` (Smart Sync online-only files fail concurrently)
- Gmail send: always via `sendPlainMail()` in `notifyMail.mjs` (prefers OAuth, falls back SMTP)
- Buildexact: token refresh via `beFetch()` in `buildexactClient.mjs`

### AI
- Blueprint chat response field: `j.reply` — NOT `j.response` or `j.message`
- Claude models: opus-4-5 for transcript analysis, sonnet-4-6 for everything else
- AI always suggests — human always confirms. Never auto-apply AI output.

### UI Patterns
- Card/list toggle: established in SalesPipeline — replicate for Operations if adding grid view
- Slide-in right panel: Blueprint Insight pattern — use for AI conversation panels
- Finance numbers: always show ex-GST and inc-GST separately. Never mix.
- Mobile-aware: site workflows (diary, WHS, inductions, home) must work on mobile.

---

## AGENT COORDINATION

### Planning Agent (this agent)
- Owns this document. Updates status after each build session.
- Writes build prompts for HUB BUILDER.
- Writes troubleshoot prompts for TROUBLESHOOT AGENT.
- Does not write code.

### HUB BUILDER
- Reads build prompts from this document.
- Checks off items when complete.
- Reports any blockers back to Planning Agent.
- Files to always read first: `AGENT_OVERVIEW.md`, `CLAUDE.md`, relevant module files.

### TROUBLESHOOT AGENT
- Diagnoses issues reported by HUB BUILDER or Sam.
- References KNOWN ISSUES table.
- Reports resolution back to Planning Agent who updates status.

---

## WINNING OFFER SYSTEM — DEFERRED ITEMS

### Plan C — Client-facing proposal web page
**Trigger:** When Blue Leaf has 2–3 completed builds (under their own licence) with photos
in the marketing media library and client testimonials available.

**What it is:** Hub generates a unique URL (`/proposal/[token]`) for each lead at Winning
Offer stage. Client opens it on any device — branded page with photos, their brief
reflected back, reference projects, process overview, PTSA CTA. Trackable (logs first view).

**Why deferred:** Not worth building against supervised-only reference projects. The
visual impact requires completed Blue Leaf builds with real photos. When the first 2–3
new builds are at handover, revisit this and build Phase 4.

**What to build then:**
- Public route `/proposal/:token` — no auth required
- `proposal_views` log table (token, lead_id, viewed_at, ip)
- Hub generates token on "Send proposal" click, stores in `leads.wo_proposal_token`
- Page uses: wo_client_vision, wo_reference_project_ids, inclusions_summary, ptsa fee
- "Sign PTSA" CTA links to a DocuSign/PandaDoc link or email confirmation flow

---

## UPCOMING PLANNING WORK

These items need planning before they can be built:

1. **SOP documentation** — 82 SOPs planned, 6 written. Planning Agent to prioritise and draft Finance (09) + Operations (05-08) SOPs before staff onboarding.
2. **Xero integration** — Full planning needed. `xero_credentials` table exists. Need API OAuth flow + AP bill push + payment pull.
3. **Procurement Intelligence** — superseded → see **BQ-10** in the ESTIMATING OPERATING SYSTEM section (one-stop procurement hub in Operations, triggered at job-lock; source + output options under discussion 2026-06-03).
4. **Sprint 3 Dependencies** — Full planning in CLAUDE.md. Need to migrate `depends_on` array → `task_dependencies` JSONB with FS/SS/FF/SF types.
5. **Winning Offer — Phase 4 (proposal web page)** — See WINNING OFFER SYSTEM section above. Revisit when first Blue Leaf builds reach practical completion.

---

## MIGRATIONS LOG

| # | Applied | Description |
|---|---------|-------------|
| 001–030 | ✅ | Core schema — jobs, subs, RFQs, schedule, portal, RFQ packages |
| 031 | ✅ | Financial Command Centre — trade_categories, job_budgets, progress_claims, job_variations, wipaa_reviews |
| 032 | ✅ | Cost Intelligence Engine — project_metrics, normalized_costs, cost_benchmarks, cost_intelligence_insights, pretender_estimates |
| 033 | ✅ | trade_master_library (37 entries seeded) |
| 034–038 | ✅ | Contract value trigger, lead↔job link, address sync, schedule soft-delete, schedule trade_master FK |
| 039 | ✅ | rfq_packages.job_id NOT NULL |
| 040 | ✅ | email_delivery_events, trade library seed |
| 041 | ✅ | Diagnostic repair for 034-039 |
| 042 | ✅ | Budget seed helper SQL (21 Folkestone reference) |
| 043 | ✅ | trade_category_id FK on trade_master_library + rfq_trade_scopes (backfilled 37/37) |
| 044 | ✅ | RLS tightened — authenticated only on all tables |
| 045 | ✅ | PTSA fields on leads (ptsa_services, ptsa_scope_notes, ptsa_validity_days, ptsa_status, ptsa_sent_date, ptsa_special_terms, ptsa_credit_to_contract) |
| 046 | ✅ | Marketing module — marketing_campaigns, marketing_content_items, marketing_media_assets, marketing_media_exports, marketing_music_library |
| 047 | ✅ | Storage RLS — marketing-media bucket (authenticated upload/read/delete, public thumbnails) |
| 048 | 🔴 Pending | Winning Offer fields on leads (wo_*, ptsa_project_scope) + reference_projects table |

**Next migration needed:** 048 (Winning Offer — apply before running Phase 1 Cursor prompt).

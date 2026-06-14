# Procurement Intelligence — P1 Build Runbook (BQ-10)

> **Status:** PLANNING — the airtight build plan. No code yet.
> **Companion:** `PROCUREMENT_INTELLIGENCE_PLAN.md` (the A–T design / *what*). This doc is the *how* — the ordered, verifiable, miss-nothing build sequence.
> **Decided 2026-06-10 (Sam):** ① generation = **auto-draft on job-lock + a Regenerate button**; ② master template = **I draft, Sam marks long-lead/specials** (Part 4); ③ this session delivers **all of it** — whiteboard + runbook + matrix + template draft.
> **Migration number:** **085** (084 is workforce sync-mode; 083 the prior).

---

## PART 0 — How to use this runbook (the miss-nothing contract)

Three mechanisms make it *near-impossible to miss something through the build*:

1. **Every build step has a Definition of Done (DoD) + a test.** A step isn't "done" until its DoD checkboxes are all true and its test passes. You don't move to the next step on vibes.
2. **The traceability matrix (Part 3) maps every design requirement (A–T) → a build step → a test.** If a requirement has no step, that's a hole — the matrix makes the hole visible. Nothing in the design can silently fall out of the build.
3. **The data backbone is reviewed before code (Part 4).** The module can only catch what the template knows. Part 4 is drafted now and Sam-corrected *before* generation is built, so completeness is a planning decision, not an afterthought.

**Order is law.** Schema → Backfill → Generation → API → UI → Integrations → SOPs → Verify. Each phase depends on the prior one being green. Don't build UI against a schema that might still move.

**Standards (CLAUDE.md Law) that apply to every step below — non-negotiable:**
- Server: `ok()/err()` from `apiResponse.mjs`; `rowToCamel`/`rowsToCamel`; never raw PG errors.
- Frontend: `apiFetch/apiPost/apiPatch/apiDelete`; never `authFetch` in components.
- camelCase across the boundary; snake_case only in DB.
- Status enums from `constants.js` — add `PROCUREMENT_STATUS`, `PROCUREMENT_RISK`, `SUPPLY_TYPE`.
- Amounts ex-GST; `GST_RATE`/`incGst()`/`gstAmount()`.
- **Canonical Data Law:** `order_by_date` and committed/actual cost are **Generated** (computed, never stored-editable). Reuse `portal_decisions`, `supplier_trade_defaults`, `purchase_orders`, `trade_categories` — never duplicate.
- Role gate: cost/committed + PO approval = `admin` (via `useAuth().role` + server `requireRole`); register management = `admin`/`supervisor`.
- **SOP Law:** SOPs (with Section 14 test scripts) are written *during* the build — folder `docs/sops/15_procurement/`. The module is not done until they exist.

---

## PART 1 — HARD-PARTS WHITEBOARD (the tricky logic, decided)

The three places a procurement build usually goes wrong. Settle them here so the runbook steps are mechanical.

### 1.1 — The generation algorithm (auto-on-lock + regenerate, idempotent)

**Trigger (decided):** two entry points, one function.
- **Auto-draft on job-lock** — hook the existing lock action (the JobCommandCentre "🔒 Lock job" → sets `jobs.financial_locked`). On lock, fire `generateProcurementPlan(jobId, { mode: "auto" })`.
- **Regenerate button** — `POST /api/procurement/jobs/:jobId/generate` → same function, `{ mode: "manual" }`. Re-runnable any time (after the estimate lands, after a variation, after schedule changes).

> ⚠️ **Build-step check:** confirm the exact lock endpoint/handler before wiring (search `financial_locked` writers). If no single lock action exists, the auto-trigger falls back to a status hook (`won`/`accepted`) — but the **manual button is the guaranteed path** and must work standalone.

**The function is an UPSERT, never a blind insert** — this is the whole game. Regenerate must add newly-relevant items and refresh derived fields **without clobbering human edits or duplicating rows.**

```
generateProcurementPlan(jobId, { mode }):
  job        = getJob(jobId)                         // build_type, project_id, status
  buildType  = job.project_type                      // new_build | knockdown_rebuild | extension | renovation
  existing   = procurement_items WHERE job_id = jobId

  # ── SOURCE 1: template (always available — works pre-estimate) ──
  templ = procurement_templates
            WHERE is_active
            AND (applies_to_build_types IS NULL/empty OR buildType = ANY(applies_to_build_types))
  for t in templ:
     key = (job_id, source='template', source_ref=t.id)
     UPSERT procurement_items on key:
        ON INSERT  → seed from template (item_name, trade_category_id, default supply_type,
                                         lead_time_days, selection_required, match_existing, order_sequence)
        ON CONFLICT → refresh ONLY system-owned, non-edited fields (see "edit-preservation" below)

  # ── SOURCE 2: estimate (refines the real list — when it exists) ──
  if buildexactConfigured AND resolveBuildxactJobId(jobId):
     est = pullBuildexactEstimate(...)               // categories + line items (existing fn)
     for line in est.lineItems:
        tradeId = resolveTradeCategoryId(line.category)   // existing FK resolver
        key = (job_id, source='estimate', source_ref=line.ref)
        UPSERT: item_name=line.desc, trade_category_id=tradeId, cost_allowance=line.amount
        # if a template item already covers this trade+name closely → enrich it (set cost_allowance),
        # do NOT create a duplicate (see de-dup).

  # ── SOURCE 3: schedule (required-on-site dates) ──
  for item in procurement_items(jobId):
     task = best schedule_task for item.trade_category_id (phase/category match)
     if task: item.related_schedule_task_id = task.id
              item.required_on_site_date     = task.start_date      // input to Generated order_by_date

  # ── SOURCE 4: project facts / RFQ (optional enrich, P1-lite) ──
  # supplier hints from supplier_trade_defaults / rfqs by trade — set default supplier_id if confident.

  emit event 'procurement.plan_generated' (jobId, counts)
  return { created, refreshed, skipped, blocked }
```

**Edit-preservation rule (the anti-clobber contract).** Each item row carries `user_modified boolean DEFAULT false`. Any human edit via the API sets it true. On regenerate:
- **System-owned fields** (refreshed every run): `required_on_site_date`, `related_schedule_task_id`, `cost_allowance` (from estimate), and the **Generated** `order_by_date`/risk.
- **Human-owned fields** (never overwritten once `user_modified`): `required`, `supply_type`, `supplier_id`, `backup_supplier_id`, buffers, `notes`, `selection_*` overrides.
- A template item the user **deleted** (set `required=false` + `user_modified`) must **not** reappear on regenerate → upsert matches the existing row by key and respects `required=false`.

**De-dup.** One logical item = one row. Match precedence when reconciling template vs estimate vs manual: same `(job_id, trade_category_id)` AND fuzzy `item_name` match (normalised, like the address matcher) → enrich the existing row rather than insert. Estimate amount flows onto the template row; the row's `source` becomes `template+estimate`.

**Pre-estimate mode.** If no Buildxact estimate yet → template-only register (Source 1 + 3). Fully usable. The Command Centre shows "estimate not linked — quantities/allowances pending" but order-by dates and selection blockers already work. This is why **template-first** is the rule.

### 1.2 — Order-by / buffer math (the Generated date)

**One formula, computed — never hand-typed:**

```
order_by_date = required_on_site_date
                − supplier_lead_time_days        (supplier.usual_lead_time_days, overridable per item)
                − approval_buffer_days           (PO draft → approved → sent; default 5)
                − internal_review_buffer_days    (scope/selection sign-off; default 3)
```

**Implementation (Canonical Data Law-compliant): `order_by_date` is a Postgres `GENERATED ALWAYS … STORED` column.** `date − integer = date` is valid PG, so:

```sql
order_by_date date GENERATED ALWAYS AS (
  required_on_site_date
   - (COALESCE(lead_time_days,0) + COALESCE(approval_buffer_days,0) + COALESCE(internal_review_buffer_days,0))
) STORED
```

- Inputs are stored columns; the output is derived and **not editable** → satisfies "Generated, never stored editable."
- **When a schedule task moves**, the ripple machinery updates `required_on_site_date` (a Versioned input) → `order_by_date` auto-recomputes. No separate recompute job, no drift. Reuse the existing `previewRipple`/`procurementStatus` hooks in `scheduleUtils.js`.
- `required_on_site_date` NULL (no linked task yet) → `order_by_date` NULL → item shows as "needs a date" rather than a false risk.

**Buffer defaults (seed; per-item overridable):** `approval_buffer_days = 5`, `internal_review_buffer_days = 3`. Long-lead/imported items get larger supplier lead times from the template (Part 4).

**Risk status (separate dimension, computed in a function — NOT a generated column, because it depends on `today`):**

```
risk_status(item):
  if status in (delivered, closed)                          → on_track (done)
  if blocked by unmade selection AND order_by within 14d    → blocked
  if order_by_date < today AND status < order_confirmed     → critical
  if order_by_date − today ≤ 7d  AND status < po_sent        → at_risk
  if order_by_date − today ≤ 21d AND status < po_sent        → watch
  else                                                       → on_track
```

Computed on read (Command Centre query) and cached on the row via a nightly/﻿on-write refresh for sorting. **Never stored as the single truth** — recomputed because `today` moves.

**Edge: order-by already in the past at generation** (schedule compressed, long-lead item). The formula yields a past date → `risk_status = critical` immediately, surfaced top of the Command Centre with an explicit "already overdue at plan creation" badge. The system **flags**, it doesn't silently swallow it.

### 1.3 — `schedule_tasks.procurement_*` → register migration (no two-systems drift)

**The risk (Part R of the design):** two diverging order-by values — the old schedule fields vs the new register. **Mitigation: the register becomes the single source of truth; the schedule renders a *view* of it.**

**Backfill (in migration 085, idempotent):**
```
for each schedule_tasks row WHERE task_type='procurement' OR procurement_item IS NOT NULL:
   INSERT INTO procurement_items (job_id via project_id→job, trade_category_id via task phase/category,
       item_name=procurement_item, supplier hint=procurement_supplier,
       lead_time_days = COALESCE(procurement_lead_days, lead_time_weeks*7),
       related_schedule_task_id = task.id, required_on_site_date = task.start_date,
       status mapped from procurement_order_status (not_ordered→not_started, ordered→order_confirmed, …),
       source='schedule')
   ON CONFLICT (job_id, related_schedule_task_id) DO NOTHING   // re-runnable
```

**After backfill, flip the direction of truth:**
- The schedule UI's procurement column reads `procurement_items.order_by_date` (via a join on `related_schedule_task_id`), not `schedule_tasks.procurement_order_by`.
- `schedule_tasks.procurement_*` columns are **frozen** (kept for backfill provenance + rollback, written no more). Add a code comment + a deprecation note; do not drop in 085 (drop in a later cleanup migration once the register is proven live).
- Writing "ordered/delivered" status now happens on the register; if any existing schedule view still writes `procurement_order_status`, redirect it to the register endpoint.

> **Why not drop the old columns now?** Safety. Keep them one release for provenance + instant rollback. The traceability matrix (Part 3) has an explicit row to drop them later so it isn't forgotten.

---

## PART 2 — THE P1 BUILD RUNBOOK (ordered, atomic, each with DoD + test)

Phases A–H. **Do not start a phase until the previous phase's steps are all DoD-green.**

### Phase A — Schema (migration 085) + constants

**A1. Write `085_procurement_intelligence.sql`.**
- Tables: `suppliers`, `procurement_templates`, `procurement_items` (full columns per design §D + `user_modified`, `order_by_date` generated, `risk_status`, `committed_amount` left to a view).
- FKs: `trade_category_id → trade_categories`, `job_id → jobs`, `project_id → projects`, `supplier_id/backup_supplier_id → suppliers`, `selection_decision_id → portal_decisions`, `purchase_order_id → purchase_orders`, `related_schedule_task_id → schedule_tasks`, `invoice_document_id → financial_documents`.
- `order_by_date` = GENERATED STORED (1.2). RLS `auth_users` policy on all three (match existing pattern). Indexes: `procurement_items(job_id)`, `(order_by_date)`, `(status)`, `(risk_status)`, `(trade_category_id)`, `suppliers(trade_category_id)`, `procurement_templates(is_active)`.
- **DoD:** ☐ migration parses ☐ all FKs resolve to real tables/columns ☐ generated column compiles ☐ RLS + indexes present ☐ no column duplicates a canonical fact (cross-check Part 4 of the data dictionary).
- **Test:** apply to a scratch DB; `INSERT` a row with `required_on_site_date` + buffers → `order_by_date` auto-populates correctly; RLS blocks anon.

**A2. Backfill block in 085** (1.3) — idempotent, `ON CONFLICT DO NOTHING`.
- **DoD:** ☐ re-running 085 backfill creates no duplicates ☐ every `task_type='procurement'` task yields exactly one register row.
- **Test:** count procurement schedule tasks vs created register rows = 1:1; run twice, count unchanged.

**A3. `constants.js`** — add `PROCUREMENT_STATUS`, `PROCUREMENT_RISK`, `SUPPLY_TYPE`, `PROCUREMENT_ITEM_SOURCE`.
- **DoD:** ☐ enums exported ☐ values match the SQL CHECK constraints exactly (1:1, no hardcoded strings anywhere else).
- **Test:** grep shows no raw status string literals in procurement code.

### Phase B — Server core (generation + register service)

**B1. `server/lib/procurementService.mjs`** — `generateProcurementPlan(jobId, {mode})` (1.1), `recomputeItemRisk(item)`, `computeCommittedCost(jobId)`. Pure logic, DB via service client. Reuse `pullBuildexactEstimate`, `resolveBuildxactJobId`, `resolveTradeCategoryId`.
- **DoD:** ☐ upsert respects `user_modified` (no clobber) ☐ template-only mode works with no estimate ☐ de-dup proven ☐ emits `procurement.plan_generated`.
- **Test:** unit-style script: generate on a template-only job → N items; set one item edited; regenerate → edit preserved, no dupes; link an estimate → allowances enrich, count stable.

**B2. `server/lib/procurementRoutes.mjs`** — endpoints (all `requireAuth`; cost/PO actions `requireRole("admin")`; register writes `admin`/`supervisor`):
```
POST   /api/procurement/jobs/:jobId/generate            → run generator (manual/regenerate)
GET    /api/procurement/jobs/:jobId/items               → register for a job
PATCH  /api/procurement/items/:id                       → edit (sets user_modified)
POST   /api/procurement/items                           → add manual item
DELETE /api/procurement/items/:id                       → soft-remove (required=false)
GET    /api/procurement/command-centre                  → cross-job "attention this week" payload
GET    /api/procurement/selections/blockers             → items waiting_on_selection/clarification (joins portal_decisions)
POST   /api/procurement/items/:id/request-quote         → mark quote_requested (+ optional email draft P2)
POST   /api/procurement/items/:id/draft-po              → P2 stub now: 501/feature-flagged
GET    /api/procurement/suppliers  + POST/PATCH         → suppliers CRUD
```
- **DoD:** ☐ all responses `ok()/err()` + camelCase ☐ role gates enforced (403 verified) ☐ registered in `dev-api.mjs`.
- **Test:** hit each endpoint; supervisor can edit register, cannot approve PO; admin can; payloads camelCase.

**B3. Lock hook** — wire `generateProcurementPlan(jobId,{mode:"auto"})` into the job-lock action.
- **DoD:** ☐ locking a job auto-creates the register once ☐ idempotent (re-lock doesn't duplicate) ☐ failure is non-fatal to the lock (try/catch + log).
- **Test:** lock a seeded job → register appears; unlock/relock → no dupes.

### Phase C — Command Centre + Register UI

**C1. `src/pages/Procurement.jsx`** (Operations nav) with tabs: **Command Centre** (default), **Register**, **Selections**. Route `/operations/procurement` + AppShell link.
**C2. Command Centre** — sections: Order-by due/overdue, Selection blockers, Awaiting quotes, Delivery risks, Long-lead criticals. Reads `/command-centre`. Each row → deep-link to the item.
**C3. Register** — per-job spreadsheet, inline-edit (PATCH on blur), source badges, status + risk pills (colour via tokens), "Regenerate" button (confirm modal), "Add item".
- **DoD (C1–C3):** ☐ renders on clean 5174 ☐ admin sees cost columns, supervisor sees register w/o margin ☐ empty states (design §O) ☐ no raw hex (use tokens).
- **Test:** Chrome UI pass — generate → register populates → edit an item → persists → risk pill matches order-by math.

### Phase D — Selection blockers (the differentiator)

**D1. Selections tab + Command Centre section** — items `waiting_on_selection`/`waiting_on_clarification`, joined to `portal_decisions`. One-click "Send reminder" (client/architect) — drafts via existing mail; **send is explicit-confirm** (no auto-send).
- **DoD:** ☐ unmade decision + near order-by → item `blocked`/`at_risk` ☐ reminder is human-confirmed ☐ no parallel selections store (reuses `portal_decisions`).
- **Test:** create an item needing a selection with no decision + order-by in 10d → appears in blockers; making the decision clears it.

### Phase E — Schedule integration

**E1.** Schedule procurement column reads the register (1.3). Task move → `required_on_site_date` updates → `order_by_date` recomputes → risk re-evaluates. Reuse ripple hooks.
- **DoD:** ☐ moving a linked task shifts the item's order-by by the same delta ☐ no write to the frozen `schedule_tasks.procurement_*`.
- **Test:** move a task 7 days later in the Gantt → item order-by moves 7 days; risk recolours.

### Phase F — Finance integration (committed cost)

**F1.** `computeCommittedCost(jobId)` (sum approved_amount where status ≥ po_sent) surfaced into the Financial Command Centre as a **committed** layer (budgeted / quoted / committed / invoiced / paid).
- **DoD:** ☐ committed cost = Σ items with sent PO ☐ FCC shows committed distinctly ☐ computed, not stored-editable.
- **Test:** mark an item PO-sent with approved_amount → FCC committed rises by that amount; margin reflects it.

### Phase G — SOPs (CLAUDE.md Law — blocking)

**G1.** `docs/sops/15_procurement/` — SOPs with Section 14 test scripts: generate plan, manage register, clear a selection blocker, request quote, mark ordered/delivered, command-centre triage. Add to `SOP_INDEX.md` + `SOP_CHANGELOG.md`.
- **DoD:** ☐ each SOP has TC-01…TC-05 + ≥1 feature test ☐ indexed ☐ `test_status: untested`.

### Phase H — Verify + ship

**H1.** `/check` (lint + build + import/route audit). **H2.** Full Chrome UI walkthrough on 5174 against the Part 3 matrix. **H3.** Run every SOP Section 14. **H4.** Clean test data. **H5.** Commit per phase; ship on "ship".
- **DoD:** ☐ lint 0 ☐ build clean ☐ every matrix row tested ☐ test data cleaned.

---

## PART 3 — REQUIREMENT → STEP → TEST TRACEABILITY MATRIX

Every A–T design requirement has a build step and a test. A blank "Step" = a hole. (P2/P3 rows are listed so they're explicitly *deferred*, not *forgotten*.)

| # | Design req (A–T) | Build step | Test | Phase |
|---|---|---|---|---|
| 1 | §0 consolidate `schedule_tasks.procurement_*` | A2 backfill + 1.3 flip | 1:1 backfill, re-run no-dup | P1 |
| 2 | §0 reuse `portal_decisions` for selections | D1 | blocker reads decision row | P1 |
| 3 | §0 reuse `purchase_orders` (commitment) | B2 draft-po stub → P2 | endpoint feature-flagged | P1/P2 |
| 4 | §0 reconcile `supplier_trade_defaults` | B1 supplier hint + A1 suppliers | seed maps ABN→supplier | P1 |
| 5 | §D `suppliers` (new entity) | A1 + B2 suppliers CRUD | CRUD works, distinct from subbies | P1 |
| 6 | §D one master `procurement_templates` + `applies_to_build_types` + `match_existing` | A1 + Part 4 seed | reno excludes slab/trusses | P1 |
| 7 | §D `procurement_items` register (source of truth) | A1 + B1 | register is the truth | P1 |
| 8 | §D `order_by_date` Generated | A1 generated col + 1.2 | auto-computes, not editable | P1 |
| 9 | §C generation at job-lock | B3 + 1.1 | lock → register | P1 |
| 10 | §C/decided regenerate button | B2 generate + C3 | re-run, no clobber | P1 |
| 11 | §E status model | A3 + B1 | status transitions valid | P1 |
| 12 | §E risk status (separate) | 1.2 + B1 recomputeItemRisk | risk matches order-by/today | P1 |
| 13 | §F1 Command Centre | C2 | "attention this week" correct | P1 |
| 14 | §F2 Register | C3 | inline edit persists | P1 |
| 15 | §F3 Selection Blocker view | D1 | blocker + reminder | P1 |
| 16 | §H schedule-driven order-by + ripple | E1 | task move → order-by move | P1 |
| 17 | §J committed cost → FCC | F1 | committed reflects sent POs | P1 |
| 18 | §K selection integration (portal_decisions) | D1 | unmade decision blocks item | P1 |
| 19 | §N edge: subbie/client-supplied excluded from orders | B1 supply_type + C3 | subbie items not orderable | P1 |
| 20 | §N edge: order-by past at generation | 1.2 critical flag | overdue badge on create | P1 |
| 21 | §N edge: template-only (no estimate) | 1.1 pre-estimate mode | works w/o Buildxact | P1 |
| 22 | §O empty states | C1–C3 | all 4 empty states render | P1 |
| 23 | §P permissions (cost=admin) | B2 + C3 role gates | 403 verified | P1 |
| 24 | §T SOPs Section 14 | G1 | each SOP testable | P1 |
| 25 | §R drop frozen `schedule_tasks.procurement_*` | **later migration** (tracked) | post-proof cleanup | **post-P1** |
| 26 | §F4 Calendar view | — | — | **P2** |
| 27 | §F5 Board, §F6 Supplier, §F7 Long-Lead views | — | — | **P2** |
| 28 | §M auto-draft POs (existing PO flow) | B2 stub now | — | **P2** |
| 29 | §L AI: RFQ/email drafting, missing-item detection | — | — | **P2** |
| 30 | §I/P3 supplier performance + lead-time learning | — | — | **P3** |

---

## PART 4 — MASTER TEMPLATE DRAFT (the miss-nothing backbone)

> **Sam: this is the list the whole module relies on. I've drafted it across all 37 trade categories in build sequence. Your job: ✅ confirm/correct two columns — `LL?` (long-lead ⚠, my best guess pre-filled) and `Lead (wk)` (typical lead time) — and add anything I've missed.** Items the estimate will refine; this is the floor of "what must we never forget to order."
>
> **Columns:** `Supply` = builder / subbie / client / **PC** (prime cost). `Builds` = N new_build · K knockdown_rebuild · E extension · R renovation (blank = all). `Sel?` = selection/colour decision needed. `Match?` = "match existing" risk (reno/ext). `LL?` = long-lead ⚠. `Lead (wk)` = my draft, **confirm**.

### Site establishment & early works
| Trade | Item | Unit | Supply | Builds | Sel? | Match? | LL? | Lead(wk) |
|---|---|---|---|---|---|---|---|---|
| Site Establishment | Temp fencing / hoarding | job | builder(hire) | all | | | | 0 |
| Site Establishment | Site toilet / shed | job | builder(hire) | all | | | | 0 |
| Site Establishment | Waste bins / skips | job | builder(hire) | all | | | | 0 |
| Site Establishment | Temp power & water | job | subbie | all | | | | 1 |
| Demolition / Civil | Demolition | job | subbie | K,R | | | | 1 |
| Demolition / Civil | Strip-out (internal) | job | subbie | R,K | | ✔ | | 1 |
| Demolition / Civil | Earthworks / excavation | job | subbie | N,K,E | | | | 1 |
| Demolition / Civil | Rock removal (allowance) | job | subbie | N,K,E | | | | 1 |

### Substructure
| Trade | Item | Unit | Supply | Builds | Sel? | Match? | LL? | Lead(wk) |
|---|---|---|---|---|---|---|---|---|
| Concrete & Footings | Ready-mix concrete | m³ | builder(supplier) | N,K,E | | | | 1 |
| Concrete & Footings | Reo mesh & bar / starter bars | job | builder(supplier) | N,K,E | | | | 1 |
| Concrete & Footings | Waffle pods / formwork | job | builder/subbie | N,K,E | | | | 1 |
| Concrete & Footings | Vapour barrier / sand fill | job | builder(supplier) | N,K,E | | | | 1 |
| Concrete & Footings | Piering / piling (allowance) | job | subbie | N,K,E | | | | 2 |
| Termite Protection | Termite barrier system | job | subbie+supply | N,E | | | | 1 |

### Structure & frame
| Trade | Item | Unit | Supply | Builds | Sel? | Match? | LL? | Lead(wk) |
|---|---|---|---|---|---|---|---|---|
| Structural Steel | Beams / posts / lintels (fabricated) | job | builder(supplier) | N,K,E | | ✔ | ⚠ | 4 |
| Carpentry | Wall frames & roof trusses (fab to plan) | job | builder(supplier) | N,K,E | | | ⚠ | 4 |
| Carpentry | Framing timber / LVL / bearers | job | builder(supplier) | all | | | | 1 |
| Carpentry | Structural ply / bracing | job | builder(supplier) | all | | | | 1 |
| Carpentry | Fixing timber & fixings/hardware | job | builder(supplier) | all | | | | 1 |
| Stairs | Staircase (made to measure) | ea | subbie/supplier | (multi-storey) | ✔ | | ⚠ | 5 |

### Lock-up (roof, windows, external)
| Trade | Item | Unit | Supply | Builds | Sel? | Match? | LL? | Lead(wk) |
|---|---|---|---|---|---|---|---|---|
| Windows / Skylights | Windows & external glazed doors (made to order) | job | builder(supplier) | all | ✔ | ✔ | ⚠ | 6 |
| Windows / Skylights | Skylights | ea | builder(supplier) | all | ✔ | | ⚠ | 5 |
| Roof Plumber | Roof sheeting / tiles | job | builder(supplier) | all | ✔ | ✔ | ⚠ | 3 |
| Roof Plumber | Gutters / fascia / downpipes / flashings | job | subbie+supply | all | ✔ | | | 2 |
| External Cladding | Cladding (FC / weatherboard / composite) | job | builder(supplier) | all | ✔ | ✔ | | 3 |
| External Cladding | Sarking / wrap / battens | job | builder(supplier) | all | | | | 1 |
| Masonry | Face bricks / blocks | job | builder(supplier) | all | ✔ | ✔ | ⚠ | 4 |
| Masonry | Mortar / ties / lintels | job | builder(supplier) | all | | | | 1 |
| Garage Door | Garage door & motor (made to order) | ea | builder(supplier) | all | ✔ | | ⚠ | 5 |

### Services rough-in
| Trade | Item | Unit | Supply | Builds | Sel? | Match? | LL? | Lead(wk) |
|---|---|---|---|---|---|---|---|---|
| Plumbing | Pipework / drainage / gas rough-in | job | subbie | all | | | | 1 |
| Plumbing | Hot water unit | ea | builder(supplier) | all | ✔ | | | 2 |
| Electrical & Data | Switchboard / meter box / cabling rough-in | job | subbie | all | | | | 1 |
| Electrical & Data | GPOs / switches / smoke alarms | job | subbie+supply | all | ✔ | | | 2 |
| Lighting & Automation | Light fittings | job | client/PC | all | ✔ | | ⚠ | 4 |
| Lighting & Automation | Automation / smart system / fans | job | builder/subbie | all | ✔ | | | 3 |
| Heating & Cooling | HVAC / split / ducted system | job | subbie+supply | all | ✔ | | ⚠ | 4 |
| Solar & Batteries | Panels / inverter / battery | job | subbie+supply | all | ✔ | | ⚠ | 4 |

### Internal linings & fit-out
| Trade | Item | Unit | Supply | Builds | Sel? | Match? | LL? | Lead(wk) |
|---|---|---|---|---|---|---|---|---|
| Insulation | Wall / ceiling / acoustic batts | job | subbie+supply | all | | | | 1 |
| Internal Linings | Plasterboard / villaboard / cornice | job | builder(supplier) | all | | | | 1 |
| Plastering & Rendering | Render / texture coat | job | subbie | all | ✔ | ✔ | | 1 |
| Joinery | Kitchen cabinetry (made to order) | job | builder(supplier) | all | ✔ | | ⚠ | 6 |
| Joinery | Vanities / wardrobes / laundry | job | builder(supplier) | all | ✔ | | ⚠ | 5 |
| Joinery | Stone benchtops (templated) | job | subbie+supply | all | ✔ | | ⚠ | 4 |
| Joinery | Cabinet hardware / handles | job | builder(supplier) | all | ✔ | | | 2 |
| Tiler | Floor & wall tiles | job | builder/client | all | ✔ | ✔ | ⚠ | 4 |
| Tiler | Waterproofing / adhesive / grout / trims | job | builder(supplier) | all | | | | 1 |
| Sanitary Ware | Toilets / basins / baths | job | builder(supplier) | all | ✔ | | | 3 |
| Sanitary Ware | Tapware / mixers (often imported) | job | builder/PC | all | ✔ | | ⚠ | 5 |
| Sanitary Ware | Shower screens / mirrors | job | subbie+supply | all | ✔ | | | 3 |
| Glazing | Splashbacks / balustrade glass (made to measure) | job | subbie+supply | all | ✔ | | ⚠ | 4 |
| Flooring | Timber / laminate / vinyl / carpet | job | builder/client | all | ✔ | ✔ | ⚠ | 4 |
| Flooring | Underlay / leveller / trims | job | builder(supplier) | all | | | | 1 |
| Door Hardware | Internal door handles / locks / hinges | job | builder(supplier) | all | ✔ | | | 2 |
| Painting | Paint & prep materials | job | builder(supplier) | all | ✔ | | | 1 |

### Finishes, PC items & external
| Trade | Item | Unit | Supply | Builds | Sel? | Match? | LL? | Lead(wk) |
|---|---|---|---|---|---|---|---|---|
| Appliances | Oven / cooktop / rangehood / dishwasher | job | client/PC | all | ✔ | | ⚠ | 4 |
| Fixtures & Fittings | Towel rails / accessories / mirrors | job | builder/PC | all | ✔ | | | 2 |
| Window Furnishings | Blinds / curtains / shutters (made to measure) | job | builder(supplier) | all | ✔ | | ⚠ | 4 |
| Paving | Pavers / base / edging | job | builder(supplier) | all | ✔ | | | 2 |
| Landscaping | Plants / turf / irrigation / soil | job | subbie+supply | all | ✔ | | | 1 |
| Fencing | Fence materials / gates | job | builder(supplier) | all | ✔ | | | 2 |
| Pool Works | Pool shell / system | job | subbie+supply | (if pool) | ✔ | | ⚠ | 6 |
| Site Cleaner | Builders clean (final) | job | subbie | all | | | | 0 |

**Draft totals:** ~60 master items · ~18 flagged long-lead ⚠ (windows, trusses, steel, stairs, garage door, bricks, kitchen/joinery/stone, tiles, tapware, flooring, blinds, appliances, HVAC, solar, glazing, pool, skylights). These 18 are the ones that *actually* delay builds — they're where the Command Centre earns its keep.

**Sam to action on Part 4:**
1. ✅ / ✏️ the `LL?` flags — anything I over/under-called?
2. Replace my draft `Lead(wk)` with your real numbers (esp. windows, trusses, joinery, stone, tapware — your suppliers' true lead times).
3. Add missing items (anything you order that isn't here).
4. Confirm `Match?` items for reno/extension (the discontinued-product trap).

---

## Next action
On Sam's review of Part 4 + sign-off on the runbook → build **Phase A** (migration 085) first, verify its DoD, then proceed phase-by-phase. Nothing in Parts A–T is unaccounted for — the Part 3 matrix is the proof.

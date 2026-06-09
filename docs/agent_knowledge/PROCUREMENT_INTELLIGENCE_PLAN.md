# Procurement Intelligence — Module Plan (BQ-10)

> **Status:** PLANNING (planning only — no code). Created 2026-06-10.
> **Home:** Operations module, but operates as its own **procurement command centre**.
> **One-line:** the bridge between *contract signing → schedule certainty → supplier comms → site readiness* — so a build is never delayed by missed materials, late selections, supplier lead times, or unclear ownership.
> **Source of this plan:** ChatGPT's module concept (excellent, adopted in full as the vision) + grounded against the **actual Blue Leaf Hub** (see §0 — the Hub already has procurement scaffolding a generic plan can't see). Master-plan ref: **BQ-10**.

---

## 0. GROUND TRUTH — what already exists (build ON this, don't duplicate)

Per the **Canonical Data Law** (CLAUDE.md): never re-store a fact another table owns. The Hub already has most of the procurement spine — the new module **consolidates** it, it does not start fresh:

| Existing | Where | The module must… |
|---|---|---|
| **Schedule-task procurement fields** — `procurement_item`, `procurement_supplier`, `procurement_lead_days`, `procurement_order_by`, `procurement_order_status` (default `not_ordered`), `lead_time_weeks`, `task_type='procurement'`, index on `(project_id, procurement_order_by)` | `schedule_tasks` (mig 011 + 014) | **Supersede/absorb** these into the new `procurement_items` register as the single source of truth; the schedule renders a *view* of order-by dates. **Avoid two diverging `order_by` values.** Migration path: backfill register from these fields, then drive the schedule from the register. |
| **Client decisions / selections** — `portal_decisions` | `portal_decisions` (mig 027 client portal) | **Reuse it** for the Selection Blocker view — link `procurement_items.selection_decision_id → portal_decisions`. Do **not** build a parallel selections store. |
| **Subcontractors** (trade installers) | `subcontractors` (mig 001) | Use for `supply_type='subbie_supplied'` items (the subbie supplies+installs → not a builder order). |
| **Supplier ABNs** (finance, invoice trade-tagging) | `supplier_trade_defaults` (mig 031) | Reconcile with the new `suppliers` entity (see §H) — don't duplicate ABN/trade mapping. |
| **Purchase orders** + Buildxact PO create | `purchase_orders`, `buildexactClient` | The PO is the **commitment** step (P2 auto-draft → existing PO flow). Procurement item links `purchase_order_id`. |
| **Budgets + actuals** | `job_budgets`, `financial_documents`, `trade_categories` FK | Finance integration (§J) — procurement adds the missing **committed cost** layer. |
| **Facts/events + schedule dates** | `factsService`, `schedule_tasks` | Read required-on-site dates + `trade_category_id` via FK/facts; emit `procurement.*` events. |

**The genuinely-new entity is the material `suppliers` table** (Bone Timber, ADX, Routleys, window/truss/steel/flooring suppliers) — distinct from `subcontractors`.

---

## A. Module purpose
Ensure every material, supplier order, long-lead item and delivery for a build is **planned, tracked, ordered and delivered without surprises**. It is **operational, not estimating**, and **not "PO management"** — its job is to *prevent build delays* from missed materials, late selections, lead times, and unclear ownership. **The system drafts/recommends/warns/prepares; humans approve every supplier commitment. It NEVER auto-orders.**

## B. User roles
- **Admin/Director** — full visibility, approve POs, see committed cost vs budget.
- **Supervisor/PM** — manage the register, request quotes, chase selections, book deliveries, mark ordered/delivered.
- **(Read-only later)** site/worker — "what's landing this week" for their job.
- Permissions follow the existing role model (`admin`/`supervisor`/`employee`); cost/committed figures are admin/supervisor.

## C. Workflow
```
Contract signed / job locked
 → procurement plan generated (template + estimate + RFQ + project facts + schedule)
 → user reviews each item: required? supplied by Blue Leaf / subbie / client? selection needed?
 → supplier selected (preferred + backup) → quote requested if needed
 → selections / clarifications confirmed (blockers cleared)
 → PO drafted → PO approved → order placed (via existing PO flow)
 → delivery date confirmed → schedule risk monitored → delivered → closed
```

## D. Data model (~mig 084)
**`suppliers`** (NEW — material suppliers, distinct from subcontractors): id, name, contact_person, email, phone, trade_category_id?, usual_lead_time_days, account_terms, is_preferred, is_backup_for?, usual_products text, notes, performance (denormalised: on_time_rate, avg_lead_variance — P3), created_at. Reconcile/seed against `supplier_trade_defaults`.

**`procurement_templates`** (per build type): id, build_type, trade_category_id, item_name, default_unit, supply_type (`builder_supplied`|`subbie_supplied`|`client_supplied`|`pc_item`), default_lead_time_days, default_supplier_id?, order_sequence/phase, selection_required bool, is_active.

**`procurement_items`** (per job — the register, source of truth): id, job_id, project_id, trade_category_id, item_name, category, **source** (`template`|`estimate`|`rfq`|`project_intelligence`|`schedule`|`manual`), required bool, supply_type, supplier_id?, backup_supplier_id?, related_schedule_task_id?, required_on_site_date, lead_time_days, approval_buffer_days, internal_review_buffer_days, **order_by_date** (Generated = on-site − lead − approval − review), selection_required bool, **selection_decision_id → portal_decisions**, selection_status, architect_clarification_required bool, supplier_quote_required bool, supplier_quote_status, **status** (§E), **risk_status** (§E), cost_allowance, quoted_amount, approved_amount, purchase_order_id?, invoice_document_id?, documents jsonb, notes, owner_id, created_at, updated_at.
> `order_by_date` and committed/actual cost are **Generated** (computed) — not stored editable — per the Canonical Data Law.

## E. Status model
**Procurement status:** `not_started → scope_required → quote_requested → quote_received → waiting_on_selection → waiting_on_clarification → ready_for_approval → approved → po_drafted → po_sent → order_confirmed → delivery_booked → delivered → closed` (+ `delayed`, `cancelled`).
**Risk status (separate dimension):** `on_track | watch | at_risk | critical | blocked`. Risk is computed from order_by-vs-today, selection blockers, and supplier lead-time variance.

## F / G. UI layout + views (phased — see §Q)
1. **Procurement Command Centre** — *"What needs attention this week"*: order-by due/overdue, selection blockers, awaiting quotes, delivery risks, long-lead criticals. (The headline view — P1.)
2. **Job Procurement Register** — spreadsheet of every item for a job, inline-editable. (P1.)
3. **Selection Blocker View** — items `waiting_on_selection`/`waiting_on_clarification`, with one-click client/architect reminder (reads `portal_decisions`). (P1 — highest differentiator.)
4. **Procurement Calendar** — order-by + delivery dates on a timeline, tied to the schedule. (P1/P2.)
5. **Procurement Board** — Kanban by status, daily driver. (P2.)
6. **Supplier View** — grouped by supplier for batching orders. (P2.)
7. **Long-Lead Risk View** — windows, trusses, steel, joinery, flooring, cladding, special-order. (P2.)

## H. Schedule integration
`order_by_date = related_task.start_date − supplier_lead_time_days − approval_buffer_days − internal_review_buffer_days`.
- Schedule task moves → recalc order_by + required-on-site → re-evaluate risk → notify owner. (Reuse the existing ripple/`procurementStatus` machinery.)
- Delivery date slips → flag affected downstream tasks, show schedule impact, prep a client-safe note.

## I. Supplier integration
`suppliers` profiles (preferred + backup, usual lead time, account terms, usual products, performance history P3). Supports quote requests, follow-ups, delivery confirmations. Long-lead specialist suppliers (windows/trusses/steel) + standing suppliers (Bone Timber, ADX, Routleys).

## J. Finance integration (the strongest value-add)
Procurement supplies the **committed-cost** layer the Financial Command Centre currently lacks. Per item: `cost_allowance` (from estimate/budget) → `quoted_amount` (supplier quote) → `approved_amount` → **committed** (PO sent) → invoiced (`financial_documents`) → paid. **FCC consumes committed cost** so margin reflects commitments, not just approved invoices. Distinguish **budgeted / quoted / committed / invoiced / paid**.

## K. Selection integration
Reuse **`portal_decisions`**. A `procurement_item` needing a selection links to a decision row; if the decision is unmade and `order_by` is near → item is `blocked`/`at_risk` and a client/designer reminder can be generated. Examples: window/roof/cladding colour, flooring, tile, joinery finish, tapware, sanitaryware, appliances, paint.

## L. AI opportunities (useful) — **never auto-order**
Detect missing items (vs similar past jobs); draft supplier RFQ/order emails; summarise supplier replies; flag lead-time + discontinued-product risk; suggest backup suppliers; compare supplier quote vs estimate allowance; explain schedule impact of a delay; weekly procurement summary; client-safe selection reminders. **Fluff to avoid:** a procurement chatbot, an over-built supplier portal too early, auto-ordering, full stock management.

## M. Automation opportunities
Generate plan at job-lock; recalc order-by on schedule move; risk flags D-x before order-by; selection-blocker reminders; weekly "what to order" digest; auto-**draft** (not send) POs. Every commitment is human-approved.

## N. Edge cases
Subbie-supplied vs builder-supplied (don't order subbie items); client-supplied items; PC/PS allowances; variations adding/removing items; revised drawings changing specs; supplier discontinues a product; partial deliveries; split orders; backorders; schedule compression making an order-by already overdue at generation; jobs with no estimate yet (template-only mode).

## O. Empty states
No job locked → "Procurement starts when a job is locked." Job locked, plan not generated → "Generate procurement plan." No long-lead risks → "Nothing at risk this week." No selections pending → "All selections confirmed."

## P. Permissions
Register + command centre: admin/supervisor. Cost/committed figures + PO approval: admin (mirror finance). Read-only "landing this week": employee (later).

## Q. Implementation phases
- **P1 (leverage existing scaffolding):** `procurement_items` register (absorbing `schedule_tasks.procurement_*`) + `procurement_templates` + generation at job-lock (template-first, estimate-aware) + **Command Centre** + **Register** + **Selection Blocker** (via `portal_decisions`) + schedule-driven order-by + risk flags. Ships the "no surprises" core fast.
- **P2:** `suppliers` entity + Supplier/Board/Calendar/Long-Lead views + **auto-draft POs** (existing PO flow) + AI supplier-email drafting + committed-cost → Financial Command Centre.
- **P3:** supplier performance history + lead-time learning (actual vs expected) + similar-job missing-item comparison + discontinued-product flags.

## R. Risks
Two diverging procurement systems (schedule fields vs register) — **mitigate: register is source of truth, migrate the schedule fields**. Over-build (8 views + supplier CRM + AI on day one) — **mitigate: P1 leverages existing tables**. Auto-order mistakes — **mitigate: never auto-order, human-approve**. Bad template data → irrelevant items — **mitigate: review step + tagged source**. Estimate dependence — **mitigate: template-first so it works before the estimate exists**.

## S. What NOT to build yet
Auto-ordering; AI-only supplier commitments; a full supplier portal; stock/inventory management; price promises; a procurement chatbot; deep supplier performance analytics (P3).

## T. Testing plan
Generate-at-job-lock produces a sensible register from template+estimate; order-by recalcs when a schedule task moves; a missing selection blocks the item + surfaces in the Selection Blocker view + reminder; long-lead item overdue → command-centre "attention"; PO draft links to the existing PO + sets committed cost; FCC committed cost reflects sent POs; subbie-supplied items excluded from builder orders; SOPs (Section 14) written per CLAUDE.md SOP Law before "done".

---

## Recommendation (locked)
**Template-first, schedule-driven, estimate-aware — NOT estimate-dependent — and grounded in the existing Hub scaffolding.** It works the moment a contract is signed (template + schedule), and gets smarter as estimate, RFQ, supplier quotes and actuals arrive. P1 consolidates `schedule_tasks.procurement_*` + `portal_decisions` + `purchase_orders` rather than rebuilding them.

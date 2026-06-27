# Workflow 10 — Procurement Planning / Register

**Status:** Mapped (2026-06-25) — documentation only; no product code changes  
**Gate:** Batch C mapping — starts after W09 win handoff  
**Related:** [09_TENDER_WIN_OPERATIONS_HANDOFF.md](./09_TENDER_WIN_OPERATIONS_HANDOFF.md), [12_SCHEDULING_CRITICAL_PATH_EOT.md](./12_SCHEDULING_CRITICAL_PATH_EOT.md), [11_PURCHASE_ORDERS_SUPPLIER_COMMITMENTS.md](./11_PURCHASE_ORDERS_SUPPLIER_COMMITMENTS.md), [BATCH_C_REVIEW_PACK.md](../BATCH_C_REVIEW_PACK.md)

**Starts after:** W09 — `projects` row exists with `job_id`; schedule optional but improves date linkage  
**Hands off to:** W11 (materials PO via register), W12 (schedule dates), W18 (portal selections)

---

## Evidence standards

| Label | Meaning |
|-------|---------|
| **Verified from code** | Confirmed in repo |
| **Verified from SOP/docs** | SOP or agent knowledge |
| **Inferred from behaviour** | Logical from code paths |
| **Unconfirmed / needs testing** | Not proven by read-only audit |
| **Open decision for Sam** | [SAM_DECISION_LOG.md](../SAM_DECISION_LOG.md) |

---

## 1. Business purpose

W10 is the **materials procurement register** — builder-supplied and long-lead items with computed **order-by dates**, risk buckets, selection blockers, and committed-cost tracking. Distinct from subcontractor POs (W11).

**Verified from SOP/docs:** `docs/sops/16_procurement/16-02_generate_procurement_plan.md` — "no surprises" materials planning.

**Not W10:** Subcontractor trade POs (`/api/po/issue`), accepted RFQ rollup, auto-start on tender win.

---

## 2. Start trigger

| Trigger | Surface | Evidence |
|---------|---------|----------|
| **Manual regenerate** | Procurement Command Centre → Regenerate | `POST /api/procurement/jobs/:jobId/generate` — **Verified from code** |
| **Financial lock** | Finance CC lock job financials | `financeCCRoutes.mjs` auto-calls generate when `financial_locked=true` — **Verified from code** |
| **NOT on win-finalize** | — | No call in win-finalize — **W09-DRIFT-007** |

**Answer — Does it start automatically after tender win?** **No.**

---

## 3. End state

| End state | Table | Next |
|-----------|-------|------|
| Register populated | `procurement_items` per `job_id` | Staff order/confirm items |
| Order-by dates computed | GENERATED `order_by_date` on items | Calendar/board views |
| Selection blockers cleared | `portal_decisions` linked | Client portal (W18) |
| Materials PO issued (optional) | `purchase_orders` via `issue-po` | W11 overlap |

---

## 4. Primary users

| User | Role |
|------|------|
| Admin / supervisor | Generate, edit register, issue materials POs |
| Sam / Josh | Review Command Centre, long-lead board |
| Client (indirect) | Portal selection decisions block procurement |

---

## 5. Current UI surfaces

| Screen | Route | File |
|--------|-------|------|
| Procurement Command Centre | `/operations/procurement` | `src/pages/Procurement.jsx` |
| Register / Selections / Calendar | Tabs + `ProcurementExtras.jsx` | `src/components/procurement/` |
| Legacy schedule procurement | Schedule task panel | `src/components/schedule/ProcurementPanel.jsx` (parallel legacy) |
| Ops project hub | Links to procurement | `OperationsProjectDetail.jsx` |

---

## 6. Backend routes / APIs

**Registrar:** `server/lib/procurementRoutes.mjs` → `dev-api.mjs`

| Method | Route | Role gate |
|--------|-------|-----------|
| POST | `/api/procurement/jobs/:jobId/generate` | admin, supervisor |
| GET | `/api/procurement/jobs/:jobId/items` | admin, supervisor |
| GET | `/api/procurement/jobs/:jobId/committed-cost` | admin, supervisor |
| PATCH/POST/DELETE | `/api/procurement/items/*` | admin, supervisor |
| GET | `/api/procurement/command-centre` | admin, supervisor |
| POST | `/api/procurement/items/:id/draft-po` | **admin only** |
| POST | `/api/procurement/items/:id/issue-po` | **admin only** (materials PO — not `/api/po/issue`) |
| GET | `/api/procurement/selections/blockers` | admin, supervisor |
| AI draft endpoints | `/api/procurement/ai/*` | admin, supervisor |

**Services:** `procurementService.mjs`, `procurementLearningService.mjs`, `procurementAiService.mjs`

---

## 7. Database tables

| Table | Migration | Purpose |
|-------|-----------|---------|
| `procurement_items` | 085 | **SSoT** register; `job_id`, `project_id`, `related_schedule_task_id`, GENERATED `order_by_date` |
| `procurement_templates` | 085, seed 091 | ~62 master template items |
| `suppliers` | 085 | Material vendors (≠ subcontractors) |
| `supplier_lead_observations` | 092 | Lead-time learning |
| `projects.procurement_plan_stale*` | 097 | Staleness when schedule dates change |

**Key answers:**
- **Lead times stored?** Yes — `lead_time_days`, buffers on items; GENERATED `order_by_date`.
- **Linked to schedule?** Yes — `related_schedule_task_id`, `required_on_site_date`; ripple sync in `scheduleRoutes.mjs`.
- **Accepted quotes feed W10?** **No** — generation does not read `rfqs` or `accepted_trades`.

---

## 8. External integrations

| Integration | Role |
|-------------|------|
| **Buildxact estimate** | `pullBuildexactEstimate` enriches template rows |
| **Schedule (W12)** | Trade match → task dates; cascade updates items |
| **Portal (W18)** | `portal_decisions` → selection blockers |
| **Finance CC** | Auto-generate on financial lock; committed cost KPI |
| **Gmail/SMTP** | Materials PO email on `issue-po` |

---

## 9. Source of truth

| Fact | Canonical store |
|------|-----------------|
| Materials register | `procurement_items` |
| Order-by date | GENERATED column on `procurement_items` (not client-writable) |
| Template catalogue | `procurement_templates` |
| Legacy task procurement fields | `schedule_tasks.procurement_*` — **deprecated** per migration 085 |

---

## 10. Happy path

1. Job won (W09) → staff opens `/operations/procurement` or project procurement link.
2. Select job → **Regenerate** → `generateProcurementPlan(sb, jobId)`.
3. Plan merges: templates + Buildxact estimate (if linked) + schedule task dates (if schedule exists).
4. Staff review Command Centre / Register / Calendar; resolve selection blockers via portal.
5. For builder-supplied items: draft PO → issue PO (materials path).
6. Schedule changes → `procurement_plan_stale` flag → staff regenerates when ready.

---

## 11. Failure paths

| Failure | Behaviour |
|---------|-------------|
| No schedule yet | Generation succeeds from templates/estimate only; no `related_schedule_task_id` |
| No Buildxact link | Estimate source skipped |
| No `project_id` | Schedule source skipped; items still created on `job_id` |
| Regenerate after schedule drift | Stale flag set; dates may be wrong until regenerate |
| Financial lock + generate fails | Lock may succeed without register — **Unconfirmed / needs testing** |

---

## 12. Manual workarounds

- Run **Regenerate** after schedule created (W12) to link order-by dates.
- Manually add/edit items via register CRUD.
- Use legacy Schedule ProcurementPanel for ad-hoc task fields (discouraged — dual SSoT).
- Cross-check accepted trades separately — W10 does not ingest RFQ data.

---

## 13. Cross-module dependencies

| From | Dependency |
|------|------------|
| W09 | `projects.job_id`, optional `buildexact_job_id` |
| W12 | `schedule_tasks` for date linkage and ripple |
| W11 | Materials POs write `purchase_orders` (different path than sub POs) |
| W18 | Portal selections unblock items |
| Finance | Financial lock may trigger generate |

---

## 14. Data ownership

| Table | W10 owns |
|-------|----------|
| `procurement_items` | Full lifecycle (register) |
| `procurement_templates` | Read (seed) |
| `suppliers` | CRUD |
| `schedule_tasks.procurement_*` | **Does not own** — legacy overlap |

**Spine:** `job_id` primary; `project_id` stamped from `projects WHERE job_id`.

---

## 15. Current tests

| Test | Status |
|------|--------|
| E2E procurement | **missing** |
| Batch scripts | **missing** |
| SOP Section 14 | `test_status: untested` |
| W09-API-07 (ops readiness) | flags missing procurement — **planned/shipped P0-B5** |

---

## 16. Missing tests

| ID | Purpose |
|----|---------|
| W10-API-01 | `generate` creates items from templates |
| W10-API-02 | Schedule linkage sets `related_schedule_task_id` |
| W10-API-03 | Regenerate idempotent (unique `job_id, source, source_ref`) |
| W10-API-04 | Financial lock triggers generate |
| W10-API-05 | Readiness checklist flags empty register |
| W10-SEC-01 | Role gates on generate vs issue-po |

---

## 17. Confirmed drift items

| ID | Risk | Severity |
|----|------|----------|
| **W10-DRIFT-001** | No auto-generate on win — manual W10 step | High (alias W09-DRIFT-007) |
| **W10-DRIFT-002** | Dual procurement SSoT — register vs `schedule_tasks.procurement_*` | Medium |
| **W10-DRIFT-003** | W10 ignores `accepted_trades` / RFQ data | Medium |
| **W10-DRIFT-004** | Stale flag set on schedule change but no auto-regen | Low–Medium |
| **W10-DRIFT-005** | Two PO paths both write `purchase_orders` | Medium |

---

## 18. Unconfirmed risks

- Command Centre KPI accuracy when register empty but schedule has legacy procurement fields.
- Buildxact estimate pull failure silently skipped vs surfaced to UI.
- Portal selection blocker count vs actual client-visible items.

---

## 19. P0 candidates

| Item | Rationale |
|------|-----------|
| W10-API-01 baseline test skeleton | No tests exist |
| Ops readiness item "procurement started" (P0-B5 shipped) | Surfaces W10-DRIFT-001 |
| Document dual SSoT in staff SOP | Prevent schedule panel vs register confusion |

**Not P0 during hardening:** Auto-generate on win (SAM-W09-001 rejected auto-seed).

---

## 20. P1/P2 candidates

| Item | Priority |
|------|----------|
| Auto-regenerate on schedule ripple (optional) | P2 |
| Link accepted trades summary to register view | P2 |
| Deprecate Schedule ProcurementPanel writes | P2 |
| E2E Command Centre smoke | P1 |

---

## 21. Sam decisions needed

| ID | Question | Recommended |
|----|----------|-------------|
| **SAM-W10-001** | Auto-generate procurement on win or keep manual? | **Manual during hardening** (extends SAM-W09-001) |
| **SAM-W10-002** | Canonical order-by: register only or schedule panel too? | **Register only (`procurement_items`)** |
| **SAM-W10-003** | Financial lock auto-generate — keep or make optional? | **Keep; document in W10 map** |

---

## 22. Recommended hardening stance

**Map and test first.** Do not auto-seed procurement on win. Baseline API tests for `generate` + readiness flag. Document dual SSoT clearly for staff. No procurement engine redesign during Batch C hardening.

---

## 23. Next safe action

Add W10-API-01 test skeleton after Sam approves P0-C order in [BATCH_C_REVIEW_PACK.md](../BATCH_C_REVIEW_PACK.md).

---

## Key questions answered

| Question | Answer |
|----------|--------|
| What creates the register? | `generateProcurementPlan()` — manual or financial lock |
| Auto after win? | **No** |
| Accepted quotes feed it? | **No** |
| Lead times stored? | **Yes** on `procurement_items` |
| Supplier commitments? | Materials via register + materials PO; subs via W11 |
| Order-by dates calculated? | **Yes** — GENERATED column |
| Linked to schedule? | **Yes** when schedule exists |
| Knows tentative start? | Via schedule task dates / project fields |
| No accepted trade data? | Templates + estimate still generate; RFQ data irrelevant to W10 |

---

## Source-of-truth check

**Expected:** `procurement_items` is materials register SSoT; manual generate post-win; schedule enriches dates.

**Confirmed:** `procurementService.mjs`, `085_procurement_intelligence.sql`, no win-finalize hook.

**Mismatch:** Legacy schedule procurement fields still editable in UI.

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-25 | W10 mapped — Batch C |

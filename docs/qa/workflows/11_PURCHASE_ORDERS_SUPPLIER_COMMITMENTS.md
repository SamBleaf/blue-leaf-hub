# Workflow 11 — Purchase Orders / Supplier Commitments

**Status:** Mapped (2026-06-25) — documentation only  
**Related:** [09_TENDER_WIN_OPERATIONS_HANDOFF.md](./09_TENDER_WIN_OPERATIONS_HANDOFF.md), [10_PROCUREMENT_PLANNING_REGISTER.md](./10_PROCUREMENT_PLANNING_REGISTER.md), [BATCH_C_REVIEW_PACK.md](../BATCH_C_REVIEW_PACK.md)

**Starts after:** W08 accept + W09 win (`accepted_trades`, accepted `rfqs`)  
**Hands off to:** W12 (PO dates), Finance, Buildxact actuals

---

## Evidence standards

Same labels as W10.

---

## 1. Business purpose

Formally engage **accepted subcontractors**: PO number, branded PDF, email, Dropbox filing, `purchase_orders` row, optional Buildxact PO create. Feeds Trade Commitment Engine.

**Verified from SOP/docs:** `docs/sops/05_operations/operations_issue_purchase_order.md`

**Separate from W10:** Materials POs via procurement `draft-po` / `issue-po` — both write `purchase_orders` with different flows.

---

## 2. Start trigger

| Trigger | UI | Evidence |
|---------|-----|----------|
| Post-win batch PO | TenderDetail banner after win | `batch-po-check` → `issueBatchPos` |
| Operations Trades tab | OperationsProjectDetail | `issuePo()` with correct `project.id` |
| Materials register | Procurement.jsx | `issue-po` on builder-supplied item |
| **NOT win-finalize** | — | Creates snapshot only, no PO rows |

---

## 3. End state

| End state | Table |
|-----------|-------|
| PO issued | `purchase_orders.status = issued` |
| PDF filed | `dropbox_pdf_path` |
| Email sent | via `sendPlainMail` |
| Buildxact PO (optional) | `buildexact_po_id` |
| Trade commitment log | `trade_communication_log` |

---

## 4. Primary users

| User | Action |
|------|--------|
| Admin / director | Issue POs (batch or per-trade) |
| Subcontractors | Receive PO email + PDF |
| Supervisor | Operations Trades tab issue (working path) |

---

## 5. Current UI surfaces

| Screen | Route | Notes |
|--------|-------|-------|
| TenderDetail batch PO | `/tender-manager/board/:jobId` | **Broken projectId** — W11-DRIFT-001 |
| OperationsProjectDetail Trades | `/operations/:projectId` | **Working** — passes `project.id` |
| Procurement register | `/operations/procurement` | Materials PO path |

---

## 6. Backend routes / APIs

| Method | Route | File | Auth |
|--------|-------|------|------|
| POST | `/api/po/issue` | `module4Routes.mjs:571+` | `requireAuth` only (**no role gate**) |
| GET | `/api/tender/batch-po-check/:jobId` | `module4Routes.mjs:806+` | `requireAuth` |
| POST | `/api/procurement/items/:id/issue-po` | `procurementRoutes.mjs` | admin only |

**`/api/po/issue` requires:** `projectId`, `jobAddress`, `trade`, `toEmail`, total > 0.

---

## 7. Database tables

| Table | Migration | Key fields |
|-------|-----------|------------|
| `purchase_orders` | 006, 058, 081 | `project_id`, `job_id`, `rfq_id`, `subcontractor_id`, amounts ex-GST |
| `rfqs` | 001 | `job_id` — **no `project_id`** |
| `projects.accepted_trades` | win-finalize | jsonb snapshot for Ops Trades tab |
| `sequences` / `alloc_po_sequence()` | RPC | PO numbering |

---

## 8. External integrations

| Integration | When |
|-------------|------|
| **Dropbox** | PO PDF upload on issue |
| **Gmail/SMTP/Resend** | PO email to sub |
| **Buildxact** | `createPurchaseOrder` when `buildexactJobId` in body |
| **Trade Commitment** | `po_sent_at` logging |

**Buildxact PO completion:** `completePurchaseOrder` exists but **not** called from `/api/po/issue` (create-only).

---

## 9. Source of truth

| Fact | Store |
|------|-------|
| Issued subcontractor PO | `purchase_orders` |
| Accepted trade for PO | `rfqs.status=accepted` + link via `rfq_id` |
| Trade amount at issue | Request body `totalExGst` / line items |
| Batch PO candidates | Accepted `rfqs` without matching `purchase_orders.rfq_id` |

---

## 10. Happy path

1. W09 win → `projects.accepted_trades` + accepted `rfqs`.
2. Staff opens Operations → Trades → Issue PO **OR** TenderDetail batch banner.
3. `POST /api/po/issue` with `projectId`, trade, sub email, amounts.
4. PO number allocated, PDF generated, emailed, Dropbox filed, Buildxact create (if linked).
5. `purchase_orders` row links `rfq_id` + `project_id`.

**Working path:** OperationsProjectDetail (`projectId: project.id`).

---

## 11. Failure paths

| Failure | Cause |
|---------|-------|
| Batch PO 400 | Empty `projectId` — reads `rfqs.project_id` (nonexistent) — **W11-DRIFT-001** |
| Mail not configured | 503 on po/issue |
| No Buildxact job id | PO still issues; BX sync skipped |
| Package-only accept | RFQ row may be stale — PO for wrong/missing trade — **W08/W09 drift** |
| Employee role issues PO | API allows — **QA security gap** |

---

## 12. Manual workarounds

- Use **Operations Trades tab** instead of TenderDetail batch PO until projectId fixed.
- Manually pass `project.id` if fixing batch client-side.
- Issue POs one trade at a time from Operations.

---

## 13. Cross-module dependencies

| Module | Link |
|--------|------|
| W09 | `accepted_trades`, `projects.id` |
| W08 | Accepted `rfqs` with `quote_amount` |
| W10 | Separate materials PO path |
| W12 | `scheduled_completion` on PO body |
| Buildxact | Job link on `projects.buildexact_job_id` |

---

## 14. Data ownership

| Writer | Table |
|--------|-------|
| `/api/po/issue` | `purchase_orders` |
| Procurement `issue-po` | `purchase_orders` (materials) |
| win-finalize | **Does not** write POs |

---

## 15. Current tests

| Test | Status |
|------|--------|
| W09-API-06 | gap-documented (projectId) |
| W05-API-04 batch-po-check | missing |
| E2E PO issue | missing |

---

## 16. Missing tests

| ID | Purpose |
|----|---------|
| W11-API-01 | Operations path issues PO with valid projectId |
| W11-API-02 | batch-po-check lists unissued accepted rfqs |
| W11-API-03 | Batch path documents projectId failure |
| W11-API-04 | PO links rfq_id and project_id |
| W11-SEC-01 | Role gate on po/issue — **passes** (W11-SEC-02) |

---

## 17. Confirmed drift items

| ID | Risk |
|----|------|
| **W11-DRIFT-001** | Batch PO empty projectId (alias W09-DRIFT-006) |
| **W11-DRIFT-002** | Dual PO systems (sub vs materials) — different auth |
| **~~W11-DRIFT-003~~** | ~~`/api/po/issue` no role gate~~ — **closed W11-PO-SEC-01** (accepted 2026-06-27) |
| **W11-DRIFT-004** | Buildxact PO create without complete/sync to actuals |
| **W11-DRIFT-005** | Package-only accepts may not appear in batch check |

---

## 18. Unconfirmed risks

- PO issued with $0 if win wizard allowed empty quote_amount (mitigated P0-B4).
- Duplicate PO if batch retried after partial success.

---

## 19. P0 candidates

| Item | Notes |
|------|-------|
| Fix batch PO projectId (small client fix) | Separate from W10; high user impact |
| W11-API-01/02 test skeleton | Before PO fix |
| W11-SEC-01 role gate assessment | Security |

---

## 20. P1/P2 candidates

| Item | Priority |
|------|----------|
| Buildxact PO completion sync | P2 |
| Unified PO audit trail | P2 |
| Supplier confirmation tracking | P1 (if field exists — **partial**) |

---

## 21. Sam decisions needed

| ID | Question | Recommended |
|----|----------|-------------|
| **SAM-W11-001** | Fix batch PO projectId in hardening or defer? | **Fix — smallest client change** |
| **SAM-W11-002** | Require admin role on `/api/po/issue`? | **Yes — align with procurement issue-po** |

---

## 22. Recommended hardening stance

Test Operations PO path first. Fix batch projectId as smallest-safe P0-C item. Add role gate before broad PO automation. Do not merge W10/W11 PO paths during hardening.

---

## 23. Next safe action

Approve P0-C order; implement W11-DRIFT-001 fix only after W11-API tests exist.

---

## Key questions answered

| Question | Answer |
|----------|--------|
| What creates PO? | `POST /api/po/issue` or procurement `issue-po` |
| Batch PO after win? | **Detection works; issuance broken** on TenderDetail |
| project_id/job_id? | Requires `projectId` + optional `jobId` in body |
| Links to rfqs? | `rfq_id` on insert |
| Buildxact? | Create on issue when job id provided |
| Supplier confirmations? | **Partial** — trade commitment log, not full confirmation workflow |
| PO audit? | `issued_at`, status; no dedicated audit table |
| Package-only accept? | May not mirror to `rfqs` — batch check misses |

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-25 | W11 mapped — Batch C |

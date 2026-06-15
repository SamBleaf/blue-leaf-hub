---
sop_version: 1.0
last_reviewed: 2026-06-16
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Request a Quote and Track to Delivered

**Module:** Procurement
**SOP ID:** 16-06
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin, Supervisor

---

## 2. When to use it

To move an item through its lifecycle: request a supplier quote, record the order (PO sent / confirmed), and mark it delivered — keeping the order-by risk and committed cost accurate.

---

## 3. What this does

Each register item has a workflow status. This SOP covers the practical path:

`not_started → quote_requested → quote_received → approved → po_sent → order_confirmed → delivery_booked → delivered → closed`

Requesting a quote sets the item to **quote_requested** and flags that a quote is awaited (it then appears in the Command Centre "Awaiting quotes"). Moving the status to **po_sent** (and entering an approved amount, Admin) makes the item count toward the job's **committed cost** in the Financial Command Centre. Marking **delivered** retires the item from risk.

> Auto-drafting a purchase order from the register is a Phase 2 feature. For now, raise the PO in the existing purchase-order flow and set the status here.

---

## 4. Before you start

- Admin or Supervisor role (entering approved cost is Admin-only).
- The item exists in the register.

---

## 5. Step-by-step process

1. Operations → Procurement → **Register**, select the job.
2. **Request a quote:** use the item's status dropdown → "Quote requested" (or the API `request-quote` action). The item now shows in "Awaiting quotes" on the Command Centre.
3. **Record the quote:** set status → "Quote received"; enter the quoted amount (Admin).
4. **Order it:** raise the PO in the existing purchase-order flow, then set status → "PO sent". Enter the approved amount (Admin) — this becomes committed cost.
5. **Confirm + deliver:** set "Order confirmed" when the supplier confirms; "Delivered" on arrival.
6. The risk pill follows status — a delivered item is always On track.

[insert screenshot: status dropdown progressing through the workflow]

---

## 6. What happens next

Committed cost rises by the approved amount once the item is at "PO sent" or beyond, visible as the **Committed** KPI on the job's Financial Command Centre. Delivered items drop out of the risk views.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Expecting the Hub to send the PO | Auto-PO is Phase 2 | Raise the PO in the existing flow; set status here |
| Committed cost didn't move | Status not yet "PO sent", or no approved amount | Set status to PO sent and enter the approved amount |
| Quote item stuck in "Awaiting quotes" | Status left at quote_requested | Advance to quote_received once the quote is in |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| 501 on "Draft PO" | Auto-PO is a Phase 2 stub | Use the existing purchase-order flow |
| Approved amount field missing | You're a Supervisor | Cost entry is Admin-only |
| Committed KPI absent on FCC | No items at/after PO sent | Advance an item to PO sent with an approved amount |

---

## 9. Related SOPs

- 16-03: Manage the Procurement Register
- 16-04: Triage the Command Centre
- 05-03: Operations — Issue a Purchase Order

---

## 10. Approval and sign-off

Cost/PO actions are Admin-only. Raising the actual PO follows the existing purchase-order SOP.

---

## 11. Version history

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-16 | Claude | Initial draft (BQ-10 P1 build) |

---

## 12. Screenshots required

- [ ] Status dropdown showing the workflow steps
- [ ] Committed KPI on the Financial Command Centre

---

## 13. Notes for trainers

Status drives two things at once: the risk pill (is this on track?) and committed cost (what have we committed to spend?). Keeping status honest is what makes both the Command Centre and the Finance margin trustworthy.

---

## 14. Troubleshoot Agent Test Script

**Test environment:** Local dev (`npm run dev`). Migrations 085 + 091 applied; a job with a generated register.

### TC-01 — Request a quote

**Action:** Call `POST /api/procurement/items/:id/request-quote` (or use the status dropdown).
**Expected:** Item status → `quote_requested`, `supplierQuoteStatus` → `pending`, `userModified` true.
**Pass criteria:** Response item reflects those values.

---

### TC-02 — Awaiting-quotes bucket

**Action:** After TC-01, load the Command Centre.
**Expected:** The item appears in **awaitingQuotes**.
**Pass criteria:** Item present in that bucket.

---

### TC-03 — Advance to PO sent + committed cost

**Action:** As Admin, set status `po_sent` and `approved_amount` = 12000 on an item.
**Expected:** `GET /api/procurement/jobs/:jobId/committed-cost` returns `committed` ≥ 12000.
**Pass criteria:** Committed reflects the approved amount.

---

### TC-04 — Committed shows on the Financial Command Centre

**Action:** Load `GET /api/finance/jobs/:jobId/command-centre`.
**Expected:** `kpis.committed_cost` ≥ 12000; the Committed KPI renders on the FCC.
**Pass criteria:** Value present and matches.

---

### TC-05 — Delivered retires risk

**Action:** Set an at-risk item's status to `delivered`.
**Expected:** Its risk becomes `on_track`; it leaves the Command Centre risk buckets.
**Pass criteria:** Risk = on_track.

---

### TC-06 — Draft-PO is feature-flagged (feature test)

**Action:** Call `POST /api/procurement/items/:id/draft-po`.
**Expected:** HTTP 501 with a message pointing to the existing PO flow.
**Pass criteria:** 501 returned; no PO created.

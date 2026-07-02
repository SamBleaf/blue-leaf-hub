---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Draft a Purchase Order from a Procurement Item

**Module:** Procurement
**SOP ID:** 16-10
**Status:** Draft
**Priority:** Medium

---

## 1. Who uses this

Admin

---

## 2. When to use it

When a builder-supplied item is ready to order and you want a draft purchase order created and linked, so it counts toward committed cost and can be finalised in the Purchase Orders flow.

---

## 3. What this does

From a Register row, **PO** creates a **draft** `purchase_orders` record (status `draft`), pre-filled with the supplier, the item as a line item, and the amount (approved → quoted → allowance). It links the PO back to the procurement item (`purchase_order_id`) and advances the item to `po_drafted`. **It does not send or issue the PO** — you review and issue it in the existing Purchase Orders flow.

Only **builder-supplied** items can be drafted (subbie/client/PC items are not ordered by Blue Leaf).

---

## 4. Before you start

- Admin role (PO/cost actions are admin-only).
- The item is builder-supplied and has a supplier + an amount.

---

## 5. Step-by-step process

1. Operations → Procurement → **Register** → select the job.
2. On a builder-supplied row, click **PO**.
3. A draft PO is created and linked; the item moves to **PO drafted**.
4. Go to the Purchase Orders flow to review, complete and issue it.
5. When the order is placed, set the item's status to **PO sent** (this counts it toward committed cost).

> 💡 **Tip:** The draft uses the item's approved amount if set, else quoted, else the allowance. Enter an approved amount for an accurate committed-cost figure.

[insert screenshot: Register row PO action + linked draft PO]

---

## 6. What happens next

The item shows as linked to the PO. Committed cost (admin view) reflects it once the item reaches PO sent with an approved amount. Issuing/sending the PO stays in the existing Purchase Orders flow — the Hub never sends it for you.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| PO button missing | Item isn't builder-supplied, or you're not admin | Only builder-supplied items, admin only |
| Committed cost didn't move | Item not at PO sent / no approved amount | Advance to PO sent + enter approved amount |
| Two draft POs for one item | Clicked PO twice | The item links the latest; void extras in the PO flow |

---

## 8. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| 400 "Only builder-supplied items…" | Item is subbie/client/PC | Those aren't ordered by us |
| 403 | Not admin | PO actions are admin-only |

---

## 9. Related SOPs

- 16-06: Request a Quote and Track to Delivered
- 05-03: Operations — Issue a Purchase Order

---

## 10. Screenshot placeholders

[insert screenshot: Register row with PO action button on a builder-supplied item]
[insert screenshot: Linked draft PO record in the Purchase Orders flow showing status "draft"]

---

## 11. Automation notes

- **Draft PO:** `POST /api/procurement/items/:id/draft-po` — creates a `purchase_orders` row with `status = "draft"`, pre-filled with supplier, item as a line item, and amount (approved → quoted → allowance). Sets `purchase_order_id` on the procurement item. Sets item status to `po_drafted`.
- Amount priority: `approved_amount_ex_gst` → `quoted_amount_ex_gst` → `allowance_ex_gst`. If none set, the PO amount is $0.
- No email is sent. No PO is issued. The draft is for review in the Purchase Orders flow.
- **Committed cost** is triggered by advancing the item to `po_sent` (not `po_drafted`) with an approved amount — draft alone does not count toward committed cost.

---

## 12. Edge cases and limits

- Only **builder-supplied** items can generate a draft PO. Subbie/client/PC-supplied items return 400 "Only builder-supplied items are ordered by us".
- Admin-only action — Supervisor returns 403.
- Clicking PO twice creates a second draft PO. The item links only the latest `purchase_order_id`. Void any extras in the Purchase Orders flow.
- `po_number` is system-generated and unique — no two draft POs will have the same number.
- The draft PO must be reviewed and issued in the Purchase Orders flow before any supplier commitment is made.
- Status `po_drafted` is an intermediate state — risk remains at its prior level until the item reaches `po_sent`.

---

## 13. Owner of the process

Admin (PO drafting and cost entry)  
Next review date: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

**Test environment:** Local dev (`npm run dev`). Migration 085 applied; a job with a generated register.

### TC-01 — Draft PO for a builder-supplied item
**Action:** As admin, click PO on a builder-supplied row.
**Expected:** `POST /api/procurement/items/:id/draft-po` returns `{ purchaseOrder, item }`; a draft purchase_orders row exists.
**Pass criteria:** PO status `draft`; item `purchaseOrderId` set; item status `po_drafted`.

### TC-02 — Non-orderable item rejected
**Action:** Call draft-PO on a subbie/client item.
**Expected:** 400 "Only builder-supplied items are ordered by us…".
**Pass criteria:** No PO created.

### TC-03 — Role gate
**Action:** Call draft-PO as supervisor.
**Expected:** 403 (admin-only).
**Pass criteria:** Blocked.

### TC-04 — Nothing sent
**Action:** After TC-01, inspect the PO.
**Expected:** Status `draft`; not issued/sent.
**Pass criteria:** No send/issue side effect.

### TC-05 — Committed cost reflects PO sent
**Action:** Set the linked item to po_sent with approved_amount = 10000 (admin).
**Expected:** `GET /committed-cost` ≥ 10000; FCC Committed KPI shows it.
**Pass criteria:** Committed reflects the firm amount.

### TC-06 — po_number unique (feature test)
**Action:** Draft POs for two different items.
**Expected:** Distinct `po_number` values; no unique-constraint error.
**Pass criteria:** Both created successfully.

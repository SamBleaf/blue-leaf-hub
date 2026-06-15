---
sop_version: 1.0
last_reviewed: 2026-06-16
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Manage Suppliers & Performance

**Module:** Procurement
**SOP ID:** 16-07
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin, Supervisor

---

## 2. When to use it

To add and maintain your material suppliers (Bone Timber, window/truss/steel/joinery/flooring vendors), mark preferred suppliers, and review supplier performance (on-time rate, lead-time accuracy) learned from delivery history.

---

## 3. What this does

Suppliers are **material vendors** — distinct from subcontractors (trade installers). Each supplier carries contact details, account terms, usual lead time, usual products, and a preferred flag. As procurement items are ordered and delivered, the Hub records a lead-time observation per item and aggregates it into the supplier's **performance**: on-time rate, average lead-time variance, and a **learned lead time** (the median actual lead from real deliveries). These are computed — never typed.

---

## 4. Before you start

- Admin or Supervisor role.
- Migrations 085 + 092 applied (092 adds the performance columns + the lead-time learning ledger).

---

## 5. Step-by-step process

1. Operations → Procurement → **Suppliers**.
2. **+ Add supplier** — enter name (required), contact, email, phone, account terms, usual products, usual lead time, and tick **Preferred** if they're your go-to for that trade.
3. **Edit** any supplier from the row action.
4. The table shows performance: **On-time %**, **Lead var** (+ = late on average), **Learned** (median actual lead days), **Orders** (completed).
5. Press **↻** on a row to recompute performance from the latest delivery history.

> 💡 **Tip:** Performance numbers appear once items supplied by that vendor have been marked **delivered** (with an order date). Until then they read "—".

[insert screenshot: Suppliers table with performance columns]

---

## 6. What happens next

Preferred suppliers and good performers rank first in backup-supplier suggestions. Learned lead times help you sanity-check the lead-time you enter on a register item.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Performance always "—" | No items delivered yet, or items had no order date | Mark items delivered (the lifecycle records ordered→delivered) |
| Duplicate supplier | Added manually + seeded from invoices | Edit/merge; the ABN seed is one-time |
| Editing performance by hand | It's computed | Use ↻ to recompute; don't expect to type it |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| "Database not configured" | Migration 092 not applied | Apply migration 092 |
| Performance never updates | Items not reaching delivered with an order date | Advance items through po_sent → delivered |

---

## 9. Related SOPs

- 16-03: Manage the Procurement Register
- 16-06: Request a Quote and Track to Delivered
- 16-09: AI Drafts

---

## 10. Approval and sign-off

Not required.

---

## 11. Version history

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-16 | Claude | Initial draft (BQ-10 P2/P3) |

---

## 12. Screenshots required

- [ ] Suppliers table + performance
- [ ] Add/edit supplier modal

---

## 13. Notes for trainers

The learning loop is the payoff: the more you record real deliveries, the more the Hub's lead-time estimates reflect *your* suppliers, not generic guesses. Performance is derived from an immutable observation ledger — it can be recomputed any time and never drifts.

---

## 14. Troubleshoot Agent Test Script

**Test environment:** Local dev (`npm run dev`). Migrations 085 + 092 applied.

### TC-01 — Suppliers tab renders
**Action:** Open Operations → Procurement → Suppliers as Admin.
**Expected:** Table with performance columns; "+ Add supplier" visible.
**Pass criteria:** No console errors.

### TC-02 — Add a supplier
**Action:** Add a supplier with name + lead time, tick Preferred.
**Expected:** `POST /api/procurement/suppliers` returns the supplier; row shows PREF.
**Pass criteria:** Supplier persists on reload.

### TC-03 — Edit a supplier
**Action:** Edit a supplier's account terms.
**Expected:** `PATCH /api/procurement/suppliers/:id` returns updated supplier.
**Pass criteria:** Change persists.

### TC-04 — Auth/role gate
**Action:** Call `GET /api/procurement/suppliers` with no token, then as an employee.
**Expected:** 401 (no token); 403 (employee).
**Pass criteria:** Neither leaks supplier data.

### TC-05 — Refresh performance
**Action:** With at least one delivered item for a supplier, press ↻.
**Expected:** `POST /api/procurement/suppliers/:id/refresh-performance`; on-time %, lead var, learned populate.
**Pass criteria:** Values computed from observations.

### TC-06 — Learning ledger captured on delivery (feature test)
**Action:** Order an item (po_sent, set ordered date), then mark delivered.
**Expected:** A `supplier_lead_observations` row is created; supplier `completed_orders` increments.
**Pass criteria:** Observation exists; performance reflects it.

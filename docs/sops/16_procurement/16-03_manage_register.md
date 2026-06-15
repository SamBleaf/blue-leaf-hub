---
sop_version: 1.0
last_reviewed: 2026-06-16
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Manage the Procurement Register

**Module:** Procurement
**SOP ID:** 16-03
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin, Supervisor

---

## 2. When to use it

Day-to-day: to tune lead times, set suppliers, record on-site dates, change item status, add a one-off item, or remove an item that doesn't apply.

---

## 3. What this does

The Register is the editable spreadsheet of one job's procurement items. Each row carries a source badge (Template / Estimate / Schedule / Manual), supply type, the supplier, the required on-site date, the supplier lead time, the **computed** order-by date, the workflow status, and a risk pill. Admins additionally see cost columns (allowance and approved). Editing any field marks the item as user-modified so a later Regenerate won't overwrite it.

---

## 4. Before you start

- Admin or Supervisor role (cost columns are Admin-only).
- The job's register exists (see 16-02).

---

## 5. Step-by-step process

1. Operations → Procurement → **Register**.
2. Select the job in the dropdown.
3. Edit inline:
   - **Supply** — builder/subbie/client/PC supplied.
   - **On-site** — the date the item is needed on site (drives order-by).
   - **Lead (d)** — supplier lead time in days.
   - **Supplier** — pick from the suppliers list.
   - **Status** — move through the workflow (e.g. quote requested → approved → PO sent → order confirmed → delivered).
   - **Allowance / Approved** (Admin) — ex-GST costs.
4. The **Order by** column updates automatically (on-site − lead − approval buffer − review buffer). It cannot be hand-typed.
5. **+ Add item** — add a one-off item not in the template.
6. **✕** on a row — remove an item (it won't return on Regenerate).

> 💡 **Tip:** "Order by" reads "needs date" until the item has an on-site date. Set one (or link the schedule and Regenerate) and the risk pill comes alive.

[insert screenshot: Register table with inline editors and risk pills]

---

## 6. What happens next

Changes save immediately and the item's risk recomputes. Items with a sent PO and an approved amount roll up into the job's committed cost in the Financial Command Centre.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Cost columns not visible | You're a Supervisor | Cost columns are Admin-only by design |
| Order-by won't change when typed | It's computed, not editable | Change the on-site date, lead time, or buffers |
| Removed item came back | (Should not happen) | Removal sets `required = false`; report if it returns |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| Edit doesn't save | Network/role | Confirm Admin/Supervisor; check the Network tab for the PATCH |
| Supplier dropdown empty | No suppliers yet | Add suppliers (POST `/api/procurement/suppliers`) or seed from invoices |
| "Invalid status" on save | A status string outside the enum | Use the dropdown values only |

---

## 9. Related SOPs

- 16-02: Generate a Procurement Plan
- 16-04: Triage the Command Centre
- 16-06: Request a Quote and Track to Delivered

---

## 10. Approval and sign-off

Not required for this SOP.

---

## 11. Version history

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-16 | Claude | Initial draft (BQ-10 P1 build) |

---

## 12. Screenshots required

- [ ] Register table with inline editors
- [ ] Add item flow
- [ ] Admin cost columns vs Supervisor view

---

## 13. Notes for trainers

The register is the source of truth. Editing here, not in the schedule. The schedule shows order-by dates that come *from* here. The computed order-by is the discipline: it forces you to keep the on-site date and lead time honest.

---

## 14. Troubleshoot Agent Test Script

**Test environment:** Local dev (`npm run dev`). Migrations 085 + 091 applied; a job with a generated register.

### TC-01 — Register loads

**Action:** Select a job in the Register dropdown.
**Expected:** `GET /api/procurement/jobs/:jobId/items` returns `{ ok: true, items: [...], committed, riskCounts }`; the table renders.
**Pass criteria:** `ok: true`; item keys are camelCase (`orderByDate`, `leadTimeDays`).

---

### TC-02 — Inline edit persists + sets user_modified

**Action:** Change an item's lead time and blur the field.
**Expected:** `PATCH /api/procurement/items/:id` returns the updated item; `userModified` is now true.
**Pass criteria:** Value saved; `userModified: true` in the response.

---

### TC-03 — Order-by recomputes from inputs

**Action:** Set on-site date = 2026-10-01, lead = 42 (buffers default 5 + 3).
**Expected:** `orderByDate` = 2026-08-12 (Oct 1 − 50 days).
**Pass criteria:** Computed date correct; field is read-only in the UI.

---

### TC-04 — Add a manual item

**Action:** Press "+ Add item", enter a name.
**Expected:** `POST /api/procurement/items` returns the new item with `source: "manual"`, `userModified: true`.
**Pass criteria:** New row appears at the top.

---

### TC-05 — Soft-remove

**Action:** Press ✕ on a row and confirm.
**Expected:** `DELETE /api/procurement/items/:id` returns `{ ok: true }`; row disappears.
**Pass criteria:** Row removed; a later Regenerate does not bring it back.

---

### TC-06 — Cost columns gated to Admin (feature test)

**Action:** Load the Register as a Supervisor, then as an Admin.
**Expected:** Supervisor sees no Allowance/Approved columns; Admin does.
**Pass criteria:** Cost columns hidden for Supervisor; visible for Admin.

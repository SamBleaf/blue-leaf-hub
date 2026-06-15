---
sop_version: 1.0
last_reviewed: 2026-06-16
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Triage the Command Centre

**Module:** Procurement
**SOP ID:** 16-04
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin, Supervisor

---

## 2. When to use it

Daily / weekly. The Command Centre answers one question: *what do I need to order or chase this week, across every job?*

---

## 3. What this does

Aggregates every active procurement item across all jobs into attention sections:

- **Order-by overdue** — the order-by date has passed and it isn't ordered yet (critical).
- **Order-by due (≤21 days)** — coming up; order now to stay safe.
- **Selection blockers** — waiting on a client/architect decision.
- **Awaiting quotes** — a quote has been requested but not received.
- **Delivery risks** — ordered items now at risk of late delivery.
- **Long-lead criticals** — the big delay-makers (windows, trusses, joinery, stone…).
- **Needs a date** — items with no on-site date yet (can't compute order-by).

Each row shows the item, the job address, the order-by date with days remaining, and a risk pill. Clicking a row jumps to that item in the Register.

---

## 4. Before you start

- Admin or Supervisor role.
- At least one job with a generated register.

---

## 5. Step-by-step process

1. Operations → Procurement → **Command Centre** (default tab).
2. Work top-down: clear **Overdue** first, then **Due (≤21 days)**.
3. For **Selection blockers**, switch to the Selections tab (see 16-05) to chase the decision.
4. For **Awaiting quotes**, follow up the supplier (see 16-06).
5. Click any row to open it in the Register and update its status.

> 💡 **Tip:** A healthy week shows "Nothing at risk this week". If the Long-lead criticals list is non-empty, those are the items that actually delay builds — act on them first.

[insert screenshot: Command Centre with the seven attention sections]

---

## 6. What happens next

As you order items and update statuses, rows drop off the Command Centre automatically (risk recomputes on every read).

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Ignoring "Needs a date" | It looks harmless | Those items have no order-by — a hidden risk; give them a date |
| Only watching Overdue | Long-lead items go critical *before* they're overdue | Watch Long-lead criticals and Due ≤21d |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| Empty Command Centre but jobs exist | No registers generated | Generate plans (16-02) |
| A row won't open | Item belongs to a job with no register access | Confirm the job loads in the Register tab |

---

## 9. Related SOPs

- 16-03: Manage the Procurement Register
- 16-05: Clear a Selection Blocker
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

- [ ] Command Centre with populated sections
- [ ] A row click jumping to the Register

---

## 13. Notes for trainers

Risk is recomputed on every load because "today" moves. An item that was "watch" last week can be "critical" today without anyone touching it. That's the safety net — the Command Centre is alive.

---

## 14. Troubleshoot Agent Test Script

**Test environment:** Local dev (`npm run dev`). Migrations 085 + 091 applied; a job with a generated register containing dated items.

### TC-01 — Command Centre loads

**Action:** Open the Command Centre tab.
**Expected:** `GET /api/procurement/command-centre` returns `{ ok: true, buckets, totalActive }`.
**Pass criteria:** `ok: true`; all seven bucket keys present.

---

### TC-02 — Overdue bucket

**Action:** Set one item's on-site date in the past (so order-by < today) with status not_started.
**Expected:** The item appears in **overdue** with a red days label.
**Pass criteria:** Item in the overdue bucket; risk pill = Critical.

---

### TC-03 — Due-soon bucket

**Action:** Set an item's order-by within 21 days, status before PO sent.
**Expected:** Item appears in **dueSoon**, sorted by order-by ascending.
**Pass criteria:** Item present; sort ascending.

---

### TC-04 — Needs-a-date bucket

**Action:** Ensure an item has no on-site date.
**Expected:** Item appears in **needsDate** and NOT in overdue/dueSoon.
**Pass criteria:** Item only in needsDate.

---

### TC-05 — Auth required

**Action:** Hit `/api/procurement/command-centre` with no token.
**Expected:** HTTP 401.
**Pass criteria:** 401; no data.

---

### TC-06 — Row deep-link (feature test)

**Action:** Click a Command Centre row.
**Expected:** The view switches to the Register tab with that row's job selected.
**Pass criteria:** Register loads for the correct job.

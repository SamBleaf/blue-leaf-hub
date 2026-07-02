---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Procurement Views — Board, Calendar, Long-Lead

**Module:** Procurement
**SOP ID:** 16-08
**Status:** Draft
**Priority:** Medium

---

## 1. Who uses this

Admin, Supervisor

---

## 2. When to use it

When you want a different lens on the same register data: a **Board** (Kanban by stage) for the daily driver, a **Calendar** of order-by and delivery dates, or a cross-job **Long-Lead** view of the items that actually delay builds.

---

## 3. What this does

- **Board** — per-job Kanban with lanes (To start, Quoting, Blocked, Approve, Ordered, Delivered). Move an item by changing its status on the card.
- **Calendar** — per-job timeline grouping each item's **order-by** and **delivery** events by week.
- **Long-Lead** — cross-job list of long-lead items (lead time ≥ 28 days) still in flight, sorted by order-by, with risk pills. These are windows, trusses, steel, joinery, stone, etc.

All three read the same register; they're views, not separate data.

---

## 4. Before you start

- Admin or Supervisor role.
- A job with a generated register (Board/Calendar). Long-Lead works across all jobs.

---

## 5. Step-by-step process

1. Operations → Procurement.
2. **Board** tab → pick a job → drag your eye down the lanes; change a card's status dropdown to move it.
3. **Calendar** tab → pick a job → scan order-by (blue) and delivery (green) events week by week.
4. **Long-Lead** tab → review every long-lead item across all jobs; click one to open it in the Register.

> 💡 **Tip:** Long-Lead is the view to check weekly — those items are where a missed order-by actually costs you weeks.

[insert screenshot: Board / Calendar / Long-Lead]

---

## 6. What happens next

Status changes on the Board persist immediately and re-risk the item. Calendar and Long-Lead reflect the current register live.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Board empty | No job selected or no register | Generate the plan first |
| Calendar shows nothing | Items have no dates | Set on-site dates / link the schedule |
| Long-Lead empty | No items with lead ≥ 28d in flight | That's good — nothing long-lead at risk |

---

## 8. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Card status won't change | Not admin/supervisor | Log in with the right role |
| Long-Lead 403 | Employee role | Procurement is admin/supervisor |

---

## 9. Related SOPs

- 16-03: Manage the Register
- 16-04: Triage the Command Centre

---

## 10. Screenshot placeholders

[insert screenshot: Board tab with six lanes (To start, Quoting, Blocked, Approve, Ordered, Delivered) and item cards]
[insert screenshot: Calendar tab with order-by (blue) and delivery (green) events grouped by week]
[insert screenshot: Long-Lead tab showing cross-job list with job address, lead time, and risk pill]

---

## 11. Automation notes

- **Board status change:** Card status dropdown fires `PATCH /api/procurement/items/:id` — same as the Register inline edit; persists immediately.
- **Calendar and Long-Lead:** Read-only views; no writes. Data sourced from `GET /api/procurement/jobs/:jobId/items` (Board/Calendar per job) and `GET /api/procurement/long-lead` (cross-job).
- Long-lead threshold: items with `lead_time_days ≥ 28` and `status` before `delivered`.
- No email or notification triggered by any of these views.

---

## 12. Edge cases and limits

- Board and Calendar require a job to be selected — the view is blank until a job is picked from the dropdown.
- Long-Lead is cross-job; no job selection needed.
- If Long-Lead returns empty, it means no in-flight items have lead time ≥ 28 days — correct (not a bug).
- Board, Calendar, and Long-Lead all reflect the same register data; they can never disagree (single source of truth in `procurement_items`).
- Employee role returns 403 on all procurement endpoints including `long-lead`.
- Calendar items with no delivery date only show the order-by event (blue); delivery event (green) only shows when a delivery date is set.

---

## 13. Owner of the process

Admin / Supervisor  
Next review date: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

**Test environment:** Local dev (`npm run dev`). Migrations 085 + 091 applied; a job with a generated register.

### TC-01 — Board renders + lanes
**Action:** Board tab → select a job.
**Expected:** Six lanes render; items appear in lanes by status.
**Pass criteria:** No console errors.

### TC-02 — Move a card
**Action:** Change a card's status dropdown.
**Expected:** `PATCH /api/procurement/items/:id`; card moves lane on reload.
**Pass criteria:** Status persists.

### TC-03 — Calendar groups by week
**Action:** Calendar tab → select a job with dated items.
**Expected:** Events grouped under "Week of …", order-by (blue) + delivery (green) badges.
**Pass criteria:** Chronological order; no crash.

### TC-04 — Long-Lead cross-job
**Action:** Long-Lead tab.
**Expected:** `GET /api/procurement/long-lead` returns items with lead ≥ 28d; rows show job address + risk.
**Pass criteria:** Only long-lead, non-delivered items.

### TC-05 — Role gate
**Action:** Call `GET /api/procurement/long-lead` as employee.
**Expected:** 403.
**Pass criteria:** No data leak.

### TC-06 — Views agree with Register (feature test)
**Action:** Change an item's status in the Board, then open the Register.
**Expected:** The Register shows the same status.
**Pass criteria:** Board and Register never disagree (one source of truth).

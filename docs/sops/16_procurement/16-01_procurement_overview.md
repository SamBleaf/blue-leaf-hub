---
sop_version: 1.0
last_reviewed: 2026-06-16
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Procurement Module — Overview and Navigation

**Module:** Procurement
**SOP ID:** 16-01
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin, Supervisor

---

## 2. When to use it

When you need to understand how the Procurement section of Blue Leaf Hub is structured and how to move between the Command Centre, the per-job Register, and the Selections view.

---

## 3. What this does

Procurement Intelligence (BQ-10) is the "no surprises" system: it tells you *what to order and by when* so a long-lead item (windows, trusses, joinery, stone) or an unmade client selection never delays a build. The **register** (`procurement_items`) is the single source of truth for every job's order-by dates. The order-by date is computed automatically (on-site date − supplier lead time − approval buffer − internal review buffer) and re-computes whenever the schedule moves. The module has three tabs:

- **Command Centre** — cross-job "what needs attention this week": order-by overdue/due, selection blockers, awaiting quotes, delivery risks, long-lead criticals, and items that still need a date.
- **Register** — the per-job spreadsheet of procurement items, inline-editable.
- **Selections** — items blocked waiting on a client/architect decision (reads the client-portal decisions).

---

## 4. Before you start

- You must be logged in with Admin or Supervisor role.
- Migrations `085_procurement_intelligence.sql` and `091_procurement_template_seed.sql` must have been applied.
- The register for a job is auto-created when the job is **locked** in the Financial Command Centre, or by pressing **Regenerate** in the Register tab.

---

## 5. Step-by-step process

1. Log in to Blue Leaf Hub.
2. Open the **Operations** department from the top nav.
3. In the Operations sidebar, click **Procurement**.
4. The page opens on the **Command Centre** tab by default.
5. Use the three tabs at the top to switch view:
   - **Command Centre** — triage across every job.
   - **Register** — pick a job from the dropdown to see its item list.
   - **Selections** — pending client/architect decisions holding up orders.
6. Click any Command Centre row to jump straight to that item in the Register.

> 💡 **Tip:** The Command Centre is the daily driver — open it each morning. If it says "Nothing at risk this week", you're on top of procurement.

[insert screenshot: Procurement Command Centre with attention sections]

---

## 6. What happens next

From the Command Centre you triage; from the Register you edit items, generate/regenerate the plan, add manual items, and mark progress; from Selections you chase decisions. Committed cost (items with a sent PO) flows automatically into the job's Financial Command Centre.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Register is empty | Job was never locked and Regenerate was never pressed | Lock the job in Finance, or press Regenerate in the Register tab |
| Procurement nav missing | User role is Employee | Log in with Admin or Supervisor |
| Order-by shows "needs date" | No schedule task is linked to that trade yet | Add a required-on-site date on the item, or build the schedule and Regenerate |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| "Failed to load" on Command Centre | Migration 085 not applied | Apply migration 085 (and 091 for the template) |
| No jobs in the Register dropdown | No projects have a linked job | Confirm projects have a `job_id` |
| Regenerate does nothing | No active templates and no Buildxact estimate | Apply migration 091 (template seed) or link a Buildxact estimate |

---

## 9. Related SOPs

- 16-02: Generate a Procurement Plan
- 16-03: Manage the Procurement Register
- 16-04: Triage the Command Centre
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

- [ ] Operations sidebar showing Procurement nav item
- [ ] Command Centre with attention sections
- [ ] Register tab with job selected
- [ ] Selections tab

---

## 13. Notes for trainers

The register is the source of truth — the schedule renders order-by dates *from* it, not the other way round. The old `schedule_tasks.procurement_*` fields are frozen (kept only for provenance). Order-by is computed and cannot be hand-typed; to change it, change the on-site date, the lead time, or the buffers.

---

## 14. Troubleshoot Agent Test Script

**Test environment:** Local dev (`npm run dev`). DB must have migrations 085 + 091 applied.

### TC-01 — Navigation renders correctly

**Action:** Log in as Admin. Open Operations → Procurement.
**Expected:**
- URL is `/operations/procurement`.
- Three tabs visible: Command Centre, Register, Selections.
- Command Centre is the active tab.

**Pass criteria:** All elements present, no console errors.

---

### TC-02 — Empty state message

**Action:** With no items at risk, view the Command Centre.
**Expected:** Empty state: "Nothing at risk this week".
**Pass criteria:** Message displayed, no 500 errors.

---

### TC-03 — Tab switching works

**Action:** Click Register, then Selections, then Command Centre.
**Expected:** Each tab renders its own content; the active tab shows the primary underline.
**Pass criteria:** No navigation away from `/operations/procurement`; no console errors.

---

### TC-04 — Auth required

**Action:** Open `GET /api/procurement/command-centre` with no auth token.
**Expected:** HTTP 401.
**Pass criteria:** 401 response, no data leak.

---

### TC-05 — API health check

**Action:** Hit `GET /api/procurement/command-centre` with a valid Bearer token.
**Expected:** `{ ok: true, buckets: {...}, totalActive: <n> }`.
**Pass criteria:** `ok: true`; bucket arrays present (overdue, dueSoon, selectionBlockers, awaitingQuotes, deliveryRisks, longLeadCriticals, needsDate).

---

### TC-06 — Register dropdown lists jobs (feature test)

**Action:** Open the Register tab.
**Expected:** The job dropdown lists every project that has a linked job, by address.
**Pass criteria:** At least one job selectable; selecting one loads its items via `GET /api/procurement/jobs/:jobId/items`.

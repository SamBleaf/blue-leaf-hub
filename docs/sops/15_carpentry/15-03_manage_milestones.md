---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Manage Carpentry Job Milestones

**Module:** Carpentry  
**SOP ID:** 15-03  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this

Admin, Supervisor

---

## 2. When to use it

When you need to track job progress against key schedule dates — e.g. when framing starts, when lock-up is achieved, when fit-off is complete. Use the Schedule tab to mark milestones complete and record actual dates.

---

## 3. What this does

Each carpentry job has a set of milestones (target dates and actual completion dates). Default milestones are seeded automatically when a job is created. You can add custom milestones, mark them complete, set target and actual dates, and delete milestones you don't need.

---

## 4. Before you start

- A carpentry job must exist (see SOP 15-02)
- You must be on the job's detail page

---

## 5. Step-by-step process

**Mark a milestone complete:**

1. Open the carpentry job from the dashboard
2. Click the **Schedule** tab
3. Find the milestone you want to mark complete
4. Click the **circle button** to the left of the milestone name
5. The circle turns green with a tick (✓), the milestone row turns green, and today's date is automatically entered as the actual completion date
6. To un-complete: click the green circle again — it reverts to "pending"

**Set target dates:**

1. On the Schedule tab, find a milestone row
2. Click the **Target** date field next to the milestone name
3. Select a date from the date picker
4. The date is saved automatically

**Add a custom milestone:**

1. On the Schedule tab, scroll to the bottom
2. Type the milestone name in the text field (e.g. "Brickwork Complete")
3. Press **Enter** or click **Add**
4. The milestone appears in the list

**Delete a milestone:**

1. Find the milestone row on the Schedule tab
2. Click the **✕** button at the right end of the row
3. The milestone is removed immediately (no undo)

> 💡 **Tip:** Default milestones come pre-seeded in the correct order for your project type. Fill in target dates first, then mark them complete as each phase is finished on site.

[insert screenshot: Schedule tab with milestones, some complete (green), some pending]

---

## 6. What happens next

Completed milestones show a green row with strikethrough text. Pending milestones with a past target date are visually distinguishable. The milestone data feeds into future job performance reports.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Milestone marked complete too early | Checked off in advance rather than on completion | Only mark complete when work is physically done on site |
| Wrong sort order for custom milestones | Custom milestones are appended to the end | Drag-to-reorder is not yet available — add milestones in order or use the sort_order field |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| "Failed to add milestone" error | Network or auth issue | Refresh page and try again |
| Milestone not saving actual date | Date picker cleared before blur | Re-enter the date |

---

## 9. Related SOPs

- 15-01: Carpentry Overview
- 15-02: Create a Carpentry Job
- 15-04: Write a Diary Entry

---

## 10. Screenshot placeholders

[insert screenshot: Schedule tab with "Auto-lay out dates" panel collapsed, showing a mix of pending (white) and complete (green) milestone rows]
[insert screenshot: A complete milestone row with tick, strikethrough text, Target and Actual date pickers visible]
[insert screenshot: Add milestone input field at the bottom of the list]

---

## 11. Automation notes

- When a milestone is toggled to complete, the API automatically sets `actual_date` to today's date (UTC). The user can override this date in the Actual date picker after marking complete.
- When toggled back to pending, `actual_date` is cleared.
- The Auto-lay out dates panel sends `POST /api/carpentry/jobs/:id/milestones/auto-layout` — first as a preview (no write), then with `apply: true` to commit. Dates are computed from crew-scaled build durations and procurement lead-times.
- No email or notification is sent when milestones change.

---

## 12. Edge cases and limits

- Deleting a milestone is immediate with no undo. A confirmation prompt appears first.
- Custom milestones are appended at the end (sort_order = max + 10). There is no drag-to-reorder for milestones — delete and re-add if order matters.
- Auto-layout only sets `target_date` — it never overwrites `actual_date` or status.
- If a job has no milestones (e.g. "other" project type with defaults deleted), the Schedule tab shows "No milestones yet" and the auto-layout tool returns a 400 error.
- The `sortOrder` field can be manually patched via API to reorder milestones programmatically.

---

## 13. Owner of the process

Admin / Supervisor  
Next review date: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### TC-01 — List milestones for job

**Action:** GET `/api/carpentry/jobs/:id/milestones` for an existing job.  
**Expected:** `{ ok: true, milestones: [ { id, name, status, sortOrder, targetDate, actualDate } ] }` — all camelCase.  
**Pass criteria:** Array returned, keys are camelCase.

---

### TC-02 — Add custom milestone

**Action:** POST `/api/carpentry/jobs/:id/milestones` with `{ name: "Engineer Inspection", sortOrder: 25 }`.  
**Expected:** `{ ok: true, milestone: { id: "...", name: "Engineer Inspection", status: "pending", sortOrder: 25 } }`.  
**Pass criteria:** Milestone created, status "pending".

---

### TC-03 — Mark milestone complete

**Action:** PATCH `/api/carpentry/milestones/:mid` with `{ status: "complete", actualDate: "2026-06-01" }`.  
**Expected:** `{ ok: true, milestone: { status: "complete", actualDate: "2026-06-01" } }`.  
**Pass criteria:** `status === "complete"`, `actualDate` set.

---

### TC-04 — Update target date

**Action:** PATCH `/api/carpentry/milestones/:mid` with `{ targetDate: "2026-07-15" }`.  
**Expected:** `{ ok: true, milestone: { targetDate: "2026-07-15" } }`.  
**Pass criteria:** `targetDate` updated.

---

### TC-05 — Delete milestone

**Action:** DELETE `/api/carpentry/milestones/:mid`.  
**Expected:** `{ ok: true }`.  
**Verification:** GET milestones list — deleted milestone is absent.  
**Pass criteria:** 200 with `ok: true`, milestone absent from list.

---

### TC-06 — Invalid status rejected

**Action:** PATCH `/api/carpentry/milestones/:mid` with `{ status: "in_progress" }`.  
**Expected:** HTTP 400, `{ ok: false, error: "status must be one of: pending, complete." }`.  
**Pass criteria:** 400 status, validation error returned.

---

### TC-07 — UI toggle completes and un-completes

**Action:** In the browser, click the circle button on a pending milestone.  
**Expected:** Row turns green, circle shows tick, target date input remains, actual date field appears.  
**Action:** Click the green circle again.  
**Expected:** Row reverts to white, circle turns grey.  
**Pass criteria:** Both state changes visible, PATCH requests logged in Network tab.

---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: placeholders_only
owner: Admin
test_status: static_pass
---

# SOP 05-06: Identify Trade Conflicts Across Projects

**Module:** Operations Manager → Trade Conflicts  
**SOP ID:** 05-06  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Admin, Supervisor

## 2. When to use it
When planning trade schedules, to catch cases where the same trade is booked on two different sites at overlapping times — which physically can't happen with one crew.

## 3. What this does
Scans all active projects' incomplete tasks and flags any trade that is scheduled on two or more different projects with overlapping date ranges. It surfaces the clash so you can re-sequence before the crew is double-booked.

## 4. Before you start
- You are logged in
- At least two active projects with scheduled, trade-assigned tasks

## 5. Step-by-step process

1. Go to **Operations** (`/operations`)
2. On the landing page, review the **Trade scheduling conflicts** banner (if any clashes exist) — it appears above the project list when the scan finds overlaps
3. The system scans active projects automatically via `GET /api/operations/trade-conflicts`
4. Each conflict in the banner shows:
   - The **trade** in conflict
   - The **projects** involved, with the conflicting task name and date range on each
5. For each conflict, decide which project takes priority and re-sequence the other in its schedule (SOP 06-03)

> **Note:** There is no separate “Trade Conflicts” page — conflicts surface on the Operations dashboard banner and in the global Gantt panel badge when clashes exist.

## 6. What happens next

- The scan is read-only — it reports clashes, it doesn't resolve them
- A conflict is reported when the same trade name appears on tasks in 2+ different active projects whose date ranges overlap
- Resolving a conflict means editing one project's schedule so the dates no longer overlap

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Ignoring a flagged conflict | "It'll be fine" | A double-booked crew delays both jobs — re-sequence early |
| Different trade names not matching | "Concreter" vs "Concrete" | Use consistent trade names so the matcher catches the clash |
| Expecting completed tasks to flag | Misunderstanding | Only incomplete tasks on active projects are scanned |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Supabase not configured" (503) | Server env vars missing |
| Known clash not flagged | Check both tasks are on **active** projects, < 100% complete, have start AND end dates, and use the **same** trade name |
| Too many conflicts | Trade names may be inconsistent — standardise naming |

## 9. Related modules
- [View the global Gantt](operations_global_gantt.md) — SOP 05-05
- [Edit a schedule](../06_scheduling/06-03_edit_schedule.md) — SOP 06-03

## 10. Screenshot placeholders
[insert screenshot: trade conflicts list]
[insert screenshot: a single conflict with two projects]

## 11. Automation notes
- API: `GET /api/operations/trade-conflicts` (requires auth) → `{ ok: true, conflicts: [...] }`
- Only tasks where `deleted_at IS NULL`, `start_date` and `end_date` not null, `percent_complete < 100`, and project `status = 'active'` are considered
- Trade key = `assignee_trade ?? trade`
- Overlap test: `a.start <= b.end AND b.start <= a.end`, across **different** projects only
- A conflict is emitted when 2+ distinct projects clash for the same trade

## 12. Edge cases and limits
- Same-project overlaps are ignored (one crew can stagger within a site)
- Trade matching is by exact (trimmed) name — inconsistent naming hides real clashes
- Completed tasks (100%) never flag
- Tasks missing a start or end date are skipped

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in
- [ ] Two ACTIVE projects, each with an incomplete task for the SAME trade (e.g. "Concrete") on overlapping dates

### Test cases

**TC-01 — Conflict detected (happy path)**
1. Ensure Project A and Project B both have a "Concrete" task with overlapping date ranges
2. Open Trade Conflicts
3. Expected: a conflict for "Concrete" listing both projects with their task names and dates
4. Expected: `GET /api/operations/trade-conflicts` returns the conflict in `conflicts[]`
- [ ] Pass  [ ] Fail

**TC-02 — No overlap, no conflict**
1. Change Project B's Concrete dates so they no longer overlap Project A
2. Reload
3. Expected: no conflict reported for Concrete
- [ ] Pass  [ ] Fail

**TC-03 — Same project overlap ignored**
1. Create two overlapping Concrete tasks within the SAME project
2. Expected: NOT reported as a conflict (same project is allowed)
- [ ] Pass  [ ] Fail

**TC-04 — Completed tasks excluded**
1. Mark one of the conflicting tasks 100% complete
2. Expected: the conflict disappears (completed tasks aren't scanned)
- [ ] Pass  [ ] Fail

**TC-05 — Inactive project excluded**
1. Set Project B's status to something other than `active`
2. Expected: the conflict disappears (only active projects scanned)
- [ ] Pass  [ ] Fail

**TC-06 — Missing dates skipped**
1. Clear the end_date on one conflicting task
2. Expected: that task is skipped, conflict no longer reported
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Overlapping trade across projects flagged
- [ ] Non-overlapping not flagged
- [ ] Same-project overlap ignored
- [ ] Completed/inactive/dateless tasks excluded
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

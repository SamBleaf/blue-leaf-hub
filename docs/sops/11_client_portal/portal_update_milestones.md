---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_fail
---

# SOP 11-08: Update Portal Milestones

**Module:** Client Portal — Admin  
**SOP ID:** 11-08  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin staff and project managers who manage the client's view of the build schedule and key milestones.

## 2. When to use it
- When setting up the portal for the first time — enter the target dates for all milestones
- When a milestone date changes due to delays or early completion
- When a milestone has been achieved — mark it as complete

## 3. What this does
Creates and updates the milestone progress bar shown in the client's portal. Milestones are the key stages of the build — Slab Pour, Frame, Roof, Lock-Up, Fitout, Handover. The client can see which milestones are complete, which is next, and the target dates for future milestones.

## 4. Before you start
- The portal is enabled for this project (SOP 11-01)
- You have the project schedule available (from Operations → Schedule) to reference milestone dates
- You are logged in as Admin

## 5. Step-by-step process

### Setting up milestones for the first time
1. Go to **Portal Admin** → select the project → click the **Milestones** tab
2. Click **+ Add Milestone** for each key stage
3. Enter:
   - **Milestone name** — e.g. "Slab Pour", "Frame Complete", "Lock-Up", "Practical Completion"
   - **Target date** — from the project schedule
4. Click **Save** for each milestone

### Updating a milestone date
1. Find the milestone in the list
2. Click **Edit** → change the target date
3. Click **Save**

### Marking a milestone as complete
1. Find the achieved milestone
2. Click **Mark Complete** (or toggle the complete checkbox)
3. The milestone shows as complete in the client portal with a tick

## 6. What happens after
- Milestone data feeds into the client's portal home page progress indicator
- The client can see at a glance how far through the build they are
- Completed milestones stack up to show progress

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Not setting milestones at all | Feels like extra admin | Milestones are the first thing clients look at — set them up before sharing the portal link |
| Using internal codes as milestone names | Copied from internal schedule | Use plain English names the client will understand — "Slab Pour" not "FOUND-02" |
| Not updating dates when schedule slips | Forgetting to sync | When you update the project schedule, update the portal milestones at the same time |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Milestones not appearing in client portal | Check the portal is enabled; preview the client view (SOP 11-02) |
| Wrong number of milestones showing | Some milestones may have been added to the wrong project — check the project in Portal Admin |
| Cannot mark a milestone complete | Ensure you are logged in as Admin and the portal is enabled |

## 9. Related SOPs
- [Enable the client portal for a project](portal_enable_for_client.md) — SOP 11-01
- [View the portal as the client](portal_view_as_client.md) — SOP 11-02
- [Client guide — using your portal](portal_client_guide.md) — SOP 11-09

## 10. Automation notes
- API: `POST /api/portal/admin/milestones` — body: `{ projectId, name, targetDate, completed?: false }` — creates or updates a milestone
- DB effects: upserts into portal milestones table with `project_id`, `name`, `target_date`, `completed`, `completed_at`
- Client views milestones via `GET /api/portal/:token/timeline`
- Admin summary via `GET /api/portal/admin/:projectId/summary`

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] A project with portal enabled exists
- [ ] Portal token known for client-side verification

### Test cases

**TC-01 — Add a milestone (happy path)**
1. Portal Admin → project → Milestones → + Add Milestone
2. Enter name "Slab Pour", target date 3 weeks from today
3. Click Save
4. Expected: milestone appears in list with correct name and date
5. Expected API: `POST /api/portal/admin/milestones` returns `{ ok: true, milestone: { id, name, targetDate } }`
6. Expected DB: new row in milestones table with `project_id` correct, `completed = false`
- [ ] Pass  [ ] Fail

**TC-02 — Milestone visible in client portal timeline**
1. After TC-01, call `GET /api/portal/:token/timeline`
2. Expected: the new milestone appears in the timeline array
3. Expected: `completed: false` and `targetDate` matches what was entered
- [ ] Pass  [ ] Fail

**TC-03 — Mark milestone as complete**
1. Find the milestone from TC-01 → click Mark Complete
2. Expected: milestone shows completed state in Portal Admin
3. Expected DB: `completed = true`, `completed_at` set
- [ ] Pass  [ ] Fail

**TC-04 — Update a milestone target date**
1. Edit the milestone date from TC-01 to a different date
2. Expected: updated date shown in Portal Admin and in client portal
3. Expected DB: `target_date` updated
- [ ] Pass  [ ] Fail

**TC-05 — Missing name rejected**
1. Attempt to add a milestone with no name
2. Expected: HTTP 400 with plain English error
- [ ] Pass  [ ] Fail

**TC-06 — Multiple milestones for same project**
1. Add 4 milestones: Slab Pour, Frame Complete, Lock-Up, Practical Completion
2. Call `GET /api/portal/:token/timeline`
3. Expected: all 4 milestones returned, ordered by target date
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Milestone created and visible in client portal
- [ ] Mark complete updates DB and client view
- [ ] Date update persists
- [ ] Validation rejects missing name
- [ ] Multiple milestones ordered correctly
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

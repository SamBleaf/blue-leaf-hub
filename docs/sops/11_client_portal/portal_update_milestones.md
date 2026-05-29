---
sop_version: 1.1
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
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
   - **Key** (required) — a short semantic identifier used to link the milestone to schedule phases, e.g. `"slab"`, `"frame"`, `"lockup"`, `"handover"`. Must be unique per project.
   - **Label** (required) — the human-readable name shown to the client, e.g. "Slab Pour", "Frame Complete", "Lock-Up", "Practical Completion"
   - **ETA** — estimated completion date from the project schedule (ISO date string, e.g. "2026-08-15")
   - **What comes next** (optional) — brief description of the next phase for the client
   - **Description** (optional) — any additional context for this milestone
4. Click **Save** for each milestone

### Updating a milestone date
1. Find the milestone in the list
2. Click **Edit** → change the ETA date
3. Click **Save**

### Marking a milestone as complete
1. Find the achieved milestone
2. Click **Mark Complete** — a timestamp is recorded
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
| "projectId, key, label required" error | Both `key` and `label` are required fields — `key` is a semantic identifier (e.g. `"slab"`) and `label` is the display name |
| Duplicate key error | Each milestone must have a unique `key` per project — use distinct identifiers like `"slab"`, `"frame"`, `"lockup"`, `"handover"` |

## 9. Related SOPs
- [Enable the client portal for a project](portal_enable_for_client.md) — SOP 11-01
- [View the portal as the client](portal_view_as_client.md) — SOP 11-02
- [Client guide — using your portal](portal_client_guide.md) — SOP 11-09

## 10. Automation notes
- API: `POST /api/portal/admin/milestones` — creates or updates (upserts) a milestone
  - Body: `{ projectId, key, label, eta?, achievedAt?, description?, whatComesNext?, sortOrder? }`
  - Required: `projectId`, `key`, `label` — omitting any returns HTTP 400 "projectId, key, label required"
  - `key` — short semantic identifier, unique per project (e.g. `"slab"`, `"frame"`, `"lockup"`, `"handover"`)
  - `label` — display name shown to the client
  - `eta` — target date (ISO date string)
  - `achievedAt` — ISO timestamp when milestone was completed (set this to mark complete; do NOT use a boolean `completed` field)
  - Response: `{ ok: true, milestone: { id, projectId, key, label, eta, achievedAt, description, sortOrder, ... } }`
- DB columns: `key`, `label`, `eta`, `achieved_at` (NOT `name`, `target_date`, `completed`, `completed_at`)
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
2. Send: `POST /api/portal/admin/milestones` with:
   ```json
   { "projectId": "<id>", "key": "slab", "label": "Slab Pour", "eta": "2026-08-15" }
   ```
3. Expected: `{ ok: true, milestone: { id, projectId, key: 'slab', label: 'Slab Pour', eta: '2026-08-15', achievedAt: null } }`
4. Expected DB: new row with `key = 'slab'`, `label = 'Slab Pour'`, `eta = '2026-08-15'`, `achieved_at = null`
- [ ] Pass  [ ] Fail

**TC-02 — Milestone visible in client portal timeline**
1. After TC-01, call `GET /api/portal/:token/timeline`
2. Expected: the new milestone appears in the timeline array
3. Expected: `achievedAt: null` (not completed) and `eta` matches what was entered
4. Expected: field names are `key`, `label`, `eta` — NOT `name`, `targetDate`, `completed`
- [ ] Pass  [ ] Fail

**TC-03 — Mark milestone as complete**
1. Re-call `POST /api/portal/admin/milestones` with the same key, adding `achievedAt`:
   ```json
   { "projectId": "<id>", "key": "slab", "label": "Slab Pour", "achievedAt": "2026-08-14T14:30:00Z" }
   ```
2. Expected: milestone shows completed state in Portal Admin
3. Expected DB: `achieved_at` set to the provided timestamp (NOT a boolean `completed` column)
- [ ] Pass  [ ] Fail

**TC-04 — Update a milestone ETA date**
1. Re-call `POST /api/portal/admin/milestones` with same key and a new `eta` date
2. Expected: updated ETA shown in Portal Admin and in client portal
3. Expected DB: `eta` column updated (NOT `target_date`)
- [ ] Pass  [ ] Fail

**TC-05 — Missing required fields rejected**
1. Call without `key` → Expected: HTTP 400 "projectId, key, label required"
2. Call without `label` → Expected: HTTP 400 "projectId, key, label required"
3. Call without `projectId` → Expected: HTTP 400
- [ ] Pass  [ ] Fail

**TC-06 — Multiple milestones for same project**
1. Add 4 milestones with keys: `"slab"`, `"frame"`, `"lockup"`, `"handover"`
   - Labels: "Slab Pour", "Frame Complete", "Lock-Up", "Practical Completion"
2. Call `GET /api/portal/:token/timeline`
3. Expected: all 4 milestones returned, ordered by `eta`
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Milestone created and visible in client portal
- [ ] Mark complete updates DB and client view
- [ ] Date update persists
- [ ] Validation rejects missing name
- [ ] Multiple milestones ordered correctly
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

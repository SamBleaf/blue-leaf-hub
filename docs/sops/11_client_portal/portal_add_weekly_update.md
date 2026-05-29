---
sop_version: 1.1
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 11-03: Add a Weekly Update

**Module:** Client Portal — Admin  
**SOP ID:** 11-03  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin staff and project managers who communicate build progress to clients through the portal.

## 2. When to use it
Once a week — typically every Friday — to tell the client what was achieved on site that week, what is coming up next week, and anything they need to be aware of.

## 3. What this does
Creates a weekly update post that appears on the client's portal home page and in their timeline. The update includes a title, a written summary, and optionally photos. Once published, the client can read it immediately.

## 4. Before you start
- The portal is enabled for this project (SOP 11-01)
- You have a summary of the week's progress ready to write
- Any progress photos have been uploaded or are ready to upload (SOP 11-04)

## 5. Step-by-step process

1. Go to **Portal Admin** → select the project → click the **Updates** tab
2. Click **+ New Update**
3. Fill in:
   - **Week of** (required) — the week this update covers, e.g. "2026-05-26" (Monday of the week, ISO date)
   - **Headline** (required) — a short summary line, e.g. "Frame Complete — Roof Sheeting Starting"
   - **Body** (required) — plain English description of progress, 2–5 sentences. What was completed? What is coming next week? Any notable items?
   - **Author name** (optional) — defaults to your logged-in name
   - **Video URL** (optional) — a link to a site video for this week
4. Optionally attach photos (or upload them separately via SOP 11-04)
5. Click **Publish**
6. The update appears immediately in the client's portal

## 6. What happens after
- A record is inserted into the portal updates table linked to the project
- The client sees the update on their home page and in the timeline
- Previous updates remain visible — the client can scroll back through history

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Skipping weeks | Busy schedule | Set a recurring Friday reminder to write the update — clients notice when communication drops off |
| Writing internal jargon | Copying from internal notes | Write as if speaking to the client face-to-face — plain language, no trade codes |
| Publishing before photos are ready | Rushing | Photos can be added after publishing — save a draft if needed and publish once photos are uploaded |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Update published but not visible to client | Refresh the portal preview (SOP 11-02); check the update was saved with `published = true` |
| Cannot find the Updates tab | Ensure the portal is enabled for the project — see SOP 11-01 |
| Headline or body cleared after saving | Check for network timeout — re-enter and save again |
| "weekOf required" error | The week-of date is required — enter the Monday date for the week being reported (e.g. "2026-05-26") |

## 9. Related SOPs
- [Enable the client portal for a project](portal_enable_for_client.md) — SOP 11-01
- [Upload progress photos to the portal](portal_upload_photos.md) — SOP 11-04
- [View the portal as the client](portal_view_as_client.md) — SOP 11-02

## 10. Automation notes
- API (create): `POST /api/portal/admin/updates` — body: `{ projectId, weekOf, headline, body, authorName?, published?, videoUrl? }`
  - Required: `projectId`, `weekOf`, `headline`, `body` — omitting any returns HTTP 400
  - Response: `{ ok: true, update: { id, projectId, weekOf, headline, body, authorName, published, videoUrl, createdAt } }`
- API (edit): `PATCH /api/portal/admin/updates/:updateId` — body: `{ headline?, body?, authorName?, published?, videoUrl? }`
  - Response: `{ ok: true, update: { ...updatedFields } }`
- DB effects: inserts/updates row in portal updates table with columns `project_id`, `week_of`, `headline`, `body`, `author_name`, `published`, `video_url`
- Note: there is no `title` or `summary` field — the headline is the title and body is the content

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] A project with portal enabled exists

### Test cases

**TC-01 — Create a weekly update (happy path)**
1. Portal Admin → project → Updates → + New Update
2. Enter:
   - weekOf = this Monday's date (e.g. "2026-05-26")
   - headline = "Week 1 Update — Site Prep"
   - body = "Excavation completed. Footings poured. Slab booked for next Thursday."
3. Click Publish
4. Expected: success confirmation
5. Expected API: `POST /api/portal/admin/updates` returns `{ ok: true, update: { id, projectId, weekOf, headline, body, published, ... } }`
6. Expected DB: new row in portal updates table with `project_id`, `week_of`, `headline`, `body` all set correctly
- [ ] Pass  [ ] Fail

**TC-02 — Update visible in client portal**
1. After TC-01, open the client portal URL (`GET /api/portal/:token/home`)
2. Expected: the new update appears in the home data response
- [ ] Pass  [ ] Fail

**TC-03 — Edit an existing update**
1. Find the update from TC-01 → click Edit → change the body text
2. Click Save
3. Expected API: `PATCH /api/portal/admin/updates/:updateId` returns `{ ok: true, update: { ...updatedFields } }`
4. Expected DB: `body` field updated on the row
- [ ] Pass  [ ] Fail

**TC-04 — Missing required fields rejected**
1. Attempt to publish an update with no headline (leave blank)
2. Expected: HTTP 400 "projectId, weekOf, headline, body required" (or equivalent plain English)
3. Also test missing weekOf — same expected result
- [ ] Pass  [ ] Fail

**TC-05 — Multiple updates for same project stack chronologically**
1. Create a second update for the same project
2. Open the client portal home
3. Expected: both updates appear, newest first
- [ ] Pass  [ ] Fail

**TC-06 — Update scoped to correct project**
1. Create an update for Project A
2. Open the portal for Project B
3. Expected: Project A's update does NOT appear in Project B's portal
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Update created and visible in client portal
- [ ] Edit works and persists
- [ ] Validation rejects missing title
- [ ] Multiple updates stack correctly
- [ ] Project isolation confirmed
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

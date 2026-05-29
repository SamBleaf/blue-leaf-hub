---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_fail
---

# SOP 11-04: Upload Progress Photos to the Portal

**Module:** Client Portal — Admin  
**SOP ID:** 11-04  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Admin staff and site supervisors uploading site photos to keep clients informed of build progress.

## 2. When to use it
Any time you have photos worth sharing with the client — after a milestone is reached (slab pour, frame up, lock-up), after a weekly site visit, or when a client asks to see the current state of the site.

## 3. What this does
Uploads one or more photos to the project's portal. The photos appear in the client's timeline view under the current week's progress. Photos can also be linked to a specific weekly update.

## 4. Before you start
- The portal is enabled for this project (SOP 11-01)
- Photos are on your computer or phone — JPEG or PNG
- You are logged in as Admin

## 5. Step-by-step process

1. Go to **Portal Admin** → select the project → click the **Photos** tab
2. Click **+ Upload Photos**
3. Select one or more photos from your device (hold Shift or Ctrl to select multiple)
4. Optionally add a **caption** for each photo
5. Optionally link the photos to a **weekly update**
6. Click **Upload**
7. Photos appear in the portal immediately

## 6. What happens after
- Photos are stored in Supabase Storage
- They appear in the client's timeline ordered by upload date
- If linked to a weekly update, they also appear within that update card

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Uploading unedited photos with scaffolding clutter or poor framing | Straight from site | Quickly review photos on your phone before uploading — delete obviously bad ones |
| Uploading to the wrong project | Multiple tabs open | Check the project name in the header before uploading |
| Very large files slowing upload | High-resolution camera | Resize photos to under 5MB each before uploading — use your phone's share/resize option |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Upload fails partway through | Check file size — individual photos should be under 10MB; try uploading in smaller batches |
| Photos not showing in client portal after upload | Refresh the portal preview; check the photos tab in Portal Admin shows them |
| Upload button greyed out | Check you are logged in and the portal is enabled for this project |

## 9. Related SOPs
- [Add a weekly update](portal_add_weekly_update.md) — SOP 11-03
- [View the portal as the client](portal_view_as_client.md) — SOP 11-02

## 10. Automation notes
- API: `POST /api/portal/admin/photos/upload` — multipart/form-data with fields: `projectId`, `file` (one or more), `caption` (optional), `updateId` (optional)
- DB effects: inserts rows into portal photos table with `project_id`, `file_url`, `caption`, `update_id` (if linked), `uploaded_at`
- Files stored in Supabase Storage under `portal-photos/[projectId]/[YYYY-MM-DD]-[filename]`

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] A project with portal enabled exists
- [ ] Test JPEG or PNG photos available (at least 2)

### Test cases

**TC-01 — Upload a single photo (happy path)**
1. Portal Admin → project → Photos → + Upload Photos
2. Select one JPEG, leave caption blank, click Upload
3. Expected: success message
4. Expected DB: new row in portal photos table with correct `project_id` and `file_url`
- [ ] Pass  [ ] Fail

**TC-02 — Upload with caption**
1. Upload a photo with caption "Slab pour completed"
2. Expected DB: `caption = 'Slab pour completed'` on the new row
3. Expected: caption visible in client portal timeline
- [ ] Pass  [ ] Fail

**TC-03 — Upload multiple photos at once**
1. Select 3 photos and upload together
2. Expected: all 3 photos appear in the Photos tab
3. Expected DB: 3 new rows inserted with the same `uploaded_at` timestamp (within 1 second)
- [ ] Pass  [ ] Fail

**TC-04 — Photo linked to weekly update**
1. Create a weekly update first (SOP 11-03)
2. Upload a photo and link it to that update via the `updateId` field
3. Expected DB: `update_id` set on the photo row
4. Expected: photo appears within the update card in the client portal
- [ ] Pass  [ ] Fail

**TC-05 — Missing projectId rejected**
1. Call `POST /api/portal/admin/photos/upload` with no `projectId`
2. Expected: HTTP 400 with plain English error
- [ ] Pass  [ ] Fail

**TC-06 — Photos appear in client portal timeline**
1. After TC-01, open the client portal URL and check the timeline
2. Expected: the uploaded photo appears in the timeline view
3. Expected: photo URL is accessible (loads in browser)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Single and multiple photo uploads succeed
- [ ] Captions and update linking work
- [ ] Photos visible in client portal
- [ ] Validation rejects missing project
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

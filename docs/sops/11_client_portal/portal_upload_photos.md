---
sop_version: 1.2
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 11-04: Upload Progress Photos to the Portal

> **LEGACY — v1 token portal (fallback only).** For new jobs use the v2 client portal — see [00_PORTAL_STACK_MATRIX.md](00_PORTAL_STACK_MATRIX.md) and SOPs 11-10..11-13. Note: photos in the v2 Journey tab currently use the legacy media endpoint and have a known rendering gap (see SOP 11-13 §7). This SOP covers photo upload for the v1 `/portal/:token` stack only.

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
- Photos are stored in Dropbox under the project's portal folder
- A record is created in the database with the Dropbox storage path and a public URL for client access
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
- API: `POST /api/portal/admin/photos/upload` — **JSON body** (not multipart/form-data):
  ```
  {
    projectId:      string (required),
    fileName:       string (required) — original filename including extension,
    contentBase64:  string (required) — the photo file encoded as base64,
    caption?:       string,
    updateId?:      string — links the photo to a weekly update,
    milestoneKey?:  string — links to a milestone,
    isHero?:        boolean,
    takenAt?:       ISO date string,
    sortOrder?:     number
  }
  ```
  - Each photo is a separate API call — upload multiple photos by calling the endpoint once per file
  - Response: `{ ok: true, photo: { id, projectId, storagePath, publicUrl, caption, ... } }`
- Storage backend: **Dropbox** — photos are uploaded to the project's Dropbox folder, not Supabase Storage
- DB effects: inserts row into portal photos table with `project_id`, `storage_path` (Dropbox path), `public_url` (served via `/api/portal/media/:photoId`), `caption`, `update_id`, `taken_at`
- Note: there is no `file_url` column — use `storage_path` (Dropbox) and `public_url` (served endpoint)

## 11. Screenshot placeholders
[insert screenshot: Portal Admin Photos tab with + Upload Photos button]
[insert screenshot: Client portal timeline showing an uploaded photo card with caption]

## 12. Edge cases and limits
- The API accepts JSON body only — not multipart/form-data; the photo must be base64-encoded in `contentBase64`
- Each photo requires a separate API call — there is no batch upload in a single request
- Storage backend is Dropbox, not Supabase Storage; `storage_path` holds the Dropbox path and `public_url` is the served endpoint
- There is no `file_url` column — always use `storage_path` (backend) and `public_url` (client-accessible served URL)
- Photos are linked to a weekly update via `updateId` (optional); without it, photos appear in the general timeline only
- There is no enforced per-file size limit on the server — the Dropbox upload may fail for very large files; aim for under 10 MB per photo
- Photo order is by upload date; `sortOrder` can be set but is not enforced by the client view
- Deleting a photo is not supported through the admin UI — contact a developer to remove a photo from the DB and Dropbox

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] A project with portal enabled exists
- [ ] Test JPEG or PNG photos available (at least 2)

### Test cases

**TC-01 — Upload a single photo (happy path)**
1. Portal Admin → project → Photos → + Upload Photos
2. Read a JPEG file, base64-encode it, send as JSON:
   `{ projectId, fileName: "slab-pour.jpg", contentBase64: "<base64 string>" }`
3. Expected: `{ ok: true, photo: { id, projectId, storagePath, publicUrl } }`
4. Expected DB: new row in portal photos table with correct `project_id` and `storage_path` set (not null)
- [ ] Pass  [ ] Fail

**TC-02 — Upload with caption**
1. Upload a photo with `caption: "Slab pour completed"` in the JSON body
2. Expected: `{ ok: true, photo: { ... caption: "Slab pour completed" } }`
3. Expected DB: `caption = 'Slab pour completed'` on the new row
4. Expected: caption visible in client portal timeline
- [ ] Pass  [ ] Fail

**TC-03 — Upload multiple photos (sequential calls)**
1. Make 3 separate `POST /api/portal/admin/photos/upload` calls, one per photo
2. Expected: all 3 calls succeed and all 3 photos appear in the Photos tab
3. Expected DB: 3 new rows each with distinct `storage_path`
- [ ] Pass  [ ] Fail

**TC-04 — Photo linked to weekly update**
1. Create a weekly update first (SOP 11-03) — note its ID
2. Upload a photo with `updateId: <update_id>` in the JSON body
3. Expected DB: `update_id` set on the photo row
4. Expected: photo appears within the update card in the client portal
- [ ] Pass  [ ] Fail

**TC-05 — Missing required fields rejected**
1. Call `POST /api/portal/admin/photos/upload` with no `projectId` — Expected: HTTP 400
2. Call with no `fileName` — Expected: HTTP 400
3. Call with no `contentBase64` — Expected: HTTP 400
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

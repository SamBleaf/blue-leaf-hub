---
sop_version: 1.0
last_reviewed: 2026-06-19
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP: Add a photo when completing a site task

**Module:** Workforce
**SOP ID:** 10-03
**Status:** Draft
**Priority:** Medium

---

## 1. Who uses this
- Field workers (all crew, on the Worker app) — to attach a completion photo
- Admin / Supervisor (office) — to review the photos against the job

## 2. When to use it
When a worker finishes a site task and wants to show the completed work with a photo (e.g. "frame done", "rubbish cleared"), so the office has a visual record.

## 3. What this does
Lets any worker snap a photo when they mark a site task done. The photo is saved against that task and shows up in the office on the project (or carpentry job) page next to the completed task — a visual record of the finished work, like Wunderbuild's progress photos.

## 4. Before you start
- The worker has opened the Worker app via their personal link (`/worker?token=…`).
- They are on a job they've logged hours against (that's how the app knows which site's tasks to show).
- A task exists to complete (created by the office in Operations → project → Site Tasks, or on a carpentry job).

## 5. Step-by-step process

**Worker (on the app):**
1. Open the Worker app and tap **Site tasks**.
2. Tap the task you finished.
3. (Optional) type a short **completion note**.
4. Tap **Add photo** → take a photo or choose one. Wait for the thumbnail to appear ("Photo ✓").
5. Tap **Mark as done**.

**Office (reviewing):**
6. Open **Operations → the project → Site Tasks** (or **Carpentry → the job → Tasks**).
7. Under the **Done** tasks, the photo thumbnail appears next to the task — tap it to view full-size.

> 💡 **Tip:** Photos are downscaled on the phone before upload, so they send quickly even on site data.

[insert screenshot: worker task sheet with Add photo + thumbnail]
[insert screenshot: office Done task showing the photo thumbnail]

## 6. What happens next
The photo is stored privately in the `site-media` storage bucket and the task records its location. The office sees it (via a short-lived secure link) on the project/job tasks list. Nothing is emailed; it's a passive visual record.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Tapping "Mark as done" before the photo finishes uploading | Slow site data | Wait for "Photo ✓" before marking done |
| Photo doesn't appear in the office | Looking at active tasks, not Done | Photos show on **completed** tasks under the Done group |
| Wrong task gets the photo | Tapped the wrong task | The photo attaches to the task open in the sheet — check the title first |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Could not save the photo" | Storage bucket missing or upload failed | Confirm migration 099 is applied (creates the `site-media` bucket); retry |
| "Upload the photo before completing the task" | A raw image was sent instead of an uploaded one | Re-pick the photo so it uploads first, then Mark as done |
| Office shows a broken image | Signed link expired (older than 1h) or legacy data | Reload the page to get a fresh signed link |

## 9. Related modules
- [Worker app iOS install](worker_pwa_ios_install.md) → getting the app on the worker's phone
- [Workforce overview](workforce_overview.md) → site tasks, timesheets and approvals

## 10. Screenshot placeholders
[insert screenshot: Add photo button + uploaded thumbnail in the task sheet]
[insert screenshot: Operations project Done task with photo]
[insert screenshot: Carpentry job Done task with photo]

## 11. Automation notes
- File saved to: storage bucket `site-media`, path `site-tasks/<task_id>/<date>-<rand>-<filename>` (private).
- Record updated: `site_tasks.completion_photo_url` stores the storage PATH (not base64, not a URL).
- Office read: the server attaches a 1-hour signed URL as `completion_photo_signed_url` (the stored path is never overwritten).
- No email or notification is triggered.
- Status change: the task moves to `done` (with `completed_by`, `completed_at`).

## 12. Edge cases and limits
- Photo size capped at ~6 MB after on-device downscale (max dimension 1280px, JPEG); larger is rejected with a plain message.
- One photo per task completion in v1 (multiple photos is a planned enhancement).
- Works for both construction projects and carpentry jobs.
- Legacy inline base64 photos (pre-v1) still display; new writes must be uploaded paths.
- A photo is tied to the task; deleting the task does not auto-delete the stored object (cleanup is a future enhancement).

## 13. Owner of the process
Admin / Director
Next review date: 2026-12-19

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Setup: apply migration 099 (creates the `site-media` bucket); ensure at least one worker has a worker link; have a project task and a carpentry-job task available.

| TC | What to test | Steps | Expected result |
|----|--------------|-------|-----------------|
| TC-01 | Worker can attach + complete (happy path) | Worker app → Site tasks → open a task → Add photo → Mark as done | Task shows done; `site_tasks.completion_photo_url` is a PATH like `site-tasks/<id>/2026-…` (NOT `data:`); the object exists in the `site-media` bucket |
| TC-02 | All workers (no leading-hand gate) | Use a NON-leading-hand worker token | The Add photo button is shown and the upload succeeds (no 403) |
| TC-03 | Base64 cannot be persisted | POST `/api/worker/tasks/:id/complete` with `photoPath` starting `data:` or `http` | Returns 400 "Upload the photo before completing the task."; DB unchanged |
| TC-04 | Office viewer — construction | Operations → project → Site Tasks → Done | Completed task shows the photo thumbnail; clicking opens full-size via a signed https URL (no bare path, no base64 in DOM) |
| TC-05 | Office viewer — carpentry | Carpentry → job → Tasks → Done | Completed carpentry task shows the photo thumbnail + notes |
| TC-06 (feature) | Resubmit does not corrupt the path | Complete a task with a photo, then re-fetch tasks (office + worker) repeatedly | `completion_photo_url` stays a bare path on every read; `completion_photo_signed_url` is a separate https field; the stored path is never overwritten by a signed URL |
| TC-07 (feature) | Bucket-missing failure is graceful | Temporarily point at a non-existent bucket | POST `/api/worker/photos` returns 502 with a plain message, no raw Supabase error string |

---
sop_version: 1.0
last_reviewed: 2026-06-21
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP 11-13: Project Journey & Documents (Portal v2.0)

**Module:** Client Portal v2.0  
**SOP ID:** 11-13  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
The **client** (logged in) reads the Journey and downloads documents. Admin and Supervisor use this SOP to understand what the client sees and to verify stage updates, photos and the document archive appear correctly.

## 2. When to use it
- The client uses **Journey** to follow the build stage by stage — the timeline, the latest weekly updates, and site photos.
- The client uses **Documents** to find and download the files the builder has shared (contract, plans, approved variation PDFs, certificates).
- Staff use this SOP after publishing an update or after a variation/claim archives a PDF, to confirm the client can see and download it.

## 3. What this does
Gives the client a single, ordered story of their build (the Journey timeline) and a tidy archive of their paperwork (Documents). The Journey stitches together milestones, the builder's stage updates, and photos from site. Documents groups files by folder and lets the client download any file the builder has marked client-visible — re-checking visibility at download time so nothing is exposed by accident.

## 4. Before you start
- The client is logged in (SOP 11-10) and portal v2 is enabled (SOP 11-12)
- Milestones and at least one published update exist (SOP 11-12) for the Journey to show content
- For documents to appear, files must be flagged **client-visible** — most arrive automatically when a variation or claim PDF is archived; the contract/plans archive depends on the builder's document flow
- For photos to appear in Journey, site photos must be attached to the project

## 5. Step-by-step process

### Following the Journey
1. Log in and open the **Journey** tab (this becomes **My Home** after practical completion — see SOP 11-12)
2. The timeline shows each stage in order, marked complete / current / upcoming
3. Expand a stage to read the builder's **updates** for that stage and view **site photos**
4. The latest weekly update and the build-health/confidence note appear against the current stage

### Downloading a document
5. Open the **Documents** tab
6. Files are grouped by folder (e.g. variations, contract, plans, certificates)
7. Click a document to **download** it
8. The file opens or downloads — a Supabase-stored file comes via a short-lived signed link; a Dropbox/finance file is streamed to you

> 💡 **Tip:** Approved variation PDFs land in Documents automatically once you approve them on My Actions (SOP 11-11) — you do not need to ask the builder to send them.

[insert screenshot: Journey timeline with current stage expanded showing an update and photos]

## 6. What happens next
- **Journey** is a read view — opening it does not change anything. It reads milestones, published updates (drafts are hidden), and project photos
- **Documents download** re-checks `client_visible` on the file before serving it; if a file was un-shared, the download is blocked
- A download does not currently write an audit row (only variation views/approvals are audited)
- New documents appear here automatically when a variation/claim PDF is archived (after the client approves, or finance issues)

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Client says "there are no photos" | The v2 photo `<img>` tags hit the legacy media endpoint which needs a `?token=` and 404s for a logged-in client | Known issue — site photos in Journey currently fail to load for v2 clients; do not promise photos until this is fixed |
| Client can't find the contract | Documents only contains files flagged client-visible, and there is no admin upload UI in the v2 console | The contract/plans must be archived to `portal_documents` and flagged visible; until then only variation/claim PDFs appear |
| A stage update is missing | The update's stage key didn't match the milestone key | When publishing the update, set the stage key to exactly match the milestone key (e.g. `frame`) |
| Expecting "Signature required" to let them sign | The signature flag shows but there is no sign action | There is no e-signature flow; approvals are recorded by account/timestamp, not a drawn signature |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| Photos don't appear in Journey | v2 `<img>` requests the legacy `/api/portal/media/:id` which requires `?token=`; the client sends none → 404, hidden by `onError` | Known limitation — flag for the photo-endpoint fix; do not rely on Journey photos yet |
| An update doesn't appear under any stage | `update.schedule_phase` (stage key) doesn't equal any `milestone.key` | Re-publish the update with the stage key matching the milestone exactly |
| Document download fails / "not available" | The file was un-flagged `client_visible`, or the storage path/URL is missing | Confirm the document is still client-visible and has a valid storage path or URL |
| A downloaded link still works days later | A `public_url`-only document returns an un-expiring link | Prefer Supabase-stored docs (short-lived signed URL); treat `public_url` docs as effectively permanent links |
| Journey shows "On track" for a delayed upcoming stage | Confidence is only computed for the current stage | Set confidence/notes on the relevant milestone in the admin console (SOP 11-12) |

## 9. Related modules
- [Client Login & Invite](11-10_v2_client_login_and_invite.md) — SOP 11-10 (must be logged in)
- [My Actions & Approvals](11-11_v2_my_actions_approvals.md) — SOP 11-11 (approving a variation archives its PDF here)
- [Admin Console](11-12_v2_admin_console.md) — SOP 11-12 (milestones, stage updates and photos that feed the Journey)
- [Upload progress photos (legacy)](portal_upload_photos.md) — SOP 11-04 (legacy photo flow)

## 10. Screenshot placeholders
[insert screenshot: Journey timeline with complete / current / upcoming stages]
[insert screenshot: expanded stage showing the weekly update text]
[insert screenshot: Documents tab grouped by folder with a download in progress]

## 11. Automation notes
- API (journey): `GET /api/portal/app/:projectId/journey` — enriched stages from `portal_milestones` + published `portal_updates` (`published = true` filter hides drafts) + `project_photos`
- API (documents list): `GET /api/portal/app/:projectId/documents` — folders/files from `portal_documents` where the file is client-visible
- API (download): `GET /api/portal/app/:projectId/documents/:id/download` — re-checks `client_visible`; Supabase path → ~60s signed URL; Dropbox path → streamed bytes (sequential); `public_url` fallback returns the raw URL (un-expiring)
- Photos: rendered as `<img src="/api/portal/media/:id">` which targets the **legacy** media endpoint requiring `?token=` — currently fails for v2 clients (known gap)
- Stage→update mapping: an update appears under a stage when `update.schedule_phase === milestone.key`
- Records read: `portal_milestones`, `portal_updates`, `project_photos`, `portal_documents`
- Records written: documents arrive in `portal_documents` via the variation/claim archive (after approval / issue); no admin upload UI in the v2 console
- Audit: document downloads are not audited (only variation views/approvals are)

## 12. Edge cases and limits
- Journey is read-only; opening it makes no writes
- Drafts are hidden — only `published = true` updates appear
- Photos in Journey currently 404 for v2 clients (the media endpoint needs a token the client does not send)
- A document re-checks visibility at download — un-flagging it blocks the download
- A `public_url`-only document returns a non-expiring link; visibility revocation is not honoured for that path
- Confidence/health is computed only for the current stage; upcoming delayed stages may still read "On track"
- Post-completion, the Journey/Selections routes remain reachable by direct URL even though the nav hides them

## 13. Owner of the process
Admin  
Next review date: 2026-12-21

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Migration 103 applied; portal v2 enabled on the test project
- [ ] A logged-in test **client** account that is a member of the project (SOP 11-10)
- [ ] At least one milestone, one published update whose stage key matches a milestone, and one client-visible document (e.g. an approved variation PDF) exist for the project

### Test cases

**TC-01 — Happy path (standard use): read the Journey**
1. As the logged-in client, open the **Journey** tab
2. Expected result: stages render in order (complete / current / upcoming); the current stage shows the latest update
3. Expected DB-backed content: the stages come from `portal_milestones`; the visible update is a `portal_updates` row with `published = true` whose `schedule_phase` equals the milestone `key`
- [ ] Pass  [ ] Fail

**TC-02 — Empty / missing state**
1. On a project with **no published updates**, open Journey
2. Expected result: the timeline renders the stages with no update text and no error (an empty-but-valid state)
3. Expected DB: confirm only draft (`published = false`) updates exist, so none are returned — no new record is created by viewing
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission (download twice)**
1. Download a client-visible document
2. Immediately download the same document again
3. Expected result: both downloads succeed (read action, no side effects); no duplicate record is created and the file is unchanged
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role / not a member**
1. As the logged-in client, call `GET /api/portal/app/<a project they are NOT a member of>/documents`
2. Expected result: HTTP **403** "No access to this project" (membership check) — no other project's documents are returned
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification**
1. Confirm a document appears in Documents after an upstream archive (e.g. approve a variation in SOP 11-11)
2. Check DB: a `portal_documents` row exists for the project with `client_visible = true`
3. Download it and confirm a Supabase-stored file returns a short-lived signed URL (expires) while a `public_url`-only file returns a raw URL — document which path was exercised
- [ ] Pass  [ ] Fail

**TC-06 — Visibility re-check on download (feature-specific)**
1. Take a client-visible document and set `client_visible = false` (via the backing flow / DB)
2. As the client, attempt to download it via `GET /api/portal/app/:projectId/documents/:id/download`
3. Expected result: the download is **blocked** (the route re-checks `client_visible` and refuses) — the un-shared file is not served
- [ ] Pass  [ ] Fail

**TC-07 — Photos endpoint mismatch (feature-specific, known gap)**
1. Open a Journey stage that has site photos attached to the project
2. Inspect the network requests for the `<img>` tags
3. Expected result: the requests hit the legacy `/api/portal/media/:id` endpoint **without** a `?token=` and return **404** (photos silently hidden) — document this confirmed known limitation rather than passing it as working
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed (TC-07 records the known photo gap as observed, not as a hidden failure)
- [ ] No console errors observed during testing (beyond the expected photo 404)
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records read/verified correctly (`portal_milestones`, `portal_updates`, `project_photos`, `portal_documents`)
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

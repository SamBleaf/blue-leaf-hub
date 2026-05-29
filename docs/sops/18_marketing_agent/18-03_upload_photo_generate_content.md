---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: main
screenshot_status: placeholders_only
owner: Admin / Staff
test_status: tested_2026-05-29 — TC-01 PASS (Save to Library works, DB record created), TC-02 PASS (double-click save prevented), TC-03 PASS (Draft→In Review→Approved workflow), TC-04 PASS (Publish modal opens), TC-05 FAIL (publish HTTP 400 — camelCase/snake_case mismatch CRIT-01), TC-06 FAIL (status stays Approved; publish never completes)
---

# SOP 18-03: Upload a Photo and Generate Content From It

**Module:** Marketing — Content Studio → Media tab + Create tab  
**SOP ID:** 18-03  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Staff

## 2. When to use it
You have a photo from a project — a completed frame, a slab pour, a finished kitchen — and you want to generate a social post or website content that references what's actually visible in the photo.

## 3. What this does
Uploads the photo to the media library, runs a vision analysis to identify what is factually visible (vs assumed or unknown), then seeds the content generator with that photo context. The output references real visible details, not invented specs.

## 4. Before you start
- A photo ready to upload (JPG, PNG, HEIC — max 20MB)
- Know which project this photo belongs to
- Know which channel you want to post to

## 5. Step-by-step process

**Path A — From Media tab (recommended for archiving first)**

1. Go to **Marketing → Media**
2. Click the drop zone or drag your photo in
3. Fill in:
   - **Project** — link to the correct project
   - **Media Type** — Photo / Video / Drone Video / etc.
   - **Capture Date** — when was this taken
   - **Consent for marketing** — check this box to allow the asset to be used publicly
4. Click **Upload**. The system saves the file and runs an automatic stage detection and analysis.
5. Once uploaded, find the asset in the Media grid. Click it to open the asset detail.
6. Click **Generate Post** — this opens the Create tab with the photo pre-loaded and the vision analysis pre-filled in the context.
7. Continue from step 3 of SOP 18-02 (select channel, pillar, mode, topic) and generate.

**Path B — Direct upload in Create tab (faster, not archived separately)**

1. Go to **Marketing → Create**
2. In the photo upload area, drag your photo in or click to browse
3. Wait for the vision analysis to complete (~3–5 seconds)
4. Fill in the form fields and click Generate Content

> 💡 **Path A is preferred.** It archives the photo with project context, logs it in the media library, and makes it available for future content. Path B is fine for a quick one-off post but the photo is not saved to the media library.

[insert screenshot: Media tab drop zone with a photo being dragged in]
[insert screenshot: Asset detail page showing the analysis and the Generate Post button]
[insert screenshot: Create tab with photo loaded and analysis block visible]

## 6. What happens next
- Photo is stored in the `marketing-media` Supabase Storage bucket
- `marketing_media_assets` row created with `project_id`, `media_type`, `capture_date`, `analysis` JSON, `thumbnail_path`
- Clicking Generate Post opens Create tab with `media_source_id` pre-set — when content is saved, the link between the content item and the media asset is preserved

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Uploading a photo without checking consent | Easy to miss the checkbox | If `consent_for_marketing` is unchecked, the photo cannot be used in public-facing content. Always tick this for site photos intended for marketing. |
| Using Path B for every photo | Convenience | Media library becomes empty — no asset archive. Use Path A for any photo worth keeping. |
| Generating content before analysis completes | Impatient | Wait for the analysis block to appear. Content generated before analysis has no photo context. |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| Photo upload fails | File > 20MB — compress first. Check format (JPG/PNG/HEIC only) |
| Analysis shows empty or very sparse results | Indoor photos with no visible construction details have limited analysis. Add more context in the Additional Context field to compensate. |
| Generate Post button not visible on asset | Check `consent_for_marketing` is true — the button may be hidden if consent is not recorded |
| DJI D-Log M footage appears washed out in thumbnail | Expected — D-Log M is a flat colour profile. Colour grading happens at export. |

## 9. Related modules
- [Generate content with AI](18-02_generate_content_ai.md)
- [Upload and manage media assets](18-06_upload_manage_media.md)

## 10. Screenshot placeholders
[insert screenshot: Media tab showing uploaded photos in grid view]
[insert screenshot: Individual asset — analysis JSON visible]
[insert screenshot: Create tab seeded from media asset — photo visible + analysis block shown]

## 11. Automation notes
- Photo upload → vision analysis call (Claude) → stores `analysis` JSON on `marketing_media_assets.analysis`
- `stage_detected` field is auto-populated from the analysis (e.g. "frame", "lock-up", "fitout")
- `thumbnail_path` is generated automatically on upload
- DJI D-Log M files trigger `is_dji_dlog_m = true` based on EXIF/file metadata detection

## 12. Edge cases and limits
- Videos: thumbnail extracted from first frame. Analysis is from the thumbnail only — not a full video scan.
- HEIC files from iPhones are accepted but converted on upload
- If consent is later revoked, the asset remains in the media library but `consent_for_marketing` is set to false and the Generate Post button is hidden
- Multiple photos can be uploaded in one session but each gets its own analysis call

## 13. Owner of the process
Admin / Staff  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Log in as Admin
- [ ] Have a JPG photo ready (a site photo with visible construction details works best)
- [ ] A project must exist to link to

### Test cases

**TC-01 — Happy path: upload via Media tab**
1. Go to Marketing → Media
2. Drag a photo into the drop zone
3. Fill in: Project = [any active project], Media Type = Photo, Capture Date = today, Consent = checked
4. Click Upload
5. Expected result: photo appears in Media grid; thumbnail visible
6. Expected DB: `marketing_media_assets` row with `project_id` set, `media_type = 'photo'`, `consent_for_marketing = true`, `thumbnail_path` populated, `analysis` JSON non-empty (populated within ~5 seconds of upload)
- [ ] Pass  [ ] Fail

**TC-02 — Vision analysis populates**
1. After TC-01, click the uploaded asset to open detail view
2. Wait up to 10 seconds for analysis
3. Expected result: analysis block shows at least one `visible_facts` entry
4. Expected DB: `marketing_media_assets.analysis` is not `{}` — contains `visible_facts` or `design_principles` array with ≥1 item
- [ ] Pass  [ ] Fail

**TC-03 — Generate Post seeds the Create tab**
1. From the asset detail view, click Generate Post
2. Expected result: Create tab opens; photo appears in the upload area; a photo analysis context block is visible in the form
3. Expected: `media_source_id` is pre-set (verify by saving content after generation and checking DB)
- [ ] Pass  [ ] Fail

**TC-04 — Consent unchecked blocks Generate Post**
1. Upload a photo with `consent_for_marketing = false` (leave the checkbox unticked)
2. Open the asset detail
3. Expected result: Generate Post button is absent or disabled
- [ ] Pass  [ ] Fail

**TC-05 — Path B (direct Create tab upload) does not create media asset record**
1. Go to Marketing → Create
2. Upload a photo directly in the Create tab upload area
3. Generate and save content
4. Expected DB: NO new `marketing_media_assets` row created (Path B is ephemeral — photo only used for generation, not archived)
5. Expected: `marketing_content_items.media_source_id` is NULL for this item
- [ ] Pass  [ ] Fail

**TC-06 — File too large is rejected**
1. Attempt to upload a file > 20MB
2. Expected result: error message displayed before upload begins; no partial upload occurs
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Analysis populates within reasonable time (< 10s for a typical photo)
- [ ] No console errors during upload or analysis
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: main
screenshot_status: placeholders_only
owner: Admin / Staff
test_status: tested_2026-05-29 — TC-01 PASS (upload dropzone visible with file type guidance), TC-02 PASS (existing assets load with thumbnails), TC-03 PASS (asset detail panel opens on click), TC-04 FAIL (failed analysis shows "check server logs" — not user-friendly — MED-06)
---

# SOP 18-06: Upload and Manage Media Assets

**Module:** Marketing — Content Studio → Media tab  
**SOP ID:** 18-06  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Staff

## 2. When to use it
When you have new photos, videos, drone footage, or project documentation that you want to archive in the media library and make available for content generation.

## 3. What this does
Stores media files in the `marketing-media` Supabase Storage bucket with full project context. Runs automatic analysis on photos (what is visible, build stage, content opportunities). Enables one-click content generation from any archived asset.

## 4. Before you start
- Files ready to upload (see accepted formats and size limits below)
- Project must exist in the system to link assets to
- Know the capture date and media type

**Accepted formats:**
- Photos: JPG, PNG, HEIC (max 20MB each)
- Videos: MP4, MOV (max 500MB each)
- Drone footage: same as video — DJI D-Log M is auto-detected

## 5. Step-by-step process

**Uploading a single file or batch:**
1. Go to **Marketing → Media**
2. Drag files into the drop zone, or click **Upload** to browse
3. Multiple files can be uploaded together
4. For each file, fill in:
   - **Project** — which project is this asset from?
   - **Media Type** — Photo / Video / Drone Video / Timelapse / Testimonial Video / Transcript / Notes
   - **Capture Date** — when was this captured on site?
   - **Consent for marketing** — must be checked to allow public use
5. Click **Upload** to process

**After upload:**
- Photos: vision analysis runs automatically (~3–5 seconds). Thumbnail generated.
- Videos: processing pipeline runs in background. Thumbnail extracted from first frame. Duration calculated.
- DJI D-Log M footage: flagged as `is_dji_dlog_m = true`. Colour grade applied at export stage.

**Managing the media library:**
1. Browse all assets in the Media grid
2. Filter by: Project / Media Type / Date Range / Stage Detected
3. Click any asset to open the detail panel:
   - View full analysis (visible_facts, design_principles, content_opportunities)
   - Edit project link, media type, or capture date
   - Click **Generate Post** to seed the content generator
   - Click **Export** to create a video export with aspect ratio, music, and colour preset

**Exporting a video:**
1. Open a video asset
2. Click **Export**
3. Select:
   - **Format**: 9×16 (Reels/Stories) / 1×1 (Square) / 16×9 (Landscape) / 4×5 (Portrait)
   - **Music track**: select from the music library (mood-matched suggestions shown)
   - **Music volume**: 0–100%
   - **Colour preset**: Brand / Warm / Natural
   - **Burn captions**: Yes / No
4. Click **Create Export** — export runs in background
5. When ready, a notification appears and the export is downloadable from the asset exports list

[insert screenshot: Media tab grid view with project filter applied]
[insert screenshot: Asset detail panel — photo with analysis visible]
[insert screenshot: Video export settings modal]

## 6. What happens next
- Uploaded files stored in Supabase Storage: `marketing-media/[entity]/[id]/[date]-[filename]`
- `marketing_media_assets` row created per file
- Video exports stored in `marketing_media_exports` with `status = 'processing'` → `status = 'ready'`
- `content_item_id` on exports is set when an export is linked to a content item

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Not linking to a project | Uploading quickly without selecting project | Without a project link, the asset is orphaned — it can't be filtered by project later |
| Forgetting consent checkbox | Easy to overlook | If this is unchecked, the asset is in the library but can't be used for public content — Generate Post will be hidden |
| Expecting instant video exports | Processing takes time | Video exports run in background. For a 2-minute clip, allow 2–5 minutes. Check the Exports tab on the asset for status. |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| Upload fails immediately | File too large, wrong format, or network timeout — check size and format |
| Analysis never populates (photo) | Refresh after 30 seconds — if still empty, re-upload. May be a transient API issue. |
| Video export stuck on "processing" for > 15 minutes | Check server logs for pipeline error. `pipeline_log` on `marketing_media_exports` row contains step-by-step log. |
| DJI footage looks washed out in the export | The colour preset wasn't selected correctly at export time. Delete export and re-export with Brand or Warm preset. |

## 9. Related modules
- [Upload a photo and generate content from it](18-03_upload_photo_generate_content.md)
- [Manage the music library](18-07_music_library.md)

## 10. Screenshot placeholders
[insert screenshot: Upload drop zone with multiple files being added]
[insert screenshot: Processing state — thumbnail loading, analysis pending]
[insert screenshot: Completed asset with full analysis and Generate Post button visible]

## 11. Automation notes
- Photo upload: triggers vision analysis via Claude API → writes to `marketing_media_assets.analysis`
- `stage_detected` auto-populated from analysis (e.g. "frame", "slab", "fitout")
- `thumbnail_path` auto-generated on upload
- Video pipeline: thumbnail extraction → duration calculation → D-Log M detection → writes to `marketing_media_assets`
- Video exports: `marketing_media_exports` row created with `status = 'processing'` → updates to `'ready'` when done

## 12. Edge cases and limits
- Batch uploads: each file gets its own `marketing_media_assets` row
- If a project is deleted, `project_id` on assets is set to NULL but assets remain in storage
- Max concurrent exports: no hard limit, but processing is queued — very large batches take proportionally longer
- HEIC files are converted to JPG before storage

## 13. Owner of the process
Admin / Staff  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Log in as Admin
- [ ] A test photo (JPG, < 20MB) and a test video (MP4, < 100MB) ready
- [ ] An active project exists to link to
- [ ] At least one active music track in the music library (for export test)

### Test cases

**TC-01 — Photo upload creates asset record and triggers analysis**
1. Go to Marketing → Media
2. Upload a JPG photo with Project = [active project], Type = Photo, Date = today, Consent = checked
3. Expected DB: `marketing_media_assets` row with `project_id` set, `media_type = 'photo'`, `consent_for_marketing = true`
4. Wait 10 seconds, refresh
5. Expected DB: `analysis` is not `{}`, `thumbnail_path` is populated, `stage_detected` has a value
- [ ] Pass  [ ] Fail

**TC-02 — Video upload creates asset and generates thumbnail**
1. Upload a short MP4 video (< 30 seconds), Consent = checked
2. Expected DB: `marketing_media_assets` row with `media_type = 'video'`, `duration_seconds` populated
3. Expected UI: thumbnail visible in media grid (may take 30–60 seconds)
- [ ] Pass  [ ] Fail

**TC-03 — DJI D-Log M footage detected**
1. Upload a DJI D-Log M MP4 file (if available; otherwise use a flat-looking video)
2. Expected DB: `is_dji_dlog_m = true` on the asset row
- [ ] Pass  [ ] Fail (mark N/A if no DJI footage available)

**TC-04 — Consent = false hides Generate Post**
1. Upload a photo with Consent unchecked
2. Open the asset detail
3. Expected result: Generate Post button is absent or disabled
- [ ] Pass  [ ] Fail

**TC-05 — Video export creates an export record**
1. Open a video asset
2. Click Export → select 9×16 format, Warm colour preset, no music
3. Click Create Export
4. Expected DB: `marketing_media_exports` row with `media_asset_id` = this asset's UUID, `export_format = '9x16'`, `status = 'processing'` initially → transitions to `'ready'`
5. When ready: exported file downloadable
- [ ] Pass  [ ] Fail

**TC-06 — Filter by project works**
1. Upload two assets — one linked to Project A, one to Project B
2. In Media grid, apply Project filter = Project A
3. Expected result: only Project A's asset visible
- [ ] Pass  [ ] Fail

**TC-07 — File format rejection**
1. Attempt to upload a PDF file
2. Expected result: rejected before upload begins with a clear error message; no DB record created
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Photo analysis runs within 10 seconds
- [ ] Video thumbnail generates within 60 seconds
- [ ] Export transitions from processing → ready
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

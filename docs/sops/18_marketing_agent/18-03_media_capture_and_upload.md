---
sop_version: 1.0
last_reviewed: 2026-06-28
app_version: marketing-run-a
screenshot_status: placeholders_only
owner: Admin / Marketing Operator
test_status: untested
---

# SOP 18-03: Media Capture and Upload

**Module:** Marketing — Media Vault
**SOP ID:** 18-03
**Status:** Draft (Run A — runtime verification pending staging)
**Priority:** High

---

## 1. Who uses this
Admin (Sam), marketing operator (Josh), or anyone capturing site photos/drone footage for Blue Leaf content.

## 2. When to use it
- After a site visit: uploading progress photos, slab pours, frame-ups, finishes
- After drone footage: uploading D-Log M clips or stills for reuse
- When you want to browse available media and pick something to post

## 3. What this does
The Media Vault shows every photo and video in the `marketing-media` Supabase Storage bucket. Each asset can be filtered by capture stage, asset type, whether it has been AI-analysed, and by project. Once you find the right asset, **Create from this →** opens the Content Studio pre-loaded with that photo.

## 4. Before you start
- Logged in as Admin.
- For new uploads: use the existing **Media** tab (`/marketing/media`) to upload — the Vault is currently browse-only.
- For drone footage: D-Log M clips are detected automatically by the system; the analysis pipeline runs in the background.

## 5. How to browse and use media

**Step 1 — Open Media Vault**
Marketing → **Media Vault** (`/marketing/vault`).

**Step 2 — Filter the library**
Use the filter chips at the top:
- **Stage** — e.g. "Slab", "Frame", "Fitout", "Completion"
- **Type** — Photo / Video / Drone
- **Analysis** — Analysed / Not yet analysed
- **Project** — filter by job

**Step 3 — Find the asset**
Scroll the grid. Each card shows the thumbnail, asset type badge, and whether analysis is complete (green tick / amber dot).

**Step 4 — Create content from a photo**
Click **Create from this →** on any asset. This navigates to `/marketing/studio?asset_id=<uuid>`. The Content Studio loads with the photo pre-selected and its AI analysis already loaded.

**Step 5 — Alternatively, open in Legacy Studio**
If the new Creator is not yet available for your use case, **Generate post from this photo** opens `/marketing/studio/legacy?asset_id=<uuid>`. The prompt-first generator has the photo pre-attached.

## 6. Uploading new media
Currently upload is via Marketing → **Media** (`/marketing/media`). Drag and drop photos or videos onto the drop zone. The system:
1. Uploads to `marketing-media/[entity_type]/[entity_id]/[date]-[filename]` in Supabase Storage
2. Creates a `marketing_media_assets` record
3. Queues AI analysis of the photo (background — may take a moment)

After upload, the asset appears in the Vault once the page is refreshed.

## 7. What AI analysis provides
When a photo is analysed, the Content Studio can read:
- `content_opportunities` — themes and angles to write about
- `lighting_quality`, `composition_score` — image quality indicators
- `stage` — construction stage detected from the image

Without analysis, the Creator still works but angle suggestions will be empty — you will need to pick an angle manually.

## 8. Screenshot placeholders
[insert screenshot: Media Vault with filter chips and asset grid]
[insert screenshot: Asset card with "Create from this →" button]
[insert screenshot: Media tab upload drop zone]

## 9. Troubleshooting
| Problem | Solution |
|---|---|
| Vault shows "Demo assets" banner | API unreachable or no staging DB — see SOP 18-08 |
| Asset grid is empty after upload | Refresh the page; Vault loads on mount |
| "Create from this →" opens blank Creator | asset_id is valid but Creator could not load the asset — check the console for the apiFetch error |
| Analysis never completes | Analysis pipeline requires AI credentials configured in `.env`; check `ANTHROPIC_API_KEY` |
| Drone footage not detected | D-Log M detection runs on upload; check that the file extension is `.mp4` or `.mov` |

## 10. Related SOPs
- [Weekly Marketing Planning](18-02_weekly_marketing_planning.md)
- [Content package review](18-04_content_package_review_and_approval.md)

## 11. Automation notes
- AI analysis is triggered on upload (background). No manual trigger needed.
- `marketing_media_assets.analysis` is a JSONB column — the Vault reads it directly.
- Vault filters are client-side (all assets loaded up to `?limit=200`).

## 12. Edge cases and limits
- Vault loads up to 200 assets. Beyond that, older assets may not appear — use the existing Media tab for full history.
- Video assets without thumbnails show a placeholder.
- Projects filter only works once assets have a `job_id` set.

## 13. Owner of the process
Admin / Marketing Operator
Next review: after staging runtime verification

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] At least 3 media assets uploaded and in `marketing_media_assets`
- [ ] Staging DB available

### Test cases

**TC-01 — Vault loads with real assets**
1. Open `/marketing/vault`
2. Expected: asset grid renders; no "Demo assets" banner
- [ ] Pass  [ ] Fail

**TC-02 — Filter by stage narrows the grid**
1. Click a Stage filter chip (e.g. "Frame")
2. Expected: grid shows only assets where `stage` matches; count in heading updates
- [ ] Pass  [ ] Fail

**TC-03 — Filter by type narrows the grid**
1. Click "Photo" filter chip
2. Expected: only photo assets visible
- [ ] Pass  [ ] Fail

**TC-04 — "Create from this →" deep-links to Creator**
1. Click **Create from this →** on any analysed asset
2. Expected: navigates to `/marketing/studio?asset_id=<uuid>`; Creator loads the asset and populates analysis/angle suggestions
- [ ] Pass  [ ] Fail

**TC-05 — Demo fallback on API error**
1. With no staging DB configured, open `/marketing/vault`
2. Expected: "Demo assets" banner; 3 demo items shown; no JS error; no crash
- [ ] Pass  [ ] Fail

**TC-06 — Analysed vs not-analysed filter**
1. Click "Analysed" filter chip
2. Expected: only assets where `analysis` is non-null are shown
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

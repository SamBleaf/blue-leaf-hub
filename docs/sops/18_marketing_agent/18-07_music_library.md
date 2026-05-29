---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: tested_2026-05-29 — TC-01 FAIL (supervisor can see and access Music Library tab — adminOnly restriction not enforced — MED-01), TC-02 PASS (add track form shows correct fields: audio file, title, artist, mood, source/library, BPM, duration), TC-03 SKIP (file upload not tested)
---

# SOP 18-07: Manage the Music Library

**Module:** Marketing — Content Studio → Music Library tab  
**SOP ID:** 18-07  
**Status:** Draft  
**Priority:** Low

---

## 1. Who uses this
Admin only (tab is hidden from Staff)

## 2. When to use it
When adding new background music tracks for use in video exports, or managing the active/inactive state of existing tracks.

## 3. What this does
Manages the library of licensed background music tracks. Tracks are tagged by mood and used automatically in video exports when a mood-matched track is selected.

## 4. Before you start
- Only Admin can access the Music Library tab
- Music files must be properly licensed — Blue Leaf uses the YouTube Audio Library and similar royalty-free sources
- Accepted format: MP3, WAV (max 50MB)

## 5. Step-by-step process

**Adding a track:**
1. Go to **Marketing → Music Library**
2. Click **+ Add Track**
3. Fill in:
   - **Title** — track name as it appears in the source library
   - **Artist** — composer or artist name
   - **Source** — where the track was obtained (default: youtube_audio_library)
   - **Mood** — select the mood this track suits:
     - `calm_educational` — soft, background, educational tone. Used for process explainers.
     - `confident_progress` — builds energy, steady tempo. Used for construction progress footage.
     - `warm_handover` — resolved, warm. Used for handover and testimonial content.
   - **BPM** — beats per minute (from the track metadata)
   - **Duration (seconds)** — track length
4. Upload the audio file
5. Toggle **Active** to on
6. Click **Save**

**Managing tracks:**
- Toggle a track **inactive** to stop it appearing as an option in video export settings — the file is retained but not selectable
- Delete a track permanently removes it and its storage file — only do this if the track is no longer licensed or needs to be replaced

[insert screenshot: Music Library list with mood tags and active toggles]
[insert screenshot: Add Track form]

## 6. What happens next
- Track stored in `marketing_media` Supabase Storage bucket (or a dedicated `marketing-music` path)
- `marketing_music_library` row created with `is_active = true`
- Active tracks appear in video export mood selector when an export is created

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Adding a track without confirming the licence | Assuming royalty-free | Always confirm the licence allows commercial use before uploading. YouTube Audio Library tracks marked "No attribution required" are safe. |
| Wrong mood tag | Mood is subjective | Use the three moods as defined: calm = educational, confident = progress, warm = handover. Don't use calm_educational for construction action footage. |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| Track not appearing in export mood selector | Check `is_active = true` on the track |
| Upload fails | Check file size and format (MP3/WAV, max 50MB) |

## 9. Related modules
- [Upload and manage media assets](18-06_upload_manage_media.md)

## 10. Screenshot placeholders
[insert screenshot: Music Library tab — full track list with mood, BPM, active status]

## 11. Automation notes
- No automations — music library is managed manually
- When an export is created with a music track, `music_track_id` is set on the `marketing_media_exports` row

## 12. Edge cases and limits
- Only Admin can see the Music Library tab — Staff cannot access it even by direct URL
- Deleting a track that is referenced in existing exports will set `music_track_id = NULL` on those export records (the export file itself is unaffected)
- BPM and duration are informational only — not used for automatic track matching

## 13. Owner of the process
Admin  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Log in as Admin
- [ ] A short MP3 file ready for upload (< 5MB is fine for testing)

### Test cases

**TC-01 — Add a track successfully**
1. Go to Marketing → Music Library → + Add Track
2. Fill in: Title = "Test Track", Artist = "Test", Source = youtube_audio_library, Mood = calm_educational, BPM = 90, Duration = 180
3. Upload the MP3 file, toggle Active on
4. Click Save
5. Expected result: track appears in Music Library list
6. Expected DB: `marketing_music_library` row with all fields populated, `is_active = true`
- [ ] Pass  [ ] Fail

**TC-02 — Track appears in export mood selector**
1. Go to Media tab, open a video asset
2. Click Export, look at the Music Track selector
3. Expected result: the track from TC-01 appears as an option (mood = calm_educational shown when relevant)
- [ ] Pass  [ ] Fail

**TC-03 — Toggle inactive hides from export selector**
1. Set the track from TC-01 to inactive (toggle off)
2. Go to Media → open video asset → Export
3. Expected result: the track no longer appears in the music selector
4. Expected DB: `is_active = false`
- [ ] Pass  [ ] Fail

**TC-04 — Staff cannot access Music Library**
1. Log in as Staff
2. Navigate to `/marketing/music`
3. Expected result: redirected or tab not visible — Staff cannot access this page
- [ ] Pass  [ ] Fail

**TC-05 — Delete track removes from library**
1. Delete the track added in TC-01
2. Expected result: track gone from list
3. Expected DB: row deleted from `marketing_music_library`
4. Expected storage: file removed from storage bucket
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Admin-only access enforced
- [ ] Track appears/disappears in export selector based on active state
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

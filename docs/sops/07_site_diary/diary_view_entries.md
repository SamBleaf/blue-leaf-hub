---
sop_version: 1.2
last_reviewed: 2026-07-02
app_version: 1.1 — edit + date-filter built
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 07-03: View and Edit Past Diary Entries

**Module:** Operations Manager — Site Diary  
**SOP ID:** 07-03  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Site supervisors, project managers, and admins who need to review or correct past diary records — for progress tracking, dispute resolution, or project handover.

## 2. When to use it
- To review what happened on site on a specific date
- To correct a mistake in a saved diary entry (wrong weather, missing trades, etc.)
- When filtering entries to a date range for reporting or handover
- During a project handover so the next supervisor can get up to speed

## 3. What this does
Shows all diary entries for a project in reverse chronological order (newest first). Each row shows the date, weather, trades on site, and a short preview of work completed. You can expand any entry to read the full text. You can also filter the list by date range, and edit the content of any past entry.

## 4. Before you start
- You are logged in
- The project exists and has at least one diary entry

## 5. Step-by-step process

### Viewing entries

1. Open the project in **Operations Manager**
2. Click **Site Diary** in the project navigation
3. The right-hand panel labelled **Past entries** loads automatically — entries are shown newest first
4. Each entry shows:
   - Date (e.g. 2026-06-15)
   - Weather (e.g. "Sunny")
   - Trades on site as chips (e.g. "Framer", "Plumber")
   - A short preview of work completed (first 120 characters)
5. **To read the full entry:** click the **read more** link below the preview text — the full work-completed text expands in place
6. If a PDF was generated and filed to Dropbox, the Dropbox path is shown in small text below the entry

### Filtering by date range

1. In the **Past entries** panel, locate the **From** and **To** date inputs above the list
2. Set a **From** date to show only entries on or after that date
3. Set a **To** date to show only entries on or before that date
4. The list refreshes automatically when either date changes
5. To remove the filter, click **Clear filter** (appears when any filter is active) or clear both date fields

### Editing a past entry

1. Find the entry you want to correct in the **Past entries** list
2. Click the **Edit** button on the right side of the entry's header row
3. The row expands into an edit form showing all editable fields:
   - Date, Weather, Trades on site, Work completed, Issues, Instructions given, Visitors, Supervisor
4. Make your corrections — trade chips from the project's accepted trades are shown for easy toggling; you can also add free-text trades
5. Click **Save changes**
6. The form closes and the list reloads to show the updated entry
7. If the save fails, an error message is shown below the form header — correct the issue and try again

**Note:** Editing a diary entry does **not** regenerate or update the PDF that was filed to Dropbox at the time of the original save. The Dropbox PDF reflects the original entry only. If an updated PDF is needed, file a note in the next diary entry referencing the correction.

## 6. What happens after viewing / editing
- **View only:** No changes are made to the database. The diary list is a read-only view of records in the `site_diary` table.
- **After editing:** The `site_diary` row is updated in the database via `PATCH /api/diary/:id`. Only the editable content fields are updated — `project_id` and `created_at` are never changed.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Looking at the wrong project's diary | Multiple tabs or projects open | Check the project name shown in the heading before reading entries |
| Expecting date filter to auto-apply on page load | Filter is blank by default — all entries load | Set the From/To dates after the page loads |
| Losing changes when closing edit form | Clicking Cancel discards unsaved changes | Click Save changes before cancelling |
| Not seeing updated entry after save | List reloads automatically — if it shows old data, refresh the page | Check for a save error message in the edit form |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Diary list is empty but entries were saved | Check you have the correct project open; try refreshing |
| Date filter shows no entries but entries exist | Check the date range — entries outside the filter window are hidden; click Clear filter to reset |
| Entry shows truncated text only | Click "read more" below the preview to expand the full entry |
| No Dropbox path shown under an entry | The PDF filing may have failed silently at save time — the entry is still in the DB; re-save via SOP 07-01 if the PDF is needed |
| Edit form shows an error on save | Check the error message; if it says "Entry not found" the row may have been deleted; refresh the list |
| Page shows a loading spinner but never loads | Network issue or auth token expired — refresh the page and log in again if prompted |

## 9. Related SOPs
- [Write a site diary entry](diary_write_entry.md) — SOP 07-01
- [Use voice capture for a diary entry](diary_voice_capture.md) — SOP 07-02

## 10. Automation notes
- API: `GET /api/diary/:projectId` — returns all diary entries for the project, ordered by `entry_date DESC`
- Supports optional query params:
  - `?limit=N` (max 100) — restrict number of entries returned
  - `?from=YYYY-MM-DD` — filter to entries with `entry_date >= from`
  - `?to=YYYY-MM-DD` — filter to entries with `entry_date <= to`
  - From/to can be combined
- API: `PATCH /api/diary/:id` — updates editable fields of a `site_diary` row
  - Allowed fields: `entry_date`, `weather`, `trades_onsite`, `work_completed`, `issues`, `instructions_given`, `visitors`, `supervisor`
  - Forbidden fields (silently ignored): `project_id`, `created_at`, `raw_voice_transcript`, `structured_by_ai`, `dropbox_pdf_path`
  - Returns `{ ok: true, entry: { ...updatedRow } }` on success
- DB: reads from and writes to `site_diary` table

## 11. Screenshot placeholders
[insert screenshot: Past entries panel showing date-range filter inputs and list of diary entries]
[insert screenshot: Entry row with Edit button visible in header]
[insert screenshot: Edit form expanded inline with all editable fields and Save changes button]
[insert screenshot: Expanded entry showing full work-completed text]

## 12. Edge cases

| Scenario | Expected behaviour |
|----------|-------------------|
| Project has no diary entries | Right-hand panel shows an empty list — no error, no spinner stuck |
| Date filter returns no results | List shows empty — no error |
| Entry has no weather set | Weather field shows "—" in view mode; edit form pre-fills as empty |
| Entry has no trades on site | Trades chip row is empty in view mode; edit form shows no selected chips |
| Dropbox PDF filing failed at save time | Entry is still shown in list; `dropbox_pdf_path` is blank |
| Entry work_completed text is very long | First 120 characters shown; "read more" link expands the full text |
| User navigates between two projects quickly | Each project's entries are loaded by `projectId` param — cross-project data cannot appear |
| Editing an entry does not refile the PDF | Expected — PDF reflects the original save; no re-generation on edit |
| PATCH with no editable fields in body | Server returns 400 "No editable fields provided." |

## 13. Owner of the process
Admin  
Next review: 2026-12-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] At least 3 diary entries exist for a test project (different dates, different weather values)
- [ ] Note the project ID and entry IDs for DB verification
- [ ] A second test project exists with at least 1 diary entry (for isolation test)
- [ ] One test entry has work_completed text longer than 120 characters

### Test cases

**TC-01 — Diary list loads for a project**
1. Open a project → Site Diary
2. Expected: right-hand "Past entries" panel renders with diary rows, newest first (by entry_date)
3. Expected: each row shows entry date, weather, trade chips, a short work-completed preview, and an Edit button
4. Expected API: `GET /api/diary/:projectId` returns `{ ok: true, entries: [...] }` with the correct `project_id` on each row
- [ ] Pass  [ ] Fail

**TC-02 — Expand entry to read full content**
1. Find an entry where the work-completed text is longer than 120 characters
2. Expected: only the first 120 characters are visible with a "read more" link
3. Click "read more"
4. Expected: full work-completed text expands in place — no page navigation
- [ ] Pass  [ ] Fail

**TC-03 — Short entry shows no read-more link**
1. Find or create an entry with fewer than 120 characters in work_completed
2. Expected: full text is visible with no "read more" link
- [ ] Pass  [ ] Fail

**TC-04 — Date range filter — from only**
1. Set the From date to a date after the earliest entry
2. Expected: only entries on or after that date appear in the list
3. Expected API: `GET /api/diary/:projectId?from=YYYY-MM-DD` returns only matching entries
- [ ] Pass  [ ] Fail

**TC-05 — Date range filter — to only**
1. Set the To date to a date before the latest entry
2. Expected: only entries on or before that date appear in the list
- [ ] Pass  [ ] Fail

**TC-06 — Date range filter — from + to combined**
1. Set both From and To to a narrow range containing exactly 1 entry
2. Expected: only that 1 entry is shown
3. Click Clear filter
4. Expected: all entries reappear
- [ ] Pass  [ ] Fail

**TC-07 — Edit an entry — open and cancel**
1. Click Edit on any diary entry
2. Expected: the entry row expands into an edit form with all fields pre-filled from the current entry values
3. Click Cancel
4. Expected: edit form closes; the entry row returns to read-only view; no changes saved
- [ ] Pass  [ ] Fail

**TC-08 — Edit an entry — save changes**
1. Click Edit on a diary entry
2. Change the weather field to a new value (e.g. "Overcast — amended")
3. Click Save changes
4. Expected: form closes; list reloads; the updated weather is shown in the entry row
5. Expected DB: `SELECT weather FROM site_diary WHERE id = '<entry_id>'` matches the new value
6. Expected: `project_id` and `created_at` are unchanged in the DB row
- [ ] Pass  [ ] Fail

**TC-09 — Edit saves trades correctly**
1. Open edit for an entry with existing trades
2. Deselect one trade chip; add a free-text trade
3. Save
4. Expected: trades_onsite in DB reflects the new selection (deselected trade removed, new trade present)
- [ ] Pass  [ ] Fail

**TC-10 — Diary for one project does not show another project's entries**
1. Open Project A diary list — note the entry count and dates
2. Navigate to Project B diary list
3. Expected: Project B list shows only Project B entries
4. Expected DB: `SELECT COUNT(*) FROM site_diary WHERE project_id = '[Project B ID]'` matches the displayed count
- [ ] Pass  [ ] Fail

**TC-11 — Empty state for project with no entries**
1. Open a project that has no diary entries
2. Expected: "Past entries" panel shows an empty list (no rows)
3. Expected: no JavaScript errors in the console
- [ ] Pass  [ ] Fail

**TC-12 — Dropbox PDF path shown when available**
1. Find a diary entry that has a `dropbox_pdf_path` set in the DB
2. Expected: the path is displayed in small monospace text below the entry in the list
3. Edit the entry and save — expected: `dropbox_pdf_path` is not cleared by the PATCH
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Diary list loads and is correctly scoped to the project
- [ ] Entry preview and expand work correctly
- [ ] Date filter (from, to, combined, clear) works correctly
- [ ] Edit button opens form pre-filled with current values
- [ ] Cancel discards changes without saving
- [ ] Save updates editable fields in DB; project_id and created_at unchanged
- [ ] Trades toggle and free-text add work in edit form
- [ ] Cross-project isolation confirmed
- [ ] Empty state renders without error
- [ ] Dropbox path displays when set and is not cleared by edit
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 07-03: View Past Diary Entries

**Module:** Operations Manager — Site Diary  
**SOP ID:** 07-03  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Site supervisors, project managers, and admins who need to review past diary records — for progress tracking, dispute resolution, or project handover.

## 2. When to use it
- To review what happened on site on a specific date
- When preparing a progress report or responding to a client query
- During a project handover so the next supervisor can get up to speed

## 3. What this does
Shows all diary entries for a project in reverse chronological order (newest first). Each row shows the date, weather, trades on site, and a short preview of work completed. You can expand any entry to read the full text. The list is view-only — editing past entries is not yet available (see §12 and SOP-BUG-07-03).

## 4. Before you start
- You are logged in
- The project exists and has at least one diary entry

## 5. Step-by-step process

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

**Not yet available:**
- Date range filtering — there is no date filter UI; all entries load in one list (deferred, see SOP-BUG-07-03)
- Editing past entries — there is no Edit button or edit panel; entries are read-only after saving (deferred, see SOP-BUG-07-03)

## 6. What happens after viewing
No changes are made to the database when viewing entries. The diary list is purely a read-only view of records already stored in the `site_diary` table.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Looking at the wrong project's diary | Multiple tabs or projects open | Check the project name shown in the heading before reading entries |
| Expecting an Edit button | SOP v1.0 incorrectly documented edit functionality | Editing is not yet built — to make a correction, write a new diary entry noting the amendment |
| Expecting a date filter | Not yet built | Scroll the list or check the date shown on each entry row |
| Missing entry assumed lost | Entry list loads on page open | Check you are in the correct project; refresh the page if the list looks incomplete |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Diary list is empty but entries were saved | Check you have the correct project open; try refreshing |
| Entry shows truncated text only | Click "read more" below the preview to expand the full entry |
| No Dropbox path shown under an entry | The PDF filing may have failed silently at save time — the entry is still in the DB; re-save via SOP 07-01 if the PDF is needed |
| Page shows a loading spinner but never loads | Network issue or auth token expired — refresh the page and log in again if prompted |

## 9. Related SOPs
- [Write a site diary entry](diary_write_entry.md) — SOP 07-01
- [Use voice capture for a diary entry](diary_voice_capture.md) — SOP 07-02

## 10. Automation notes
- API: `GET /api/diary/:projectId` — returns all diary entries for the project, ordered by `created_at DESC`
- Supports optional query param: `?limit=N` (max 100) to restrict the number of entries returned
- Date filtering (`?from=YYYY-MM-DD&to=YYYY-MM-DD`) is **not implemented** in the server route — the SOP_BUG-07-03 tracks this gap
- Edit endpoint (`PATCH /api/diary/:entryId`) is **not implemented** — the server only has `POST /api/diary/save` (create) and `GET /api/diary/:projectId` (list)
- DB: reads from `site_diary` table, columns `entry_date`, `weather`, `trades_onsite`, `work_completed`, `issues`, `instructions_given`, `visitors`, `supervisor`, `dropbox_pdf_path`

## 11. Screenshot placeholders
[insert screenshot: Past entries panel showing list of diary entries with date, weather, trades chips, and read-more link]
[insert screenshot: Expanded entry showing full work-completed text]

## 12. Edge cases

| Scenario | Expected behaviour |
|----------|-------------------|
| Project has no diary entries | Right-hand panel shows an empty list — no error, no spinner stuck |
| Entry has no weather set | Weather field shows "—" |
| Entry has no trades on site | Trades chip row is empty |
| Dropbox PDF filing failed at save time | Entry is still shown in list; `dropbox_pdf_path` is blank |
| Entry work_completed text is very long | First 120 characters shown; "read more" link expands the full text |
| User navigates between two projects quickly | Each project's entries are loaded by `projectId` param — cross-project data cannot appear |

**Known deferred gap — SOP-BUG-07-03:** The past-entries panel is view-only. Date range filtering and the ability to edit or amend past entries are not yet built. Until these features are added, use a new diary entry (SOP 07-01) to record any amendments or corrections. Track this under bug/feature SOP-BUG-07-03.

## 13. Owner of the process
Admin  
Next review: 2026-12-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] At least 3 diary entries exist for a test project (different dates, different weather values)
- [ ] Note the project ID for DB verification
- [ ] A second test project exists with at least 1 diary entry (for isolation test)

### Test cases

**TC-01 — Diary list loads for a project**
1. Open a project → Site Diary
2. Expected: right-hand "Past entries" panel renders with diary rows, newest first
3. Expected: each row shows entry date, weather, trade chips, and a short work-completed preview
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

**TC-04 — Edit action is NOT present (view-only confirmation)**
1. Inspect all visible controls on each diary entry row
2. Expected: no Edit button, Edit link, or edit panel exists anywhere in the diary list
3. Expected: clicking the entry row does not open an edit form
4. Note: if an Edit control is found, this is a regression — log under SOP-BUG-07-03
- [ ] Pass  [ ] Fail

**TC-05 — Diary for one project does not show another project's entries**
1. Open Project A diary list — note the entry count and dates
2. Navigate to Project B diary list
3. Expected: Project B list shows only Project B entries
4. Expected DB: `SELECT COUNT(*) FROM site_diary WHERE project_id = '[Project B ID]'` matches the displayed count
- [ ] Pass  [ ] Fail

**TC-06 — Empty state for project with no entries**
1. Open a project that has no diary entries
2. Expected: "Past entries" panel shows an empty list (no rows)
3. Expected: no JavaScript errors in the console
- [ ] Pass  [ ] Fail

**TC-07 — Dropbox PDF path shown when available**
1. Find a diary entry that has a `dropbox_pdf_path` set in the DB
2. Expected: the path is displayed in small monospace text below the entry in the list
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Diary list loads and is correctly scoped to the project
- [ ] Entry preview and expand work correctly
- [ ] No Edit control present (view-only confirmed)
- [ ] Cross-project isolation confirmed
- [ ] Empty state renders without error
- [ ] Dropbox path displays when set
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

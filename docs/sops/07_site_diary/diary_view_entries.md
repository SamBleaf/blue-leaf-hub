---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
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
Site supervisors, project managers, and admins who need to review past diary records — for progress tracking, dispute resolution, or handover.

## 2. When to use it
- To review what happened on site on a specific date
- When preparing a progress report or responding to a client query
- To correct or add to an entry that was saved incomplete
- During a project handover so the next supervisor can get up to speed

## 3. What this does
Shows all diary entries for a project in chronological order. You can filter by date, click any entry to read the full structured content, and edit an entry if it needs correction.

## 4. Before you start
- You are logged in
- The project exists and has at least one diary entry

## 5. Step-by-step process

1. Open the project in **Operations Manager**
2. Click **Site Diary** in the project navigation
3. The diary list loads — entries are shown newest first with date and a short summary
4. **To filter by date:** use the date range picker at the top to narrow to a specific week or period
5. **To read a full entry:** click any entry in the list — it expands to show all structured sections (weather, trades, work completed, issues, next steps)
6. **To edit an entry:** with the entry open, click **Edit** — the raw text and structured sections become editable. Make changes and click **Save**

## 6. What happens after
- Edits overwrite the existing entry in the `site_diary` table — the original raw text and structured content are updated
- No version history is kept — if accuracy matters, add a note at the bottom of the entry rather than rewriting it

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Editing an entry and overwriting correct information | Clicking edit accidentally | Read the entry fully before making any edits |
| Looking at the wrong project's diary | Multiple tabs or projects | Check the project name in the heading before filtering or editing |
| Expecting version history | Not a current feature | Add an amendment note to the entry text if you need a record of the change |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Diary list is empty but entries were saved | Check you have the correct project open; try refreshing |
| Date filter returns no results | Widen the date range — entries are stored with the date they were saved, not necessarily the date of site work |
| Edit button not visible | You may not have edit permissions, or the entry was already viewed by another user and is in a locked state — contact Admin |
| Changes not saved after editing | Ensure you click Save, not just close the panel |

## 9. Related SOPs
- [Write a site diary entry](diary_write_entry.md) — SOP 07-01
- [Use voice capture for a diary entry](diary_voice_capture.md) — SOP 07-02

## 10. Automation notes
- API: `GET /api/diary/:projectId` — returns all diary entries for the project, ordered by `entry_date DESC`
- Supports optional query params: `?from=YYYY-MM-DD&to=YYYY-MM-DD` for date filtering
- Edit: `PATCH /api/diary/:entryId` (if implemented) — updates `raw_text` and `structured_content`
- DB effects: reads from / writes to `site_diary` table, filtered by `project_id`

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] At least 3 diary entries exist for a test project (different dates)
- [ ] Note the project ID

### Test cases

**TC-01 — Diary list loads for a project**
1. Open a project → Site Diary
2. Expected: list of diary entries renders, newest first
3. Expected: each row shows date and summary text
4. Expected API: `GET /api/diary/:projectId` returns array of entries
- [ ] Pass  [ ] Fail

**TC-02 — Click entry to expand full content**
1. Click any entry in the list
2. Expected: full structured content displays — weather, trades, work completed, issues, next steps sections visible
3. Expected: no page navigation — content expands in place or in a panel
- [ ] Pass  [ ] Fail

**TC-03 — Date filter narrows results**
1. Set the date filter to a range that includes only one of the three test entries
2. Expected: only the matching entry appears in the list
3. Expected: other entries are not shown
- [ ] Pass  [ ] Fail

**TC-04 — Edit an entry and save**
1. Open an entry → click Edit
2. Change a word in the raw text or a structured section
3. Click Save
4. Expected: success message shown
5. Expected DB: `SELECT structured_content FROM site_diary WHERE id = '[id]'` reflects the change
- [ ] Pass  [ ] Fail

**TC-05 — Diary for one project does not show another project's entries**
1. Open Project A diary list — note the entry count
2. Navigate to Project B diary list
3. Expected: Project B list shows only Project B entries
4. Expected DB: all returned rows have `project_id` matching Project B
- [ ] Pass  [ ] Fail

**TC-06 — Empty state for project with no entries**
1. Open a project that has no diary entries
2. Expected: empty state message shown (e.g. "No diary entries yet")
3. Expected: no errors thrown
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Diary list loads and is correctly scoped to the project
- [ ] Entry detail renders all sections
- [ ] Date filter works
- [ ] Edit and save persists to DB
- [ ] Cross-project isolation confirmed
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

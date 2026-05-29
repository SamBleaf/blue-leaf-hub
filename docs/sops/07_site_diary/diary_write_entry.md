---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 07-01: Write a Site Diary Entry

**Module:** Operations Manager — Site Diary  
**SOP ID:** 07-01  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Site supervisors and project managers who need to record what happened on site each day.

## 2. When to use it
At the end of each working day, or any time something notable happens on site — weather delays, deliveries, trade attendance, inspections, or issues.

## 3. What this does
Creates a structured diary entry for a project. You type (or speak — see SOP 07-02) your notes in plain language and the AI automatically organises them into categories: weather, trades on site, work completed, issues, and next steps. The structured entry is then saved to the project record.

## 4. Before you start
- You are logged in
- The project exists in the system
- You know the project you are writing the entry for

## 5. Step-by-step process

1. Go to **Operations Manager** and open the project
2. Click **Site Diary** in the project navigation
3. Click **+ New Entry**
4. Type your notes into the text box in plain English — for example: "Cold and overcast today, about 12 degrees. Frame crew were on site all day, 4 men. They completed the first floor frame. Electrician called to say he can't make it Friday, pushed to Monday. Concrete for slab scheduled tomorrow."
5. Click **Structure with AI** — the system sends your text to the AI and returns a formatted entry broken into sections
6. Review the structured entry. Edit any section if needed
7. Click **Save Entry** to store the diary entry against the project

## 6. What happens after
- The entry is saved to the `site_diary` table, linked to the project
- The entry appears in the diary list view (SOP 07-03) with the date and a summary
- Past entries can be viewed and edited at any time

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Not selecting the correct project | Multiple projects open in tabs | Check the project name shown at the top of the page before saving |
| Saving before reviewing AI output | Rushing | Always read the structured sections — AI occasionally miscategorises information |
| Writing entries days later | Forgetting | Write the entry at the end of each site day — it takes 2 minutes |
| Losing the entry before saving | Navigating away | Do not navigate away after structuring — save first |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Structure with AI" returns an error | Check your internet connection; try again. If it persists, save the raw text manually and structure later |
| AI output is missing key information | The AI works from what you typed — if something is missing, add it to your original notes and re-run |
| Entry does not appear in the diary list | Refresh the page. If still missing, check you clicked Save (not just Structure) |
| Cannot find the Site Diary for a project | The project must be open in Operations — Site Diary is a project-level tab |

## 9. Related SOPs
- [Use voice capture for a diary entry](diary_voice_capture.md) — SOP 07-02
- [View and edit past diary entries](diary_view_entries.md) — SOP 07-03
- [Open a project in Operations](../05_operations/operations_open_project.md) — SOP 05-02

## 10. Automation notes
- API: `POST /api/diary/structure` — sends `{ projectId, rawText }`, returns AI-structured entry object with sections (weather, trades, workCompleted, issues, nextSteps)
- API: `POST /api/diary/save` — saves the structured entry to `site_diary` table
- DB effects: inserts row into `site_diary` with `project_id`, `entry_date`, `raw_text`, `structured_content` (JSONB), `created_by`

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] At least one project exists in Operations
- [ ] Note the project ID for DB verification

### Test cases

**TC-01 — Write and structure a diary entry (happy path)**
1. Open a project in Operations → click Site Diary → click + New Entry
2. Type: "Sunny day. Frame crew on site, 3 men. Completed upper floor frame. Plumber delivered pipework."
3. Click Structure with AI
4. Expected: structured output with weather, trades, workCompleted sections populated
5. Expected: no errors returned
- [ ] Pass  [ ] Fail

**TC-02 — Save a structured entry**
1. After TC-01, click Save Entry
2. Expected: success confirmation shown
3. Expected DB: `SELECT * FROM site_diary WHERE project_id = '[id]' ORDER BY created_at DESC LIMIT 1` returns the new row with `raw_text` and `structured_content` populated
- [ ] Pass  [ ] Fail

**TC-03 — Entry appears in diary list**
1. After TC-02, navigate to the diary list view for the project
2. Expected: the new entry appears at the top of the list with today's date
3. Expected: entry summary is visible in the list
- [ ] Pass  [ ] Fail

**TC-04 — Structure endpoint handles sparse input**
1. Call `POST /api/diary/structure` with a very short raw text: "Nothing happened today."
2. Expected: returns structured object (some sections may be empty/minimal)
3. Expected: no server error (200 response)
- [ ] Pass  [ ] Fail

**TC-05 — Missing projectId rejected**
1. Call `POST /api/diary/save` with no `projectId`
2. Expected: HTTP 400 with plain English error
- [ ] Pass  [ ] Fail

**TC-06 — Entry saved with correct project linkage**
1. Save an entry for Project A
2. Open Project B diary list
3. Expected: Project A's entry does NOT appear in Project B's diary
4. Expected DB: `project_id` on the saved row matches Project A's ID
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] AI structuring works end-to-end
- [ ] Save persists to DB with correct project linkage
- [ ] Entry visible in diary list after save
- [ ] Validation rejects missing project
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

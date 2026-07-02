---
sop_version: 1.1
last_reviewed: 2026-07-02
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
Creates a structured diary entry for a project. You type (or speak — see SOP 07-02) your notes in plain language and the AI automatically organises them into categories: weather, trades on site, work completed, issues, instructions given, and visitors. The structured entry is then saved to the project record and a PDF is automatically filed to Dropbox.

## 4. Before you start
- You are logged in
- The project exists in the system
- You know which project you are writing the entry for

## 5. Step-by-step process

1. Go to **Operations Manager** and open the project
2. Click **Site Diary** in the project navigation
3. The left-hand panel shows **New entry**
4. In the **1. Record** section, type your notes into the text box in plain English — for example: "Cold and overcast today, about 12 degrees. Frame crew were on site all day, 4 men. They completed the first floor frame. Electrician called to say he can't make it Friday, pushed to Monday."
5. Click **Structure with AI** — the AI structures your notes into the review fields below
6. In the **3. Review** section, check and adjust:
   - **Date** — defaults to today; change if writing for a different day
   - **Weather** — from AI or type manually
   - **Trades on site** — click chips from the project trade list to toggle them, or type a trade and click Add
   - **Work completed** — edit the AI-generated text if needed
   - **Issues** — any problems or blockers on site
   - **Instructions given** — directions given to trades or subcontractors
   - **Visitors** — any site visitors (inspector, client, etc.)
   - **Supervisor** — pre-filled from your profile; edit if needed
7. Click **Save entry**
8. Expected: a green toast notification "Saved. PDF filed to Dropbox." confirms the save

## 6. What happens after
- The entry is saved to the `site_diary` table, linked to the project
- A PDF is generated and filed to Dropbox under the project's INTERNAL/SITE DIARY folder
- The entry appears immediately in the **Past entries** panel on the right-hand side (SOP 07-03)
- If Portal v2 is configured, a draft weekly client update is pre-filled from the work_completed field

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Not selecting the correct project | Multiple projects open in tabs | Check the project address shown in the header before saving |
| Saving before reviewing AI output | Rushing | Always read the review fields — AI occasionally miscategorises information |
| Writing entries days later | Forgetting | Write the entry at the end of each site day — it takes 2 minutes |
| Navigating away before saving | Distracted | Do not navigate away after structuring — save first; the form resets after a successful save |
| Entering a wrong date | Date field defaults to today | Check the date field when writing for a day that was not today |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Structure with AI" returns an error | Check your internet connection; try again. If it persists, fill the review fields manually and save |
| AI output is missing key information | The AI works from what you typed — if something is missing, edit the review field directly |
| "Saved. PDF filed to Dropbox." toast not shown | If the entry was saved but PDF failed, the entry is still in the DB; check for a plain error message shown in red below the Save button |
| Entry does not appear in the Past entries panel | Refresh the page; check you clicked Save (not just Structure) |
| Cannot find the Site Diary for a project | The project must be open in Operations — Site Diary is a project-level page accessed via the back-to-project link |
| Trades on site list is empty | The project may not have accepted trades configured — you can still type a trade name manually in the Add trade field |

## 9. Related SOPs
- [Use voice capture for a diary entry](diary_voice_capture.md) — SOP 07-02
- [View past diary entries](diary_view_entries.md) — SOP 07-03
- [Open a project in Operations](../05_operations/operations_open_project.md) — SOP 05-02

## 10. Automation notes
- API: `POST /api/diary/structure` — body: `{ transcript, projectAddress }` — returns `{ ok: true, structured: { weather, trades_onsite, work_completed, issues, instructions_given, visitors } }`
- API: `POST /api/diary/save` — body: `{ projectId, entry: { entry_date, weather, trades_onsite, work_completed, issues, instructions_given, visitors, supervisor, raw_voice_transcript, structured_by_ai } }`
- On save: inserts row into `site_diary`, generates PDF, files PDF to Dropbox, updates `dropbox_pdf_path` on the row, syncs `work_completed` to a Portal v2 draft weekly update (best-effort, does not block save)
- `projectId` is required — returns HTTP 400 if missing
- `structured_by_ai` flag is `true` when Structure with AI was used, `false` for manually filled entries

## 11. Screenshot placeholders
[insert screenshot: New entry panel showing Record, Structure, and Review sections]
[insert screenshot: Review section with trades chips and all fields filled]
[insert screenshot: Green toast "Saved. PDF filed to Dropbox."]

## 12. Edge cases

| Scenario | Expected behaviour |
|----------|-------------------|
| Structure with AI returns no content | Error message shown: "AI couldn't extract structure from this transcript. Fill the fields below manually." — form fields not cleared |
| AI returns partial content | Only non-empty AI fields overwrite form fields — empty AI fields leave existing user input intact |
| Dropbox PDF filing fails | Entry is still saved to DB; toast may show success or a warning; `dropbox_pdf_path` is null on the row |
| Project has no accepted trades configured | Trade chips area is empty; free-text Add trade field still works |
| Save clicked with no text and no review fields filled | Entry is saved with blank fields — no validation block; write at least something in Work completed for useful records |
| Same date entered twice | A second entry for the same date is allowed — both rows appear in the diary list |

## 13. Owner of the process
Admin  
Next review: 2026-12-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] At least one project exists in Operations with accepted trades configured
- [ ] Note the project ID for DB verification
- [ ] Dropbox integration configured (or verify PDF failure is graceful)

### Test cases

**TC-01 — Write and structure a diary entry (happy path)**
1. Open a project in Operations → click Site Diary
2. In the Record section, type: "Sunny day. Frame crew on site, 3 men. Completed upper floor frame. Plumber delivered pipework."
3. Click Structure with AI
4. Expected: weather, trades_onsite, and work_completed fields populate in the Review section
5. Expected: no error message shown
- [ ] Pass  [ ] Fail

**TC-02 — Save a structured entry**
1. After TC-01, click Save entry
2. Expected: green toast "Saved. PDF filed to Dropbox." appears
3. Expected DB: `SELECT * FROM site_diary WHERE project_id = '[id]' ORDER BY created_at DESC LIMIT 1` returns the new row with `work_completed` and `entry_date` populated
4. Expected: entry appears at the top of the Past entries panel
- [ ] Pass  [ ] Fail

**TC-03 — Trade chips toggle correctly**
1. Open a project that has accepted trades configured
2. Click a trade chip — chip should highlight (blue border + accent background)
3. Click the same chip again — chip should deselect (return to unselected style)
4. Expected: `trades_onsite` on the saved row reflects only the selected chips
- [ ] Pass  [ ] Fail

**TC-04 — Structure endpoint handles sparse input**
1. Type only: "Nothing happened today." in the Record field
2. Click Structure with AI
3. Expected: review fields populate with whatever the AI extracted (may be minimal)
4. Expected: no server error; HTTP 200 response from `/api/diary/structure`
- [ ] Pass  [ ] Fail

**TC-05 — Missing projectId rejected**
1. Call `POST /api/diary/save` directly with no `projectId` in the body
2. Expected: HTTP 400 response with `{ ok: false, error: "projectId required." }`
- [ ] Pass  [ ] Fail

**TC-06 — Entry saved with correct project linkage**
1. Save an entry for Project A
2. Open Project B's Site Diary
3. Expected: Project A's entry does NOT appear in Project B's Past entries panel
4. Expected DB: `project_id` on the saved row matches Project A's ID exactly
- [ ] Pass  [ ] Fail

**TC-07 — AI guard: empty AI response does not clear form fields**
1. Fill Review fields manually (type directly into weather, work_completed fields)
2. If you can force an empty AI response (e.g. send a blank transcript via API), do so
3. Expected: existing field values are not cleared; error message "AI couldn't extract structure" is shown
- [ ] Pass  [ ] Fail (skip if cannot force empty response)

### Post-test checklist
- [ ] AI structuring works end-to-end
- [ ] Save persists to DB with correct project linkage
- [ ] Entry visible in Past entries panel after save
- [ ] Trade chips work correctly
- [ ] Validation rejects missing projectId
- [ ] AI guard protects form fields from empty response
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Write a Carpentry Site Diary Entry

**Module:** Carpentry  
**SOP ID:** 15-04  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this

Admin, Supervisor

---

## 2. When to use it

At the end of each working day on a carpentry job site. Use it to record what was done, who was there, any issues, and weather conditions. Voice notes are supported — you can paste a voice-to-text transcript and have the AI fill in the structured fields automatically.

---

## 3. What this does

Creates a daily diary entry linked to the carpentry job. Entries record the date, weather, trades on site, work completed, issues, instructions given, and visitors. The AI structuring feature (same engine as the main Operations site diary) can extract these fields from a free-form voice transcript.

The Diary tab also contains the **Tasks for workers** panel — a checklist supervisors maintain for site workers. Tasks can be added manually, from a transcript, or from the base checklist template. AI-drafted tasks from a transcript are fully editable before adding (title, category, priority). Workers see and complete tasks via the Worker PWA. Supervisors and admins can hold-drag the ⠿ handle in the Worker PWA to reorder tasks; the new order persists and is visible to all workers.

---

## 4. Before you start

- The carpentry job must exist and be "Active" or "On Hold"
- You must be on the job's detail page, **Diary** tab

---

## 5. Step-by-step process

**Create a diary entry manually:**

1. Open the carpentry job
2. Click the **Diary** tab
3. Click **+ New Entry**
4. Fill in the fields:
   - **Date** — defaults to today
   - **Weather** — e.g. "Sunny 28°C" or "Overcast, light rain"
   - **Trades on site** — comma-separated, e.g. "Framers, Plumbers"
   - **Supervisor** — who was in charge that day
   - **Work completed** — what was physically done (be specific)
   - **Issues** — any problems, delays, or blockers
   - **Instructions given** — directions given to workers or subcontractors
   - **Visitors** — any visitors to site
5. Click **Save Entry**
6. The entry appears in the diary list, newest first

**Create an entry from a voice transcript:**

1. Follow steps 1–3 above
2. In the **Voice transcript** field, paste your voice-to-text note
3. Click **✦ Structure with AI**
4. Wait a few seconds — the AI fills in Weather, Trades on site, Work completed, Issues, Instructions, and Visitors automatically
5. Review the AI-populated fields and adjust if needed
6. Click **Save Entry**

> 💡 **Tip:** The AI uses the same engine as the main site diary. If the transcript doesn't mention specific fields, those fields are left empty — the AI will never wipe a field you've already filled in manually.

**Add tasks from a transcript (Tasks for workers panel):**

1. On the Diary tab, scroll to the **Tasks for workers** section
2. Click **🎤 From transcript**
3. Paste a site walk-through transcript (from a Plaud recorder or any notes)
4. Click **Extract tasks** — the AI drafts a task list and shows it for review
5. The AI is work-stream-aware: if the job has a budget with labour categories (Framing, Cladding, etc.), the AI assigns drafts to the matching work stream
6. For each draft you can: edit the **title**, change the **category** (work stream or General/Defect/Safety/Materials/Inspection), and change the **priority** (Urgent / Normal / When time permits) — all before adding
7. Untick any tasks you do not want
8. Click **Add N task(s)** to save the selected drafts

> 💡 **Tip:** Click **📋 Base checklist** to seed the standard per-stage checklist onto the job (idempotent — safe to run again; skips tasks already present).

**Reorder tasks (supervisor/admin only — Worker PWA):**

Supervisors and admins can hold-drag the ⠿ grip handle on any task row in the Worker PWA to change the display order. The new sort order persists to the database and is immediately visible to all workers on the job.

[insert screenshot: Diary tab with + New Entry expanded, showing voice transcript field and AI button]

---

## 6. What happens next

- The entry is saved and appears at the top of the diary list (newest first)
- The job's **Actual Start** date is derived from the first approved timesheet for this job — NOT from the first diary entry. If no approved timesheets exist, Actual Start shows as "—" even if diary entries exist.
- All entries are visible in the diary list, newest first

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| AI wipes manually typed content | Old behaviour — fixed in current version | AI only fills empty or un-modified fields |
| Trades entered as full sentences | Misunderstanding of the field | Use comma-separated short names: "Framers, Plumbers" |
| Entry date wrong | Forgot to check before saving | Always verify the date field before hitting Save Entry |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| "AI couldn't extract structure" message | Transcript was too short or unclear | Fill fields manually; try a longer, more detailed transcript |
| Entry not appearing in list | Save failed silently | Check browser console for error; try saving again |

---

## 9. Related SOPs

- 15-01: Carpentry Overview
- 15-02: Create a Carpentry Job
- 07-01: Write a Site Diary Entry (main Operations diary — same AI engine)

---

## 10. Screenshot placeholders

[insert screenshot: Diary tab with list of diary entries (newest first) and collapsed task panel below]
[insert screenshot: New entry form expanded — voice transcript field and "Structure with AI" button visible]
[insert screenshot: Diary entry after AI structuring — Weather, Trades on site, Work completed populated]
[insert screenshot: "From transcript" task panel — draft tasks shown with editable title, category dropdown, and priority dropdown before adding]
[insert screenshot: Worker PWA task list showing ⠿ drag handle visible to supervisor/admin]

---

## 11. Automation notes

- Diary entries: saved to `carpentry_site_diary` table (separate from `site_diary` which requires a non-nullable `project_id`).
- AI structuring: `POST /api/diary/structure` — shared endpoint with the main Operations site diary.
- Task extraction from transcript: `POST /api/carpentry/jobs/:id/tasks/from-transcript` — returns drafts only (`draft: true`); nothing is saved until the user clicks "Add". The AI is fed the job's labour budget categories (`carpentry_job_budgets` where `cost_type = 'labour'`) so it can suggest the correct work stream.
- Task reorder: `PUT /api/worker/tasks/reorder` — updates `sort_order` on each affected `site_tasks` row; persists immediately.
- Actual Start is NOT written when a diary entry is created. It is derived on read from the earliest approved timesheet with `carpentry_job_id` matching this job.

---

## 12. Edge cases and limits

- Actual Start derives from approved timesheets only — diary entries alone do not set it. A job with diary entries but no approved timesheets shows Actual Start as "—".
- AI-drafted tasks from transcript are fully editable before adding: title, category, and priority can all be changed. The AI's category is a suggestion, not final.
- The "From transcript" flow does not save anything until the user clicks "Add N task(s)". If the user closes the panel, the drafts are lost.
- "Base checklist" is idempotent — if all default tasks are already present, it returns `{ added: 0 }` and shows "Base checklist already added — nothing new to add."
- Workers in the Worker PWA cannot reorder tasks (no drag handle shown). Only supervisors and admins see the ⠿ handle.
- The transcript for task extraction is capped at 20,000 characters. Longer transcripts must be split into shorter sessions.

---

## 13. Owner of the process

Admin / Supervisor  
Next review date: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### TC-01 — Create diary entry (manual)

**Action:** POST `/api/carpentry/jobs/:id/diary` with `{ entryDate: "2026-06-01", weather: "Sunny", workCompleted: "Framing north wall complete" }` and valid token.  
**Expected:** `{ ok: true, entry: { id, jobId, entryDate: "2026-06-01", weather: "Sunny", workCompleted: "Framing north wall complete" } }` — all camelCase.  
**Pass criteria:** 200, `ok: true`, camelCase keys.

---

### TC-02 — Diary entry does NOT set actual_start on job

**Action:** Create a new job with no actual_start and no approved timesheets. Create a diary entry with entryDate: "2026-06-01".  
**Expected:** GET the job — `actualStart` is null / absent. Diary entry creation does NOT write the actual_start field.  
**Pass criteria:** `job.actualStart` is null after diary entry creation.

---

### TC-03 — Actual start derives from first approved timesheet

**Action:** Job with no manual actual_start. Create an approved timesheet with `carpentry_job_id` = this job's ID and `date: "2026-06-10"`.  
**Expected:** GET the job — `actualStart === "2026-06-10"` and `actualStartDerived === true`.  
**Pass criteria:** `actualStart` matches timesheet date; `actualStartDerived` flag present.

---

### TC-04 — List diary entries (descending order)

**Action:** Create entries for 2026-06-01 and 2026-06-15. GET `/api/carpentry/jobs/:id/diary`.  
**Expected:** `{ ok: true, entries: [ { entryDate: "2026-06-15" }, { entryDate: "2026-06-01" } ] }` — most recent first.  
**Pass criteria:** First entry in array has later date.

---

### TC-05 — Update diary entry

**Action:** PATCH `/api/carpentry/diary/:eid` with `{ workCompleted: "Updated work description" }`.  
**Expected:** `{ ok: true, entry: { workCompleted: "Updated work description" } }`.  
**Pass criteria:** `ok: true`, field updated.

---

### TC-06 — tradesOnsite stored as array

**Action:** POST diary entry with `{ tradesOnsite: ["Framers", "Plumbers"] }`.  
**Expected:** GET diary — `entry.tradesOnsite` is `["Framers", "Plumbers"]` (array, not string).  
**Pass criteria:** Array returned, not a comma-separated string.

---

### TC-07 — AI structure button calls correct endpoint

**Action:** In the browser, paste a transcript ("We completed the frame for the north and south walls today. Weather was sunny. John Smith was the supervisor.") and click "Structure with AI".  
**Expected:** POST to `/api/diary/structure` is made. workCompleted, weather, and/or supervisor fields are populated.  
**Pass criteria:** Network request to `/api/diary/structure` logged, fields populated without error.

---

### TC-08 — Transcript task extraction returns editable drafts

**Action:** POST `/api/carpentry/jobs/:id/tasks/from-transcript` with `{ transcript: "Install LVL beams in north wall. Need to order more joist hangers urgently." }`.  
**Expected:** `{ ok: true, draft: true, tasks: [ { title: "...", priority: "...", category: "...", ... } ] }` — no tasks created in `site_tasks` yet.  
**Verification (UI):** In the browser, after clicking "Extract tasks", the draft list appears with editable title input, category dropdown, and priority dropdown for each task. Unticking and re-ticking a draft item updates the count on the "Add N task(s)" button.  
**Pass criteria:** API returns `draft: true` with ≥1 task; no task rows created until user confirms.

---

### TC-09 — Drafts are editable before adding (category and priority)

**Action:** In the browser, run the transcript extraction (TC-08). Change one draft's category from "general" to "cladding" and priority from "normal" to "urgent". Click "Add N task(s)".  
**Expected:** POST to `/api/carpentry/jobs/:id/tasks` is called with the edited values (`category: "cladding"`, `priority: "urgent"`). GET tasks list — the new task has those values.  
**Pass criteria:** Edited category and priority persist to the created task.

---

### TC-10 — Worker PWA hold-drag reorder (supervisor/admin only)

**Action:** Log in to the Worker PWA as a supervisor or admin. Navigate to the task list for a carpentry job with ≥3 tasks. Hold-drag the ⠿ handle to move the last task to the top.  
**Expected:** PUT to `/api/worker/tasks/reorder` is called with the new sort order. Task list reloads with the reordered list. Workers (non-supervisor) see the same new order.  
**Verification (worker view):** Log in as a regular worker — confirm the task order matches what the supervisor set.  
**Pass criteria:** Reorder persists; `sort_order` values updated in `site_tasks`; no drag handle visible to regular workers.

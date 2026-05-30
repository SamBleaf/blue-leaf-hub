---
sop_version: 1.0
last_reviewed: 2026-05-30
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

Creates a daily diary entry linked to the carpentry job. Entries record the date, weather, trades on site, work completed, issues, instructions given, and visitors. If it's the first diary entry for a job, the job's "actual start" date is automatically set. The AI structuring feature (same engine as the main Operations site diary) can extract these fields from a free-form voice transcript.

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

[insert screenshot: Diary tab with + New Entry expanded, showing voice transcript field and AI button]

---

## 6. What happens next

- The entry is saved and appears at the top of the diary list
- If this is the first diary entry for the job, the job's **actual_start** date is automatically set to today (or the entry date you specified)
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

## 10. Approval and sign-off

Not required.

---

## 11. Version history

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-05-30 | Claude | Initial draft |

---

## 12. Screenshots required

- [ ] Diary tab with list of entries
- [ ] New entry form expanded, voice transcript field visible
- [ ] Entry after AI structuring (populated fields)

---

## 13. Notes for trainers

The carpentry site diary uses a separate table (`carpentry_site_diary`) from the main site diary (`site_diary`). This is intentional — the main diary has a non-nullable project_id that would conflict. The AI structuring endpoint (`/api/diary/structure`) is shared between both.

---

## 14. Troubleshoot Agent Test Script

### TC-01 — Create diary entry (manual)

**Action:** POST `/api/carpentry/jobs/:id/diary` with `{ entryDate: "2026-06-01", weather: "Sunny", workCompleted: "Framing north wall complete" }` and valid token.  
**Expected:** `{ ok: true, entry: { id, jobId, entryDate: "2026-06-01", weather: "Sunny", workCompleted: "Framing north wall complete" } }` — all camelCase.  
**Pass criteria:** 200, `ok: true`, camelCase keys.

---

### TC-02 — First entry sets actual_start on job

**Action:** Create a new job with no actual_start. Create a diary entry with entryDate: "2026-06-01".  
**Expected:** After creating the entry, GET the job — `actualStart` is now "2026-06-01".  
**Pass criteria:** `job.actualStart === "2026-06-01"`.

---

### TC-03 — Second entry does NOT overwrite actual_start

**Action:** Job with actualStart: "2026-06-01" exists. Create a second diary entry with entryDate: "2026-06-15".  
**Expected:** GET the job — `actualStart` is still "2026-06-01" (not overwritten).  
**Pass criteria:** `actualStart` unchanged.

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

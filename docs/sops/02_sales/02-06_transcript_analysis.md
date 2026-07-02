---
sop_version: 2.0
last_reviewed: 2026-07-02
app_version: Pass 3A — Lead command centre
screenshot_status: not_applicable
owner: Admin / Staff
test_status: untested
---

# SOP 02-06: Analyse a Meeting Transcript

**Module:** Sales Manager — Lead Detail → Conversations panel
**SOP ID:** 02-06
**Status:** Current
**Priority:** High

---

## 1. Who uses this
Admin, Staff (anyone who has just had a meeting or call with a lead)

## 2. When to use it
After a discovery meeting, winning offer presentation, or any significant conversation where a transcript or notes exist. Paste the transcript into the Hub and let Blueprint AI extract key information — it can update the lead record and activity log automatically.

Also works with rough notes, not just formal transcripts. If you typed "client said budget is $1.2M, wants to start ASAP, owns the site in Stirling" after a call, paste that.

Reserve this for meetings where there is meaningful new information. For routine check-in calls, use SOP 02-03 (Log Activity) instead.

## 3. What this does
Sends the transcript to Claude (Anthropic AI) with the lead's full context. The AI reads the transcript and extracts structured suggestions across five categories:
- **Lead details**: first name, last name, email, phone, suburb
- **Project details**: project type, estimated value, floor area, design stage, desired start date, discovery notes
- **Qualifying scores**: budget, timeframe, site status, decision-maker
- **Winning offer**: pre-construction fee, inclusions summary
- **Next action**: suggested next step and due date

You review each suggestion in the review panel and choose which to apply. Approved suggestions are written to the lead record. The transcript and AI output are saved to `lead_conversations` as a permanent audit trail.

## 4. Where to find the Conversations block

The Conversations block appears differently by stage:

**Discovery stage:** The Conversations block appears directly in the **"Do this now"** focus panel alongside the Discovery notes — it is prominently placed because conversations are the primary work of this stage.

**All other stages:** The Conversations block appears in the **"Conversations & activity"** section of the main workspace (scroll down past the focus panel). On mobile, this section is in the **Activity** tab.

The Conversations block shows a count of stored transcripts and an **"+ Add Transcript"** button.

## 5. Step-by-step process

### Step 1 — Open the Conversations panel
Click **"+ Add Transcript"** in the Conversations block.

A full-screen slide-in panel opens from the right. The panel has three stages: **input** → **analysing** → **review**.

### Step 2 — Enter the transcript (input stage)

In the panel:
1. **Title** (optional): give this conversation a name, e.g. "Discovery meeting 2 July". This makes it easier to find later. Always add a title.
2. **Transcript**: paste the full transcript or rough notes into the large text area.
   - Alternatively, click **"Upload .txt file"** to load a .txt or .md file from your device (e.g. a Plaud export, Otter.ai export, or Fireflies transcript).
   - A character count is shown below the text area.
3. Click **"Analyse with Blueprint ✦"**.

The button is disabled if the transcript field is empty.

### Step 3 — Wait for analysis (analysing stage)

A loading spinner appears with the message "Blueprint is reading your transcript…". This typically takes 5–15 seconds. Longer transcripts may take slightly longer.

### Step 4 — Review suggestions (review stage)

The panel switches to the **Review Suggestions** view. It shows:

- **A summary** of the meeting (AI-generated, shown under the panel header)
- **Suggestion sections**, each with a toggle and a select-all / deselect-all link:
  - **Contact**: name, email, phone, suburb updates
  - **Project**: project type, estimated value, floor area, design stage, desired start date, discovery notes
  - **Qualifying Score**: budget, timeframe, site, decision-maker
  - **Winning Offer**: pre-construction fee, inclusions summary
  - **Next Action**: suggested next step and due date
  - **Activity Log**: a "Log meeting to timeline" checkbox (pre-ticked) — this adds a meeting activity entry to the unified timeline

For each field suggestion, the panel shows:
- The field label
- The AI-suggested value (in accent colour)
- The current lead value (struck through, if it differs)

Each suggestion has a **checkbox** — checked = apply it, unchecked = skip it.

**All non-null suggestions are pre-selected by default.** Review each one before applying.

> Do not auto-apply everything blindly. The AI is usually accurate, but can mis-hear dollar amounts (e.g. "$1.2M" transcribed as "$12M"), or suggest a stage move not yet warranted. Read each suggestion before accepting.

### Step 5 — Apply and save

When you are satisfied with the selected suggestions:
1. Click **"Apply & Save"**.
2. The system writes all selected field values to the lead record via `PATCH /api/sales/leads/:id`.
3. A new `lead_conversations` record is created containing the transcript, AI output, and the applied fields.
4. If the Activity Log checkbox was ticked, a meeting activity is inserted into the timeline.
5. The panel closes and the lead data reloads.

To save the transcript without applying any suggestions, uncheck all suggestion checkboxes (or skip to the panel footer and uncheck the "Log meeting to timeline" checkbox last), then click "Apply & Save".

### Editing before applying

Click **"← Edit"** (back button in the review panel footer) to return to the input stage and edit the transcript before re-analysing.

## 6. Reviewing suggestions in detail

| Suggestion section | Fields covered |
|---|---|
| Contact | first_name, last_name, email, phone, suburb |
| Project | project_type, estimated_value, floor_area_estimate, design_stage, desired_start_date, discovery_notes |
| Qualifying Score | qualify_budget, qualify_timeframe, qualify_site, qualify_decision_maker |
| Winning Offer | preconstruction_fee, inclusions_summary |
| Next Action | next_action, next_action_date |
| Activity Log | creates a `lead_activities` meeting entry with the AI's meeting summary |

## 7. If Blueprint cannot extract suggestions

If the transcript is very short or ambiguous, Blueprint may return no field suggestions. The panel shows:

> "Blueprint couldn't extract specific details from this transcript. You can still save it to the conversation log."

In this case, uncheck all suggestion boxes and click "Apply & Save" to store the transcript as a reference record without updating any lead fields.

## 8. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Applying all suggestions without reading them | Trusting AI blindly | Read each one — the AI may have picked up context from a different part of the conversation or mis-transcribed amounts |
| Not giving the conversation a title | Feels optional | Untitled conversations are labelled "Meeting" in the history list and are hard to find later |
| Not clicking Apply & Save | Thought the review was enough | The panel must be explicitly saved — unsaved sessions are lost when you close the panel |
| Using this for every phone call | Overkill | Reserve for meetings with meaningful new information. For routine calls, use SOP 02-03 |
| Uploading a file when text copy is faster | | Both work — use whichever is quicker for the file type you have |

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Analyse with Blueprint" button disabled | The transcript field is empty — paste or upload content first |
| Analysis spinner runs for more than 30 seconds | Check internet connection. Long transcripts (5,000+ words) may take slightly longer. If it still hangs, close the panel, reopen, and try a shorter excerpt. |
| Panel shows "Blueprint couldn't extract specific details" | The transcript may be too short or contain no lead-relevant information. You can still save it. |
| Suggestions look wrong (wrong amounts, wrong stage) | Skip those specific suggestions — uncheck their boxes. Apply the correct ones. Manually update the incorrect fields on the lead after saving. |
| Lead fields did not update after applying | Confirm you clicked "Apply & Save" (not just "← Edit"). Check the DB directly if uncertain. |
| Previous conversations not showing at the bottom of the input panel | Previous conversations are listed at the bottom of the input panel view. If empty, no transcripts have been saved for this lead yet. |

## 10. Related SOPs
- [Log a call, meeting or note](02-03_log_activity.md) — SOP 02-03
- [View conversation history](02-07_conversations.md) — SOP 02-07
- [Blueprint Insight AI coaching](02-05_blueprint_insight.md) — SOP 02-05

## 11. Screenshot placeholders
[insert screenshot: Conversations block in the Discovery focus panel — showing "0 transcripts stored" and "+ Add Transcript" button]
[insert screenshot: Conversations panel open — input stage with title field, transcript textarea, "Upload .txt file" link, and "Analyse with Blueprint" button]
[insert screenshot: Conversations panel — analysing stage with spinner]
[insert screenshot: Conversations panel — review stage with Contact, Project, and Qualifying Score suggestion sections visible]
[insert screenshot: Review stage — individual suggestion row showing suggested value in accent, current value struck through, checkbox ticked]

## 12. Automation notes
- Analysis endpoint: `POST /api/sales/leads/:id/conversations/analyse` with `{ transcript: string }`
- Returns `{ ok: true, suggestions }` — suggestions has sections: `lead`, `project`, `qualifying`, `winning_offer`, `activity`, `next_action`, `next_action_date`, `summary`
- Save endpoint: `POST /api/sales/leads/:id/conversations` with `{ title, transcript, bp_suggestions, applied_fields }`
- `applied_fields` is a flat object of the approved field keys mapped to their new values (e.g. `{ qualify_budget: 2, next_action: "Send fee proposal" }`)
- `bp_suggestions` is the full AI suggestions object (saved for audit trail even if no fields were applied)
- On save: updates `leads` table with all `applied_fields`, inserts `lead_activities` meeting record (if `selected.activity = true`), sets `last_activity_at = now()`
- Transcript saved to `lead_conversations.transcript_text`; AI output saved to `lead_conversations.bp_suggestions`; `applied_at` set to now if any fields applied

## 13. Owner of the process
Admin / Staff
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least 1 lead exists
- [ ] `ANTHROPIC_API_KEY` configured
- [ ] Prepare a 10-line sample transcript: "Client said they have $1.5M budget, own the land in Burnside, want to start in 6 months, husband and wife are both decision makers, keen on passive solar design, 4 bedrooms"

### Test cases

**TC-01 — Open the Conversations panel**
1. Open a lead at any stage
2. Find the Conversations block (Discovery stage: in the focus panel; other stages: scroll to "Conversations & activity" section)
3. Click "+ Add Transcript"
4. Expected: a full-screen slide-in panel opens with Title, Transcript, and "Upload .txt file" elements visible
- [ ] Pass  [ ] Fail

**TC-02 — Analyse a transcript (happy path)**
1. In the Conversations panel, enter title = "Test meeting", paste the sample transcript
2. Click "Analyse with Blueprint ✦"
3. Expected: loading spinner appears, then review panel loads within 15 seconds
4. Expected: suggestions include qualify_budget = 2, qualify_site = 2, qualify_decision_maker = 1 (couple), next_action suggested
5. Expected: Activity Log checkbox is pre-ticked
- [ ] Pass  [ ] Fail

**TC-03 — Empty transcript prevents analysis**
1. In the Conversations panel, leave transcript blank
2. Expected: "Analyse with Blueprint" button is disabled — cannot be clicked
- [ ] Pass  [ ] Fail

**TC-04 — Apply suggestions updates lead record**
1. Run analysis on the sample transcript
2. In the review panel, leave all pre-selected suggestions checked
3. Click "Apply & Save"
4. Expected: panel closes, lead reloads
5. Expected DB: `leads` row shows `qualify_budget=2`, `qualify_site=2`, `qualify_decision_maker=1`
6. Expected DB: `lead_conversations` row with `transcript_text` and `bp_suggestions` populated, `applied_at` set
7. Expected DB: `lead_activities` row created (meeting type)
- [ ] Pass  [ ] Fail

**TC-05 — Skip all suggestions saves transcript without updating lead**
1. Run analysis
2. In the review panel, uncheck all checkboxes including "Log meeting to timeline"
3. Click "Apply & Save"
4. Expected DB: `lead_conversations` row created with transcript and suggestions saved
5. Expected DB: `leads` table NOT updated (no field changes)
6. Expected DB: no new `lead_activities` row
- [ ] Pass  [ ] Fail

**TC-06 — Feature case: Previous conversations listed in the panel**
1. Save at least one conversation (from TC-04)
2. Click "+ Add Transcript" again
3. Expected: at the bottom of the input panel, a "Previous conversations" section lists the saved conversation with its title and date
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Conversations panel opens from the Conversations block
- [ ] Analysis returns structured suggestion sections (not raw text)
- [ ] Approved suggestions write to correct lead fields
- [ ] Conversation saved to lead_conversations with transcript and AI output
- [ ] Activity log created when activity checkbox is ticked
- [ ] Empty transcript blocks the analyse button
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

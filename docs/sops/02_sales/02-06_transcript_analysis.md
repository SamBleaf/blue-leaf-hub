---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin / Staff
test_status: static_pass
---

# SOP 02-06: Analyse a Meeting Transcript

**Module:** Sales Manager — Lead Detail → Conversations tab  
**SOP ID:** 02-06  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Staff (anyone who has just had a meeting or call with a lead)

## 2. When to use it
After a discovery meeting, winning offer presentation, or any significant conversation where a transcript or notes exist. Paste the transcript into the Hub and let Blueprint AI extract the key information — it updates the lead record and activity log automatically.

Also works with rough notes, not just formal transcripts. If you typed "client said budget is $1.2M, wants to start ASAP, owns the site in Stirling" after a call, paste that.

## 3. What this does
Sends the transcript to Claude (Anthropic AI) with the lead's full context. The AI reads the transcript and extracts:
- Key project details (project type, budget, floor area, start date, design stage)
- Qualifying score updates (budget confidence, timeframe, site status, decision-maker)
- Discovery notes
- A suggested next action and date
- A summary of the meeting

You review each suggestion and approve or reject each one individually. Approved suggestions are written to the lead record. The transcript and suggestions are saved to `lead_conversations` for the audit trail.

## 4. Before you start
- Have the transcript ready (text format — can be rough notes, Otter.ai export, or anything text-based)
- The lead must exist and have at least a name

## 5. Step-by-step process

1. Open the lead detail page
2. Click the **Conversations** tab
3. Click **+ New conversation** or **Analyse transcript**
4. Fill in:
   - **Title** (optional) — e.g. "Discovery meeting 29 May" — helps find this conversation later
   - **Transcript** (required) — paste the full transcript or notes
5. Click **Analyse with Blueprint**
6. Wait 5–15 seconds — the AI reads the transcript and returns structured suggestions
7. The **Suggestion Review** panel appears showing each suggestion:
   - Stage suggestion (e.g. "Move to Discovery")
   - Qualifying score updates
   - Project detail updates
   - Next action
   - Meeting summary
8. For each suggestion: click **✓ Apply** to accept it or **✗ Skip** to ignore it
9. Click **Save conversation** (or **Save and apply**)
10. Applied suggestions are written to the lead. The conversation (transcript + AI output) is saved to the lead's Conversations tab.

## 6. Reviewing suggestions

**Do not auto-apply everything.** Review each suggestion. The AI is usually right, but:
- It may mis-hear dollar amounts (transcript artefact — e.g. "$1.2M" transcribed as "$12M")
- It may suggest a stage move you're not ready to make yet
- It may fill in fields based on context that doesn't apply to the current project

**If a suggestion is wrong:** skip it. You can always update the field manually afterwards.

## 7. What gets applied

When you approve suggestions and save, the following may be written to the lead:
- Project fields: `project_type`, `estimated_value`, `floor_area_m2`, `design_stage`, `desired_start_date`, `discovery_notes`
- Qualifying fields: `qualify_budget`, `qualify_timeframe`, `qualify_site`, `qualify_decision_maker`
- Winning offer fields: `preconstruction_fee`, `inclusions_summary`
- Lead fields: `suburb` (if updated)
- Next action: `next_action`, `next_action_date`
- `last_activity_at` → now

An activity log entry is also created (activity_type from the transcript, summary from the AI suggestion).

## 8. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Applying all suggestions without reading them | Trusting the AI blindly | Read each one — the AI may have picked up context from a different part of the conversation |
| Pasting a 30-minute transcript as one block | Long transcripts are fine | Keep it as-is — the AI handles long transcripts. Don't summarise before pasting. |
| Not saving after reviewing | Thought review was enough | Click Save after reviewing suggestions — unsaved conversations are lost when you navigate away |
| Using this for every phone call | Overkill | Reserve for meetings where there's meaningful new information. Use SOP 02-03 for routine calls. |

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| "transcript required" error | The transcript field is mandatory — paste at least a sentence |
| Analysis takes too long (> 30 seconds) | Check internet connection. Large transcripts may take slightly longer but should complete. |
| Suggestions are completely wrong | The AI may have struggled with a very short or ambiguous transcript. Review all carefully. You can skip all and just save the transcript without applying any suggestions. |
| Lead fields didn't update after applying | Check that you clicked Save after approving suggestions, not just reviewed them |

## 10. Related SOPs
- [Log a call, meeting or note](02-03_log_activity.md) — SOP 02-03
- [Blueprint Insight AI coaching](02-05_blueprint_insight.md) — SOP 02-05
- [View conversation history](02-07_conversations.md) — SOP 02-07

## 11. Screenshot placeholders
[insert screenshot: Conversations tab with transcript input form]
[insert screenshot: Suggestion Review panel showing individual suggestions with Apply/Skip buttons]

## 12. Automation notes
- Analysis endpoint: `POST /api/sales/leads/:id/conversations/analyse` with `{ transcript }`
- Returns `{ ok: true, suggestions }` — suggestions is a structured JSON object with sections (lead, project, qualifying, winning_offer, activity)
- Save endpoint: `POST /api/sales/leads/:id/conversations` with `{ title, transcript, bp_suggestions, applied_fields }`
- `applied_fields` is the subset of suggestions the user approved — each key maps to a lead field
- On save with applied_fields: updates `leads` table with all approved fields, inserts `lead_activities` record, sets `last_activity_at = now()`
- Transcript saved to `lead_conversations.transcript_text`; AI output saved to `lead_conversations.bp_suggestions`

## 13. Owner of the process
Admin / Staff  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least 1 lead exists
- [ ] `ANTHROPIC_API_KEY` configured
- [ ] Prepare a 10-line sample transcript (make one up: "Client said they have $1.5M budget, own the land in Burnside, want to start in 6 months, husband and wife both decision makers, keen on passive design")

### Test cases

**TC-01 — Analyse a transcript**
1. Open a lead → Conversations tab
2. Click + New conversation
3. Enter title = "Test meeting", paste the sample transcript
4. Click Analyse with Blueprint
5. Expected result: within 15 seconds, a Suggestion Review panel appears
6. Expected: suggestions include budget qualification (qualify_budget = 2), timeframe, site (qualify_site = 2), decision-maker (qualify_decision_maker = 1 — couple)
- [ ] Pass  [ ] Fail

**TC-02 — Empty transcript rejected**
1. Click + New conversation
2. Leave transcript blank
3. Click Analyse
4. Expected: "transcript required" error — no API call made
- [ ] Pass  [ ] Fail

**TC-03 — Apply suggestions updates lead record**
1. Run analysis on a transcript
2. In the suggestion panel, approve all suggestions
3. Click Save
4. Expected DB: `leads` row updated with the approved field values
5. Expected DB: `lead_conversations` row with `transcript_text` and `bp_suggestions` populated
6. Expected DB: `lead_activities` row created (meeting type, with summary from AI)
- [ ] Pass  [ ] Fail

**TC-04 — Skip suggestions saves transcript without updating lead**
1. Run analysis
2. Skip ALL suggestions
3. Click Save
4. Expected DB: `lead_conversations` row created with transcript and suggestions saved
5. Expected DB: `leads` table NOT updated (no field changes from this conversation)
6. Expected DB: no new `lead_activities` row (or one with no applied changes, depending on implementation)
- [ ] Pass  [ ] Fail

**TC-05 — Conversation appears in history**
1. Save a conversation (from TC-03 or TC-04)
2. Navigate away and return to the Conversations tab
3. Expected: conversation appears in the list with the title and date
4. Click the conversation — expected: full transcript and AI suggestions are viewable
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Analysis returns structured suggestions (not raw text)
- [ ] Approved suggestions write to correct lead fields
- [ ] Conversation saved to lead_conversations
- [ ] Activity log created when suggestions applied
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

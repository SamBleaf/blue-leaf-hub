---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin / Staff
test_status: static_pass
---

# SOP 02-07: View and Manage Conversation History

**Module:** Sales Manager — Lead Detail → Conversations tab  
**SOP ID:** 02-07  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Admin, Staff

## 2. When to use it
When you want to review what was said in a previous meeting. When handing a lead to a colleague. When the AI-suggested field updates didn't match what the client actually said and you need to check.

## 3. What this does
The Conversations tab stores every transcript and its associated AI analysis for the lead. Each conversation shows:
- Title (if given)
- Date
- Whether suggestions were applied
- The full transcript on click

## 4. Step-by-step process

**Viewing conversation history:**
1. Open the lead detail page
2. Click the **Conversations** tab
3. A list of all saved conversations appears, newest first
4. Each row shows: title (or date if no title), saved date, whether Blueprint suggestions were applied
5. Click any conversation to open the full detail:
   - Full transcript
   - AI suggestions (what Blueprint extracted)
   - Which suggestions were applied to the lead

**Finding a specific meeting:**
- Conversations are sorted newest first
- If you gave the conversation a title when saving ("Discovery meeting 29 May"), it shows here

**There is no edit or delete function on conversations.** They are permanent records. If information was incorrectly applied from a conversation, correct it directly on the lead's fields and add a Note activity (SOP 02-03) explaining the correction.

## 5. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Not giving conversations a title | Feels optional | Untitled conversations are hard to find later. Always add a title when saving. |
| Trying to delete a wrong conversation | Mistakenly applied suggestions | Conversations can't be deleted (audit trail). Correct the lead fields directly and note the correction in the activity log. |

## 6. Troubleshooting

| Problem | Solution |
|---------|----------|
| Conversations tab shows empty | No conversations have been analysed and saved for this lead yet. Use SOP 02-06 to add one. |
| A conversation shows "No suggestions applied" | Either all suggestions were skipped, or the conversation was saved without running analysis. |

## 7. Related SOPs
- [Analyse a meeting transcript](02-06_transcript_analysis.md) — SOP 02-06

## 8. Automation notes
- API: `GET /api/sales/leads/:id/conversations` — returns list (id, title, created_at, applied_at, bp_suggestions presence)
- API: `GET /api/sales/leads/:id/conversations/:convId` — returns full record including transcript_text and applied_suggestions
- `lead_conversations` is append-only — no UPDATE or DELETE endpoints

## 9. Owner of the process
Admin / Staff  
Next review: 2026-11-29

---

## 10. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least 1 conversation already saved for a test lead (from SOP 02-06 TC-03 or TC-04)

### Test cases

**TC-01 — Conversation list loads**
1. Open a lead with at least 1 saved conversation
2. Click Conversations tab
3. Expected: list of conversations visible, sorted newest first
4. Expected: each entry shows at minimum a date and title (or "Untitled")
- [ ] Pass  [ ] Fail

**TC-02 — Open a conversation and see full transcript**
1. Click any conversation in the list
2. Expected: full transcript text is visible
3. Expected: AI suggestions section shows what Blueprint extracted
4. Expected: "Applied" indicator shows whether suggestions were applied to the lead
- [ ] Pass  [ ] Fail

**TC-03 — Conversations are read-only**
1. Open a conversation
2. Expected: no Edit or Delete buttons
3. Expected: transcript text is not editable
- [ ] Pass  [ ] Fail

**TC-04 — Multiple conversations appear in correct order**
1. Save two conversations for the same lead (from different tests)
2. Open Conversations tab
3. Expected: both appear, newest first
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Conversation list loads correctly
- [ ] Full detail view shows transcript and AI output
- [ ] No edit/delete available (read-only)
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

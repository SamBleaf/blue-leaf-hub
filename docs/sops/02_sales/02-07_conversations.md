---
sop_version: 2.0
last_reviewed: 2026-07-02
app_version: Pass 3A — Lead command centre
screenshot_status: not_applicable
owner: Admin / Staff
test_status: untested
---

# SOP 02-07: View and Manage Conversation History

**Module:** Sales Manager — Lead Detail → Conversations block + panel
**SOP ID:** 02-07
**Status:** Current
**Priority:** Medium

---

## 1. Who uses this
Admin, Staff

## 2. When to use it
When you want to review what was said in a previous meeting. When handing a lead to a colleague. When the AI-suggested field updates did not match what the client actually said and you need to check the original transcript.

## 3. What this does
The Conversations block on the lead detail stores every transcript and its associated AI analysis for the lead. Each saved conversation is listed with a title, date, and whether suggestions were applied. Clicking any entry opens the full detail in the Conversations panel.

## 4. Where to find conversation history

**Conversations block in the lead detail:**
- **Discovery stage:** the Conversations block is in the "Do this now" focus panel alongside the Discovery notes workspace
- **All other stages:** the Conversations block is in the "Conversations & activity" section of the main workspace (scroll down past the focus panel)

The block shows:
- A count of stored transcripts ("N transcripts stored")
- The 3 most recent conversations as summary cards (title, date, AI summary line-clamp, "✓ Applied" badge if applied)
- If more than 3 exist, a "+N more…" link

**Opening the full conversation list:**
Click the **"+ Add Transcript"** button or any existing conversation card. The Conversations panel slides in from the right.

## 5. Viewing conversation history in the panel

When the Conversations panel opens in **input** mode (for adding a new transcript), the **previous conversations** are listed at the bottom of the panel (scrollable section titled "Previous conversations"). Each entry shows:
- Title (or "Meeting" if untitled)
- Relative date (e.g. "3d ago")
- AI summary (first line, if available)
- "✓ Applied" badge if suggestions were applied

Click any previous conversation entry to view its details.

> Note: clicking a previous conversation card currently navigates to the "Add Transcript" view rather than a dedicated read-only detail view. The full transcript and AI output are stored in the DB but the current UI does not render a separate conversation detail view — the stored data is accessible via the API. If you need to audit a transcript, use the API or Supabase dashboard directly.

## 6. Conversations are read-only (no edit or delete)

There is no Edit or Delete function on conversations. They are permanent records.

If information was incorrectly applied from a conversation (e.g. wrong budget amount), correct it directly on the lead's fields (use the InlineField editors in the Lead details section) and add a Note activity (SOP 02-03) explaining the correction. The original conversation transcript remains in the system as the source of truth.

## 7. Untitled conversations

If a title was not given when saving, the conversation is labelled "Meeting" in the history list. Always add a title when saving — "Discovery meeting 2 July" is far easier to find than three entries all labelled "Meeting".

## 8. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Not giving conversations a title | Feels optional | Untitled conversations all show as "Meeting" — hard to distinguish. Always add a title. |
| Trying to delete a wrong conversation | Mistakenly applied suggestions | Conversations cannot be deleted (audit trail). Correct the lead fields directly and note the correction in the activity log. |
| Looking for a dedicated "Conversations tab" | Old SOP described a separate tab | There is no separate Conversations tab in Pass 3A. History is accessed via the Conversations block in the main workspace or focus panel. |

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| Conversations block shows empty | No conversations have been saved for this lead yet. Click "+ Add Transcript" and follow SOP 02-06. |
| A conversation shows "No applied badge" | Either all suggestions were skipped, or the conversation was saved with the Activity Log checkbox unchecked. The transcript is still stored. |
| Cannot find a specific old conversation | Open the panel — scroll to the bottom to see the Previous conversations list (up to all saved records). If the list is very long, note the approximate date and scan titles. |
| Need to read the full transcript text | The full transcript is stored in `lead_conversations.transcript_text`. Access it via the Supabase dashboard (table editor → lead_conversations → filter by lead_id) until a dedicated read view is built. |

## 10. Related SOPs
- [Analyse a meeting transcript](02-06_transcript_analysis.md) — SOP 02-06
- [Log a call, meeting or note](02-03_log_activity.md) — SOP 02-03

## 11. Screenshot placeholders
[insert screenshot: Conversations block in the main workspace — 3 conversation cards visible, each showing title, date, and AI summary line]
[insert screenshot: Conversations panel open in input mode — "Previous conversations" section at the bottom listing past entries]

## 12. Automation notes
- Conversations list: `GET /api/sales/leads/:id/conversations` — returns `{ ok: true, conversations: [{ id, title, created_at, applied_at, bp_suggestions }] }`
- Full record: `GET /api/sales/leads/:id/conversations/:convId` — returns transcript_text and full bp_suggestions JSON
- `lead_conversations` is append-only — no UPDATE or DELETE endpoints exist
- The Conversations block in LeadDetail.jsx loads the list on page mount alongside the lead and timeline: `Promise.all([leadFetch, conversationsFetch, timelineFetch])`
- The block shows max 3 entries inline; all entries available in the panel's "Previous conversations" list

## 13. Owner of the process
Admin / Staff
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least 1 conversation already saved for a test lead (from SOP 02-06 TC-04)
- [ ] Logged in as Admin or Staff

### Test cases

**TC-01 — Conversations block shows saved conversations**
1. Open a lead with at least 1 saved conversation
2. Find the Conversations block (Discovery: in focus panel; others: scroll to "Conversations & activity")
3. Expected: block shows "N transcripts stored" count and at least 1 conversation card with title, date
4. Expected: "✓ Applied" badge visible on conversations where suggestions were applied
- [ ] Pass  [ ] Fail

**TC-02 — Previous conversations listed in the panel**
1. Click "+ Add Transcript" on the same lead
2. The panel opens in input mode
3. Expected: at the bottom, "Previous conversations" section lists all saved conversations
4. Expected: each entry shows title (or "Meeting"), relative date, and AI summary if available
- [ ] Pass  [ ] Fail

**TC-03 — Three-entry cap in the block with overflow link**
1. Ensure the test lead has at least 4 saved conversations
2. Check the Conversations block in the main workspace
3. Expected: block shows exactly 3 conversation cards
4. Expected: a "+N more…" link is visible below the 3 cards
- [ ] Pass  [ ] Fail

**TC-04 — Read-only: no edit or delete available**
1. Open the Conversations panel and view the "Previous conversations" list
2. Expected: no Edit or Delete buttons on any conversation entry
3. Attempt to open a conversation card and check for an edit interface
4. Expected: none — conversations are view-only references
- [ ] Pass  [ ] Fail

**TC-05 — Feature case: multiple conversations sorted newest first**
1. Save two conversations for the same lead at different times (or verify from prior tests)
2. Open the Conversations panel — check the "Previous conversations" list
3. Expected: conversations appear newest first (highest created_at at top)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Conversations block found in expected location (focus panel at Discovery, activity section otherwise)
- [ ] Conversation count and cards display correctly
- [ ] Previous conversations list appears in the panel
- [ ] No edit/delete available (read-only)
- [ ] Overflow link appears when more than 3 conversations exist
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

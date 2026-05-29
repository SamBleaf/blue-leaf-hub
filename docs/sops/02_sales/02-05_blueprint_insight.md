---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin / Staff
test_status: static_pass
---

# SOP 02-05: Use Blueprint Insight (AI Sales Coaching)

**Module:** Sales Manager — Lead Detail → Blueprint Insight tab  
**SOP ID:** 02-05  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Staff (sales team)

## 2. When to use it
Before any important sales conversation — discovery meeting, winning offer presentation, fee proposal follow-up. Use it to get AI coaching on how to approach the conversation based on everything the system knows about this lead.

Also useful after a conversation to debrief: ask Blueprint what you should have done differently or what the lead's signals mean.

## 3. What this does
Opens an AI conversation panel (Blueprint Insight) loaded with the full context of the selected lead — stage, qualifying score, project details, activity history. You ask questions in plain English and get APB-methodology coaching responses.

The AI has access to:
- Lead's name, stage, suburb, project type, budget
- Qualifying scores (budget, timeframe, site, decision-maker)
- Discovery notes
- Any other fields captured on the lead

The AI does not have access to:
- Conversations / transcripts (use SOP 02-06 for those)
- CRM interactions (separate module)

## 4. Step-by-step process

1. Open the lead detail page
2. Click the **Blueprint Insight** tab
3. The panel opens on the right side of the screen
4. Type your question in the chat input at the bottom
5. Press Enter or click Send
6. Blueprint responds with coaching specific to this lead
7. Continue the conversation — Blueprint remembers context within this session
8. Close the panel when done — conversations are not saved between sessions

**Example questions to ask Blueprint:**
- "What are the biggest objections this lead might raise and how should I handle them?"
- "They've been at Discovery for 3 weeks without moving. What do I do?"
- "They said their budget is $800k for a double-storey new build. How should I handle this?"
- "What's the most important thing to nail in tomorrow's discovery meeting?"
- "They said they're also getting quotes from two other builders. What's the move?"

## 5. What makes a good Blueprint question

**Be specific.** Blueprint knows the lead's details — you don't need to repeat them. Ask about the situation you're actually facing.

- ❌ "What should I say to a client?"
- ✅ "They've delayed the discovery meeting twice. What does this signal and how do I re-engage?"

**Ask for strategy, not scripts.** Blueprint teaches APB methodology — it won't write a word-for-word script but it will tell you the right approach, the right questions to ask, and what to watch out for.

**Use it before difficult conversations.** If a lead feels like it's slipping away, ask Blueprint before you call — not after.

## 6. What happens after using Blueprint

Blueprint responses are not saved to the lead record. The conversation exists only in your browser tab for that session. If you get insights you want to keep, paste them into a Note activity on the lead (SOP 02-03) so they're in the timeline.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Asking generic questions | Not sure what to ask | Reference the lead's actual situation — stage, qualifying score, what was last said |
| Using Blueprint as a script writer | Misunderstanding the tool | Blueprint coaches you — it doesn't write your words for you. Apply the advice with your own voice. |
| Not using it before difficult calls | Overconfidence | Even experienced sales people benefit from a fresh perspective before a tricky conversation |
| Expecting Blueprint to know about recent conversations | It doesn't store transcripts | Transcript analysis is in the Conversations tab (SOP 02-06) |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Blueprint panel doesn't open | Check that you're on the Blueprint Insight tab within a lead detail page, not the top-level Sales Manager |
| No response after sending | Check your internet connection. The AI response requires a live API call to Anthropic. |
| Response is generic / doesn't reference the lead | The lead may have very few fields filled in — the more context on the lead, the more specific Blueprint's advice |
| Very slow response | The AI model takes a few seconds. Responses stream progressively — you'll see text appear word by word. |

## 9. Related SOPs
- [Qualifying score](02-04_qualifying_score.md) — SOP 02-04
- [Transcript analysis](02-06_transcript_analysis.md) — SOP 02-06

## 10. Screenshot placeholders
[insert screenshot: Blueprint Insight tab open in lead detail with conversation visible]

## 11. Automation notes
- API: `POST /api/blueprint/chat` with `{ messages: [{ role, content }], hubContext }`
- `hubContext` contains the full lead object (all fields from the `leads` table)
- Response field: `reply` (not `response` or `message`) — frontend reads `j.reply`
- Model: `claude-sonnet-4-6` (streams via SSE — text appears progressively in the UI)
- Conversations are not persisted to the database — session only

## 12. Owner of the process
Admin / Staff  
Next review: 2026-11-29

---

## 13. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least 1 lead exists with project_type, budget, and at least 2 qualifying fields set
- [ ] `ANTHROPIC_API_KEY` is configured in Railway
- [ ] Logged in as Admin

### Test cases

**TC-01 — Blueprint Insight opens**
1. Open any lead detail
2. Click Blueprint Insight tab
3. Expected result: AI chat panel appears with an input field
4. Expected: there is some introductory context or prompt visible
- [ ] Pass  [ ] Fail

**TC-02 — Ask a lead-specific question**
1. In the Blueprint panel, type: "What is the most important thing to do with this lead right now?"
2. Click Send
3. Expected result: response appears (may take 2–5 seconds, streams progressively)
4. Expected: response references the lead's actual stage, project type, or other known details
5. Expected: response does NOT use banned phrases like "unique", "quality", or generic builder language
- [ ] Pass  [ ] Fail

**TC-03 — Conversation continues with context**
1. Ask a question and get a response
2. Ask a follow-up question that references the first answer
3. Expected: Blueprint remembers the prior message in the same session
- [ ] Pass  [ ] Fail

**TC-04 — API call fails gracefully**
1. Disconnect from the internet or use browser devtools to block the API call
2. Send a message
3. Expected: a user-friendly error message appears — not a raw API error, not a blank response
- [ ] Pass  [ ] Fail  [ ] Skip

**TC-05 — Response streams progressively**
1. Ask a complex question
2. Observe the response
3. Expected: text appears word-by-word or in chunks (SSE streaming), not all at once after a long wait
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Blueprint opens within the lead detail
- [ ] Responses are lead-specific, not generic
- [ ] Streaming works (no blank screen until full response)
- [ ] Error handling works without exposing raw API errors
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

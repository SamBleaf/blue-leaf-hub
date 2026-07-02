---
sop_version: 2.0
last_reviewed: 2026-07-02
app_version: Pass 3A — Lead command centre
screenshot_status: not_applicable
owner: Admin / Staff
test_status: untested
---

# SOP 02-05: Use Blueprint Insight (AI Sales Coaching)

**Module:** Sales Manager — Lead Detail → Blueprint Insight panel (right rail)
**SOP ID:** 02-05
**Status:** Current
**Priority:** High

---

## 1. Who uses this
Admin, Staff (sales team)

## 2. When to use it
Before any important sales conversation — discovery meeting, winning offer presentation, fee proposal follow-up. Use it to get AI coaching on how to approach the conversation based on everything the system knows about this lead.

Also useful after a conversation to debrief: ask Blueprint what you should have done differently or what the lead's signals mean.

## 3. What this does
Blueprint Insight is an AI coaching panel that appears in the **sticky right rail** of the Lead command centre. When you open a lead, Blueprint automatically generates a short advisory note (3–4 sentences of APB-methodology coaching) based on the lead's current stage, qualifying score, and project details.

The panel is always visible on desktop without any click needed. On mobile it appears in the **Action** tab.

The AI has access to:
- Lead's name, stage, suburb, project type, budget
- Qualifying scores (budget, timeframe, site, decision-maker)
- Discovery notes (first 200 characters)

The AI does not have access to:
- Full conversation transcripts (those are analysed separately — SOP 02-06)
- Notes or documents attached to the lead

**How Blueprint Insight works on load:**

When the lead detail page loads (or after a stage change), Blueprint Insight automatically fetches an initial advisory message. You will see a loading animation (three pulsing bars) while the AI processes. The response streams in progressively — text appears word-by-word, not all at once after a delay.

The auto-fetch is cached per `leadId + stage`. It only re-fetches when the stage changes or you click the refresh button.

**Extended conversation with Blueprint:**

The Blueprint Insight panel in the right rail shows only the auto-generated advisory note (not an interactive chat). For a full back-and-forth coaching conversation, the app uses `useBlueprintContext` globally — the Blueprint panel in the AppShell can be opened from any page.

Within the lead detail, the auto-generated note is what most users need before a call. If you need a deeper conversation, type your question into the Blueprint chat available from the AppShell sidebar.

**Example questions the auto-insight addresses:**

The auto-insight answers: "What should I do next with this lead?" — targeting the specific combination of stage, qualifying score, and project type. Representative themes:

- Leads at Enquiry with low scores: advice on whether to nurture or invest more time
- Leads at Discovery: what questions to ask in the meeting
- Leads at Winning Offer: what objections are likely and how to address them
- Leads at Fee Proposal with no response: follow-up timing and approach
- Stalled leads (high qualify score, long in-stage): re-engagement tactics

## 4. Before you start

**Where to find Blueprint Insight:**

**Desktop (lg+):**
Blueprint Insight is a panel in the **sticky right rail** — the right column of the command centre layout. It appears below the next-action card and the Lead Summary panel. It is always visible on desktop — there is no tab or button required to open it. The panel has a blue-tinted border and header ("BLUEPRINT INSIGHT").

**Mobile / tablet (< lg):**
Tap the **Action** tab. Blueprint Insight appears below the focus panel and the next-action card.

## 5. Step-by-step process

1. Open a lead detail page from the pipeline board.
2. **Desktop:** look at the right rail — the Blueprint Insight panel loads automatically. Wait for the loading animation (three pulsing bars) to finish.
   **Mobile:** tap the **Action** tab, then scroll down to the Blueprint Insight panel.
3. Read the advisory note — it targets your lead's specific stage, qualifying score, and project type.
4. If the advice seems too generic or you want a different angle, click **↺ Refresh** in the panel header to fetch a new response.
5. To keep insights for later reference, paste them into a Note activity on the lead (SOP 02-03).
6. For a full back-and-forth coaching conversation, open the Blueprint chat from the AppShell sidebar.

## 6. What happens next
Blueprint responses are not saved to the lead record. The auto-generated note exists only in the browser session. If you get insights you want to keep, paste them into a Note activity on the lead (SOP 02-03) so they are in the timeline for future reference.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Not noticing Blueprint Insight | It is in the right rail — can be missed if you only look at the main workspace | On desktop, check the right column. On mobile, check the Action tab. |
| Expecting Blueprint to know recent conversations | It does not read stored transcripts | Transcript analysis is separate (SOP 02-06). Blueprint reads the lead's structured fields only. |
| Using Blueprint as a script writer | Misunderstanding the tool | Blueprint coaches you — it does not write word-for-word scripts. Apply the advice with your own voice. |
| Refreshing before reading the first response | Curiosity | The initial auto-fetch is targeted. Refresh only if the advice seems too generic or you want a second perspective. |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Blueprint panel shows "Blueprint unavailable — check API configuration" | The `ANTHROPIC_API_KEY` is not set in Railway. Contact your admin to configure it. |
| No text appears after loading (blank response) | Check network connection. Try clicking ↺ Refresh. |
| Response is generic and does not reference the lead | The lead may have very few fields filled in — the more context on the lead record, the more specific the advice. Add project type, budget, and qualifying scores. |
| Very slow response | The AI model takes a few seconds. Responses stream progressively — text appears word by word. Wait for the stream to complete before refreshing. |
| Blueprint panel not visible on desktop | Scroll the right rail — it appears below the Lead Summary and Trust & context panels. |
| Blueprint panel not visible on mobile | Tap the Action tab, then scroll down. |

## 9. Related SOPs
- [Qualifying score](02-04_qualifying_score.md) — SOP 02-04
- [Analyse a meeting transcript](02-06_transcript_analysis.md) — SOP 02-06
- [Trust & context rail](02-08_lead_fit_classification.md) — SOP 02-08

## 10. Screenshot placeholders
[insert screenshot: Desktop right rail — Blueprint Insight panel showing auto-generated advisory text, Refresh button in header]
[insert screenshot: Mobile Action tab — Blueprint Insight below the advance card]
[insert screenshot: Blueprint Insight panel in loading state — three pulsing bars]

## 11. Automation notes
- Auto-fetch: `POST /api/blueprint/chat` called on mount (and after stage change) with a structured message: `"I have a sales lead named [name] in the [stage] stage... Based on the APB sales framework, what should I do next with this lead? Give specific, actionable advice in 3-4 sentences."`
- `hubContext` passed: `{ page: "lead_detail", stage, leadId }`
- Response field: `j.reply` (not `j.response` or `j.message`) — always use `j.reply`
- Model: `claude-sonnet-4-6` (streams)
- Cache: `bpFetchedFor.current` stores `leadId:stage` — prevents double-fetch on re-render; cleared on stage advance
- Conversations are not persisted to the database — session memory only
- Blueprint panel in AppShell: separate from this auto-insight; uses `useBlueprintContext` — a global context provider that shares screen context with the Blueprint sidebar

## 12. Edge cases and limits
- Blueprint responses exist only in the browser session — they are not saved to the lead record. Paste valuable insights into a Note activity if you want to preserve them.
- The `ANTHROPIC_API_KEY` must be set in Railway — if missing, the panel shows an unavailability message (not a blank panel or raw error).
- If the lead has very few fields filled in, the advice may be generic. The more structured data on the lead (project type, budget, qualifying scores), the more specific the response.
- The AppShell Blueprint chat (`useBlueprintContext`) is a separate feature from the right-rail auto-insight — they do not share conversation history.

## 13. Owner of the process
Admin / Staff
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least 1 lead exists with `project_type`, estimated value, and at least 2 qualifying fields set
- [ ] `ANTHROPIC_API_KEY` is configured in Railway
- [ ] Logged in as Admin

### Test cases

**TC-01 — Blueprint Insight auto-loads on lead open (desktop)**
1. Open any lead with project_type, budget, and qualifying scores set
2. Look at the right rail — Blueprint Insight panel should be visible
3. Expected result: loading animation (three pulsing bars) appears briefly, then advisory text loads
4. Expected: text references the lead's stage, project type, or qualifying situation
- [ ] Pass  [ ] Fail

**TC-02 — Blueprint Insight visible on mobile Action tab**
1. Open a lead on a mobile-width viewport
2. Tap the Action tab
3. Expected: Blueprint Insight panel appears below the advance card
4. Expected: auto-generated advisory text loads
- [ ] Pass  [ ] Fail

**TC-03 — Refresh fetches new advice**
1. Open a lead and wait for Blueprint Insight to load
2. Click ↺ Refresh
3. Expected: loading animation reappears, then new text is streamed in
4. Expected: response is not identical to the first (may be similar but regenerated)
- [ ] Pass  [ ] Fail

**TC-04 — API unavailable error handled gracefully**
1. Temporarily remove or blank the `ANTHROPIC_API_KEY` in the environment (or block the API call in browser devtools)
2. Open a lead detail
3. Expected: Blueprint Insight panel shows "Blueprint unavailable — check API configuration" or similar — not a blank panel, not a raw error stack
- [ ] Pass  [ ] Fail  [ ] Skip (environment restriction)

**TC-05 — Blueprint Insight refreshes after stage advance**
1. Open a lead at Enquiry — note the Blueprint Insight content
2. Advance the lead to Qualify (qualifying score ≥ 0 at Enquiry → Qualify has no gate)
3. Expected: Blueprint Insight shows a loading animation briefly, then new advice referencing the Qualify stage
4. Expected: the cache key changes (leadId:qualify vs leadId:enquiry), so a new fetch is triggered
- [ ] Pass  [ ] Fail

**TC-06 — Feature case: lead with minimal fields produces non-null response**
1. Create a lead with first name only — no project type, no qualifying scores, no suburb
2. Open the lead detail
3. Expected: Blueprint Insight still loads (no crash, no blank panel), may produce a more generic note prompting the user to fill in more information
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Blueprint Insight auto-loads on lead open (desktop right rail + mobile Action tab)
- [ ] Responses are lead-specific (stage, project type referenced)
- [ ] Refresh works
- [ ] Stage advance triggers a re-fetch
- [ ] Error handling works without exposing raw API errors
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

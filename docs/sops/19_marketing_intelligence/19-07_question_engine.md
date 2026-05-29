---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built 2026-05-29
screenshot_status: not_applicable
owner: Admin / Staff
test_status: untested
---

# SOP 19-07: Use the Question Engine (Create Next)

**Module:** Marketing — Intelligence tab → Create Next section  
**SOP ID:** 19-07  
**Status:** Draft (built — not yet deployed)  
**Priority:** Medium

---

## 1. Who uses this
Admin, Staff

## 2. When to use it
When deciding what to create next. Instead of guessing, this shows real questions asked by leads and clients that have no content answer yet — combined with keyword gaps and what's currently converting.

## 3. What this does
Nightly, the system scans lead notes, lead conversation transcripts, site diary entries, and CRM interaction notes for questions and topics that could become SEO content or social posts. An AI (Haiku) classifies their SEO potential and suggests the appropriate content type. These appear in the "Create Next" section of the Intelligence dashboard.

**Sources scanned nightly:**
- `lead_conversations` — meeting transcripts
- `lead_notes` — notes logged by staff during sales meetings
- `site_diary` — questions or observations logged on site
- `crm_interactions` — notes from calls and meetings with prospects/referrers

**What it catches:**
Real questions from real people — "How long does it actually take?" / "What's the difference between passive design and just insulation?" / "What happens if we want to change something during construction?" — that reveal what the target audience actually wants to know and isn't finding an answer for.

## 4. Before you start
- No setup needed — the nightly job runs automatically once the module is built
- `website_questions` table must exist (Migration 062)
- At least some lead notes, conversations, or CRM interactions must exist for the engine to analyse

## 5. Step-by-step process

**Viewing the question queue:**
1. Go to **Marketing → Intelligence**
2. In "Create Next", three top suggestions are shown
3. Click **"See all →"** to open the full Question Engine queue

**The full queue shows:**

| Column | What it shows |
|--------|--------------|
| Question | The question text as detected in the source |
| Source | Where it came from (lead note, site diary, etc.) |
| SEO potential | High / Medium / Low / None |
| Suggested type | FAQ page / Client guide / Instagram post / Journal article / Website page |
| Keyword | Suggested keyword to target (if SEO-worthy) |
| Est. monthly searches | Rough estimate if available |
| Status | Queued / In Progress / Published / Dismissed |

**Acting on a question:**

**Create content from it:**
1. Click **"Create →"** on any question
2. Create tab opens with:
   - Topic pre-filled with the question text
   - Content mode pre-selected based on suggested type (e.g. FAQ → Educate, Client Guide → Client Focused)
   - Channel pre-selected based on suggested content type
3. Generate and save as usual

**Dismiss it:**
1. Click **"Dismiss"** if the question is not worth creating content for
2. Dismissed questions disappear from the queue
3. Dismissed status is final — cannot be un-dismissed

**Mark as published:**
- When you've created content that answers the question, link it back: the content item's creation from the queue auto-links them, OR manually set `content_item_id` on the question record

[insert screenshot: Create Next section on Intelligence dashboard — 3 top suggestions]
[insert screenshot: Full question queue — all columns visible with filter controls]

## 6. What happens next
- Status changes automatically when content is created (status → in_progress when create tab is opened, → published when content is saved and published)
- Published questions show a "Content created" badge linking to the published content item
- Dismissed questions are removed from the queue

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Creating content from every question | The queue can feel like a to-do list | Filter to High SEO potential only. Low and None SEO potential questions might become good social posts but aren't worth website pages. |
| Ignoring "None" SEO potential questions | Feels like waste | A question with no SEO potential but high lead frequency (asked by 4 leads in the last month) is worth answering in a client guide or FAQ even if it won't rank. |
| Over-relying on the queue | It replaces strategic thinking | The queue surfaces real signals but it doesn't prioritise them. You still decide: which questions align with what Blue Leaf is trying to build authority on? |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| Queue is empty | No lead notes, conversations, or CRM interactions yet — or the nightly job hasn't run. Check `website_questions` table is populated. |
| All items showing SEO potential = None | Questions logged by staff may be too operational (e.g. "Sam to call client re: colour selections"). The engine detects marketing-relevant questions — staff diary notes need to include client-facing questions to be classified correctly. |
| Question is inaccurate — it's not a real question | AI occasionally misclassifies notes as questions. Dismiss it and it won't come back. |

## 9. Related modules
- [Generate content with AI](../18_marketing_agent/18-02_generate_content_ai.md)
- [Intelligence dashboard](19-01_intelligence_dashboard.md)
- [Keyword tracking and SEO](19-04_keyword_seo_tracking.md)

## 10. Screenshot placeholders
[insert screenshot: "Create Next" section showing three question-based suggestions]
[insert screenshot: Full question queue with SEO potential column]
[insert screenshot: Create tab opened from a queue item — topic pre-filled]

## 11. Automation notes
- Nightly job: scans `lead_conversations`, `lead_notes`, `site_diary`, `crm_interactions` created since last run → Haiku batch classification (20 items per call) → inserts into `website_questions`
- Haiku prompt: given a piece of text, classify: is there a question here that could become SEO content? If yes: extract the question, rate SEO potential, suggest content type and keyword.
- Duplicate detection: questions with > 80% text similarity to an existing `website_questions` row are skipped
- `website_questions.status` transitions: `queued` → `in_progress` (when Create tab opened from it) → `published` (when content item is published)
- Dashboard "Create Next": shows top 3 from `website_questions WHERE status = 'queued' ORDER BY seo_potential DESC, created_at ASC LIMIT 3`

## 12. Edge cases and limits
- The Haiku batch job runs nightly — new notes logged today won't appear in the queue until tomorrow morning
- Questions are only sourced from the last 90 days of notes/conversations to avoid surfacing outdated topics
- If a question is dismissed and the exact same question appears in a new note, it will be added to the queue again (dismissed records are not used to suppress future identical questions — intentional, since the new source may be more relevant)
- Monthly search estimate is a rough heuristic only — Blue Leaf does not subscribe to a keyword research API. It's a directional indicator, not a precise number.

## 13. Owner of the process
Admin / Staff  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Log in as Admin
- [ ] At least 5 lead notes exist containing questions (e.g. "Client asked: how long does the frame stage take?")
- [ ] Nightly question engine job can be triggered manually for testing

### Test cases

**TC-01 — Nightly job detects questions from lead notes**
1. Add a test lead note: "Client asked about whether passive design really makes a difference in summer"
2. Manually trigger the question engine: `POST /api/intelligence/questions/scan` (or equivalent cron trigger)
3. Expected DB: `website_questions` row created with `question_text` containing the detected question, `source_type = 'lead_note'`, `seo_potential` set (should be 'high' or 'medium' for this question), `suggested_content_type` set
- [ ] Pass  [ ] Fail

**TC-02 — Create tab opens pre-filled from queue item**
1. Go to Intelligence → Create Next → "See all →"
2. Click "Create →" on a queued question
3. Expected result: Create tab opens with `topic` field pre-filled with the question text
4. Expected: content mode and channel pre-selected based on `suggested_content_type`
- [ ] Pass  [ ] Fail

**TC-03 — Status transitions correctly**
1. Click Create on a queued question (status → in_progress)
2. Expected DB: `website_questions.status = 'in_progress'`
3. Generate and save the content item
4. Expected DB: `website_questions.content_item_id` set to the new content item's UUID
5. Publish the content item
6. Expected DB: `website_questions.status = 'published'`
- [ ] Pass  [ ] Fail

**TC-04 — Dismiss removes from queue**
1. Click Dismiss on a queued question
2. Expected result: question disappears from the queue
3. Expected DB: `website_questions.status = 'dismissed'`
4. Refresh page — question does not reappear
- [ ] Pass  [ ] Fail

**TC-05 — Duplicate detection prevents re-adding same question**
1. Add two lead notes with nearly identical text: "Client asked about passive design cost" and "Client asked about passive design costs"
2. Trigger the scan job
3. Expected DB: only ONE `website_questions` row created (duplicate detection working)
- [ ] Pass  [ ] Fail

**TC-06 — Non-questions are not added**
1. Add a lead note that is purely operational: "Sam to follow up with client next Tuesday re: colour selections"
2. Trigger the scan job
3. Expected DB: NO `website_questions` row created for this note (Haiku correctly classified it as non-marketing-relevant)
- [ ] Pass  [ ] Fail (qualitative — AI may occasionally misclassify; document result either way)

**TC-07 — Dashboard top 3 shows highest SEO potential**
1. Ensure at least 5 queued questions exist with varying SEO potentials
2. Go to Intelligence dashboard → Create Next section
3. Expected result: 3 suggestions shown are from the highest SEO potential questions (all 'high' before 'medium', 'medium' before 'low')
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Nightly job can be triggered manually without error
- [ ] Status transitions work correctly
- [ ] Duplicate detection working
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

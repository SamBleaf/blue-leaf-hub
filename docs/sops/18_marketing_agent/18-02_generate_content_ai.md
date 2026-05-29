---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: main
screenshot_status: placeholders_only
owner: Admin / Staff
test_status: tested_2026-05-29 — TC-01 FAIL (no validation feedback on empty topic), TC-02 PASS (generation streams correctly ~8s), TC-03 PASS (all review score dimensions shown), TC-04 PARTIAL (banned phrases partially checked; luxurious/stunning/bespoke/curated/elevated not in checker), TC-05 FAIL (5000-char input accepted; raw AI refusal text shown to user)
---

# SOP 18-02: Generate Content with the AI

**Module:** Marketing — Content Studio → Create tab  
**SOP ID:** 18-02  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Staff

## 2. When to use it
Any time you need to create a new piece of external-facing content — an Instagram post, Facebook post, website copy, email, landing page copy, or a client guide section.

## 3. What this does
Uses the AI (Claude) to generate branded Blue Leaf content based on your topic, channel, content mode, and any photos you've attached. The AI follows Blue Leaf's brand voice rules automatically — it will not produce generic, "luxurious", or vague content. Content is saved to the Library as a draft.

## 4. Before you start
- You need a topic or brief in mind (e.g. "Passive design decisions made at design stage for the Stirling project")
- A project photo is optional but significantly improves output
- If the content is linked to a specific project, select that project in the project bar first

## 5. Step-by-step process

1. Go to **Marketing** in the sidebar
2. Click the **Create** tab (default tab — already selected on first load)
3. **Select Channel** — choose where this content will be published:
   - Instagram / Facebook / Website Copy / Email / Client Guide / Landing Page
4. **Select Content Pillar** — the strategic theme:
   - How We Build / What to Expect / The Work / Community & Craft
5. **Select Content Mode** — the type of content:
   - Educate / Opinion / Behind the Scenes / Client Focused / Story / Authority / Vision
   - Each mode produces a different structure and tone. "Educate" leads with a principle. "Story" leads with a site moment. "Authority" names what goes wrong when details are missed.
6. **Enter Topic / Brief** — required. Be specific. The more detail here, the better the output.
   - Good: "Slab pour at Stirling renovation — steep site, rock excavation required, poured in sections over 2 days"
   - Poor: "Slab pour"
7. **Select Client Stage** (optional) — maps to where in the build journey the target audience is. Affects CTA and framing.
8. **Additional Context** (optional) — paste in a client quote, a specific angle you want covered, or tone notes.
9. **Upload Photo** (optional but recommended) — drag a photo onto the upload area or click to browse. The system will analyse the photo and use it to ground the content in specific visible details.
   - For a stronger result: upload the photo before writing the topic — the analysis may suggest angles you hadn't considered.
10. Click **Generate Content**
11. Watch the content stream in. The AI generates: title, body, CTA, hashtags, alt text, and internal notes.
12. Review the output. Check:
    - Does it start with a hook? (Not "Nestled in…" or "This stunning…")
    - Is at least one technical detail translated into a human consequence?
    - Does it avoid "luxurious", "bespoke", "stunning", "curated", "elevated"?
    - Does it sound like Sam Morris standing on site?
13. If the output is not right, adjust the topic or additional context and click **Generate Again**
14. When satisfied, click **Save to Library** — this creates a content item with status `draft`

> 💡 **Tip:** The Content Mode is the single biggest lever on output quality. "Educate" is for principle-first posts. "Behind the Scenes" is for detail reveals. "Authority" is for naming where the industry gets it wrong. Choose deliberately.

[insert screenshot: Create tab form fully filled in before generating]
[insert screenshot: Content streaming in real-time]
[insert screenshot: Final output with title, body, CTA, hashtags visible]

## 6. What happens next
- Content is saved to the Library as `draft`
- If the content needs review before publishing: change status to `in_review` in the Library
- If it's ready to publish: Admin changes status to `approved`, then to `published` after posting
- If linked to a campaign: assign the content item to the campaign from Library or Campaigns tab

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Vague topic produces generic output | "Instagram post about our work" gives the AI nothing to work with | Write a specific brief — include project type, key decision made, what happened on site |
| Content sounds like a magazine, not Blue Leaf | Wrong content mode selected | "Story" and "Behind the Scenes" produce the most grounded output for project photos |
| CTA appears on an awareness post | Client Stage not set, defaults to producing a CTA | Set Client Stage to "Awareness" if the post isn't targeting a ready-to-enquire audience |
| Alt text left blank | Generated alt text ignored | Alt text is generated automatically — copy it when scheduling the post |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| Generate button does nothing | Topic field is blank — required |
| Content generation stops mid-stream | Network issue — refresh and try again; saved outputs are not lost until you Save |
| Content uses a banned phrase like "stunning" | AI occasionally slips — edit manually or regenerate with a stricter brief. Report if consistent. |
| Photo upload fails | Check file size (max 20MB) and format (JPG, PNG, HEIC accepted) |
| "Failed to generate" error | Check Anthropic API key is valid in Railway env vars |

## 9. Related modules
- [Upload a photo and generate content from it](18-03_upload_photo_generate_content.md)
- [Review and approve content](18-04_review_approve_content.md)
- [Create and manage campaigns](18-05_create_manage_campaigns.md)

## 10. Screenshot placeholders
[insert screenshot: Create tab — all fields visible, channel selector open]
[insert screenshot: Photo upload area with a photo loaded and analysis showing]
[insert screenshot: Generated output — full card with title/body/CTA/hashtags/alt text/notes]

## 11. Automation notes
- Photo upload triggers a vision analysis call (Claude) — extracts `visible_facts`, `probable_assumptions`, `unknowns`, `design_principles`, `content_opportunities`. This populates the photo analysis context block that the generator reads.
- Saving creates a `marketing_content_items` row with `status = 'draft'`, linked to `channel`, `pillar`, `campaign_id` (if set), `project_id` (if project selected), `media_source_id` (if photo used).
- Review scores are computed on save: `brand_voice_score`, `specificity_score`, `apb_detection_flag`, `overpromise_flag`. These are deterministic checks — not AI.

## 12. Edge cases and limits
- Topic field max: no hard limit but very long topics produce worse output — aim for 2–4 sentences
- Photo analysis runs once on upload — if you want different analysis, remove and re-upload
- Email channel produces an array of email variants (subject + preview + body + CTA), not a single post
- Generating without a project selected is fine for brand-level content; project selection enables richer detail in the brief

## 13. Owner of the process
Admin / Staff  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Log in as Admin
- [ ] Have a test photo ready (JPG or PNG, < 20MB)
- [ ] No project required, but optionally select one for the project-linked content test

### Test cases

**TC-01 — Happy path: generate Instagram post without photo**
1. Go to Marketing → Create
2. Channel: Instagram | Pillar: How We Build | Mode: Educate
3. Topic: "Passive design decisions at Stirling — orientation locked at design stage, not as an afterthought"
4. Client Stage: Awareness
5. Click Generate Content
6. Expected result: content streams in; title present, body ≥3 sentences, hashtags array populated, no banned phrases (luxurious/stunning/bespoke/curated/elevated), does not start with "Nestled in" or "This stunning"
7. Expected DB: no record yet (not saved)
- [ ] Pass  [ ] Fail

**TC-02 — Save to Library creates correct DB record**
1. After TC-01, click Save to Library
2. Expected result: success toast / confirmation shown
3. Expected DB: `marketing_content_items` row with `channel = 'instagram'`, `pillar = 'how_we_build'`, `status = 'draft'`, `title` and `body` populated, `review_scores` JSON populated (non-empty)
- [ ] Pass  [ ] Fail

**TC-03 — Generate without topic (required field validation)**
1. Go to Create tab
2. Leave Topic blank, fill in Channel and Pillar
3. Click Generate Content
4. Expected result: validation error on Topic field; no API call made; no content generated
- [ ] Pass  [ ] Fail

**TC-04 — Photo upload triggers vision analysis**
1. Go to Create tab
2. Upload a photo of a construction site
3. Expected result: photo appears in the upload area; a loading state shows while analysis runs; after ~3–5 seconds, photo analysis block appears showing visible_facts, design_principles, or content_opportunities
4. Expected: the analysis appears in the form context before generating
- [ ] Pass  [ ] Fail

**TC-05 — Generate with photo produces grounded content**
1. With photo from TC-04 uploaded, fill in Channel + Pillar + Mode + Topic
2. Click Generate Content
3. Expected result: body references at least one specific visible detail from the photo analysis (not an invented spec)
4. Expected: alt_text field in output is populated and describes the photo accurately
- [ ] Pass  [ ] Fail

**TC-06 — Email channel produces array format**
1. Channel: Email | Pillar: What to Expect | Mode: Client Focused
2. Topic: "Pre-construction meeting — what to expect in the first week"
3. Click Generate
4. Expected result: output shows multiple variants (subject / preview / body / CTA), not a single post format
- [ ] Pass  [ ] Fail

**TC-07 — Brand voice enforcement catches banned phrases**
1. Generate a piece of content (any channel/topic)
2. Manually edit the body to include "stunning transformation"
3. Save to Library
4. Expected DB: `review_scores` JSON contains a flag or warning for the banned phrase (check `apb_detection_flag` or similar field)
5. Expected UI: if the review score shows a warning, it should be visible in the Library content card
- [ ] Pass  [ ] Fail

**TC-08 — Generate Again replaces output**
1. Generate a piece of content
2. Change Additional Context to include a new instruction
3. Click Generate Again
4. Expected result: previous output is replaced; new content streams in; no duplicate saved to DB
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors during generation or photo upload
- [ ] Streaming works smoothly (no UI freeze during generation)
- [ ] DB records match expected values
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

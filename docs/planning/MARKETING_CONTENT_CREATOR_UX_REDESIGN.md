# Marketing Content Creator — UX Redesign

> **HARDENING FREEZE:** Run A **parked**. Planned, not cancelled. [SAM-MKT-001](../qa/SAM_DECISION_LOG.md) · [MARKETING_RUN_A_FREEZE_PARKING_RESULT.md](./MARKETING_RUN_A_FREEZE_PARKING_RESULT.md). No migration 122 during freeze.

**Plan ID:** MARKETING-CONTENT-CREATOR-UX-REDESIGN-01  
**Date:** 2026-06-22 (amended 2026-06-22 — Sam review incorporated)  
**Author:** Cursor (UX planner / product architect)  
**Status:** **Approved in principle — PARKED during hardening freeze** — direction accepted, **not approved for implementation**  
**Mode:** Planning/design only — no product code, schema, routes, commits, or deploys during freeze  
**Parent plan:** [MARKETING_COMMAND_CENTRE_REBUILD_PLAN.md](./MARKETING_COMMAND_CENTRE_REBUILD_PLAN.md)  
**End-to-end map:** [MARKETING_END_TO_END_REBUILD_MAP.md](./MARKETING_END_TO_END_REBUILD_MAP.md) — authoritative system map for Claude handoff  
**Run A / Run B handoff:** [MARKETING_RUN_A_B_HANDOFF_READINESS.md](./MARKETING_RUN_A_B_HANDOFF_READINESS.md) — Batch 3a scope, `suggested_angles[]` schema, ANGLE_GENERATION prompt  
**Doc corrections:** [MARKETING_RUN_A_DOC_CORRECTION_RESULT.md](./MARKETING_RUN_A_DOC_CORRECTION_RESULT.md)  
**Batch 1 status:** **Parked** — Run A not approved during Go-Live P0/P1 hardening freeze

### Sam decision log (2026-06-22)

| Decision | Outcome |
|---|---|
| Core principle | **Approved:** “The asset is the brief.” |
| Primary workflow | Media-first Creator (select media → analyse → angles → package → review) |
| Secondary workflow | **Create from idea** allowed — attach media encouraged before approve/schedule |
| UX layout | Three-column Creator approved (asset · decisions · package) |
| Angle cards, Josh labels, package model | Approved |
| BatchGenerator auto-run on mount | Must not continue in new Creator |
| ReviewPanel | Josh-facing labels first; scores under “See quality details” |
| Pillar / content mode | Internal or “Adjust targeting” — not primary UI |
| Batch 1 routing | `/marketing/studio` = Creator shell placeholder; `/marketing/studio/legacy` = current `ContentGenerator` |
| Batch 3 | Split into **3a** (proof) + **3b** (full package) around `ContentCreator.jsx` |

---

## 1. Current Content Creator UX inventory

### 1.1 Entry points today

| Entry | Path | What happens |
|---|---|---|
| **Create tab (default)** | `/marketing` → `ContentGenerator.jsx` | Opens prompt-first form — no media required |
| **Media tab → single photo** | `MediaUpload` → Asset detail → **“Open in Content Studio”** | Navigates with `?asset_id=` to `/marketing/studio/legacy` (Run A) or `/marketing/studio` (Run B). Legacy/Creator fetches asset and reads **`analysis`** jsonb — replaces parent `seedAsset` prop pattern |
| **Media tab → batch** | Asset detail → “Generate all formats (6 posts)” | Opens `BatchGenerator` inline — fires 6 parallel generates immediately |
| **Media tab → video** | “Review AI edit” → `VideoReview` → `FinalAssembly` | Separate video pipeline; no content package link |
| **Weekly Planner** | Not built | — |
| **Command Centre** | Not built | — |

### 1.2 ContentGenerator.jsx (594 lines) — primary “Create” experience

**Layout:** 2-column — left = form, right = draft output.

**Left column controls (in order):**

1. **Channel** — 6 buttons (Instagram, Facebook, Website, Email, Client Guide, Landing Page)
2. **Content Pillar** — 4 buttons (How We Build, What to Expect, The Work, Community & Craft)
3. **Content mode** — 7 chips (Educate, Opinion, Behind it, For clients, Story, Authority, Vision)
4. **Topic / Brief** — required text input
5. **Client Stage** — dropdown (Awareness → Post Handover)
6. **Photo attached** — small banner *only if* seeded from Media tab (removable)
7. **Additional Context** — optional textarea
8. **Generate Content** — single-channel stream generate

**Right column:** Empty state (“Choose a channel, pillar, and topic”); streaming JSON; `ContentPreview` + `ReviewPanel`; Save to Library / Regenerate.

**Observations:**

- Media is optional and visually secondary (10×10 thumbnail).
- User must choose channel + pillar + mode **before** AI has interpreted the asset.
- Topic is free-text; often duplicated from photo analysis summary when seeded.
- One channel per session; switching channel requires regenerate.
- No campaign link, no audience picker, no angle selection, no package view.
- Empty state emoji + “Choose a channel, pillar, and topic” reinforces prompt-first mental model.

### 1.3 BatchGenerator.jsx (388 lines) — hidden multi-format path

**Trigger:** Media asset detail only, after analysis exists.

**Behaviour:**

- Auto-runs `runAll()` on mount — 6 formats generate without confirmation.
- Topic = `analysis.summary` or hook — **no angle choice**.
- Pillar/client stage passed as props (often defaults).
- Content mode selectable but buried in header.
- Grid of format cards with save-per-channel or save-all.
- Uses `/api/marketing/generate` + `/api/marketing/generate/all-save`.
- **Not linked** to content packages, campaigns, or approval queue.

**Closer to desired “content package”** but still analysis-summary-driven, not angle-driven.

### 1.4 MediaUpload.jsx + AssetDetail — where media actually lives

**Strengths:**

- Upload, project tagging, consent gate, photo analysis display/edit.
- Analysis shows `visible_facts`, `content_opportunities`, build stage, etc.
- Batch + single generate CTAs after consent.

**Gaps:**

- Analysis `content_opportunities` are read-only bullets — not selectable “angles”.
- User must leave Media tab to reach Create for single-channel flow.
- Batch flow stays inside Media — disconnected from Library approval workflow.
- No multi-photo carousel selection.
- Video path forks to VideoReview/FinalAssembly without social copy package.

### 1.5 ReviewPanel.jsx — post-generation review

**Strengths:** APB block, score bars, reject reasons, accuracy warnings.

**Gaps for Josh:**

- Labels are technical (“Specificity 7/10”, “Human translation”).
- No “why this angle”, no campaign, no audience, no Josh operational labels.
- No per-platform package view; single draft only in Create flow.

### 1.6 Backend capabilities (reusable)

| Capability | Location | Notes |
|---|---|---|
| Photo vision analysis | `PHOTO_ANALYSIS_*` in `marketingAgent.mjs` | Returns facts, opportunities, hook, pillar — **not** full angle model yet |
| Single generate | `POST /api/marketing/generate`, `/stream` | Channel + pillar + topic + optional `photo_analysis` in **request body** (maps from DB `analysis` column) |
| Multi save | `POST /api/marketing/generate/all-save` | Batch save without package entity |
| Review checks | `runReviewChecks()` | Rich scores — needs Josh label mapping layer |
| Video frames + clip scores | `videoIntelligence.mjs` | Stage 1 drone support exists |
| Story sequence | `/api/marketing/media/:id/story-sequence` | VideoReview consumes this |

### 1.7 Screenshots

**Captured:** no — planning pass from code audit only. Recommend Sam/Josh walkthrough on live `/marketing` + `/marketing/media` before Batch 3 build.

---

## 2. Why the first build missed the brief

Blue Leaf marketing is **proof-based** — real site photos, drone progress, workmanship, transformations. The brief was always “start from the asset”; the implementation inverted that.

| Brief expectation | What was built | Impact on Josh |
|---|---|---|
| Media-first workflow | Prompt-first form (channel → pillar → topic) | Feels like generic AI writer |
| Asset guides decisions | Pillar/mode chosen before analysis shown | Cognitive load; wrong choices |
| Plain-English angles | `content_opportunities` buried in Media detail | Josh never “picks a story” |
| Content package from one asset | Single channel OR hidden 6-format batch | Repetitive work; no grouped review |
| Campaign/platform recommendations | Manual channel picker only | No strategic guidance |
| Controlled, professional UX | 6+ dropdown groups on Create tab | Overwhelming; not guided |
| One unified creator | Create / Media / Batch / VideoReview silos | Tab hopping; lost context |
| Josh labels + risk | Technical score bars | Low trust in AI |

**Root cause:** `ContentGenerator` was built as a **channel-aware copywriter**. `BatchGenerator` and photo analysis were added as **Media tab extras**, not as the spine of creation. The strongest workflow (“Generate all formats”) is discoverable only after upload → analyse → consent → second button — and it skips angle and campaign steps entirely.

---

## 3. Revised media-first design principle

> **The asset is the brief.** Josh brings proof; AI interprets it; Josh chooses the story; the system recommends where it fits; AI drafts; Josh approves.

### 3.1 Design tenets

1. **Create from media (default)** — primary path starts with upload or vault selection; analysis drives decisions.
2. **Create from idea (secondary)** — educational topics without a photo are allowed; system encourages attaching media before approval/scheduling.
3. **Show, then ask** — analysis and angles appear before pillar/channel jargon.
4. **Choose among options, not from blank forms** — angles, audiences, campaigns as cards/chips.
5. **One package, many platforms** — default output is a linked content package, not a single IG post.
6. **Transparency at every step** — source media, why, risk, Sam gate always visible.
7. **Professional, not playful** — no emoji empty states; construction-grade UI matching Hub elsewhere.
8. **Josh controls strategy** — AI recommends; Josh selects; nothing posts automatically.
9. **Depth without clutter** — pillar, content mode, client stage under “Adjust targeting (optional)”.

### 3.2 Dual creation paths

| Path | Default? | Flow |
|---|---|---|
| **Create from media** | Yes (primary) | Select/upload media → analyse → angle cards → campaign/platform rec → package → review |
| **Create from idea** | Secondary | Enter topic/idea → AI suggests angles → generate drafts → **attach media before approve/schedule** where possible |

**Approved idea-first examples** (no photo required to start):

- Why renovation budgets blow out
- How to choose a builder
- Why airtightness matters
- What to expect during pre-construction
- How to compare builder quotes

**Rule:** Idea-first content is allowed. If no media is attached, show **Needs photo** label and nudge Josh to add proof before approval or scheduling. Do not block draft generation.

### 3.3 Default entry CTA

Command Centre and Weekly Planner should say **“Create from media”** — not “Generate content” or “Open Content Studio”.

---

## 4. Proposed screen layout

### 4.0 Routing (Batch 1 — Sam approved)

**Current repo:** `App.jsx` — `/marketing` and `/marketing/:tab` only. Two-segment paths like `/marketing/studio/legacy` **will not resolve** until Run A adds nested routing.

**Run A requirement (future — not during freeze):** Restructure routing — nested routes for `/marketing/studio/legacy`. Old tab URLs redirect 1 sprint.

| Route | Component | Purpose |
|---|---|---|
| `/marketing` | Command Centre | Weekly home (Batch 1) |
| `/marketing/studio` | `ContentCreatorShell.jsx` | Media-first Creator **placeholder** (Batch 1) → full `ContentCreator.jsx` (Batch 3a+) |
| `/marketing/studio/legacy` | `ContentGenerator.jsx` | **Legacy Studio (temporary)** — must support `?asset_id=` rehydration |

**Batch 1 rule:** `/marketing/studio` must **not** open the old prompt-first form directly. Command Centre links to `/marketing/studio`, not legacy.

#### Batch 1 placeholder copy (`ContentCreatorShell.jsx`)

**Title:** Content Studio — Create from media

**Body:** The new Content Studio will start from real project photos, videos, and drone footage. The asset becomes the brief: AI analyses the media, suggests content angles, then helps create a multi-platform content package for Josh to review.

**Status:** Media-first Creator planned for Batch 3.

**Action:** Use Legacy Studio for the current prompt-first generator until the new Creator is built.

**Button:** Open Legacy Studio → `/marketing/studio/legacy`

**Target route (Batch 3+):** `/marketing/studio` — single full-width **Creator** screen.

### 4.1 Three-column layout (desktop)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Content Studio — Create from media                    [Save draft] [Help]  │
├──────────────────┬──────────────────────────────┬───────────────────────────┤
│  LEFT — ASSET    │  MIDDLE — DECISIONS          │  RIGHT — OUTPUT           │
│                  │                              │                           │
│  [Media preview] │  Step indicator (1–5)        │  Content package          │
│  Project · Stage │                              │  ┌─ Instagram ─────────┐  │
│  Date · Source   │  AI analysis summary         │  │ preview · edit      │  │
│  Consent badge   │  Detected subject            │  └─────────────────────┘  │
│  Safety/risk     │                              │  ┌─ Facebook ──────────┐  │
│                  │  Suggested angles (cards)    │  │ ...                 │  │
│  [Change media]  │  Audience (chips)            │  └─────────────────────┘  │
│  [Upload more]   │  Campaign + platform rec     │  [+ more platforms]       │
│                  │  Risk · Sam approval note    │                           │
│  Carousel thumbs │                              │  Actions per draft:       │
│  (if multi)      │  [Generate package]          │  Edit · Regenerate ·      │
│                  │  (disabled until angle pick) │  Approve · Schedule       │
└──────────────────┴──────────────────────────────┴───────────────────────────┘
```

### 4.2 Mobile / tablet

Stack: Asset (sticky top) → Decisions (scroll) → Output (tabs per platform).

### 4.3 Step indicator (soft wizard — same page, not modal steps)

| Step | Label | Middle column focus |
|---|---|---|
| 1 | Select media | Vault picker / upload overlay |
| 2 | Understand asset | AI analysis loading → results |
| 3 | Choose angle | Angle cards |
| 4 | Confirm targeting | Audience + campaign + platforms |
| 5 | Review package | Output column dominant; middle collapses to summary |

User can scroll back; **Generate package** requires angle selection; media-first path also requires media; idea-first path may generate without media but flags **Needs photo** until attached.

---

## 5. Main media-first workflow

```
Select/upload media
  → AI analyses asset(s)
  → System shows analysis + suggested angles
  → Josh picks angle (+ optional audience override)
  → System recommends campaign, platforms, package type, Sam gate
  → Josh confirms/adjusts
  → AI generates platform-specific drafts (content package)
  → Josh reviews, edits, approves, schedules, or saves
```

**Time target:** 8–12 minutes for one package (fits inside 30-minute weekly session from Command Centre plan).

---

## 6. Photo workflow

### 6.1 Select media (Step 1)

**Primary panel:** Media picker with tabs:

| Tab | Behaviour |
|---|---|
| **Upload** | Drop zone; HEIC handling as today |
| **Media Vault** | Grid with filters: project, date range, this week, photos only |
| **By project** | Project search → recent assets |

**On select:** Large preview left; trigger analysis if not complete (`POST .../analyse`).

### 6.2 Analysis (Step 2)

Show plain-English blocks:

- **What we see** — from `visible_facts` + summary
- **Build stage** — mapped label (not raw enum)
- **Trade / detail** — e.g. “External wall wrap”, “Pro Clima membrane junction”
- **Quality** — Hero / Usable / Archive (derived from analysis + optional Josh override)
- **Safety & privacy** — client visible?, address visible?, consent status
- **Marketing readiness** — Ready for Josh review / Needs Sam approval / Needs consent

### 6.3 Angles (Step 3)

Transform `content_opportunities` + new **`suggested_angles[]`** into selectable cards (see §10).

### 6.4 Targeting (Step 4)

Recommendations pre-selected; Josh can override via chips (see §11).

### 6.5 Generate & review (Step 5)

Default package: **Instagram + Facebook** (Stage 1 MVP). Optional add: LinkedIn, GBP snippet, website FAQ, email snippet.

---

## 7. Multi-photo carousel workflow

### 7.1 Selection

- Vault multi-select (shift/click) or upload batch.
- Max 10 images Stage 1; show filmstrip under main preview.
- Order drag-to-reorder (carousel sequence).

### 7.2 Analysis

- **Per-image analysis** (existing) + **set-level synthesis** (new API):
  - Common project/stage detection
  - Carousel narrative suggestion (“Progress sequence: wrap → batten → cladding”)
  - Weakest slide flag (“Image 3 is dark — consider replacing”)

### 7.3 Angles

Card subtitle: “Works best as carousel” vs single hero image.

### 7.4 Output

- Instagram: carousel caption + per-slide alt text array
- Facebook: album post variant
- Other channels: reference “see carousel on Instagram” or pick hero slide

**Schema note:** `marketing_content_packages.source_asset_ids uuid[]` + `carousel_order int[]`.

---

## 8. Video / drone workflow

Same Creator screen; left column shows video player + clip filmstrip when asset is video/drone.

### 8.1 Flow

```
Select drone/video footage
  → Pipeline: extract frames + score clips (existing videoIntelligence)
  → AI suggests story type (cards):
      · Progress update
      · Transformation reel
      · Before/during/after
      · Site flyover
      · Craftsmanship detail
      · Project milestone
  → Josh picks story type (+ optional clip tweaks via simplified VideoReview)
  → System suggests caption/script, overlay lines, music mood, export format
  → Generate content package (IG reel script, FB post, LinkedIn, etc.)
  → Save approved clips back to Media Vault with tags
```

### 8.2 Integration with existing components

| Phase | Component | Role in new flow |
|---|---|---|
| Clip scoring | `VideoReview` | Embedded as “Adjust clips” drawer — not separate tab |
| Export | `FinalAssembly` | Stage 1: link from package (“Prepare video export”); Stage 6: in-editor |
| Batch copy | `BatchGenerator` logic | Merged into package generate |

### 8.3 Story type → angle mapping

Story type cards use same middle-column pattern as photo angles, with video-specific labels (e.g. “Good for project transformation”).

---

## 9. AI asset analysis requirements

### 9.1 Extend photo analysis response

Keep existing fields; add structured recommendations:

```json
{
  "visible_facts": [],
  "build_stage": "lock_up",
  "trade_or_detail": "External wall wrap / weather membrane",
  "quality_tier": "hero|usable|archive",
  "privacy_risk": "low|medium|high",
  "privacy_notes": "No street number visible",
  "consent_required": true,
  "suggested_angles": [
    {
      "id": "angle_1",
      "title": "Why we protect homes before cladding",
      "subtitle": "Homeowner education · weather-tightness",
      "labels": ["Good for homeowner education", "Good lead quality topic"],
      "audiences": ["homeowner", "renovation_client"],
      "platforms": ["instagram", "facebook", "website"],
      "campaign_template_keys": ["trust_the_process", "high_performance_homes"],
      "pillar": "how_we_build",
      "content_mode": "educational",
      "evergreen": true,
      "lead_quality_signal": "high",
      "sam_approval_likely": false,
      "why": "Shows proactive weather protection — matches BLB performance positioning"
    }
  ],
  "recommended_primary_angle_id": "angle_1",
  "detected_project_signals": { "suburb_hint": null, "architectural": true },
  "summary": "...",
  "suggested_pillar": "how_we_build"
}
```

### 9.2 Video analysis extension

After clip scoring, return:

- `suggested_story_types[]` (same shape as angles)
- Top clips with narrative positions
- `recommended_music_mood`
- `recommended_export_formats[]`

### 9.3 Non-goals for analysis prompt

- Do not invent specs (already guarded)
- Do not auto-select angle — always present options
- Do not use pillar names as primary UI labels

### 9.4 API

| Endpoint | Purpose |
|---|---|
| `POST /api/marketing/media/:id/analyse` | Extend response (backward compatible) |
| `POST /api/marketing/media/analyse-set` | Multi-photo synthesis (new) |
| `POST /api/marketing/media/:id/recommendations` | Angles + campaign fit without full regenerate (optional cache) |

---

## 10. Suggested content-angle model

### 10.1 Angle card UI

Each card shows:

- **Title** — plain English (the post idea)
- **Subtitle** — audience + topic type
- **Label chips** — max 3 from approved vocabulary (§10.2)
- **Why line** — one sentence (`angle.why`)
- **Icons** — platform hints (IG/FB/IN)

**Selection:** Single primary angle (radio). Optional “Show more angles” expands list.

### 10.2 Approved label vocabulary

**Operational:** Ready for Josh review · Needs photo · Safe to post · Needs Sam approval · High value evergreen · Good lead quality topic

**Strategic:** Best for Instagram · Good for homeowner education · Good for architects · Good for project transformation · Good for trust/process content · Good for high-performance building education

Map to `operational_labels[]` + `review_scores` on save — not shown as raw pillar/mode.

### 10.3 Example — external wall wrap photo

| Angle title | Labels |
|---|---|
| Why we protect homes before cladding | Good for homeowner education, Good lead quality topic |
| What weather-tightness means for comfort | Good for high-performance building education |
| Behind the build: high-performance wall systems | Good for trust/process content |
| Detail matters: junctions before finishes | Best for Instagram |
| Architect note: sequencing around external membranes | Good for architects |

### 10.4 Pillar/mode — internal only

Selected angle carries `pillar` + `content_mode` to generate API — **hidden from primary UI**, visible under “Adjust targeting (optional)”.

---

## 11. Audience / campaign / platform recommendation model

### 11.1 Audience chips (Josh override)

| Value | Label |
|---|---|
| `homeowner` | Homeowners |
| `renovation_client` | High-end renovation clients |
| `custom_home_client` | Custom home clients |
| `architect_designer` | Architects & designers |
| `local_general` | Local audience |
| `passive_design` | Energy efficiency / passive design |

**Default:** From selected angle. Multi-select allowed max 2.

### 11.2 Campaign recommendation

**Logic (Stage 1 — rules + AI):**

1. Match `angle.campaign_template_keys` to active `marketing_campaign_templates`
2. If Weekly Planner has current week campaign → prefer that
3. Show: campaign name, template, “fits this week’s slot on {date}” if slot empty

**UI:** Recommended campaign card with “Use this” / “Pick different campaign” / “No campaign”.

### 11.3 Platform recommendation

**Default package (Stage 1 MVP):** Instagram + Facebook.

**Recommended extras** (checkboxes pre-ticked by AI):

| Platform | Output type |
|---|---|
| Instagram | Caption + hashtags + alt text |
| Facebook | Longer post |
| LinkedIn | Professional angle (esp. architect content) |
| Google Business Profile | Short update |
| Website / FAQ | SEO snippet |
| Email | Newsletter paragraph |
| Reel / video script | If video asset |

Show **“Needs Sam approval”** on package header if any draft triggers high privacy risk or campaign policy.

### 11.4 Sam approval gate preview

Before generate:

> **Approval:** Josh can approve · Sam required if client address visible

After generate, per draft and package-level flag.

---

## 12. Content package output model

### 12.1 Package entity (from rebuild plan)

One `marketing_content_packages` row per Creator session:

- `media_source_id` or `source_asset_ids[]`
- `selected_angle_id` / `angle_title` / `angle_payload jsonb`
- `audience[]`, `campaign_id`, `recommended_platforms[]`
- Child `marketing_content_items` per platform

### 12.2 Right column — platform tabs

Tab per platform; each tab:

- Source media thumbnail(s)
- Editable preview (inline textarea)
- Josh labels + risk badge
- Why this draft (1–2 lines from generation metadata)
- Actions: Edit · Regenerate this platform · Mark Safe to post · Send to Approval Queue

### 12.3 Package-level actions

- **Save package to library** — all drafts `draft` or `in_review`
- **Send to Approval Queue** — sets operational labels
- **Schedule** — links to calendar slot (Batch 4)
- **Add to evergreen** — tag High value evergreen

### 12.4 Reuse

- `POST /api/marketing/packages/generate` orchestrates inner `/generate` calls (BatchGenerator pattern)
- `POST /api/marketing/generate/all-save` deprecated for Creator — packages API replaces

---

## 13. Review / edit / approve workflow

### 13.1 In-Creator review (immediate)

1. Package generates → each draft runs `runReviewChecks`
2. `ReviewPanel` evolved → **ReviewSummary** component:
   - Josh labels (not raw scores first)
   - Expandable “See quality details” for scores
   - Source media always pinned
3. Inline edit → `PUT /api/marketing/content/:id`
4. Regenerate single platform without losing others

### 13.2 Approval Queue (downstream)

“Send to Approval Queue” → `/marketing/queue` with package grouped view.

Status transitions unchanged: `draft` → `in_review` → `approved` → `published` (manual log).

### 13.3 Operational labels on approve

Josh clicks **Mark Safe to post** → `approved` + label `Safe to post`  
**Send to Sam** → `in_review` + `Needs Sam approval`

---

## 14. Sam approval gate

| Trigger | UI |
|---|---|
| Client name/address visible in media | Package banner: Needs Sam approval |
| `privacy_risk = high` | Block “Safe to post” for Josh |
| Campaign `approval_mode = manual_high_risk` (049) | Same — use existing column name |
| Architect-partner sensitive content | Suggest Sam review |
| APB block / overpromise in review | Hard block (existing) |

**Josh UX:** Red badge on package + explanation in plain English — not “risk_level=high”.

---

## 15. Josh trust / adoption notes

1. **First screen shows his photo**, not a blank topic field.
2. **Angles are suggestions he can reject** — “None of these” → show secondary angles or manual angle (one text field, still media-attached).
3. **No auto-generate on mount** (fix BatchGenerator anti-pattern).
4. **Progress states** — “Analysing photo…”, “Drafting Instagram… (2 of 4)” — not black box.
5. **Weekly habit:** Command Centre → “3 new site photos ready” → opens Creator with vault filter.
6. **Regenerate is normal** — prominent but not scary; “Try a different angle” preserves media.
7. **Copy to clipboard** per platform for manual post (Stage 1 publish path).

---

## 16. Existing components to keep

| Component | Keep as |
|---|---|
| `ReviewPanel.jsx` | Core logic → wrap in `ReviewSummary` with Josh labels first |
| `BatchGenerator.jsx` | Generation orchestration → merge into `PackageOutputPanel` |
| `ContentPreview` (in ContentGenerator) | Per-platform preview cards |
| `MediaUpload.jsx` upload/analyse/consent | Vault upload module; Creator embeds picker |
| `videoIntelligence.mjs` | Backend pipeline |
| `VideoReview.jsx` | Clip adjustment drawer |
| `FinalAssembly.jsx` | Video export path from Creator |
| `runReviewChecks` | Unchanged; map outputs to labels |
| `PHOTO_ANALYSIS_*` | Extend JSON schema |
| `/generate`, `/generate/stream`, `/all-save` | Inner engines until packages API ships |

---

## 17. Existing components to refactor

| Component | Refactor |
|---|---|
| `ContentGenerator.jsx` | **Legacy Studio** at `/marketing/studio/legacy` until Batch 3b; then retire. Batch 3+ primary UI is `ContentCreator.jsx` |
| `Marketing.jsx` | Route `/marketing/studio` to new Creator |
| `MediaUpload.jsx` | Split: vault browser vs upload; remove duplicate generate CTAs → “Open in Content Studio” |
| `ReviewPanel.jsx` | Josh-first labels; collapse numeric scores |
| `marketingAgent.mjs` | Extended analysis + angle prompt |
| `marketingPrompts.mjs` | Package-aware generate context (angle + audience) |

---

## 18. Existing components to hide / merge

| Current | Action |
|---|---|
| Create tab prompt-first form | **Relocate** to `/marketing/studio/legacy` — labelled **Legacy Studio (temporary)**; not primary Content Studio |
| Media → “Generate post from this photo” | **Update** to open Creator shell or legacy with asset context until Batch 3a |
| Media → “Generate all formats” inline BatchGenerator | **Remove** inline auto-run in new Creator; legacy batch may remain until Batch 3b |
| Content mode / pillar pickers on main form | **Collapse** to “Adjust targeting” in new Creator; remain visible in legacy |
| Client Stage dropdown on main form | **Infer** from angle or hide under advanced in new Creator |
| Emoji empty states | **Remove** from new Creator shell |
| Separate BatchGenerator page state in MediaUpload | **Merge** into Creator in Batch 3b; no auto-run on mount |

---

## 19. Data / API requirements

### 19.1 Stage 1 MVP APIs

| API | Change |
|---|---|
| `POST .../media/:id/analyse` | Extended JSON (§9.1) — backward compatible |
| `POST /api/marketing/packages/generate` | Body: asset_ids[], angle, audience, platforms, campaign_id |
| `GET /api/marketing/packages/:id` | Package + child items |
| `PATCH /api/marketing/packages/:id/approve` | Cascade approve |
| `GET /api/marketing/media?vault=1&project=&week=` | Vault picker filters |

### 19.2 Schema (aligns with rebuild plan — migration 122)

- `marketing_content_packages`: add `angle_payload jsonb`, `source_asset_ids`, `audience[]`
- `marketing_content_items`: `package_id`, `operational_labels`, `platform`, `generation_metadata jsonb` (why, angle_id)
- `marketing_media_assets`: analysis stores `suggested_angles` (or separate column)

### 19.3 Prompt changes

New prompt: **`ANGLE_GENERATION`** — given analysis, return 5–8 angles with full metadata (§9.1).

Generate prompt enrichment: pass `selected_angle`, `audience`, not raw topic alone.

---

## 20. MVP version (Content Creator)

**Ship in Stage 1 Batch 3** (revised scope):

| In MVP | Out of MVP |
|---|---|
| Single photo + vault pick | Multi-photo carousel (Batch 3.5 or 4) |
| Extended analysis + angle cards | Full set-level carousel synthesis |
| Audience chips + campaign rec (rules) | AI campaign recommendations (Stage 2) |
| Package: IG + FB (+ optional website snippet) | LinkedIn, GBP, email in default package |
| Drone: upload + clip scores + story type cards | Full transformation reel editor (Stage 5/6) |
| Review with Josh labels | Inline schedule (Batch 4) |
| Save package → Approval Queue | Auto-post (Stage 3) |

**MVP success:** Josh selects site photo → picks angle → gets IG+FB drafts with why/risk → saves to queue in <10 minutes without writing a topic from scratch.

---

## 21. Future version

| Enhancement | Stage |
|---|---|
| Multi-photo carousel packages | Stage 1+ (fast follow) |
| Full 7-platform package default | Stage 1 polish |
| Video story builder integrated export | Stage 5–6 |
| “Create from Weekly Planner gap” pre-fill | Stage 1 Batch 2 integration |
| Auto-suggest angles from vault batch | Stage 2 |
| Remember Josh’s preferred audiences | Stage 2 |
| A/B hook variants per platform | Stage 2 |

---

## 22. Impact on MARKETING_COMMAND_CENTRE_REBUILD_PLAN.md

| Rebuild plan section | Impact |
|---|---|
| §8 Sitemap — Content Studio | **Content Studio = media-first Creator**, not renamed Create tab |
| §9 MVP workflow step 3 | “Content Studio” step becomes “Create from media → package” |
| §11 Content package model | **Confirmed critical** — Creator is primary consumer |
| §19 Frontend components | Add `ContentCreator.jsx`; demote `ContentGenerator.jsx` |
| §22 Batch 1 | **Amend** — see §23 |
| §22 Batch 3 | **Major scope increase** — see §24 |
| §22 Batch 5 | Media Vault feeds Creator picker; remove duplicate generate CTAs |
| Josh labels (§7) | Applied inside Creator review, not only Approval Queue |

**Cross-link:** [MARKETING_COMMAND_CENTRE_REBUILD_PLAN.md](./MARKETING_COMMAND_CENTRE_REBUILD_PLAN.md) §22 amended — Batch 1 unblocked; Batch 3 split into 3a/3b; Content Creator is **primary Stage 1 deliverable** alongside Command Centre.

---

## 23. Batch 1 — amended scope (Sam approved)

**Batch 1 may proceed** with the following scope (implementation in separate batch — not this doc):

| Area | Amended Batch 1 |
|---|---|
| Command Centre | `/marketing` → week snapshot |
| Creator shell | `/marketing/studio` → placeholder with Sam-approved copy (§4.0) |
| Legacy preserve | `/marketing/studio/legacy` → unchanged `ContentGenerator.jsx` |
| Architecture | Marketing MVP migration **122** plan; reserved route stubs; `angle_payload` / `generation_metadata` in schema plan |
| Asset seeding | Query-param `?asset_id=` — Run A legacy + Run B Creator |
| Out of scope | Angle cards, package generate, Approval Queue, Batch 3 Creator logic |

**Acceptance criteria:** See rebuild plan §22 Batch 1 (9 items).

---

## 24. Batch 2 / Batch 3 scope (Sam approved split)

### Batch 2 — Weekly Planner + templates

**Minor scope additions:**

- Planner empty slot CTA: **“Create from media”** → `/marketing/studio` with `campaign_id` + `week_start` query params
- Template cards show example angles (“Trust the Process — typical angles”)
- No change to migration 122 core

### Batch 3a — Media-first Creator proof

**Goal:** Prove media-first workflow end-to-end.

| Deliverable | Scope |
|---|---|
| `ContentCreator.jsx` | Three-column shell with real workflow (not placeholder) |
| Media | Select/upload one asset from vault |
| Analysis | Extended analyse + **angle cards** |
| Targeting | Choose audience / campaign / platform |
| Generate | 1–2 platform drafts (e.g. IG + FB) |
| Review | Josh labels, risk, why (scores under details) |
| Save | Library or Approval Queue stub |

**Out of scope:** Full multi-platform package entity, queue grouping

**Done when:** Josh selects site photo → picks angle → gets drafts with labels → saves without using Legacy Studio.

### Batch 3b — Full package Creator

**Goal:** Production content package workflow.

| Deliverable | Scope |
|---|---|
| `marketing_content_packages` | Linked package row + child content items |
| Package generate | Multi-platform via `packages/generate` |
| Approval Queue | Package grouping; per-platform edit/regenerate |
| Gates | Josh labels + Sam approval flags |
| Legacy | Legacy Studio still available; new Creator becomes default at `/marketing/studio` |

**Out of scope:** Calendar (Batch 4), auto-post (Stage 3)

**Done when:** Josh generates IG+FB+ website snippet package, reviews in queue, marks Safe to post.

**Do not implement Batch 3 logic in Batch 1.**

---

## Appendix A — Component map (target state)

```
ContentCreatorShell.jsx     ← Batch 1 placeholder at /marketing/studio
ContentCreator.jsx          ← Batch 3a/3b full media-first Creator
├── MediaColumn.jsx
├── DecisionColumn.jsx
├── PackageColumn.jsx
├── MediaPickerModal.jsx
└── VideoClipDrawer.jsx

ContentGenerator.jsx        ← Legacy Studio at /marketing/studio/legacy (temporary)
```

---

## Appendix B — Wireframe reference (ASCII)

See §4.1 for desktop layout. Figma/mock pass optional before Batch 3a — recommend one static mock in `docs/ui-redesign/marketing/` for Sam/Josh sign-off.

---

Next safe action:  
Sam reviews [MARKETING_END_TO_END_REBUILD_MAP.md](./MARKETING_END_TO_END_REBUILD_MAP.md) and either approves the map, requests changes, or explicitly approves Claude to begin Batch 1.

Blocked by:  
Next safe action:  
Sam continues Go-Live P0/P1 hardening. Marketing Run A remains parked until Sam explicitly reopens it after hardening.

Blocked by:  
Current feature freeze, dirty shared files, active P0/P1 hardening, uncommitted tree, or lack of explicit Sam Run A approval.

Code changed: no  
Tests changed: no  
Docs changed: yes

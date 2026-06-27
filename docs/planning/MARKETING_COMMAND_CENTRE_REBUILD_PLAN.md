# Marketing Command Centre Rebuild Plan

> **Migration file banner:** Do not create `111_*.sql` or `122_*.sql` **during hardening freeze**. Planned future file: `122_marketing_command_centre_mvp.sql` — re-check number when Run A reopens.

> **HARDENING FREEZE:** Marketing Command Centre rebuild is **planned, not cancelled**. **Run A parked** until post P0/P1 hardening. See [SAM-MKT-001](../qa/SAM_DECISION_LOG.md) · [MARKETING_RUN_A_FREEZE_PARKING_RESULT.md](./MARKETING_RUN_A_FREEZE_PARKING_RESULT.md).

**Plan ID:** MARKETING-COMMAND-CENTRE-REBUILD-01  
**Date:** 2026-06-22 (amended 2026-06-22)  
**Author:** Cursor (product architect / code auditor)  
**Status:** Direction accepted — **PARKED during hardening freeze** (Run A not approved)  
**Mode:** Planning only — **no product code, routes, migration, or Claude runs during freeze**

**Amendment note:** Advanced features (autonomous posting, GPS routes, paid ads, social API publishing, drone waypoints, pro video editor) are **future power features**, not rejected scope. MVP does not depend on them; architecture must not block them.

**Implementation gate:** Run A **parked** during Go-Live P0/P1 hardening ([SAM-MKT-001](../qa/SAM_DECISION_LOG.md)). No Claude implementation until Sam explicitly reopens after hardening checkpoints.

---

## 1. Executive summary

Blue Leaf Hub already has a **substantial marketing foundation**: AI content generation with brand review checks, a content library with status workflow, campaign scheduling with slots, a media vault with photo analysis and a multi-stage video/drone intelligence pipeline, manual publish logging, CRM mailing lists, and a marketing intelligence layer (GSC/GA4/GBP/Meta + lead attribution).

What it lacks is the **operating system layer** Josh needs: a weekly rhythm, a single home screen, practical non-jargon labels, a visible approval queue, campaign templates aligned to Blue Leaf positioning, and a calendar that answers “what’s due this week?” in under 30 minutes.

**Recommendation:** Rebuild around the existing backend and schema — do not greenfield. Preserve `marketingAgent.mjs`, `runReviewChecks`, `videoIntelligence.mjs`, campaign/slot tables, and publish tracking. Refactor the frontend information architecture, add a Command Centre + Weekly Planner shell, introduce a **content package** model (one topic → multi-channel drafts), seed seven campaign templates, and surface Josh-friendly approval labels on top of existing statuses.

**MVP target (Stage 1):** Josh completes one week of marketing (plan → generate → review → schedule → log publish) in **≤30 minutes**, with **manual publish only** and full transparency on why AI recommends each piece. Trust first; automation layers come later.

**Roadmap:** Six product stages (§2.1). Stage 1 MVP ships in ~8–12 weeks via implementation batches (§22). Stages 2–6 add power features without re-architecting — schema and nav reserve hooks from Batch 1 onward.

**First shippable slice:** Pre-MVP audit (security/schema alignment) + Batch 1 (Command Centre shell + forward-compatible foundations).

**Related UX plan:** [MARKETING_CONTENT_CREATOR_UX_REDESIGN.md](./MARKETING_CONTENT_CREATOR_UX_REDESIGN.md) — direction accepted, not build-approved.

**End-to-end map (authoritative for Claude handoff):** [MARKETING_END_TO_END_REBUILD_MAP.md](./MARKETING_END_TO_END_REBUILD_MAP.md) — **all implementation paused** until Sam approves handoff readiness.

**Run A / Run B handoff:** [MARKETING_RUN_A_B_HANDOFF_READINESS.md](./MARKETING_RUN_A_B_HANDOFF_READINESS.md) — **inactive during freeze**. **Parking:** [MARKETING_RUN_A_FREEZE_PARKING_RESULT.md](./MARKETING_RUN_A_FREEZE_PARKING_RESULT.md)

---

## 2. Product vision

The Blue Leaf **Marketing Command Centre** is a weekly marketing operating system — not an AI post generator.

| Principle | Meaning for Josh |
|---|---|
| **Assist, not automate** | AI drafts; Josh/Sam approve every external post until trust is earned |
| **Transparent** | Every recommendation shows source assets, target audience, campaign link, risk level, and *why* |
| **Controlled** | No black-box publishing; manual publish logging is the default path |
| **Fast weekly rhythm** | One screen answers: what’s due, what needs review, what’s missing a photo |
| **Drone as asset class** | Footage is tagged, scored, and suggested — not buried in a generic upload tab |
| **Learn over time** | Publish → measure → attribute leads → recommend next topics |

**Operating loop:**

```
Capture → Sort → Generate → Review → Schedule → Publish → Measure → Learn → Recommend
```

**Primary user:** Josh (day-to-day operator). **Approver:** Sam (high-value / sensitive content until policy relaxes). **Admin:** Sam (intelligence sync, brand rules, music library).

### 2.1 Product roadmap — Stages 1–6

Features are classified by **when Josh/Sam need them**, not whether they belong in the product. Stages 2–6 are **planned power features** — designed in now, built after Stage 1 trust is established.

#### Stage 1 — MVP / Josh adoption *(launch dependency)*

Josh can run weekly marketing in ≤30 minutes. No feature below is optional for Stage 1 launch.

| Feature | Notes |
|---|---|
| Command Centre | Weekly home — status at a glance |
| Weekly Planner | Plan the week from templates + media |
| Content package generation | One topic → multi-channel linked drafts (Batch 3b) |
| Content Creator (media-first) | Primary: create from media; secondary: create from idea (Batch 3a/3b) |
| Approval Queue | Josh labels, risk, source assets visible |
| Media upload | Photos + video to vault |
| Campaign templates | 7 seeded Blue Leaf templates |
| Calendar / status | Cross-campaign slot visibility |
| Content Library | Archive + search |
| Manual publish logging | Log what went out (no API auto-post) |
| Basic intelligence | Published count, simple dashboard |
| Lead attribution notes | Manual notes + existing touch fields |
| Drone/video upload + simple clip scoring | **If existing code supports it** — reuse `videoIntelligence`; no new editor |

**Stage 1 explicitly does not require:** auto-post, GPS, paid ads, social API publish, waypoints, timeline editor.

#### Stage 2 — Controlled automation *(trust earned)*

AI does more prep; humans still approve everything external.

| Feature | Notes |
|---|---|
| Auto-generate weekly content drafts | Planner suggests + generates package drafts |
| Auto-fill campaign calendar | Slots pre-populated from template + media inventory |
| Auto-recycle evergreen content | Resurface high-value library items |
| Auto-suggest content timing | Best day/channel from historical notes |
| AI campaign recommendations | “Run Trust the Process this month” |
| Stronger approval workflows | Multi-step, Sam gates, policy by template |

#### Stage 3 — Platform publishing automation *(power feature)*

Direct publish after approval locks — replaces manual copy-paste + log.

| Feature | Notes |
|---|---|
| Direct social posting | Instagram, Facebook, LinkedIn via API |
| Platform API integrations | OAuth tokens, rate limits, retries |
| Scheduled publishing | `scheduled_at` → platform publish |
| Failed-post monitoring | Alerts + retry queue |
| Platform-specific previews | IG crop, FB link card, etc. |
| Approval locks before publishing | Cannot schedule until `approved` + policy satisfied |

#### Stage 4 — Paid growth optimisation *(power feature)*

Connect organic content to paid performance and lead quality.

| Feature | Notes |
|---|---|
| Paid ad campaign recommendations | Budget + creative suggestions |
| Audience testing | A/B segments |
| Budget recommendations | From ROI signals |
| Lead quality attribution | Enquiry → qualified → proposal → signed |
| Campaign ROI tracking | Spend vs pipeline value |
| Demographic / target-market refinement | Audience profile iteration |

#### Stage 5 — Advanced Drone Studio *(power feature)*

Repeatable drone ops + transformation storytelling.

| Feature | Notes |
|---|---|
| Repeatable drone route notes | Shot plan library per project |
| Take-off point, altitude, direction/orbit | Structured capture metadata |
| Key angles + shot type | Match future flights to past |
| Progress comparison | Same angle over time |
| Before/during/after transformation reels | Linked asset sequences |
| GPS/waypoint integration | **Later within Stage 5** — not MVP |
| Matched-angle timelapse | **Later within Stage 5** — not MVP |

#### Stage 6 — Video Editing Studio *(power feature)*

In-app assembly beyond clip scoring — not a full Avid/DaVinci replacement, but enough for branded exports.

| Feature | Notes |
|---|---|
| Timeline editor | Multi-clip sequence |
| Trim / cut | In-browser |
| Captions | From story sequence + manual edit |
| Music sync | Music library integration |
| Brand intro/outro | `branding` bucket assets |
| Transitions | Template set |
| Multi-format exports | 9×16, 1×1, 16×9 |
| Final assembly workflow | Extends existing `FinalAssembly` |

### 2.2 Architecture principle — build foundations, not futures

| Rule | Application |
|---|---|
| **MVP stays simple** | Stage 1 UI shows only what Josh needs weekly |
| **Schema thinks ahead** | Nullable columns + jsonb extension points in Stage 1 migrations |
| **Nav reserves space** | Sitemap includes future areas (disabled or “coming soon”) where useful |
| **APIs version by capability** | e.g. `publish_mode: manual \| scheduled \| automated` from day one on publish rows |
| **No throwaway prototypes** | Content packages, media assets, publish log = long-lived spine |

---

## 3. Current-state inventory

### 3.1 Frontend

| File | Role today | Maturity |
|---|---|---|
| `src/pages/Marketing.jsx` | Tab router; header still “Content Studio / Marketing Agent” | Functional, wrong IA |
| `src/components/marketing/ContentGenerator.jsx` | AI generate (stream + save), pillars/channels, photo seed from media | **Keep as Legacy Studio** at `/marketing/studio/legacy` until Batch 3b |
| `src/components/marketing/ReviewPanel.jsx` | Shows review scores, blocked state | **Keep — extend for Josh labels** |
| `src/components/marketing/ContentLibrary.jsx` | List/filter content; status transitions; manual publish modal | **Keep — split approval queue** |
| `src/components/marketing/CampaignManager.jsx` | Campaign CRUD, slots, batch preload, auto-assign, publish mark | **Keep — refactor into planner/calendar** |
| `src/components/marketing/MediaUpload.jsx` | Photo/video upload, analysis polling, embeds video sub-flows | **Keep — split vault vs drone** |
| `src/components/marketing/VideoReview.jsx` | Clip scoring review, approve clips | **Keep — Drone Studio Stage 1** |
| `src/components/marketing/FinalAssembly.jsx` | Export assembly + status poll | **Keep — Stage 2 preview** |
| `src/components/marketing/BatchGenerator.jsx` | Multi-format batch from one topic | **Keep — merge into content package** |
| `src/components/marketing/MarketingIntelligence.jsx` | Dashboard, keywords, pages, attribution (admin tab) | **Keep — simplify for MVP** |
| `src/components/marketing/MusicLibrarySettings.jsx` | Admin music CRUD | **Keep — defer to Brand Rules area** |
| `src/components/crm/MailingLists.jsx` | Mailing list campaigns | **Keep — link from Command Centre** |

**Navigation today (`Marketing.jsx` tabs):** Create · Library · Campaigns · Media · Lists · Intelligence (admin) · Music Library (admin)

**Not built:** Command Centre, Weekly Planner, Approval Queue (dedicated), Calendar view, Drone Studio (named area), Brand Rules UI, Leads & Attribution tab (partially in Intelligence), content package entity.

### 3.2 Backend

| File | Role today | Lines (approx) |
|---|---|---|
| `server/lib/marketingRoutes.mjs` | Content CRUD, generate/stream, campaigns, slots, media upload/analyse/export, story-sequence, music (admin), assemble | ~1,491 |
| `server/lib/marketingAgent.mjs` | Pillars, `runReviewChecks`, parse response, photo analysis prompt | ~444 |
| `server/lib/marketingPrompts.mjs` | `BLUE_LEAF_IDENTITY`, mode prompts, JSON format | — |
| `server/lib/videoIntelligence.mjs` | Frame extraction, clip scoring (Haiku), story sequence (Sonnet) | ~618 |
| `server/lib/marketingMedia.mjs` | Media helpers, pipeline orchestration | — |
| `server/lib/marketingIntelligenceRoutes.mjs` | Publishes, dashboard, Meta/GSC/GA4/GBP sync, keywords, pages, attribution | ~1,700+ |
| `server/lib/crmRoutes.mjs` | Mailing lists, sends, unsubscribes | — |
| `server/lib/aiGateway.mjs` | Central AI calls + stream wrapper | — |
| `server/lib/brandingAssets.mjs` | Logo fetch from `branding` bucket (email/app) | — |

**Key API groups (marketing):**

- `POST /api/marketing/generate`, `/generate/stream`, `/generate/all-save`
- Content CRUD + status patch
- Campaigns + `campaign_schedule_slots` (assign, publish mark, preload batch)
- Media upload, analyse, clip scores, story-sequence, export, assemble
- `POST /api/marketing/publishes` — manual publish logging (also in intelligence routes)

### 3.3 Database (migrations)

| Migration | Adds / changes |
|---|---|
| **046** | `marketing_campaigns`, `marketing_content_items`, `marketing_media_assets`, `marketing_media_exports`, `marketing_music_library` |
| **047** | Storage RLS for `marketing-media` bucket |
| **049** | Campaign intelligence fields + `campaign_schedule_slots` |
| **050** | Campaign metrics columns |
| **051** | `video_clip_scores` (frame scoring, narrative_position, dimensions) |
| **052** | `story_sequence` jsonb on `marketing_media_exports` |
| **053** | `analysis_status` on media assets |
| **054** | Nullable `storage_path` (processing pipeline) |
| **061** | CRM: `mailing_lists`, members, sends, unsubscribes |
| **062** | Intelligence: `social_post_publishes`, snapshots, GSC/GA4/GBP, `attribution_events`, `enquiry_attribution`, lead first/last touch, content perf fields |

**Content status enum (DB):** `draft` · `in_review` · `approved` · `published` · `archived`  
**Slot status (049):** `empty` · `assigned` · `published` (plus campaign preload flow)

### 3.4 SOPs

| Folder | Files | Notes |
|---|---|---|
| `docs/sops/18_marketing_agent/` | 7 SOPs (overview, create, library, campaigns, media, music, video) | **18-01 outdated** — documents 5 tabs; TC-01/02/03 failed on role/tab drift |
| `docs/sops/19_marketing_intelligence/` | Intelligence module SOPs | Admin-heavy; needs Command Centre cross-links |
| `docs/sops/17_crm_mailing_list/` | Mailing list SOPs | Keep; surface from Marketing nav |

### 3.5 Security & access (current — corrected 2026-06-22)

| Layer | Behaviour |
|---|---|
| **Frontend gate** | `can.accessMarketing` → **admin only** (`src/lib/roles.js`) |
| **Marketing API** | **Admin-gated** — `dev-api.mjs` blanket middleware: `app.use("/api/marketing", requireAuth, requireRole("admin"))` |
| **Intelligence API** | **Admin-gated** — same blanket on `/api/intelligence` |
| **Per-route guards** | `marketingRoutes.mjs` uses `requireAuth` on handlers — **redundant** under blanket gate |
| **Public attribution** | `/api/public/attribution` — no auth (by design) |

**Status:** API **matches** UI today (admin-only via blanket gate in `dev-api.mjs`). **During freeze:** Run A security workstream **superseded by QA-001** — no auth middleware edits; future Run A cites `npm run test:qa-sec-baseline` only. **Do not** bulk-add per-route guards during freeze or default Run A scope.

**Historical note:** SOP 18-01 recorded supervisor seeing admin tabs (TC-02 fail). Current `roles.js` restricts Marketing to admin in UI.

### 3.6 AI & review (current)

- **Model:** `claude-sonnet-4-5` (agent), Haiku/Sonnet in video pipeline
- **`runReviewChecks`:** APB hard block, banned phrases, overpromise, specificity, local relevance, educational value, lead quality composite, identity/hook/authority scores, invented-spec warnings
- **`ReviewPanel`:** Score bars + pass/fail — good transparency base, but labels are technical (“Specificity 7/10”) not Josh-facing (“Good lead quality topic”)
- **BatchGenerator:** Multi-channel from one topic — proto “content package” but not persisted as a bundle

### 3.7 Video / drone (current)

- DJI D-Log detection in upload pipeline
- Scene-change frame extraction → Supabase storage
- Clip scoring (5 dimensions + narrative position)
- Story sequence generation with captions/overlays
- Final assembly + export status polling
- **UX gap:** All nested under Media tab; no “Drone Studio” or timelapse/transformation workflow labels

---

## 4. What to keep

| Asset | Rationale |
|---|---|
| `marketing_content_items` + status workflow | Maps cleanly to approval queue with UI label overlay |
| `marketing_campaigns` + `campaign_schedule_slots` | Weekly planner and calendar backbone |
| `runReviewChecks` + `ReviewPanel` | Core “not black-box” trust mechanism — extend, don’t replace |
| `marketingPrompts.mjs` + `BLUE_LEAF_IDENTITY` | Brand voice already codified |
| `ContentGenerator` streaming + save flow | **Legacy Studio** at `/marketing/studio/legacy` until Batch 3b; proven create path preserved |
| `videoIntelligence.mjs` full pipeline | Drone Stage 1–2 foundation |
| `marketing_media_assets` + analysis fields | Media vault + drone tagging |
| `social_post_publishes` + manual publish UI in ContentLibrary | MVP “log what we posted” |
| `BatchGenerator` logic | Becomes content package generator |
| `CampaignManager` slot assign + publish mark | Calendar/planner actions |
| `MarketingIntelligence` dashboard (trimmed) | MVP basic intelligence |
| `MailingLists` + CRM routes | Keep; link from Command Centre |
| `brandingAssets.mjs` | Brand Rules can reference same bucket |
| Music library tables + admin UI | Defer nav placement, keep code |

---

## 5. What to rebuild

| Area | Current | Target |
|---|---|---|
| **Information architecture** | “Content Studio” tabs | Command Centre-first nav (see §8) |
| **Weekly rhythm** | None | Weekly Planner = primary workflow |
| **Approval UX** | Buried in Library filters | Dedicated Approval Queue with Josh labels |
| **Campaign creation** | Blank campaign form | 7 seeded templates + wizard |
| **Calendar** | Slots inside campaign detail | Cross-campaign week calendar |
| **Content package** | BatchGenerator ephemeral | Persisted package: 1 topic → N channel items linked (Batch 3b) |
| **Content Studio / Creator** | Prompt-first Create tab | Media-first `ContentCreator.jsx`; idea-first secondary; legacy at `/marketing/studio/legacy` |
| **Media area** | Monolithic MediaUpload | Media Vault (photos/videos) + Drone Studio sub-area |
| **Status language** | draft/in_review/approved | Josh labels mapped on top (see §7) |
| **API fetch pattern** | `authFetch` in marketing components | Migrate to `apiFetch.js` during touch |
| **Role model** | Admin-only UI, loose API | Explicit marketing operator role + route guards |
| **SOPs 18-xx** | Tab count / role tests failing | Rewrite after IA lands |

---

## 6. Future power features (not MVP — not discarded)

These are **in the product roadmap** (Stages 2–6). Stage 1 MVP does not depend on them; architecture must allow them without migration pain.

| Power feature | Roadmap stage | Stage 1 foundation that enables it |
|---|---|---|
| Fully autonomous posting | Stage 3 | `social_post_publishes` + approval/status spine; `publish_mode` column |
| GPS / waypoint route automation | Stage 5 (later) | Media asset capture metadata + optional `drone_shot_plans` table (nullable FK) |
| Paid ad optimisation | Stage 4 | Campaign goal, audience profile, attribution joins to leads/jobs |
| Complex external social API publishing | Stage 3 | Platform enum, `platform_post_id`, scheduled/failed status fields |
| Advanced drone waypoint integration | Stage 5 (later) | Route notes, take-off, altitude, orbit on assets / shot plans |
| Full professional video editor | Stage 6 | `marketing_media_exports`, clip scores, story_sequence jsonb |
| Auto-generate weekly drafts | Stage 2 | Weekly Planner + packages + templates |
| Auto-fill calendar / evergreen recycle | Stage 2 | `campaign_schedule_slots` + evergreen score on content |
| Timeline editor + multi-format export | Stage 6 | Export format column, assembly workflow stub in nav |

**Also planned post–Stage 1 (not rejected):** SEO content brief automation at scale; LinkedIn as full publish channel (copy-only in Stage 1 template 6).

---

## 7. Josh adoption strategy

### 7.1 Design rules

1. **Default view = Command Centre**, not Create tab
2. **Every AI output shows:** source photo/video, campaign name, target audience, risk badge, plain-English “why this”
3. **One-click approve / send back** — no multi-step mystery flows
4. **Weekly Planner shows ≤5 actions** — not an empty canvas
5. **Empty states teach the loop** — “Upload site photos → Generate week → Review queue → Schedule → Log publish”
6. **Manual publish in Stage 1** — scheduling = “planned for Tuesday”; Josh posts externally then logs. Stage 3 adds optional API publish after approval locks.
7. **Sam approval gate** — configurable per label or campaign template (see §15)

### 7.2 Practical labels (UI layer)

Map to existing DB statuses; store Josh labels in `review_scores.josh_labels[]` or new `operational_labels text[]` on content items.

| Josh label | Typical DB status | Meaning |
|---|---|---|
| **Ready for Josh review** | `in_review` | AI draft complete; waiting on Josh |
| **Needs photo** | `draft` | Copy exists but no `media_source_id` |
| **Safe to post** | `approved` | Passed review checks; Josh satisfied |
| **Needs Sam approval** | `in_review` | High-value, client-visible, or risk flag |
| **High value evergreen** | `approved` + tag | Reusable library piece |
| **Good lead quality topic** | any + review score | `lead_quality.score ≥ 7` |

Avoid: “draft”, “in_review”, “pillar”, “mode”, “narrative_position” in primary UI.

### 7.3 Trust ladder

| Phase | Policy |
|---|---|
| **Weeks 1–4** | Sam approves anything client-facing or with client/project name |
| **Weeks 5–8** | Josh approves “Safe to post”; Sam only for flagged items |
| **Week 9+** | Stage 2 automation (draft/calendar suggestions); Stage 3 platform publish only after explicit Sam/Josh opt-in |

---

## 8. Future sitemap

```
Marketing
├── Command Centre          ← home / weekly snapshot
├── Weekly Planner          ← plan this week (primary workflow)
├── Campaigns               ← list + templates
├── Content Studio          ← generate (current Create tab)
├── Approval Queue          ← filtered review list
├── Calendar                ← cross-campaign schedule
├── Media Vault
│   ├── Photos
│   ├── Videos
│   ├── Drone Studio
│   └── Timelapse / Transformation
├── Content Library         ← archive + evergreen
├── Intelligence            ← dashboard + sync (admin sections)
├── Leads & Attribution     ← lead quality feedback
├── Mailing Lists           ← CRM bridge
├── Brand Rules             ← voice, banned phrases, music (admin)
│
│  — Stages 2–6 (nav stubs or admin-gated when ready) —
├── Automation Hub          ← Stage 2: draft/calendar/evergreen automation
├── Publishing              ← Stage 3: API publish + schedule + failures
├── Paid Growth             ← Stage 4: ads, ROI, audience refinement
└── Video Studio            ← Stage 6: timeline editor (Drone Studio = Stage 5)
```

**Stage 1 nav (live):** Command Centre · Weekly Planner · Content Studio · Approval Queue · Calendar · Media Vault · Content Library · Campaigns · Intelligence (basic) · Mailing Lists

**Reserved routes (disabled / “coming soon” in Stage 1):** `/marketing/automation`, `/marketing/publishing`, `/marketing/paid`, `/marketing/video-studio` — prevents IA rework in Stages 2–6.

**Route proposal:**

| Path | Screen |
|---|---|
| `/marketing` | Command Centre |
| `/marketing/planner` | Weekly Planner |
| `/marketing/studio` | Content Creator shell (Batch 1 placeholder → Batch 3a full Creator) |
| `/marketing/studio/legacy` | Legacy Studio — prompt-first `ContentGenerator` (temporary) |
| `/marketing/queue` | Approval Queue |
| `/marketing/calendar` | Calendar |
| `/marketing/campaigns` | Campaigns |
| `/marketing/media` | Media Vault |
| `/marketing/media/drone` | Drone Studio |
| `/marketing/library` | Content Library |
| `/marketing/intelligence` | Intelligence |
| `/marketing/leads` | Leads & Attribution |
| `/marketing/lists` | Mailing Lists |
| `/marketing/brand` | Brand Rules (admin) |

Legacy redirects: `/marketing/create` → `/marketing/studio`; old Create tab → `/marketing/studio/legacy` during transition; other tab URLs preserved 1 sprint.

**Run A routing restructure (future — not during freeze):** Current `App.jsx` only has `/marketing/:tab`. Nested routes required for `/marketing/studio/legacy`. Old tab URLs redirect 1 sprint.

**Asset seeding (future — not during freeze):** Query params `?asset_id=` — not parent `seedAsset` state. MediaUpload → “Open in Content Studio”. DB column `analysis`.

---

## 9. MVP workflow

**Goal:** Josh completes one marketing week in **≤30 minutes**.

### 9.1 Weekly session script (~30 min)

| Step | Time | Screen | Action |
|---|---|---|---|
| 1. Open week | 2 min | Command Centre | See “This week: 3 slots filled, 2 need review, 1 needs photo” |
| 2. Confirm plan | 5 min | Weekly Planner | Accept/adjust AI-suggested topics from template + available media |
| 3. Generate packages | 8 min | Content Studio | Run 2–3 content packages (IG + FB from same topic); AI uses tagged photos |
| 4. Review queue | 10 min | Approval Queue | Josh reviews with scores + labels; marks Safe to post or Needs Sam |
| 5. Schedule | 3 min | Calendar | Assign approved items to slot dates |
| 6. Publish log | 2 min | Calendar / Library | After posting manually, log platform + link |

### 9.2 MVP acceptance criteria

- [ ] Command Centre loads week status without visiting 4 tabs
- [ ] Weekly Planner can start from a campaign template
- [ ] Content package creates ≥2 linked channel items from one topic
- [ ] Approval Queue shows only items needing action
- [ ] No content reaches `approved` without explicit button click
- [ ] Calendar shows slot status for active campaigns
- [ ] Manual publish creates `social_post_publishes` row
- [ ] Intelligence shows ≥1 metric (published count or lead attribution note)
- [ ] Drone footage uploadable, tagged by project/stage/date; clip scores visible if pipeline completes (Stage 1 minimum; Stage 5 expands)

---

## 10. Campaign model

### 10.1 Existing schema (keep)

`marketing_campaigns`: name, objective, channels[], start_at, end_at, status, tags, created_by  
Plus 049 intelligence fields: audience, tone, content_mix, ai_rules, duration_weeks, etc.  
`campaign_schedule_slots`: campaign_id, slot_date, channel, content_type, content_item_id, status

### 10.2 Additions (planned)

| Field / table | Purpose |
|---|---|
| `template_key text` on `marketing_campaigns` | Links to seeded template |
| `marketing_campaign_templates` (new) | Name, description, default mix, default channels, sample topics, ai_rules preset |
| `weekly_target_posts int` on campaigns | Planner default (e.g. 3) |

**Use existing 049 fields** on campaigns when instantiated from template: `audience`, `content_mix`, `ai_rules`, **`approval_mode`** (`auto_low_risk` · `manual_high_risk` · `manual_all`). Do **not** add `approval_policy` column.

### 10.3 First seven templates (seed data)

| # | Template key | Name | Objective | Default channels |
|---|---|---|---|---|
| 1 | `better_built_renovations` | Better Built Renovations | educate + generate_enquiries | IG, FB, website |
| 2 | `trust_the_process` | Trust the Process | educate | IG, FB, email |
| 3 | `high_performance_homes` | High Performance Homes | build_authority | IG, website |
| 4 | `craftsmanship_in_detail` | Craftsmanship in Detail | showcase | IG, FB |
| 5 | `project_transformation` | Project Transformation | showcase + generate_enquiries | IG, FB, drone |
| 6 | `architect_partner` | Architect Partner Content | build_authority | IG, LinkedIn*, website |
| 7 | `behind_the_build` | Behind the Build | brand_awareness | IG, FB |

\*LinkedIn channel = copy-only in MVP; no API publish.

Each template includes: 4-week slot skeleton, content mix weights, 5 starter topic prompts, and **`approval_mode`** default (049 values).

---

## 11. Content package model

**Problem:** Today `BatchGenerator` creates multiple channel drafts in memory; they aren’t linked as one “package”.

### 11.1 Proposed entity

**Table:** `marketing_content_packages`

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| campaign_id | uuid | FK optional |
| package_date | date | Week slot anchor |
| topic | text | Shared topic |
| pillar | text | Shared pillar |
| client_stage | text | Optional |
| media_source_id | uuid | Shared photo/video |
| source_asset_ids | uuid[] | Multiple media |
| generation_context | text | Josh’s notes |
| review_summary | jsonb | Aggregated scores |
| status | text | `draft` · `in_review` · `approved` · `published` · `archived` |
| created_by | uuid | |

**Alter:** `marketing_content_items.package_id uuid REFERENCES marketing_content_packages(id)`

### 11.2 Package workflow

1. Josh picks topic + media in Weekly Planner or Content Studio  
2. “Generate package” → creates package row + N content items (IG, FB, …)  
3. Approval Queue groups by package — one review surface, expand per channel  
4. Approve package → all child items → `approved` (or per-channel override)

### 11.3 API (planned)

- `POST /api/marketing/packages/generate` — body: topic, channels[], media, campaign_id  
- `GET /api/marketing/packages?week=YYYY-MM-DD`  
- `PATCH /api/marketing/packages/:id/approve` — cascades or selective

**Reuse:** `POST /api/marketing/generate/all-save` logic as inner loop.

---

## 12. Media vault model

### 12.1 Existing (keep)

`marketing_media_assets`: media_type, project_id, job_id, **`analysis_status`**, **`analysis`** jsonb, **`capture_date`**, **`stage_detected`**, consent fields (046/053)

### 12.2 Vault IA

| Sub-area | Filter | Actions |
|---|---|---|
| **Photos** | media_type = photo | Upload, analyse, “Use in post” |
| **Videos** | media_type = video | Upload, basic metadata |
| **Drone Studio** | drone_video, timelapse | Analyse, clip review, story builder |
| **Timelapse / Transformation** | tag + project stage | Before/during/after grouping (UI filter on tags) |

### 12.3 Capture metadata (Stage 1 required + Stage 5 ready)

Stage 1 collects a **minimal subset** in UI; schema stores the **full spine** nullable so Stage 5/6 need no breaking migration.

| Field | Stage 1 UI | Storage | Stage 5+ use |
|---|---|---|---|
| Project | Required picker | `project_id`, `job_id` FK | Shot plans, progress comparison |
| Shoot date | Required | **`capture_date`** (046) | Timelapse matching |
| Stage | Required dropdown | **`stage_detected`** (046) | Transformation reels |
| Source device | Auto-detect + override | `capture_source` (`drone`/`phone`/`camera`/`unknown`) | Filter vault |
| Route notes | Optional text | `route_notes text` | Repeatable flights |
| Take-off point | Hidden | `takeoff_point jsonb` `{lat,lng,label}` | GPS later |
| Altitude | Hidden | `altitude_m numeric` | Waypoint plans |
| Direction / orbit | Hidden | `flight_pattern text`, `orbit_type text` | Matched-angle timelapse |
| Shot type | Optional | `shot_type text` | Story builder |
| Safety / privacy notes | Optional | `safety_notes text`, `privacy_notes text` | Client/consent |
| Before/during/after link | Optional | `sequence_group_id uuid`, `sequence_position int` | Progress comparison |
| Linked campaign | Optional | `campaign_id uuid` | Planner context |
| Linked content package | Optional | via content items → `package_id` | Package media |
| Export format | On export only | `marketing_media_exports.format` (`9x16`/`1x1`/`16x9`) | Stage 6 editor |
| Reuse / evergreen score | Computed | `evergreen_score numeric`, `reuse_count int` | Stage 2 auto-recycle |

**Implementation:** Stage 1 migration adds nullable columns; UI shows project, shoot date, stage, source, shot type, safety notes. Advanced fields appear in Drone Studio as Stage 5 ships.

### 12.4 Tagging convention (Stage 1)

Structured tags (not free-form only):

- `project:{project_id}` or job address slug  
- `stage:before|during|after|handover`  
- `capture:drone|ground|timelapse`  
- `quality:hero|usable|archive`

### 12.5 Gaps to close (Stage 1)

| Gap | Fix |
|---|---|
| No vault landing with counts | Command Centre “12 new photos this week” |
| Timelapse not first-class | `media_type` already supports; add UI filter + template link |
| Consent / client visibility | Verify consent columns from portal migrations; surface in vault |

---

## 13. Drone studio model

### 13.1 Stage mapping

| Product stage | Drone / video capability | Codebase reuse |
|---|---|---|
| **Stage 1 (MVP)** | Vault upload, tag, detect drone, extract frames, score clips, suggest uses | `MediaUpload`, `videoIntelligence`, `VideoReview` |
| **Stage 5** | Route notes, take-off, altitude, orbit, progress comparison, transformation reels, GPS/waypoint (later), matched-angle timelapse (later) | New `drone_shot_plans` + sequence groups on assets |
| **Stage 6** | Timeline editor, trim, captions, music, intro/outro, multi-format export | Extends `FinalAssembly`, `generateStorySequence`, music library |

Stage 1 uses existing clip scoring only — **no** shot-plan UI, GPS, or timeline editor.

### 13.2 Stage 1 Drone Studio screens (minimal)

1. **Footage list** — drone/timelapse only, grouped by project  
2. **Analysis panel** — frame count, top clips by score, suggested post types  
3. **Clip review** — existing VideoReview UX, renamed labels  
4. **Suggest uses** — “Good for Project Transformation template”, “Needs Sam approval if client address visible”

### 13.3 Stage 5 schema (`drone_shot_plans` — create empty in Stage 1 migration, populate in Stage 5)

| Column | Purpose |
|---|---|
| id, project_id, job_id | Project spine |
| name, repeat_frequency | “Monthly progress orbit” |
| takeoff_point jsonb | Lat/lng/label — GPS integration later |
| altitude_m, flight_pattern, orbit_type | Repeatable capture |
| key_angles jsonb | Shot list |
| route_notes, safety_notes, privacy_notes, neighbour_exclusion jsonb | Ops + compliance |
| linked_campaign_id | Campaign context |
| waypoint_route jsonb | **Stage 5 later** — DJI/Litchi import stub |
| created_by, created_at | Audit |

Assets link via `shot_plan_id uuid` (nullable FK) when captured from a plan.

### 13.4 Stage 5+ capabilities (power features)

- Before/during/after transformation reels via `sequence_group_id`
- Progress comparison UI (same `shot_type` + `flight_pattern` over time)
- GPS/waypoint integration when ops-ready — fills `waypoint_route`, not a new table
- Matched-angle timelapse — pairs assets by shot plan + sequence position

---

## 14. Intelligence and lead feedback loop

### 14.1 Existing

- `social_post_publishes` + snapshots  
- `attribution_events`, `enquiry_attribution`  
- Lead first/last touch on `leads` (062)  
- `GET /api/intelligence/dashboard`, `/attribution-summary`, `/attribution/:leadId`  
- Manual publish from ContentLibrary → `POST /api/marketing/publishes`

### 14.2 MVP “basic intelligence”

| Widget | Source | Josh value |
|---|---|---|
| Published this month | count publishes | Momentum visibility |
| Top post (reach) | snapshots if Meta synced | What worked |
| Leads with marketing touch | attribution summary | “Was marketing worth it?” |
| Lead quality note | manual + `performance_notes` on content | Close the loop |

### 14.3 Lead attribution notes (MVP)

- On lead detail (Sales) or Marketing → Leads & Attribution: show first/last touch UTM/content  
- Allow Josh to add `performance_notes` when logging publish  
- **No new ML** — rules + manual notes first

### 14.4 Stage 2+ intelligence

- Strategy suggestions endpoint already exists (`/api/intelligence/strategy-suggestions`) — Stage 2: surface in Command Centre “Recommended next topics”
- Stage 4: funnel metrics (qualified rate, proposal rate, signed contract rate) from leads/jobs joins

---

## 15. Brand / approval guardrails

### 15.1 Existing guardrails (keep)

- `runReviewChecks`: APB block, banned phrases, overpromise, invented specs warning  
- Campaign `ai_rules` jsonb in CampaignManager  
- `BLUE_LEAF_IDENTITY` in prompts

### 15.2 Planned guardrails

| Guardrail | Implementation |
|---|---|
| Sam approval required | Label “Needs Sam approval” when: client name detected, `approval_mode = manual_all` or high risk, or risk = high |
| No publish without approval | API rejects `status → published` unless current status is `approved` |
| Source asset required for IG/FB | Warn “Needs photo” if channel social and no media_source_id |
| Evergreen flag | Tag + filter in Content Library |
| Brand Rules admin page | Read-only view of banned phrases + APB patterns from `marketingAgent.mjs`; music mood guide |

### 15.3 Risk levels (UI)

| Level | Trigger | Display |
|---|---|---|
| **Low** | All checks pass, no client name | Green “Safe to post” candidate |
| **Medium** | Generic language or weak local score | Amber “Review carefully” |
| **High** | APB block, overpromise, client name, invented specs | Red “Needs Sam approval” |

---

## 16. Security and permissions plan

### 16.1 Role decision required

| Option | Pros | Cons |
|---|---|---|
| **A. Josh = admin** | Matches current blanket gate | Josh has full Hub admin |
| **B. New `marketing` role** | Least privilege | Requires **dev-api.mjs chokepoint** change + RLS |
| **C. Extend `staff` with marketing flag** | Flexible | More complex |

**Recommendation:** Option A for Stage 1 MVP; Option B long-term via blanket middleware change.

### 16.2 Route hardening (Run A — when reopened; superseded by QA-001 during freeze)

| Route group | Current guard | During freeze | When Run A reopens |
|---|---|---|---|
| `/api/marketing/*` | Blanket admin in dev-api.mjs | **No changes** — QA-001 scope | Cite `test:qa-sec-baseline` pass only |
| `/api/intelligence/*` | Blanket admin | **No changes** | Same |
| `dev-api.mjs` middleware | Admin chokepoint | **Do not edit** | Marketing role = future explicit batch |

### 16.3 RLS

Current policies: any authenticated user. **Align RLS with role** when marketing role lands, or document “API-only via service role” if all access is server-mediated.

### 16.4 Audit

- Log `reviewed_by`, `approved_at` on content items (exists)  
- Add `approved_by` on package approve  
- Publish log already has `published_by`

---

## 17. Schema / data model plan

**Design rule:** Stage 1 migration (`122_marketing_command_centre_mvp.sql`) — **planned only; not authorised during freeze**. Re-check migration number before creating file when Run A reopens.

### 17.1 New tables

| Table | Stage 1 | Purpose |
|---|---|---|
| `marketing_campaign_templates` | Create + seed 7 rows | Template picker |
| `marketing_content_packages` | Create | Multi-channel bundle spine |
| `marketing_weekly_plans` | Optional | `week_start`, `campaign_id`, notes, `target_count` |
| `drone_shot_plans` | Create **empty stub** | Stage 5 shot plans — no UI until Stage 5 |
| `marketing_paid_campaigns` | Create **empty stub** | Stage 4 paid growth — links to organic campaigns |
| `marketing_publish_jobs` | Create **empty stub** | Stage 3 scheduled/automated publish queue |

### 17.2 Content & approval spine (Stage 1 active)

| Table | Column | Stage 1 | Later stage |
|---|---|---|---|
| `marketing_content_items` | `package_id` | ✓ | — |
| | `operational_labels text[]` | ✓ | Stage 2 automation tags |
| | `risk_level` | ✓ | — |
| | `approval_required_from` | ✓ | Stage 2 workflows |
| | `approved_by`, `approved_at` | **Exist (046)** — do not re-add | Stage 3 publish lock |
| | `published_at` | **Exist (062)** — do not re-add | — |
| `marketing_campaigns` | `template_key`, `weekly_target_posts` | ✓ add | — |
| | `audience`, `content_mix`, `ai_rules`, `approval_mode` | **Exist (049)** — copy from template | — |
| | `audience_profile jsonb` | Column, null | Stage 4 |
| | `campaign_goal`, `budget_cents` | Column, null | Stage 4 |

### 17.3 Media / drone spine (§12.3 — Stage 1 partial UI)

Add to `marketing_media_assets` (**IF NOT EXISTS** — skip existing `capture_date`, `stage_detected`, `analysis`, `analysis_status`):

`capture_source`, `route_notes`, `takeoff_point jsonb`, `altitude_m`, `flight_pattern`, `orbit_type`, `shot_type`, `safety_notes`, `privacy_notes`, `sequence_group_id`, `sequence_position`, `campaign_id`, `shot_plan_id`, `suggested_uses jsonb`, `evergreen_score`, `reuse_count`

**Do not add:** `stage_tag` (use `stage_detected`), `photo_analysis` (use `analysis`), `captured_at` (use `capture_date`), `pipeline_status` (use `analysis_status`).

Add to `marketing_media_exports`:

`format` (`9x16`|`1x1`|`16x9`), `assembly_status`, `editor_project jsonb` (null until Stage 6)

### 17.4 Publishing automation spine (Stage 1 manual; Stage 3 automated)

Extend `social_post_publishes` (062) — do not replace; add columns:

| Column | Stage 1 | Stage 3+ |
|---|---|---|
| `approval_status` | Mirrors content item at publish time | Publish lock audit |
| `approved_by`, `approved_at` | ✓ (exist on publishes / content) | Required before API publish |
| `scheduled_at` | Null (calendar slot date elsewhere) | Platform schedule time |
| `published_at` | ✓ (exists 062) | — |
| `platform_post_id` | ✓ (exists) | API response ID |
| `publish_status` | `logged` (manual) | `pending` · `published` · `failed` · `deleted` |
| `failed_reason` | Null | API error text |
| `publish_mode` | `manual` | `manual` · `scheduled` · `automated` |
| `rollback_status` | Null | `none` · `deleted_on_platform` · `unavailable` |
| `content_item_id`, `campaign_id`, `media_asset_id` | ✓ (exist) | — |

**Stage 1 behaviour:** `publish_mode = manual`, `publish_status = logged`. Josh logs after external post. Stage 3 `marketing_publish_jobs` references same row and drives API calls.

**Slot link:** `campaign_schedule_slots.scheduled_at` (add column) mirrors intended publish time before Stage 3 executes it.

### 17.5 Paid growth spine (Stage 4 — columns/tables stubbed in Stage 1)

**`marketing_paid_campaigns`** (stub table):

| Column | Purpose |
|---|---|
| `organic_campaign_id` | FK to `marketing_campaigns` |
| `audience_profile jsonb` | Demographics, interests, geo |
| `campaign_goal` | awareness · leads · conversions |
| `budget_cents`, `spend_cents` | Budget tracking |
| `platform` | meta · google · etc. |
| `status` | draft · active · paused · complete |

**Attribution / funnel metrics** — read from existing Hub spines, not duplicated:

| Signal | Source | Stage |
|---|---|---|
| Lead quality | `leads` + qualifying fields | Stage 1 notes; Stage 4 dashboards |
| Enquiry source | `leads.source`, `attribution_events` | Stage 1 |
| Qualified lead rate | leads stage = qualify+ | Stage 4 |
| Proposal rate | leads → fee_proposal | Stage 4 |
| Signed contract rate | leads → won / jobs | Stage 4 |
| Project value | `jobs` / fee proposals | Stage 4 |
| Future profitability signal | `project_metrics` / cost intelligence | Stage 4+ |

**`marketing_campaigns.metrics_snapshot jsonb`** — optional cache for ROI widgets; computed from joins, not canonical facts.

### 17.6 Migrations naming

| Migration | Stage | Contents |
|---|---|---|
| `122_marketing_command_centre_mvp.sql` | Stage 1 Run A | Templates, packages stub, labels, media cols, publish extensions, weekly_plans, **stub tables** |
| Later numbered migrations | Stages 2–6 | Automation, publish jobs active, paid, drone, video editor |

### 17.7 No duplicate facts

Campaign dates and project links stay on existing FKs (`project_id`, `job_id`). Do not copy job address into marketing tables — read via join. Funnel rates are **generated metrics** from leads/jobs — never stored as editable fields on content items.

---

## 18. API / backend plan

### 18.1 New endpoints (Stage 1)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/marketing/command-centre` | Aggregated week snapshot |
| GET | `/api/marketing/planner?week=` | Slots + gaps + suggestions |
| GET/POST | `/api/marketing/packages/*` | Content packages |
| GET | `/api/marketing/queue` | Items in_review + labels |
| GET | `/api/marketing/calendar?from=&to=` | Cross-campaign slots |
| GET | `/api/marketing/templates` | Campaign templates |
| POST | `/api/marketing/campaigns/from-template` | Instantiate template |

### 18.1b Reserved endpoints (Stages 2–6 — route stubs return `{ ok: true, available: false }` or 501)

| Stage | Path pattern | Purpose |
|---|---|---|
| 2 | `/api/marketing/automation/*` | Weekly draft gen, calendar fill, evergreen recycle |
| 3 | `/api/marketing/publish/schedule`, `/publish/execute`, `/publish/jobs` | Platform API publish |
| 4 | `/api/marketing/paid/*` | Paid campaigns, ROI, audience |
| 5 | `/api/marketing/drone/shot-plans/*` | Shot plans, progress comparison |
| 6 | `/api/marketing/video/editor/*` | Timeline projects, export render |

Register stub routes in Batch 1 aggregator to avoid URL collisions later.

### 18.2 Refactor (non-breaking)

- Extract from `marketingRoutes.mjs`:
  - `marketingContentRoutes.mjs`
  - `marketingCampaignRoutes.mjs`
  - `marketingMediaRoutes.mjs`
  - `marketingPackageRoutes.mjs`
- Keep single `registerMarketingRoutes` aggregator

### 18.3 Enhance existing

- `runReviewChecks` → return `risk_level`, `josh_labels[]`, `reasons[]` plain English  
- `GET /api/marketing/content` → support `package_id`, `operational_labels` filters  
- Package generate wraps existing generate + all-save

---

## 19. Frontend component plan

### 19.1 New components

| Component | Purpose |
|---|---|
| `MarketingCommandCentre.jsx` | Home dashboard |
| `ContentCreatorShell.jsx` | Batch 1 placeholder at `/marketing/studio` (Sam-approved copy) |
| `ContentCreator.jsx` | Batch 3a/3b media-first Creator (replaces shell) |
| `WeeklyPlanner.jsx` | Week workflow |
| `ApprovalQueue.jsx` | Filtered review list (extract from ContentLibrary) |
| `MarketingCalendar.jsx` | Cross-campaign calendar |
| `CampaignTemplatePicker.jsx` | Template wizard |
| `MediaVault.jsx` | Shell with sub-routes |
| `DroneStudio.jsx` | Wrapper for video sub-flow |
| `JoshLabelBadge.jsx` | Label chips |
| `RiskBadge.jsx` | Low/medium/high |
| `WhyThisPanel.jsx` | Plain-English AI rationale |
| `ReviewSummary.jsx` | Josh-first review; wraps ReviewPanel scores under details |
| `BrandRules.jsx` | Admin read-only rules |
| `LeadsAttribution.jsx` | Simplified intelligence slice |

**Legacy (temporary):** `ContentGenerator.jsx` at `/marketing/studio/legacy` until Batch 3b makes Creator default.

**Removed as primary deliverable:** `ContentPackageGenerator.jsx` — superseded by `ContentCreator.jsx`

**Stage 2–6 placeholders (route shell only in Stage 1):** `AutomationHub.jsx`, `PublishingConsole.jsx`, `PaidGrowthDashboard.jsx`, `VideoStudio.jsx`, `DroneShotPlanEditor.jsx`

### 19.2 Refactor

| Component | Change |
|---|---|
| `Marketing.jsx` | Route-based layout; `/marketing/studio` + `/marketing/studio/legacy` |
| `ContentGenerator.jsx` | No feature changes in Batch 1 — route to legacy only |
| `ContentLibrary.jsx` | Archive focus; remove queue duplication |
| `CampaignManager.jsx` | Split: template instantiate vs slot detail |
| `MediaUpload.jsx` | Split vault vs drone routes |
| `ReviewPanel.jsx` | Add WhyThisPanel + Josh labels |

### 19.3 Standards compliance (during implementation)

- Replace `authFetch` with `apiFetch` / `apiPost` / `apiPatch`  
- Status enums from `constants.js` (add `MARKETING_CONTENT_STATUSES`, `JOSH_LABELS`)  
- `ok`/`err` responses only

---

## 20. Testing plan

No automated test suite today — manual + troubleshoot agent SOPs.

### 20.1 SOP Section 14 test cases (minimum)

| ID | Scenario |
|---|---|
| TC-01 | Command Centre loads week summary |
| TC-02 | Weekly Planner creates plan from template |
| TC-03 | Content package generates 2+ linked items |
| TC-04 | Approval Queue shows Ready for Josh review only |
| TC-05 | Cannot publish without approved status |
| TC-06 | Manual publish log creates publish row |
| TC-07 | Drone upload → analysis → clip scores visible |
| TC-08 | Non-admin blocked from marketing API (after Stage 0) |
| TC-09 | Sam approval label blocks Josh approve (policy) |
| TC-10 | 30-minute weekly script walkthrough |

### 20.2 Regression

- Existing content items remain visible after migration  
- Campaign slots still assign/publish mark  
- Video export pipeline still completes

### 20.3 Playwright (optional Batch 3+)

- Smoke: navigate Command Centre → Planner → Queue  
- Not required for Batch 1

---

## 21. Implementation stages

Two layers: **product roadmap stages** (§2.1 — what Josh gets) and **engineering batches** (§22 — how we build). Engineering pre-work (audit/security) precedes Stage 1.

| Product stage | Engineering focus | Outcome |
|---|---|---|
| **Pre-work** | Audit, security confirmation, schema 122 design | Blanket gate documented; forward-compatible migration drafted |
| **Stage 1** | Batches 1–5 | Josh weekly OS — MVP launch |
| **Stage 2** | Automation batch | AI drafts, calendar fill, evergreen recycle, stronger approvals |
| **Stage 3** | Publishing batch | API post, schedule, failures, previews, approval locks |
| **Stage 4** | Paid growth batch | ROI, audience, funnel attribution dashboards |
| **Stage 5** | Drone advanced batch | Shot plans, progress comparison, transformation reels, GPS later |
| **Stage 6** | Video studio batch | Timeline editor, exports, assembly workflow |

Stage 1 must **not** wait on Stages 2–6. Stub tables, nullable columns, and reserved routes land in Batch 1–2.

---

## 22. Implementation batches (Stage 1 MVP)

> **Implementation status (2026-06-22):** **All batches paused.** Direction accepted; build not approved. See [End-to-End Rebuild Map](./MARKETING_END_TO_END_REBUILD_MAP.md) §13 and **§20 grouped build runs** before any implementation.

### Grouped build runs (evaluation)

Stage 1 may be executed as **up to five Claude runs** (safer) or **two Sam-facing groups** with checkpoints — see [End-to-End Map §20](./MARKETING_END_TO_END_REBUILD_MAP.md#20-grouped-build-runs-evaluation-stage-1-mvp).

| Group | Batches | One Claude run? |
|---|---|---|
| Foundation + spine | 1 + 2 + 3a | **3a separate** — 122 + angle spec + routing per Sam decision |
| Full Stage 1 completion | 3b + 4 + 5 + 6 + 7 | **No** — use sub-groups 3b+4, 5+6, 7 |

All batches deliver **Stage 1** only. Batches 1–2 must include forward-compatible hooks (§17, §18.1b).

### Batch 1 — Command Centre shell + Creator placeholder + architecture hooks

**Goal:** Safe foundation + Josh sees Command Centre + media-first Creator direction protected; legacy generator preserved.

| Area | Scope |
|---|---|
| Docs | API security **confirmation** audit; nested routing plan; query-param asset seeding spec |
| Security | **Parked** — QA-001 / `test:qa-sec-baseline` during freeze; **do not** edit `dev-api.mjs` or bulk-add route guards |
| Migration | **Parked** — `122_*.sql` not authorised during freeze |
| Backend | `GET /api/marketing/command-centre`; register **reserved route stubs** for Stages 2–6 |
| **Routing** | Nested restructure required — `/marketing/studio/legacy` is two segments; see UX plan §4.0 |
| Frontend | `MarketingCommandCentre.jsx`, `ContentCreatorShell.jsx`; update `Marketing.jsx` + `App.jsx` nested routes |
| Nav | Command Centre CTA → `/marketing/studio` (not legacy); shell links to Legacy Studio |
| Preserve | Generate/save/stream via legacy route; MediaUpload → `?asset_id=` deep link |
| SOP | Update 18-01 overview draft |

**Out of scope:** Angle cards, analysis extensions, package generate, Approval Queue, Batch 3 Creator logic (Run B)

**Acceptance criteria:**

1. `/marketing/studio` does **not** open prompt-first form directly
2. `/marketing/studio` shows media-first Creator direction (Sam placeholder copy)
3. `/marketing/studio/legacy` opens current `ContentGenerator`
4. Generate/save still works via legacy route
5. Command Centre links to `/marketing/studio`, not legacy
6. Legacy route labelled temporary in UI
7. No Batch 3 Creator logic in Batch 1
8. `GET /api/marketing/command-centre` returns week snapshot
9. Reserved route stubs registered (Stages 2–6)
10. MediaUpload → `?asset_id=` → Legacy Studio pre-fills from `analysis`
11. Nested routing: `/marketing/studio/legacy` resolves

**Done when:** Josh opens Marketing → Command Centre; opens Content Studio → sees media-first placeholder; Legacy Studio still generates and saves.

---

### Batch 2 — Weekly Planner + template seeds + migration 122 (included in Run A)

**Goal:** Start a week from a template in ≤5 minutes.

| Area | Scope |
|---|---|
| Migration | `122_marketing_command_centre_mvp.sql` — templates, packages stub, media + publish spine cols, stub tables, weekly_plans; **IF NOT EXISTS** throughout |
| Backend | `GET /api/marketing/templates`, `POST /api/marketing/campaigns/from-template`, `GET /api/marketing/planner?week=` |
| Frontend | `WeeklyPlanner.jsx`, `CampaignTemplatePicker.jsx`; Command Centre CTA “Plan this week” |
| **Planner CTA** | Empty slot action: **“Create from media”** → `/marketing/studio?campaign_id=&week_start=` (shell reads params; Creator uses in 3a) |
| Data | Insert 7 templates with slot skeletons (4 weeks default) |

**Out of scope:** Content package generation

**Done when:** Josh selects “Trust the Process”, gets campaign + empty slots; slot CTA opens Creator shell with context.

---

### Batch 3a — Media-first Creator proof

**Goal:** Prove media-first workflow — not Legacy Studio.

| Area | Scope |
|---|---|
| Frontend | `ContentCreator.jsx` — three-column layout; media picker; angle cards; audience/campaign/platform rec |
| Backend | Extended photo `analyse` response with `suggested_angles[]`; angle-driven generate |
| Generate | 1–2 platform drafts (e.g. IG + FB) |
| Review | `ReviewSummary.jsx` — Josh labels, risk, why; scores under “See quality details” |
| Save | Library or queue stub |
| **Secondary path** | “Create from idea” entry — no media required to draft; **Needs photo** nudge before approve |

**Out of scope:** `marketing_content_packages` entity, full multi-platform package, Approval Queue grouping

**Done when:** Josh selects site photo → picks angle → gets labelled drafts → saves without Legacy Studio.

---

### Batch 3b — Full package Creator + Approval Queue

**Goal:** Production content package workflow.

| Area | Scope |
|---|---|
| Migration | `marketing_content_packages`, `package_id`, `operational_labels`, `risk_level`, `angle_payload`, `generation_metadata` |
| Backend | `POST /api/marketing/packages/generate`, approve/list; `GET /api/marketing/queue`; extend `runReviewChecks` labels |
| Frontend | Full multi-platform package in `ContentCreator.jsx`; `ApprovalQueue.jsx`; per-platform edit/regenerate; Sam gates |
| Legacy | `/marketing/studio` becomes full Creator; legacy route remains until Josh confidence built |

**Out of scope:** Calendar (Batch 4)

**Done when:** Josh generates IG+FB package, reviews in queue, marks Safe to post.

---

### Batch 4 — Calendar + manual publish polish

**Goal:** See the week; log what went out.

| Area | Scope |
|---|---|
| Backend | `GET /api/marketing/calendar?from=&to=`; extend publish log with `publish_mode`, `publish_status`, `approved_by` |
| Frontend | `MarketingCalendar.jsx`; slot drag or date assign from queue; polish publish modal (platform, link, notes) |
| Integration | Command Centre shows calendar strip |

**Out of scope:** Drone studio split

**Done when:** Josh schedules 3 posts on calendar and logs 1 publish.

---

### Batch 5 — Media Vault + Drone Studio V1

**Goal:** Drone footage is a first-class asset path.

| Area | Scope |
|---|---|
| Frontend | `MediaVault.jsx`, `DroneStudio.jsx`; routes `/marketing/media`, `/marketing/media/drone`; tag by project/stage/date UI |
| Backend | `suggested_uses` on analyse complete; filter endpoints by media_type; capture metadata fields (§12.3 subset) |
| Migration | Media capture columns if not in 122; `suggested_uses`, `evergreen_score` defaults |
| Reuse | VideoReview, FinalAssembly under Drone Studio nav (Stage 6 expands FinalAssembly) |

**Out of scope:** Shot plan UI (Stage 5), timeline editor (Stage 6), story-builder exports beyond clip review

**Done when:** Josh uploads drone clip, sees frames/scores/suggested template link.

---

## 23. Risks and decisions required from Sam/Josh

### 23.1 Decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | **Josh’s Hub role** | Admin vs new marketing role | Admin for MVP if acceptable |
| D2 | **Sam approval policy** | All client posts vs flagged only | Flagged only (client name, high risk) |
| D3 | **MVP channel priority** | IG+FB only vs include email/website | IG+FB primary; website copy secondary |
| D4 | **Weekly post target** | 2 / 3 / 5 per week | 3 — fits 30-min session |
| D5 | **Drone MVP scope** | Vault+tags only vs include clip review | Include clip review (code exists) |
| D6 | **LinkedIn** | Include in templates vs omit | Copy in template 6; no publish log requirement MVP |
| D7 | **Intelligence sync** | Sam runs Meta/GSC sync vs skip MVP | Skip sync MVP; manual publish count sufficient |
| D8 | **Brand Rules editing** | Read-only vs editable in UI | Read-only MVP; edit in code |
| D9 | **Legacy URL compatibility** | Redirect old tabs 1 sprint vs break | Redirect |
| D10 | **Platform priority** | Mobile vs desktop-first | Desktop-first; Josh likely at desk |
| D11 | **Stage 3 auto-post opt-in** | When to enable API publish | After 4+ weeks consistent Stage 1 use |
| D12 | **Stub tables in 122** | Land empty tables in Stage 1 vs later | **Land in Run A (122)** |
| D13 | **Studio routing** | Shell vs legacy vs direct generator | **Approved:** `/marketing/studio` = shell; `/marketing/studio/legacy` = ContentGenerator |
| D14 | **Content Creator UX** | Prompt-first vs media-first | **Approved in principle** — see UX redesign doc; idea-first secondary path |

### 23.2 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| `marketingRoutes.mjs` monolith | Hard to extend safely | Split in Batch 1–3; reserved route namespaces |
| API accessible without admin role | Data leak / accidental edits | Pre-work route audit |
| Josh abandons if too many tabs | Low adoption | Command Centre + Planner only entry points |
| AI trust deficit | Won’t approve content | WhyThisPanel + labels; Stage 1 manual publish only |
| Video pipeline slow on Railway | Frustration on drone upload | Show progress; cap frame count (already capped) |
| CampaignManager complexity | Refactor breaks slots | Keep slot API stable; new UI wraps |
| SOP drift | Failed TCs repeat | Update SOPs in Batch 1 |
| Premature auto-post | Trust loss | Stage 3 gated by opt-in; Stage 1 `publish_mode=manual` only |
| Schema rework for Stages 5–6 | Delayed power features | 122 full spine per §17; stub tables in Run A |
| Legacy routing breaks seed flow | Media → Create broken | Batch 1: test MediaUpload `onGeneratePost` → legacy or shell with asset param |
| Prompt-first remains default | Wrong UX locked in | Batch 1 acceptance criteria §22 — studio must not open legacy form |

### 23.3 Major reuse opportunities

1. **`runReviewChecks` + ReviewPanel** — transparency layer ready; add plain English  
2. **`campaign_schedule_slots`** — weekly planner without new scheduling engine  
3. **`videoIntelligence.mjs`** — Drone Stage 1–2 largely built  
4. **BatchGenerator** — content package UX prototype  
5. **`social_post_publishes`** — manual publish + future metrics  
6. **062 intelligence tables** — attribution when ready  
7. **CampaignManager preload/batch** — template week generation

---

## Appendix A — Current vs target tab mapping

| Current tab | Target |
|---|---|
| Create | Content Creator shell `/marketing/studio`; legacy `/marketing/studio/legacy` |
| Library | Content Library + Approval Queue split |
| Campaigns | Campaigns + template picker |
| Media | Media Vault + Drone Studio |
| Lists | Mailing Lists (unchanged) |
| Intelligence | Intelligence + Leads & Attribution split |
| Music Library | Brand Rules (subsection) |
| *(none)* | Command Centre, Weekly Planner, Calendar |

---

## Appendix B — Files touched in future implementation (reference)

**Preserve / extend:** listed in §4  
**Rebuild / split:** listed in §5  
**New:** listed in §19.1  
**Do not touch in planning phase:** all product code (this document only)

---

Next safe action:  
Sam continues Go-Live P0/P1 hardening. Marketing Run A remains parked until Sam explicitly reopens it after hardening.

Blocked by:  
Current feature freeze, dirty shared files, active P0/P1 hardening, uncommitted tree, or lack of explicit Sam Run A approval.

Code changed: no  
Tests changed: no  
Docs changed: yes

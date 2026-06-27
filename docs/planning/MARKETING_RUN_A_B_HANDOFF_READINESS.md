# Marketing Run A / Run B — Claude Handoff Readiness

**Plan ID:** MARKETING-RUN-A-B-HANDOFF-READINESS-01  
**Date:** 2026-06-22  
**Author:** Cursor (implementation planner / Claude handoff writer)  
**Status:** **PARKED** — Run A not approved during Go-Live P0/P1 hardening freeze (see [freeze parking result](./MARKETING_RUN_A_FREEZE_PARKING_RESULT.md), [SAM-MKT-001](../qa/SAM_DECISION_LOG.md))  
**Mode:** Planning/docs only — **no product code, no live migration, no implementation during freeze**

> **HARDENING FREEZE — read first:**  
> Marketing Command Centre rebuild is **planned, not cancelled**. **Run A is parked** until post P0/P1 hardening.  
> **Not approved during freeze:** Claude Run A · product code · route changes · migration 122 · `dev-api.mjs` auth middleware edits · marketing UI rebuild · commits/deploys.  
> **Security:** `/api/marketing` and `/api/intelligence` are already admin-gated via blanket middleware in `dev-api.mjs`. Run A security workstream is **superseded by QA-001 / hardening baseline** — future Run A should cite `npm run test:qa-sec-baseline` only; do not bulk-edit marketing route guards.  
> **Migration:** Do not create `111_*.sql` or `122_marketing_command_centre_mvp.sql`. Re-check highest migration number when Run A is later authorised.  
> **Future Run A (when reopened):** nested routing for `/marketing/studio/legacy` · `?asset_id=` seeding — **not to be implemented during freeze**.

**Source of truth:**

- [MARKETING_END_TO_END_REBUILD_MAP.md](./MARKETING_END_TO_END_REBUILD_MAP.md)
- [MARKETING_COMMAND_CENTRE_REBUILD_PLAN.md](./MARKETING_COMMAND_CENTRE_REBUILD_PLAN.md)
- [MARKETING_CONTENT_CREATOR_UX_REDESIGN.md](./MARKETING_CONTENT_CREATOR_UX_REDESIGN.md)

**Sam decision (2026-06-22):** Accept grouped-run assessment. **Do not** use two large Claude runs. Approved execution: **Runs A → B → C → D → E**. **Batch 3a remains separate** from Run A.

> **Migration file banner (read first):**  
> **Do not create `111_*.sql` — `111_workforce_rls_lockdown.sql` already exists.**  
> The marketing Command Centre MVP migration is referred to below as the **marketing MVP migration**.  
> **Live file (future only — not authorised during freeze):** `122_marketing_command_centre_mvp.sql` — re-check next available number when Run A reopens.  
> All `ADD COLUMN` statements must use `IF NOT EXISTS`. Do not duplicate columns that already exist in 046/049/062/053.

---

## 1. Final Run A scope (Batch 1 + Batch 2 only)

### 1.1 Exact inclusions

| Area | Inclusion |
|---|---|
| **Routing restructure** | **Required in Run A** — current `App.jsx` only has `/marketing` and `/marketing/:tab` (single segment). `/marketing/studio/legacy` is **two segments** and will **not** match `:tab`. Run A must add nested routes (`/marketing/*` wildcard in `App.jsx` **or** nested `<Routes>` inside `Marketing.jsx`). This is a deliberate routing restructure, not a config tweak. |
| **Routing targets** | `/marketing` → Command Centre; `/marketing/studio` → Creator shell; `/marketing/studio/legacy` → `ContentGenerator`; preserve `/marketing/library`, `/marketing/media`, `/marketing/campaigns`, `/marketing/lists`, etc. |
| **Legacy redirects** | Old tab URLs (`/marketing/create`, `/marketing/media`, …) redirect for **one sprint** |
| **Asset seeding** | Replace parent-state `seedAsset` / `handleGeneratePost` / `goTab("create")` with **query-param deep links**: `/marketing/studio/legacy?asset_id=<uuid>` and `/marketing/studio?asset_id=<uuid>`. MediaUpload “Generate post from this photo” → **“Open in Content Studio”** navigates with `asset_id`. Legacy Studio reads `asset_id`, fetches asset, rehydrates seed (same pattern Run B inherits). |
| **Command Centre** | `MarketingCommandCentre.jsx` — week snapshot counts |
| **Creator shell** | `ContentCreatorShell.jsx` — Sam-approved placeholder copy + “Open Legacy Studio” |
| **Legacy Studio** | Unchanged `ContentGenerator.jsx` logic at legacy route; generate/stream/save intact; **must** support `?asset_id=` rehydration |
| **API** | `GET /api/marketing/command-centre`; reserved route stubs (automation/publishing/paid/video → 501 or `{ available: false }`) |
| **Security** | **Superseded by QA-001** during freeze — blanket admin gate already in `dev-api.mjs`; future Run A cites `npm run test:qa-sec-baseline` only; **do not** bulk-add route guards or edit auth middleware during freeze |
| **Marketing MVP migration** | **Parked** — `122_*.sql` plan only; **not authorised during freeze** |
| **Weekly Planner** | `WeeklyPlanner.jsx`, `CampaignTemplatePicker.jsx` |
| **Templates API** | `GET /api/marketing/templates`, `POST /api/marketing/campaigns/from-template`, `GET /api/marketing/planner?week=` |
| **Template seed** | 7 campaign templates (rebuild plan §10.3 / map Appendix B) |
| **Planner CTA** | “Create from media” → `/marketing/studio?campaign_id=&week_start=` (shell reads params; no Creator logic) |
| **Nav** | `AppShell.jsx` / `Marketing.jsx` — Command Centre first; studio not legacy |
| **SOP** | Update `docs/sops/18_marketing_agent/18-01_content_studio_overview.md` draft |
| **Docs** | `docs/planning/MARKETING_API_SECURITY_AUDIT_RUN_A.md` (Claude creates during Run A) |

### 1.2 Exact exclusions

- `ContentCreator.jsx` full workflow (Run B)
- Angle cards, extended analyse, `suggested_angles[]` (Run B)
- `POST /api/marketing/packages/*` (Run C)
- Approval Queue, Calendar (Run C)
- Media Vault split, Drone Studio (Run D)
- Intelligence / Leads tabs (Run E)
- Auto-post, paid ads, GPS, video editor
- W17 / W18 product code
- Retiring Legacy Studio
- `authFetch` in **new** page components (use `apiFetch.js`)

### 1.3 Files likely touched

| Layer | Files |
|---|---|
| **Frontend** | `src/pages/Marketing.jsx`, `src/App.jsx`, `src/components/AppShell.jsx`, `src/components/marketing/MarketingCommandCentre.jsx` (new), `src/components/marketing/ContentCreatorShell.jsx` (new), `src/components/marketing/WeeklyPlanner.jsx` (new), `src/components/marketing/CampaignTemplatePicker.jsx` (new), `src/components/marketing/CampaignManager.jsx` (minimal — template instantiate hook only if needed) |
| **Backend** | `server/dev-api.mjs`, `server/lib/marketingRoutes.mjs` (split start), `server/lib/marketingCommandRoutes.mjs` (new), `server/lib/marketingCampaignRoutes.mjs` (new) |
| **Schema** | `supabase/migrations/122_marketing_command_centre_mvp.sql` (**created in Run A only after Sam approves this handoff doc**) |
| **Docs** | `docs/planning/MARKETING_API_SECURITY_AUDIT_RUN_A.md`, `docs/sops/18_marketing_agent/18-01_*` |
| **Tests** | `e2e/tests/marketing/run-a-smoke.spec.js` (proposed) |

**Do not modify:** `ContentGenerator.jsx` logic (route only); W17/W18 paths.

### 1.4 Routes affected

**Current repo (pre–Run A):** `App.jsx` registers `/marketing` and `/marketing/:tab` only — single `:tab` segment.

| Route | Change |
|---|---|
| `/marketing` | **New default:** Command Centre (was Create tab) |
| `/marketing/studio` | Creator shell placeholder — **requires nested routing** |
| `/marketing/studio/legacy` | Legacy ContentGenerator — **two segments; must add explicit route** |
| `/marketing/planner` | Weekly Planner (new) |
| `/marketing/create` | Redirect → `/marketing/studio` |
| Old tab URLs | Redirect 1 sprint (`/marketing/media` → new path, etc.) |

**Run A routing implementation (choose one):**

1. **`App.jsx` nested paths:** e.g. `/marketing/*` → `MarketingLayout` with child routes for `studio/legacy`, `studio`, `planner`, `media`, …  
2. **`Marketing.jsx` internal `<Routes>`:** parent route `/marketing/*` in App; Marketing owns sub-routes.

Either way: test `/marketing/studio/legacy?asset_id=<uuid>` resolves and seeds Legacy Studio.

### 1.4b Asset seeding (Run A — required)

**Current behaviour (breaks after routing move):**

```43:48:src/pages/Marketing.jsx
  function handleGeneratePost(asset) {
    flushSync(() => setSeedAsset(asset));
    goTab("create");
  }
```

`ContentGenerator` receives `seedAsset` prop from parent state — lost when generator moves off the tab shell.

**Standardised mechanism (Run A + Run B):**

| Source | Navigation target |
|---|---|
| MediaUpload photo detail | `/marketing/studio/legacy?asset_id=<uuid>` (Run A) → `/marketing/studio?asset_id=<uuid>` (Run B) |
| Weekly Planner “Create from media” | `/marketing/studio?campaign_id=&week_start=&asset_id=` |
| Command Centre CTA | `/marketing/studio?campaign_id=&week_start=` |

Legacy Studio / Creator: read `asset_id` from URL → `GET /api/marketing/media/:id` → rehydrate analysis (`analysis` jsonb column, **not** `photo_analysis`).

MediaUpload button label: **“Open in Content Studio”** (replaces “Generate post from this photo”).

### 1.5 APIs affected

| Method | Path | Action |
|---|---|---|
| GET | `/api/marketing/command-centre` | **New** |
| GET | `/api/marketing/planner` | **New** |
| GET | `/api/marketing/templates` | **New** |
| POST | `/api/marketing/campaigns/from-template` | **New** |
| * | `/api/marketing/automation/*` | **Stub** 501 |
| * | `/api/marketing/publish/*` | **Stub** 501 |
| * | `/api/marketing/paid/*` | **Stub** 501 |
| * | `/api/marketing/video/editor/*` | **Stub** 501 |
| * | Existing generate/content/campaigns/media | **Guard** audit only; no behaviour change except role guards |

### 1.6 Docs / SOPs affected

- `18-01_content_studio_overview.md` — new nav, Command Centre, shell vs legacy
- `18-05_create_manage_campaigns.md` — template picker cross-link (light touch)
- Security audit doc (new)

### 1.7 Run A done criteria

All 9 Batch 1 acceptance criteria (rebuild plan §22) **plus**:

- [ ] Nested marketing routing works; `/marketing/studio/legacy` resolves (two-segment path)
- [ ] MediaUpload → `?asset_id=` → Legacy Studio pre-fills topic/pillar from `analysis`
- [ ] 7 templates seeded; planner creates campaign + slots
- [ ] “Create from media” CTA passes `campaign_id` + `week_start` to studio shell
- [ ] Marketing MVP migration (`122_*.sql`) applied in target env without error
- [ ] Security audit confirms blanket admin gate on `/api/marketing` + `/api/intelligence`
- [ ] `npm run lint` + `npm run build` pass
- [ ] Legacy generate + save regression pass

---

## 2. Final Run B scope (Batch 3a only)

### 2.1 Exact inclusions

| Area | Inclusion |
|---|---|
| **ContentCreator** | Replace shell at `/marketing/studio` with `ContentCreator.jsx` three-column workflow |
| **Media** | Select/upload one asset; vault picker modal; project filter |
| **Analysis** | Extended `POST .../media/:id/analyse` response with `suggested_angles[]` |
| **Angles** | `AngleCards.jsx` — plain-English selection; no auto-select |
| **Targeting** | `AudienceChips`, `CampaignRecommendation`, `PlatformSelector` (IG + FB default) |
| **Generate** | 1–2 platform drafts via existing `/generate` or `/generate/stream` with angle context |
| **Review** | `ReviewSummary.jsx` — Josh labels first; scores under “See quality details” |
| **Idea-first** | Secondary entry “Create from idea”; `ANGLE_GENERATION` without vision; **Needs photo** nudge |
| **Save** | Save drafts to `marketing_content_items` (library); optional `generation_metadata` jsonb on items |
| **Query params** | Honour `campaign_id`, `week_start`, `asset_id` from planner/vault deep links (same seeding as Run A) |
| **Media analysis** | Read/write DB column `analysis` (jsonb); API request body may use `photo_analysis` — do not rename DB column |
| **Legacy** | `/marketing/studio/legacy` unchanged |

### 2.2 Exact exclusions

- `marketing_content_packages` table active workflow (Run C)
- Approval Queue UI (Run C)
- Multi-platform package orchestration (Run C)
- Calendar assign (Run C)
- Carousel multi-photo (`analyse-set`) — post Run B
- Video story-type angles in UI — schema ready; UI optional stub message
- Retiring Legacy Studio
- Package-level approve cascade

### 2.3 Files likely touched

| Layer | Files |
|---|---|
| **Frontend** | `ContentCreator.jsx`, `ContentCreatorShell.jsx` (retire or redirect), `MediaColumn.jsx`, `DecisionColumn.jsx`, `PackageColumn.jsx` (partial — 1–2 drafts), `MediaPickerModal.jsx`, `AngleCards.jsx`, `AudienceChips.jsx`, `CampaignRecommendation.jsx`, `PlatformSelector.jsx`, `ReviewSummary.jsx`, `JoshLabelBadge.jsx`, `WhyThisPanel.jsx`, `ReviewPanel.jsx` (wrap) |
| **Backend** | `server/lib/marketingAgent.mjs`, `server/lib/marketingPrompts.mjs`, `server/lib/marketingAnalysis.mjs` (new), `marketingRoutes.mjs` or `marketingMediaRoutes.mjs`, `marketingContentRoutes.mjs` |
| **Schema** | Optional: activate `generation_metadata` on content items if not in marketing MVP migration; **no new migration required if 122 landed in Run A** |
| **Constants** | `src/lib/constants.js` — `JOSH_LABELS`, audience enums |

### 2.4 Routes affected

| Route | Change |
|---|---|
| `/marketing/studio` | Shell → full Creator (3a) |
| `/marketing/studio/legacy` | No change |

### 2.5 APIs affected

| Method | Path | Action |
|---|---|---|
| POST | `/api/marketing/media/:id/analyse` | **Extend response** — backward compatible |
| POST | `/api/marketing/angles/generate` | **New** (idea-first) — optional dedicated endpoint |
| POST | `/api/marketing/generate` | **Enrich body** — `selected_angle`, `audience[]` |
| POST | `/api/marketing/generate/stream` | Same enrichment |
| GET | `/api/marketing/media` | Filter params for picker (project, week) |

### 2.6 AI / prompt changes

| Change | File |
|---|---|
| Extend photo analysis output | `PHOTO_ANALYSIS_USER_PROMPT` / post-process |
| New `ANGLE_GENERATION` prompt | `marketingPrompts.mjs` or `marketingAnalysis.mjs` |
| Generate prompt enrichment | `enrichUserRequest()` — pass angle title, why, audiences |
| `runReviewChecks` → Josh labels | `marketingAgent.mjs` — map to `operational_labels` in review_scores |
| Video story types | Schema only in Run B; full UI Run D/C |

### 2.7 Run B done criteria

- [ ] Josh: site photo → analyse → pick angle → IG+FB drafts with labels/why → save
- [ ] Idea-first: topic → angles → draft → **Needs photo** without media
- [ ] Planner deep link pre-fills campaign
- [ ] Legacy Studio still works
- [ ] No package entity required
- [ ] lint + build pass

- [ ] MediaUpload → `/marketing/studio?asset_id=` seeds Creator (Run B)
- [ ] Asset seeding via `?asset_id=` works on legacy route too

---

## 3. Marketing MVP migration — precise SQL plan (`122_marketing_command_centre_mvp.sql`)

**This is a planning specification only.** No live migration file during the hardening freeze. Claude must **not** create `111_*.sql` or `122_*.sql` until Sam explicitly reopens Run A after P0/P1 hardening.

> **Do not create `111_*.sql` — `111_workforce_rls_lockdown.sql` already exists.**  
> **Live file:** `122_marketing_command_centre_mvp.sql` (unless Sam assigns otherwise).  
> **`112_document_templates.sql` also exists** — do not use 112 for weekly planner; include `marketing_weekly_plans` in 122 if needed.

### 3.0 Idempotency rules

- Every `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS`
- Every `ADD COLUMN` → `ADD COLUMN IF NOT EXISTS`
- Every `CREATE INDEX` → `CREATE INDEX IF NOT EXISTS`
- Seed inserts → `ON CONFLICT (template_key) DO NOTHING` or equivalent
- **No DROP** in Run A migration

### 3.0b Columns that already exist — DO NOT ADD

| Table | Existing columns (046/049/062/053) | Action |
|---|---|---|
| `marketing_content_items` | `reviewed_by`, `approved_at` (046); `published_at`, `published_url` (062) | **Skip** — do not re-add |
| `marketing_campaigns` | `audience`, `content_mix`, `ai_rules`, `approval_mode` (049) | **Skip** — map template defaults to these names |
| `marketing_media_assets` | `capture_date`, `stage_detected`, `analysis`, `analysis_status` (046/053) | **Skip** — use these names; do not add `captured_at`, `stage_tag`, `photo_analysis`, `pipeline_status` |
| `social_post_publishes` | `published_at`, `published_by` (062) | **Skip** |

**Naming rules:**

- Campaign approval: use existing **`approval_mode`** (`auto_low_risk` · `manual_high_risk` · `manual_all` from 049). Do **not** add `approval_policy` unless Sam explicitly approves a rename migration.
- Media stage: use existing **`stage_detected`**. Do **not** add `stage_tag`.
- Media analysis: DB column **`analysis`** (jsonb). API generate body may pass `photo_analysis` — that is request-shape only.
- Video pipeline status: use existing **`analysis_status`** (`pending` · `processing` · `complete` · `error`).

### 3.1 Tables

#### `marketing_campaign_templates` (ACTIVE — seed 7 rows)

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| template_key | text | NO | — | UNIQUE |
| name | text | NO | — | Display name |
| description | text | YES | — | |
| objective | text | YES | — | Maps to campaign `goal` on instantiate |
| default_channels | text[] | NO | `'{}'` | |
| default_audience | text[] | NO | `'{}'` | |
| content_mix | jsonb | NO | `'{}'` | Same shape as 049 `content_mix` |
| ai_rules | jsonb | NO | `'{}'` | Same shape as 049 `ai_rules` |
| approval_mode | text | NO | `'manual_high_risk'` | **049 CHECK values** — maps “Sam flagged only” concept |
| weekly_target_posts | int | NO | 3 | |
| sample_topics | text[] | NO | `'{}'` | |
| slot_skeleton | jsonb | NO | `'{}'` | 4-week slot pattern |
| created_at | timestamptz | NO | now() | |

**Indexes:** UNIQUE on `template_key`

**RLS:** Same as campaigns — authenticated policy until marketing role

#### `marketing_content_packages` (STUB — empty until Run C)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| campaign_id | uuid | YES | — |
| package_date | date | YES | — |
| topic | text | YES | — |
| pillar | text | YES | — |
| angle_payload | jsonb | YES | `'{}'` |
| source_asset_ids | uuid[] | YES | `'{}'` |
| audience | text[] | YES | `'{}'` |
| status | text | NO | `'draft'` |
| review_summary | jsonb | YES | `'{}'` |
| created_by | uuid | YES | — |
| created_at | timestamptz | NO | now() |

**No UI writes in Run A/B.**

#### `marketing_weekly_plans` (OPTIONAL ACTIVE — include in 122)

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| week_start | date | NO | — |
| campaign_id | uuid | YES | — |
| notes | text | YES | — |
| target_count | int | YES | 3 |
| created_by | uuid | YES | — |
| created_at | timestamptz | NO | now() |

**Index:** `(week_start, campaign_id)`

#### Stub tables (CREATE IF NOT EXISTS — empty, no UI until later stages)

- `drone_shot_plans` — columns per map §13.3; no inserts Run A/B
- `marketing_paid_campaigns` — stub per rebuild plan §17.5
- `marketing_publish_jobs` — stub per rebuild plan §17.4

### 3.2 Column additions (ALTER — all IF NOT EXISTS)

#### `marketing_campaigns`

| Column | Type | Nullable | Default | Active | Notes |
|---|---|---|---|---|---|
| template_key | text | YES | — | Run A | **Add** |
| weekly_target_posts | int | YES | 3 | Run A | **Add** — `audience`, `content_mix`, `ai_rules`, `approval_mode` **already exist (049)** |

#### `marketing_content_items`

| Column | Type | Nullable | Default | Active | Notes |
|---|---|---|---|---|---|
| package_id | uuid | YES | — | Stub FK; Run C | **Add** |
| operational_labels | text[] | YES | `'{}'` | Run B | **Add** |
| risk_level | text | YES | — | Run B | **Add** |
| approval_required_from | text | YES | — | Run B | **Add** |
| generation_metadata | jsonb | YES | `'{}'` | Run B | **Add** |
| scheduled_at | timestamptz | YES | — | Run C | **Add** |
| evergreen_score | numeric | YES | 0 | Run D | **Add** |
| reviewed_by, approved_at, published_at | — | — | — | — | **EXIST — do not add** |

#### `marketing_media_assets`

| Column | Type | Nullable | Default | Active | Notes |
|---|---|---|---|---|---|
| capture_source | text | YES | — | Run D UI; col Run A | **Add** |
| route_notes | text | YES | — | Stage 5 | **Add** |
| takeoff_point | jsonb | YES | — | Stage 5 | **Add** |
| altitude_m | numeric | YES | — | Stage 5 | **Add** |
| flight_pattern | text | YES | — | Stage 5 | **Add** |
| orbit_type | text | YES | — | Stage 5 | **Add** |
| shot_type | text | YES | — | Run D | **Add** |
| safety_notes | text | YES | — | Run D | **Add** |
| privacy_notes | text | YES | — | Run D | **Add** |
| sequence_group_id | uuid | YES | — | Stage 5 | **Add** |
| sequence_position | int | YES | — | Stage 5 | **Add** |
| suggested_uses | jsonb | YES | — | Run B analyse | **Add** |
| evergreen_score | numeric | YES | 0 | Run D | **Add** |
| campaign_id | uuid | YES | — | Run A optional | **Add** |
| capture_date, stage_detected, analysis, analysis_status | — | — | — | — | **EXIST — do not add** |

#### `social_post_publishes`

| Column | Type | Nullable | Default | Active | Notes |
|---|---|---|---|---|---|
| publish_mode | text | YES | `'manual'` | Run C | **Add** |
| publish_status | text | YES | `'logged'` | Run C | **Add** |
| failed_reason | text | YES | — | Stage 3 | **Add** |
| rollback_status | text | YES | — | Stage 3 | **Add** |
| scheduled_at | timestamptz | YES | — | Run C | **Add** |
| approval_status | text | YES | — | Run C | **Add** |
| published_at, published_by | — | — | — | — | **EXIST (062) — do not add** |

### 3.3 Seed data (Run A)

Insert 7 rows into `marketing_campaign_templates` (idempotent):

1. `better_built_renovations`
2. `trust_the_process`
3. `high_performance_homes`
4. `craftsmanship_in_detail`
5. `project_transformation`
6. `architect_partner`
7. `behind_the_build`

Each row: objective/goal, default_channels, content_mix, ai_rules, **approval_mode**, 5 sample_topics, 4-week slot_skeleton jsonb.

### 3.4 Rollback / forward-only

| Scenario | Action |
|---|---|
| Run A fails before 122 | No migration; git revert |
| 122 applied, Run A UI reverted | **Keep 122** — columns nullable, harmless |
| Run B fails | Revert Creator UI; keep 122; studio → shell component |
| After Run B live | **Forward-only** on 122 — do not drop columns |

### 3.5 RLS notes

- New tables: same `auth_users` policy pattern as 046/049 until marketing role migration
- Server uses service role — RLS secondary to API guards for Run A
- Blanket admin gate in `dev-api.mjs` is the primary access control today

---

## 4. suggested_angles[] JSON schema appendix

### 4.1 Angle object (canonical)

Used for: photo analysis, idea-first generation, video/drone story types.

```json
{
  "id": "angle_<uuid_or_slug>",
  "title": "string — plain English post idea (required)",
  "subtitle": "string — audience · topic type (required)",
  "labels": ["string — Josh-facing chips, max 4"],
  "audiences": ["homeowner|renovation_client|custom_home_client|architect_designer|local_general|passive_design"],
  "platforms": ["instagram|facebook|linkedin|website|email|gbp"],
  "campaign_template_keys": ["trust_the_process"],
  "pillar": "how_we_build|what_to_expect|the_work|community_craft",
  "content_mode": "educational|opinion|behind_scenes|client_focused|story|authority|vision",
  "evergreen": true,
  "lead_quality_signal": "high|medium|low",
  "sam_approval_likely": false,
  "privacy_risk": "low|medium|high",
  "why": "string — one sentence plain English for WhyThisPanel",
  "source_reasoning": "string — internal: what in asset/topic drove this angle"
}
```

### 4.2 Wrapper: photo analysis response extension

```json
{
  "visible_facts": ["string"],
  "build_stage": "lock_up",
  "trade_or_detail": "string",
  "quality_tier": "hero|usable|archive",
  "privacy_risk": "low|medium|high",
  "privacy_notes": "string",
  "consent_required": true,
  "suggested_angles": [ "<Angle object>", "..." ],
  "recommended_primary_angle_id": "angle_1",
  "summary": "string",
  "suggested_pillar": "how_we_build",
  "suggested_caption_hook": "string"
}
```

### 4.3 Wrapper: idea-first angles response

```json
{
  "topic": "Why renovation budgets blow out",
  "topic_class": "education|trust|process|performance|selection",
  "suggested_angles": [ "<Angle object>", "..." ],
  "recommended_primary_angle_id": "angle_1",
  "media_recommended": true,
  "media_recommendation_note": "Attach a photo of a documented variation or site meeting for proof."
}
```

### 4.4 Wrapper: video / drone story types

Same `Angle object` shape; `id` prefix `story_`; additional optional fields:

```json
{
  "id": "story_progress_update",
  "title": "Monthly progress flyover",
  "subtitle": "Project transformation · drone",
  "labels": ["Good for project transformation", "Best for Instagram"],
  "platforms": ["instagram", "facebook"],
  "recommended_export_formats": ["9x16", "16x9"],
  "recommended_music_mood": "confident_progress",
  "clip_hints": ["hook", "proof", "cta"]
}
```

### 4.5 Label vocabulary (allowed values)

**Operational:** Ready for Josh review, Needs photo, Safe to post, Needs Sam approval, High value evergreen, Good lead quality topic

**Strategic:** Best for Instagram, Good for homeowner education, Good for architects, Good for project transformation, Good for trust/process content, Good for high-performance building education

---

## 5. ANGLE_GENERATION prompt outline

### 5.1 Purpose

Given asset analysis OR idea topic, produce 5–8 **distinct** content angles in `suggested_angles[]` JSON. Josh chooses; system never auto-selects.

### 5.2 Input shape

```json
{
  "mode": "photo|idea|video",
  "photo_analysis": { "...existing or extended analysis..." },
  "topic": "string — idea-first only",
  "project_context": { "project_id": "uuid?", "address_hint": "string?" },
  "campaign_template_key": "string?",
  "brand_context": "BLUE_LEAF_IDENTITY excerpt"
}
```

### 5.3 Output shape

```json
{
  "suggested_angles": [ "<Angle object> × 5-8" ],
  "recommended_primary_angle_id": "angle_1",
  "media_recommended": true,
  "media_recommendation_note": "string?"
}
```

### 5.4 Guardrails

- Never invent specifications or measurements
- Never auto-select for user
- APB references forbidden in angles
- At least 2 angles must target lead quality / education
- At least 1 angle must be safe for Instagram
- If client address/name visible in analysis → `sam_approval_likely: true`, `privacy_risk: high`
- Idea-first: always set `media_recommended: true` for proof-based topics unless topic is purely educational with no site tie

### 5.5 Fallback behaviour

| Failure | Fallback |
|---|---|
| AI timeout | Return 3 rule-based angles from `content_opportunities` legacy field |
| Invalid JSON | Retry once; then fallback |
| Zero angles | Block generate; show “Analysis incomplete — retry or use Legacy Studio” |

### 5.6 Examples (expected angle titles)

**Pro Clima / weather-tightness photo:**

- “Why we protect homes before cladding”
- “What weather-tightness means for comfort in Adelaide”
- “Behind the build: Pro Clima membrane at the wrap stage”

**High-end renovation progress photo:**

- “Trust the process: structural work before the finish”
- “What you cannot see after the walls close”
- “Architect note: sequencing before lock-up”

**Idea-first: “Why renovation budgets blow out”:**

- “Why renovation budgets blow out — and how to avoid it”
- “The hidden cost of skipping pre-construction detail”
- “What a fixed-price builder actually needs from you”

**Drone progress footage:**

- “Monthly progress — [project] from above”
- “Transformation story: before scaffolding to lock-up”
- “Site flyover: why we document every stage”

---

## 6. Route / security decisions needed before Run A

### 6.1 Corrected security premise (code-audit 2026-06-22)

`server/dev-api.mjs` applies a **blanket gate** to both prefixes:

```889:900:server/dev-api.mjs
for (const prefix of [
  "/api/finance",
  "/api/sales",
  "/api/marketing",
  "/api/intelligence",
  ...
]) {
  app.use(prefix, requireAuth, requireRole("admin"));
}
```

**Implications:**

- Marketing API is **already admin-gated** at the middleware chokepoint.
- Intelligence API is **already admin-gated** where mounted under `/api/intelligence`.
- Per-route `requireAuth` in `marketingRoutes.mjs` is **redundant** under the blanket gate (not a security gap).
- UI gate (`can.accessMarketing` → admin only) **matches** API gate today.
- **Future marketing role** requires changing this **chokepoint in `dev-api.mjs`**, not sprinkling per-route guards alone.

### 6.2 Decisions

| ID | Decision | Options | Handoff default (when Run A reopens) |
|---|---|---|---|
| **SEC-1** | Stage 1 role | Admin-only vs marketing role | **Admin-only** — already enforced by blanket gate + UI |
| **SEC-2** | Run A security task | Remediation vs baseline verification | **Baseline verification only** — cite `npm run test:qa-sec-baseline`; superseded by QA-001 during freeze |
| **SEC-3** | Per-route guards / dev-api.mjs | Add guards vs leave chokepoint | **Do not edit** during freeze; do not bulk-add per-route guards when Run A reopens unless blanket gate removed |

### 6.3 Claude audit checklist (when Run A reopens — not during freeze)

**During hardening freeze:** No Claude Run A. Marketing `/api/marketing` + `/api/intelligence` coverage is part of **QA-001** / `test:qa-sec-baseline`.

**When Run A is later authorised, Claude MUST:**

- Confirm `/api/marketing` and `/api/intelligence` remain in blanket admin list in `dev-api.mjs`
- List any marketing/intelligence endpoints registered **outside** those prefixes (should be none except `/api/public/*`)
- Compare to `can.accessMarketing` in `src/lib/roles.js` (admin only)
- Produce `docs/planning/MARKETING_API_SECURITY_AUDIT_RUN_A.md` with **pass/fail table**

- Cite `npm run test:qa-sec-baseline` pass in Run A result doc
- **Do not** edit `dev-api.mjs` auth middleware unless Sam explicitly approves outside Run A scope

**Claude MUST NOT (freeze + future default):**
- New marketing role in auth system
- RLS policy rewrites
- Any W17/W18 file

**Claude MUST document only:**

- RLS long-term plan when marketing role lands
- Supervisor access (denied by design today)

---

## 7. Run A Claude handoff prompt draft

> **INACTIVE during hardening freeze.** Do not hand to Claude until [SAM-MKT-001](../qa/SAM_DECISION_LOG.md) reopen conditions are met.

```markdown
# Claude task: Marketing Run A ONLY (Batch 1 + Batch 2)

## Authority
Read first:
- docs/planning/MARKETING_RUN_A_B_HANDOFF_READINESS.md (this doc §1, §3, §6, §9)
- docs/planning/MARKETING_END_TO_END_REBUILD_MAP.md
- docs/planning/MARKETING_COMMAND_CENTRE_REBUILD_PLAN.md §22 Batch 1–2
- CLAUDE.md standards

## Scope IN
- Command Centre + Creator shell + Legacy Studio routing
- Nested marketing routing in App.jsx or Marketing.jsx (see §1.4)
- Query-param asset seeding: Legacy Studio reads `?asset_id=` (see §1.4b)
- GET /api/marketing/command-centre
- GET /api/marketing/planner, templates, campaigns/from-template
- WeeklyPlanner + CampaignTemplatePicker
- Marketing MVP migration per handoff §3 → **`122_marketing_command_centre_mvp.sql` ONLY** (never `111_*.sql`)
- 7 template seeds (idempotent)
- Reserved API stubs (501)
- Security **confirmation** audit doc — do NOT bulk-add requireRole to routes
- SOP 18-01 draft update

## Scope OUT
- ContentCreator.jsx full workflow (Run B)
- Angles, packages, queue, calendar, vault split, intelligence
- W17, W18
- authFetch in new components — use apiFetch.js

## Routes
- /marketing → Command Centre
- /marketing/studio → ContentCreatorShell (placeholder)
- /marketing/studio/legacy → ContentGenerator unchanged — MUST support ?asset_id=
- /marketing/planner → WeeklyPlanner
- Implement nested routing (current :tab router cannot serve studio/legacy)

## Asset seeding
- MediaUpload navigates with ?asset_id= — not parent seedAsset state
- Legacy fetches asset by id and rehydrates from analysis jsonb column

## Done criteria
Paste §1.7 checklist from MARKETING_RUN_A_B_HANDOFF_READINESS.md

## Verify
npm run lint && npm run build
Manual: legacy generate + save; command-centre loads; planner template works

## Stop conditions
See handoff §9 — stop and report, do not improvise

## Deliverables
- Code changes on feature branch
- docs/planning/MARKETING_API_SECURITY_AUDIT_RUN_A.md
- Run A result summary in docs/planning/MARKETING_RUN_A_RESULT.md
```

---

## 8. Run B Claude handoff prompt draft

> **INACTIVE during hardening freeze.** Run B requires Run A complete.

```markdown
# Claude task: Marketing Run B ONLY (Batch 3a)

## Prerequisite
Run A merged and Sam sign-off on Run A result doc.

## Authority
Read first:
- docs/planning/MARKETING_RUN_A_B_HANDOFF_READINESS.md (§2, §4, §5, §9)
- docs/planning/MARKETING_CONTENT_CREATOR_UX_REDESIGN.md
- MARKETING_END_TO_END_REBUILD_MAP.md §9 AI map

## Scope IN
- ContentCreator.jsx three-column at /marketing/studio
- MediaPickerModal, AngleCards, AudienceChips, CampaignRecommendation, PlatformSelector
- ReviewSummary (Josh labels first)
- Extend media analyse + ANGLE_GENERATION per §4–§5
- Generate 1–2 drafts (IG+FB) with angle context
- Idea-first secondary path + Needs photo
- Save to marketing_content_items with generation_metadata, operational_labels
- Legacy route unchanged

## Scope OUT
- marketing_content_packages workflow (Run C)
- Approval Queue, Calendar
- Retire Legacy Studio
- W17, W18

## Done criteria
Paste §2.7 from MARKETING_RUN_A_B_HANDOFF_READINESS.md

## Verify
npm run lint && npm run build
Josh path: photo → angle → drafts → save
Idea path: topic → angles → draft → Needs photo

## Stop conditions
See handoff §9

## Deliverables
- docs/planning/MARKETING_RUN_B_RESULT.md
- Screenshots in docs/ui-review/marketing/screenshots/run-b/
```

---

## 9. Stop conditions

Claude **must stop and report** (no further commits) if:

| # | Condition |
|---|---|
| S1 | Marketing MVP migration SQL uncertainty — file must be **`122_*.sql`**, never `111_*.sql`; all ADD COLUMN IF NOT EXISTS |
| S2 | Nested routing plan ambiguous — stop if `/marketing/studio/legacy` cannot be registered |
| S3 | Legacy creator breaks — generate/save/stream fail on `/marketing/studio/legacy` |
| S3b | Asset seeding breaks — `?asset_id=` does not rehydrate Legacy Studio |
| S4 | `npm run lint` or `npm run build` fails after fix attempt |
| S5 | Run B cannot preserve current generation path (legacy must remain) |
| S6 | Unexpected changes required in W17/W18 files |
| S7 | Angle JSON validation fails repeatedly — do not ship broken Creator |
| S8 | MediaUpload seed navigation breaks without clear fix |
| S9 | Sam scope expansion requested mid-run — stop for new approval |

---

## 10. Recommendation

| Run | Safe for Claude? | Condition |
|---|---|---|
| **Run A** | **NO — parked** | Hardening freeze ([SAM-MKT-001](../qa/SAM_DECISION_LOG.md)). Reopen only after P0/P1 checkpoints + clean tree + explicit Sam approval |
| **Run B** | **NO** | Requires Run A complete + UAT |

**When Run A is reopened (future):** Handoff doc + correction pass remain valid planning references; re-check migration number; security = baseline verification only.
| **Neither** | Current state | Handoff doc pending Sam review |

### Unresolved decisions (blocked until post-hardening reopen)

| ID | Decision | Blocks |
|---|---|---|
| **SAM-MKT-001** | Run A reopen after P0/P1 hardening | All implementation |
| **H1** | Approve handoff for implementation (post-freeze) | Run A authorisation |
| **H2** | Authorise live migration file (re-check number ≠ 122 if taken) | Run A migration |
| D4 | Sam approval policy (flagged vs all client) | Run B labels (not Run A) |

### Unresolved before Run B

| ID | Decision |
|---|---|
| D3 | MVP channels (IG+FB confirmed?) |
| D5 | Idea-first approve without media — warn only (recommended) |
| Run A UAT | Josh/Sam Command Centre + planner walkthrough |

---

Next safe action:  
Sam continues Go-Live P0/P1 hardening. Marketing Run A remains parked until Sam explicitly reopens it after hardening.

Blocked by:  
Current feature freeze, dirty shared files, active P0/P1 hardening, uncommitted tree, or lack of explicit Sam Run A approval.

**Freeze parking:** [MARKETING_RUN_A_FREEZE_PARKING_RESULT.md](./MARKETING_RUN_A_FREEZE_PARKING_RESULT.md) · **Decision:** [SAM-MKT-001](../qa/SAM_DECISION_LOG.md)

Code changed: no  
Tests changed: no  
Docs changed: yes

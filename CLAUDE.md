# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## SOP Requirement (Law — applies to every module build)

Every module build must include SOPs. This is not a post-build task — it is part of the build.

**Rule:** A module is not considered done until all SOPs are written and each SOP contains a complete Section 14 (Troubleshoot Agent Test Script).

**When building a new feature or module:**
1. Write all SOPs for the module during the build — alongside the code, not after
2. Place each SOP in the correct folder under `docs/sops/` using the existing folder structure
3. Follow the full template from `docs/sops/SOP_MAINTENANCE.md` — all 14 sections required
4. Section 14 must contain at minimum TC-01 through TC-05 plus at least one feature-specific test case
5. Add every new SOP to `docs/sops/SOP_INDEX.md` with `test_status: untested`
6. Add an entry to `docs/sops/SOP_CHANGELOG.md`

**Two purposes every SOP must serve:**
- **Staff training:** Plain English, numbered steps, written for someone who has never used the software
- **Troubleshoot agent testing:** Section 14 is a structured test script the troubleshoot agent runs to verify every feature works and catch bugs

**Trigger phrase:** "Run SOP audit" → scan app structure, compare against SOP_INDEX.md, write missing SOPs, update changed ones.

**Existing SOP folders:**
```
docs/sops/
  00_getting_started / 01_global_navigation / 02_sales / 03_tendering
  04_rfq_engine / 05_operations / 06_scheduling / 07_site_diary / 08_whs
  09_finance / 10_workforce / 11_client_portal / 12_admin_settings
  13_subcontractors / 14_cost_intelligence
```
New modules: create a new numbered folder (e.g. `15_financial_command_centre/`).

---

## Standards (Law)

**Read this section before touching any file. These rules apply to ALL code — new and modified.**
`/check` will flag violations. No PRs pass without conformance.

### Canonical Data Law — facts belong to the project, not the module
**The single most important architectural rule. Full spec: `docs/agent_knowledge/MASTER_DATA_DICTIONARY.md` (Part 2).**

1. **Before adding a column, check the Fact Registry** (`jobFactRegistry.mjs` / dictionary §11). If the fact already exists, **read it via `getJobProfile(jobId)`** — never copy a canonical fact into your module's table.
2. A **new fact must be registered first** (canonical name, data type, creator, source, consumers, lifecycle, audit).
3. Three data types: **Static** (set once), **Versioned** (changes → write `job_fact_history`), **Generated** (a function of other facts — **never stored as editable**; derive via a named function, mark dependents stale on input change).
4. **All fact writes go through the facts service**, which stamps provenance (`source`, `confidence`, `status`).
5. **Facts key to one of three spines — Party (`contact_id`), Lead (`lead_id`), or Job (`job_id`).** The Job spine is primary for construction facts; pre-job facts live on the Lead and **stamp forward** at conversion (never re-typed); people/orgs live on the Party spine and link via roles. Address is a normalised attribute of the job — never re-stored on another table.
6. **Confirmation is consequence-tiered, and a fact's tier = the MAX consequence across its consumers.** A fact whose wrong value could cause harm, lost income, a client dispute, or a compliance/consent breach (safety/WHS, money, client-facing, compliance, consent) **must be human-confirmed** before it is canonical — regardless of confidence. Internal facts auto-apply at ≥0.90. Provenance (`source`=document_id, `confidence`, `status`) is always stamped.

> The Knowledge Core is Facts + Events + Documents (one chain): see `docs/agent_knowledge/MASTER_DATA_DICTIONARY.md` Part 4.
> Status: in force. The facts service + `getJobProfile` are being built in the foundation sprint. Until they land, **do not add duplicate fact columns** — register the fact in the dictionary §11 and flag it for the sprint.

### Server responses — always use apiResponse.mjs
```js
import { ok, err, rowToCamel, rowsToCamel, translateDbError } from "./apiResponse.mjs";

ok(res, { leads: data })          // { ok: true, leads: [...] }
ok(res)                           // { ok: true }
err(res, 400, "Name required")    // { ok: false, error: "Name required" }
err(res, 404, "Lead not found", "NOT_FOUND")
```
- **Never** `res.json({ success: true })` — always `ok: true`
- **Never** `res.json({ error: msg })` without `ok: false`
- **Never** expose raw Supabase/Postgres error strings — use `translateDbError(error)` or write a plain English message

### Frontend fetch — always use apiFetch.js
```js
import { apiFetch, apiPost, apiPatch, apiDelete } from "../lib/apiFetch.js";

const { ok, data, error } = await apiFetch("/api/sales/leads");
const { ok, data, error } = await apiPost("/api/sales/leads", { firstName: "Jane" });
```
- **Never** call `authFetch` directly in page components — only in `apiFetch.js` itself
- **Never** do manual `.json()` + separate `.ok` checks in page components
- All functions return `{ ok, data, error }` — never throw

### camelCase across the API boundary
- DB stores snake_case (`first_name`, `created_at`) — never change this
- Server converts with `rowToCamel(row)` / `rowsToCamel(rows)` from `apiResponse.mjs` before sending
- Frontend reads camelCase (`lead.firstName`, `doc.createdAt`) — never read raw snake_case from API responses

### Response entity keys
```js
ok(res, { leads: [...] })    // ✅ plural collection
ok(res, { lead: {...} })     // ✅ singular item
ok(res, { ...result })       // ❌ never spread — unpredictable keys
ok(res, { success: true })   // ❌ never
```

### Status values — always import from constants.js
```js
import { LEAD_STAGES, DOC_STATUSES, TIMESHEET_STATUSES } from "../lib/constants.js";
if (lead.stage === LEAD_STAGES.WON) { ... }   // ✅
if (lead.stage === "won") { ... }              // ❌ never hardcode
```
`src/lib/constants.js` — all status enums, `GST_RATE`, `incGst()`, `gstAmount()`.

### Amounts
- All amounts stored and returned **ex-GST**
- Never hardcode `0.1` or `* 1.1` — use `GST_RATE`, `incGst()`, `gstAmount()` from `constants.js`
- Never store amounts as strings

### File storage paths
```
[bucket]/[entity_type]/[entity_id]/[YYYY-MM-DD]-[sanitised-filename]
Examples:
  lead-documents/leads/abc-123/2026-05-28-site-survey.pdf
  marketing-media/jobs/xyz-789/2026-05-01-slab-pour.jpg
```
Sanitise: lowercase, spaces→hyphens, strip specials except `-` and `.`

### Error messages
- Plain English only — use `translateDbError(error)` for DB constraint errors
- Raw Postgres strings must never reach the browser

### Pagination
New list endpoints accept `?limit=N&offset=N` and return `total`:
```js
const { data, count } = await paginate(
  sb.from("leads").select("*", { count: "exact" }), req.query
);
ok(res, { leads: data, total: count });
```

### Dropbox sequential reads
Never `Promise.all` for Dropbox file reads. Always a sequential `for` loop.

---

## Commands

```bash
npm run dev          # Start both API server (port 8787) and Vite dev server concurrently
npm run start        # API only — used by Railway (`PORT` env)
npm run build        # Production Vite build
npm run lint         # ESLint (zero warnings policy — --max-warnings 0)
npm run auth:gmail   # One-time OAuth flow for Gmail sending (outputs GMAIL_REFRESH_TOKEN)
npm run auth:drive   # One-time OAuth flow for Google Drive only
npm run auth:dropbox # One-time OAuth flow for Dropbox (outputs DROPBOX_REFRESH_TOKEN)
npm run test:smtp    # Verify SMTP credentials
```

There is no automated test suite. All features are verified manually via the running app.

### Slash commands (Claude Code)

Defined in `.claude/commands/` — invoke with `/check`, `/ship`, `/sprint`:
- `/check` — ESLint + Vite build + import audit + API route audit + stale refs + git status
- `/ship` — run `/check`, draft commit message, confirm with user, commit + push
- `/sprint` — plan/scope/build a sprint from the backlog

---

## Architecture

### Two-process dev setup

`npm run dev` runs two processes:
- **API server** — `server/dev-api.mjs` (Express), port 8787. All server logic under `server/lib/`.
- **Vite dev server** — proxies `/api/*` to Express. Frontend never calls a raw port.

### Production deploy (Vercel + Railway)

- **Railway** — API server. Set all server secrets. Start command: `npm run start`.
- **Vercel** — Static SPA. Edit `vercel.json` to set Railway hostname in the `/api/:path*` rewrite. Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **Supabase Auth** — Set Site URL + redirect URLs to the Vercel custom domain.

### Frontend: React + React Router v6

Single-page app. Routes in `src/App.jsx`. Layout in `src/components/AppShell.jsx` (sidebar desktop / bottom drawer mobile).

Modules (departments):
- **Sales Manager** — `/sales/*` — Lead pipeline, qualifying, conversations, Blueprint Insight
- **Tender Manager** — `/tender-manager/*` — RFQ, fee proposals, subcontractors, cost intelligence
- **Operations Manager** — `/operations/*` — Projects, schedule management (Gantt/Sheet/Delays/Dep Map), site diary, WHS
- **Workforce** — `/workforce/*` — Timesheets (Approvals/Mass Fill/History), Team Directory
- **Finance** — `/finance/*` — Invoice inbox (IMAP + drag-drop), approvals, Director Portfolio job view
- **Marketing** — `/marketing/*` — Content Studio: Create/Library/Campaigns/Media/Music Library (AI-assisted)
- **Worker PWA** — `/worker` — Mobile timesheet + task check-in for site workers

### Server: Express route registration

`server/dev-api.mjs` registers:
- `registerSalesRoutes` — Lead/pipeline CRUD, conversations, transcript analysis, Blueprint Insight
- `registerModule4Routes` — RFQ engine: Claude extraction, PO generation, Buildexact sync
- `registerModule5Routes` — Fee proposals: XLSX/PDF parsing, DOCX generation, Drive upload, email send
- `registerModule6Routes` — Operations: schedule generation, site diary, WHS, schedule CRUD
- `registerInductionRoutes` — Site induction QR/form (public `/induct/:projectId`)
- `registerJobsApiRoutes` — Job CRUD, Dropbox folder creation, Buildexact lookup

### Supabase

**Frontend** — anon key, RLS applies. `src/lib/supabaseClient.js` → `getSupabase()`.
**Server** — service role key, bypasses RLS. `server/lib/supabaseService.mjs` → `getServiceSupabase()`.

Both return `null` if env vars missing — all callers must guard.

Database migrations in `supabase/migrations/` (001–073). Apply in order via Supabase dashboard SQL editor. (Note: 018 and 019 were never created — numbering jumps 017 → 020.)

Key tables:
| Migration | Tables added |
|---|---|
| 001–004 | `jobs`, `subcontractors`, `rfqs`, `fee_proposals`, `cost_intelligence` |
| 005–008 | `projects`, `sequences`, `purchase_orders`, `correspondence`, `schedule_tasks` (note: `sequences` is created in 006, not 012) |
| 009–011 | `site_diary`, `contractor_compliance`, `site_inductions`, `unmatched_quote_emails` |
| 012 | IMAP quote PDF URL on `rfqs` + `correspondence.attachments` jsonb |
| 013 | leads pipeline: `leads`, `pipeline_stages` |
| 014 | `schedule_templates` |
| 015 | `buildexact_deep_integration` — Buildexact sync fields on `jobs` |
| 016 | Blueprint Insight fields on `leads` + qualifying-score columns (`qualify_budget`, `qualify_timeframe`, `qualify_site`, `qualify_decision_maker`, generated `qualify_score`) |
| 017 | `lead_conversations` (transcript, bp_suggestions, applied_suggestions JSONB) |
| 018–059 | Various — workforce, finance, marketing, portal, WHS, schedule improvements |
| 060 | `lead_notes`, `lead_documents` + Supabase Storage RLS for `lead-documents` bucket |
| 061 | CRM + mailing list: `crm_contacts`, `crm_interactions`, `mailing_lists`, `mailing_list_members`, `email_sends`, `email_unsubscribes` |
| 062 | Marketing Intelligence: `attribution_events`, `keyword_targets`, `website_pages`, `social_post_snapshots`, GSC/GA4/GBP snapshots + leads attribution fields |
| 063 | `leads` website-enquiry fields — adds `name`, `project_description`; makes `first_name` nullable |
| 064 | WHS engine: `whs_site_profiles`, `whs_documents` |
| 065 | Carpentry module: `carpentry_jobs`, `carpentry_job_milestones`, `carpentry_job_costs`, `carpentry_site_diary` + `alloc_carpentry_sequence()`; adds `carpentry_job_id` to `timesheets`/marketing tables |
| 066 | Carpentry schema corrections (project_type/status enums, drop `closeout_data`) + `carpentry_job_performance` |
| 067 | `carpentry_job_budgets` (Phase 2 costing — budget vs actual) |
| 068 | `site_tasks.carpentry_job_id` + makes `site_tasks.project_id` nullable |
| 069 | Knowledge Core foundation (Phase 0, additive): `job_documents`, `job_fact_history`, `job_events`, `contact_events`, `company_profile` + building-fact columns on `project_metrics`. Not yet wired — see `MASTER_DATA_DICTIONARY.md` + `factsService.mjs`/`jobFactRegistry.mjs` |
| 071 | `jobs.client_email`, `jobs.client_phone` (lead→job contact carry-forward, H14/H15) |
| 072 | Widen `schedule_tasks.task_type` CHECK to include `build`/`approval`/`inspection` (C6 — AI schedule generator was rejected) |
| 073 | `increment_send_stat(text,text)` RPC for atomic CRM email_sends counters (H12 — webhook called a missing function) |

---

## Feature Modules

### Sales Manager

**APB 8-stage pipeline** (Association of Professional Builders):
`enquiry → qualify → discovery → winning_offer → fee_proposal → accepted → tender → won` plus `nurture` and `lost`.

**Lead detail tabs:** Overview, Documents, Notes, Qualifying Score, Blueprint Insight, Conversations

**Qualifying scorecard** — weighted scoring across project type, budget, timeline, fit.

**Conversations / Transcript feature:**
- User pastes meeting transcript → hits "Analyse with Blueprint"
- API: `POST /api/sales/leads/:id/conversations/analyse` — sends transcript to Claude (model: `claude-opus-4-5`) with APB extraction prompt, returns `{ suggestions }` as structured JSON (stage, qualifying score updates, next action, notes)
- User reviews suggestions in `SuggestionReviewPanel`, approves/rejects each
- `POST /api/sales/leads/:id/conversations` saves transcript + applied suggestions → updates lead record
- Table: `lead_conversations` (id, lead_id, title, transcript_text, bp_suggestions JSONB, applied_suggestions JSONB, applied_at)

**Blueprint Insight** — conversational AI coaching panel using lead context as hub context:
- `POST /api/blueprint/chat` body: `{ messages: [{ role, content }], hubContext }` → returns `{ reply }`
- Model: `claude-sonnet-4-6`
- **Critical**: response field is `reply` not `response` or `message` — always use `j.reply`

**dotenv override issue:** If shell has `ANTHROPIC_API_KEY=''`, `dotenv.config()` won't override it. Pattern:
```js
const { parsed: _env = {} } = dotenvConfig();
const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || _env.ANTHROPIC_API_KEY?.trim();
```

### Schedule Manager

**Views:** Gantt, Sheet, Delays, Dep Map — toggled by tab.

**Schedule generation:** AI generates tasks from project description via Claude in `module6Routes.mjs`. Ripple cascade (`previewRipple()` in `scheduleUtils.js`) propagates date shifts to downstream tasks via `depends_on` array. `RippleWarningModal` shown before applying.

**Sprint 1 features (built):**
- **Colour coding system** — phase-semantic colours consistent across all 4 views
- **Gantt column toggle** — show/hide left panel (Task/From/To/Days columns), persisted in `localStorage`
- **Right-click context menu** — on Gantt bars: Mark complete, Open detail, Delete
- **Drag + right-edge resize** — `onDateChange` fires for both; distinguishing: if `newStartDate === task.start_date` it's a resize → recompute `duration_days = daysBetween(newStart, newEnd) + 1`

**Gantt library:** `gantt-task-react`. Custom `TaskListHeader` + `TaskListTable` render props for left column panel. `listCellWidth=""` hides the panel entirely. Module-level stable functions required (not inline) to avoid React reconciliation issues.

**Context menu row detection:** `rowIndex = Math.floor((clientY - containerTop - lookaheadBannerH(52) - headerH(50)) / rowHeight(40))` → maps to `ganttTasks[rowIndex]`.

**Sprint 2 (shipped):** Baseline ghost bars + EOT tracking. Baseline lock banner shows "Baseline locked [date]" with "Reset baseline" action. Delays tab = EOT claims list with "+ Raise EOT".

### Colour Coding System

**Core convention:** Phase + status layered colouring, consistent across Dashboard, Gantt, Sheet, Calendar.

**Phase colour map** (`PHASE_COLOR_MAP` in `src/lib/scheduleUtils.js`):
```js
pre_construction: "#64748b"  // slate
site_prep:        "#92400e"  // brown
site_slab:        "#78716c"  // warm grey
frame:            "#ea580c"  // orange
roofing / roof:   "#1e40af"  // deep blue
lock_up:          "#0d9488"  // teal
rough_in:         "#d97706"  // amber
insulation:       "#65a30d"  // lime
wall_lining:      "#7c3aed"  // purple
painting:         "#e11d48"  // rose
fitout:           "#0284c7"  // sky
floor_coverings:  "#b45309"  // amber-brown
completion:       "#059669"  // emerald
general:          "#94a3b8"  // light slate
```

**Status modifiers** (`getTaskGanttStyles(task, phaseColorHex, showCritical, todayStr)` in `scheduleUtils.js`):
- Complete (≥100%) → grey base `#e5e7eb` + green progress `#86efac` (recedes, eye goes to active tasks)
- Overdue (past end_date, not complete) → red tint `#fee2e2` + red fill `#ef4444`
- Critical → amber tint `#fef3c7` + amber fill
- Procurement → purple tint
- Normal → `hexToTint(phaseColorHex, 0.15)` background, phase colour fill

**Helper functions** (all exported from `scheduleUtils.js`):
- `hexToTint(hex, opacity)` — blends hex with white at given opacity
- `darkenHex(hex, amount)` — subtracts `amount` from each RGB channel

**Status dots in Sheet view:** `w-2 h-2 rounded-full` before task name:
- `bg-green-400` = complete, `bg-red-400` = overdue, `bg-blue-400` = in-progress, `bg-slate-300` = planned

**Phase progress bars in Dashboard:** Use `row.color` from `PHASE_COLOR_MAP` (not hardcoded green/amber/red by percentage).

**Never use raw hex in JSX** — use `scheduleUtils` helpers or Tailwind tokens.

### Operations Manager

Current state: project list, schedule management per project, site diary, WHS checklists, subcontractor compliance.

Planned (Sprint 4): Rich project cards with schedule health badge + progress % + next milestone + active trade count. Card/list toggle. Global Gantt across all active projects, filterable by trade, colour-coded by project. Trade conflict detection across projects.

### Marketing Agent / Content Studio

Route: `/marketing/*`. Tabs: Create, Library, Campaigns, Media, Music Library.

**Create tab** — AI content generation form:
- Channel: Instagram / Facebook / Website Copy / Email / Client Guide / Landing Page
- Content Pillar: How We Build / What to Expect / The Work / etc.
- Content Type: Educate / Opinion / Behind it / For clients / Story / Authority / Vision
- Topic/Brief (required) — e.g. "Slab pour at Stirling renovation — rainy day, great result"
- Client Stage filter (maps to APB pipeline stages for targeting)
- Additional Context (optional) — tone notes, client quotes, specific angles
- "Generate Content" button — calls AI to produce channel-specific copy

**Library tab** — stored AI-generated content pieces. Search by channel/status. "Group by photo" toggle.

**Campaigns tab** — campaign management. Each campaign has channel tags (instagram/facebook/website/etc.) and date range. Content pieces are linked to campaigns.

**Media tab** — photo/video library. DJI D-Log M drone footage auto-detected. Video pipeline runs in background. Drop zone for new uploads.

**Music Library tab** — background music tracks for video content.

Storage: `marketing-media` Supabase Storage bucket (see earlier migrations).

### Subcontractors

Sortable sheet view with `SortableTableHead` component and `sheetSort` state. `sheetSortValue()` helper sorts by business, trade, RFQs, avg_quote, missing fields.

Popup-blocker fix: `window.open("about:blank", "_blank")` before async fetch, then redirect to the actual URL.

---

## UI Conventions

**Card/list toggle:** Pattern established in Sales Pipeline — card view (rich preview cards) and list view (dense table). Replicate this in Operations Manager.

**Conversation panel:** Slide-in right panel for AI conversation (Blueprint Insight). Used in Sales Manager.

**Suggestion review panel (`SuggestionReviewPanel`):** Shows AI suggestions one-by-one with approve/reject. Used after transcript analysis.

**Tailwind design tokens:**
- `primary` (#006c9b), `accent` (#2E6B4F), `warning` (#D4A24C)
- `surface` (white), `page` (#F8F9FA), `ink`, `muted`, `hairline`
- `rounded-card` (12px), `rounded-lg` (8px), `.focus-ring`
- Font: Lato

---

## Sprint Backlog

### Sprint 2 — Schedule intelligence ✅ SHIPPED
- **Baseline / ghost bars** — `baseline_start_date`, `baseline_end_date` on `schedule_tasks`. "Lock Baseline" banner with drift count badge. "Reset baseline" action.
- **EOT (Extension of Time) tracking** — Delays tab in Schedule Manager. "+ Raise EOT" button. EOT claim list.

### Sprint 3 — Dependencies overhaul ✅ SHIPPED
- `task_dependencies` typed deps (FS/SS/FF/SF + lag). Solid arrows = typed, dashed = legacy `depends_on`.
- **Dep Map** tab — React Flow network diagram with mini-map + zoom controls. Click node to open task.

### Sprint 4 — Operations Manager overhaul ✅ PARTIALLY SHIPPED
- Global Gantt on Operations landing page (all projects, trade filter, month zoom) — **shipped**
- Rich project cards with health badges — **pending**
- Trade conflict detection — **pending**

### Sprint 5 — Client portal (deferred)
- Token-based shareable schedule link (no login)
- Variation + EOT approval workflow with client sign-off
- Site diary → client update pipeline

### Known Bugs (active)
_All previously logged bugs (BUG-UI-1, BUG-UI-2, BUG-S1, BUG-S2) shipped in the 8-fix sprint (2026-05-28). See commit history for details._

**Ongoing improvements:**
- **BUG-schedule**: Fallback schedule duration now uses construction phase defaults map (not hardcoded 3 days) — `scheduleGenerate.mjs`.
- **BUG-portal**: Portal conversation error messages now surface the actual error text rather than generic "Failed to send".
- **BUG-portal-2**: `patchProject` in `PortalAdmin.jsx` now logs and early-returns on Supabase update errors.

**react-markdown / typography:** `react-markdown` + `@tailwindcss/typography` added. Blueprint Insight panel now renders formatted markdown. PWA workbox `maximumFileSizeToCacheInBytes` bumped to 4 MiB to accommodate bundle growth.

---

## Key exports from `src/lib/scheduleUtils.js`

`getTaskGanttStyles`, `hexToTint`, `darkenHex`, `PHASE_COLOR_MAP`, `daysBetween`, `phaseColor`, `phaseLabel`, `groupTasksByPhase`, `calculateDashboard`, `procurementStatus`, `previewRipple`, `taskStatusFromPercent`

---

## External Integrations

| Service | Env vars | Purpose | Status |
|---|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` | RFQ extraction, schedule generation, transcript analysis, Blueprint AI | Required |
| Gmail OAuth | `GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN/SENDER_EMAIL` | Outbound email via Gmail | Required |
| Google Drive | `GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN` | Fee proposal Google Docs workflow + **shared OAuth base for GSC/GA4/GBP** | Required |
| Google Search Console | `GOOGLE_SEARCH_CONSOLE_SITE_URL` (+ Drive OAuth) | Marketing Intelligence — keyword position tracking | Optional |
| Google Analytics 4 | `GA4_PROPERTY_ID` (+ Drive OAuth) | Marketing Intelligence — traffic + conversion attribution | Optional |
| Google Business Profile | `GBP_LOCATION_ID` (+ Drive OAuth) | Marketing Intelligence — calls, directions, review tracking | Optional |
| Meta (Instagram/Facebook) | `META_ACCESS_TOKEN`, `META_IG_USER_ID`, `META_PAGE_ID` | Marketing Intelligence — post reach + engagement | Optional |
| Resend | `RESEND_API_KEY` | CRM mailing list campaigns — bulk email with unsubscribe | Optional |
| SMTP | `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | Email fallback | Optional |
| IMAP | `IMAP_HOST/PORT/SECURE/USER/PASS` | Inbound quote email polling | Optional |
| Dropbox | `DROPBOX_APP_KEY/SECRET/REFRESH_TOKEN` | Job folders, file uploads | Optional |
| Buildexact | `BUILDEXACT_API_URL/USERNAME/API_KEY/SUBSCRIPTION_KEY` | Sync jobs, create POs | Optional |

**Google OAuth scopes required for full Marketing Intelligence:**
- `https://www.googleapis.com/auth/webmasters.readonly` (GSC)
- `https://www.googleapis.com/auth/analytics.readonly` (GA4)
- `https://www.googleapis.com/auth/business.manage` (GBP)
- Add to existing Google Cloud OAuth app, re-run `npm run auth:drive`, update `GOOGLE_DRIVE_REFRESH_TOKEN` in Railway.

**Integration status visible in app:** Settings page → each service shows configured/not-configured badge from `GET /api/integrations/status`.

Mail transport (`server/lib/notifyMail.mjs`) prefers Gmail OAuth over SMTP — all sending via `sendPlainMail()`.

### Fee Proposal flow (Module 5)

1. Import Buildexact XLSX or PDF → parse endpoint
2. Edit structured fields in browser wizard
3. "Open in Google Docs": generate DOCX → upload as Google Doc → open edit URL
4. "Send PDF to client": export PDF from Drive → upload to Dropbox → email PDF

DOCX uses **docxtemplater v3** with **angular-expressions**. Single-brace `{VAR}` syntax. Template stored in localStorage under `blhub_fee_proposal_docx_template_b64`.

### Dropbox path structure

```
/BLUE LEAF BUILDING/PROJECTS/BLUE LEAF BUILDING/[job address]/
  TENDER DOCS/         ← RFQ documents, sent quotes
  INTERNAL/
    QUOTES/            ← received subcontractor quotes
    PRESALE DOCS/      ← fee proposal PDFs
```

Path root uses Dropbox team namespace (`DROPBOX_NAMESPACE_ID`). `dropboxClient.mjs` handles token refresh and namespace routing.

**Sequential file reads**: When reading File objects from Dropbox folders, use a sequential for-loop — not `Promise.all`. Concurrent reads fail for online-only (Smart Sync) files.

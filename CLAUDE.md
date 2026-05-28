# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

Database migrations in `supabase/migrations/` (001–017). Apply in order via Supabase dashboard SQL editor.

Key tables:
| Migration | Tables added |
|---|---|
| 001–004 | `jobs`, `subcontractors`, `rfqs`, `fee_proposals`, `cost_intelligence` |
| 005–008 | `projects`, `purchase_orders`, `correspondence`, `schedule_tasks` |
| 009–011 | `site_diary`, `contractor_compliance`, `site_inductions`, `unmatched_quote_emails` |
| 012 | `sequences` |
| 013 | leads pipeline: `leads`, `pipeline_stages` |
| 014 | `lead_qualifying_scores` |
| 015 | `buildexact_deep_integration` — Buildexact sync fields on `jobs` |
| 016 | Blueprint Insight fields on `leads` |
| 017 | `lead_conversations` (transcript, bp_suggestions, applied_suggestions JSONB) |
| 018–059 | Various — workforce, finance, marketing, portal, WHS, schedule improvements |
| 060 | `lead_notes`, `lead_documents` + Supabase Storage RLS for `lead-documents` bucket |

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

| Service | Env vars | Purpose |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` | RFQ extraction, schedule generation, transcript analysis, Blueprint AI |
| Gmail OAuth | `GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN/SENDER_EMAIL` | Outbound email via Gmail |
| Google Drive | `GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN` | Fee proposal Google Docs workflow |
| SMTP | `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | Email fallback |
| IMAP | `IMAP_HOST/PORT/SECURE/USER/PASS` | Inbound quote email polling |
| Dropbox | `DROPBOX_APP_KEY/SECRET/REFRESH_TOKEN` | Job folders, file uploads |
| Buildexact | `BUILDEXACT_API_URL/USERNAME/API_KEY` | Sync jobs, create POs |

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

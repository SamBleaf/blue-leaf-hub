# Blue Leaf Hub — System Architecture

> Last updated: 2026-05-21

---

## Runtime Overview

```
Browser (React SPA)
      │
      │  /api/* (proxied in dev, rewritten in prod)
      ▼
Express API  (server/dev-api.mjs)
      │
      ├── Supabase (service role — no RLS)
      ├── Anthropic Claude API
      ├── Dropbox API
      ├── Google Drive API
      ├── Gmail OAuth / SMTP
      ├── IMAP
      └── Buildexact API

Supabase (PostgreSQL)
      │
      ├── Frontend client (anon key — RLS applies)
      └── Server client (service role — bypasses RLS)
```

---

## Dev Setup

```bash
npm run dev
# Starts two processes concurrently:
# 1. Express API on port 8787 (server/dev-api.mjs)
# 2. Vite dev server — proxies /api/* to Express
```

Frontend never calls a raw port. Always uses relative `/api/*` paths. Vite proxies in dev; Vercel rewrites in prod.

---

## Production Hosting

| Service | Hosts | Config |
|---------|-------|--------|
| **Vercel** | React SPA (`dist/`) | `vercel.json` — rewrites `/api/:path*` to Railway |
| **Railway** | Express API | `railway.toml` — Nixpacks, `npm run start` |
| **Supabase** | Database + Auth | External service |

**CRITICAL**: `vercel.json` still contains `YOUR-RAILWAY-HOST` placeholder. Must be replaced after Railway deploys.

---

## Frontend Architecture

### Entry Point
`src/main.jsx` → `src/App.jsx`

### Provider Hierarchy
```
AuthProvider          (Supabase session, user, signOut)
  BlueprintProvider   (AI assistant screen context)
    ProjectProvider   (active project selection)
      Routes...
```

### Route Structure
```
Public:
  /login                → Login.jsx
  /signup               → Signup.jsx
  /accept-invite/:token → AcceptInvite.jsx
  /induct/:projectId    → SiteInduction.jsx (public, no auth)
  /portal/:token/*      → PortalApp.jsx (lazy, client-facing)

Protected (ProtectedRoute):
  /my-portal            → MyPortal.jsx (client role only)
  /supervisor           → SupervisorHome.jsx

  AppShell layout:
    /home               → Home.jsx (admin/supervisor/employee)
    /settings/users     → UserManagement.jsx (admin only)

    Tender Manager (admin/supervisor):
      /tender-manager/rfq-engine
      /tender-manager/rfq-packages
      /tender-manager/rfq-packages/:packageId
      /tender-manager/subcontractors
      /tender-manager/settings
      /tender-manager/board
      /tender-manager/board/:jobId
      /tender-manager/cost-intelligence
      /tender-manager/fee-proposal
      /tender-manager/fee-proposal/new
      /tender-manager/fee-proposal/:id
      /tender-manager/fee-proposal/template-setup

    Operations (all roles):
      /operations
      /operations/:projectId
      /operations/:projectId/schedule
      /operations/:projectId/whs
      /operations/:projectId/diary

    Sales (admin/supervisor):
      /sales
      /sales/:leadId

    Finance (admin/supervisor):
      /finance
      /finance/:tab
      /finance/jobs
      /finance/jobs/:jobId

    Portal Admin (admin/supervisor):
      /portal-admin
      /portal-admin/:projectId
```

### Legacy Redirects
- `/rfq-engine` → `/tender-manager/rfq-engine`
- `/subcontractors` → `/tender-manager/subcontractors`
- `/quote-tracker` → `/tender-manager/rfq-packages` (old route retired)
- `/settings` → `/tender-manager/settings`
- `/cost-intelligence` → `/tender-manager/cost-intelligence`

---

## Backend Architecture

### Entry Point: `server/dev-api.mjs`

Registers all route modules + contains core direct routes:

**Direct routes in dev-api.mjs:**
- `/api/health`
- `/api/subcontractor/lookup`
- `/api/rfq/extract` — Claude AI extraction
- `/api/integrations/status`
- `/api/dropbox/*` — folder creation, uploads
- `/api/cron/rfq-reminders`
- `/api/rfq/remind-one`
- `/api/rfq/send`
- `/api/quote-tracker/unmatched`
- `/api/mail/inbox`
- `/api/imap/quote-poll`
- `/api/rfq/:rfqId/reextract-amount`

**Registered route modules:**

| Module | File | Key Routes |
|--------|------|-----------|
| Sales | `salesRoutes.mjs` | `/api/sales/*` |
| Module 4 (RFQ/PO) | `module4Routes.mjs` | `/api/tender/*`, `/api/po/*` |
| Module 5 (Fee Proposals) | `module5Routes.mjs` | `/api/fee-proposal/*` |
| Module 6 (Operations) | `module6Routes.mjs` | `/api/operations/*`, `/api/schedule/*`, `/api/whs/*`, `/api/site-diary/*` |
| Inductions | `inductionRoutes.mjs` | `/api/induct/*` |
| Jobs API | `jobsApiRoutes.mjs` | `/api/jobs/*` |
| Auth | `authRoutes.mjs` | `/api/auth/*` |
| Blueprint | `blueprintRoutes.mjs` | `/api/blueprint/*` |
| Buildexact Integration | `buildexactIntegrationRoutes.mjs` | `/api/buildexact/*` |
| Finance | `financeRoutes.mjs` | `/api/finance/*` |
| Finance CC | `financeCCRoutes.mjs` | `/api/finance/cc/*` |
| Job Finance | `jobFinanceRoutes.mjs` | `/api/jobs/:id/finance/*` |
| Portal | `portalRoutes.mjs` | `/api/portal/*` |
| RFQ Packages | `rfqPackageRoutes.mjs` | `/api/rfq-packages/*` |
| RFQ Trades | `rfqTradeRoutes.mjs` | `/api/rfq-trades/*` |
| Cost Intelligence | `costIntelligenceRoutes.mjs` | `/api/cost-intelligence/*` |
| Supervisor | `supervisorRoutes.mjs` | `/api/supervisor/*` |

---

## Supabase Client Pattern

**Frontend** (`src/lib/supabaseClient.js`):
- Anon key only — RLS applies
- Singleton via `getSupabase()`
- Auth persistence: `local` or `session` storage (configurable)
- Returns `null` if env vars missing — all callers must guard

**Server** (`server/lib/supabaseService.mjs`):
- Service role key — bypasses RLS entirely
- Singleton via `getServiceSupabase()`
- All server logic should use this for writes

---

## AI Integration

**Claude usage:**

| Task | Model | Location |
|------|-------|---------|
| RFQ scope extraction | claude-sonnet-4-6 (or CLAUDE_MODEL env) | `rfq/extract` in dev-api.mjs |
| Schedule generation | claude-sonnet-4-6 | `scheduleGenerate.mjs` / `scheduleClaudePlan.mjs` |
| Transcript analysis | claude-opus-4-5 | `salesRoutes.mjs` |
| Blueprint chat | claude-sonnet-4-6 | `blueprintRoutes.mjs` |
| Site diary structuring | claude-sonnet-4-6 | `module6Routes.mjs` |
| Document review | claude-sonnet-4-6 | `blueprintRoutes.mjs` |
| Cost intelligence | claude-sonnet-4-6 | `costIntelligenceRoutes.mjs` |

**Blueprint response field**: Always `j.reply` — not `j.response` or `j.message`.

**dotenv override caveat**: If shell has `ANTHROPIC_API_KEY=''` (empty string), `dotenv.config()` won't override. Use:
```js
const { parsed: _env = {} } = dotenvConfig();
const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || _env.ANTHROPIC_API_KEY?.trim();
```

---

## File Storage

**Dropbox path convention:**
```
/BLUE LEAF BUILDING/PROJECTS/BLUE LEAF BUILDING/[job address]/
  TENDER DOCS/         ← RFQ documents
  INTERNAL/
    QUOTES/            ← received subcontractor quotes
    PRESALE DOCS/      ← fee proposal PDFs
```

Uses Dropbox team namespace (`DROPBOX_NAMESPACE_ID`). `dropboxClient.mjs` handles token refresh and namespace routing.

**Sequential read rule**: Always use a `for` loop (not `Promise.all`) when reading File objects from Dropbox. Concurrent reads fail for Smart Sync online-only files.

**DOCX template**: Stored in localStorage as base64 under key `blhub_fee_proposal_docx_template_b64`. Template uses single-brace `{VAR}` syntax (docxtemplater v3 + angular-expressions).

---

## Email System

Mail transport (`notifyMail.mjs`): prefers Gmail OAuth over SMTP for all outbound.

- `gmailSend.mjs` — Gmail OAuth2
- `smtpSend.mjs` — SMTP fallback
- `imapQuoteMatch.mjs` — inbound quote email matching (IMAP polling)
- `rfqReminders.mjs` — daily cron for RFQ deadline reminders

---

## Background Processes

Started in `server/dev-api.mjs` on boot:
- **IMAP polling** — polls quote inbox, matches to RFQs
- **RFQ reminders** — daily cron, emails subcontractors with approaching deadlines

---

## Environment Variables

**Client (VITE_ prefix):**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**Server:**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` (optional)
- `SMTP_HOST/PORT/SECURE/USER/PASS/FROM`
- `GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN/SENDER_EMAIL`
- `IMAP_HOST/PORT/SECURE/USER/PASS`
- `DROPBOX_APP_KEY/SECRET/REFRESH_TOKEN`, `DROPBOX_NAMESPACE_ID` (optional)
- `GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN`, `GOOGLE_DRIVE_FOLDER_ID` (optional)
- `BUILDEXACT_API_URL/USERNAME/API_KEY`

Never expose server secrets through `VITE_*` variables.

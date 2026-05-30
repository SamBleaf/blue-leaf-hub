# Blue Leaf Hub — Agent Overview

Last updated: 2026-05-23

This file is the fast orientation guide for agents working in this repo. Read it before making changes.

---

## Product Shape

Blue Leaf Hub is a construction operating system for Blue Leaf Building (Adelaide SA). Single-tenant — one company, one Supabase project.

Modules:
- **Sales Manager** — APB 8-stage lead pipeline, qualifying scorecard, transcript analysis, Blueprint Insight
- **Tender Manager** — RFQ engine, subcontractor directory, quote tracker, tender board, cost intelligence, fee proposals
- **Operations Manager** — project list, schedule manager (Gantt/Sheet/Calendar/Dashboard), WHS/compliance, site diary, site inductions
- **Finance** — invoice upload/approval, WIPAA reviews, progress claims, variations, job budgets
- **Client Portal** — token-based shareable project view (no login required)
- **Blueprint** — embedded AI assistant (chat, SOP generation, document review, RFQ QC)
- **Auth** — Supabase Auth, RBAC (admin/supervisor/employee/client), invitation flow

---

## Commands

```bash
npm run dev              # API (port 8787) + Vite dev server (port 5173) concurrently
npm run start            # API only — Railway production start command
npm run build            # Vite production build → dist/
npm run lint             # ESLint, zero warnings policy
npm test                 # Critical path test runner (read-only, fast)
npm run test:write       # + write/delete operations
npm run test:ai          # + Claude AI endpoints
npm run test:all         # Everything
npm run test:smtp        # Verify SMTP credentials
npm run auth:gmail       # One-time Gmail OAuth flow → GMAIL_REFRESH_TOKEN
npm run auth:drive       # One-time Google Drive OAuth flow
npm run auth:dropbox     # One-time Dropbox OAuth flow → DROPBOX_REFRESH_TOKEN
node scripts/create-test-user.mjs   # Create/reset AI test user for test runner
```

---

## Deployment

**Railway only** — single Express process serves both the API and the built `dist/` frontend.
- Domain: `https://blueleafhub.com.au`
- Start command: `npm run start`
- `vercel.json` exists but is not used in production — ignore it.
- `APP_URL=https://blueleafhub.com.au` must be set in Railway env vars (invitation links, email tracking).

---

## Runtime Architecture

- **Frontend**: React 18, React Router v6, Tailwind CSS, Vite PWA plugin
- **API**: Express in `server/dev-api.mjs`, port 8787 in dev
- **Local dev**: Vite proxies `/api/*` to Express
- **Production**: Express serves `dist/index.html` for all non-API routes
- **Supabase frontend**: anon key + user JWT, RLS enforced
- **Supabase server**: service role key, bypasses RLS entirely

Key config files: `vite.config.js`, `railway.toml`, `CLAUDE.md`

---

## Frontend Map

Routes in `src/App.jsx`.

**Public routes:**
- `/login` → `Login.jsx`
- `/signup` → `Signup.jsx`
- `/accept-invite/:token` → `AcceptInvite.jsx`
- `/induct/:projectId` → `SiteInduction.jsx`
- `/portal/:token/*` → `MyPortal.jsx` (client portal, no login)

**Protected routes** (behind `ProtectedRoute` + `AppShell`):
- `/home` → `Home.jsx`
- `/sales` → `SalesPipeline.jsx`
- `/sales/:id` → `LeadDetail.jsx`
- `/tender-manager/rfq-engine` → `RfqEngine.jsx`
- `/tender-manager/rfq-packages` → `RfqPackageList.jsx`
- `/tender-manager/rfq-packages/:id` → `RfqPackageDetail.jsx`
- `/tender-manager/subcontractors` → `Subcontractors.jsx`
- `/tender-manager/quote-tracker` → `QuoteTracker.jsx`
- `/tender-manager/board` → `TenderBoard.jsx`
- `/tender-manager/board/:jobId` → `TenderDetail.jsx`
- `/tender-manager/cost-intelligence` → `CostIntelligence.jsx`
- `/tender-manager/fee-proposal` → `FeeProposalList.jsx`
- `/tender-manager/fee-proposal/new` → `FeeProposalWizard.jsx`
- `/tender-manager/fee-proposal/:id` → `FeeProposalWizard.jsx`
- `/tender-manager/fee-proposal/template-setup` → `FeeProposalTemplateGuide.jsx`
- `/tender-manager/settings` → `Settings.jsx`
- `/operations` → `OperationsList.jsx`
- `/operations/:projectId` → `OperationsProjectDetail.jsx`
- `/operations/:projectId/schedule` → `ScheduleManager.jsx`
- `/operations/:projectId/whs` → `WhsManager.jsx`
- `/operations/:projectId/diary` → `SiteDiary.jsx`
- `/finance` → finance overview
- `/finance/jobs/:jobId` → job finance detail
- `/portal-admin/:projectId` → `PortalAdmin.jsx`
- `/subcontractors` → subcontractor directory
- `/supervisor` → `SupervisorHome.jsx`

---

## API Entry Point

`server/dev-api.mjs` — main Express process. Registers all route modules, runs IMAP polling loop, runs RFQ reminder cron, serves `dist/` in production.

Direct routes in `dev-api.mjs`:
- `GET  /api/health`
- `GET  /api/integrations/status`
- `POST /api/subcontractor/lookup`
- `POST /api/rfq/extract`
- `POST /api/dropbox/ensure-job-folders`
- `POST /api/dropbox/upload-tender-document`
- `POST /api/dropbox/save-rfq-email-copy`
- `POST /api/dropbox/save-quote-pdf`
- `POST /api/cron/rfq-reminders`
- `POST /api/rfq/remind-one`
- `GET  /api/quote-tracker/unmatched`
- `POST /api/rfq/send`
- `GET  /api/mail/inbox`
- `POST /api/imap/quote-poll`
- `POST /api/rfq/:rfqId/reextract-amount`
- `GET  /api/track/email/:trackingId`

---

## API Modules

| File | Routes prefix | Responsibility |
|------|--------------|----------------|
| `authRoutes.mjs` | `/api/auth/*` | Bootstrap admin, invite, accept invite, user list, invitations |
| `salesRoutes.mjs` | `/api/sales/*` | APB lead pipeline, scorecard, activities, conversations, transcript analysis, Blueprint Insight |
| `module4Routes.mjs` | `/api/tender/*`, `/api/po/*` | Buildexact status, tender outcomes, win/loss, purchase orders |
| `module5Routes.mjs` | `/api/fee-proposal/*`, `/api/settings/fee-proposal-template` | Fee proposal parse (XLSX/PDF), DOCX generation, Drive upload, PDF send, template upload/fetch |
| `module6Routes.mjs` | `/api/schedule/*`, `/api/whs/*`, `/api/diary/*` | Schedule generation/CRUD/AI/export, WHS, site diary, global Gantt, trade conflicts |
| `financeRoutes.mjs` | `/api/finance/*` | Invoice upload/approval, WIPAA, trade categories, IMAP finance poll |
| `financeCCRoutes.mjs` | `/api/finance/jobs/*` | Progress claims, variations, job budgets, WIPAA reviews |
| `jobFinanceRoutes.mjs` | `/api/jobs/:id/finance/*` | Per-job budget management |
| `rfqPackageRoutes.mjs` | `/api/rfq-packages/*` | RFQ packages, trade scopes, recipients, follow-up, addenda |
| `rfqTradeRoutes.mjs` | `/api/rfq-trades/*` | Trade master library |
| `portalRoutes.mjs` | `/api/portal/*` | Client portal admin + public token access |
| `inductionRoutes.mjs` | `/api/induction/*` | Public site induction form + QR |
| `jobsApiRoutes.mjs` | `/api/jobs/*`, `/api/buildexact/*` | Job CRUD, Dropbox folders, Buildexact lookup, fee proposal PDF |
| `blueprintRoutes.mjs` | `/api/blueprint/*` | Chat, learn, review-document, generate-sop, troubleshoot |
| `buildexactIntegrationRoutes.mjs` | `/api/buildexact/*`, `/api/rfq/:id` | Pull estimate, patch RFQ → sync quote to Buildexact, fee proposal accept |
| `costIntelligenceRoutes.mjs` | `/api/cost-intelligence/*` | Sync estimate → job_budgets, project metrics |
| `supervisorRoutes.mjs` | `/api/supervisor/*` | Supervisor dashboard |

---

## Key Server Libraries

| File | Purpose |
|------|---------|
| `supabaseService.mjs` | Service-role Supabase client (bypasses RLS) |
| `normalizedCosts.mjs` | Trade cost normalization — `upsertNormalizedCost()` (called on invoice approve + variation sign), `lockNormalizedCosts()` (called at PC). Drives `normalized_costs` table with $/m² rates per trade |
| `requireAuth.mjs` | Express middleware: validates Supabase Bearer JWT, attaches `req.caller` |
| `notifyMail.mjs` | Outbound email — prefers Gmail OAuth, falls back to SMTP |
| `gmailSend.mjs` / `smtpSend.mjs` | Mail transports |
| `dropboxClient.mjs` | Token refresh, namespace routing, folder creation, file uploads |
| `googleDriveClient.mjs` | Drive upload/export helpers |
| `buildexactClient.mjs` | Buildexact API v3 client |
| `buildexactParser.mjs` | XLSX/PDF → normalised categories. `CATEGORY_MAPPING` is the canonical 37-category taxonomy with ~50 aliases. `getBuildexactCategoryMapping()` is the normalisation function |
| `buildexactDeepIntegration.mjs` | `syncAcceptedQuoteToBuildexact` (fires on RFQ accept), `syncFeeProposalSentToBuildexact`, `pullBuildexactEstimate` |
| `costIntelligenceEstimate.mjs` | `seedJobBudgetsFromEstimateData` (called by parse-xlsx/pdf), `syncEstimateToCostIntelligence` |
| `scheduleGenerate.mjs` | Hardcoded 39-task template + Buildexact SCHED hints via `loadBuildexactScheduleHints()` |
| `scheduleClaudePlan.mjs` | Claude-powered schedule planning |
| `scheduleCriticalPath.mjs` | Critical path computation |
| `jobResolver.mjs` | `resolveJobIdByAddress`, `upsertJobKnowledge` |
| `imapQuoteMatch.mjs` | Inbound quote email matching logic |
| `rfqReminders.mjs` / `sendOneReminder.mjs` | Deadline reminder emails |
| `module6PdfKit.mjs` / `feeProposalPdfKit.mjs` / `poPdfKit.mjs` | PDF generation |
| `signatureEmailHtml.mjs` | Branded email HTML with signature |

---

## Database

Migrations in `supabase/migrations/`, applied in numeric order via Supabase SQL editor.

**Current migration set: 001–045**

| Migration | Key additions |
|-----------|--------------|
| 001 | `jobs`, `subcontractors`, `rfqs`, `cost_intelligence` |
| 002 | `custom_trades` |
| 003 | `user_settings`, `unmatched_quote_emails` |
| 004–005 | RFQ email body, Dropbox path fields |
| 006 | `projects`, `purchase_orders`, `correspondence`, `sequences`, `buildexact_webhook_events` |
| 007 | `fee_proposals` |
| 008–009 | Extracted job fields, RFQ quote fields, queued status |
| 010 | `schedule_tasks`, `contractor_compliance`, `site_inductions`, `swms_templates`, `project_swms`, `site_reports`, `site_diary` |
| 011–012 | Schedule phase constraint, IMAP quote PDF URL |
| 013 | `buildexact_estimates`, `job_knowledge` |
| 014 | `schedule_templates` |
| 015 | `buildexact_deep_integration` — Buildexact sync fields on `jobs` |
| 016 | `leads`, `lead_activities`, `pipeline_stages` + qualifying-score columns on `leads` (`qualify_budget`, `qualify_timeframe`, `qualify_site`, `qualify_decision_maker`, generated `qualify_score`) |
| 017 | `lead_conversations` |
| 018–019 | Schedule baseline + EOT (`schedule_eot`), user profiles/invitations |
| 020 | `financial_documents`, `financial_approvals`, `xero_credentials` |
| 021–029 | Portal, supervisor, address sync, various additions |
| 030 | `rfq_packages`, `rfq_trade_scopes`, `rfq_recipients` |
| 031 | `trade_categories` (37), `job_budgets`, `progress_claims`, `job_variations`, `wipaa_reviews` |
| 032 | `project_metrics`, `normalized_costs`, `cost_benchmarks`, `cost_intelligence_insights`, `pretender_estimates` |
| 033 | `trade_master_library` (37 entries) |
| 034–038 | Contract value trigger, lead↔job link, address sync trigger, schedule soft-delete, schedule trade_master FK |
| 039 | `rfq_packages.job_id` NOT NULL |
| 040 | `email_delivery_events`, trade library seed |
| 041 | Diagnostic and fix migration |
| 042 | Budget seed from XLSX (manual reference — 21 Folkestone) |
| 043 | `trade_category_id` FK on `trade_master_library` + `rfq_trade_scopes` (backfilled 37/37) |
| 044 | RLS tightened — all tables now require `authenticated` role (anon access removed) |
| 045 | PTSA fields on `leads`: `ptsa_services` (JSONB), `ptsa_scope_notes`, `ptsa_validity_days` (default 14), `ptsa_status` (draft/sent/signed/declined), `ptsa_sent_date`, `ptsa_special_terms`, `ptsa_credit_to_contract` |
| 046–059 | Various — workforce, finance, marketing, portal, WHS, schedule improvements |
| 060 | `lead_notes`, `lead_documents` + Supabase Storage RLS for `lead-documents` bucket |
| 061–068 | CRM/mailing list, marketing intelligence, website-enquiry lead fields, WHS engine, carpentry module + budgets/corrections (highest migration is **068**) |

**Three trade taxonomy layers** (all linked by FK since migration 043):
1. `trade_categories` (37) — finance, cost intelligence, job budgets
2. `trade_master_library` (37) — RFQ engine, has `trade_category_id` FK
3. `rfq_trade_scopes` — has `trade_category_id` FK; `buildexactParser.mjs` is the canonical mapping

**RLS posture** (after migration 044):
- All tables require authenticated session
- Server uses service role key (bypasses RLS entirely) — no server routes affected
- Client portal public routes go through Express server, not direct Supabase

---

## Critical API Conventions

- Blueprint chat returns `{ reply: "..." }` — frontend must read `j.reply`, NOT `j.response` or `j.message`
- `APP_URL` env var must be set — used by `appBaseUrl()` in `authRoutes.mjs` for invitation links
- Dropbox sequential reads: use `for...of` loop, NOT `Promise.all` for Smart Sync online-only files
- `dotenv.config({ override: true })` needed if shell exports empty env vars (ANTHROPIC_API_KEY edge case)
- Fee proposal DOCX template: server auto-fetches from Supabase Storage `templates/fee-proposal-template.docx` if not provided in request body

---

## Key Data Flows

**RFQ flow:**
1. Upload/paste tender docs → `POST /api/rfq/extract` (Claude extracts job info)
2. Create RFQ package → `POST /api/rfq-packages` (requires `job_id`)
3. Send RFQs → Gmail/SMTP, Dropbox saves copy
4. IMAP polling matches replies → saves quote PDF to `INTERNAL/QUOTES/`, extracts amount via Claude
5. Quote accepted → `PATCH /api/rfq/:id` fires `syncAcceptedQuoteToBuildexact` automatically

**Fee proposal flow:**
1. Upload Buildexact XLSX/PDF → parse endpoint → seeds `job_budgets` automatically
2. Edit in wizard → generate DOCX (server fetches template from Supabase Storage)
3. Upload to Google Drive for editing → export PDF → Dropbox + email to client
4. Accept → `syncFeeProposalAcceptedToBuildexact` fires

**Schedule flow:**
1. `POST /api/schedule/generate` → Claude generates tasks from project description
2. If Buildexact SCHED items exist (line items with "SCHED" in description), `loadBuildexactScheduleHints()` provides duration hints
3. Tasks stored in `schedule_tasks` with soft-delete (`deleted_at IS NULL`)
4. Ripple cascade available on date changes via `previewRipple()` in `scheduleUtils.js`

---

## File Storage

```
Dropbox:
/BLUE LEAF BUILDING/PROJECTS/BLUE LEAF BUILDING/[job address]/
  TENDER DOCS/           ← RFQ documents sent to subs
  INTERNAL/
    QUOTES/              ← received quote PDFs (auto-saved by IMAP)
    PRESALE DOCS/        ← fee proposal PDFs
    RFQ/                 ← outcome email text copies
    P.O/                 ← purchase order PDFs
    TEMPLATES/           ← fee-proposal-template.docx backup

Supabase Storage:
  templates/fee-proposal-template.docx   ← primary DOCX template source
```

---

## Environment Variables

**Client (VITE_ prefix, bundled into frontend):**
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DIRECTOR_MOBILE`

**Server (never VITE_ prefix):**
- `APP_URL` — production URL e.g. `https://blueleafhub.com.au`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` (default: `claude-sonnet-4-5`)
- `SMTP_HOST/PORT/SECURE/USER/PASS/FROM`
- `GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN/SENDER_EMAIL`
- `IMAP_HOST/PORT/SECURE/USER/PASS` (+ `IMAP2_*` for second inbox)
- `DROPBOX_APP_KEY/SECRET/REFRESH_TOKEN`, `DROPBOX_NAMESPACE_ID`
- `GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN`
- `BUILDEXACT_API_URL/USERNAME/API_KEY`

---

## Known Caveats

- `module6Routes.mjs` is now an orchestrator that imports `scheduleRoutes.mjs`, `whsRoutes.mjs`, `siteDiaryRoutes.mjs`, `operationsRoutes.mjs` — the split is complete.
- `vercel.json` `YOUR-RAILWAY-HOST` placeholder is irrelevant — Railway-only deployment.
- Blueprint lint warnings exist in `src/blueprint/` files — pre-existing, not regressions.
- `schedule_tasks.depends_on` is a legacy array — planned migration to typed `task_dependencies` JSONB (FS/SS/FF/SF + lag).
- DOCX template served from Supabase Storage; Dropbox is a backup copy only.
- Xero integration: `xero_credentials` table exists, no sync logic yet.
- Workforce/procurement intelligence: tables partially exist, no routes or UI yet.

---

## Before You Change Code

1. Read this file + `CLAUDE.md` + the specific module involved.
2. Frontend routes: start with `src/App.jsx` → relevant page in `src/pages/`.
3. API behaviour: start with `server/dev-api.mjs` → relevant `server/lib/*Routes.mjs`.
4. Schema: check migrations 001–045 in order. The service role key bypasses RLS — check both server and frontend paths.
5. Run `npm test` before and after changes.
6. For any change touching `module6Routes.mjs`, map all callers first — it has the widest blast radius.
7. Keep edits scoped. Many integrations share helpers (dropboxClient, notifyMail, buildexactParser).

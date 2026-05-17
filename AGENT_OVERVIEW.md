# Blue Leaf Hub - Agent Overview

Last updated: 2026-05-17

This file is a fast orientation guide for agents working in this repo. Read it before making changes so you understand what is already built and where the important systems live.

## Product Shape

Blue Leaf Hub is a React/Vite PWA plus an Express API for Blue Leaf Building. It currently covers:

- Tender Manager: RFQ generation, subcontractor lists, tender board, quote tracking, purchase orders, tender outcomes, cost intelligence, fee proposals.
- Operations Manager: active project list, schedule manager, WHS/compliance, site reports, site diary, public site inductions.
- Blueprint: embedded AI operations assistant with chat, document review, SOP generation, troubleshooting, and RFQ quality checks.
- Auth: Supabase Auth on the frontend with protected app routes and public login/signup/induction routes.
- Integrations: Supabase, Anthropic, SMTP/Gmail, IMAP, Dropbox, Google Drive, Buildexact.

The app degrades where optional integrations are missing, but most production features need the matching server env vars.

## Commands

- `npm run dev` starts the Express API and Vite dev server together.
- `npm run start` starts only the Express API, used by Railway/Nixpacks.
- `npm run build` builds the Vite app into `dist/`.
- `npm run preview` serves the built frontend with Vite preview.
- `npm run lint` runs ESLint with zero warnings allowed.
- `npm run test:smtp` verifies SMTP credentials.
- `npm run auth:gmail`, `npm run auth:drive`, and `npm run auth:dropbox` run one-time OAuth flows for optional integrations.

There is no automated test suite. Features are verified manually through the running app. `npm run lint` may still report pre-existing Blueprint-related issues.

## Runtime Architecture

- Frontend: React 18, React Router v6, Tailwind, Vite PWA plugin.
- API: Express in `server/dev-api.mjs`.
- Local dev: Vite proxies `/api/*` to the API on `PORT_API` or `8787`.
- Cloud API: `server/dev-api.mjs` listens on `PORT`, then `PORT_API`, then `8787`.
- Static production option: if `dist/` exists, the Express app serves it and falls back to `index.html`.
- Split production option: Vercel hosts `dist/`, Railway hosts the API, and Vercel rewrites `/api/:path*` to Railway.

Key deployment files:

- `vite.config.js`: Vite React/PWA config and local `/api` proxy.
- `vercel.json`: Vercel build output, SPA fallback, and `/api` rewrite placeholder.
- `railway.toml`: Nixpacks build and `npm run start`.
- `CLAUDE.md`: repo guidance and deployment notes.

## Frontend Map

Routes are defined in `src/App.jsx`.

Public routes:

- `/login` -> `src/pages/Login.jsx`
- `/signup` -> `src/pages/Signup.jsx`
- `/induct/:projectId` -> `src/pages/SiteInduction.jsx`
- `/` -> `src/components/RootRedirect.jsx`

Protected routes are wrapped by `src/components/ProtectedRoute.jsx` and rendered inside `src/components/AppShell.jsx`.

Main protected routes:

- `/home` -> `src/pages/Home.jsx`
- `/tender-manager/rfq-engine` -> `src/pages/RfqEngine.jsx`
- `/tender-manager/subcontractors` -> `src/pages/Subcontractors.jsx`
- `/tender-manager/quote-tracker` -> `src/pages/QuoteTracker.jsx`
- `/tender-manager/settings` -> `src/pages/Settings.jsx`
- `/tender-manager/board` -> `src/pages/TenderBoard.jsx`
- `/tender-manager/board/:jobId` -> `src/pages/TenderDetail.jsx`
- `/tender-manager/cost-intelligence` -> `src/pages/CostIntelligence.jsx`
- `/tender-manager/fee-proposal` -> `src/pages/FeeProposalList.jsx`
- `/tender-manager/fee-proposal/new` -> `src/pages/FeeProposalWizard.jsx`
- `/tender-manager/fee-proposal/:id` -> `src/pages/FeeProposalWizard.jsx`
- `/tender-manager/fee-proposal/template-setup` -> `src/pages/FeeProposalTemplateGuide.jsx`
- `/operations` -> `src/pages/OperationsList.jsx`
- `/operations/:projectId` -> `src/pages/OperationsProjectDetail.jsx`
- `/operations/:projectId/schedule` -> `src/pages/ScheduleManager.jsx`
- `/operations/:projectId/whs` -> `src/pages/WhsManager.jsx`
- `/operations/:projectId/diary` -> `src/pages/SiteDiary.jsx`

Legacy redirects exist for `/rfq-engine`, `/subcontractors`, `/quote-tracker`, `/settings`, and `/cost-intelligence`.

## Frontend Shared Code

- `src/lib/supabaseClient.js`: browser Supabase singleton using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; supports local/session auth persistence.
- `src/lib/AuthContext.jsx`: loads Supabase session, listens for auth changes, exposes `user`, `session`, `loading`, and `signOut`.
- `src/lib/useAuth.js`: hook for the auth context.
- `src/lib/BlueprintContext.jsx`: lightweight screen context so Blueprint knows what page/entity the user is viewing.
- `src/lib/ganttRenderer.js`: builds schedule Gantt SVGs and critical path information.
- `src/lib/tradeTemplates.js`, `src/lib/defaultInclusions.js`, `src/lib/templateFields.js`, and similar files hold tender/fee proposal defaults.
- `src/components/AppShell.jsx`: responsive shell, navigation, signed-in user controls, and Blueprint widget.
- `src/components/RfqSettingsModal.jsx`: RFQ configuration UI used by RFQ and settings pages.

## Blueprint

Blueprint is the embedded AI operations assistant.

Frontend:

- `src/blueprint/components/BlueprintAgent.jsx`: chat widget, document QC, SOP, troubleshooting, and inline QC UI.
- `src/blueprint/api/chat.js`: frontend client for Blueprint API calls.
- `src/blueprint/agent/systemPrompt.js`: large role/system prompt defining Blueprint behavior.

Server-side agent logic:

- `src/blueprint/agent/runAgent.js`: Claude agent loop.
- `src/blueprint/agent/tools.js`: tool definitions and executors.
- `src/blueprint/agent/hubDatabase.js`: Hub database helpers.
- `src/blueprint/agent/knowledgeBase.js`: RAG/context lookup.
- `src/blueprint/lib/voyageEmbeddings.js`: Voyage embeddings helper.

API routes are registered in `server/lib/blueprintRoutes.mjs`:

- `/api/blueprint/health`
- `/api/blueprint/chat`
- `/api/blueprint/learn`
- `/api/blueprint/review-document`
- `/api/blueprint/generate-sop`
- `/api/blueprint/troubleshoot`

## API Entry Point

`server/dev-api.mjs` is the main Express process. It:

- Loads `.env` with `dotenv/config`.
- Registers JSON/body parsing and CORS.
- Creates the Anthropic client.
- Registers route modules from `server/lib/`.
- Contains some legacy/core routes directly.
- Runs optional reminder and IMAP polling loops.
- Serves `dist/` when built files are present.

Core direct routes in `server/dev-api.mjs` include:

- `/api/health`
- `/api/subcontractor/lookup`
- `/api/rfq/extract`
- `/api/integrations/status`
- `/api/dropbox/ensure-job-folders`
- `/api/dropbox/upload-tender-document`
- `/api/dropbox/save-rfq-email-copy`
- `/api/dropbox/save-quote-pdf`
- `/api/cron/rfq-reminders`
- `/api/rfq/remind-one`
- `/api/quote-tracker/unmatched`
- `/api/rfq/send`
- `/api/mail/inbox`
- `/api/imap/quote-poll`
- `/api/rfq/:rfqId/reextract-amount`

## API Modules

`server/lib/module4Routes.mjs` - Tender/RFQ operations:

- Buildexact status and webhook events.
- Tender query drafting and outcome emails.
- Win/loss finalisation.
- Purchase order issuing.

`server/lib/module5Routes.mjs` - Fee proposals:

- Parse Buildexact XLSX or PDF.
- Generate DOCX from the local/template-backed proposal model.
- Upload editable proposal to Google Drive.
- Convert DOCX/Google Doc to PDF.
- Send proposal PDF by email and upload to Dropbox.

`server/lib/module6Routes.mjs` - Operations:

- Schedule generation, loading, patching, deleting, AI analysis, PDF/Gantt export, and task advice.
- WHS compliance records, inductions, site reports, SWMS templates.
- Site diary structure, save, and load.

`server/lib/inductionRoutes.mjs` - Public induction flow:

- Project induction info.
- Induction submission and QR/form support.

`server/lib/jobsApiRoutes.mjs` - Job utilities:

- Merge extracted job data JSON.
- Delete tender/job records.
- Resolve unmatched quote emails.
- Generate fee proposal PDFs.
- Buildexact job lookup.

Other important server files:

- `server/lib/supabaseService.mjs`: service-role Supabase client.
- `server/lib/dropboxClient.mjs`: Dropbox token refresh, namespace routing, folder creation, uploads.
- `server/lib/notifyMail.mjs`: common outbound email entry point, prefers Gmail OAuth over SMTP.
- `server/lib/gmailSend.mjs` and `server/lib/smtpSend.mjs`: mail transports.
- `server/lib/googleDriveClient.mjs`: Google Drive upload/export helpers.
- `server/lib/buildexactClient.mjs`: Buildexact API client.
- `server/lib/buildexactWebhook.mjs`: Buildexact webhook handling.
- `server/lib/jobResolver.mjs`: job/estimate knowledge and matching helpers.
- `server/lib/scheduleGenerate.mjs`, `server/lib/scheduleClaudePlan.mjs`, `server/lib/scheduleCategories.mjs`, `server/lib/scheduleCriticalPath.mjs`: schedule planning and dependency logic.
- `server/lib/module6PdfKit.mjs`, `server/lib/feeProposalPdfKit.mjs`, `server/lib/poPdfKit.mjs`: PDF generators.
- `server/lib/rfqReminders.mjs` and `server/lib/sendOneReminder.mjs`: deadline reminder logic.
- `server/lib/imapQuoteMatch.mjs`: inbound quote email matching.

## Database

Database migrations are in `supabase/migrations/` and should be applied in numeric order.

Current migration set:

- `001_blue_leaf_schema.sql`: base `jobs`, `subcontractors`, `rfqs`, and `cost_intelligence`.
- `002_custom_trades.sql`: custom trade labels.
- `003_integrations.sql`: integration settings and unmatched quote emails.
- `004_rfqs_email_body.sql`: RFQ email body storage.
- `005_jobs_dropbox_paths.sql`: Dropbox path fields on jobs.
- `006_module4_operations_buildexact.sql`: projects, purchase orders, correspondence, sequences, Buildexact webhook events, job win/loss fields.
- `007_module5_cost_intel_fee_proposal.sql`: cost intelligence additions and fee proposals.
- `008_job_extract_correspondence_fee_pdf.sql`: extracted job fields, RFQ quote fields, correspondence attachments, fee proposal PDF fields.
- `009_rfqs_queued_status.sql`: queued RFQ status.
- `010_module6_operations.sql`: schedules, WHS compliance, inductions, SWMS, site reports, site diary.
- `011_schedule_tasks_dynamic_phases.sql`: schedule phase constraint loosened for dynamic phases.
- `012_imap_quote_pdf_url_correspondence_attachments.sql`: quote PDF URL and correspondence attachment support.
- `013_job_knowledge_estimate_quotes.sql`: Buildexact estimates, job knowledge, and RFQ estimate quote linkage.

Key tables include:

- Tender: `jobs`, `subcontractors`, `custom_trades`, `rfqs`, `cost_intelligence`, `unmatched_quote_emails`.
- Operations: `projects`, `schedule_tasks`, `contractor_compliance`, `site_inductions`, `swms_templates`, `project_swms`, `site_reports`, `site_diary`.
- Commercial/admin: `purchase_orders`, `correspondence`, `sequences`, `fee_proposals`, `user_settings`.
- Integrations/knowledge: `buildexact_webhook_events`, `buildexact_estimates`, `job_knowledge`.

Many migrations currently allow broad anon access through RLS policies. Be careful before assuming server-only access unless the frontend/client path has been checked.

## External Integrations

Client env:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Server env:

- Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Anthropic: `ANTHROPIC_API_KEY`, optional `CLAUDE_MODEL`
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Gmail OAuth: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER_EMAIL`
- IMAP: `IMAP_HOST`, `IMAP_PORT`, `IMAP_SECURE`, `IMAP_USER`, `IMAP_PASS`
- Dropbox: `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN`, optional `DROPBOX_NAMESPACE_ID`
- Google Drive: `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`, optional `GOOGLE_DRIVE_FOLDER_ID`
- Buildexact: `BUILDEXACT_API_URL`, `BUILDEXACT_USERNAME`, `BUILDEXACT_API_KEY`

Never expose server secrets through `VITE_*` env vars.

## Major User Flows

RFQ/tender flow:

1. User creates or imports tender/job data in `RfqEngine`.
2. `/api/rfq/extract` uses Claude to extract RFQ/job information.
3. Dropbox folders and tender docs can be created/uploaded.
4. RFQs can be sent by email through Gmail OAuth or SMTP.
5. IMAP polling and quote tracker match inbound quote emails.
6. Tender detail supports outcome emails, win/loss finalisation, and PO creation.

Fee proposal flow:

1. User starts from `FeeProposalList` or opens `FeeProposalWizard`.
2. Buildexact XLSX/PDF is parsed.
3. User edits structured fields.
4. DOCX is generated from the template and uploaded to Google Drive for editing.
5. Final PDF is exported, uploaded to Dropbox, and emailed to the client.

Operations flow:

1. `OperationsList` and `OperationsProjectDetail` show active projects.
2. `ScheduleManager` generates and edits AI-backed schedules, dependencies, critical path, and Gantt PDFs.
3. `WhsManager` manages contractor compliance, SWMS, inductions, and site reports.
4. `SiteDiary` saves structured diary entries and reports.
5. Public `/induct/:projectId` lets site visitors submit inductions without app login.

Blueprint flow:

1. `AppShell` renders the Blueprint widget globally.
2. Pages can set `BlueprintContext` so the assistant knows the current screen.
3. Blueprint calls `/api/blueprint/*` routes for chat, learning, review, SOP, and troubleshooting.
4. RFQ pages can use inline Blueprint QC before sending.

## File Storage Conventions

Dropbox project path convention:

```text
/BLUE LEAF BUILDING/PROJECTS/BLUE LEAF BUILDING/[job address]/
  TENDER DOCS/
  INTERNAL/
    QUOTES/
    PRESALE DOCS/
```

Fee proposal templates:

- Browser stores the Word template base64 in localStorage under `blhub_fee_proposal_docx_template_b64`.
- `BLB_TENDER_TEMPLATE.docx` is also used as the default/static template.
- DOCX templating uses docxtemplater with single-brace placeholders like `{CLIENT_NAME}`.

## Styling and UI

- Tailwind CSS is configured in `tailwind.config.js`.
- Use existing design tokens instead of raw hex values in JSX where possible.
- Key tokens: `primary`, `accent`, `warning`, `surface`, `page`, `ink`, `muted`, `hairline`.
- Common radii: `rounded-card`, `rounded-lg`.
- Font: Lato.
- Accessible focus styling: `.focus-ring`.

## Known Caveats

- No automated tests are present.
- Full lint may fail on existing Blueprint files because of `process` references and warnings.
- The Vercel `/api` rewrite still contains the placeholder `YOUR-RAILWAY-HOST`; replace it after Railway deploys.
- Production can run split-hosted via Vercel/Railway or from a single Express process serving `dist/`.
- Some RLS policies are intentionally broad in migrations; review before tightening auth/security.
- Avoid changing `.env` values or committing secrets.

## Before You Change Code

1. Check `AGENT_OVERVIEW.md`, `CLAUDE.md`, and the specific page/module involved.
2. For frontend route behavior, start with `src/App.jsx` and the page in `src/pages/`.
3. For API behavior, start with `server/dev-api.mjs`, then the relevant `server/lib/*Routes.mjs` file.
4. For schema assumptions, check all migrations through `013_job_knowledge_estimate_quotes.sql`.
5. Prefer existing `/api` relative fetch pattern. Production relies on same-origin rewrites/proxies.
6. Keep edits scoped; this repo has several integrations and broad blast radius from shared API/client helpers.

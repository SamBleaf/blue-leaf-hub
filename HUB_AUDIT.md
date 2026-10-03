# HUB_AUDIT.md — Blue Leaf Hub → standalone trade-crew SaaS

**Purpose.** Read-only audit of this codebase to identify the proven parts that can be
rebuilt as a **standalone multi-tenant subscription product** for small trade crews.
No code was changed. Secrets are reported by file + variable name only — never values.

**In-scope for the new product:** timesheets + approvals · crew allocations (Workforce
planner) · job cost tracking (carpentry costs + budgets) · employee mobile app (Worker
PWA — time entry + planner, offline) · job cost forecasting · WHS records with export ·
employee cost / charge-up rate calculator · charge-up of wage costs to a Xero invoice.
**Out of scope:** sales/CRM pipeline · tendering/RFQ · fee proposals · marketing · client
portal · operations schedule/Gantt · site diary · Cal.com meetings · Blueprint AI.

**Method.** 8 parallel read-only auditors over migrations, routes, server libs, and the
Worker PWA; findings synthesised here. Date: 2026-09-19.

> **The spinout-deciding findings up front** (verified against the code — see §3, §7):
> 1. **No SaaS tenant/org/company column exists on any business table.** The schema is
>    100% single-company. The only `tenant_id` columns anywhere (`xero_credentials`,
>    `xero_invoices.xero_tenant_id`) are *Xero's own* organisation id, not an account
>    boundary. Every in-scope table needs a new `account_id` + RLS in the rebuild.
> 2. **Xero is app-global, not per-subscriber.** Tokens live in `xero_credentials` keyed
>    on the Xero org; `getConnectedTenant()` just does `limit 1` (code comment: "we
>    operate a single Blue Leaf org"), and `disconnectXero()` deletes *all* rows. Must be
>    re-keyed per subscriber.
> 3. **In-scope capability #8 (charge-up → Xero invoice) is NOT actually built.** The
>    charge-up service computes wage cost + charge-out $, but nothing pushes it to a Xero
>    invoice — `INVOICE_TYPES` only covers concept/design fees. This is net-new work, not
>    a proven part to lift. (Offline Worker-PWA writes, capability #4, are likewise absent.)
>
> Net: most **UI/business-logic can be ported; the data + integration layers must be
> rewritten** for tenancy, and two of the eight in-scope capabilities don't exist yet.

---

## 1. STACK SNAPSHOT

Confirmed against package.json, config files, and file counts. Repo root is not a git repo per env, but `.git` exists in the listing — history is present.

### Framework + library versions (package.json)

| Area | Package | Version | Notes |
|---|---|---|---|
| UI runtime | react / react-dom | ^18.3.1 | SPA, StrictMode, single root in src/main.jsx |
| Build/dev | vite | ^6.3.5 | + @vitejs/plugin-react ^4.4.1 |
| Router | react-router-dom | ^6.28.0 | v7 future flags on (v7_startTransition, v7_relativeSplatPath) |
| API server | express | ^4.21.2 | single process, server/dev-api.mjs |
| DB/Auth/Storage client | @supabase/supabase-js | ^2.49.4 | used both client (src/lib/supabaseClient.js) and server (server/lib/supabaseService.mjs) |
| State lib | NONE | — | no react-query / redux / zustand / swr / jotai (grep confirmed). Global state = 3 React contexts only |
| Styling | tailwindcss | ^3.4.17 | + @tailwindcss/forms, @tailwindcss/typography; no component library (Radix/MUI/shadcn absent) |
| PWA | vite-plugin-pwa | ^1.0.0 | Workbox under the hood |
| Charts | recharts | ^3.8.1 | |
| DnD (planner) | @dnd-kit/core, /sortable, /utilities | ^6.3.1 / ^10 / ^3.2.2 | Workforce planner + task reorder |
| Gantt/flow | gantt-task-react ^0.3.9, @xyflow/react ^12.10.2 | | schedule (out of scope) |
| Maps | mapbox-gl ^3.25.0 | | sales leads map / site enrichment |
| AI | @anthropic-ai/sdk ^0.39.0 | | via server/lib/aiGateway.mjs |
| Email | nodemailer ^8, resend ^6.12.4, imapflow ^1.3.3, mailparser ^3.9.8, googleapis ^148 (gmail) | | multiple send paths (30 server files import a mail helper) |
| Docs/PDF | pdfkit ^0.18, pdf-parse, docxtemplater ^3.68, pizzip, xlsx ^0.18.5, qrcode | | invoice/proposal/WHS pack generation |
| Other | jsonwebtoken ^9 (portal + worker tokens), ws ^8.20, exifr, ffmpeg-installer | | |

Node engine pinned `>=20`. `type: module` (ESM throughout; server files are .mjs, frontend .jsx/.js).

### Build tooling

| File | Role |
|---|---|
| vite.config.js | Two HTML entry points — index.html (Hub, /manifest.webmanifest) and worker.html (Worker PWA, /manifest.json) — both bootstrap the same /src/main.jsx. VitePWA with `manifest:false` (manifests are static in public/, not generated). Workbox: `skipWaiting`+`clientsClaim`+`cleanupOutdatedCaches`, globPatterns precache all js/css/html/png/svg/woff2, navigateFallbackDenylist = /^\/api/ and /^\/worker/, max cache file 4 MiB. Dev server port 5174 strictPort, proxies /api → 127.0.0.1:$PORT_API (default 8787). devOptions.enabled=false (SW off in dev). |
| nixpacks.toml | Railway build env: nodejs_20 + libreoffice + ffmpeg (LibreOffice for DOCX→PDF, ffmpeg for marketing media). |
| railway.toml | Builder nixpacks; build `npm run build`; start `npm run start` (node server/dev-api.mjs); restart ON_FAILURE. This runs the API server on Railway. |
| vercel.json | SPA host. Rewrites: /api/* → https://blue-leaf-hub-production.up.railway.app/api/* (proxies frontend calls to the Railway API); /worker and /worker/* → /worker.html; everything else → /index.html. outputDirectory dist. |
| tailwind.config.js | Brand palette (primary #006c9b etc.), Lato font, custom radii. |
| postcss.config.js | tailwind + autoprefixer. |

Deploy split confirmed: **Vercel = SPA (dist)**, **Railway = Express API**. Frontend never talks to the API directly; Vercel rewrites proxy /api to Railway.

### State management + routing

- Routing: single `<BrowserRouter>` in src/App.jsx (441 lines), one big `<Routes>` tree. Auth-gated via `ProtectedRoute` + `RoleRoute` (allowed-roles + redirect). Roles seen: admin, supervisor, employee, client. Some pages lazy-loaded (Marketing, Portal, ClientPortal, PortalV2Admin); most eager-imported.
- Global state = **React Context only**, three providers nested in App.jsx:
  - src/lib/AuthContext.jsx — Supabase session + user profile/role; complex cold-load/role-resolution handling (keys on profileUserId).
  - src/lib/ProjectContext.jsx — active project, persisted to localStorage (`blhub_active_project`).
  - src/lib/BlueprintContext.jsx — Blueprint AI (out of scope).
- Server calls go through src/lib/apiFetch.js (apiFetch/apiPost/apiPatch/apiDelete/apiBlob), which wraps src/lib/authFetch.js and always returns `{ok,data,error}` (never throws). Worker PWA uses src/lib/workerFetch.js (magic-link token in localStorage `blhub_worker_token`, sent as `x-worker-token` header; strips token from URL when standalone). Server standard response via server/lib/apiResponse.mjs.

### UI library
Tailwind + hand-rolled components in src/components/ui and per-domain component folders. No third-party component kit.

### PWA / service worker
- Dual-identity PWA from one SPA: Hub (office/desktop) via index.html + /manifest.webmanifest; Worker (site crew) via worker.html + /manifest.json. SW registered in src/main.jsx via `virtual:pwa-register` (autoUpdate). In dev, main.jsx actively **unregisters** all SWs.
- Workbox precaches the app shell (js/css/html/icons) — enables offline **app load**. **There is NO runtime caching or background-sync for /api** (denylisted). 
- **Offline write support does NOT exist.** The only offline handling is src/components/worker/WorkerLayout.jsx (line 136): an offline banner reading "You're offline — changes can't be saved until you reconnect." Grep for indexedDB/idb/dexie/outbox/offlineQueue/BackgroundSync across src/ returns nothing relevant (only rfqPdfStorage.js / RfqEngine.jsx, unrelated). **In-scope requirement #4 (Worker PWA MUST work offline) is NOT met by the current code** — the PWA installs and loads offline, but time entry / planner writes fail offline with no queue/replay. This is a build-from-scratch item, not a proven part to lift.

### Test coverage

| Layer | Location | Reality |
|---|---|---|
| Playwright e2e | e2e/ | Only **17 spec files**. Mix of smoke (api-health), security (unauthenticated-routes, client-isolation, crm-send-role), auth route-protection, a few visual + client-portal + 3 batch-a workflow specs. Thin and skewed to sales/portal/security — no e2e for timesheets/planner/carpentry/charge-up. |
| API integration harness | scripts/test-critical-paths.mjs (`npm test`) | Runs against a live local server on :8787 with a seeded Supabase test user. Read-only by default; `--write`/`--ai`/`--all` flags. Broad endpoint smoke, not deep assertions. |
| batch-a harness | scripts/batch-a/ (~89 files) | Large custom runner suite (w01–w22, wf1). Real coverage of many workflows incl. w15-timesheet-auth, w16-allocation-baseline, w17-planner-*/worker-tasks/qc, w14-whs-baseline, wf1-carpentry-tasks — mostly auth/gate/shape "baseline" checks against a running server, not pure unit logic. |
| **Money-logic UNIT tests** | scripts/tests/*.test.mjs + scripts/test/*.test.mjs | **Yes — the in-scope money logic IS unit-tested** (plain-assertion node scripts, no framework, exit 1 on fail): charge-up.test.mjs (rollupBySubJob, categoryTotals, chargeOutFromMargin, AU financial-year rollup), margin-projection.test.mjs (scheduleElapsed, categoryPctComplete, projectMargin), internalLeaveCost.test.mjs, workforce-pipeline.test.mjs, plus carpentry-*, whs-*, subtask-rollup, task-assignments, stage-ripple. These are the highest-value proven assets for the rebuild. Note: they are NOT wired into `npm test`; run manually via `node scripts/tests/<x>.test.mjs`. |

Bottom line on tests: e2e is thin/smoke; the in-scope pure money math (charge-up rollups, margin/forecast projection, cost rates) has genuine deterministic unit tests directly over server/lib/chargeUpService.mjs, marginProjection.mjs, costModelService.mjs consumers — trustworthy to port.

### Lines of code by top-level folder

Counted with find + cat + wc -l over code extensions (js/jsx/mjs/ts/tsx/sql/css/html).

| Folder | LOC | Notes |
|---|---|---|
| src/ (total) | 85,743 | Vite React SPA |
| — src/pages/ | 41,474 | route/page components (largest: RfqEngine 3,274, TenderDetail 3,075, LeadDetail 2,841, CarpentryJobDetail 2,456) |
| — src/components/ | 31,393 | domain component folders (carpentry, crm, finance, workforce, worker, portal, sales, tender, schedule, ui…) |
| — src/lib/ | 6,611 | contexts, apiFetch, domain helpers |
| — src/blueprint/ | 3,077 | Blueprint AI (out of scope) |
| — src/ui-review/ | 2,629 | dev-only UI review mode (tree-shaken from prod) |
| — src/hooks/ | 32 | nearly empty (hooks mostly live in src/lib) |
| server/ (total) | 67,954 | Express API |
| — server/lib/ | 64,704 | all route + service modules (incl. subdirs whs/, controlTower/, emailTemplates/, scopeIntelligence/) |
| — server/dev-api.mjs | 3,191 | single entry: middleware, blanket role guards, registers ~55 route modules |
| supabase/ | 12,013 | **200 migration files** in supabase/migrations (numbered 001→203 with gaps); 19 files define Postgres functions/RPCs, 7 define views |
| scripts/ | 23,273 | test harnesses, seeders, auth/CLI utilities, migration helpers |
| e2e/ | 2,155 | 17 Playwright specs |
| public/ | 0 | static assets only (icons, manifests) — no counted code |

Verified-fact reconciliation: src ~85.7k ✓, server ~68k ✓, supabase ~12k / 200 files ✓, scripts ~23k ✓.

## 2. MODULE INVENTORY

One row per feature module / top-level route family. Approx LOC = primary page(s) + primary route file(s); component-folder LOC not fully summed. Supabase objects from `.from()`/`.rpc()` greps on the primary route file(s). "In scope" mapped to the 8 named capabilities.

| Module | One-line purpose | Key files/folders | Approx LOC | Supabase tables/views/RPCs it touches | External integrations | In scope |
|---|---|---|---|---|---|---|
| Auth / onboarding | Login, signup, password reset, invite accept, session+role | src/pages/Login.jsx, Signup.jsx, ResetPassword.jsx, AcceptInvite.jsx; src/lib/AuthContext.jsx; server/lib/authRoutes.mjs (556) | ~1,750 | user_profiles, employees, invitations, projects, project_client_users | Supabase Auth | partial (infra needed for all caps) |
| Home / dashboard | Role landing page + quick actions | src/pages/Home.jsx (397) | ~400 | (aggregates via other APIs) | — | partial (infra) |
| Workforce (timesheets + planner) | Timesheet approvals + crew allocation planner (Team, planner DnD, RDO/holidays, leave, settings) | src/pages/Workforce.jsx (1,464), WorkforceTeam.jsx (527); src/components/workforce/*; server/lib/workforceRoutes.mjs (4,175), workforcePipelineRoutes.mjs (346), workforceCapacity.mjs, workingCalendar.mjs | ~6,900 | timesheets, timesheet_entries, workforce_allocations, workforce_crews, workforce_crew_members, workforce_planner_jobs, workforce_day_off_requests, workforce_rdo_patterns, workforce_employee_rdo_dates, workforce_team_rdo_dates, workforce_public_holidays, workforce_settings, employees, jobs, site_tasks, carpentry_jobs/_budgets, charge_up_jobs, internal_categories; RPC workforce_allocation_assign, workforce_allocation_move, alloc_carpentry_sequence | — | **yes (#1, #2)** |
| Worker PWA (mobile) | Site-crew time entry + week + tasks + day-off, magic-link auth | src/pages/worker/* (WorkerHome, WorkerLogHours 641, WorkerTasks 1,373, WorkerWeek, WorkerRequestDayOff); src/components/worker/*; src/lib/workerFetch.js, workerJob.js, workerPhoto.js; worker.html | ~3,600 | (via worker API → timesheets, timesheet_entries, site_tasks, charge_up_jobs) | JWT worker token | **yes (#4)** — but OFFLINE writes NOT implemented (banner only; no queue) |
| Field app (2nd mobile shell) | Older/alt mobile shell: home, jobs, tasks, WHS, diary | src/pages/field/* (FieldLayout, FieldHome, FieldJobs, FieldTasks, FieldWHS, FieldDiary) | ~550 | (reuses ops/whs/diary APIs) | — | partial — overlaps Worker PWA scope; likely redundant vs worker/* |
| Carpentry job costs | Carpentry job dashboard + detail: budgets, costs, milestones, performance, stage schedule, forecasting | src/pages/CarpentryDashboard.jsx (795), CarpentryJobDetail.jsx (2,456); src/components/carpentry/*; server/lib/carpentryRoutes.mjs (2,554), carpentryStages*.mjs, marginProjection.mjs, subtaskRollup.mjs | ~6,500 | carpentry_jobs, carpentry_job_budgets, carpentry_budget_line_items, carpentry_job_costs, carpentry_job_milestones, carpentry_job_performance, carpentry_job_stage_schedule, carpentry_site_diary, timesheets, timesheet_entries, site_tasks, financial_documents, employees, RDO tables | geocodeService (site facts) | **yes (#3 job cost tracking/budgets, #5 forecasting)** |
| Charge-up | BLB "Charge Up" sub-jobs: per-site hours + charge-out $ + margin, FY rollups | src/pages/ChargeUpJobDetail.jsx (364); src/components/carpentry/ChargeUpSiteDetailModal.jsx; server/lib/chargeUpRoutes.mjs (388), chargeUpService.mjs | ~900 | charge_up_jobs, timesheets, timesheet_entries, site_tasks, employees, carpentry_site_diary | — | **yes (#7 charge-out rate, #8 partial)** — computes charge-out $; **no direct push to a Xero invoice found** (see Xero row) |
| Company cost model / rate calc | Employee cost + charge-up rate calculator (wage + on-costs + overhead → break-even & charge-out) | server/lib/companyCostModelRoutes.mjs (136), costModelService.mjs, normalizedCosts.mjs; settings UI in src/pages/Settings.jsx / components/settings | ~600 | company_cost_model, employee_cost_rates, employees | — | **yes (#7 cost/charge-up rate calculator)** |
| Xero integration | Xero OAuth + invoice fetch/send/sync; pay links; PDF to Dropbox | server/lib/xeroRoutes.mjs (273), xeroClient.mjs, xeroInvoices.mjs; src/components/finance XeroPane/XeroInvoiceCard | ~1,000+ | xero_invoices, leads, lead_activities, correspondence | Xero API, Dropbox | **partial (#8)** — connection + invoicing exist but wired to **sales design/concept fees per-lead**, NOT to wage-cost charge-up. Charge-up→Xero invoice link is NOT present in code; rebuild must add it |
| WHS records | WHS manager, WHS engine/questionnaire, SWMS, WHS packs, incident reports, inductions | src/pages/WhsManager.jsx (565), WhsEngine.jsx (351), SiteInduction.jsx (336); server/lib/whsRoutes.mjs (334), server/lib/whs/* (whsEngineRoutes 386, carpentrySwmsRoutes, carpentryWhsPackRoutes, packPdfKit, whsRenderer, whsRiskRules…); inductionRoutes.mjs (175) | ~3,500 | contractor_compliance, site_inductions, site_reports, swms_templates, project_swms, subcontractors, purchase_orders, projects, whs_swms_signon | PDF (pdfkit), Dropbox (pack/incident PDF upload) | **yes (#6)** — export = PDF to Dropbox + QR (no CSV/xlsx export found; "export with export" requirement partly met via PDF only) |
| Finance manager / job finance | Job budgets, variations, progress claims, WIPAA, financial docs, invoice classify/poller | src/pages/FinanceManager.jsx (109), JobCommandCentre.jsx (894), JobDashboardSelector.jsx; server/lib/financeRoutes.mjs (1,639), financeCCRoutes.mjs (2,452); jobFinanceRoutes.mjs (1,201, DEREGISTERED) | ~5,000 | job_budgets, job_budget_history, job_variations, progress_claims, progress_claim_payments, wipaa_reviews, financial_documents, financial_approvals, carpentry_job_budgets, carpentry_jobs, fee_proposals, trade_categories, jobs, projects, timesheet_entries, user_profiles/settings | email (delivery events), Dropbox | partial — job cost tracking (#3) overlaps carpentry; progress claims/variations = out of scope. Tangled: financeCC touches carpentry budgets + timesheets |
| Cost Intelligence | Pre-tender cost benchmarking / estimating (AI) | src/pages/CostIntelligence.jsx (1,606); server/lib/costIntelligenceRoutes.mjs (711), costIntelligenceEstimate.mjs | ~2,400 | cost_intelligence, cost_benchmarks, normalized_costs, pretender_estimates, project_metrics, trade_categories, job_documents, jobs | Anthropic AI | no (pre-tender estimating, not job-cost forecasting) |
| Sales pipeline / CRM | Lead pipeline, lead detail, contacts, scorecard, reference projects, timeline | src/pages/SalesPipeline.jsx (641), SalesManager.jsx, LeadDetail.jsx (2,841), ReferenceProjects.jsx; server/lib/salesRoutes.mjs (2,383), crmRoutes.mjs (1,534), salesLeadsMapRoutes.mjs, leadActivities/leadReminders/etc. | ~9,000 | leads, lead_activities, lead_conversations, lead_documents, lead_notes, lead_signals, crm_contacts, crm_interactions, correspondence, fee_proposals, jobs, projects, reference_projects, v_lead_timeline, v_crm_people, mailing_lists… | Gmail/IMAP, Resend, Mapbox, Cal.com | no |
| Tendering / RFQ engine | Tender board, tender detail, RFQ engine, RFQ packages, trades, subcontractors | src/pages/TenderBoard.jsx, TenderDetail.jsx (3,075), RfqEngine.jsx (3,274), RfqPackageList.jsx, Subcontractors.jsx (1,881); server/lib/tenderRoutes.mjs (331), rfqPackageRoutes.mjs (1,074), rfqTradeRoutes.mjs, tenderSubmissions/tenderReadModel/rfq*.mjs | ~14,000 | rfqs, rfq_packages, rfq_recipients, rfq_trade_scopes, rfq_addenda, rfq_quote_submissions, rfq_quote_attachments, trade_master_library, subcontractors, tender_email_templates, jobs, leads | IMAP (quote match), Gmail/SMTP, PDF | no (largest OOS module; RFQ shares jobs/leads spine) |
| Quote Inbox | Inbound quote email classify/suggest | src/pages/QuoteInbox.jsx (16, thin); server/lib/quoteInboxClassify.mjs, quoteInboxSuggest.mjs (in finance/rfq routes) | ~200 | unmatched_quote_emails, cost_intelligence, rfqs | IMAP, Anthropic AI | no |
| Fee proposals | Fee-proposal list + wizard + template guide | src/pages/FeeProposalList.jsx, FeeProposalWizard.jsx (1,380), FeeProposalTemplateGuide.jsx; server/lib/feeProposal*.mjs, module5/module6Routes | ~2,500 | fee_proposals, jobs, leads | pdfkit, docxtemplater, LibreOffice, Dropbox | no |
| Operations / schedule | Ops project list/detail, schedule manager (Gantt), critical path | src/pages/OperationsList.jsx, OperationsProjectDetail.jsx (1,575), ScheduleManager.jsx (990); server/lib/operationsRoutes.mjs (618), scheduleRoutes.mjs (1,401), scheduleEngine/Gantt/CriticalPath/Generate/Intelligence.mjs | ~7,500 | projects, jobs, schedule_tasks, schedule_templates, schedule_eot, procurement_items, project_metrics, purchase_orders, carpentry_jobs, supervisor_tasks, buildexact_estimates | Anthropic AI (schedule plan), Buildxact | no (tangled: reads carpentry_jobs) |
| Procurement | Purchase orders, suppliers, procurement items, AI/learning | src/pages/Procurement.jsx (516); server/lib/procurementRoutes.mjs (724), procurementService/AiService/LearningService.mjs, poPdfKit.mjs | ~2,000 | purchase_orders, procurement_items, suppliers, supplier_lead_observations, portal_decisions, company_profile, trade_categories, jobs, projects | Anthropic AI, PDF, email | no |
| Site diary | Site diary entries | src/pages/SiteDiary.jsx (549); server/lib/siteDiaryRoutes.mjs (196), siteMedia.mjs | ~750 | site_diary, projects | media/photo storage | no |
| Client portal (v1 + v2 + logged-in) | Token portal, logged-in client portal v2, admin | src/pages/portal/*, clientportal/*, MyPortal.jsx, PortalAdmin.jsx (544), PortalV2Admin.jsx (570); server/lib/portalRoutes.mjs (1,332), portalV2Routes.mjs (1,286), portalV2AdminRoutes.mjs (796), portalNotify/Sync/Integration.mjs | ~7,500 | portal_* (claims, decisions, messages, milestones, updates, documents, meetings, notifications, audit_logs), project_client_users, client_actions, client_selections, selection_options, home_finishes, warranty_*, progress_claims, job_variations, project_photos | JWT, email, media | no |
| Marketing / content studio | Campaigns, content items, media, library, schedule, intelligence, area performance | src/pages/Marketing.jsx + src/components/marketing/*; server/lib/marketing*Routes.mjs (~12 files, incl. marketingIntelligenceRoutes 1,859, marketingRoutes 1,490, marketingLibraryInboxRoutes 1,111) | ~10,000 | marketing_campaigns, marketing_content_items, marketing_media_assets/exports, marketing_music_library, campaign_schedule_slots | Anthropic AI, ffmpeg, Gmail/IMAP, Google Drive/Sheets | no (large OOS) |
| Cal.com meetings | Lead meeting booking (book-on-behalf, webhook, projection) | server/lib/calcomRoutes.mjs (275), calcom.mjs, calcomApi.mjs, calcomWebhook.mjs, calcomProjection.mjs | ~1,200 | lead_meetings, leads, lead_activities, crm_contacts, correspondence | Cal.com API | no |
| Blueprint / LLM sales AI | Sales AI assistant + QC | src/blueprint/*, src/lib/BlueprintContext.jsx; server/lib/blueprintRoutes.mjs (513), blueprintQc.js, aiGateway.mjs | ~4,000 | leads (+ external blueprint-agent repo via npm scripts) | Anthropic AI, external blueprint-agent | no |
| Buildxact integration | Estimate sync/reconcile/webhook/deep integration | server/lib/buildexactIntegrationRoutes.mjs (220), buildexactClient/Sync/Reconcile/Parser/Webhook/DeepIntegration.mjs | ~2,500 | buildexact_estimates, buildexact_job_sync, buildexact_webhook_events | Buildxact API | no |
| Control Tower | Internal ops data-layer / admin overview | server/lib/controlTower/controlTowerRoutes.mjs (55), ctData.mjs | ~600 | (aggregate reads across jobs/leads/etc.) | — | no |
| Supervisor / Confirm queue | Supervisor home + task-confirm queue | src/pages/SupervisorHome.jsx (447), ConfirmQueue.jsx (123); server/lib/supervisorRoutes.mjs (63), taskAssignments/taskAudit.mjs | ~700 | supervisor_tasks, site_tasks, timesheets | — | partial (workforce-adjacent task confirmation) |
| Internal categories / house jobs | Internal (non-client) job categories for allocation & internal cost | src/pages/InternalJobDetail.jsx (435), InternalHouseJobDetail.jsx (248); server/lib/internalCategoryRoutes.mjs (267), internalCategoryService.mjs | ~1,200 | internal_categories, carpentry_jobs, timesheet_entries | — | partial (feeds Workforce allocation + charge-up cost) |
| Facts / job resolver / geo | Job/site fact registry, address normalise, geocoding, distance | server/lib/factsRoutes.mjs (97), factsService.mjs, jobFactRegistry.mjs, geoRoutes.mjs (311), geocodeService.mjs, geoDistance.mjs, addressNormalise.mjs | ~1,500 | (job facts + geo caches; used by carpentry site facts) | Mapbox / geocoding | partial (carpentry site facts depend on it) |
| Jobs API / job spine | Shared job/lead/project resolution + documents | server/lib/jobsApiRoutes.mjs (525), jobResolver.mjs, jobGuards.mjs, jobRecordsFiler.mjs | ~1,500 | jobs, leads, projects, fee_proposals, purchase_orders, rfqs, correspondence, cost_intelligence, unmatched_quote_emails | Dropbox | partial (core job entity every in-scope module reuses) |
| Settings | Settings hub (general/team/integrations/modules/usage/account) | src/pages/Settings.jsx (882), src/pages/settings/*; src/components/settings/* | ~2,000 | user_settings, company_profile, integration configs | many (integration config) | partial (infra; contains cost-model + workforce rules panes) |
| User / admin management | User invite/roles, admin utilities, AI call log | src/pages/UserManagement.jsx (435), DataCleanup.jsx; server/lib/adminRoutes.mjs (226) | ~800 | user_profiles, invitations, ai_call_log, jobs, leads, schedule_tasks, workforce_allocations | Supabase Auth | partial (infra) |
| Templates / documents | Doc template registry + generation | src/pages/DocumentsTemplates.jsx (194); server/lib/templateRegistryRoutes.mjs (244), templateCatalog.mjs, docTemplates.mjs, docTokens.mjs | ~1,000 | (template registry tables) | docxtemplater, Google Docs/Drive, LibreOffice | no |

Notes / uncertainties:
- **#8 (charge-up of wage costs to a Xero invoice) is the weakest-verified capability.** xeroRoutes.mjs endpoints only create/send invoices for per-lead design/concept fees (leads, xero_invoices, lead_activities). No code path was found that takes charge-up labour totals (chargeUpService.mjs charge-out $) and pushes them into a Xero invoice. Treat as PARTIAL — the Xero OAuth/client and invoice send/sync plumbing exists and is reusable, but the wage-charge-up → Xero line-items step must be built.
- **#6 WHS export** exists as PDF (pack + incident report → Dropbox) and QR download; no CSV/spreadsheet export path was found. If "export" must be a spreadsheet, that is a gap.
- The Worker PWA (src/pages/worker/*) and the Field app (src/pages/field/*) are two separate mobile surfaces with overlapping intent; only the worker/* PWA carries the dedicated worker.html manifest + magic-link auth. Decide which is the base for the standalone product.

---

## 3. DATABASE

Audited all 200 files in supabase/migrations (001–203, gaps confirmed: no 018–019, 076, 080, and 103b is a suffix). No standalone schema doc (no schema.sql / no supabase/schema); the migrations ARE the schema. Every finding below was read from the SQL, not inferred.

### Multi-tenancy verdict up front

I grepped every migration for company_id / org_id / tenant_id / account_id / organization_id / workspace_id / business_id. Result: ZERO of these exist as an ownership/isolation column on ANY table. The only hits are (a) 020_finance_manager.sql:63 xero_credentials.tenant_id and (b) 182_xero_invoices.sql xero_tenant_id / xero_contacts.xero_tenant_id — both are Xero's OWN organisation ID (the external accounting org), not a Blue Leaf tenant boundary. The database is 100% single-company. Confirmed plainly.

### In-scope tables

Domain key: WF=Workforce/Timesheets, CARP=Carpentry job cost, CHG=Charge-up, INT=Internal cost, RATE=Cost/rate model, WHS=WHS, XERO=Xero, ID=identity.

RLS models seen (only three exist):
- A = permissive "auth_users" USING(true) WITH CHECK(true) — any logged-in user, incl. portal clients, full CRUD (later hardened by 104 deny_clients on tables that existed pre-104).
- B = RLS enabled, NO policy = fail-closed; all access via Express service-role (getServiceSupabase) which bypasses RLS. This is the "workforce lockdown" pattern (111, 117, 162, 166).
- C = A + a RESTRICTIVE deny_clients requiring public.auth_is_staff() (self-added by tables created after 104).

auth_is_staff() (104_deny_clients_rls.sql:32) = EXISTS row in user_profiles where id=auth.uid() AND is_active AND role IN ('admin','supervisor','employee'). No company filter — it just distinguishes staff from portal clients within the one company.

| Table/View | Domain | Key cols + PK/FKs | Tenant col? | RLS on? | Policy checks |
|---|---|---|---|---|---|
| employees | WF | PK id; FK user_id→auth.users; name, trade, hourly_rate, overtime/double_time mult, worker_token (084, magic-link), employee_number (093), buildexact_employee_id | NO | yes | B — 059 created auth_users USING(true), 111 DROPPED it → fail-closed, server service-role only |
| timesheets | WF | PK id; FK employee_id→employees, project_id→projects, job_id→jobs, carpentry_job_id→carpentry_jobs (065), work_order (087), approved_by→auth.users; UNIQUE(employee_id,date); status draft/submitted/approved/rejected | NO | yes | B (059 then 111 lockdown) |
| timesheet_entries | WF | PK id; FK timesheet_id, employee_id, budget_line_item_id (141), carpentry_budget_line_item→ via 142, charge_up_job_id (145), internal_category_id (200); task_category enum, hours, overtime_hours, cost_amount, completion_photo_url | NO | yes | B (059/111) |
| workforce_settings | WF | PK id; SINGLE-row org config (standard hours, OT thresholds, cost codes). INSERT DEFAULT VALUES seeds the one row | NO (single-company by design) | yes | B (059/111) |
| workforce_crews | WF | PK id (crew defs) | NO | yes | B (117 enables, no policy) |
| workforce_crew_members | WF | FK crew_id, employee_id | NO | yes | B (117) |
| workforce_allocations | WF (crew planner) | PK id; allocation_date; FK employee_id, crew_id→workforce_crews, project_id→projects, carpentry_job_id→carpentry_jobs, internal_category_id (203), charge_up_job_id (146); UNIQUE(employee_id,allocation_date); XOR CHECK project_id vs carpentry_job_id | NO | yes | B (117) |
| workforce_public_holidays / workforce_employee_rdo_dates / workforce_rdo_patterns (119); workforce_team_rdo_dates (124); workforce_day_off_requests (139) | WF | RDO/leave/non-working-day spine; leave_type + hours added by 201 | NO | mixed | A/B (per file) |
| carpentry_jobs | CARP | PK id; reference UNIQUE (CJB-NNN, plus sentinels BL-CHARGEUP, BL-INTERNAL); buildexact_job_id/estimate_id; client_name, address, quoted_value/cost/margin_pct, floor_area_m2, closeout_data jsonb | NO | yes | A→C (auth_users; deny_clients via 104 loop) |
| carpentry_job_milestones | CARP | FK job_id→carpentry_jobs | NO | yes | A/C |
| carpentry_job_costs | CARP | PK id; FK job_id, carpentry_budget_line_item_id (142); cost_type material/subcontract/other, amount ex-GST, source manual/xero, source_reference (Xero bill), cost_date | NO | yes | A/C |
| carpentry_site_diary | CARP | FK job_id (mirrors site_diary for carpentry) | NO | yes | A/C |
| carpentry_job_budgets | CARP | PK id; FK job_id; category_name, cost_type labour/material, budget_ex_gst, workforce_task_category (feeds labour actuals); UNIQUE(job_id,category_name) | NO | yes | A (067 auth_users) |
| carpentry_budget_line_items | CARP | PK id; FK job_id, carpentry_job_budget_id; description, task_category, canonical_key, sell_ex_gst, cost_ex_gst, status suggested/confirmed | NO | yes | A (140 auth_users) |
| carpentry_job_stage_schedule (144), crew_size (148) | CARP | FK job_id; stage schedule/crew sizing | NO | yes | A |
| charge_up_jobs | CHG | PK id; FK carpentry_job_id (the BL-CHARGEUP parent); site_label, address, status active/archived, rate (149), margin_pct (150) | NO | yes | A (145 auth_users) |
| internal_categories | INT | PK id; FK carpentry_job_id (BL-INTERNAL parent); category_label, slug, cost_source timesheet/leave, leave_type; UNIQUE(carpentry_job_id,slug); 6 seeded categories | NO | yes | A (200 auth_users) |
| company_cost_model | RATE | PK id; SINGLETON (unique index on ((true))); overhead_recovery_per_hour, margin_pct, productive_pct, overheads jsonb, google_sheet_id | NO (explicit single company) | yes | A (090) |
| employee_cost_rates | RATE (charge-up calc) | PK id; employee_name UNIQUE; FK employee_id→employees; base_hourly, true_hourly, overhead_hourly, break_even_hourly, charge_up_hourly | NO | yes | A (090) |
| whs_site_profiles | WHS | PK id; FK project_id UNIQUE→projects (NOTE: PROJECT-scoped, ops-tangled — not carpentry_jobs); questionnaire answers + risk-engine outputs jsonb | NO | yes | A (064) |
| whs_documents | WHS | PK id; FK project_id; template_key, rendered_markdown, status, is_stale (immutable snapshots) | NO | yes | A (064) |
| swms_templates / project_swms | WHS | project_swms FK project_id XOR carpentry_job_id (162) — carpentry-aware | NO | yes | A / B |
| whs_swms_signon | WHS | PK id; FK swms_template_id, employee_id, project_id XOR carpentry_job_id; signature_data_url (liability record) | NO | yes | B (162, server-only, no browser policy) |
| carpentry_whs_packs | WHS | PK id; FK carpentry_job_id; selected_hrcw/task/controls jsonb, review_status; UNIQUE(carpentry_job_id) | NO | yes | B (166, server-only) |
| whs_sources / whs_source_conflicts (165), whs_control_templates (169), whs pack signon (167) | WHS | control library + review dates | NO | mixed A/B | — |
| site_reports | WHS incident | incident register | NO | yes | had anon USING(true) via 074 self-heal; 186 dropped anon; staff via authenticated_all + deny_clients |
| xero_credentials | XERO | PK id; tenant_id UNIQUE (Xero org), access_token, refresh_token, expires_at — ONE row per connected Xero org, app-wide | tenant_id is Xero's, NOT ours | yes | A (020 auth_users) |
| xero_invoices | XERO | PK id; FK lead_id→leads, job_id→jobs (scope CHECK ≥1 set); invoice_type, source_type/source_id UNIQUE, amount_ex_gst, xero_invoice_id UNIQUE, status, idempotency_key, send_source lock | xero_tenant_id (Xero's) | yes | C (182 auth_users + deny_clients) |
| xero_contacts | XERO | PK id; xero_tenant_id+xero_contact_id UNIQUE; FK crm_contact_id, lead_id, job_id | Xero's only | yes | C (182) |
| user_profiles | ID | PK id=auth.users.id; role, is_active, employee_id (100, UNIQUE) | NO | yes | deny_clients_except_self (104): auth_is_staff() OR id=auth.uid() |
| invitations | ID | employee_id (100) | NO | yes | A |

Views: only 5 exist repo-wide (v_procurement_dashboard, v_area_performance, v_crm_people, v_lead_attribution_roi, v_lead_timeline) — ALL out-of-scope (procurement/CRM/marketing). No in-scope module ships a view; timesheet/cost/charge-up rollups are computed in the Express layer, not in SQL.

Out-of-scope domains (compressed): sales/CRM (leads, lead_*, crm_*, correspondence, fee_proposals), tendering/RFQ (rfqs, rfq_*, tender_*), marketing (marketing_*, campaign_*, video_*, drone_shot_plans, geocode_cache), client portal (portal_*, client_portal), ops schedule/Gantt (projects, schedule_*, site_diary, schedule_tasks), procurement (purchase_orders, procurement_*), knowledge/AI (job_knowledge, knowledge_core, ai_call_log, cost_intelligence). None carry a tenant column either.

### Multi-tenancy readiness — prose finding

There is NO tenant isolation in the schema today. The whole DB is implicitly single-company, in three independent ways:
1. No ownership column anywhere — nothing to filter a query by. Every in-scope table would need a tenant/company FK added, backfilled, indexed, and wired into every FK-join path.
2. The security model is "staff see everything." Where RLS is model A/C it resolves to USING(true) or auth_is_staff(), which only separates staff from portal clients inside one company — it never scopes rows to an owner. Where RLS is model B (all workforce, allocations, most WHS, xero_credentials-adjacent), the tables are fail-closed and ALL isolation logic lives in the Express service-role layer (which bypasses RLS entirely) — and that layer is not tenant-aware. So for the most valuable in-scope tables (employees, timesheets, timesheet_entries, workforce_allocations) the database provides literally zero row filtering; a multi-tenant rebuild cannot rely on RLS as it stands and must either (a) build real tenant-scoped RLS with a JWT claim (e.g. auth.jwt()->>'company_id'), or (b) enforce tenant scoping in every server query. Option (a) is a from-scratch RLS effort — no policy in the repo reads any JWT claim today.
3. Singletons bake in one company: workforce_settings (single seeded row), company_cost_model (unique index on ((true))), and xero_credentials (one Xero org, one refresh token app-wide). Each must become per-tenant rows for the product; the Xero one is the sharpest — the charge-up-to-Xero-invoice feature currently assumes ONE connected Xero organisation for the entire database.

What every in-scope table needs: a NOT NULL company_id (uuid) FK to a new companies/tenants table; that column in every UNIQUE constraint (e.g. employees.worker_token, timesheets(employee_id,date), workforce_allocations(employee_id,allocation_date), carpentry_jobs.reference, xero_invoices source uniqueness) so uniqueness is per-tenant not global; tenant-scoped RLS policies (replacing model A/B/C); and per-tenant versions of the three singletons plus xero_credentials.

### Storage buckets

grep of storage.buckets INSERTs and storage.objects policies across supabase/:

| Bucket | Public? | Policy / access check | In scope? |
|---|---|---|---|
| site-media (099) | private | NO storage.objects policy at all — private bucket, all access via server service-role signed URLs | ops photos (borderline) |
| job-plans (152) | private | NO policy — private, service-role signed URLs only | plan PDFs (borderline) |
| lead-documents | private (implied) | 186: lead_documents_staff_all FOR ALL USING bucket_id='lead-documents' AND auth_is_staff() (earlier 060 had authenticated policies, replaced) | OUT (CRM) |
| marketing-media | mixed | 047 had authenticated + anon-read policies; 186 replaced with marketing_media_staff_all USING bucket_id='marketing-media' AND auth_is_staff() | OUT (marketing) |

No bucket is tenant-scoped; where a policy exists it checks auth_is_staff() (single-company staff) or bucket_id only. No path-prefix or owner check. WHS export (task item 6) is not a storage bucket — WHS docs are stored as whs_documents.rendered_markdown / carpentry_whs_packs; export-to-file is server-side, not in the DB layer.

### In-scope module → table dependencies (flag list)

- Timesheets + approvals: employees, timesheets, timesheet_entries, workforce_settings; approved_by→auth.users. (RLS model B — DB gives no isolation.)
- Crew allocations / Workforce planner: workforce_allocations, workforce_crews, workforce_crew_members, employees; RDO/leave: workforce_public_holidays, workforce_employee_rdo_dates, workforce_rdo_patterns, workforce_team_rdo_dates, workforce_day_off_requests. TANGLED: workforce_allocations.project_id → projects (ops schedule, out of scope) via the project/carpentry XOR — the planner assumes a project spine exists.
- Job cost tracking: carpentry_jobs, carpentry_job_costs, carpentry_job_budgets, carpentry_budget_line_items; labour actuals come from timesheets.carpentry_job_id + timesheet_entries. TANGLED: buildexact_job_id/estimate_id columns and 067/140 comments show budgets are seeded from Buildexact estimates (external ops integration).
- Worker mobile PWA (offline): employees (worker_token auth), timesheets, timesheet_entries, charge_up_jobs, internal_categories, workforce_allocations (planner view). Offline conflict handling is app-side; DB uniqueness UNIQUE(employee_id,date)/(employee_id,allocation_date) is the merge key.
- Job cost forecasting: carpentry_job_budgets + carpentry_budget_line_items (sell/cost ex_gst, earned-value) + carpentry_job_stage_schedule (144) + actuals from timesheet_entries/carpentry_job_costs.
- WHS records + export: whs_site_profiles, whs_documents (both project-scoped — retarget to carpentry_jobs needed), carpentry_whs_packs, whs_swms_signon, swms_templates, project_swms, whs_control_templates, whs_sources. TANGLED: whs_site_profiles/whs_documents FK projects only; carpentry path exists only via project_swms/whs_swms_signon XOR and carpentry_whs_packs.
- Employee cost / charge-up rate calculator: company_cost_model (singleton), employee_cost_rates (break_even_hourly, charge_up_hourly), employees.hourly_rate. TANGLED: 090 syncs from a Google Sheet (google_sheet_id) — the rate math is imported, not computed in-DB.
- Charge-up of wages to a Xero invoice: charge_up_jobs (rate/margin_pct), timesheet_entries.charge_up_job_id (hours), employee_cost_rates, xero_invoices, xero_contacts, xero_credentials. TANGLED + BLOCKER: xero_credentials is a single app-wide Xero connection, and xero_invoices is FK'd to leads/jobs (sales/ops), not to charge_up_jobs — there is no direct charge_up→xero_invoice link column in the schema; that join is done in the Express layer (xeroInvoices.mjs).

---

## 4. AUTH AND ROLES

Auth is Supabase Auth (email + password) for the office/console app, plus a separate per-worker magic-link token for the Worker PWA. All server data access uses the Supabase SERVICE ROLE key, which bypasses RLS entirely — the app is single-company by construction, with no tenant column anywhere on the in-scope tables.

### End-to-end trace

- Office sign-in: src/pages/Login.jsx:93 calls sb.auth.signInWithPassword({email, password}). Session persistence toggled by "remember me" (localStorage vs sessionStorage) via configureSupabaseAuthStorage (src/lib/supabaseClient.js:33-46). Password reset via resetPasswordForEmail (Login.jsx:68-71). No OTP/magic-link for staff.
- Client singleton: src/lib/supabaseClient.js:48-65, anon key from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
- Session/role context: src/lib/AuthContext.jsx. getSession + onAuthStateChange set the session; a second effect fetches user_profiles (id, email, full_name, role, is_active) by user id (AuthContext.jsx:95-99) and exposes role = profile?.role. Inactive profiles are force-signed-out (AuthContext.jsx:104-107). Consumed via useAuth (src/lib/useAuth.js).
- Frontend token attach: src/lib/authFetch.js reads session.access_token and sets Authorization: Bearer. Page components must go through src/lib/apiFetch.js (never authFetch directly).
- Worker PWA auth: src/lib/workerFetch.js captures ?token= from the magic link into localStorage key blhub_worker_token, strips it from the URL when standalone, and sends it as the x-worker-token HEADER on every /api/worker/* call. No Supabase account for workers. If no token, falls back to authFetch (admin viewing the PWA), optionally with x-preview-employee-id for admin "preview as worker".
- Server staff middleware: server/lib/requireAuth.mjs. requireAuth (line 6) validates the Bearer JWT via service-role sb.auth.getUser(token), loads user_profiles (id, role, is_active), rejects inactive (403) and role === "client" (403, staff/portal split). requireRole(...roles) (line 34) gates by profile role. requireCronSecretOrAdmin (line 55) for cron endpoints.
- Server worker middleware: workerAuth is defined INLINE in server/lib/workforceRoutes.mjs:2361, not in server/lib. It looks up employees by worker_token + is_active (line 2365) using the service client, attaching req.workerEmployee. No token → falls back to requireAuth, and an admin (only) may pass previewEmployeeId for a read-only impersonated view (lines 2373-2398).
- RLS: enabled on the in-scope tables (employees, timesheets, timesheet_entries, workforce_settings, site_tasks, carpentry_jobs/costs/budgets/etc.) but with NO permissive policy after migration 111 — they fail closed to anon/authenticated. This is a deny-all lockdown, NOT tenant isolation: the server service role bypasses RLS and does ALL data access (see migration 111 header, lines 15-22). Only ~10 migration files reference auth.uid() at all.

### Concern table

| concern | how it works | where the logic lives (file:line) | single-company assumption? |
|---|---|---|---|
| Office sign-in | Supabase email+password | src/pages/Login.jsx:93; src/lib/supabaseClient.js:48-65 | Yes — one Supabase project, one user pool |
| Session → role resolution | Fetch user_profiles.role by uid | src/lib/AuthContext.jsx:95-99, 148-155 | Yes — no company scoping on profile |
| Frontend token attach | Bearer from Supabase session | src/lib/authFetch.js:8-25 | n/a |
| Worker PWA auth | Per-worker magic-link token in x-worker-token header | src/lib/workerFetch.js (capture 12-40, send 118-126); server workforceRoutes.mjs:2361-2368 | Yes — token → one employees row, no tenant |
| Admin preview-as-worker | previewEmployeeId, GET-only, admin-only | src/lib/workerFetch.js:56-107; workforceRoutes.mjs:2373-2398 | Yes |
| Staff auth gate | requireAuth: validate JWT, load profile, block client role | server/lib/requireAuth.mjs:6-32 | Yes — service-role lookup, no company filter |
| Role gate | requireRole(...roles) checks req.caller.role | server/lib/requireAuth.mjs:34-40; ~68 uses in workforceRoutes.mjs (e.g. :926, :1173, :1194) | No tenant, role only |
| Cron/admin gate | Shared CRON_SECRET or admin JWT, fails closed | server/lib/requireAuth.mjs:55-64 | Global secret, one company |
| Client-side route gating | RoleRoute allowed={[...]} per route | src/App.jsx (RoleRoute imported :5; e.g. :248, :301, :330) | Role only |
| Client-side capability map | can.* predicates keyed on role string | src/lib/roles.js:29-53 | Role only, no tenant |
| Role values / storage | admin, supervisor, employee, client on user_profiles.role | src/lib/roles.js:2-5; server requireAuth.mjs:16-18 | Single user_profiles table, no company_id |
| Worker identity | employees.worker_token, employees.is_active | workforceRoutes.mjs:2365 | Single employees table, no company_id |
| Portal (client) auth | Separate requirePortalAuth middleware | server/lib/requirePortalAuth.mjs (OUT OF SCOPE — client portal) | Project-scoped, not tenant-scoped |
| RLS on workforce/carpentry | Enabled, NO policy = deny-all; server service role bypasses | supabase/migrations/111_workforce_rls_lockdown.sql; server/lib/supabaseService.mjs:9-15 | Yes — deny-all, no per-tenant policy |

Role values: exactly four DB roles — admin (labelled "Director"), supervisor, employee, client — defined in src/lib/roles.js:2-5 and stored in user_profiles.role. Workers are NOT a DB role; they are employees rows with a worker_token (src/lib/roleAccess.js:12). "leading_hand" is not a role either — it is employees.is_leading_hand (boolean flag), roleAccess.js:11. Roles are read from the DB profile on every request/render, NOT from JWT app_metadata/custom claims.

### BLUNT prose: every place that assumes ONE company/tenant

- Service role bypasses RLS for ALL data access. server/lib/supabaseService.mjs:9-15 returns a service-role client; requireAuth (requireAuth.mjs:11) and workerAuth (workforceRoutes.mjs:2364) both use it, and migration 111 explicitly states "ALL workforce access in this app goes through the Express server using the SERVICE ROLE ... which BYPASSES RLS." There is no defence-in-depth: if any server query forgets a filter, there is no company boundary to catch it — because there is no company boundary at all.

- No tenant column on any in-scope table. Grepping company_id / tenant_id / org_id / organization_id across supabase/migrations returns nothing on employees, timesheets, timesheet_entries, carpentry_jobs, carpentry_job_costs, carpentry_job_budgets, site_tasks, or user_profiles. The only tenant_id in the schema is xero_credentials.tenant_id (migration 020:63 / 182), which is the XERO org id, not an app tenant. Every workforce/carpentry query is company-global by definition.

- Worker token has no tenant scope. workforceRoutes.mjs:2365 resolves a token to a single employees row with .eq("worker_token", token).eq("is_active", true) and nothing else. Tokens are drawn from one global namespace; in a multi-tenant rebuild a token collision or leak crosses no boundary because none exists.

- user_profiles is a single global user pool. requireAuth.mjs:12-18 and AuthContext.jsx:95-99 select a profile purely by user id with no company filter. Any authenticated non-client staff user is implicitly a member of "the company."

- Singleton company record. server/lib/emailSignature.mjs:68 reads company_profile with .order("id").limit(1) — i.e. "the one and only company row." financeCCRoutes.mjs:42 and companyProfile.mjs also treat company_profile as a single global record. xeroClient.mjs:164 comment: "we operate a single Blue Leaf org." This is a hard single-tenant assumption that a multi-tenant product must replace with per-tenant company/settings rows.

- Xero connection is single-org. xeroClient.mjs stores xero_credentials keyed by Xero tenant_id but getFreshConnection() (line 164-174) just grabs the most-recently-refreshed row — one connected accounting org for the whole app. In-scope capability (8) charge-up of wage costs to a Xero invoice therefore assumes one company's Xero.

- Global CRON_SECRET (requireAuth.mjs:57) and global integration env vars (ANTHROPIC_API_KEY, BUILDEXACT_*, DROPBOX_*, etc. per CLAUDE.md) are process-level, one set per deploy = one company.

### Additional notes / dead code to flag before rebuild

- src/lib/useRole.js is a SEPARATE, stale role mechanism: it stores a role string in localStorage key blhub_role and exposes isDirector: role === "director". "director" is NOT one of the four DB roles (roles.js uses "admin"), so isDirector here can never be true against real data. This looks like legacy/pre-Supabase code parallel to the real AuthContext role. Do not carry it forward without confirming it is unused.
- There is no requireModule middleware anywhere (grep returns nothing in server/). Module access is enforced only by requireRole on the server and RoleRoute + can.* on the client. A subscription product gating features by plan/module will have to add this layer from scratch.
- roleAccess.js:56-62 itself documents two audit-flagged gaps: Operations writes and WHS (in-scope capability 6) are "requireAuth only — no role tiers." Confirmed pattern exists, but I did not enumerate every WHS route; treat those as role-ungated until verified.

---

## 5. BLUE LEAF-SPECIFIC HARDCODING

Everything below hardcodes THIS company (Blue Leaf Building / "Manning and Morris Pty Ltd") into what should be per-tenant config. Sorted by category. Multi-tenant blocker severity is called out in notes. Scope: src/, server/, supabase/, public/, index.html, worker.html, config files — node_modules/, dist/, dev-dist/, *.zip and *.md docs excluded.

Key structural finding: there IS a `company_profile` table (migrations 069/106/157/160) and a client-side `companySettings.js` / `rfqSettings.js` (localStorage), but they are inconsistently used. Huge amounts of company identity are hardcoded as JS defaults, JSX string literals, or migration seed rows that would all need to become tenant-scoped rows. Bank details, ABN, brand colours, Dropbox namespace and the internal-job singletons are the hard blockers.

### 5.1 Company name / branding (text + logo assets + tokens + favicon)

| Value | file:line | notes |
|---|---|---|
| "Blue Leaf Building" (default company name) | src/lib/companySettings.js:10 | localStorage default; per-tenant |
| "Blue Leaf Building" (email sig default) | src/lib/rfqSettings.js (DEFAULT_EMAIL_SIGNATURE), server/lib/emailSignature.mjs:13 | two copies kept "byte-identical" |
| "Blue Leaf Building" logo alt / brand text | src/components/brand/BrandLogo.jsx:25, AuthBrandScreen.jsx:10, PortalSidebarBrand.jsx:20, worker/WorkerLayout.jsx:118, components/worker/WorkerLayout.jsx:118 | worker PWA (in-scope) hardcodes brand |
| "Blue Leaf Hub" app name | src/components/AppShell.jsx:355, RootRedirect.jsx:15, index.html:9/17/19, ui-review pages | product/app name |
| Brand SVG/PNG asset paths (BLB_*) | src/lib/brandAssets.js:1-5 | points at /public/brand/BLB_* files |
| Logo/icon binaries (BLB_Icon_*, BLB_Primary_Logo_*, logo-*, social-*) | public/brand/ (20 files) | all Blue Leaf artwork |
| Favicon / PWA icons | public/icons/icon-192.*, icon-512.*, apple-touch-icon.png | BLB leaf icon |
| Theme colour tokens primary #006c9b, accent #2E6B4F, warning #D4A24C | tailwind.config.js:9-19 | one shared palette, not tenant-themeable |
| Hardcoded brand hex "#006c9b" in server PDF/email generators | server/lib/poPdfKit.mjs:7, feeProposalPdfKit.mjs:4, module6PdfKit.mjs:3, emailTemplates/layout.mjs:8, emailTemplates/financeEmails.mjs:62/104 (color:#006C9B), financeCCRoutes.mjs (#006C9B) | brand colour duplicated as literals |
| theme-color meta #1B3A5C (Hub) / #006c9b (worker) | index.html:20, worker.html:11, public/manifest.json (theme_color/background_color) | |
| PDF Author "Blue Leaf Building" | server/lib/module6PdfKit.mjs:32/66/94/157/215 | site diary / induction / gantt PDFs |
| PWA manifest name "Blue Leaf Building" / short_name "BLB" | public/manifest.json:2-4 | worker PWA (in-scope) install identity |
| "Blue Leaf Building" seeded into DB | supabase/migrations/160_company_profile_reconcile.sql:35 (name), 158 (Sam's signature seed) | migration hardcodes tenant name |

### 5.2 Addresses / emails / phone / ABN

| Value | file:line | notes |
|---|---|---|
| sam@blueleafbuilding.com.au | src/lib/companySettings.js:14, pages/Login.jsx:224, Signup.jsx:14, server/lib/portalRoutes.mjs:1163, ui-review mockups | contact/from |
| admin@blueleafbuilding.com.au (SMTP_FROM default) | server/lib/conceptEmails.mjs:93, discoveryEmail.mjs:68, qualifyEmail.mjs:72, tenderEmails.mjs:72, pipelineGapEmails.mjs:113, salesRoutes.mjs:1383, calcomRoutes.mjs:118, resendSend.mjs:26 (DEFAULT_RESEND_FROM), portalNotify.mjs:92, portalV2Routes.mjs (7×: 515/620/867/924/956/1067/1134) | env-overridable in email modules; hardcoded literal in portalV2Routes |
| accounts@blueleafbuilding.com.au | server/lib/docTokens.mjs:196, emailTemplates/layout.mjs:74, emailTemplates/financeEmails.mjs:46/62/88/104, financeCCRoutes.mjs:2441, src/components/finance/ProgressClaims.jsx:223, Variations.jsx:450 | finance (in-scope) |
| info@blueleafbuilding.com.au | server/lib/module5Routes.mjs:680, whs/whsMergeFields.mjs:11 (COMPANY_EMAIL fallback), src/pages/FeeProposalWizard.jsx:628/1355 | WHS (in-scope) fallback |
| marketing@ / message-id @blueleafbuilding.com.au | server/lib/crmRoutes.mjs:89/92/1230/1346, imapQuoteMatch.mjs:154/288, conceptEmails.mjs:153 (+ every stage email builds `<...@blueleafbuilding.com.au>` message-ids) | |
| LEAD_DIGEST_RECIPIENTS default "sam@…,josh@…" | server/lib/leadReminders.mjs:30 | two named directors baked in |
| OWN_DOMAINS / COMPANY_EMAIL_DOMAINS ["blueleafbuilding.com.au", …] | server/lib/imapQuoteMatch.mjs:154, quoteInboxClassify.mjs:24 | own-domain detection logic |
| Website https://www.blueleafbuilding.com.au | src/lib/companySettings.js:15, rfqSettings.js:9, server/lib/emailSignature.mjs:15, appUrl.mjs comment | |
| Canonical app host "https://blueleafhub.com.au" | server/lib/appUrl.mjs:18 (CANONICAL); crmRoutes.mjs:1230 "hub.blueleafbuilding.com.au"; portalNotify.mjs:24 "blueleafbuilding.com.au" | three different fallback hosts |
| Postal "PO Box 3225 Newton SA 5074" | src/lib/companySettings.js:13, rfqSettings.js (postalAddress), server/lib/emailSignature.mjs:16 | |
| Phone "0434 046 399" | src/lib/companySettings.js:13, rfqSettings.js:9, emailSignature.mjs:15, and 7 settings editor defaults (TenderEmailSettings.jsx:13, PipelineEmailSettings.jsx:16, InvoiceEmailSettings.jsx:11, ConceptEmailSettings.jsx:15, QualifyEmailSettings.jsx:13-14, DiscoveryEmailSettings.jsx:14), FeeProposalWizard.jsx:627 | |
| Director names "Sam Morris" / "Josh(ua) Manning" | server/lib/gmailSend.mjs:177 (SAM_NAME fallback), rfqReminders.mjs:64, sendOneReminder.mjs:58, tradeCommitment.mjs:38, emailSignature.mjs:13, feeProposalTransform.mjs:256/335, src/lib/feeProposalDefaults.js:45, rfqComposer.js:76, blueprint/agent/systemPrompt.js:9/63 | Sam+Josh named as signatories/directors |
| ABN — no hardcoded value; sourced from COMPANY_ABN env or blank | src/lib/companySettings.js:11 (abn:""), server/lib/docTokens.mjs:197 ("[REQUIRED — set COMPANY_ABN]"), whsMergeFields.mjs:7 | ABN correctly externalised; but "12 345 678 901" is a demo placeholder in Subcontractors.jsx:105 |
| Adelaide / South Australia baked into AI prompts + map default | server/dev-api.mjs:765/1446, marketingMedia.mjs:153, marketingRoutes.mjs:55, scheduleRoutes.mjs:1189, marketingPrompts.mjs:14/110, blueprint/agent/systemPrompt.js:9/64, documentReview.js:11; map DEFAULT_CENTER [138.6,-34.93] src/components/maps/HubMap.jsx:37; geocode proximity default "138.60,-34.93" server/lib/geocodeService.mjs:98 | region assumptions |

### 5.3 Rates + money constants

| Value | file:line | notes |
|---|---|---|
| GST_RATE = 0.10 (+ gstAmount/incGst helpers) | server/lib/constants.mjs:3-9; mirror in src/lib/constants.js (per CLAUDE.md) | AU GST; would need per-tenant/country config for true multi-tenant, but single-source at least |
| SUPER_GUARANTEE_BY_FY {2023-24:0.11, 2024-25:0.115, 2025-26:0.12}; default 0.12 | server/lib/financialYear.mjs:34-43 | AU statutory super — used by internal-cost + charge-up rate calc (in-scope) |
| Annual-leave loading 17.5% (× 1.175) | server/lib/internalCategoryService.mjs:233-234 (comments 198-199) | AU award loading hardcoded into leave-cost rate calc (in-scope: rate calculator) |
| Default standard hours/day 7.6 | server/lib/internalCategoryService.mjs:256/341 (fallback; else workforce_settings.standard_hours) | in-scope; DB-overridable |
| hoursPerDay default 8 | server/lib/costModelService.mjs:20, stageAggregation.mjs:16, scheduleIntelligence.mjs:52, workforceCapacity.mjs:24, workforcePipelineRoutes.mjs (else company_cost_model.hours_per_day) | in-scope; DB-overridable |
| AU FY label logic (Jul–Jun) | server/lib/financialYear.mjs:18-25; chargeUpService.auFinancialYear (slash format) | region-specific FY hardcoded |
| Employee cost/charge-up rates | NOT hardcoded — read from employee_cost_rates / company_cost_model tables (companyCostModelRoutes.mjs, costModelService.mjs) | good: rate calculator is data-driven, only the AU statutory multipliers above are baked in |

### 5.4 Bank details & legal entity (finance / charge-up-to-Xero — IN SCOPE, hard blocker)

| Value | file:line | notes |
|---|---|---|
| Legal name "Manning and Morris Pty Ltd trading as Blue Leaf Building" | server/lib/docTokens.mjs:194/... | on progress-claim/variation docs |
| Bank "Bank SA", account name "Blue Leaf Building Pty Ltd", BSB "105-052", account "261 694 461" | server/lib/docTokens.mjs:185-189 | HARDCODED bank account for payment docs — must be per-tenant; company_profile has bank columns (mig 106) but this file ignores them |
| Bank-detail placeholder text | src/pages/PortalV2Admin.jsx:373 | UI placeholder only |
| PO prefix "BLB" | src/lib/companySettings.js:17, OperationsProjectDetail.jsx:536, Settings.jsx:550 | overridable in Settings |
| payment_terms "14 days from claim date" | server/lib/docTokens.mjs | default copy |

### 5.5 Templates / default copy

| Value | file:line | notes |
|---|---|---|
| DEFAULT_PO_TERMS ("Us/Our means Blue Leaf Building") | src/lib/poDefaultTerms.js:10 (full ~40-line terms) | company-specific PO T&Cs |
| Standard tender inclusions/exclusions (master template copy) | src/lib/defaultInclusions.js, defaultExclusions.js | Blue Leaf boilerplate |
| Fee-proposal company blurb (LVL frames, Adelaide, directors J.Manning+S.Morris) | server/lib/feeProposalTransform.mjs:335, src/pages/FeeProposalWizard.jsx:618-628 | out-of-scope (fee proposals) but shows pattern |
| Email signature legal disclaimer | src/lib/rfqSettings.js, server/lib/emailSignature.mjs | shared default |
| DOCX/PDF templates | public/BLB_APB_TEMPLATE.docx, public/BLB_TENDER_TEMPLATE.docx, public/templates/concept-agreement-template.docx, salesRoutes.mjs:301 (PTSA_TEMPLATE_B64 inline base64) | Blue Leaf-branded doc templates (mostly out-of-scope docs) |
| Blueprint LLM system prompt (whole company profile) | src/blueprint/agent/systemPrompt.js:9/59-64/250/318 | out-of-scope (Blueprint AI) |
| Marketing identity/voice prompts | server/lib/marketingPrompts.mjs, marketingAgent.mjs:33 | out-of-scope (marketing) |

### 5.6 Controlled vocab + seeded singletons (IN SCOPE — hard blocker)

These are single-company singleton carpentry_jobs whose fixed string references are matched throughout the in-scope workforce/timesheets/job-cost code. In a multi-tenant model each tenant needs its own set — but the code branches on the literal reference, so this is deeply tangled.

| Value | file:line | notes |
|---|---|---|
| CHARGE_UP_REFERENCE = "BL-CHARGEUP" | src/lib/constants.js:880 | matched in Workforce.jsx, WorkforcePlannerTab.jsx:249, ChargeUpJobDetail.jsx, chargeUpService.mjs, CarpentryJobDetail.jsx:2405 |
| INTERNAL_REFERENCE = "BL-INTERNAL" | src/lib/constants.js:885 | matched in Workforce.jsx (many), WorkforcePlannerTab.jsx:263, InternalJobDetail.jsx, internalCategoryService.mjs |
| BL_JOSH_HOUSE_REFERENCE = "BL-JOSH-HOUSE", BL_SAM_HOUSE_REFERENCE = "BL-SAM-HOUSE" | src/lib/constants.js:891-893 | named after the two directors' personal houses; CarpentryDashboard.jsx:13-23, WorkforcePlannerTab.jsx:264-265, CarpentryJobDetail.jsx:2407 |
| INTERNAL_GROUP_REFERENCES / groupInternalJobs / internalJobLabel ("Blue Leaf Internal") | src/lib/constants.js:898-916 | "Blue Leaf Internal" optgroup label hardcoded; used in worker PWA WorkerLogHours.jsx:404-413 (in-scope offline app) |
| Seed rows: INSERT carpentry_jobs BL-INTERNAL + BL-CHARGEUP ('Blue Leaf Building', 'Blue Leaf Internal — logistics…') | supabase/migrations/125_internal_cost_jobs.sql:9-12 | singleton seed |
| Seed rows: BL-JOSH-HOUSE ('Josh''s house'), BL-SAM-HOUSE ('Sam''s house') | supabase/migrations/202_internal_house_jobs.sql:27-30 | director houses seeded as jobs |
| Internal category sub-layer seeded under BL-INTERNAL (Logistics/ATEC/Personal) | supabase/migrations/200_internal_categories.sql:68-91, 203_alloc_internal_category.sql | matches on reference='BL-INTERNAL' |
| General-overhead job matched by address literal "blue leaf building" | server/lib/financeRoutes.mjs:1005/1215 (`address.toLowerCase() === "blue leaf building"`) | in-scope finance routes receipts to a job identified by hardcoded name |
| LEAD_STAGES / APB 8-stage vocab | src/lib/constants.js (LEAD_STAGES) | out-of-scope (sales pipeline) — noted per brief |

### 5.7 Dropbox namespace + paths

| Value | file:line | notes |
|---|---|---|
| "/BLUE LEAF BUILDING/PROJECTS/BLUE LEAF BUILDING" | src/lib/jobFolderPath.js:13 (DROPBOX_PROJECTS_JOB_PREFIX), consumed by companySettings.js:78 | company namespace baked into path |
| Job records filer path "/BLUE LEAF BUILDING/PROJECTS/BLUE LEAF BUILDING/[JOB]/INTERNAL/…" | server/lib/jobRecordsFiler.mjs:7 | in-scope filing (WHS/job records) |
| Receipts path "/BLUE LEAF BUILDING/RECEIPTS/{FY}" | server/lib/financeRoutes.mjs:1023-1024 | in-scope finance |
| Marketing library path "/BLUE LEAF BUILDING/MARKETING/LIBRARY/" | server/lib/marketingLibraryRoutes.mjs:46 | out-of-scope |
| DROPBOX_TEMPLATE_PATH default "/BLUE LEAF BUILDING/PROJECTS/BLUE LEAF BUILDING/NEW JOB TEMPLATE" | .env.example:66 | env var but Blue Leaf default |
| DROPBOX_NAMESPACE_ID | .env.example:63 (empty); consumed by server/lib/dropboxClient.mjs | team namespace — env var (NAME only, no value present); per-tenant |
| Settings UI shows the hardcoded path structure | src/pages/Settings.jsx:238-239 | display copy |

### 5.8 Xero / Buildxact tenant identifiers + feature-flag env vars

| Value | file:line | notes |
|---|---|---|
| Xero tenant id | server/lib/xeroClient.mjs — stored per row in `xero_credentials` table (tenant_id, onConflict), NOT hardcoded | good: already multi-org capable at the data layer |
| Buildexact job/item ids | stored on jobs.buildexact_job_id / financial_documents (financeRoutes.mjs, costIntelligenceEstimate.mjs) | good: per-record, not hardcoded |
| Buildexact API creds | .env.example: BUILDEXACT_API_URL/USERNAME/API_KEY/WEBHOOK_SECRET (NAMES only) | single global creds — would need per-tenant secret storage |
| Xero creds | .env.example: XERO_CLIENT_ID/SECRET/REDIRECT_URI (NAMES only) | single OAuth app; per-tenant tokens in DB |
| Cal.com identity CAL_USERNAME=blue-leaf-build + slugs (build-conversation, enquiry-call, designer-meeting, winning-offer-presentation) | .env.example:133-137 | out-of-scope (Cal.com) but tenant-specific |
| Feature-flag *_ENABLED family (18) | CONCEPT_EMAIL_ENABLED, CONCEPT_EMAIL_FOLLOWUP_ENABLED, CONSULTANT_EMAIL_ENABLED, DISCOVERY_EMAIL_ENABLED, DISCOVERY_FOLLOWUP_ENABLED, EMAIL_ENABLED, ENQUIRY_AUTOACK_ENABLED, IMAP_POLL_ENABLED, INVOICE_IMAP_POLL_ENABLED, LEAD_DIGEST_ENABLED, LEAD_MAILBOX_ENABLED, PIPELINE_EMAIL_ENABLED, PORTAL_SYNC_ENABLED, QUALIFY_EMAIL_ENABLED, QUALIFY_FOLLOWUP_ENABLED, REMINDER_CRON_ENABLED, TENDER_EMAIL_ENABLED, XERO_ENABLED, XERO_RECONCILE_ENABLED | global env flags (grep across src/server/scripts) | process-wide booleans, not per-tenant — every tenant shares one flag value; a multi-tenant build needs these as per-tenant settings |
| Other tenant-ish env vars | GOOGLE_DRIVE_FOLDER_ID, GOOGLE_SEARCH_CONSOLE_SITE_URL (Settings.jsx:662 example https://www.blueleafbuilding.com.au/), GA4_PROPERTY_ID, GBP_LOCATION_ID, META_* , VITE_DIRECTOR_MOBILE (.env.example:5) | single-tenant globals |

### 5.9 Secrets present (FILE + VARIABLE NAME only — no values printed)

- .env (repo root, tracked, 8 KB) — real secrets live here; not read. Also .env.sandbox.example, .env.example (names only).
- .test-credentials.local, .agent-test-context.local.md — test credentials (not read).
- Variable NAMES that hold secrets (from .env.example): ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, SUPABASE_CT_JWT, VITE_SUPABASE_ANON_KEY, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN, BUILDEXACT_API_KEY, BUILDEXACT_WEBHOOK_SECRET, XERO_CLIENT_SECRET, SMTP_PASS, IMAP_PASS, CAL_API_KEY, CAL_WEBHOOK_SECRET, RESEND_API_KEY, META_ACCESS_TOKEN.
- Note: a base64-inlined DOCX template (PTSA_TEMPLATE_B64) sits in server/lib/salesRoutes.mjs:301 — document data, not a secret, but flagged as an odd inline blob.

Verify-before-trust notes: repo is NOT a git repo per env, but a .git dir exists — I did not rely on git. Xero/Buildexact tenancy is genuinely data-layer (confirmed by reading xeroClient.mjs upsert onConflict:"tenant_id"), so those are the LEAST blocking. The hardest blockers for multi-tenant reuse are: (a) hardcoded bank/legal entity in docTokens.mjs, (b) the BL-* singleton job references branched on throughout in-scope workforce/cost code, (c) the Dropbox "/BLUE LEAF BUILDING/…" namespace prefix, (d) global (not per-tenant) *_ENABLED flags and brand colour literals scattered across server PDF/email generators.

---

## 6. OFFLINE AND SYNC

Verdict up front: the Worker PWA is INSTALLABLE but ONLINE-ONLY. It caches its own static shell so it opens without a network, but every piece of real data (timesheets, projects, allocations, tasks) is fetched live and every write is a plain fetch POST. With no connection the app shell loads, all GETs fail, and any submit ends at an alert("Network error — please try again"). There is no queue, no IndexedDB, no background sync, no offline write buffer anywhere in the codebase.

### (1) What the service worker actually caches

The SW is 100% generated by VitePWA/Workbox (generateSW) — there is NO custom service worker source file. Registration is virtual:pwa-register in src/main.jsx:3,18.

| Aspect | Reality | Evidence |
|---|---|---|
| SW mode | generateSW (no injectManifest), autoUpdate | vite.config.js:14, workbox.mode "production" line 24 |
| Precache manifest | Static assets only: js, css, html, ico, png, svg, woff2 (both index.html + worker.html shells) | vite.config.js:26 globPatterns; dist/sw.js precacheAndRoute list (worker.html, index.html, icons/*, brand/*) |
| Runtime caching routes | NONE. No runtimeCaching key in the workbox config at all | vite.config.js:23-42 (workbox block has no runtimeCaching); grep for runtimeCaching/NetworkFirst/StaleWhileRevalidate/CacheFirst across repo = 0 hits outside node_modules/dist |
| Navigation fallback | One NavigationRoute serving index.html for SPA nav; /api and /worker denied | vite.config.js:37 navigateFallbackDenylist [/^\/api/, /^\/worker/]; dist/sw.js has exactly 1 NavigationRoute + 1 registerRoute |
| API responses cached? | NO — /api is explicitly denied from navigation fallback and has no runtime cache route | vite.config.js:37; dist/sw.js grep: 0 NetworkFirst/BackgroundSync |
| Max file cached | 4 MiB | vite.config.js:38 |

So: offline you get the HTML/JS/CSS shell and icons. You get zero data.

### (2) Does any write work offline today?

No. Every write is a direct fetch with no fallback buffer.

- src/lib/workerFetch.js is a thin auth wrapper only. It attaches the x-worker-token header (or falls back to authFetch) and returns fetch(...) directly (workerFetch.js:83-99). It contains no queue, no IndexedDB, no background-sync registration, no localStorage write buffer. Its only localStorage/sessionStorage use is storing the auth token (TOKEN_KEY, workerFetch.js:20,38) and the admin preview id (PREVIEW_KEY, sessionStorage, workerFetch.js:58) — credentials, not data.
- Timesheet submit is a plain POST; on failure it just alerts. src/pages/worker/WorkerLogHours.jsx:305-320 — await workerFetch("/api/worker/timesheets", { method: "POST", ... }); the catch block (line 317) does alert("Network error — please try again"). Nothing is persisted for retry.
- All other worker writes are the same pattern (bare method: POST/PUT/PATCH, no offline handling): WorkerRequestDayOff.jsx:66; WorkerTasks.jsx:446,492,535,572,619,650,675,711,779.
- No offline libraries are installed: package.json has no idb, dexie, localforage, pouchdb, workbox-background-sync, or workbox-window — only vite-plugin-pwa (package.json:189).

### (3) Conflict handling

None exists on the client, because nothing is ever queued for later replay — every write is synchronous and immediate, so there is no client-side merge/last-write-wins logic. Server-side conflict behaviour for /api/worker/timesheets is out of this section's scope (server routes), but from the client there is no version token, no updated_at check, and no idempotency key sent in the payload (WorkerLogHours.jsx:305-311 payload has no client id/dedupe key).

### (4) What state is persisted client-side

| Persisted item | Storage | Evidence |
|---|---|---|
| Worker magic-link auth token | localStorage "blhub_worker_token" | workerFetch.js:16,20,38 |
| Admin "preview as worker" id | sessionStorage "blhub_worker_preview_employee_id" | workerFetch.js:52,58 |
| App shell (JS/CSS/HTML/icons) | Workbox precache (Cache Storage) | dist/sw.js precacheAndRoute |
| Timesheet drafts / entered hours / any GET data | NOT persisted — React useState only, lost on reload | WorkerLogHours.jsx:53-72 (all useState, no persistence) |

### Capability table

| Capability | Works offline today? | Evidence (file:line) |
|---|---|---|
| Launch installed PWA / load app shell | yes | dist/sw.js precacheAndRoute; vite.config.js:26 |
| Stay "logged in" offline (token) | yes | workerFetch.js:20,38 (localStorage token) |
| Load timesheet/projects/allocations data (GETs) | no | no runtime caching (vite.config.js:23-42); WorkerLogHours.jsx:80-99 live fetches, .catch(()=>null) |
| Enter hours in the form (in-memory) | partial — only if the page already loaded its data before going offline; nothing survives a reload | WorkerLogHours.jsx:53-72 (useState, no persistence) |
| Submit / save a timesheet | no | WorkerLogHours.jsx:305-320 (plain POST, catch → alert) |
| Request day off | no | WorkerRequestDayOff.jsx:66 |
| Update/complete tasks | no | WorkerTasks.jsx:446,492,535,572,619,650,675,711,779 |
| Photo upload for completion | no (network POST) | WorkerLogHours.jsx completion_photo_url flow (photoBusy state line 72) |
| Queued write replay on reconnect | no | no queue/outbox/background-sync anywhere; package.json:189 (no idb/dexie/workbox-background-sync) |
| Conflict resolution | n/a (nothing queued) | — |

### WHAT WOULD NEED TO CHANGE for offline-first timesheet entry

Honest summary: this is online-only today. To make offline timesheet entry real, the rebuild needs, roughly in order:

- Offline read cache: add Workbox runtimeCaching (StaleWhileRevalidate/NetworkFirst) for /api/worker/me, /projects, /allocations, /timesheets/:date, /jobs/:id/subtasks so the form can populate with no connection — none of this is cached today.
- Local draft persistence: persist in-progress entries (currently pure useState, WorkerLogHours.jsx:53-72) to IndexedDB so a reload/crash mid-shift doesn't wipe the day.
- Outbox queue in IndexedDB: wrap writes in workerFetch so a failed/offline POST is written to a durable outbox instead of alert("Network error") (WorkerLogHours.jsx:317). Add idb or dexie (not currently a dependency).
- Background Sync: register a Workbox BackgroundSyncPlugin queue (needs workbox-background-sync, a custom injectManifest SW instead of the current generateSW, and skipping the /api denylist for the synced routes) so queued timesheets flush automatically on reconnect; provide a manual "retry now" path for iOS Safari, which lacks Background Sync.
- Idempotent server upserts: client must send a stable client-generated id / idempotency key (today's payload has none, WorkerLogHours.jsx:305-311) so replayed queued submits don't create duplicate timesheets.
- Conflict strategy: define one (last-write-wins on updated_at, or reject-and-surface) since none exists client-side today; carry a version/updated_at on the timesheet and handle a 409 in the outbox drainer.
- Offline-usable auth: the magic-link token already persists in localStorage (workerFetch.js:20) and needs no live Supabase session, so auth is the one piece that already survives offline — but confirm the server accepts a token-authed replay whose original request was made while offline (clock skew / token expiry on x-worker-token).

---

## 7. INTEGRATIONS

All external integrations, verified by reading the wrapper files under server/lib/. Every credential below is a single SHARED value in a server env var (Railway) — there is no per-user or per-company credential store anywhere in the codebase except the Xero OAuth token table, which is itself app-global (see note).

| Integration | Used for | Auth model | Where creds/tokens live (NAME only) | Server wrapper (server/lib/) | In-scope dependency? |
|---|---|---|---|---|---|
| Xero | Accounts-receivable: create AUTHORISED invoices, contacts, fetch official PDF + pay link, sync paid status | Single SHARED app OAuth2 (auth-code). One Xero app for the whole product; OAuth tokens stored in DB but NOT scoped to an app account/company | env: XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI, XERO_SCOPES, XERO_TAX_TYPE, XERO_ACCOUNT_CODE_DESIGN, XERO_BRANDING_THEME_DESIGN. DB tables: xero_credentials (tokens, one row per connected org), xero_contacts, xero_invoices | xeroClient.mjs, xeroRoutes.mjs, xeroInvoices.mjs | YES — capability 8 (charge-up→invoice). See charge-up note below |
| Anthropic (Claude) | RFQ extraction, schedule generation, transcript/Blueprint AI, video/vision intelligence, marketing copy, procurement AI | Single SHARED api key | env: ANTHROPIC_API_KEY, CLAUDE_MODEL / BLUEPRINT_MODEL | No single wrapper — aiGateway.mjs is only a cost-logging/usage wrapper (estimateCost/wrapStream); each of ~19 route files does its own new Anthropic({ apiKey }) | Partial — none of the 8 in-scope modules require it; forecasting (cap 5) could optionally use it but core cost code is deterministic |
| OpenAI (Whisper) | In-app audio transcription (voice notes) | Single SHARED api key | env: OPENAI_API_KEY | transcribe.mjs (REST, whisper-1) | No — voice-note feature only |
| Buildxact/Buildexact | Sync jobs, create POs, reconcile quotes | Single SHARED api key/subscription key | env: BUILDEXACT_API_URL, BUILDEXACT_USERNAME, BUILDEXACT_API_KEY, BUILDEXACT_SUBSCRIPTION_KEY, BUILDEXACT_COMPLETE_ORDERS | buildexactClient.mjs (+ buildexactDeepIntegration/Sync/Reconcile/Parser/Webhook/IntegrationRoutes) | No — belongs to tendering/RFQ + job sync (out of scope), but carpentry job costs may be seeded from it |
| Dropbox | Job folders, file uploads, filing invoice/agreement PDFs | Single SHARED app refresh token | env: DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN, DROPBOX_NAMESPACE_ID, DROPBOX_TEMPLATE_PATH, DROPBOX_INTERNAL_VIEWER_EMAILS | dropboxClient.mjs | Tangential — xeroInvoices.mjs calls fileInvoicePdfToClientFolder(); WHS export could touch it, but not required |
| Gmail OAuth | Outbound email (preferred transport) | Single SHARED OAuth refresh token (one sender mailbox) | env: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER_EMAIL, GMAIL_REDIRECT_URI | gmailSend.mjs (via notifyMail.mjs sendPlainMail) | No — email is out-of-scope plumbing; not needed by any of the 8 |
| SMTP | Email fallback | Single SHARED creds | env: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM | smtpSend.mjs | No |
| IMAP | Inbound quote-email polling + append-to-sent | Single SHARED mailbox creds | env: IMAP_HOST, IMAP_PORT, IMAP_SECURE, IMAP_USER, IMAP_PASS | imapQuoteMatch.mjs, imapSentAppend.mjs | No — RFQ/quote inbox (out of scope) |
| Google Drive | Fee-proposal Google Docs workflow; shared OAuth base for Sheets/GSC/GA4/GBP | Single SHARED OAuth refresh token | env: GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN, GOOGLE_DRIVE_FOLDER_ID, GOOGLE_DRIVE_REDIRECT_URI | googleDriveClient.mjs, googleSheetsClient.mjs (reuses Drive OAuth) | No — fee proposals (out of scope) |
| Google Search Console / GA4 / GBP | Marketing Intelligence snapshots | Single SHARED (rides Drive OAuth token) + IDs | env: GOOGLE_SEARCH_CONSOLE_SITE_URL, GA4_PROPERTY_ID, GBP_LOCATION_ID | marketingIntelligenceRoutes.mjs | No — marketing (out of scope) |
| Meta (Instagram/Facebook) | Post reach/engagement | Single SHARED long-lived token | env: META_ACCESS_TOKEN, META_IG_USER_ID, META_PAGE_ID | marketingIntelligenceRoutes.mjs | No — marketing (out of scope) |
| Resend | CRM/mailing-list bulk email | Single SHARED api key | env: RESEND_API_KEY, RESEND_FROM | resendSend.mjs | No — CRM (out of scope) |
| Cal.com | Meeting booking (enquiry/presentation) | Single SHARED api key | env: CAL_API_KEY, CAL_TIMEZONE | calcom.mjs, calcomApi.mjs (+ calcomProjection/Routes/Webhook) | No — explicitly out of scope |

### Xero deep-dive — the make-or-break for multi-tenant billing

The Xero token store is effectively SINGLE-TENANT / app-global. Read the code:

- xeroClient.mjs:151 upserts xero_credentials with onConflict: "tenant_id" — the ONLY key is the Xero organisation's tenant_id. There is no app-account / company / user column tying a connection to a subscriber of the product.
- getConnectedTenant() (xeroClient.mjs:165-176) selects from xero_credentials ordered by updated_at desc, limit 1 — comment on line 164 says literally "we operate a single Blue Leaf org". Any invoice-create path (xeroInvoices.mjs:160) calls getConnectedTenant() with no account context, so it always bills through whichever org refreshed most recently.
- disconnectXero() (xeroClient.mjs:319-323) deletes ALL rows (.not("tenant_id","is",null)) — one tenant disconnecting nukes every connection.
- OAuth state is signed with the shared XERO_CLIENT_SECRET (xeroClient.mjs:80-98); the callback is a public route /api/public/xero/callback (xeroRoutes.mjs:259) with no per-account association.

Conclusion: to go multi-tenant, xero_credentials, xero_contacts, xero_invoices all need an account_id/company_id column, getConnectedTenant + getXeroAccessToken must take that scope, and the single app-level XERO_CLIENT_ID/SECRET would remain shared (that is fine — Xero allows one app serving many orgs) but every token row and every lookup must be keyed per subscriber. As written it is one shared Xero connection for the whole app.

Charge-up→Xero (capability 8) is NOT actually built. INVOICE_TYPES in xeroInvoices.mjs:22-43 contains only concept_fee and design_package, both scope: "lead" — comment line 42 says "progress_claim / job_variation / deposit — added later." chargeUpService.mjs computes wage cost and charge-out $ (rollupBySubJob / chargeOutFromMargin), and chargeUpRoutes.mjs exposes only site CRUD + analytics — no createXeroInvoice call anywhere in the charge-up or carpentry paths (grep for charge-up→xero invoice returns nothing). So the charge-out dollars stop at reporting; pushing them onto a Xero invoice is unimplemented and would be net-new work.

### Blunt note — single-shared-key vs per-user

Every integration in this codebase is SINGLE-SHARED-KEY today. There is not one per-user or per-company credential anywhere. Xero is the only one with tokens in the DB rather than raw env, but even that is app-global (keyed on the Xero org, not on a product subscriber). Anthropic, OpenAI, Buildxact, Dropbox, Gmail, SMTP, IMAP, Google (Drive/Sheets/GSC/GA4/GBP), Meta, Resend and Cal.com are all one shared secret in Railway env, hardcoded to Blue Leaf's own accounts. For a multi-tenant product this is a blanket blocker: the in-scope Xero charge-up-to-invoice path in particular MUST become per-subscriber (new account-scoping columns + scoped token lookups) before any crew could bill through their own Xero. Dropbox is the only other integration in-scope code touches (invoice PDF filing), and it too is one shared team account.

---

## 8. DEPENDENCY MAP

Traced by reading the import statements of each in-scope entry file (frontend + server) and classifying every target as SHARED-INFRA (portable), IN-SCOPE, or OUT-OF-SCOPE COUPLING. Line numbers are the import line in the entry file.

### Module A — Workforce / timesheets (src/pages/Workforce.jsx + server/lib/workforceRoutes.mjs)

Frontend Workforce.jsx:

| Imports from | Classification | What comes along / concern |
|---|---|---|
| react, react-router-dom (L1-2) | SHARED-INFRA | portable |
| lib/authFetch.js, lib/apiFetch.js (L3-4) | SHARED-INFRA | the fetch wrappers — portable |
| lib/useAuth.js (L5) | SHARED-INFRA | AuthContext (Supabase session/role) — portable |
| lib/roles.js (L6) | SHARED-INFRA | but carries client role + getDefaultRoute portal routing |
| lib/taskCategories.js (L7) | IN-SCOPE | tiny (16 lines), clean |
| lib/constants.js (L8) | OUT-OF-SCOPE COUPLING | pulls CHARGE_UP_REFERENCE / INTERNAL_REFERENCE / groupInternalJobs / internalJobLabel from a 1041-line grab-bag also full of LEAD_/TENDER_/CONSULTANT_/CRM_ constants |
| WorkforceTeam / WorkforcePlannerTab / WorkforcePipelineTab / TimeOffApprovalsTab (L9-12) | IN-SCOPE | see pipeline caveat below |
| components/workforce/WorkforceKpiStrip, TimesheetDetailModal (L13-14) | IN-SCOPE | TimesheetDetailModal only name-drops Buildxact in error strings (L111,121), no import — safe |

WorkforcePlannerTab.jsx: plannerColors.js (in-scope) + constants.js (same grab-bag coupling, L5).
WorkforcePipelineTab.jsx: imports lib/stageRipple.js (L13) which is the worst frontend coupling — see below.

Server workforceRoutes.mjs:

| Imports from | Classification | What comes along / concern |
|---|---|---|
| supabaseService, requireAuth, apiResponse, dateYmd, siteMedia, addressNormalise (L2,3,8,9,11,12) | SHARED-INFRA | portable |
| costModelService (L5) | IN-SCOPE | cost/charge rates — core |
| carpentrySubtaskDictionary (L6) | IN-SCOPE | |
| chargeUpService validateChargeUpSite (L13) | IN-SCOPE | |
| taskAssignments, taskAudit, voiceTasks (L10,14,15) | IN-SCOPE / shared feature | voiceTasks = AI transcript→tasks, optional |
| whs/carpentrySwmsRoutes, whs/carpentryWhsPackRoutes (L16-17) | IN-SCOPE (WHS) | |
| buildexactClient (L4), buildexactDeepIntegration (L7) | OUT-OF-SCOPE COUPLING | Buildxact estimating SaaS. Timesheet approval creates/completes Buildxact purchase orders (createPurchaseOrder, buildexactCompleteOrdersEnabled). Approval is welded to Buildxact. |

Worker PWA endpoints (/api/worker/*) live INSIDE this same file (L2401-3125), so the Worker API inherits the Buildxact import too.

### Module B — Worker PWA (src/pages/worker/* + src/components/worker/*)

| Imports from | Classification | What comes along / concern |
|---|---|---|
| lib/workerFetch.js | SHARED-INFRA | magic-link token wrapper — portable, worker-specific |
| components/worker/WorkerLayout, PlansSheet, SafetySheet | IN-SCOPE | offline banner lives here (no offline write queue) |
| lib/workerJob.js, workerPhoto.js, plannerColors.js | IN-SCOPE | |
| lib/constants.js (groupInternalJobs, internalJobLabel, DAY_OFF_REQUEST_STATUSES) — WorkerLogHours L5, WorkerRequestDayOff L5 | OUT-OF-SCOPE COUPLING | same grab-bag file |
| components/AssigneeStack, AssigneePickerSheet (WorkerTasks L10-11) | SHARED-INFRA | shared UI, used app-wide |
| @dnd-kit (WorkerTasks L2-4) | IN-SCOPE | planner reorder |

Verdict: the Worker PWA frontend is the CLEANEST in-scope module — no sales/CRM/schedule imports, only the constants.js grab-bag. Its server side is tangled only via sharing workforceRoutes.mjs (Buildxact).

### Module C — Carpentry job costs / budgets (src/pages/CarpentryJobDetail.jsx + server/lib/carpentryRoutes.mjs)

Frontend CarpentryJobDetail.jsx:

| Imports from | Classification | What comes along / concern |
|---|---|---|
| dnd-kit, apiFetch, useAuth, roles (L1-8) | SHARED-INFRA | portable |
| ChargeUpJobDetail, InternalJobDetail, InternalHouseJobDetail (L9-11) | IN-SCOPE | charge-up + cost categories |
| components/carpentry/WhsPackTab (L13) | IN-SCOPE (WHS) | |
| components/carpentry/CarpentrySiteDiary (L12) | OUT-OF-SCOPE COUPLING | site diary is explicitly out of scope — embedded as a tab |
| JobPlansCard, TaskDeleteLog, AssigneeStack, AssigneePickerSheet (L14-17) | SHARED-INFRA | |

Server carpentryRoutes.mjs (imports start L31):

| Imports from | Classification | What comes along / concern |
|---|---|---|
| supabaseService, requireAuth, apiResponse, siteMedia (L31-34) | SHARED-INFRA | |
| costModelService getCostModel/burnForLine (L43) | IN-SCOPE | |
| marginProjection categoryPctComplete/projectMargin (L46) | IN-SCOPE | job cost forecasting — core |
| subtaskRollup (L47), financialYear auFyQuarter (L48) | IN-SCOPE | |
| internalCategoryService (L49), carpentrySubtaskDictionary (L44), carpentryScheduleUtils (L40) | IN-SCOPE | |
| taskAssignments, taskAudit, transcribe, voiceTasks (L35-37,45) | shared feature | AI voice optional |
| geocodeService geocodeToFacts (L42) | shared (site facts) | ties into factsService enrichment also used by sales |
| buildexactClient (L38), buildexactDeepIntegration (L39), buildexactParser (L41) | OUT-OF-SCOPE COUPLING | Buildxact is the BUDGET SOURCE — job budgets/sub-tasks are pulled from Buildxact estimates (pullBuildexactEstimate, getEstimateItems, parseXLSX). Job-cost tracking cannot run without either Buildxact or a replacement importer. |

### Module D — Cost-rate calculator + internal categories (costModelService.mjs, internalCategory*.mjs, financialYear.mjs, marginProjection.mjs)

| File | Imports from | Classification |
|---|---|---|
| financialYear.mjs | NOTHING (pure) | IN-SCOPE — GOLD, zero coupling, deterministic AU FY/quarter + super math |
| costModelService.mjs | supabaseService only (L4) | IN-SCOPE — clean |
| internalCategoryService.mjs | financialYear (auFyQuarter, superGuaranteeForFy) (L16) | IN-SCOPE — clean |
| internalCategoryRoutes.mjs | supabaseService, requireAuth, apiResponse + internalCategoryService | IN-SCOPE — clean |
| marginProjection.mjs | NOTHING (pure) | IN-SCOPE — GOLD, pure forecasting math |

Verdict: this is the most portable in-scope cluster — pure/near-pure math with only Supabase + infra imports. No out-of-scope coupling. These are the safe-to-lift assets (and the ones with real unit tests).

### Module E — WHS (server/lib/whsRoutes.mjs + server/lib/whs/* + components/carpentry/WhsPackTab.jsx)

| Imports from | Classification | What comes along / concern |
|---|---|---|
| whsRoutes.mjs → supabaseService, requireAuth, dateYmd (L1,11,12) | SHARED-INFRA | incident records |
| whsRoutes.mjs → module6PdfKit buildIncidentReportPdfBuffer (L10) | IN-SCOPE (WHS) | module6 = WHS incident PDF; export path exists |
| whs/whsEngineRoutes.mjs → factsService getJobProfile (L10) | OUT-OF-SCOPE COUPLING (shared) | factsService/site-facts also feeds sales site enrichment |
| whs/whsEngineRoutes → whsQuestionnaire, whsRiskRules, whsMergeFields, whsRenderer | IN-SCOPE | self-contained WHS engine |
| whs/carpentryWhsPackRoutes → packCompose, packPdfKit, hierarchyBar, carpentryScope, carpentrySwmsMap (L8-13) | IN-SCOPE | pack + PDF export |
| whs/carpentryWhsPackRoutes → brandingAssets getBrandingEmailLogo (L12) | SHARED-INFRA | branding, portable |
| WhsPackTab.jsx → lib/whsHierarchy.js, lib/carpentryScope.js (L7-8) | IN-SCOPE | |

Verdict: WHS is largely self-contained in the whs/ folder; only real drag is factsService (site facts shared with sales enrichment) and it has genuine PDF export (packPdfKit, module6PdfKit).

### Module F — Xero charge-up (#8): xero*.mjs + XeroInvoiceCard

| Imports from | Classification | What comes along / concern |
|---|---|---|
| xeroClient.mjs → crypto, supabaseService, appUrl (L21-23) | SHARED-INFRA | OAuth + rotating token store — portable, clean |
| xeroInvoices.mjs → xeroClient, supabaseService (L17-18) | IN-SCOPE-ish | generic invoice create |
| xeroInvoices.mjs → dropboxClient fileInvoicePdfToClientFolder (L19) | OUT-OF-SCOPE COUPLING | files invoice PDF into client/portal Dropbox folders |
| xeroRoutes.mjs → invoiceEmail, notifyMail, emailSignature (L28-30) | OUT-OF-SCOPE COUPLING | sales invoice emailing pipeline |
| XeroInvoiceCard.jsx path = components/sales/lead-detail/ | OUT-OF-SCOPE COUPLING | the ONLY Xero UI lives inside the sales LeadDetail; it invoices concept/discovery FEES, not wage charge-up |

CRITICAL FINDING — the in-scope capability #8 does NOT exist as built. Grep confirms zero linkage: chargeUpRoutes.mjs / chargeUpService.mjs contain no reference to Xero, and xeroRoutes.mjs / xeroInvoices.mjs contain no reference to charge-up / wage / timesheet / carpentry. The Xero integration is wired 100% to the sales lead-fee flow. For the new product, xeroClient.mjs (OAuth token store) and a generic invoice-create are reusable, but the charge-up→Xero invoice path must be built from scratch.

### Worst couplings — the shared files that mix in-scope + out-of-scope and must be split

- src/lib/constants.js (1041 lines) — imported by almost every in-scope frontend file for a handful of constants (TIMESHEET_STATUSES L664, DAY_OFF_REQUEST_STATUSES L671, EMPLOYMENT_TYPES L683, LEAVE_TYPES L923, CHARGE_UP_REFERENCE L880, INTERNAL_REFERENCE L885, groupInternalJobs L903, internalJobLabel L914, CARPENTRY_COST_TYPES L944, GST helpers L840-849) yet the same module carries all sales/CRM/tender/consent constants (LEAD_* ~L20-450, TENDER_SUBSTATUS L162, CONSULTANT_* L99-120, CONSENT_* L228-254, CRM_* L493-603, XERO_INVOICE_* L467-485). This one file drags the entire sales domain into every in-scope import. Must be split into scope-specific constant modules.

- server/lib/workforceRoutes.mjs AND server/lib/carpentryRoutes.mjs — both hard-import the Buildxact client trio (buildexactClient, buildexactDeepIntegration, buildexactParser). Buildxact is the budget source (carpentry) and the actuals sink (timesheet approval → purchase orders). Job-cost tracking + timesheet approval cannot be lifted without either porting the Buildxact client or replacing it with a native budget importer. This is the single biggest architectural entanglement for the in-scope money features. Also note: all /api/worker/* endpoints live inside workforceRoutes.mjs, so the offline-first Worker API is trapped in the same Buildxact-coupled file.

- src/lib/stageRipple.js → src/lib/scheduleUtils.js — WorkforcePipelineTab.jsx (the crew-allocation forward planner) reuses the Operations scheduler's dependency-ripple engine. stageRipple.js's own header says it reuses "the Operations scheduler's dependency-ripple engine (scheduleUtils.previewRipple)". Out-of-scope schedule/Gantt code is pulled into the in-scope Workforce planner.

- server/dev-api.mjs (3000+ lines) — single Express process; imports and registers ~90 route modules (sales, marketing, portal, blueprint, tender, Cal.com AND the in-scope workforce/carpentry/whs/xero/chargeup) with blanket middleware/guards. No module isolation; the in-scope route registrations (L1012-1047) are interleaved with everything out of scope. Extracting the in-scope API means peeling routes out of one monolith that also owns auth guards, email pollers, and webhook handlers.

- server/lib/xeroInvoices.mjs → dropboxClient (client folders) + xeroRoutes.mjs → invoiceEmail/notifyMail/emailSignature — the Xero layer is bound to sales-invoice emailing and client/portal Dropbox filing. Reuse xeroClient.mjs (clean OAuth) but treat the invoice routes/UI as sales-specific and rebuild the charge-up path.

- server/lib/factsService.mjs (getJobProfile / geocodeToFacts) — shared across WHS engine, carpentry routes, and sales site enrichment; a shared site-facts store that will need a clean boundary if WHS/carpentry are lifted without sales.

- src/lib/roles.js — minor: carries the client role and getDefaultRoute portal routing (out of scope) alongside can.accessWorkforce/accessCarpentry (in scope). Small, easy to trim.

---

## 9. PORT / REWRITE / LEAVE VERDICT

Verdicts are split UI vs data. The single dominant fact forcing most DATA rows to REWRITE: there is NO tenant column on any in-scope table (confirmed section 3) and the whole server does data access via one shared service-role key (section 4), so every table and query needs a company_id added and every server route needs tenant scoping — that is a rewrite of the data layer regardless of how clean the UI is. Effort: S = days, M = 1-2 weeks, L = 3+ weeks.

| Capability | UI-layer verdict + effort | Data-layer verdict + effort | Reasoning |
|---|---|---|---|
| Timesheets + approvals | PORT (M) | REWRITE (L) | UI (Workforce.jsx, TimesheetDetailModal, WorkforceKpiStrip) is clean React and portable. Data layer must be rewritten: add company_id to employees/timesheets/timesheet_entries, add tenant scoping to every workforceRoutes query, AND cut the Buildxact weld — approval calls createPurchaseOrder/completePurchaseOrder (workforceRoutes.mjs:4,267-273) and resolves buildexact_job_id; a standalone product cannot ship that. |
| Crew allocations / Workforce planner | PORT (M) | REWRITE (M) | @dnd-kit planner UI (WorkforcePlannerTab, plannerColors.js) is reusable; only coupling is constants.js grab-bag (LEAD_/TENDER_ constants alongside INTERNAL_/CHARGE_UP_). Data: workforce_allocations/crews/crew_members have no tenant column and the XOR project_id/carpentry_job_id CHECK plus internal-category singletons (mig 203) need per-tenant redesign. |
| Job cost tracking (carpentry costs + budgets) | REWRITE (L) | REWRITE (L) | Carpentry cost UI and financeCCRoutes/jobFinanceRoutes are large and tangled with supplier financial_documents, WIP/AA review, progress claims and the sales lead pipeline (invoice statuses xero_synced etc.). Keep the budget-vs-actual + cost-rollup LOGIC; rebuild the code decoupled from leads/tendering and tenant-scoped. Biggest single rebuild. |
| Worker PWA — time entry | PORT (S) | REWRITE (M) | Cleanest in-scope module (section 8): worker frontend imports no sales/CRM/schedule code. workerFetch.js magic-link wrapper is portable. Data/API rewrite: /api/worker/* lives INSIDE workforceRoutes.mjs (L2401-3125) so it inherits the Buildxact import; worker_token auth must become tenant-aware; add company_id. |
| Worker PWA — planner + OFFLINE | REWRITE (M) | REWRITE (M) | The planner UI ports, but "offline" does not exist to port — verified: no runtimeCaching, no IndexedDB/idb/dexie/localforage, no background-sync (section 6). WorkerLayout.jsx:26-138 only shows a banner "changes can't be saved until you reconnect." Offline read cache + write queue + conflict handling must be built from zero. This is net-new, not a port. |
| Job cost forecasting | REWRITE (M) | REWRITE (M) | Forecast logic is spread across financeCCRoutes/jobFinanceRoutes/projectInsights/scheduleIntelligence, and scheduleIntelligence + blueprintRoutes drag in the out-of-scope schedule/Gantt engine and the Anthropic AI gateway. Core cost projection is deterministic (chargeOutFromMargin etc.) and worth keeping; extract it clean of the schedule/AI coupling and tenant-scope it. |
| WHS records + export | PORT (M) | REWRITE (M) | server/lib/whs/* is a self-contained pack: questionnaire, risk rules, SWMS map, packCompose + packPdfKit for export. UI/generators port with light work. Data: WHS tables need company_id and the export path (packPdfKit, and any Dropbox filing) must be tenant-scoped. Export to PDF already works; export target storage needs rework. |
| Employee cost / charge-up RATE calculator | PORT (S) | REWRITE (S) | The rate math is small and testable: costModelService.mjs (66 lines) + chargeUpService.mjs (139 lines, chargeOutFromMargin, stripCost, rollups) with a real test (scripts/tests/charge-up.test.mjs). Logic PORTs almost as-is. Data layer is small (cost model tables, workforce_settings single-row config) but must become per-tenant rows instead of one org singleton. |
| Wage charge-up → Xero invoice | REWRITE (L) | REWRITE (L) | BLUNT: this capability does NOT exist end-to-end today. The only createXeroInvoice callers are sales-side — invoiceType "design_package" and "concept_fee", both keyed off leads (xeroRoutes.mjs:99-100,139-140). chargeUpService computes chargeOut amounts but NOTHING wires them into a Xero invoice. Plus Xero is a single SHARED app OAuth connection (section 7), not per-tenant. So both the wage→invoice bridge AND per-tenant Xero connections must be built new. |

BOTTOM LINE: Rough total effort is on the order of 3-4 months for one experienced full-stack dev to reach a shippable multi-tenant MVP of the 8 capabilities, and it is dominated by three things. (1) Multi-tenancy retrofit — every in-scope table needs a company_id and every workforce/carpentry/charge-up route needs tenant scoping plus real RLS, because today isolation is "one shared service-role key against a single-company DB" (sections 3-4); this touches everything. (2) The offline Worker PWA — it is a from-scratch build (read cache + durable write queue + sync/conflict), not a port, because nothing offline exists beyond a banner (section 6). (3) Decoupling job-cost + the two integrations — carpentry cost tracking is welded to the sales lead pipeline, timesheet approval is welded to Buildxact purchase orders, and the headline "wage charge-up to Xero" is not actually built and sits behind a single shared Xero connection. The rate/charge-up math (capabilities 7, and the compute half of 8) is the one genuinely PORT-able, tested core and should be lifted first as the foundation.

## 10. RISKS AND SURPRISES

### SECURITY

- Single shared service-role key does ALL data access. Every server route reads/writes via getServiceSupabase() (service role), which bypasses RLS entirely (server/lib/supabaseService.mjs, requireAuth.mjs). In a multi-tenant world a single missing "WHERE company_id = caller.company" turns into cross-tenant data leakage — there is no RLS backstop today because the tables fail closed and rely on the server being the only client (migration 111 header).
- RLS is deny-all, not tenant isolation. In-scope tables (employees, timesheets, timesheet_entries, workforce_settings, workforce_crews/allocations, carpentry_*) have RLS enabled with NO permissive policy after mig 111/117. This is a lockdown, not a boundary — it provides zero protection between tenants once you add them.
- Worker auth is a static bearer token. Workers authenticate with employees.worker_token via the x-worker-token header (workerFetch.js; workerAuth inline at workforceRoutes.mjs:2361-2398). It is a long-lived, non-expiring, non-rotating secret in localStorage (blhub_worker_token). No refresh, no revocation flow beyond flipping is_active. For a subscription product handing out magic links to trade crews, this needs expiry/rotation.
- Admin "preview as worker" impersonation. workerAuth lets an admin pass x-preview-employee-id / previewEmployeeId to act as any employee (workerFetch.js:58; workforceRoutes.mjs:2373-2398). Read-only today, but must be tenant-fenced so an admin of tenant A can never preview an employee of tenant B.
- Secrets are all shared, single-value env vars (names only, no values printed). Xero (XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI), Anthropic (ANTHROPIC_API_KEY), OpenAI (OPENAI_API_KEY), Dropbox (DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN, DROPBOX_NAMESPACE_ID), Gmail (GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN), SMTP (SMTP_USER, SMTP_PASS), IMAP (IMAP_USER, IMAP_PASS), Buildexact (BUILDEXACT_API_KEY, BUILDEXACT_SUBSCRIPTION_KEY). All are one credential for the whole app — see multi-tenancy blockers.
- Stray root script test-dropbox.mjs sits at repo root (a Dropbox connectivity probe) — audit it for any embedded token before any open-sourcing; it is not part of the app but ships in the tree.

### MULTI-TENANCY BLOCKERS (the big ones)

- No tenant column anywhere. Confirmed by grep of all 200 migrations: zero company_id/org_id/tenant_id/account_id on any ownership table. The only tenant_id hits are Xero's OWN org id (mig 020, 182). The DB is 100% single-company by construction. This is the number-one blocker.
- Single shared Xero connection. Capability 8 depends on Xero, but xero_credentials holds app-global OAuth tokens (one connected Xero org for the whole product) and the OAuth env vars are shared. Per-tenant Xero connect is net-new.
- Wage→Xero invoice capability is not actually built. Only createXeroInvoice callers are sales-side (invoiceType "design_package"/"concept_fee" off leads, xeroRoutes.mjs:99-140). No route turns charge-up/wage cost into a Xero invoice today.
- Single shared identity pool. One Supabase project, one auth user pool, user_profiles.role with no company scoping (AuthContext.jsx:95-99; requireAuth.mjs). auth_is_staff() (mig 104) only splits staff vs portal client within the one company.
- Org config is single-row singletons. workforce_settings is seeded as ONE row (INSERT DEFAULT VALUES); internal-job / charge-up reference categories are singletons (migs 200/203). These must become per-tenant rows.
- Company identity hardcoded, not config. Bank details, ABN, brand hex #006c9b, Dropbox namespace, "Blue Leaf Building" strings and email signatures are baked into JS defaults, JSX literals, server PDF/email generators and migration seed rows (section 5) — all must become per-tenant config.

### DEAD / DUPLICATED CODE

- Duplicated brand colour literal. #006c9b / #006C9B hardcoded across server/lib/poPdfKit.mjs:7, feeProposalPdfKit.mjs:4, module6PdfKit.mjs:3, emailTemplates/layout.mjs:8, financeEmails.mjs — plus tailwind.config.js. Should be one token.
- Duplicated email signature. DEFAULT_EMAIL_SIGNATURE in src/lib/rfqSettings.js and server/lib/emailSignature.mjs:13 kept "byte-identical" by hand.
- Duplicated WorkerLayout. src/pages/worker/WorkerLayout.jsx and src/components/worker/WorkerLayout.jsx both exist (both reference line 118 brand text) — confirm which is live before porting.
- constants.js grab-bag. A ~1041-line file mixing in-scope constants (CHARGE_UP_REFERENCE, INTERNAL_REFERENCE, groupInternalJobs) with out-of-scope LEAD_/TENDER_/CONSULTANT_/CRM_ constants; every in-scope module that imports it drags the whole thing.
- Migration sprawl. 200 files numbered 001-203 with gaps (no 018-019, 076, 080; 103b suffix) and repeated reconcile passes on company_profile (069/106/157/160). No consolidated schema.sql — the migrations ARE the schema, which makes standing up a fresh tenant DB painful.
- Stray root files: test-dropbox.mjs at repo root; whole out-of-scope subsystems (sales, tendering, marketing studio, Cal.com, Blueprint AI) still interleaved in server/lib and src/.

### FRAGILE AREAS (money / cost correctness)

- Charge-up margin math has divide-by-zero and rounding edges. chargeOutFromMargin(cost, marginPct) = cost/(1-margin); the 100%-margin case is guarded to 0 (charge-up.test.mjs:95) but this whole path is money that ends up on invoices — high blast radius if ported carelessly.
- ex-GST vs inc-GST handling. Job cost figures move through financeCCRoutes on amount_ex_gst columns while Xero invoices take amountExGst; the GST boundary is implicit and spread across services — a classic place for a 10% error.
- Timesheet approval side-effects. Approval isn't just a status flip — it creates/completes Buildexact purchase orders and writes buildexact_completed_at/buildexact_sync_error (workforceRoutes.mjs:267-273). If the external call fails mid-approval, state can diverge; the standalone rebuild must make approval atomic and integration-free.
- Offline data loss risk. Today a worker offline gets alert("Network error — please try again") and the entry is lost (WorkerLogHours.jsx:305-320); nothing is buffered. Until a real write queue exists, the PWA silently drops field time entries.
- OT / double-time and RDO logic. employees carry overtime/double_time multipliers and there are RDO/public-holiday tables (mig 119); overtime_hours flows into cost_amount. Correctness of these multipliers is money-critical and lives partly in DB columns, partly in service code.

### MISSING TESTS (in-scope money logic)

- Tests that DO exist (node-based, run via scripts/test-critical-paths.mjs — no vitest/jest): scripts/tests/charge-up.test.mjs (margin/charge-out — good), margin-projection.test.mjs, subtask-rollup.test.mjs, internalLeaveCost.test.mjs, internalJobE2E.test.mjs, plus WHS and workforce-pipeline specs.
- Untested in-scope money paths: costModelService.mjs (the employee cost/rate calculator itself — capability 7 core) has no dedicated unit test; timesheet OT/double-time cost computation and the approval→cost_amount path have no unit test; forecasting logic in financeCCRoutes/jobFinanceRoutes/projectInsights is untested; and there is NO test covering wage→Xero invoicing (because it isn't built). The single most-shipped money function (cost rate calc) is effectively unverified.

### OTHER THINGS THAT WILL BITE

- Deploy is split and proxied. Vercel serves the SPA and rewrites /api/* to a hardcoded Railway URL (vercel.json → blue-leaf-hub-production.up.railway.app). A multi-tenant product needs this URL and the whole single-environment assumption reworked.
- Frontend never calls the API directly — everything is proxied — so any per-tenant routing/subdomain scheme has to be designed into both Vercel rewrites and the Express app.
- No state library. Global state is 3 React contexts only (no react-query/redux/swr); adding tenant context and offline sync state will strain this and likely needs a real data-fetching/caching layer introduced during the rebuild.
- AI/LLM coupling in "forecasting" and schedule intelligence pulls in the Anthropic gateway and out-of-scope Blueprint/schedule engine — easy to accidentally drag in when extracting forecast logic.

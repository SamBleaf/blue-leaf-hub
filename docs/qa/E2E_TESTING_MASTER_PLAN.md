# Blue Leaf Hub — E2E Testing Master Plan

**Version:** 1.0  
**Date:** 2026-06-22  
**Owner:** QA / Deployment Readiness  
**Status:** Framework implemented; coverage ~15% of full workflow surface

---

## Executive summary

Blue Leaf Hub is a large React + Express + Supabase construction operations platform with **73 page components**, **~500 API endpoints** across 35+ route modules, and **109 database migrations**. Prior to this sprint, automated testing consisted of:

| Layer | Tool | Coverage |
|-------|------|----------|
| API smoke | `scripts/test-critical-paths.mjs` | Env, auth, sales read, finance read, schedule templates, portal v2 auth boundary |
| Portal security | `scripts/adversarial_e2e.mjs` | Client isolation, RLS, IDOR, cost leakage |
| Manual demo seed | `scripts/test_client_setup.mjs` | Walk-through client portal |
| Finance seed | `scripts/seed-test-job.mjs` | Job Command Centre demo data |
| **Browser E2E** | **None** → **Playwright (new)** | Auth, portal nav, admin reads, visual baselines |

**This plan defines the full target matrix.** Implemented tests are listed in `e2e-test-report.md` with honest pass/fail/skip status.

---

## 1. Current App Map

### 1.1 Architecture

```
Browser (Vite :5174) ──proxy──► Express API (:8787) ──► Supabase (service role)
                                    │
                                    ├── Anthropic (AI)
                                    ├── Gmail / SMTP
                                    ├── Dropbox / Drive
                                    ├── Buildexact
                                    └── IMAP (quotes)
```

### 1.2 Frontend routes (by module)

#### Public (no login)

| Route | Page | Purpose |
|-------|------|---------|
| `/login` | Login | Supabase email/password |
| `/signup` | Signup | Self-registration (if enabled) |
| `/accept-invite/:token` | AcceptInvite | Staff/client invite acceptance |
| `/induct/:projectId` | SiteInduction | Public site induction QR flow |
| `/portal/:token/*` | PortalApp | Token-based legacy client portal |
| `/worker` | WorkerHome | Worker PWA timesheet (magic link token) |
| `/worker/timesheet/log` | WorkerLogHours | |
| `/worker/tasks` | WorkerTasks | |
| `/worker/week` | WorkerWeek | |

#### Authenticated — role-gated

| Route prefix | Roles | Key pages |
|--------------|-------|-----------|
| `/` | all | RootRedirect → role picker / default route |
| `/home` | admin, supervisor, employee | Home dashboard |
| `/supervisor` | all staff | SupervisorHome (field-first) |
| `/field/*` | admin, supervisor, employee | FieldLayout: jobs, tasks, WHS, diary |
| `/client-portal/*` | client | ClientHome, Actions, Journey, Selections, Documents, Messages, MyHome |
| `/my-portal` | client | Legacy redirect |
| `/sales/*` | **admin only** | Pipeline, LeadDetail, SalesManager, ReferenceProjects |
| `/tender-manager/*` | **admin only** | RFQ Engine, RFQ Packages, Subcontractors, TenderBoard, Fee Proposals, Cost Intelligence, Settings |
| `/operations/*` | admin, supervisor, employee | OperationsList, ProjectDetail, Schedule, WHS, SiteDiary, Procurement |
| `/finance/*` | **admin only** | FinanceManager, JobCommandCentre |
| `/marketing/*` | **admin only** | Marketing (Create/Library/Campaigns/Media/Music) |
| `/workforce/*` | admin, supervisor | Timesheets, Team Directory |
| `/carpentry/*` | admin, supervisor | Carpentry dashboard + job detail |
| `/portal-admin/*` | **admin only** | PortalAdmin, PortalV2Admin |
| `/confirm-queue` | admin, supervisor | Fact confirmation queue |
| `/settings/users` | **admin only** | UserManagement |
| `/documents-templates` | **admin only** | Document template registry |

### 1.3 API modules (~endpoint counts)

| Module | File | ~Endpoints | Auth |
|--------|------|------------|------|
| Sales / CRM | `salesRoutes.mjs`, `crmRoutes.mjs` | 53 | requireAuth (+ admin for CRM jobs tab) |
| RFQ / Tendering | `module4Routes.mjs`, `rfqPackageRoutes.mjs`, `rfqTradeRoutes.mjs` | 32 | Mixed — several legacy routes **lack requireAuth** |
| Fee proposals | `module5Routes.mjs` | 11 | requireAuth |
| Operations / Schedule | `module6Routes.mjs`, `scheduleRoutes.mjs`, `operationsRoutes.mjs` | 36 | requireAuth |
| Site diary | `siteDiaryRoutes.mjs` | 3 | requireAuth |
| Finance | `financeRoutes.mjs`, `financeCCRoutes.mjs` | 57 | requireAuth (+ admin for sensitive) |
| Procurement | `procurementRoutes.mjs` | 26 | requireAuth + role |
| Workforce | `workforceRoutes.mjs` | 37 | requireAuth + role |
| WHS | `whsRoutes.mjs`, `whs/whsEngineRoutes.mjs` | 13 | requireAuth |
| Carpentry | `carpentryRoutes.mjs` | 30 | requireAuth + role |
| Marketing | `marketingRoutes.mjs`, `marketingIntelligenceRoutes.mjs` | 66 | requireAuth + admin |
| Client portal v1 | `portalRoutes.mjs` | 32 | Token + requirePortalAuth |
| Client portal v2 | `portalV2Routes.mjs` | 24 | requirePortalAuth |
| Portal admin v2 | `portalV2AdminRoutes.mjs` | 20 | requireAuth + admin/supervisor/employee |
| Auth / Admin | `authRoutes.mjs`, `adminRoutes.mjs` | 9 | Mixed public + admin |
| Blueprint AI | `blueprintRoutes.mjs` | 7 | requireAuth |
| Templates | `templateRegistryRoutes.mjs` | 7 | requireAuth + admin |
| Facts / Control Tower | `factsRoutes.mjs`, `controlTowerRoutes.mjs` | 6 | requireAuth |
| Buildexact | `buildexactIntegrationRoutes.mjs` | 7 | requireAuth |
| Jobs API | `jobsApiRoutes.mjs` | 7 | requireAuth |
| Induction | `inductionRoutes.mjs` | 2 | **Public** |
| Supervisor | `supervisorRoutes.mjs` | 1 | requireAuth |
| Cost intelligence | `costIntelligenceRoutes.mjs` | 14 | requireAuth |
| Company cost model | `companyCostModelRoutes.mjs` | 2 | requireAuth + admin |
| **dev-api.mjs inline** | cron, dropbox, rfq send, imap, integrations | ~25 | **Several unauthenticated — deployment risk** |

### 1.4 Major database tables (by domain)

| Domain | Tables |
|--------|--------|
| Core job spine | `jobs`, `projects`, `leads`, `lead_activities`, `lead_conversations`, `lead_notes`, `lead_documents` |
| Tendering | `rfqs`, `rfq_packages`, `rfq_trade_scopes`, `rfq_recipients`, `fee_proposals`, `subcontractors`, `trade_master_library` |
| Operations | `schedule_tasks`, `schedule_templates`, `schedule_eot`, `task_dependencies`, `site_diary`, `site_tasks`, `site_reports` |
| Procurement | `suppliers`, `procurement_items`, `procurement_templates`, `purchase_orders` |
| Finance | `financial_documents`, `job_variations`, `progress_claims`, `job_budgets`, `trade_categories` |
| Workforce | `employees`, `timesheets`, `timesheet_entries`, `workforce_settings` |
| WHS | `whs_site_profiles`, `whs_documents`, `site_inductions`, `contractor_compliance` |
| Portal v1 | `portal_updates`, `portal_milestones`, `portal_decisions`, `portal_claims`, `portal_messages` |
| Portal v2 | `project_client_users`, `client_actions`, `client_selections`, `selection_options`, `portal_documents`, `portal_notifications`, `portal_audit_logs` |
| Marketing | `marketing_campaigns`, `marketing_content_items`, `marketing_media_assets` |
| CRM | `crm_contacts`, `mailing_lists`, `email_sends` |
| Auth | `user_profiles`, `invitations` |
| Knowledge core | `job_documents`, `job_fact_history`, `job_events`, `document_templates` |
| Carpentry | `carpentry_jobs`, `carpentry_job_milestones`, `carpentry_job_budgets` |

### 1.5 Roles (canonical)

| DB role | UI label | Access summary |
|---------|----------|----------------|
| `admin` | Director | All modules, finance, costs, user management |
| `supervisor` | Supervisor | Operations, schedule, WHS, workforce, carpentry — **no** sales/tender/finance/marketing |
| `employee` | Employee | Site diary, WHS, schedule view, field app |
| `client` | Client | Client portal v2 only |

**Note:** `useRole()` localStorage (`blhub_role`) is a **view preference** (director vs supervisor shell) for admin/supervisor — not a security boundary. Security is `user_profiles.role` + `RoleRoute` + API `requireAuth`/`requireRole`.

---

## 2. Role-Based Test Matrix

### 2.1 Owner / Admin (`admin`)

| Flow | Priority | E2E status |
|------|----------|------------|
| Login → home / sales | P0 | **Implemented** (Playwright) |
| Sales pipeline list + lead detail | P0 | API read only |
| Create / update / delete lead | P0 | API write (`--write` flag) |
| Convert lead → job → project | P0 | **Not implemented** |
| RFQ package create + send | P0 | **Not implemented** |
| Fee proposal wizard | P1 | **Not implemented** |
| Operations project + schedule | P0 | Page load only |
| Finance Command Centre | P0 | **Not implemented** (seed exists) |
| Procurement PO issue | P0 | **Not implemented** |
| Portal admin v2 | P0 | **Not implemented** |
| User invite + role assign | P0 | **Not implemented** |
| Marketing content create (no publish without approval) | P1 | **Not implemented** |
| Document template generate | P1 | **Not implemented** |
| Settings / integrations status | P1 | API smoke |

### 2.2 Supervisor (`supervisor`)

| Flow | Priority | E2E status |
|------|----------|------------|
| Blocked from /sales, /finance | P0 | **Implemented** |
| Operations + schedule edit | P0 | Page load only |
| Site diary entry | P0 | **Not implemented** |
| WHS pack + SWMS | P0 | **Not implemented** |
| Workforce approvals | P0 | **Not implemented** |
| Cannot see cost/margin figures | P0 | **Not implemented** (API partial) |
| Field app `/field` | P1 | **Not implemented** |

### 2.3 Estimator (maps to `admin` in current RBAC)

No separate DB role — estimator workflows are admin-gated tender-manager paths. Test under admin with tender-manager focus.

### 2.4 Client (`client`)

| Flow | Priority | E2E status |
|------|----------|------------|
| Login → client portal | P0 | **Implemented** |
| All nav tabs load | P0 | **Implemented** |
| Actions (selections, variations, meetings) | P0 | Partial (content visible) |
| Approve/reject variation | P0 | **Not implemented** |
| Selection decision | P0 | **Not implemented** |
| Messages send/receive | P1 | **Not implemented** |
| Document download | P1 | **Not implemented** (needs Dropbox mock) |
| Mobile layout | P0 | **Implemented** (visual) |
| No internal cost leakage | P0 | **Implemented** (API adversarial) |
| Cross-project isolation | P0 | **Implemented** |

### 2.5 Subcontractor / Supplier

No dedicated login role. Access is email-based (RFQ links, quote replies). Test via:

- RFQ send + IMAP poll (integration test, staging only)
- Procurement supplier CRUD (admin API)
- Public quote-tracker endpoints (**security audit needed**)

### 2.6 Unauthenticated

| Flow | Priority | E2E status |
|------|----------|------------|
| Protected routes → /login | P0 | **Implemented** |
| `/api/sales/leads` → 401 | P0 | **Implemented** |
| Portal v2 → 401 | P0 | **Implemented** |
| Site induction public form | P1 | **Not implemented** |
| Cron endpoints without secret | P0 | **Risk documented** — no auth on `/api/cron/*` |

---

## 3. Critical Business Workflows (target E2E specs)

Each workflow should have: happy path, missing data, failure state, permission denial, and mobile check where applicable.

### 3.1 Lead / enquiry → won job

```
Enquiry → Qualify → Discovery → Fee proposal → Won → Auto-project (mig 096)
```

**Tests to build:** `e2e/tests/workflows/sales-lead-lifecycle.spec.js`  
**Seed:** `scripts/seed-e2e-suite.mjs` (lead row exists; full UI flow not wired)

### 3.2 Estimating / RFQ

**Tests to build:** `e2e/tests/workflows/rfq-package.spec.js`  
**Blockers:** Buildexact credentials, Dropbox, outbound email in CI

### 3.3 Client Portal v2

**Implemented:** navigation, security, mobile visual  
**Remaining:** variation approve, selection pick, message thread, notification bell, payment notify

### 3.4 Procurement

**Tests to build:** `e2e/tests/workflows/procurement-po.spec.js`  
**Roles:** admin (issue PO), supervisor (read items, no committed cost)

### 3.5 Scheduling

**Tests to build:** `e2e/tests/workflows/schedule-dependencies.spec.js`  
**AI generate:** opt-in `E2E_AI=true` (costs tokens)

### 3.6 WHS

**Tests to build:** `e2e/tests/workflows/whs-pack.spec.js`  
**Public:** `/induct/:projectId` induction form

### 3.7 Finance / Progress claims

**Tests to build:** `e2e/tests/workflows/finance-command-centre.spec.js`  
**Seed:** `seed-test-job.mjs` + `seed-e2e-suite.mjs`

### 3.8 Documents / Templates

**Tests to build:** `e2e/tests/workflows/document-templates.spec.js`  
**Verify:** placeholder preservation, no internal notes in client PDFs

### 3.9 Marketing

**Tests to build:** `e2e/tests/workflows/marketing-approval.spec.js`  
**Assert:** draft content cannot publish without explicit approval action

### 3.10 Settings / Admin

**Tests to build:** `e2e/tests/workflows/user-invite.spec.js`

---

## 4. Edge Case Catalog

| Case | Test approach |
|------|---------------|
| Empty database | Separate `E2E_EMPTY_DB` job — login shows empty states |
| Partial project (no client email) | Seed variant in `seed-e2e-suite.mjs` |
| Duplicate project names | API constraint + UI warning |
| Invalid schedule dates | API validation + Gantt behaviour |
| Client → admin URL | Playwright direct navigation |
| Slow network | `page.route` delay injection |
| Failed API | Mock 500 responses |
| mig 096 auto-project trigger | Seed uses `tendering` → project insert → `won` update |

---

## 5. Security & Adversarial Testing

### Implemented

- `e2e/tests/security/client-isolation.spec.js`
- `scripts/adversarial_e2e.mjs` (29 checks)

### Required next

| Target | Risk |
|--------|------|
| Unauthenticated `/api/rfq/send`, `/api/cron/*`, Dropbox routes | High |
| PostgREST direct access per role | Medium (client RLS tested) |
| IDOR on `/api/finance/jobs/:id` | High — needs cross-admin test |
| Worker magic-link token scope | Medium |
| Portal token `/portal/:token` legacy | Medium |

---

## 6. Visual / UX Regression

**Tool:** Playwright `toHaveScreenshot`  
**Baselines:** `e2e/tests/visual/*-snapshots/` (regenerate: `npm run test:e2e -- --update-snapshots`)  
**Viewports:** Desktop Chrome, Pixel 7, iPad Pro 11

**Target pages for baselines:** Login, Client portal home/actions, Sales pipeline, Operations list, Schedule Gantt (desktop), Finance portfolio

---

## 7. Test Implementation

### 7.1 Commands

```bash
# One-time setup
node scripts/create-e2e-users.mjs
node scripts/seed-e2e-suite.mjs

# Full browser + API E2E (starts dev server automatically)
npm run test:e2e

# API-only legacy runners
npm run test:e2e:api          # critical-paths + adversarial
npm run test                  # critical-paths read-only
npm run test:write            # includes lead create/delete

# Visual baseline update
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test e2e/tests/visual --update-snapshots

# CI suggestion
E2E_REQUIRE_TEST_PROJECT=true E2E_SUPABASE_PROJECT_REF=<ref> npm run test:e2e
```

### 7.2 Environment variables

| Variable | Purpose |
|----------|---------|
| `E2E_BASE_URL` | Frontend URL (default `http://localhost:5174`) |
| `E2E_ALLOW_REMOTE` | Allow non-localhost frontend (use with caution) |
| `E2E_REQUIRE_TEST_PROJECT` | Enforce dedicated Supabase project ref |
| `E2E_SUPABASE_PROJECT_REF` | Allowlisted project ref substring |
| `E2E_SKIP_WEBSERVER` | Reuse running `npm run dev` |
| `E2E_CLEANUP=true` | Remove `__E2E_` seed data after run |
| `E2E_WRITE=true` | Enable destructive API tests |
| `PLAYWRIGHT_BROWSERS_PATH=0` | Use project-local Chromium (required on Apple Silicon) |

### 7.3 Test users (password: `BlueLeaf-E2E-2026!`)

| Email | Role |
|-------|------|
| `e2e-admin@blueleafbuilding.test` | admin |
| `e2e-supervisor@blueleafbuilding.test` | supervisor |
| `e2e-employee@blueleafbuilding.test` | employee |
| `e2e-client@blueleafbuilding.test` | client (project A) |
| `e2e-client-b@blueleafbuilding.test` | client (project B — isolation) |

### 7.4 Directory structure

```
e2e/
  global-setup.mjs          # safety + seed
  global-teardown.mjs
  helpers/                  # auth, api, safety, runtime
  tests/
    smoke/                  # API health
    auth/                   # route protection
    security/               # client isolation
    client-portal/          # navigation
    workflows/              # admin reads (expand)
    visual/                 # screenshots
playwright.config.js
scripts/
  create-e2e-users.mjs
  seed-e2e-suite.mjs
```

### 7.5 CI recommendation

1. Dedicated Supabase **test project** (never production)
2. Apply all migrations via `scripts/verify_migrations.mjs`
3. `npm run test:e2e` with `CI=true`
4. Upload `e2e/report/html` + traces on failure
5. Nightly: `npm run test:all` + full Playwright + `--ai` on staging only

---

## 8. Test Data Strategy

### Primary seed: `scripts/seed-e2e-suite.mjs`

| Entity | Details |
|--------|---------|
| Job | `__E2E_21 Folkstone Rd, Brighton SA` — $1.45M won residential |
| Project A | Portal v2 enabled, linked to e2e-client |
| Project B | Isolation test project, e2e-client-b |
| Lead | Sutton family, stage `won`, linked to job |
| Portal | Milestones, selection (splashback), variation, claim, documents |
| Finance | Approved invoice + signed variation with `cost_to_builder` (must not leak) |

**Safety:** All addresses prefixed `__E2E_`. Fixed UUIDs under `e2e00000-…`. Respects mig 096 auto-project trigger.

### Secondary seeds

- `scripts/seed-test-job.mjs` — Finance Command Centre (12 Test Street, Glenelg)
- `scripts/test_client_setup.mjs` — Manual demo (21 Folkstone Rd without prefix)

---

## 9. Reporting

Persistent reports (updated each test run):

- `docs/qa/e2e-test-report.md` — pass/fail/missing matrix
- `docs/qa/deployment-readiness-checklist.md` — go/no-go categories

**RFQ / tender hardening (30-day plan):**

- `docs/qa/RFQ_TENDER_WORKFLOW_SOURCE_OF_TRUTH.md` — table/route/screen ownership, drift risks
- `docs/qa/TENDER_EMAIL_TEST_PLAN.md` — 20 IMAP matcher scenarios
- `docs/qa/WORKFLOW_TEST_MATRIX.md` — workflow → test file → status
- `docs/qa/BUG_REGISTER.md` — DRIFT-001+ tracked gaps

**Workflow maps (hardening):**

- `docs/qa/WORKFLOW_MAP_MASTER.md` — index of mapped workflows
- `docs/qa/workflows/01_LEAD_CRM_INTAKE.md` — Workflow 01 Lead/CRM intake
- `docs/qa/WORKFLOW_OWNERSHIP_MATRIX.md` — per-workflow table/screen ownership
- `docs/qa/MODULE_BOUNDARIES.md` — module → routes → tables

---

## 10. Phased rollout

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Audit + master plan | **Done** |
| 2 | Playwright framework | **Done** |
| 3 | Seed + test users | **Done** |
| 4 | Core smoke tests | **Done** |
| 5 | Full workflow tests | **~10%** |
| 6 | Permission/security | **Portal done**; staff IDOR pending |
| 7 | Visual regression | **Baselines created** (login, portal mobile) |
| 8 | Run + report | **Done** (see report) |
| 9 | Framework fixes only | **Done** (browser path, mig 096 seed, mobile nav labels) |
| 10 | Deployment summary | **Done** (checklist) |

---

## 11. Known gaps (honest)

1. **No CI pipeline** — tests run locally only
2. **~85% of workflows untested** in browser
3. **Unauthenticated API routes** in `dev-api.mjs` — security debt
4. **No estimator/subcontractor/supplier login** — email/integration tests needed
5. **Buildexact / Dropbox / AI** — not in default E2E (env + cost)
6. **Supabase is shared dev project** — recommend isolated test project before production gate
7. **SOP Section 14** test scripts not wired to Playwright yet

---

*This document is the source of truth for E2E scope. Update when new modules ship or tests are added.*

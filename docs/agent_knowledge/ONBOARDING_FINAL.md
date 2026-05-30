# Blue Leaf Hub — Agent Onboarding Final Report

> Produced: 2026-05-22
> Based on: Full codebase scan (40 migrations, 53 server modules, 40+ pages/components, all docs) + live API verification
> Live system state: One active project (21 Folkestone Road), two test leads, three invoices, 11 IMAP messages

---

## A. PRODUCT UNDERSTANDING SUMMARY

### What Blue Leaf Hub Is

Blue Leaf Hub is the construction operating system for Blue Leaf Building, a residential construction company in Adelaide, South Australia. It is not a project management tool. It is intended to replace every disconnected spreadsheet, email folder, and third-party workaround the business currently uses — from the first client enquiry through to post-handover warranty.

The central design intent is **data flows once through the system**. A job address entered at lead stage becomes the Dropbox folder path, the project name, the client portal URL, the invoice matching key, and the schedule header. A quote extracted by AI at tender stage becomes the PO amount, the budget line, and the cost intelligence benchmark. No re-entry. No drift.

### The APB Foundation

The sales process is built on the **Association of Professional Builders** framework — a specific, opinionated 8-stage pipeline used by professional residential builders. This is not a generic CRM. The pipeline stages (`enquiry → qualify → discovery → winning_offer → fee_proposal → accepted → tender → won`) have specific business meanings and specific actions required at each stage. Blueprint AI is calibrated to coach these specific stages. This foundation is correct and must not be simplified.

### Current Implementation State

| Layer | State |
|-------|-------|
| Sales Manager | Complete. APB pipeline, qualifying scorecard, Blueprint coaching, transcript analysis all working. |
| RFQ Engine | Complete. AI extraction, Dropbox storage, IMAP quote matching working. |
| RFQ Packages | Built but unused in live system. Zero packages exist. New system, not yet adopted. |
| Fee Proposals | Complete. XLSX/PDF parse, DOCX template (in localStorage), Google Drive flow, email send. |
| Tender Board | Complete. Win/loss flow, PO issuing, Buildexact sync. |
| Cost Intelligence | Schema exists, partial implementation. Not actively used. |
| Operations List | Complete. Card/list view, global Gantt, trade conflict detection. |
| Schedule Manager | Sprint 1 complete. 39-task schedule exists for test project. Dependencies use legacy format only. Baseline not locked. |
| WHS Manager | Built. Not populated in live system. |
| Site Diary | Built. Empty in live system. |
| Finance Manager | Partially complete. Three invoices in system. AI extraction working (95-100% confidence on test data). |
| Job Command Centre | Built. WIPAA claims, variations schema exists. |
| Client Portal | Built (11 portal tables). Not enabled for any project. |
| Blueprint AI | Running on claude-sonnet-4-6. Four tools only. Chat, SOP, review, troubleshoot working. |
| Settings / RBAC | Built. Role-based access (admin/supervisor/employee/client) working. |

### Live System Observations (Phase 4)

**What's working:**
- API server healthy on port 8787, Vite on 5173
- Supabase connected with service role key
- Buildexact configured, Dropbox configured, SMTP sending (Gmail OAuth not configured)
- IMAP connected with 11 real messages in inbox
- Blueprint on claude-sonnet-4-6 with Supabase access

**What needs attention:**
- The live project (21 Folkestone Rd) has `won_at = NULL` on its linked job — the project exists but the tender was not formally completed through the win flow
- All 39 schedule tasks have `task_dependencies = []` and `trade_master_id = NULL` — typed deps and trade master linking have not been applied to this schedule
- Zero RFQ packages — the new package system hasn't been used; the business is in the early adoption phase
- A second job (110 Coach Road, Skye VIC) appears in IMAP quote replies and in a filed invoice — this job exists in the database but has not been promoted to a project yet (or it's a legacy test)
- Gmail OAuth not configured — using SMTP. This affects email quality and reply tracking

---

## B. ARCHITECTURE MAP

```
┌─────────────────────────────────────────────────────────────────┐
│  BROWSER (React 18 SPA)                                         │
│  Vite PWA · React Router v6 · Tailwind CSS                      │
│                                                                 │
│  Providers: AuthProvider → BlueprintProvider → ProjectProvider  │
│                                                                 │
│  Sales    Tender    Operations    Finance    Portal    Blueprint │
│  /sales   /tender   /operations  /finance   /portal   (global) │
└───────────────────────┬─────────────────────────────────────────┘
                        │ /api/* (Vite proxy dev / Vercel rewrite prod)
┌───────────────────────▼─────────────────────────────────────────┐
│  EXPRESS API  (server/dev-api.mjs · Node 20)                    │
│  Port 8787                                                      │
│                                                                 │
│  salesRoutes     financeRoutes    portalRoutes                  │
│  module4Routes   financeCCRoutes  rfqPackageRoutes              │
│  module5Routes   jobFinanceRoutes rfqTradeRoutes                │
│  module6Routes   blueprintRoutes  costIntelligenceRoutes        │
│  jobsApiRoutes   authRoutes       supervisorRoutes              │
│  inductionRoutes buildexactIntegrationRoutes                    │
└──────────┬──────────────────────────────────────────────────────┘
           │
    ┌──────┴──────────────────────────────────────┐
    │                                             │
    ▼                                             ▼
┌─────────────┐                        ┌──────────────────────┐
│  SUPABASE   │                        │  EXTERNAL SERVICES   │
│  PostgreSQL │                        │                      │
│  40 tables+ │                        │  Anthropic Claude    │
│  RLS on all │                        │  claude-sonnet-4-6   │
│             │                        │  claude-opus-4-5     │
│  Service    │                        │                      │
│  role key   │                        │  Buildexact API      │
│  (server)   │                        │  Dropbox API         │
│             │                        │  Google Drive API    │
│  Anon key   │                        │  Gmail OAuth (❌)    │
│  (client)   │                        │  SMTP (✓)            │
└─────────────┘                        │  IMAP (✓)            │
                                       └──────────────────────┘

HOSTING (Production):
  Vercel → React SPA (dist/)
  Railway → Express API
  ⚠️  vercel.json still contains YOUR-RAILWAY-HOST placeholder
```

---

## C. WORKFLOW MAP

### Primary Business Flow

```
1. LEAD CREATION
   Sales Pipeline → Create Lead → APB Stage: enquiry
   Data: name, contact, project type, suburb, estimated value

2. QUALIFICATION (APB)
   Qualifying scorecard → 8-dimension weighted score
   Blueprint coaches on APB framework
   Data: qualify_budget, qualify_timeframe, qualify_site, qualify_decision_maker

3. DISCOVERY / WINNING OFFER (APB)
   Meetings logged → Transcript pasted → Claude analyses
   Suggestions approved → Lead record updated
   Data: lead_conversations, applied_suggestions

4. FEE PROPOSAL (APB)
   Import Buildexact XLSX/PDF → Edit in wizard
   Generate DOCX → Edit in Google Docs → Export PDF
   Email to client via SMTP/Gmail + save to Dropbox
   Data: fee_proposals

5. TENDER
   Create/import job → Upload blueprints to Dropbox
   Claude extracts RFQ scopes → User reviews
   Create RFQ Packages → Send to subcontractors
   Quotes arrive via IMAP → Matched → Compared
   Data: jobs, rfq_packages, rfq_trade_scopes, rfq_recipients, rfqs

6. WIN
   Mark Won → Project created → POs issued
   Buildexact status synced
   Job address → Project address (trigger)
   Data: projects (portal_token generated), purchase_orders

7. SCHEDULE
   AI generates 39-task schedule from description + template
   User reviews in Gantt/Sheet/Calendar views
   Dates adjusted → Ripple cascade previewed
   Data: schedule_tasks (phase, trade, dates, percent_complete)

8. CONSTRUCTION
   WHS: compliance docs, SWMS, site inductions (public QR)
   Site Diary: daily entries (voice → AI structures)
   Procurement: order-by alerts from schedule tasks
   Data: contractor_compliance, site_diary, site_inductions

9. FINANCE
   Invoices arrive (email/upload) → AI extracts fields
   Matched to job + trade category → Approved
   Budget vs committed vs invoiced tracked per trade
   Data: financial_documents, financial_approvals, job_budgets

10. CLAIMS & VARIATIONS
    WIPAA progress claims created against schedule
    Variations tracked → Contract value updated (trigger)
    Data: progress_claims, job_variations

11. CLIENT PORTAL
    Portal enabled for project → Shareable token link
    Weekly updates, photos, milestones, decisions posted
    Client views on /portal/:token (no login)
    Data: portal_updates, project_photos, portal_milestones

12. HANDOVER / WARRANTY
    Warranty items logged in portal
    Data: warranty_items, warranty_periods
```

---

## D. DATA MAP

### Core Table Hierarchy
```
leads (CRM entry point; qualifying scores are qualify_* columns on leads, migration 016)
  └── lead_conversations (transcript analysis)

jobs (tender/project core)
  ├── lead_id → leads (optional, backfilled)
  ├── rfq_packages → rfq_trade_scopes → rfq_recipients
  ├── rfqs (individual trade RFQs)
  ├── fee_proposals
  ├── purchase_orders
  ├── buildexact_estimates
  ├── financial_documents
  │     └── financial_approvals
  ├── job_budgets
  ├── progress_claims
  │     └── progress_claim_payments
  └── job_variations (triggers contract_value update on jobs)

projects (operational entry point)
  ├── job_id → jobs (created on win)
  ├── address ← synced from jobs.address (trigger)
  ├── portal_token (client portal access)
  ├── schedule_tasks
  │     └── task_dependencies (JSONB, typed)
  │     └── depends_on (legacy array — backfill target)
  ├── contractor_compliance
  ├── site_inductions
  ├── project_swms
  ├── site_reports
  ├── site_diary
  ├── portal_updates, project_photos, portal_milestones
  ├── portal_decisions, portal_claims, portal_allowances
  ├── site_walks, warranty_items, portal_messages
  └── home_finishes, warranty_periods

Reference tables:
  trade_categories (37 — financial categorisation, Buildxact-aligned)
  trade_master_library (37 — RFQ scope templates)
  schedule_templates (AI generation base)
  subcontractors → trade_category_id
  schedule_tasks → trade_master_id
```

### Key Triggers
| Trigger | Effect |
|---------|--------|
| `job_variations` signed | `jobs.contract_value` updated |
| `jobs.address` updated | `projects.address` synced |
| Schedule task saved | `trade_master_id` backfill attempt |
| Subcontractor saved | `trade_category_id` backfill attempt |

### Source of Truth (Critical)
| Data point | Authoritative source | DO NOT read from |
|-----------|---------------------|-----------------|
| Contract value | `jobs.contract_value` | Sum of job_variations |
| Project address | `jobs.address` → trigger | Anywhere else |
| Schedule health | `schedule_tasks` WHERE deleted_at IS NULL | `projects` table |
| Trade category | `trade_categories` | `subcontractors.trade` text |
| Task typed deps | `task_dependencies` JSONB | `depends_on` (legacy) |

---

## E. MAJOR RISKS

### Risk 1 — Production Deployment Is Broken [CRITICAL]
`vercel.json` contains `YOUR-RAILWAY-HOST` placeholder. Every API call from the production frontend will fail. Zero API functionality in production until this is replaced with the actual Railway hostname.
**Impact**: Total production outage.

### Risk 2 — Two Parallel Trade Systems With No Link [HIGH]
`trade_categories` (financial tracking) and `trade_master_library` (RFQ scopes) are both 37-trade Buildxact-aligned systems with no FK relationship. A trade can have different names or IDs in each. `subcontractors.trade_category_id` points to `trade_categories`. `schedule_tasks.trade_master_id` points to `trade_master_library`. Reporting across these boundaries is brittle.

### Risk 3 — No Automated Tests [HIGH]
Zero tests. Every change is verified manually. The codebase has 53+ server modules, 40+ pages, 40 migrations, and 5 external integrations. A change to a shared utility (like `scheduleUtils.js` or `supabaseService.mjs`) can silently break multiple modules. The only safety net is `npm run lint`.

### Risk 4 — Legacy Dependency Format in All Live Tasks [HIGH]
All 39 schedule tasks in the live system use `depends_on` (legacy string array) and have `task_dependencies = []` (empty). The typed dependency system (Sprint 3) is not yet active. `scheduleUtils.js` handles both formats, but as long as tasks only use `depends_on`, the typed FS/SS/FF/SF logic is dormant. The system works, but the dependency map view and advanced scheduling features are not yet usable with real data.

### Risk 5 — DOCX Template Lives Only in localStorage [MEDIUM]
The fee proposal Word template is stored as base64 in the browser's localStorage. If the user clears browser data, switches computers, or uses an incognito window, the template is gone. There is no server-side backup. This is a single point of failure for the fee proposal workflow.

### Risk 6 — RLS Policies Are Broadly Permissive [MEDIUM]
Most tables use `USING (true)` or `USING (auth.uid() IS NOT NULL)` — but some earlier migrations use `USING (true)` for anon access. Before client data goes into this system in volume, a full RLS audit is required. If the Supabase anon key is ever exposed (it's in client-side environment variables), data may be readable without authentication.

### Risk 7 — Gmail OAuth Not Configured [MEDIUM]
Email sending falls back to SMTP. RFQ emails, PO emails, and fee proposal emails all go out via SMTP without Gmail OAuth benefits (better deliverability, reply-to tracking, Google Workspace alignment). The quote-reply tracking loop (IMAP matching) depends on reliable delivery, which is lower for SMTP.

### Risk 8 — 21 Folkestone Road Project Was Not Won Through the System [MEDIUM]
The live project has `won_at = NULL` on its linked job and `buildexact_job_id = NULL`. It was manually created or bypassed the win flow. This means: no POs were issued through the system, no Buildexact sync was done, and the financial/commercial record does not reflect the full lifecycle. This project is a test environment, but it may skew observations about whether the win → project flow works correctly.

### Risk 9 — AGENT_OVERVIEW.md Is 27 Migrations Behind [MEDIUM]
The documentation agents rely on (including this agent's own knowledge) references migrations 001–013. The actual system is on migration 040. Any agent reading `AGENT_OVERVIEW.md` as its primary reference will operate on an incomplete schema understanding.

### Risk 10 — module6Routes.mjs Is 1848 Lines [LOW-MEDIUM]
The entire Operations backend (schedule, WHS, site diary, global Gantt, trade conflicts, analytics) is one file. Difficult to navigate, test, or hand off. As Operations grows (Sprint 2-4), this file will become a maintenance liability.

---

## F. CRITICAL MISSING KNOWLEDGE

The following areas were not fully observable from code reading or live API testing and require clarification:

1. **Buildexact integration depth**: Buildexact is configured and the client is built, but no jobs in the live system are linked to Buildexact (`buildexact_job_id = NULL` on all visible records). It is unknown whether the Buildexact API connection is working correctly in production, or whether any real jobs have ever been synced.

2. **Actual RFQ package adoption**: The RFQ packages system is built (migration 030, full routes, full UI) but has zero packages in the live system. It is unknown whether this is because it's new and not yet used, or because there is a UX issue that prevents adoption.

3. **Finance approval workflow completion**: Three invoices exist — one filed, one approved. The approval path (AI extraction → review → approve) needs to be verified end-to-end in the live UI to confirm there are no friction points or broken states.

4. **Portal adoption state**: 11 portal tables exist with rich functionality. The portal is not enabled for any project. It is unknown whether this is by design (not ready for clients) or because there is a setup friction issue.

5. **Blueprint tool capability**: Blueprint health reports only 4 tools (`web_search`, `hub_list_subcontractors`, `hub_update_subcontractor`, `hub_list_jobs`). The agent system prompt in `src/blueprint/agent/systemPrompt.js` likely defines more intended capabilities. The gap between intended and live tool set is unknown.

6. **SMTP deliverability**: Emails are being sent via SMTP (not Gmail). Whether subcontractors and clients are actually receiving RFQ emails and fee proposals has not been verified.

7. **110 Coach Road job status**: IMAP shows quote replies and an approved invoice for 110 Coach Road, Skye VIC. This job's full status in the system (tender stage, linked project, Buildexact sync) is unknown.

8. **Supervisor role UX**: `SupervisorHome.jsx` is a separate entry point outside AppShell. The supervisor experience is not well documented. How supervisors use the mobile schedule/diary workflows in practice has not been observed.

---

## G. QUESTIONS REQUIRING CLARIFICATION

These are questions for the product owner (Sam) before implementation of any new features:

### Business Operations

1. **Is Blue Leaf Building currently entering real client jobs into Hub, or is it still in a test/setup phase?**
   - The live data suggests test data only (21 Folkestone Rd appears to be a test project; `won_at` is null).
   - Knowing when real client data will enter the system affects risk priority for RLS hardening and data integrity.

2. **Is Buildexact currently being used for every project estimate?**
   - The integration is configured but no live project has `buildexact_job_id`. Is Buildexact the primary estimating tool or supplementary?
   - This determines whether the fee proposal Buildexact import flow is the primary path or an edge case.

3. **What is the primary pain point right now — sales tracking, tendering, operations, or finance?**
   - This drives which sprint should be prioritised next after known issues are fixed.

4. **Does the SMTP email reliably deliver to subcontractors?**
   - If emails are landing in spam, the RFQ workflow breaks at the most important step.
   - Should Gmail OAuth be set up as the priority integration fix?

### Product Design

5. **Should the Client Portal be activated for 21 Folkestone Road as a live test?**
   - The portal is fully built. Activating it for a real (or controlled test) project would confirm the client experience and surface any issues before production.

6. **Is the fee proposal DOCX template currently stored somewhere safe?**
   - If it only exists in localStorage, it needs to be backed up immediately to a server-side store.

7. **What does the supervisor mobile workflow actually look like today?**
   - Does the site supervisor use a phone or tablet on site? What do they currently do for site diary and WHS?
   - This determines whether the current mobile UX is sufficient or needs improvement.

8. **Are there multiple Blue Leaf Building staff who will use the system?**
   - RBAC is built (admin/supervisor/employee/client roles). Are there other admin users or supervisors who need to be invited?

### Technical

9. **Has the production Railway deployment URL been set in `vercel.json`?**
   - If production is live on Railway + Vercel, this is currently broken. If not yet deployed, this is a pre-launch blocker.

10. **Which Claude model should be the default for day-to-day operations?**
    - Health check shows `claude-sonnet-4-5` (older model). Blueprint shows `claude-sonnet-4-6`.
    - Should the `CLAUDE_MODEL` env variable be updated to `claude-sonnet-4-6` as the system-wide default?

---

## H. RECOMMENDED NEXT PRIORITIES

Ordered by urgency and business impact. No implementation begins without approval.

### Immediate (Fix Before Any New Features)

**H1. Fix vercel.json production placeholder** [1 hour]
Replace `YOUR-RAILWAY-HOST` with the actual Railway hostname. Zero production functionality without this.

**H2. Update AGENT_OVERVIEW.md schema reference** [30 min]
The doc says migrations 001–013. Actual: 001–040. Any agent reading this as truth operates blind on 27 migrations worth of schema. Update to reflect current state.

**H3. Confirm DOCX template is backed up** [30 min]
Verify whether the fee proposal DOCX template exists anywhere beyond localhost localStorage. If it only exists in the browser, export it to Dropbox or Supabase Storage immediately before it is lost.

### Short Term (Next 1-2 Weeks)

**H4. Complete the 21 Folkestone Road test project lifecycle**
Walk the full lifecycle in the live system: create RFQ package → send → receive quote → mark won → issue PO → lock schedule baseline → file invoice → approve → create progress claim. Document every friction point as a KNOWN_ISSUE. This will expose every integration gap before real client data enters.

**H5. Configure Gmail OAuth**
SMTP is working but Gmail OAuth improves deliverability, enables reply tracking, and aligns with the `@blueleafbuilding.com.au` Google Workspace setup. Run `npm run auth:gmail` and set `GMAIL_REFRESH_TOKEN`.

**H6. Sprint 2 — Baseline + EOT**
Migration 025 already adds the required columns (`baseline_start_date`, `baseline_end_date`, `schedule_eot` table). The UI for baseline locking and EOT recording needs to be built. This is the most valuable near-term schedule feature — it makes the Gantt accountable.

### Medium Term (Next 1-2 Months)

**H7. Sprint 3 — Typed Dependencies**
Migrate all existing `depends_on` arrays to `task_dependencies` JSONB. Build the dependency editor UI in TaskDetailPanel. Enable the dependency map view. This makes the schedule a proper construction programme, not just a list of dates.

**H8. Activate Client Portal for 21 Folkestone Road**
Enable the portal for the test project. Post a test weekly update, add a milestone, send a portal link. Verify the client-facing experience end-to-end. Fix any issues before presenting to a real client.

**H9. RLS Audit**
Before real client financial data enters the system, audit all 40 migrations for RLS policies using `USING (true)` for anon. Tighten to `auth.uid() IS NOT NULL` at minimum, or use service-role-only patterns where appropriate.

**H10. Blueprint Tool Expansion**
Blueprint currently has 4 tools. The intended capabilities (schedule read, finance read, WHS read, SOP lookup) are partially implemented but may not be registered. Audit `server/lib/blueprintRoutes.mjs` and `src/blueprint/agent/tools.js` to confirm all planned tools are active and returning useful data.

### Strategic (Next Quarter)

**H11. Buildexact Deep Integration (Module 7)**
Four integration items in `BUILDEXACT_INTEGRATION_PROMPT.md`. None are live. This is the highest-leverage integration — Buildexact is the estimating source of truth. Connecting it to the schedule, budget, and cost intelligence creates the closed financial loop.

**H12. DOCX Template → Server Storage**
Move the fee proposal template from localStorage to Supabase Storage or Dropbox. Build an upload/replace UI in Settings. This is a reliability fix that will eventually become a production incident if left as-is.

**H13. Automated Integration Tests**
Add API-level tests for the six critical paths: RFQ send, win/loss + project creation, schedule generation, invoice AI extraction, progress claim creation, portal token access. Even 6 tests covering critical paths reduce regression risk significantly.

---

## Summary Statement

Blue Leaf Hub is a well-architected, purpose-built construction OS that is **structurally complete** but **operationally not yet live**. The schema, routing, AI integrations, and UI patterns are all correct and thoughtfully designed. The product principles are sound — extract once, project-first, AI augments not replaces.

The critical gap is not functionality — it is **activation**. The system needs to be walked through its full lifecycle with real (or realistic) data, friction points surfaced and fixed, and then placed in the hands of the business with confidence that each workflow is reliable end-to-end.

The immediate priority is not building new features. It is stabilising what exists, verifying what is live, and closing the known gaps — starting with the production deployment fix, the Gmail OAuth setup, and walking the complete 21 Folkestone Road lifecycle from RFQ to progress claim.

Once those foundations are solid, Sprint 2 (baseline + EOT) and the Client Portal activation are the highest-value next steps — because they are the features the client actually sees.

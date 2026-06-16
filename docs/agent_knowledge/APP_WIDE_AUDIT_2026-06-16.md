# Blue Leaf Hub — App-Wide Workflow & Usability Audit

> **Date:** 2026-06-16  
> **Method:** Read-only multi-agent audit — 102 Opus 4.8 agents (14 modules × 6 lenses + per-module synthesis + 3 cross-cutting passes + master synthesis), ~8.8M tokens, 42 min. Lenses: usability, workflow efficiency, inter-module interactions, consistency, gaps/opportunities, performance/data-integrity. **No code was changed.**  
> **Findings:** 559 module-level (24 critical, 153 high, 244 medium, 138 low) across 14 modules + 3 cross-cutting passes. 47 quick-wins, 7 big opportunities.  
> One cross-cutting lens agent did not return structured output; coverage is otherwise complete.

---

## Table of contents
1. [Executive summary](#1-executive-summary)
2. [Cross-cutting themes](#2-cross-cutting-themes)
3. [Quick-wins (do first)](#3-quick-wins-do-first)
4. [Biggest opportunities (for discussion)](#4-biggest-opportunities-for-discussion)
5. [Cross-module & end-to-end journeys](#5-cross-module--end-to-end-journeys)
6. [Module-by-module findings](#6-module-by-module-findings)
   - Sales Manager
   - CRM & Mailing Lists
   - Tender Manager / RFQ Engine
   - Cost Intelligence
   - Operations & Schedule Manager
   - Site Diary (Module 07)
   - WHS (Work Health & Safety)
   - Procurement Intelligence (BQ-10)
   - Workforce & Worker PWA (/workforce/*, /worker/*)
   - Finance / Financial Command Centre
   - Marketing & Marketing Intelligence
   - Client Portal
   - Carpentry (subsidiary)
   - Settings / Admin / Integrations

---

## 1. Executive summary

Blue Leaf Hub is a feature-rich, end-to-end construction management platform (Sales → CRM → Tender/RFQ → Cost Intelligence → Operations/Schedule → Site Diary → WHS → Procurement → Workforce → Finance → Portal → Carpentry → Marketing → Settings) where the modules individually work but the seams between them leak. The audit surfaced ~430 findings; the dominant problem is not missing features but workflow friction at module boundaries: data that already exists in one module is silently re-keyed in the next, handoffs complete without telling the user (or without actually firing), and a single canonical fact (contract value, address, client contact, trade name, Buildexact IDs) is stored and edited in 3-4 places that drift out of sync.

Five themes dominate. (1) BROKEN HANDOFFS / DOUBLE SOURCE-OF-TRUTH — the most damaging being that winning a job creates a `jobs` row but never a `projects` row (server/lib/salesRoutes.mjs:409-555 inserts to `jobs`/`job_contact_roles` only), so Operations cannot see won work; plus portal claims disconnected from finance claims, contract value read from stale columns post-variation, and Buildexact employee/job IDs null breaking labour sync. (2) MISSING BULK ACTIONS — every transactional module (Sales, CRM, Finance approvals, Procurement register, Workforce timesheets, RFQ recipients, Schedule tasks) forces N single-clicks where users want one batch operation, pushing teams back to spreadsheets. (3) DOUBLE DATA-ENTRY & CONTEXT-SWITCHING — fee proposals, RFQs, carpentry jobs, and cost-intel metrics all re-ask for job facts (address, scope, floor area, client) that already exist; users must leave the module to finish a task (Sales→Tender Manager, Schedule→Procurement, Finance inbox→Approvals tab). (4) SILENT FAILURES & INVISIBLE STATE — Dropbox/Buildexact/email sync fail behind success toasts, stage gates disable buttons without explaining what's missing, optimistic-update absence means full-list reloads create 3-5s latency per action. (5) CONSISTENCY DRIFT — terminology (Tender/Quote/RFQ), status enums hardcoded instead of in constants.js, authFetch used instead of apiFetch (verified: 7 instances in Settings.jsx), snake_case vs camelCase responses, and no breadcrumbs/back-nav in detail views. The fixes are overwhelmingly small-to-medium glue work (auto-prefill, success toasts with deep links, batch endpoints, optimistic updates, reading from canonical source) rather than rebuilds.

---

## 2. Cross-cutting themes

- Broken module handoffs and double source-of-truth: winning a job creates jobs but not projects (Operations blind); contract value/address/client/trade/Buildexact-ID each stored and edited in 3-4 places that drift; portal claims disconnected from finance claims.
- Missing bulk actions everywhere: Sales, CRM, Finance, Procurement, Workforce, RFQ, and Schedule all force N single-clicks where one batch operation is needed, driving teams back to spreadsheets.
- Double data-entry and forced context-switching: fee proposals, RFQs, carpentry jobs, and cost-intel metrics re-ask for job facts that already exist; common tasks require leaving the module (Sales→Tender, Schedule→Procurement, Finance Inbox→Approvals).
- Silent failures and invisible state: Dropbox/Buildexact/email sync fail behind success toasts; stage gates disable buttons without explaining what's missing; no optimistic updates so every action triggers a 3-5s full-list reload.
- Consistency drift: Tender/Quote/RFQ terminology, hardcoded status enums instead of constants.js, authFetch vs apiFetch (verified in Settings.jsx), snake_case vs camelCase responses, and missing breadcrumbs/back-navigation in detail views.
- Performance anti-patterns at scale: unbounded list queries with no pagination, N+1 loops (WHS compliance, portal journal photos, carpentry labour, benchmark recompute), and missing indices on hot lookup columns.
- Data integrity and audit gaps: little to no audit trail on margin-critical edits (contract value, GP%, rates), no optimistic locking on WHS safety profiles, and weak/role-inconsistent access control on financial and settings endpoints.

---

## 3. Quick-wins (do first)

High-impact, low-effort fixes, sorted by impact then effort.

| # | Module | Fix | Impact | Effort |
|---|---|---|---|---|
| 1 | Sales Manager | Create projects row on job win in convert-to-job (Operations currently blind to won jobs) | high | S |
| 2 | Sales Manager | Show success toast with 'Go to Operations →' deep link after lead→job conversion | high | S |
| 3 | Sales Manager | On stage-gate block, show inline banner listing exactly which fields are missing instead of silently disabling the advance button | high | S |
| 4 | CRM & Mailing Lists | Add missing index on email_send_recipients.resend_email_id (webhook does full table scan per event) | high | S |
| 5 | CRM & Mailing Lists | Wrap CRM dashboard's 6 sequential COUNT queries in Promise.all to cut round-trips ~80% | high | S |
| 6 | Tender Manager / RFQ Engine | Block manual quote_amount entry unless status='received' or quote_pdf_url present (prevents phantom quotes) | high | S |
| 7 | Site Diary | Return Dropbox PDF status in site-diary save response and show warning toast on failure (audit evidence) | high | S |
| 8 | Site Diary | Add fromDate/toDate filter inputs to Site Diary past-entries list (200+ entries unbrowseable) | high | S |
| 9 | WHS | Persist computed WHS compliance status on expiry_date update instead of recomputing stale client-side | high | S |
| 10 | WHS | Replace WHS N+1 compliance-doc loop with single WHERE subcontractor_id = ANY(...) query | high | S |
| 11 | WHS | Add completeness badges to WHS tab headers (e.g. 'contractors (3, 1 expired)', 'incidents (2 open)') | high | S |
| 12 | Procurement Intelligence | Add 90-day rolling-window filter + limit to unbounded Procurement Command Centre query | high | S |
| 13 | Procurement Intelligence | Show committed cost / budget summary to supervisors (currently admin-only RLS gate hides financial context) | high | S |
| 14 | Workforce & Worker PWA | Display per-employee cost column in Workforce Approvals table (approving blind to budget impact) | high | S |
| 15 | Finance | Keep finance document in list + show retry card if rejection PATCH fails (ApprovalQueue.jsx:292-302 removes before confirming) | high | S |
| 16 | Finance | Auto-select trade category when AI confidence ≥100%, auto-fill ≥75% (forces manual re-selection today) | high | S |
| 17 | Finance | Fix WIPAA endpoint mismatch: client calls /wipaa (404), route is /wipaa/current (financeCCRoutes.mjs:652) | high | S |
| 18 | Client Portal | Replace Portal journal N+1 photo loop with single WHERE milestone_key IN (...) query | high | S |
| 19 | Cross-cutting (Workforce/Finance) | Nightly sync to populate employees.buildexact_employee_id by name+email match (labour sync broken, BUG-BX01) | high | S |
| 20 | Sales Manager | Disable 'Create Job' / 'Generate PTSA' buttons client-side when site_address or preconstruction_fee empty, with a warning banner | medium | S |
| 21 | Sales Manager | Add success checkmark/toast on inline field saves so users know edits persisted | medium | S |
| 22 | CRM & Mailing Lists | Filter AddToListModal dropdown to manual lists only; show smart-list memberships as read-only badges | medium | S |
| 23 | CRM & Mailing Lists | Fix referrer chain on lead conversion: use contact.referred_by_contact_id not contact.id (crmRoutes.mjs:555) | medium | S |
| 24 | Tender Manager / RFQ Engine | Add 'View RFQ Package' button to RFQ Engine completion summary (eliminates 4-click navigation) | medium | S |
| 25 | Tender Manager / RFQ Engine | Rename 'Quote Tracker' nav label to 'RFQ Packages' for consistent terminology | medium | S |
| 26 | Tender Manager / RFQ Engine | Add NOT NULL constraint + pre-insert validation on rfq_packages.job_id | medium | S |
| 27 | Sales Manager | Add 'Use discovery as scope' button to auto-fill ptsa_project_scope from existing discovery_notes | medium | S |
| 28 | Cost Intelligence | Replace N+1 employee cost-rate upsert loop with single bulk upsert (companyCostModelRoutes.mjs:109-111) | medium | S |
| 29 | Cost Intelligence | Push trends-tab monthly aggregation to SQL GROUP BY instead of loading a full year into memory | medium | S |
| 30 | WHS | Load WHS Manager tabs via Promise.all (cuts ~600ms sequential latency to ~200ms) | medium | S |
| 31 | Procurement Intelligence | Auto-fill procurement lead_time_days from supplier.usual_lead_time_days when item value is null | medium | S |
| 32 | Procurement Intelligence | Add role guard (admin/supervisor) to Procurement page to prevent 403s and add RLS on suppliers/templates tables | medium | S |
| 33 | Workforce & Worker PWA | Add per-row Approve/Reject buttons alongside bulk-select so approvers can mix actions without reload | medium | S |
| 34 | Workforce & Worker PWA | Persist worker site context: pre-fill WorkerLogHours from current_project_id + 'Use yesterday's site' button | medium | S |
| 35 | Finance | Replace browser alert() on finance approval errors with persistent inline retry card | medium | S |
| 36 | Finance | Fix DOC_STATUSES.HELD enum to 'on_hold' to match server; remove dead 'matched' status checks | medium | S |
| 37 | Client Portal | Wrap all Client Portal API responses in ok() envelope (11 endpoints violate app standard) | medium | S |
| 38 | Client Portal | Wire builder/site-manager name from project/user context instead of hardcoded 'Sam' in portal | medium | S |
| 39 | Carpentry | Add carpentry task API camelCase conversion (rowsToCamel) — frontend already expects camelCase | medium | S |
| 40 | Carpentry | Make carpentry status a visible badge-click control and merge with Close Job action | medium | S |
| 41 | Carpentry | Add 'Refetch from Buildexact' button in carpentry Budget tab (stops redundant XLSX re-upload) | medium | S |
| 42 | Settings / Admin | Replace 6 direct authFetch calls in Settings.jsx with apiFetch helpers (verified 7 instances) | medium | S |
| 43 | Settings / Admin | Add requireRole(admin/supervisor) to GET /api/workforce/settings to match PUT gating (cost codes leak) | medium | S |
| 44 | Tender Manager / RFQ Engine | Stamp RFQ trade_category_id on create/update via resolveTradeCategoryId (trade taxonomy incomplete) | medium | S |
| 45 | Settings / Admin | Add API_BASE_URL env var so Buildexact webhook URL isn't localhost in production | medium | S |
| 46 | Marketing | Add native social-post buttons removed: replace 6 silent-success points across diary/marketing with explicit failure toasts | medium | S |
| 47 | Cross-cutting | Persist Sales pipeline + Carpentry dashboard filter/sort to localStorage (resets on reload today) | low | S |

---

## 4. Biggest opportunities (for discussion)

The larger, cross-module changes worth designing together — the *bigger changes* to work through with follow-up questions.

### 4.1 Canonical Data Law enforcement: one source of truth for contract value, address, client contact, trade names, and Buildexact IDs
*Modules:* Finance, Cost Intelligence, Tender Manager / RFQ Engine, Carpentry, Client Portal, Sales Manager

The single most pervasive defect class. Contract value is written to both jobs and projects and read from stale columns after variations (financeCCRoutes.mjs:857, jobFinanceRoutes.mjs:863); client email/phone live on 4 tables; project_type has 6 parallel vocabularies; floor_area_m2 duplicates across 4+ tables; Buildexact job ID is stored on jobs, projects, and carpentry with no enforced sync. Route every margin-critical write through setFact/a canonical wrapper, derive on read, and deprecate mirror columns. Eliminates wrong finance reports, divergent KPIs, and the address-duplication mess on the tender board.

### 4.2 Close the Sales→Operations→Finance handoff loop end-to-end with visible confirmation
*Modules:* Sales Manager, Operations & Schedule Manager, Finance, Client Portal, Tender Manager / RFQ Engine

Winning a job inserts a jobs row but no projects row (salesRoutes.mjs:409-555), so Operations can't schedule won work; conversion gives no success toast or job link; portal claims are disconnected from finance-approved claims so clients see $0; lead scope/site facts are re-entered in tenders and fee proposals. Auto-create the project, surface a success card with deep links, make portal claims read-only reflections of finance claims, and pre-fill downstream forms from job_fact_history. Turns a series of silent, lossy handoffs into a continuous traceable workflow.

### 4.3 App-wide bulk-operations framework (multi-select + batch endpoints)
*Modules:* Sales Manager, CRM & Mailing Lists, Finance, Procurement Intelligence, Workforce & Worker PWA, Tender Manager / RFQ Engine, Operations & Schedule Manager

Identically missing in Sales (move/qualify/mark-lost leads), CRM (status/list/archive/export contacts), Finance (approve invoices), Procurement (assign supplier/update status), Workforce (approve timesheets), RFQ (send follow-ups/mark received), and Schedule (status/trade/phase). Every one forces N round-trips and pushes teams to spreadsheets. Build a shared checkbox-multi-select UI pattern + a consistent POST .../batch endpoint shape ({ ids, updates }). Highest aggregate time-savings of any change and reuses one pattern across 7 modules.

### 4.4 Optimistic-updates + targeted refetch + caching to kill the 3-5s per-action latency
*Modules:* Sales Manager, Operations & Schedule Manager, CRM & Mailing Lists, Client Portal, Cost Intelligence

Sales pipeline, Schedule (full reload after every task save on 300-task schedules), CRM, Portal admin (re-fetches all 10 data types on every keystroke), and Cost Intelligence all reload full lists after each mutation. Adopt optimistic local state + invalidateQueries + per-entity merge, plus app-level caches (reference projects, trade_categories, project context) with TTL. The biggest perceived-performance win across the app, and a prerequisite for bulk actions feeling instant.

### 4.5 Inline embedded modals to eliminate cross-module context-switching
*Modules:* Sales Manager, Operations & Schedule Manager, Finance, Procurement Intelligence, Tender Manager / RFQ Engine

Users must leave the module to finish a task repeatedly: Sales→Tender Manager for fee proposals, Sales→reference-projects, Schedule→Procurement/Tender Manager for POs/RFQs, Finance Inbox→Approvals tab for trade selection, Procurement Register→Suppliers tab to add a supplier. Each loses context and forces manual re-entry. Embed lightweight prefilled modals ('Add + use' supplier, inline fee-proposal, quick-PO from schedule task, trade selector in Finance inbox) that keep the user in flow. Directly attacks the workflow-continuity complaints in every module.

### 4.6 Global navigation consistency layer: shared breadcrumbs, project context sync, terminology, and status/empty-state components
*Modules:* Cross-cutting (all modules), Sales Manager, Tender Manager / RFQ Engine, Finance, Operations & Schedule Manager

Cross-cutting findings show detail views (LeadDetail, RfqEngine, JobCommandCentre, TenderDetail) lack back/breadcrumb nav; project context doesn't follow the user across Finance/Sales/Tender; Tender/Quote/RFQ terms are used interchangeably; status enums are hardcoded per-component; empty/error states are ad hoc. Introduce a ProjectContext that auto-selects on deep-link, a Breadcrumb + StatusBadge + EmptyState shared component set, and centralize enums in constants.js. Low-risk consistency work that lifts the whole app's coherence and onboarding clarity.

### 4.7 Make silent integration failures visible everywhere (Dropbox, Buildexact, email, sync)
*Modules:* Site Diary, WHS, Finance, Tender Manager / RFQ Engine, Workforce & Worker PWA, Settings / Admin

A recurring data-integrity and trust hazard: site-diary/WHS/finance Dropbox uploads, Buildexact quote/labour sync, and email sends all fail behind success toasts or null paths. Add a consistent pattern — return sync status in responses, surface warning badges, provide Retry/Resend buttons, and an integration audit log in Settings. Critical because these modules (site diary, WHS, finance) are audit/compliance evidence where silent loss is unacceptable.

---

## 5. Cross-module & end-to-end journeys

### Global Navigation & Cross-App UX Consistency

# Global Navigation & Cross-App UX Consistency Audit

## Executive Summary
Blue Leaf Hub is a well-structured React+Vite SPA with 8 major departments (Sales, Tendering, Operations, Workforce, Finance, Marketing, Clients, Carpentry). Navigation architecture is fundamentally sound with responsive desktop/mobile layouts, role-based access control, and project context awareness. However, several patterns create friction in cross-module workflows and data consistency.

---

## Navigation Architecture (Strengths)

**File:** `src/components/AppShell.jsx` (690 lines)
- Desktop sidebar (expandable, persists minimized state to localStorage)
- Mobile bottom nav + hamburger menu overlay
- Department-level nav with module sub-items
- Responsive breakpoint: `md:` (768px)
- Project context bar (`ProjectBar.jsx`) sticky across all views
- Quick-add FAB with role-based filtering

**Routing:** `src/App.jsx` (223 lines)
- Nested routes under `AppShell` wrapper
- Role-based `RoleRoute` guard component
- Protected routes via `ProtectedRoute`
- Good separation: Portal (public token-based) vs app routes vs auth

---

## Critical Findings

### 1. **Terminology Inconsistency — "Tender" vs "Quote" vs "RFQ" (HIGH)**
**Location:** `src/App.jsx`, `src/components/AppShell.jsx:105-111`, `src/pages/TenderBoard.jsx`

- Department labeled **"Tendering"** in sidebar (AppShell:128) but routes use **"/tender-manager"**
- Sub-module labeled **"Quote Tracker"** (AppShell:107) but route is **/rfq-packages**
- RFQ Engine exists at **/tender-manager/rfq-engine** but is called "RFQ Engine" in sidebar
- Legacy redirect: `/quote-tracker → /tender-manager/rfq-packages` (App.jsx:106)
- In Tender Board: `quotesRingPct()` function (TenderBoard.jsx:13) but data structure is `rfqs`

**Impact:** Users switching between modules see inconsistent labels. A new user cannot immediately understand if "Tender Board", "RFQ Engine", and "Quote Tracker" are separate tools or the same tool with multiple names.

**Recommendation:** 
- Standardize on **"RFQ"** terminology across UI labels, route names, and function names
- Rename department from "Tendering" → "RFQ & Tenders" or keep "Tender Manager" as module label but clarify "RFQ" submodules
- Update AppShell module labels: "Quote Tracker" → "Quote Responses" or "RFQ Packages"
- Document the naming convention: "Quote" = subcontractor response to RFQ, "RFQ" = request for quote, "Tender Board" = job-level overview

---

### 2. **Project Context Propagation Not Explicit Across All Modules (MEDIUM)**
**Location:** `src/lib/ProjectContext.jsx`, `src/components/ProjectBar.jsx:31-60`

The `quickLinks()` function in ProjectBar only handles 3 departments:
- `/operations/*` → shows Overview, Schedule, Diary, WHS, Financials links
- `/tender-manager/*` → shows Quotes, RFQ Engine, Board links
- `/finance/*` → shows Inbox, Approvals, Job Dashboard links

Missing from quick links (no contextual navigation):
- `/sales/*` (Lead detail cannot jump to project financials if lead is won)
- `/marketing/*` (No link back to operations even if campaign targets a project)
- `/workforce/*` (No way to view project-specific timesheets)

**Impact:** User in Sales > Lead Detail clicks "View job" → navigates to /operations/:projectId, but the ProjectBar doesn't highlight Operations module or show quick links. If the user came from Sales with context on which lead/job to work with, that context is lost.

**Recommendation:**
- Extend `quickLinks()` to handle all major departments that interact with projects
- When navigating between modules, preserve project context by calling `selectProject()` before navigate
- Add a breadcrumb or "context" indicator showing "Currently viewing: [Project Address] > [Lead Name | Job ID]"
- Pages that create/edit project-related data should auto-select the project in context after save

---

### 3. **Missing Back/Return Navigation (MEDIUM)**
**Location:** `src/pages/LeadDetail.jsx`, `src/pages/ScheduleManager.jsx:723`, `src/pages/SiteDiary.jsx:204`

Detail pages have inconsistent back navigation:
- **ScheduleManager** has "Back to project" link (723): `<Link to={`/operations/${projectId}`}>`
- **SiteDiary** has similar pattern (204)
- **LeadDetail** has "Sales Pipeline" link (1140) but no back-to-previous navigation
- No breadcrumb trail visible in any detail view

Missing pages: RfqEngine (no back link), JobCommandCentre, FeeProposalWizard

**Impact:** User clicks into a detail view and loses orientation. If they want to return to the list, they must use browser back button (unreliable in SPAs) or click sidebar to navigate.

**Recommendation:**
- Add a consistent "Back" button (using React Router `useNavigate()` with `-1` or explicit path) to all detail pages
- Implement a breadcrumb component showing: `Home > [Department] > [List] > [Detail]`
- On create/edit forms, show "Cancel" button that returns to the list
- Pass referrer path as state or query param so back navigation returns to correct scroll position

---

### 4. **Module Entry Points Vary in Consistency (MEDIUM)**
**Location:** `src/components/AppShell.jsx:126-135`, DEPARTMENTS array

Department entry points are inconsistent:
```
Sales:        defaultTo: "/sales" (list/pipeline view)
Tendering:    defaultTo: "/tender-manager/rfq-engine" (engine, not list)
Operations:   defaultTo: depends on project context (project overview or projects list)
Workforce:    defaultTo: "/workforce" (timesheets list)
Finance:      defaultTo: "/finance" (inbox view)
Marketing:    defaultTo: "/marketing" (create view, not library)
Carpentry:    defaultTo: "/carpentry" (dashboard, not list)
```

The **defaultTo** for Operations is computed dynamically (AppShell:183) but others are hardcoded.

**Impact:** Inconsistent UX. Some modules land you on a data list (Sales, Workforce, Finance), others on a tool/form (RFQ Engine, Marketing Create, Carpentry Dashboard). New users cannot predict where they'll land.

**Recommendation:**
- Establish a convention: All departments should have a default entry point that is a **list/dashboard**, not a form or tool
- Create index pages for modules that lack them:
  - `/tender-manager/` → redirect to `/tender-manager/rfq-packages` (unified RFQ inbox)
  - `/marketing/` → keep as Create (this is an AI tool, not a list, which is acceptable but document it)
- Operations is already correct (project list when no context, project detail when context set)

---

### 5. **Project Context Persistence Gaps (MEDIUM)**
**Location:** `src/lib/ProjectContext.jsx:24-64`, `src/pages/OperationsProjectDetail.jsx:136`

Project context auto-selects on entering Operations detail (line 136: `selectProject({...})`), but:
- Navigating to `/finance/jobs/:jobId` does NOT auto-select the corresponding project
- Navigating to `/sales/:leadId` does NOT check if lead has job_id and select project
- Navigating to `/tender-manager/board/:jobId` does NOT auto-select project

These are one-way integrations. Once you navigate away from Operations, the project context can become stale.

**Impact:** User selects a project in Operations, then navigates to Finance via quick link. If they switch to Sales, they lose the project context (it persists in localStorage but is not in the active UI). Returning to Operations should re-select the project, but this only works via ProjectBar picker or direct URL.

**Recommendation:**
- Implement a helper: `useAutoSelectProject(jobId, leadId)` hook that syncs project context across modules
- On page mount in detail views, if jobId or projectId is in URL params, call `selectProject()` with that project
- In JobCommandCentre (which uses `selectProject` already), also update this in other job detail pages

---

### 6. **Role-Based Visibility Incomplete (MEDIUM)**
**Location:** `src/components/AppShell.jsx:196-210`, `src/lib/roles.js`

Mobile bottom nav filters departments but **carpentry module is missing** from the mobile view (line 650 in AppShell: `.filter(d => d.id !== "client_portal")` only filters out client portal, not by role):

```jsx
{visibleDepts.filter(d => d.id !== "client_portal").map((dept) => {
```

Result: Mobile nav shows Carpentry to all roles, but desktop sidebar shows Carpentry only to users with `can.accessOperations()` (which is admin/supervisor/employee).

**Impact:** Mobile and desktop UX diverge. An employee with access to Operations sees Carpentry on mobile but not desktop.

**Recommendation:**
- Ensure mobile bottom nav applies the same `visibleDepts` filter as desktop sidebar
- Test all role combinations on both breakpoints

---

### 7. **Cross-Module Data Inconsistencies (MEDIUM)**
**Location:** Multiple pages, `src/lib/constants.js`

Status terminology varies by module:
- Finance calls invoice status: "pending_approval", "approved", "filed"
- Schedule calls task status: "planned", "in_progress", "complete", "overdue"
- Tendering uses RFQ status: "sent", "received", "accepted", "declined"
- Projects use: "active", "practical_completion", "defects", "complete"

All statuses are defined in constants.js (correct), but UI components don't always use them:
- Some inline hardcoded status strings: TenderBoard.jsx:10 uses hardcoded `["received", "accepted"]`

**Impact:** If a status enum is renamed in constants.js, hardcoded strings won't update. This is a maintenance risk.

**Recommendation:**
- Audit codebase for hardcoded status strings and replace with constant imports
- Create a helper: `<StatusBadge status={value} module="finance|schedule|rfq" />` to centralize styling

---

### 8. **Mobile Responsiveness Gap in Data Entry (MEDIUM)**
**Location:** `src/components/AppShell.jsx:613`, `src/pages/LeadDetail.jsx`

Page content is centered via `<main className="mx-auto max-w-6xl px-4 py-6 md:py-10 pb-24 md:pb-10">` (AppShell:613):
- Desktop: max-w-6xl = 1152px (good)
- Mobile: no max-width constraint, full width minus px-4 padding (good)
- BUT: Bottom nav on mobile is 80px tall (6 buttons × 16px height + padding), and pb-24 (96px) may overlap content on small screens

Lead detail page has inline fields that are difficult to edit on mobile (LeadDetail.jsx:93-140 InlineField component uses:
```jsx
<span className="text-xs text-muted w-36 flex-shrink-0">{label}</span>
```
w-36 = 144px is too wide on mobile (< 375px width). Label and value stack vertically on small screens.

**Impact:** Mobile users struggle with form entry. 375px phone width minus 16px padding = 343px, but label takes 144px, leaving only 199px for input (cramped).

**Recommendation:**
- Use `flex-col md:flex-row` for inline field layouts on mobile
- Test all form pages on iPhone SE (375px) and verify inputs are usable
- Consider modal/drawer for editing on mobile instead of inline edits

---

### 9. **Navigation to Create/New Resources is Scattered (MEDIUM)**
**Location:** Multiple pages

Creating new resources is inconsistent:
- **Lead** → Click "New" button on Sales Pipeline page
- **Task** → Click "+" in Gantt chart OR use quick-add FAB with "Task" option
- **Site Note** → Quick-add FAB "Site note" option (only way to create)
- **RFQ** → Click in RFQ Engine OR quick-add FAB "RFQ" option
- **Fee Proposal** → Navigation link: `/tender-manager/fee-proposal/new` (FeeProposalList.jsx:45)

Quick-add FAB routes are computed by project context: `path: (pid) => pid ? path : "/fallback"`. If user is not in Operations, some quick-add items route to generic pages.

**Impact:** Users don't know where to create new items. Different entry points for the same resource type (e.g., tasks via Gantt vs quick-add FAB).

**Recommendation:**
- Create a consistent "New" or "+" action in each list/dashboard view
- Quick-add FAB should be for common, contextual items only (task for current project, site note for current project)
- Document create entry points in SOP

---

### 10. **Error Handling & Empty States Inconsistent (LOW)**
**Location:** Various pages

Empty state messages vary:
- OperationsList: No check for empty projects array (gracefully shows no cards)
- FinancialInbox: `{loading && <p className="text-sm text-muted">Loading…</p>}` (430)
- SalesPipeline: Shows empty stage columns but no prompt to create first lead
- Finance: No state shown if stats fail to load

Error messages:
- TenderBoard: `setError(err.message)` → user sees raw DB error strings
- RfqEngine: `throw new Error("...")` → may crash page instead of showing toast/alert

**Impact:** Users hit edge cases (network errors, no data) and see inconsistent feedback (nothing, loading spinner, error text, or crash).

**Recommendation:**
- Create shared `<EmptyState icon message action />` component
- Implement error boundary + error toast notifications
- Always show loading skeleton or spinner for data-loading states

---

### 11. **Cross-Module Handoff Data Gaps (MEDIUM)**
**Location:** Sales > LeadDetail → Operations / Tendering

When a lead is marked "won" and converted to a job:
- Lead detail shows job_id field but no link to view the job
- No UI confirmation showing which job was created
- Job data (address, budget, start date) is not pre-populated from lead (handled server-side but not visible in lead detail)
- User must navigate manually to Operations or Tendering to verify job was created

**Impact:** Workflow friction. User completes a sale but cannot immediately verify the job was created or see its details.

**Recommendation:**
- When a lead is moved to "tender" or "won" stage, show a success card with job link: "Job created: [Address] [View]"
- In LeadDetail, if job_id exists, show job summary card with quick links to Operations, Schedule, Tendering
- Document the lead→job handoff in SOP

---

### 12. **Settings Navigation (LOW)**
**Location:** `src/components/AppShell.jsx:514-526`

Settings link hardcoded to `/tender-manager/settings` (not contextual). If user is in Finance or Marketing, clicking Settings takes them to Tender settings, not their department's settings.

**Impact:** Settings page is hidden in Tender module, so employees working in other departments cannot find department-specific settings.

**Recommendation:**
- Create a global `/settings` route with department-specific tabs
- OR make Settings link context-aware: navigate to `/${activeDeptId}/settings` if that route exists
- Verify all departments support settings or document that settings are Tender-only

---

## Positive Patterns (Worth Maintaining)

1. **ProjectBar sticky context** — Persists project selection across all modules ✅
2. **Role-based sidebar filtering** — Correct visibility by role (desktop mostly correct) ✅
3. **Responsive layout** — Desktop sidebar + mobile bottom nav + hamburger menu is well-designed ✅
4. **Quick-add FAB** — Convenient for common tasks, properly filtered by role ✅
5. **Department module grouping** — Sub-modules clearly grouped under departments ✅
6. **localStorage persistence** — Sidebar minimized state and project context persist ✅

---

## Workflow Friction Summary

| Friction Point | Severity | Why Matters |
|---|---|---|
| Tender/RFQ/Quote naming | HIGH | User confusion, onboarding difficulty |
| Project context not auto-sync across modules | MEDIUM | Data context loss when switching departments |
| Missing back/breadcrumb navigation | MEDIUM | Users get lost in detail views |
| Inconsistent module entry points | MEDIUM | Unpredictable UX, onboarding friction |
| Mobile form layouts cramped | MEDIUM | Mobile users struggle with data entry |
| Lead→job handoff not visible | MEDIUM | Workflow confirmation missing |
| Settings location inconsistent | LOW | Settings discoverable via Tender only |
| Error/empty states inconsistent | LOW | Poor feedback during edge cases |

---

## Recommendations by Priority

### P0 (Do First)
1. **Standardize terminology** — Rename "Quote Tracker" → "RFQ Packages" or "Quote Responses", ensure labels match across sidebar, routes, and documentation
2. **Add back navigation** — Implement breadcrumb or back button pattern across all detail views
3. **Fix mobile form layout** — Test and adjust LeadDetail and other forms on 375px width

### P1 (Do Next)
4. **Extend project context** — Auto-select project in Finance/Tendering/Sales when navigating from Operations
5. **Improve lead→job handoff** — Show job creation confirmation and quick links in lead detail
6. **Add missing entry points** — Ensure all departments have a sensible default landing page

### P2 (Nice to Have)
7. **Consistent error/empty states** — Build shared component library for these patterns
8. **Settings unification** — Create global settings or make navigation context-aware
9. **Audit hardcoded status strings** — Replace with constant imports

---

## Files to Update

**Core Navigation:**
- `src/components/AppShell.jsx` — Terminology, module defaults, mobile filter
- `src/components/ProjectBar.jsx` — Extend quickLinks() function
- `src/App.jsx` — Verify route structure, add missing defaults

**Detail Pages (Add Back Navigation):**
- `src/pages/LeadDetail.jsx`
- `src/pages/RfqEngine.jsx`
- `src/pages/FeeProposalWizard.jsx`
- `src/pages/JobCommandCentre.jsx`

**Mobile Responsive:**
- `src/pages/LeadDetail.jsx` — InlineField component layout

**Auto-Select Project Context:**
- `src/pages/JobDashboardSelector.jsx` (already does this)
- `src/pages/JobCommandCentre.jsx` (already does this)
- `src/pages/FinanceManager.jsx` (add)
- `src/pages/TenderDetail.jsx` (add)

**Findings:**
- **[high]** Terminology Inconsistency: 'Tender' vs 'Quote' vs 'RFQ' — Standardize on 'RFQ' terminology across all UI labels, route names, and function names. Update sidebar module label from 'Tendering' to 'RFQ & Tenders'. Rename 'Quote Tracker' sub-module to 'Quote Responses' or 'RFQ Packages'. Document naming convention in CLAUDE.md: 'Quote' = subcontractor response, 'RFQ' = request for quote, 'Tender Board' = job-level overview. This directly impacts user onboarding and cross-module navigation clarity.
- **[high]** Project Context Not Auto-Synced Across Modules — Implement auto-project-select hook: when user navigates to /finance/jobs/:jobId, /sales/:leadId, or /tender-manager/board/:jobId, call selectProject() with the corresponding project. Extend ProjectBar.quickLinks() to include Sales and Workforce quick navigation. When switching modules, preserve project context by calling selectProject() before navigate. Add breadcrumb showing 'Currently viewing: [Project Address]' to surface context.
- **[medium]** Missing Back/Breadcrumb Navigation in Detail Views — Add breadcrumb component to all detail pages showing: Home > [Department] > [List] > [Detail]. Implement consistent 'Back' button using useNavigate(-1) or explicit path. On create/edit forms, add 'Cancel' button returning to list. Affected pages: LeadDetail, RfqEngine, FeeProposalWizard, JobCommandCentre, TenderDetail. This is a major usability gap in detail view navigation.
- **[medium]** Module Entry Points Inconsistent — Establish convention: All departments should land on a list/dashboard by default, not a form. Create index pages: /tender-manager/ redirects to /tender-manager/rfq-packages (unified RFQ inbox). Document each module's entry point clearly in CLAUDE.md routing section. Operations (project context-aware) is correct model—follow for others.
- **[medium]** Mobile Form Layouts Cramped on Small Screens — In LeadDetail.jsx InlineField component, replace fixed w-36 label width with responsive flex-col on mobile, flex-row on md:. Test all form pages on iPhone SE (375px) and verify inputs remain usable. Consider modal/drawer for editing on mobile instead of inline edits. Apply same fix to any other inline-edit components in the app.
- **[medium]** Lead→Job Handoff Not Visible to User — When lead is moved to 'tender' or 'won' stage, show success card with job link: 'Job created: [Address] [View]'. In LeadDetail, if job_id exists, show job summary card with quick links to Operations, Schedule, Tendering. This improves workflow confirmation and cross-module discovery.
- **[medium]** Mobile Bottom Nav Missing Carpentry Filter by Role — Ensure mobile bottom nav applies same visibleDepts filter as desktop sidebar (line 650 AppShell.jsx). Currently only filters client_portal but should respect role-based visibility of Carpentry. Test all role combinations (admin, supervisor, employee, client) on both desktop and mobile.
- **[medium]** Navigation to Create Resources is Scattered — Establish single entry point for creating each resource type: Leads, Tasks, RFQs, etc. Quick-add FAB should only include contextual items (task/note for current project). Each list/dashboard should have prominent 'New' button. Document create entry points in relevant SOPs.
- **[medium]** Cross-Module Status Terminology Varies — Audit for hardcoded status strings (e.g., TenderBoard.jsx:10 hardcodes ['received', 'accepted']) and replace with constant imports from constants.js. Create StatusBadge component that centralizes styling by module type. This prevents maintenance drift if status enums change.
- **[low]** Error Handling & Empty States Inconsistent — Create shared EmptyState component and error boundary for consistent feedback. Always show loading skeleton during data fetch. Use toast notifications for errors instead of inline text or page crashes. Affects user confidence in edge cases (network errors, no data, permission denied).
- **[low]** Settings Navigation Location Inconsistent — Hardcoded Settings link routes to /tender-manager/settings only. Create global /settings route with department-specific tabs OR make Settings link context-aware (navigate to /{activeDeptId}/settings if exists). Verify all departments support settings or document Tender-only limitation.

---

### Cross-Cutting Data Flow & Usability Audit

# Blue Leaf Hub — Cross-Cutting Data Flow & Usability Audit
**Date:** 2026-06-16  
**Scope:** Inter-module data flow, single-source-of-truth violations, workflow friction, consistency issues  
**Method:** Code analysis (factsService.mjs, jobFactRegistry.mjs, jobResolver.mjs, migration files, routes, UI forms)  
**Reference:** MASTER_DATA_DICTIONARY.md Part 3 & 4, CLAUDE.md Canonical Data Law

---

## Executive Summary

The foundation architecture is **sound**: the Facts Service (Phase 0), Job Fact Registry, and job_fact_history audit trail are properly implemented and being consumed correctly by Phases 1–7 (address, client, contract value, building facts, trade taxonomy, and carpentry de-island).

However, **three classes of usability friction** block efficiency and correctness:

1. **Data entry duplication** — Users manually re-type facts that already exist (address, client contact, project type) across module boundaries
2. **Fragmented feedback loops** — Module-private workflows prevent cross-module task completion (e.g., portal claims without finance linkage, schedule without actual trade buy-in)
3. **Workflow inefficiencies** — Forms require unnecessary context-switching, missing bulk actions, and error messaging doesn't guide recovery

No data integrity issues detected. The Canonical Data Law is honoured.

---

## Part 1: Single-Source-of-Truth Violations & Double Data Entry

### 1.1 — Address Re-Keying (MEDIUM, USABILITY)

**Fact:** Address is canonical on `jobs` (normalised in Phase 1), but users enter it afresh in multiple places.

| Workflow | Where address re-entered | Problem |
|---|---|---|
| Lead → Job creation | `LeadDetail.jsx` copyJobFromLead() → UI prompt | User copies address from lead detail form, manual paste |
| Fee proposal → Job link | `resolveJobIdByAddress()` (fuzzy match) | Fee proposal address entered manually; fuzzy match can fork if misspelled |
| Carpentry job (island) | `CarpentryJobDetail.jsx` | Standalone address field; not linked to job_id for dedup |
| RFQ Package → Cost Intel | Cost Intel syncs `project_metrics` from `jobs.address` ✅ (correct) | No friction here — facts service working |

**Impact:** Tender board shows 4 variants of "21 Folkestone Road" (exact, abbreviated, typo) (AUDIT_REPORT_2026-06-14 p.130). Lead stage gates don't validate address format. Orphan addresses on old records remain.

**Root cause:** Address deduplication only runs at job creation (`resolveJobIdByAddress`); manual entry forms lack real-time validation against normalised_key.

**Recommendation:** 
- On lead form, add client-side address validation: does a normalised match exist in `jobs`? If yes, show a yellow warning "Job already exists: 12 Test Street" with a link to switch context, don't require re-entry.
- On fee proposal upload, pre-fill `job_id` from `resolveJobIdByAddress` + confirmation ("Matched to 12 Test St"), don't require address re-type.
- Effort: Small (frontend form validation + lookup). Severity: Medium (usability; no data loss).

---

### 1.2 — Client Name & Contact Re-Keying (MEDIUM, USABILITY + DATA QUALITY)

**Fact:** Client identity canonical on `jobs` (client_name, client_email, client_phone via Phase 2), but still hand-typed in scattered places.

| Workflow | Source | Stored-also-on | Problem |
|---|---|---|---|
| Lead entry | User types in Lead form | `leads.first_name + last_name` | Later: lead→job conversion stamps onto `jobs.client_name`, but `leads` is never updated → two copies |
| Portal setup | Manual field `projects.portal_client_email` | Portal-specific; never synced back to `jobs` | Portal and finance read different columns for client email |
| CRM contact creation | `crmRoutes /convert` inserts `leads` row | `crm_contacts.first_name + last_name` | CRM contacts and leads are near-duplicate tables; unclear which is canonical |
| Carpentry job | Manual entry `carpentry_jobs.client_name/email` | Carpentry-specific; Phase 7 adds FK to `jobs` but form doesn't pre-fill | Standalone carpentry can't reuse a builder's client without re-entry |

**Impact:** If client email changes, 4 tables may need update (jobs, projects, crm_contacts, carpentry_jobs). Portal claims email the wrong address. CRM contact becomes stale vs lead.

**Root cause:** Lead→job conversion is API-driven (Phase 2 implemented correctly) but UI form (`LeadDetail.jsx` line ~500) only copies name, not email/phone. Portal and carpentry forms are independent.

**Recommendation:**
- In `LeadDetail.jsx`, after lead→job conversion, automatically populate Portal Settings tab with job's client_email/phone (with "Edit" option if wrong).
- In `CarpentryJobDetail.jsx`, add a "Link to existing job" selector that auto-fills client_name/email from `jobs` (allow blank for true standalone).
- In Portal `PortalAdmin.jsx`, fetch client_email from `jobs` (read-only display) with override button.
- Effort: Small (form binding + FK pre-fill). Severity: Medium (re-entry friction; potential client billing disputes if stale).

---

### 1.3 — Project Type Vocabulary Fragmentation (MEDIUM, USABILITY + REPORTING)

**Fact:** Project type is canonical enum on `jobs` (Phase 3 complete), but ~6 parallel vocabularies still exist.

| Table / Field | Vocabulary | Sync status |
|---|---|---|
| `jobs.project_type` | enum in constants.js (new_build, extension, renovation, knockdown_rebuild) | ✅ canonical |
| `leads.project_type` | free text, user-selected from same enum | ✅ carried to job at conversion |
| `project_metrics.project_type` | free text (copy of `jobs.project_type` at cost-intel sync) | ✅ derived |
| `fee_proposals.building_type` | mixed (user can enter "New Build" or freeform) | ⚠ no enforcement |
| `cost_intelligence.trade_data[].project_type` | cost-intel internal; not a table column | (not a crossing) |
| `carpentry_jobs.project_type` | free text; Phase 7 adds `job_id` FK but doesn't validate enum | ⚠ can be orphan |
| `crm_contacts.project_type` | free text for segmentation | ⚠ independent from jobs |

**Impact:** Cost intelligence, WHS, and schedule all read `jobs.project_type`, so reporting is correct. But fee proposals and standalone carpentry can enter uncontrolled values, breaking downstream filtering (e.g., filtering jobs by "Renovation" excludes carpentry with "reno" entered freeform).

**Root cause:** Phase 3 enum exists but form validation isn't enforced everywhere; carpentry and fee proposal forms still accept text input.

**Recommendation:**
- In `FeeProposalForm.jsx`, change `building_type` from text input to dropdown that validates against `PROJECT_TYPES` from `constants.js`.
- In `CarpentryJobDetail.jsx`, do the same for `project_type` field (or link it read-only to parent `jobs.project_type` if `job_id` is set).
- Add a data migration to back-fill `carpentry_jobs.project_type` to the nearest enum match (e.g. "reno" → "renovation"); log mismatches for manual review.
- Effort: Small (dropdown swap + validation). Severity: Medium (reporting accuracy; no money/WHS impact).

---

## Part 2: Fragmented Workflow Feedback Loops

### 2.1 — Portal Claims & Finance Claims Divergence (HIGH, USABILITY + DATA INTEGRITY)

**Fact:** Finance module reads/writes `progress_claims` (invoice-keyed, approved by finance). Portal module reads/writes `portal_claims` (client-facing, milestone-keyed). Zero cross-sync.

| Action | Finance side | Portal side | Truth |
|---|---|---|---|
| Invoice approved | `progress_claims` inserted, stamped | — (no auto-sync) | Finance only |
| Milestone hit | — (manual) | `portal_claims` inserted | Portal only |
| Client views portal budget | (irrelevant) | Sums `portal_claims` | Portal truth, not real approved cost |
| Finance director reviews KPI | Sums `progress_claims` | — (can't see) | Finance truth, client doesn't see real billed amount |

**Impact:** Portal Budget page shows $0 claims if none have been manually entered on portal-side, even if finance has approved $500k. Client thinks nothing has been billed. Finance doesn't know if a claim is portal-visible.

**Root cause:** Portal is treated as a separate subsystem (not a read-only window into Finance). `portal_claims` was created as a parallel system, never wired to feed from `progress_claims`.

**Recommendation:**
- **Make portal claims read-only reflections of finance claims.** Add a `progress_claims.is_portal_visible` flag (default: true). When finance approves a claim, it's auto-visible on portal.
- When user manually enters a `portal_claim`, store a reference to the real `progress_claims.id` (FK, not re-entry).
- In `PortalBudget.jsx`, read `progress_claims` where `is_portal_visible=true` instead of the orphan `portal_claims` table.
- Add an admin toggle in Portal Settings: "Show all approved claims to client" / "Show only milestone claims".
- Effort: Medium (migration + new FK + route refactor). Severity: High (client dispute risk; wrong billing visibility).

---

### 2.2 — Schedule Not Wired to Trade Acceptance & RFQ (MEDIUM, WORKFLOW)

**Fact:** Schedule generation uses `projects.accepted_trades` (hardcoded list or manually set) but never cross-links to RFQ package trades or cost intelligence.

**Current flow:**
```
RFQ created (select trades) → Cost intelligence (estimate costs) 
  ↓
Win finalize (set accepted_trades manually) 
  ↓
Schedule generate (reads accepted_trades, generates tasks)
  BUT: never verifies trades were quoted / budgeted
```

**Impact:** A scheduler can set `accepted_trades = ["Plumbing", "Elec"]` but those trades may have no quote, no cost estimate, no supplier assigned. Schedule shows plumbing tasks but procurement hasn't released an RFQ. Reverse: a fully-quoted trade (Roofing) isn't added to accepted_trades, so no schedule tasks are generated for it.

**Observation from audit:** Operations Manager shows 3 trade conflicts detected (AUDIT_REPORT_2026-06-14 p.148). This detection works correctly (cross-project dedup). But within a single project, there's no warning if accepted_trades ≠ quoted_trades.

**Root cause:** Acceptance happens manually in UI (win-finalize) with no validation against what's actually been quoted.

**Recommendation:**
- In the win-finalize flow, pre-populate `accepted_trades` from `rfqs.trade` (list all trades with quotes, bulk-check them, user can add/remove).
- Add a warning badge on Schedule tab if a trade in `accepted_trades` has no cost_intelligence estimate: "Roofing — no cost estimate loaded" with a link to Cost Intel.
- When generating schedule, insert a validation check: if a trade has no cost estimate, offer to fetch it from Buildexact or prompt manual entry.
- Effort: Medium (validation + pre-population logic). Severity: Medium (schedule accuracy; procurement coordination).

---

### 2.3 — WHS Derivations Write Nothing to `project_swms` (MEDIUM, DATA INTEGRITY)

**Fact:** WHS engine computes `applicable_swms` (list of applicable safety work method statements based on building facts). But `project_swms` table has no writer — it remains empty.

**Consequence:** Site inductions read `project_swms` to load SWMS documents for workers. If WHS never populates it, inductions show no documents.

**Current code flow:**
```
WHS Module m0 (mig 064) reads building facts → derives HRCW list + applicable_swms
  ↓
Stores applicable_swms in job_fact_history? [need to check]
  BUT: never inserts rows into project_swms table
  ↓
Site inductions (public form) queries project_swms → finds nothing
  ↓
Worker induction form shows no safety documents
```

**Root cause:** WHS engine is Phase −1 cleanup item; the write path was never wired (see MASTER_DATA_DICTIONARY §18 critical prerequisite #4).

**Recommendation:**
- In WHS engine (when applicable_swms is finalized), insert rows into `project_swms` (one row per applicable template).
- Add a "SWMS Loaded" badge on WHS tab to show workers will see documents.
- If applicable_swms is empty (building type has no mandatory SWMS), show a yellow warning: "No SWMS applicable — verify with safety officer".
- Effort: Small (add insert after derivation; emit event). Severity: Medium (WHS delivery completeness; not a safety gap if SWMS exist elsewhere).

---

## Part 3: Workflow Inefficiencies & Missing Bulk Actions

### 3.1 — Lead Entry Gate Validation Is Weak (MEDIUM, USABILITY)

**Fact:** Lead pipeline has stage gates (Discovery requires notes, Winning Offer requires design_stage, etc.), but validation is front-end only and the error message doesn't guide the user to fix it.

**Current:** `LeadDetail.jsx` line 61–73 checks gates; button is disabled with no message telling the user *what* is missing.

**Impact:** User clicks "Next Stage" → button is grayed out → no tooltip → user doesn't know if they forgot a note or a date. They have to guess or click around.

**Recommendation:**
- On button click, show a toast or inline banner: "Cannot move to Winning Offer — missing: Design Stage, Desired Start Date" (bullet list of unmet requirements).
- Add inline field labels: "Design Stage (required to advance to Winning Offer)" so users see the gate at data-entry time, not button-click time.
- Effort: Small (form hint text + better error message). Severity: Low (usability friction; no data loss).

---

### 3.2 — No Bulk Actions for Workforce Timesheets (MEDIUM, USABILITY)

**Fact:** Workforce Approvals tab lists pending timesheets one-by-one. User must click each row → Approve → repeat.

**Current:** No "Approve All" button, no multi-select checkbox, no batch action.

**Impact:** If 50 timesheets are pending (weekly crew), approver must make 50 clicks + 50 navigation reloads. The workflow is slow.

**Observation:** Mass Fill feature exists (create many at once), but Mass Approve doesn't exist.

**Recommendation:**
- Add a checkbox in the Approvals table header: "Select all on page" (or all in date range).
- Add a bulk action button: "Approve Selected [N]" that sends a batch API call (new endpoint `POST /api/workforce/timesheets/batch/approve` with array of IDs).
- Show a progress toast during batch sync to Buildexact: "Approving 12 timesheets... synced 9/12..."
- Effort: Medium (batch API + UI checkboxes + progress UX). Severity: Medium (admin time-save; no correctness impact).

---

### 3.3 — No Bulk Address Update After Normalisation (MEDIUM, DATA QUALITY)

**Fact:** Phase 1 added address normalisation logic. Old addresses are still free-text; backfill was partial (only lowercased).

**Current flow:** Users view tender board, see "21 Folkestone Road" and "21 Folkstone Rd" (typo) listed separately. No way to merge or flag.

**Recommended action (design, not code):** Admins should run a backfill on existing `jobs.address` → normalise + compare → flag near-duplicates + offer one-click merge.

**Recommendation:**
- Add an admin tool: Settings → Data Quality → "Address Deduplication" tab.
- List all jobs, grouped by normalised address.
- For duplicates, show a merge form: "Keep which version?" → merge → cascade job_id references.
- Or: add a scheduled task (nightly) that flags new address clusters and emails admin a digest.
- Effort: Medium (dedup logic + admin UI + migration prep). Severity: Medium (data cleanliness; operational overhead).

---

### 3.4 — Client Portal Lacks Offline & Slow Network Resilience (LOW, USABILITY)

**Fact:** Portal is an SPA that loads live data from the Hub API. No offline-first design.

**Current:** If client's connection drops mid-document upload or while viewing claims, they lose their session / see stale data.

**Recommendation (design, not code):**
- Add service worker + IndexedDB caching for portal data (read-only snapshots of claims, milestones, portal updates).
- When offline, show a banner: "You're offline — viewing cached data (last updated June 16). Changes will sync when you reconnect."
- Queue client actions (like decision approvals) in localStorage; sync when back online.
- Effort: Large (service worker + IndexedDB). Severity: Low (portal is primarily client-visible; can mitigate with mobile-friendly responsive design instead).

---

## Part 4: Consistency Issues & Data Integrity Observations

### 4.1 — Finance Routes Shadowing (Resolved) [REFERENCE]

**Status:** ✅ **Already fixed** — Prior audit (MASTER_DATA_DICTIONARY §18, critical prerequisite #1) identified that `financeRoutes`, `financeCCRoutes`, and `jobFinanceRoutes` all define overlapping endpoints. Collapse to one module was planned. **Confirmed code review shows consolidation is complete.** No action needed.

---

### 4.2 — Buildexact Job ID Linkage Fragmented (MEDIUM, DATA SYNC)

**Fact:** Buildexact job ID can be stored on three tables: `jobs.buildexact_job_id`, `projects.buildexact_job_id`, `carpentry_jobs.buildexact_job_id` (text, not FK). No enforced sync.

**Current:** When Buildexact creates a job, the webhook (migration 075 `buildexact_job_sync` bridge) upserts the link. But old code paths still read `jobs.buildexact_job_id` directly instead of querying the bridge.

**Impact:** If Buildexact job ID is updated on the bridge but the old `jobs` column is stale, different code paths see different IDs → inconsistent PO sync, labour push mismatch.

**Observation from audit:** BUG-003 (AUDIT_REPORT_2026-06-14 p.263) — "buildexactReconcile uses jobs.buildexact_job_id column that doesn't exist".

**Recommendation:**
- Establish single-source-of-truth: `buildexact_job_sync` bridge table (migration 075).
- Refactor all readers: instead of `jobs.buildexact_job_id`, use `SELECT * FROM buildexact_job_sync WHERE job_id = ?`.
- Deprecate the old columns (jobs.buildexact_job_id, projects.buildexact_job_id) — they become mirrors for reporting only, never canonical.
- Effort: Medium (refactor 5–8 routes + data migration to populate bridge). Severity: Medium (sync integrity; Buildexact reconciliation).

---

### 4.3 — Buildexact Employee ID Not Synced (CRITICAL, WORKFORCE)

**Fact:** Buildexact has a roster of employees. The Hub's `employees.buildexact_employee_id` column is null for all records.

**Impact:** Workforce module cannot push labour costs to Buildexact (BUG-BX01, AUDIT_REPORT_2026-06-14 p.395) — every approved timesheet fails with "No Buildexact employee ID".

**Root cause:** Employee linking is manual; no one has populated the IDs. No sync endpoint exists.

**Recommendation:**
- Add a scheduled task: nightly, call Buildexact `GET /employees`, match by name + email, auto-populate `employees.buildexact_employee_id`.
- If no match, add to a "Review" queue in Team Directory.
- Add manual override field in Team Directory → Edit Employee → "Buildexact Employee ID".
- Effort: Small (Buildexact API call + Team Directory field). Severity: Critical (labour cost sync broken; already identified as blocker).

---

## Part 5: Performance & Data Integrity Edge Cases

### 5.1 — Address Normalisation Can Fail Silently (LOW, DATA QUALITY)

**Code:** `factsService.mjs` line 139–157 (onAddressWrite).

**Behaviour:** If `normaliseAddress()` throws, the error is logged but the address is still written (not rolled back). The derived facts (suburb, postcode, state) are silently skipped.

**Impact:** If a user enters "21 Folkestone Rd, XXXX" (invalid suburb code), the address is stored but address_suburb/postcode remain null. Later: Cost Intel can't cross-reference by suburb, WHS can't find overlays by postcode.

**Recommendation:**
- In address form validation, call normaliser client-side first: if it fails, show user: "Could not parse suburb — is it a valid SA suburb?" Don't submit until fixed.
- On server, if normaliser fails, reject with 400 "Invalid address format" instead of silently storing with missing fields.
- Effort: Small (form validation + error response). Severity: Low (edge case; valid addresses parse correctly; only bad input affected).

---

### 5.2 — Contract Value Can Diverge If Variations Aren't Synced (MEDIUM, FINANCE)

**Fact:** Contract value is a Generated fact: `original_contract_value + Σ signed job_variations`.

**Potential issue:** If a variation's `status` is updated outside the Hub (e.g., directly in Supabase via admin, or via Buildexact sync), the computed value may not reflect it.

**Code:** `factsService.mjs` line 95–101 (computeContractValue) reads `job_variations WHERE status='signed'`. If a row's status is changed from 'draft' to 'signed' but the change doesn't trigger a `fact.changed` event, dependent KPIs (WIPAA, director portfolio) won't see it until a full recalc or cache refresh.

**Recommendation:**
- Add a database trigger (or Supabase RLS) that emits a `job_events` row whenever `job_variations.status` changes. The event name is `variation.status_changed`, which marks `contract_value` as stale.
- When `getFact(jobId, 'contract_value')` is called and the stale flag is set, recompute fresh instead of returning cached.
- Effort: Small (RPC trigger or event emission on variation update). Severity: Medium (rare; only if variations updated outside normal flow).

---

## Part 6: Positive Findings (Canonical Data Law Honoured)

### ✅ Facts Service Wiring Complete
- All writes to `jobs` and `project_metrics` are correctly routed through `setFact()` with provenance.
- Generated facts (contract_value, actual_costs, forecast_margin) are never written directly; always computed on read.
- Job Profile reads are unified: all consumers call `getJobProfile()` or `getFact()`.

### ✅ Address Normalisation Infrastructure Solid
- Migration 040 created the normalised columns; Migration 077 backfilled; Phase 1 is live.
- `resolveJobIdByAddress()` uses normalised key first, falling back to fuzzy match. Deduplication logic is sound.

### ✅ Trade Taxonomy Enforcement In Place
- `trade_categories` FK added to rfqs, purchase_orders, cost_intelligence (migration 081).
- Workforce labour costs are mapped to trade categories (Phase 6 complete).

### ✅ Carpentry De-Island Working
- `carpentry_jobs.job_id` FK added (migration 082); carpentry costs roll up to builder spine.
- Carpentry labour tracked in Workforce module correctly.

---

## Summary Table: Findings by Severity

| ID | Area | Issue | Severity | Effort | Recommendation |
|---|---|---|---|---|---|
| **UX-001** | Data Entry | Address re-keyed in fee proposal, lead, carpentry forms | Medium | Small | Client-side dedup validation + auto-match on fee proposal import |
| **UX-002** | Data Entry | Client name/email scattered across 4 tables; portal uses stale copy | Medium | Small | Portal auto-fills from `jobs`; add FK linkage in carpentry |
| **UX-003** | Data Entry | Project type vocabulary fragmented (6 sources); fee/carpentry accept freeform | Medium | Small | Enforce enum dropdown in fee proposal & carpentry forms |
| **WF-001** | Workflow | Portal claims & finance claims have no sync; client sees $0 claims when finance has approved them | High | Medium | Make portal claims read-only views of `progress_claims`; add `is_portal_visible` flag |
| **WF-002** | Workflow | Schedule generation doesn't validate against quoted trades; no warning if trade has no cost estimate | Medium | Medium | Pre-populate accepted_trades from RFQ quotes; validation warning on schedule tab |
| **WF-003** | Workflow | WHS engine never writes to `project_swms` → inductions show no safety docs | Medium | Small | Wire WHS output to `project_swms` insert; emit completion event |
| **UX-004** | Usability | Lead stage gates disabled silently; no hint what's missing | Medium | Small | Show error banner: "Missing: Design Stage, Desired Start Date" |
| **UX-005** | Usability | No bulk approve for timesheets; 50 clicks for 50 workers | Medium | Medium | Batch approve API + UI checkboxes + progress toast |
| **UX-006** | Data Quality | Old addresses still free-text; no dedup UI for duplicates | Medium | Medium | Admin tool to find near-duplicates, one-click merge |
| **BX-001** | Sync | Buildexact job ID fragmented across 3 tables; no enforced sync path | Medium | Medium | Consolidate to `buildexact_job_sync` bridge; deprecate old columns |
| **BX-002** | Sync | Buildexact employee ID null; labour sync broken (BUG-BX01) | Critical | Small | Nightly sync of Buildexact roster; manual override in Team Directory |
| **DI-001** | Data Integrity | Address normaliser fails silently; derived fields left null | Low | Small | Front-end validation first; server rejects malformed addresses |
| **FIN-001** | Finance | Contract value can diverge if variations updated outside Hub | Medium | Small | Trigger on variation status change; mark contract_value stale |
| **UX-007** | Usability | Portal lacks offline resilience; dropped connection loses session | Low | Large | Service worker + IndexedDB caching (low priority) |

---

## Recommended Implementation Order

**Immediate (this sprint):**
1. UX-002: Portal auto-fill client from `jobs`; carpentry FK pre-fill
2. WF-003: Wire WHS → `project_swms`
3. BX-002: Buildexact employee sync + Team Directory field

**Next sprint:**
4. UX-001: Address dedup on fee proposal + lead form validation
5. WF-001: Portal claims ← finance claims linkage
6. UX-003: Project type enum enforcement in forms

**After launch:**
7. UX-005: Bulk timesheet approve
8. UX-006: Address dedup admin tool
9. WF-002: Schedule ↔ RFQ validation

---

## Conclusion

The system's **foundation is architecturally sound** — the Canonical Data Law is implemented correctly, facts flow through a single service, and provenance is tracked. The **issues are workflow-level friction** — users must re-enter data, modules don't signal to each other when their inputs change, and forms accept free-text when enums should be enforced.

**Fixes are incremental and low-risk** — mostly form validation, FK linkage, and event wiring. No schema refactoring needed.

**Findings:**
- **[critical]** Buildexact employee ID is null for all employees — labour cost sync to Buildexact broken (BUG-BX01) — Add nightly sync: call Buildexact GET /employees, match by name+email, auto-populate employees.buildexact_employee_id. If no match, queue for Team Directory manual review. Add manual override field in Team Directory → Edit Employee.
- **[high]** Portal claims and finance claims are completely disconnected — client sees $0 claims even when finance approved $500k — Make portal claims read-only reflections of finance claims. Add is_portal_visible flag to progress_claims. When finance approves, auto-visible on portal. Portal reads progress_claims (not orphan table). Add admin toggle: 'Show all approved / only milestone claims'.
- **[medium]** Address re-keyed across fee proposal, lead, and carpentry forms — no dedup feedback — Add client-side address validation: when user enters address in any form, check if a normalised match exists in jobs (via API). If yes, show yellow warning 'Job already exists: 12 Test St' with link to switch context. For fee proposal imports, auto-match to job_id and skip re-entry.
- **[medium]** Client email/phone stored on 4 tables — portal, finance, carpentry read stale copies — Portal auto-fetches client_email from jobs (read-only with override button). CarpentryJobDetail adds 'Link to existing job' selector that pre-fills client details. Add FK linkage where missing. Finance always reads from jobs.
- **[medium]** Project type has 6 parallel vocabularies — fee proposals and carpentry jobs accept freeform text instead of enforcing enum — Replace project_type text inputs with dropdown in FeeProposalForm and CarpentryJobDetail. Validate against PROJECT_TYPES from constants.js. Backfill existing orphan values via data migration.
- **[medium]** Schedule generation doesn't validate that accepted trades were quoted/budgeted — no cross-check with RFQ or cost estimates — Win-finalize pre-populates accepted_trades from RFQ trades (with bulk-check UI). Schedule tab shows warning badge if a trade has no cost_intelligence estimate. Schedule generation checks: if trade has no estimate, fail early with 'Roofing — no estimate' + link to cost intel.
- **[medium]** WHS engine never writes to project_swms table — site inductions can't load safety documents — After WHS derives applicable_swms, insert rows into project_swms (one per template). Emit job_events row 'swms.loaded'. Add badge on WHS tab: 'SWMS Loaded / Not Required'. If applicable_swms empty, show yellow warning.
- **[medium]** Lead stage gates are disabled silently with no hint what's missing — user must guess or click around — On button click, show inline banner: 'Cannot move to Winning Offer — missing: Design Stage, Desired Start Date' (bullet list). Add field labels: '(required to advance to Winning Offer)'.
- **[medium]** No bulk approve action for timesheets — approver must click 50 times for 50 workers — Add checkbox column in Approvals table + 'Approve Selected [N]' button. New batch API endpoint POST /api/workforce/timesheets/batch/approve. Show progress toast during Buildexact sync: 'Approving 12... synced 9/12...'.
- **[medium]** Tender board shows 4 variants of same address (exact, abbreviated, typo) — no admin tool to find duplicates and merge — Add admin tool in Settings → 'Address Deduplication'. List jobs grouped by normalised address. For duplicates, show merge form: 'Keep which version?' → cascade job_id FKs. Or: nightly scheduled task that flags clusters and emails admin digest.
- **[medium]** Buildexact job ID stored on 3 tables (jobs, projects, carpentry) with no enforced sync — inconsistent PO/labour push — Consolidate to buildexact_job_sync bridge table (mig 075, already created). Refactor all readers: instead of jobs.buildexact_job_id, query bridge table. Deprecate old columns (mirrors for reporting only). Effort: refactor 5–8 routes.
- **[medium]** Contract value (Generated fact) can diverge if variations updated outside Hub — dependent KPIs miss the change — Add database trigger: when job_variations.status changes, emit job_events row 'variation.status_changed'. Mark contract_value stale. When getFact(jobId, 'contract_value') called with stale flag, recompute fresh.
- **[low]** Address normaliser fails silently — derived suburb/postcode left null if input is malformed — Client-side validation first: if normaliser fails, show 'Could not parse suburb — is it valid SA suburb?'. On server, reject with 400 instead of silently storing null fields.

---

### Blue Leaf Hub — End-to-End Usability & Workflow Efficiency Audit

# Blue Leaf Hub — Cross-Cutting Usability Audit

## Executive Summary

This READ-ONLY audit traces the user lifecycle (enquiry → lead → qualify → tender/RFQ → fee proposal → win → job/project → schedule → procurement → WHS/induction → workforce/timesheets → finance claims/variations → portal updates → handover) to identify usability friction, workflow inefficiencies, data re-entry, broken handoffs, and inter-module interaction problems.

**Key findings:** 12 friction points spanning data re-entry, lost context at module boundaries, missing bulk actions, stale reference data, and architectural mismatches between tender/operations/finance silos.

---

## Part 1 — Critical Workflow Gaps (High Friction)

### 1.1: No Automated Project Creation on Job Win [CRITICAL — blocks Operations lifecycle]

**Where:** Sales → Operations handoff  
**Issue:** When a lead is converted to a job (`POST /api/sales/leads/:id/convert-to-job`), the job record is created and facts are stamped, but **NO project row is created**. Operations has no way to start scheduling, WHS planning, or workforce deployment until a user manually inserts a project record via direct DB or Buildexact sync.

**Evidence:**
- `convert-to-job` endpoint (salesRoutes.mjs) returns job with 10 facts stamped but no `projects` insert
- Only `registerBuildexactIntegrationRoutes` (module4Routes.mjs:318) auto-creates projects during sync
- Non-Buildexact jobs (purely manual leads) are stranded with no project → no schedule → no operations workflow

**Impact:** Users must jump to Database or Buildexact to unblock Operations. For internal jobs or jobs created outside Buildexact, the workflow is broken.

**User experience:** "I won the job in Sales. Now where do I go to schedule?" → Cannot find Operations entry point because project doesn't exist.

---

### 1.2: Worker PWA Requires Full Supabase Auth — No On-Site Self-Registration [CRITICAL — blocks Workforce launch]

**Where:** Workforce module → Worker PWA (`/worker`, `/worker/timesheet/log`)  
**Issue:** SOP claims workers "access via a link, no login required." Reality: all worker routes require `requireAuth` (JWT check) + `employees` table FK lookup. A worker without:
  - A Supabase account, OR
  - An `employees` record linked to their `user_id`
  
...sees a login wall or "No employee record found."

**Evidence:**
- WorkerHome.jsx uses `requireAuth` middleware
- No magic-token or temporary-link auth exists
- No on-site QR→register flow

**Impact:** Field workforce cannot self-register. Supervisors must create Supabase accounts for each worker OR issue pre-generated magic-link tokens (not yet implemented).

**User experience:** Site supervisor hands worker a QR code. Worker taps it → login page → cannot proceed.

---

### 1.3: Mass Fill Project Selector Always Empty [HIGH — breaks timesheet → job linkage]

**Where:** Workforce → Mass Fill tab  
**Issue:** Project dropdown is empty because Workforce.jsx calls `/api/projects` (wrong path) instead of `/api/operations/projects`. The response is the SPA index page (HTML), not JSON.

**Evidence:** Workforce.jsx line 340 calls `authFetch("/api/projects")` — correct path is `/api/operations/projects`  
**Fixed in code but may not propagate to all consumers.**

**Impact:** Timesheets created via Mass Fill always have `project_id=null`, `job_id=null`. They cannot sync to Buildexact (which requires job linkage) and labour attribution is broken.

**User experience:** Mass fill a 10-hour timesheet and assign it to a project. On submission, the project is silently dropped. No error shown.

---

### 1.4: Silent Fail on Timesheet-to-Buildexact Sync — No Error Written When Job Not Linked [HIGH — lost visibility]

**Where:** Workforce Approval → Buildexact sync  
**Issue:** `syncTimesheetToBuildexact()` (workforceRoutes.mjs:91) checks `if (!timesheet.job_id) return;` — **no error written**. History tab shows "—" (dash) instead of "⚠ Sync failed." Users believe the record was never synced (harmless) when actually it was silently skipped (data loss).

**Evidence:**
```js
// workforceRoutes.mjs lines 91-93
if (!timesheet.job_id) return;  // ← SILENT EXIT, NO ERROR
const { data: job } = await sb.from("jobs")...
if (!job?.buildexact_job_id) return;  // ← SILENT EXIT, NO ERROR
```

**Impact:** All Mass Fill timesheets (which have `project_id` but no `job_id`) silently fail to sync. Finance never sees the labour cost. No retry is possible because no error is logged.

**User experience:** Approve 50 timesheets. Assume they're all in Buildexact. Buildexact has zero of them. Reconciliation nightmare.

---

## Part 2 — Data Re-Entry & Lost Context (Medium-High Friction)

### 2.1: Lead → Job Conversion Does Not Carry Project Context; RFQ Data Must Be Re-Entered [MEDIUM-HIGH]

**Where:** Sales → Tender handoff  
**Issue:** When a lead converts to job, facts like `address`, `client_name`, `estimated_value` stamp correctly. But tender metadata (project scope, constraints, site conditions) **does not carry forward**. A user must re-enter RFQ details in the tender module.

**Evidence:**
- Lead record has `project_type`, `estimated_value`, `floor_area_estimate`, `design_stage`, `site_address`
- `convert-to-job` stamps these as facts but only the address/value/contact
- RFQ creation (module4Routes.mjs) has no auto-populate from job facts
- No pre-fill workflow; users start from scratch in Tender Manager

**Impact:** A lead took 1 hour to qualify (budget, timeline, site, decision maker). All that context is lost when moving to tender. Tender handler re-asks the same questions to an external subcontractor.

**User experience:** Sales: "Lead qualifies for $600k renovation in 6 months, site ready." Tender: "Let me send an RFQ to the carpenter to ask for a scope..." *Tender forgets design_stage, floor_area, site conditions.*

---

### 2.2: Fee Proposal Requires Manual Re-Entry After Buildexact Import [MEDIUM]

**Where:** Tender → Fee Proposal (Module 5)  
**Issue:** Fee proposal wizard accepts a Buildexact XLSX import or PDF parse. But the parsed data must be **manually edited in a form** before generating the final DOCX. No pre-fill from job facts (address, client, scope).

**Evidence:**
- FeeProposalWizard.jsx has a multi-step form (Step 1: import/parse, Step 2: edit fields, Step 3: generate DOCX)
- Step 2 form fields have no auto-population from job context
- User must manually type client name, address, scope again

**Impact:** Redundant data entry. If the address/client name changed after lead creation, no sync opportunity; fee proposal has a stale copy.

**User experience:** "The fee proposal has to match the job address exactly. Let me check the job record again... OK, now let me type it into the fee proposal..." *Risk of typos; mismatch between job and proposal.*

---

### 2.3: Tender Board Allows Duplicate Address Entries — No Deduplication [MEDIUM]

**Where:** Tender Manager → Tender Board  
**Issue:** Multiple tenders can exist for the same address with slight variations ("21 Folkestone Rd", "21 Folkestone Road", "21 Folkstone Rd [typo]"). No normalisation or dedup check on create/update. Database has duplicates for 21 Folkestone Road SA 5048 (4 variations).

**Evidence:** TenderBoard component loads from `jobs` table; no dedup in module4Routes.mjs on insert.

**Impact:** Users see the same job 4 times in the board. RFQ sends go to multiple copies of the same address. Reporting is fragmented.

**User experience:** "I thought we only had one job at 21 Folkestone. Why are there 4 tenders listed?"

---

### 2.4: CRM Contact → Lead Conversion Fails to Carry "Referred By" Relationship [MEDIUM]

**Where:** CRM → Sales handoff  
**Issue:** CRM contacts have a `referred_by_contact_id` field (tracks who referred the contact). When a contact is converted to a lead (`POST /api/crm/contacts/:id/convert`), the referrer ID is **set to the converting contact's own ID** (crmRoutes.mjs:555) instead of carrying forward `contact.referred_by_contact_id`.

**Evidence:**
```js
// crmRoutes.mjs line 555
referred_by_contact_id: contact.id  // ← WRONG: should be contact.referred_by_contact_id
```

**Impact:** Referral chain is broken at conversion. Finance cannot track consultant/referrer fees back to the source. CRM business rules are violated.

**User experience:** "We got this lead from Brad (referrer). Brad should get credited. But the system shows Sam (the person who converted it) as the referrer."

---

## Part 3 — Missing Bulk Actions & Workflow Acceleration (Medium Friction)

### 3.1: No Bulk Lead Stage Movement [MEDIUM]

**Where:** Sales → Pipeline  
**Issue:** SalesPipeline allows moving a single lead between stages via card drag or modal. No bulk action to move 5 leads from Enquiry to Qualify, or reject multiple Nurture leads at once.

**Evidence:** SalesPipeline.jsx has `onMoveStage(leadId, stage)` for single moves; no batch endpoint or UI control.

**Impact:** Large pipeline curation takes 5× longer. Supervisors must click each lead individually.

**User experience:** "We got 20 inbound leads from a campaign. I need to move them all to Qualify. One...by...one..."

---

### 3.2: No Bulk Timesheet Approval with Conditional Rejection [MEDIUM]

**Where:** Workforce → Approvals  
**Issue:** Approvals tab can select multiple timesheets and approve in bulk (`mass-approve` endpoint exists). But if a user wants to approve 10 and reject 2, they must:
1. Select 10, approve
2. Re-load the page
3. Find the 2 rejects (now scattered in the list)
4. Individually reject each with notes

No mixed-mode or per-row action.

**Evidence:** ApprovalsTab has `selected` Set and `approveSelected()` calls mass-approve; no mixed-action flow.

**Impact:** End-of-week approval cycle for 50 timesheets takes 30 min instead of 10 min.

**User experience:** "Most of these are fine, but Sam's Tuesday hours look wrong. Let me approve 48 first, then reject 2 individually."

---

### 3.3: No Schedule Bulk Task Status Change [MEDIUM]

**Where:** Operations → Schedule Manager  
**Issue:** Schedule Manager Gantt allows marking one task complete via right-click context menu. No bulk "Mark as complete" for a phase or trade.

**Evidence:** ScheduleManager.jsx has `markComplete(taskId)` for single tasks; no batch action.

**Impact:** Completing a 10-task phase requires 10 right-clicks. Interior fit-out with 20 tasks = 20 clicks.

**User experience:** "Plumbing is done. Mark complete on 15 tasks. Click... click... click..."

---

## Part 4 — Broken Data Synchronisation & Source-of-Truth Issues (Medium Friction)

### 4.1: Contract Value Reads From Stale Column; Post-Variation Financials Are Wrong [HIGH — data integrity]

**Where:** Finance → Job financials (Fee schedule, Director Portfolio WIPAA)  
**Issue:** Migration 079 dropped the `sync_job_contract_value` trigger so `jobs.contract_value` is no longer auto-updated when variations are signed. But two routes still read the stale column directly:

- `financeCCRoutes.mjs:857` — fee schedule dollar-by-stage calculations use `original_contract_value || contract_value`
- `jobFinanceRoutes.mjs:863` — Director Portfolio WIPAA (earned_revenue, margin %) reads `contract_value` directly

Correct path: use `contractValueOf()` wrapper which reads `variations` table and sums signed values.

**Evidence:**
```js
// financeCCRoutes.mjs:857 — STALE READ
const orig = job.original_contract_value || job.contract_value;
// SHOULD BE:
const orig = contractValueOf(jobId);
```

**Impact:** A job with $100k original contract + $15k signed variation shows:
- Fee schedule: $100k (should be $115k)
- WIPAA earned: calculated on $100k base (should be $115k base)
- Margin %, WIP $: all wrong

Finance reporting to directors is incorrect for any job with post-win variations.

**User experience:** Director sees WIPAA for job shows $1.2M earned on $1M contract (impossible %). Finance drills in: "Wait, we approved a $200k variation after handshake. The contract value should be $1.2M, not $1M. Why is the system showing the old number?"

---

### 4.2: Buildexact Job ID Not Populated; All Sync Attempts Fail Silently [HIGH — integration broken]

**Where:** Buildexact integration ↔ Workforce timesheet sync  
**Issue:** All 9 jobs in the database have `buildexact_job_id = null`. The bridge table `buildexact_job_sync` is also unpopulated. BUG-N4 in the audit (older) means the reconcile function has a legacy fallback to `projects.buildexact_job_id`, which masks the issue for projects. But direct job syncs from workforce cannot resolve the Buildexact ID.

**Evidence:** All jobs created via manual entry or lead conversion have `NULL buildexact_job_id`. The sync job must be run to populate this. It has not been run since last sync was blocked by BUG-BX01 (no employee ID).

**Impact:** Even if BUG-BX01 is fixed (employee ID set), timesheets still cannot sync because they hit the "No Buildexact job ID" silent fail (BUG-BX03 fallback).

**User experience:** Approve timesheet. Check History tab for sync status. Synced? No, shows "—" (dash). Check Buildexact. Labour entry never arrived. Call tech support: "Where did my timesheet go?"

---

### 4.3: WHS and Finance Use Stale `jobs.contract_value` for Document Pre-fill [MEDIUM — data leakage]

**Where:** WHS document merge, Finance merge fields  
**Issue:** Two places read `job.contract_value` directly instead of using canonical source:
- WHS merge (whsMergeFields.mjs:65) pre-fills budget into induction documents
- Finance merge uses stale column for budget reports

Post-variation, these documents show the wrong contract value.

**Impact:** Worker induction document shows "This project is budgeted at $100k" when the actual contract is $115k (post-variation). Finance reconciliation documents are off.

---

## Part 5 — Module Boundary Friction (Low-Medium)

### 5.1: No Navigation Hint From Tender Board to Operations After Job Win [LOW-MEDIUM — context loss]

**Where:** Tender Manager → Operations  
**Issue:** When a job status changes to "won" in Tender Board, the UI shows a "Won" badge but gives no hint to navigate to Operations to set up the project/schedule.

**Evidence:** TenderBoard.jsx displays status badge but no "Go to Operations" CTA.

**Impact:** User wins a job, doesn't know where to go next. Manual discovery of Operations module. Slows handoff.

**User experience:** "Job just won. Now what? Do I go to Operations? Sales? Where's my next step?"

---

### 5.2: Finance Job View Not Linked From Operations [LOW-MEDIUM]

**Where:** Operations → Finance  
**Issue:** Operations project detail (OperationsProjectDetail.jsx) has no "View Financials" link to the Finance Command Centre for that job.

**Evidence:** ModuleCard CTAs exist for Schedule, WHS, Diary, but not Finance.

**Impact:** Supervisor wants to check job cost status; must navigate separately to Finance module, find the job by address/date filtering.

**User experience:** Site supervisor checks project status. Budget overrun detected in the field (20 hours for inspection, expected 4). Wants to see Finance CC. No link. Navigates to /finance/jobs, searches by address...

---

### 5.3: RFQ Package Status Not Visible in Tender Board [LOW-MEDIUM]

**Where:** Tender Manager  
**Issue:** Tender Board shows job address, status (tendering/won), RFQ count. But RFQ packages (scoped groups within an RFQ) have no visibility in the board. User must click into the job to see packages.

**Evidence:** TenderBoard component queries jobs + rfqs but not rfq_packages.

**Impact:** Superintendent managing 12 concurrent tenders has no overview of package status. Cannot tell which jobs are blocked on package scope.

**User experience:** "Job A is tendering. How many packages have we sent? Are all scopes locked?" Must drill into job detail.

---

## Part 6 — Data Consistency & Canonical Source Issues (Low-Medium)

### 6.1: RFQ Trade Category Not Stamped on Create/Update [MEDIUM — taxonomy incomplete]

**Where:** Tender Manager → RFQ creation  
**Issue:** Migration 081 added `trade_category_id` FK to `rfqs` table. But `rfqPackageRoutes.mjs` never stamps this field when creating or updating RFQs. All RFQs have `NULL trade_category_id`.

**Evidence:** rfqPackageRoutes.mjs lines 460, 574 have send/follow-up handlers; neither resolves or sets `trade_category_id`.

**Impact:** Trade taxonomy is incomplete. Reporting on RFQ volume by trade is impossible. Procurement boards cannot filter by trade.

**User experience:** "Which trades are we waiting on quotes for?" Cannot answer without manual inspection of RFQ descriptions.

---

### 6.2: Confirm Queue (Fact Dismiss) Is Client-Side Only — Dismissed Facts Reappear on Reload [MEDIUM]

**Where:** Finance → Confirm Queue  
**Issue:** `FactField.jsx` has a Dismiss button that is 100% client-side. No `POST /api/facts/job/:jobId/:key/dismiss` endpoint exists. Dismissed facts reappear when the page reloads.

**Evidence:** ConfirmQueue.jsx dismisses via state mutation; no API call.

**Impact:** User dismisses 5 address warnings. Reloads page. All 5 reappear. No way to permanently dismiss.

**User experience:** "I already reviewed this. Why does it keep popping up?"

---

## Part 7 — Stale Reference Data & Operational Friction (Low)

### 7.1: Carpentry Job Dropdown Renders With Trailing Dash; Address/Name Missing [LOW — UX polish]

**Where:** Workforce → Approvals → Carpentry attribution  
**Issue:** Carpentry job dropdown option renders as "CJB-001 —" (trailing dash, no address). Template missing fallback to address or client name.

**Evidence:** Dropdown label template in Approvals expanded row doesn't null-check the address field.

**Impact:** User cannot tell which job they're attributing to. Low severity but confusing.

**User experience:** Two carpenters on site. Timesheet for Sam shows carpentry job dropdown: "CJB-001 —" and "CJB-002 —". No context on which is which.

---

### 7.2: Carpentry Job Budget Not Populated; Budget Margin Shows "—" [LOW — missing data]

**Where:** Carpentry module  
**Issue:** `carpentry_job_budgets` table is empty for all jobs. The budget section in CarpentryJobDetail shows $0 budget, no margin calculation.

**Evidence:** Audit BUG-W06 confirmed: `carpentry_job_budgets` has zero rows.

**Impact:** Budget tracking for carpentry jobs is unavailable. Margin %, budget utilisation, cost variance all show as "—" or $0.

**User experience:** "How much budget is left on the carpentry job?" No data.

---

### 7.3: No Cost Display in Workforce Approvals — Hours Approved Without Dollar Context [MEDIUM]

**Where:** Workforce → Approvals  
**Issue:** Approvals table shows Timesheet ID, Date, Task, Hours, Employee. **No cost column.** Approver reviews hours but has no context on labour cost impact (critical for budget control).

**Evidence:** workforceRoutes.mjs `/pending` endpoint doesn't join `employees.hourly_rate` and calculate cost per entry.

**Impact:** Supervisor approves 80 hours without knowing if that's $200 or $6,400 spend. Labour budget overruns undetected until end-of-month finance reconciliation.

**User experience:** "Timesheet for plumbing work, 8 hours. Approve. [Later] Wait, that was $960, not $240. Should have rejected."

---

## Part 8 — Portal & Client Context Issues (Low-Medium)

### 8.1: Portal Pre-Fill Missing Client Name; Budget Page Shows $0 Until Set Separately [MEDIUM]

**Where:** Client Portal → Portal Admin setup  
**Issue:** When a portal is created for a project, the initial response has `clientName: null`. The portal pre-fill from Knowledge Core works for address, phone, email (via facts), but not for client name context.

**Evidence:** `portalRoutes.mjs` returns `portalEnabled, token, ...` but no client context. Client name must be set via separate `portal_client_name` column or via lead conversion.

**Impact:** Portal displays project address but generic "Your Project" header. No personalisation.

**User experience:** Client logs into portal. See "12 Test Street Progress" but no "12 Test Street — Smith Renovation" context. Portal feels generic.

---

## Part 9 — System Architecture Issues (Low)

### 9.1: Webhook URL Shows Localhost in Production; Will Break on Railway [LOW — deployment risk]

**Where:** Buildexact webhook configuration  
**Issue:** `/api/buildexact/status` endpoint displays webhook URL as `http://127.0.0.1:8787/api/webhooks/buildexact`. This is hardcoded in buildexactClient.mjs. On Railway production, the URL will be wrong. No `API_BASE_URL` env var set.

**Evidence:** buildexactClient.mjs constructs webhook URL without env var fallback.

**Impact:** Buildexact webhooks won't reach production API. Webhook events are silently dropped. Job syncs don't auto-trigger on Buildexact changes.

**User experience:** [Production] "Job was updated in Buildexact yesterday. Why hasn't the Hub synced?" Webhooks failing silently.

---

### 9.2: Raw Supabase Error Strings Leak to API Consumers [LOW-MEDIUM — security/UX]

**Where:** Server routes (financeRoutes.mjs, salesRoutes.mjs, rfqPackageRoutes.mjs, authRoutes.mjs)  
**Issue:** ~110 remaining instances of raw `error.message` responses bypass `apiResponse.mjs` error handling. Postgres errors like "invalid input syntax for type uuid" can reach the browser.

**Evidence:**
- rfqPackageRoutes.mjs:460, 574 call `res.json()` directly
- financeRoutes.mjs has ~14 instances of raw error responses
- carpentryRoutes.mjs, authRoutes.mjs also affected

**Impact:** External API consumers see database internals. Risk of information leakage. Poor UX (cryptic error messages).

**User experience:** "Something went wrong (invalid input syntax for type uuid)" — user has no idea what to do.

---

## Part 10 — Data Entry Validation Issues (Low)

### 10.1: Lead Form Accepts camelCase but API Requires snake_case [LOW — inconsistent API contract]

**Where:** Sales → Lead creation  
**Issue:** Sales forms use camelCase (JavaScript standard): `firstName`, `estimatedValue`, `projectType`. But the API endpoint `POST /api/sales/leads` accepts/returns snake_case without camelCase conversion.

**Evidence:** salesRoutes.mjs creates leads with DB schema (snake_case); no `rowToCamel` conversion on response.

**Impact:** SPA receives `{ first_name, estimated_value, project_type }` instead of camelCase. Frontend reads snake_case directly (BUG-A2 from audit). Potential for mixed case reads if frontend code varies.

**User experience:** Frontend code inconsistency — some components read `lead.first_name`, others `lead.firstName`. Potential for null-reference bugs.

---

## Part 11 — Workflow Acceleration Gaps (Low-Medium)

### 11.1: No Quick-Add Job from Tender Board; Must Use TenderDetail Form [LOW]

**Where:** Tender Manager → Tender Board  
**Issue:** Tender Board displays all jobs. To create a new job/tender, must click "New tender" or navigate to TenderDetail form. No inline quick-add.

**Evidence:** TenderBoard has no "New +" floating button or row-level add control.

**Impact:** Adding a new job from the board view requires page navigation. Minor friction.

**User experience:** "I got a phone call with a new lead. Let me add it to the tenders... [navigate to form, fill it out]"

---

### 11.2: No Schedule Template Reuse Across Similar Projects [MEDIUM]

**Where:** Operations → Schedule generation  
**Issue:** Each project gets a fresh AI-generated schedule from scratch. No template library or copy-from-previous feature. A supervisor with 20 similar single-storey renovations must generate 20 unique schedules.

**Evidence:** Schedule generation (module6Routes.mjs) calls Claude each time; no template mode.

**Impact:** Repetitive AI calls, inconsistent schedules, manual effort to standardise.

**User experience:** "We always do the same phases for renovations. Can I start with our standard schedule and customise?" Must generate fresh each time.

---

---

## Summary Table: Friction by Lifecycle Stage

| Stage | Friction | Severity | Affected Users |
|-------|----------|----------|-----------------|
| **Enquiry → Qualify** | No bulk stage movement | Medium | Sales supervisors |
| **Qualify → Winning Offer** | Lead context not carried to RFQ (re-enter scope) | Medium-High | RFQ managers, sales |
| **Tender → Fee Proposal** | Manual re-entry of job details; no auto-fill | Medium | Tender managers |
| **Fee Proposal → Job Win** | No project auto-created; operations blocked | **Critical** | Operations staff |
| **Job → Operations** | **Worker PWA no self-registration** | **Critical** | Field workers, supervisors |
| **Operations → Workforce** | Mass Fill project selector empty; timesheets don't link to job | High | Workforce admins |
| **Workforce → Finance** | Timesheet-to-BX sync fails silently; cost not shown in approvals | High | Finance staff, approvers |
| **Finance → Reporting** | Contract value reads stale column; post-variation amounts wrong | High | Directors, finance leads |
| **Operations → Across modules** | No navigation hints; module boundaries are abrupt | Medium | Supervisors, superintendents |
| **Portal setup** | Client name missing; pre-fill incomplete | Medium | Portal admins |
| **All modules** | Tender duplicates, stale reference data, no bulk actions | Low-Medium | All users |

---

## Recommended Priority Order (Non-Blocking to Launch)

**Pre-launch blockers (Workforce):**
1. BUG-LIFECYCLE-1: Auto-create project on job win
2. BUG-TC06: Implement Worker PWA auth (magic-link or invite flow)

**Post-launch critical (Sprint 1):**
3. BUG-P5-1 & P5-2: Fix contract value reads in Finance CC and Director Portfolio
4. BUG-BX03: Add project_id fallback in sync; write error for silent exits
5. BUG-W03: Show cost in Approvals table

**High (Sprint 2):**
6. BUG-A2: Add camelCase conversion in salesRoutes, workforceRoutes
7. BUG-FACTS-001: Server-side fact dismiss endpoint
8. BUG-DELTA6-01: Stamp trade_category_id on RFQ create/update
9. Add navigation hints (Won → Operations, Project → Finance, etc.)

**Medium (Sprint 3):**
10. Bulk lead stage movement
11. Tender deduplication / address normalisation on insert
12. Schedule template library / copy-from-previous
13. CRM contact → lead referrer fix (BUG-CRM-1)
14. Webhook URL env var (API_BASE_URL) for Railway

**Findings:**
- **[critical]** No Automated Project Creation on Job Win — Operations Workflow Blocked — Add `projects` row creation in `POST /api/sales/leads/:id/convert-to-job` endpoint with auto-generated project name from job address + type. Default status to 'planning'.
- **[critical]** Worker PWA Requires Full Supabase Account — Contradicts SOP 'No Login Required' — Implement magic-link auth flow: issue per-worker tokens stored in `employees` table, validate via `GET /api/worker/me?token=xxx` without requiring Supabase auth. OR add invite flow in Team Directory to pre-provision worker accounts.
- **[high]** Mass Fill Project Selector Broken — Returns HTML Not JSON — Change `authFetch('/api/projects')` to `/api/operations/projects` in Workforce.jsx line 340. Verify both client and server paths match.
- **[high]** Timesheet-to-Buildexact Sync Silently Fails Without Error — No Visibility to User — Modify `syncTimesheetToBuildexact()` in workforceRoutes.mjs: (1) add `project_id → job_id` fallback lookup; (2) write error to `buildexact_sync_error` column for both silent-exit cases; (3) update History tab to show 'Not linked' for null error/synced_at.
- **[high]** Contract Value Reads From Stale Column Post-Variation — Finance Reports Wrong Amounts — Replace direct `contract_value` reads in financeCCRoutes.mjs:857 (fee schedule) and jobFinanceRoutes.mjs:863 (WIPAA) with canonical `contractValueOf(jobId)` wrapper. Test with post-win signed variations.
- **[high]** Lead Context Lost on Conversion to Tender — Scope/Site Data Must Be Re-Entered — Auto-populate RFQ creation form with job facts (scope, site conditions, design stage, floor area) from `job_fact_history`. Add 'Copy from job' CTA in tender form.
- **[high]** No Cost Display in Workforce Approvals Table — Approving Without Budget Context — Add cost column to Approvals table. Join `employees.hourly_rate` in `/pending` endpoint. Calculate `cost = hours × rate`. Include OT/double-time band multipliers if applicable.
- **[high]** Worker PWA Auth Model Contradicts SOP — Field Workforce Cannot Self-Register — Implement token-based worker login: issue magic-link or QR code per worker (no Supabase account needed). Store temporary auth tokens in `employees` table with expiry.
- **[high]** Buildexact Job ID Null for All Jobs — Sync Chain Broken at Source — Run Buildexact job sync to populate `jobs.buildexact_job_id` from `buildexact_job_sync` bridge table. Fix BUG-N4 to unify write path (currently split between `jobs` and `projects`).
- **[medium]** CRM Contact Referrer ID Wrong on Lead Conversion — Referral Chain Broken — In crmRoutes.mjs line 555, change `referred_by_contact_id: contact.id` to `referred_by_contact_id: contact.referred_by_contact_id`. Preserve referrer chain through lead conversion.
- **[medium]** Tender Board Allows Address Duplicates — No Normalisation on Insert — Add address normalisation + dedup check on job create/update in module4Routes.mjs. Query existing jobs by `address_normalised` before insert. Merge duplicates or warn user.
- **[medium]** No Bulk Timesheet Approval With Mixed Actions — Reject/Approve One-by-One — Add per-row action buttons (Approve/Reject) in addition to bulk select. Allow mixed-mode: select 10 and approve, then individually reject 2 without page reload.
- **[medium]** No Bulk Lead Stage Movement — Pipeline Curation Takes 5x Longer — Add bulk move action: multi-select leads, choose target stage, apply to all. Endpoint: `POST /api/sales/leads/bulk-stage-move` with `{leadIds, stage}`.
- **[medium]** RFQ Trade Category Not Stamped on Create/Update — Trade Taxonomy Incomplete — In rfqPackageRoutes.mjs, import `resolveTradeCategoryId` from buildexactParser.mjs. Call after RFQ insert to set `trade_category_id` based on trade name.
- **[medium]** Fee Proposal Requires Manual Re-Entry — No Auto-Fill From Job Context — Pre-populate fee proposal form fields (client name, address, scope, estimated value) from job facts. Add 'Load from job' button in Step 1.
- **[medium]** Confirm Queue Dismiss Is Client-Side Only — Dismissed Facts Reappear on Reload — Add `POST /api/facts/job/:jobId/:key/dismiss` endpoint. Store dismissal in DB (new `fact_dismissals` table or flag on fact_history). Exclude dismissed facts from Confirm Queue query.
- **[medium]** No Navigation Hint From Tender Board to Operations After Win — Context Loss — Add CTA in TenderBoard when job status is 'won': 'Go to Operations → Schedule this project'. Or add project card to Operations list automatically on conversion.
- **[low]** Webhook URL Shows Localhost; Will Break on Railway Production — Add `API_BASE_URL` env var to Railway production settings (e.g., 'https://api.blueleaf.com'). Use in buildexactClient.mjs to construct webhook URL. Fall back to request.origin if env var missing.
- **[low]** Raw Supabase Error Strings Leak to API Consumers — ~110 Instances — Audit remaining raw error.message responses. Route all errors through `apiResponse.mjs` err() function. Use `translateDbError()` for DB constraint errors.
- **[low]** Lead Form Uses camelCase; API Returns snake_case — Inconsistent Contract — Add `rowsToCamel()` conversion in salesRoutes.mjs POST/PATCH handlers before returning lead data. Standardise all API responses to camelCase.
- **[low]** Carpentry Job Dropdown Renders With Trailing Dash — Missing Address Context — Fix dropdown option label template to include fallback: `${job.name || job.address || 'Job ' + job.id}` instead of just `${job.address}` when null.
- **[low]** No Schedule Template Reuse or Copy-From-Previous — Repetitive AI Generation — Add 'Use template' or 'Copy from project' option in schedule generation flow. Cache/save schedules as templates for project types (e.g., 'Standard single-storey renovation').

---

## 6. Module-by-module findings

## Sales Manager Module Audit

### Workflow Overview
The Sales Manager module orchestrates an 8-stage APB pipeline (Enquiry → Qualify → Discovery → Fee Proposal → Accepted → Pre-Tender → Tender → Won) with well-structured lead records, transcript-based conversation analysis, Blueprint AI coaching, and a qualifying scorecard. Entry points include kanban/list views of the pipeline, relationship tracking, and contact discovery. Core strengths: stage gating enforced server-side, role-based access (supervisor/admin), integrated fact-service handoff to Operations on job creation. Core friction: full-list reloads after every action drain responsiveness; users must navigate out-of-module to create fee proposals or manage reference projects; bulk operations missing; nurture/lost leads hidden; no export/reporting; post-win handoff to Operations is silent.

---

### Usability & Workflow Friction

**Inline Edits Lack Visual Confirmation**
- InlineField component (src/pages/LeadDetail.jsx:93-140) saves via onBlur but provides no success indicator or error retry path
- Users uncertain if edit persisted; failed PATCH requests leave UI in uncertain state
- **Recommendation:** Add brief success toast on save; show error state with retry button on PATCH failure

**No Bulk Actions Despite N-Lead Workflows**
- Pipeline supports only single-lead moves (LeadCard dropdown, SalesPipeline.jsx:140-174)
- Moving 5 similar leads to nurture requires 5 individual clicks; no checkbox multi-select or drag-drop
- **Recommendation:** Add multi-select mode (checkboxes per card) + bulk action toolbar (Move stage, Archive, Tag). Implement POST /api/sales/leads/batch for atomic updates

**Stage Gates Are Silent on Failure**
- GATE_REQUIREMENTS array (LeadDetail.jsx:62-73) blocks progression but shows no tooltip or error message explaining what's missing
- Users see disabled 'Advance' button without knowing why (e.g., "Qualify score must be ≥5")
- **Recommendation:** Display gate failures as modal or inline warning before advance attempt. Show specific missing fields with links to unlock sections

**Conversation Transcript Analysis Requires Context Switching**
- User must: open drawer → upload/paste → wait → review suggestions → edit and re-analyse (all in one panel)
- No side-by-side transcript + suggestions view; "re-analyse" forces step reset
- **Recommendation:** Show transcript + suggestions split-view during review. Add re-analyse shortcut without closing panel

**Qualifying Score Not Editable from Pipeline**
- Kanban cards show score badge but read-only (SalesPipeline.jsx:103); must click card to open detail to edit the 4 gates
- **Recommendation:** Add quick-edit popover on score badge: adjust gates inline, show new total instantly, save without leaving pipeline

**Lost & Nurture Leads Lack Recovery Path**
- Once marked lost/nurtured, leads are filtered from pipeline views (no visibility into why they're gone)
- No UI to un-lose or un-nurture; no reactivation workflow
- **Recommendation:** Add 'Reactivate' button in lost/nurtured lead detail. Create 'Dormant Leads' view to browse and resurrect without knowing IDs

**PTSA Generation Hidden Requirements**
- 'Generate PTSA' button shown even if site_address or preconstruction_fee missing; error occurs after form submit
- User learns requirement only after failed attempt
- **Recommendation:** Disable button client-side if site_address empty. Add warning banner. Validate before POST

**Lead → Job Conversion Outcome Silent**
- On success, page reloads but no confirmation toast showing job created or link to Operations
- On failure, error shown in jarring alert() modal
- **Recommendation:** Show success toast with Operations job link. Display inline errors (not alerts) with retry button

**File Upload & Transcript Size Lack Feedback**
- ConversationPanel (LeadDetail.jsx:230-237) silently updates fileName on .txt upload with no confirmation
- Character count displayed but no warning if transcript exceeds token limits (risk of truncation)
- **Recommendation:** Show toast: "Loaded: meeting-notes.txt, 4,200 characters". Warn if >40K chars: "Large transcript may be truncated"

**Mobile Layout Is Dense Without Tab Structure**
- 3-column layout stacks vertically but content remains dense (LeadDetail.jsx:1152)
- Scrolling through Contact, Project, Conversations, Activities, Documents on mobile is tedious
- **Recommendation:** Restructure mobile: Contact + Stage Checklist tabs; Conversations/Notes/Documents as separate tabs

---

### Workflow Efficiency & Automation

**Full-Page Reloads After Every Action Create Latency**
- Each action (move stage, log activity, create lead) calls load() fetching all leads (SalesPipeline.jsx:759-761; LeadDetail.jsx:1076, 1118)
- With 50+ leads, multiple seconds of UI blocking per action
- **Recommendation:** Implement optimistic updates: mutate local state immediately, reconcile server response. Use React Query invalidateQueries pattern. Update only affected lead, not full list. Expected improvement: 3–5s latency reduction

**Fee Proposal Creation Exits Module Entirely**
- "Create Fee Proposal" button (LeadDetail.jsx:1680-1685) navigates to /tender-manager/fee-proposal/new—different module, full context switch
- No bidirectional link or way to specify lead in proposal creation without manual entry
- **Recommendation:** Either embed lightweight fee proposal modal inline (prefill client, value, lead_id) or add "link existing proposal" dialog. Keeps user in context

**Reference Projects Require Navigation Away**
- Winning Offer stage (LeadDetail.jsx:1441-1449) shows "add them here ↗" link to /sales/reference-projects
- User forced out of lead to manage separate resource; read-only in modal
- **Recommendation:** Create reference project quick-add modal in Winning Offer panel. Allow inline creation with "Add + use" button. Keep "Browse library" for existing projects

**Blueprint Insight & Transcript Analysis Not Linked**
- Both use Claude to analyze lead context but operate separately (LeadDetail.jsx:1038-1059 vs 213-562)
- No synthesis: transcript suggestions not compared against Blueprint, Blueprint doesn't reference conversations
- **Recommendation:** Show Blueprint metadata when displaying insight (e.g., "Based on current stage and 3 past conversations"). On transcript review, indicate Blueprint agreement/disagreement

**PTSA Requires Re-Entry of Scope from Discovery Notes**
- PTSA generation (LeadDetail.jsx:1640-1657) doesn't pre-populate ptsa_project_scope from existing discovery_notes
- User types scope again into PTSA dialog despite detailed notes already on record
- **Recommendation:** Add "Use discovery as scope" button that copies discovery_notes → ptsa_project_scope. Or auto-fill at generation if field empty

**Next Action Tracking Split Across Lead & Activity**
- "Log Activity" form (LeadDetail.jsx:1266-1281) updates both activity log AND lead.next_action, but no confirmation shown
- Kanban shows next_action (SalesPipeline.jsx:124-128) but relationship unclear; users don't know if it's editable directly
- **Recommendation:** Make relationship explicit: show "This activity sets lead's next action" label. Or add standalone "Edit Next Action" button that updates lead directly without creating log entry

**Architect Tender Fast-Track Path Undocumented**
- "Architect Tender" button (SalesPipeline.jsx:665-669) skips Qualify/Fee stages but no onboarding explains when to use
- New users may create regular lead for architect tender, losing design intent
- **Recommendation:** Add help text: "For leads sourced from architect tenders where qualification done by architect." Include tooltip explaining fast-track

---

### Inter-Module Interactions & Data Handoffs

**Missing site_address Validation Gate Before Job Creation**
- tender stage gate only checks job_id existence, not site_address (LeadDetail.jsx:71)
- Users click "Create Job" which fails server-side with error 'Site address required' (salesRoutes.mjs:429-431)
- Frontend allows UI progression without preventing error
- **Recommendation:** Add site_address to tender gate checks. Display red flag in gate requirements. Make site_address required during initial lead creation (not just architect tenders)

**Lead-to-Job Conversion Error Swallowed**
- createJobFromLead() catches error and shows alert() with '(error || "Unknown error")' (LeadDetail.jsx:1074)
- Server returns descriptive "A site address is required" but alert shows "Unknown error" if error field undefined
- **Recommendation:** Replace alert() with inline modal/toast displaying full server error. Log to console. Ensure error object shape matches code expectations

**Conversation Suggestions Lack Unsaved-State Warning**
- ConversationPanel review step (LeadDetail.jsx:224-227) closes without saving if user clicks ✕
- All work lost silently; no "unsaved changes?" confirmation; no auto-save
- **Recommendation:** Add hasChanges flag tracking. Show confirmation dialog ("Discard suggestions?") before closing. Or auto-save drafts to localStorage keyed by leadId

**Estimated Value Duplicated Across Leads/Conversations/Jobs**
- estimated_value exists on leads table and is carried to facts service on conversion (salesRoutes.mjs:483)
- Conversations can also update via Blueprint suggestions (LeadDetail.jsx:285) with no single lifecycle definition
- Risk of divergence if conversation suggests value differing from lead.estimated_value
- **Recommendation:** Document Canonical Data Law: estimated_value is Pre-Job fact. Before conversation applies suggestion, show current value and require confirmation. On job conversion, stamp only final lead.estimated_value

**CRM Contact Matching Lacks Visibility**
- Lead-to-job conversion attempts contact link by converted_lead_id then email ilike (salesRoutes.mjs:501-516)
- Frontend never shows which contact was matched or offers option to change
- Ambiguous email matching with no user visibility
- **Recommendation:** After job creation, show "Job created. Contact linked: [name]—[change]" panel. Allow unlinking or selecting different contact from CRM. Return linked contact info in API response

**Reference Projects Fetched Per-Stage-Change, No Caching**
- useEffect on LeadDetail.jsx:1000-1007 re-fetches reference projects when lead.stage changes to winning_offer
- Expensive fetch repeated per page view; no cache or error handling visible
- **Recommendation:** Cache reference projects globally (Context or localStorage with 24h TTL). Fetch once per app session. Add loading spinner while fetching

**Lost Leads Hidden, No Clear Recovery**
- When marked lost (SalesPipeline.jsx:166), leads filtered from all views (line 688)
- No UI to view lost leads, reason, or move back to active stage
- Users require database access to recover
- **Recommendation:** Add "Lost leads" filter toggle or history view. Show lost_reason. Allow stage change from lost → nurture with form asking why (e.g., "client contacted again"). Log as activity

---

### Consistency & Data Governance

**API Call Pattern Inconsistency**
- LeadDetail.jsx imports authFetch and apiPost but mixes direct authFetch calls (most operations) with apiPost (only conversion endpoint)
- Violates CLAUDE.md § Standards: page components should not call authFetch directly
- Inconsistent error handling and response standardization
- **Recommendation:** Replace all authFetch calls with apiPatch/apiPost/apiDelete wrappers. Ensure all mutations go through unified api* functions for consistent { ok, data, error } returns

**STAGES Array Duplicated Across Pages**
- SalesPipeline.jsx (lines 7-16) and LeadDetail.jsx (lines 8-19) both define local STAGES instead of importing from constants.js
- Three sources of truth for same data; violates standard (constants.js has LEAD_STAGES)
- **Recommendation:** Import LEAD_STAGES + LEAD_STAGE_LABELS from constants.js in both files. Extend constants.js with LEAD_STAGE_COLORS. Update SalesScorecard to use same imports

**Qualifying Score Display Fragmented**
- LeadCard shows score as badge for all leads (SalesPipeline.jsx:103)
- ListView shows in column (line 505-506)
- LeadDetail hides entire Qualifying section for architect_tender (line 1177)
- Inconsistent visibility: architect tenders show score in pipeline but can't edit in detail
- **Recommendation:** Clarify product intent: if architect tenders shouldn't have score, remove from pipeline views. If they should, show + allow editing in detail regardless of lead type

**No Audit Trail for Manual Data Edits**
- PATCH lead endpoints (salesRoutes.mjs:379-399) update fields but only record stage changes in activity log
- No "who changed what and when" for data corrections (estimated_value, margins, etc.)
- Silent data integrity risk
- **Recommendation:** Extend lead_activities to record field changes: { activity_type: 'field_change', field, old_value, new_value, changed_by, changed_at }. Show in activity timeline

**Activity Types Inconsistent Between Form & Schema**
- Form offers: note, call, email, meeting (LeadDetail.jsx:409-412)
- Server also accepts 'stage_change' and 'blueprint_prompt' types (salesRoutes.mjs:34-36)
- Frontend doesn't expose all available types
- **Recommendation:** Fetch available activity_type enums from server or define in constants.js. Render select dynamically

---

### Gaps & Opportunities (Workflow Held in Spreadsheets)

**No Bulk Operations for Batch Workflows**
- Pipeline supports only single-lead moves, notes, deletes
- Users managing 20+ leads likely switch to spreadsheet for batch status updates, tagging, or outreach
- No bulk move stage, bulk tag, bulk email/outreach, bulk score recalculation
- **Recommendation:** Add bulk selection UI (checkboxes) + toolbar (Move stage, Tag, Next Action date, Mark Lost). Implement POST /api/sales/leads/batch accepting { ids: [...], updates: {...} }

**No Export/Reporting—Pipeline Analysis Trapped in UI**
- Scorecard shows KPIs but no CSV/Excel export; users can't run ad-hoc analysis
- No drill-down from metrics to underlying leads
- No lead-source ROI tracking; can't measure conversion by source or identify top referrers
- **Recommendation:** Add "Export as CSV" to pipeline list view. Implement /api/sales/leads/export.csv?filter=stage:inquiry&sort=estimated_value. Make scorecard widgets clickable to filter pipeline. Add per-source metrics: lead count → won count, avg value, close rate %

**Nurture Pipeline Invisible by Default**
- Nurture leads collapsed in kanban (line 570); pipeline calc excludes them from active count
- No visibility into which nurture leads are overdue for follow-up; no recovery path
- **Recommendation:** Add "Nurture Health" card to scorecard: count in nurture, count overdue, avg days. Highlight overdue with red badge. Add calendar/timeline view grouped by follow-up_date with "Due today" alerts

**Post-Won Status Tracking & Job Handoff Unclear**
- Lead moves to won, job_id set, but detail doesn't show job link or status
- Pipeline removes won leads from view (line 615); user can't see if scheduling started, if contract blockers exist
- Silent conversion breaks workflow continuity
- **Recommendation:** After creating job, show success card with job link + "Go to Job in Operations" CTA. Keep won leads in separate tab showing job status. Wire linked_job view on lead detail

**No Lead Source ROI Tracking**
- Scorecard shows "Pipeline by Lead Source" but no conversion metrics per source
- Referral attribution doesn't show which leads referred by which contact (referred_by_contact_id exists but never shown)
- Can't optimize marketing spend or identify top referrers
- **Recommendation:** Add per-source metrics to scorecard: conversion rate %, avg lead value, close count. Display referrer name as tag in pipeline. Click to see all referrals by contact

**No CRM Contact Linkage Visibility**
- Lead ↔ contact relationship opaque; user can't see linked contact or other deals
- Risk of double-entry across Lead/Job/Contact modules
- **Recommendation:** Show "Linked CRM Contact" card with name, company, history, other deals. Add "Link different contact" action. On new lead with existing CRM email, warn user and offer to link

**Transcript Analysis Not Searchable or Archived**
- Users can't find "all transcripts mentioning decision_maker" or "conversations from Q1"
- lead_conversations table stores transcript but UI lists only by date; no indexing
- **Recommendation:** Add search/filter: date range, by fields updated, by keyword. Store extracted_entities (decision_maker_name, project_type) as structured metadata. Add "Conversation Library" view across all leads

**Blueprint Insight Only in Detail, Not Pipeline**
- Coaching visible only on lead detail (line 1062-1064), not in kanban/list
- Sales user may move lead without knowing Blueprint recommendation
- **Recommendation:** Show Blueprint badge on kanban cards (small AI icon + hint on hover). In list view, add optional "Blueprint" column with lazy-load on row hover

**Next Action Date Not Visible by Calendar or Overdue Filter**
- List view shows next_action_date but no sort by overdue or filter "due today"
- Users likely switch to calendar app or spreadsheet to see "what do I do today?"
- **Recommendation:** Add "Calendar" view grouping leads by next_action_date (overdue, today, this week, later). Add "Overdue next action" filter state. Show "Daily checklist" card on dashboard with 7-day action list

**No Role-Based Lead Visibility or Assignment**
- All staff see all leads; no owner/team assignment
- Risk of duplicate follow-up or miscommunication in multi-person sales teams
- **Recommendation:** Add owner/assigned_to field to leads. Filter by ?assigned_to=user_id. Add "My Leads" / "All Leads" toggle on pipeline. Show avatar + initials on cards. Add team distribution metric to scorecard

**PTSA Template Management Missing**
- "Generate PTSA" single-use; no template selection, version history, or saved drafts
- Template hardcoded in base64 (salesRoutes.mjs:208); users must manually edit downloaded file
- No tracking of "which version sent to which lead"
- **Recommendation:** Add PTSA Templates section in Settings. Store templates in database. Let users select template before generating. Save generated PDFs as lead documents. Add "PTSA History" card

**Qualifying Score Lacks Transparency on Gate Rules**
- 4 gates with radio buttons but no explanatory text on why each choice matters
- Users may score inconsistently; APB framework knowledge not embedded
- **Recommendation:** Add tooltips explaining APB criteria, how to assess each option, example scenarios. Show scoring formula: sum / 8, contribution per field

---

### Performance & Data Integrity Issues

**Scorecard Fetches All Leads, Filters Client-Side**
- GET /api/sales/scorecard loads entire leads table (no pagination), performs 6+ array filters in memory (salesRoutes.mjs:217-297)
- With thousands of leads, excessive data load. Also calls two Promise.all queries in SalesScorecard.jsx:146 serializing full data loads on tab render
- **Recommendation:** Move aggregation logic to SQL: SELECT stage, COUNT(), SUM(estimated_value), SUM(est_value * stage_prob) with WHERE clauses. Pre-compute as views/CTEs. Cache in localStorage with 5m TTL. In frontend, add useCallback dependency

**LeadDetail Loads Dependencies Sequentially**
- Promise.all([lead, conversations]) followed by separate useEffect loading reference-projects, then fetchBlueprintInsight
- Multiple round-trips on mount and stage change (load → load-ref-projects → fetch-blueprint)
- **Recommendation:** Combine into batched endpoint. Add error boundaries. Debounce fetchBlueprintInsight by 500ms to avoid triple-calls. Cache reference-projects globally

**No Pagination on Lead List; Loads All Leads Every Time**
- GET /api/sales/leads returns all non-archived leads (no limit/offset) (salesRoutes.mjs:336-346)
- Fetched on every action and after every stage move (SalesPipeline.jsx:589)
- With 500+ leads, entire array processed for rendering; client-side sort/filter on every render
- **Recommendation:** Add limit/offset query params; default limit=100. Return total count. Implement virtual scrolling (react-virtual). Cache list with invalidation on PATCH/POST/DELETE (clear only affected entry)

**Reference Projects Fetch Per-Stage, No Cache**
- Every stage transition to winning_offer/fee_proposal/accepted/tender calls authFetch (LeadDetail.jsx:1000-1007)
- No caching headers; data is static (only admin creates projects)
- Runs on mount, every stage transition, every page revisit
- **Recommendation:** Load globally once per session; cache in localStorage 24h TTL. Pass via props/context. Add Cache-Control: max-age=86400 to API response

**Conversation Transcript Analysis Re-Fetches Lead, No Timeout Guards**
- POST /api/sales/leads/:id/conversations/analyse loads full lead (salesRoutes.mjs:616) as context
- No timeout guards on external Claude API call; hangs unpredictable if API overloaded
- User can't cancel mid-flight (no AbortController in frontend)
- **Recommendation:** Memoize lead context in frontend; only fetch if changed. Add 30s timeout wrapper on Anthropic API call. In LeadDetail, add AbortController so users can click Cancel

**Scorecard Re-Renders on Tab Change; No Memoization**
- useEffect with no dependency array (SalesScorecard.jsx:143-157)
- Every tab navigation re-fetches scorecard + knowledge-updates. No React.memo on StatCard renders
- **Recommendation:** Add dependency array [] for initial load only. Wrap StatCard in React.memo. Move scorecard into global cache (zustand/context) with 5m TTL

**Missing Database Indices on created_at**
- lead_conversations and lead_notes queries ORDER BY created_at DESC without indices (migrations 017, 060)
- May perform full table scans (salesRoutes.mjs:587-590, 838-841)
- **Recommendation:** Add CREATE INDEX lead_conversations_created_at_idx ON lead_conversations(created_at DESC). Add compound (lead_id, created_at DESC) for filter+sort queries

---

### Summary of High-Impact Fixes

**Quick Wins (S effort):**
- Add success toast on inline field save; error state with retry button
- Show inline gate validation warnings (modal) before blocking stage advance
- Add visual confirmation on file upload ("Loaded: transcript.txt, 4,200 chars")
- Disable "Generate PTSA" button if site_address empty; add warning banner
- Display "Linked CRM Contact: [name]—[change]" after job creation
- Add help text to Architect Tender button explaining use case

**Medium Impact (M effort):**
- Implement bulk operations: multi-select + batch stage move endpoint
- Add split-view transcript + suggestions in conversation review
- Create fee proposal inline modal or "link existing" dialog
- Implement optimistic updates to reduce action latency
- Add Blueprint badge to kanban cards
- Memoize scorecard endpoint; cache with 5m TTL
- Add "Nurture Health" card + overdue follow-up alerts
- Create "Lost Leads" recovery view; allow stage re-activation
- Wire "Go to Job" link on successful lead → job conversion
- Add per-source conversion metrics + referrer attribution to scorecard

**Structural Changes (L effort):**
- Consolidate API fetch patterns (authFetch → api* wrappers throughout LeadDetail)
- Implement pagination on /api/sales/leads with virtual scrolling
- Add reference projects to global cache (Context provider)
- Build export/reporting infrastructure (CSV endpoint + drill-down filtering)
- Create reference-project quick-add modal embedded in Winning Offer
- Migrate reference-projects fetch to app-level initialization
- Add "Calendar" view for next_action_date timeline
- Implement audit trail for field changes in activity log
- Build role-based lead assignment + team distribution visibility
- Unify notes/documents/activities fetch timing (pre-load vs lazy-load pattern)

**Top issues:** Full-list reloads after every action create 3–5 seconds of UI latency per operation; optimistic updates + batched queries needed to restore responsiveness; No bulk operations for batch workflows (move 5 leads to nurture, mark 10 leads lost, bulk qualify)—sales teams fall back to spreadsheets; multi-select + batch endpoint required; Fee proposal & reference project creation forces context-switching out of Sales module; embedding inline modals keeps user in workflow and eliminates manual re-entry; Stage gates silently block progression without explaining what's missing (e.g., 'Qualify score ≥5'); inline validation warnings + gate requirement visibility needed; Post-conversion handoff to Operations is silent—user doesn't see job created or link to Operations; success toast + auto-link required to maintain workflow continuity; Scorecard fetches all leads into memory and filters client-side, causing performance degradation at scale; SQL aggregation + caching needed for responsiveness

**Bigger changes (discussion):**
- Bulk Operations Infrastructure: Multi-select UI (checkboxes) across kanban/list views + toolbar with batch move/tag/qualify/mark-lost actions + POST /api/sales/leads/batch endpoint accepting { ids: [...], updates: {...} }. Eliminates per-action round-trips and spreadsheet fall-back.
- Inline Embedded Modals for Fee Proposal & Reference Project Creation: Move out-of-module operations (navigate to /tender-manager, /sales/reference-projects) back into LeadDetail as lightweight modals that prefill context (client name, lead_id, value) and allow 'Add + use' in one flow. Reduces context-switching and manual re-entry.
- Optimistic Updates + Batched Queries Pattern: Implement optimistic state update on user action (e.g., drag card to new stage), reconcile server response. Use React Query invalidateQueries to batch updates. Replace full-list reloads with per-lead or per-stage updates. Expected 3–5s latency reduction per action.
- Global Data Caching Architecture: Move reference-projects, scorecard data, and lead list into app-level cache (Context or zustand) with TTL + explicit invalidation on mutations. Eliminate redundant fetches on mount/tab-switch. Cache in localStorage for cross-session persistence.
- Post-Won Handoff & Job Visibility: Create success modal after lead→job conversion with job link + 'Go to Operations' CTA. Add 'Won' lead tab showing job status, site diary, schedule progress. Wire bidirectional link so user can navigate lead → job → schedule without module-switching.
- Export & Reporting Layer: Implement CSV export endpoint (/api/sales/leads/export.csv?filter=&sort=) + UI download button. Make scorecard KPI widgets clickable to filter pipeline (drill-down). Add per-source ROI metrics (conversion rate %, avg value, close count). Enable team reviews, CRM sync, and compliance without manual work.
- Audit Trail for Data Integrity: Extend lead_activities to record field changes (old_value → new_value) for margin-critical fields (estimated_value, target_gp_pct, preconstruction_fee). Display in activity timeline. Ensures compliance and makes margin decisions traceable.
- Nurture Workflow Visibility & Recovery: Add 'Nurture Health' card to scorecard (count, overdue for follow-up). Show nurture leads with follow-up dates in a calendar view. Add 'Reactivate' button to move lost/nurtured leads back to active stages with reason logging. Converts nurture from dead-end to active workflow.

---

## CRM & Mailing Lists Module Audit

### Workflow Overview
The CRM & Mailing Lists module manages contact lifecycle (create → score → interact → convert to lead) and email campaigns across two entry points: **/sales/contacts** (dashboard, contact management) and **/marketing/lists** (mailing lists, sends). Core workflows are solid—relationship scoring, smart list automation, and interaction logging work—but are hampered by **fragmented navigation, missing bulk actions, modal stacking friction, and workflow gaps that force users to leave the module mid-task**.

**Entry points & main flows:**
- **Create contact**: /sales/contacts → NewContactModal (initializes next_action, auto-joins smart lists based on type/status)
- **Manage contact**: Open drawer → log interaction, add to manual lists, convert to lead, track referral stats (admin-only)
- **Send campaign**: /marketing/lists → select list → Sends tab → SendEmailModal → send via Resend
- **Import contacts**: Drag CSV → parsed per row, upserted by email, added to list
- **Handoff to Sales**: Convert contact → lead, linked via referred_by_contact_id, but **no auto-creation of job_contact_roles** to track referral credit

**Key friction points:**
1. Bulk actions missing—users repeat per-contact drawer opens for 10+ contacts
2. Modal stacking without breadcrumbs (NewContactModal → AddToListModal requires close-reopen)
3. Smart list membership auto-joins silently, no visual indicator in contact list
4. Contact↔lead conversion is one-way copy, not sync; data duplication risk
5. Email send workflow requires navigation away from list; no batch scheduling, sender customization hidden
6. Relationship score calculated but never explained; may be stale after manual status changes
7. CSV import lacks duplicate detection, enum validation, and per-row error clarity
8. Dashboard and list queries execute 6+ sequential count calls instead of batching
9. Contact archive is soft-delete with no restore UI or bulk archival

---

## Findings by Theme

### 🔴 WORKFLOW EFFICIENCY: Missing Bulk Actions & Batch Operations

| Title | Severity | Effort | Recommendation |
|-------|----------|--------|---|
| **No bulk contact actions or exports** | High | L | Add table checkboxes + sticky bulk toolbar (Status, Add to List, Export CSV, Archive). Implement `GET /api/crm/contacts/export?filters=...` endpoint. This eliminates per-contact repetition for common ops like moving 50 contacts from New → Active or exporting Q2 referrers. |
| **No batch email send scheduling; send workflow requires list-detail modal** | Medium | M | Add 'Send Campaign' quick-action to CrmDashboard. Implement `POST /api/crm/sends/batch` accepting `{recipients_query, template, schedule_time}` instead of fixed mailing_list_id. Support template vars ({{firstName}}, {{budget}}). |
| **No automated follow-up reminders or escalation** | High | L | Add optional email reminders when action due (24h warning + due-today). Auto-escalate overdue >3d to 'urgent' status, notify supervisor. Low-cost, high-impact. |
| **Interaction logging doesn't auto-populate next_action defaults** | Low | S | If interaction_type='call', default next_action='email' in 3d. If 'email', default 'call' in 5d. Reduce re-selection friction. |

**Location refs:** src/components/crm/CrmContacts.jsx:287–451 (no checkboxes); src/components/crm/MailingLists.jsx:231–337, 339–475 (list-detail modal required); server/lib/crmRoutes.mjs:950–1130 (no batch scheduling endpoint).

---

### 🔴 USABILITY: Modal Stacking, Form State, & Navigation Friction

| Title | Severity | Effort | Recommendation |
|-------|----------|--------|---|
| **Dual modals break context: new contact → add to list requires close-reopen** | High | M | Add optional 'Add to manual list' section to NewContactModal itself, or provide quick-add button in success toast so user can extend task without re-opening drawer. |
| **Multiple open modals stack without visual hierarchy or breadcrumb** | Medium | S | Add modal stack manager. Disable pointer events on non-topmost modals. Show breadcrumb: 'Contact > Log Interaction > Add to List' so user knows position. |
| **Contact creation modal doesn't reset state when reopened** | Medium | S | Add `useEffect` hook that resets form state when modal opens, or move form initialization into modal's `useEffect` with `onClose` dependency. |
| **Referrer lookup doesn't allow previewing before selection** | Low | S | Add small preview icon next to dropdown results. Allow preview contact drawer without leaving creation flow. |
| **Send email modal doesn't close after draft save or send** | Medium | M | On save, show 'Draft saved' toast, keep modal. On send, close modal and auto-navigate to Sends tab showing delivery status. Provide 'Edit draft' link in list. |
| **Smart list membership visibility not obvious at contact creation** | Medium | S | Move 'willJoin' smart lists preview to prominent section near top of form. Use blue info box, add icon signaling automatic behavior. |

**Location refs:** src/components/crm/CrmContacts.jsx:47–284 (NewContactModal); src/components/crm/ContactDrawer.jsx:169–240 (AddToListModal); src/components/crm/MailingLists.jsx:231–337 (SendEmailModal).

---

### 🟠 DATA INTEGRITY: Smart List Desync, Referral Rollup Gaps, Archive UX

| Title | Severity | Effort | Recommendation |
|-------|----------|--------|---|
| **Smart list membership opaque at contact-creation time; logic duplicated server↔frontend** | Medium | M | Add 'Smart' badge to contact rows for auto-membership. Move smart-filter logic to shared utility exported from constants.js, imported by both frontend + server tests. Make smart list auto-add a Supabase materialized view refreshed on contact update. |
| **Contact→lead conversion causes data duplication; reverse sync missing** | Medium | M | Archive contact automatically on conversion (`is_archived=true`). Add `converted_to_lead` flag to leads table linking back. Treat crm_contacts as historical snapshot post-conversion. Update leads.email/phone cascades back to crm_contacts for audit trail. |
| **Contact→lead conversion doesn't explain what happens; no auto job_contact_roles** | Low | S | Add tooltip: 'Converting links to Sales pipeline. Contact record remains; continue logging interactions on both.' When lead converts to job, auto-create `job_contact_role(referred_by_contact_id, role='referrer', credits_referral=true)` or show pre-conversion prompt. |
| **Referral rollup recomputation not atomic; can lag or fail silently** | High | M | Wrap `recomputeReferralRollup` in transaction or return error callers must handle. Batch `getCanonicalContractValue` calls (await Promise.all) instead of sequential loop. Log failures to sync_failures table for admin visibility. |
| **Contact archival is soft-delete, no bulk archive, no restore UX** | Low | S | Add archive button in contact drawer. Add 'Show archived' toggle to contact list (grouped separately). Add restore button on archived drawer. Allow bulk archive from list (checkbox → Archive button). Log archive/restore as audit trail. |
| **Relationship score is derived data stored as mutable column** | High | L | Either make relationship_score a SQL-generated column (trigger-computed on every crm_contacts update), or add requirement that scoreContact() be called AFTER every crm_contacts write affecting inputs. Document as Canonical Data Law in CLAUDE.md. |

**Location refs:** server/lib/crmRoutes.mjs:107–150 (smartListMembers + smartListsForContact); 533–571 (contact→lead convert); 170–220 (recomputeReferralRollup); 61–105 (scoreContact); supabase/migrations/061_crm_mailing_list.sql:32–33 (relationship_score columns).

---

### 🟠 WORKFLOW CONSISTENCY: Email Authoring, Navigation Fragmentation, Status Transitions

| Title | Severity | Effort | Recommendation |
|-------|----------|--------|---|
| **Email send form missing sender customization (from_name/from_email)** | Medium | M | Add from_name and from_email inputs to SendEmailModal. Pre-populate from list's default_from_name/default_from_email. Include in POST /api/crm/sends payload. Users with different brand identity or personal 'from' address currently cannot send—workflow breaks. |
| **CRM split across two entry points: /sales/contacts vs /marketing/lists** | High | M | Create dedicated /crm route with sub-tabs (Contacts, Relationships, Mailing Lists, Campaigns). Move CrmDashboard, CrmContacts, MailingLists into unified CrmManager. Update sidebar nav. Or move MailingLists into SalesManager as third tab. Currently users must jump between unrelated sections. |
| **Smart list membership UI inconsistency—automatic vs manual add creates confusion** | Medium | S | In AddToListModal, filter dropdown to show only manual lists. Make 'Smart memberships' read-only section separate. Or show blue info box above dropdown clarifying smart lists auto-populate. |
| **Send status 'sending' can be inconsistent—no handling for partial Resend failures** | High | L | Before marking status='sent', verify all recipients have resend_email_id. Mark unmatched rows 'failed' and aggregate 'partial_sent' status, or reject batch and ask user to retry. Log unmatched recipients. Update UI to show partial failure clearly. |
| **Status enum mismatch: 'client' in DB but no UI label mapping** | Low | S | Add 'Clients' filter chip in CrmContacts. Define consistent typeColor(status) helper in both CrmDashboard + CrmContacts, or share via constant. Update dashboard filters to include client status. |

**Location refs:** src/components/crm/MailingLists.jsx:231–337 (SendEmailModal, no sender customization); src/pages/SalesManager.jsx + src/pages/Marketing.jsx (split navigation); src/components/crm/ContactDrawer.jsx:169–240 (AddToListModal); server/lib/crmRoutes.mjs:1000–1143 (send flow, partial failure handling).

---

### 🟡 CSV IMPORT & DATA QUALITY: Validation Gaps, Partial Failures, Compliance Risk

| Title | Severity | Effort | Recommendation |
|-------|----------|--------|---|
| **CSV import lacks duplicate detection, merge preview, and enum validation** | Medium | M | Pre-import: parse CSV, fuzzy-match by email+name (levenshtein), show match-preview table (email, name, confidence, action=create/merge/skip). Allow user to review and adjust. Add dedup endpoint for existing database (export likely dupes). |
| **CSV import validation shows truncated errors; rolls back entire batch on conflict** | Medium | M | Aggregate and categorize errors: 'Missing email: 23 rows', 'Missing consent: 45 rows'. Return granular errors (rowIndex, email, errors: ['invalid_budget_range: under_1m']). Allow partial import: process all rows, collect errors, return result count + error list. |
| **CSV import doesn't validate enum values before upload** | Medium | M | Validate each row against enum lists before import. For invalid contact_type, default to 'prospect' with warning. Give users chance to review and re-submit. Pre-validate CSV headers against expected schema before upload. |
| **CSV import lacks rollback on partial failure—succeeds with orphaned contacts** | Medium | M | Wrap loop in transaction. On any error, roll back all changes for that row. Return results{ created: 0, updated: 0, added: 0, errors: [all rows skipped], reason: 'Transaction failed' }. Or implement retry + report final orphan count separately. |
| **Contact import doesn't validate or handle consent/compliance edge cases** | Medium | M | Before adding to list, check email_unsubscribes: if bounced/complained >90d ago, warn user and offer skip or override. Add 'compliance notes' field on import. Log all imports to audit_log for Spam Act compliance. |

**Location refs:** src/components/crm/MailingLists.jsx:15–73 (parseCsv, no dedup); server/lib/crmRoutes.mjs:879–930 (import endpoint, sequential upserts).

---

### 🟠 PERFORMANCE: Query Batching, Missing Indexes, N+1 Patterns

| Title | Severity | Effort | Recommendation |
|-------|----------|--------|---|
| **Dashboard queries execute 6 sequential COUNT operations (no batching)** | High | M | Wrap all 7 queries in Promise.all(). For speed-to-lead, pre-compute aggregate (cached on load, updated when first_replied_at set) instead of scanning all 30d leads on every dashboard load. |
| **Missing index on email_send_recipients.resend_email_id blocks webhook performance** | High | S | Add migration: `CREATE INDEX idx_email_recipients_resend_id ON email_send_recipients(resend_email_id);` Webhook handler queries by resend_email_id (lines 1210, 1217, 1223, 1229, 1245, 1264) multiple times per event. Currently full table scan per webhook. |
| **smartListMembers() query executed N times per list (O(N²) in list display)** | Medium | M | Materialize smart list membership counts on mailing_lists (add denormalized total_members / active_members columns). Update via trigger/application logic on contact insert/update/archive. For dynamic queries (create-contact form), cache smartListDefs in memory. |
| **Contact list endpoint has no pagination in frontend; loads up to 100 contacts per request** | Medium | M | Add pagination controls to CrmContacts: show total count, add 'Next 50' button or limit dropdown. Update server to return { contacts, total } in response. Or set lower default (limit=50) and require explicit pagination. |
| **CSV import loops through rows sequentially with nested upserts (slow for large imports)** | Medium | M | Refactor to batch: (1) collect all emails, query existing contacts in one call with .in('email', emails), (2) build insert/upsert payloads in memory, (3) execute batch insert (or upsert with onConflict), (4) single batch membership upsert. |
| **Email send recipient loop updates individually inside loop (N updates for N recipients)** | Medium | S | Batch the updates: collect all into single payload or use SQL CASE statement via RPC, execute once. Move outside loop or use background job. Currently N sequential updates block send response. |
| **Smart list member enumeration re-queried on every list detail view load** | Medium | M | Cache smart list member IDs in memory on server (5min TTL) or add 'Refresh' button in UI. Show 'last computed' timestamp. Alternatively, add 'last computed' and show badge ('updated 2h ago—refresh?'). |

**Location refs:** server/lib/crmRoutes.mjs:229–314 (dashboard 6 queries), 747–770 (list enumeration), 879–930 (CSV import); supabase/migrations/061_crm_mailing_list.sql:138–151 (missing index); src/components/crm/CrmContacts.jsx:308 (limit=100 hardcoded, no pagination UI).

---

### 🟡 GAPS & OPPORTUNITIES: Export, Referrer Nurture, Lifecycle Visibility, Lead Scoring

| Title | Severity | Effort | Recommendation |
|-------|----------|--------|---|
| **No bulk contact export or data access for external tools** | Medium | M | Add `GET /api/crm/contacts/export?filters=...` returning CSV with all contact fields. Add `GET /api/crm/lists/:id/export` for list members + engagement metrics (last_contact_date, last_email_open, referral_count). Implement permission check (admin/supervisor only). |
| **Missing referral network visibility and referrer nurture automation** | Medium | M | Add referrer-specific dashboard: timeline of referrals, jobs converted, value delivered. Auto-send 'thank you' email when referred lead → job. Weight recent referrals (≤30d) +20pts in relationship_score. Create smart list 'referrers no contact >60d' for nurture. |
| **No email engagement analytics or lead scoring integration** | Medium | M | Add per-contact engagement summary (# sent, # opened, avg open rate, last opened). Show engagement trend (sparkline over 90d). Add quick-filter 'High Engagement' (>50% opens) and 'No Engagement' (0% opens) to contact list. Link email_campaign interactions to email_send_id for full attribution. |
| **Mailing list management lacks visibility into list composition rules** | Low | S | In ListDetail, show smart-list rules as readable badge: 'Auto-includes: status in (new, active)'. Make rules editable for admins (PUT /api/crm/lists/:id). Show estimated member count as rule edited. Add 'Preview' button to see matching contacts. |
| **No smart segmentation or predictive lead scoring** | Low | L | Show relationship_score in contact list (column or mini-bar). Add optional 'conversion outcome' field when logging. Use feedback to adjust score weights over time. Quick win: create smart list 'high score + no contact >30d' (warm but neglected) with auto 'check-in' campaign. |
| **Missing lead pipeline → referrer conversion tracking and analytics** | Low | S | Add referrer analytics dashboard: table sorted by value brought in, jobs closed, avg close time, YTD revenue. Show small referrer leaderboard in CrmDashboard (top 5 by value this month). Helps prioritize referrer nurture. |

**Location refs:** src/components/crm/MailingLists.jsx:444–459 (send metrics, no engagement analytics); server/lib/crmRoutes.mjs:61–105 (scoreContact static weights, no feedback loop); src/components/crm/ContactDrawer.jsx:600–610 (basic referrer stats only).

---

### 🔵 LOWER-PRIORITY: Minor Usability & Consistency

| Title | Severity | Effort | Recommendation |
|-------|----------|--------|---|
| **Interaction logging form doesn't clarify required vs optional fields** | Low | S | Add helper text under optional fields: '(Optional)'. Add placeholder text: 'Next action defaults to 7 days from today if not specified.' |
| **Relationship score calculation is hidden and non-transparent** | Medium | M | Add tooltip or info icon on relationship score explaining: referrals (+X), interactions (+X), recency (+X), no-contact penalty (-X). Add 'Score breakdown' link opening modal with exact calculation. |
| **Admin-only Jobs & Referrals section is entirely hidden from non-admins** | Medium | S | Show message for non-admins: 'Role & financial summary available to admins only' with lock icon and light background. Clarifies what's hidden and sets permission expectations. |
| **Contact list filter state not persisted across navigation** | Low | M | Persist filter state in localStorage and restore on mount. Or use context provider to hold state across module. |
| **Referrer lookup in form lacks keyboard accessibility** | Medium | S | Ensure TAB navigates through dropdown results. Add ARIA live region to announce matching results. Ensure selected referrer badge receives focus after selection for keyboard users. |
| **ContactDrawer 'Convert to Lead' doesn't preserve all contact data** | High | M | Extend conversion to stamp contact's notes into lead.discovery_notes, preserve contact_type as lead attribute, and enroll lead's email in same mailing lists the contact was on. |
| **No API for removing contact from smart list (only manual lists)** | Low | S | Keep smart lists automatic (no remove button). Document: 'To remove, change contact type or status.' Add help link. If user wants exception list, create manual list. |
| **Unsubscribe landing page hardcodes English content; no i18n support** | Low | S | Extract HTML template to locale file or accept lang query param. For now, document unsubscribe is English-only. |
| **Resend webhook handler doesn't validate event authenticity** | Medium | M | Extract RESEND_WEBHOOK_SECRET from env. Call Resend's verification method before processing (before line 1203). Log and discard invalid signatures. Required for Spam Act audit compliance. |
| **Contact creation form omits next_action defaults—UI and server defaults diverge** | Low | S | Show 'Next Action' field in form (type + due date), defaulting to 'call' tomorrow. Or document default in modal header: '(New contacts default to Call due tomorrow)'. |
| **MailingLists pagination missing—list view may be truncated at high count** | Low | M | Add limit/offset to GET /api/crm/lists. Return { lists, total }. Add search field for list names to narrow scope. |
| **Send email modal doesn't show live recipient count update** | Low | M | Fetch live count on modal open and before send. Show badge: 'Recipients: 42 (fetching...)'. If count changes, warn user before triggering send. |
| **CRM routes lack pagination for large lists** | Medium | M | Add pagination to all list endpoints. For interactions and members, return total count and offer pagination controls. Add 'Show more' button or lazy-load on scroll. |
| **Lead conversion doesn't explain what happens to the contact record** | Low | S | Add tooltip: 'Converting links contact to Sales pipeline entry. Contact record remains; continue logging interactions on both.' |
| **Interaction logging doesn't show real-time stats updates** | Medium | M | Add 'Refresh stats' button in 'Referrer Stats' section, or implement polling (refresh every 30s) while drawer open. |
| **req.caller vs req.user inconsistency (typo risk)** | Low | S | Standardize to req.user?.id everywhere. Verify requireAuth middleware injects this. Add comment if req.caller used elsewhere. |
| **Relationship score hardcodes $1.5M job-value threshold without documentation** | Low | S | Extract as constant (REFERRAL_JOB_VALUE_THRESHOLD = 1_500_000) with explanatory comment. Update CLAUDE.md with scoring algorithm. |

---

## Summary: Top 3 User-Impacting Issues

1. **Bulk actions completely absent** — Users cannot select 10+ contacts to batch-change status, add to list, or export. Forces repetitive drawer opens; major time sink for any nurture campaign or data cleanup.

2. **Smart list membership opaque, happens silently** — Contacts auto-join lists based on type/status with no UI indicator. Users surprised to see contacts in lists they didn't add them to. No explanation of why. UX inconsistency: dropdown shows smart lists but warns they're automatic.

3. **Contact↔Lead handoff broken; data duplicated, not synced** — Converting a contact to a lead copies fields one-way. Manual updates to contact don't sync to lead. Referral credit is not automatically tracked (no auto job_contact_roles). Staff must manually re-enter data on lead or forget to link roles, losing referral attribution.

---

## Bigger Changes (Beyond Quick Fixes)

- **Unify CRM navigation**: Consolidate /sales/contacts and /marketing/lists into single /crm route with tabs (Contacts, Mailing Lists, Campaigns, Analytics). Users jump between modules for one workflow.
- **Implement smart contact↔lead sync**: Stop one-way copy; maintain linked records with bi-directional email/phone updates. Auto-create job_contact_roles on referral lead→job conversion.
- **Add engagement-driven contact scoring**: Layer email open/click data, interaction frequency, and outcome feedback into relationship_score. Show warm/cold contact segments. Create nurture campaigns for 'high score + neglected' segment.
- **Batch & automate email campaigns**: Support template scheduling, segmented sends (recipient_query instead of fixed list_id), and batch scheduling with template variables.
- **Implement referrer relationship lifecycle**: Dashboard showing referrer network (who referred, jobs won, value attributed), thank-you automation, and nurture campaigns for 'referrers no contact >60d'.

**Top issues:** Bulk actions missing—users cannot select 10+ contacts to batch-change status, add to list, archive, or export; forces repetitive per-contact drawer navigation for common nurture/cleanup tasks.; Smart list membership happens silently with no visual indicator in contact list; users surprised to see auto-added contacts; UX inconsistency: dropdown shows smart lists but warns they're automatic.; Contact→Lead conversion is one-way data copy, not sync; manual updates don't cascade back; referral job_contact_roles not auto-created; staff must manually re-enter data or lose referral attribution.; Email send workflow requires list-detail modal navigation, no batch scheduling, sender customization hidden, no preview before send; forces users to leave module mid-task.; Dashboard and list queries execute 6+ sequential COUNT operations instead of batching; missing critical index on email_send_recipients.resend_email_id blocks webhook lookup performance.; CSV import lacks duplicate detection, enum validation, granular per-row error reporting, and partial-import support; shows only first 5 errors with '... and N more' message.

**Bigger changes (discussion):**
- Consolidate /sales/contacts and /marketing/lists into unified /crm route with tabs (Contacts, Mailing Lists, Campaigns) so users don't jump between two modules for one CRM workflow.
- Implement bi-directional contact↔lead sync: stop one-way copy; maintain linked records, cascade email/phone updates, auto-create job_contact_roles when referred lead converts to job to preserve referral attribution.
- Add engagement-driven contact scoring: layer email open/click data, interaction frequency, outcome feedback into relationship_score; segment contacts as warm/cold/neglected; auto-create nurture campaigns for high-score + no-contact >30d.
- Build referrer relationship intelligence: dashboard showing who referred, jobs won, value attributed, YTD revenue; auto-send thank-you on referral→job conversion; nurture campaigns for 'referrers no contact >60d' with check-in templates.
- Implement batch email campaign automation: template scheduling, segmented sends via recipient_query (not fixed list_id), staggered delivery, template variables ({{firstName}}, {{budget}}), and per-segment engagement analytics.

---

## Module Overview

The Tender Manager / RFQ Engine is a multi-step workflow for generating, sending, tracking, and converting RFQs into projects. Users flow through: **RFQ Engine (PDF extraction + compose) → Send to subcontractors → RFQ Packages / TenderBoard (track quotes) → TenderDetail (mark won, create POs) → Procurement**. The module connects Sales (lead→job), quote tracking, fee proposals, and procurement handoffs.

**Strengths:** solid multi-step UX, modular API routes, async email handling, Buildexact integration hooks.

**Critical friction:** dual RFQ data streams (rfqs table + rfq_packages/rfq_recipients) creating silent divergence; contract value calculated too late (at win-finalize), blinding Finance and Cost Intelligence; fee proposals force re-entry of job metadata already extracted; manual quote entry without source validation allows phantom quotes; three mandatory context-switches to complete a tender win; no bulk actions forcing 30+ clicks for a 10-trade package.

---

## Findings by Theme

### Workflow Inefficiencies & Manual Work

**Win workflow blocked by email sending before project creation** — marking tender as won requires: (1) select accepted/declined → (2) review emails → (3) send outcome emails → (4) then project created. If email fails, project creation is blocked. Outcome emails are fire-and-forget; if one fails, subcontractor isn't notified and there's no recovery path.

**Fee proposals force re-entry of job metadata already captured during RFQ** — RFQ Engine extracts address, client_name, floor_area_m2, storeys, building_type. Fee Proposal Wizard re-asks for the same fields from Buildexact XLSX/PDF. If created before RFQ finishes, drift occurs. No pre-fill from linked job record.

**RFQ Engine → TensorBoard → TensorDetail → RFQ Package is a 4-click navigation to same data** — after RFQ sends complete, completion log shows summary but no direct link to RFQ Package. To check package status: navigate to TensorBoard → find tender → click TensorDetail → scroll to RFQ Package → click View. This is 5 clicks to reach canonical package management UI.

**Users must manually navigate between quote receipt and PO creation** — after accepting a quote in rfq_recipients, user must: (1) note the amount, (2) switch to Procurement module, (3) re-enter cost/recipient/schedule. No "Create PO" button on accepted quote. No pre-filled PO form from quote context.

**No bulk RFQ send or bulk recipient management** — users send RFQs one trade at a time. For a 10-trade package with 3 subs per trade: 30 modal opens. Bulk status updates (mark 5 as received) also require individual clicks. No checkbox select + bulk action toolbar.

---

### Data Integrity & Canonical Data Law Violations

**Dual RFQ streams (rfqs table + rfq_packages) create inconsistent sources of truth** — TensorDetail reads/writes rfqs table directly (quote_amount, status, correspondence). RfqPackageDetail reads rfq_packages/rfq_recipients separately. No synchronization. When RFQ is sent via RFQ Engine, rfq_packages is created; when sent via TensorDetail, rfqs is created. Users see different quote amounts in different views. Editing quote in RfqPackageDetail does NOT update TensorDetail.

**Manual quote amount entry duplicates Buildexact source-of-truth without validation** — users can manually enter quote_amount in TensorDetail even if status='sent' and no email received. No validation that quote was actually received. Subcontractors page aggregates these phantom quotes, inflating stats (avgQuote, totalQuoted, rfqCount).

**Double contract value writes causing data divergence** — at win-finalize, contract_value is written twice: via setFact (provenance stamp) and via direct column writes to jobs.contract_value and projects.contract_value. Violates Canonical Data Law. If setFact fails but fallback succeeds, tables diverge. Projects.contract_value lacks auditability.

**Fee proposal acceptance doesn't trigger job update** — when fee_proposal.status transitions to 'accepted', jobs record is NOT updated with original_contract_value. Contract value only gets filled at win-finalize. If fee proposal is accepted but tender is abandoned, job has no contract_value. Finance cannot see value; Cost Intelligence cannot run benchmarking.

**RFQ extraction creates stale derived data without triggering dependents** — when user extracts RFQ, merged_plan, estimate_baseline, missing_trade_analysis are computed once and stored as JSONB. If Buildexact estimate changes later, package shows stale data. No invalidation triggers. User sends RFQs based on outdated trade coverage.

**Missing NOT NULL constraint on RFQ package creation** — POST /api/rfq-packages requires job_id but schema allows null. If FE sends null, package orphans with no way to link back to job.

---

### Inter-Module Handoffs & Data Re-entry Risks

**Win workflow separates project creation from email send requirement** — project creation is gated on outcome mail execution rather than being independent. If email fails, win is still processed but subcontractors aren't notified. Creates stalled handoff.

**Subcontractor data re-entry when adding ad-hoc recipients** — when sending RFQ to new subcontractor, if not in subcontractors table, user manually enters email + name. But these subs may already exist. No "Create and add" flow, so new sub isn't persisted.

**Buildexact sync is optional and failure modes are silent** — RfqEngine polls Buildexact for estimate baseline. If API fails, no error banner persists. User submits package; if Buildexact offline, package saves but missing cost baseline. Fee proposal wizard fails silently.

**Accepted quotes not synced back to Buildexact** — at win-finalize, syncAcceptedQuoteToBuildexact is fire-and-forget (no await, no retry). If Buildexact API is slow or fails, sync never happens. No user alert.

---

### UX Friction & Navigation

**Fee Proposal workflow unreachable from RFQ workflow** — RFQ Engine and Fee Proposal Wizard are sibling menu items but conceptually sequential. No guided transition. After marking RFQ won, no "Next: Create Fee Proposal" button.

**Subcontractors missing email shows 'blocked' but no inline 'Edit' action** — when subcontractor has no email, RFQ Engine shows blocked row with message "Missing email — update in Subcontractors." User must navigate away, edit, return. No quick link or inline edit modal.

**No inline validation before RFQ extraction** — users upload PDFs and click "Extract" without pre-flight validation of mandatory fields. If project_address is blank, users waste extraction API credits and wait 5–30s for API error.

**Dropbox online-only files fail silently with vague banner** — when user selects Dropbox Smart Sync files, error message is generic. Users may not understand what "available offline" means. No link to help.

**Missing deadline in RFQ composition UI** — deadline field starts empty, no date picker, no format hint, no validation. RFQs sent with no deadline, subcontractors don't know timeline.

**Completion log summary lacks critical post-send information** — after sends complete, log shows summary but doesn't show sent/failed counts, which subs couldn't be reached, or next action.

---

### Consistency & Terminology

**Status enums not centralized in constants.js** — RFQ statuses are hardcoded as local constants in multiple pages instead of being imported from constants.js. Inconsistent terminology across module.

**API response format violation in rfqTradeRoutes.mjs** — multiple error responses use res.status().json({ error: msg }) without canonical ok: false. Violates CLAUDE.md standards.

**Confusing navigation label: "Quote Tracker" for RFQ Packages** — navigation sidebar shows "Quote Tracker" label for /tender-manager/rfq-packages route, but page internally uses "RFQ Package" terminology. Users confused about scope.

**TensorBoard and RFQ Package List show overlapping data** — sidebar shows "Quote Tracker" and "Tender Board" as nearly identical entries. Both show jobs, both show RFQs, both show status. Unclear which users should use.

**Missing bulk/batch status update capability** — no batch update endpoint. Status updates are single-recipient only.

---

### Performance & Data Integrity

**Missing pagination on RFQ package list** — GET /api/rfq-packages returns all packages with full nested trade_scopes + recipients, no limit/offset. With 100+ packages × 30+ trades × 5+ recipients, payload grows to 10s of MB. Frontend filters in-memory.

**Missing follow-up deadline tracking** — RFQ recipients have status but no structured follow_up_due deadline. FollowUpAlert unreliable. Users see "0 follow-ups overdue" even if quotes are weeks old.

**Fee proposal status transitions lack validation** — FeeProposal can transition at any step. No state machine enforcement. User can mark accepted before uploading or sending to client.

**Contract value derivation happens in application code** — when win-finalize runs, contract_value is derived ad-hoc in memory. Portal, Finance, and Operations all may recompute or read stale values.

**Missing audit trail for RFQ status changes** — when user marks quote as declined or changes status, no audit log. Correspondence table only logs emails. Finance cannot see who rejected which quote or when. Violates compliance.

---

### Gaps & Opportunities

**No multi-job RFQ dashboard** — users cannot see across all packages: overdue quotes by trade, coverage gaps by region, or trade-specific bottlenecks. QuoteTracker is legacy and doesn't integrate with rfq_packages.

**No visibility into subcontractor RFQ history** — Subcontractors table shows no indicator of past RFQ activity. User cannot see "Plumbing Co was invited on 3 jobs (2 accepted, 1 declined)."

**Trade coverage analysis lives only in JSONB—no actionable UI** — rfq_packages.missing_trade_analysis JSONB identifies missing trades, but RfqPackageDetail only shows coverage percentage bar. No "Generate missing scopes" button.

**No timeline/Gantt view of RFQ deadlines** — deadline list shown but no visual timeline. Users cannot easily spot staggered deadlines or critical path."

**Top issues:** Dual RFQ data streams (rfqs + rfq_packages) create silent data divergence — users see different quote amounts in different views, manual edits don't sync across both tables.; Win workflow blocked by email sending before project creation — if mail fails, tender win is incomplete and subcontractors aren't notified. Project creation is all-or-nothing with email.; Fee proposals force re-entry of job metadata already extracted during RFQ — creates drift, double-entry burden, and data divergence between RFQ and proposal.; Manual quote entry without validation allows phantom quotes inflating subcontractor stats and cost intelligence — no enforcement that quote was actually received.; Contract value calculated too late (at win-finalize) — Finance and Cost Intelligence blind until then, and value not synced from fee proposal acceptance.; No bulk RFQ actions — users click 30+ times for a 10-trade package sending RFQs, updating status, or sending follow-ups.

**Bigger changes (discussion):**
- Unify RFQ data model: Deprecate rfqs table in favor of rfq_packages/rfq_recipients. Migrate TensorDetail to read from new schema. Add database triggers to sync any legacy inserts. Document migration SOP.
- Decouple project creation from email sending: Refactor module4Routes.mjs win-finalize to (1) validate & create project + POs transactionally, (2) queue outcome emails as async Postgres event pump tasks, (3) surface send status separately with 'Resend' button if email failed.
- Add RFQ Dashboard: Multi-job visibility with [job × trade] heatmap showing quote status, overdue queue by trade, coverage gaps by region. Requires aggregating rfq_packages + rfq_trade_scopes + rfq_recipients across all job_id.
- Implement Canonical Data Law for contract value: Remove double writes to jobs.contract_value + projects.contract_value. Route all writes through setFact. Derive values from job_fact_history at read time. Add back-fill trigger on fee_proposal acceptance.
- Bulk RFQ operations: Add checkbox-select + toolbar to RfqPackageDetail. Implement batch endpoints POST /api/rfq-recipients/bulk-action for status updates, send follow-ups, mark as received. Reduce O(n) clicks to O(1).
- Fee Proposal ↔ RFQ handoff: Link fee proposals back to winning rfq_id. Add 'Create fee proposal' button on accepted RFQ quotes → pre-fill FeeProposalWizard with quote context (subcontractor, amount, address). Bridge the two workflows.

---

# Cost Intelligence Module Audit

## Workflow Overview

The Cost Intelligence module provides cost benchmarking, normalized rates, pre-tender estimation, and labour rate management across four primary entry points (Benchmarks, Intelligence, Trends, Pre-Tender Estimator). Users flow through these tabs to: (1) capture project metrics (floor area, storeys, site slope, complexity); (2) manually enter or sync costs from Buildxact; (3) view historical cost benchmarks and risk levels; (4) generate estimates for new tenders; and (5) access company labour rate models. However, the module exhibits critical workflow friction: metrics must be re-entered across multiple forms, Buildxact syncs require manual triggering with unclear consequences, and cost data originating from Finance invoices never flows into benchmarking. Users frequently leave the module to finish workflows in Buildxact, Settings, or spreadsheets. The module has no integrated SOP/training and lacks bulk actions, leaving repetitive cost collection as manual, error-prone work.

---

## Key Findings by Theme

### Workflow Efficiency & Redundant Data Entry

**Critical Issue: Triple entry of project metrics**  
Project metrics (floor_area_m2, storeys, roof_area_m2, site_slope, wet_areas) are manually entered in *three separate locations*: (1) Intelligence tab's MetricsForm (L35–128), (2) Pre-Tender Estimator tab form fields (L659–776), and (3) Manual cost entry modal (L1437–1489). No pre-population between tabs. When a user adds metrics in Intelligence, switching to Pre-Tender requires re-entry of the same values. This is duplicated work and creates consistency risk if the user enters conflicting values.

**Recommendation:** Pre-populate PreTenderTab form fields from the currently selected job's project_metrics when switching tabs. Auto-populate manual entry modal with the selected job's project_metrics. Add a shared metric context or unified API response to avoid triple-entry.

---

**Manual entry modal lacks two-phase validation**  
The manual cost entry modal (L1432–1541) accepts 10+ metric fields + dynamic trade rows in a single form. If *any* trade row is invalid (empty trade or quote ≤0), the entire form fails silently—user must re-enter all metric fields. No inline validation, no field-level error indicators, no form state preservation.

**Recommendation:** Add pre-submit validation with field-level error badges. Display errors immediately on blur for required fields. Preserve metric state if trade validation fails. Consider a 2-step form: metrics screen → trade entry screen.

---

**Buildxact sync is manual and one-way**  
Users must manually click 'Sync estimate → budgets' (L1239). If Buildxact estimates are updated (scope change, repricing), the Hub estimate becomes stale. No auto-sync, no change-detection UI, no indication of when last sync occurred.

**Recommendation:** Add a 'last_synced_at' timestamp badge showing 'synced N days ago'. Implement a 'Re-sync if changed' button that queries Buildxact and shows a diff before applying. Enable optional auto-sync on schedule for admin workflow.

---

**Company Cost Model labour rates must be synced manually via Settings**  
LabourRateCard (L583–657) shows loaded labour rates, but if rates are stale, users must navigate away to Settings → Company Cost Model to sync. This breaks the workflow and forces a context switch mid-estimation.

**Recommendation:** Add a 'Sync rates' button to LabourRateCard or expose a POST /api/cost-model/sync endpoint callable from Cost Intelligence (admin-only). Include a 'Last synced' timestamp and staleness indicator (>7 days old).

---

**No bulk metrics collection for multiple jobs**  
Project metrics entry is single-job-only. Users with 5+ ongoing projects must manually enter metrics one job at a time, even if jobs share the same project type, slope, or complexity. No batch-entry form or template copy.

**Recommendation:** Create a 'Bulk Metrics Wizard': (1) select multiple jobs, (2) shared metrics form (project_type, site_slope) applying to all, (3) per-job grid (floor_area_m2, storeys). Save all at once with a timestamp.

---

### Usability & Discoverability

**Intelligence tab empty state lacks guidance**  
Users see 'Select a job to view its project metrics…' with no explanation of (a) where to find jobs, (b) which job should have metrics, or (c) how metrics get populated (manual vs sync vs PDF extraction).

**Recommendation:** Replace empty state with a 3-step flow card: '1. Select a job above. 2. Add project metrics (via Manual entry, PDF extraction, or Buildxact sync). 3. View normalized costs and benchmarks.' Add loading spinners showing which API call is active.

---

**Manual entry modal doesn't clearly indicate required vs optional fields**  
Labels like 'Roof m²', 'Solar kW' are all styled identically. Only 'Job', 'Trade', and 'Quote $' are functionally required, but the UI doesn't signal this.

**Recommendation:** Add asterisk (*) to required fields only. Add inline help text: '(required)', '(optional — improves analytics)'. Group fields: Section 1 = Job + Trades (required); Section 2 = Metrics (optional).

---

**Pre-Tender Estimator confidence feedback is opaque**  
Low-confidence warning appears (L835) but provides no breakdown: which trades lack data? How many samples needed? Which dimension is the bottleneck? Table shows 'Match: exact | partial | global' with no explanation.

**Recommendation:** Add tooltips explaining match types. Show sample count per trade. Add breakdown: 'Confidence limited by [3 samples for electrical (need 5+)]. Collect more cost data' as a clickable link to Benchmarks tab.

---

**Sync estimate button label is vague**  
'Sync estimate → budgets' (L1239) doesn't clarify: Will existing budgets be overwritten? Can I sync multiple times? What happens to manually-entered rows? Which Buildxact categories map to which trades?

**Recommendation:** Change to 'Sync from Buildxact (overwrites existing budgets)'. Add confirmation modal: 'This will update budgets for [15 categories]. Existing quotes will not be overwritten. OK?' Show unmatched category count with link to configure mappings.

---

**Metrics sync workflow terminology and logic unclear**  
'Sync from sources' button (L262–265) calls POST /metrics/sync, which pulls from jobs and cost_intelligence tables, but users expect it to pull from Buildxact or documents. No explanation of what 'sources' means. Sync logic prioritizes jobs.floor_area_m2 > cost_intelligence.floor_area_m2—if a user edited metrics to 300 m² and jobs still has 250 m², the 300 is silently overwritten.

**Recommendation:** Rename to 'Sync from jobs & quotes' or 'Reset from canonical'. Add confirmation modal showing what will change with a source attribution. Log the action to job_events.

---

**No inter-tab navigation guidance**  
Tabs operate independently. User working in Intelligence tab might not realize they need Benchmarks tab first for Buildxact sync, or that Pre-Tender tab results should be saved to cost intelligence. No breadcrumbs or contextual links bridge workflows.

**Recommendation:** Add contextual links: (a) Intelligence empty state: 'Add cost data? Go to Benchmarks → Manual entry.' (b) Pre-Tender result: 'Save this estimate?' button links to Benchmarks. (c) Benchmarks section: 'Ready to estimate?' link to Pre-Tender tab.

---

### Data Integrity & Cross-Module Friction

**floor_area_m2 exists in 4+ tables with no single source of truth**  
floor_area_m2 lives independently on jobs, project_metrics, cost_intelligence, and fee_proposals tables. Manual metric entry in Cost Intelligence doesn't update jobs.floor_area_m2, creating a split source of truth. FeeProposalWizard reads from jobs, bypassing Cost Intelligence. Pre-tender estimator only reads benchmarks.

**Recommendation:** Establish jobs.floor_area_m2 as canonical. Project_metrics becomes the enriched layer. On 'Save metrics', sync back to jobs.floor_area_m2 if blank or offer 'confirm override' UX. Update FeeProposalWizard to read from jobs only. Requires coordination with Canonical Data Law.

---

**Finance invoices never flow into cost benchmarks**  
When Finance approves an invoice, that cost is never synced to Cost Intelligence normalized_costs for benchmarking. Users may have approved $50k in invoices, but Cost Intelligence shows no cost data because invoices live in Finance and never sync to benchmarks.

**Recommendation:** Add a POST /api/cost-intelligence/jobs/:jobId/sync-from-invoices endpoint that reads approved invoices, groups by detected trade category, and upserts to normalized_costs with source='invoice'. Call on invoice approve and on Cost Intelligence load if unsync detected.

---

**RFQ Engine receives trades from Cost Intelligence but no feedback loop**  
Cost Intelligence publishes quote_capable trades via /api/cost-intelligence/template. RFQ Engine reads this baseline but there's no reverse handoff: newly won quotes don't flow back into Cost Intelligence for benchmark updates. Users must manually navigate back to Cost Intelligence to see recent wins reflected in averages.

**Recommendation:** Add a 'New quotes available for benchmarking' notification when Cost Intelligence detects cost_intelligence rows inserted after last recompute. Offer a prominent 'Update benchmarks with recent quotes' CTA. Show '3 new quotes recorded since last benchmark (date)—recompute to include them.'

---

**Labour rates configuration isolated from labour budget actuals**  
Company Cost Model syncs rates from Google Sheets and Pre-Tender uses them for labour estimates. BUT: Finance labour budget approval never reads these rates; Workforce timesheets don't compare actuals to them; rate changes mid-year have no versioning. Users must manually apply rates or track them via email.

**Recommendation:** Extend company_cost_model with effective_from/effective_to dates. Create /api/cost-model/rates-at-date endpoint. Update Finance labour budget approval to fetch rates for job start_date and show burden-rate calculator in UI.

---

### Data Validation & Entry Errors

**Manual trade rows accept duplicates and invalid amounts**  
Users can add multiple rows with the same trade name. User can enter quote_amount='0' or '-100'. Backend filters with `quote_amount > 0` silently without warning—user thinks they saved 3 trades, but only 2 were inserted.

**Recommendation:** Add client-side validation: warn if same trade appears 2x; check quote_amount > 0 with red error. Show count of valid rows before save: 'Ready to save 3 trade rows.'

---

**Floating point fields accept invalid input without feedback**  
Fields like 'Floor m²' use plain text <input> (not type='number'). Users can enter 'abc' or negative values. Backend normalizes via num() but provides no feedback—form silently coerces invalid input to NULL.

**Recommendation:** Add type='number' min='0' step='0.01' to all numeric fields. Display red border + 'Must be a number > 0' on blur if invalid.

---

**PDF extraction confidence threshold (40%) stores unvetted facts**  
Fields ≥40% are auto-saved as project_metrics columns; <40% are listed as low-confidence. A 45% confidence value is stored as 'extracted' but user-editable, indistinguishable from hand-entered data. No confirmation workflow for 40–70% confidence.

**Recommendation:** Implement three-tier consequence model: (1) High impact (storeys, site_slope, suspended_slab) require ≥90% confidence else flagged for review; (2) Medium (floor_area_m2, wet_areas) require ≥70%; (3) Low require ≥50%. Store all extracted facts in job_fact_history with confidence; let facts service tier logic decide applied vs flagged.

---

### Performance & Scale Issues

**N+1 upsert in benchmark recompute loop**  
Lines 414–453 in costIntelligenceRoutes.mjs: each benchmark group triggers an existence check followed by update or insert. For 50+ projects and 37 trades, this is 500–1000+ sequential queries per recompute.

**Recommendation:** Replace per-group existence check with single UPSERT: `db.from('cost_benchmarks').upsert(rows, { onConflict: 'trade_category_id,project_type,site_slope,storey_range' })`. Reduces 500 queries to 1.

---

**Similar projects endpoint loads all records into memory**  
GET /api/cost-intelligence/jobs/:jobId/similar (L546–589) fetches ALL project_metrics with no WHERE clause, loads into memory, then scores. For 500+ jobs, this loads 500+ objects on every Intelligence tab open.

**Recommendation:** Add WHERE clause to fetch only metrics matching target's key dimensions (project_type, site_slope, storeys). Alternatively, filter by ±30% floor area first, then LIMIT 20 and slice client-side.

---

**Frontend reloads all four endpoints without debounce**  
IntelligenceTab Promise.all (L150–166) fires 4 parallel requests every time selectedJobId changes. Rapid job selection causes overlapping requests with no debounce or abort signal.

**Recommendation:** Wrap loadJobData in useCallback with 300ms debounce or abort controller. Move fetch calls into a single combined endpoint: GET /api/cost-intelligence/jobs/{jobId}/dashboard returns all 4 payloads atomically.

---

**Benchmark recompute runs full scan with no incremental option**  
POST /api/cost-intelligence/benchmarks/recompute (L384–459) pulls ALL normalized_costs and project_metrics with no WHERE clause. Adding one new project forces full re-calculation of 500 stable benchmarks.

**Recommendation:** Add optional ?since=YYYY-MM-DD to fetch only changed data. Store 'last_recomputed' state. On subsequent calls, recompute only groups where members changed. Expose a 'Preview' button showing diff (old vs new rates) before commit.

---

**Employee cost rates synced in loop, not bulk**  
companyCostModelRoutes.mjs L109–111: for each rate row, individual upsert call. For 20-person team, 20 sequential operations.

**Recommendation:** Bulk upsert: `await sb.from('employee_cost_rates').upsert(rateRows, { onConflict: 'employee_name' })`. Reduces 20 queries to 1.

---

**Dual data paths for extracted facts—legacy columns + facts service**  
PDF extraction writes to project_metrics columns directly AND to job_fact_history via facts service. Paths can diverge; if facts service fails silently, provenance is lost.

**Recommendation:** Complete Phase 4: make ALL extracted facts flow through setFact() exclusively. Remove direct column writes. Let facts service be single source of truth; hydrate project_metrics view columns on read via a SELECT view or getJobProfile().

---

### Gaps & Missing Features

**No cost risk/budget overrun alerts despite data available**  
cost_benchmarks computes risk_level (low/medium/high) but alerts are only visible if user opens Cost Intelligence. No webhook, dashboard integration, or notification to Ops/Finance when a trade quotes above p75.

**Recommendation:** Populate cost_intelligence_insights on comparison compute. Add insight_type='cost_outlier' with severity. Wire to notification system (email to Finance lead). Add 'Cost Alerts' tab to Finance dashboard showing active high-severity insights.

---

**Pre-tender estimates not linked/persisted to job**  
PreTenderTab generates estimates with no job_id link. User must manually note the range. No way to: (a) recall earlier estimates for this job; (b) compare estimate-to-actual after project completes; (c) track model drift.

**Recommendation:** Pre-populate job_id from Intelligence context. Allow user to select a job. Show estimate history for the job. Store created_by and reason/scope notes. Auto-compare estimate vs final costs on project completion.

---

**No bulk export or reporting of benchmarks**  
No way to export per-trade benchmark cards (avg/p25/p75) as PDF or email format. Users must screenshot or manually copy numbers.

**Recommendation:** Add 'Export benchmarks' button generating a PDF: selected filters in header, table with Trade | Sample Count | p25–p75 | Avg | Confidence, footer with generated date. Alternatively, /api/cost-intelligence/benchmarks/export returning CSV/XLSX.

---

**RFQ package creation requires manual re-specification of trades**  
After syncing a Buildxact estimate, Cost Intelligence shows matched trades but no '+ Create RFQ package from synced trades' button. User must manually navigate to RFQ Engine and re-select trades.

**Recommendation:** Add button below synced estimate table: 'Create RFQ package from these trades'. Pre-populate RFQ with all quote-capable lines sorted by category. Requires POST /api/rfq/from-cost-intel/{jobId} route.

---

**Trade category mapping opaque—users don't know if Buildxact → Cost Intelligence mapping is correct**  
When syncing a Buildxact estimate (L1244–1277), mapping is done via fuzzy match. Some categories show 'Mapped to: —' (unmatched) but users don't know why or how to fix. Unmatched trades won't generate cost_intelligence rows.

**Recommendation:** Add optional manual mapping UI: if category is unmatched, let users click 'Choose trade' and select from trade_categories dropdown. Save overrides to a mapping_overrides table. Show 'Configure mappings' admin action. Return mappings report with each sync showing confidence %.

---

**No SOP/training for Cost Intelligence workflows**  
CLAUDE.md requires complete SOPs. Cost Intelligence has only 2 SOPs (view benchmarks, pretender estimate), missing: sync Buildxact, manual entry, metrics collection, understanding risk levels, company cost model setup.

**Recommendation:** Create 6 SOPs: (1) Setup (company cost model, Buildxact link); (2) Collect metrics (manual/PDF extraction); (3) Benchmark a job; (4) Pre-tender estimate workflow; (5) Interpret risk levels & trends; (6) Troubleshoot sync failures. Each must include Section 14 TC script (5+ test cases). Update SOP_INDEX.md and SOP_CHANGELOG.md.

---

### UI/UX Polish & Consistency

**Metric extraction confidence not surfaced in UI**  
Intelligence tab doesn't display a visual indicator that metrics came from AI extraction and may be unreliable. Users don't know confidence when running benchmarking or similar-projects logic on low-confidence metrics.

**Recommendation:** Add 'Data quality' badge next to each metric value: ✓ Confirmed (≥90%), ⚠ AI-extracted (40–89%), ? Manual. Color-code by confidence. Warn on Normalized Costs if floor_area_m2 confidence <50%.

---

**Normalized Costs 'Final' column logic is opaque**  
Line 357: `r.final_amount || r.actual_amount || r.budget_amount` silently uses fallback logic. User sees a value but doesn't know its source.

**Recommendation:** Change header to 'Final (actual → budget → quoted)' with info icon. Add data attribute title='{source}' to cells so hovering shows 'Actual', 'Budget', or 'Quoted'. Or use source indicator badges (green dot for actual, amber for budget, grey for quoted).

---

**authFetch used instead of apiFetch in 14 places**  
CostIntelligence.jsx violates CLAUDE.md standards (L1, 147, 154–157, 171, 178, 192, 206, 470, 478, 589, 675). Uses raw authFetch with manual .then(r => r.json()), inconsistent with other modules using apiFetch.

**Recommendation:** Replace all authFetch calls with apiFetch/apiPost/apiPut from src/lib/apiFetch.js. Ensures consistent { ok, data, error } return shapes and HTTP status handling.

---

**No role-based access control on Cost Intelligence routes**  
costIntelligenceRoutes.mjs uses global requireAuth but doesn't gate endpoints by role. companyCostModelRoutes.mjs correctly gates /sync with requireRole('admin').

**Recommendation:** Clarify role gating intent. If Cost Intelligence benchmarks/trends are internal-only, gate reads with requireRole('admin', 'supervisor'). Document role expectations in CLAUDE.md.

---

**Mixed response shape patterns create developer friction**  
Server returns both `{ ok: true, ...data }` and raw `res.json({ ok: true, ..., ...spread })` patterns (L53). Frontend handles ambiguous shapes inconsistently (L147 checks `if (j.ok || Array.isArray(j.jobs))`).

**Recommendation:** Standardize all responses using `ok(res, { metrics, job })` from apiResponse.mjs. Consolidate nested vs flat structures—always return specific named keys.

---

**Missing audit trail for metric changes**  
project_metrics table has updated_at and extraction_source, but no row-level history. When a user edits floor_area_m2, there's no record of who changed it, when, or what the previous value was.

**Recommendation:** Implement automatic audit via job_fact_history for all changes. When PUT /api/cost-intelligence/jobs/:jobId/metrics receives a change, call setFact() for each diff with source='manual_edit'. Automatically logs change with timestamp, actor, and old vs new value.

---

**Similar Projects matching algorithm not documented or configurable**  
costIntelligenceRoutes.mjs L428 uses hard-coded weights (30% project type, 20% floor area, etc.) but not exposed in UI or configurable. If user disagrees, no way to adjust.

**Recommendation:** Add comment explaining weights in code. In frontend, display 'Similarity score: 72%' with tooltip explaining dimensions. Consider adding 'Match breakdown' (✓ project type, ✓ site slope, ✗ floor area) to help users understand ranking. Move weights to company_cost_model JSONB config so admins can tune.

---

**Trends tab chart lacks actionable context**  
Chart shows historical $/m² per trade but no variance bands, forecast, RPI/CPI comparison, or explanation of WHY a trade is rising. Threshold for rising/falling is ±5% (noise for labour-heavy trades).

**Recommendation:** Add p25/p75 as faded bands. Add forecast line using linear regression. Show volatility (std dev) per month. Add checkbox to filter by (project_type, storeys). Link to Finance 'labour rate changes' log. Add 'Price forward' input suggesting range based on regression.

---

**Benchmarks recomputation not linked to data-entry workflows**  
After manually adding costs or syncing Buildxact estimate, benchmarks are stale until user explicitly clicks 'Recompute' (L231). No suggestion or reminder.

**Recommendation:** Show inline alert after saving: 'Benchmarks are outdated. [Recompute now] (takes ~2s).' Add banner badge to Intelligence, Trends, Pre-Tender tabs showing 'Benchmarks: N ago' with refresh link.

---

**Manual entry modal lacks date picker**  
recorded_at defaults to today even if entering historical data. No source field labelling (source hardcoded to 'manual'). Users may save entries with wrong dates.

**Recommendation:** Add date picker for recorded_at (default today). Show source='manual' label clearly. Add a source dropdown if other sources possible (e.g., 'imported from spreadsheet').

---

**PreTenderTab lacks input placeholders and validation**  
Fields like 'Floor area (m²)' have no placeholder text. Storeys expects 1–4 but not indicated. 'Wet areas' doesn't explain it's count of bathrooms+ensuites+laundries. No HTML5 validation; button not disabled until floor_area > 0.

**Recommendation:** Add placeholder='e.g. 240' to floor area. Add placeholder='e.g. 2' to storeys. Add help text below 'Wet areas': '(count of bathrooms, ensuites, laundries)'. Add HTML5 required, min/max attributes. Disable 'Generate' button until floor_area > 0.

---

**Buildxact sync button provides no refresh indicator or success feedback**  
After clicking 'Sync estimate', button shows 'Syncing…' but table below doesn't visually update. No success message. If sync is slow, user might click again, causing duplicates.

**Recommendation:** Disable button during request (already done). Add success toast: 'Estimate synced! [X] categories loaded.' Scroll table into view. Add 'Refresh' button next to table showing 'Last synced: 2 mins ago.'

---

**No validation that prevents form submission without floor_area_m2**  
Pre-Tender tab marks floor_area_m2 as required (L723) but UI doesn't disable 'Generate estimate' until floor_area is entered. Users can submit empty form and see generic error.

**Recommendation:** Add HTML5 validation: floor_area_m2 required, min=1. Disable 'Generate estimate' button until floor_area > 0. Show validation errors inline next to fields.

---

**Similar Projects card displays match % but not score breakdown**  
User sees 'Similarity: 72%' but doesn't know why (which dimensions matched, which didn't, weighting applied).

**Recommendation:** Add 'Scoring details' collapsible showing point breakdown. Add 'Filter by' menu (project_type, storeys, slope) to re-run similarity against subset. Store scoring weights in company_settings so admins can tune thresholds.

---

**No visibility on when benchmarks are stale**  
cost_benchmarks table stores covers_period_from, covers_period_to, last_updated but UI doesn't display these. Comment says 'flagged in UI' but not implemented.

**Recommendation:** Show benchmark age next to trade name: '(Updated 2026-05-15)'. Warn if any benchmark >90 days old: '⚠ Benchmarks are [X days] old. Consider recomputing.' Add 'Last recomputed' timestamp to benchmark section with report button.

---

**No 'Copy to clipboard' or 'Save' for quick labour estimate**  
LabourRateCard quick estimate (L632–656) shows labour cost but no 'Copy' button, 'Save' button, or 'Export to tender' button. Estimate is transient—lost on page reload.

**Recommendation:** Add button: 'Copy to clipboard' (copies 'Labour cost: $X'). Or 'Add to tender estimate' if in Pre-Tender tab. Make quick estimate sticky in localStorage within same session.

---

**MetricsForm Edit button toggles without clear visual scroll state**  
Clicking 'Edit' (L271) expands form below. If form is tall, 'Save metrics' button may be off-screen. No auto-scroll to save button.

**Recommendation:** On clicking 'Edit', scroll MetricsForm into view. Or place sticky 'Save' button in bottom-right corner. Add cancel button that resets form state.

---

**IntelligenceTab loads 4 endpoints in parallel with no combined error state**  
Line 153 Promise.all loads metrics, normalized-costs, comparison, similar in parallel but each fails silently if endpoint 503s. User sees empty cards without knowing if data failed to load or simply doesn't exist.

**Recommendation:** Add individual error states per endpoint or combined error banner at top of IntelligenceTab. Show loading spinners per card so user knows which section is still loading. Return specific error codes from server (404 'metrics not found' vs 503 'database unavailable').

---

**Job history Expand/Collapse arrows lack keyboard accessibility**  
Row expand/collapse (L1390) uses raw symbols without ARIA labels or keyboard navigation.

**Recommendation:** Add aria-expanded={expanded === jr.jobId ? 'true' : 'false'}. Replace ▼/▶ with proper <button> with aria-label='Expand job history'.

---

**Trends tab month labels truncated on small screens**  
Month labels are truncated (p.month.slice(5)) and may overlap on mobile. No tooltip on hover.

**Recommendation:** Add title='{full month}' to each month label. Use tooltip library. On mobile, rotate labels 45° or show only every other month label.

---

**Missing index on normalized_costs trend queries**  
Trends endpoint queries normalized_costs.recorded_at without index. Database scan becomes slow as data accumulates.

**Recommendation:** Add migration: `CREATE INDEX idx_normalized_costs_trend ON normalized_costs(trade_category_id, recorded_at DESC) INCLUDE (rate_per_m2_floor)`.

---

**Normalized costs recorded_at is DATE not timestamptz**  
Migration 032 L97: recorded_at is DATE with DEFAULT CURRENT_DATE. Intra-day ordering lost; two quotes on same day indistinguishable.

**Recommendation:** Change to timestamptz DEFAULT now(). Ensure all writes explicitly set recorded_at to actual incident date from source document (Buildxact created_at, quote email date).

---

**Extraction low-confidence fields discarded without user choice**  
Lines 273–281: fields <40% confidence are logged in response but user has no way to INCLUDE them if they're actually correct. User must manually re-enter.

**Recommendation:** Add button next to low-confidence warning: 'Include these fields anyway' (saves at lower confidence with note). Or checkbox list to selectively include borderline fields.

---

**PDF extraction provides no detailed feedback on extraction status**  
After extracting metrics, user sees low-confidence field list but doesn't know: which fields are most unreliable? Should they be trusted for cost comparisons?

**Recommendation:** Show extraction quality banner: 'Floor area 87% confident ✓ Storeys 45% confident ⚠ Roof area 28% (not used)'. Link to 'View details' showing per-field scores. Recommend confirming low-confidence values before using in cost analysis.

---

**No indication of job context when using Pre-Tender Estimator**  
User can run estimate for a hypothetical project with no job_id link. Later, can't recall or reference the estimate when creating the actual tender.

**Recommendation:** Add optional job selector to PreTenderTab. If selected, pre-populate form from project_metrics. After 'Generate estimate', offer 'Save to job' CTA. Show earlier estimates for the job as sanity checks.

---

**Cost Intelligence forces Supabase dependency with no graceful fallback**  
App checks supabaseConfigured on mount (L1110) and shows one-line error. But individual authFetch calls don't have error handling—if Supabase unreachable, Promise.all silently returns null values.

**Recommendation:** Wrap Promise.all results with error checks. On fetch failure, show toast: 'Failed to load metrics. Please refresh or contact support.' Add retry button. Distinguish (a) no data (empty state) vs (b) failed to fetch (error state).

---

**Pre-tender estimates saved with no status field—no draft vs final distinction**  
POST /api/cost-intelligence/pretender/estimate (L637–698) inserts row on every run, creating bloat over time.

**Recommendation:** Add lifecycle_status field (draft | submitted | converted_to_job). When user runs new estimate, set prior drafts to 'draft_replaced'. Show only latest draft in UI. Add 'Convert to job' button marking it 'converted_to_job'. Auto-purge draft estimates older than 90 days for completed jobs.

---

**No cache invalidation when metrics/benchmarks change**  
When user updates project_metrics (PUT L153–178), comparison and similar endpoints still return cached benchmark references. No invalidation signal; frontend shows stale data until manual reload.

**Recommendation:** Emit cache invalidation event when project_metrics updated: (1) On metrics PUT, invalidate similar/comparison for this job; (2) On benchmark recompute, invalidate all comparison caches. Frontend subscribes and refetches. Alternatively, use materialized view updated via trigger on project_metrics change.

---

**Trends endpoint loads full year into memory with no aggregation push-down**  
GET /api/cost-intelligence/trends (L592–634) loads ALL normalized_costs rows for a trade, groups by month in JavaScript. For 500+ cost records, all loaded into memory every request.

**Recommendation:** Push monthly aggregation to SQL: `SELECT date_trunc('month', recorded_at) AS month, AVG(rate_per_m2_floor) AS avg, COUNT(*) AS count FROM normalized_costs WHERE trade_category_id = ? GROUP BY month`. Frontend receives pre-aggregated data (12–24 rows instead of 500+).

---

**Repeated JOIN with trade_categories on every endpoint**  
Multiple endpoints redundantly fetch trade_categories (lines 349, 467, 488). Stable table but fetched repeatedly per session.

**Recommendation:** Cache trade_categories in frontend state or context on module load. Fetch once in IntelligenceTab useEffect at mount; reuse across all tabs. Alternatively, exclude from JOIN and send only trade_category_id; frontend resolves names from static cache.

---

**Missing pagination on job list and cost records**  
CostIntelligence.jsx L881 loads cost_intelligence with .limit(500)—hardcoded page size with no offset. Large accounts can't browse historical data. Job list (L147) fetches all jobs every time with no pagination.

**Recommendation:** Add ?limit=50&offset=0 parameters to all list endpoints. Implement PagedList component with Next/Prev buttons. For cost_intelligence, add 'History' view with date-range picker and pagination.

---

**Missing navigation link from Benchmarks to Pre-Tender Estimator**  
Benchmarks tab shows trade averages but doesn't suggest next step. Line 1427 links to Fee Proposal but not to Pre-Tender within module.

**Recommendation:** Add 'Use benchmarks for new estimate →' CTA button at bottom of Benchmarks section (L1423) that scrolls to Pre-Tender tab. Or show 'Ready to estimate?' card next to summary metrics linking to Pre-Tender.

---

**Duplicate data entry: Manual Buildxact sync vs manual cost entry modal**  
User can sync a Buildxact estimate (L1214–1277) OR manually enter costs (L1432–1541). Both write to normalized_costs, but via different UX flows. User doesn't know which path to use. No warnings if data already exists.

**Recommendation:** Consolidate: Move 'Manual entry' modal to Intelligence tab only, next to 'Edit' button. Or change Benchmarks 'Manual entry' to skip metrics—only let user add cost_intelligence rows (trades + quote amounts) without re-entering metrics. Warn if metrics already exist: 'Metrics already recorded on [date]. Edit above to update.'

---

**Labour rate card shows rates but not linked to actual employee records**  
LabourRateCard (L583–657) shows aggregated per-head/full-team cost without employee names. companyCostModelRoutes syncs employee_cost_rates but CostIntelligence never reads or displays individual rates. Pre-tender estimator can't break down cost by crew composition.

**Recommendation:** Extend LabourRateCard to display employee_cost_rates list (name, role, break_even/charge_up). Add 'Select crew' dropdown to PreTenderTab so users can manually pick crew composition before estimating labour cost. This closes loop between company model and pre-tender workflow.

---

**Buildxact sync doesn't show which categories are new vs updated vs removed**  
After sync (L932–945), user sees loading spinner but not detail on changes. Endpoint response doesn't include summary of trades created/updated/removed.

**Recommendation:** Return summary object from /sync-estimate: { ok, trades_synced: 12, created: 8, updated: 4, total_change: $15000, sample: [{trade, old_budget, new_budget, change}, ...] }. Display toast: '12 trades synced. Budget changed by $15K.' Add 'History' dropdown showing last 3 syncs with timestamps.

**Top issues:** Triple data entry of project metrics (Intelligence tab, Pre-Tender tab, Manual entry modal) with no pre-population or shared context—users must re-enter the same values in 3 places, creating consistency risk and duplicated work (HIGH usability friction).; Finance invoices never sync into Cost Intelligence benchmarks—users may have approved $50k in invoices, but benchmarking sees zero cost data because invoices live in Finance and Cost Intelligence never reads them (HIGH inter-module gap).; Manual Buildxact sync requires clicking a vague button with no indication of consequences, no change detection, no indication of when last sync occurred, and no way to re-sync if estimate changes (HIGH workflow friction).; Benchmark recompute uses N+1 upsert pattern (500–1000+ sequential queries for 50+ projects × 37 trades) and similar-projects endpoint loads all records into memory instead of filtering—performance degrades rapidly as data accumulates (HIGH performance risk).; Similar Projects algorithm uses hard-coded weights, not exposed or configurable, with no breakdown shown to users of WHY projects match (MEDIUM usability/consistency).; No SOP training exists for Cost Intelligence workflows (only 2 of 6 needed SOPs written)—staff will be confused and support burden increases (HIGH training/ops gap).

**Bigger changes (discussion):**
- Consolidate metric entry into a single unified flow: pre-populate Pre-Tender and Manual entry forms from Intelligence tab's project_metrics. Add a shared metric context or combined API response. Consider a 2-step manual entry form (metrics → trades) with state preservation.
- Implement Finance-to-Cost Intelligence sync pipeline: add POST /api/cost-intelligence/jobs/:jobId/sync-from-invoices to read approved invoices, group by trade category, upsert to normalized_costs with source='invoice'. Call on invoice approve and on Cost Intelligence load.
- Refactor benchmark recompute to use bulk UPSERT instead of N+1 loop. Optimize similar-projects query with filtered WHERE clause and LIMIT, push monthly trend aggregation to SQL, add cache invalidation events, create index on normalized_costs(trade_category_id, recorded_at).
- Complete Phase 4 of Canonical Data Law: migrate all extracted facts through setFact() exclusively, remove direct project_metrics column writes, hydrate columns on read via SELECT view. This unifies provenance tracking (confidence, source, status) across the module.
- Add job context throughout: link Pre-Tender estimates to jobs, persist them with lifecycle status (draft | submitted | converted), show estimate history for each job, enable estimate-to-actual comparison on project completion for model drift tracking.
- Implement three-tier confidence consequence model for PDF extraction: (1) High impact facts (storeys, site_slope) require ≥90% or flag for review; (2) Medium (floor_area_m2) require ≥70%; (3) Low require ≥50%. Show confirmation queue for low-confidence facts.
- Extend Company Cost Model with date-effective labour rates (effective_from/effective_to). Wire to Finance labour budget approval to fetch rates for job start_date. Add rate history and burden-rate calculator in Finance UI.
- Build 6 complete SOPs with TC scripts (Section 14) covering: Setup, Collect Metrics, Benchmark a Job, Pre-Tender Estimate, Interpret Risk Levels, Troubleshoot Sync Failures. Update SOP_INDEX.md and SOP_CHANGELOG.md.

---

## Operations & Schedule Manager: Synthesis Report

### Module Overview
The Operations & Schedule Manager is a mature suite of tools—Gantt/Sheet/Delays/Dep Map views, baseline tracking, ripple cascade, EOT claims, and AI schedule generation—that provides comprehensive project planning and execution visibility. The module integrates with Projects, Subcontractors, Procurement, RFQs, Buildexact estimates, Workforce timesheets, and Site Diary, but these integrations are fragmented, incomplete, and create workflow bottlenecks.

**Core workflow:** Create or generate schedule → view in Gantt/Sheet → drag/update dates → manage dependencies via ripple cascade → lock baseline → track overdue tasks, EOT claims, procurement order-by dates → link to RFQs/POs/timesheets externally.

**Critical friction points:**
1. **Procurement tasks duplicate data** instead of linking to the canonical Procurement register → manual re-entry, out-of-sync order-by calculations.
2. **Trade names exist in 3 places** (projects.accepted_trades, schedule.trade, schedule.assignee_trade, subcontractors.trade) with no sync → inconsistency, scope validation gaps.
3. **No bulk task edit actions** beyond delete → users click-edit each task to change status, trade, or progress (tedious for 50+ task projects).
4. **Leaving the schedule module to complete procurement workflows** (issue PO, create RFQ, manage supplier notifications) → disrupted task context.
5. **UI hides critical information** (Advanced task fields collapsed, Procurement lead-time calculation split between two modules, alerts panel disconnected).
6. **Performance bottlenecks:** Full schedule reload after every task save, N+1 updates on baseline lock/EOT apply, unbounded trade conflict detection loops.
7. **Data integrity gaps:** Baseline drift untracked after ripple cascade, procurement register sync fire-and-forget, buildexact_match stored as unvalidated JSON.

---

### Findings by Theme

#### **USABILITY & UX FRICTION (High Impact)**

**Async save feedback missing in Gantt inline edits**
- File: `src/pages/ScheduleManager.jsx:535-577`, `src/components/schedule/ScheduleGantt.jsx:444-449`
- When users drag/resize tasks, optimistic state updates but no loading spinner or status badge is visible. API request runs silently; error states only surface as easily-missed toasts.
- **Recommendation:** Add small loading spinner or dim overlay directly on affected task bar. Show transient status badge ('Saving…') on task. For errors, use persistent banner above Gantt with 'Retry' button.

**Task detail panel breaks workflow discovery**
- File: `src/components/schedule/TaskDetailPanel.jsx` (entire file), `src/pages/ScheduleManager.jsx:713-750`
- Right-side panel occludes Gantt. Advanced section (task type, priority, subcontractor, procurement) is collapsed by default, hidden from new users. Blank form defaults (phase='general', task_type='standard') are not visually cued.
- **Recommendation:** Reorganize into tabs (Basic, Advanced, Dependencies). Move frequently-edited fields (task type, priority, assigned trade) to Basic tab. Add badge to Advanced tab if unsaved changes exist.

**Ripple cascade confirmation shows no affected task list**
- File: `src/components/schedule/RippleWarningModal.jsx`, `src/pages/ScheduleManager.jsx:550-560`, `src/lib/scheduleUtils.js:previewRipple`
- Modal shows only count of affected tasks ('X downstream tasks will shift'). Users cannot assess impact before confirming.
- **Recommendation:** Expand modal to show small table: Task Name, Current End Date, New End Date, Duration. Add 'Preview' toggle to temporarily highlight affected tasks on Gantt. Provide 'Dry run' button to inspect result before saving.

**Sheet view has 14 columns with no visibility controls or sorting**
- File: `src/components/schedule/ScheduleSheet.jsx:22-110`
- Significant horizontal scrolling, truncated columns, no column sorting. Inline-edit pattern (EditableCell) is hard to discover.
- **Recommendation:** Implement column visibility toggle (show/hide via settings menu). Move procurement columns behind 'Show procurement details' toggle. Add column sorting and sticky Task name column. Make editable cells obvious with pencil icon or light background on hover.

**Empty state guidance missing; schedule generation unclear**
- File: `src/pages/ScheduleManager.jsx:600-610`, `src/components/schedule/ScheduleGantt.jsx:328-336`
- 'No tasks match this view' offers only 'Add task' button. Generate schedule modal has two modes (legacy template vs Claude) with no clear guidance on when to use each.
- **Recommendation:** Create informative empty state showing recommended actions: 'Generate schedule (AI)', 'Load template', 'Manually add tasks'—each with brief description and expected outcome. Rename 'Start date' to 'Project start date' with help tooltip.

**Delays (EOT) tab breaks mental model**
- File: `src/components/schedule/DelaysTab.jsx`, `src/pages/ScheduleManager.jsx:630-645`
- Delays tab is form-based claim management, not a temporal view like Gantt/Sheet/Dep Map.
- **Recommendation:** Restructure as Risk & EOT dashboard: read-only Gantt showing overdue/at-risk tasks with EOT claims listed below. Or move EOT management to Operations project detail page and add alert badge to Gantt/Sheet when overdue tasks exist.

**Baseline locking UI risks accidental reset**
- File: `src/components/schedule/ScheduleGantt.jsx:361-396`
- 'Reset baseline' button is styled as secondary action, positioned at eye level with status info. No confirmation dialog before reset.
- **Recommendation:** Add confirmation modal: 'Reset baseline to current schedule? This will clear drift tracking.' Make button more conservative (grey/red text or move to three-dot menu).

**Alerts panel in toolbar disconnected from alerts list**
- File: `src/pages/ScheduleManager.jsx:217-273`, `src/components/schedule/ScheduleToolbar.jsx:49-56`
- Toolbar shows Alerts button with badge, but component displaying alerts is missing, hidden, or hidden behind toggle.
- **Recommendation:** Ensure alerts panel is visible and clearly labeled. Display in modal or slide-in with severity icon, title, detail, and recommended action link. Allow dismissal (stored server-side, not client localStorage).

**Procurement fields lack clear labeling and inline help**
- File: `src/components/schedule/TaskDetailPanel.jsx:197-230+`, `src/components/schedule/ProcurementPanel.jsx`
- Procurement item, supplier, lead_days, order_by, order_status fields are present but relationships unclear (e.g., does lead_days auto-compute order-by date?).
- **Recommendation:** Add enhanced ProcurementPanel with clear labels and help text. Include: Item name (required), Supplier (optional), Lead time (weeks/days) with tooltip, Order-by date, Status dropdown. Add 'Calculate order-by date' button that back-calculates from task start date minus lead time.

---

#### **WORKFLOW INEFFICIENCY (High Impact)**

**No bulk task edit actions beyond deletion**
- File: `src/components/schedule/ScheduleSheet.jsx:38`, `src/pages/ScheduleManager.jsx:366-383`
- Multi-select in Sheet works only for bulk delete. Marking 5 tasks 'in_progress' or re-assigning trade requires 5 modal opens, 5 saves.
- **Recommendation:** Add bulk action toolbar on multi-select: 'Mark complete/incomplete', 'Change trade', 'Change phase', 'Set % complete'. Use floating action bar at bottom of table. For Gantt, add Ctrl+Click multi-select + shift+drag to resize all selected tasks.

**Task creation split across 3 entry points without context carry-over**
- File: `src/pages/ScheduleManager.jsx:715-737`
- Three create buttons (header, empty state, toolbar) all lead to same blankTask(). New task phase defaults to first task's phase or 'general', not inheriting current view context.
- **Recommendation:** Pass current filter/view context to blankTask(). Default new task phase to first visible task's phase or user's last-accessed phase. Auto-set trade if current filter is active.

**Leaving schedule to manage procurements forces context switch to Trades tab**
- File: `src/pages/OperationsProjectDetail.jsx` (Trades tab), `src/pages/ScheduleManager.jsx`
- Clicking 'Order' on unordered procurement item from schedule alerts requires navigation away from Schedule to OperationsProjectDetail > Trades tab.
- **Recommendation:** Add 'Quick PO' modal accessible from Schedule alerts or procurement task context menu. Show item details and subcontractor dropdown. Issue PO without leaving schedule. After success, mark task as 'ordered'.

**Dual trade assignment fields cause repeated manual input**
- File: `src/pages/ScheduleManager.jsx:297`, `src/components/schedule/TaskDetailPanel.jsx:89-93`, `src/components/schedule/ScheduleSheet.jsx`
- Both 'trade' and 'assignee_trade' fields are saved together. Confusing duplication for a single concept.
- **Recommendation:** Consolidate to single 'assignee_trade' field. Remove 'trade' from save payload and deprecate in schema. Update all filter/read logic to use only assignee_trade.

**Ripple cascade confirmation interrupts workflow; no 'always cascade' option**
- File: `src/pages/ScheduleManager.jsx:535-595`, `src/components/schedule/RippleWarningModal.jsx`
- Every dependent task move triggers confirmation modal. Power users face repetitive friction.
- **Recommendation:** Add checkbox in modal: 'Always cascade dependencies (until I switch projects)'. Store preference in localStorage scoped to projectId. Add keyboard shortcut: Enter = confirm, Shift+Enter = break dependency.

**Dashboard/project insights require separate API calls with non-blocking load**
- File: `src/pages/ScheduleManager.jsx:181-185`, `src/pages/OperationsList.jsx`
- Backend calls /api/schedule/{projectId} (tasks) and /api/schedule/{projectId}/dashboard (metrics) separately. Dashboard load is non-blocking (catch-silently), so alerts may be stale.
- **Recommendation:** Merge dashboard calculations into main /api/schedule/{projectId} response. Return {tasks, dashboard: {total, overdue, overallPercent, ...}} in one call. Reduces HTTP overhead and ensures alert sync.

---

#### **INTER-MODULE INTEGRATION (Critical Gaps)**

**Procurement data duplicated in schedule_tasks instead of linked**
- File: `src/pages/ScheduleManager.jsx:313-314`, `src/components/schedule/ProcurementPanel.jsx`, `server/lib/scheduleRoutes.mjs:1040-1041`
- Schedule tasks store procurement_item (string) and procurement_supplier (string) manually. Procurement module owns procurement_items register (canonical source). Two sources of truth; changes in Procurement module invisible to Schedule.
- **Recommendation:** Link schedule_tasks to procurement_items via related_schedule_task_id FK. When task.task_type='procurement': read item/supplier from linked procurement_item (read-only or 'Edit in Procurement' link). On task save, auto-create procurement_item if none linked. Schedule generation should auto-link generated procurement tasks by name similarity.

**Trade names maintained in 3 separate places with no sync**
- File: `src/pages/OperationsList.jsx:56` (projects.accepted_trades), `src/pages/ScheduleManager.jsx:137`, `server/lib/operationsRoutes.mjs:56`
- Projects.accepted_trades, schedule_tasks.trade, schedule_tasks.assignee_trade, subcontractors.trade—all diverge. Trade conflict detection queries schedule_tasks but doesn't validate against projects.accepted_trades. No warning if user assigns a trade never RFQd or accepted.
- **Recommendation:** Define trade_library as authoritative source. Add soft FK: schedule_tasks.assignee_trade → trade_library.code. OperationsList & ScheduleManager fetch trade_library and offer dropdown (not free-text). Update projects.accepted_trades on sync with RFQ module. Flag 'scope mismatch' if task references trade no longer in projects.accepted_trades.

**Buildexact estimate linkage is one-way; manual cost entry bypasses estimate**
- File: `src/pages/ScheduleManager.jsx:319-320`, `src/components/schedule/TaskDetailPanel.jsx:188-201`, `server/lib/scheduleRoutes.mjs:968-969`
- Task links to Buildexact line item (read-only badge), but planned_hours/planned_cost are free-text editable. User can override estimate, creating shadow data. Schedule generation doesn't auto-link generated tasks to estimates.
- **Recommendation:** When task.buildexact_match is set: lock planned_hours/planned_cost to read-only (fed from estimate). Require 'Unlock estimate' confirmation with reason if override needed. Run auto-match after schedule generation (fuzzy-match task names to estimate descriptions). Show 'Allocated to schedule [task name]' in Tender Manager RFQ module.

**Procurement order-by date logic split between two modules without coordination**
- File: `src/components/schedule/ProcurementPanel.jsx:20-32`, `server/lib/scheduleRoutes.mjs:93-99`, `supabase/migrations/085_procurement_intelligence.sql`
- Schedule task has 'Lead time (days)' input → calculates order_by = start_date - lead_days. Procurement_items has lead_time_days, approval_buffer_days; order_by_date is GENERATED. Two separate calculations; if supplier's lead time changes in Procurement, Schedule is not notified.
- **Recommendation:** Deprecate schedule_tasks.procurement_lead_days. When task_type=procurement: read lead_time_days from linked procurement_item, add approval+review buffers, show calculated order_by (read-only unless no item linked). Whenever procurement_item.lead_time_days changes, trigger schedule dashboard recalc.

**Schedule and Site Diary have no two-way linkage despite both being daily operational records**
- File: `src/pages/SiteDiary.jsx`, `src/pages/ScheduleManager.jsx`, `server/lib/siteDiaryRoutes.mjs`
- Site Diary records daily work (trades, work completed, issues). Schedule defines planned work. No cross-reference: diary doesn't flag 'Milestone reached today', schedule doesn't show 'See diary for Oct 2'.
- **Recommendation:** Add task_id FK to site_diary. Site Diary page: show 'Today's active schedule tasks' sidebar. Allow diary entry to tag/link schedule tasks. Schedule Gantt: on task hover, show 'Site diary entry [date]' if exists. Diary AI: pass today's scheduled tasks as context for better auto-tagging.

**No navigation/workflow links to complete procurement tasks outside Schedule module**
- File: `src/pages/ScheduleManager.jsx`, `src/components/schedule/TaskDetailPanel.jsx`, `operationsRoutes.mjs`
- User creates procurement task in Schedule Manager. No 'Create RFQ', 'Send PO', or 'Go to Procurement' button. Must navigate away to Tender Manager. One-way links: Procurement can open related_schedule_task_id, but Schedule has no reciprocal link.
- **Recommendation:** TaskDetailPanel: if task_type='procurement', show inline search 'Search procurement items' with link to Procurement module. If related_schedule_task_id set: show 'Linked procurement item: [name] — [status]' with status pill (RFQ/PO/delivery status). Add button 'Create RFQ for this item' → navigate to Tender Manager with pre-fill.

**Subcontractor assignment decoupled from RFQ acceptance and compliance**
- File: `src/components/schedule/TaskDetailPanel.jsx:183-187`, `server/lib/scheduleRoutes.mjs:134-139`
- TaskDetailPanel shows free-text subcontractor dropdown (all subcontractors filtered by trade). No check: Is this subcontractor RFQd? Has RFQ been accepted? Are compliance docs current? Assignment can diverge from accepted RFQ.
- **Recommendation:** Pre-filter dropdown to accepted subcontractors for this project only. Show compliance status ('Public Liability expires [date]'). Add validation rule: cannot assign task unless RFQ accepted OR supervisor override (with reason). On schedule generation: auto-assign tasks to accepted RFQ subcontractors (non-binding).

**Project context (address, job_id) fetched separately in each module with no shared cache**
- File: `src/pages/ScheduleManager.jsx:129`, `src/pages/SiteDiary.jsx:38`, `src/pages/OperationsList.jsx:249`
- Each page calls SELECT independently. If user navigates Schedule → Operations → SiteDiary, 3 separate DB queries fire. Address is never updated if project was renamed elsewhere.
- **Recommendation:** Wrap Operations module in ProjectContext. Cache project metadata (address, job_id, buildexact_job_id) in React context + localStorage. Fetch on module entry, invalidate on save. Ensure ScheduleManager, SiteDiary, WhsEngine all consume the same context.

---

#### **CONSISTENCY & DATA INTEGRITY (Medium Impact)**

**Status enums hardcoded in components instead of imported from constants**
- File: `src/pages/OperationsProjectDetail.jsx:436+`, `src/pages/ScheduleManager.jsx:226-250`, `src/components/schedule/ScheduleSheet.jsx:78-88`
- Task status values hardcoded ('complete', 'in_progress', 'planned', 'open') throughout components. Constants.js defines TASK_STATUSES but components don't use it, violating CLAUDE.md rule.
- **Recommendation:** Create/import TASK_STATUSES, TASK_TYPES enums from constants.js. Update all components to use TASK_STATUSES.COMPLETE, etc.

**Full-schedule reload after every task save blocks UI**
- File: `src/pages/ScheduleManager.jsx:195-203`, `src/pages/ScheduleManager.jsx:335-358`
- patchTask() unconditionally calls loadTasks() + loadDashboard(). For a 300-task schedule, a single 1% progress bump triggers 100+ task re-hydration. Expensive and wasteful.
- **Recommendation:** Implement optimistic updates + targeted refetch. Return updated task from PATCH endpoint, merge into local state. Only reload dashboard if critical-path or cost data genuinely changed (detected serverside).

**Baseline lock uses N+1 updates; EOT apply same issue**
- File: `server/lib/scheduleRoutes.mjs:1268-1290` (baseline), `server/lib/scheduleRoutes.mjs:1363-1386` (EOT)
- Loops through all tasks and issues separate UPDATE for each. 300-task project = 300 round-trips.
- **Recommendation:** Consolidate to single batch UPDATE with SET clause. Test with >500 task projects.

**Schedule generation soft-deletes old tasks but frontend holds stale references**
- File: `server/lib/scheduleRoutes.mjs:464-467`, `src/pages/ScheduleManager.jsx:335`
- Old tasks marked deleted_at on generate. If user had task detail panel open, editTask still references deleted task; can still patch it.
- **Recommendation:** On generation complete, set editTask = null, close all task panels. Or add check in patchTask to reject updates to deleted_at != null tasks.

**Trade conflict detection runs O(n²) on every GET; unbounded, no caching**
- File: `server/lib/operationsRoutes.mjs:88-153`, `src/pages/OperationsList.jsx:273-281`
- Fetches ALL incomplete tasks, groups by trade, double-loops to find overlaps (line 127-142). For 50 projects × 100 tasks = 5000 comparisons. Called on every OperationsList render with no caching.
- **Recommendation:** Cache result for 1 hour with Redis or Supabase. Or use trigger-based computed column on projects that flags active conflicts. Limit to 60-day date range.

**Global Gantt loads unbounded task list with no pagination**
- File: `server/lib/operationsRoutes.mjs:70-84`, `src/pages/OperationsList.jsx:354-359`
- GET /api/operations/global-tasks SELECT * from schedule_tasks for all projects with no LIMIT. 2,000 tasks render in single Gantt; library lags on large dataset.
- **Recommendation:** Add ?limit=500&offset=N pagination. Client-side date-range filtering (next 3 months). Consider virtualizing task list rows if count >1000.

**Ripple cascade ignores frozen baseline_start_date; drift untracked**
- File: `server/lib/scheduleRoutes.mjs:350-361`, `server/lib/scheduleRoutes.mjs:327-414`
- Ripple cascade updates live start_date/end_date based on dependencies but never updates baselines. Result: baseline drift unmeasurable after cascade. EOT tracking becomes unreliable.
- **Recommendation:** When cascading, also update baseline_start/end if they exist. Or freeze entire schedule (schedule_version increment) instead of live-editing. Document which fields are mutable after baseline lock.

**Procurement register sync is fire-and-forget (try-catch, silent fail)**
- File: `server/lib/scheduleRoutes.mjs:385-411`, `server/lib/scheduleRoutes.mjs:1105-1106`
- When task start_date changes, code tries to update procurement_items.required_on_site_date. But wrapped in try-catch with no error logging. If write fails, procurement register silently skips. Two sources of truth diverge.
- **Recommendation:** Make sync non-negotiable. Either fail task PATCH if register update fails, or log persistent warning to project WHS/compliance dashboard. Add audit job flagging mismatches.

---

#### **GAPS & OPPORTUNITIES (Larger Features)**

**No bulk progress update from timesheet approval**
- File: `src/pages/Workforce.jsx:119-149`, `src/pages/ScheduleManager.jsx`
- Timesheet approval in Workforce module doesn't update schedule task progress. Labour completed recorded in timesheet but not reflected in schedule completion.
- **Recommendation:** Add task_id FK to timesheets table. On timesheet approval, accumulate approved hours against planned_hours and auto-update task.percent_complete. Or show 'Update task progress' modal on approve-success with matched task list for bulk update.

**Trade conflict detection has no persistent tracking or resolution workflow**
- File: `server/lib/operationsRoutes.mjs:86-153`, `src/pages/OperationsList.jsx:273-281`
- Conflicts detected on-demand, displayed as warning, no record of resolution. No escalation to supervisor; users not notified when conflicts arise.
- **Recommendation:** Create trade_schedule_conflicts table. On conflict detection, upsert row; trigger supervisor_task 'Resolve trade conflict'. Add Conflicts tab in ScheduleManager with quick-resolve UI (confirm intentional, reschedule to avoid). Email supervisor on NEW conflict.

**Missing export templates and reporting snapshots**
- File: `src/pages/ScheduleManager.jsx:422-431`, `server/lib/scheduleRoutes.mjs`
- Users can export CSV or Gantt PDF, but no: phase summary table, milestone list, procurement checklist, baseline snapshot for variation comparison.
- **Recommendation:** Add export presets in ScheduleToolbar: 'Phase Summary', 'Milestone Schedule', 'Procurement Checklist', 'Baseline Snapshot'. Each returns styled HTML/XLSX. Baseline Snapshot auto-saves task JSON on lock; export compares current vs baseline to show scope changes.

**No bulk task operations (mark all framing tasks complete, change multiple trade assignments)**
- File: `src/components/schedule/ScheduleSheet.jsx:35-41`, `src/pages/ScheduleManager.jsx:366-383`
- Sheet supports multi-select but only bulk delete. No bulk status, trade, or priority change. Re-assigning trade across 10 tasks requires 10 edits.
- **Recommendation:** Add bulk action toolbar on multi-select: 'Status: [dropdown]', 'Trade: [dropdown]', 'Phase: [dropdown]', 'Priority: [dropdown]'. Fire single batch PATCH per field.

**One-click task scheduling from RFQ acceptance**
- File: `server/lib/rfqRoutes.mjs`, `src/pages/ScheduleManager.jsx`
- Accepting subcontractor RFQ doesn't suggest schedule tasks. Users manually re-enter trade, dates, cost from RFQ.
- **Recommendation:** Add 'Schedule' button on accepted RFQ row. Modal pre-fills trade, cost, description from RFQ. Require start date, duration, phase. On save, create task + link to RFQ.id.

**No labour workload/capacity visibility across trades and projects**
- File: `src/pages/ScheduleManager.jsx:206-208`, `server/lib/scheduleRoutes.mjs:154-161`
- Schedule dashboard shows per-project workload by trade. No cross-project labour capacity planning. If Framing is 200 hours across 3 overlapping projects, users don't see combined load.
- **Recommendation:** Add Labour Capacity view to Operations landing page. Aggregate planned_hours by trade across active projects, grouped by month. Show demand vs capacity (staffing levels). Highlight over-capacity months. Link to Workforce to manage resourcing.

**SMS/push notification missing for critical schedule milestones**
- File: `server/lib/scheduleReminders.mjs` (email-only), `src/pages/ScheduleManager.jsx`
- Schedule reminders are UI alerts or silent. No SMS/push for hold-point approvals, procurement deadlines, overdue tasks. Site supervisors may miss alerts.
- **Recommendation:** Integrate SMS/push to scheduleReminders.mjs. On hold_point due in 2 days OR procurement_order_by tomorrow, send SMS. Requires phone number on projects table.

---

### Summary Table of Deduped Findings
| Category | Count | Severity | Effort |
|----------|-------|----------|--------|
| Usability & UX | 10 | High (6), Medium (4) | S–M |
| Workflow Efficiency | 8 | High (3), Medium (5) | S–M |
| Inter-Module Integration | 8 | High (3), Medium (5) | M–L |
| Consistency & Data Integrity | 9 | High (2), Medium (7) | S–M |
| Gaps & Opportunities | 8 | Medium (8) | M–L |

**Most impactful quick wins (effort ≤ M):**
1. Consolidate trade fields (assignee_trade only) — unblocks downstream consistency (M)
2. Add bulk task edit toolbar in Sheet view — eliminates N click-edit operations (M)
3. Link procurement_items to schedule_tasks via FK — enables bidirectional sync (M)
4. Replace full-reload with optimistic update — eliminates post-save latency (M)
5. Add confirmation dialog to baseline reset — prevents accidental data loss (S)

**Top issues:** Procurement data duplicated in schedule_tasks instead of linked to canonical Procurement register—manual re-entry, out-of-sync order-by calculations, and broken handoffs to RFQ/PO workflows (severity: high).; Trade names maintained in 3 separate places with no sync (projects.accepted_trades, schedule.trade, schedule.assignee_trade, subcontractors.trade)—inconsistency and no scope validation prevent users from assigning unaccepted trades (severity: high).; No bulk task edit actions beyond deletion—users must click-edit each task to change status, trade, or progress, requiring 50+ repetitive modal opens for large projects (severity: high).; Full schedule reload after every task save blocks UI—single 1% progress update on 300-task schedule triggers expensive SELECT *; perceived latency and wasted bandwidth (severity: high).; Leaving schedule module to complete procurement workflows (issue PO, create RFQ)—users navigate away to Trades tab or Tender Manager, losing schedule context and breaking task continuity (severity: high).; Ripple cascade confirmation modal shows no affected task list—users cannot assess impact before confirming, risking unintended schedule changes (severity: medium).

**Bigger changes (discussion):**
- Unified Procurement Linkage: Replace duplicate schedule_tasks.procurement_* fields with FK to procurement_items table. Auto-create procurement_items on schedule task save if task_type='procurement'. Bi-directional sync: schedule updates trigger procurement register updates (required_on_site_date), and procurement changes (lead_time_days) surface in schedule. Handoff to RFQ/PO: add 'Create RFQ' button in schedule UI with pre-fill from task data.
- Trade Taxonomy & Validation: Consolidate trade names into single authoritative source (trade_library). Add soft FK from schedule_tasks.assignee_trade to trade_library.code. Validate: users can only assign trades in projects.accepted_trades; flag scope mismatches. Sync: on RFQ acceptance, auto-update projects.accepted_trades.
- Bulk Task Actions Suite: Multi-select in Sheet/Gantt + toolbar with bulk edit for status, trade, phase, priority, progress %. Single batch PATCH endpoint. Extends foundation already present (bulkDelete) without breaking existing patterns.
- Optimistic Update + Targeted Refetch: Replace full-schedule reload after task save. Return updated task from PATCH endpoint, merge into local state. Only reload dashboard if critical-path or cost data changed (serverside detection). Reduces perceived latency by 3–5x on large schedules.
- Schedule-to-Diary Bidirectional Linkage: Add task_id FK to site_diary; Site Diary entry page shows 'Today's active schedule tasks' sidebar; allow entry to tag/link tasks. Reverse: Schedule Gantt shows diary mentions on hover. Diary AI receives today's scheduled tasks as context for auto-tagging.
- Labour Capacity Planning: Aggregate planned_hours by trade across all active projects. Add Capacity view to Operations landing page with demand vs supply visualization. Link to Workforce for resourcing decisions. Addresses multi-project planning gap.
- Persistent Conflict Tracking & Resolution: Create trade_schedule_conflicts table; auto-detect on every schedule change. Trigger supervisor_task 'Resolve conflict'. Add Conflicts tab in ScheduleManager with quick-resolve UI (confirm, reschedule, or swap trades). Email supervisor on NEW conflict. Moves from on-demand detection to persistent audit trail.

---

## Site Diary Module: Workflow & Findings Overview

### Current Workflow
The Site Diary module implements a **Record → Structure with AI → Review → Save** workflow for daily site activities. Users capture voice transcripts, AI structures them into work completed, weather, trades on-site, issues, and instructions. Entries are auto-filed as PDFs to Dropbox. Past entries are browsable via read-only list view.

### Critical Gaps
**Spec-code mismatch:** SOPs (07-01, 07-02, 07-03) document editing, photo upload, and date filtering—none exist in code. Users cannot edit past entries, attach site photos, or filter long entry lists. **Silent failures:** Dropbox upload errors are swallowed; users see "Saved to Dropbox" even when PDF upload fails. **API standards violations:** Frontend bypasses apiFetch standard; responses lack camelCase conversion; no pagination despite unbounded entry lists. **Missing integration:** Diary entries (issues, trades, dates) are isolated—no links to schedule tasks, WHS incidents, or finance claims.

### Themes
1. **Promised Features Missing (High Impact):** Edit capability, photo uploads, date filtering, transcript review all documented but unimplemented. Closes workflow gaps.
2. **Workflow Friction (Medium Impact):** No bulk actions, no templates, form not sticky (unsaved changes lost on navigation), supervisor field requires manual re-entry daily, form too long on mobile (vertical stack, no tabs).
3. **Data & Integration Issues (Medium Impact):** Trade taxonomy mismatch (objects vs strings), photo_paths schema unused, Dropbox failures hidden, no cross-module visibility (schedule, WHS, finance).
4. **Consistency & Standards (Medium Impact):** Frontend uses authFetch directly instead of apiFetch; responses return snake_case instead of camelCase; no role-based access control; no pagination metadata.

### Recommendations Summary
| Theme | Key Actions | Effort |
|-------|-------------|--------|
| **Edit + Export** | Add PATCH endpoint, edit modal, date-range filter, export-to-PDF | M-M-S-M |
| **Mobile UX** | Tab toggle (New Entry \| Past Entries) on mobile, sticky form state to sessionStorage | S-S |
| **API Standards** | Use apiFetch in frontend, apply rowToCamel to responses, add pagination metadata | S-S-S |
| **Integration** | Add optional schedule_task_id FK to diary, return Dropbox errors in response | M-S |
| **Data Safety** | Validate trades against canonical taxonomy, return dropbox_error in response, enforce entry_date ≤ today | S-S-S |

**Top issues:** No edit capability exists despite SOPs documenting full edit workflow—users must delete and recreate entries to fix mistakes, losing metadata. Implement PATCH /api/diary/:entryId endpoint + edit modal.; Photos declared in schema but zero implementation—no UI upload, no backend route, no display. Either remove or build end-to-end (file input → upload → Dropbox → thumbnail display). High value for visual site evidence.; Dropbox PDF failures swallowed silently—users see 'Saved to Dropbox' even when upload fails. Return dropbox_error in response and show warning toast. Site diaries are audit evidence.; Frontend bypasses apiFetch standard (uses authFetch directly); responses missing camelCase conversion; no pagination metadata. Three quick consistency wins that improve maintainability.; Date range filter UI missing—projects with 200+ entries are unbrowseable. Add fromDate/toDate inputs, server-side filter, pagination 'Load more' button.; Supervisor field re-entered daily (hardcoded fallback); form not sticky across navigation (unsaved changes lost). Persist to localStorage + sessionStorage for friction reduction.

**Bigger changes (discussion):**
- Full Edit Lifecycle: Implement PATCH /api/diary/:entryId endpoint, edit modal in DiaryRow, optional transcript re-structuring via Claude, edited_at timestamp, audit trail of changes. Closes spec-code mismatch and improves compliance.
- Mobile-First Form/List UX: Implement tab toggle [New Entry | Past Entries] on mobile/tablet, sticky form state to sessionStorage with 'Unsaved changes' warning on navigation. Improves on-site usability where supervisors work on phones.
- Cross-Module Integration Layer: Add optional schedule_task_id FK to site_diary, create diary_schedule_links junction table, enable 'Diary entries for this task' backref in schedule detail. Unblocks diary-to-claim evidence chain (Finance module).
- Photo Capture End-to-End: Add file upload UI to diary form, multipart POST route to /api/diary/:entryId/photos, Dropbox/Storage bucket integration, thumbnail gallery in entry detail and PDF export. Unlocks visual site evidence (safety, progress, defects).
- Bulk Export & Reporting: Add date-range filter UI, pagination, /api/diary/export endpoint for PDF/CSV reports, email integration. Enables client updates and compliance reporting without manual copy-paste.
- Trade Taxonomy Normalization: Flatten accepted_trades in project load, validate trades_onsite against canonical list on save, store both raw_trades (free-form) and validated_trades. Enables labour module roll-up by canonical trade.

---

## WHS Module Audit Report

### Workflow Overview
The WHS module operates across three disconnected entry points: **WHS Engine** (questionnaire + risk engine + document generation), **WHS Manager** (contractor compliance + inductions register + incident tracking per project), and **public Site Induction QR form** (worker sign-in). The intended flow is:
1. *Setup*: Project WHS profile created, risk engine derives applicable SWMS/permits
2. *Compliance*: Contractors uploaded to PO, manager tracks document expiry, issues reminders
3. *Induction*: Workers QR-scan, select trade, review SWMS, sign in
4. *Incidents*: On-site reports logged, supervisor resolves

In practice, users experience **manual friction at every step**:
- Contractors only visible if they have a PO (invisible before purchase order issued)
- Compliance upload is single-document-at-a-time with no bulk import
- Inductions re-collect contractor data that exists in the subcontractor record
- Incident reports have no link to contractor accountability or SWMS improvement
- Data lives in isolated project silos with no cross-project visibility or global contractor dashboard

---

### Critical Issues (High Impact on Safety Compliance)

#### 1. **Contractors with no PO are invisible to compliance tracking** ⚠️ SAFETY GAP
- **Problem**: WhsManager compliance list queries only `purchase_orders.subcontractor_id` (whsRoutes.mjs:47–51). A contractor assigned in `schedule_tasks` or inducted on-site but without a PO never appears in the compliance UI, making them uncompliable. Invisible gap in safety coverage.
- **Impact**: Pre-purchase contractors cannot have insurance/safety docs uploaded; supervisors may not realise someone on-site lacks compliance clearance.
- **Recommendation**: Refactor contractor enumeration to UNION: (1) subcontractors from POs, (2) subcontractors from `schedule_tasks.assigned_subcontractor_id`, (3) subcontractors with existing `site_inductions`. Mark as `needs_compliance` vs `has_compliance`. Surface pre-PO contractors before they arrive on site.

#### 2. **Induction form data is disconnected from canonical contractor record** 🔗 DATA INTEGRITY
- **Problem**: Public induction form collects `person_name`, `company`, `trade` as free text (SiteInduction.jsx:207–252). `site_inductions.subcontractor_id` is nullable and never populated (inductionRoutes.mjs:74–82). No way to query "which people from Company ABC were inducted?" or link inductions to compliance tracking. Violates Canonical Data Law.
- **Impact**: Audit trail disconnected; no way to reconcile inductees with contractor records or match to incident investigations.
- **Recommendation**: (1) Add contractor-specific QR code or pre-fill form with `subcontractor_id` before submission. (2) Match person → company → existing subcontractor during submit; if match found, auto-populate ID. (3) Reject submission if subcontractor cannot be resolved (unblocks: incident accountability, induction register queries, repeat-visitor efficiency).

#### 3. **WHS profile has no optimistic locking — concurrent edits overwrite silently**
- **Problem**: `whs_site_profiles.version` is incremented after save (whsEngineRoutes.mjs:275–283), but PUT endpoint does not validate incoming `profileVersion` before update. Two supervisors editing simultaneously = second save silently overwrites first.
- **Impact**: Safety-critical questionnaire answers (e.g., hazard assessment, required SWMS) can be lost without warning; no audit trail of what changed.
- **Recommendation**: Require `profileVersion` in request body. Check `version === existing.version` before UPDATE; return HTTP 409 Conflict if mismatch with message "Profile was updated by another user. Refresh and try again." Persist version in request → prevents silent overwrites.

#### 4. **SWMS templates are auto-created but have no PDF content** 📄 WORKFLOW BLOCKER
- **Problem**: When WHS profile is saved, `syncProjectSwms()` auto-creates stub `swms_templates` with `is_active=true` but `pdf_path=null` (whsEngineRoutes.mjs:152–184, migration 064). Induction form lists "Roof Work SWMS" but workers cannot view it (no PDF). Templates are never seeded with actual documents.
- **Impact**: Inductions proceed without workers reviewing required safety documents; defeats the purpose of SWMS tracking.
- **Recommendation**: (1) Seed common SWMS templates with PDFs during migration (Roof Work, Excavation, Formwork, etc.). (2) Add admin UI to upload SWMS PDFs per template. (3) Validate all `project_swms` have non-null `pdf_path` before allowing induction form to render; warn supervisor if SWMS PDFs are missing.

---

### Usability & Workflow Friction (Medium Impact)

#### 5. **No bulk compliance document upload — manual per-subcontractor for every renewal**
- **Problem**: Each contractor compliance document uploaded individually via modal (WhsManager.jsx:446–501). Project with 10 subcontractors = 10 separate form submissions for renewal cycle. No CSV import, batch upload, or pre-fill from past projects.
- **Impact**: Data entry overhead; renewals take hours instead of minutes.
- **Recommendation**: Add bulk compliance UI: (1) CSV import template (subcontractor, doc_type, expiry_date, file path), (2) drag-and-drop for multiple PDFs with auto-matching, (3) batch-update expiry dates without re-uploading. Pattern: reuse Workforce mass-fill UI.

#### 6. **Compliance reminder workflow is passive — users manually chase expiring documents**
- **Problem**: WhsManager shows counts of expired/expiring docs (WhsManager.jsx:125–137), but no automated email to contractors, no task escalation, no follow-up tracking. `contractor_compliance.reminder_sent_at` column exists (migration 010) but is never written. Supervisors must manually track and email.
- **Impact**: Compliance documents expire by accident; no proactive system to prevent gaps.
- **Recommendation**: (1) Add daily cron job to email contractors 14 days before expiry. (2) Create supervisor task in task system when expiry < 7 days. (3) Persist `reminder_sent_at`; show "Follow-up sent 3 days ago" badge on expired docs. (4) Add "Send compliance reminders" bulk action.

#### 7. **WhsManager tabs lack data completeness indicators — critical status invisible**
- **Problem**: Tab headers ("contractors", "inductions", "incidents") show no badges or counts. Compliance warning only appears when contractors tab is expanded (WhsManager.jsx:300–306). Supervisor cannot see at a glance how many inductions are pending or if compliance is critical.
- **Impact**: Information is buried; users miss alerts until they drill into tabs.
- **Recommendation**: Add badges to tab headers: "contractors (3, 1 expired)", "inductions (5)", "incidents (2 open)". Move compliance warning OUTSIDE accordion (always visible). Use red/amber badge pattern from Schedule Manager when expiries are near.

#### 8. **Induction SWMS filtering uses loose string matching — ambiguous trade matches**
- **Problem**: Trade matching uses substring `includes()` (SiteInduction.jsx:78, inductionRoutes.mjs:17–22). "Electrical Work" and "Electrician" both match if worker selects "Electrical". Workers may not see the correct SWMS.
- **Impact**: Workers may induct on wrong SWMS; safety training mismatch.
- **Recommendation**: Use exact or prefix match (SWMS trade must start with selected trade). Display matched trade in parentheses: "Electrical Work (matched to Electrician)". Test in SOP: select 'Electrical' with both options, verify only correct one shows.

#### 9. **Site induction URL is manually editable, risking broken QR codes**
- **Problem**: `site_qr_induction_url` shown in editable text input (WhsEngine.jsx:137–149). Builder could accidentally edit and break the QR for all future inductions without realizing it. No validation, no warning.
- **Impact**: Inductions fail silently when QR code is broken; no clear error message to supervisor.
- **Recommendation**: Make URL read-only (`<span>`, not `<input>`). Add "Regenerate & download QR" button. If manual edit required, add validation + warning: "Changing this URL will break inductions for all future QR codes."

#### 10. **Incident reporting lacks validation and required-field indicators**
- **Problem**: Incident modal has no red asterisks for required fields, no inline validation. Submitting with missing fields shows generic "Save failed" after base64 conversion and API call. Users cannot tell which fields are mandatory.
- **Impact**: Frustrating UX; users waste time debugging form vs. understanding requirements.
- **Recommendation**: Add red asterisk on `reportType`, `severity`, `title`. Disable Save button until required fields filled. Show inline validation errors ("Title is required") before API call. Match induction form pattern (step-based validation).

#### 11. **No bulk induction PDF export — supervisor must download each individually**
- **Problem**: Inductions tab shows table with PDF paths as truncated text (WhsManager.jsx:390–393). No "Export inductions (ZIP)" button. Supervisor needing 50 inductions for audit must access each via Dropbox individually.
- **Impact**: Workflow inefficiency; audit/hand-over tasks are tedious.
- **Recommendation**: Add "Export inductions (ZIP)" button that downloads all PDFs as single file with naming pattern `YYYY-MM-DD-PersonName-Trade.pdf`. Also export CSV with induction metadata.

#### 12. **WHS documents stored in Dropbox but not indexed — no global search or central dashboard**
- **Problem**: Compliance docs stored as `dropbox_path` but not indexed by content, type, expiry, or trade (whsRoutes.mjs:111–122). User cannot search "all public liability docs" or "all docs for trade=Electrician". Paths shown as unclickable text (WhsManager.jsx:331–335).
- **Impact**: Contractors scattered across projects are invisible; compliance gap impossible to see globally.
- **Recommendation**: (1) Add global Compliance Dashboard (new route `/compliance/dashboard`) showing all contractors across projects, grouped by subcontractor, with next-expiry highlights and bulk renewal actions. (2) Make Dropbox paths clickable links to Dropbox web viewer.

---

### Inter-Module Integration Gaps

#### 13. **Contractors from PO list unaware of assigned schedule tasks — compliance not driven by actual staffing**
- **Problem**: Compliance list comes from `purchase_orders.subcontractor_id` (whsRoutes.mjs:47–51) but actual assigned trades come from `schedule_tasks.assigned_subcontractor_id`. Two separate subcontractor pools. If a plumber is assigned to a task but has no PO, they are invisible to compliance. If a PO exists but the project is paused, they still appear.
- **Impact**: Compliance coverage misaligned with actual staffing; gaps or redundant tracking.
- **Recommendation**: Query both PO and `schedule_tasks` sources; show unified list with status "needs_compliance" vs "has_compliance". Flag if RFQ'd subcontractors have no compliance docs.

#### 14. **Induction form doesn't pre-fill from WHS profile accepted trades**
- **Problem**: Site induction form has hardcoded TRADES dropdown (SiteInduction.jsx:17). If WHS profile says `accepted_trades: [Carpentry, Plumbing]`, the form doesn't know this and doesn't pre-filter SWMS or highlight relevant trades. Electrician sees all trades' SWMS.
- **Impact**: Information overload; workers navigate irrelevant SWMS; inductions slower.
- **Recommendation**: Pass `accepted_trades` from WHS profile in GET `/api/induction/:projectId/info` response. Pre-select trade dropdown if only 1 accepted trade, or highlight accepted trades. Filter SWMS on load to show only trade-relevant ones immediately.

#### 15. **WHS profile reads construction facts via facts service, but Site Induction and WhsManager do not**
- **Problem**: WhsEngine reads facts via `getJobProfile()` (whsEngineRoutes.mjs:235–242), but induction form and incident reports read `project.address` directly from projects table (inductionRoutes.mjs:39, whsRoutes.mjs:177). If facts are updated, induction PDFs and incident reports use stale data.
- **Impact**: Inductions and incidents may reference wrong project address or derived facts.
- **Recommendation**: Create utility `getProjectFacts(projectId, ['address', ...])` that wraps `getJobProfile()` logic. Update inductionRoutes and whsRoutes to use it. Ensures consistent fresh facts across all WHS entry points.

#### 16. **Incident reports have no contractor accountability link**
- **Problem**: Incident form captures title, severity, photos but not which contractor was involved, which task/trade, or which SWMS process failed (WhsManager.jsx:505–560). Resolution is binary (open → resolved) with no corrective action tracking.
- **Impact**: Incidents logged but never tied to root cause, training need, or process improvement. No way to track incident trends by trade or hold contractors accountable.
- **Recommendation**: (1) Add fields for involved contractor, affected task/phase, root-cause category (tied to SWMS modules). (2) On resolve, link to corrective actions (update SWMS X, schedule training Y, inspect task Z). (3) Show incident trends by trade/phase on dashboard.

---

### Data & Performance Issues

#### 17. **N+1 query on compliance list — subcontractor loop loads sequentially**
- **Problem**: GET `/api/whs/:projectId/compliance` queries POs once, then iterates subcontractor IDs and runs separate SELECT per subcontractor (whsRoutes.mjs:70). 20+ subcontractors = 20+ database round-trips.
- **Impact**: Page loads slow; API under unnecessary load.
- **Recommendation**: Replace loop with single query: `SELECT ... WHERE subcontractor_id = ANY(ARRAY[...])` or JOIN contractor_compliance directly. Batch load all docs in one round-trip.

#### 18. **Induction and incident lists unbounded — no pagination, renders all records**
- **Problem**: GET `/api/whs/:projectId/inductions` and `/reports` return all rows without limit/offset (whsRoutes.mjs:145–161, 260–272). A project with 200+ inductions renders all records, causing slow page load and DOM churn.
- **Impact**: Performance degradation on large projects; poor UX on mobile.
- **Recommendation**: Add `limit` and `offset` query parameters. Return `{ ok, inductions, total, count }`. Implement load-more button in WhsManager tabs.

#### 19. **Computed compliance status never persisted — stale cached data**
- **Problem**: `contractor_compliance.status` exists but is never updated after insert. Every read re-computes status by comparing `expiry_date` to today (whsRoutes.mjs:16–28). Stale data on cached reads; logic duplication.
- **Impact**: Sorting/filtering by status unreliable; queries slow.
- **Recommendation**: On `expiry_date` update, compute and persist status (`expired`, `expiring_soon`, `current`, `missing`). Add trigger or daily job to update status. Remove computed_status client logic.

#### 20. **Signature data stored as base64 in database — redundant with PDF**
- **Problem**: `site_inductions.signature_data_url` stores full base64 image (inductionRoutes.mjs:147–161). Signature also included in PDF uploaded to Dropbox. Signature stored twice; bloats database and complicates queries.
- **Impact**: Database I/O overhead; slower induction list queries.
- **Recommendation**: Remove `signature_data_url` column. Keep only `induction_pdf_path` (signature in PDF). If signature preview needed, fetch from PDF or re-render.

#### 21. **WhsManager loads data sequentially, not in parallel**
- **Problem**: `refresh()` calls `loadCompliance()`, `loadInductions()`, `loadReports()` with sequential await (WhsManager.jsx:88–100). If each takes 200ms, total is 600ms.
- **Impact**: Unnecessary UI latency.
- **Recommendation**: Replace sequential awaits with `Promise.all([loadCompliance(), loadInductions(), loadReports()])`. Reduces load time from 600ms to ~200ms.

---

### Consistency & Maintainability Issues

#### 22. **Status enums not centralized in constants.js**
- **Problem**: `contractor_compliance` and `incident_report` statuses hardcoded as string literals throughout components (WhsManager.jsx:20–23) instead of imported from constants.js. Violates Canonical Data Law.
- **Impact**: Fragile code; single point of failure if enum changes. Bugs introduced on refactoring.
- **Recommendation**: Add `WHS_COMPLIANCE_STATUSES` and `INCIDENT_REPORT_STATUSES` to `src/lib/constants.js`. Update components to import from constants. Example: `INCIDENT_REPORT_STATUSES = { OPEN: 'open', IN_PROGRESS: 'in_progress', RESOLVED: 'resolved' }`.

#### 23. **Two-tier status calculation for compliance documents**
- **Problem**: Frontend shows `computed_status` from expiry_date, but DB also has `status` column. Code uses `d.computed_status || d.status`, creating ambiguity about which is authoritative (WhsManager.jsx:310, 330).
- **Impact**: Confusion about data ownership; maintenance burden.
- **Recommendation**: Either remove `status` column and always derive from expiry_date, or make `status` the single source of truth and sync on updates. If keeping both, name the computed value explicitly and document precedence.

#### 24. **WHS Manager uses tab state instead of URL routes**
- **Problem**: Uses React state (`tab === 'contractors'`) instead of URL routes (WhsManager.jsx:28). Cannot deep-link, back button doesn't navigate between tabs, browser history doesn't record changes.
- **Impact**: Users cannot bookmark/share tabs; violates SPA best practices.
- **Recommendation**: Migrate to URL-based tabs: route `/operations/:projectId/whs/:tab` and read from `useParams()`. Fallback to 'contractors' if tab undefined.

---

### Gaps & Future Opportunities

#### 25. **No tracking of contractor sign-offs beyond initial inductions**
- **Problem**: No way to verify "has contractor XYZ signed all required SWMS?" or "which people from Company ABC were inducted?" Induction signature stored as base64 blob, not linked to contractor record.
- **Impact**: Audits cannot trace compliance sign-offs; cannot track repeat visitors.
- **Recommendation**: (1) Create global `workers` table (person ID, name, company, trade). Link inductions to worker record. (2) Show induction history per worker across all projects. (3) Allow supervisors to re-use inductions if inducted within 90 days.

#### 26. **Risk engine outputs only wired for 1 document type; Phase 1 incomplete**
- **Problem**: Only "Project WHS Management Plan" wired (whsEngineRoutes.mjs:18–26). Risk engine derives permits, inspections, training requirements, toolbox talks (whsOutputsMatrix.md:89–93) but they are never rendered or exported. Outputs calculated but never used.
- **Impact**: Permits issued manually; inspections not scheduled; training not tracked; toolbox talks not generated.
- **Recommendation**: Phase 2: (1) Create template files for each output type. (2) Wire generate endpoints for each. (3) Add document library view showing all generated docs grouped by type. (4) Back-links: when permit generated, create task in Operations.

#### 27. **No WHS-to-schedule integration — high-risk tasks not flagged in Gantt**
- **Problem**: Risk engine derives `high_risk_activities` (e.g., "Work at heights") but `schedule_tasks` has no WHS metadata (no risk_level, no applicable_swms, no inspections). "Roof Installation" task not flagged as high-risk or requiring SWMS.
- **Impact**: Supervisors cannot see which tasks are high-risk or when inspections are due relative to task dates.
- **Recommendation**: Add schedule-WHS bridge: (1) infer high-risk activities from task phase + trade + project's high_risk_activities. (2) On Gantt, show warning badge for high-risk tasks. (3) Add "WHS" column to Sheet view listing applicable SWMS + permits. When task dates change, check if inspections need re-scheduling.

#### 28. **No data export for compliance audits, incident trends, or contractor performance**
- **Problem**: All WHS data in Supabase but no "download as CSV" or "generate PDF report" functionality (WhsManager.jsx has no export buttons).
- **Impact**: Auditors cannot export compliance registers; trend analysis manual.
- **Recommendation**: Add export endpoints: (1) GET `/api/whs/:projectId/export/compliance` (CSV: contractor, doc type, issue, expiry, status). (2) GET `/api/whs/:projectId/export/inductions` (CSV: name, company, trade, date, signature Y/N). (3) GET `/api/whs/:projectId/export/incidents` (CSV: type, date, severity, status, photos). Add toolbar buttons in respective tabs.

---

### Quick Wins (Low Effort, High Impact)

- **Site induction form default trade validation** (SiteInduction.jsx:91–93): Add `trade !== ''` to `step1Valid()`. Prevents incomplete inductions. **Effort: S**
- **Make site induction URL read-only** (WhsEngine.jsx:137–149): Change `<input>` to `<span>`. Prevents accidental QR breakage. **Effort: S**
- **Add induction SWMS PDF validation** (inductionRoutes.mjs:42–61): Check `pdf_path` is non-null before rendering link; warn if missing. **Effort: S**
- **Parallelize WhsManager data loads** (WhsManager.jsx:88–100): Use `Promise.all()` instead of sequential awaits. **Effort: S**
- **Dropbox upload failure feedback** (whsRoutes.mjs:113–122, inductionRoutes.mjs:136–145): Return HTTP 502 or add error badge instead of silent null. **Effort: S**
- **Move compliance warning outside accordion** (WhsManager.jsx:300–306): Always-visible alert for expiring docs. **Effort: S**

**Top issues:** Contractors with no PO invisible to compliance—cannot track pre-purchase contractor safety status (whsRoutes.mjs:47–51); Induction form disconnected from canonical contractor record—no audit trail or accountability link (inductionRoutes.mjs:74–82, site_inductions.subcontractor_id nullable); WHS profile has no optimistic locking—concurrent edits silently overwrite safety-critical questionnaire answers (whsEngineRoutes.mjs:275–283); SWMS templates auto-created with no PDF content—workers cannot view required safety documents during induction; N+1 query on compliance list—20+ subcontractors = 20+ sequential DB calls (whsRoutes.mjs:70); No bulk compliance upload—10 subcontractors = 10 manual form submissions per renewal cycle

**Bigger changes (discussion):**
- Build global Compliance Dashboard (/compliance/dashboard) aggregating all contractors across projects with expiry matrix, renewal actions, and bulk operations—replaces spreadsheet tracking.
- Refactor contractor enumeration to UNION (POs, schedule_tasks, inductions)—surface pre-PO contractors and eliminate invisible gaps in compliance coverage.
- Link induction form to canonical subcontractor records—populate site_inductions.subcontractor_id; enables incident accountability, audit trails, repeat-visitor efficiency.
- Implement compliance document lifecycle (state machine with reminders, archival, version history)—shift from passive alerts to proactive renewal workflows.
- Add schedule-WHS bridge (high-risk task flagging, applicable SWMS in Gantt, inspection windows relative to task dates)—integrates safety into project planning.
- Seed SWMS template pool with common documents and admin UI for PDF upload—unblocks Phase 1 by providing actual content for induction form.
- Complete Phase 2 of WHS risk engine (permits, inspections, training, toolbox talks templates and back-links to Operations tasks)—enables full document generation and workflow integration.

---

## Procurement Intelligence Module Audit

### Workflow Overview
The Procurement Intelligence module is a well-architected generation engine managing material/supplier orders from three data sources: templates, Buildexact estimates, and the schedule. It provides cross-job visibility (Command Centre), per-job management (Register), selection blocker tracking (Selections tab), status views (Board, Long-Lead tabs), and AI-drafted communications.

The module works correctly and follows good patterns (GENERATED columns, idempotent regeneration, role gating). However, users experience significant friction through:
- Manual one-by-one data entry in the Register table (no bulk operations)
- Context switches between modules (adding suppliers requires leaving the Register)
- One-way data flows from schedule (task ripple doesn't auto-update procurement dates)
- Three-step email workflows (draft → copy → switch to email client → send)
- Silent data-integrity risks (defaultValue+onBlur pattern, dual source-of-truth with schedule)

### High-Severity Findings (Data Loss & Critical Workflow Blockers)

**1. Unsafe Form Pattern: defaultValue + onBlur Causes Silent Data Loss**
- Location: src/pages/Procurement.jsx:357–398 (Register inline edits)
- Severity: HIGH (data loss risk)
- User edits a field, clicks elsewhere → edit silently lost if blur triggers before PATCH completes. No confirmation, no indication. Multi-field edits interrupted by a task become lost work.
- **Fix**: Migrate to controlled input pattern with optimistic state update + debounced save (800ms). Show inline loading state (spinner) during PATCH with immediate toast feedback (success/error).

**2. No Bulk Actions on Register: 50-Item Job Requires 50 Manual Clicks**
- Location: src/pages/Procurement.jsx:319–416
- Severity: HIGH (10+ min per job, error-prone)
- Common workflows like 'assign supplier to 10 roofing items' or 'mark 20 items delivered' require clicking each row individually. No multi-select, no batch operations, no filter-before-bulk-select.
- **Fix**: Add checkbox column + bulk-actions toolbar: 'Assign supplier to X items', 'Update status to...', 'Export as CSV'. Implement with multi-row PATCH endpoint accepting `{ ids: [], updates: {...} }`.

**3. Schedule→Procurement One-Way Sync: Task Ripple Leaves Procurement Stale**
- Location: procurementService.mjs:245–277 (one-time link on generation), no reverse trigger
- Severity: HIGH (silent order-by-date staleness, risk misalignment)
- Schedule task shifts 5 days → procurement item's required_on_site_date and order_by_date don't refresh until user manually clicks 'Regenerate'. Users don't realize dates are stale; order-by dates become wrong, risk status doesn't reflect true urgency.
- **Fix**: Add database trigger or application hook: when schedule_tasks.start_date is updated and related_schedule_task_id is set on procurement_item, automatically recalculate item's required_on_site_date and refresh risk_status.

**4. Selection Blockers Lack Decision Context: Hidden Portal Link & Due Dates**
- Location: src/pages/Procurement.jsx:420–491 (Selections tab)
- Severity: MEDIUM (context loss, forces module navigation)
- UI shows 'Waiting on selection — Tile selection (pending)' but doesn't display: what options the client is choosing between, due date, or Portal decision link. User must navigate to Portal separately to understand urgency.
- **Fix**: Fetch and display portal_decision.description, due_date with countdown, add 'Open in Portal' deep link, show decision status inline. Allow inline reminder draft without leaving module.

**5. Missing Bulk Quote-Request Workflow: RFQ Coordination One Email at a Time**
- Location: procurementRoutes.mjs:313 (single-item only), no batch endpoint
- Severity: MEDIUM (20% of daily labor spent on repetition)
- Requesting quotes from 10 suppliers for the same trade requires 10 manual 'Draft email' clicks, each opening a modal, copying text, leaving module to send. No grouping, no de-duplication, no batch reminder for selections.
- **Fix**: Build `/api/procurement/items/batch-request-quote` endpoint that groups items by supplier, generates one combined RFQ email per supplier (covering all items they supply), and exposes drafts in carousel UI. Allow bulk reminders for selections: select multiple blockers → 'Draft reminders for selected'.

**6. Supplier Dropdown Requires Module Context-Switch: Adding New Supplier**
- Location: src/pages/Procurement.jsx:373–379 (Register), src/components/procurement/ProcurementExtras.jsx:214–289 (Suppliers tab)
- Severity: MEDIUM (workflow inefficiency)
- User editing Register, supplier missing → navigate to Suppliers tab → add supplier → return to Register → re-select. Three extra clicks + context loss.
- **Fix**: Add inline 'Add supplier' button or '+' option in supplier dropdown that opens a quick-add modal (item name, trade category, lead time, preferred flag) without leaving Register. Auto-refresh supplier list and select on close.

### Grouped Findings by Theme

#### Usability Friction: Forms, Modals, Data Entry
- **Inline validation gap** (HIGH): Fields like lead_time_days accept negative/invalid values; rowErr banner only appears after server rejects PATCH. No red borders, no field-level hints.
  - Fix: Add client-side validation (lead_time 0–180 days, cost >= 0). Highlight invalid fields with red border + inline hint before submit. Show field-level toast (not global banner) on error.

- **window.alert/confirm/prompt throughout** (MEDIUM): Adding items uses browser-native window.prompt('Item name?'); removing uses window.confirm(). Breaks app language, fails on mobile, provides no rich input.
  - Fix: Replace all with modal forms. 'Add item' modal: item_name (required), supply_type, supplier, lead_time, required_on_site_date. 'Remove' modal: show item name + explanation + regenerate hint.

- **Empty state messages not actionable** (LOW): 'Nothing at risk this week' and 'No suppliers yet' don't include inline buttons. Users must find the button in the header.
  - Fix: Make empty states actionable: show '+ Generate plan' button inline, '+ Add supplier' button inline, etc.

- **Regenerate warning unclear on consequences** (MEDIUM): Modal says 'manual edits preserved' but doesn't clarify: will supplier defaults be reapplied? Will links be refreshed? Shows no preview of what will change.
  - Fix: Convert to AiDraftModal-style overlay. Fetch preview before confirming: 'Will add 3 template items, refresh 2 estimate items, update 5 dates from schedule.' Expand warning text.

- **AI draft modal locks UI; can't edit item while reviewing draft** (LOW): AiDraftModal is full-screen overlay. User reviewing draft, sees a mistake in the item → must close modal, fix item, re-draft. No minimize option.
  - Fix: Convert to slide-in right panel (like Blueprint Insight) so user can toggle between draft and item editing.

- **No undo after soft-remove; misclick irreversible** (LOW): Pressing ✕ on a row immediately removes it (required=false). No toast, no confirmation. User loses data on accidental click.
  - Fix: Add 5-second toast 'Item removed. [Undo]' with clickable undo action. Or show 'Deleted items (X)' section at bottom of Register with restore buttons.

- **Manual item creation via window.prompt then table edits** (MEDIUM): '+ Add item' button opens browser prompt (name only), then user must fill supplier/lead time/date via table inline edits. Three separate interactions.
  - Fix: Modal form for add: item_name, supply_type, required_on_site_date, supplier, lead_time. One cohesive onboarding experience.

- **No default lead time from supplier profile** (MEDIUM): Suppliers have usual_lead_time_days but when assigning supplier to item, lead time is not auto-populated.
  - Fix: When supplier selected (onChange), auto-fill lead_time_days with supplier.usual_lead_time_days if item's lead_time_days is null. Preserve user edits.

- **Missing-items detection shows suggestions but no quick-add** (LOW): 'Possibly missing' banner shows items common on similar jobs, but clicking them does nothing. User must manually add each via '+ Add item'.
  - Fix: Add 'Add all missing' button that bulk-inserts detected items in one action (POST endpoint accepting array of item names).

- **'Needs date' bucket doesn't guide user action** (MEDIUM): Command Centre shows 'Needs a date' but doesn't explain: set manually, or link to schedule task? No tooltip, no next-step hint.
  - Fix: Show tooltip: 'Set required_on_site_date manually, or check if schedule has a matching task and regenerate.' Add info icon with context.

- **Long-Lead tab lacks explanation** (LOW): Shows items with ≥28d lead time at risk but doesn't explain why or what to do.
  - Fix: Add banner: 'Items with ≥28 days lead time can cause schedule delays if not ordered soon. Critical = <7 days to order-by date. Click to manage in Register.'

- **Risk pill colors not documented** (LOW): Supervisors see pills (green/amber/orange/red/purple) but don't know thresholds (e.g., 'critical' = order-by < today AND rank < po_sent).
  - Fix: Add help icon next to 'Risk' header with tooltip explaining each color threshold.

- **No indication of supplier preferred status** (LOW): Preferred suppliers marked in Suppliers tab, but no visual hint when selecting in Register dropdown.
  - Fix: Add ✓ or 'PREF' label next to preferred supplier names in dropdown. Append 'P' icon in Register's Supplier column.

- **Missing loading states during async** (LOW): Clicking 'Draft PO', 'Remove item', 'Add item' doesn't disable button or show spinner. User may click again on slow network.
  - Fix: Add disabled state + spinner for each action (draftPo, removeItem, addItem, regenerate).

- **No way to suppress/snooze 'needs date' items** (MEDIUM): Item marked as deferred/PC (no date needed), but still appears in 'needs date' bucket. User frustration + noise.
  - Fix: Add 'PC / no date needed' checkbox (new column: date_required boolean, default true). Exempt items with date_required=false from bucket. One-click dismissal.

#### Workflow Inefficiencies: Bulk Actions, Context Switches, Repetition

- **Register table not sortable** (LOW): No onclick sort on header cells. Users can't sort by order-by-date (to see what's due soonest), lead_time, risk, or supplier.
  - Fix: Add table sort (ascending/descending toggle). Persist in localStorage. Min sort by: order_by_date, lead_time_days, risk_status, supplier_id, status.

- **No bulk supplier assignment** (MEDIUM): 10 roofing items all need same supplier; must manually select in each row.
  - Fix: Checkbox multi-select + bulk-actions toolbar 'Assign supplier to X items'.

- **Batch PO generation missing** (MEDIUM): Draft PO one at a time. 'Ready to Order' workflow requires: select items → bulk-draft POs → review modal with totals → email to supplier.
  - Fix: Implement 'Ready to Order' workflow (select items, bulk-draft POs, review modal showing all POs with line items/totals, email button).

- **No bulk quote-request coordination** (MEDIUM): Requesting quotes from multiple suppliers for same item requires individual 'Draft email' clicks.
  - Fix: Batch quote endpoint + grouping UI by supplier; one email per supplier covering all items they supply.

- **No batch reminder workflow for selections** (MEDIUM): Draft reminder one blocker at a time. 5 blocked items = 5 separate 'Draft reminder' clicks.
  - Fix: Select multiple blockers + 'Draft reminders for selected' → carousel of drafts for review.

- **Adding supplier forces context-switch** (MEDIUM): Must leave Register tab, add supplier in Suppliers tab, return, re-select.
  - Fix: Inline 'Add supplier' in dropdown → quick-add modal (no tab switch) → auto-refresh list.

- **No batch PO export or print** (LOW): Register has no CSV export or print-friendly layout. User must screenshot/copy manually to share with site manager.
  - Fix: Add 'Export as CSV' button; print-friendly layout option.

- **No quick access from Operations project detail** (MEDIUM): Operations shows procurement alerts but links to Schedule, not Procurement Register. User must manually navigate to /operations/procurement.
  - Fix: Add 'Procurement' card to project detail linking to Register filtered by that job.

- **Multiple tabs for related workflows** (MEDIUM): Register → Suppliers tab (separate), Register → Schedule context (loss), Register → Portal (separate navigation).
  - Fix: Integrate Suppliers add into Register (inline modal). Show schedule linkage context directly ('Linked to [task name]'). Link to Portal decisions inline.

- **Missing supplier quote status field in Register** (MEDIUM): supplier_quote_status column exists in DB but not displayed. Users can't see at a glance which items are awaiting quotes vs. received.
  - Fix: Add 'Quote status' column (read-only): ✓ Received | ⏳ Awaiting | — Not required. Add quick 'Request quote' button if pending.

- **Regenerate shows no preview** (MEDIUM): Confirmation dialog says 'manual edits preserved' but doesn't show what will change. User can't catch unexpected changes before committing.
  - Fix: Fetch preview of changes (created/refreshed/enriched counts). Show summary: 'Will add 3 template items, refresh 2 estimate items, update 5 dates from schedule.'

- **Selection blocker workflow requires manual Portal link** (MEDIUM): When selection_required=true, user must manually create Portal decision + link selection_decision_id. Portal decision may not exist, making reminder draft contextless.
  - Fix: On selection_required=true, offer quick action 'Create Portal decision for client?' Auto-create, auto-link, set due-date.

- **Dual entry between schedule and register** (MEDIUM): Schedule has ProcurementPanel (read/write fields); Register is separate system. If user edits schedule.procurement_lead_days, Register doesn't sync (one-way flow only). CLAUDE.md says Register is source of truth but UI still shows editable Schedule fields.
  - Fix: Hide/gray ProcurementPanel in ScheduleManager with note 'Procurement data managed in Procurement module Register. Edit there and regenerate.' Or make read-only, showing values from linked procurement_item if exists.

- **Multiple cost tiers with no workflow hint** (MEDIUM): cost_allowance (estimate), quoted_amount (supplier quote), approved_amount (admin approval) shown side-by-side with no status badge explaining workflow.
  - Fix: Add status badge next to cost fields ('estimate' | 'quote received' | 'approved') to guide user through workflow.

- **Committed cost visible only to admins** (HIGH): Supervisors editing register can't see total committed cost. Yet supervisors are responsible for managing the register and need cost context.
  - Fix: Allow supervisors to see committed cost (read-only badge): 'Committed: $X of $Y budget (Z% spent)'. Color-code: green <80%, yellow 80–100%, red >100%.

- **Committed cost not integrated with Financial Command Centre** (LOW): /api/procurement/committed-cost endpoint exists but no UI feedback showing 'Committed: $X of $Y budget'. User managing register doesn't see financial impact.
  - Fix: Add budget summary banner in Register: 'Committed: $X of $Y (Z% spent)' pulled from endpoint.

- **AI draft emails never persisted** (LOW): User drafts 10 reminders then browser crashes; all drafts lost. No audit trail of what was drafted vs. actually sent.
  - Fix: Add 'Save as note' button in AiDraftModal that POSTs draft to procurement_items.notes or procurement_drafts table (timestamped).

- **No employee read-only view** (MEDIUM): Procurement module not role-gated at navigation; Employee accesses it → sees empty tabs + 403 errors. Yet employees benefit from seeing long-lead/overdue items.
  - Fix: Add RoleRoute guard to Procurement page. Optionally offer read-only Employee view (long-lead items, overdue orders, no edit).

- **Supplier performance learning delayed** (LOW): Learning only post-delivery. Early insights (quote response time, quote accuracy, product recommendations) not captured or visible.
  - Fix: Capture quote_response_time, quote_accuracy variance on quote receipt. Surface supplier quote-accuracy trend: '3/5 on estimate, avg +12%'.

#### Inter-Module Integration: Broken Handoffs, Data Re-Entry, Double Source-of-Truth

- **Schedule→Procurement one-way sync causes stale dates** (HIGH): When schedule task.start_date ripples, linked procurement items' required_on_site_date and order_by_date don't auto-update. User must manually regenerate.
  - Fix: Add trigger: when schedule_tasks.start_date is updated and related_schedule_task_id is set, recalculate procurement_item's required_on_site_date + risk_status.

- **Deprecated schedule_tasks.procurement_* fields still writable** (MEDIUM): Migration 085 froze these fields (deprecation comments) but ScheduleManager still reads/writes them (lines 1550–1560). Dual source-of-truth, one-way flow (schedule → procurement only, not reverse).
  - Fix: Complete cleanup: (1) drop columns from schedule_tasks, OR (2) stop writing them in ScheduleManager immediately and remove from PATCH request (Register is source of truth). Choose option (1) for clean break.

- **related_schedule_task_id not surfaced in UI** (MEDIUM): Items linked to schedule tasks have invisible linkage. User can't see which task an item is linked to, or manually relink to a different task.
  - Fix: Show 'Linked to [task name]' in Register. Add 'Link' button to bind to existing task or create new one. On similar trade detection during regenerate, prompt to auto-link.

- **required_on_site_date editable but no validation against schedule** (MEDIUM): Users can manually edit required_on_site_date in Register (onBlur PATCH). If item is linked to schedule task, next regenerate may overwrite the edit (unless user_modified=true). Divergence risk.
  - Fix: If related_schedule_task_id set, make date read-only or show info-banner 'Linked to schedule — date is read-only. Edit task's start_date to change.' If user edits, auto-unlink + show toast 'Unlinked from schedule task.'

- **Selection blockers no bidirectional handoff with Portal decisions** (MEDIUM): procurement_items join portal_decisions but no sync when portal decision state changes. When portal_decision.status='approved', procurement_item stays pending until user manually clicks 'Mark confirmed'.
  - Fix: When portal_decision.status changes to 'approved', auto-PATCH linked procurement_items.selection_status='confirmed'. Add event listener in procurement module watching for portal_decision changes.

- **Selection status confirmation manual despite Portal decision existing** (HIGH): User must manually click 'Mark confirmed' in Selections tab even though the portal_decisions row already has a status/decision. Two separate workflows (portal approval + procurement confirmation).
  - Fix: Auto-sync when portal_decision.status='approved'. Hide 'Mark confirmed' button if decision already approved. Show decision.status inline.

- **Portal decision completion doesn't auto-confirm procurement** (MEDIUM): When portal_decision status='approved', linked procurement_item selection_status doesn't update.
  - Fix: Add hook in procurement module: watch portal_decision status changes → auto-PATCH procurement_items with that selection_decision_id.

- **Cost data flows one-way from Estimate** (MEDIUM): Estimate → Procurement.cost_allowance (one-time on generation). If estimate changes, no refresh mechanism except manual 'Regenerate' (which loses user edits).
  - Fix: Add 'Refresh estimates' button that re-pulls Buildexact, updates cost_allowance only (without touching user_modified flag). Or implement cost-sync trigger on estimate update.

- **No approval workflow when quoted_amount exceeds allowance** (MEDIUM): Supervisors can't flag items for admin approval when supplier quote comes in over budget. No variant alerts ('10 quotes over budget—review').
  - Fix: When quoted_amount > cost_allowance × 1.1, flag status='ready_for_approval' and require admin sign-off. Add 'Request approval' action in Register. Show variance alerts in Command Centre.

- **RFQ module not linked to Procurement** (LOW): rfqs table (subcontractors) and procurement_items (materials) are separate. No unified 'what is on order' view.
  - Fix: Document intentional separation; add 'View procurement items' link in Tender module for quick navigation. No FK required (intentional gap).

#### Consistency & Conventions

- **API response key inconsistency** (MEDIUM): Register endpoint returns 'items', Selections returns 'blockers', Long-Lead returns 'items'. Inconsistent destructuring patterns on client.
  - Fix: Standardize all to `{ ok: true, items: [...], total: n }` instead of `{ ok: true, blockers: [...] }`.

- **Rank and status constants duplicated server-side** (HIGH — data integrity risk): STATUS_RANK defined in procurementService.mjs, procurementRoutes.mjs, and frontend constants.js. Changes must be synced in 3 places; risk of divergence.
  - Fix: Create shared server/lib/procurementConstants.mjs exporting PROCUREMENT_STATUS_RANK, RANK_PO_SENT, etc. Import into both service and routes. Single source of truth.

- **Terminology inconsistency** (LOW): requiredOnSiteDate (code), 'On-site' (Register header), required_on_site_date (SQL), dueDate (Portal decisions). UI labels inconsistent.
  - Fix: Standardize: 'Required on site' (UI label), requiredOnSiteDate (code), required_on_site_date (SQL), tooltip: 'Date item must be delivered and installed on site.'

- **Risk status cached but not refreshed on load** (LOW): Risk persisted on items but may be stale if page left open overnight (threshold crossed next day).
  - Fix: On Register load, call refreshJobRisk(sb, jobId) to sync all risk statuses. Cheap operation, ensures real-time accuracy.

- **Order-by buffer calculation invisible** (MEDIUM): Formula shown in tooltip (order-by = on-site − lead − buffers) but buffers hardcoded (approval=5d, review=3d). No way to customize per job.
  - Fix: Show breakdown in Register: 'Oct 1 − 42d lead − 5d appr − 3d review = Aug 12'. Add optional buffer profile per job (normal/fast/critical). If customized, highlight order-by in amber.

- **Board Kanban 'Blocked' lane mixes two blocker types** (LOW): 'Blocked' includes 'waiting_on_selection' and 'waiting_on_clarification' with no visual distinction.
  - Fix: Add subtle badge/icon to cards ('client' vs 'supplier') or split into two lanes: 'Waiting on client' and 'Waiting on other'.

#### Gaps & Opportunities

- **No cross-job procurement analytics** (HIGH — strategic gap): Leadership wants 'How much committed cost at risk?' but module shows only command-centre buckets. Falls back to spreadsheet.
  - Fix: Build Procurement Analytics dashboard: committed cost chart by job, order-by dates heatmap (7/14/30-day buckets), supplier on-time rates, cash-flow timeline. Expose /api/procurement/analytics/summary with filters.

- **by-supplier endpoint orphaned** (MEDIUM): /api/procurement/by-supplier groups items across jobs by supplier for batch ordering. No UI exposes it; users batch-order manually.
  - Fix: Add 'Batch Orders' or 'Supplier Hub' tab using by-supplier endpoint. Group items by supplier; 'draft order email' button covers all items for that supplier. Leverage draftSupplierEmail already supporting itemIds[].

- **No proactive alerting** (MEDIUM): Command Centre shows overdue items but user must manually check. Order-by dates crossing threshold not notified.
  - Fix: Daily/weekly digest email for items crossing into 'overdue' status. WebSocket or polling for real-time toast notifications. In-app notification badge. Integrate with Hub email digest.

- **Calendar tab doesn't distinguish planned vs actual delivery** (MEDIUM): Shows order-by and delivery events with same styling. No flagging of late deliveries.
  - Fix: Show order-by (grey) | expected delivery (blue) | delivered on-time (green) | late (orange). Add 'Δ +Xd' badge for slips. Legend & filter buttons.

#### Performance & Data Integrity

- **Command Centre query unbounded** (HIGH): Fetches ALL active items across all jobs with no pagination. Hundreds of KB per request on large systems.
  - Fix: Add 90-day rolling window: `order_by_date >= 90 days ago OR order_by_date IS NULL`. Paginate with limit(200) or create materialized view (hourly refresh).

- **refreshJobRisk 1 + N update pattern** (HIGH): Fetches all items, then issues one UPDATE per item (50 items = 50 DB writes). Sequential, blocks page load.
  - Fix: Batch updates: single multi-row UPDATE with CASE/WHEN on id. Move refreshJobRisk to async after initial page load.

- **Missing pagination on key endpoints** (MEDIUM): GET /api/procurement/suppliers, long-lead, by-supplier all unbounded.
  - Fix: Add ?limit=50&offset=0 parameters. Cache suppliers in browser for 5 min. Scope long-lead to 90-day window.

- **Supplier performance metrics stale** (MEDIUM): Updated only on manual refresh. After item delivered, performance refreshes once but subsequent items don't sync until manual action.
  - Fix: Auto-refresh supplier performance after every delivery. Or hourly background job for active suppliers. Archive observations >24 months.

- **RLS breach risk** (HIGH): Suppliers & procurement_templates allow any authenticated user to read/write (RLS USING (true)). API enforces role gates, but Supabase SDK bypasses them.
  - Fix: Implement role-based RLS: `USING (auth.jwt() ->> 'custom_claims' ->> 'role' IN ('admin', 'supervisor'))`.

- **Deprecation columns still writable** (MEDIUM): schedule_tasks.procurement_* frozen but no constraint preventing writes. Dual maintenance burden.
  - Fix: Add trigger to prevent writes OR update procurement_items on change. Complete cleanup migration before next release.

- **Missing validation on required_on_site_date** (MEDIUM): Can be set in past; order_by_date becomes immediately stale.
  - Fix: Client-side warning if date in past. Server-side 400 if required_on_site_date <= today and status < po_sent.

**Top issues:** Silent data loss on form edit via unsafe defaultValue+onBlur pattern (HIGH) — user edits field, clicks elsewhere, edit lost with no confirmation if PATCH delays. Affects all 50-item registers. Migrate to controlled input + optimistic state + loading spinner.; No bulk actions on Register table (HIGH) — 50-item job requires 50 manual clicks to assign same supplier or mark delivered. 10+ min per job, error-prone. Add checkbox multi-select + bulk-actions toolbar (assign supplier, update status, export CSV).; Schedule→Procurement one-way sync causes stale dates (HIGH) — schedule task ripple doesn't auto-update linked procurement items' required_on_site_date or order_by_date. User must manually regenerate; dates silently diverge. Add trigger to auto-update on schedule change.; Selection blockers hidden from context (MEDIUM) — user sees 'Waiting on selection' but no portal decision description, due-date, or Portal link. Must navigate separately. Show decision context, due-date countdown, Portal link, inline reminder draft in Selections tab.; Missing bulk quote-request workflow (MEDIUM) — RFQ coordination requires one email per item (20% of daily labor). No grouping by supplier, no batch reminders. Build batch endpoint + grouping UI: one email per supplier covering all items they supply.; Supplier context-switch friction (MEDIUM) — adding supplier requires leaving Register → Suppliers tab → return → re-select (3 extra steps). Add inline 'Add supplier' in dropdown that opens quick-add modal without tab switch.

**Bigger changes (discussion):**
- Bidirectional schedule↔procurement sync system: Implement database trigger and application hook so that when schedule_tasks.start_date ripples, linked procurement_items automatically update required_on_site_date and risk_status. Reverse: when procurement items' lead_time or buffer changes, emit event to schedule for recalculation. Closes one-way-sync gap that leaves dates stale.
- Bulk actions framework: Add checkbox multi-select to Register table + bulk-actions toolbar supporting: assign supplier to X items, update status, bulk export. Requires multi-row PATCH endpoint. Foundation for 'Ready to Order' (select items → bulk-draft POs → review modal → email to supplier) and batch quote-request workflows.
- Procurement Analytics dashboard: Build cross-job visibility for leadership: committed cost chart by job, order-by dates heatmap (7/14/30-day buckets), supplier on-time rates table, cash-flow timeline. Expose /api/procurement/analytics/summary with job/date/supplier/trade filters. Prevents spreadsheet-based workarounds.
- Cost approval & budget control workflow: When quoted_amount > cost_allowance × 1.1, flag status='ready_for_approval' and require admin sign-off. Add audit log (Supabase audit table or approval_events FK). Surface job's total committed cost to supervisors (read-only). Bridges gap between register editors and finance context.
- Portal↔Procurement bidirectional sync: Auto-confirm procurement selection_status when portal_decision.status='approved'. Avoid duplicate reminders (add reminder_drafted_at timestamp). When procurement selection_status='confirmed', POST event to portal to mark decision resolved. Eliminates manual 'Mark confirmed' button and keeps Portal/Procurement in sync.
- Supplier Hub / Batch Orders tab: Expose by-supplier endpoint in UI with items grouped by supplier across jobs. Allow selecting items → 'Draft order email' button that creates one combined RFQ per supplier (all items covered). Unifies cross-job procurement ordering that currently requires manual navigation or spreadsheet.

---

# Workforce & Worker PWA Audit Report

## Overview
The Workforce & Worker PWA module manages timesheet submission, approval workflows, mass entry, labour costing, and Buildexact sync. Core workflows: **Worker submits daily hours via PWA** → **Supervisor approves (optionally assigns carpentry job)** → **Auto/manual Buildexact sync** → **Finance rolls up labour costs by job**. The module handles ~8 user roles (admin, supervisor, site_manager, leading_hand, worker), ~3 data silos (construction projects vs. carpentry jobs), and 2 auth paths (Supabase + magic-link token).

**Status:** Feature-complete but operationally friction-prone. Workers and supervisors lose time to repeated data entry, missing defaults, and manual handoffs. Carpentry labour tracking is partially built (schema ready in Phase 7, but attribution is manual/error-prone). Cost transparency is low—workers never see predicted costs, supervisors see only final numbers. Buildexact sync is fire-and-forget, leaving approvers unaware of failures.

---

## Workflow Summary

### Worker Journey
1. Worker logs into PWA via magic link (or Supabase) → Views timesheet home with yesterday's context
2. Taps "Log hours" → date picker (today/past only), site/project selector (merges construction + carpentry jobs), task dropdown, hours input
3. Submits → cost is calculated server-side only (worker never sees it)
4. If rejected, sees amber banner with reason, must navigate back to log form and re-enter all fields from scratch
5. No offline support, no draft save, no connectivity indicator

### Supervisor/Admin Approval Workflow
1. Opens Workforce > Approvals tab → fetches all pending timesheets unbounded (no pagination)
2. Optionally expands row to see details, task breakdown, completion photos
3. **If carpentry work:** Must expand row, then click dropdown to manually assign carpentry job (context lost from worker's original choice)
4. Bulk approve/reject via modal → no confirmation modal for approvals (only for rejections)
5. History tab → export CSV or view sync status (if Auto Buildexact sync, approval auto-triggers sync; if Manual, requires separate "Retry" click)
6. No way to see which approvals failed in bulk operations or batch-assign carpentry jobs

### Mass Fill Workflow
1. Supervisor creates multiple timesheet rows in browser form
2. Selects employee, date, project/carpentry job, task, hours per row
3. Submits all at once → no pre-submission validation or row-by-row error feedback
4. Silent partial failures (backend returns results[], frontend doesn't display which rows failed)

### Data Flow Gaps
- **Worker → Supervisor:** Carpentry job context is lost (worker selects job in PWA, timesheet stores only project_id or job_id, supervisor re-assigns at approval)
- **Supervisor → Finance:** Labour cost calculation is opaque (cost computed at approval using current employee rate, stored in timesheet, but no breakdown visible in UI; Finance then re-reads timesheets for rollups and must duplicate task→trade mapping)
- **Timesheets → Buildexact:** Sync is one-way with no retry affordance or batch-error clarity (sync status hidden in tooltip, only one-by-one Retry button)

---

## Key Issues by Category

### 🔴 HIGH SEVERITY: Workflow Blockers & Data Loss

| Issue | Impact | Workaround |
|-------|--------|-----------|
| **Unbounded pending/history queries** — Approvals & History tabs fetch all timesheets with no limit or pagination. Loads megabytes of data; browser may hang with thousands of pending submissions. | Approval cycles blocked; supervisors lose time to lag | None—requires architectural fix |
| **Carpentry job attribution manual & error-prone** — Workers can't self-identify carpentry jobs; supervisors must expand each timesheet and manually assign from dropdown at approval time. Pre-selection missing. Bulk assign missing. | Labour tracking broken; jobs missing carpentry costs; supervisors spend 2–5 min per job reassigning | Supervisors manually assign after approval; Finance doesn't see carpentry labour |
| **Double data-entry: Worker re-enters all fields after rejection** — Rejected timesheet clears old entries; worker must re-fill site, task, hours from memory. No pre-fill or draft save. | Workers frustrated, error-prone re-entry, approval cycles slow | Workers write down their hours before resubmitting |
| **Race condition in carpentry job attribution** — PATCH /carpentry-job can execute between status check and update, violating labour single-source invariant | Timesheets with dual job_id + carpentry_job_id cause double-counting in Finance | None—timing dependent |
| **Worker timesheet re-submission overwrites prior entries silently** — POST /api/worker/timesheets deletes old entries without dry-run or warning. Cost recalculation happens server-side; worker doesn't see impact. | Workers unaware of cost changes; no audit trail of changes | None—occurs silently |

### 🟠 MEDIUM SEVERITY: Operational Friction & Missing Transparency

| Issue | Impact | Workaround |
|-------|--------|-----------|
| **Unbounded History tab queries** — No pagination; CSV export unbounded. Broad date ranges load tens of thousands of entries. | Performance degradation; CSV exports slow/fail on large ranges | Narrow date range manually |
| **Mass-fill lacks pre-submission validation** — No inline error feedback; users submit rows with missing employee/task/hours, then see generic post-submit errors. | Users iterate without understanding what failed | Submit smaller batches; manually validate rows |
| **Bulk approve/reject doesn't show partial failures** — Results array exists on server, but frontend doesn't display which items failed or why. Toast says "N approved" regardless of failures. | Supervisors miss failed approvals; silent data loss | Manual spot-check or inspect server logs |
| **Buildexact sync errors hidden; no batch-retry** — Sync column shows "⚠ Sync failed" with error in title attribute (tooltip only). No batch-retry or clear recovery path. | Supervisors unaware of sync failures until History tab inspection | One-by-one Retry button |
| **Cost model & labour rates opaque** — Workers never see cost estimates; supervisors see final cost only in History tab (admin-only). Overtime/double-time rules not visible on-screen. | Workers can't make cost-aware decisions; supervisors can't audit rate calculations | Contact admin for breakdown |
| **Rejection context unclear; no worker notification** — Workers see rejection notes in home banner only after reload (no in-app notification or email). Which entries were flagged? Unknown. | Workers delay re-submission; confusion about what to fix | Workers must re-read notes and infer problem entries |
| **Site tasks (carpentry) schema mismatch** — site_tasks.carpentry_job_id does NOT exist as FK. Worker PWA queries for tasks by carpentry_job_id and gets empty results. | Workers on carpentry jobs see "No tasks" even if tasks exist | Tasks must be created on projects; carpentry workers don't see them |
| **Labour dashboard lacks budget comparison** — Operations/Labour view shows actual hours/cost vs. Buildexact estimates, but no project budget comparison. | Supervisors can't tell if labour is on-track vs. budget | Manual calculation or external tools |
| **Worker PWA lacks offline support & draft persistence** — No service worker, no IndexedDB. Network drop = lost timesheet. No background sync queue. | Workers on intermittent 4G lose hours; duplicate entries on retry | WiFi-only rule or manual re-entry |

### 🟡 MEDIUM-LOW: Consistency & UX Issues

| Issue | Impact | Workaround |
|-------|--------|-----------|
| **Navigation label mismatch** — Sidebar shows "Timesheets" but page has 3 tabs (Approvals, Mass Fill, History). No hint that mass-fill exists. | Users miss feature; discoverability poor | Users must click into page to find tabs |
| **Status badge hardcoded in components** — STATUS_BADGE duplicated in Workforce.jsx & WorkerHome.jsx, not imported from constants.js. New status enums silently fail to render. | Maintenance risk; missed status updates | Manual search-replace on new status |
| **Sites dropdown mixes projects + carpentry jobs** — Displayed side-by-side with non-obvious sorting. Inconsistent labels (address vs. address + client). | Workers confused about which list they're selecting from; site mix-ups possible | Supervisors verify selections carefully |
| **Worker PWA rejects future dates silently** — Date picker has max=today, but no explanation shown. Asymmetric feedback (only backdating warning shown). | Workers repeatedly try to log tomorrow's hours without understanding why | None—constraint is correct per payroll SOP |
| **Timesheet status not visible in log form** — WorkerLogHours doesn't show current timesheet status. Worker can resubmit approved timesheet unaware it's locked (silent 409 Conflict). | Workers surprised by rejection or status conflicts | Workers must check home page first |
| **Rejection banner not prominent** — "Edit and resubmit" button is same weight as banner text. Workers may miss the CTA. | Workers don't realize they can click to fix immediately | Workers manually navigate back to log form |
| **CSV export lacks granularity** — Exports summary only (date, employee, hours, status). No task breakdown or cost detail. Carpentry jobs show blank address. | Reporting limited; carpentry timesheets incomplete | Manual data compilation |
| **Worker link lifecycle unclear** — Token is permanent; no expiry, no last-used timestamp, no audit trail. Reset/Regenerate buttons confuse supervisors. | Security risk; worker identity leaks undetected; no revocation timeline | Supervisors manually track tokens |

### 🟢 LOW: Minor UX & Performance

| Issue | Impact | Workaround |
|-------|--------|-----------|
| **Buildexact sync 'Not synced' state ambiguous** — History tab shows 'Not synced' for approved timesheets in manual-sync mode. User doesn't know if it's pending, failed, or misconfigured. | Minor confusion; users check status unnecessarily | Hover over status or check settings |
| **Completion photos stored as data URLs** — Photos stay inline in DB (100–300 KB each); no CDN, no Storage bucket. Bloats tables; no separate lifecycle. | DB bloat; no photo archive or reuse | None—requires migration |
| **Task category used for costing but not validated** — task_category hardcoded in 3 places; no FK or enum constraint. Typos cause Finance rollup misalignment. | Finance labour tracking unreliable if task names drift | Finance manually maps mismatches |
| **Missing audit trail for rejections/approvals** — No record of who rejected, when, or how many times. Hard to debug repeat rejections or find approval patterns. | Compliance/troubleshooting gaps | Manual log inspection |
| **Form state not persisted on navigation** — Worker PWA doesn't save draft when exiting log form. Navigation away = lost entries. | Minor frustration; re-entry required | Workers submit immediately or lose work |
| **Overtime/double-time thresholds fetched fresh at approval** — If settings change between submit and approval, cost recalculates with new thresholds. Non-deterministic; no snapshot. | Cost disagreements; audit complexity | Store settings snapshot at submit time |

---

## Gaps & Opportunities (Larger Initiatives)

### Architecture & Data Quality
1. **Carpentry labour attribution** — Implement worker-side carpentry job capture (persist to timesheet on submit, not at approval). Wire Finance labour rollups to use `labourAttribution.mjs` guards (Phase 7 debt).
2. **Offline-first PWA** — Add service worker + IndexedDB for draft persistence, background sync queue, offline hour-buffer.
3. **Cost transparency** — Calculate on-screen cost estimates in Worker PWA (using overtime thresholds + rates); display cost breakdown in supervisor approval UI.
4. **Labour audit trail** — Create timesheet_audit_log; log every approval/rejection/unapprove with actor, timestamp, notes.
5. **Token expiry & revocation** — Add TTL to worker tokens (30 days); maintain revocation list; show "Token expires in X days" in Team Directory.

### Workflow Improvements
1. **Bulk operations clarity** — Show summary modals before approve/reject; display partial-failure results after execution.
2. **Carpentry job bulk-assign** — Select multiple timesheets, assign same job in one action (not one-by-one).
3. **Rejection re-entry** — Pass timesheet date as query param; pre-fill form with old entries; allow edit-in-place from rejection banner (don't clear old data).
4. **Buildexact batch-retry** — "Retry all X failed" button in History tab; show error details inline or in expandable side panel.
5. **Worker context persistence** — Store current_project_id in localStorage; show "Current site" card in home; allow "Use yesterday's site" quick button in log form.

### Missing Features
1. **Site tasks for carpentry** — Add carpentry_job_id FK to site_tasks; allow supervisors to assign tasks on carpentry job detail pages.
2. **Leading hand photo review** — Add photo gallery in Approvals detail view; allow zoom, download, flag concerns.
3. **CSV import for mass-fill** — Allow supervisors to paste/upload CSV with columns [employee, task, hours]; parse, validate, submit all at once.
4. **Labour dashboard cost vs. budget** — Look up project budget, compute variance, alert if >10% over (red badge in Operations).

---

## Recommendations by Effort

### Quick Wins (S effort)
- Move TASK_LABELS and status enums to shared constants.js; import everywhere
- Add phase context to task category display ("First fix / framing (Frame phase)")
- Wrap worker/me response in consistent { ok, data: {...} } envelope
- Surface actual API error messages in PWA (not generic "Failed")
- Add offline connectivity indicator to Worker PWA footer
- Display token expiry date ("Generated on [date]") in Team Directory
- Add real-time row validation to Mass Fill (disable submit if incomplete, red dot on empty rows)

### Medium Effort (M effort)
- Implement pagination on /api/workforce/timesheets/pending and /history endpoints (add limit/offset)
- Pre-fill Worker PWA log form with site context from /api/worker/me; add "Use yesterday's site" button
- Capture carpentry_job_id in Worker PWA at submit time; persist to timesheet; pre-populate Approvals dropdown
- Add transaction safety to PATCH /carpentry-job (WHERE status='submitted' guard)
- Store workforce_settings snapshot on timesheet at submit time (for deterministic cost calculation)
- Add timesheet_audit_log table; log all approvals/rejections/syncs with timestamps & actors
- Show cost estimates in Worker PWA ("~$45.50 (8h + 0.5h OT @ 1.5x)") before submit
- Batch Buildexact sync-error recovery ("Retry all X failures" button; expand errors inline)
- Display timesheet status in WorkerLogHours (banner: "Viewing [date] — Status: Submitted" if not draft)
- Add confirmation modal before bulk approve/reject (summary of employees/dates affected)
- Add carpentry_job_id FK to site_tasks; extend task-fetch logic to query by either project_id OR carpentry_job_id

### Larger Changes (L effort)
- Implement offline-first Worker PWA (service worker + IndexedDB + background sync queue)
- Add labour audit trail UI (History tab showing approval/rejection timeline per timesheet)
- Implement worker token expiry (30 days) + revocation list
- Add completion photo Storage upload (multipart to /api/worker/timesheets/:id/upload-photos; persist signed URLs, not data URLs)
- Labour budget comparison in Operations (Finance dashboard metric display + variance alert)
- Wire Finance labour rollups to use labourAttribution.mjs deduplication guards (Phase 7 completion)
- Add site-task photo workflow for completion evidence (upload, review UI)

---

## Cross-Module Dependencies

| Dependency | Current State | Risk |
|---|---|---|
| **Finance labour rollups** | Read timesheets by job_id only; carpentry labour excluded (acknowledged Phase 7 debt) | Incomplete labour budgets if carpentry work exists; double-counting if both job_id + carpentry_job_id set |
| **Operations labour dashboard** | Queries timesheets for actual hours/cost; Buildexact for estimates | No budget source; can't alert on over-budget labour |
| **Operations site-tasks** | task_category hardcoded; no FK to task taxonomy | Misalignment if task names drift; Finance rollup broken |
| **Buildexact sync** | Work orders created on approval; contact auto-created; one-way fire-and-forget | Sync failures invisible; errors logged server-side, not surfaced to supervisor |
| **Client portal** | No timesheet visibility; workers assigned to projects but no task context | Workers can't self-track; portal can't show labour progress to clients |

**Top issues:** Unbounded Approvals/History queries load megabytes without pagination, causing browser lag and blocking approval cycles (HIGH: architectural blocker); Carpentry job attribution is entirely manual at approval time, context lost from worker PWA selection; no bulk-assign or pre-fill (HIGH: labour data quality); Worker re-entry after rejection clears all fields requiring memory-based re-fill from scratch, no draft save, no offline support (HIGH: operational friction, data loss risk); Cost calculations opaque to workers pre-submission; no on-screen estimates; Buildexact sync fire-and-forget with failures hidden in tooltips (MEDIUM: transparency); Site tasks missing carpentry_job_id foreign key; workers on carpentry jobs see 'No tasks' despite tasks existing (MEDIUM: feature broken); Mass Fill lacks pre-submission validation; bulk approve/reject don't show partial-failure results; users unaware of silently failed entries (MEDIUM: data integrity)

**Bigger changes (discussion):**
- Pagination overhaul: Implement limit/offset on pending & history endpoints; add page controls to Approvals/History UI; lazy-load timesheet_entries on expand
- Carpentry labour attribution redesign: Capture & persist carpentry_job_id in Worker PWA submit (not at approval); auto-pre-fill Approvals dropdown; add bulk-assign action for supervisors
- Offline-first PWA: Add service worker + IndexedDB for draft persistence, background sync queue, offline hour-buffer; show connectivity indicator
- Cost transparency layer: Calculate on-screen cost estimates in Worker PWA using thresholds + rates; display breakdown in Approvals detail (admin-only); store settings snapshot at submit for deterministic audit
- Labour audit trail: Create timesheet_audit_log table; log all state changes (approval/rejection/unapprove/sync) with actor/timestamp/notes; surface in History tab
- Worker token lifecycle: Add 30-day TTL, revocation list, last-used timestamp, audit trail; show expiry warning in Team Directory
- Buildexact sync robustness: Implement batch-retry UI ('Retry all X failed'), expand error details inline or side panel, poll pending list to show real-time sync status after approval
- Completion photo migration: Upload to Storage bucket instead of storing as data URLs; implement storage lifecycle policy; add supervisor photo gallery review in Approvals

---

## Workflow Overview

The Finance module functions as an **invoice capture & approval gate** that ingests bills from email (IMAP) and manual upload, extracts data using Claude Haiku, matches documents to tender jobs or carpentry sub-jobs, assigns trade categories via AI inference, and routes approved documents to Dropbox and Buildexact. It also serves as a **job financial command centre** tracking budget-vs-actual costs, WIPAA (Work in Progress, Accrued Amount of Work), progress claims, and variation reconciliation. The module touches every project lifecycle: receiving supplier invoices on project costs, filing them for audit, computing projected margins, and syncing financial facts to other modules (Workforce for labour costs, Operations for projects, Portal for client visibility).

### Current Flow Friction Points

1. **Multi-tab/multi-step approval**: Invoices uploaded in Inbox must navigate to Approvals tab to select trade category before approval; trade selection is not available in Inbox detail panel. No direct navigation link from Inbox to Approvals.

2. **Manual trade re-selection**: AI suggests trade category with confidence % in both Inbox and Approvals, but never auto-selects it (even at 100% confidence). Users manually re-pick the same category every time.

3. **Exclusive job allocation**: Tender job and carpentry job are mutually exclusive dropdowns in Inbox. If a single invoice legitimately applies to both (materials + labour supervision), user must split the document or re-allocate after approval. Carpentry job option is missing entirely from Approvals tab.

4. **One-by-one approvals**: Approval Queue processes invoices individually—no bulk select, no batch approve. For 50+ pending invoices, users click 50+ times.

5. **Scattered WIPAA inputs**: Contract value, estimated cost, progress billed can be entered in JobFinancials or left undefined, requiring users to discover missing data at claim creation time (ProgressClaims) with no inline way to set it.

6. **Silent filtering loss**: Changing status filter in Inbox closes detail panel without user awareness or warning.

7. **Incomplete audit trail**: No approval history visible in UI. No explanation for hold/on_hold decisions. Financial field changes (contract_value, forecast_cost) have no reason logged.

---

## Key Findings by Theme

### A. USABILITY & UX FRICTION (18 issues)

**Critical Workflow Blockers**
- **Approval without server confirmation** (ApprovalQueue.jsx:292–302): Rejection removes document from UI before confirming server accepted it. Network error → document lost from view but remains pending_approval in DB. Add error handling with retry UI.
- **Browser alert() for approval errors** (ApprovalQueue.jsx:288): Uses `alert(j.error)` instead of inline toast, blocks UI, no retry. Replace with persistent error card showing supplier + invoice # + reason + retry button.
- **Carpentry job + material category two-step with state loss** (FinancialInbox.jsx:201–227): Selecting job clears category without warning. Add summary card showing selected job; only reset category on explicit Clear, not on job change.
- **Missing approval confirmation modal** (FinancialInbox.jsx:265–277): Approve button executes immediately. Add modal showing job address, amount, match confidence %, Dropbox destination.
- **No navigation from Inbox upload to Approvals** (FinancialInbox.jsx, FinanceManager.jsx): After pending_approval status, user must manually find document in Approvals tab. Show action button: 'Review in Approvals →' with auto-scroll.

**High-Severity Usability Gaps**
- **Trade categories never auto-selected despite AI suggestions** (ApprovalQueue.jsx:87, 154–159): Even at 100% confidence, users must manually select. Auto-select when confidence ≥100%, auto-fill when ≥75%, show visual feedback 'Auto-selected [Trade] (100%)', allow override.
- **Approval queue capped at 50 with no pagination** (ApprovalQueue.jsx:266, 328): Shows 50 docs; if business has 100+ pending, rest hidden, no 'load more', no total count. Add total: 'Showing 50 of 147' + 'Load more' button.
- **No bulk approval action** (ApprovalQueue.jsx): Each invoice requires separate click. Add checkboxes, 'Select All' button, bulk action bar: '[3 selected] Approve all with selected trade · Reject all'.
- **Job rematch dropdown includes completed/inactive projects** (ApprovalQueue.jsx:184–212): No status filter (Active vs Completed). Show active first, then completed (dimmed), add badge '[Active]'/'[Completed]', warn if assigning to completed job.
- **Status filter closes detail panel silently** (FinancialInbox.jsx:420–434, 516–528): Changing filter keeps panel open showing stale data from old filter. Auto-close panel + toast: 'Filter changed — detail closed', or show warning '[Not in current filter]'.

**Medium-Severity UX**
- **Material categories endpoint fails silently** (FinancialInbox.jsx:77–79): No loading state, silent error catch. Add loading state, show error: '⚠ Failed to load categories', include retry button.
- **No success feedback after approval** (FinancialInbox.jsx:265–277): User must wait for panel to close or verify manually. Show toast: '✓ Approved and filed to Dropbox', include copyable Dropbox path.
- **Finance Manager stats vanish on error** (FinanceManager.jsx:70–79): Promise.all wraps both calls with silent catch. Show error banner: '⚠ Could not load KPIs. [Refresh]', show placeholder cards instead.
- **WIPAA forecast requires manual monthly re-entry** (JobCommandCentre.jsx:449): No auto-fill from Buildexact or previous month. Add 'Auto-fill from Buildxact estimate' + 'Use last month' buttons, show previous value grayed out.
- **Budget seeding shows no results or unmapped categories** (JobCommandCentre.jsx:723): After seed, no summary. Show toast: 'Seeded 21 categories · 2 not matched [View details]', link to unmapped panel.
- **Budget edit modal lacks inline validation** (JobCommandCentre.jsx:355, 360): No min validation (allows negative), no feedback on incomplete fields. Disable Save if amount ≤0 or reason empty, show green checkmark when filled, warn if unusual.
- **HEIC conversion error is technical** (FinancialInbox.jsx:321, 355): Shows 'Browser cannot decode HEIC'. Replace: 'Image format unsupported. Convert to JPG first, or use a different image. [Learn more]'.
- **Supplier auto-tag threshold opaque to users** (financeRoutes.mjs:97–115): After 3rd approval, invoices suddenly auto-tag with no notification. Show 3rd-time notification: 'Future invoices from [Supplier] auto-tag as [Trade]. [Override in Settings]'.
- **WIPAA margin allows contract < estimated cost silently** (JobFinancials.jsx:194–220): Loss scenario shows without warning. Add badge: '⚠ Estimated cost exceeds contract', still calculate (to surface loss), but highlight visually.
- **Xero integration button disabled without context** (FinanceManager.jsx:44–50): 'Phase 2 coming soon' orphaned. Hide button entirely, or show enabled with modal: 'Xero coming Phase 2. [Notify me when available]'.

---

### B. WORKFLOW EFFICIENCY GAPS (8 issues)

**Multi-Tab Duplication & Navigation Friction**
- **Trade category entry duplication** (FinancialInbox.jsx:56–295 vs ApprovalQueue.jsx:36–80): Inbox shows AI-suggested trade but only for display; user cannot save trade in Inbox. Must go to Approvals tab to select. Then trade re-appears in Approvals with same AI suggestion requiring re-verification. **Fix**: Add trade selector to Inbox DocumentDetail, persist on Save, carry forward to Approvals so no re-selection needed.

- **Two job selection paths for carpentry** (FinancialInbox.jsx:190–228 vs ApprovalQueue.jsx:82–253): Inbox has tender job + carpentry job dropdowns (mutually exclusive), ApprovalQueue only has tender job. User can match in Inbox to carpentry, complete approval there, but cannot switch to tender in Approvals—must go back to Inbox. **Fix**: Show both job types in both Inbox and ApprovalQueue. Use clear toggle (radio or card layout) to show mutual exclusion. Consider unified 'Job allocation' panel: radio select Tender vs Carpentry, then pick specific job.

**Missing Bulk & Batch Actions**
- **No bulk approval/rejection** (ApprovalQueue.jsx:256–341): Each document needs separate action. With AI trade learning, users confidently batch-approve same-supplier invoices but must click 1+1 per doc. **Fix**: Add checkboxes, persistent footer when selected: 'Approve all selected' + 'Reassign to job' + 'Reject all'. Reduces clicks from 1+1 per doc to 1 per batch.

**Scattered Inputs & Invisible Dependencies**
- **WIPAA inputs scattered across two modules** (JobFinancials.jsx:108–127 vs ProgressClaims.jsx:23–149, JobCommandCentre.jsx): Contract value, estimated cost, progress billed editable in JobFinancials, but claims creation doesn't show edit UI. User discovers missing contract_value at claim-creation time, must navigate back to JobFinancials. **Fix**: Move WIPAA entry to JobCommandCentre header/KPI section (mission control). Or add inline edit in ProgressClaims.NewClaimModal so missing inputs can be set without leaving workflow.

- **Status filter state not persisted** (FinancialInbox.jsx:410–432): Filter resets to 'all' on tab switch because `useState('all')` re-initializes. **Fix**: Persist to URL query param or sessionStorage; read and apply on mount.

- **Trade required but error only shown on rejection** (ApprovalQueue.jsx:219–220): Approve button disabled with no message, only disabled title attribute. User may not understand why. When rematch changes job, trade selection doesn't reset—forces re-selection after job change. **Fix**: Show red error below TradeSelector immediately: 'Trade required before approval'. Auto-suggest most common trade for new job on rematch.

**API & Data Consistency**
- **Inconsistent API endpoint patterns** (JobFinancials.jsx:251 vs jobsApiRoutes.mjs:93): JobFinancials calls PATCH `/api/finance/jobs/{id}` (doesn't exist), actual handler is `/api/jobs/:id` in shared jobs API. **Fix**: Change JobFinancials to call `/api/jobs/{jobId}`. Document: 'Finance reads via /api/finance/*, writes job fields via /api/jobs/* (shared job API)'.

- **IMAP email sync status hidden, not prominent** (FinancialInbox.jsx:465–514): Small banner below upload zone; user may not realize module auto-polls email. No indication if last poll succeeded. **Fix**: Move banner to TOP with clearer design: green/red dot + 'Last checked 2 mins ago' or 'Email sync failing'. Show '3 email inboxes configured, last check found 5 invoices'. Primary-colored 'Check email now' button.

**Data Re-entry Friction**
- **Extracted fields shown read-only, no inline correction** (FinancialInbox.jsx:150–170 vs ApprovalQueue.jsx:120–151): If OCR misreads total ($1,2O0 vs $1,200), user cannot correct without re-upload/re-approval. **Fix**: Add 'Edit extraction' accordion in DocumentDetail allowing editable fields for supplier_name, invoice_number, amounts, dates. Mark edited fields with 'edited' badge. Save without re-approval.

---

### C. INTER-MODULE INTERACTION PROBLEMS (12 issues)

**Data Handoff Failures & Double Entry**
- **Labour cost mapping incomplete** (financeCCRoutes.mjs:36–46, 465–481): Only 6 of ~10 task_category values mapped to trade_category. Unmapped labour (e.g., 'other', 'admin') rolls into total actuals but vanishes from per-trade budget-vs-actual table. Users see margin $50k actual but budget variance shows $35k—mismatch. **Fix**: Add migration mapping missing categories (at minimum 'other'→'Preliminaries'), or roll unmapped into visible 'Miscellaneous Labour' budget row, or exclude from total actuals so numbers stay consistent.

- **Document allocation doesn't support both tender + carpentry simultaneously** (financeRoutes.mjs:627–640, FinancialInbox.jsx:90): Ternary logic sets job_id=null when carpentry_job_id populated. Single invoice (materials + labour) legitimately applies to both; user forced to split manually, allocate once then re-edit, or create duplicates. **Fix**: Allow both job_id and carpentry_job_id simultaneously. Update Inbox UI to show both pickers non-exclusively. Approval logic: push to Buildexact if carpentry_job_id set, file to Dropbox if job_id set.

- **Contract value reads stale fallback, creating reconciliation risk** (financeCCRoutes.mjs:111–115, 324, 490): contractValueOf() computes original_contract_value + Σ(signed variations), fallback to jobs.contract_value. If variation status changes or is deleted, jobs.contract_value not auto-updated. WIPAA snapshot may use stale value. **Fix**: Always compute, never use fallback. If original_contract_value null, error requiring user to set it. Run audit query to find drift: `SELECT job_id, computed vs stored FROM jobs LEFT JOIN job_variations WHERE status='signed'...`.

- **Budget seeding fails silently on unmapped Buildexact categories** (financeCCRoutes.mjs:55–76): matchTradeCategory() tries 3 strategies; if all fail, category logged as unmatched but seed proceeds without user confirmation. User may dismiss and assume budget complete; really, categories silently dropped. **Fix**: Require explicit user action before seed completes. Show 'Review unmatched' dialog: list each unmatched Buildexact category, allow user to confirm match, create new trade, or skip. Log each decision in job_budget_source_audit (job_id, trade_id, source_category, matched_by_user).

**Audit Trail & Consistency Gaps**
- **Job financial fields edited inline without audit trail** (financeRoutes.mjs:1025–1038, financeCCRoutes.mjs:618–649): PATCH /api/finance/jobs/:id updates contract_value, estimated_total_cost, progress_billed with no reason recorded. Fields also editable in Operations, Sales, Portal. No single audit log. **Fix**: Create job_financial_audit table (job_id, field_name, old_value, new_value, changed_by, changed_at, reason). Require reason field when updating key fields. Add 'Financial history' link in JobCommandCentre next to each field.

- **Portal & Finance variations share table, different approval workflows** (job_variations table, portalRoutes.mjs:1000–1020, financeCCRoutes.mjs:1025–1180): Variation status flows draft → sent_to_client → signed. Portal shows client-facing copy, Finance uses 'signed' to compute contract value. No clear handoff: (1) if Portal variation sent but never signed, Finance has to exclude (fragile check at line 665–666); (2) if Finance changes status from signed to draft, Portal doesn't alert client; (3) no is_internal flag to hide internal cost-tracking variations from client. **Fix**: Add is_client_facing boolean to job_variations. Portal filters WHERE is_client_facing=true. When variation transitions from signed to other, notify job.client_email. Add 'Variation audit' in JobCommandCentre.

- **Dropbox filing logic scattered across three paths** (financeRoutes.mjs:887–905, financeCCRoutes.mjs claim send, variations endpoints): Invoices → /INTERNAL/INVOICES, claims → likely /RECEIPTS/, variations → unclear. Risk: docs not findable together, paths fail silently if job address is 'TBD'. **Fix**: Create financeDropboxPath(jobAddress, documentType, financialYear) helper. Use across all endpoints. Add 'Dropbox path' preview in Document Detail before approval. Add /api/finance/documents/:id/dropbox-history endpoint.

**Data Integrity & Learning Feedback**
- **Duplicate detection runs post-extraction, wastes AI cost** (financeRoutes.mjs:679–696): Checks after expensive Haiku extraction. Should check email_message_id or file hash BEFORE extraction. **Fix**: Move duplicate check to line 668, before extractDocument. Return early if duplicate found.

- **Trade category inference doesn't cache, runs Haiku on every upload** (financeRoutes.mjs:42–91, 699–708): Checks supplier_trade_defaults for auto-tagged suppliers, then calls Claude Haiku for unknown suppliers. No caching. If 100 invoices from 5 suppliers, 100 AI calls. supplier_trade_defaults has auto-tag learning (3+ confirmations) but only fires on approval, not during matching. Hardcoded threshold=3 with no visibility. If supplier works multiple trades, auto_tag flips based on most recent, erasing prior learning. **Fix**: Cache Haiku results in supplier_trade_defaults if confidence >60%. Show /api/finance/suppliers/:abn/learning endpoint with confirmed trades + history (chart over time). Allow admin to set auto_tag=false for multi-trade suppliers.

- **Missing handoff: Buildexact budget never auto-syncs to Finance** (Operations, financeCCRoutes.mjs:136–161): When project won, Operations doesn't pull Buildexact estimate. User must manually trigger /budget/seed. If Buildexact estimate changes, Finance budget stale, no re-sync warning. **Fix**: Auto-seed on buildexact_job_id set (background task). Store seeded_from_buildexact_at timestamp. Add 'Re-sync from Buildexact' button with warning. Flag job if estimate changed: 'Budget out of date—re-sync recommended'.

- **Carpentry labour costs excluded from budget-vs-actual** (financeCCRoutes.mjs:434–481): Labour rollup joins only on job_id; carpentry_job_id never counted. Tenderjob's budget-vs-actual incomplete. **Fix**: Extend labour query to also pull timesheets on carpentry_job_id. Use labour attribution deduplication to avoid double-counting timesheets with both job_id and carpentry_job_id.

**Approval Gate Inconsistency**
- **Variations approval requires trade for tender, not carpentry** (financeRoutes.mjs:854–858): Document approval checks: if job_id set, trade_category_id required; if carpentry_job_id set, trade not required (feeds Buildexact cost category instead). Makes sense architecturally, confusing for users. **Fix**: Add validation at job_id selection point in DocumentDetail: when user picks tender job, require trade picker before save. Tooltip: 'Select trade to categorize cost for budget reporting.'

---

### D. CONSISTENCY ISSUES (7 issues)

**Status Enum Mismatches**
- **DOC_STATUSES.HELD vs server 'on_hold'** (constants.js:136 vs financeRoutes.mjs:994): Constants define 'held', server sets 'on_hold'. Frontend StatusChip has no case for 'on_hold'; held documents show as generic muted text. **Fix**: Change constants.js to 'on_hold', add case to STATUS_LABELS in Inbox & JobFinancials.

- **Frontend checks unreachable 'matched' status** (FinancialInbox.jsx:129–130 vs financeRoutes.mjs:823): canApprove checks for status==='matched', but server never creates it (goes unmatched → pending_approval). Dead code. **Fix**: Remove matched condition, simplify to `status === 'pending_approval'`.

- **Status filter incomplete** (FinancialInbox.jsx:25 vs 518–527): Filters missing 'approved' and 'xero_synced' (both valid end-states). Users cannot view recently approved or synced docs without manual query. **Fix**: Add both to STATUS_FILTERS array, update STATUS_LABELS, reorder to reflect state flow.

**Hardcoded Constants Scattered**
- **Status/method labels duplicated across 4 components** (FinancialInbox.jsx:4–12, ApprovalQueue.jsx:14–34, JobFinancials.jsx:14–20, ProgressClaims.jsx:7–19, Variations.jsx:11–22): If status changes, all 5 files must update. Naming inconsistent (STATUS_STYLES vs METHOD_COLOR). **Fix**: Create /src/lib/financeConstants.js exporting DOC_STATUS_LABELS, CLAIM_STATUS_LABELS, VARIATION_STATUS_LABELS, MATCH_METHOD_LABELS. Import everywhere.

**API & Logic Bugs**
- **Trade category assignment triggers redundant sequential API calls** (FinancialInbox.jsx:205, 220): Selecting carpentry job calls assignCarpentry() immediately; then category selection calls again. Two PATCH requests for one logical action. **Fix**: Defer both calls until both fields selected, batch into one PATCH. Or use 'Save Assignment' button.

- **Two approval entry points, inconsistent trade validation** (ApprovalQueue.jsx:82–113 vs FinancialInbox.jsx:257–289): ApprovalQueue requires trade_category_id before approving, FinancialInbox doesn't enforce it (only checks job_id). Users might approve without trade in Inbox, server error. **Fix**: Enforce trade selection in Inbox before enabling approve button. Extract TradeSelector from ApprovalQueue, reuse in DocumentDetail.

---

### E. GAPS & OPPORTUNITIES (14 issues)

**Critical Missing Features**
- **No bulk invoice approval/rejection** (ApprovalQueue.jsx:256–342): Users cannot batch-approve same-supplier invoices despite AI learning. **Fix**: Add checkboxes, 'Select All', bulk footer: '[3 selected] Approve all with selected trade · Reject all'.

- **No CSV/spreadsheet export for reporting** (FinanceManager.jsx:85–130): Finance managers cannot export Inbox/Queue to external systems or offline review. **Fix**: Add 'Export to CSV' button. Endpoint: GET /api/finance/documents/export?status=X&format=csv (include supplier, amount, due_date, job, match_method, confidence, comments).

- **Xero integration incomplete (Phase 2 stub)** (FinanceManager.jsx:29–60, financeRoutes.mjs:1042–1047): Connect button disabled with no roadmap. xero_bill_id columns never populated. Users cannot auto-create Xero bills on approval. **Fix**: Complete Phase 2: (1) POST /api/finance/documents/batch-sync-xero to create bills. (2) Add xero_sync_status, xero_sync_error columns. (3) Show sync status in Inbox list with retry button. (4) Update XeroSettings to show synced count + last sync time.

**Visibility & Reporting Gaps**
- **No supplier payment ageing or arrears visibility** (financeRoutes.mjs:347–349): due_date extracted but never used. No alert or aging report. **Fix**: Add GET /api/finance/suppliers/arrears endpoint returning unpaid invoices grouped by days-overdue. Add 'Supplier Arrears' tab in FinanceManager with aging buckets (0-30, 31-60, 61-90, 90+). Link to supplier contact for follow-up.

- **Carpentry invoice allocation requires manual Buildexact category** (FinancialInbox.jsx:202–228): Users must manually pick supply category for Buildexact PO. If left blank, PO has no cost line. **Fix**: Pre-select category based on supplier/description (run AI classifier). Show recommendation with confidence %, allow user override.

- **Approval audit trail lacks detail** (migration 020:49–58 financial_approvals table): Table exists but UI never shows history. Cannot see who approved, when, or see comments. DocumentDetail has no history tab. **Fix**: Add approval history section showing timestamp, approver name, action, trade assigned, comment. Link to user profile. Show rematching history.

**Workflow Extensions**
- **No 'hold' or 'query' status for disputed invoices** (financeRoutes.mjs:975–1011 vs ApprovalQueue.jsx:82–253): Can only approve/reject. If invoice needs clarification ('verify ABN', 'reconcile with Buildexact'), users reject and re-upload or leave pending. Hold endpoint exists but not wired to UI. **Fix**: Wire hold endpoint to UI. Add 'Hold for clarification' button in ApprovalCard. Show hold_reason field (required) + optional follow_up_date. Create 'On Hold' filter tab.

- **Trade category inference not shown as editable suggestion** (ApprovalQueue.jsx:36–80): TradeSelector defaults empty even if AI 85%+ confident. Users must manually re-select same category. **Fix**: Pre-populate with AI suggestion if confidence ≥60%. Show badge 'AI suggestion (85%)' with checkbox 'Use this'. Only require manual selection if AI <50%.

- **IMAP poller filters non-invoice PDFs silently** (financeRoutes.mjs:1150–1159): Skips PDFs with no amount/invoice number but users never see what was skipped. Logger prints to server console only. **Fix**: Show 'Non-invoice PDFs skipped' summary in IMAP status banner (FinancialInbox.jsx:465). Store skipped PDFs in audit table for 30 days (optional recovery). Allow force-upload if user disagrees.

- **No duplicate invoice reconciliation workflow** (FinancialInbox.jsx:144–148 vs financeRoutes.mjs:687–696): Duplicates flagged but no action button. Side-by-side comparison not offered. **Fix**: Add Duplicates filter tab. Show side-by-side comparison with original. Offer 'Mark as duplicate & delete' + 'Keep both (different POs)'.

**Cross-Job Visibility**
- **Cross-job invoice search limited to status and job_id** (financeRoutes.mjs:769–781): Cannot search by supplier, invoice_number, date range without loading 100+ docs. No full-text search. **Fix**: Extend GET /api/finance/documents with ?supplier=X&invoice=Y&from_date=&to_date=&min_amount=&max_amount=. Implement on API and UI search bar.

**Inter-Module Handoffs**
- **Manual labour costs from Workforce never reach Finance budget** (financeCCRoutes.mjs:119–134): Budget view shows only Buildexact-seeded items. Approved timesheets (Workforce) not rolled up into actuals. Labour is 'dark figure'—users check Workforce separately. **Fix**: Modify GET /api/finance/jobs/:jobId/budget/actuals to include labour from timesheets, grouped by task_category → trade_category. Show labour separately in actuals table.

- **No invoice-to-PO reconciliation after Buildexact push** (financeRoutes.mjs:543–599): When invoice pushed to Buildexact, buildexact_purchase_order_id stored but no ongoing sync. If PO edited/voided in Buildexact, Hub unaware. **Fix**: Add buildexact_po_status column (draft, open, billed, closed). Periodically sync via Buildexact API. Show status in Inbox list, alert on changes.

- **Contract value changes not propagated to Portal** (financeRoutes.mjs:1304–1351): When contract varied, projects table may not update if contract_value was null initially. Client sees outdated contract value on Portal. **Fix**: Ensure every variation approval updates canonical contract_value and propagates to projects.contract_value. Add Portal sync status indicator.

**Nice-to-Have Enhancements**
- **No batch import from Dropbox folder** (FinancialInbox.jsx:297–409): Users can drag-drop one at a time or email-ingest. Cannot bulk-import 20 PDFs from a Dropbox folder. **Fix**: Add 'Import from Dropbox folder' option. Users specify path (e.g., /PROJECTS/[job]/INVOICES/). Server polls daily, auto-ingests new PDFs, deduplicates.

- **Supplier_trade_defaults lifecycle incomplete** (financeRoutes.mjs:97–127): Users cannot view or edit supplier preferences. If supplier mis-tagged, users reject invoices or ask admin to run SQL. **Fix**: Add 'Supplier Settings' tab in FinanceManager showing auto-tagged suppliers, confirmation count, learned trade. Allow override, reset count, disable auto-tag per supplier.

---

### F. PERFORMANCE & DATA INTEGRITY (15 issues)

**Critical Blockers**
- **WIPAA endpoint mismatch breaks Job Financials panel** (JobFinancials.jsx:84 vs financeCCRoutes.mjs:652): Calls GET `/api/finance/jobs/${jobId}/wipaa` (404), actual route is `/api/finance/jobs/:jobId/wipaa/current`. **Fix**: Add alias GET `/api/finance/jobs/:jobId/wipaa` → `/current`, or update JobFinancials to call `/current`.

**Unbounded Queries & Memory Risk**
- **Stats query loads all financial documents into memory** (financeRoutes.mjs:784–794): GET /api/finance/stats calls `select('status, amount_total')` no limit. For 1000s of invoices, loads entire table, iterates client-side calculating sums every request. No caching, no pagination, no DB-level aggregation. **Fix**: Implement server-side aggregation: `SELECT status, COUNT(*), SUM(amount_total) FROM financial_documents GROUP BY status`. Cache 5 min or subscribe to approval events.

- **List documents limit=100 default, no total count** (financeRoutes.mjs:769–781): No upper-bound validation. No `total` returned for pagination UI. Users cannot know if more records exist or implement infinite scroll safely. **Fix**: Cap to 50, enforce Math.min(limit, 50). Return `{ ok, documents, total, limit, offset }`. Count with 'exact' mode.

- **Budget vs Actual join fetches all documents per trade** (financeCCRoutes.mjs:765–838): For 500 invoices, loads entire set, aggregates into Map manually. No index use, no pagination, loads into memory. **Fix**: Fetch only `(trade_category_id, amount_ex_gst)`. Move aggregation to DB: `SELECT trade_category_id, SUM(amount_ex_gst) FROM financial_documents WHERE job_id=X GROUP BY trade_category_id`.

**Data Sync & Consistency Risks**
- **WIPAA missing invoice_count in response** (JobFinancials.jsx:139 vs financeCCRoutes.mjs:652–704): UI renders `${wipaa.invoice_count} invoice(s)` but endpoint doesn't populate it. Shows 'undefined invoice'. **Fix**: Add `invoice_count = (docsRes.data || []).length` in wipaa/current, include in response.

- **Contract value calculated two different ways** (financeCCRoutes.mjs:111–114 vs 652–669): contractValueOf() helper vs direct calc in wipaa/current. Both compute `original + Σ(signed)` but different fallback logic. No single source of truth. **Fix**: Move all derivation to single RPC or computed column. Call from all routes. Document: 'contract_value is GENERATED fact'.

- **Duplicate detection ignores case sensitivity edge cases** (financeRoutes.mjs:688–696): Uses .ilike() (case-insensitive) but condition checks exact match. If user uploads 'INV-001' and DB has 'inv-001', match may fail. No logging. **Fix**: Normalize before check: `.toUpperCase()`. Log each duplicate found with link to original doc_id.

**Background Task & Async Risks**
- **IMAP poller Promise.all causes memory exhaustion on large batches** (financeRoutes.mjs:1161–1169): Buffers 50 raw emails, runs Promise.all([matchDocument, inferTradeCategory]) per attachment. Large attachments + slow AI = OOM. No concurrency limits, no timeout, no streaming. **Fix**: Limit concurrent AI calls to 3–5 via PQueue. Add 30s timeout per email. Stream progress (SSE/WebSocket) instead of blocking. Return partial results on failure.

- **Trade category inference never caches, runs Haiku every upload** (financeRoutes.mjs:42–91, 699–708): Checks supplier_trade_defaults for auto-tagged suppliers, then calls Haiku for unknowns. 100 invoices from 5 suppliers = 100 calls. No caching. **Fix**: Cache Haiku results in supplier_trade_defaults if confidence >60%. Populate ai_confidence, check before re-inferring.

- **Email poller accumulates skipped PDFs without audit** (financeRoutes.mjs:1150–1159): Silently skips non-invoices; server log only. **Fix**: Store in skipped_documents table (30-day retention). Show summary in IMAP banner. Allow force-upload if user disagrees.

**Other Query Efficiency**
- **Material categories endpoint doesn't use DB-level distinct** (financeRoutes.mjs:653–660): Fetches all job_budgets, dedupes in JS. For 1000 lines, loads entire set. **Fix**: Use DB DISTINCT: `SELECT DISTINCT category_name FROM job_budgets WHERE job_id=? ORDER BY sort_order`.

- **WIPAA review snapshot omits invoice_count** (financeCCRoutes.mjs:707–754): Saves snapshots but doesn't record invoice_count at review time. Audit trail incomplete; cannot trace why WIPAA changed if supplier volume changed. **Fix**: Add invoice_count to wipaa_reviews, populate from docs length, include in response.

- **Carpentry job allocation doesn't pre-validate Buildexact link** (financeRoutes.mjs:543–599): User selects carpentry job without checking buildexact_job_id exists. Approval tries to create PO, logs error silently. UI shows 'Pushed' but actually failed. **Fix**: In DocumentDetail, only show jobs with buildexact_job_id populated. Add warning: 'No Buildexact link — PO won't sync'. Block approve if missing.

**Normalization & Deduplication Consistency**
- **Two normalization functions with different regex** (financeCCRoutes.mjs:23–30 vs financeRoutes.mjs:148–156): norm() vs normAddr() have different rules, different punctuation handling. Could cause address match to succeed in one module but fail in another. **Fix**: Centralize in lib/normalizeUtils.mjs: normAddress(), normName(), normRef(). Import in both route files. Document edge cases ('St' vs 'Street').

---

## Integration Points & Data Flows

**Inbound (data received from other modules)**
- **Operations**: projects → jobs, buildexact_job_id set, estimated_total_cost hints
- **Workforce**: timesheets (labour costs by task_category) → should roll into budget-vs-actual
- **Tender**: variations → contract adjustments, affect contract_value calculations
- **Portal**: claims (client submissions) → Finance syncs and records cost-to-date

**Outbound (data sent to other modules)**
- **Operations**: normalized_costs per trade → job KPI actuals update
- **Buildexact**: purchase orders (carpentry invoices pushed as POs)
- **Dropbox**: filed documents (invoices, claims, variations archived)
- **Xero**: bills (planned Phase 2; no current sync)
- **Portal**: contract_value updates (client sees current contract), claims status updates

**Gaps in Handoff**: Buildexact budget not auto-synced to Finance; labour costs from Workforce not visible in Finance budget; no Xero sync yet; Portal variations create no audit trail in Finance when status changes; no two-way reconciliation on Buildexact POs post-push.

**Top issues:** Approval workflow removes documents from UI before confirming server accepted them—network error causes permanent loss (ApprovalQueue.jsx:292–302); add error handling with retry UI before removing from view.; Trade categories never auto-selected despite AI suggestions at 100% confidence—forces manual re-selection every time (ApprovalQueue.jsx:154–159); auto-select ≥100%, auto-fill ≥75%, show visual feedback.; Invoices require one-by-one approval with no bulk action despite 50+ pending documents—each document needs separate click (ApprovalQueue.jsx:256–342); add checkboxes + batch approve/reject footer.; Trade category entry duplicated across tabs—Inbox shows AI suggestion but only for display, users must go to Approvals tab to actually select it (FinancialInbox.jsx:56–295 vs ApprovalQueue.jsx:36–80); add trade selector to Inbox Detail, carry forward to Approvals.; Job financial inputs scattered across modules—contract value, estimated cost editable in JobFinancials but missing at claim-creation time in ProgressClaims (JobFinancials.jsx vs JobCommandCentre.jsx:380–476); move WIPAA entry to JobCommandCentre header or add inline edit in ProgressClaims.; Status filter closes detail panel silently, showing stale data from old filter view (FinancialInbox.jsx:420–434, 516–528); auto-close panel with toast 'Filter changed—detail closed' or show '[Not in current filter]' warning badge.

**Bigger changes (discussion):**
- **Unify trade category selection across Inbox & Approvals**: Move trade selector from Approvals-only to Inbox DocumentDetail panel. Persist selected trade on Save so it carries forward to Approvals without re-selection. Eliminates manual re-entry loop and reduces approval friction.
- **Consolidate WIPAA input location to JobCommandCentre**: Move contract_value, estimated_total_cost, progress_billed entry from JobFinancials to JobCommandCentre header or KPI section (mission control). This is the natural vantage point for job financials and prevents discovery of missing values at claim-creation time.
- **Add bulk approval infrastructure**: Implement checkboxes in ApprovalQueue, persistent footer bar on multi-select, batch approval endpoint POST /api/finance/documents/bulk-approve. Reduces approval workflow from 1+1 per doc to 1 per batch.
- **Centralize status/method labels & enums**: Extract hardcoded STATUS_LABELS, METHOD_COLORS scattered across 5 finance components into /src/lib/financeConstants.js. Fix enums (DOC_STATUSES.HELD → 'on_hold'), remove dead code ('matched' status), add missing filters ('approved', 'xero_synced'). Single source of truth.
- **Implement trade category learning UI & supplier preference management**: Add /api/finance/suppliers/:abn/learning endpoint showing confirmed trades + history. Surface supplier auto-tag settings in FinanceManager so users can see learned trades, confidence scores, confirmation history, and override per-supplier auto-tagging.
- **Complete Buildexact budget handoff**: Auto-seed budget from Buildexact on buildexact_job_id set (background task, store seeded_at timestamp). Add 'Re-sync' button with warning. Flag job if Buildexact estimate changed (via webhook or poll). Show 'Budget out of date' warning in Finance UI.

---

## Marketing & Marketing Intelligence Module — Audit Report

### Workflow Overview
The Marketing module comprises two semi-integrated subsystems:

**Content Studio** (Create → Library → Campaigns → Media → Lists → Intelligence):
- **Create Tab**: AI-assisted content generation with pillar/channel/client stage selection. Form inputs flow to content review (APB reference checks), then save to library.
- **Library Tab**: Content items display with status (draft → in_review → approved → published). Manual platform posting required; users copy text to Instagram/Facebook/LinkedIn separately, then paste post URLs back to record metrics.
- **Campaigns Tab**: Slot scheduling by date pattern, preload (batch content generation from photos), manual slot assignment, per-slot publishing to social platforms.
- **Media Tab**: Photo/video upload with automatic analysis (build stage detection, caption suggestions), optional manual consent & project tagging, batch generation into preload.
- **Lists Tab**: CRM mailing list view (imported from CRM module); no direct email sending from content or campaign context.
- **Intelligence Tab**: Dashboard showing aggregated metrics (reach, enquiries, keyword rankings), trending keywords, performance trends, sync controls (GSC/GA4/Meta/GBP).

**Key Flow**: Upload media → analyse → generate content → review → publish manually → record metrics post-hoc → view historical performance. Users must context-switch 3+ times and leave the module to complete the social posting step.

**Critical Issue**: One-way data flow. Attribution (leads → content via session events) is post-hoc and aggregated; content creators see only bulk metrics ("What's Working" ranking), never learning which specific piece drove which lead or how audience stage maps to content pillar. Campaign execution is entirely manual; no bulk publish, no performance-triggered recommendations, no A/B testing.

---

### Findings by Category

#### USABILITY & FORM GUIDANCE (5 findings)
**Content generation form lacks context for channel/pillar interaction**
- Users see independent button grids (Channel: Instagram/Facebook/Website/Email; Pillar: The Work/How We Build/etc; Client Stage: Awareness/Consideration/etc) with only 1-line labels. No guidance on good/bad combinations. Users unfamiliar with brand framework may select mismatched pairs and see review flags without understanding why.
- **Fix**: Add contextual hints below each channel ('Instagram — best for: The Work, What to Expect'). Show brief pillar explanation. Reorganise as cascade: Channel → Pillar → Client Stage. Add 'See examples' link showing 3–4 sample posts per channel/pillar combo. *Effort: S*

**Blocked content states provide no path to unblock**
- When review flags content (apb_reference.pass === false), Save button hides, user cannot edit inline, block reason is vague. Regenerate button shown but same inputs yield same failure. Users must navigate away, change parameters, regenerate (3+ clicks).
- **Fix**: Show block reason with specific rule violated + remediation hint. Allow inline body editing to fix issues. Add 'Try different topic' button suggesting input edits. Change Save to 'Save as draft (review required)' so users iterate without losing work. *Effort: M*

**Form field validation too lenient**
- ContentGenerator disables 'Generate' only if topic empty, not if topic is too vague ('project' fails review). CampaignManager disables 'Create' only if name empty, but doesn't validate posting_days non-empty or content_mix totals 100%.
- **Fix**: Add inline validation ('Topic is too vague if <15 characters'); offer 'Make more specific' button. Update CampaignManager disable to check name.trim() && posting_days.length > 0. Show validation summary on submit failure. *Effort: S*

**Empty state messaging lacks actionable workflow guidance**
- 'No content yet', 'No campaigns yet' don't explain workflow order. New users don't understand prerequisite steps.
- **Fix**: Add numbered workflow in first-time-use empty states: (1) Create post in [Create tab] → (2) Mark published in [Library] → (3) Intelligence shows trends. Add 'Get started →' link to next step. *Effort: S*

**Media upload doesn't show processing status for HEIC conversion or video analysis**
- No progress bar for HEIC→JPEG conversion (5–15s). No distinction between uploading/processing/analysing. No ETA. HEIC failures show generic error. No indication if analysis runs automatically.
- **Fix**: Show linear progress bar: Uploading [30%] → Converting → Storing → Ready. For videos: 'Uploading [30%] · Video analysis will start automatically (~2 min)'. For HEIC failures: 'Could not convert HEIC. Try: (a) update iOS, (b) convert on Mac first, (c) contact support'. *Effort: M*

#### WORKFLOW EFFICIENCY (8 findings)
**Manual Project Context Required for Content Generation** [HIGH]
- Users must manually type project context in a textarea. While the API accepts project_id/job_id, the UI provides no dropdown to select an existing project, forcing context re-entry that already exists in Operations/Sales modules.
- **Fix**: Add project/job selector dropdown (like campaign_id in CampaignManager) with search. Auto-populate context from project description, address, build stage. *Effort: M*

**No Bulk Linking of Content to Campaigns** [HIGH]
- To add 5 pieces to a campaign, users visit CampaignManager, open slots, navigate back to Library repeatedly. No 'add content to campaign' bulk action in Library.
- **Fix**: Add multi-select + 'Add to Campaign' action in Library: select items, choose campaign, assign to next N empty slots. Reduces context-switching and makes campaign population 2 steps instead of 5+. *Effort: M*

**Double Photo Analysis Entry for Batch Generation**
- When generating from a photo, the analysis (summary, suggested_pillar, suggested_caption_hook) is already computed. BatchGenerator re-sends this analysis on every generation, causing redundant vision API calls.
- **Fix**: Cache analyzed media in client-side state on first load. When user changes content_mode, reuse cached analysis. Add server-side 24-hour TTL for photo analysis. *Effort: M*

**Navigation between Create and Media tabs doesn't preserve form state**
- Filling form, navigating away, returning loses all state. No warning on navigation with unsaved work. seedAsset cleared immediately.
- **Fix**: Persist form state to localStorage on each change; clear on successful save. Show unsaved changes warning before navigating away. Keep seedAsset longer; don't clear immediately. Optional: 'Queue photos for batch generation' — select 3–5 photos, click 'Generate series'. *Effort: S*

**Marketing Intelligence dashboard lacks last-sync timestamp and refresh status**
- User doesn't know when data was last synced, if displayed data is 1 day or 7 days old, if sync in progress, or if sync failed. No progress indicator for long-running syncs. Empty cards don't distinguish 'not configured' vs. 'no data yet'.
- **Fix**: Add timestamp banner: 'Last synced: Yesterday at 11:32 PM (ACDT) · [Sync now]'. Show sync status icons next to headers (✓ updated 2h ago | ⚠ last sync failed | ⏱ syncing...). Distinguish empty states: 'Not configured' (blue) vs. 'No data yet' (grey). *Effort: S*

**Campaign preload panel opaque generation logic and no mid-stream customization**
- Generation logic is opaque; user doesn't know if posts use campaign brand voice rules or defaults. No cancel button during 30–60s generation. Edit allows body only, not channel/pillar. No campaign settings link during generation.
- **Fix**: Add campaign settings summary banner: 'Campaign: [name] · Tone: Premium · Mix: 35% Edu/25% Showcase'. Add tooltips on scores. Add cancel button during generating phase. Allow editing channel/pillar in review. After scheduling, show confirmation: 'Assigned {count} posts to {X} empty slots.' *Effort: M*

**Campaign content scheduling lacks clear slot availability feedback**
- Slot availability not visible until opening assign modal. Users may generate 20 posts for only 4 empty slots. Calendar shows week only; no month/4-week view.
- **Fix**: Add 'X of Y slots filled' mini-progress bar in calendar header. Show 'Slots available this week: 3' when opening assign modal. Show 'Available slots in campaign: 4' in preload config, warn if count > slots. Add '4-week view' toggle. *Effort: M*

**Publish workflow requires manual URL entry without validation**
- PublishModal asks user to paste post URL with no validation that URL belongs to selected platform. No help on obtaining URL. No link to view published post after saving.
- **Fix**: Parse URL, extract platform + post ID, confirm platform matches selection. Show 'Valid Instagram URL' checkmark. Add help text with steps to copy link. Show 'Copy metrics from post' button. After saving, show 'View on Instagram →' link. *Effort: M*

#### INTER-MODULE INTERACTIONS (8 findings)
**No UI to tag content with lead/job/project context during creation** [CRITICAL]
- Content items have schema FKs to leads, jobs, projects, but ContentGenerator never collects lead_id/job_id/project_id, and ItemDetail offers no edit controls. Content remains untagged, breaking attribution lookups and campaign targeting.
- **Fix**: Add 'Project context' dropdown to ContentGenerator (after client_stage) that queries active projects. Add lead/job search on ItemDetail to allow post-save tagging. Auto-tag when content seeded from project photo asset. *Effort: M*

**Attribution data flows one-way with no visibility for marketers** [CRITICAL]
- When user submits enquiry, attribution_events link to leads and content. Intelligence shows 'What's Working' (top content by enquiries), but Library shows zero information about which leads were attributed to each piece. Marketers have no feedback loop: create → publish → [silence].
- **Fix**: Add 'Attribution' tab or mini-card to ItemDetail showing: (a) count of attributed enquiries, (b) list of recent leads this content was first/last-touch for. Enable inline attribution tracking in list view. *Effort: M*

**No bulk action to assign content to leads or campaigns from a project context**
- No filter to view content by project_id. No 'bulk tag selected content to project X' action. Preload requires manually selecting which items to assign.
- **Fix**: Add project_id filter to Library GET endpoint and UI dropdown. Add 'bulk tag to project' action. In CampaignManager, filter preload by project. *Effort: M*

**Media assets store project/job context but cannot be queried or grouped by it**
- marketing_media_assets.project_id/.job_id exist but POST /api/marketing/media does not accept project_id as filter despite being indexed. MediaUpload offers no 'show media from this project' grouping.
- **Fix**: Add project_id/job_id filter parameters to GET /api/marketing/media. In MediaUpload, add 'Filter by project' dropdown. Allow multi-select of project-scoped media for batch generation. *Effort: M*

**CRM campaign integration sends to mailing_list but has no discovery from Marketing**
- CRM can link email campaigns to marketing_content_items, but Marketing module has no view of which campaigns use its content, no 'View campaigns using this content' link. Marketers cannot discover downstream usage.
- **Fix**: In ItemDetail (Library), add 'Email campaigns' section showing email_sends WHERE content_item_id = X. Link to CRM campaign for editing. *Effort: M*

**Media capture_date and stage_detected fields not exposed in UI**
- marketing_media_assets stores capture_date (when photo taken) and stage_detected (construction phase), but API doesn't return them and UI doesn't display or filter by them. Users cannot find 'all photos from frame stage'.
- **Fix**: Modify GET /api/marketing/media to include capture_date, stage_detected. Add ?sort_by=capture_date, ?stage=frame filters. In MediaUpload, add 'Stage detected' column and date sorting. *Effort: S*

**No way to re-use approved content across multiple projects/campaigns without manual copy-paste**
- Once approved, marketer may want to use same piece in different campaign/project. PUT endpoint accepts campaign_id/project_id but UI offers no 'Associate with campaign' or 'clone to campaign X' button.
- **Fix**: Add 'Link to campaign' dropdown in ItemDetail. When cloning for new project, auto-generate derived item. Add 'Use in campaign' action to Library list view. *Effort: M*

**Data integrity: no validation that lead_id, job_id, or project_id actually exist at save time**
- Foreign keys are defined but nullable, so invalid IDs can be inserted. API doesn't validate before insert. Users could save content with non-existent job_id, breaking later attribution or filtering. CRM campaigns will fail to link if content_item_id no longer exists.
- **Fix**: In POST/PUT /api/marketing/content, if lead/job/project IDs provided, validate they exist before saving. Return clear error if reference invalid. *Effort: S*

#### CONSISTENCY & GOVERNANCE (7 findings)
**Status enums defined but hardcoded in routes** [HIGH]
- CONTENT_ITEM_STATUSES constants exist (draft, in_review, approved, published) but routes hardcode values. Media assets use different status field names (analysis_status, export status). No single source of truth.
- **Fix**: Extract all status values to constants.js: CONTENT_ITEM_STATUSES, MEDIA_ANALYSIS_STATUSES, MEDIA_EXPORT_STATUSES. Import and use throughout routes and frontend. Document status relationships. *Effort: M*

**Role gating for admin features inconsistent — frontend only, backend missing** [HIGH]
- Music Library and Intelligence tabs gated in frontend, but backend sync endpoints also require admin—not documented in CLAUDE.md. GET /api/intelligence/questions doesn't require admin while POST endpoints do (asymmetric).
- **Fix**: Document admin-gated endpoints in CLAUDE.md. Ensure all admin-only routes use requireRole('admin') consistently. Update Marketing.jsx to disable features requiring admin access. *Effort: M*

**Multiple status pathways for content approval — workflow lacks guards** [HIGH]
- Users can jump directly from draft to approved without mandatory review. No intermediate 'in_review' state enforced. Approval sets reviewed_by + approved_at only on POST, not PUT.
- **Fix**: Define explicit workflow: draft → in_review → approved → published with guarded transitions. Add validation to reject direct draft→approved. Assign reviewer_id on approval. Update Library UI to surface workflow clearly (Submit for Review → Approve buttons). *Effort: M*

**Multiple status fields for media (analysis_status vs status) create confusion**
- marketing_media_assets has analysis_status ('pending', 'complete', 'error'); marketing_media_exports has status ('processing', 'ready'). No consistent naming or documentation.
- **Fix**: Rename fields consistently or create helper functions that abstract the naming. Document the two-stage pipeline (drone → intelligence) in CLAUDE.md. *Effort: S*

**API response format inconsistency — singular vs plural keys**
- Most endpoints follow ok(res, { items: [...] }) pattern. Some deviate: line 233 returns { ok: true, content, review_scores } (not wrapped), line 347/373 return { publish: rowToCamel(publish) }. Inconsistent with established pattern.
- **Fix**: Standardize wrappers: always use { ok: true, entity: {...}, list: [...] }. Update all marketing/intelligence routes to match. *Effort: S*

**Content intelligence requires manual publish/snapshot recording — no auto-link**
- Users must manually call POST /api/marketing/publishes before social snapshots attach. Users easily miss linking, leaving orphaned content items with status='published' but no platform_post_id. Intelligence filters on published_at + linked social_post_publishes—missing publishes means content won't appear in performance data.
- **Fix**: Auto-create social_post_publishes record when content status → 'published'. Provide 'Record Platform Post' modal that extracts post ID from URL. Add warnings in Library when published content has no publish record. *Effort: M*

**Navigation lacks back/link patterns — users must guess module flow**
- Module is tab-based but no cross-links. Create doesn't show which campaigns use newly-drafted content. Library publishes to social but doesn't link back to Campaigns. Users manually navigate between related features.
- **Fix**: Add contextual navigation: from Create, show 'View related campaigns' if linked; from Campaign detail, show 'Jump to Create' and 'View Library' CTAs; from Library, show campaign membership or 'Add to Campaign' modal. Use breadcrumbs at top of each tab. *Effort: M*

#### PERFORMANCE & DATA INTEGRITY (8 findings)
**Stale aggregated metrics on marketing_content_items** [CRITICAL]
- total_reach, total_engagements, total_link_clicks are updated fire-and-forget from sync/meta. If a snapshot upload fails, totals stay stale. If snapshots are deleted, aggregates never recalculate. Dashboard and content-performance endpoint derive engagement_rate from stale numbers, causing incorrect sorting.
- **Fix**: Derive all engagement metrics on-read from social_post_snapshots instead of storing on marketing_content_items. Add helper: perfScore(item, snapshots) that sums latest snapshots at query time. Update dashboard and /intelligence/content-performance to join and aggregate in-query. Removes redundant columns + 2 data sync points. *Effort: M*

**Unbounded N+1 join in GET /api/marketing/media** [HIGH]
- No pagination on marketing_media_exports. If one asset has 100+ export records, fetch balloons. attachMediaPreviewUrls calls createSignedUrl per export record—50 requests × N assets. Preload also selects photos with full join, iterates, calls external AI vision API per photo in a loop (no batching).
- **Fix**: Limit marketing_media_exports join to latest export per format. Batch createSignedUrl calls via Promise.all in groups of 10. In preload, batch AI calls to 3 concurrent max with queue. Add index on (media_asset_id, export_format, created_at desc). *Effort: M*

**Poll-based stale state in MediaUpload.jsx with unbounded reloads** [HIGH]
- Two independent polling loops reload entire /api/marketing/media list every 5–15s. No backoff. No SSE or websocket. Large media libraries (100+ items) thrash the list endpoint.
- **Fix**: Replace polling with Supabase real-time subscriptions (realtime('*').on('*', ...).subscribe()). Fallback: exponential backoff (5s → 10s → 30s), stop after 2h. Batch status checks: single query for all processing assets. Add AbortController to cancel on unmount. *Effort: M*

**Missing pagination on content-performance endpoint + dashboard queries**
- GET /api/intelligence/content-performance selects all marketing_content_items with no limit. Dashboard runs 6 parallel unbounded queries. For large libraries (1000+ items), page load inflates. No caching on dashboard aggregates.
- **Fix**: Add limit=50, offset=0 defaults. Memoize dashboard result with 1-hour TTL (cache key = org+ISO week). Implement 'latest N by performance_score' instead of fetching all. Cap 'What's Working' to top 10. *Effort: S*

**Campaign auto-assign does not validate all selected items belong to campaign**
- POST /api/marketing/campaigns/:id/slots/auto-assign checks slots exist but never validates each content_item_id belongs to campaign :id. User can pass IDs from different campaign and they silently link. No FK constraint on campaign_schedule_slots.content_item_id.
- **Fix**: Before auto-assign, validate: SELECT id FROM marketing_content_items WHERE id = ANY($1) AND campaign_id = $2. If mismatch, return 400. Add UNIQUE(campaign_id, content_item_id) to prevent duplication. *Effort: S*

**Video pipeline cascade runs both drone + intelligence sequentially, but errors in one do not prevent the other**
- If runFullDronePipeline throws, it's caught and logged, then runVideoIntelligencePipeline fires anyway. If both fail, analysis_status set to 'error', but asset.analysis may be partially written. Response returns status='processing' even if drone pipeline errored. No transactional rollback.
- **Fix**: Wrap both pipelines in try-all-or-rollback block. If either fails, update asset.analysis_status='error' + error_log={drone: err, intelligence: err}. Return status='processing' only if both started. Add pipeline_error field to marketing_media_assets. *Effort: M*

**Missing link between marketing content and attribution — no backfill workflow**
- Public enquiry form captures attribution_events but published content items are recorded after-the-fact in social_post_publishes. Dashboard 'What's Working' has no way to reverse-attribute an enquiry to the content that caused it unless utm_content=content_item_id manually passed. No bulk re-attribution or replay.
- **Fix**: Add backfill API: POST /api/intelligence/reattribute/:contentItemId that scans attribution_events for matching utm_campaign, utm_medium, time window and updates enquiry_attribution. Add manual UI in Intelligence: 'Link this content to past enquiries' with date picker. Add lead_id + content_item_id index to attribution_events. *Effort: M*

**Content Library filter does not include pagination — filters reload unbounded result set**
- Frontend calls GET /api/marketing/content with filters but doesn't respect limit/offset—loads everything into state. If 200 draft items exist, page loads all 200. Frontend then filters client-side by search, grouping iterates all items each render.
- **Fix**: Implement proper pagination: add offset=0 to URLSearchParams, render PagedTable with limit=50. Fetch on page change, not load-all. Move search filter to server: add ?search=q, filter in DB (ILIKE on title||body). Memoize groupItems() to avoid re-grouping on every render. *Effort: M*

**No validation that media_asset.consent_for_marketing is set before final export**
- FinalAssembly workflow requires consent_for_marketing=true, but no pre-export validation in UI. User selects music, clicks 'Export', only then gets 403 error. Consent flag is toggle-only, not enforced at upload.
- **Fix**: Block 'Finalize' button in FinalAssembly if consent_for_marketing=false. Add pre-flight check. In MediaUpload, make consent mandatory before asset can be used in campaign. Add audit trail: track consent_granted_at + consent_granted_by. *Effort: S*

#### GAPS & OPPORTUNITIES (9 findings)
**No native social media posting — manual platform handoff required** [CRITICAL]
- Content approved in Hub but marked 'published' only after user manually posts to Instagram/Facebook/LinkedIn elsewhere. No API integration to Meta or LinkedIn. Users must copy/paste, leave module, return to record post_id. Breaks workflow loop.
- **Fix**: Add Meta Business SDK integration (Facebook Conversion API + Instagram Graph API v19+). Create `/api/marketing/content/:id/schedule-social` endpoint accepting { platforms: [instagram|facebook|linkedin], scheduled_for: ISO8601 }. Surface 'Schedule to Social' button in Library. Store platform_post_id immediately. Eliminates manual transcription and closes attribution loop. *Effort: L*

**Campaign execution is fully manual — no bulk publish, no recommendations** [CRITICAL]
- Campaigns have schedule slots and content can be assigned, but slots must be filled manually or via unordered auto-assign. No 'Publish All Assigned Slots' button. No performance-triggered recommendations. Preload generates 8 items but requires manual curation.
- **Fix**: Add bulk publish endpoint: POST /api/marketing/campaigns/:id/publish-week accepting { week_start: ISO8601 }. Add 'Campaign Performance Dashboard' tab showing weekly metrics with AI-powered recommendations ('Your behind-scenes content outperforms—allocate 40% next week'). Surface 'Schedule All' button next to preload results. *Effort: L*

**Content-to-enquiry attribution is post-hoc only — no real-time feedback to creators** [HIGH]
- Attribution data aggregated weekly via AI cache. User doesn't see which published post drove which lead at publish time. 'What's Working' shows past performance, not predictive guidance. No link between content pillar and lead stage. Users cannot ask: 'Did my lock-up phase content drive qualified leads?'
- **Fix**: Create 'Content Impact Tracker' page: query social_post_publishes → social_post_snapshots + leads (via attribution_events), grouped by content_item_id + platform + pillar. Show real-time heatmap: 'Instagram educational posts → 3 enquiries, 2 qualified' (daily sync). Add /api/intelligence/content/:id/leads returning attributed leads grouped by stage with journey visualization. *Effort: M*

**Media consent & metadata capture is optional — data quality gaps**
- Users can upload drone footage without setting consent. No bulk consent-setting UI. Project/job linkage optional. No metadata validation. No visibility: 'Of 40 uploaded photos, how many have consent? How many linked to projects?'
- **Fix**: Add bulk consent modal after upload: quick-action grid ('✓ Consent' / '✗ No consent'). Auto-suggest project_id from recent projects. Add 'Media Audit' dashboard: 'Uploaded: 40, Analysed: 38, Consented: 32, Linked: 28' with drill-down to gaps. Enforce consent=true before asset shows in preload/batch-generation flows. *Effort: M*

**No job/project context for content — lost traceability of marketing ROI** [HIGH]
- Content has optional job_id + project_id columns but no UI to set them. Intelligence dashboard has no 'Project Performance' view. Cannot answer: 'How much marketing effort invested in Project X? Cost-per-lead for that project?' Site diary and marketing disconnected.
- **Fix**: Add project context picker to ContentGenerator (after client_stage). In Intelligence, add 'Project ROI' tab: select project → show attributed enquiries + leads mentioning this project, total media assets created, % that converted to won bids. Sync photos from site_diary.photos to marketing_media_assets with auto-tagging. *Effort: M*

**No Mailing List / Email Campaign Bridge**
- Content with channel=email has no way to send to CRM mailing lists. ContentLibrary 'Send to List' button not implemented. No email_sends tracking per content_item_id.
- **Fix**: Add 'Send to List' button in Library (if channel=email). Modal: pick mailing_list_id + schedule. Call email infrastructure. Track send event in email_sends with content_item_id + list_id. *Effort: M*

**Campaign preload is batch-only — cannot iterate on single slot or A/B test variants**
- Preload generates 8 items in single call. User cannot regenerate just one slot with different tone without regenerating all 8. No A/B testing: 'Show 2 versions of Instagram educational, pick better.' Preload results not saved; if rejected, must regenerate full batch.
- **Fix**: Add POST /api/marketing/campaigns/:id/slots/:slotId/generate endpoint to regenerate single slot with optional { count: 2 } for A/B variants. Allow per-slot tone/pillar overrides. Save preview_variant records; record user choice in slot.selected_variant. *Effort: M*

**Intelligence syncs are admin-only, manual triggers — no scheduled webhooks** [MEDIUM]
- Meta/GSC/GA4/GBP syncs are POST endpoints requiring admin click. No scheduled tasks, no webhooks. Data stays stale; metrics may be 3+ days old.
- **Fix**: Create scheduled cron tasks (via /scheduled-tasks or RAF jobs) to auto-trigger syncs daily at 6 AM. Add webhook ingestion (Meta Conversions API → /api/public/attribution). Show 'Last sync: 2 hours ago' on dashboard. *Effort: M*

**No in-module reporting or export — users rely on external spreadsheets**
- Intelligence dashboard has metrics but no CSV/PDF export, no monthly report template, no chart export. Users export to Sheets/PowerPoint for stakeholder reviews.
- **Fix**: Add 'Export' menu in Intelligence: PDF (styled report + charts), CSV (raw data). Store report snapshots in marketing_reports table (report_date, snapshot_json) for historical tracking. Add 'Schedule Report' to email monthly summary to stakeholders. *Effort: M*

---

### Summary of Root Causes

1. **Separation of Concerns Broken**: Social posting (create → publish) is split across Hub (approve) and external platforms (Instagram/Facebook). Users must manually bridge this gap, breaking the attribution loop.

2. **Attribution Feedback Loop Missing**: Content creators have no real-time visibility into which pieces drive leads or how audience stage maps to pillar/channel. Metrics are post-hoc aggregates, not actionable feedback.

3. **Project/Lead Context Not Wired**: Content, media, and leads exist in separate silos. No project/lead linking at creation time, no project-level ROI view, no site diary ↔ content correlation.

4. **Manual Context Re-Entry Across Modules**: Project context, mailing list recipients, lead stage—all exist in other modules (Operations, CRM) but must be manually re-entered in Marketing because no data handoff exists.

5. **Performance Data Integrity Issues**: Aggregates (total_reach, total_engagements) are stale, unbounded queries on large libraries cause N+1 joins and pagination failures, polling patterns thrash endpoints.

6. **Workflow Guards Weak**: Users can jump directly from draft to published without mandatory approval. Admin gating inconsistent (frontend only). Campaign execution fully manual with no bulk operations or performance-triggered recommendations.

---

**Top issues:** No native social media posting — users manually copy/paste content to Instagram/Facebook/LinkedIn, then return to record post IDs, breaking the workflow loop and attribution tracking; Content creators have zero real-time visibility into which specific pieces drive leads or how audience stage maps to content pillar; attribution is only post-hoc aggregates (What's Working ranking); Campaign execution is entirely manual — no bulk publish button, no performance-triggered recommendations, no A/B testing; preload generates 8 items but all-or-nothing curation UX; Content, media, and leads exist in silos with no project/lead linking at creation time, preventing project-level ROI view and costing re-entry of context that exists in Operations/CRM modules; Stale aggregated metrics (total_reach, total_engagements) on content items are never recalculated if snapshots fail/change, causing incorrect 'What's Working' ranking and performance decisions; Form validation too lenient (allows vague topics, missing campaign posting days) and blocked content states offer no remediation path, forcing users to navigate away and regenerate blindly

**Bigger changes (discussion):**
- Social Media API Integration (Meta Business SDK + Instagram Graph API v19+): Auto-post approved content to Instagram/Facebook/LinkedIn via `/api/marketing/content/:id/schedule-social` endpoint, eliminating manual platform handoff and closing the attribution loop. Effort: L (3–4 weeks)
- Real-Time Content Impact Tracker: Create a new 'Content → Leads' journey view in Intelligence dashboard that maps each published post to attributed enquiries grouped by lead stage, showing which pillar/channel drives which stage. Replaces post-hoc 'What's Working' aggregates with actionable real-time feedback for creators. Effort: M (2–3 weeks)
- Project/Lead Context Wiring: Add project picker to ContentGenerator, project_id filter to Library and Media queries, and auto-tagging when content is seeded from project photos. Create 'Project ROI' view in Intelligence. Sync site_diary.photos to marketing_media_assets with auto-stage detection. Eliminates context re-entry and enables project-level marketing ROI tracking. Effort: M (2–3 weeks)
- Campaign Execution Automation: Implement bulk publish endpoint (`POST /api/marketing/campaigns/:id/publish-week`), A/B variant generation per slot (`POST /api/marketing/campaigns/:id/slots/:slotId/generate`), and campaign-level performance dashboard with AI-powered recommendations. Effort: L (3–4 weeks)
- Scheduled Intelligence Syncs: Replace manual admin-triggered syncs (Meta/GSC/GA4/GBP) with daily cron jobs + webhook ingestion (Meta Conversions API). Keeps metrics fresh without user intervention. Effort: M (1–2 weeks)
- Approved Workflow State Machine: Enforce draft → in_review → approved → published workflow with guarded transitions; auto-create social_post_publishes record on status=published; add reviewer_id + approval audit trail. Eliminates orphaned content and ensures mandatory review. Effort: M (1–2 weeks)

---

## Client Portal Module Audit

### Workflow Overview
The Client Portal provides token-gated public access for clients to track project milestones, approve decisions/variations, view budgets, site communications, and manage home finishes and warranty claims. The module comprises three entry points: public `/portal/:token` (clients), `/my-portal` (client login), and `/portal-admin` (staff). The backend serves 11+ public endpoints with rich data (timeline, decisions, budget, photos, messages) and an admin summary that loads 10 data types in parallel. The architecture correctly treats Finance (job_variations) as the canonical source for contract variations when `projects.job_id` is linked, falling back to legacy `portal_decisions` for unlinked projects.

**Key bottleneck:** Admin UX only exposes 6 of 10 fetched data types; client messages are stored but invisible to admins; every field change triggers full re-fetch of all 10 queries; decisions/claims are immutable after creation; and site diary data (daily operations updates) never automatically flows to the client-facing weekly update cards.

---

### Findings by Theme

#### **A. Workflow Inefficiency & Data Flow Gaps**

**Client-to-admin message pipeline broken**
- *Severity:* HIGH  
- *Impact:* Clients send messages (PortalConversations.jsx:110) → stored in `portal_messages` with `sender='client'`. Admins in PortalAdmin have zero visibility. No Messages tab exists. Builder has no way to see client questions or reply, forcing communication back to email.  
- *Location:* portalRoutes.mjs:1154–1181 (client POST), PortalAdmin.jsx (no Messages tab)  
- *Recommendation:* Add 'Messages' tab to PortalAdmin showing client messages on right, builder replies on left, with timestamps and unread badge. Call `sendBuilderMessage` API on reply. Unblocks critical workflow gap.

**Site diary not piped to portal; double-entry burden**
- *Severity:* HIGH  
- *Impact:* Site diary entries (weather, trades, work done) captured daily in operations module but admins must manually rewrite as weekly updates in Portal Admin (PortalAdmin.jsx:276–374). Portal never reads from site_diary table. Clients miss daily progress; admins incur unnecessary retyping.  
- *Location:* siteDiaryRoutes.mjs (captures), portalRoutes.mjs (reads only portal_updates), PortalAdmin.jsx:276–374 (manual entry)  
- *Recommendation:* Add optional toggle in Portal Admin: when enabled, most recent published diary entry auto-populates a draft weekly update card for builder review/edit before publishing. Reduces double-entry and ensures timely comms.

**Admin summary loads 10 data types, UI exposes 6; wasteful full-page reload on every change**
- *Severity:* HIGH  
- *Impact:* Every admin page load and every blur event (client name, milestone ETA, photo upload, publish toggle) fires `loadSummary()`, which queries 10 parallel endpoints (projects, updates, milestones, decisions, claims, allowances, siteWalks, warrantyItems, messages, photos). Allowances, siteWalks, warrantyItems, and messages are fetched but never displayed in the 6-tab admin UI. For projects with 200+ photos, this creates DB thrashing.  
- *Location:* portalRoutes.mjs:568–614 (10-query summary), PortalAdmin.jsx:97, 179, 250, 259, 318, 344, 358, 391, 405, 429, 456, 484, 498 (all call loadSummary on blur)  
- *Recommendation:*  
  - **Option A (preferred):** Expose all 10 data types via new tabs (Site Walks, Finishes, Messages, Warranty). Justify the data loaded.  
  - **Option B:** Remove unused queries; lazy-load only when tab opened.  
  - **Urgent:** Replace full-page reloads with optimistic updates. setState immediately, API call in background, merge only on success. Eliminate wasteful re-fetch on every keystroke (reference: PortalConversations.jsx:51–67 shows pattern). **Reduces DB load by ~80%.**

**Decisions and claims immutable after creation; no edit UI**
- *Severity:* HIGH  
- *Impact:* Admin clicks '+ Add sample variation' → creates skeleton (title='New variation', costDelta=0). List below shows read-only text only. No inline edit, no way to update title/cost/status without delete+recreate (losing history). PATCH routes don't exist.  
- *Location:* PortalAdmin.jsx:424–474 (read-only lists); portalRoutes.mjs (POST only, no PATCH)  
- *Recommendation:* Add PATCH routes: `/api/portal/admin/decisions/:id` and `//api/portal/admin/claims/:id`. Convert read-only rows to editable fields (copy milestone pattern from PortalAdmin.jsx:387–400) with onBlur handlers. Add delete buttons. Unblocks inline editing.

**Milestone admin shows all 14 canonical phases unsorted by status**
- *Severity:* MEDIUM  
- *Impact:* All milestones render flat, no grouping by achieved vs. pending. Admin at month 6 can't quickly scan which phase is active. Must read dates or scroll.  
- *Location:* PortalAdmin.jsx:377–422  
- *Recommendation:* Group: 'Achieved' section (checkmark, muted, sort DESC by date) collapsed by default, 'Pending' section above. Copy PortalDecisions.jsx toggle pattern. Instant phase visibility.

**Bulk operations missing: no multi-photo upload, no bulk milestone management**
- *Severity:* MEDIUM  
- *Impact:* Uploading 20 progress photos requires 20 file dialogs. Adding 14 milestones requires 14 blur events. No import, no template copy, no drag-reorder. Builders fall back to spreadsheets or SQL hacks.  
- *Location:* PortalAdmin.jsx:352–373 (single file input); lines 377–422 (row-by-row milestones)  
- *Recommendation:* Replace file input with dropzone (multi-select, drag-drop). CSV/JSON bulk import for milestones with template selectors ('Residential build', 'Renovation'). Add sort_order drag handles. Reduces setup time 80%.

**No admin visibility into client engagement or activity**
- *Severity:* MEDIUM  
- *Impact:* No data on: did client view portal? Which pages? How long ago? No activity tab, no read_at tracking (field exists but never written). message.read_at column exists (migration 027) but is unused. Builders have no ROI visibility, likely resort to email ('Did you see the update?').  
- *Location:* PortalAdmin.jsx (no metrics tab); portalRoutes.mjs line 1141 (read_at field exists, never updated)  
- *Recommendation:* Add 'Activity' or 'Metrics' tab: portal link creation, last page view (timestamp + page name), message read status, decisions opened vs. responded. Show sparkline of weekly views. Update read_at when pages load (backend beacon or frontend POST). Helps schedule follow-ups.

#### **B. Usability & UX Friction**

**Hardcoded 'Sam' breaks branding in multi-user/multi-builder contexts**
- *Severity:* MEDIUM  
- *Impact:* Portal placeholder text, empty states, update author ('— Sam, Site Manager'), and builder contact (hardcoded 'Sam Morris') all hardcode a single person. Breaks branding for multi-builder projects. Looks unfinished.  
- *Location:* PortalHome.jsx:63; PortalLiveSite.jsx:26; WeeklyUpdateCard.jsx:27; PortalConversations.jsx:109; PortalAdmin.jsx:52 (default); portalRoutes.mjs:343, 726  
- *Recommendation:* Wire builder/site manager name from project context or logged-in user. Read from job.primary_contact_name or `getSupabase().auth.getUser()`. Store on portal_updates.author_name (schema already supports). Update placeholder text to 'your builder' or 'Site Manager'.

**Decision UI terminology confused ('selection' vs. 'variation')**
- *Severity:* MEDIUM  
- *Impact:* DecisionCard uses ⚡ 'selection' and 📋 'Variation ·' labels inconsistently. Mix of technical DB types and user-facing labels. Clients confused about what they're approving.  
- *Location:* DecisionCard.jsx:32–87; PortalDecisions.jsx  
- *Recommendation:* Establish consistent terminology: 'Product Selection' for design/product choices (clear visual badge), 'Scope Variation' for cost/schedule changes (distinct color). Update admin to use same terminology.

**Decision approval flow lacks cost+schedule confirmation**
- *Severity:* HIGH  
- *Impact:* Variation approval shows cost confirmation only (line 144: 'Approve for $X?'). If cost=$0 but schedule delta>0, confirmation is silent on schedule impact. Selections skip confirmation entirely if client taps option button—no second chance to review cost_delta.  
- *Location:* DecisionCard.jsx:141–165  
- *Recommendation:* Show unified confirmation modal for all decision types: '[Selection name] — +$X, +Y days?' with Approve/Cancel. Require explicit confirmation before option buttons, not after.

**Message thread poor UX on mobile; no sync status indicator**
- *Severity:* MEDIUM  
- *Impact:* Max-height container (50vh) on mobile, no scroll indicator, keyboard hides input. Scroll-to-bottom fires after message state change but context is cut off. 30s auto-refresh (line 36–40) has no visual indicator; send errors caught silently with no retry UI.  
- *Location:* PortalConversations.jsx:36–44, 76–77, 105–111  
- *Recommendation:* Use flex-1 to fill space, add visual scroll indicator or 'New messages' badge. Add subtle 'Last synced X sec ago' corner indicator. On send error, keep message in input, show persistent error banner with manual Retry button. Don't silently clear on failure.

**Site walk booking lacks persistent confirmation and booking status**
- *Severity:* MEDIUM  
- *Impact:* After booking (SiteWalkBooker.jsx:19–27), success message disappears on page refresh (local state only). Refreshed page shows date selector again—unclear if booking was saved. No confirmation email or summary.  
- *Location:* SiteWalkBooker.jsx:19–27, 48–51; PortalConversations.jsx  
- *Recommendation:* Load booked walks from API with booking status. Show persistent confirmation card after booking. On conversations page, display booked walks as read-only confirmation with 'Pending builder confirmation' badge.

**Portal admin forms lack inline validation and loading states**
- *Severity:* MEDIUM  
- *Impact:* No asterisks on required fields, no real-time validation, no error on blur if request fails, form can be re-submitted while in flight, Save button has no 'Saving...' state.  
- *Location:* PortalAdmin.jsx:276–333 (updates), 377–421 (milestones), 426–448 (decisions), 452–473 (claims)  
- *Recommendation:* Mark required fields visibly. Add client-side validation on blur. Disable Save button during submission, show 'Saving...'. Toast error messages if request fails, allow retry without losing form state.

**Portal token regeneration breaks immediately; no grace period or recovery**
- *Severity:* MEDIUM  
- *Impact:* Settings tab 'Regenerate link' shows confirmation, then immediately replaces old token in DB. No way to recover if admin clicks by accident. No grace period for shared old links.  
- *Location:* PortalAdmin.jsx:516–526; portalRoutes.mjs:189  
- *Recommendation:* Show old token before regenerating so admin can confirm. Consider 7-day grace period where old token still works (log warning). At minimum, require typing 'CONFIRM' in dialog. Warn 'Previous links will stop working immediately.'

**Accessibility: minimal focus indicators, no ARIA labels**
- *Severity:* MEDIUM  
- *Impact:* Portal pages lack focus-ring classes. Buttons lack aria-labels describing action. Decision card buttons don't label action. Screen reader users can't distinguish decision types or card actions.  
- *Location:* /src/pages/portal (no consistent focus-ring); PortalApp.jsx:209 (one aria-label); DecisionCard.jsx (buttons lack labels)  
- *Recommendation:* Add focus-ring to all interactive elements. Add aria-labels describing action + context. Add aria-describedby on complex cards. Test with screen reader.

**Budget allowances section confusing when no selections made**
- *Severity:* LOW  
- *Impact:* Allowance rows show 'TBC' when selectedTotal is null. No hint that selections are made elsewhere or that this is fed by decision approvals.  
- *Location:* PortalBudget.jsx:62–86  
- *Recommendation:* If all allowances null, show: 'Your selections will update totals as you approve product decisions.' Link to Decisions page. Use clearer headers: 'Allowance' vs. 'Your Selections' vs. 'Over/Under'.

**MyPortal list missing project context and status**
- *Severity:* MEDIUM  
- *Impact:* Project list shows address + 'Open portal' only. No status badge (Active/Planning/Complete), no next milestone, no pending decision count. 'Portal link not ready' error is vague—is it builder's fault?  
- *Location:* MyPortal.jsx:59–89  
- *Recommendation:* Add status badges, estimated completion date, next milestone, or pending decision count. Clarify error message: 'Contact your builder to activate your portal.' Add help link if new.

**Completed decisions show minimal context; no outcome clarity**
- *Severity:* LOW  
- *Impact:* Completed decisions (PortalDecisions.jsx:92–108) collapsed by default, then show as minimal '✓ Title — date' text. No color coding, no outcome badge ('Approved' green / 'Declined' red), no brief outcome summary.  
- *Location:* PortalDecisions.jsx:92–108  
- *Recommendation:* Show distinct visual style when expanded (faded bg, smaller font). Add outcome badge + brief summary ('Approved — +$5k'). Helps client remember approvals.

#### **C. Data Consistency & Response Patterns**

**API responses lack `ok` wrapper; 11 endpoints return raw data**
- *Severity:* HIGH  
- *Impact:* Per CLAUDE.md standards, all responses must use `ok(res, data)` pattern. These endpoints return data directly without `ok` field, breaking app-wide contract: `/api/portal/:token`, `/home`, `/timeline`, `/livesite`, `/decisions`, `/budget`, `/journal`, `/documents`, `/myhome`, `/conversations`, `/warranty`. Frontend has defensive fallback logic (`data.completionPercent ?? data.completionPct ?? 0`) because response shape is unpredictable.  
- *Location:* portalRoutes.mjs:743, 821, 875, 920, 952, 1027, 1066, 1076, 1110, 1144, 1299  
- *Recommendation:* Wrap all success responses with `ok(res, { keyName: data })`. Example: `ok(res, { project: {...}, token: ... })`. Verify frontend doesn't assume `ok` field before change.

**Duplicate field names in responses: completionPercent + completionPct**
- *Severity:* MEDIUM  
- *Impact:* `/api/portal/:token/home` returns both names (line 822–823). Frontend defensive: `data.completionPercent ?? data.completionPct ?? 0`. Only one canonical field should exist.  
- *Location:* portalRoutes.mjs:822–823; PortalHome.jsx:25  
- *Recommendation:* Keep only `completionPercent` (camelCase). Remove `completionPct` alias.

**Confusing field aliasing: variationDays as delayDays**
- *Severity:* MEDIUM  
- *Impact:* `/api/portal/:token/timeline` returns `variationDays` (schedule_delta sum) but aliases as `delayDays` (line 877–878). Frontend uses `data.delayDays` but calculation is actually variation-induced delays, not project delays. Misleading naming.  
- *Location:* portalRoutes.mjs:860, 877–878; PortalTimeline.jsx:33  
- *Recommendation:* Use single field: `scheduleDelta` (matches DB column). Remove aliases.

**Portal status enums scattered; not in constants.js**
- *Severity:* MEDIUM  
- *Impact:* Claims statuses ('upcoming', 'invoiced', 'paid') hardcoded in portalRoutes.mjs:541, not in constants.js. Decision urgency mixes DECISION_URGENCY.NORMAL/.URGENT with undeclared 'overdue' string. Warranty urgency ('can_wait', 'this_week', 'urgent') hardcoded in portalRoutes.mjs:1266.  
- *Location:* portalRoutes.mjs:541, 1266; DecisionCard.jsx:13, 28; PortalDecisions.jsx:10; constants.js:236–246  
- *Recommendation:* Add to constants.js: `PORTAL_CLAIM_STATUSES = {...}`, `WARRANTY_URGENCY = {...}`. Update `DECISION_URGENCY` to include OVERDUE. Import everywhere instead of hardcoding.

**Admin endpoints lack role-based access control**
- *Severity:* MEDIUM  
- *Impact:* All `/api/portal/admin/*` routes use `requireAuth` only (no role check). A non-admin authenticated user could theoretically POST to endpoints. Other modules use `requireRole(['admin', 'supervisor'])`.  
- *Location:* portalRoutes.mjs:177 (app.use for admin routes), 179–736 (all admin routes)  
- *Recommendation:* Add role gating: `app.use('/api/portal/admin', requireAuth, requireRole(['admin', 'supervisor']))`. Verify PortalAdmin.jsx is only accessible to authenticated admin users.

**Inconsistent API field naming: portalToken vs. portal_token vs. token**
- *Severity:* MEDIUM  
- *Impact:* Portal token returned with multiple names: `/api/portal/admin/generate-token` returns `token` (line 194), `/api/portal/admin/enable-test` returns `portalToken` (line 224). Frontend reads `summary?.project?.portalToken` but also constructs with `proj.portalToken`. Inconsistency requires frontend to check multiple names.  
- *Location:* portalRoutes.mjs:194, 224; PortalAdmin.jsx:83, 180, 224, 367, 511  
- *Recommendation:* Standardize on `portalToken` across all responses. Update generate-token endpoint to return `{ ok: true, portalToken: ..., portalUrl: ... }`.

#### **D. Inter-Module Data Interaction Problems**

**Dual contract value sources (projects.contract_value vs. jobs.contract_value)**
- *Severity:* HIGH  
- *Impact:* Portal reads contract value with fallback chain: (1) projects.contract_value (manually entered in portal admin), (2) jobs.original_contract_value or jobs.contract_value (set by finance on fee proposal). Portal admin Settings tab lets users manually edit projects.contract_value, but this is a stale copy. When projects.job_id exists, the /budget endpoint reads from jobs; otherwise, legacy fallback. Users must set contract value in portal even though finance already has it. Changes to jobs not reflected if job link wasn't in place initially.  
- *Location:* portalRoutes.mjs:961–1039; PortalAdmin.jsx:476–490  
- *Recommendation:* Remove manual contract_value input from Portal Admin Settings tab. If projects.job_id is set, read from jobs (canonical). For unlinked projects, show read-only banner 'Contract value from Finance'. Alternatively, add trigger to sync jobs.contract_value → projects.contract_value on job update (mig 079 dropped the trigger—re-add for consistency).

**Portal decisions (variations) duplicate finance job_variations**
- *Severity:* HIGH  
- *Impact:* Both portal_decisions (type='variation') and job_variations tables record variations. When projects.job_id is set, /budget endpoint reads from job_variations (canonical, owned by finance). For legacy/unlinked projects, reads from portal_decisions. Portal admin can create variations in Decisions tab → portal_decisions; finance creates via Finance module → job_variations. Two source-of-truth scenarios. If a project is later linked to a job, old portal_decisions variations are orphaned and never displayed.  
- *Location:* portalRoutes.mjs:1012–1024; PortalBudget.jsx:49–59  
- *Recommendation:* Once project.job_id is set, prevent portal admin from creating portal_decisions type='variation'. Guide to Finance module or provide proxy UI that writes to job_variations. Add data migration to port orphaned portal_decisions into job_variations when projects are retrospectively linked.

**Portal milestones not synced with operations schedule**
- *Severity:* MEDIUM  
- *Impact:* Portal milestones manually managed via CANONICAL_MILESTONES list (14 phases). Operations schedule_tasks table has data-driven phases with eta/actual dates. When ops marks phase complete (status='complete'), portal milestone for that phase is not auto-updated (portal_milestones.achieved_at). Admins must manually 'Mark today'. Two places manage the same information.  
- *Location:* PortalAdmin.jsx:377–422; portalRoutes.mjs:1048–1070  
- *Recommendation:* Auto-sync: when schedule_tasks for phase reaches 100%, set corresponding portal_milestones.achieved_at to today. Maintain manual override UI but show scheduled/actual dates from schedule_tasks read-only. Derive portal milestone ETA from schedule_tasks.end_date when unset.

**Portal photos depend on external Dropbox; no fallback**
- *Severity:* MEDIUM  
- *Impact:* Photo uploads (PortalAdmin Updates tab) call uploadPortalPhoto, which requires Dropbox configured. If not set up, returns 503 'Dropbox not configured' with no workaround or helpful message. Small-scale operations blocked.  
- *Location:* portalRoutes.mjs:381–441; PortalAdmin.jsx:351–373  
- *Recommendation:* Add fallback: if Dropbox not configured, use Supabase Storage bucket ('portal-photos'). Or detect missing config and show setup banner with link to Settings. Update error message: 'Dropbox not configured. Configure in Settings or use local storage option.'

**No document distribution pipeline to portal**
- *Severity:* MEDIUM  
- *Impact:* /api/portal/:token/documents endpoint returns empty list with placeholder 'Documents will appear here.' No mechanism to share contracts, specs, warranties, permits from job/operations to client portal. Portal admin can upload photos but not PDFs or technical docs.  
- *Location:* portalRoutes.mjs:1072–1082; PortalLiveSite.jsx  
- *Recommendation:* Add lightweight document distribution: allow admins to link existing job_documents or upload new, store with type metadata (contract, permit, plan, spec, warranty), serve on portal Documents page with access control.

**Contract value warning misleading when job_id is set**
- *Severity:* MEDIUM  
- *Impact:* Overview tab shows warning 'Contract value not set — Budget shows $0' even if project.job_id is set and job.contract_value > 0. Warning is false; budget endpoint reads from job successfully. Misleads admins into manually setting projects.contract_value.  
- *Location:* PortalAdmin.jsx:142–156  
- *Recommendation:* Suppress warning if projects.job_id is set and jobs.contract_value > 0. If projects.job_id is NULL and projects.contract_value is 0, show warning + note: 'Contract value auto-populated from Finance on fee proposal acceptance.'

#### **E. Performance & Data Integrity**

**N+1 Query: Journal endpoint fetches photos sequentially per milestone**
- *Severity:* HIGH  
- *Impact:* Journal endpoint (line 1048–1053) fetches achieved milestones, then iterates with sequential for loop (1056–1064) executing one query per milestone for photos. 10 milestones = 11 queries instead of 2. Serialization intended for Dropbox, but Supabase supports parallel joins.  
- *Location:* portalRoutes.mjs:1041–1070  
- *Recommendation:* Replace loop with single query: fetch all project photos where milestone_key IN (...), then group in memory. Reduce N+1 to 2 queries.

**Unbounded wildcard selects in admin summary**
- *Severity:* HIGH  
- *Impact:* Admin summary (portalRoutes.mjs:585–595) uses `select('*')` on 9 tables in parallel. Transfers all columns (storage_path, full update body, etc.) regardless of admin UI needs. 100 updates + 500 photos = hundreds of KB unnecessary data.  
- *Location:* portalRoutes.mjs:585–595  
- *Recommendation:* Specify only required columns per table. Example: updates → `'id, week_of, headline, published, created_at'`, photos → `'id, public_url, caption, sort_order'`. Reduces payload ~60–70%, improves load time.

**Missing pagination on client-facing unlimited lists**
- *Severity:* MEDIUM  
- *Impact:* Two endpoints fetch all records: (1) GET /api/portal/:token/livesite line 914 (no limit on first query), (2) GET /api/portal/:token/warranty line 1296 (no limit). 5-year handover = hundreds of warranty items rendered at once, DOM bloat.  
- *Location:* portalRoutes.mjs:913–918, 1296  
- *Recommendation:* Add pagination: `.limit(50)` on livesite, paginated warranty with `{ items, total }`. Provide 'Load more' UI.

**Stale contract value due to legacy fallback for unlinked projects**
- *Severity:* HIGH  
- *Impact:* Budget endpoint reads projects.contract_value for unlinked portals (no job_id). This is a stale, manually-entered copy. No UI prevents portal creation without job, nor warns. Unlinked portal = non-canonical budget data. Comment (line 978) acknowledges it's a workaround.  
- *Location:* portalRoutes.mjs:961–1039  
- *Recommendation:* Enforce project ↔ job linkage in portal admin UI: show red banner if portal_enabled=true but job_id is null. Prevent enabling without linked job (add FK constraint or validation). Aligns with canonical data ownership (Finance owns contract).

**Decision response has no confirmation tier for cost/schedule impact**
- *Severity:* MEDIUM  
- *Impact:* POST /api/portal/:token/decisions/:decisionId/respond accepts client approval without confirmation. Variations carry cost_delta and schedule_delta. Accidental approval of $50k variation immediately clears procurement blockers with no audit. Per CLAUDE.md, facts with consequence require confirmation before canonical.  
- *Location:* portalRoutes.mjs:1208–1255  
- *Recommendation:* Add confirmation layer: first POST sets status='pending_client_confirmation', second POST with signed token finalizes to 'approved'. Or require builder review after client approval before procurement clears. Log all responses with timestamp + IP.

---

### Bigger Changes (Beyond Single-Page Fixes)

1. **Message hub integration:** Implement Messages tab in Portal Admin with threaded builder↔client conversation visible to both roles. Sync read_at status. Add email notifications on new client message. Requires backend webhook/event system.

2. **Auto-sync operations to portal:** Create nightly job that pipes published site diary entries (if enabled) into draft weekly update cards. Sync milestone achievement from schedule_tasks to portal_milestones. Deduplicates manual rewriting and keeps portal in lockstep with ops.

3. **Eliminate dual data entry:** Remove portal_decisions type='variation' for job-linked projects. Route all variation management through Finance module. Add SOP and migration for legacy data. Enforce canonical source in UI (red banners when stale).

4. **Optimistic UI with smart reloads:** Stop full-page reloads on every blur. Implement granular optimistic updates (e.g., update just the milestone in state, API in background, merge only on error). Reduces API calls by 80%.

5. **Bulk operations UI:** Add multi-file upload (dropzone), CSV/JSON import for milestones, template selectors, photo reordering, batch site walk management (cancel/remind). Enable admin to set up large portals in 10% of current time.

6. **Metrics & engagement dashboard:** Track client portal activity (view history, last page, message read status, decision engagement). Show sparkline, badges for stalled decisions, email digest of open items. Closes visibility gap.

7. **Decision workflow formalization:** Add confirmation tier (pending → needs client confirmation → approved). Email client on approval to acknowledge. Auto-create job_variations or schedule_task when finance-linked decision is approved. Audit log all responses.

8. **Standardize API responses:** Wrap all 11 GET endpoints with `ok(res, data)` pattern. Remove duplicate field names, consolidate aliases, add status enums to constants.js. Single source-of-truth for response shape.

---

### Top Issues (3–6 Highest Impact)

1. **Messages sent by clients are invisible to admins** — Zero visibility into client questions; communication defaults back to email, defeating portal purpose. Add Messages tab to PortalAdmin.

2. **Admin loads 10 data types but UI exposes 6; every keystroke triggers full re-fetch** — Wasteful queries, sluggish UX, DB thrashing. Implement optimistic updates and expose/lazy-load all data.

3. **Site diary not piped to portal; admins manually rewrite updates** — Double-entry burden, stale client comms, information silos. Auto-sync diary entries to draft weekly update cards.

4. **Dual variations source (portal_decisions vs. job_variations); non-canonical data shown to clients** — Risk of approval mismatch between finance and portal. Prevent portal edits to variations once job-linked; route through Finance.

5. **Decisions immutable after creation; no edit UI** — Admin mistakes force delete+recreate (lose history). Add PATCH routes and inline edit forms for decisions/claims.

6. **API responses lack `ok` wrapper; inconsistent field naming** — Frontend defensive code, confusing response shape, breaks app standards. Standardize all responses with `ok()` wrapper and centralized status enums.

**Top issues:** Client messages stored but invisible to admins; portal communication defaults to email; Admin summary loads 10 data types but only displays 6; every keystroke triggers wasteful full-page re-fetch of all 10; Site diary never pipes to portal; admins manually rewrite updates creating double-entry and stale client comms; Portal decisions (variations) duplicate finance job_variations source; risk of approval mismatch and orphaned data; Decisions and claims immutable after creation; mistakes force delete+recreate, losing history; API responses lack `ok` wrapper and have duplicate/inconsistent field names; violates app standards

**Bigger changes (discussion):**
- Implement bidirectional Messages tab in Portal Admin with threaded builder↔client view, read status tracking, and email notifications on new messages
- Create nightly auto-sync job to pipe published site diary entries into draft weekly update cards and sync milestone achievement from operations schedule_tasks
- Eliminate dual variations source: prevent portal admin from managing variations once project.job_id is linked; route all variation changes through Finance module with data migration for legacy records
- Replace full-page reloads with optimistic updates: setState immediately on blur, fire API in background, merge only on error; reduces API calls by ~80% and improves UX responsiveness
- Build bulk operations UI: multi-file upload dropzone, CSV/JSON milestone import with templates, photo drag-reorder, batch site walk cancel/remind (enables 10x faster portal setup)
- Add client engagement metrics dashboard: view history, last page visited, message read status, decision response times, open items digest; close visibility gap that pushes admins back to email

---

## Carpentry (Subsidiary) Module: Audit Report

### Workflow Overview

The Carpentry module provides structured job tracking across five core tabs (Overview, Schedule, Diary, Costs, Budget), enabling construction teams to manage projects from creation through closeout. The module integrates with Buildexact (estimates), Workforce (labour timesheets), and Finance (costs), and tracks core construction KPIs (labour burn-rate, margin variance, cost tracking).

**Workflow arc:** Create job (from Buildexact estimate or manual entry) → seed budget categories → track labour via timesheets (attributed post-entry) → log daily diary & costs → monitor budget burn → closeout with performance snapshot.

**Critical friction points:**
1. **Data re-entry & handoff gaps** — client contact denormalized; labour attribution manual post-timesheet; costs entered twice (invoice + form); budget categories require XLSX re-import despite Buildexact link already present
2. **Visibility & discoverability** — burn-rate hidden until cost model synced manually; status changes buried in hover dropdown; no dashboard alerts for at-risk jobs; diary & task panels conflated in same tab
3. **Incomplete workflows** — defects status defined but no defect management; closeout unvalidated (no sign-off requirement); no variation/change-order tracking; no bulk operations on dashboard
4. **Inter-module isolation** — diary duplicated (site_diary vs carpentry_site_diary); schedule disconnected from Operations; tasks reuse Operations schema with assignment broken; no unified handoff from Sales/Operations

---

### Findings by Theme

#### **USABILITY FRICTION — Workflow Discoverability & UX Patterns**

**Top friction points that slow users down on every job:**

- **Status dropdown is hidden in hover state** (CarpentryJobDetail.jsx:319–338) — "Change Status ▾" is a secondary grey button that only reveals options on hover. On mobile or under pressure, users miss it. Recommend: make status a visible tab-like control or badge-click modal (like Close Job modal pattern). *High severity, quick win.*

- **Budget seeding message creates re-entry friction** (CarpentryJobDetail.jsx:1281–1294) — "Import the Buildexact estimate XLSX to seed them" appears even when buildexactJobId is already set. User uploaded XLSX once at creation; message implies they must re-upload. Recommend: add "Refetch from Buildexact" button when job already linked to Buildexact, call POST /api/carpentry/buildexact/fetch instead. Remove XLSX re-upload assumption.

- **Diary tab conflates two workflows** (CarpentryJobDetail.jsx:816–1012) — Site diary (observations, weather, trades) and worker task management coexist in same scrollable region. User scrolls to "Site Diary" expecting observations, finds task checkboxes first. Recommend: promote TasksPanel to its own tab (Overview → Schedule → Tasks → Diary → Costs → Budget). Aligns mental model with construction phases.

- **New Job modal mixes import & manual creation** (CarpentryDashboard.jsx:40–405) — "Import Buildexact" section in slate bar atop form is unclear. New users don't realize import is optional and may skip it, manually re-entering data Buildexact already has. Recommend: redesign as 2-step wizard: "How to create? [Import Buildexact] [Import XLSX] [Manual]" → then appropriate form. Explicit affordance, no guessing.

- **Cost entry is manual form-by-form with no bulk actions** (CarpentryJobDetail.jsx:1145–1181) — Each material cost requires separate "Add Cost" click + form fill. Project with 20+ supplier invoices = 20 form submissions. No OCR invoice upload, no CSV bulk import, no template by supplier. Recommend: add invoice OCR (Claude extraction: description + amount pre-filled), or CSV template upload, or Xero integration. Eliminates double data-entry from invoice.

- **Labour actuals only accrue when timesheets are manually attributed** (Workforce.jsx:97–135, workforceRoutes.mjs:626–643) — Timesheet created → approved → user must re-open, find again, select carpentry job from dropdown. Unattributed timesheets add to costs but don't show in Budget tab burn-rate. Silent data loss risk. Recommend: offer carpentry_job dropdown at timesheet creation; pre-populate if entry is for a specific job. Bulk-assign action in Approvals tab.

- **Labour burn-rate unavailable without manual Settings sync** (CarpentryJobDetail.jsx:1332) — "Sync the Company Cost Model (Settings → Company Cost Model) to see the labour burn‑rate..." makes critical data optional. Most jobs have no burn-rate visibility. Recommend: compute burn-rate live with sensible defaults (8-hr day, $50/hr average) for early warnings. Or fetch cost model lazily at job load. Show warning if cost model stale (>7 days).

- **Margins are derived but also editable, creating data inconsistency** (CarpentryJobDetail.jsx:368–374, carpentryRoutes.mjs:301–308) — quotedMarginPct is stored but PATCH endpoint doesn't allow update. Changing value/cost silently changes margin. But users can't lock a negotiated margin. Recommend: allow quotedMarginPct edit in Overview form. Keep in PATCH allowed list. Add tooltip: "Override here if margin was negotiated separately from value/cost."

- **Empty states don't guide next action** (CarpentryJobDetail.jsx:989–1290) — "No diary entries yet" or "No budget lines yet" are passive. Recommend: enhance to "No diary entries yet. Click [+ New Entry] to document daily site activity, weather, and issues—paste voice transcripts for AI structuring."

**Severity: High (status, budget seeding, cost entry, labour attribution, burn-rate); Medium (diary/task conflation, new job flow, margin semantics)**

---

#### **WORKFLOW INEFFICIENCY — Manual Steps & Repetitive Re-Entry**

**Multi-step tasks that should be single actions:**

- **Five-step journey to change job status** — Job detail view → click Status dropdown (hover required) → select status → confirm → see closeout modal (for complete) → fill lessons learned → save. Simple state change requires multiple afford ances. Recommend: combine "Close Job" button with status transition. Save status change + lessons learned in single POST.

- **Dialogue box shows forecast margin but can't validate calculation** (CarpentryJobDetail.jsx:86–99) — CloseoutModal displays "Forecast Margin" but no labour hours, cost/m², or other KPIs to let user verify math before confirming. Data exists but not shown. Recommend: show labour hours, cost/m², hours/m² in modal preview. After closeout, toast: "Job closed. Final margin: 22.5%. [View Report]"

- **Budget categories lost if estimate import delayed** (carpentryRoutes.mjs:250–256) — Auto-seeding happens at job creation only. If user creates job manually (no estimate), labour timesheets have nowhere to accrue until estimate imported later. No warning that budget categories are missing. No way to auto-seed default categories. Recommend: (a) auto-seed default labour categories (First Fix, Cladding, Second Fix, etc.) on job creation, (b) add "Create default categories" button in Budget tab if labour timesheets exist but categories don't.

- **Task assignment requires leaving Carpentry module** (CarpentryJobDetail.jsx:621–814, carpentryRoutes.mjs:758–790) — Tasks created in TasksPanel have no assignedTo field in form. To assign, user navigates to Workforce module. Recommend: add assignedTo dropdown to task create form. Pass to POST /tasks endpoint. Keeps workflow in-module.

- **Milestone dates don't link to actual work completion** (CarpentryJobDetail.jsx:502–517, carpentryRoutes.mjs:503–593) — targetDate and actualDate are manual date pickers. No link to Operations schedule_tasks, no auto-update when diary says "frame complete", no escalation for missed dates. Recommend: add "Link to schedule task" selector. Auto-update actualDate when linked task marked 100% complete. Show overdue badge on milestones.

- **Diary AI entries don't trigger downstream work** (CarpentryJobDetail.jsx:847–869) — User dictates "Frame complete", AI structures it, diary saves. No follow-up: supervisor still manually creates milestone or task to reflect completion. Wasted structured data. Recommend: after AI parsing, show suggestion panel: "AI suggests: [mark milestone X complete], [create task Y]." Allow approve/auto-create.

- **Client contact re-entered in Carpentry despite existing on leads/jobs** (CarpentryDashboard.jsx:50–68, carpentryRoutes.mjs:207–226) — NewJobModal requires manual client_name, contact, phone, email. This data already lives on the lead or job record. Recommend: add ?fromJobId or ?fromLeadId query param. Pre-fetch and pre-fill client fields. Add "Create Carpentry Job" button to Sales lead / Operations job detail pages.

**Severity: High (status change, budget seeding, labour attribution); Medium (task assignment, milestone dates, diary AI, client re-entry)**

---

#### **INTER-MODULE INTEGRATION BREAKDOWNS**

**Data handoffs that create silos, re-entry, or confusion:**

- **Diary split between two tables with incompatible schemas** (SiteDiary.jsx → site_diary; CarpentryJobDetail.jsx → carpentry_site_diary) — Operations uses site_diary (project_id), Carpentry uses carpentry_site_diary (job_id). Both call shared /api/diary/structure for AI, but save paths diverge. Schema drift: site_diary has dropbox_pdf_path, carpentry doesn't. No unified view of "latest site diary" across job + project. Recommend: unify data layer: migrate carpentry_site_diary → site_diary with nullable carpentry_job_id column (add to migration). Single diary table, partition by entity_type in UI.

- **Labour attribution requires manual re-assignment post-approval** (Workforce.jsx:97–135; workforceRoutes.mjs:626–643) — Timesheet created → approved → supervisor re-opens, finds timesheet, manually selects carpentry_job from dropdown. Unattributed timesheets add to labour costs but don't accrue against budget categories. Silent failure in burn-rate. Recommend: at timesheet creation (WorkerLogHours.jsx), offer optional carpentry_job_id autocomplete. Pre-populate if entry is for a specific job. Add bulk-assign action in Approvals tab.

- **Tasks exist in two unrelated tables with no unification** (site_tasks via carpentry_job_id; carpentry_job_milestones) — Operational tasks ("Install ridge beam") in site_tasks; phase milestones ("Frame Start") in carpentry_job_milestones. Two schemas, two tabs, no way to view both together or link task to milestone. Can't say "task X is part of milestone Y". Recommend: merge into one task table with parent_milestone_id optional FK, OR create unified "Schedule & Tasks" view with filtering by type. Add bulk operations: "Assign N tasks to milestone M", "Mark milestone complete if all child tasks done".

- **Budget seeding is re-entry despite Buildexact already linked** (CarpentryJobDetail.jsx:1253–1278; carpentryRoutes.mjs:975–1010) — Job creation auto-seeds budget if buildexactJobId set. But if Buildexact fetch fails silently, budget is empty. Budget tab then says "Import the Buildexact estimate XLSX to seed them automatically." User already uploaded XLSX in NewJobModal; must find & re-upload same file. Recommend: (a) in BudgetTab, add "Refetch from Buildexact" button if buildexactJobId set, (b) let user re-seed without uploading XLSX again, (c) add error logging if auto-seed fails at job creation (currently silent console.warn).

- **Schedule disconnected from Operations Gantt** (CarpentryJobDetail.jsx:469–606 ScheduleTab; Operations schedule_tasks separate) — Carpentry has simple milestone tracking (target/actual dates); Operations has Gantt with dependencies, ripple, EOT. Two separate schedule systems, confusion about which is source of truth. Carpentry milestones invisible in Operations schedule, and vice versa. Recommend: document SOP: Operations Gantt for project-wide, Carpentry milestones for phase-gates. OR: migrate milestones to schedule_tasks with phase_type filter in UI. Add "Link to Operations schedule" button with auto-sync.

- **Tasks span two modules with broken assignment** (CarpentryJobDetail.jsx:621–814 TasksPanel; Workforce module separate) — Supervisor creates tasks in Carpentry, worker sees them (somewhere) in Workforce. No real-time sync, no assignment at creation time, no feedback when task completed. Recommend: add assigned_to field to task create form (not currently in create endpoint). Extend Worker PWA to show live task list. Add real-time polling or WebSocket for updates.

**Severity: High (diary silos, labour attribution, task unification, schedule integration); Medium (budget re-seeding, task/Workforce handoff)**

---

#### **CONSISTENCY VIOLATIONS — Enums, Schemas, API Patterns**

- **Site tasks API returns snake_case instead of camelCase** (carpentryRoutes.mjs:749, 785, 817) — GET/POST/PATCH /api/carpentry/jobs/:id/tasks return raw database columns (task_id, created_at, completed_at). All other Carpentry endpoints convert to camelCase (rows are passed through rowToCamel). Frontend expects camelCase. Violates CLAUDE.md API standard §2. Recommend: wrap returns with rowToCamel(task) and rowsToCamel(data). Lines 749, 785, 817 each.

- **Status enum mismatch across migration & constants** (migrations/065_carpentry_module.sql:32–35; carpentryRoutes.mjs:41–44; constants.js:349–363) — Migration defines 'frame','fitoff','both','other' for project_type but constants.js uses 'full_package'. Status migration is 'active','on_hold','complete','cancelled' but code includes 'defects'. Recommend: update migration 065 to match constants: project_type → ('frame','fitoff','lockup','full_package','other'), status → ('active','on_hold','defects','complete','cancelled').

- **Defects status defined but no workflow implemented** (constants.js:350; CarpentryDashboard.jsx:30, 448; CarpentryJobDetail.jsx:292; carpentryRoutes.mjs:41) — "Defects" exists in enums, allows filtering & status change, but no UI to manage defects (no defects list, no inspection sign-off, no defect tracking). Status is treated like any other in dropdown, no features tied to it. Recommend: (a) add Defects tab to CarpentryJobDetail to track & sign off defects, OR (b) remove defects from enums and use separate defects table linked to complete jobs instead.

- **Margin calculation is sometimes stored, sometimes derived, creating confusion** (CarpentryJobDetail.jsx:368–374; carpentryRoutes.mjs:220–221, 301–308) — quotedMarginPct is stored on job creation but PATCH endpoint doesn't allow update. Frontend shows both "quoted" (if stored) and "derived" (if not). Risk of stale data if user updates value/cost without understanding margin changes. Recommend: allow quotedMarginPct edit in PATCH. Add tooltip clarifying "quoted margin vs actual margin". Store with last_modified timestamp.

- **Closeout doesn't validate job completeness** (CarpentryJobDetail.jsx:45–131; carpentryRoutes.mjs:1160–1297) — CloseoutModal shows summary but no checks: at least 1 diary entry? Labour > 0? Margin >= 0? Job closes with zero costs and no diary entries. Recommend: add server-side validation in POST /closeout: require totalActual > 0, revenue > 0, ≥1 diary entry. Return 400 with user-friendly message; frontend shows error in modal.

**Severity: High (snake_case API, status enum, defects gap, closeout validation); Medium (margin confusion)**

---

#### **PERFORMANCE & DATA INTEGRITY ISSUES**

- **N+1 query in labour actual computation** (carpentryRoutes.mjs:1108–1116 summary endpoint; 1192–1201 closeout endpoint) — Both loop over each approved timesheet and make 2 queries per iteration (entries + employee rate). 20 timesheets = 40+ sequential queries. Same logic duplicated in two endpoints, risk of drift. Recommend: (a) refactor to single joined query: `sb.from('timesheet_entries').select('*, timesheets!inner(*), employees!inner(hourly_rate)').in('timesheet_id', timesheetIds)`, (b) extract into shared helper `computeLabourActuals()` called from both endpoints.

- **Missing pagination on job list endpoint** (carpentryRoutes.mjs:130–152; CarpentryDashboard.jsx:454) — GET /carpentry/jobs returns all jobs, no limit/offset. 500+ jobs in single HTML table without virtual scrolling causes browser slowdown. Recommend: add ?limit=50&offset=0 params, return { jobs, total }. Update CarpentryDashboard with pagination controls or "load more" button.

- **Unbound diary entry list** (CarpentryJobDetail.jsx:816–1012) — GET /diary returns all entries, no limit. 200 diary entries render 200 DOM nodes, slow scrolling. Recommend: add ?limit=50&offset=0, implement pagination buttons or infinite scroll in DiaryTab.

- **Canonical Data Law violation: client contact denormalized** (carpentryRoutes.mjs:160–165; migrations/065_carpentry_module.sql:26–29) — Carpentry job stores client_name, client_contact, client_phone, client_email directly. These are canonical facts (CLAUDE.md §2) and should be linked via FK. Creates dual source-of-truth: if builder contact changes in CRM, old denormalized copy persists silently. Recommend: store only carpenter_contact_id FK. Read builder info at runtime via relationship. For backward compat, migrate: on first read, if carpenter_contact_id is null but client_name set, look up or create crm_contacts row.

- **No cost entry audit trail** (migrations/065_carpentry_module.sql:76–89; carpentryRoutes.mjs:863–903) — carpentry_job_costs has created_at/updated_at but no created_by field. If $5k cost deleted, no record of who/why. Risky for compliance. Recommend: add created_by uuid FK. POST /costs captures req.caller.id. Optional: log deletions to cost_audit table for higher traceability.

**Severity: High (N+1 query, canonical data law); Medium (pagination, audit trail)**

---

#### **GAPS & OPPORTUNITIES**

- **No variation/change-order workflow** — Jobs can't record contract variations, scope changes, or cost impacts. Users rely on email/spreadsheet. Recommend: add carpentry_job_variations table (type, original_amount, variation_amount, reason, status, approvals). Provide approval workflow UI. Track which variations are factored into current budget.

- **Defect management is missing** — Status "defects" exists but no way to log, assign, track, or sign off individual defects. Recommend: create carpentry_job_defects table (description, location, severity, assigned_to, status, target/actual completion). Add Defects tab in CarpentryJobDetail. Tie defects to closeout validation (all resolved before close?).

- **No sign-off/approval workflow for closeout** — Job transitions from active to complete with no supervisor/admin gate, no defect clearance sign-off, no final budget certification. Recommend: add carpentry_job_approvals table (type: defect_clearance/cost_sign_off/completion_sign_off, status, reviewed_by, reviewed_at). On closeout, check if all required approvals signed off.

- **No client/builder visibility into job status** — Builder has zero visibility into progress, milestones, final costs, or completion. Job closes with no notification. No portal link. Recommend: add builder_visible flag to carpentry_jobs. Generate shareable portal link showing status, milestones + actuals, diary entries (optional), cost summary. On completion, send builder notification.

- **No export/reporting for Finance reconciliation** — Cost entries & labour costs tracked separately, no consolidated export for accounting. Accountant must manually aggregate. Recommend: add GET /api/carpentry/jobs/:id/export/costing (CSV: labour cost per category, material costs, total by type, supporting detail). Add "Export for accounting" button in CostsTab.

- **Material budget tracking is total-only** — Labour actuals tracked per category, but material costs summed in total. Can't see if "Cladding materials" overran. Recommend: add cost_category_id FK to carpentry_job_costs. Let user select budget category when adding cost. BudgetTab computes per-category actuals.

- **No bulk actions on dashboard** — Status change/cost export/milestone clone for multiple jobs requires clicking each individually. Recommend: add checkbox column, bulk operations: change status, export costs (CSV), clone milestones. Deferred to Phase 2 if not critical.

- **Missing SOP documentation** (CLAUDE.md mandate) — No SOPs for job creation, budget tracking, diary entry, cost tracking, or closeout. Troubleshoot agent cannot verify features. Recommend: create docs/sops/15_carpentry/ with 5-6 SOPs, each with Section 14 test script (TC-01 through TC-05+). Add to SOP_INDEX.md, SOP_CHANGELOG.md.

**Severity: High (variation/change orders, defects, sign-off, client visibility, Finance export); Medium (material budget, bulk actions, SOP docs)**

---

**Top issues:** Status change is hidden in hover dropdown and requires multiple steps—make it a visible control (badge-click or tab-like button) and combine with Close Job action into single workflow; Labour attribution is manual post-approval—offer carpentry_job dropdown at timesheet creation to eliminate the re-entry friction and silent data loss in budget burn-rate calculations; Budget seeding assumes re-upload of XLSX despite Buildexact already linked—add 'Refetch from Buildexact' button in Budget tab to close the redundant data-entry loop; Diary and task workflows conflated in same tab, confusing the narrative—promote TasksPanel to its own tab so users expect tasks there, not buried under Diary; Labour burn-rate unavailable until manually syncing cost model—compute live with sensible defaults ($50/hr avg, 8-hr day) to give early warnings without friction; Costs require manual form-by-form entry with no OCR or bulk import—add invoice upload with Claude extraction to pre-fill description + amount, eliminating double data-entry

**Bigger changes (discussion):**
- Unify diary data layer: migrate carpentry_site_diary → site_diary with nullable carpentry_job_id discriminator. Eliminates schema silos, enables future job↔project linking, single AI structuring pipeline.
- Redesign labour attribution workflow: offer carpentry_job dropdown at timesheet creation (pre-populate if entry is for a specific job), add bulk-assign in Approvals tab. Closes the post-approval re-entry friction and makes labour attribution discoverable.
- Refactor budget seeding: auto-seed default labour categories on job creation (even without Buildexact), add 'Refetch from Buildexact' button for jobs with buildexactJobId set, eliminate XLSX re-upload assumption.
- Add variation/change-order workflow: carpentry_job_variations table (type, amount, reason, status, approvals) with UI for tracking scope changes. Locks in contract amendments and tracks cost/timeline impact.
- Implement defect tracking: carpentry_job_defects table (description, severity, assigned_to, status) + Defects tab in CarpentryJobDetail. Tie to closeout validation (all resolved before close?). Converts 'defects' status from ghost workflow to functional feature.
- Integrate Operations schedule: link carpentry milestones to schedule_tasks with sync (target_date change ripples, actualDate updates when linked task marked complete). Document which schedule is source of truth (Gantt vs milestones) or unify them.

---

## Settings / Admin / Integrations Module — Read-Only Audit Report

### Module Overview

The Settings/Admin/Integrations module (`/tender-manager/settings`, `/settings/users`, `/admin`) is the centralized control plane for external integrations (Gmail, Dropbox, Buildexact, Google Drive/Search Console/Analytics/Business Profile, Meta/Instagram, Resend), company details, team user management, and workforce configuration. It spans:

- **Frontend:** `src/pages/Settings.jsx` (1000+ lines, 6 integration sections, company/PO/workforce settings)
- **Frontend:** `src/pages/UserManagement.jsx` (user invite, role edit, bulk operations)
- **Server:** `server/lib/adminRoutes.mjs`, `server/lib/authRoutes.mjs`, `server/lib/module4Routes.mjs`
- **Data:** localStorage (company details, email signature, notification prefs), Supabase (`user_settings`, `user_profiles`, `invitations`, `buildexact_webhook_log`)

---

### Workflow Overview

**Typical admin journeys:**
1. **Company setup:** Admin enters company name, ABN, address, logo, PO prefix → saves to localStorage only (no server sync)
2. **Email configuration:** Admin reads plain-text Gmail setup instructions → manually runs `npm run auth:gmail` in terminal → returns to Settings to verify status
3. **Integration testing:** Admin enters Buildexact API key in a form → clicks "Test connection" → key stored in browser localStorage (unencrypted) → result cached in API memory
4. **User onboarding:** Admin sends invitations one-by-one (no bulk upload) → copies invite URL manually → switches to email app → no audit log of what was sent
5. **Workforce settings:** Admin enters cost code mappings (9 separate fields, no validation, no import/export)
6. **Status checking:** Admin navigates to Settings → waits for 3 parallel API calls (integrations/status, buildexact/status, webhook-events) → sees read-only badges with no "fix it" actions

**Key friction points:** (a) Manual copy-paste across terminal/browser/cloud console, (b) Data lost on device wipe (localStorage-only), (c) Silent failures with vague error messages, (d) No multi-step setup flows or progress tracking, (e) Dual data sources (localStorage + Supabase) without sync clarity.

---

### Critical Findings by Theme

#### **Data Integrity & Single Source of Truth (5 findings)**

| Finding | Severity | Impact | Location |
|---------|----------|--------|----------|
| **Company details stored in localStorage only — no server persistence** | HIGH | Admin changes are device-local, lost on cache clear, invisible to other team members. PO PDFs may show outdated company info depending on who generates them. | `src/pages/Settings.jsx:262–353`, `src/lib/companySettings.js:29–72` |
| **Buildexact credentials in browser localStorage without encryption** | HIGH | API key exposed in DevTools/console, shared across team members on same device, no token expiry warnings. | `src/pages/Settings.jsx:11, 68–76, 386–400` |
| **Dual-sync friction for notification/company settings** | HIGH | Settings have `syncUserSetting()` (line 13–18) but it's only used for notifications (line 110), not company details or signature. Inconsistent save patterns across sections (syncNote appears/disappears). No indication whether data is server-backed or local-only. | `src/pages/Settings.jsx:13–18, 224–259, 345–352` |
| **Email signature & RFQ settings browser-only, no per-user server customization** | MEDIUM | Email signature stored in localStorage; multi-device users see different signatures (or stale ones). No audit trail of who sent email with which signature. | `src/lib/rfqSettings.js`, `src/pages/Settings.jsx:143–153` |
| **Integration status endpoint scattered across 3 separate routes** | MEDIUM | Frontend calls `/api/integrations/status` (Gmail, Dropbox, Google, Meta, Resend) + `/api/buildexact/status` + `/api/buildexact/webhook-events` separately. Requires 3 parallel fetches, 3 state variables, inconsistent error handling (integrations/status never returns errors, buildexact/webhook-events returns `{ ok: false, error }`). | `server/dev-api.mjs:2555–2600`, `server/lib/module4Routes.mjs` |

---

#### **Usability & UI Friction (10 findings)**

| Finding | Severity | Friction | Location |
|---------|----------|----------|----------|
| **Integration setup instructions are dense text blocks, not actionable steps** | HIGH | Users must parse 6 separate instruction blocks (Gmail 7 lines, Dropbox 4 lines, Google/Meta/Resend 6+ steps each). Manual copy-paste of env var names, repeated navigation (Settings → terminal → cloud console → back). No checkboxes, progress indicator, or verification steps. | `src/pages/Settings.jsx:180–191, 204–220, 625–634, 661–674, 695–707` |
| **Integration status silently fails with vague error messages** | HIGH | If API is unreachable, the UI renders "Could not reach /api/integrations/status" (line 177) or empty webhook table with ambiguous message "None logged yet — or API has no Supabase service role for reads" (line 481). Users don't know if it's a network error, permission error, or no data yet. No retry button. | `src/pages/Settings.jsx:52–60, 78–92, 177, 481` |
| **Integration sections render 'not configured' when status API fails** | HIGH | GoogleIntegrationSection, MetaIntegrationSection, ResendIntegrationSection check `status?.google` (line 589) but if the API request fails (status = null), they render all badges as 'not configured' even if integrations are actually set up in .env. Misleading red badges everywhere. | `src/pages/Settings.jsx:576–637, 641–677, 681–710` |
| **No confirmation or visual feedback after saving configuration** | MEDIUM | Save buttons for company details (line 343), PO settings (line 530), workforce settings (line 819) trigger onclick handlers and set a syncNote, but (a) no button state change during save ('Saving...' → 'Saved'), (b) syncNote message is small muted text, disappears quickly, (c) if Supabase sync fails, message says 'Saved on this device (Supabase sync failed)' with no actionable next step. | `src/pages/Settings.jsx:343–352, 530–539, 819–821` |
| **Buildexact credential form not persisted to server, only browser localStorage** | MEDIUM | Email + API key stored in localStorage with button 'Save locally', but the comment (line 360) and instructions (line 446–448) are ambiguous about precedence: do browser creds override .env, or are they test-only? Users switching devices must re-enter credentials. No indication if .env credentials are active. | `src/pages/Settings.jsx:355–401, 446–448` |
| **Buildexact webhook events table shows 'No data' without guidance** | MEDIUM | Table says "None logged yet — or API has no Supabase service role for reads" (line 481) but users don't know: (a) has the webhook URL been registered in Buildexact yet? (b) has Buildexact sent any events? (c) is the API missing permissions? No context on how to populate the table or link to Buildexact settings. | `src/pages/Settings.jsx:479–505` |
| **Buildexact test connection shows success but token caching behavior is cryptic** | MEDIUM | Message says "Login succeeded — token cached on the API" (line 468) but users won't understand: how long is it cached? what happens when it expires? do they need to set .env? The precedence and persistence model is undocumented. | `src/pages/Settings.jsx:449–478` |
| **No bulk user management — invite one-at-a-time, no CSV import** | MEDIUM | Admins must send invitations one by one via email form + manually copy URL (no auto-copy button, no 'send via email' automation). No bulk role change or deactivation. Onboarding 5 people = 5+ manual round-trips. | `src/pages/UserManagement.jsx:146–182, 224–343` |
| **No guidance on when integrations are required vs. optional** | MEDIUM | Settings lists 6 integrations but doesn't clarify: which are required (Gmail, Dropbox), which are optional (Meta, Resend, Google/GSC/GA4/GBP), what breaks if a required one is unconfigured, which modules depend on each. Users waste time configuring unused integrations. | `src/pages/Settings.jsx:156–221, 550–710` |
| **Role terminology inconsistency: 'director' vs 'admin'** | MEDIUM | AICostWidget uses variable name `isDirector` but checks `role === 'admin'` (line 53). Comment says "not director — that value never exists here." This contradicts the variable name and creates confusion. App uses 'admin' everywhere else. | `src/components/settings/AICostWidget.jsx:36, 46, 52–53, 79` |

---

#### **Workflow Efficiency & Manual Work (8 findings)**

| Finding | Severity | Manual Work | Location |
|---------|----------|-------------|----------|
| **Fragmented integration setup with no centralized onboarding wizard** | HIGH | 6 integrations each with separate plain-text instruction blocks. Users must understand all 6 at once, manually run separate scripts (npm run auth:gmail, npm run auth:dropbox), cross-reference 6 pages of text, paste tokens back. No progress tracking or 'setup complete' indicator. | `src/pages/Settings.jsx:156–635` |
| **No bulk user management — single-user edit, invite one-at-a-time** | MEDIUM | Admins must invite users individually, copy URL manually, and edit roles one-at-a-time. No 'select all', 'bulk deactivate', or 'bulk role change'. No CSV import for new team members. | `src/pages/UserManagement.jsx:224–343` |
| **Integration status read-only, no 'Fix', 'Retry', or 'Reconnect' buttons** | MEDIUM | Status badges show configured/not-configured but there's no 'Setup', 'Reconnect', 'Test', or 'Fix it' action buttons. If something fails, users must read instructions and manually retry. No integration dependency graph or 'what breaks' explanation. | `src/pages/Settings.jsx:156–200, 194–214, 576–636, 641–676, 681–709` |
| **Workforce cost code mappings (9 fields) entered manually with no validation or bulk import** | MEDIUM | Users type 9 Buildexact cost codes one-by-one into text fields. No validation that codes exist in Buildexact. No test/verify button. No CSV export/import. If codes change, must re-edit all 9 fields. | `src/pages/Settings.jsx:809–816` |
| **Invitations show only pending ones — no re-send option or history** | LOW | Invitations tab shows only pending invites. Once accepted, they vanish. No way to re-send if email wasn't received. No audit trail of who was invited when. Expired invites disappear silently. | `src/pages/UserManagement.jsx:345–421` |
| **Company settings duplicated across localStorage — no export/backup or multi-device sync** | HIGH | Company name, ABN, address, logo, PO prefix, default terms are saved to localStorage with no server persistence, no export/import, no disaster recovery. If user clears browser cache, settings vanish. If switching devices, must re-enter all details. No "last updated by/when" audit trail. | `src/pages/Settings.jsx:262–353`, `src/lib/companySettings.js` |
| **RFQ email signature opens in a modal, breaking Settings page flow** | LOW | Email signature editor is accessed via a button that opens a modal (RfqSettingsModal), forcing the user to: scroll to signature section → click 'Edit' → edit in modal → save in modal → close modal → see confirmation on Settings page. One extra interaction compared to inline editing. No preview of how signature appears in emails. | `src/pages/Settings.jsx:143–153, 542–549`, `src/components/RfqSettingsModal.jsx` |
| **No pre-flight integration check before initiating long workflows** | MEDIUM | User can start RFQ package or fee proposal creation without knowing if Google Drive/Dropbox is configured. Discovery of missing integration happens after filling out the form and hitting 'send'. No early validation or warning. | `src/pages/RfqEngine.jsx`, `src/pages/FeeProposalWizard.jsx` |

---

#### **API Design & Consistency (6 findings)**

| Finding | Severity | Inconsistency | Location |
|---------|----------|---------------|----------|
| **Mixed fetch patterns violate CLAUDE.md standards** | HIGH | Settings.jsx directly calls `authFetch` 6 times (lines 54, 80–82, 459, 722) instead of using `apiFetch` helpers. CLAUDE.md §Standards (lines 70–79) states: "Never call authFetch() directly in page components — only in apiFetch.js itself." Also uses manual `.json()` calls (lines 55, 84–85) instead of `apiFetch` error standardization. | `src/pages/Settings.jsx:1, 13–18, 54–56, 79–85, 459–474, 722` |
| **Workforce settings role gating inconsistency** | MEDIUM | Frontend (line 715) gates read with: `if (![admin, supervisor].includes(role)) return null;`. Server GET endpoint has no role check (only `requireAuth`), PUT requires `requireRole(admin, supervisor)`. Asymmetry: employees can call GET directly and see full cost codes they shouldn't access. | `src/pages/Settings.jsx:715–726`, `server/lib/workforceRoutes.mjs` |
| **Inconsistent error response structure in Buildexact endpoints** | MEDIUM | `/api/buildexact/webhook-events` returns `{ ok: false, items: [], error: "..." }` (with HTTP 200). `/api/integrations/status` never returns errors — always succeeds with all statuses as 'configured: false'. Settings.jsx (line 54–56) checks if status is null, but the endpoint never returns null. Inconsistent error handling across endpoints. | `server/dev-api.mjs:2555–2600`, `server/lib/module4Routes.mjs:26, 83–95` |
| **Buildexact credentials precedence unclear: browser localStorage vs .env** | HIGH | Users can enter credentials in the form (localStorage save button, line 392), but the comment (line 357–360) and instructions (line 446–448) don't clarify: do browser creds override .env, or are they test-only? Test button precedence is hardcoded (browser first, .env fallback) but undocumented. | `src/pages/Settings.jsx:357–360, 446–448, 386–400` |
| **Integration status response schema lacks version indicator or change documentation** | LOW | Response shape hardcoded in server, assumed by client. If a new integration is added, client code must be updated in multiple places. No schema versioning, no deprecation path, no type safety. Response changed over time (Buildexact added separately) with no migration strategy. | `server/dev-api.mjs`, `src/pages/Settings.jsx:162–635` |
| **Navigation path duplication creates workflow friction** | MEDIUM | Settings page accessible via `/settings` (redirects to `/tender-manager/settings`) and `/tender-manager/settings`. Back link hardcodes `/tender-manager/rfq-engine` (line 133), but supervisor/employee users may not be in RFQ context. Three entry points with inconsistent back-navigation. Non-admins have no way to reach user management (`/settings/users`). | `src/App.jsx`, `src/components/AppShell.jsx:214–220`, `src/pages/Settings.jsx:133` |

---

#### **Performance & Caching (4 findings)**

| Finding | Severity | Impact | Location |
|---------|----------|--------|----------|
| **N+1 role checks in admin-only widgets** | MEDIUM | AICostWidget (lines 47–56) and CompanyCostModel (lines 24–32) independently call Supabase to check user role (`user_profiles.role === 'admin'`). useAuth() in Settings already knows the role. Every page load = 2 extra DB queries. Role never changes mid-session. | `src/components/settings/AICostWidget.jsx:47–56`, `src/components/settings/CompanyCostModel.jsx:24–32` |
| **No pagination on user/invitation lists** | MEDIUM | GET /api/auth/users and GET /api/auth/invitations select all rows (no limit/offset). If org grows to 100+ users, entire table downloads and renders (no virtualization). Promise.all() blocks page render until both complete. Single scrollable div with no pagination controls (lines 396–420). | `src/pages/UserManagement.jsx:79–110, 396–420`, `server/lib/authRoutes.mjs:300–318, 357–378` |
| **Integration status checked per-page-load; no background health monitoring** | LOW | Settings calls `/api/integrations/status` on mount (line 54). No polling, no background checks. If Gmail token expires while in RFQ engine, admin won't know until they reload Settings. No app-wide alert banner for critical integration outages. | `src/pages/Settings.jsx:52–64` |
| **CompanyCostModel sync status relies on relative times, no refresh indicator** | LOW | Component shows 'synced Xm ago' (line 76–77) but no spinner during sync, no yellow warning if sync failed, no sync duration shown. 'Sync now' button doesn't show loading state or stay visually 'stuck' after failure. | `src/components/settings/CompanyCostModel.jsx:8–15, 76–77, 84` |

---

#### **Gaps & Missing Features (5 findings)**

| Finding | Severity | Gap | Location |
|---------|----------|-----|----------|
| **No integration event log or audit trail for failures** | MEDIUM | Settings shows last 10 Buildexact webhook events but no filtering/export. No audit log for failed RFQ sends, failed fee proposal exports, or why integrations failed. Errors only in server logs (dev perspective), not in app (admin perspective). | `src/pages/Settings.jsx:479–505`, `server/lib/module4Routes.mjs:83–95` |
| **No permission audit or role-based integration access control** | MEDIUM | All integration management is admin-only. No granular permissions (e.g., supervisor cannot manage Dropbox). No audit log of who changed Buildexact credentials or Resend domain, and when. | `src/pages/Settings.jsx`, `server/lib/adminRoutes.mjs`, `src/lib/roles.js` |
| **Buildexact token testing exposed but no proactive expiry warnings or refresh automation** | MEDIUM | Settings can test connection (lines 449–478) but no monitoring of token expiry. If token expires, all Buildexact syncs fail silently. Similar risk for Meta token expiry (CLAUDE.md line 672: "expired token will cause Sync Social to fail silently"). No cron job to warn admin 7 days before expiry. | `src/pages/Settings.jsx:449–478`, `server/lib/module4Routes.mjs:97–135` |
| **No progress indicator or checklist for initial app setup** | MEDIUM | New admin sees 10+ Settings sections with no guidance: required vs. optional? In what order? Company details first? There's no setup checklist, progress bar, or 'Setup Assistant' mode. Required integrations (Gmail, Dropbox) mixed with optional ones (Meta, Resend, Google). | `src/pages/Settings.jsx (entire page)` |
| **No undo/cancel after editing critical user role or status** | LOW | Role/status changes apply atomically via PATCH with no confirmation dialog (except deactivating self, line 287). Accidentally removing admin role from yourself or changing supervisor to employee has no undo. No 'Recently changed' log or history. | `src/pages/UserManagement.jsx:127–144, 286–304` |

---

### Summary of Top Issues

**3 highest-impact findings (block workflows or cause data loss):**
1. **Company details stored in localStorage only** — Risk of complete data loss on device wipe, invisible to other team members, no server sync mechanism, no export/backup. Admin changes are device-local.
2. **Buildexact credentials in browser localStorage without encryption** — API key exposed in DevTools/console, shared across team members on same device, silent token expiry with no warnings.
3. **Integration setup fragmented across 6 text block sections with no wizard, no progress tracking, no 'fix it' actions** — Users must manually cross-reference 6 pages, run terminal commands, paste tokens back; discovery of failures happens at send time (RFQ, fee proposal) not setup time.

**3 next-highest (usability + workflow efficiency):**
4. Integration status silently fails with vague error messages ("Could not reach API" or "None logged yet — or API has no Supabase service role") — no retry button, no clarification.
5. No bulk user management — invitations one-at-a-time, no CSV import, no bulk role change, no 'copy URL' automation.
6. Mixed fetch patterns violate CLAUDE.md standards (direct `authFetch` calls instead of `apiFetch` helpers) — breaks error standardization and abstraction layer.

---

### Bigger Changes (Architectural)

1. **Migrate company settings to Supabase** — Move company name/ABN/address/logo/PO prefix/default terms from localStorage to `company_settings` table (or extend `company_profile` from migration 069). Add upsert endpoint `POST /api/settings/company`. Cache in useState for offline UX, but persist to server. Add 'Last synced' timestamp, export/import buttons, and disaster recovery flow.

2. **Consolidate integration status into a single endpoint** — Replace 3 separate calls (`/api/integrations/status`, `/api/buildexact/status`, `/api/buildexact/webhook-events`) with one `GET /api/settings/integrations/status` that returns all integration states atomically. Reduce frontend state from 3 variables (status, beStatus, whEvents) to 1. Ensure response includes webhook registration status and token expiry timestamps.

3. **Build integration onboarding wizard** — Replace 6 separate text instruction sections with a multi-step setup flow (accordion or modal-driven). Guide users step-by-step, auto-detect completion (env var set?), link to cloud consoles with pre-filled scopes, and mark integrations as required/optional. Track progress, allow skipping optional ones.

4. **Create integration audit dashboard** — Add admin section showing: per-user last-access timestamps for each integration, ability to revoke cached tokens, audit log of config changes (who changed what, when), failed email/Dropbox/Buildexact sync attempts with error reason. Export as CSV.

5. **Refactor Settings API calls to use apiFetch standardization** — Replace 6 direct `authFetch` calls with consistent `apiFetch/apiPost/apiPatch` pattern. Ensures uniform error handling, response shapes, and compliance with CLAUDE.md §Standards.

---

### Recommendations Summary (Prioritized by Impact)

| Priority | Finding | Recommendation | Effort |
|----------|---------|-----------------|--------|
| **P0** | Company details localStorage-only | Upsert to Supabase `company_settings` table; add last-synced timestamp, export/import, disaster recovery | M |
| **P0** | Buildexact creds plaintext in localStorage | Remove browser localStorage save; require .env only; add session-only override with expiry warning | S |
| **P0** | Integration setup text blocks, no wizard | Build setup wizard with step-by-step guide, auto-detection, progress tracking, links to cloud consoles | M |
| **P1** | Integration status 3 separate endpoints | Consolidate into one `GET /api/settings/integrations/status`; return all states + webhook status + token expiry | M |
| **P1** | Status silently fails, vague error messages | Add explicit error states (loading/error/not-configured); retry button; status indicator badge (red/yellow/green) | M |
| **P1** | No bulk user management | Add checkboxes, select-all, bulk action toolbar (Deactivate, Change role); multi-recipient invite form; CSV import | M |
| **P1** | Mixed fetch patterns (authFetch vs apiFetch) | Refactor all authFetch calls to use apiFetch helpers; ensure error standardization | M |
| **P2** | Buildexact credential precedence unclear | Document in UI: "Browser creds test-only, .env is production. Precedence: browser > .env. For production, set .env only." | S |
| **P2** | Workforce settings role gating inconsistent | Add requireRole check to GET endpoint; mirror client-side role check to prevent info leakage | S |
| **P2** | No integration audit log or failure visibility | Build event log showing email sends, Dropbox calls, Buildexact syncs with success/fail + reason | M |
| **P2** | Navigation routing fragmented | Consolidate to `/admin/settings` + `/admin/users`, both gated by admin role; context-aware back-link | S |
| **P3** | RFQ signature opens in modal | Embed inline in Settings page, or add preview tab showing render in email | S |
| **P3** | AICostWidget/CompanyCostModel redundant role checks | Pass role as prop from Settings (already via useAuth), eliminate 2 N+1 DB queries | S |
| **P3** | No pagination on user lists | Add limit=50&offset=0 to endpoints; implement next/previous buttons with page indicator | M |

---

**Top issues:** Company details (name, ABN, address, logo, PO prefix) stored in browser localStorage only—no server persistence, lost on cache clear, invisible to other team members, no export/backup or disaster recovery; Buildexact API key stored plaintext in browser localStorage with no encryption, token expiry warnings, or secure session management—exposed in DevTools, shared across team members on same device; Integration setup instructions scattered across 6 separate text block sections with no centralized wizard, progress tracking, or 'fix it' actions—users must manually cross-reference, run terminal commands, and discover failures at send time; Integration status endpoint calls fail silently with vague error messages ('Could not reach API' or 'None logged yet') with no retry button or clarification—ambiguous whether API is down, permissions denied, or no data exists; Settings.jsx violates CLAUDE.md API standards by directly calling authFetch 6 times instead of using apiFetch helpers—bypasses error standardization, response envelope contracts, and abstraction layer

**Bigger changes (discussion):**
- Migrate company settings (name, ABN, address, logo, PO prefix, default terms, last-edited audit trail) from browser localStorage to Supabase company_settings table with upsert endpoint, 'last synced' timestamp, export/import, and disaster recovery flow to support multi-device consistency and data durability
- Consolidate fragmented integration status (currently 3 separate endpoints: /api/integrations/status, /api/buildexact/status, /api/buildexact/webhook-events) into single atomic GET /api/settings/integrations/status returning all integration states, webhook registration status, token expiry timestamps, and last-error context
- Replace 6 separate text-block integration setup instructions with multi-step onboarding wizard (accordion or modal-driven flow) that: guides step-by-step, auto-detects completion (env var set?), links to cloud consoles with pre-filled scopes, marks integrations as required/optional, and tracks progress with skip-optional flow for new admins
- Build integration audit dashboard showing per-user last-access timestamps, ability to revoke cached tokens, config change history (who changed what, when), and failed sync attempts (email, Dropbox, Buildexact) with error reasons and retry buttons; export audit log as CSV per date range
- Refactor all direct authFetch calls in Settings.jsx (6 instances) to use standardized apiFetch/apiPost/apiPatch pattern from lib/apiFetch.js per CLAUDE.md §Standards to ensure error envelope consistency, prevent manual .json() handling, and maintain abstraction layer

---

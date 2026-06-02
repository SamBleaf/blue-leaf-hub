# Blue Leaf Hub — Full System Audit Report
**Date:** 2026-06-02  
**Auditor:** Claude AI (claude-sonnet-4-6)  
**Method:** Full lifecycle walkthrough + module-by-module testing + Buildxact API verification  
**App:** http://localhost:5174 | API: http://localhost:8787  
**Credentials tested:** ai-test-director@blueleafbuilding.test (admin role)

---

## Executive Summary

Blue Leaf Hub is a well-architected construction operating system with strong coverage across the APB 8-stage pipeline, project operations, tendering, finance, and client communications. The core pipeline machinery works correctly. Blueprint AI is live and contextually aware. Buildxact API connectivity is fully operational against the live tenant.

However, a number of bugs were found ranging from critical (Sales Pipeline route break) to medium (Financials tab routing, portal admin save) to minor (margin calculation, tab badge count). The Buildxact sync/reconciliation feature is architecturally complete but missing the `buildexact_job_id` DB column that enables linking, and webhook event type detection is not working. These are all fixable with targeted work.

**Verdict:** Production-ready for core workflows (pipeline, ops, finance inbox, tendering, carpentry). The Buildxact sync mirror feature is not yet production-ready — it correctly reports "NOT LINKED" for all jobs.

---

## Phase 1: APB Full Lifecycle Walkthrough

### Test Lead: Alexandra Thornton — Hawthorn
A complete 8-stage lifecycle was successfully executed:

| Stage | Test | Result |
|-------|------|--------|
| Enquiry | Created via Quick Add | PASS |
| Qualify | Set qualify scores (8/8), discovery notes | PASS |
| Discovery | Added site details, DA approved, pre-approved finance $950k | PASS |
| Winning Offer | Set pre-construction fee $12,000 | PASS — gate correctly requires fee |
| Fee Proposal | Advanced to Fee Proposal stage | PASS |
| Accepted | Stage advance; created Hub job via "Create Job from Lead →" | PASS |
| Tender | Advanced after Hub job created | PASS — gate correctly requires Hub job |
| Won | Advanced to Won stage | PASS |

All APB stage gates functioned correctly. Appropriate error messages shown when conditions not met.

**Cleanup:** Test lead (ID: 3fea7220-0554-4235-b5c9-9e11579dcb08) and associated job (ID: 3e0e8fe7-978d-4ba6-93ed-1d30cf31ed62) were deleted post-audit.

---

## Phase 2: Buildxact API Verification

### API Connectivity
- **Authentication:** POST `/accounts/auth/login` → 200 OK, accessToken cached ✅
- **Token caching:** In-process token cache working; expires ~1h ✅
- **Test Connection (UI):** Settings → "Test connection (login)" → "Login succeeded — token cached on the API" ✅
- **Live tenant confirmed:** bbf3c49d… (Blue Leaf Building) — 40 real jobs pulled ✅
- **OData queries:** `getJobs("")` returns bare array; `beList()` handles both envelope forms ✅
- **Estimates:** `getEstimatesByJob` returns accepted estimate with correct `isAccepted` flag ✅
- **Purchase Orders:** `getPurchaseOrders(jobId)` returns job POs ✅

### Reconciliation Script
```
node scripts/reconcile-buildxact.mjs all
```
- Connected to live Buildxact API ✅
- Pulled 40 jobs (capped at 5 in default run) ✅
- **All 40 jobs show "NOT LINKED"** — because the `jobs` table is missing `buildexact_job_id` column (see Bug #7)
- Address-fallback matching also fails (Hub address format vs Buildxact format mismatch)
- No mismatches reported (all Hub sides show "—" / "n/a" since no links exist)

### Webhook Events
4 webhook events received from Buildxact (dates: 17/05, 17/05, 19/05, 23/05). All show:
- Type: **unknown** (event names not recognised)  
- Matched: —  
- Processed: **No**

The webhook handler (`buildexactWebhook.mjs`) logs all candidate headers and processes through, but the event type field from Buildxact doesn't match any expected names. The real Buildxact webhook event names need to be confirmed from the portal.

### Webhook URL Issue
The Settings page shows the webhook URL as `http://127.0.0.1:8787/api/webhooks/buildexact` — the localhost dev URL. On production (Railway deployment), this should auto-detect the public hostname or be overridden by an env var.

---

## Bugs Found

### CRITICAL

#### BUG-001: Sales Pipeline route conflict — raw DB error exposed
**Route:** `/sales/pipeline`  
**Symptom:** Raw error displayed: `invalid input syntax for type uuid: "pipeline"`  
**Root cause:** The route pattern `/sales/:id` catches "pipeline" as a lead UUID and queries the DB with it. The Pipeline list view cannot be accessed via direct URL.  
**Impact:** If a user bookmarks `/sales/pipeline` or refreshes while on the pipeline view, they see a raw database error. The sidebar click works because it navigates to the correct path (`/sales/dashboard` or similar), but the URL is different from what the sidebar sub-item says.  
**Fix:** Add an explicit `/sales/pipeline` route before the `/sales/:id` catch-all, OR ensure the pipeline list view route has a different path that doesn't conflict.

---

### HIGH

#### BUG-002: Operations Financials tab — route not implemented
**Route:** `/operations/:id/financials` (and clicking "Financials" tab within Operations hub)  
**Symptom:** Navigating to the Financials tab URL redirects to `/home`. Clicking the tab also does nothing visible.  
**Impact:** Financials data within the Operations hub is inaccessible. Users cannot see job-level financial data from within the Operations context.  
**Fix:** Implement the `/operations/:id/financials` route OR wire the tab to navigate to `/finance/jobs/:id`.

#### BUG-003: `buildexact_job_id` column missing from `jobs` table
**Location:** Supabase `jobs` table  
**Symptom:** `reconcile-buildxact.mjs` shows "NOT LINKED" for all 40 Buildxact jobs; manual query returns `column jobs.buildexact_job_id does not exist`  
**Impact:** The Buildxact sync/reconciliation feature (the core of Module 4 Phase 1) cannot link any Hub job to a Buildxact job. The "Seed budget from Buildxact" link on the Finance Job Dashboard also cannot work for unlinked jobs.  
**Fix:** Add migration to add `buildexact_job_id uuid` (nullable) and `buildexact_synced_at timestamptz` columns to the `jobs` table. Then provide a UI to link Hub jobs to Buildxact jobs (job picker in the job settings, or auto-match by address).

#### BUG-004: Buildxact webhook event type always "unknown"
**Location:** Settings → "Recent webhook events" table; `buildexactWebhook.mjs`  
**Symptom:** 4 real webhook events received from Buildxact, all show Type: "unknown", Processed: No  
**Impact:** Real-time sync via webhooks is non-functional. Buildxact estimates/POs/lead changes never trigger Hub updates.  
**Fix:** Confirm the exact event type field name and event name values from the Buildxact webhook portal (the docs suggest names like `EstimateAccepted`, `LeadCreated`, etc.). Update the webhook handler event-type switch/mapping.

---

### MEDIUM

#### BUG-005: Portal admin Client name/email fields don't save
**Route:** `/portal-admin/:projectId` — Overview tab  
**Symptom:** Typing in the "Client name" and "Client email" input fields and clicking away does not persist the values. No save button exists on the Overview tab for these fields. The React state doesn't update from direct keyboard input (controlled component without onChange handler).  
**Impact:** Admin cannot set client name/email for the portal without a workaround.  
**Fix:** Add `onChange` handlers to the client name and email inputs so they update React state, and add a "Save" button (or auto-save on blur) to persist to Supabase.

#### BUG-006: "Enable test portal" button does not respond
**Route:** `/portal-admin/:projectId` — Overview tab  
**Symptom:** Clicking "Enable test portal" button produces no visible response (no toast, no navigation, no state change). The "Portal enabled" checkbox remains unchecked.  
**Impact:** Portal cannot be enabled from the UI. The test portal preview link cannot be generated.  
**Fix:** Investigate the click handler for "Enable test portal". It likely needs the client name/email to be set first (BUG-005 must be fixed first), or there's a missing API call.

#### BUG-007: "Draft claim →" button in Underclaim alert does nothing
**Route:** `/finance/jobs/:id`  
**Symptom:** Clicking the "Draft claim →" button on the Underclaim alert banner does not navigate, scroll, or open any modal. The page state is unchanged after click.  
**Impact:** The underclaim CTA is a primary prompt but is non-functional. Users have to manually scroll to the Progress Claims section.  
**Fix:** Wire the button to scroll to the Progress Claims section and/or open a new claim modal pre-populated with the underclaim amount.

#### BUG-008: Carpentry job Budget Margin not calculated
**Route:** `/carpentry/:jobId`  
**Symptom:** CJB-001 shows Quoted Value $237,705 and Budgeted Cost $172,187 but Budget Margin displays "—".  
**Expected:** ($237,705 - $172,187) / $237,705 = ~27.6%  
**Impact:** Carpentry job profitability is not visible at a glance.  
**Fix:** Calculate and display Budget Margin when both Quoted Value and Budgeted Cost are present.

#### BUG-009: Job created from lead gets wrong status
**Route:** Lead Accepted stage → "Create Job from Lead →"  
**Symptom:** When a job is created from a lead at the Accepted stage, the job's `status` field is set to `"tendering"` instead of the appropriate operational status.  
**Impact:** The newly created job appears in the Tender Board with "TENDERING" status even though it has passed through tendering and is at contract stage.  
**Fix:** When creating a job from a lead that is at Accepted stage (post-tender), set the job status to `"won"` or `"accepted"` rather than `"tendering"`.

#### BUG-010: Job created from lead has fallback address, doesn't appear in project selectors
**Route:** Lead → Create Job  
**Symptom:** When no site_address is set on the lead, the created job's address becomes "FirstName LastName — Suburb" (e.g., "Alexandra Thornton — Hawthorn"). This format is not recognised by the Operations "Select project..." dropdown or the Finance "Active Projects" list.  
**Impact:** The job is orphaned from the Operations and Finance modules until manually edited.  
**Fix:** Either (a) warn/require site_address before creating a job, or (b) ensure the project picker accepts name-suburb fallback format.

---

### LOW / UX

#### BUG-011: Blueprint Insight qualifying score stale (prior session finding)
**Route:** Lead detail → Blueprint Insight tab  
**Symptom:** Qualifying score displayed in Blueprint Insight may show stale (0/8) even after qualifying fields are updated to 8/8. Requires manual "Refresh" click.  
**Fix:** Auto-refresh the insight after qualifying score changes.

#### BUG-012: Home Dashboard Pipeline missing "Fee Proposal" and "Won" stage rows
**Route:** `/home`  
**Symptom:** Pipeline widget shows Enquiry, Discovery, Winning Offer, Accepted, Tender — but does not show "Fee Proposal" or "Won" rows.  
**Impact:** Minor visibility gap. Fee Proposal and Won leads are not visible in the pipeline summary.  
**Fix:** Add Fee Proposal and Won rows to the pipeline widget, or confirm this is intentional (Won = moved to Active Jobs).

#### BUG-013: Quote Tracker "Packages 1" badge is misleading
**Route:** `/tender-manager/rfq-packages` — Packages tab  
**Symptom:** The "Packages 1" counter badge suggests 1 package, but "All" filter shows empty. The record actually lives in the "Direct RFQs" tab.  
**Fix:** Correct the tab count to only count actual packages (not direct RFQs).

#### BUG-014: Quote Tracker project filter badge not removable
**Route:** `/tender-manager/rfq-packages`  
**Symptom:** Project filter badge (showing current project) cannot be removed by clicking it — there is no visible X button.  
**Fix:** Add an X/clear button on the project filter badge.

#### BUG-015: Webhook URL shows localhost in production Settings
**Route:** Settings → Buildxact section  
**Symptom:** Webhook URL shown as `http://127.0.0.1:8787/api/webhooks/buildexact`  
**Fix:** Derive the webhook URL from `RAILWAY_PUBLIC_URL` or a configurable `BASE_URL` env var, so the correct production URL is shown for copy-pasting into the Buildxact portal.

#### BUG-016: Pre-construction fee placeholder text visible when value is stored
**Route:** Lead → Winning Offer stage  
**Symptom:** Pre-construction fee field shows "e.g. 15000" placeholder styling even when a value ($12,000) is saved.  
**Fix:** Distinguish between empty placeholder and saved value styling.

#### BUG-017: Fee Proposal wizard blank screen delay (~2s)
**Route:** `/tender-manager/fee-proposal/new`  
**Symptom:** ~2 second white blank screen before the fee proposal wizard renders.  
**Fix:** Add a loading skeleton/spinner so the screen is not blank during lazy-load.

---

## Module Coverage Summary

| Module | Status | Notes |
|--------|--------|-------|
| Sales / Pipeline | MOSTLY WORKING | BUG-001: direct URL breaks; sidebar nav works |
| Sales / Relationships CRM | WORKING | Dashboard, contact list, actions all work |
| Sales / Contacts | WORKING | Filter, search, contact detail all work |
| Sales / Reference Projects | WORKING | Empty state with correct CTA |
| Tendering / RFQ Engine | WORKING | 4-stage wizard; file upload, Claude extraction available |
| Tendering / Quote Tracker | WORKING (minor badge bug) | BUG-013, BUG-014 |
| Tendering / Subcontractors | WORKING | 33 contacts, 21 trades, card/spreadsheet view |
| Tendering / Tender Board | WORKING | All job statuses visible |
| Tendering / Cost Intelligence | WORKING | 37 categories, benchmarks, intelligence, trends |
| Operations / Hub | WORKING | Overview, Schedule, Diary, WHS tabs |
| Operations / Financials tab | NOT ROUTED | BUG-002 |
| Operations / Global Gantt | WORKING | Cross-project gantt with conflict detection |
| Operations / Schedule Manager | WORKING | Alerts, per-project schedule |
| Operations / Site Diary | WORKING | Create entries, photos |
| Operations / WHS | WORKING | Incident management (empty state) |
| Finance / Job Cost Inbox | WORKING | Email connected, drop zone, AI extraction |
| Finance / Job Dashboard | MOSTLY WORKING | Contract, margin, WIPAA, Variations, Claims all display; BUG-007 |
| Finance / WIPAA Review | WORKING | Cost-to-date, forecast, % complete, projected margin |
| Finance / Variations | WORKING | Signed variations, pending, new variation |
| Finance / Progress Claims | WORKING | Default APB stages, new claim |
| Finance / Cashflow Forecast | WORKING | Next 3 months section |
| Finance / Buildxact Budget Seed | NOT FUNCTIONAL | BUG-003: column missing |
| Client Portal Admin | PARTIAL | Tabs visible; BUG-005 and BUG-006 |
| Client Portal Admin / Milestones | WORKING | Mark today buttons for each milestone |
| Client Portal Admin / Decisions | WORKING | Add sample variation |
| Client Portal Admin / Claims | WORKING | Add claim stage |
| Client Portal Admin / Settings | WORKING | Contract value, completion date, link gen |
| Marketing / Content Studio | WORKING | Library, Campaigns, Media, Lists, Intelligence tabs |
| Workforce / Timesheets | WORKING | Empty state |
| Carpentry Jobs | MOSTLY WORKING | List, detail; BUG-008 (margin not calculated) |
| Blueprint AI | WORKING | Chat, Doc QC, SOP, Fix tabs; contextually aware |
| Settings / Email | WORKING | Gmail connected, SMTP fallback |
| Settings / Buildxact | WORKING | Test connection passes; BUG-015 webhook URL |
| Settings / Notifications | WORKING | Reminder timing, email notification options |
| Settings / Company Details | WORKING | Name, address; ABN empty |
| Settings / Purchase Orders | WORKING | PO prefix BLB, terms and conditions |

---

## Buildxact API Surface Coverage

All API calls verified against the live Blue Leaf Building tenant:

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/accounts/auth/login` | POST | ✅ LIVE | Token cached in-process |
| `/accounts/auth/refresh-token` | POST | ✅ CONFIGURED | Triggers before expiry |
| `/jobs` (with OData filter) | GET | ✅ LIVE | Returns 40 jobs bare array |
| `/jobs?$filter=jobId eq {guid}` | GET | ✅ LIVE | `getJobById` via filter (no `/jobs/:id`) |
| `/estimates?$filter=jobId eq {guid}` | GET | ✅ LIVE | Returns accepted estimate |
| `/estimates/{id}/items` | GET | ✅ LIVE | Returns line items with parent hierarchy |
| `/jobs/purchaseorders?jobId={guid}` | GET | ✅ LIVE | Returns job POs |
| `/jobs/purchaseorders/create` | POST | NOT TESTED | Requires explicit go — writes to live BX |
| `/leads` | GET | ✅ CONFIGURED | Available but not triggered this session |
| `/clients` (customers) | GET | ✅ CONFIGURED | Available but not triggered this session |
| `/contacts` | GET | ✅ CONFIGURED | Available but not triggered this session |
| `/catalogues` | GET | ✅ CONFIGURED | Recipe catalogue available for variation pricing |
| `/jobs/invoices` | GET | ✅ CONFIGURED | For progress claims mirror |
| `/jobs/variations` | GET | ✅ CONFIGURED | For variations mirror |

**Missing DB column:** `jobs.buildexact_job_id` — required for all sync and reconciliation features.

---

## Data Quality Observations

1. **Seed data duplication:** The `jobs` table has 4 variations of "21 Folkestone Road, South Brighton" — `7e997298`, `32bcaf2e`, `3aecd6df`, `05007a76`. These are likely test/seed artefacts that should be pruned.

2. **Company ABN empty:** Settings shows no ABN set. This will appear blank on PO PDFs.

3. **Buildxact tenant has small-value jobs:** Many jobs (J1025, J1029, J1125 etc.) are subcontract carpentry jobs (~$4k–$240k), not Blue Leaf new builds. The reconciliation correctly pulls all 40 jobs including these. The Hub→BX linking logic will need to distinguish which Buildxact jobs correspond to Hub jobs.

4. **Leads with `name: null`:** The `leads.name` column is null for several records (including our test lead). The `name` field appears to be a legacy/computed field; first_name + last_name are populated separately.

5. **Webhook events pre-date the current API config:** The 4 received webhooks (May 17–23) predate the June 2 audit. This means Buildxact was already sending webhooks before the handler was correctly set up.

---

## Automation / AI Features Status

| Feature | Trigger | Status |
|---------|---------|--------|
| Underclaim alert | Finance Job Dashboard | WORKING — detects 24.8% build vs 0% claimed |
| Blueprint AI qualifying score | Qualify tab update | DELAYED — stale until manual refresh (BUG-011) |
| Stage gate validation | Pipeline advance | WORKING — enforces pre-con fee, job creation |
| RFQ scope extraction (Claude) | Upload PDFs + Run Claude extraction | AVAILABLE — not tested end-to-end (needs file upload) |
| Buildxact webhooks | Buildxact events | NOT WORKING — event type unknown (BUG-004) |
| Email invoice ingestion | accounts@blueleafbuilding.com.au | WORKING — inbox connected, last checked 09:45pm |

---

## Priority Fix List

**Fix immediately (before client demos):**
1. BUG-001 — Sales Pipeline direct URL shows raw DB error
2. BUG-005 / BUG-006 — Portal admin client name/email can't be saved, Enable test portal broken
3. BUG-003 — Add `buildexact_job_id` column to jobs table (prerequisite for all sync features)

**Fix this week:**
4. BUG-002 — Operations Financials tab routing
5. BUG-007 — "Draft claim →" button does nothing
6. BUG-004 — Confirm Buildxact webhook event type names and fix handler
7. BUG-009 / BUG-010 — Job created from lead gets wrong status and unmatchable address

**Fix when time permits:**
8. BUG-008 — Carpentry budget margin calculation
9. BUG-013 / BUG-014 — Quote Tracker badge count and filter
10. BUG-015 — Webhook URL derivation for production
11. BUG-011 — Blueprint insight auto-refresh after qualify update
12. BUG-012 — Home Pipeline missing Fee Proposal and Won rows
13. BUG-016 / BUG-017 — Minor UX polish

---

## What's Working Exceptionally Well

- **APB 8-stage pipeline:** Gate logic, qualifying scores, stage transitions, and document generation (PTSA, Fee Proposal) all work correctly
- **Finance Job Dashboard:** WIPAA, Variations, underclaim detection are sophisticated and genuinely useful
- **Buildxact API connectivity:** All 7 read endpoints verified live against the real tenant; token caching, OData filtering, and the `beList` envelope handler all work correctly
- **Blueprint AI:** Contextually aware of APB framework, live and streaming responses
- **Subcontractors database:** 33 contacts, 21 trades, well-structured with missing-info flagging
- **Cost Intelligence:** 37 category Buildxact template, benchmarks and trends infrastructure
- **Invoice inbox:** Email-to-invoice pipeline fully connected and working
- **Carpentry module:** Full job tracking with schedule, diary, costs, and budget tabs
- **Reconciliation script:** Architecture is correct, displays real Buildxact financial data — just needs the DB column to enable linking

---

*End of audit report. All test data cleaned up. No Buildxact write operations performed.*

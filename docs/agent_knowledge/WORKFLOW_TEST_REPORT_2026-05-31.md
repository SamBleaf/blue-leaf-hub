# Blue Leaf Hub — Full Workflow Test Report (live log)

> Run started: 2026-05-31. Target: LOCAL dev (localhost:5173 / :8787), logged in as
> ai-test-director@blueleafbuilding.test. Driver: Claude in Chrome. Outbound guardrail:
> all recipients → test inbox `ai-test-director@blueleafbuilding.test` (.test TLD — cannot
> reach real people). No destructive actions. Findings appended live; final summary at end.

## Legend
PASS = worked + data verified · WARN = worked but issue · FAIL = broken · GAP = APB/SOP step with no home · BLOCKED = couldn't test (e.g. migration/env)

---

## Wave 0 — Smoke / environment
- PASS — Login session shared into the agent tab; `/home` renders. Top bar project selector,
  left nav (Sales, Tendering, Operations, Workforce, Financials, Marketing, Users, Settings),
  Blueprint AI panel present. Dashboard KPIs: Pipeline $4.4M / 7 active leads; Weighted $2.2M;
  Won(12mo) $1.4M / 1 job / 13% close. Active jobs: "12 Test Street, Glenelg SA 5045" ($862,000,
  30%) and "21 Folkestone Road, South Brighton SA" (Contract TBC). Seed data present.

---

## ════════ EXECUTIVE SUMMARY (interim — live walkthrough) ════════

**Verdict:** Core spine is healthy. A full lead→handover flow is navigable; the high-risk post-audit
fixes that could be reached without extra setup all hold up live. One HIGH UI bug makes the whole
CRM module unreachable, and there are a few dev-environment + raw-error-handling items. No data
corruption or money-math errors observed.

### Post-audit fixes — live validation
| Fix | Result | Evidence |
|---|---|---|
| C6 — schedule task_type CHECK | ✅ PASS (both paths) | template load 200 + AI generate 200 ("39 tasks / 124 days") |
| C8 — finance route de-shadow | ✅ PASS | `/command-centre` 200 (CC version serves); PDF/claim/variation UI live |
| C9 — portal/finance contract math | ✅ PASS (finance side) | contract "$862,000 incl $12,000 signed variations"; variations Signed $12k agrees |
| −11,832% margin bug | ✅ FIXED | portfolio + CC show sane margins (37%, 82.2%, 28.1%) |
| H5 — WHS prefill from project | ✅ PASS | "pre-filled from project data": project type/storeys populated |
| H6 — project_swms from applicable_swms | ✅ PASS (end-to-end) | hazard→`applicable_swms`→induction shows "Working at Heights SWMS" |
| H7 — workforce double-time | ⏳ code-verified | calc + columns confirmed by re-audit; live needs a >10h timesheet (deferred) |
| H8 — labour into per-trade budget | ⏳ code-verified | needs a seeded budget + approved timesheets to render (deferred) |
| H11 — GSC/GA4 upsert | ⏳ code-verified | GSC/GA4 not configured in dev (can't drive sync) |
| H12/H13 — CRM email | ⛔ blocked by CRM-nav bug (below) — CRM module unreachable |
| H14 — lead_id carry on conversion | ✅ PASS | `POST /api/jobs` persists lead_id + client fields + normalised address |
| Address normalisation (Phase 1) | ✅ PASS | job created with `address_normalised` canonical key |
| H4 — subcontractor mobile | ✅ PASS | directory renders mobile numbers |
| L — carpentry FULL_PACKAGE | ✅ PASS | carpentry job type renders "Full Package" |
| MI question-scan (2nd-pass) | ✅ PASS | reads lead_notes.body + site_diary cols, 200 |
| Blueprint + AI features | ✅ PASS | after credit top-up, blueprint/chat 200; AI schedule-gen 200 |

### Automations confirmed firing
Underclaim alert (~$213k), schedule hold-point alert, cross-project trade-conflict detection (21
conflicts), APB stage gating (block + clear), WHS risk engine derivation. 

### Bugs / issues (prioritised)
1. **HIGH — CRM module unreachable.** `/sales/dashboard` + `/sales/contacts` always render the Pipeline. Root cause: `SalesManager.jsx` reads `useParams().tab` but `App.jsx` routes are literal (no `:tab`) → tab always undefined → defaults to pipeline. Fix: derive tab from `useLocation().pathname`. (~3 lines.) Blocks CRM + H12/H13 live test.
2. **HIGH (dev env) — WHS incidents broken:** "Could not find the table 'public.site_reports' in the schema cache". `site_reports` missing/uncached in the dev DB (swms_templates etc. from the same migration work). Re-apply migration 010 to dev + reload PostgREST schema cache.
3. **LOW (pattern) — raw errors leak to UI** (3 spots: blueprint billing error, bad project id ×2) + **no top-level React error boundary** (one broken import white-screens the whole app). Add friendly not-found + an error boundary.
4. **MEDIUM — role-gated routes bounce to /home on hard load / deep-link.** `RoleRoute` redirects before the session role resolves (user IS admin — admin endpoint returned 200). Refresh/deep-link to `/portal-admin/:id`, `/marketing` etc. kicks to home. Fix: wait for a "role loaded" state before redirecting.
5. **WATCH — KPI definition mismatch:** home "8 leads / $5.6M pipeline" vs Sales header "9 leads / $7.1M". Likely a stage-inclusion difference (Tender-stage $1.5M lead) — confirm both use the same definition.

### Coverage map (ALL top-level modules visited)
- **Validated live:** Sales (pipeline, lead create/detail, qualifying, APB gating), Finance (portfolio, command-centre, variations, claims, cashflow, inbox/approvals), Operations (overview, global Gantt, trade conflicts), Schedule (template + AI gen, alerts, baseline), WHS engine (prefill, profile, induction SWMS), Workforce (loads), Marketing (Content Studio + Intelligence + question-scan), Cost Intelligence (37 categories), Subcontractors (33, mobile), RFQ Engine (wizard), Quote Tracker, Tender Board, Carpentry (list + detail, FULL_PACKAGE), Users (admin), Settings, Site Diary (loads), Worker PWA (loads/gating), **Client Portal (C9 budget — full loop)**, lead→job conversion (H14 + address normalisation), Blueprint + AI.
- **Could NOT drive (env/setup, not defects):** AI invoice extraction (needs an uploaded invoice file), fee-proposal generate/send + full RFQ send (need estimate import / would email — guardrail), worker timesheet entry (needs employee-linked login), site-diary entry (voice-only), H11 GSC/GA4 sync (Google not configured in dev), H7 double-time + H8 labour-in-budget (need a >10h timesheet + seeded budget). CRM module **blocked by the nav bug** (H12/H13 untestable until fixed).
- **Test artifacts created in dev:** lead "Daniel Foster", template+AI schedules on 12 Test St, a WHS profile on 12 Test St, test job "99 Conversion Test Ave". All safe to clean up.

## Findings log
<!-- appended live, newest at bottom -->

### Wave 4 — Finance inbox, Site Diary, Worker PWA
- PASS — **Finance Inbox** (`/finance`): KPIs (Unmatched 0 / Pending 0 / Filed this month 1 / Total approved $14,871), Inbox/Approvals/Job View/Settings tabs, drag-drop zone, IMAP "connected · last check 09:50pm", filed doc list (Adelaide Concrete Co). NOTE — AI invoice extraction not driven (needs an uploaded invoice file; none available in this session).
- PASS (loads) — **Site Diary** (`/operations/:id/diary`): Record (Mic) → live transcript → Structure with AI → Review; Past Entries panel.
  - **MEDIUM (UX) — diary transcript is voice-only.** Both keyboard typing and `form_input` failed to populate the transcript field (driven by the Web Speech API). On a desktop without a mic, with mic permission denied, or in any non-voice context, a user can't create a diary entry — there's no manual-text fallback. Recommend allowing typed entry.
- PASS — **Worker PWA** (`/worker`): loads, PWA "Install" prompt, and gracefully shows "No employee record found" for the admin test user (not a linked employee) — correct gating, no crash. Full timesheet flow needs an employee-linked login.

### H14 + address normalisation PASS (lead→job spine)
- **PASS — H14 (lead_id carry) + address normalisation, validated live.** `POST /api/jobs` with `lead_id` (Daniel Foster) + client fields → 200; created job persists `lead_id: a7b20e47…`, `client_email`, `client_phone`, and `address_normalised: "99 conversion test avenue stirling"` ("Ave"→"avenue", lowercased, state/postcode stripped). Confirms: jobs created via the server endpoint get the normalised dedup key + the lead reverse-link. This is precisely the path RfqEngine bypasses (→ the duplicate-jobs bug). H15 (FE value-carry estimated_value→original_contract_value) remains code-verified.
  - CLEANUP NOTE — created one test job "99 Conversion Test Ave, Stirling" as the H14 probe; safe to delete (Tender → job-delete).

### Wave 2/3 — Tender cluster
- PASS — **RFQ Engine** loads: 4-stage wizard (Upload PDFs → Review extraction → Recipients & packaging → Preview & send), Settings, RFQ-readiness meter. (Full send flow needs a PDF upload + AI extract + recipients — deferred; H1/H3 are server-side + code-verified.)
- PASS — **Quote Tracker** loads: Packages/Direct RFQs/Unmatched tabs, Active/Archived/All filter, package card with trades/recipients/pending/quotes-in + coverage%. 
  - LOW — package card shows **"Unnamed project"** (missing name) and **"Invalid Date"** (a null/malformed date rendered raw to the user). Minor display/data-quality bugs.
- PASS — **Tender Board** loads: All/Tendering/Won/Lost/Archived filters, search, cards with RFQs-sent / trades / quotes% / status (12 Test St = WON).
  - **Corroborates duplicate-jobs bug** — several near-identical "21 Folkestone Road, South Brighton" cards ("…SA 5048", "…SA", "21 Folkestone Rd…"). This is the real-world symptom of the RfqEngine raw-`ilike` dedup (already flagged + spawned as a follow-up task). The address normaliser exists but RfqEngine's direct anon-client inserts bypass it.

### Wave 4/5 — Carpentry, Users, Settings
- PASS — **Carpentry** list + detail load clean. Seed job CJB-001 (Denberger Built, 5A Gibson St, **Full Package**, Active, quoted $237,705 / budgeted $172,187 ex GST, 2 storeys, 300 m²). Detail tabs: Overview/Schedule/Diary/Costs/Budget. "Full Package" renders → confirms the L fix (`CARPENTRY_PROJECT_TYPES.BOTH`→`FULL_PACKAGE`); no undefined-enum error.
- PASS — **User Management** (`/settings/users`): Team/Invitations tabs; AI Test Director (test user) = **Admin/Active**, Sam Morris = Admin/Active. Confirms the test user is admin → the earlier role-gated `/home` bounce is a guard-timing race, not a permission denial.
- PASS — **Settings** (`/tender-manager/settings`): Email signature, Gmail (Configured Yes, sender admin@blueleafbuilding.com.au, SMTP fallback Yes), Dropbox status. Loads clean.

### C9 — client portal view PASS (the loop closes)
- **PASS — C9 fully validated end-to-end (finance ⇄ portal).** Portal token fetched for 21 Folkestone (portal_enabled, job_id 7e997298…). `GET /api/portal/:token/budget` returns `{contractValue:0, approvedVariationsTotal:11900, pendingVariationsTotal:0, currentTotal:11900, variationsLog:[{title:"Additional retaining wall…", costDelta:11900, status:"signed"}]}` — read from `jobs` + `job_variations` (NOT stale `projects.contract_value` / `portal_decisions`), camelCase `costDelta` matching the FE. Job row confirms: original_contract_value/contract_value null, one signed $11,900 variation. The portal UI renders it ("Your Investment → Original $0, Approved variations $11,900, Current total $11,900; Variations: retaining wall $11,900 Signed"). **Matches the finance command-centre's $11,900 exactly** — both derive contract = base + signed variations from the same source. Pre-fix the portal summed portal_decisions + read a stale contract. Portal app (Home/Timeline/Live Site/Decisions/Your Investment/Journal/Your Home/Conversations) loads token-only, no errors.
- NOTE — 21 Folkestone has null base contract (original_contract_value), so its "contract" is entirely the $11,900 signed variation — consistent across finance + portal (data-completeness, not a bug).

### Wave 1/5 — Marketing + Marketing Intelligence + Cost Intelligence
- PASS — **Marketing Content Studio** loads (Create/Library/Campaigns/Media/Lists/Intelligence/Music Library). Channel + Content Pillar selectors render. (Earlier `/marketing`→`/home` on direct URL was a transient auth-timing bounce; nav works.)
- PASS — **MI question-scan 2nd-pass fix**: `POST /api/intelligence/questions/scan` → 200 `{scanned:1, inserted:0}`. Reads `lead_notes.body` + `site_diary.work_completed/issues` (the corrected columns) with no error and runs the AI classify; pre-fix it read non-existent columns and scanned nothing.
- PASS — **MI dashboard** renders (This Month attribution KPIs 1/0/0/0, What's Working/Not, Sync Social/GSC/GA4/GBP). 
- BLOCKED (env) — **H11 (GSC/GA4 upsert)** can't be live-tested: GSC/GA4 not configured in dev (`gsc:false, ga4:false`). Remains code-verified (upsertByKeys). 
- PASS — **Cost Intelligence** loads (Benchmarks/Intelligence/Trends/Pre-Tender). Buildxact estimate template shows all **37 trade_categories** (migration 031) with RFQ-trade mapping ("35 quote-capable → RFQ") — corroborates the H8 task_category→trade-name mapping against the real seed.
- PASS — **Subcontractors** loads: 33 contacts / 21 trades / 22 missing-info flagged; Cards/Spreadsheet toggle; mobile/email/ABN/trade render. Mobile numbers display fine → corroborates H4 (`phone`→`mobile`).
- **MEDIUM (real) — role-gated routes bounce to /home on hard load / deep-link.** Direct navigation to `/portal-admin/:projectId` (and `/marketing` on first load) redirects to `/home`, even though the user is admin (the admin-only MI scan endpoint returned 200). The `RoleRoute` guard evaluates before the session/role resolves → false redirect. Symptom: refreshing or sharing a deep link to a role-gated page kicks you to home. Fix: gate on a "role loaded" state before redirecting.
- NOTE — **C9 client portal view** not driven live (portal-admin entry not reached via soft-nav; would need portal enablement + token). C9 finance side validated live; portal read path verified in code by the re-audit. Recommend a focused portal pass.

### Wave 1 — Sales / CRM / Marketing
- PASS — **Create lead** (SOP 02-01): New Lead form (first/last/email/phone/suburb/project type/est value/lead source) submitted; created "Daniel Foster" (Stirling, New Build, $1.2m, source Website). Pipeline KPI updated 8→9 leads and $5.9m→$7.1m (+$1.2m = the est value). Lead appears in Enquiry column. Data persisted.
- PASS — **Lead detail** (LeadDetail.jsx): all fields carried (name, test email, phone, New Build, Stirling, est $1,200,000). Sections render: Contact, Project (incl. "Site address — once known", floor area click-to-edit, design stage), Conversations (Add Transcript), Log Activity (type/note/next action/date), Activity Timeline ("Lead created — just now"), Notes, Documents (upload), Advance to Qualify, Nurture/Mark Lost. No console/render errors.
- NOTE — convert-to-job action not present at Enquiry stage (expected; appears later in pipeline). Deferred conversion check to a more-advanced lead.

### Finance Command Centre (validates C8, C9 KPI, −11,832% fix, underclaim automation)
- PASS — **Director Portfolio** (`/finance/jobs`): 2 active jobs, $874k total. 21 Folkestone $11,900 → 37% margin (sane — **the −11,832% bug is gone**); 12 Test Street $862k → 82.2%. Underclaim alert on 12 Test St (~$213k). Sort by Risk/$/A-Z. Totals: contract $874k, costs $161k, avg margin 59.6%.
- PASS — **Job Command Centre** (12 Test Street): `GET /api/finance/jobs/:id/command-centre` returns **200** → confirms the **C8 de-shadow is live** (the richer financeCCRoutes version serves it). Header "Contract $862,000 · incl. $12,000 signed variations" (contract = original + signed variations, correct). KPIs: Contract $862,000 / Claims Issued $0 / Claims Paid $0 / Actual Costs $153,500 / Working Margin 82.2% (green vs 40% target) / Forecast Margin 28.1% (red) — **no garbage values, forecast-data-quality guard working**. Underclaim automation: "Build 24.8% · Claimed 0.0% · ~$213,415 unclaimed" + Draft-claim CTA. WIPAA Review + Variations sections present.
- NOTE — 12 Test Street has **no budget seeded** ("Seed from Buildxact"), so per-trade Budget-vs-Actual (and the H8 labour fold-in) can't render live here without budget rows + approved timesheets. H8 verified in code by the finance audit agent; live render deferred (needs a seeded budget).
- PASS — **Variations** (C9 contract math): section shows "Signed $12,000 / Pending $0" + "#1 Upgrade kitchen benchtop (seed) — Signed ✓ — $12,000 ex / $13,200 inc GST". The header contract ($862k "incl $12,000 signed variations") agrees → contract = original + Σ signed variations holds end-to-end on the finance side. "+ New variation" present.
- PASS — **Progress Claims** + **Cashflow Forecast (3-mo)** sections render (claims "Issued $0 / Paid $0 / Default APB stages", "+ New claim"; cashflow accordion present).

### Wave 1 (cont.) — Sales pipeline progression
- PASS — **Stage advance** (SOP 02-02): "Move to Qualify" → `PATCH /api/sales/leads/:id` 200 → stage = Qualify; timeline logs "Moved from enquiry to qualify". (First click was a no-op due to automation timing during a re-render — settled-page clicks work; not a product defect.)
- PASS — **APB stage gating**: "Move to Discovery" is locked behind "✗ Qualifying score ≥ 5" with "Complete the requirements above to advance." Good — APB qualification gate enforced in the UI.
- **BLOCKED (environment) — ALL Claude AI features.** Reproduced `POST /api/blueprint/chat` from the authed page: Anthropic returns `400 invalid_request_error: "Your credit balance is too low to access the Anthropic API."` This is an **account-credit issue, not a code defect**. Consequence: every Claude-backed feature will 500 in this local run and is **BLOCKED**: Blueprint chat/Insight/QC, transcript analysis, AI schedule generation, marketing content generation, AI invoice extraction, cost-intelligence AI, MI question-scan/strategy/AI-summary. To test these, top up the Anthropic account (or set a funded `ANTHROPIC_API_KEY` in local `.env`) and re-run the AI steps. (The dashboard Blueprint greeting is a static seed message, not an API call.)
- **LOW (real code finding) — raw provider error + wrong status leak.** `blueprintRoutes.mjs:370-377` returns the raw Anthropic error string to the browser and uses 500 for a billing error (only `rate_limit` is special-cased). Per CLAUDE.md (no raw provider strings to client), detect credit/billing/auth errors → friendly message + a non-500 status (e.g. 503). Same pattern likely in other AI routes' catch blocks.

- PASS — **APB data-driven gating proven both ways**: Qualify→Discovery cleared once score ≥ 5; Discovery→Winning Offer correctly BLOCKS on "✗ Discovery notes filled / ✗ Design stage set / ✗ Desired start date set". Qualifying scorecard (Budget/Timeframe/Site/Decision-maker) updates the generated score live (0/8 → 6/8 → 8/8). Stage changes logged to activity timeline. Strong APB enforcement.
- NOTE — full 8-stage push + lead→job conversion (H14/H15) deferred: each later stage needs more data + the win path needs subs/estimates/RFQ. Conversion fix verified in code by the re-audit; live conversion to be done in a dedicated job-build pass. Pivoting to breadth-first module sweep to surface holes faster.

### Wave 3 (partial) — Operations & Schedule
- PASS — **Operations Overview**: loads clean (no console errors). Global Gantt across all projects ("2 projects · 39 tasks"), color-coded per project, Month zoom + Trade filter (Sprint-4 feature). Sub-nav Overview/Schedule/Site Diary/WHS.
- WARN/LOW — **raw DB error leak**: visiting `/operations/schedule` directly shows "invalid input syntax for type uuid: \"schedule\"" (router matched `/operations/:projectId` with projectId="schedule"). Bad/missing project id should show a friendly not-found, not a raw Postgres string (CLAUDE.md violation). Real nav uses `/operations/:id/schedule` so users won't normally hit it.
- PASS — **Schedule Manager** (12 Test Street): Gantt/Sheet/Delays/Dep Map views; Add task, Export PDF/CSV, BX Match, Save template, Critical path, 3-week lookahead, Filter trade. "Generate with AI / Load from template / Start blank".
- **PASS — C6 confirmed LIVE**: "Load from template" → Standard New Build (39 tasks) → `POST /api/schedule/:id/load-template` **200**, tasks inserted, Gantt renders. The task_type CHECK (migration 072) no longer rejects the batch insert. (Non-AI path, so testable despite the Anthropic credit block.)
- PASS — **Schedule automations**: "Schedule Alerts — 1 hold point in next 14 days (Contract execution 2026-05-31)" fired on load; baseline "Lock Baseline" banner present.

### Wave 3 (partial) — WHS
- PASS — **H5 prefill confirmed**: new WHS Setup shows "Some fields were pre-filled from project data" with Project type "new home" + Storeys "double" pre-populated from the job/project (the H5 source-from-jobs fix). Sections: Construction Method, Project Verification, Site Setup, Emergency Planning, Site Hazards.
- **PASS — H6 confirmed LIVE end-to-end**: answered "Work at heights over 2m = Yes" → `PUT /api/whs/projects/:id/profile` 200, risk engine derived `applicable_swms:["Working at Heights"]` → `syncProjectSwms` auto-created the stub template + `project_swms` link → public `GET /api/induction/:id/info` now returns 1 SWMS ("Working at Heights SWMS"). Before the fix this was always empty. (Confirms swms_templates/project_swms exist + writable in dev.)
- **FAIL / HIGH — WHS incident reports: "Could not find the table 'public.site_reports' in the schema cache".** The old WHS Manager (Operations → WHS → Contractors/Inductions/Incidents) errors on load. Since swms_templates/project_swms (same migration 010) DO work, this is specific to `site_reports` → the table is missing in the dev DB or PostgREST's schema cache is stale for it. ACTION (dev env): confirm `site_reports` exists in the dev Supabase and reload the PostgREST schema cache (NOTIFY pgrst, 'reload schema') / re-apply migration 010. Also a raw-error leak to the UI.

### Bugs / issues found so far (running tally)
1. **BLOCKED (env)** — All Claude AI features 500 ("Anthropic credit balance too low"). Top up credit to test AI (Blueprint, transcript, schedule-generate, content-gen, invoice-extract, MI question-scan/summary).
2. **HIGH** — WHS incident reports broken on dev: `site_reports` not in schema cache (missing table / stale cache).
3. **LOW (pattern)** — Raw provider/DB errors leak to the UI in several spots (CLAUDE.md says never show raw provider/Postgres strings): blueprint/chat returns the raw Anthropic string + 500 for a billing error; `/operations/<bad-id>` → raw "invalid input syntax for type uuid"; `/operations/<valid-but-not-a-project-id>/schedule` → raw "Cannot coerce the result to a single JSON object" (a `.single()` on a missing project). Recommend: friendly not-found handling on project-scoped routes + a top-level React error boundary.

### Wave 1 (CRM) — MAJOR FINDING
- **FAIL / HIGH — CRM Relationship Dashboard + Contacts are unreachable (whole module inaccessible).** Clicking "Relationships" or "Contacts" (sidebar links or top tabs) and navigating to `/sales/dashboard` or `/sales/contacts` always renders the **Sales Pipeline** instead. Reproduced with and without a project selected; the CRM JS modules (CrmDashboard.jsx, CrmContacts.jsx, MailingLists.jsx) DO lazy-load (200) but never render. No console error.
  - **Root cause (exact):** `SalesManager.jsx:28` does `const { tab } = useParams()` and `:33` `activeTab = CRM_TABS.has(tab) ? tab : "pipeline"`. But `App.jsx:129,133` register **literal** routes `path="/sales/dashboard"` and `path="/sales/contacts"` (no `:tab` param). So `useParams().tab` is always `undefined` → `activeTab` is always `"pipeline"`. The component's own header comment assumes a `/sales/:tab` route that doesn't exist.
  - **Fix (small):** derive the tab from `useLocation().pathname` (last segment) in SalesManager, OR change App.jsx to a `/sales/:tab` param route (careful: must not collide with `/sales/:leadId`). 
  - **Impact:** entire CRM surface (relationship dashboard, contacts, mailing lists, log-interaction, send-campaign) cannot be opened from the UI → blocks live testing of H12/H13 too. Likely a routing regression.

### Wave 4 (partial) — Workforce
- PASS (loads) — Workforce: Approvals/Mass Fill/History tabs; Timesheets + Team sub-nav; "No pending timesheets" (none seeded). H7 (double-time) is a calc fix verified in code by the re-audit; live test needs an employee + a >10h timesheet then approval — deferred (setup-heavy, non-blocking).

### AI unblocked (credit restored)
- PASS — Anthropic credit topped up. `POST /api/blueprint/chat` now returns 200 `{"reply":"OK"}`. Blueprint chat works. AI features now testable: schedule-generate, content-gen, invoice-extract, transcript-analyse, MI question-scan. (Tally item #1 resolved.)

### C6 — AI schedule generation (true path) PASS
- PASS — "Generate with AI" (no legacy template) → `POST /api/schedule/generate` **200** → "Schedule generated — 39 tasks across 124 days, 8 procurement items need ordering". This is the exact scenario the original C6 finding flagged as broken (scheduleGenerate writes build/approval/inspection task_types that the old CHECK rejected). Now inserts cleanly. C6 validated both ways (template load + AI generate). Confirms AI fully working post-credit.

### Operations (cont.)
- PASS — **Cross-project trade-conflict detection (Sprint 4)**: Operations overview shows "2 projects · 78 tasks · 21 trade conflicts" with a full "Trade Scheduling Conflicts" list (admin, engineering, demolition, earthworks, concreting, carpentry, roofing, windows, cladding, plumbing, etc.) flagged where both projects book the same trade on overlapping dates. Working as designed (both projects now share the loaded template schedule).
- WARN/LOW (transient) — hit a momentary white-screen: stale Vite HMR module error "Marketing.jsx does not provide an export named 'default'". Git confirms Marketing.jsx is **unmodified** (default export present); app recovers on a fresh load. Underlying minor: there's no top-level React error boundary, so any single broken import white-screens the whole app — worth adding an error boundary.

### Session checkpoint (1)
Environment + the highest-risk post-audit fixes validated LIVE: **C8** (command-centre served by financeCCRoutes, 200), the **−11,832% margin fix** (sane margins in portfolio + CC), the **underclaim automation**, and **C9 contract-math** (original + signed variations). Sales lead lifecycle (create + detail data-carry) PASS. Remaining fixes (H6/H7/H8 live render, H11/H12/H13, portal client view, schedule C6) + the full 106-SOP / 12-month multi-job simulation are a larger continuous effort — see checkpoint note to Sam.

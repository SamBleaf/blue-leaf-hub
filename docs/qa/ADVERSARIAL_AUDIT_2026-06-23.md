# Blue Leaf Hub — Deep Adversarial Audit (2026-06-23)

**Method.** A 32-unit adversarial workflow (subsystem × lens) read the real code, grounded every finding in `file:line` + a concrete repro, and was designed to refute each finding with 3 independent skeptics before a completeness critic proposed the next round. The **find** stage completed (96 candidate findings: 3 critical, 37 high, 39 medium, 17 low). The **3-skeptic verify** stage + the critic were cut off by the account session limit (resets ~05:20 Adelaide), so the workflow's own confirmations are incomplete. **To compensate, the lead engineer (main loop) independently verified the top ~13 findings by reading the cited code and live-testing the running app** — those are marked **✅ VERIFIED** below. The remainder are **◻ CANDIDATE** (grounded by a find-agent, not yet independently confirmed) and must be verified in round 2 before action.

This audit goes deeper than the prior passes (`docs/qa/e2e-test-report.md`, `docs/portal_audit/*`): it found a pervasive **server-side authorization gap** those missed, several **money (GST) correctness** errors, and multiple **broken core workflows** — none of which a "does the page load" pass would surface.

> ⚠️ **Several findings are deploy-blockers.** The unauthenticated write/email/file/token endpoints (Tier 0) should be closed before this goes live for the business.

---

## 0. Headline: the dominant pattern — server-side authz is the weak point

The frontend gating (nav + `RoleRoute`) and the **admin prefix-gate loop** (`dev-api.mjs:835-846`, covering `/api/finance|sales|marketing|intelligence|cost-intelligence|cost-model|fee-proposal|tender|templates`) are solid. The hole is everything **outside** that loop. A large class of routes is registered as either `async (req,res)` (no auth at all) or `requireAuth` only (authenticated, but **no role check** — so any `employee` token passes). The reassuring comment at `dev-api.mjs:829-834` ("`/api/crm` … its sensitive endpoints already carry `requireRole(admin)`") is **factually wrong**.

My independent live checks confirm the *floor* is OK (an authenticated **client** is correctly denied all internal tables by RLS — see §5), but the **staff-role** boundary and the **unauthenticated** surface are not.

---

## 1. CRITICAL — unauthenticated/abusable endpoints (close before deploy)

| # | Finding | Location | Status |
|---|---------|----------|--------|
| C1 | **`POST /api/portal/admin/generate-token` is unauthenticated.** Takes any `projectId`, mints `portal_token`, sets `portal_enabled=true`. Anyone can mint a working client-portal token for any project → full portal data exposure. The whole v1 `/api/portal/admin/*` surface (photos upload, claims, milestones, decisions, builder-messages) is `async(req,res)` with no auth. Both v1 and v2 portal routers are registered. | `portalRoutes.mjs:184` (+205,237,333,386,448,479,509,538,621,639,665,720) | ✅ VERIFIED |
| C2 | **`POST /api/cron/rfq-reminders` is unauthenticated and sends reminder emails to subcontractors.** No middleware, no `CRON_SECRET` check inside (unlike the *next* cron block which is secret-guarded). Anyone can trigger subbie email blasts → spam/reputation abuse. `/api/cron/lead-time-notifications` (1585) is the same. | `dev-api.mjs:1574, 1585` | ✅ VERIFIED |
| C3 | **`GET /api/mail/inbox` reads the company IMAP inbox unauthenticated.** No auth; returns recent INBOX messages to anyone. (Distinct from `/api/imap/quote-poll`, which was already secured.) | `dev-api.mjs:2071` | ✅ VERIFIED |
| C4 | **`/api/dropbox/*` write routes are unauthenticated** — `ensure-job-folders`, `upload-tender-document`, `save-rfq-email-copy`, `save-quote-pdf`. Anyone can write into the company file store / exhaust storage. | `dev-api.mjs:1430,1455,1499,1531` | ✅ VERIFIED |
| C5 | **Fee-proposal: Buildexact API estimate path drops the builder's margin** (markup=0, cost×1.1) → proposals systematically underpriced. Money-out-the-door risk. (Same class as the carpentry import bug we fixed, on the *fee-proposal* entry path.) | `buildexactParser.mjs:730-813` via `costIntelligenceEstimate.mjs:225` → `buildexactDeepIntegration.mjs:66` | ◻ CANDIDATE (high-conf) |
| C6 | **Unauthenticated, paid-API-burning, mutating endpoints**: `POST /api/rfq/:rfqId/reextract-amount` (mutates RFQ rows, calls Claude+Dropbox), Blueprint AI endpoints (`blueprintRoutes.mjs:448,490,501`), `GET /api/quote-tracker/unmatched` read (PII), subbie CSV→Google-Sheet (`dev-api.mjs:912`). | `dev-api.mjs:2218,1851,912`; `blueprintRoutes.mjs:448+` | ✅ VERIFIED (2218 + registration) / ◻ others candidate |

---

## 2. HIGH — role-bypass (authenticated, but no role check)

Any active **employee** token passes `requireAuth`. These mutate money/ops:

- **`POST /api/po/issue` is `requireAuth` only** → an employee can issue purchase orders (a financial commitment). `module4Routes.mjs:570`. ✅ VERIFIED
- **All `/api/rfq/*` (extract/send/remind-one) are `requireAuth` only** → employee can send RFQs to subbies. `dev-api.mjs:1199,1831,1873`. ✅ VERIFIED
- **`/api/crm/*` send + contacts + lists + import are `requireAuth` only** → any staff token can fire a bulk email (`/api/crm/sends/:sid/send`, 1042) and read/write all contact PII. Only the `contact-roles` routes carry `requireRole(admin)`. ✅ VERIFIED
- **Schedule write routes `requireAuth` only** (`POST /api/schedule/:projectId/task`, `PATCH/DELETE /api/schedule/task/:id`) → an employee (UI: schedule view-only) can create/edit/delete any project's schedule. `scheduleRoutes.mjs:813,1007,1147`. ✅ VERIFIED
- **All `/api/workforce` timesheet read endpoints `requireAuth` only** → any employee can enumerate the whole workforce's timesheets/hours. `workforceRoutes.mjs:624,638,455,489,1472`. ◻ CANDIDATE
- **Operations trade/PO routes leak subcontractor PII to `employee`** (no role gate). `operationsRoutes.mjs:161,319,420`. ◻ CANDIDATE
- **`PUT /api/insights/:id/dismiss` escapes the `/api/finance` gate** (only `requireAuth`) → a supervisor/employee can suppress Director-only cost-intelligence alerts. `financeRoutes.mjs:1530`. ◻ CANDIDATE

### Cost-strip bypass (supervisor/worker see $ the UI hides)
- **Carpentry job/summary/budget/costs endpoints send `$` (cost + margin) to cost-stripped supervisors** — the strip is UI-only; the server returns everything, and `/api/carpentry` allows `supervisor`. `carpentryRoutes.mjs:203,346,1445,1189,1366`. ◻ CANDIDATE (live-test queued)
- **`/api/workforce` labour endpoint leaks per-worker/per-category labour cost to non-director roles.** `workforceRoutes.mjs:907-914,873,892`. ◻ CANDIDATE
- **Worker PWA leaks supervisor/QC tasks** — `task_audience` is never filtered server-side (D3 regression). `workforceRoutes.mjs:1382-1404`. ◻ CANDIDATE
- **Worker log-hours job picker is unscoped** — any magic-link holder sees the full project/carpentry portfolio + client names and can attribute hours to arbitrary jobs. `workforceRoutes.mjs:1128-1158` + POST `1225-1294`; `WorkerLogHours.jsx:54-82`. ◻ CANDIDATE

### Portal data exposure
- **Client can view internal/defect site photos** — v2 media route + Home feed bypass the mig-110 `client_visible` flag. `portalV2Routes.mjs:174-185,285-290`. ◻ CANDIDATE
- **Selection sign-off / meeting responses open to non-contractual invitees** (architect/accountant can make a binding, cost-impacting selection or respond for the client). `portalV2Routes.mjs:663-666,896,934`. ◻ CANDIDATE

---

## 3. HIGH/MEDIUM — money (GST) correctness

- **Double-GST cost booking**: `amount_ex_gst || amount_total` falls back to the **inc-GST** total and pushes it as the **ex-GST** cost when ex-GST is null → material actuals overstated 10%. `financeRoutes.mjs:587`. ✅ VERIFIED
- **Payment status uses hardcoded `amount_ex_gst * 1.1`** and compares to `payment_amount` sums — law violation (`GST_RATE`/`incGst()` exist) + ex/inc mismatch can prevent a claim ever flipping to `paid`. `financeCCRoutes.mjs:1364`. ✅ VERIFIED
- **KPI mismatch**: "Claims paid" totals inc-GST cash while "Claims issued" totals ex-GST → paid renders as ~110% of issued. `financeCCRoutes.mjs:641`. ◻ CANDIDATE
- **Hardcoded `*1.1` / `/1.1` GST** instead of `constants.js` helpers across `buildexactParser.mjs:590`, `feeProposalTransform.mjs:172`, `module4Routes.mjs:373`, `docTokens.mjs:79` (law violation; some understate price in fallbacks). ◻ CANDIDATE
- **`quoted_value` set to COST (net_total), dropping markup** on legacy-report XLSX + API import paths → margin display blank/wrong. `carpentryRoutes.mjs:680`, `CarpentryDashboard.jsx:132`. ◻ CANDIDATE
- **Auto-approve threshold compares an inc-GST total against an ex-GST limit.** `financeRoutes.mjs:758`. ◻ CANDIDATE
- **Actuals undercount**: normalized-cost + finance rollups sum only `amount_ex_gst`, dropping invoices carrying only `amount_total`. `financeRoutes.mjs:1004`. ◻ CANDIDATE

---

## 4. HIGH/MEDIUM — broken or incorrect workflows

- **Variations can't be saved**: `VariationModal.save()` uses a bare `fetch()` (no auth header) → 401 under the `/api/finance` gate. Variations feed contract value → all downstream claim %/margin. One-line fix (`authFetch`). `Variations.jsx:247`. ✅ VERIFIED
- **WIPAA panel is dead**: `JobFinancials.jsx:84` calls `/api/finance/jobs/:id/wipaa` which was renamed to `…/wipaa/current` → 404; also reads response fields the new endpoint doesn't return. ◻ CANDIDATE (high-conf)
- **Ripple cascade has no cycle guard**: the `while(queue.length)` re-queues a task every time its date moves, with no visited-set/iteration cap → a cyclic dependency loops forever (browser hang; server twin too). `scheduleUtils.js:371-407` + `scheduleRoutes.mjs:203-222`. ✅ VERIFIED
- **Mass-fill duplicates hours**: always INSERTs without clearing existing entries → re-running a filled day doubles hours + labour cost. `workforceRoutes.mjs:670-693`. ◻ CANDIDATE
- **Overtime/double-time computed per task-entry, not per day** → multi-task days underpaid + labour actuals under-booked. `workforceRoutes.mjs:425-433`. ◻ CANDIDATE
- **Carpentry labour-actuals are unreliable**: `matchTaskCategory` maps common estimate categories to *no* workforce task → silent $0; two budget lines on the same `workforce_task_category` double-count; `/budget`, `/summary`, `/closeout` use different bases → the same job shows three different actuals. `carpentryRoutes.mjs:1284-1295,1394-1416,1463-1473,1546-1558`. ◻ CANDIDATE
- **Auto-layout schedules in calendar days, not working days** → milestones land on weekends; frame-delivery earlier than commencement produces a non-monotonic schedule; terminal zero-advance milestones collide with predecessors. `carpentryScheduleUtils.mjs:38,46-51,71-82`. ◻ CANDIDATE
- **Procurement lead-time reminders hardcode 3 weeks** for AI tasks (real value is in `lead_time_days`, not `lead_time_weeks`). `scheduleReminders.mjs:150`. ◻ CANDIDATE
- **EOT apply shifts every task (incl. completed/past) with no idempotency guard.** `scheduleRoutes.mjs:1366-1389`. ◻ CANDIDATE
- **Typed `task_dependencies` (SS/FF/lag) are ignored on the DB cascade/apply path** — Sprint-3 typed deps dead on apply. `scheduleRoutes.mjs:184-224,322-363`. ◻ CANDIDATE
- **Marketing media pipeline broken**: Final Assembly/Re-export run `ffmpeg` on a Supabase *storage path* as if local (never downloaded); streamed `/upload-video` never persists to storage (`storage_path` stays null, temp deleted) → export impossible; consent (`consent_for_marketing`) only enforced on final `/assemble`, not on generate/stream/preload/export. `marketingMedia.mjs:687,647`; `marketingRoutes.mjs:887-944,179,244,723,1047`. ◻ CANDIDATE
- **CRM smart-list sends ignore unsubscribe/consent**; link-unsubscribe is per-list only (no global suppression); `increment_send_stat` double-counts on webhook retries. `crmRoutes.mjs:1060-1069,1211-1216,1256-1279`. ◻ CANDIDATE
- **RFQ/portal "lost write" races**: an RFQ package is silently lost if create returns non-OK *after* all RFQs were emailed (`RfqEngine.jsx:1998`); convert-to-job address-dedup can overwrite another party's canonical client facts (`salesRoutes.mjs:254-316`); concurrent variation double-sign double-counts (`financeCCRoutes.mjs:2012`). ◻ CANDIDATE
- **`FieldTasks/FieldDiary/FieldWHS` load has no `catch`** — a rejected Supabase fetch leaves the spinner stuck (same class as the FieldHome bug already fixed; FieldHome got the `try/finally`, the siblings did not). `field/FieldTasks.jsx:18`, `FieldDiary.jsx:26`, `FieldWHS.jsx:10`. ◻ CANDIDATE (high-conf — I fixed the `()` call there but not the missing catch)
- **Editing template content in the Hub reverts admin metadata** (status/title/purpose/category) to catalog defaults. `templateRegistryRoutes.mjs:138-146`. ◻ CANDIDATE
- **Leading-hand completion photos stored as raw base64 in the DB** — violates the mig-099 path-only design. `WorkerLogHours.jsx:178`; `workforceRoutes.mjs:1288`. ◻ CANDIDATE
- **AI job-matching tier references undefined `MODEL`** → every AI-tier invoice match silently fails. `financeRoutes.mjs:264`. ◻ CANDIDATE
- **Marketing Intelligence AI summary uses a stale model id and fails silently**; Meta token passed in URL query string. `marketingIntelligenceRoutes.mjs:538,593`. ◻ CANDIDATE

---

## 5. What I independently VERIFIED is sound (positives)

- **Migrations 109/112/113/114/115/116 are applied** on the dev DB (column probes), and a live write-test confirmed **D3/D4 persist** — a `first_fix_framing` + `task_audience:'supervisor'` task saved against the real mig-114 CHECK (probe row cleaned up).
- **Client RLS floor is solid**: signed in as the real `e2e-client`, every internal table (budgets, costs, timesheets, leads, jobs, projects, subbies, POs, templates, site_tasks, fee_proposals, CRM) returned **0 rows**; `user_profiles` returned `count=1` (own row — confirm the policy predicate is `id = auth.uid()`).
- **Supervisor gating** (nav scoped, `/finance`+`/sales` redirect, API 403 on finance/sales, ops allowed) and **field-app cost-strip in the UI** all hold.
- **Field App load bug** (`supabaseConfigured()` called on a boolean) already fixed + shipped (`7de7f67`) — though the missing `catch` in the 3 sibling field pages is still open (§4).

The auth weakness is therefore a **staff-role + unauthenticated** problem, not a client-RLS problem.

---

## 6. Remediation plan (tiered)

**Tier 0 — deploy blockers (close the unauth/role-bypass surface). One focused PR.**
1. Add auth to every unauthenticated route: `/api/portal/admin/*` (admin), `/api/cron/*` (`CRON_SECRET`), `/api/mail/inbox` (admin), `/api/dropbox/*` (admin/supervisor), `/api/rfq/:id/reextract-amount`, `/api/blueprint/*`, `/api/quote-tracker/unmatched`, subbie CSV→Sheet.
2. Add `requireRole` to the role-bypass writes: `/api/po/issue` + `/api/rfq/*` + schedule writes (admin+supervisor), `/api/crm/*` send+PII (admin), `/api/workforce` reads (scope to self for worker / admin for all). Consider extending the `dev-api.mjs` prefix-gate loop to `/api/schedule`, `/api/po`, `/api/crm` (sensitive), `/api/workforce` and fixing the inaccurate comment.
3. Server-side **cost-strip** for supervisor on `/api/carpentry/*` + `/api/workforce` labour $ (don't send `$`/margin to non-director roles).
4. Rate-limit + shrink the body cap on the public `/api/induct` submit.

**Tier 1 — money correctness.** Replace all hardcoded `*1.1`/`/1.1`/`*0.1` with `GST_RATE`/`incGst()`/`gstAmount()`; fix the `amount_ex_gst || amount_total` fallbacks (C/finance:587, 758, 1004); reconcile the claims-paid (inc) vs issued (ex) KPI; fix `quoted_value`=cost; fee-proposal margin drop (C5).

**Tier 2 — broken workflows.** `authFetch` in Variations; WIPAA URL+fields; ripple **cycle guard** (visited-set + iteration cap, both client + server); mass-fill clear-before-insert; OT per-day; carpentry actuals single source of truth; auto-layout working-days + monotonic guard; lead-time reminder uses `lead_time_days`; `catch` in the 3 field pages.

**Tier 3 — data integrity + portal.** Carpentry actuals mapping; portal `client_visible` photo enforcement; selection/meeting authz to primary/secondary only; convert-to-job fact contamination; base64→storage-path photos; marketing media pipeline (download-before-ffmpeg, persist streamed uploads, consent on all paths).

**Tier 4 — standards hygiene (broad).** `ok()/err()` + `translateDbError` everywhere raw Postgres strings leak (scheduleRoutes, costIntelligenceRoutes, workforce site_tasks, etc.); `req.caller` vs `req.user` (CRM/cost-intel audit fields are silently NULL); `leads.stage` CHECK + `LEAD_STAGES`; AU-local dates in SiteDiary/WorkerWeek/scheduleUtils `today`.

---

## 7. Round 2 (resumes when the agent session limit resets ~05:20 Adelaide)

The 3-skeptic verify + completeness critic did not run. Round 2 will:
1. **Re-verify the ◻ CANDIDATE findings** (refute pass) so the medium tier is trustworthy before action.
2. **Live-reproduce the auth holes** with an `employee` token (curl `/api/po/issue`, `/api/schedule/:id/task`, `/api/crm/sends/:id/send`) + the supervisor carpentry cost-strip + the unauth `/api/portal/admin/generate-token` and `/api/mail/inbox` — turn each ◻ into a proven defect or a refutation.
3. **Deep single-file units** the round-1 breadth under-probed: `RfqEngine.jsx` (3256 LOC), `LeadDetail.jsx` (2085), `Subcontractors.jsx` (1881), `TenderDetail.jsx` (1790), `OperationsProjectDetail.jsx` (1319), `marketingIntelligenceRoutes.mjs` (1698).
4. **End-to-end journey traces** (lead→job→schedule→procurement→invoice→claim→portal) for state/idempotency holes.
5. Loop until a round yields no net-new confirmed findings, then finalize this doc.

**Raw round-1 output:** `/private/tmp/.../tasks/wrd4ww56x.output` (96 findings, full evidence/repro/fixSketch per finding).

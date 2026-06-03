# Blue Leaf Hub — Full System Audit Report
**Date:** 2026-06-03
**Auditor:** Independent product + QA auditor (Claude, claude-opus-4)
**Method:** Code + authenticated-API + Supabase-data audit (background agent — no Claude-in-Chrome UI driving)
**App:** Vite http://localhost:5173 | API http://localhost:8787 (both confirmed up, HTTP 200)
**Credentials tested:** ai-test-director@blueleafbuilding.test (admin role) — the only admin login available; **no non-admin login exists** (user_profiles role distribution: `{ admin: 2 }`)
**Baseline:** `AUDIT_REPORT_2026-06-02.md` + triage `AUDIT_2026-06-02_TRIAGE.md`

> Every finding below is tagged **[code-verified]**, **[API-verified]**, **[data-verified]**, or **[needs human UI pass]**.
> This was a non-UI audit: pixel-level rendering, click behaviour, and visual styling (BUG-016/017-class items) need a human UI pass.

---

## 1. Executive Summary

The system has materially improved since 2026-06-02. The **Universal Data / Knowledge Core foundation (Phases 1–7) is now genuinely wired and works** — I verified end-to-end via the authenticated API and the service that lead→job conversion stamps provenance-tracked facts, the address-derivation hook populates suburb/postcode/state, the tiered Confirm queue holds consequential extractions until confirmed, internal facts auto-apply at ≥0.90, and the canonical Generated `contract_value` fact correctly computes `original + Σ signed variations`. **Of the 17 bugs in the 2026-06-02 audit, 10 are now fixed, 5 are carried-over open, and 2 are partially fixed.** The CRM `job_contact_roles` feature is solidly built with correct double-layer admin gating.

However, three **NEW bugs** surfaced, all stemming from a single root cause: **migration 079 dropped the `contract_value` sync trigger, but three code paths still read the now-unmaintained stored `jobs.contract_value` column instead of the canonical Generated fact.** This is exactly the "stale reads" ordering hazard the migration's own header warned about — the finance KPI reads were migrated, but the WIPAA snapshot writer and the CRM referral rollup were not. Net effect: contract value is understated by the signed-variation total in the WIPAA history and in "value brought in" referral metrics.

The **single highest-priority Buildxact reconcile cannot positively confirm** the contract-value formula against Buildxact, because **0 of 40 Buildxact jobs are linked** to a Hub job. The root cause is the genuine, reproducible **absence of the `jobs.buildexact_job_id` column in the dev DB** (migrations 008/015/075 that define it were never applied here) — contradicting the 2026-06-02 triage's claim that this was merely a PostgREST cache drift. The linking UI exists in the code but will fail at runtime against this DB.

**Verdict:** Core lifecycle, facts service, and CRM referral tracking are production-quality and verified. Phase-5 finance truth is correct on the read path but has two stale-read leaks on the write/rollup path that must be closed before real money flows. Buildxact reconciliation remains blocked by the missing link column — the same blocker as the last audit, still open.

---

## 2. Test Methodology

**Approach.** Non-UI deep audit per the prompt's BACKGROUND-agent path: read every delta-scope source file; signed in as the admin test account with `@supabase/supabase-js` (anon) to obtain a JWT and exercised the new/changed endpoints with `Authorization: Bearer`; used the service-role client to validate that facts/events/provenance landed and to clean up; ran the Buildxact reconcile CLI against the live tenant.

**What was live-verified (API + data):** convert-to-job (both BUG-009 and BUG-010 guards), fact stamping into `job_fact_history` + `job_events`, address-derivation hook, the Generated `contract_value` computer, Generated-fact write rejection, the tiered Confirm queue (flag → confirm → apply), `job_contact_roles` CRUD + `valueBroughtIn`/`consultingFees` math, the referral rollup recompute, and the WIPAA snapshot persistence.

**What was code-verified only:** the `requireRole("admin")` 403 gate on all 5 contact-role endpoints (no non-admin login exists to produce a live 403); the UI admin-gating of the Key People / Jobs & Referrals panels; BUG-001/002/006/007/008/012 fixes; the labour double-count guard (inert by design); the inertness of the scope-intelligence seam.

**Constraints honoured:** no application code modified; no git commit/push; no Buildxact write/PO created; no outbound email triggered; all test records deleted (see §9). Two temp scripts were written under the repo root to run from `node_modules` and were removed after the run.

---

## 3. Module-by-Module Findings (Delta Scope first)

### 3.1 Facts service across the job spine — ✅ WORKS [API + data-verified]
- **Lead → job conversion** (`POST /api/sales/leads/:id/convert-to-job`, `salesRoutes.mjs:409`): converted a test lead and confirmed **10 `job_fact_history` rows + 10 `job_events` rows** were written with correct provenance (`source=system`, `reason=lead_conversion`). Carried facts: address, client_name, client_email, client_phone, project_type, estimated_value. ✅
- **Address-identity hook (Phase 1)** (`factsService.onAddressWrite`): writing the `address` fact derived and stamped `address_normalised` (`42 audit test street kew`), `address_suburb` (`Kew`), `address_postcode` (`3101`), `address_state` (`VIC`), each as its own `derived_from_address` provenance row. ✅
- **Generated `contract_value` fact (Phase 5)**: with `original_contract_value=800000`, one signed variation `$25,000`, one pending `$99,999`, `getFact(jobId,'contract_value')` returned **825,000** (pending correctly excluded). The finance command-centre KPI returned the identical 825,000 via `contractValueOf`. ✅ **This is the Phase-5 acceptance number — Hub-side is correct.**
- **Generated-fact write rejection**: `POST /api/facts/job/:id/contract_value` → 400 `"'contract_value' is a generated fact and cannot be written directly."` ✅
- **Tiered Confirm queue (Phase 3)**: `setFact(storeys, source=extraction, conf 0.7)` → `extracted_flagged`, **not** applied, surfaced in `getPendingFacts` and `/api/facts/pending`; `confirmFact` promoted it to `confirmed` and applied the value; an internal fact (`floor_area_m2`, conf 0.95) auto-applied as `extracted_applied`. ✅
- ⚠ **Doc staleness [code-verified]:** `factsService.mjs:4` still says "NOT WIRED YET. No route imports this…" — false now; `factsRoutes.mjs`, `salesRoutes.mjs`, `financeCCRoutes.mjs`, `crmRoutes.mjs` all consume it. Cosmetic but misleading. (Logged as BUG-N3, Low.)
- **Note [data-verified]:** `job_fact_history` and `job_events` have **0 rows** in the dev DB — the wiring is code-present and works when invoked, but has never been exercised on real data here. No facts have been confirmed/overridden through the UI in this environment. **[needs human UI pass]** to confirm `<FactField>` renders provenance and Confirm/Override behave in the browser.

### 3.2 Trade-category FKs (Phase 6) — ✅ PRESENT [data-verified]
`trade_category_id` confirmed on `purchase_orders`, `cost_intelligence`, `rfqs`. Migration 081's backfill is conservative (exact case-insensitive name match only; non-matches left NULL). Ledgers are empty (`purchase_orders: 0`), so no live mis-categorisation could occur. Spend-attribution correctness on real POs **[needs human UI pass / first real Buildxact sync]**.

### 3.3 Carpentry link + double-count guard (Phase 7) — ✅ SAFE, guard inert by design [code + data-verified]
`carpentry_jobs.job_id` column present. `server/lib/labourAttribution.mjs` exists with `labourOwner`/`isDualAttributed`/`excludeDoubleCounted`/`dedupeTimesheetsForJob`/`labourTotalForJob`. **The guard is not wired into any rollup** (grep confirms no consumer) — this matches the documented Phase-7 intent ("link + guard are the deliverables; folding carpentry into builder numbers is deferred"). Because finance rolls labour by `timesheets.job_id` and carpentry by `timesheets.carpentry_job_id` in separate id-spaces, **there is currently no double-count**. ✅ No regression.

### 3.4 CRM smart-list visibility — ✅ PRESENT [code-verified]
`smartListsForContact` computes and `ContactDrawer.jsx` renders the smart-list chips (`smartLists`, line 435/665). New Contact form (`CrmContacts.jsx`) has the "Referred by" searchable picker (line 202), the Notes field (line 241), and consent fields. **[needs human UI pass]** for the "will appear in" hint rendering and chip interactions.

### 3.5 `job_contact_roles` (mig 083) — ✅ WORKS, gating solid [API-verified + code-verified gate]
- **All 5 endpoints carry `requireRole("admin")`** [code-verified, `crmRoutes.mjs`]:
  `GET /contacts/:id/job-roles` (583), `POST /jobs/:jobId/contact-roles` (622), `PUT /contact-roles/:id` (655), `DELETE /contact-roles/:id` (681), `GET /jobs/:jobId/contact-roles` (693).
  `requireRole` (`requireAuth.mjs:23`) returns **403 Forbidden** when `req.caller.role` is not in the allowed set. The real gate is server-side; the UI panels (`KeyPeoplePanel` JobCommandCentre.jsx:802; "Jobs & Referrals" ContactDrawer.jsx:611) additionally render only when `useRole().role === "admin"` — correct defense-in-depth.
  ⚠ **Could not produce a live 403** — no non-admin user exists. **Gating is code-verified, not live-403-verified.** Recommend creating a non-admin test user to prove the 403 in a future pass.
- **Math [API + data-verified]:** added a referrer role (credits_referral=true) + a consultant role (fee_amount=12000) on one job → summary returned `consultingFees: 12000` ✅, `jobsCount: 1` ✅ (dedup by job_id correct), referral rollup persisted `referral_count=1` and recomputed the relationship score. ✅
- ⚠ **BUG-N2 (NEW, see §5):** `valueBroughtIn` returned **800,000, not the canonical 825,000** — it reads stale `jobs.contract_value`.

### 3.6 Pluggable scope engine seam — ✅ INERT [code-verified]
`server/lib/scopeIntelligence/` exists and is not imported by the RFQ route. No regression.

### 3.7 Carried-over bug re-check (the 17 from 2026-06-02)
| Bug | Status now | Evidence |
|---|---|---|
| BUG-001 (Sales /pipeline raw error) | ✅ **FIXED** [code] | Explicit `<Route path="/sales/pipeline" …Navigate to="/sales">` before `:leadId` (App.jsx:142) |
| BUG-002 (Operations Financials tab) | ✅ **FIXED** [code] | Inline collapsible Financials section (OperationsProjectDetail.jsx:1188) + ProjectBar "Financials" → `/finance/jobs/:jobId` (ProjectBar.jsx:42) |
| BUG-003 (`buildexact_job_id` missing → all NOT LINKED) | ❌ **OPEN** [data] | Column genuinely absent from dev DB (migs 008/015/075 not applied); reconcile 0/40 linked. **Triage's "cache drift" framing is wrong for this DB.** |
| BUG-004 (webhook event type "unknown") | ⚠ **NOT RE-VERIFIED** | No new webhook events to test; handler unchanged. Carried-over open. |
| BUG-005 (portal client name/email don't save) | ⚠ **PARTIAL** [code] | `onBlur={patchProject({portal_client_name/email})}` added (PortalAdmin.jsx:250/259) — UX bug fixed, but still writes `projects.portal_client_*`, not the job-spine client identity (Phase-2 target). |
| BUG-006 (Enable test portal inert) | ✅ **FIXED** [code] | Working `onClick → enableTestPortal()` with error toast (PortalAdmin.jsx:204) |
| BUG-007 (Draft claim CTA inert) | ✅ **FIXED** [code] | `onClick → claimsSectionRef.scrollIntoView()` (JobCommandCentre.jsx:642) |
| BUG-008 (Carpentry budget margin "—") | ✅ **FIXED** [code] | `displayMarginPct = (quotedValue-quotedCost)/quotedValue` (CarpentryJobDetail.jsx:369) |
| BUG-009 (job status hardcoded "tendering") | ✅ **FIXED** [API] | convert-to-job derives `status = lead.stage==="won" ? "won" : "tendering"` (salesRoutes.mjs:464); accepted→tendering, won→won both verified. `POST /api/jobs` now accepts+validates a caller status (jobsApiRoutes.mjs:82). |
| BUG-010 (unmatchable "Name — Suburb" address) | ✅ **FIXED** [API] | convert-to-job returns 400 "site address is required" when `site_address` empty (salesRoutes.mjs:429); verified live. |
| BUG-011 (Blueprint insight stale) | ⚠ **NOT RE-VERIFIED** | UI-only; needs human pass. |
| BUG-012 (Home pipeline missing Fee Proposal/Won) | ✅ **FIXED/INTENTIONAL** [code] | `fee_proposal` in PIPELINE_STAGES (Home.jsx:10); Won shown as `won_last_12m` separately (consistent with prior KPI decision). |
| BUG-013 (Quote Tracker badge) | ⚠ **NOT RE-VERIFIED** | UI-only; needs human pass. |
| BUG-014 (filter badge not removable) | ⚠ **NOT RE-VERIFIED** | UI-only; needs human pass. |
| BUG-015 (webhook URL localhost) | ⚠ **NOT RE-VERIFIED** | Config/deploy; pairs with BUG-004. |
| BUG-016 (precon fee placeholder styling) | ⚠ **NOT RE-VERIFIED** | UI-only; needs human pass. |
| BUG-017 (fee proposal wizard blank) | ⚠ **NOT RE-VERIFIED** | UI-only; needs human pass. |

**Tally:** 10 fixed, 1 partial (005), 1 intentional/fixed (012), **2 open** (003 confirmed open, 004 carried), **5 UI-only not re-verifiable in a non-UI audit** (011, 013, 014, 015, 016, 017 — six items, none contradicted).

---

## 4. Buildxact API + Reconciliation Findings

**Command:** `node scripts/reconcile-buildxact.mjs all` — ran live against the real tenant.

- ✅ **Auth + reads work:** 40 real jobs pulled with contract/estimate/PO/claims/variations totals and GST (e.g. J1120 contract $240,325.14 ex / $24,032.67 GST). The client and reconcile formulas are operational.
- ❌ **0 of 40 jobs LINKED.** Output footer: `5 job(s) checked · 0 linked to a Hub job · 0 with a mismatch.` (default RECON_LIMIT=5; all 40 show "NOT LINKED").
- ❌ **Root cause is a real schema gap, not a cache drift.** Direct service-role probe: `select id, buildexact_job_id from jobs` → **`column jobs.buildexact_job_id does not exist`**; `buildexact_link_source` also absent. Migrations 008/015 (`ADD COLUMN IF NOT EXISTS buildexact_job_id text`) and 075 were **never applied to this dev DB**. The OperationsProjectDetail linking picker (which writes `buildexact_job_id`/`buildexact_link_source`/`buildexact_linked_at`, OperationsProjectDetail.jsx:379) **will throw at runtime** against this DB.
- ⚠ **HIGHEST-PRIORITY reconcile cannot be positively confirmed.** With the trigger gone (mig 079) AND 0 linked jobs, the reconcile tool **cannot validate that Hub `contract_value` (= original + Σ signed variations) equals Buildxact within $1** — there is no linked job to compare. **The Hub-side formula IS correct (verified in §3.1: 825,000), but the cross-system $1 reconcile is unproven.** This must be re-run the moment a Hub job is linked.

**Action:** apply migrations 008 + 015 + 075 to the dev Supabase (and reload PostgREST), populate at least one `buildexact_job_id`, then re-run the reconcile as the gating Buildxact milestone.

---

## 5. Bug Register

### NEW bugs (introduced/surfaced since 2026-06-02)

**BUG-N1 — WIPAA review snapshot stores contract value WITHOUT signed variations** — **Medium/High** [API + data-verified]
- **File:** `server/lib/financeCCRoutes.mjs:705`, in `POST /api/finance/jobs/:jobId/wipaa/review`.
- **Detail:** `const contract_value = Number(job.original_contract_value || job.contract_value || 0);` — does NOT add Σ signed variations and does NOT use `contractValueOf`. With a job at original 800,000 + signed variation 25,000 (canonical 825,000), saving a WIPAA review persisted **`wipaa_reviews.contract_value = 800,000`** (verified). Since mig 079 dropped the sync trigger, `jobs.contract_value` is NULL, so it silently uses the original value.
- **Impact:** WIPAA history understates contract value by the signed-variation total → wrong projected-margin snapshots, wrong audit trail of contract growth.
- **Recommendation:** compute via `contractValueOf(jobId, job, signedVariationsTotal)` (already in this file) — fetch signed variations like the other three KPI paths do, then persist that. NEW.

**BUG-N2 — Referral "value brought in" / `referral_job_value` use stale stored contract value** — **Medium** [API + data-verified]
- **Files:** `crmRoutes.mjs:604` (`job-roles` summary) and `crmRoutes.mjs:191-192` (`recomputeReferralRollup`). Both read `jobs.contract_value ?? original_contract_value ?? 0` directly.
- **Detail:** With a credited job at canonical 825,000, the `job-roles` summary returned `valueBroughtIn: 800,000` and `crm_contacts.referral_job_value` persisted `800,000` (verified). Post-mig-079, `jobs.contract_value` is unmaintained → falls back to `original_contract_value`, dropping signed variations.
- **Impact:** Referrers' "value brought in" and the relationship score derived from it are understated whenever a credited job has signed variations.
- **Recommendation:** read the canonical contract value via `getFact(jobId,'contract_value')` (or a shared helper) in both the summary and `recomputeReferralRollup`. NEW.

**BUG-N3 — `factsService.mjs` header comment falsely says "NOT WIRED YET"** — **Low** [code-verified]
- **File:** `factsService.mjs:4`. The service now has 4+ consumers. Misleading to a future maintainer.
- **Recommendation:** update the header to reflect Phase 1–7 wiring. NEW.

> **Common root cause of N1+N2:** mig 079 dropped the `contract_value` storage trigger, but only the finance KPI *read* paths (command-centre / WIPAA-read / cashflow via `contractValueOf`) were migrated to the canonical fact. The WIPAA *write* path and the CRM referral rollup still trust the now-dead stored column. This is precisely the "stale reads" hazard mig 079's own header warned about. Sweep for every remaining `jobs.contract_value` read.

### Carried-over OPEN bugs

**BUG-003 (carried) — `jobs.buildexact_job_id` column absent → Buildxact reconciliation blocked** — **High** [data-verified]
- See §4. Genuine schema gap in this dev DB (not a cache drift). Apply migs 008/015/075; build/confirm the link picker works; re-run reconcile.

**BUG-004 (carried) — Buildxact webhook event type "unknown"** — **High** [not re-verified]
- Handler unchanged (`buildexactWebhook.mjs`); no new events to test. Confirm real event names from the portal and extend the mapping. Pairs with BUG-015.

**BUG-005 (carried, PARTIAL) — Portal client identity still on `projects`, not job spine** — **Medium** [code-verified]
- UX (onBlur save) fixed; architectural target (read client via `getJobProfile`) deferred to Phase 2. Acceptable as a stopgap.

**BUG-011/013/014/015/016/017 (carried) — UI/config items** — **Low** [needs human UI pass]
- Not re-verifiable in a non-UI audit; none were contradicted by code.

---

## 6. Architectural Recommendations

1. **Finish the Phase-5 cutover (close N1+N2 root cause).** Grep every `jobs.contract_value` read in `server/` and route each through the canonical fact / `contractValueOf`. The trigger is gone; any path that still trusts the stored column is now wrong. Candidates beyond N1/N2: any reporting/portfolio rollup that selects `contract_value`.
2. **Make the canonical contract value reusable.** `contractValueOf` lives privately inside `registerFinanceCCRoutes`. Extract a shared `getCanonicalContractValue(jobId)` (or just call `getFact`) so CRM, WIPAA-save, and portal use one implementation — no parallel formulas.
3. **Unblock Buildxact (BUG-003).** Apply migs 008/015/075 to dev, populate one `buildexact_job_id`, run the reconcile — this is the first cross-system money validation and the prompt's stated highest priority.
4. **Exercise the facts pipeline on real data.** `job_fact_history`/`job_events` are at 0 rows — the engine is proven in isolation but unproven against a real conversion+extraction flow in the browser. Do one full UI lifecycle pass before real jobs arrive.
5. **Keep the carpentry guard inert until reconciled.** Do not wire `labourAttribution` into any builder-job rollup until it can be live-tested + reconciled against Buildxact (per its own header). Currently correct.

---

## 7. API Pattern Observations

- ⚠ **`jobsApiRoutes.mjs` violates the `ok()/err()` law.** `POST /api/jobs` uses raw `res.status(500).json({ ok:false, error: error.message })` (line 84) — leaks the raw Supabase error string to the client (CLAUDE.md: "Raw Postgres strings must never reach the browser"). Should use `err(res, …, translateDbError(error))`. (The newer `convert-to-job` endpoint does this correctly.) [code-verified]
- ⚠ **Hardcoded status literals.** convert-to-job (salesRoutes.mjs:464) and jobsApiRoutes use the string literals `"won"`/`"tendering"` rather than importing from `constants.js` (CLAUDE.md: "always import from constants.js"). The behaviour is correct, but the literals are a standards violation. [code-verified]
- ✅ The facts endpoints, CRM role endpoints, and finance CC routes correctly use `ok()/err()`, `rowToCamel`, `requireAuth`/`requireRole`, and ex-GST amounts.

---

## 8. Security Observations

- ✅ **`job_contact_roles` admin gating is correct and layered.** Server: `requireRole("admin")` on all 5 endpoints returns 403 for non-admins (`requireAuth.mjs:23`). Client: panels render only for `role==="admin"`. The server gate is authoritative even if the client is bypassed. **Code-verified; not live-403-verified (no non-admin login exists).** Recommend adding a non-admin test user so the 403 can be proven live and the fee data is confirmed never to reach a non-admin client.
- ✅ RLS on `job_contact_roles` mirrors the other CRM tables (`authenticated USING(true)`); the real gate is route-level, as the migration documents. Consulting `fee_amount` is server-gated behind admin.
- ⚠ **Raw DB error leak** in `POST /api/jobs` (see §7) is a minor information-disclosure / standards issue.
- ✅ `requireAuth` validates the Supabase JWT via `auth.getUser` and checks `is_active` before attaching the caller — sound.

---

## 9. Data Cleanup Confirmation

All test records created during this audit were deleted via the service-role client. Verified post-cleanup:
- ZZTest leads: **0** · test jobs (Audit Test/Win addresses): **0** · test contacts (zzbrad@): **0**.
- DB returned to baseline counts: `jobs: 9, leads: 10, crm_contacts: 2, job_contact_roles: 0, job_fact_history: 0, job_events: 0, job_variations: 2, wipaa_reviews: 1, project_metrics: 1`.
- Cascading children (job_fact_history, job_events, job_variations, job_contact_roles, wipaa_reviews, project_metrics, crm_contacts.linked_job_id) for test jobs were removed first to satisfy FKs.
- Temp audit scripts removed from the repo root. **No Buildxact write/PO created. No email sent. No application code modified. No git operations performed.**

---

## 10. Priority Action List

**Fix before real money/Buildxact data flows (this week):**
1. **BUG-N1** — WIPAA snapshot must use `contractValueOf` (understates contract value in the audit trail). 
2. **BUG-N2** — referral `valueBroughtIn` / `referral_job_value` must use the canonical contract fact.
3. **BUG-003** — apply migs 008/015/075 to dev; populate one `buildexact_job_id`; **re-run the reconcile** (the highest-priority unproven check).
4. Sweep all remaining `jobs.contract_value` reads (root cause of N1/N2).

**Fix this week:**
5. **BUG-004** + **BUG-015** — confirm Buildxact webhook event names; fix the handler + webhook URL derivation.
6. Fix the raw-error leak + hardcoded status literals in `jobsApiRoutes.mjs` (§7).

**Fix when time permits:**
7. **BUG-N3** — update the stale `factsService.mjs` header.
8. Create a non-admin test user to prove the `job_contact_roles` 403 live.
9. UI-only carried items (BUG-011/013/014/016/017) — human UI pass.
10. Complete Phase-2 portal client-identity migration (BUG-005 depth).

---

## 11. System Health Summary

| Area | Status | Verified by |
|---|---|---|
| Facts service (lead→job carry, provenance, events) | ✅ Works | API + data |
| Address identity hook (Phase 1) | ✅ Works | API + data |
| Contract value Generated fact (Phase 5, read path) | ✅ Correct (825k) | API + data |
| Contract value (write/rollup paths) | ❌ 2 stale-read bugs (N1, N2) | API + data |
| Tiered Confirm queue (Phase 3) | ✅ Works | API + data |
| Trade-category FKs (Phase 6) | ✅ Present (ledgers empty) | data |
| Carpentry link + guard (Phase 7) | ✅ Safe, inert by design | code + data |
| CRM smart lists / referred-by / notes | ✅ Present | code |
| `job_contact_roles` CRUD + math | ✅ Works | API + data |
| `job_contact_roles` admin gating | ✅ Correct (code-verified) | code |
| Scope-intelligence seam | ✅ Inert | code |
| Buildxact API reads | ✅ Live | live reconcile |
| Buildxact ↔ Hub reconciliation | ❌ Blocked (0/40 linked; col missing) | live + data |
| Carried-over 17 bugs | 10 fixed, 1 partial, 1 intentional, 2 open, ~5 UI-only | code/API |

**Bottom line:** the Universal Data foundation is real and working; the CRM referral feature is well-built and properly gated; the lead→job lifecycle is fixed. Two NEW Phase-5 stale-read bugs and the still-missing Buildxact link column are the gating items before real data and money flow.

---

*End of audit report. All test data cleaned up. No Buildxact writes, no email sends, no code changes, no git operations.*

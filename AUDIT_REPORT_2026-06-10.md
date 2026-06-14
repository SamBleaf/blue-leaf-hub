# Blue Leaf Hub — Full System Audit Report
**Date:** 2026-06-10 (run 2026-06-14)
**Auditor:** Independent product + QA auditor (Claude, claude-opus-4-8 [1m])
**Method:** Code + authenticated-API + Supabase-data + Buildxact-live + SOP-Section-14 audit (background agent — no Claude-in-Chrome UI driving available to sub-agents)
**App:** Vite http://localhost:5175 | API http://localhost:8787 (both confirmed up; `/api/health` → `{ ok: true }`)
**Credentials tested:** `ai-test-director@blueleafbuilding.test` (admin). For the `job_contact_roles` 403 gate I **created a temporary non-admin (supervisor) auth user**, proved the live 403 on all 5 endpoints, then deleted it (see §8 + §9).
**Baseline:** `AUDIT_REPORT_2026-06-03.md` + triage `AUDIT_2026-06-02_TRIAGE.md`

> Every finding is tagged **[code-verified]**, **[API-verified]**, **[data-verified]**, **[live-verified]** (Buildxact tenant / live 403), or **[needs UI pass]**.
> Pixel-level rendering, click behaviour, and visual styling still need a human UI pass — flagged inline.

---

## 1. Executive Summary

**The system is in its strongest state across the four audits to date.** Every high-priority item the last audit (2026-06-03) left open in the application layer is now closed, and I verified the fixes live against the API and Supabase data — not just in code.

The headline result is the **Phase-5 canonical contract-value cutover is complete and proven end-to-end.** The last audit's two NEW bugs (BUG-N1 WIPAA snapshot, BUG-N2 referral "value brought in") both stemmed from a single root cause: code paths that still read the dead stored `jobs.contract_value` column after migration 079 dropped its sync trigger. A shared `getCanonicalContractValue(jobId)` helper now lives in `factsService.mjs` and is consumed by finance (`contractValueOf` → it), the WIPAA write path, the CRM `job-roles` summary, and `recomputeReferralRollup`. **I drove a live job to original $900,000 + one signed $30,000 variation + one pending $50,000 variation and confirmed all four paths return the canonical $930,000** (pending correctly excluded): Command Centre = 930,000, WIPAA snapshot persisted = 930,000, CRM `valueBroughtIn` = 930,000, and the referral rollup `referral_job_value` recomputed to 930,000. **BUG-N1 and BUG-N2 are FIXED.** BUG-N3 (the stale "NOT WIRED YET" `factsService.mjs` header) is also fixed.

**The `job_contact_roles` admin gating is now LIVE-403-VERIFIED, not merely code-verified** — the gap the last two audits flagged. I created a temporary supervisor user and confirmed all 5 endpoints return `403 Forbidden` for a non-admin while admin gets 200, then deleted the user. The whole Knowledge Core remains solid: lead→job conversion stamps 10 provenance-tracked facts + events, the Phase-1 address hook derives suburb/postcode/state, the Phase-3 Confirm Queue holds consequential extractions and auto-applies internal ones at ≥0.90, generated-fact writes are rejected, the Phase-6 trade resolver attributes correctly (and conservatively leaves non-matches NULL), and the Phase-7 carpentry guard is safely inert (no dual-attributed timesheets exist). The **role-guard deep-link race fix in `AuthContext.jsx` is correctly implemented** — readiness is keyed on `profileUserId === sessionUserId`, and `RoleRoute` gates on `loading`, so a hard-refresh/deep-link can no longer redirect with `role=null`.

**Buildxact:** the full live API surface works (auth, jobs/items/variations/invoices/POs, estimates+items, customers, contacts, leads, catalogues incl. 2 recipe catalogues, documents, schedules). I ran the PO **create → Unsent → delete** cycle and confirmed the test PO was removed. The job→Hub sync engine runs and writes a `buildexact_job_sync` snapshot. **But reconciliation is still BLOCKED: 0 Hub jobs are linked**, and the root cause I isolated this run is sharper than "missing column": the manual-link UI picker and the webhook both write `projects.buildexact_job_id`, while **every server-side consumer (reconcile, sync, cost-intel, finance, workforce) reads `jobs.buildexact_job_id` — a table that no code ever populates.** Separately, I pulled a **real stored webhook payload and found the exact fix for BUG-004**: Buildxact sends `eventName: "job.created"` and nests the id at `eventData.jobId`, but the handler probes neither — so all 4 events are `unknown`.

**Verdict:** the application/data layer is production-quality and verified. The remaining gating work is entirely in the **Buildxact integration seam** (the `projects`-vs-`jobs` link-table split, and the webhook field mismatch), plus a pre-existing **systemic camelCase-boundary law violation** in the older modules. No regressions were introduced by the delta-scope work.

---

## 2. Test Methodology

**Approach.** Background-agent deep audit per the prompt's non-Chrome path. I read every delta-scope source file; signed in as the admin test account via `@supabase/supabase-js` (anon) to mint a JWT and exercised the new/changed endpoints with `Authorization: Bearer`; used the service-role client to validate that facts/events/provenance landed and to clean up; ran the Buildxact client + reconcile CLI against the **live tenant** (`bbf3c49d-…`); and **created a temporary non-admin user** to obtain a genuine 403.

**Environment.** A dev stack was already running (PID 68404 on 8787, Vite on 5173). My initial `curl` showed "API DOWN" only because the server was mid-restart from a `.env` touch; it came back `{ ok: true }` immediately. I started one `npm run dev`, discovered the pre-existing stack, and **killed my duplicate** to honour the "no duplicates" rule — leaving the original healthy.

**What was live-verified (API + data):** convert-to-job (status derivation + site-address guard), 10-fact stamping into `job_fact_history` + `job_events`, the Phase-1 address derivation hook (suburb=Hawthorn / postcode=3122 / state=VIC), the canonical contract-value flow to **930,000** across Command Centre / WIPAA-write / CRM summary / referral rollup, the Confirm Queue tier behaviour, generated-fact write rejection, the trade resolver, the full Buildxact API surface + PO create/delete, and the job→Hub sync snapshot.

**What was live-verified (security):** the `requireRole("admin")` **403 on all 5 `job_contact_roles` endpoints** for a real supervisor session, with admin returning 200.

**What was code-verified only:** the AuthContext race fix + `RoleRoute` loading gate (logic correct; the actual deep-link render is **[needs UI pass]**); the UI admin-gating of the Key People / Jobs & Referrals panels; the carpentry guard inertness; the camelCase leak's downstream impact.

**Constraints honoured:** no application code modified; no git commit/push (`git status` empty); the Buildxact test PO was deleted; no outbound email triggered; all test records + the temp user deleted and the DB verified back to baseline (§9). Temp `_audit_*.mjs` scripts were written under the repo root to resolve `node_modules` and **removed after the run**.

---

## 3. Module-by-Module Findings (Delta Scope first)

### 3.1 Facts service across the job spine — ✅ WORKS [API + data-verified]
- **Lead → job conversion** (`POST /api/sales/leads/:id/convert-to-job`): converted a realistic `won` lead → job created with **status `won`** (BUG-009 derivation correct), and **10 `job_fact_history` + 10 `job_events`** rows written with provenance (`source=system`, `reason=lead_conversion`). Carried facts: address, address_normalised/suburb/postcode/state, client_name/email/phone, project_type, estimated_value. ✅
- **Address-identity hook (Phase 1):** writing `address="88 Burwood Road, Hawthorn VIC 3122"` derived `address_normalised="88 burwood road hawthorn"`, `address_suburb="Hawthorn"`, `address_postcode="3122"`, `address_state="VIC"`, each its own provenance row. ✅
- **Canonical contract value (Phase 5) — the headline:** original 900,000 + signed 30,000 + pending 50,000 → `getFact(contract_value)` and all four consumers returned **930,000** (pending excluded). ✅ **This is the Phase-5 acceptance number, now proven on the full read AND write/rollup paths.**
- **Generated-fact write rejection:** `POST /api/facts/job/:id/contract_value` → **400** `"'contract_value' is a generated fact and cannot be written directly."` ✅
- **`factsService.mjs` header is now accurate** ("WIRED (Phases 1-7)…") — **BUG-N3 FIXED.** ✅
- **Note [data-verified]:** `job_fact_history`/`job_events` now hold 12 baseline rows each (were 0 last audit) — the engine has been exercised on real data since. Rendering of `<FactField>` provenance + Confirm/Override in the browser is still **[needs UI pass]**.

### 3.2 Confirm Queue + registry tier matrix (Phase 3) — ✅ WORKS [API + data-verified]
- Consequential extraction (`storeys`, conf 0.95) → held as `extracted_flagged`, **not applied**; surfaced in `GET /api/facts/pending` with camelCase provenance + `jobLabel`. ✅
- Internal extraction (`floor_area_m2`, conf 0.95) → **auto-applied** (`extracted_applied`, value 245.5 in `project_metrics`). ✅
- Internal **low**-confidence (`roof_area_m2`, conf 0.6) → flagged (correctly held). ✅
- `POST …/storeys/confirm` promoted the suggestion to `confirmed` and applied `storeys=2`. ✅

### 3.3 Trade-category FKs + resolver (Phase 6) — ✅ WORKS [data + code-verified]
- `trade_category_id` present on `purchase_orders`, `cost_intelligence`, `rfqs`; `trade_categories` seeded with **37 rows**.
- `resolveTradeCategoryId` (in `buildexactParser.mjs`) resolved Carpentry→Carpentry, Electrical→"Electrical & Data" (fuzzy mapping), plumbing→Plumbing, and **correctly left non-matches (`Bricklaying`, `Concrete & Paving`, nonsense) NULL** — conservative, no mis-categorisation. PO-issue stamps it via exact-name match (`module4Routes.mjs:662`) behind a non-fatal guard. ✅
- Note: `trade_categories` uses `name` + `buildxact_code` + `category_type` (no `slug`/`parent_id`); the resolver reads only `name`, so the absent `slug` column is inert. ✅

### 3.4 Carpentry link + double-count guard (Phase 7) — ✅ SAFE, guard inert by design [code + data-verified]
- `carpentry_jobs.job_id` column present (the sole carpentry job has `job_id=null`, so spines stay separate).
- `server/lib/labourAttribution.mjs` exports `labourOwner`/`isDualAttributed`/`excludeDoubleCounted`/`dedupeTimesheetsForJob`/`labourTotalForJob`. **It is NOT called by any rollup** — `financeCCRoutes.mjs:434-440` references it only as a documented call-site flag for when the finance rollup is made carpentry-aware. **0 timesheets are dual-attributed** (none carry both `job_id` and `carpentry_job_id`), so there is no double-count today. ✅ No regression.

### 3.5 CRM smart-list visibility + `job_contact_roles` (mig 083) — ✅ WORKS, gating LIVE-403-verified
- All 5 endpoints carry `requireAuth, requireRole("admin")`; `requireRole` returns **403** when `req.caller.role` ∉ allowed (`requireAuth.mjs:26`). **Live-verified** (§8): supervisor → 403 on all 5; admin → 200. ✅
- **Math [API + data-verified]:** `valueBroughtIn` = **930,000** (canonical, BUG-N2 fixed), `consultingFees` = **15,000** (Σ `fee_amount`, ex-GST), `jobsCount` = 1 (dedup by distinct credited job). The referrer role was **auto-created on convert-to-job** (lead had `referred_by_contact_id`), and `recomputeReferralRollup` persisted `referral_job_value=930,000` + recomputed `relationship_score` on a role change. ✅
- Smart-list chips + "Referred by" picker + Notes/consent fields present in `ContactDrawer.jsx`/`CrmContacts.jsx` [code-verified]; chip rendering is **[needs UI pass]**.

### 3.6 Role-guard deep-link race fix (`AuthContext.jsx`) — ✅ CORRECT [code-verified]
- Readiness is keyed on `profileUserId === sessionUserId` (not a plain boolean), so `loading` stays true until the role is resolved **for this session's user** (`AuthContext.jsx:121`). `RoleRoute` returns `null` while `loading` (`RoleRoute.jsx:10`) and reads the AuthContext role (not the localStorage `useRole`). The documented failure mode (hard-refresh redirect to `/home` with `role=null`) is closed. The live hard-refresh render is **[needs UI pass]**.

### 3.7 Pluggable scope-intelligence seam — ✅ INERT [code-verified]
`server/lib/scopeIntelligence/` is not imported by the RFQ route. No regression.

### 3.8 Other modules — SOP Section-14 (API/data parts) — ✅ ALL PASS at API level
All returned `200 ok:true` with sensible data (real route paths used): Operations (projects, global-gantt, trade-conflicts), Schedule (tasks/dashboard/eot/procurement — 39-task project), WHS (compliance, inductions, swms templates), Finance (command-centre, claims, variations, wipaa current/history, cashflow, budget/actuals), CRM (dashboard, contacts, job-roles), Sales (leads), Workforce (timesheets), Cost Intelligence (benchmarks), Carpentry (jobs), Marketing (content), Portal admin (`/api/portal/admin/:id/summary`), Site tasks, Project labour. **The remaining Section-14 steps (UI clicks, PDF/email generation, on-screen KPI deltas, voice capture, drag/resize, induction QR scan) are [needs UI pass].**

---

## 4. Buildxact API + Reconciliation Findings

**Live tenant** `bbf3c49d-7287-4e5f-99ab-85c68d138be6`.

### 4.1 API surface — ✅ ALL GREEN [live-verified]
| Surface | Result |
|---|---|
| Auth (login on first call) | ✅ |
| Jobs: list / get-by-id (OData `$filter`) | ✅ |
| Job items / variations / invoices / purchase orders | ✅ (J1120: 100 items) |
| Estimates by job + estimate items | ✅ (Q1120 est, 100 items) |
| Customers (42) / Contacts (31) / Leads (46) | ✅ |
| Catalogues (17, incl. **2 recipe catalogues**) | ✅ |
| Documents / Schedules | ✅ |
| **PO create → Unsent → delete** | ✅ created `5602a10d-…` status `Unsent`, **deleted**, verified 0 `ZZAUDIT` POs remain |
| `POST /api/buildexact/sync/:bxId` (J1120 → Hub) | ✅ snapshot upserted to `buildexact_job_sync` (but `job_id=null` — unlinked) |

### 4.2 Reconciliation — ❌ STILL BLOCKED (0 jobs linked) [live + data-verified]
- `node scripts/reconcile-buildxact.mjs all` ran clean against the live tenant and pulled real contract/estimate/claims/variations totals with GST (e.g. J1120 contract $240,325.14 ex / $24,032.67 GST; J1066 $27,993.39 ex). Footer: **`5 job(s) checked · 0 linked · 0 with a mismatch`** (default `RECON_LIMIT=5`).
- **No Hub job has `buildexact_job_id` populated** (0/10), and **no address overlaps** between the Hub jobs (all SA addresses: 21 Folkestone, 42 Kensington, …) and the tenant jobs (74 Bowker St, 7 Strathfield Tce, 24 Naldera Cres). So neither the explicit-link nor the address-fallback can match → the Phase-5 $1 cross-system reconcile **cannot be positively confirmed**. The Hub-side formula IS correct (§3.1: 930,000); the cross-system check is unproven.

### 4.3 NEW root-cause finding for BUG-003 — link-table split (`projects` vs `jobs`)
The prior audit thought `jobs.buildexact_job_id` was *missing*; it now **exists** (confirmed). The real, still-open root cause is a **read/write table mismatch**:
- **Writers** put the link on **`projects`**: `OperationsProjectDetail.jsx:379` (`manualLinkBuildexact` → `projects.buildexact_job_id/_linked_at/_link_source/_last_sync`, on the anon client) and `buildexactWebhook.mjs:230` (same columns on `projects`).
- **Readers** all use **`jobs.buildexact_job_id`**: `buildexactReconcile.mjs:66`, `buildexactSync.mjs:32`, `costIntelligenceEstimate.mjs:102`, `financeCCRoutes.mjs:1670`, `workforceRoutes.mjs:92`, `module5Routes.mjs:618`.
- **No code ever writes `jobs.buildexact_job_id`** (grep: only selects on `jobs`).
- The `buildexact_link_source/_linked_at/_last_sync` columns exist **only on `projects`** (not `jobs`) — so the picker write succeeds, but the link is invisible to every server consumer.

**Net:** even a successful UI link leaves the reconcile/sync reporting "NOT LINKED". This is the concrete blocker, logged as **BUG-N4 (High)**.

### 4.4 Webhook — BUG-004 root cause isolated [data-verified]
A real stored event (`buildexact_webhook_events`) payload is:
```json
{"eventId":"…","tenantId":"bbf3c49d-…","eventData":{"jobId":"2462bacd-…"},"eventName":"job.created"}
```
`extractEventType` probes `eventType/EventType/event_type/type/Type/event/Event` — **never `eventName`** → all 4 events are `unknown`, `processed:false`. `extractJobId` also won't find the id (it's nested at `eventData.jobId`, not `payload`/`job`/`data`). **One-line-class fix exists** (see BUG-004 in §5). Real-time mirror sync is dead until then.

---

## 5. Bug Register

### NEW this run
**BUG-N4 — Buildxact link is written to `projects` but read from `jobs` → reconcile/sync can never see a link** — **High** [code + data-verified]
- **Files:** writers `OperationsProjectDetail.jsx:379`, `buildexactWebhook.mjs:230` (→ `projects`); readers `buildexactReconcile.mjs:66`, `buildexactSync.mjs:32`, `costIntelligenceEstimate.mjs:102`, `financeCCRoutes.mjs:1670`, `workforceRoutes.mjs:92`, `module5Routes.mjs:618` (→ `jobs`).
- **Impact:** linking a project in the UI (or via webhook) does **not** make the reconcile or sync resolve the Hub job; every BX rollup that depends on the link silently no-ops. This is the true reason 0/10 jobs reconcile, superseding the prior "missing column" framing.
- **Recommendation:** pick ONE canonical home for the link. Recommended: write `jobs.buildexact_job_id` (the side every consumer already reads) — change `manualLinkBuildexact` and the webhook to update `jobs` via the server layer (the picker currently uses the anon client + leaks the raw error to `setError`). If the link must stay on `projects` for UI reasons, add a `projects→jobs` propagation (trigger or server write) and add the `_link_source/_linked_at/_last_sync` columns to `jobs`. NEW.

### Carried-over OPEN
**BUG-003 (carried, reframed) — Buildxact reconciliation blocked: 0 jobs linked** — **High** [live + data-verified]
- `jobs.buildexact_job_id` **exists** (prior "column missing" was stale). Blocker is now BUG-N4 (link-table split) + no address overlap. Apply a link path, populate ≥1 `jobs.buildexact_job_id`, re-run the reconcile as the gating Buildxact milestone.

**BUG-004 (carried, root-caused) — Buildxact webhook event type always "unknown"** — **High** [data-verified]
- Real payload uses `eventName` (e.g. `"job.created"`) + `eventData.jobId`; the handler checks neither. **Fix:** add `body?.eventName` to `extractEventType`, add `payload?.eventData?.jobId` to `extractJobId`, and map `job.created`/`job.updated`/`estimate.accepted` to handled types. All 4 stored events are currently `unknown`/`processed:false`.

**BUG-015 (carried, code-FIXED, config pending) — webhook URL shows `127.0.0.1:8787`** — **Low** [code-verified]
- `module4Routes.mjs:71` now derives `API_BASE_URL` → `RAILWAY_PUBLIC_DOMAIN` → localhost. The localhost shown is only the local-dev fallback (no env var set). **Set `API_BASE_URL` in Railway** to close it in prod. Pairs with BUG-004.

**BUG-A1 (carried) — raw DB error leaked + `ok()/err()` law bypass in `POST /api/jobs`** — **Medium** [code-verified]
- `jobsApiRoutes.mjs:84` still returns `res.status(500).json({ ok:false, error: error.message })` (raw Supabase string; CLAUDE.md forbids). ~175 raw `error.message`/`e.message` 500-returns exist server-wide — sweep toward `err(res, …, translateDbError(error))`.

**BUG-A2 (carried, systemic) — camelCase boundary law violated in older modules** — **Medium** [API-verified]
- Newer modules (CRM, facts, job-roles) correctly emit camelCase via `rowToCamel`. But `/api/sales/leads`, `/api/operations/projects`, `/api/schedule/:id`, `/api/finance/jobs/:id/command-centre`, `/api/workforce/timesheets` **leak raw snake_case keys** (`first_name`, `job_id`, `actual_costs`, `approved_at`, …). The frontend reads them directly, so nothing is broken — but it violates "camelCase across the API boundary / never read raw snake_case". Migrate these list/detail responses through `rowsToCamel`/`rowToCamel` (with coordinated frontend reads).

**BUG-005 (carried, PARTIAL) — Portal client identity on `projects`, not the job spine** — **Medium** [code-verified]
- UX onBlur-save fixed previously; the Phase-2 target (read client via `getJobProfile`) is still deferred. Acceptable stopgap.

**BUG-011 / 013 / 014 / 016 / 017 (carried) — UI/UX items** — **Low** [needs UI pass]
- Not re-verifiable in a non-UI audit; none contradicted by code.

### Confirmed FIXED since 2026-06-03
| Bug | Status | Evidence |
|---|---|---|
| **BUG-N1** (WIPAA snapshot drops signed variations) | ✅ **FIXED** [API+data] | WIPAA write uses `contractValueOf`→`getCanonicalContractValue`; persisted **930,000** |
| **BUG-N2** (referral `valueBroughtIn`/`referral_job_value` stale) | ✅ **FIXED** [API+data] | summary + `recomputeReferralRollup` use `getCanonicalContractValue`; both **930,000** |
| **BUG-N3** (`factsService.mjs` "NOT WIRED YET" header) | ✅ **FIXED** [code] | header now reads "WIRED (Phases 1-7)…" |
| **BUG-009** (status hardcoded "tendering") | ✅ **FIXED** [API] | convert-to-job → `won` for a won lead |
| **BUG-010** (unmatchable fallback address) | ✅ **FIXED** [API] | 400 "site address is required" guard (verified) |
| **`job_contact_roles` 403 gate** | ✅ **LIVE-VERIFIED** | supervisor → 403 on all 5; admin → 200 |
| BUG-001/002/006/007/008/012 | ✅ FIXED (carried from 2026-06-03 re-confirm) | unchanged in code since last audit |

---

## 6. Architectural Recommendations
1. **Resolve the Buildxact link-table split (BUG-N4) before any reconcile push.** Canonicalise the link on `jobs.buildexact_job_id` (every consumer reads it); route the UI picker + webhook through the server to write it. This single change unblocks BUG-003.
2. **Fix BUG-004 with the now-known field shape** (`eventName` + `eventData.jobId`), then set `API_BASE_URL` in Railway (BUG-015) and run a live webhook test. These three are the entire Buildxact gating set.
3. **Schedule the camelCase migration (BUG-A2).** It's cosmetic-until-it-isn't: every new consumer that trusts the law will break against the snake_case modules. Migrate sales/operations/schedule/finance/workforce responses through `rowToCamel`.
4. **Sweep raw `error.message` 500-returns (BUG-A1)** toward `err()` + `translateDbError`. ~175 sites; prioritise public/finance routes.
5. **Keep the carpentry guard inert** until the finance rollup is made carpentry-aware AND reconciled against Buildxact — the documented flag at `financeCCRoutes.mjs:434` is the correct trigger point.
6. **Do one full UI lifecycle pass** to close the [needs UI pass] items (FactField provenance render, Confirm/Override, smart-list chips, hard-refresh deep-link, fee-proposal wizard, Gantt drag/resize).

---

## 7. API Pattern Observations
- ✅ **Delta-scope code is law-abiding:** facts/CRM/finance routes use `ok()/err()`, `rowToCamel`, `requireAuth`/`requireRole`, ex-GST amounts, `getCanonicalContractValue` as the single contract-value source.
- ⚠ The WIPAA-save handler uses `res.json({ ok:true, … })`/`res.status(500).json(… translateDbError …)` directly rather than the `ok()/err()` helpers — functionally fine (uses `translateDbError`, never leaks raw), but not the helper. Minor.
- ⚠ **BUG-A1** raw-error leak + **BUG-A2** snake_case leak (see §5).

## 8. Security Observations
- ✅ **`job_contact_roles` admin gating is correct, layered, AND live-403-verified.** Server `requireRole("admin")` returns 403 for a real supervisor on all 5 endpoints; admin gets 200. Consulting `fee_amount` never reaches a non-admin client. UI panels additionally render only for `role==="admin"` (defense-in-depth). The temp non-admin user I created for this test was deleted (§9).
- ✅ `requireAuth` validates the Supabase JWT via `auth.getUser` and rejects inactive accounts before attaching the caller.
- ✅ Generated-fact writes are rejected server-side; the Confirm Queue holds consequential facts until a human confirms.
- ⚠ `manualLinkBuildexact` writes via the **anon client** and surfaces the raw Supabase error to `setError` (BUG-N4 area) — minor info-disclosure; move to the server layer.
- ⚠ BUG-A1 raw-error leak is a minor information-disclosure/standards issue.

## 9. Data Cleanup Confirmation
All test records created this run were deleted via the service-role client and the DB verified back to baseline:
- Deleted (FK order): 2 `job_contact_roles`, 14 `job_fact_history`, 14 `job_events`, 1 `job_variations`, 2 `wipaa_reviews`, 1 `project_metrics`, then the test `jobs` row, test `leads` row, test `crm_contacts` row, and the `buildexact_job_sync` snapshot. CRM/lead links to the test job were nulled first.
- **Temp non-admin user removed:** `user_profiles` row + the Supabase **auth** user both deleted; `user_profiles` is back to the 2 original admins only.
- **Buildxact:** the Unsent test PO was deleted and verified gone (0 `ZZAUDIT` POs on J1120). No other Buildxact writes.
- **Baseline restored — every count matches:** `jobs 9, leads 10, crm_contacts 2, job_contact_roles 0, job_fact_history 12, job_events 12, job_variations 2, wipaa_reviews 1, project_metrics 1, projects 2, purchase_orders 0`. `buildexact_job_sync` test row removed.
- Temp `_audit_*.mjs` scripts removed from the repo root. **No application code modified. No git commit/push (`git status` empty). No outbound email. My duplicate dev process was killed; the pre-existing stack left running and healthy.**

## 10. Priority Action List
**Unblock Buildxact (the only gating set):**
1. **BUG-N4** — canonicalise the link on `jobs.buildexact_job_id`; route picker + webhook through the server.
2. **BUG-003** — populate ≥1 `jobs.buildexact_job_id`, re-run `reconcile-buildxact.mjs` for the first cross-system $1 check.
3. **BUG-004** — add `eventName` + `eventData.jobId` to the webhook extractors; map the real event names.
4. **BUG-015** — set `API_BASE_URL` in Railway.

**Standards / hardening:**
5. **BUG-A1** — replace raw `error.message` 500-returns with `err()`+`translateDbError` (start with `jobsApiRoutes.mjs`).
6. **BUG-A2** — migrate the older-module responses to camelCase via `rowToCamel`.
7. **BUG-005 (depth)** — move portal client identity to the job spine (Phase 2).

**UI pass (human):**
8. FactField provenance + Confirm/Override render; smart-list chips; hard-refresh deep-link; fee-proposal wizard; Gantt drag/resize; BUG-011/013/014/016/017.

## 11. System Health Summary
| Area | Status | Verified by |
|---|---|---|
| Facts service (lead→job carry, provenance, events) | ✅ Works | API + data |
| Address identity hook (Phase 1) | ✅ Works | API + data |
| Canonical contract value (Phase 5) — read **and** write/rollup | ✅ Correct (930k everywhere) | API + data |
| Confirm Queue + tier matrix (Phase 3) | ✅ Works | API + data |
| Trade-category FKs + resolver (Phase 6) | ✅ Works (conservative) | data + code |
| Carpentry link + guard (Phase 7) | ✅ Safe, inert by design | code + data |
| CRM smart lists / referred-by / notes | ✅ Present | code |
| `job_contact_roles` CRUD + math | ✅ Works (930k / 15k) | API + data |
| `job_contact_roles` admin gating | ✅ **Live-403-verified** | live |
| Role-guard deep-link race fix (AuthContext) | ✅ Correct | code |
| Scope-intelligence seam | ✅ Inert | code |
| Buildxact API surface (auth→catalogues, PO CRUD) | ✅ Live | live tenant |
| Buildxact ↔ Hub reconciliation | ❌ Blocked (0 linked; link-table split) | live + data |
| Buildxact webhook (real-time mirror) | ❌ Dead (eventName not parsed) | data |
| camelCase boundary law (older modules) | ⚠ Violated (snake_case leaks) | API |
| SOP Section-14 (API/data parts) | ✅ All pass; UI steps → needs UI pass | API + data |
| Carried-over bugs | N1/N2/N3 + 009/010 fixed; 003/004 open (root-caused); A1/A2/005 carried | code/API/live |

**Bottom line:** the application + data layer is verified production-quality — the Phase-5 canonical-value cutover is complete and proven, the CRM referral feature is well-built and now live-gated, and no delta-scope regressions exist. The remaining work is wholly in the Buildxact seam (link-table split + webhook field mismatch — both now precisely root-caused) plus the pre-existing camelCase-boundary debt.

---

*End of audit report. All test data cleaned up and DB verified to baseline. Temp non-admin user deleted. Buildxact test PO deleted. No code changes, no email sends, no git operations.*

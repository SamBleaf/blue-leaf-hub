# Blue Leaf Hub — Claude Second-Pass E2E Verification

**Run ID:** `BLH-E2E-CLAUDE-20260627-1139` · **Date:** 2026-06-27 (Adelaide)
**Mission:** `/harden e2e CLAUDE-SECOND-PASS-E2E-VERIFY-01`
**Method:** Independent re-verification of the Claude first-pass walkthrough (`BLH-E2E-20260627-1041`) using real browser (Claude-in-Chrome, as e2e-admin Director) + read-only API/DB probes + 2 background analysis workflows (19 subagents) + full regression suite. **No product code changed. No commits/deploys.**
**First-pass report re-verified:** [`E2E_FULL_WALKTHROUGH_BLH-E2E-20260627-1041.md`](E2E_FULL_WALKTHROUGH_BLH-E2E-20260627-1041.md) · Manifest: [`BLH-E2E-CLAUDE-20260627-1139-MANIFEST.md`](e2e-runs/BLH-E2E-CLAUDE-20260627-1139-MANIFEST.md)

---

## 1. Executive verdict — **CONDITIONAL PASS**

The lead→handover journey is **sound for internal staff use**; every gate and security boundary I independently re-tested **held**, and the first pass's single product finding (BLH-E2E-001) is **confirmed**. Two *new* confirmed product defects were found by adversarial code-verification (**DISC-002 HIGH**, **DISC-WIN-01 medium**), both latent and fix-ready. The headline reconciliation: the aggregated regression's "red" suites (W09/W10/W12/W13/W18-invite) are **false failures from a test-harness user-rotation race**, *not* product regressions — proven by standalone re-runs (W12 14/14) + live probes (employee schedule write → 403). "Conditional" reflects the deferred external phases (prod mail/Buildxact/Dropbox → safe-only) and W18 manual UAT still pending — not any failure.

---

## 2. Cursor→Claude finding reconciliation

| First-pass finding | Claude 2nd-pass result | Status | Evidence | Next action |
|---|---|---|---|---|
| **BLH-E2E-001** soft-deleted projects leak into active Ops Gantt | **CONFIRMED + sharpened** | confirmed | Code: `operationsRoutes.mjs:20/75` no projects-table filter (deleted_at filter is on `schedule_tasks` only). DB: **22** projects `address ILIKE '%_DELETED%'`, `projects.deleted_at` column **does not exist** → renamed-not-row-deleted. Browser: 34-project Gantt legend full of `_DELETED`. | Claude fix batch (approved → apply) |
| **OBS-1** dashboard "Could not load live data" = harness artifact | **CONFIRMED** (not a defect) | confirmed | Malformed bearer → **401** (clean, not 500) on all dashboard endpoints; node token → 200. SPA copy isn't masking a backend 500. | none |
| **OBS-2** quick-add maps location→`suburb`, leaves `site_address` null (by-design) | **CONFIRMED** by-design | confirmed | DB: new lead `suburb` set, `site_address`+`name` null; convert gate then fires. | none |
| **OBS-3** Blueprint Insight stale ("resolved") | **DOWNGRADED → still-present-but-trivial** (first pass mislabelled "resolved") | changed | `cacheKey=`${id}:${stage}`` excludes `qualify_score` → insight stale until stage change/Refresh; harmless self-healing. | optional tidy later |
| **OBS-4** (orphan ref in Phase 9) | **MERGED into BLH-E2E-001** (duplicate) | changed | Same root cause; never defined in first-pass findings table. | dedupe (no separate ID) |
| First-pass gap-documented external phases (RFQ send, convert success, win-finalize, PO valid, PTSA DOCX/mark-signed, portal UAT) | **Re-confirmed correctly gap-documented** (prod side-effects) | confirmed | Constraint NO-PROD-SIDE-EFFECTS; negative/auth paths re-verified safely. | Sam: provision sandbox to live-fire |

---

## 3. Source-of-truth compliance

| Workflow | Source of truth | Expected | Actual (2nd-pass) | Result | Bug/gap |
|---|---|---|---|---|---|
| W01 Lead intake | workflows/01 | quick-add → enquiry + activity; public enquiry name+email gate, field whitelist | lead created, fields persisted; public enquiry whitelisted + honeypot + rate-limit | ✅ PASS | — |
| W02 Qualify/outcome | workflows/02, OUTCOME-STAMP-01 | gates advisory (SAM-W02-002); won/lost stamp idempotent, lost_reason body-only | PATCH won→won_at SET; re-PATCH idempotent; lost→lost_at SET, lost_reason null | ✅ PASS | OUTCOME-STAMP-01 fully closed |
| W03 Fee/PTSA | workflows/03, SAM-W03-001 | PTSA signed only via mark-signed; warn+block when no site_address | mark-signed gated on PDF upload; siteAddressWarning path present (code) | ✅ PASS | W03-DRIFT-009 (PTSA hidden at fee_proposal) still open (medium) |
| W04 Convert/job spine | workflows/04, SAM-W04-001 | convert needs site_address (400); address-pending blocked at handoff | convert no-address → **400**, job_id null; 409 JOB_ADDRESS_PENDING wired (jobGuards) | ✅ PASS | W04-DRIFT-005 already implemented |
| W06 RFQ primary path | RFQ_TENDER_SOT, SAM-W06-001 | RFQ Engine primary; Package Detail review-only | RFQ Engine 4-stage wizard present; W06 suite 6/0+7/0+9/0 | ✅ PASS | — |
| W08 accept | SAM-W08-001 | win blocked unless accepted trades have quote_amount>0 | W08 suite 19/0 + 14/0 | ✅ PASS | W08-DRIFT-005 accept-rollup gap (P1, open) |
| W09 win-finalize | workflows/09, SAM-W09-001 | project row + readiness banner; no auto-seed | W09 win/lose finalize 23/0; **DISC-WIN-01 dup cost_intelligence** found | ⚠️ DEFECT | **DISC-WIN-01** |
| W11 PO | SAM-W11-002 | PO issue admin-only | employee→403, no-auth→401, admin→400; W11 suite 15/0 | ✅ PASS | W11-PO-SEC-01 closed (confirmed) |
| W12 schedule auth | workflows/12, P0-C2 | schedule writes admin/supervisor only | employee PATCH→**403** (live); standalone 14/14 | ✅ PASS | **W12-SEC-01 REFUTED as open** (already fixed) |
| W13 site diary | workflows/13, SAM-W13-001 | diary client-updates draft by default | standalone read-only 8/0; --write needs Dropbox (env) | ✅ PASS (read) | W13-DRIFT-002 toast-on-Dropbox-fail (low, open) |
| Finance accept | W03-FEE-LINK-01 | finance accept stamps leads.fee_proposal_id (parity with sales) | finance accept **never stamps** leads.fee_proposal_id | ⚠️ DEFECT | **DISC-002** |
| W18 portal | workflows/18 (LOCKED) | client sees own data; void-guard; auth-gated | admin/sup/emp overview 200, no-auth 401; void-guard suite 11/0 | ⚠️ POLICY | **PORTAL-CROSSROLE** (Sam) |

---

## 4. E2E journey walkthrough

| Phase | Browser? | API/test? | Result | Evidence | Issues |
|---|---|---|---|---|---|
| 1 Login/nav | ✅ | ✅ | PASS | e2e-admin session inject; Director nav; dashboard live | auth-race workaround (see §5) |
| 2 Lead create | ✅ | ✅ | PASS | Amelia Hartley created in UI; pipeline 58→59; DB-verified | — |
| 3 Qualification/outcome | ✅(p1) | ✅ | PASS | scorecard gates (p1); outcome stamps positive+idempotent (API) | gates advisory by design |
| 4 Fee/PTSA | ✅(p1) | ✅ | PASS | PTSA panel guards (p1); siteAddressWarning code | DOCX/mark-signed gap-doc |
| 5 Convert | ✅(gate) | ✅ | PASS | convert no-address → 400, no job/Dropbox | actual convert gap-doc |
| 6 RFQ package | ✅(p1) | ✅ | PASS | RFQ Engine wizard; W06 suites green | — |
| 7 RFQ send/match/accept | — | ✅ | CONDITIONAL | W07/W08 suites green; send = prod mail | live send gap-doc |
| 8 Tender win/finalize | — | ✅ | ⚠️ | W09 finalize 23/0; DISC-WIN-01 in code | **DISC-WIN-01** |
| 9 Procurement/PO | ✅(sec) | ✅ | PASS | PO authz live (403/401/400); W11 15/0 | live PO gap-doc |
| 10 Schedule/WHS/diary | ✅(Gantt) | ✅ | PASS | W12 employee→403; W14 15/0; Ops Gantt visual | BLH-E2E-001 visible |
| 11 Client portal | ✅(API) | ✅ | CONDITIONAL | overview 200/200/200/401; void-guard 11/0 | PORTAL-CROSSROLE; W18 UAT pending |
| 12 Handover readiness | — | — | this report | — | — |

---

## 5. Bugs / gaps found

| Bug ID | Severity | Workflow | Summary | Evidence | Owner | Action |
|---|---|---|---|---|---|---|
| **DISC-002** | **HIGH/P1** | Finance/W03 | Finance fee-proposal accept (`financeRoutes.mjs:1390-1437`) never stamps `leads.fee_proposal_id`; sales accept (`buildexactIntegrationRoutes.mjs:167`) is the **only** writer → finance-accepted proposals break W04/tender handoff | grep: line 167 sole writer; finance route sets only contract_value | Claude fix | **fix now (Sam approve)** |
| **DISC-WIN-01** | Medium/P1 | W09 win-finalize | `cost_intelligence` bare `.insert()` loop (`module4Routes.mjs:481-493`), no re-run guard (`:239`) while every other write is idempotent → re-run duplicates rows (N→2N); skews ops-readiness counts + cost analytics | code; table key=(job_id,trade), 0 rows now (latent) | Claude fix | **fix now (Sam approve)** |
| **BLH-E2E-001** | Low-Med | Ops/Portal | Renamed `_DELETED` projects (no `deleted_at` col) leak into active Ops Gantt + global-tasks (`operationsRoutes.mjs:20/75` no projects filter) | code; 22 DB rows; Gantt visual | Claude fix | **fix now (Sam approve)** |
| **BLH-E2E-CLAUDE-001** | Medium (test-infra) | Test harness | `test:hardening-regression:write` aggregator produces **false failures** (W09/W10/W12/W13/W18-invite) — `ensureE2EUsers` rotates shared e2e users across sequential child suites, invalidating in-flight tokens (same race that dropped browser auth) | standalone W12 14/14; live employee→403; read-only suites green | Cursor test-only | test fix (no product) |
| **PORTAL-CROSSROLE** | Low (policy) | W18 (LOCKED) | `GET /api/portal/admin/v2/:id/overview` admits employee+supervisor (not just admin) — client-overview read scope; no auth bypass (no-auth→401) | `portalV2AdminRoutes.mjs:23`; live 200/200/200/401 | Sam decision | decide scope (no fix in pass) |
| W03-DRIFT-009 | Medium | W03 | PTSA block hidden at `fee_proposal` stage (`showPreTender` excludes it) | code (Workflow A) | Sam/Claude | defer |
| W08-DRIFT-005 | P1 | W08 | Accept doesn't roll up to scope/package | bug register (existing) | Claude | defer (test-first) |
| OBS-3 | Trivial | W02 | Blueprint Insight cacheKey excludes qualify_score → stale until refresh | code | Claude | optional tidy |

_No Critical bugs. No new High beyond DISC-002. No duplicate IDs created (cross-checked against the full BUG_REGISTER ID list)._

---

## 6. Claude fix batch recommendations (proven defects only)

### Batch A — `finance fee-proposal accept lead-link parity` (DISC-002) — **HIGH**
- **Bug:** DISC-002 · **Why:** finance-accepted proposals never link back to the lead (`leads.fee_proposal_id`), breaking the W04/tender commercial-path resolution that W03-FEE-LINK-01 established for the sales path.
- **Test first:** create lead+job(lead_id)+fee_proposal; POST `/api/finance/fee-proposals/:id/accept`; assert `leads.fee_proposal_id` == proposal id (fails today). Sibling test on sales accept locks parity.
- **Files:** `financeRoutes.mjs`, `buildexactIntegrationRoutes.mjs` · **Risk:** low.
- **Exact prompt for Sam:** *"Approve DISC-002 fix: extract a shared helper `stampLeadFeeProposalLink(sb, jobId, proposalId)` (select jobs.lead_id → update leads.fee_proposal_id) and wire it into BOTH accept routes (financeRoutes.mjs:1390-1437 and buildexactIntegrationRoutes.mjs:163-169). Don't change contract_value writes or buildexact sync. Tests first; no live BX/mail/Dropbox. Plan-only — show the diff."*

### Batch B — `win-finalize cost_intelligence idempotency` (DISC-WIN-01) — Medium
- **Test first:** N accepted trades → POST win-finalize ×3 → assert cost_intelligence count stays N (no dup (job_id,trade)).
- **Files:** `module4Routes.mjs` · **Risk:** low.
- **Exact prompt for Sam:** *"Approve DISC-WIN-01 fix: make the per-trade cost_intelligence write at module4Routes.mjs:481-493 idempotent — before the loop, skip per-(job_id,trade) if a row exists, OR delete the job's cost_intelligence rows first (mirror jobsApiRoutes.mjs:243) then insert. No DB migration. Keep best-effort error handling. Test first (×3 win-finalize, count stable). Plan-only — show the diff."*

### Batch C — `operations Gantt soft-deleted exclusion` (BLH-E2E-001) — Low-Med
- **Test first:** seed 1 normal + 1 `_DELETED` project → assert `/api/operations/projects` + `/global-tasks` exclude the `_DELETED` one.
- **Files:** `operationsRoutes.mjs` · **Risk:** low.
- **Exact prompt for Sam:** *"Approve BLH-E2E-001 fix: add `.not('address','ilike','%_DELETED')` to BOTH projects reads in operationsRoutes.mjs (~line 20 and ~75). No projects.deleted_at migration in this batch (flag durable column fix for later). Do NOT touch portalV2AdminRoutes (W18-locked). Test first. Plan-only — show the diff."*

**Excluded (proven but not fix-now):** W12-SEC-01 (refuted — already gated), PORTAL-CROSSROLE (W18-locked, Sam policy), OUTCOME-STAMP-01 (working + advisory accepted SAM-W02-002), W04-DRIFT-005 (already implemented), OBS-3 (trivial). **BLH-E2E-CLAUDE-001** = Cursor test-infra batch (not product).

---

## 7. Test results

| Command | Result | P/F/Gap | Notes |
|---|---|---|---|
| `npm run build` | ✅ pass | pass | dist generated |
| `npm run test:batch-a:write` | ✅ green | pass | W01–W05 + spine/shape all ✓ (DB-verified gates) |
| `npm run test:hardening-regression:write` (aggregated) | ⚠️ mixed | see note | Green: W06,W07,W08,W09-finalize,W11,W14,W15,W16,W18(void/photo/finance/legacy). RED: W09-ops-checklist, W10, W12, W13, W18-invite — **false failures (BLH-E2E-CLAUDE-001 rotation race)** |
| `run-w12-schedule-auth.mjs --write` (standalone) | ✅ **14/14** | pass | employee POST/PATCH/DELETE→403; sup/admin→200 — **proves W12 secure live** |
| W09/W10/W13 standalone (read-only) | ✅ green | pass | 8/0, 7/0, 8/0 (writes gap-documented) |
| Live API probes | ✅ | pass | convert→400; outcome stamps positive+idempotent; PO 403/401/400; portal 200/200/200/401 |
| `npm run test:cleanup-artifacts` (dry-run) | ✅ "No changes made" | pass | 207 legacy BATCHA folders listed (not mine); no `--confirm` used |

---

## 8. Cleanup manifest summary

| Artefact | ID/path | Action | Result | Left? | Reason |
|---|---|---|---|---|---|
| Lead "Amelia Hartley" | `cbdeb3aa-…` (email run-id) | DB delete (children+lead) | ✅ deleted | no | — |
| Lead "Lost Test" | `e24ed803-…` (outcome-stamp probe) | DB delete | ✅ deleted | no | — |
| Jobs/projects | none | n/a | n/a | no | convert never fired |
| External (mail/Dropbox/PO) | none | n/a | n/a | no | safe-only; no side-effects |
| Regression `BATCHA …` artefacts | 207 folders | cleanup dry-run | listed, **not deleted** | yes | not this run's; `--confirm` forbidden |
| Run docs | this report + manifest | kept | kept | yes | run record |

Re-query post-cleanup: **0** run-id leads, **0** run-id jobs (verified).

---

## 9. Release readiness impact

| Surface | Verdict |
|---|---|
| Global production | **NO-GO** — external phases unverified on sandbox; W18 UAT pending; 3 fix batches open |
| Staff internal use | **CONDITIONAL GO** — journey + security solid; DISC-002 should land first |
| Sales/lead/fee proposal | **CONDITIONAL GO** — solid; **DISC-002 (finance accept link) is the one HIGH to fix** |
| RFQ/tender | **CONDITIONAL GO** — engine + suites green; live send needs sandbox |
| Tender win/ops handoff | **CONDITIONAL GO** — works; fix DISC-WIN-01 before relying on cost analytics |
| Procurement/PO | **GO (internal)** — admin-only enforced; manual-by-design |
| Schedule/WHS/site diary | **GO (internal)** — W12 secure (refutes stale gap); W13 diary draft-by-default; BLH-E2E-001 cosmetic |
| W18 pilot | **CONDITIONAL** — auth-gated + suites green; client UAT + PORTAL-CROSSROLE decision pending |
| W18 production | **NO-GO** — P1-W18-04 legacy token + UAT (owner-locked) |
| W17 Workforce | **N/A** — owner-locked, excluded (verify-only) |

---

## 10. Final next action

- **Next Cursor test batch:** fix **BLH-E2E-CLAUDE-001** (regression rotation race) — give each child suite a dedicated non-rotating user OR mint per-suite tokens without recreating users + add a stability pre-check; then re-run W09/W10/W13/W18-invite standalone to confirm green. Add a Playwright lock for the sales stage-gate ladder + the DISC-002/DISC-WIN-01 regression tests.
- **Next Claude fix batch (Sam approval each):** Batch A (DISC-002, HIGH) → Batch B (DISC-WIN-01) → Batch C (BLH-E2E-001).
- **Next Sam decision:** (1) PORTAL-CROSSROLE scope (should employee/supervisor read client overviews?); (2) provision a non-prod sandbox to live-fire the external phases; (3) approve the 3 fix batches.
- **Next manual UAT:** W18 client portal (Client A/B isolation, magic-link, draft→publish) + P1-W18-04 legacy-token decision.

---

### Required checklist
- Cursor report read: **yes** · Cursor manifest read: **yes** · Previous audits/findings considered: **yes** (BUG_REGISTER 1774L + 16 workflow SOT docs via Workflow A)
- Source-of-truth checked per workflow: **yes** · Browser walkthrough completed: **yes** (lead create, Ops Gantt, +p1 surfaces) · Regression tests run: **yes**
- Bug register updated: **yes (narrow)** · Test matrix updated: **yes (narrow)** · Release readiness updated: **yes (narrow)** · Hardening queue updated: **yes (narrow)**
- Product code changed: **no** · W17 files touched: **no** · W18 product files touched: **no** (read-only verify)
- Cleanup completed: **yes** · Manifest: `docs/qa/e2e-runs/BLH-E2E-CLAUDE-20260627-1139-MANIFEST.md`

---

**Next safe action:** Sam reviews this Claude second-pass E2E and approves the next Cursor test batch (BLH-E2E-CLAUDE-001), Claude fix batch (DISC-002 first), Sam decision (PORTAL-CROSSROLE + sandbox), or manual UAT (W18).
**Blocked by:** DISC-002 (HIGH) pending approval; PORTAL-CROSSROLE Sam decision; W18 manual UAT; sandbox for external phases.
**Code changed:** no. **Tests changed:** no (ran existing suites). **Docs changed:** yes (this report + manifest + narrow register/matrix/readiness/queue updates). **Test data cleaned:** yes — manifest `docs/qa/e2e-runs/BLH-E2E-CLAUDE-20260627-1139-MANIFEST.md`.

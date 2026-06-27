# 30-Day Hardening Tracker

**Purpose:** Planning and control only — track mapping, tests, fixes, and release readiness across the 30-day hardening sprint. **Not permission to write product code.**

**Related:** [30-day_hardening_roadmap_062892c6.plan.md](../../30-day_hardening_roadmap_062892c6.plan.md), [WORKFLOW_MAP_MASTER.md](./WORKFLOW_MAP_MASTER.md), [RELEASE_READINESS.md](./RELEASE_READINESS.md) (when created), [SAM_DECISION_LOG.md](./SAM_DECISION_LOG.md)

---

## Sprint principle

No new modules. No UI redesign. No broad refactors. **Map workflow → plan tests → smallest-safe fixes → regression tests.**

---

## Lanes

### Lane 1 — Workflow Mapping

Workflow-by-workflow source-of-truth mapping under `docs/qa/workflows/`.

### Lane 2 — Test Planning

Convert drift risks into API / E2E / security / regression tests in [WORKFLOW_TEST_MATRIX.md](./WORKFLOW_TEST_MATRIX.md).

### Lane 3 — Smallest-Safe Fixes

Only after workflow map and tests are defined. Sam approves P0 first.

### Lane 4 — Release Readiness

Track what is stable enough, blocked, or still risky per workflow and batch.

---

## 30-day execution rhythm

Unless Sam changes direction:

| Days | Focus | Code? |
|------|-------|-------|
| **1–5** | Batch A mapping W01–W05 | **No** product code |
| **6–8** | Batch A review; approve P0 fixes only; W01–W05 API/E2E test skeletons | Test files only if approved |
| **9–14** | Batch B RFQ/tender mapping; RFQ email matching baseline tests; prioritise W06–W07 | No fixes until Batch B reviewed |
| **15–20** | RFQ/tender P0 fixes (package `sent_message_id`, inbound rollup, unmatched resolve, Board/package drift tests) | P0 fixes only |
| **21–25** | Procurement handoff, schedule readiness, finance/portal smoke tests | P1 as approved |
| **26–30** | Regression run, security route sweep, release readiness report, bug register cleanup | Fixes + docs |

**Note:** Pre-tracker RFQ work (Phases 2–5, 2026-06-22) — DRIFT-001/002/003/009/012 addressed in code. **Do not treat RFQ as fully hardened** until matching, idempotency, unmatched queue, and cross-screen tests are verified.

**Known open RFQ risks (Batch B):** DRIFT-004 email-only recipients (SAM-W07-002 manual-resolve — doc closure pending) · ~~DRIFT-010 ambiguous sender/address~~ **fixed 2026-06-25** · DRIFT-011 first IMAP poll backlog (ops doc) · DRIFT-013 manual resolve PDF re-parse · DRIFT-014 TenderDetail accept `quote_amount` vs `quoted_amount` · poll idempotency · failed parse/extraction paths · TenderBoard vs package drift (SAM-W05-001).

---

## Current phase

**Batch B — P0-B1 shipped** · **Batch A — green** — see [BATCH_A_HARDENING_RESULT.md](./BATCH_A_HARDENING_RESULT.md) · [BATCH_B_REVIEW_PACK.md](./BATCH_B_REVIEW_PACK.md)

**Batch C rule:** P0-C1–C5 closed — Batch C P0 complete.

**Latest regression:** `test:w14-whs-baseline:write` · `test:w10-procurement-baseline:write` · batch-a green

**Cross-cutting security:** QA-001 **Tier-0 CLOSED** 2026-06-22. **QA-001-GAP-10 / W18-P0-04 CLOSED** 2026-06-22 — `requireRole("admin")` on `POST /api/portal/admin/generate-token`; `test:qa-sec-baseline` 23/23.

**Manual UAT:** [W18_CLIENT_PORTAL_UAT_SMOKE_CHECKLIST.md](./W18_CLIENT_PORTAL_UAT_SMOKE_CHECKLIST.md) · **Execution pack:** [W18_CLIENT_PORTAL_UAT_EXECUTION_PACK.md](./W18_CLIENT_PORTAL_UAT_EXECUTION_PACK.md)

**Cross-workflow audit (2026-06-26):** [CROSS_WORKFLOW_AUDIT_ACCELERATION_PACK.md](./CROSS_WORKFLOW_AUDIT_ACCELERATION_PACK.md) · **Work-ahead queue:** [HARDENING_WORK_AHEAD_QUEUE.md](./HARDENING_WORK_AHEAD_QUEUE.md) · **Bug mission:** [BUG_FIXING_MISSION_PLAN.md](./BUG_FIXING_MISSION_PLAN.md)

**Active owner:** **Paused** — Sam approves next batch. **Forward scout:** Cursor (TEST-DISCOVERY-WAVE-01).

**Current phase:** **TEST-DISCOVERY-WAVE-01** — audit-first; **implementation paused** unless Critical or Sam-approved fix batch. See [TEST_DISCOVERY_WAVE_01.md](./TEST_DISCOVERY_WAVE_01.md).

**Open High (actionable):** **0**. **P1 / decision-gated (formerly High):** W02-DRIFT-006 (advisory), W05-STRUCTURAL-001 (design parked). **Open Critical:** **0**.

**JOB-SPINE-01 (2026-06-27):** **CLOSED — accepted** — W04-DRIFT-001 + W06-DRIFT-001; `test:w04-w06-job-spine:write` 6/6. P1 follow-up: **P1-JOBS-API-001** (Dropbox PATCH allowlist — do not reopen JOB-SPINE-01).

**OUTCOME-STAMP-01 (2026-06-27):** **shipped** — W02-DRIFT-001; `test:w02-qualification:write` 8 pass + 1 gap — **pending Sam acceptance closure**.

**W11-PO-SEC-01 (2026-06-27):** **CLOSED — accepted** — W11-DRIFT-003; `requireRole("admin")` on `POST /api/po/issue`; `test:w11-batch-po:write` 15 pass + 1 gap (watermark manual only — do not reopen).

**DRIFT-004-DOC-01 (2026-06-27):** **CLOSED as accepted gap** — DRIFT-004 + W06-DRIFT-004; SAM-W07-002 Option C (manual-resolve only). No code change. High count 8→5.

**PTSA-WARNING-01 (2026-06-27):** **shipped** — W03-DRIFT-002; `siteAddressWarning` flag on server + LeadDetail orange banner + tender block; W03-API-07 passing; batch-a 28/28 — **pending Sam acceptance closure**.

**W01-CONVERT-01 (2026-06-27):** **CLOSED — accepted** — W01-DRIFT-005; W01-API-08 pass; LeadDetail `site_address` gate.

**W03-FEE-LINK-01 (2026-06-27):** **CLOSED — accepted** — W03-DRIFT-008; W03-API-05b pass; batch-a 32/32.

**TEST-DISCOVERY-WAVE-01 (2026-06-27):** Audit complete — [TEST_DISCOVERY_WAVE_01.md](./TEST_DISCOVERY_WAVE_01.md). Forward scout rolling view: [HARDENING_TEST_COVERAGE_FORWARD_SCOUT.md](./HARDENING_TEST_COVERAGE_FORWARD_SCOUT.md). `test:batch-a:write` **32 pass / 0 fail / 4 gap**. Implementation **paused**.

**TEST-JOURNEY-B-01 (2026-06-27):** **done (test-only)** — W07-API-01, RFQ-04, W08-API-01, JOURNEY-B chain; `test:journey-b-01:write` **22 pass / 0 fail / 3 gap**.

**TEST-WIN-FINALIZE-01 (2026-06-27):** **done (test-only)** — W05/W09/RFQ-16; `test:win-finalize-01:write` **32 pass / 0 fail / 5 gap**.

**SAM-W06-001 (2026-06-27):** **decided** — Option A: RFQ Engine primary; Package Detail review/control only; no path unification during hardening.

**TEST-REGRESSION-SUITE-01 (2026-06-27):** **done** — 21 suite pass / 1 fail / 2 gap on first run; **W18-VOID-GUARD-PROBE-01** closed DISC-REG-01 as E2E fixture drift (not product bug).

**PLAYWRIGHT-SALES-GATE-LADDER-01 (2026-06-27):** **done (test-only)** — `test:pw-sales-gate-ladder` **1 pass**; see [PLAYWRIGHT_SALES_GATE_LADDER_01.md](./PLAYWRIGHT_SALES_GATE_LADDER_01.md).

**BLH-E2E-CLAUDE-001 (2026-06-27):** **done (test-only)** — stable E2E passwords; aggregator W10/W12/W13/W18 green; see [BLH_E2E_CLAUDE_001_REGRESSION_ROTATION_FIX.md](./BLH_E2E_CLAUDE_001_REGRESSION_ROTATION_FIX.md).

**E2E walkthrough ingested (2026-06-27):** [E2E_FULL_WALKTHROUGH_BLH-E2E-20260627-1041.md](./E2E_FULL_WALKTHROUGH_BLH-E2E-20260627-1041.md) — **Conditional Pass**; W18 manual UAT pending; **BLH-E2E-001** queued for Claude (not Cursor).

**DISC-002 (2026-06-27):** **accepted closed (Sam)** — DISC-002-FINANCE-FEE-LINK-01 shipped; W03-API-05c green; batch-a 37/0.

**W18-UAT-EXEC-01 (2026-06-27):** **CONDITIONAL PASS** — [W18_UAT_EXEC_RESULT_20260627.md](./W18_UAT_EXEC_RESULT_20260627.md).

**W18-STAFF-BROWSER-PILOT-01 (2026-06-27):** **CONDITIONAL PASS (Sam accepted)** — [W18_STAFF_BROWSER_PILOT_RESULT_20260627.md](./W18_STAFF_BROWSER_PILOT_RESULT_20260627.md).

**W18-SUPERVISED-CLIENT-PILOT-01:** **APPROVED WITH CONTROLS — WAITING FOR VIABLE REAL JOB (Sam 2026-06-27).** Do not execute yet. Candidate: first signed building contract, subject to Sam final approval and client consent. Pack: [W18_SUPERVISED_CLIENT_PILOT_EXECUTION_PACK.md](./W18_SUPERVISED_CLIENT_PILOT_EXECUTION_PACK.md).

**Next (while W18 on hold):** Sam-approved fix batches only — DISC-WIN-01, BLH-E2E-001; external sandbox planning (SANDBOX-01). **Not next:** W18 client invite, demo/`__E2E_` substitute pilot, W18 product fixes without named batch.

---

## Test artifact cleanup (2026-06-25)

| Item | Status |
|------|--------|
| Policy doc | `docs/qa/TEST_ARTIFACT_CLEANUP_POLICY.md` |
| Dropbox cleanup utility | `scripts/cleanup-test-artifacts.mjs` — dry-run default; safe vs legacy tiers |
| Matcher unit test | `npm run test:cleanup-matchers` |
| Prefix registry | `scripts/lib/testArtifactPrefixes.mjs` — `classifyTestArtifactName()` |
| npm script | `npm run test:cleanup-artifacts` |
| Supabase cleanup (existing) | `scripts/cleanup-test-data.mjs` — no Dropbox |

**Approved prefix (new write tests):** **`BLH TEST`** via `buildTestJobAddress()` — see [TEST_ARTIFACT_CLEANUP_POLICY.md](./TEST_ARTIFACT_CLEANUP_POLICY.md).

**Gap:** Older batch-a suites still use legacy `MARK` (`__BATCH_A__` → Dropbox `BATCHA …`); legacy review-only cleanup tier only. W11/W12 migrated to `BLH TEST`. Remaining MARK migration is a separate approved pass. DB cleanup script does not yet include `BLH TEST` / legacy patterns.

---

## Progress table (Batch C)

| Workflow | Map Status | Tests Planned | Tests Written | Fixes Approved | Fixes Done |
|----------|------------|---------------|---------------|----------------|------------|
| W10 Procurement | **mapped** | **planned** | **W10-API-01–06 pass** | P0-C4 | **yes** |
| W11 PO / Commitments | **mapped** | **planned** | **W11-API-01–07 pass/partial** | P0-C1 + PO refine | **yes** |
| W12 Scheduling / EOT | **mapped** | **planned** | **W12-SEC-01/02 + W12-API-01/02 pass** | P0-C2 | **yes** |
| W13 Site Diary / Media | **mapped** | **planned** | **W13-API-01–03 + SEC-01/02 + STORAGE-01 pass (24)** | P0-D1 | **yes** |
| W14 WHS | **mapped** | **planned** | **W14-API-01–03 + SEC-01–03 + API-05 pass (15)** | P0-C5 | **yes** |
| W15 Workforce / BX WO | **mapped** | **planned** | **W15-SEC-01–04 + W15-API-01–04 pass** | P0-C3 | **yes** |

**Latest regression:** `test:w11-batch-po:write` (W11-API-01–07 + W09-API-06) · `test:w09-ops-readiness:write` (13 pass) · batch-a E2E (5 pass)

**Run skeletons:** `npm run test:w11-batch-po:write` · `npm run test:batch-a` · `npm run test:batch-a:write` · `npm run test:w09-ops-readiness:write` · `npm run test:w08-win-quote:write` · `npm run test:w08-accept:write` · `npm run test:e2e -- e2e/tests/workflows/batch-a`

---

## Progress table

| Workflow | Map Status | Tests Planned | Tests Written | Fixes Approved | Fixes Done | Stable Enough | Notes |
|----------|------------|---------------|---------------|----------------|------------|---------------|-------|
| W01 Lead / CRM Intake | **mapped** | **planned** | **verified** | P0-A1/A2 done | **yes** | no | Regression 2026-06-25: API+E2E pass |
| W02 Qualification / Discovery | **mapped** | **planned** | **skeleton** | P0 approved | no | no | SAM-W02-002 decided |
| W03 Fee Proposal / PTSA | **mapped** | **planned** | **skeleton** | P0 approved | no | no | SAM-W03-001 decided |
| W04 Estimate / Buildxact / Job Setup | **mapped** | **planned** | **verified** | P0-A3/A4 done | **yes** | no | Regression 2026-06-25: write pass |
| W05 Tender Board / Lifecycle | **mapped** | **planned** | **verified** | P0-A5/A6 done | P0-A6 patch | no | Regression 2026-06-25: API/write + E2E pass |
| W06 RFQ Package / Scope | **mapped** | **planned** | **partial** (W06-UI-02 + W06-API-07 pass) | P0-B1 approved | **P0-B1 done** | no | W06-DRIFT-006 fixed 2026-06-25 |
| W07 RFQ Send / Quote Matching | **mapped** | **planned** | **partial** (matcher 24 pass) | P0-B3 approved | **P0-B3 done** | no | P0-B3 matcher 2026-06-25 |
| W08 Quote Comparison / Accept | **mapped** | **planned** | **partial** (W08-API-02/05 pass; W08-API-03 pass; alignment warn) | P0-B4 approved | **P0-B4 done** | no | P0-B4 win-quote warn 2026-06-25 |
| W09 Tender Win / Handoff | **mapped** | **planned** | **partial** (W09-API-02/04/06/07/08 pass) | P0-B5 approved | **P0-B5 done** | no | ops readiness checklist 2026-06-25 |
| W18 Client Portal / Actions | **mapped** | **planned** | **partial** (automated green; UAT checklist ready) | P0 closed; internal UAT GO | **yes** | no | Execute W18-UAT-01 pilot smoke |

---

## Batch status summary

| Batch | Workflows | Mapping | Tests | Fixes |
|-------|-----------|---------|-------|-------|
| **A** | W01–W05 | **5/5 complete** | **Regression 2026-06-25** | **P0-A1–A6 done** | All blocks shipped | P0 complete; Batch A green |
| **B** | W06–W09 | **4/4 complete** | Batch B regression green | **P0-B1–B5 done** | Batch B P0 complete |
| **C** | W10–W15 | **6/6 mapped** | W10 + W11 + W12 + W14 + W15 pass | **P0-C1–C5 closed** | Batch C P0 complete |

---

## Cross-workflow audit snapshot (2026-06-26)

| Metric | Value |
|--------|-------|
| Open Critical | **0** |
| Open High | **5** |
| Sam decisions blocking fixes | **4** |
| Release gate (global) | **NO-GO** — see [RELEASE_READINESS.md](./RELEASE_READINESS.md) |
| W18 prod gate | **NO-GO** |
| JOB-SPINE-01 | **CLOSED — accepted 2026-06-27** |
| W11-PO-SEC-01 | **CLOSED — accepted 2026-06-27** |
| OUTCOME-STAMP-01 | **shipped — pending Sam acceptance** |
| Work-ahead queue | [HARDENING_WORK_AHEAD_QUEUE.md](./HARDENING_WORK_AHEAD_QUEUE.md) |
| Next for Troubleshoot Agent | **PTSA-WARNING-01** (SAM-W03-001 B) |

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-28 | **W22-MAP + W22-SEC-001 fix** (hardening agent, Sam-approved batch) — Mapped W22 CRM/Mailing-List ([22_CRM_RELATIONSHIPS_MAILING_LIST.md](./workflows/22_CRM_RELATIONSHIPS_MAILING_LIST.md)); **SAM-W22-001 decided = global unsubscribe suppression**. Shipped smallest-safe fix in `crmRoutes.mjs`: inline `requireRole("admin")` on `/sends` + `/sends/:sid/send` + `/lists/:id/import`; global `email_unsubscribes` suppression on **every** send path (closes smart-list hole); bounce→suppression-log; idempotent webhook stat increments. Regression test `npm run test:w22-crm-security` (employee/supervisor→403). **No schema/migration**; `node --check` + `build` green. **Pending staging test run + batch-a before closure.** Batch E remainder: map W23/W24/W25. |
| 2026-06-27 | **MARKETING-ADJACENT-VERIFY-01** (hardening agent, read-only — no code changed) — 4 ADVERSARIAL_AUDIT candidates verified: **W01-SEC-003 resolved-by-code** (honeypot + per-IP rate-limit + whitelist present → downgrade Medium→Low, pending test); **W22-SEC-001** CRM global-unsubscribe gap + send/import role-bypass + non-idempotent stats — **CONFIRMED High / Critical-candidate → ELEVATED to Sam** (Open-High rollup should move 0→1); **W23-DRIFT-001** marketing-media ffmpeg-on-storage-path + unpersisted upload + consent gap — CONFIRMED Medium (parked, map-gated); **W24-DRIFT-001** intel stale model id + silent catch + Meta token-in-URL — CONFIRMED Medium (map-gated). Marketing/intelligence admin prefix-gate confirmed intact (dev-api.mjs:879-901). Brief's P0-commit + RFQ-B `map W06/W07` found **stale/complete** (tree clean at f656d63; W06/W07 already mapped; SAM-W06-001 decided). See [MARKETING_ADJACENT_VERIFY_RESULT.md](./MARKETING_ADJACENT_VERIFY_RESULT.md). |
| 2026-06-27 | W18 pilot **on hold** — approved with controls; wait for signed contract + active Hub job |
| 2026-06-27 | Claude 2nd-pass E2E verify (BLH-E2E-CLAUDE-20260627-1139) — CONDITIONAL PASS; 3 fix batches queued (DISC-002 HIGH, DISC-WIN-01, BLH-E2E-001) + Cursor BLH-E2E-CLAUDE-001 (regression rotation race); W12-SEC-01 refuted; no product code changed. Report `E2E_CLAUDE_SECOND_PASS_BLH-E2E-CLAUDE-20260627-1139.md` |
| 2026-06-27 | W17-P5b→P8 build push: Snapshot RDO overlay · voice-to-tasks for building projects · leading-hand QC checklist · **deputy-replacement workforce gate** (`test:w17-workforce-gate:write` = W15+W16+W17 P1–P7, one pass). Migrations 118+119 applied → persistence live. **Gate 137 pass / 0 fail / 0 gap.** Protected sync/timesheet/Buildxact + allocation routes untouched. Per SAM-W15-002, ready for the Deputy parallel-run sign-off |
| 2026-06-27 | W17-P5 RDO + public-holiday display (display-only; manual dates + recurring patterns; SA computus seed). Migration 119 (3 deny-all tables, awaiting Sam apply) + additive non-working-days routes; W16 allocation routes untouched. `w17-rdo-holiday` 11/11+2gaps · planner-dnd 19/19 · baseline 12/12 · W16 14/14 · W15 19/19 · build/lint green; protected sync/timesheet/Buildxact untouched. Snapshot overlay deferred (P5b) |
| 2026-06-27 | W17-P4b/c Planner drag-drop + colour + opt-in board curation + seamless moves (optimistic/no reload-to-top). Migration 118 `workforce_planner_jobs` (awaiting Sam apply) + 2 additive `planner-jobs` routes; W16 allocation routes reused unchanged. `w17-planner-dnd` 19/19+2gaps · baseline 12/12 · W16 14/14 · W15 19/19 · build/lint green; protected sync/timesheet/Buildxact untouched |
| 2026-06-27 | **Forward scout** — [HARDENING_WORK_AHEAD_QUEUE.md](./HARDENING_WORK_AHEAD_QUEUE.md), [BUG_FIXING_MISSION_PLAN.md](./BUG_FIXING_MISSION_PLAN.md), [RELEASE_READINESS.md](./RELEASE_READINESS.md), [W18 UAT execution pack](./W18_CLIENT_PORTAL_UAT_EXECUTION_PACK.md) |
| 2026-06-27 | **OUTCOME-STAMP-01 shipped** — W02-DRIFT-001; `test:w02-qualification:write` |
| 2026-06-27 | **W11-PO-SEC-01 accepted closed** — Sam sign-off; W11-DRIFT-003 closed; watermark gap documented only |
| 2026-06-27 | **JOB-SPINE-01 shipped** — W04/W06 persistRfqs → POST `/api/jobs`; W04-DRIFT-001 + W06-DRIFT-001 closed; `test:w04-w06-job-spine:write` |
| 2026-06-26 | **Cross-workflow audit** — [CROSS_WORKFLOW_AUDIT_ACCELERATION_PACK.md](./CROSS_WORKFLOW_AUDIT_ACCELERATION_PACK.md); tracker RFQ risk line corrected (DRIFT-010 fixed); W18-UAT-01 parked |
| 2026-06-26 | W17-P4 Planner UI minimum shipped — new admin/supervisor **Planner tab** (`WorkforcePlannerTab.jsx`) = employee-first Mon–Sun week grid on the existing W16 allocation routes (create/edit-by-replace/delete per cell, project XOR carpentry, duplicate employee/date = hard 409, advisory-only). No backend/schema change. `w17-planner-baseline` 12/12, W15 19/19 + W16 14/14 + build + lint green; protected sync/timesheet paths untouched |
| 2026-06-26 | W17-P3 Worker tasks/category/preview shipped — server `task_audience` filter (D3 leak fix) + category dropdown + read-only console preview route + QC complete-gate; `w17-worker-tasks` 19/19, W15 19/19 + W16 14/14 + build green; protected sync untouched |
| 2026-06-26 | W17-P2 Snapshot weekly review shipped — read-only `completion-snapshot` extension + `SnapshotTab` refine; `w17-snapshot-review` 17/17, W15 19/19 + W16 14/14 + build green; protected sync untouched |
| 2026-06-22 | **W18 release review** — internal UAT GO; client UAT conditional; prod NO-GO |
| 2026-06-22 | **W18-API-04 pass** — finance notify regression 34/34 |
| 2026-06-22 | **W18-DRIFT-008/009 fixed** — home + media `client_visible`; photo test 15/15 |
| 2026-06-22 | **W18-P0-03 pass** — Journey `client_visible`; `test:w18-portal-photo-visibility:write` 10/10; W18-DRIFT-008/009 gaps |
| 2026-06-22 | **W18-P0-02 pass** — void→approve blocked 409; `test:w18-portal-void-guard:write` 14/14 |
| 2026-06-22 | **W18-P0-01 verified closed** — migrations 108/110 applied; skip DDL |
| 2026-06-22 | **W18-P0-04 / QA-001-GAP-10 closed** — admin-only generate-token; test:qa-sec-baseline 23/23 |
| 2026-06-22 | **W18 mapped** — Client Portal lifecycle; QA-001 Tier-0 closed (accepted); GAP-10 deferred |
| 2026-06-22 | **QA-001 Tier-0 fixed** — route guards in dev-api + blueprintRoutes; test:qa-sec-baseline |
| 2026-06-22 | **QA-001 security baseline** — plan + test:qa-sec-baseline (pre-fix inventory) |
| 2026-06-26 | **W17 remaining phase plans** — [W17_WORKFORCE_REMAINING_PHASE_PLANS.md](./W17_WORKFORCE_REMAINING_PHASE_PLANS.md); P1 closed; P2–P8 test-first plans |
| 2026-06-26 | **W17-P1 closed** — Team tab in Workforce; `/workforce/team` → `?tab=Team`; `test:w17-team-tab-baseline:write` 13/13; W16 14/14; W15 19/19 |
| 2026-06-26 | **W16-A1 closed** — mig 117 applied; `test:w16-allocation-baseline:write` 14/14; W15 19/19; build pass |
| 2026-06-22 | **W16-A1 backend** — mig 117 + allocation/crew routes + `test:w16-allocation-baseline:write`; BX/timesheet paths protected |
| 2026-06-22 | **W16 plan** — [W16_WORKFORCE_CURRENT_CODE_ALIGNMENT_PLAN.md](./W16_WORKFORCE_CURRENT_CODE_ALIGNMENT_PLAN.md); allocation baseline design (W16-A); planning only |
| 2026-06-26 | **P0-D1 closed** — W13 baseline tests shipped; `test:w13-site-diary-baseline:write` 24 pass; no product changes |
| 2026-06-26 | **P0-D1 plan** — [P0_D1_W13_SITE_DIARY_MEDIA_PLAN.md](./P0_D1_W13_SITE_DIARY_MEDIA_PLAN.md); W13 baseline test design |
| 2026-06-26 | **P0-C5 SEC gap closure** — W14-SEC-03 role gate; `test:w14-whs-baseline:write` 15/15; Batch C P0 complete |
| 2026-06-25 | **P0-C5 plan** — [P0_C5_WHS_PROFILE_INDUCTION_PLAN.md](./P0_C5_WHS_PROFILE_INDUCTION_PLAN.md); baseline tests shipped; SEC-03/SEC-01 gaps documented |
| 2026-06-25 | **P0-C5 baseline** — W14 profile + induction baseline; W14-DRIFT-001 confirmed intentional |
| 2026-06-25 | **P0-C4 closed** — W10 manual baseline tests; summary+warnings on generate; project route; W10-DRIFT-001 confirmed intentional |
| 2026-06-25 | **P0-C3 closed** — Option B UI gate; `test:w15-timesheet-auth:write`; W15-DRIFT-001 fixed |
| 2026-06-25 | **PO PDF refinement + quote email attach** — W11-DRIFT-007; `test:w11-batch-po:write` 12 pass |
| 2026-06-25 | **P0-C1 closed** — W11-DRIFT-006 PDF fix; full PO issue; `test:w11-batch-po:write` 10 pass |
| 2026-06-25 | **Test artifact cleanup policy** — `TEST_ARTIFACT_CLEANUP_POLICY.md` + `test:cleanup-artifacts` dry-run utility |
| 2026-06-25 | **P0-C3 planning** — [P0_C3_WORKFORCE_APPROVAL_PLAN.md](./P0_C3_WORKFORCE_APPROVAL_PLAN.md); W15-DRIFT-001; blocked SAM-W15-001 |
| 2026-06-25 | **Cleanup legacy matchers** — safe vs legacy tiers + `test:cleanup-matchers` |
| 2026-06-25 | **P0-C1 shipped** — W11-DRIFT-001 projectId; batch PO from `projects.job_id` |
| 2026-06-25 | **P0-B5 shipped** — ops readiness checklist; `test:w09-ops-readiness:write` 13 pass; Batch B P0 complete |
| 2026-06-25 | **Batch C mapped** — W10–W15 + BATCH_C_REVIEW_PACK.md |
| 2026-06-25 | **P0-B4 shipped** — win-quote-readiness + win wizard warn; `test:w08-win-quote:write` 14 pass |
| 2026-06-25 | **P0-B3 shipped** — matcher ambiguity guards; `test:w07-matcher` 24 pass; DRIFT-010 / W07-DRIFT-006 fixed |
| 2026-06-25 | **P0-B3 plan** — matcher ambiguity assessment; Option A+B hybrid recommended (no code) |
| 2026-06-25 | **P0-B2 Phase 2 shipped** — accept-alignment warn; W09-API-05A–05E pass |
| 2026-06-25 | **P0-B2 Phase 1** — W08-API-03/04, W09-API-05 baseline tests (`test:w08-accept:write`) |
| 2026-06-25 | **P0-B1 shipped** — W06-DRIFT-006 / DRIFT-006 fixed; W06-API-07 pass |
| 2026-06-25 | Batch B parking lot refined — W06/W07 pre-confirmed findings code-verified |
| 2026-06-25 | W08 accepted — SAM-W08-001–003 decided |
| 2026-06-25 | W07 accepted — SAM-W07-001–004 decided |
| 2026-06-25 | W06-DRIFT-008 fixed; W06-UI-02 pass |
| 2026-06-25 | BATCH_A_HARDENING_RESULT.md — Step 3 deliverable |
| 2026-06-25 | `/harden review` — BATCH_B_REVIEW_PACK finalized (P0-B1–B5) |
| 2026-06-25 | W09 mapped — Batch B mapping complete (W06–W09) |
| 2026-06-25 | W05-TEST-001 closed; Batch A E2E green |
| 2026-06-24 | Block 3 (P0-A1+A2) complete — W01 display + unified activities |
| 2026-06-24 | Block 2 (P0-A3+A4) complete |
| 2026-06-24 | Block 1 (P0-A5+A6) complete |
| 2026-06-24 | P0-A5 baseline complete (W05-DRIFT-003 documented); Batch B W07 parking lot |
| 2026-06-24 | Batch A §6 test skeletons; Sam decisions decided; Days 6–8 hardening started |
| 2026-06-24 | BATCH_A_REVIEW_PACK.md; Batch A review mode (Days 6–8) |
| 2026-06-24 | W05-STRUCTURAL-001 noted in tracker |
| 2026-06-24 | BATCH_A_SALES_TO_TENDER_SUMMARY.md; W05 accepted; W05-DRIFT-008/009 |
| 2026-06-24 | W05 mapped; W04 accepted + DRIFT-007; Batch A mapping complete |
| 2026-06-24 | W03 mapped; W02 accepted; RFQ pre-tracker wording; SAM-W02-002 fix |
| 2026-06-22 | W02 mapped; tracker created |

# Hardening — Initial Gap Review (first pass)

**Status:** 2026-06-28 · Governed by [COMPREHENSIVE_HARDENING_MASTER_PLAN.md](./COMPREHENSIVE_HARDENING_MASTER_PLAN.md).

A first-pass review of the existing hardening material to launch the machine. **Not** an attempt
to solve every gap — it sets the starting line and the first wave.

---

## 1. Workflows already mapped

W01–W15, W18, W22 are mapped with docs under `docs/qa/workflows/` and rows in
[WORKFLOW_MAP_MASTER.md](./WORKFLOW_MAP_MASTER.md),
[WORKFLOW_OWNERSHIP_MATRIX.md](./WORKFLOW_OWNERSHIP_MATRIX.md), and
[WORKFLOW_TEST_MATRIX.md](./WORKFLOW_TEST_MATRIX.md). Batch B (W06–W09) P0 complete; Batch C
(W10–W15) mapped.

## 2. Workflows missing or parked

| Workflow | State | Action |
|---|---|---|
| **W16 Finance** | Not indexed in the map (mapped elsewhere/Claude-owned) | **Map first**, then test (J2 depends on it). |
| **W17 Workforce** | **Claude-owned** | Do **not** edit W17 docs without Sam; coverage via `test:w17-*`. |
| **W19/W20 Marketing** | Parked | **PAUSED UNTIL MERGE** → post-merge wave. |
| **W21 Marketing Intelligence** | Parked | Post-merge wave. |
| **W23 / W24 / W25** | To map (W23-DRIFT-001 + W24-DRIFT-001 registered, map-gated) | Workflow Mapper, after the first wave. |

## 3. Tests that already exist (reuse, do not rebuild)

- **API critical paths:** `scripts/test-critical-paths.mjs` (`npm test`/`test:all`/`test:ai`).
- **Per-workflow runners:** `scripts/batch-a/run-w*.mjs` for W01–W18 (each with `--write`),
  e.g. `test:w02-qualification`, `test:journey-b-01`, `test:w05-win`, `test:w08-accept`,
  `test:w09-ops-readiness`, `test:w10-procurement-baseline`, `test:w11-batch-po`,
  `test:w12-schedule-auth`, `test:w13-site-diary-baseline`, `test:w14-whs-baseline`,
  `test:w15-timesheet-auth`, `test:w16-allocation-baseline`, `test:w17-*`, `test:w18-portal-*`.
- **Regression:** `run-hardening-regression.mjs` (`test:hardening-regression`),
  [TEST_REGRESSION_SUITE_01.md](./TEST_REGRESSION_SUITE_01.md), `run-batch-a.mjs`.
- **Role/security:** `e2e/tests/security/{unauthenticated-routes,client-isolation,crm-send-role}.spec.js`
  (`api-security`), `run-role-matrix-gate.mjs`, `run-qa-role-preview*`.
- **Playwright journeys/visual:** `e2e/tests/workflows/**` (incl. `batch-a/`),
  `e2e/tests/portal/**`, `e2e/tests/client-portal/**`, `e2e/tests/visual/**`, `e2e/ui-review/`.
- **Seed:** `scripts/create-e2e-users.mjs` + `scripts/seed-e2e-suite.mjs` (`test:e2e:seed`).

## 4. Tests that are missing (from the test matrix `missing` / `gap-documented` rows)

| Workflow | Missing | Suggested ID | Type |
|---|---|---|---|
| W01 | stage-update activity test | W01-API-04 | api |
| W01 | stage gate bypass (E2E) | W01-E2E-03 | e2e (gap-documented W01-DRIFT-003) |
| W02 | gate-bypass logging | W02-API-03b | api (W02-DRIFT-006, P1) |
| W03 | parse/send/DOCX | W03-API-01–04 | api |
| W07 | outbound send + threading | W07-API-01/02 | api (live — guard only) |
| W08 | accept + cost path | W08-API-03/04 | api |
| **all modules** | **UI usability + visual evidence** | `UI-<MODULE>-###` | **none yet — Wave 01A** |
| **W16 / W19–W21 / W23–W25** | mapping + tests | — | map first |

## 5. High-risk gaps remaining

1. **UI/UX entirely unassessed** — every module is **UI NOT ASSESSED**; the Hub had a major UI
   overhaul and only Sales is at standard. (Highest no-code priority → first wave.)
2. **Integration seams unproven** — RFQ send, win-finalize Dropbox, PO→Buildxact, mail have only
   been code-reviewed or hit prod (roadmap P1). Needs sandbox/live-fire (Sam-gated; boot-safety flags).
3. **SOP drift** — SOPs not yet walked against the post-overhaul UI; §14 coverage unverified.
4. **Unmapped workflows** — W16/W19–W21/W23–W25 outside the coverage model.
5. **W18 production** — legacy anonymous-POST surface (P1-W18-04 decided C: SOP+monitor; A for
   unsupervised prod) + SOP gaps. Client pilot approved-with-controls, **on hold** for a viable real job.

## 6. What to audit first

**UI/UX Usability Wave 01A (no-code)** — it's the largest genuinely-uncovered, no-code-safe,
deployability-relevant surface, and it unblocks roadmap P3 (SOPs/training) and the UI lock gate.

## 7. Which existing scripts to reuse first

`npm run test:ui-review` + `chromium-mobile`/`chromium-tablet` (visual evidence); then the P0
re-verify set: `test:journey-b-01`, `test:win-finalize-01`, `run-role-matrix-gate.mjs`,
`e2e/tests/security/client-isolation.spec.js`.

## 8. Areas needing UI/UX agent review

All modules (priority order in §10). Sales = reference check only. Worker PWA + Client Portal
need explicit mobile evidence. Operations/Schedule/Finance are dense desktop tables → check
mobile cards/tabs. CRM and Procurement → check empty/loading/error + demo/live masking.

## 9. Areas needing SOP comparison

Every `docs/sops/` folder per [SOP_TO_MODULE_AUDIT_PLAN.md](./SOP_TO_MODULE_AUDIT_PLAN.md),
prioritising the lead→handover journey (02 sales → 03/04 tender/RFQ → 05/06/07/08 ops →
09 finance → 10 workforce → 11 portal). Marketing SOPs (18/19) deferred.

## 10. Recommended first autonomous discovery wave

**Wave `UI-UX-USABILITY-WAVE-01A`** — no-code UI/UX discovery sweep. Module priority:

1. **Sales** (reference check only — do not redesign)
2. Tender / RFQ
3. Operations / Project Command Centre
4. Schedule
5. Procurement
6. Finance
7. Workforce
8. Field / Worker App
9. WHS
10. Client Portal
11. CRM / Mailing List
12. **Marketing — record `MARKETING — PAUSED UNTIL MERGE` (not assessed)**

**Outputs:** [ui_review/UI_UX_DISCOVERY_WAVE_01_RESULT.md](./ui_review/UI_UX_DISCOVERY_WAVE_01_RESULT.md),
[ui_review/UI_MODULE_LOCK_MATRIX.md](./ui_review/UI_MODULE_LOCK_MATRIX.md),
[ui_review/UI_SCREEN_EVIDENCE_INDEX.md](./ui_review/UI_SCREEN_EVIDENCE_INDEX.md), BUG_REGISTER
entries, and updated handoff packets. **No fixes in 01A.** 01B polish begins only after Sam
approves the 01A module-polish plan. The concrete task is seeded in
[hardening_loop/NEXT_CURSOR_TASK.md](./hardening_loop/NEXT_CURSOR_TASK.md).

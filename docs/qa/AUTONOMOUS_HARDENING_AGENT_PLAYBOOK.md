# Autonomous Hardening — Agent Playbook

**Status:** 2026-06-28 · Governed by [COMPREHENSIVE_HARDENING_MASTER_PLAN.md](./COMPREHENSIVE_HARDENING_MASTER_PLAN.md).

Defines every agent role in the loop. **Default posture: read product code freely, write only
docs/tests.** The **only** product-code writers are the **Fix Agent** (approved bug IDs) and the
**UI Polish Agent / Wave 01B** (presentational-only, post-approval).

**Universal rules (all roles):**
- Boot by reading `hardening_loop/{CURRENT_STATE,NEXT_CURSOR_TASK,NEXT_CLAUDE_REVIEW,AUTONOMOUS_LOOP_STATUS}.md`.
- End by writing the next agent's packet + appending to `hardening_loop/AGENT_HANDOFF_LOG.md`.
- Findings → [BUG_REGISTER.md](./BUG_REGISTER.md) only. Never mark a bug fixed/closed during an audit.
- Hit a [stop condition](./COMPREHENSIVE_HARDENING_MASTER_PLAN.md#14-stop-conditions-any-agent) →
  stop + write `hardening_loop/SAM_APPROVAL_REQUIRED.md`.
- Final reply format: `task done · files · tests · blockers · next agent · next task file · approval-required (y/n)`.

**Per-role template:** Mission · Can do · Cannot do · Allowed files · Forbidden actions · Output · Stops when.

---

## 1. Hardening Controller  (Claude Code)
- **Mission:** own the loop. Audit results, rank bugs, decide the next wave, write the Cursor packet.
- **Can do:** read everything; synthesize results; update the master plan, gap review, matrices,
  release readiness (with evidence); author `NEXT_CURSOR_TASK.md`.
- **Cannot do:** edit product code; approve its own Critical/High fixes; close accepted gaps;
  change business-workflow decisions.
- **Allowed files:** `docs/qa/**`, `hardening_loop/**`.
- **Forbidden:** `src/**`, `server/**`, `supabase/migrations/**`; live integrations; deploy.
- **Output:** updated `CURRENT_STATE.md` + `AUTONOMOUS_LOOP_STATUS.md`, a fresh
  `NEXT_CURSOR_TASK.md`, handoff-log row.
- **Stops when:** an approval gate is needed, or release readiness is GO/Conditional-GO.

## 2. Workflow Mapper  (Claude or Cursor)
- **Mission:** map unmapped/parked workflows (W16, W19–W21, W23–W25) into the matrices before testing.
- **Can do:** read routes/components/migrations; add rows to [WORKFLOW_MAP_MASTER.md](./WORKFLOW_MAP_MASTER.md),
  [WORKFLOW_OWNERSHIP_MATRIX.md](./WORKFLOW_OWNERSHIP_MATRIX.md), [WORKFLOW_TEST_MATRIX.md](./WORKFLOW_TEST_MATRIX.md);
  create a workflow doc under `docs/qa/workflows/`.
- **Cannot do:** edit product code; touch **W17** docs (Claude-owned) without Sam.
- **Allowed files:** `docs/qa/**`.
- **Forbidden:** product code; renames of existing routes/tables.
- **Output:** new workflow map doc + matrix rows; handoff-log row.
- **Stops when:** mapping reveals a structural decision (→ `SAM_DECISION_LOG.md` + approval file).

## 3. SOP Alignment Auditor  (Claude or Cursor)
- **Mission:** compare each SOP to the actual module (per [SOP_TO_MODULE_AUDIT_PLAN.md](./SOP_TO_MODULE_AUDIT_PLAN.md)).
- **Can do:** read SOPs + routes/screens/APIs; write the expected employee script; log drift to
  BUG_REGISTER classified bug / SOP-DRIFT / ACCEPTED-GAP / TRAINING-GAP; **fix the SOP text**
  (SOPs are docs) and update `SOP_INDEX.md` + `SOP_CHANGELOG.md`.
- **Cannot do:** edit product code; decide that a gap is "accepted" (that's Sam).
- **Allowed files:** `docs/sops/**`, `docs/qa/**`.
- **Forbidden:** product code; integrations; deploy.
- **Output:** drift findings in BUG_REGISTER; SOP updates + changelog; handoff-log row.
- **Stops when:** drift implies a product fix (log it, don't fix) or an accepted-gap decision.

## 4. API Test Agent  (Cursor)
- **Mission:** verify API critical paths via the existing runners.
- **Can do:** run `npm test` / `test:all` / `test:ai`, `scripts/batch-a/run-w*.mjs` (`--write`
  only with `BLH TEST` artifacts); add **test-only** `.mjs` runners following existing patterns;
  log failures to BUG_REGISTER; update [WORKFLOW_TEST_MATRIX.md](./WORKFLOW_TEST_MATRIX.md).
- **Cannot do:** edit product code; send email/RFQ/PO; hit live integrations.
- **Allowed files:** `scripts/**` (test-only), `docs/qa/**`.
- **Forbidden:** `src/**`, `server/**`, migrations; live-`.env` boot without the safety flags (§14 master).
- **Output:** run logs (`scripts/output/`), matrix status, BUG_REGISTER entries, handoff-log row.
- **Stops when:** a test needs a product fix, or a live integration would fire.

## 5. Playwright E2E Agent  (Cursor)
- **Mission:** run browser journeys (`chromium-desktop`) + journey specs under `e2e/tests/workflows/**`.
- **Can do:** run `npm run test:e2e` / project-scoped specs; seed via `npm run test:e2e:seed`;
  add **test-only** specs; capture traces/screenshots; log failures.
- **Cannot do:** edit product code; run against a live/prod base URL; invite real clients.
- **Allowed files:** `e2e/**` (test-only), `docs/qa/**`.
- **Forbidden:** product code; deploy; live integrations.
- **Output:** Playwright report (`e2e/report/`), matrix status, BUG_REGISTER entries, handoff-log row.
- **Stops when:** a journey needs a product fix, or only a live env can exercise the seam (→ defer to sandbox/Sam).

## 6. UI/UX Usability Agent  (Cursor) — **two modes**
**Reference standard = Sales.** Sales is the pattern to match, not to redesign.

### Mode 01A — Discovery Sweep (no-code)
- **Mission:** assess each module against the Sales-standard scorecard + first-viewport rubric;
  capture/inspect visual evidence across desktop/tablet/mobile; classify each module's UI lock status.
- **Can do:** read routes/components/UI-Review fixtures; run **safe** UI Review screenshots
  (`npm run test:ui-review`, `chromium-mobile`/`chromium-tablet`); log findings to BUG_REGISTER
  with a `Type:` token + `UI-<MODULE>-###` id; fill `ui_review/` docs.
- **Cannot do:** edit product code; change layout/handlers/API/routes/auth/calc/mutations; fix anything.
- **Allowed files:** `docs/qa/ui_review/**`, `docs/qa/BUG_REGISTER.md`, `hardening_loop/**`,
  `e2e/ui-review/**`, **`src/ui-review/**`** (UI Review fixtures/harness — review-only,
  tree-shaken from prod; see master plan §4 carve-out, recorded 2026-06-28).
- **Forbidden:** `src/**`, `server/**`, migrations; integrations; deploy.
- **Output:** `UI_UX_DISCOVERY_WAVE_01_RESULT.md`, `UI_MODULE_LOCK_MATRIX.md`,
  `UI_SCREEN_EVIDENCE_INDEX.md`; BUG_REGISTER entries; updated `CURRENT_STATE.md` +
  `NEXT_CLAUDE_REVIEW.md` + handoff-log.
- **Stops when:** the sweep is complete (hand to Claude to assemble the module-polish plan), or a
  finding needs behaviour change (log, don't fix).

### Mode 01B — UI Polish Execution (presentational-only)
- **Mission:** apply presentational polish to the Sales standard for the modules in the
  **Sam-approved** 01A module-polish plan.
- **Can do:** change presentational components, layout/spacing/cards/tabs/rails/badges/mobile
  states, copy/helper text, empty/loading/error states, UI Review fixtures; run build/lint/screenshots.
- **Cannot do / MUST preserve:** endpoints, response shapes, server routes, auth/role logic,
  calculations, mutation behaviour, prod data flow, integrations, schemas/migrations. Any UI
  issue needing behaviour/API/schema/auth/financial/RFQ/PO/Buildxact/Xero/Dropbox/Gmail/Resend/
  WHS/workforce/client-portal/schedule change → **stop and log to BUG_REGISTER**.
- **Allowed files:** presentational `src/**` components/styles **only**, `e2e/**` fixtures, `docs/qa/**`.
- **Forbidden:** `server/**`, migrations, route/table renames, broad refactor, Sales redesign.
- **Output:** polish result doc + updated `UI_MODULE_LOCK_MATRIX.md` + screenshots; handoff-log.
- **Stops when:** no Sam-approved 01A plan exists, or a change would exceed presentational scope.

## 7. Security / Role Matrix Agent  (Cursor)
- **Mission:** prove the role/security boundaries (re-verified from scratch — P0 tier).
- **Can do:** run `e2e/tests/security/**` (`api-security`), `run-role-matrix-gate.mjs`,
  `run-qa-role-preview*`; verify unauth 401, non-admin 403, client isolation, portal cross-role;
  log to BUG_REGISTER.
- **Cannot do:** edit product code; change auth logic.
- **Allowed files:** `e2e/tests/security/**` (test-only), `docs/qa/**`.
- **Forbidden:** `server/**` auth code; deploy.
- **Output:** role-matrix gate result, BUG_REGISTER entries, release-readiness row (with evidence), handoff-log.
- **Stops when:** a boundary fails (log Critical/High; do not fix without an approved ID).

## 8. Regression Runner  (Cursor)
- **Mission:** run affected + broad regression after fixes; rotate P1/P2 trusted-green.
- **Can do:** run `run-hardening-regression.mjs` + [TEST_REGRESSION_SUITE_01.md](./TEST_REGRESSION_SUITE_01.md)
  rotation; record pass/fail/gap; update matrix.
- **Cannot do:** edit product code; change a bug status without a run log.
- **Allowed files:** `scripts/**` (test-only), `docs/qa/**`.
- **Forbidden:** product code; live integrations.
- **Output:** regression log, matrix updates, handoff-log.
- **Stops when:** a regression appears (log it) or evidence is missing.

## 9. Bug Triage Agent  (Claude)
- **Mission:** dedupe, severity-rank, and tier findings; propose the next fix batch (IDs only).
- **Can do:** read BUG_REGISTER + results; set severity/priority; group into batches; recommend
  smallest-safe fixes; draft the approval ask when Critical/High.
- **Cannot do:** edit product code; self-approve fixes; close bugs.
- **Allowed files:** `docs/qa/**`, `hardening_loop/**`.
- **Forbidden:** product code.
- **Output:** ranked batch proposal in `NEXT_CURSOR_TASK.md` (or `SAM_APPROVAL_REQUIRED.md`), handoff-log.
- **Stops when:** a batch contains Critical/High without an approved ID (→ approval file).

## 10. Fix Agent  (Cursor)
- **Mission:** apply smallest-safe fixes for **named, approved** bug IDs only.
- **Can do:** edit product code for the approved IDs; add/update a regression test; update
  BUG_REGISTER with fix + verification; update release readiness with evidence.
- **Cannot do:** fix un-approved IDs; broad refactor; route/table rename; schema change without
  approval; close an accepted gap; change business-workflow decisions.
- **Allowed files:** the specific `src/**` / `server/**` paths named in the approved batch; the
  matching test; `docs/qa/**`.
- **Forbidden:** anything outside the named scope; live integrations; deploy.
- **Output:** fix result doc, regression evidence, BUG_REGISTER + release-readiness updates,
  next Claude review packet, handoff-log.
- **Stops when:** the fix needs scope/schema/auth/decision beyond the approved ID (→ approval file).

## 11. Release Readiness Agent  (Claude)
- **Mission:** keep [RELEASE_READINESS.md](./RELEASE_READINESS.md) honest; assert the deploy gate.
- **Can do:** read all evidence; update the per-surface ladder **with citations**; check the
  deploy-gate checklist; recommend GO / Conditional-GO / NO-GO to Sam.
- **Cannot do:** declare GO itself; deploy; edit product code.
- **Allowed files:** `docs/qa/**`, `hardening_loop/**`.
- **Forbidden:** product code; deploy; closing gates without evidence.
- **Output:** updated release readiness + deploy-gate status; `SAM_APPROVAL_REQUIRED.md` when a
  GO decision is Sam's; handoff-log.
- **Stops when:** the deploy gate is met (→ hand the GO decision to Sam) or evidence is missing.

---

## Role → loop position

| Loop stage | Agent(s) |
|---|---|
| Plan / map / rank | Hardening Controller · Workflow Mapper · Bug Triage |
| Audit (no-code) | SOP Alignment Auditor · UI/UX Usability (01A) |
| Test | API Test · Playwright E2E · Security/Role Matrix |
| Fix (approved) | Fix Agent · UI Polish (01B) |
| Regress | Regression Runner |
| Gate | Release Readiness |

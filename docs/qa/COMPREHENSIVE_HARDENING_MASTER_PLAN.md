# Comprehensive Autonomous Hardening — Master Plan

**Status:** 2026-06-28 · **Owner:** Sam (approvals) + Claude Code / Cursor (execution)
**Role of this doc:** the *constitution* for the autonomous hardening machine. Every other
hardening doc and every agent defers to the rules here.

> This **extends** the existing QA system — it does not fork a parallel one. Where an existing
> doc, register, matrix, or script already does the job, the machine reuses it. New docs only
> add the orchestration layer on top.

**Read with:**
[AUTONOMOUS_HARDENING_AGENT_PLAYBOOK.md](./AUTONOMOUS_HARDENING_AGENT_PLAYBOOK.md) ·
[HARDENING_AUTONOMOUS_LOOP_SPEC.md](./HARDENING_AUTONOMOUS_LOOP_SPEC.md) ·
[SOP_TO_MODULE_AUDIT_PLAN.md](./SOP_TO_MODULE_AUDIT_PLAN.md) ·
[FULL_E2E_HARDENING_STRATEGY.md](./FULL_E2E_HARDENING_STRATEGY.md) ·
[HARDENING_INITIAL_GAP_REVIEW.md](./HARDENING_INITIAL_GAP_REVIEW.md) ·
[MARKETING_POST_MERGE_HARDENING_PLAN.md](./MARKETING_POST_MERGE_HARDENING_PLAN.md) ·
[HARDENING_WATCH_ORCHESTRATOR_SPEC.md](./HARDENING_WATCH_ORCHESTRATOR_SPEC.md) ·
[hardening_loop/](./hardening_loop/)

---

## 1. Purpose

Turn the Hub's existing hardening work into a **self-driving controller** that runs:

```
audit → test → bug register → fix batch → regression → repeat until deployable
```

…where **Claude Code** and **Cursor** hand work back and forth through written packet files
under [hardening_loop/](./hardening_loop/), and **Sam only intervenes at approval gates** — not
to write the next prompt. The machine must:

- test the whole Hub end-to-end (API, E2E, UI/UX, role/security),
- compare SOPs to actual module behaviour,
- log every issue to [BUG_REGISTER.md](./BUG_REGISTER.md),
- fix only by approved severity batch,
- regress, and
- re-run until [RELEASE_READINESS.md](./RELEASE_READINESS.md) is GO / Conditional-GO.

---

## 2. Current hardening state (2026-06-28 snapshot)

- **0 open Critical · 0 actionable High.** P1/decision-gated: W02-DRIFT-006, W05-STRUCTURAL-001.
- **Implementation paused** — last active phase was TEST-DISCOVERY-WAVE-01 (audit-first).
- **Mapped workflows:** W01–W15, W18, W22 (see [WORKFLOW_MAP_MASTER.md](./WORKFLOW_MAP_MASTER.md)).
  **Unmapped/parked:** W16 Finance, W17 Workforce (Claude-owned), W19–W21 Marketing, W23–W25.
- **Roadmap frame:** [GO_LIVE_ROADMAP.md](./GO_LIVE_ROADMAP.md) P0–P4. The roadmap's honest
  finding: *the remaining blockers are integration-seams, Sam-decisions, SOPs/training, commit,
  and pilot — not more bug-hunting.* This plan therefore points the machine first at the
  genuinely-uncovered surfaces (UI/UX, SOP drift, unmapped workflows, integration seams) and
  re-verifies the risk-critical surfaces from scratch.
- **UI status:** every module is **UI NOT ASSESSED** (no usability/visual lane has run yet).
- **Marketing:** paused until `marketing-run-a` merges (Option A).

---

## 3. Reuse map — do NOT reinvent

| Existing asset | The machine uses it as |
|---|---|
| [BUG_REGISTER.md](./BUG_REGISTER.md) | The **only** issue store. |
| [WORKFLOW_MAP_MASTER.md](./WORKFLOW_MAP_MASTER.md) | Workflow index + cross-workflow handoffs. |
| [WORKFLOW_OWNERSHIP_MATRIX.md](./WORKFLOW_OWNERSHIP_MATRIX.md) | Table/Screen/Route source-of-truth ownership. |
| [WORKFLOW_TEST_MATRIX.md](./WORKFLOW_TEST_MATRIX.md) | Coverage matrix + test IDs. |
| [RELEASE_READINESS.md](./RELEASE_READINESS.md) | Per-surface gate ladder. |
| [SAM_DECISION_LOG.md](./SAM_DECISION_LOG.md) | Decision gates `SAM-W##-###`. |
| [GO_LIVE_ROADMAP.md](./GO_LIVE_ROADMAP.md) | Phase frame P0–P4. |
| [TEST_REGRESSION_SUITE_01.md](./TEST_REGRESSION_SUITE_01.md) | Regression meta-runner. |
| [HUB_QA_ROLE_PREVIEW_CONSOLE.md](./HUB_QA_ROLE_PREVIEW_CONSOLE.md), [ROLE_MATRIX_DEPLOYMENT_GATE_01.md](./ROLE_MATRIX_DEPLOYMENT_GATE_01.md) | Role/security gate harness. |
| `scripts/test-critical-paths.mjs` (npm `test` / `test:all` / `test:ai`) | API critical-path harness. |
| `scripts/batch-a/run-w*.mjs` (+ `:write`) | Per-workflow API runners (W01–W18). |
| `scripts/batch-a/run-hardening-regression.mjs`, `run-batch-a.mjs`, `run-role-matrix-gate.mjs` | Regression + role gate. |
| `playwright.config.js` (projects `chromium-desktop`, `chromium-mobile`, `chromium-tablet`, `api-security`) + `e2e/tests/**` | E2E + visual + security suites. |
| `scripts/create-e2e-users.mjs` + `scripts/seed-e2e-suite.mjs` (npm `test:e2e:seed`) | Deterministic seed. |
| `docs/sops/` (20 folders) + `SOP_INDEX.md` + `SOP_MAINTENANCE.md` + `SOP_CHANGELOG.md` | SOP source-of-truth. |

If a need seems to require a *new* register/matrix/runner, **stop** — almost always one exists.

---

## 4. No-code audit rules

1. **Audit and test agents never edit product code** (`src/**`, `server/**`,
   `supabase/migrations/**`). They may *read* it freely.
2. Audit/test agents may write only to: `docs/qa/**`, `docs/sops/**` (SOP fixes are docs),
   **clearly test-only** files under `e2e/**` and `scripts/**`, and **`src/ui-review/**`** — see
   the carve-out note below.

   > **Allowed-path carve-out — `src/ui-review/**` (recorded 2026-06-28, control check).**
   > Although it lives under `src/`, the `src/ui-review/**` tree is **review-only infrastructure**:
   > it is gated behind `import.meta.env.VITE_UI_REVIEW_MODE === "true"` and **statically
   > tree-shaken out of production** (verified in `src/main.jsx`, `src/App.jsx` lazy/dynamic
   > imports, `src/ui-review/config.js`; no production component imports its fixtures). Editing
   > `src/ui-review/**` (UI Review fixtures/registry/config/pages) **cannot change production
   > behaviour, APIs, auth, calculations, or schema**, so it is treated as **test-only** and is
   > allowed for UI Review fixture/coverage tasks. The rest of `src/**` and all of `server/**` /
   > `supabase/migrations/**` remain **forbidden** to audit/test agents. (Resolves the
   > Wave-01A-follow-up scope question: Option 1 — safe to allow.)
3. **Findings go to [BUG_REGISTER.md](./BUG_REGISTER.md)** — never fixed inline by an audit pass.
4. **The only product-code writers are:** the **Fix Agent** (approved bug IDs only) and the
   **UI Polish Agent in Wave 01B** (presentational-only, after Sam approves the 01A plan; see
   §7). Both are bounded by the preserve-behaviour list and stop+log on anything beyond scope.
5. **Test artifacts** use the `BLH TEST` marker via `buildTestJobAddress()` in
   `scripts/lib/testArtifactPrefixes.mjs` (per CLAUDE.md). No new legacy-prefix test folders.
6. **No live integrations, no email send, no deploy, no destructive commands** during audit.

---

## 5. Autonomous loop model

```
Claude Code (plan / map / audit / review)
   → writes hardening_loop/NEXT_CURSOR_TASK.md
Cursor (execute approved test / audit / fix batch)
   → writes result doc + updates BUG_REGISTER + writes hardening_loop/NEXT_CLAUDE_REVIEW.md
Claude Code (review pass/fail, rank bugs, plan next batch)
   → writes the next NEXT_CURSOR_TASK.md
… regression … repeat until RELEASE_READINESS is green.
```

- **Source of truth = the handoff files** in [hardening_loop/](./hardening_loop/). The watch
  orchestrator (`scripts/hardening-watch.mjs`) reads + *drives* these files; it never replaces
  them. It can now **actively invoke the next agent** (`--run-once` / `--interval=N`, supervised)
  via configurable command templates (`HARDENING_CURSOR_CMD` / `HARDENING_CLAUDE_CMD`) — and if a
  template is unset it stops cleanly with an "agent invocation not configured" blocker rather than
  faking autonomy. Every approval gate, dirty-tree check, forbidden-path rule, and the
  no-deploy / no-live-integration / no-self-approve guards are enforced around each invocation.
  Full mechanics: [HARDENING_AUTONOMOUS_LOOP_SPEC.md](./HARDENING_AUTONOMOUS_LOOP_SPEC.md)
  and [HARDENING_WATCH_ORCHESTRATOR_SPEC.md](./HARDENING_WATCH_ORCHESTRATOR_SPEC.md).
- **Self-start contract:** every agent boots by reading `CURRENT_STATE.md`,
  `NEXT_CURSOR_TASK.md`, `NEXT_CLAUDE_REVIEW.md`, `AUTONOMOUS_LOOP_STATUS.md`; ends by writing
  the next agent's packet + appending to `AGENT_HANDOFF_LOG.md`.
- **No-prompt continuation:** the final reply of each task names the next agent + next task file
  and asks Sam for nothing **unless** an approval gate is hit.

---

## 6. Agent roles (summary — full spec in the playbook)

Hardening Controller · Workflow Mapper · SOP Alignment Auditor · API Test Agent · Playwright
E2E Agent · UI/UX Usability Agent · Security/Role Matrix Agent · Regression Runner · Bug Triage
Agent · Fix Agent · Release Readiness Agent. See
[AUTONOMOUS_HARDENING_AGENT_PLAYBOOK.md](./AUTONOMOUS_HARDENING_AGENT_PLAYBOOK.md) for can-do /
cannot-do / allowed files / forbidden actions / output format / stop condition per role.

---

## 7. Workflow coverage model — **Hybrid by risk tier**

The machine does **not** blindly re-run everything, nor blindly trust prior green. It tiers:

| Tier | Scope | Treatment |
|------|-------|-----------|
| **Re-verify from scratch** | **P0 workflows** (W01, W02, W06, W07, W08, W09), the **role/security matrix**, and **W18 client-portal isolation** | Re-run/re-audit before trusting any PASS. |
| **Trust + rotate** | **P1/P2 workflows** | Trust prior PASS evidence; cover via scheduled **regression rotation** ([TEST_REGRESSION_SUITE_01.md](./TEST_REGRESSION_SUITE_01.md)). |
| **Map first, then test** | **Unmapped** (W16, W19–W21, W23–W25) | Map into the matrices before testing. W17 is **Claude-owned** — do not edit W17 docs without Sam. |
| **Paused** | **Marketing** | `MARKETING — PAUSED UNTIL MERGE`; own wave post-merge ([MARKETING_POST_MERGE_HARDENING_PLAN.md](./MARKETING_POST_MERGE_HARDENING_PLAN.md)). |

**UI/UX is a first-class deployability lane** (the first wave). Two modes:

- **Wave 01A — Discovery (no-code):** audit + safe screenshots, compare to the **Sales reference
  standard**, log to BUG_REGISTER, no edits, **no fixes**.
- **Wave 01B — Polish (presentational-only):** begins **only after Sam approves the 01A
  module-polish plan once**, then auto-runs across approved modules. Preserves endpoints,
  response shapes, routes, auth/role logic, calculations, mutation behaviour, integrations,
  schemas. Anything beyond presentational → stop + log.

Full UI rubric, Sales-standard scorecard, lock statuses, and evidence matrix live in
[FULL_E2E_HARDENING_STRATEGY.md](./FULL_E2E_HARDENING_STRATEGY.md) and the
[ui_review/](./ui_review/) hub.

---

## 8. Test categories (reuse existing IDs)

From [WORKFLOW_TEST_MATRIX.md](./WORKFLOW_TEST_MATRIX.md): `W##-API-##` · `W##-E2E-##` ·
`W##-UI-##` · `W##-SMOKE-##` · `W##-SEC-##` · `W##-STORAGE-##` · `W##-REG-##`. UI usability
findings additionally carry a `Type:` token (see §10) and use module-scoped IDs `UI-<MODULE>-###`.

| Category | Primary harness |
|---|---|
| API critical paths | `scripts/test-critical-paths.mjs`, `scripts/batch-a/run-w*.mjs` |
| E2E (browser) | `playwright.config.js` → `chromium-desktop` |
| Visual / UI evidence | `chromium-mobile`, `chromium-tablet`, `test:ui-review` |
| Security / role | `e2e/tests/security/**` (`api-security`), `run-role-matrix-gate.mjs` |
| Regression | `run-hardening-regression.mjs`, [TEST_REGRESSION_SUITE_01.md](./TEST_REGRESSION_SUITE_01.md) |
| SOP-vs-module | doc audit per [SOP_TO_MODULE_AUDIT_PLAN.md](./SOP_TO_MODULE_AUDIT_PLAN.md) |

---

## 9. Severity model

Reuse the register's four levels: **Critical / High / Medium / Low**.

- **Critical** — data loss, security breach, money wrong, safety/WHS exposure, or a P0 workflow
  broken with no workaround. **Blocks release. Fix needs Sam approval (or pre-approved ID).**
- **High** — a workflow is broken or a boundary is weak, but a workaround exists. **Blocks
  release unless explicitly accepted by Sam.**
- **Medium** — degraded UX/clarity, non-blocking drift, missing non-critical state. Batched.
- **Low** — cosmetic / taste / nice-to-have. Only actioned if cheap and in-scope.

`blocks-deployability (y/n)` is recorded per UI finding regardless of severity.

---

## 10. Bug-register rules

- **One store only:** [BUG_REGISTER.md](./BUG_REGISTER.md). No parallel/UI-only register.
- **IDs:** keep existing conventions `W##-{DRIFT,SEC,CONVERT}-###`; UI usability findings use
  `UI-<MODULE>-###`; SOP/training use the `Type:` token below on a normal entry.
- **`Type:` tokens** (for UI/SOP findings): UI-USABILITY · UI-MOBILE · UI-EMPTY-STATE ·
  UI-LOADING-STATE · UI-ERROR-STATE · UI-DEMO-LIVE · UI-NAVIGATION · UI-WORKFLOW-CLARITY ·
  UI-ACTION-CLARITY · UI-ACCESSIBILITY · UI-VISUAL-REGRESSION · SOP-DRIFT · TRAINING-GAP ·
  ACCEPTED-GAP.
- **Every entry includes:** severity · module/owner · symptom (expected vs actual) ·
  reproduction · affected route/screen/table · role · viewport (UI) · suggested regression/
  visual test · evidence path · status · `blocks-deployability`.
- **Status values:** open · fixed · closed · superseded · gap-documented · blocked (existing set).
- **Audit passes only ADD or annotate** — they never mark a bug fixed/closed.

---

## 11. Fix-batch rules

1. A fix batch runs **only for named, Sam-approved bug IDs** (or the pre-approved UI Wave 01B
   plan). The batch doc names the IDs up front.
2. **Smallest-safe fix.** No broad refactor, no route/table rename, no god-file split.
3. **Add or update a regression test** where practical (prefer an existing `run-w*.mjs` or a
   spec under `e2e/tests/`).
4. Update [BUG_REGISTER.md](./BUG_REGISTER.md) with the fix + verification.
5. Update [RELEASE_READINESS.md](./RELEASE_READINESS.md) **only with evidence**.
6. Write a result doc and the next review packet for Claude.
7. **Wave 01B exception:** presentational-only edits under the approved plan, bounded by the
   preserve-behaviour list; anything beyond presentational stops + logs.

---

## 12. Regression rules

- After any fix, run the **affected** `run-w*.mjs` / spec, then the **broader** suite
  (`run-hardening-regression.mjs` / [TEST_REGRESSION_SUITE_01.md](./TEST_REGRESSION_SUITE_01.md)).
- **P1/P2 rotation:** trusted-green workflows are re-run on rotation so trust doesn't go stale.
- A bug's status changes **only with evidence** (a run log / screenshot path), never on assertion.

---

## 13. Release-readiness gates

Maintained in [RELEASE_READINESS.md](./RELEASE_READINESS.md) as a **per-surface ladder**
(NO-GO / CONDITIONAL GO / GO). The machine updates the relevant surface row with evidence after
each batch. **Global production is GO only when the deploy gate (§15) is fully met.**

---

## 14. Stop conditions (any agent)

Stop immediately and write `hardening_loop/SAM_APPROVAL_REQUIRED.md` (or
`ORCHESTRATOR_BLOCKED.md` for the watcher) when a step would require any of:

- a Critical/High fix without an approved bug ID;
- production data, live integrations, sending email, RFQ send, PO generation, Buildxact/Xero
  sync, Dropbox write flow;
- a schema migration, auth/security-logic change, finance calculation, or payroll/timesheet
  approval-logic change;
- a deploy, destructive command, broad refactor, route/table rename;
- closing an **accepted gap**, changing a **business-workflow decision**, or a real-client
  invite/pilot;
- a dirty tree with unrelated work, or missing QA docs/scripts.

**Shared-env boot safety:** before any live/shared-`.env` runtime smoke (not part of the
no-code waves), background jobs must be disabled or pointed at staging —
`PORTAL_SYNC_ENABLED=false`, `IMAP_POLL_ENABLED=false`, `INVOICE_IMAP_POLL_ENABLED=false`. **Do
not full-boot against live `.env`** until the finance invoice IMAP poller flag is confirmed
present and honoured.

---

## 15. Deploy gate (loop exit) + required evidence for closure

The loop continues until **all** of:

- [ ] no open **Critical**
- [ ] no **unaccepted High**
- [ ] all **P0 workflows pass**
- [ ] **role/security matrix passes** ([ROLE_MATRIX_DEPLOYMENT_GATE_01.md](./ROLE_MATRIX_DEPLOYMENT_GATE_01.md))
- [ ] **full E2E journeys pass** ([FULL_E2E_HARDENING_STRATEGY.md](./FULL_E2E_HARDENING_STRATEGY.md))
- [ ] **SOP drift fixed or accepted** ([SOP_TO_MODULE_AUDIT_PLAN.md](./SOP_TO_MODULE_AUDIT_PLAN.md))
- [ ] **client-portal access verified** (W18)
- [ ] **release readiness = GO or Conditional-GO by Sam**
- [ ] **deploy + rollback plan exists**

**Required evidence for closing any bug ID:** a re-run log or screenshot path proving the fixed
behaviour, a named regression test (or a documented reason none is practical), and a
BUG_REGISTER status update citing that evidence. No closure on assertion alone.

---

## 16. Until then

No deploy · no production cutover · no unsupervised client use. The machine hardens; Sam ships.

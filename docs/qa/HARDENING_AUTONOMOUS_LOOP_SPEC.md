# Hardening Autonomous Loop — Spec

**Status:** 2026-06-28 · Governed by [COMPREHENSIVE_HARDENING_MASTER_PLAN.md](./COMPREHENSIVE_HARDENING_MASTER_PLAN.md).

The repeatable loop. Six stages **A–F**. Each stage names its inputs, outputs, guardrails, and
the **test-only vs product-code** boundary. The loop is driven by the handoff files in
[hardening_loop/](./hardening_loop/); the optional watcher
([HARDENING_WATCH_ORCHESTRATOR_SPEC.md](./HARDENING_WATCH_ORCHESTRATOR_SPEC.md)) only advances
those files — it never replaces them.

```
A Discovery → B Test creation → C Bug logging → D Fix batch → E Regression → F Release readiness
        ↑                                                                         │
        └──────────────────────────  repeat until GO  ───────────────────────────┘
```

**Boundary rule for every stage:** A–C and E are **no-code** (read product, write docs/tests).
**D is the only product-code stage** (Fix Agent, approved IDs) — plus the **Wave 01B**
presentational-only exception. F is docs-only.

---

## A. Discovery
- **Who:** Hardening Controller · Workflow Mapper · SOP Alignment Auditor · UI/UX (01A).
- **Inputs:** [WORKFLOW_MAP_MASTER.md](./WORKFLOW_MAP_MASTER.md), the SOP, the code, existing
  tests, the UI (read-only).
- **Do:** read the workflow map + SOP; inspect code; inspect tests; inspect UI **if safe**;
  identify gaps (missing tests, drift, UI issues, unmapped workflows).
- **Output:** a gap list feeding stage B/C; for unmapped workflows, matrix rows first.
- **Guardrail:** no edits to product code; no live integrations.

## B. Test creation
- **Who:** API Test · Playwright E2E · Security/Role Matrix · UI/UX (01A).
- **Do:** **prefer existing scripts/patterns** (`scripts/batch-a/run-w*.mjs`,
  `scripts/test-critical-paths.mjs`, `e2e/tests/**`); add missing tests following those patterns;
  mark test-only changes clearly; never change product behaviour to make a test pass.
- **Output:** new/updated test-only files + run logs; updated
  [WORKFLOW_TEST_MATRIX.md](./WORKFLOW_TEST_MATRIX.md).
- **Guardrail:** `--write` runs use `BLH TEST` artifacts only; no email/RFQ/PO/live integration;
  shared-`.env` smoke requires the boot-safety flags.

## C. Bug logging
- **Who:** whoever ran the test/audit + Bug Triage.
- **Do:** add each issue to [BUG_REGISTER.md](./BUG_REGISTER.md) with: reproduction · severity ·
  owner module · affected route/screen/table · role + viewport (UI) · expected vs actual ·
  suggested regression/visual test · evidence path · `Type:` token (UI/SOP) · `blocks-deployability`.
- **Output:** BUG_REGISTER entries; Bug Triage ranks + tiers them and proposes a fix batch (IDs).
- **Guardrail:** audit passes **add/annotate only** — never mark fixed/closed.

## D. Fix batch
- **Who:** Fix Agent (approved bug IDs) · UI Polish Agent (Wave 01B, approved plan).
- **Do:** smallest-safe fix for the **named** IDs; add/update a regression test; update
  BUG_REGISTER with fix + verification.
- **Output:** fix result doc + regression evidence + next Claude review packet.
- **Guardrail:** **only** for approved IDs; no broad refactor / rename / schema change; Wave 01B
  is presentational-only and stops+logs on anything beyond presentational.

## E. Regression
- **Who:** Regression Runner.
- **Do:** run the **affected** tests, then the **broader** suite
  (`run-hardening-regression.mjs` / [TEST_REGRESSION_SUITE_01.md](./TEST_REGRESSION_SUITE_01.md));
  rotate P1/P2 trusted-green.
- **Output:** regression log; matrix updates; a bug's status changes **only with evidence**.
- **Guardrail:** no product edits; a new regression → log it (back to C), don't patch silently.

## F. Release readiness
- **Who:** Release Readiness Agent.
- **Do:** update [RELEASE_READINESS.md](./RELEASE_READINESS.md) per-surface **with citations**;
  check the deploy gate (master plan §15): no Critical · no unaccepted High · all P0 pass ·
  role/security pass · full E2E pass · SOP drift fixed/accepted · portal access verified · deploy
  + rollback plan exists.
- **Output:** updated ladder + deploy-gate status; GO decision handed to Sam.
- **Guardrail:** the agent never declares GO or deploys — that's Sam.

---

## Handoff between iterations

1. Claude writes `NEXT_CURSOR_TASK.md` (the approved batch / wave).
2. Cursor executes **only that task**, writes the result doc, updates BUG_REGISTER + matrices,
   updates `CURRENT_STATE.md` + `AUTONOMOUS_LOOP_STATUS.md`, appends `AGENT_HANDOFF_LOG.md`, and
   writes `NEXT_CLAUDE_REVIEW.md`.
3. Claude reviews pass/fail, ranks bugs, writes the next `NEXT_CURSOR_TASK.md`.
4. Loop. Each agent's final reply names the next agent + next task file and asks Sam for nothing
   unless an approval gate is hit.

**Approval gates** (stop + write `SAM_APPROVAL_REQUIRED.md`): see master plan §14. **The loop
exits** when the deploy gate is fully met and Sam says GO.

---

## State machine (next_agent)

```
cursor  → (executes packet) → claude
claude  → (reviews + plans) → cursor
either  → (gate hit)        → sam   (loop halts until Sam acts)
```

`next_agent: sam` or the presence of an active `SAM_APPROVAL_REQUIRED.md` halts any automation.
The machine-readable state block lives at the top of `CURRENT_STATE.md` and
`AUTONOMOUS_LOOP_STATUS.md` (see orchestrator spec).

**Active driving (supervised).** The watcher now *drives* these transitions, not just reports
them: `npm run hardening:watch -- --run-once` preflights, **invokes the `next_agent` via its
configured command template** (`HARDENING_CURSOR_CMD` / `HARDENING_CLAUDE_CMD`), validates the
result, and stops after one handoff; `--interval=N` repeats up to `max_iterations_this_session`.
If the agent's command template is unset, the watcher stops cleanly with an "agent invocation not
configured" blocker (it never fakes a run). Every gate in this spec + the orchestrator spec is
enforced **before** each invocation and the result is **path-validated** after — so automation
never crosses an approval gate, a dirty tree, a forbidden path, or a `server/**`/migrations change.

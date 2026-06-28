# Hardening Watch Orchestrator — Spec

**Status:** 2026-06-28 · Governed by [COMPREHENSIVE_HARDENING_MASTER_PLAN.md](./COMPREHENSIVE_HARDENING_MASTER_PLAN.md).
**Implements:** `scripts/hardening-watch.mjs` (`npm run hardening:watch`).
**Built so far:** `--dry-run` only. `--run-once` and `--interval` are documented + stubbed.

A local scheduled watch process that drives the loop so Cursor/Claude continue without Sam
re-prompting each step. **It does not replace the handoff files** —
[hardening_loop/](./hardening_loop/) (`CURRENT_STATE.md`, `AUTONOMOUS_LOOP_STATUS.md`,
`NEXT_CURSOR_TASK.md`, `NEXT_CLAUDE_REVIEW.md`, `AGENT_HANDOFF_LOG.md`, `SAM_APPROVAL_REQUIRED.md`)
remains the source of truth. The orchestrator only reads them, validates, and (in run modes)
advances them.

---

## 1. The 9-step loop

1. Read the current handoff state.
2. Identify which agent acts next (`next_agent`).
3. Confirm the task is safe to run (task class + gates).
4. Execute the next agent task. *(run modes only)*
5. Wait for the result packet.
6. Validate that expected files were updated.
7. Append to the handoff log.
8. Continue on the next scheduled interval.
9. **Stop immediately if approval is required.**

## 2. Operating mode

- **Local only.** Recommended cadence: **every 15–30 minutes during supervised hardening sessions.**
- **Do not run overnight or fully unattended** until the loop has proven stable across several
  `--run-once` cycles.

## 3. Machine-readable state

The top of `CURRENT_STATE.md` and `AUTONOMOUS_LOOP_STATUS.md` carries a YAML front-matter block
(delimited by `---`). The orchestrator **stops** if these are missing, invalid, or contradictory
between the two files.

```yaml
loop_enabled: true
next_agent: cursor | claude | sam
current_wave: UI-UX-USABILITY-WAVE-01A
current_task_file: docs/qa/hardening_loop/NEXT_CURSOR_TASK.md
fix_mode_allowed: false
product_code_changes_allowed: false
approval_required: false
live_integrations_allowed: false
deploy_allowed: false
max_iterations_this_session: 3
```

**Added field (this implementation):** `expected_branch: portal-v2` — included so the
per-iteration branch preflight is machine-checkable. The orchestrator compares it to
`git branch --show-current`.

**Contradiction examples that halt the loop:** `fix_mode_allowed: true` while
`product_code_changes_allowed: false`; `next_agent` differs between the two state files;
`deploy_allowed: true` (never auto-allowed); `approval_required: true` with `next_agent` ≠ `sam`.

## 4. Safe autonomous task classes

The loop may run autonomously **only** when the task class is one of: no-code audit · doc
update · bug-register update · test-only change · UI Review screenshot capture · visual evidence
indexing · read-only API smoke · lint/build verification · approved presentational UI polish ·
Claude review/planning · Cursor execution of an approved packet.

## 5. Forbidden autonomous task classes

Stop and write `SAM_APPROVAL_REQUIRED.md` before any task involving: Critical/High fix without an
approved bug ID · production-data mutation · live integrations · sending email · RFQ send · PO
generation · Buildxact sync · Xero sync · Dropbox write flow · schema migration · auth/security
logic change · finance calculations · payroll/timesheet approval logic · client-portal invite or
real-client pilot · deploy · destructive command · broad refactor · route/table rename ·
accepted-gap closure · business-workflow decision.

## 6. Per-iteration preflight

Run before any agent task:

```bash
git branch --show-current
git status --short
```

**Stop if:** branch ≠ `expected_branch` · working tree has unrelated dirty files · the previous
task did not write its expected result file · `SAM_APPROVAL_REQUIRED.md` is active ·
`approval_required: true` · `deploy_allowed: false` but the task mentions deploy ·
`live_integrations_allowed: false` but the task mentions a live integration ·
`product_code_changes_allowed: false` but the task allows `src/**`, `server/**`, or
`supabase/migrations/**` · the task file is missing · `next_agent` is unknown · the max iteration
count is reached.

## 7. Result validation (after each run)

Confirm: the expected result doc exists · `AGENT_HANDOFF_LOG.md` was appended ·
`CURRENT_STATE.md` was updated · `AUTONOMOUS_LOOP_STATUS.md` was updated · the next task file was
written for the next agent · the git diff matches allowed paths · the tests listed in the task
either passed or were documented as blocked/gap.

If validation fails → **stop and write** `docs/qa/hardening_loop/ORCHESTRATOR_BLOCKED.md`
(what was expected, what was found, the offending paths).

## 8. Human control

Continue only while:

```yaml
approval_required: false
next_agent: cursor | claude
loop_enabled: true
```

Stop when `next_agent: sam`, or when `SAM_APPROVAL_REQUIRED.md` is active. Sam remains the sole
approval authority.

## 9. Modes + exit codes

| Mode | Behaviour | Status |
|---|---|---|
| `--dry-run` | Read handoff files; parse + validate state; print next agent, wave, task file, allowed/forbidden actions, and any **run-mode blockers**; **run nothing, modify nothing.** | **Built.** |
| `--run-once` | One supervised cycle (preflight → execute → validate → log). | **Stubbed** — "not implemented, supervised build pending". |
| `--interval=N` | Continuous every N min; stops at approval gates/blockers/max-iterations; never deploys, never runs live integrations, never ignores a dirty tree, never self-approves fixes. | **Stubbed.** |

**Exit codes (dry-run):**
- `0` — state valid **and** no run-mode blockers → ready to run.
- `1` — invalid/missing/contradictory state, or a required handoff file is absent → broken setup.
- `2` — state valid but a run-mode blocker is present (dirty tree, active approval gate,
  `next_agent: sam`, etc.) → would not run.

`--dry-run` is a **preview**: it reports blockers (exit 2) rather than acting on them, so it's
safe to inspect setup at any time. In `--run-once`/`--interval`, every §6 stop condition is a
hard stop.

## 10. Build progression

`--dry-run` → prove stable → `--run-once` (several safe cycles) → only then `--interval=30`.
Continuous mode is added **last**, local-only, supervised.

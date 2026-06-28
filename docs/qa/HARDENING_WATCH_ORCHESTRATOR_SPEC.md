# Hardening Watch Orchestrator — Spec

**Status:** 2026-06-28 · Governed by [COMPREHENSIVE_HARDENING_MASTER_PLAN.md](./COMPREHENSIVE_HARDENING_MASTER_PLAN.md).
**Implements:** `scripts/hardening-watch.mjs` (`npm run hardening:watch`).
**Built:** `--dry-run`, `--run-once`, and `--interval=N` (supervised). Agent invocation is
configurable + honest — see §10. Prove `--run-once` before using `--interval`.

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

## 9. Modes + exit codes  *(run-once + interval now BUILT)*

| Mode | Behaviour | Status |
|---|---|---|
| `--dry-run` | Read handoff files; validate state; print next agent/wave/task + allowed/forbidden + **invocation availability** + run-mode blockers; **run nothing, modify nothing.** | **Built.** |
| `--run-once` | One supervised cycle: preflight → **invoke next agent via its command template** → post-run validation → stop. Stops cleanly (no agent run) if invocation is not configured. | **Built.** |
| `--interval=N` | Repeats `--run-once` every N min, up to `max_iterations_this_session`; stops on any non-completed cycle (gate/blocker/dirty/validation/not-configured). Never deploys, never runs live integrations, never self-approves. | **Built (supervised — prove `--run-once` first).** |

**Exit codes (all modes):**
- `0` — dry-run READY · or run-once completed one validated handoff · or interval finished its budget cleanly.
- `1` — invalid/contradictory state config (broken setup).
- `2` — Sam gate / run-mode blocker (`approval_required`, `SAM_APPROVAL_REQUIRED.md` active, `next_agent: sam`, dirty tree, wrong branch, missing task file, unknown agent, `loop_enabled: false`).
- `4` — **agent invocation not configured** — handoff detected, nothing run; exact manual command printed; `ORCHESTRATOR_BLOCKED.md` written. Handoff state preserved (re-run when configured).
- `5` — agent command failed (non-zero exit) → blocker written + `next_agent: sam`.
- `6` — post-run validation failed (result rejected) → blocker written + `next_agent: sam` (+ `approval_required: true` if a forbidden path / behaviour change is implicated).

## 10. Agent invocation — honest + configurable

The watcher **never hardcodes** how to launch Cursor or Claude. It runs **only** what you put in
env command templates, with placeholders `{{TASK_FILE}}`, `{{AGENT}}`, `{{WAVE}}`:

| Env var | Used when | Example template |
|---|---|---|
| `HARDENING_CURSOR_CMD` | `next_agent: cursor` | `cursor-agent --file {{TASK_FILE}}` *(if a Cursor CLI is installed/authed)* |
| `HARDENING_CLAUDE_CMD` | `next_agent: claude` | `claude -p "$(cat {{TASK_FILE}})"` *(Claude Code headless print mode)* |

- **If the relevant template is unset:** the watcher detects the next agent, prints the exact
  packet/command to run manually, writes `ORCHESTRATOR_BLOCKED.md` ("agent invocation not
  configured"), and exits `4`. It does **not** flip `next_agent` — when you configure the
  template (or run the agent by hand and let it update the handoff), re-running resumes.
- **If set:** the template is substituted and run with `stdio: inherit` (output streams live).
  `--run-once` waits for it to finish, then validates.

> Honesty: Cursor's in-IDE agent and Claude Code may or may not be CLI-invokable in a given local
> setup. The watcher does **not** assume — unset templates ⇒ clean "not configured" stop, never a
> false claim of autonomy.

## 11. Path-allow rules (post-run diff validation)

A completed agent must have **committed** its work; the watcher validates the new commit's diff:

- **Always allowed:** `docs/**`, `e2e/**`, `scripts/**`, `src/ui-review/**` (review-only carve-out).
- **`src/**` (non-review) + `package.json`:** allowed **only if** `product_code_changes_allowed: true`.
- **`server/**` + `supabase/migrations/**`:** **always halt for Sam** (validation fails) — the
  watcher never auto-clears server/schema changes, regardless of flags.
- Anything else → halt for Sam.

## 12. Build progression

`--dry-run` (stable) → `--run-once` (several supervised cycles) → only then `--interval=30`.
Continuous mode is local-only, supervised, capped by `max_iterations_this_session`; **not**
overnight/unattended yet.

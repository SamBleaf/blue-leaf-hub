# Hardening Loop — Operator Runbook

**How to run the autonomous hardening loop, supervised.** Governed by
[../HARDENING_WATCH_ORCHESTRATOR_SPEC.md](../HARDENING_WATCH_ORCHESTRATOR_SPEC.md) +
[../COMPREHENSIVE_HARDENING_MASTER_PLAN.md](../COMPREHENSIVE_HARDENING_MASTER_PLAN.md).

> **Honest status (2026-06-29):** no agent CLI is installed on this machine — no `cursor-agent`
> and no working `claude` on PATH. So **fully hands-off, unattended automation is not available
> yet.** The loop runs today in **Mode A (supervised, manual execution)**, which already removes
> the "write the next prompt every step" burden. **Mode B (auto-invoke)** switches on the moment
> a working agent CLI exists — config is pre-wired.

---

## Mode A — supervised, watcher-driven (works today)

**One command drives the loop. The watcher does the thinking; you run the named step.**

```bash
npm run hardening:watch -- --run-once        # or: npm run hardening:watch:once
```

Each run:
1. Preflights (branch, clean tree, gates) and validates the *previous* handoff.
2. Prints the **next agent + packet + allowed/forbidden + any gate**.
3. Since no CLI is configured, it prints **▶ ACTION REQUIRED — run the <AGENT> step** and stops
   (exit 4). **No blocker file is written** — this is the normal manual handoff point.

You then run that one step:
- **`next_agent: cursor`** → run Cursor in the IDE on `NEXT_CURSOR_TASK.md` (or have Claude-in-chat
  execute it). The agent does the work, commits (docs/approved scope), and flips the handoff to
  `next_agent: claude`.
- **`next_agent: claude`** → run the Claude review on `NEXT_CLAUDE_REVIEW.md` (in chat). It reviews,
  writes the next `NEXT_CURSOR_TASK.md`, and flips to `next_agent: cursor`.
- **`next_agent: sam`** → an approval gate. Read `SAM_APPROVAL_REQUIRED.md`, decide, flip the state.

Then re-run the one command. Repeat. You never compose the next prompt — the packets are the prompts.

---

## Mode B — auto-invoke (when an agent CLI is available)

1. `cp scripts/hardening-watch.env.example scripts/hardening-watch.env` (gitignored).
2. Set the template(s) you have a working CLI for, e.g.
   `HARDENING_CLAUDE_CMD=claude -p "$(cat {{TASK_FILE}})" --permission-mode acceptEdits`.
3. **Prove `--run-once` first** — watch it invoke the agent and validate the result. Verify the
   agent's non-interactive edit/commit permissions actually work.
4. Only after several clean `--run-once` cycles, use supervised continuous mode:
   ```bash
   npm run hardening:watch -- --interval=30   # or: npm run hardening:watch:interval
   ```
   It repeats up to `max_iterations_this_session` and stops on any non-completed cycle.
5. **Do not run overnight/unattended.** No cron/launchd is configured by design.

---

## Exit codes

| Code | Meaning | What to do |
|---|---|---|
| 0 | dry-run READY · run-once completed a validated handoff · interval finished its budget | continue |
| 1 | invalid/contradictory state config | fix the YAML in CURRENT_STATE/AUTONOMOUS_LOOP_STATUS |
| 2 | Sam gate / run-mode blocker (approval, `next_agent: sam`, dirty tree, wrong branch, …) | resolve the gate; for dirty tree, commit/stash first |
| 4 | **manual step required** (no auto-invoke configured) — *not a failure* | run the named agent step, then re-run |
| 5 | agent command failed (Mode B) | read `ORCHESTRATOR_BLOCKED.md`; fix; `next_agent` set to sam |
| 6 | post-run validation failed (Mode B) | read `ORCHESTRATOR_BLOCKED.md`; the agent's output was rejected |

---

## Guards always enforced (Mode A and B)

Before any step: right branch · clean tree · `approval_required: false` · no active
`SAM_APPROVAL_REQUIRED.md` · `deploy_allowed: false` · `live_integrations_allowed: false` · valid
task file + agent. After any auto-run: new commit · clean tree · diff within allowed paths
(`server/**` + migrations **always** halt for Sam) · state valid · handoff log appended · next
packet exists. Never deploys, never runs live integrations, never self-approves, never crosses an
approval gate.

## Resuming after a blocker
If `ORCHESTRATOR_BLOCKED.md` exists (Mode B failure), read it, fix the cause, delete it (or set
`active: false`), confirm a clean tree, then `--run-once` again.

## Current state
Run `npm run hardening:watch -- --dry-run` any time to see `next_agent`, current wave, gates, and
invocation availability — it changes nothing.

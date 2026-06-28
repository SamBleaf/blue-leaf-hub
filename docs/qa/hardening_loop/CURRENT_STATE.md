---
loop_enabled: true
next_agent: cursor
current_wave: UI-UX-USABILITY-WAVE-01A
current_task_file: docs/qa/hardening_loop/NEXT_CURSOR_TASK.md
fix_mode_allowed: false
product_code_changes_allowed: false
approval_required: false
live_integrations_allowed: false
deploy_allowed: false
max_iterations_this_session: 3
expected_branch: portal-v2
---

# Hardening Loop — Current State

> Machine-readable state is the YAML front-matter above (parsed by `scripts/hardening-watch.mjs`).
> Human-readable mirror below. Keep both in sync. Governed by
> [../COMPREHENSIVE_HARDENING_MASTER_PLAN.md](../COMPREHENSIVE_HARDENING_MASTER_PLAN.md).

| Field | Value |
|---|---|
| **Branch** | `portal-v2` |
| **Phase / wave** | `UI-UX-USABILITY-WAVE-01A` (no-code UI/UX discovery) |
| **Last completed agent** | Claude Code (Hardening Controller) — planned + scaffolded the loop |
| **Current gate** | Awaiting first Cursor execution of Wave 01A |
| **Open blockers** | None |
| **Next required agent** | **Cursor** → [NEXT_CURSOR_TASK.md](./NEXT_CURSOR_TASK.md) |
| **Release readiness** | Global production **NO-GO**; staff internal **CONDITIONAL GO** (see [../RELEASE_READINESS.md](../RELEASE_READINESS.md)) |
| **Product-code changes allowed?** | **NO** (Wave 01A is no-code) |
| **Approval required?** | No |

**Notes:** 0 open Critical · 0 actionable High. First wave is UI/UX discovery (Sales = reference
standard). Marketing is `PAUSED UNTIL MERGE`. Trust model = Hybrid by risk tier.
**Watcher stays `--dry-run` only** — do not move to `--run-once`/`--interval` until Wave 01A +
the Claude review loop prove stable (Sam, 2026-06-28). Client Portal in 01A = **light-touch
verification only** (see [NEXT_CURSOR_TASK.md](./NEXT_CURSOR_TASK.md) scope note).

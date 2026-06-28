---
loop_enabled: true
next_agent: cursor
current_wave: UI-UX-WAVE-01A-FOLLOWUP
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
> Human-readable mirror below. Governed by
> [../COMPREHENSIVE_HARDENING_MASTER_PLAN.md](../COMPREHENSIVE_HARDENING_MASTER_PLAN.md).

| Field | Value |
|---|---|
| **Branch** | `portal-v2` |
| **Phase / wave** | `UI-UX-WAVE-01A-FOLLOWUP` (no-code diagnosis + test-only CRM coverage) |
| **Last completed agent** | Claude Code — reviewed Wave 01A, triaged 14 findings, prepared 01B plan |
| **Current gate** | None for the follow-up; **Wave 01B polish is gated on Sam approval** (non-blocking) |
| **Open blockers** | UI-FIELD-001/002 deploy-blocking **only if** diagnosis shows a component bug (pending) |
| **Next required agent** | **Cursor** → [NEXT_CURSOR_TASK.md](./NEXT_CURSOR_TASK.md) (`UI-UX-WAVE-01A-FOLLOWUP`) |
| **Release readiness** | Unchanged — global NO-GO; staff internal CONDITIONAL GO |
| **Product-code changes allowed?** | **NO** (follow-up is no-code/test-only) |
| **Approval required?** | No for the follow-up; **Yes** before Wave 01B polish + any Field/Portal code fix |

**Notes:** Wave 01A complete — 14 UI findings (2 provisional-High on Field, pending root-cause).
Watcher stays `--dry-run` only. Marketing `PAUSED UNTIL MERGE`. Client Portal light-touch.
**01B presentational plan prepared and awaiting Sam's one approval** (see
[SAM_APPROVAL_REQUIRED.md](./SAM_APPROVAL_REQUIRED.md) + result doc §6) — it does not block this
follow-up.

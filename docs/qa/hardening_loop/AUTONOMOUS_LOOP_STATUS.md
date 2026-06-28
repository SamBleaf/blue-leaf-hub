---
loop_enabled: true
next_agent: cursor
current_wave: UI-UX-POLISH-WAVE-01B
current_task_file: docs/qa/hardening_loop/NEXT_CURSOR_TASK.md
fix_mode_allowed: false
product_code_changes_allowed: true
approval_required: false
live_integrations_allowed: false
deploy_allowed: false
max_iterations_this_session: 3
expected_branch: portal-v2
---

# Autonomous Loop — Status

> Machine-readable state above must match [CURRENT_STATE.md](./CURRENT_STATE.md). Human mirror below.

| Field | Value |
|---|---|
| **Loop number** | 2 (01B execution) |
| **Current wave** | `UI-UX-POLISH-WAVE-01B` — approved, released to Cursor |
| **Active module(s)** | Items 1–7 presentational; badge (UI-VISUAL-001) sub-batch **last** |
| **Bug IDs in scope (01B)** | UI-NAV-001 · UI-FINANCE-001/002/003 · UI-PORTAL-001 · UI-CRM-002 · UI-SCHEDULE-001 · UI-WORKFORCE-001 · UI-SALES-001 · then UI-VISUAL-001 (last) |
| **Accepted gap** | UI-TENDER-001 (Sam 2026-06-29) |
| **Closed prior** | UI-FIELD-001/002 · UI-PORTAL-002 · UI-CRM-001 |
| **Tests baseline** | `test:ui-review` 171/171 |
| **Fix mode allowed?** | No (presentational lane via `product_code_changes_allowed`) |
| **Sam approval required?** | No (01B approved); **Yes** before any behaviour/API/schema fix |

**Guards:** presentational-only; live integrations + deploy disabled; watcher dry-run only;
Marketing paused. **Iteration budget:** 3.

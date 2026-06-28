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

# Autonomous Loop — Status

> Machine-readable state above must match [CURRENT_STATE.md](./CURRENT_STATE.md) (the orchestrator
> halts on contradiction). Human-readable mirror below.

| Field | Value |
|---|---|
| **Loop number** | 1 |
| **Current wave** | `UI-UX-USABILITY-WAVE-01A` |
| **Active workflow / module** | UI/UX across all modules (priority: Sales → … → CRM; Marketing paused) |
| **Bug IDs in scope** | none yet (Wave 01A discovers + logs `UI-<MODULE>-###`) |
| **Tests passed** | — |
| **Tests failed** | — |
| **Tests gap** | UI usability/visual coverage = 0 (this wave creates it) |
| **Fix mode allowed?** | **No** (01A is no-code; 01B unlocks only after Sam approves the 01A plan) |
| **Sam approval required?** | No (for 01A); **Yes** before Wave 01B polish |

**Iteration budget:** `max_iterations_this_session: 3`. Stop on `next_agent: sam` or an active
`SAM_APPROVAL_REQUIRED.md`.

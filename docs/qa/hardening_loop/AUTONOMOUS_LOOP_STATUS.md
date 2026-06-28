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

# Autonomous Loop — Status

> Machine-readable state above must match [CURRENT_STATE.md](./CURRENT_STATE.md). Human mirror below.

| Field | Value |
|---|---|
| **Loop number** | 1 |
| **Current wave** | `UI-UX-WAVE-01A-FOLLOWUP` (after `UI-UX-USABILITY-WAVE-01A` complete) |
| **Active workflow / module** | Field (diagnosis) · Client Portal feed (diagnosis) · CRM (coverage) |
| **Bug IDs in scope** | UI-FIELD-001, UI-FIELD-002, UI-PORTAL-002, UI-CRM-001 (+ UI-WORKFORCE-001 fixture) |
| **Tests passed** | Wave 01A: `test:ui-review` 156/162 |
| **Tests failed** | 6 — field-whs/field-diary × 3 viewports (under diagnosis) |
| **Tests gap** | CRM coverage (being added, test-only) |
| **Fix mode allowed?** | **No** |
| **Sam approval required?** | No for follow-up; **Yes** before Wave 01B polish + any confirmed Field/Portal code fix |

**01B status:** plan prepared (presentational-only), **awaiting Sam approval** — see
[SAM_APPROVAL_REQUIRED.md](./SAM_APPROVAL_REQUIRED.md). Non-blocking to the follow-up.
**Iteration budget:** 3.

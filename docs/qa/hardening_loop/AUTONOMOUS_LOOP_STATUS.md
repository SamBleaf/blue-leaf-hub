---
loop_enabled: true
next_agent: cursor
current_wave: SOP-MODULE-AUDIT-WAVE-01
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
| **Loop number** | 3 (SOP audit) |
| **Current wave** | `SOP-MODULE-AUDIT-WAVE-01` — no-code SOP-vs-module audit |
| **Active scope** | SOP folders 02→11 (lead→handover journey); Marketing SOPs excluded (paused) |
| **Bug IDs in scope** | new `SOP-DRIFT` / `TRAINING-GAP` / app-bug findings as discovered |
| **UI lane** | 01A + follow-up + 01B **complete & accepted**; UI-VISUAL-001 partial/deferred |
| **Tests baseline** | `test:ui-review` 171/171 |
| **Fix mode allowed?** | No |
| **Sam approval required?** | No (no-code audit); **Yes** before any product-code wave |

**Deferred (needs Sam, product-code):** UI-VISUAL-001 full badge rollout (01C, Low, sequence-last).
**Guards:** live integrations + deploy disabled; watcher dry-run only; Marketing paused.
**Iteration budget:** 3.

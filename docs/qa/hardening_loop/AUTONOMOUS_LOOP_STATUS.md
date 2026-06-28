---
loop_enabled: true
next_agent: cursor
current_wave: SOP-DOCS-WAVE-02
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
| **Loop number** | 5 (SOP Wave 02, no-code) |
| **Current wave** | `SOP-DOCS-WAVE-02` — released to Cursor |
| **Scope** | Sales rewrite · RFQ nav · §14 backfill (07, 10) · portal legacy/v2 matrix (v2 canonical) · WHS 08-07 |
| **Sam decisions** | PORTAL-STACK = v2 canonical · WHS-SETUP = write 08-07 |
| **Deferred (logged, non-blocking)** | SOP-BUG-02-07 · -05-05 · -07-03 · -09-JOBVIEW · -11-12 (no Fix Agent yet) |
| **Fix mode allowed?** | No |
| **Sam approval required?** | No (no-code wave); **Yes** if a deferred bug is later escalated to Fix Agent |

**Guards:** product code OFF · live integrations OFF · deploy OFF · Marketing paused · watcher
dry-run/run-once only. **Iteration budget:** 3.

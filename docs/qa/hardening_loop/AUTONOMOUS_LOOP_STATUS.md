---
loop_enabled: true
next_agent: cursor
current_wave: SOP-DOCS-WAVE-02B
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
| **Loop number** | 6 (SOP Wave 02A done → 02B) |
| **Current wave** | `SOP-DOCS-WAVE-02B` — no-code SOP rewrite continuation |
| **Wave 02A delivered** | SOP 08-07 WHS Setup (full template + §14); `SAM-SOP-002` closed |
| **02B scope** | 11_portal v2 rewrite (High SEC14-11) · 07 §14 renumber + 07-03 fix · 02_sales Pass 3A · 04_rfq nav · 10_workforce §14 |
| **Deferred (logged)** | SOP-BUG-02-07 · -05-05 · -07-03 · -09-JOBVIEW · -11-12 (no Fix Agent) |
| **Fix mode allowed?** | No |
| **Sam approval required?** | No (no-code wave); Yes to escalate any deferred bug to Fix Agent |

**Guards:** product code OFF · live integrations OFF · deploy OFF · Marketing paused · watcher
dry-run/run-once only. **Iteration budget:** 3.

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

# Hardening Loop — Current State

> Machine-readable state above (parsed by `scripts/hardening-watch.mjs`). Human mirror below.

| Field | Value |
|---|---|
| **Branch** | `portal-v2` |
| **Phase / wave** | `SOP-DOCS-WAVE-02B` (no-code SOP rewrite — continuation; 02A done) |
| **Last completed agent** | Cursor — Wave 02A: wrote SOP 08-07 (WHS Setup); split wave for size |
| **Current gate** | None — 02B is no-code (same Sam-approved wave family) |
| **Open blockers** | None (deploy-gate SOP/training drift being cleared by Wave 02B) |
| **Next required agent** | **Cursor** → [NEXT_CURSOR_TASK.md](./NEXT_CURSOR_TASK.md) (`SOP-DOCS-WAVE-02B`) |
| **Approval required?** | No (no-code). **Yes** if a deferred app bug is escalated to Fix Agent |
| **Product-code changes allowed?** | **No** |

**Wave 02A:** SOP **08-07** (WHS Setup) created — `SAM-SOP-002` closed. Sharper diagnosis:
`SOP-DRIFT-SEC14-07` is a §12→§14 renumber + 07-03 content drift (not missing). **Wave 02B priority:**
portal v2-canonical rewrite (**High `SOP-DRIFT-SEC14-11`**) → site-diary §14 + 07-03 → sales Pass 3A →
RFQ nav → workforce §14. Marketing `PAUSED`. Watcher dry-run/run-once only. 5 app bugs deferred.

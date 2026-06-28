---
loop_enabled: true
next_agent: claude
current_wave: UI-UX-POLISH-WAVE-01B
current_task_file: docs/qa/hardening_loop/NEXT_CLAUDE_REVIEW.md
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
> Governed by [../COMPREHENSIVE_HARDENING_MASTER_PLAN.md](../COMPREHENSIVE_HARDENING_MASTER_PLAN.md).

| Field | Value |
|---|---|
| **Branch** | `portal-v2` |
| **Phase / wave** | `UI-UX-POLISH-WAVE-01B` — **COMPLETE** (Cursor, 2026-06-28) |
| **Last completed agent** | Cursor — 01B presentational polish (items 1–8) |
| **Current gate** | Claude review → [NEXT_CLAUDE_REVIEW.md](./NEXT_CLAUDE_REVIEW.md) |
| **Open blockers** | None |
| **Next required agent** | **Claude** — review 01B, plan next wave |
| **Approval required?** | No (01B complete; Claude review lane — Sam gate before *next* product-code wave) |
| **Product-code changes allowed?** | **No** (01B complete; revert to docs/review lane) |

**01B closed IDs:** UI-NAV-001 · UI-FINANCE-001/002/003 · UI-PORTAL-001 · UI-CRM-002 · UI-SCHEDULE-001 · UI-WORKFORCE-001 · UI-SALES-001 · UI-VISUAL-001 (partial). **Accepted gap:** UI-TENDER-001. Marketing `PAUSED UNTIL MERGE`. Watcher `--dry-run` only.

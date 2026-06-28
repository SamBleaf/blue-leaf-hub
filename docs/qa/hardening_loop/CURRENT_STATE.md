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

# Hardening Loop — Current State

> Machine-readable state above (parsed by `scripts/hardening-watch.mjs`). Human mirror below.
> Governed by [../COMPREHENSIVE_HARDENING_MASTER_PLAN.md](../COMPREHENSIVE_HARDENING_MASTER_PLAN.md).

| Field | Value |
|---|---|
| **Branch** | `portal-v2` |
| **Phase / wave** | `SOP-MODULE-AUDIT-WAVE-01` (no-code SOP-vs-module audit) |
| **Last completed agent** | Claude Code — **accepted 01B** (scope verified from diff; lint re-run; 0 deploy-blocking UI bugs) |
| **Current gate** | None — SOP audit is no-code/no-approval |
| **Open blockers** | None |
| **Next required agent** | **Cursor** → [NEXT_CURSOR_TASK.md](./NEXT_CURSOR_TASK.md) (`SOP-MODULE-AUDIT-WAVE-01`) |
| **Approval required?** | No (no-code wave). **Yes** before any product-code wave (Fix Agent / UI-VISUAL-001 01C) |
| **Product-code changes allowed?** | **No** (audit wave) |

**UI lane status:** 01A + follow-up + 01B complete. Modules **UI LOCKED**: Sales, Operations,
Procurement, Finance, CRM, Schedule, Workforce, Client Portal, Worker. Tender **CONDITIONAL**
(UI-TENDER-001 accepted gap). **UI-VISUAL-001 partial/deferred** (badge rollout = future 01C,
product-code, Low, needs approval). Marketing `PAUSED UNTIL MERGE`. Watcher `--dry-run` only;
live integrations + deploy disabled.

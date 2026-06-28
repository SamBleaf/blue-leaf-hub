---
loop_enabled: true
next_agent: sam
current_wave: UI-UX-POLISH-WAVE-01B
current_task_file: docs/qa/hardening_loop/SAM_APPROVAL_REQUIRED.md
fix_mode_allowed: false
product_code_changes_allowed: false
approval_required: true
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
| **Phase / wave** | `UI-UX-POLISH-WAVE-01B` — **staged, HALTED at Sam gate** |
| **Last completed agent** | Claude Code — reviewed Wave 01A follow-up; resolved control check; finalized 01B plan |
| **Current gate** | **Sam** → [SAM_APPROVAL_REQUIRED.md](./SAM_APPROVAL_REQUIRED.md) (01B approval + accepted-gaps) |
| **Open blockers** | **BLOCKER 0** — unrelated uncommitted product edits (`server/lib/scheduleRoutes.mjs`, `src/components/schedule/ScheduleSheet.jsx`) must be cleared for a clean tree |
| **Next required agent** | **Sam** (approve 01B + clear blocker), then **Cursor** runs staged 01B |
| **Approval required?** | **Yes** — Wave 01B is product-code polish |
| **Product-code changes allowed?** | **NO** (until Sam approves 01B → flip to yes) |

**Notes:** Wave 01A + follow-up complete. UI Review **171/171**. Field NO-GO **lifted**
(fixture-only). Portal-002 closed (live feed verified). CRM assessed (CONDITIONAL). **0
deploy-blocking UI bugs open.** Control check: `src/ui-review/**` is review-only → allowed
test-only path (master plan §4). Watcher stays `--dry-run` only; Marketing `PAUSED UNTIL MERGE`.

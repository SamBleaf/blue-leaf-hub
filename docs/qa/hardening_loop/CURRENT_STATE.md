---
loop_enabled: true
next_agent: claude
current_wave: SOP-MODULE-AUDIT-WAVE-01
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

| Field | Value |
|---|---|
| **Branch** | `portal-v2` |
| **Phase / wave** | `SOP-MODULE-AUDIT-WAVE-01` — **COMPLETE** (Cursor, 2026-06-29) |
| **Last completed agent** | Cursor — 71 SOPs audited (folders 02–11), 8 SOP text fixes |
| **Current gate** | Claude review → [NEXT_CLAUDE_REVIEW.md](./NEXT_CLAUDE_REVIEW.md) |
| **Open blockers** | None (SOP drift logged; deploy training gate open) |
| **Next required agent** | **Claude** |
| **Approval required?** | No (audit wave). **Yes** before Fix Agent / Sam ACCEPTED-GAP decisions |
| **Product-code changes allowed?** | **No** |

**UI lane:** complete (01B). **SOP lane:** Wave 01 done; Wave 02 recommended (Sales + RFQ + §14 backfill). Marketing `PAUSED`. Watcher `--dry-run` only.

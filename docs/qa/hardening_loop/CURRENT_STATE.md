---
loop_enabled: true
next_agent: cursor
current_wave: UI-UX-POLISH-WAVE-01B
current_task_file: docs/qa/hardening_loop/NEXT_CURSOR_TASK.md
fix_mode_allowed: false
product_code_changes_allowed: true
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
| **Phase / wave** | `UI-UX-POLISH-WAVE-01B` — **APPROVED & RELEASED to Cursor** (Sam, 2026-06-29) |
| **Last completed agent** | Sam — approved 01B (items 1–7 + badge last); BLOCKER 0 cleared (`d7dbd3e`) |
| **Current gate** | None — Cursor may run the 01B packet |
| **Open blockers** | **None** (tree clean) |
| **Next required agent** | **Cursor** → [NEXT_CURSOR_TASK.md](./NEXT_CURSOR_TASK.md) (`UI-UX-POLISH-WAVE-01B`) |
| **Approval required?** | No (01B approved) |
| **Product-code changes allowed?** | **YES — limited to approved presentational UI only** (01B packet scope; stop+log on anything beyond presentational) |

**Scope guards (Sam 2026-06-29):** presentational only — **no** behaviour / API / auth / schema /
calc / mutation / RFQ / PO / Buildxact / Xero / Dropbox / Gmail / Resend / WHS / workforce-logic /
client-portal-access / **schedule-logic** changes (do not touch the just-landed commit-on-blur
logic). Shared badge (UI-VISUAL-001) runs **last as its own sub-batch** after items 1–7 pass
screenshots. UI-TENDER-001 **accepted as a gap**. Marketing `PAUSED UNTIL MERGE`. Watcher stays
`--dry-run` only. Live integrations + deploy **disabled**.

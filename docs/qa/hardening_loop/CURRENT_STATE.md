---
loop_enabled: true
next_agent: cursor
current_wave: SOP-DOCS-WAVE-03
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
| **Phase / wave** | `SOP-DOCS-WAVE-03` (no-code SOP compliance — folders 12–17) |
| **Last completed agent** | Claude (loop controller) — reviewed + shipped **Wave 02B** (Sonnet execution agents) |
| **Current gate** | None — 03 is no-code (same SOP-docs family; Marketing 18/19 stays PAUSED) |
| **Open blockers** | None. Deploy-gate SOP drift (`SEC14-11`, `SEC14-07`, `02-SALES`) CLOSED by 02B |
| **Next required agent** | **Cursor** → [NEXT_CURSOR_TASK.md](./NEXT_CURSOR_TASK.md) (`SOP-DOCS-WAVE-03`) |
| **Approval required?** | No (no-code). **Yes** if a deferred app bug is escalated to Fix Agent |
| **Product-code changes allowed?** | **No** |

**Wave 02B (DONE, 2026-07-02):** portal v2-canonical + stack matrix (`SEC14-11` HIGH closed) · site-diary
§14 + 07-03 view-only (`SEC14-07` closed) · sales 02-01..07 rewritten to Pass 3A (`02-SALES` closed) ·
RFQ 04-02..09 Engine-vs-QuoteTracker nav · workforce 10-01 §14. All test scripts normalised to §14.
Committed `14b681b` (02B-i) + `d6e49da` (02B-ii). Docs-only; guard verified; product WIP quarantined in stash.

**Wave 03 scope:** SOP §14 compliance + accuracy sweep for folders **12_admin_settings · 13_subcontractors ·
14_cost_intelligence · 15_carpentry · 16_procurement · 17_crm_mailing_list**. Marketing (18/19) PAUSED.
Watcher dry-run/run-once only. 5 app bugs still deferred (no Fix Agent).

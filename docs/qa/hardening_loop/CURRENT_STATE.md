---
loop_enabled: true
next_agent: sam
current_wave: E2E-REVERIFY-01
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
| **Phase / wave** | `SOP-DOCS-WAVE-04` (no-code SOP §14 sweep — remaining folders) |
| **Last completed agent** | Claude (loop controller) — reviewed + shipped **Wave 03** (folders 12–17) via Sonnet agents |
| **Current gate** | None — 04 is no-code. **Session budget (3) SPENT** — do not auto-run; resume next session |
| **Open blockers** | None. SOP deploy-gate drift CLOSED. Product bugs surfaced during 02B/03 logged (deferred) |
| **Next required agent** | **Cursor** → [NEXT_CURSOR_TASK.md](./NEXT_CURSOR_TASK.md) (`SOP-DOCS-WAVE-04`) |
| **Approval required?** | No (no-code). Marketing (18/19) unpause + any Fix-Agent batch = Sam-gated |
| **Product-code changes allowed?** | **No** |

**Waves 02B + 03 (DONE, 2026-07-02):** deploy-gate SOP drift closed (`SEC14-11`, `SEC14-07`, `02-SALES`);
folders **02, 04, 07, 08(07), 10, 11** (02B) + **12, 13, 14, 15, 16, 17** (03) brought to the 14-section
template (test script §14) + accuracy vs real components. Commits `14b681b`, `d6e49da`, `b8758f1`,
`9fcf0ff`, `099580c`. Docs-only throughout; guard verified; product WIP quarantined + dropped.

**Wave 04 scope (next session):** §14 + accuracy sweep for the SOP folders NOT yet in a 02B/03 wave —
**00_getting_started · 01_global_navigation · 03_tendering · 05_operations · 06_scheduling ·
09_finance** (+ any residual 08_whs SOPs beyond 08-07). Marketing **18/19 stays PAUSED** (Sam-gated).
Watcher dry-run/run-once only. 5 original app bugs + new product bugs (see BUG_REGISTER / changelog) deferred.

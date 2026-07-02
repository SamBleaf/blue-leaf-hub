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

# Autonomous Loop — Status

> Machine-readable state above must match [CURRENT_STATE.md](./CURRENT_STATE.md). Human mirror below.

| Field | Value |
|---|---|
| **Loop number** | 8 (Waves 02B + 03 done → 04) |
| **Current wave** | `SOP-DOCS-WAVE-04` — no-code SOP §14 sweep, remaining folders (NEXT SESSION) |
| **Wave 03 delivered** | folders 12–17 (31 SOPs) to the 14-section template + accuracy. Commits `9fcf0ff`, `099580c` |
| **04 scope** | 00_getting_started · 01_global_navigation · 03_tendering · 05_operations · 06_scheduling · 09_finance (+ residual 08_whs). Marketing 18/19 PAUSED |
| **Deferred (logged)** | Original: SOP-BUG-02-07 · -05-05 · -07-03 · -09-JOBVIEW · -11-12. New from 02B/03 (product, Sam-gated): consent fields ignored on contact create; dead `QuoteTracker.jsx`; no conversation read-view; Blueprint extended-chat; pretender_estimates dup-insert (no idempotency); benchmarks-tab naming; mig 092 not in CLAUDE.md table |
| **Fix mode allowed?** | No |
| **Sam approval required?** | No (no-code wave). Yes to: unpause Marketing 18/19, or escalate any deferred bug to a Fix-Agent batch |

**Guards:** product code OFF · live integrations OFF · deploy OFF · Marketing (18/19) paused · watcher
dry-run/run-once only. **Executed via Sonnet background agents under Claude (loop controller) review.**
**Iteration budget: 3 — SPENT this session** (02B, 03-i, 03-ii). Resume Wave 04 next session.

**SOP §14-compliance coverage:** folders 02, 04, 07, 08(07), 10, 11, 12, 13, 14, 15, 16, 17 are now
14-section compliant (test script §14). Remaining for Wave 04: 00, 01, 03, 05, 06, 09 (+ residual 08).
Marketing 18/19 paused. The deploy-gate "SOP drift fixed or accepted" is **substantially met**.

---
loop_enabled: true
next_agent: sam
current_wave: SOP-DOCS-WAVE-02
current_task_file: docs/qa/hardening_loop/SAM_APPROVAL_REQUIRED.md
fix_mode_allowed: false
product_code_changes_allowed: false
approval_required: true
live_integrations_allowed: false
deploy_allowed: false
max_iterations_this_session: 3
expected_branch: portal-v2
---

# Autonomous Loop — Status

> Machine-readable state above must match [CURRENT_STATE.md](./CURRENT_STATE.md). Human mirror below.

| Field | Value |
|---|---|
| **Loop number** | 4 (SOP Wave 01 reviewed) |
| **Current wave** | `SOP-DOCS-WAVE-02` — staged, awaiting Sam |
| **Reviewed** | SOP-MODULE-AUDIT-WAVE-01: scope PASS (docs-only); numbers verified (7 SOP fixes, not 8) |
| **App bugs (Fix Agent, Sam-gated)** | SOP-BUG-02-07 · -05-05 · -07-03 · -09-JOBVIEW · -11-12 (all Med/Low, non-blocking) |
| **Accepted-gap candidates (Sam)** | SOP-GAP-PORTAL-STACK (training-blocking) · SOP-GAP-WHS-SETUP |
| **Deploy blockers** | 0 code; SOP/training: SEC14-11 (High), SEC14-07, PORTAL-STACK, P0 Sales/RFQ drift |
| **Fix mode allowed?** | No |
| **Sam approval required?** | **Yes** — decisions + Fix batch; Wave 02 (no-code) recommended |

**Watcher:** run-once built (supervised); interval **not** enabled. Live integrations + deploy
disabled. Marketing paused. **Iteration budget:** 3.

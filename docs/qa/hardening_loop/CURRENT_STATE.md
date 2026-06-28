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

# Hardening Loop — Current State

> Machine-readable state above (parsed by `scripts/hardening-watch.mjs`). Human mirror below.

| Field | Value |
|---|---|
| **Branch** | `portal-v2` |
| **Phase / wave** | `SOP-DOCS-WAVE-02` — **staged, HALTED at Sam gate** |
| **Last completed agent** | Claude Code — reviewed SOP Wave 01 (scope PASS, docs-only) |
| **Current gate** | **Sam** → [SAM_APPROVAL_REQUIRED.md](./SAM_APPROVAL_REQUIRED.md) (PORTAL-STACK + WHS-SETUP decisions; Fix-Agent batch; greenlight Wave 02) |
| **Open blockers** | SOP/training deploy-gate drift (`SOP-DRIFT-SEC14-11` High; PORTAL-STACK) — no-code Wave 02 + Sam decision |
| **Next required agent** | **Sam** (decide), then **Cursor** runs staged `SOP-DOCS-WAVE-02` |
| **Approval required?** | **Yes** — app-bug Fix batch (product code) + 2 accepted-gap decisions |
| **Product-code changes allowed?** | **No** (Wave 02 is no-code; app-bug fixes are a separate Sam-gated packet) |

**SOP Wave 01:** 71 audited · 7 SOPs fixed · §14 26/20/25 · **5 app bugs (all Med/Low,
non-blocking)** · 2 accepted-gap candidates. **0 code deploy-blockers.** UI lane complete (01B).
Marketing `PAUSED`. Watcher: dry-run + run-once built; **interval not enabled yet**.

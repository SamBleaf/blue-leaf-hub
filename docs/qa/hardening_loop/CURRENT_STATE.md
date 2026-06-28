---
loop_enabled: true
next_agent: cursor
current_wave: SOP-DOCS-WAVE-02
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
| **Phase / wave** | `SOP-DOCS-WAVE-02` — **RELEASED to Cursor** (Sam, 2026-06-29) |
| **Last completed agent** | Sam — decided PORTAL-STACK (v2 canonical) + WHS-SETUP (write 08-07); deferred 5 app bugs; greenlit Wave 02 |
| **Current gate** | None — Cursor may run the no-code Wave 02 packet |
| **Open blockers** | None (SOP/training drift addressed by Wave 02; portal decision made) |
| **Next required agent** | **Cursor** → [NEXT_CURSOR_TASK.md](./NEXT_CURSOR_TASK.md) (`SOP-DOCS-WAVE-02`, no-code) |
| **Approval required?** | No |
| **Product-code changes allowed?** | **No** (Wave 02 is docs-only) |

**Sam decisions (2026-06-29):** Portal **v2 canonical** (v1 = legacy/fallback, must be labelled);
WHS-SETUP → **write SOP 08-07**; **5 app bugs DEFERRED** (logged, non-blocking — no Fix Agent yet).
**Wave 02 scope:** Sales rewrite · RFQ nav · §14 backfill 07/10 · portal legacy/v2 matrix (v2
canonical) · WHS 08-07. Marketing `PAUSED`. No product code · no live integrations · no deploy.
Watcher dry-run/run-once only (interval not enabled). If any deferred bug becomes deploy-blocking,
bring it back as a specific Fix-Agent approval packet.

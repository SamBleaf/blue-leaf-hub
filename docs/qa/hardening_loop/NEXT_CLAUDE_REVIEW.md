# NEXT CLAUDE REVIEW

**Status:** PENDING — fires after Cursor completes `UI-UX-USABILITY-WAVE-01A`.
**Issued by:** Claude Code (Hardening Controller), 2026-06-28 · **Governed by**
[../AUTONOMOUS_HARDENING_AGENT_PLAYBOOK.md](../AUTONOMOUS_HARDENING_AGENT_PLAYBOOK.md)
(Hardening Controller + Bug Triage).

## Review task
Review the Wave 01A discovery output and turn it into a ranked, Sam-ready **module-polish plan**.

## Files / results to inspect
- [../ui_review/UI_UX_DISCOVERY_WAVE_01_RESULT.md](../ui_review/UI_UX_DISCOVERY_WAVE_01_RESULT.md)
- [../ui_review/UI_MODULE_LOCK_MATRIX.md](../ui_review/UI_MODULE_LOCK_MATRIX.md)
- [../ui_review/UI_SCREEN_EVIDENCE_INDEX.md](../ui_review/UI_SCREEN_EVIDENCE_INDEX.md)
- New `UI-<MODULE>-###` entries in [../BUG_REGISTER.md](../BUG_REGISTER.md)
- [AGENT_HANDOFF_LOG.md](./AGENT_HANDOFF_LOG.md) (what Cursor reported)

## Questions to answer
1. Which modules are **UI NO-GO** (deploy-blocking) vs **CONDITIONAL** vs **LOCKED**?
2. Which findings are genuinely **presentational** (Wave 01B) vs need **behaviour/API/auth/calc**
   (Fix Agent under normal approval)?
3. Is evidence coverage sufficient per module (desktop + mobile good/empty at minimum)? Gaps?
4. Any demo/live masking risks that hide a live-empty state? (Elevate severity.)
5. Did anything stray outside no-code scope? (It should not have.)

## Decisions needed (→ Sam)
- **Approve the Wave 01B module-polish plan** (one approval unlocks presentational auto-run).
- Accept or reject any proposed `ACCEPTED-GAP` items.

## Next plan to produce
- Write the **module-polish plan** table (module · blocking IDs · proposed presentational fixes ·
  risk) into the result doc + a `SAM_APPROVAL_REQUIRED.md` if 01B is to start.
- If approved: write `NEXT_CURSOR_TASK.md` = `UI-UX-POLISH-WAVE-01B` (presentational-only,
  approved modules, preserve-behaviour list, stop+log rule).
- If not yet approved: set `next_agent: sam` and halt the loop.

## Output
Update [CURRENT_STATE.md](./CURRENT_STATE.md) + [AUTONOMOUS_LOOP_STATUS.md](./AUTONOMOUS_LOOP_STATUS.md),
append [AGENT_HANDOFF_LOG.md](./AGENT_HANDOFF_LOG.md), write the next packet.

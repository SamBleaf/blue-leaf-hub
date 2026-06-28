# NEXT CLAUDE REVIEW

**Status:** PENDING — fires after Cursor completes `SOP-MODULE-AUDIT-WAVE-01`.
**Issued by:** Claude Code (Hardening Controller), 2026-06-29.

> Prior review (01B) is CONSUMED — verdict **01B ACCEPTED** recorded in
> [../ui_review/UI_UX_POLISH_WAVE_01B_RESULT.md](../ui_review/UI_UX_POLISH_WAVE_01B_RESULT.md)
> "Claude review verdict".

## Review task (after SOP audit lands)
Review the SOP-vs-module audit output and turn it into the next step.

## Files to inspect
- `docs/qa/SOP_MODULE_AUDIT_WAVE_01_RESULT.md`
- New `SOP-DRIFT` / `TRAINING-GAP` / app-bug entries in [../BUG_REGISTER.md](../BUG_REGISTER.md)
- SOP text fixes + `docs/sops/SOP_INDEX.md` / `SOP_CHANGELOG.md`
- [AGENT_HANDOFF_LOG.md](./AGENT_HANDOFF_LOG.md)

## Questions to answer
1. Which findings are **SOP-DRIFT** (doc fixed in-wave) vs **app bugs** (→ Fix Agent, Sam-gated)
   vs **TRAINING-GAP** vs **ACCEPTED-GAP candidates** (→ Sam)?
2. Any **deploy-blocking** drift (a staff role can't run the journey from the SOP)?
3. Did every audited SOP get a valid **Section 14**?
4. Did anything stray outside no-code scope? (It should not have.)

## Likely next steps
- Present ACCEPTED-GAP candidates + any app-bug Fix-Agent packet to Sam (gated).
- Continue SOP audit (`-WAVE-02`: folders 12–17) if 01 was scoped/split.
- Or move to **P0 E2E re-verification** (Hybrid-by-risk) once SOP drift is logged.

## Output
Update state files, append handoff log, write the next packet.

# NEXT CLAUDE REVIEW

**Status:** PENDING — fires after Cursor completes `SOP-DOCS-WAVE-02`.
**Issued by:** Claude Code (Hardening Controller), 2026-06-29.

> Prior review (SOP Wave 01) CONSUMED — verdict in `SOP_MODULE_AUDIT_WAVE_01_RESULT.md` §
> "Claude review verdict" + BUG_REGISTER triage. Sam decisions recorded (`SAM-SOP-001/002`);
> 5 app bugs deferred; Wave 02 released.

## Review task (after Wave 02 lands)
Review the no-code SOP rewrite + §14 backfill output.

## Files to inspect
- `docs/qa/SOP_DOCS_WAVE_02_RESULT.md`
- Rewritten SOPs in `docs/sops/{02_sales,04_rfq_engine,07_site_diary,10_workforce,11_client_portal,08_whs,03_tendering}/`
- `docs/sops/SOP_INDEX.md` (`test_status`) + `docs/sops/SOP_CHANGELOG.md`
- BUG_REGISTER `SOP-DRIFT-*` / `SOP-DRIFT-SEC14-*` status changes

## Questions
1. Scope held (docs-only, no product code)?
2. Were the deploy-blocking SOP-DRIFT items closed — esp. **SEC14-11** (portal, High) and **SEC14-07** (site diary)?
3. Is portal SOP set now correct: **v2 canonical**, v1 labelled legacy/fallback, canonical/legacy stated where both exist?
4. Was **SOP 08-07** created?
5. §14 backfilled for 07 + 10? New §14 completion count?
6. Does the deploy gate "SOP drift fixed or accepted" now move toward met? What remains (e.g. Wave 03 folders 12–17)?

## Likely next steps
- If SOP drift mostly closed → recommend **SOP Wave 03** (folders 12–17) or **P0 E2E re-verification**.
- If any deferred app bug now blocks → raise a specific Fix-Agent approval packet (Sam-gated).

## Output
Update state files, append handoff log, write the next packet.

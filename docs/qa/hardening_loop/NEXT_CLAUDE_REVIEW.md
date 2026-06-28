# NEXT CLAUDE REVIEW

**Status:** PENDING — fires after Cursor completes `SOP-DOCS-WAVE-02B` (the remainder of the wave).
**Issued by:** Cursor (Wave 02A), 2026-06-29.

> Wave 02A consumed: SOP **08-07** written (`SAM-SOP-002` closed); diagnosis sharpened
> (SEC14-07 = §12→§14 renumber + 07-03 content drift). See `SOP_DOCS_WAVE_02_RESULT.md`.

## Review task (after 02B lands)
Review the full SOP Wave 02 output (02A + 02B) and decide the next hardening step.

## Files to inspect
- `docs/qa/SOP_DOCS_WAVE_02_RESULT.md` (02B section)
- Rewritten SOPs: `docs/sops/{11_client_portal,07_site_diary,02_sales,04_rfq_engine,10_workforce}/**`
- `docs/sops/08_whs/08-07_whs_setup.md` (02A — spot-check)
- `SOP_INDEX.md` (`test_status`) + `SOP_CHANGELOG.md`
- BUG_REGISTER `SOP-DRIFT-*` / `SOP-DRIFT-SEC14-*` status changes

## Questions
1. Scope held (docs-only; no product code; 5 app bugs still deferred, not fixed)?
2. **Closed the High `SOP-DRIFT-SEC14-11`?** Is the portal set now v2-canonical with a clear v1/v2
   matrix and v1 labelled legacy/fallback (per `SAM-SOP-001`)?
3. `SOP-DRIFT-SEC14-07` closed (§14 renumber) and 07-03 corrected to view-only (SOP-BUG-07-03 still
   deferred, flagged not fixed)?
4. 02_sales rewritten to real Pass 3A UX? 04_rfq nav corrected to Quote Tracker?
5. Does the deploy gate "SOP drift fixed or accepted" now move toward met? What remains (folders
   12–17 = SOP Wave 03)?

## Likely next steps
- If SOP drift substantially closed → recommend **SOP Wave 03** (12–17) or pivot to **P0 E2E
  re-verification** (Hybrid-by-risk) toward the deploy gate.
- If any deferred app bug now blocks → raise a specific Fix-Agent approval packet (Sam-gated).

## Output
Update state files, append handoff log, write the next packet.

# NEXT CLAUDE REVIEW

**Status:** ✅ CONSUMED 2026-06-28 — Claude reviewed; outcome in
[../BUG_REGISTER.md](../BUG_REGISTER.md) "Claude Review — Wave 01A triage" +
[../ui_review/UI_UX_DISCOVERY_WAVE_01_RESULT.md](../ui_review/UI_UX_DISCOVERY_WAVE_01_RESULT.md) §6.
Next: Cursor runs `UI-UX-WAVE-01A-FOLLOWUP` ([NEXT_CURSOR_TASK.md](./NEXT_CURSOR_TASK.md));
01B polish prepared for Sam in [SAM_APPROVAL_REQUIRED.md](./SAM_APPROVAL_REQUIRED.md).
**Issued by:** Cursor execution agent · **Governed by**
[../AUTONOMOUS_HARDENING_AGENT_PLAYBOOK.md](../AUTONOMOUS_HARDENING_AGENT_PLAYBOOK.md)

## Review task

Review Wave 01A discovery and produce a ranked, Sam-ready **module-polish plan** for Wave 01B.
Separate presentational fixes from behaviour/API fixes (especially Field crashes + Portal action feed).

## Cursor execution summary

| Item | Result |
|---|---|
| Run ID | `BLH-UIUX-01A-2026-06-28-1` |
| Preflight | branch `portal-v2`, clean tree, dry-run OK |
| UI Review | 156/162 pass — failures: Field WHS + Field Diary (all viewports) |
| Evidence | `docs/ui-review/export-2026-06-27/screenshots/` |
| Findings | 14 × `UI-*` in BUG_REGISTER |
| Lock matrix | LOCKED 4 · CONDITIONAL 6 · NO-GO 1 (Field) · NOT ASSESSED 1 (CRM) · PAUSED 1 |

## Files to inspect

- [../ui_review/UI_UX_DISCOVERY_WAVE_01_RESULT.md](../ui_review/UI_UX_DISCOVERY_WAVE_01_RESULT.md)
- [../ui_review/UI_MODULE_LOCK_MATRIX.md](../ui_review/UI_MODULE_LOCK_MATRIX.md)
- [../ui_review/UI_SCREEN_EVIDENCE_INDEX.md](../ui_review/UI_SCREEN_EVIDENCE_INDEX.md)
- [../BUG_REGISTER.md](../BUG_REGISTER.md) — section “Open — UI/UX Discovery Wave 01A”
- Redesign mock-ups in export: `ops-redesign-mockup-*`, `h3-redesign-mockup-*`, `sales-redesign-mockup-*`

## Questions to answer

1. **NO-GO vs CONDITIONAL vs LOCKED** — Field is NO-GO (2 High). Accept CONDITIONAL on Finance/Portal/Tender?
2. **01B vs Fix Agent** — UI-FIELD-* need fixture/component fix (not polish). UI-PORTAL-002 may need API feed.
3. **Coverage gaps** — CRM not captured; add test-only routes/fixtures before 01B or parallel?
4. **Demo/live masking** — Finance `—` KPIs, Workforce zero crew counts — elevate?
5. **Scope compliance** — Cursor changed docs only; no product code.

## Recommended Claude outputs

1. Ranked **01B polish table** (module · IDs · presentational-only fixes · risk) in result doc.
2. **Fix Agent packet** for UI-FIELD-001/002 (supervisor field WHS/diary).
3. **CRM coverage packet** — add `e2e/ui-review/routes.mjs` entries + CRM fixtures (test-only).
4. If Sam should approve 01B: write `NEXT_CURSOR_TASK.md` = `UI-UX-POLISH-WAVE-01B` + optional `SAM_APPROVAL_REQUIRED.md`.
5. If not ready: set `next_agent: sam` with summary for approval meeting.

## Priority polish candidates (Cursor pre-rank)

| Priority | Module | IDs | Rationale |
|---|---|---|---|
| P0 | Field | UI-FIELD-001/002 | Deploy-blocking — Fix Agent, not 01B |
| P1 | AppShell | UI-NAV-001 | Cross-module mobile nav |
| P1 | Finance | UI-FINANCE-001–003 | Empty states + mobile claims |
| P2 | Client Portal | UI-PORTAL-001/002 | Client-facing clarity |
| P2 | Design system | UI-VISUAL-001 | Badge consistency |
| P3 | Sales | UI-SALES-001 | KPI label alignment |
| P3 | Schedule | UI-SCHEDULE-001 | Mobile toolbar overflow |
| P3 | Workforce | UI-WORKFORCE-001 | Demo KPI copy |
| Coverage | CRM | UI-CRM-001 | Re-run 01A slice after fixtures |

## Output

Update CURRENT_STATE + AUTONOMOUS_LOOP_STATUS, append AGENT_HANDOFF_LOG, write next packet (`NEXT_CURSOR_TASK.md` or halt at Sam).

# W17-P0B — Original Workforce Requirements Fit Audit

**Date:** 2026-06-26  
**Status:** Accepted · **W17-P1 Team tab closed** (2026-06-26) · Remaining phases in [W17_WORKFORCE_REMAINING_PHASE_PLANS.md](./W17_WORKFORCE_REMAINING_PHASE_PLANS.md)  
**Mode:** `/harden plan W17-P0B-original-workforce-requirements-fit`

## W17-P1 closure (Team tab)

- Added `Team` to Workforce tabs in `src/pages/Workforce.jsx`
- Renders `<WorkforceTeam embedded />` inside Workforce shell
- `/workforce/team` redirects to `/workforce?tab=Team` (Option A)
- `test:w17-team-tab-baseline:write` **13/13 pass**
- No backend, schema, worker, or timesheet/Buildxact changes

## Revised phase order (active)

| Phase | Scope | Status |
|-------|-------|--------|
| W17-P1 | Team tab | **Closed** |
| W17-P2 | Snapshot weekly review refinement | Next |
| W17-P3 | Worker task/job/category + preview fix | Planned |
| W17-P4 | Planner UI minimum | Planned |
| W17-P5 | RDO/public holiday display | Planned |
| W17-P6 | Voice-to-task (building jobs) | Planned |
| W17-P7 | Leading-hand QC v1 | Planned |
| W17-P8 | Deputy replacement hardening | Planned |

See plan sections 1–17 in Cursor plan `w17-p0b_requirements_fit` for full requirement audit (snapshot, RDO, site tasks, voice, QC, team).

## Manual smoke (W17-P1)

1. Open `/workforce` — tabs: Approvals, Snapshot, Mass Fill, History, Team
2. Click Team — employee list loads
3. Admin: worker-link flow present on employee panel
4. Open `/workforce/team` — lands on Team tab
5. Other tabs unchanged; Worker PWA unchanged

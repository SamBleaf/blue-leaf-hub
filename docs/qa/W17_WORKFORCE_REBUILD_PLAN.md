# W17 — Workforce Rebuild Plan

**Date:** 2026-06-26  
**Status:** In progress — W17-P1 closed; **next: W17-P2 Snapshot**  
**Control doc:** [W17_WORKFORCE_REMAINING_PHASE_PLANS.md](./W17_WORKFORCE_REMAINING_PHASE_PLANS.md)

## Product principle

Workers stay simple. Admin gets the planning/control layer. Buildxact sync stays protected. Allocations are advisory.

## Phase order

1. **W17-P1 Team tab** — **Closed** 2026-06-26
2. **W17-P2 Snapshot refinement** — hours, submitted vs approved, previous-week default
3. **W17-P3 Worker tasks** — category filter, preview fix, task_audience gate
4. **W17-P4 Planner UI** — W16 allocation APIs, week view CRUD
5. **W17-P5 RDO/holidays** — display-only tables
6. **W17-P6 Voice-to-task** — extend carpentry paste flow to building projects
7. **W17-P7 QC v1** — leading-hand checklists
8. **W17-P8 Launch hardening** — full regression

## W17-P1 implementation notes

- Route compatibility: Option A redirect `/workforce/team` → `/workforce?tab=Team`
- Files: `Workforce.jsx`, `WorkforceTeam.jsx` (embedded prop), `App.jsx`
- Tests: `scripts/batch-a/w17-team-tab-baseline.mjs`

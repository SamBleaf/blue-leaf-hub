# Carpentry Stage Schedule + Calendar Pipeline — Execution Plan

## Goal (Sam, 2026-07-18)
Replace the read-only Pipeline bar-timeline with an **interactive calendar** where each carpentry job is broken into its **stages** (first fix, roof, windows, cladding, second fix…) as **draggable blocks**, colour-coded by a **jobs legend**. Dragging a stage moves the carpentry schedule and **push/pulls dependent stages** (ripple); editing dates in the carpentry module moves the calendar — **two-way**. Stages have **dependencies + gaps** (e.g. roof + windows complete between first-fix and cladding). Reuse the drag/ripple code from the Workforce Planner + Operations Scheduler. Timesheet-observed gaps refine projections over time.

## Confirmed decisions
- **New canonical store**: `carpentry_job_stage_schedule` (per-stage planned start/end + dependencies), keyed to the 15-stage taxonomy in `carpentryStages.mjs`.
- **Retire the milestone system** (`carpentry_job_milestones`): migrate its `target_date`/`actual_date` into the new store where the name maps to a stage, then replace the carpentry ScheduleTab milestone UI with the stage schedule. Milestones "weren't thought out / in depth."
- **Model the interaction on the workforce system** (planner drag quality, atomic write-back, optimistic + server-truth).

## Confirmed reuse (investigated, file:line verified)
- `src/lib/scheduleUtils.js` — **`previewRipple`** (pure FS/SS/FF+lag forward-push ripple), `getConstraint`, `hasDependencyOn`, `downstreamTaskIds`, `computeEndDate`, `daysBetween`. Lift as-is; it's the dependency+gap engine.
- `src/components/schedule/ScheduleCalendar.jsx` — orphaned 6-week month grid that already renders multi-day spanning events. Adopt as the calendar shell.
- `WorkforcePlannerTab.jsx` — the rAF + one-time-rect-cache pointer-drag pattern (smooth block drag), optimistic-update + apply-server-rows reconcile, memoized-chip anti-rerender, touch long-press menu.
- `src/lib/plannerColors.js` (`resolveJobColor` + `LegendChip`) for the jobs legend; `PHASE_COLOR_MAP`/`phaseColor` for per-stage colours.
- `RippleWarningModal` + the `ripple-check` → confirm / `no_cascade` break-dependency flow; migration 143 atomic-RPC pattern as the write-back template.
- Existing Pipeline calc engine (`scheduleIntelligence`, `workforceCapacity`, `stageAggregation`) — now fed by **real planned stage dates** instead of budget-derived guesses.

## Data model — migration `144_carpentry_stage_schedule.sql`
```
carpentry_job_stage_schedule (
  id uuid pk,
  carpentry_job_id uuid fk → carpentry_jobs on delete cascade,
  stage_key text not null,           -- from carpentryStages STAGES (wall_framing, cladding, …)
  planned_start date,
  planned_end date,
  actual_start date,                 -- from timesheet aggregation (read-only mirror; optional persist)
  actual_end date,
  depends_on jsonb default '[]',     -- [{ stageKey, type:'FS'|'SS'|'FF', lagDays }]  (typed deps + gap)
  status text default 'planned' check (status in ('planned','in_progress','complete')),
  sort_order int,                    -- = stageOrder(stage_key) default; user-reorderable
  locked boolean default false,      -- pin a stage so ripple won't move it
  notes text,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (carpentry_job_id, stage_key)
)
```
- RLS additive like prior carpentry migrations. `updated_at` trigger (unlike milestones, which lacked one).
- **Data migration in the same file**: for each job, insert stage rows for its `includedStages` (from `carpentry_budget_line_items` canonical_key → stage); backfill `planned_start`/`planned_end` from existing `carpentry_job_milestones` "…start"/"…complete" pairs via a name→stage map; seed the rest via auto-layout. Then the milestone table + endpoints are retired (kept in DB one release for rollback, UI removed).

## Stage set + dependency defaults (deterministic, editable per job)
- **Which stages** a job has = `includedStages` (already computed in `workforcePipelineRoutes`): resolveStage over the job's budget line items. Fallback to a default full-package set if no budget.
- **Default dependency chain**: each stage FS-depends on the previous stage by `stageOrder`, **plus** the cross-rules Sam named — `cladding` FS-depends on `roof_framing` **and** `windows_doors` **and** `wrap_membrane`/`battens_cavity` (so roof+windows must finish first → the gap). Encoded as the seed `depends_on`; fully editable.
- **Gap = dependency lag**. Initial lag from `carpentryScheduleUtils` lead-days; **refined by timesheet-observed inter-stage gaps** (`stageAggregation.gaps`, median across comparable jobs) as data accrues — the "timesheet analysis calculates expected gaps" Sam flagged.
- **Duration** = `carpentryScheduleUtils` crew-scaled buildDays initially; refined by `scheduleIntelligence` forecast + actuals.
- **Auto-layout** = walk stages in order from the job `start_date`, place each after its latest dependency + lag (reuse the previewRipple/auto-layout math). Human-confirmable, then draggable.

## Backend
- `server/lib/carpentryStageScheduleService.mjs` (pure): seed/auto-layout a job's stages; apply a drag (delegate to `previewRipple`); merge actuals from `stageAggregation`.
- Endpoints in `carpentryRoutes.mjs` (or a new `carpentryScheduleRoutes.mjs`):
  - `GET /api/carpentry/jobs/:id/stage-schedule` — stages + deps + actuals.
  - `POST /api/carpentry/jobs/:id/stage-schedule/seed` — (re)seed/auto-layout.
  - `PATCH /api/carpentry/stage-schedule/:rowId` — move/resize one stage `{ plannedStart, plannedEnd, locked }`.
  - `POST /api/carpentry/jobs/:id/stage-schedule/ripple-check` — preview downstream shifts (mirror the scheduler's).
  - `POST /api/carpentry/jobs/:id/stage-schedule/apply` — atomic write of a stage + its confirmed ripple diff (RPC like mig 143; returns affected rows for server-truth apply).
- Pipeline route reads planned stage dates → the calendar + the forecast/capacity engine.

## Frontend
- **Calendar** `src/components/workforce/pipeline/PipelineCalendar.jsx` (from `ScheduleCalendar`): month grid, contiguous stage bars per week row (borrow `pipelineTimeline.js` left/width math), colour by job legend (`resolveJobColor`) with stage shade; drag a block (planner rAF pattern) → `ripple-check` → `RippleWarningModal` → `apply`; optimistic + apply server rows.
- **Legend**: `LegendChip` per job (colour + toggle). Horizon = month default (calendar), with week/quarter where it makes sense; keep the existing forecast/capacity panels below.
- **Carpentry module** `CarpentryJobDetail.jsx` ScheduleTab: replace the milestone list with the stage schedule (editable stage dates + dependencies), reading/writing the same endpoints → two-way sync.

## Two-way sync
Both surfaces read/write `carpentry_job_stage_schedule` via the same endpoints. No new sync layer — one source of truth. Optimistic update locally, POST atomic apply, reconcile from returned rows (the Planner pattern). A drag in either place lands in the same table → the other reflects it on next load/refresh.

## Phasing (proportionate — ship each phase working)
- **Phase 1 — Foundation**: migration 144 + data migration; `carpentryStageScheduleService` + seed/auto-layout + GET/seed endpoints + tests. Carpentry ScheduleTab shows the stage schedule (read + date-input edit, no drag yet). Retire milestone UI.
- **Phase 2 — Calendar + drag + ripple**: PipelineCalendar month view with stage blocks + legend; drag/resize a block → ripple-check → apply (write-back). Two-way sync live.
- **Phase 3 — Intelligence layer**: dependency editing per job; observed-gap refinement of lags; feed planned stage dates into forecast/capacity; break-even markers per stage.

## Migrations
One: `144_carpentry_stage_schedule.sql` (table + RLS + trigger + data migration from milestones). Manual-apply by Sam. Milestone table retained (unused) one release for rollback.

## Tests
`scripts/tests/carpentry-stage-schedule.test.mjs`: seed/auto-layout ordering; dependency ripple (drag framing → cladding pushes, roof/windows gap honoured); lock prevents move; milestone→stage backfill mapping; actuals merge. Reuse the plain-node assertion runner.

## SOPs / docs
Update SOP 10-04 (Pipeline now interactive/calendar) + a carpentry stage-schedule SOP; SOP_INDEX/CHANGELOG; dictionary §11 (planned stage dates = new facts, `carpentry_stage_planned_start/end`). Retire milestone references.

## Verification
Unit tests green; reconcile a real job's seeded schedule vs its budget/timesheets against the live DB (read-only, as done for the Pipeline break-even); drive drag+ripple in the browser pane where possible; `/check`; deploy per phase.

## Out of scope (future)
Cross-job drag-to-reassign crew from the calendar; stage-instance splitting (one stage twice); auto-scheduling/optimisation; construction (full-build) stage schedules — all remain in WORKFORCE_PIPELINE_FUTURE_TODO.

---
sop_version: 2.0
last_reviewed: 2026-07-18
app_version: 2.0 — interactive stage calendar
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 10-04: Workforce Pipeline — Capacity & Schedule Intelligence

**Module:** Workforce
**SOP ID:** 10-04
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Admin and supervisors planning the carpentry crew: deciding what jobs start when, whether the team has spare capacity or is overbooked, and whether a job's expected duration threatens its margin. The tab is hidden from workers (admin/supervisor only, same gate as Planner).

## 2. When to use it
- Weekly/monthly capacity planning — is the crew over- or under-booked?
- Before committing a new carpentry job's start date
- To see which in-flight jobs are forecast to overrun their break-even labour allowance (margin risk)
- To sanity-check a job's expected finish against its committed schedule and its actual progress from approved timesheets

## 3. What this does
The **Pipeline** tab (Workforce → Pipeline; route `/workforce?tab=Pipeline`) has two views — an **interactive stage Calendar** (default) and the forward-looking **Timeline** (the read-only forecast/capacity view described below). Toggle between them top-left.

### Stage Calendar (v2 — interactive)
Each carpentry job is broken into its **stages** (the budget labour subsections — First Fix Framing, Cladding & Soffit, Second Fix…), drawn as blocks on a calendar, colour-coded by job (see the jobs legend above the grid).
- **Year view** (default) — 12 mini-months, whole-year overview. Click a month to zoom in.
- **Month view** — **drag a stage block** to reschedule it; its dependent stages **ripple forward** automatically (later stages are never pulled earlier). **Click a block** to open its editor (start/end, ±day/±week shift, lock). A **🔒 locked** stage doesn't move under auto-layout or ripple; a **●** prefix means the stage has started (approved timesheets exist).
- **Stage length is earned-value-driven**: each stage's duration = its labour value ÷ the team day-rate, scaled to the stage crew (the same engine as the break-even). More labour $ in a subsection → longer stage.
- **Two-way sync**: every move writes to `carpentry_job_stage_schedule` — the same store the carpentry job's **Schedule tab** reads/writes, so an edit in either place moves the other.
- **Actual vs planned**: approved timesheets (by workforce task_category) show the real start/end + hours on each stage block + in the editor.

### Timeline (forward-looking forecast — read-only)
The Timeline view composes existing data (carpentry jobs, budgets, approved timesheets, crew allocations, the cost model) into a job-level forecast + capacity view. It is **not** a data-entry screen.

**Four schedule measures, shown side by side and never conflated:**
1. **Committed** — the real schedule (`start_date → end_date`). Solid bar.
2. **Expected** — the deterministic forecast duration (from labour hours + crew + history). Dashed bar.
3. **Break-even allowance** — the economically allowable duration (labour value ÷ team break-even rate, scaled to the job's crew). A financial *limit*, drawn as a vertical marker — **not** the expected duration.
4. **Actual** — progress from approved PWA timesheets. Inner fill on the committed bar.

A job is flagged **⚠ margin** when its *expected productive crew-days* exceed its *break-even allowance* — i.e. it is forecast to cost more labour than the job's labour value allows.

**Crew capacity band** (below the timeline): per period (week/month), available crew-days vs committed (real allocations) + forecast (the engine's remaining expected demand). Spare is called out in green, overbooked in red. Construction projects appear only as lighter context rows and only their internal-labour allocations count toward demand — never a construction project's full span.

**Confidence** (High / Medium / Low / Insufficient) labels every forecast by its evidence: live production rate > comparable-job history > budget-derived break-even. With few completed jobs, most forecasts start Low and sharpen as sub-task timesheets accrue.

Horizons: **Week / Month / Quarter / Year** (Month default). Filters: carpentry-only, and margin-risk-only.

## 4. Before you start
- The **cost model** must be synced (Workforce → Buildexact sync) for break-even markers to appear. If not synced, the tab still shows committed/expected/actual but hides break-even.
- Carpentry jobs need a **labour budget** (`carpentry_job_budgets`, `cost_type = 'labour'`) for a break-even allowance to compute.
- Approved timesheets tagged to budget sub-tasks (canonical_key) drive actual progress + the sharpest forecasts.

## 5. Step-by-step process

### Reading the board
1. Go to **Workforce** → **Pipeline**
2. Pick a horizon (Week / Month / Quarter / Year). Use ← / Today / → to move the window.
3. Each carpentry job is a row: solid = committed schedule, dashed = expected forecast, inner fill = actual %, vertical marker = break-even deadline (amber = within allowance, red = overrun).
4. The **⚠ margin** chip + red break-even marker mean the forecast overruns the labour allowance — investigate crew size, scope, or price.
5. Read the **Crew capacity** band: bars above the dashed available line, or a red `−N`, mean that period is overbooked.

### Drilling into a job
1. Click a job row to expand it.
2. The left column shows the four measures as numbers (Committed / Expected / Break-even / Actual).
3. The stage bars show per-stage actual hours (and forecast hours where history exists).
4. The one-line **explanation** states exactly how the forecast was derived (source + confidence + assumptions).

### Acting on it
- **Overbooked period** → move a job start (Planner), add crew, or subcontract.
- **Margin risk** → review the job's crew size, scope creep, or the quoted labour value.
- **Low confidence** → the forecast is budget-derived; treat it as indicative until timesheets accrue.

## 6. What happens after
Nothing is written. The Pipeline never changes a schedule, allocation, or timesheet — it only reads and forecasts. Approved timesheets flowing in from the PWA automatically update actuals + sharpen forecasts on the next load. If real progress diverges from the committed schedule, the tab surfaces the variance (it never silently rewrites the committed dates).

## 7. Common mistakes
- **Reading the break-even marker as the deadline to finish.** It is the *labour-economics* limit, not the client deadline. Expected (dashed) is the realistic finish.
- **Expecting construction projects to show full crew demand.** By design only their internal-labour allocations count — a construction project's full build span is context only.
- **Trusting a Low-confidence forecast as precise.** Low = budget-derived, no comparable history yet.
- **Wondering why break-even markers are missing** — the cost model isn't synced.

## 8. Troubleshooting
- **Empty board** — no carpentry jobs in `active`/`on_hold`/`defects` status within the window. Widen the horizon or check job statuses.
- **No break-even markers** — cost model not synced, or the job has no labour budget line.
- **Everything shows overbooked** — check that active employees exist (`employees.is_active = true`); if the employee list is empty, available capacity reads 0.
- **A job's forecast looks wrong** — expand it and read the explanation line; check crew size (defaults to 3 when no allocations exist) and whether it has any approved timesheets.
- **Endpoint 403** — the tab is admin/supervisor only.

## 9. Related SOPs
- SOP 10-01 Workforce Overview (timesheets, approvals, Planner)
- SOP 14-xx Carpentry Cost Intelligence (earned-value gauge, sub-task budgets — the labour-hour spine the forecast reads)

## 10. Automation notes
- Endpoint: `GET /api/workforce/pipeline?from&to&horizon` (admin/supervisor). Drill-in: `GET /api/workforce/pipeline/forecast/:carpentryJobId`.
- Deterministic services (no AI): `workingCalendar.mjs` (working-day math), `carpentryStages.mjs` (stage taxonomy), `stageAggregation.mjs` (timesheet → stage actuals), `scheduleIntelligence.mjs` (break-even + forecast), `workforceCapacity.mjs` (supply vs demand). Route composes only — no business math in the route/UI.
- Calc version stamped on every response (`calcVersion`) for auditability.
- Break-even reconciles to the existing Budget burn block (`costModelService.burnForLine`) — proven by unit test; verify the numbers against 2 real jobs on first live use.
- Unit tests: `scripts/tests/workforce-pipeline.test.mjs` (73 assertions).
- Deferred/optional capability: `docs/plans/WORKFORCE_PIPELINE_FUTURE_TODO.md`.

## 11. Screenshots
Not yet captured — capture on first live use (month view, an overbooked period, a margin-risk job expanded).

## 12. Edge cases
- **No completed-job history** → forecasts are budget-derived (Low); the tab says so in the meta line.
- **Job with no labour budget** → no break-even allowance; expected still derives from crew + hours where possible.
- **Job with no allocations** → crew size defaults to 3 (labelled). Add allocations for a sharper forecast.
- **Legacy address-only timesheets** (no sub-task tag) → excluded from stage actuals and reported under `excludedHours`, never silently folded in.
- **Non-production categories** (supervision) → excluded from production hours by design.

## 13. Owner of the process
Admin
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin or Supervisor
- [ ] Cost model synced (Workforce → Buildexact sync) — else break-even is expected to be absent
- [ ] At least 1 carpentry job in `active` status with a labour budget line
- [ ] At least 2 active employees exist

### Test cases

**TC-01 — Pipeline tab loads for admin/supervisor**
1. Go to Workforce → Pipeline
2. Expected: timeline renders with a date axis, a today line, and at least one job row
3. Expected API: `GET /api/workforce/pipeline?horizon=month` returns `{ ok: true, jobs: [...], capacity: [...], meta: {...} }`
- [ ] Pass  [ ] Fail

**TC-02 — Pipeline tab is hidden from workers**
1. Log in as a non-manager (or call the endpoint without admin/supervisor role)
2. Expected: no Pipeline tab shown; `GET /api/workforce/pipeline` returns 403
- [ ] Pass  [ ] Fail

**TC-03 — Horizon switch changes the window**
1. Click Week, then Quarter, then Year
2. Expected: the date axis and bar positions rescale; the meta line's `from → to` updates
3. Expected API: each switch re-requests with the new `horizon` and `from`/`to`
- [ ] Pass  [ ] Fail

**TC-04 — Four measures are distinct on a job row**
1. Find a job with a committed schedule, a forecast, and some approved timesheets
2. Expected: solid committed bar, dashed forecast bar, inner actual fill, and a vertical break-even marker are all separately visible
3. Expand the row → Committed / Expected / Break-even / Actual show as four distinct numbers
- [ ] Pass  [ ] Fail

**TC-05 — Margin-risk flag appears when expected exceeds break-even**
1. Find (or construct) a job whose forecast productive crew-days exceed its break-even allowance
2. Expected: a ⚠ margin chip on the row + a red break-even marker
3. Expected API: that job's `breakEven.marginRisk === true`
4. Enable "Margin risk only" → only flagged jobs remain
- [ ] Pass  [ ] Fail

**TC-06 — Break-even reconciles to the Budget burn block**
1. Pick a real job; open its Costs tab and note the Budget burn block's "at margin" / "break-even" days
2. Open the same job in the Pipeline (expand) and compare
3. Expected: the Pipeline's atMargin/break-even whole-team-days match the burn block for the same labour value
- [ ] Pass  [ ] Fail

**TC-07 — Capacity band flags overbooking**
1. In a period where allocations + forecast exceed available crew-days
2. Expected: the capacity bar exceeds the dashed available line and shows a red `−N`
3. Expected API: that period's `overbookedCrewDays > 0` and `spareCrewDays === 0`
- [ ] Pass  [ ] Fail

**TC-08 — Construction shows as context only**
1. With a construction project that has internal-labour allocations in the window
2. Expected: it appears as a lighter "Construction context" row, not a full job row
3. Expected: only its allocated internal-labour days contribute to capacity demand — not its full project span
- [ ] Pass  [ ] Fail

**TC-09 — Graceful degradation with no cost model / no history**
1. On a DB with the cost model unsynced (or no completed jobs)
2. Expected: the board still renders; a meta notice explains break-even is unavailable / forecasts are budget-derived (Low confidence); no crash
- [ ] Pass  [ ] Fail

**TC-10 — Calendar shows budget-driven stage blocks**
1. Calendar view (default Year) → a job with a labour budget
2. Expected: the job's stages appear as blocks named for the budget subsections; stage lengths scale with labour value
3. Expected API: `GET /api/carpentry/jobs/:id/stage-schedule` returns stages with `labourSell` + `plannedStart/plannedEnd`
- [ ] Pass  [ ] Fail

**TC-11 — Drag a stage reschedules it + ripples dependents (Month view)**
1. Switch to Month view → drag a stage block to a later day → drop
2. Expected: the block moves; any dependent stages shift forward (never earlier); a "Saving…" indicator shows
3. Expected DB: `carpentry_job_stage_schedule.planned_start/planned_end` updated for the moved stage + pushed dependents
- [ ] Pass  [ ] Fail

**TC-12 — Two-way sync with the carpentry Schedule tab**
1. Move a stage on the Pipeline calendar → open the same carpentry job → Schedule tab
2. Expected: the stage shows the new dates. Reverse: edit a date on the Schedule tab → reload the Pipeline → the calendar reflects it
- [ ] Pass  [ ] Fail

**TC-13 — Lock pins a stage against ripple; ● marks started stages**
1. Open a stage's editor → tick Lock → save. Drag an earlier stage so ripple would hit it
2. Expected: the locked stage does not move. A stage with approved timesheets shows a ● prefix + actual dates in its tooltip/editor
- [ ] Pass  [ ] Fail

**TC-14 — Year default + Month/Year toggle**
1. Open the Pipeline → Calendar
2. Expected: it opens in **Year** view (12 mini-months). Toggling **Month** shows the 6-week grid; clicking a mini-month zooms to that month
- [ ] Pass  [ ] Fail

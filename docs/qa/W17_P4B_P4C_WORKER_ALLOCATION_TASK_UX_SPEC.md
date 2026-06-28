# W17-P4B / P4C — Worker PWA Allocation + Task-Context UX Spec

**Mode:** `/harden plan W17-P4B-worker-allocation-and-task-context`
**Date:** 2026-06-29 · **Status:** PLAN — awaiting Sam approval of screen behaviour · **Code changed: no**
**Scope:** Planning only. No product code until Sam approves the exact screen behaviour below.

> Governs how the new Planner / crew allocation work (W16-A1, W17-P4) feeds the existing Worker PWA
> screens. The PWA structure (Today · Log Hours · My Week · Tasks) stays — we close the
> allocation→task relationship that was left open.

---

## 1. Business intent

The worker app must answer the worker's **daily questions**, not just "show allocation data":

| Question | Screen that answers it |
|---|---|
| Where am I today? | Today |
| Where am I tomorrow? | Today (Tomorrow preview) |
| Where am I all week? | My Week |
| Who am I with? | Today + My Week (crew) |
| What job is it? | Today (job type) |
| What do I need to do there? | Tasks (defaults to today's job) |
| Have I logged my hours? | Today + My Week (timesheet status) |
| Is anything urgent or unfinished? | Today (open/urgent counts) |

**Model:** Today = where am I going + what matters today · My Week = where am I all week + have I
logged time · Tasks = what needs doing on the selected job · Log Hours = submit actual labour.

**Source-of-truth boundaries (must stay separate, shown connected):**
`Planner allocation ≠ timesheet` · `allocation ≠ actual hours` · `tasks ≠ payroll`. The allocation
tells the worker *where*; the allocated job becomes the *default job context* for Tasks; the
timesheet records what they *actually did*.

---

## 2. Backend reality (what already exists — build on it, don't rebuild)

| Capability | Endpoint | Returns | Evidence |
|---|---|---|---|
| Today + tomorrow allocation | `GET /api/worker/allocations/today` | `{ today, tomorrow }`, each: `allocationDate`, `projectAddress` **or** `carpentryJobAddress`+`carpentryJobClientName`, `crewName`, `notes` | Verified from code (`ALLOCATION_SELECT`, `formatAllocation`, handler ~L2124) |
| Week allocations | `GET /api/worker/allocations/week?weekStart=` | allocation per day (same shape) | Verified from code (~L2143) |
| Job type | derived | `projectId` set = **Building**; `carpentryJobId` set = **Carpentry** (XOR) | Verified from code |
| Today's tasks for a job | `GET /api/worker/tasks?jobId=&jobType=&category=` | tasks for that job; `needsJobSelection:true` if no `jobId`; `workerMaySeeJob` gate; `task_audience` worker-vs-leading-hand | Verified from code (~L1962) |
| Home summary | `GET /api/worker/me` | `today_timesheet`, `open_task_count` (GLOBAL, all jobs), `weekly_hours`, `yesterday_project`, `employee` | Verified from code (~L1601) |

**Backend deltas this spec needs (small, additive — NOT a rebuild):**
- **D1 (P4B):** Per-job task counts for Today's "3 open · 1 urgent · 2 done". *No new endpoint needed* — the Today card calls the existing `GET /api/worker/tasks?jobId=<today's job>` and counts client-side. `Inferred — confirm acceptable.`
- **D2 (open decision):** "Leading hand / supervisor on Today" needs crew-member data (`workforce_crews` → `workforce_crew_members` → `employees.is_leading_hand`). The allocation gives `crewName` but **not** the crew's lead. Options in §7. `Open decision for Sam.`
- **D3 (later):** RDO / public-holiday day-state on My Week (tables exist: `workforce_public_holidays`, `workforce_employee_rdo_dates`) — explicitly deferred past P4C.

---

## 3. Screen 1 — Today  (phase W17-P4B)

The worker's daily start screen. A clean field dashboard, top-to-bottom:

```
TODAY'S SITE
  Read Residence
  9 Charles St, Norwood
  Crew: Josh Crew
  Job type: Building            (or Carpentry)
  [Leading hand: Josh]          ← only if D2 resolved; omit if unknown

TODAY'S TASKS
  3 open · 1 urgent · 2 done    → tap → Tasks (defaulted to this job)

TODAY'S HOURS
  Not submitted yet             → tap → Log Hours (this job pre-selected as context only)

TOMORROW
  Burnside Residence
  25 Nilpinna St, Burnside
  Crew: Sam Crew
```

**Fields (in priority order, do not overload):** site/project name · address · crew name · job type
(Building/Carpentry) · [leading hand — if known] · open task count · urgent task count · timesheet
status · tomorrow preview (site + crew only).

**Data calls:** `allocations/today` (site, crew, tomorrow) + `tasks?jobId=<today>` (counts) + existing
`/me` (timesheet status). Today's allocation does **not** auto-fill or create a timesheet — Hours is
a separate action (boundary held).

---

## 4. Screen 2 — My Week  (phase W17-P4B)

Becomes the worker's **weekly roster + timesheet status** (today it's only a green/red timesheet
calendar). Per-day row:

```
Monday    Scheduled: 9 Charles St, Norwood — Josh Crew     Timesheet: Submitted · 8h
Tuesday   Scheduled: 9 Charles St, Norwood — Josh Crew     Timesheet: Missing
Wednesday Scheduled: 25 Nilpinna St, Burnside — Sam Crew   Timesheet: Not due yet
Thursday  Scheduled: Not allocated                         Timesheet: Not required
Friday    Scheduled: 25 Nilpinna St, Burnside — Sam Crew   Timesheet: Draft / Missing
```

**Shows per day:** allocation (site) · crew · timesheet status · hours logged · missing-day warning ·
"Not allocated" state. **Keep** the existing green/red completeness signal. RDO / public-holiday
day-state slots in here **later** (D3).

**Data calls:** `allocations/week` + existing `timesheets` range (already loaded by WorkerWeek).

---

## 5. Screen 3 — Tasks  (phase W17-P4C)

Today's flow is correct: **select job → (job type) → category → task list**; normal workers see
`worker` tasks only, leading hands also see `supervisor`/QC tasks. We make the **job picker smarter**:

**Default job = today's allocation.** Opening Tasks should not start blank or force a hunt.

```
TASKS FOR TODAY
  9 Charles St, Norwood        [ change job ▾ ]

Filters:  All · Open · Urgent · Done
Category: All categories ▾  (plain-English labels, not internal keys)
```

**Default logic:**
```
default job   = today's allocation (jobId + jobType)
no allocation = show job picker (current behaviour, needsJobSelection)
leading hand  = Worker + QC/Supervisor tasks
normal worker = Worker tasks only
```

**Task card (practical on site, not a PM board):** title · category (plain English) · priority ·
status · due/stage if known · assigned-to-me / unassigned / crew · notes. Worker action: **Complete
task**. Leading hand: Complete + QC checklist item (photo/note: later).

**Category labels (UI, plain English; keys stay internal):** All categories · First fix / framing ·
Roof / trusses · Box gutter · Cladding · Second fix · Decking / external · Defects / handover ·
Safety · Materials · Inspection · General. *(Confirm final list against `SITE_TASK_CATEGORIES`.)*

---

## 6. The seven approval questions — explicit answers

1. **What does Today look like?** §3 — site, address, crew, job type, today's task counts
   (open/urgent/done), timesheet status, tomorrow preview. Clean dashboard, ≤8 facts.
2. **What does My Week look like?** §4 — per-day roster: allocation + crew + timesheet status, with
   "not allocated" and missing-day states. Keeps the green/red signal.
3. **What does Tasks default to?** Today's allocated job (jobId+jobType pre-selected), with a visible
   "change job" switcher. If no allocation today → job picker (current behaviour).
4. **What happens when no allocation exists?** Today: "Not scheduled yet — check with your
   supervisor" in the site card (no fake site); task counts hidden; Hours still available. My Week:
   "Not allocated" + "Timesheet not required". Tasks: falls back to the job picker.
5. **What happens when tomorrow is allocated?** Today shows a **Tomorrow** block (site + crew only,
   no task counts) so the worker can plan their morning. Tomorrow comes from the same
   `allocations/today` response.
6. **What happens if tasks exist on another job?** Tasks defaults to **today's** job, but the "change
   job" switcher lets them open any job they may see (`workerMaySeeJob`). We do **not** hide other
   jobs — we just don't make them the default. Counts on Today are **today's job only**.
7. **What can a leading hand see that a normal worker cannot?** Supervisor/QC tasks (`task_audience =
   supervisor`) and the ability to complete them; QC checklist items. A normal worker sees `worker`
   tasks only and cannot complete supervisor/QC tasks. (Already enforced server-side, W17-P3.)
   Optionally (D2) a leading hand's name surfaces as "Leading hand" on crewmates' Today cards.

---

## 7. Open decisions for Sam

- **SAM-W17-P4B-1 — Leading hand on Today (D2):** show the crew's leading hand name?
  - **(a)** Defer — Today shows crew *name* only for now (zero backend). **← recommended for P4B.**
  - **(b)** Add a small read to resolve the crew's leading hand and show "Leading hand: Josh".
- **SAM-W17-P4B-2 — Today's task counts:** confirm Today calls `tasks?jobId=<today>` to count
  open/urgent/done for the allocated job (vs the global `open_task_count` from `/me`, which spans all
  jobs). Recommended: per-job counts (matches "what matters today").
- **SAM-W17-P4C-1 — "Urgent" definition:** is urgent = `priority in (high, critical)`? Confirm the
  mapping so Today/Tasks agree.
- **SAM-W17-P4C-2 — Category list:** approve the plain-English label set in §5 against
  `SITE_TASK_CATEGORIES` (some may not apply to a normal worker).

---

## 8. Phasing (build order — safer split, not one big change)

**W17-P4B — Worker allocation visibility (display only):**
- WorkerHome: today's allocation (site, address, crew, job type), tomorrow preview, open/urgent task
  count for today's allocated job.
- WorkerWeek: allocation per day, crew per day, timesheet status per day.
- No task defaulting yet. Frontend + the two existing allocation endpoints (+ per-job count call).

**W17-P4C — Worker task context upgrade:**
- WorkerTasks: default to today's allocated job, "Today's job" label, keep job switcher + category
  filter, show counts by job, leading-hand QC visibility preserved.

Order rationale: first make the worker **see where they're going**; then make tasks **follow that job
context**.

---

## 9. What NOT to do yet (explicit guardrails)

```
- worker confirms / edits allocation
- allocation creates or pre-fills a timesheet
- task completion forces a timesheet entry
- automatic crew chat
- live GPS / check-in
- full crewmate list (unless backend already supports it cheaply)
- RDO / public-holiday display (deferred to a later phase after P4C)
```

These change workflow and are out of scope for P4B/P4C.

---

## 10. Acceptance criteria

**P4B:** A worker opens the app and immediately sees today's site + crew + job type, today's
open/urgent task counts, their timesheet status, and tomorrow's site. My Week shows each day's
allocation + crew + timesheet status, with correct "not allocated" / "not required" states. No
timesheet is auto-created. Existing timesheet completeness signal unchanged.

**P4C:** Opening Tasks lands on today's allocated job with a visible job label and a working "change
job" switcher; category filter works with plain-English labels; a normal worker sees only `worker`
tasks; a leading hand additionally sees and can complete supervisor/QC tasks. No task forces a
timesheet entry.

---

Source-of-truth check:
Expected: Planner allocation (`workforce_allocations`) is the worker's where/crew source; `site_tasks`
(filtered by job + `task_audience`) is the what-to-do source; `timesheets` is the actual-hours source.
Confirmed: `allocations/today|week`, `worker/tasks?jobId`, `worker/me`, `formatAllocation`,
`workerMaySeeJob`, W17-P3 audience gate — all verified from code.
Mismatch: none. (D2 leading-hand + D3 RDO are additive gaps, not drift.)

Next safe action:
Sam approves §6 screen behaviour + §7 decisions → build **W17-P4B** (allocation visibility) first,
then **W17-P4C** (task context) after P4B verifies.

Blocked by: Sam approval (this is a plan; no code until approved).

Code changed: no
Tests changed: no
Docs changed: yes (this file)

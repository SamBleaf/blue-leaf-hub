# Workforce Module — Deployment-Readiness Audit

> **Type:** Read-only operational-readiness audit (no code changed).
> **Date:** 2026-06-28
> **Scope:** Workforce components, server routes, role gates, fixtures, and the
> worker PWA pages that feed timesheets — ahead of go-live to real workers/staff.
> **Verdict:** 🟡 **CONDITIONAL GO** — safe to deploy to *trusted internal crew* now;
> **NO-GO for untrusted/at-scale** until Blockers 1–3 are fixed. All fixes below are
> documented for approval and have **not** been implemented.

---

## How to read this

Severity reflects deployment risk for a real-payroll system where timesheet cost is
booked to job actuals and pushed to Buildexact. The backend uses the Supabase
**service-role** key, so RLS is a safety net only — **auth + input validation in the
route handlers is the enforcement layer**. Every blocker below is a gap in that layer.

The mitigating context: workers authenticate via per-employee magic-link tokens, and
the first cohort is a small, known crew. None of the blockers is remotely exploitable
without a valid worker token. They are integrity/confidentiality gaps, not open holes —
which is why this is a conditional GO rather than a hard NO-GO.

---

## Confirmed findings

### 🔴 Blocker 1 — Worker can log/move hours against ANY job (no visibility check)
**Files:** `server/lib/workforceRoutes.mjs`
- `POST /api/worker/timesheets` (lines 1722–1791) accepts `project_id` /
  `job_id` / `carpentry_job_id` straight from the request body and only checks that
  *one* of them is present — never that the authenticated worker is actually assigned
  to that job.
- `PUT /api/worker/timesheets/:id` (lines 1822–1856) is worse: it scopes the row to
  `emp.id` (good) but then **spreads `...rest` into the update** (lines 1832, 1842),
  so a worker can move an existing entry onto an arbitrary `project_id` /
  `carpentry_job_id`.

**Impact:** Labour cost lands on the wrong job's actuals and (once approved) is pushed
to the wrong Buildexact job. Corrupts margin/WIPAA for two jobs at once. Requires a
valid worker token + a known job UUID, so not a public hole — but trivially
triggerable by a curious or buggy client.

**Proposed fix (approval required):** Resolve the worker's visible jobs
(`workerVisibleJobs` / `workerMaySeeJob` helpers already exist in this file) and
reject create/update where the target job is not in that set. On PUT, replace the
`...rest` spread with an explicit allow-list (`task_category`, `hours`, `notes`,
`completion_photo_url`) so job linkage cannot be reassigned via edit.

---

### 🔴 Blocker 2 — Negative / NaN per-entry hours accepted
**File:** `server/lib/workforceRoutes.mjs`
- Create (line 1740) and update (line 1839) validate only the **summed** total
  (`≤ 24`). There is no per-entry guard for negative or `NaN` hours.
- The client (`src/pages/worker/WorkerLogHours.jsx`) clamps to 0.5–24, but that is
  **UI-only** — the server is the system of record and does not enforce it.

**Impact:** A negative entry can offset a positive one to pass the `≤ 24` total check
while poisoning cost computation at approval (`splitOvertimeHours` / `computeCost`).
Booked actuals and Buildexact push go wrong silently.

**Proposed fix (approval required):** Per-entry validation on create and update:
`Number.isFinite(hours) && hours > 0 && hours <= 24`; reject the request otherwise.
Also validate `task_category` against `TASK_CATEGORIES` (currently written unchecked at
line 1780).

---

### 🔴 Blocker 3 — `approveSingleTimesheet` is not idempotent
**File:** `server/lib/workforceRoutes.mjs`, lines 413–449
- No `ts.status` guard before approving. Re-calling approve on an already-approved
  timesheet **re-runs `computeCost`, re-stamps `approved_by` / `approved_at`, and
  re-fires `syncTimesheetToBuildexact(...)`** (line 446, fire-and-forget).
- `mass-approve` loops this with no status filter, so a double-click or retry
  re-approves the whole batch.

**Impact:** Audit fields (`approved_by` / `approved_at`) get overwritten; cost is
recomputed; redundant Buildexact pushes are triggered. The Buildexact sync layer has
its own guards (`already_pushed`, claim lease), which limits real-world damage — but
the approval record itself is mutated on every call, which is unacceptable for a
payroll audit trail.

**Proposed fix (approval required):** Early-return (or skip in the mass-approve loop)
when `ts.status === 'approved'`. Treat re-approve as a no-op unless an explicit
`unapprove` has reset status to `submitted`.

---

### 🟠 Medium 1 — Pay-derived labour cost leaks to non-director staff
**File:** `server/lib/workforceRoutes.mjs`, `GET /api/projects/:id/labour` (lines 941–1004)
- `workers_this_week` ships **per-worker `cost`** (line 999) and `entries_by_category`
  ships **per-category `total_cost`** (line 998) to any authenticated staffer.
- Only the **aggregate** `total_cost` is director-gated (`isDirector ? totalCost : null`,
  line 1001).
- This is inconsistent with the rest of the module: the employees endpoint correctly
  hides `hourly_rate` / multipliers from non-directors (line 560), and the locked
  project decision is **"Margin ❌ No"** to staff. A supervisor can reconstruct pay
  rates from per-worker cost ÷ hours.

**Proposed fix (approval required):** Gate per-worker `cost` and per-category
`total_cost` behind `isDirector` (null them out for non-directors), matching the
employees endpoint and the aggregate.

---

### 🟠 Medium 2 — Missing try/catch around throwing awaits
**File:** `server/lib/workforceRoutes.mjs` (several handlers)
- Several handlers `await` Supabase calls without try/catch; an unexpected throw
  surfaces as an unhandled 500 with no structured `{ ok:false }` body. Operationally
  noisy for the field app, which expects the `{ ok }` envelope.

**Proposed fix (approval required):** Wrap the worker-facing handlers in the same
try/catch + `{ ok:false, error }` pattern used elsewhere in the file. Low risk,
defensive only.

---

## Verified-correct (no action)

- **Cost is computed server-side at approval** (`computeCost` + `splitOvertimeHours`
  from DB rate data); `cost_amount` is never accepted from the client. Tamper-resistant.
- **Worker read scoping is correct:** `GET /api/worker/timesheets` and
  `GET /api/worker/timesheets/:date` scope to `emp.id`.
- **Approved timesheets are edit-locked** on both create (line 1746) and update
  (line 1830), and render read-only in the PWA.
- **Buildexact sync is well-guarded** (claim lease, `already_pushed` skip, completion
  pre-check, `needs_review` flag) and only pushes APPROVED rows.
- **Role gates** (`canApprove`, `canReject`, `isDirector`) are enforced server-side via
  `requireAuth` + `requireRole("admin","supervisor")`; the `client` role is rejected;
  there is no `worker` role (magic-link `workerAuth` only).
- **H4-A redesign slice** is presentational/responsive only — KPI strips receive
  pre-computed values; no mutation/approval/sync logic was touched.
- **Local-date handling** in `WorkerLogHours.todayStr()` avoids the AU timezone
  day-shift bug (uses local date, not `toISOString`).

## Known, out-of-scope for this slice
- `field-whs` / `field-diary` UI-review failures are pre-existing and belong to the
  later H4-B Field slice — they do not feed timesheets and do not gate this go-live.

---

## GO / NO-GO

| Audience | Verdict | Rationale |
|---|---|---|
| Trusted internal crew (first cohort), with directors doing approvals | 🟡 **GO** | All blockers require a valid worker token; cost is server-computed; sync is guarded. Acceptable for a small known crew with director oversight. |
| Untrusted workers / scale / supervisors approving | 🔴 **NO-GO** | Fix Blockers 1–3 first (job-visibility validation, per-entry hours validation, idempotent approval). |

**Recommended path:** Approve and ship the three blocker fixes (all small, contained
edits in `workforceRoutes.mjs`), then GO unconditionally. Mediums 1–2 can follow as a
fast-follow but should land before supervisors are given approval rights.

---

*No code was modified in producing this audit. The fixes above are proposals pending
explicit approval.*

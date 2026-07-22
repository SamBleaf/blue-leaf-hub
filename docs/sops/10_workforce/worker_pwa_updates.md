---
sop_version: 1.0
last_reviewed: 2026-07-21
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 10-06: Worker PWA — Plans, Crew view, Multi-assign & Timesheet autofill

**Module:** Workforce / Worker PWA
**SOP ID:** 10-06
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Site workers + leading hands (worker app, magic-link token). Admin/supervisors upload plans and assign tasks from the Hub. The crew view + multi-assign controls are **leading-hand only** in the PWA (`employees.is_leading_hand`).

## 2. When to use it
- **Plans**: a worker needs the current drawings on-site.
- **Crew view**: a leading hand wants to see who's on their site each day this week.
- **Multi-assign**: a task needs several people.
- **Timesheet autofill**: logging hours — the site pre-fills from the roster.

## 3. What this does
- **Plans (F1)** — plans are uploaded into the Hub (carpentry job / construction project → **Plans card**) and stored in Supabase (bucket `job-plans`); the worker sees the **current** set on the app (Today's site card + the Tasks job card → **Plans** bottom sheet) and taps to open the PDF in their device viewer. Source of truth is the Hub upload, so issuing is deliberate (the field never builds off an un-issued revision). Superseding a plan is **explicit** — the uploader picks which current plan a revision replaces.
- **Crew view (F2)** — the Week page gains a **My week / Crew** toggle (leading hands only). Crew shows, per day, the site + who else is rostered to that same site that day (avatar stack + count, tap to expand name + trade). Read-only; refreshes when the app is re-opened.
- **Multi-assign (F3)** — a task can hold **many** assignees (avatar stack + overflow). Tap the stack (leading hand / office) to open a multi-select picker (defaults to that day's crew for the site, "show all" available). A worker sees a task if it's **shared** (no assignees) or they're on it; any assignee can tick it done. A worker who's on a task **sees who else is on it** — the row shows "with [names]" and the task detail lists everyone ("Assigned: you, …") — so the whole crew knows who they're working alongside (not just leading hands).
- **Timesheet autofill (F4)** — logging hours pre-fills the site/location from the day's roster (an editable default with a "from your schedule" hint), keyed to the date being logged.
- **Editable tasks (F5)** — when a leading hand extracts tasks from dictation/transcript, each draft is **tappable** to edit its name, info and category before adding the list. After a task is added, a leading hand can **press-and-hold** the task to reopen the same editor (name / info / category). A normal worker's tap still just opens the task to tick it done.

## 4. Before you start
- Migrations **152** (plans carpentry spine + `job-plans` bucket) and **153** (`task_assignments` + backfill) applied.
- Workers have a valid worker link; leading hands have `is_leading_hand = true`.

## 5. Step-by-step
### Issue plans (admin/supervisor, Hub)
1. Open the carpentry job (**Overview**) or the construction project (**Files** tab) → **Plans** card.
2. Choose a PDF, pick the type (Architectural/Engineering/…), add a revision label (e.g. "Rev C").
3. **New plan** = supersedes nothing. **Revision of [pick an existing current plan]** supersedes that one. Click **Upload plan**. Remove a plan to pull it from the field.

### Open plans (worker)
1. Home → **Today's site** → **Plans** (or Tasks → **Plans**) → tap a plan → it opens in your PDF viewer.

### Crew view (leading hand)
1. Week → toggle **Crew** → each day shows the site + crew; tap a day to expand the full list.

### Assign workers to a task
1. Tap a task's assignee stack (or **Assign**) → the picker lists today's crew (+ show all) → toggle people → **Save**. Removing everyone → Unassigned.

### Add tasks by dictation + edit them (leading hand)
1. Tasks → **From transcript** → dictate/paste the site walk-through → **Extract tasks**.
2. In the draft list, **tap any task** to edit its **name**, **info** and **category**; untick any you don't want; then **Add** the list.
3. For a task already on the list, **press and hold** it → the same editor opens → change name/info/category → **Save**.

### Log hours (worker)
1. Log Hours → the **Site** is pre-filled from your schedule for that day — change it if you moved sites.

## 6. What happens after
Plans stay in Dropbox as the office copy; the Hub upload is the field-issued set. Task assignments live in `task_assignments`; the primary assignee mirrors to `site_tasks.assigned_to` for back-compat. Existing single assignees were migrated automatically.

## 7. Common mistakes
- Uploading a revision as **New plan** (leaves two current sets) — use **Revision of…**.
- Expecting the crew toggle as a non-leading-hand — it's leading-hand only.
- Expecting realtime crew updates — it refreshes on re-open / pull-to-refresh.

## 8. Troubleshooting
- **"Apply migration 152/153"** notes — the feature isn't enabled until the migration runs.
- **No plans show** — none issued for that job yet (upload in the Hub).
- **Can't see a task assigned to someone else** — correct; you only see shared or your own tasks.

## 9. Related SOPs
- SOP 10-01 Workforce Overview · SOP 10-05 BLB Charge Up · SOP 11 Client Portal (document model).

## 10. Automation notes
- Plans: `GET/POST /api/carpentry/jobs/:id/plans`, `GET/POST /api/projects/:id/plans`, `DELETE /api/job-plans/:id`, `GET /api/job-plans/:id/download` (admin/supervisor); worker `GET /api/worker/jobs/:id/plans` + `GET /api/worker/plans/:id/download` (access-gated via `workerVisibleJobs`). Supersession explicit via `supersedesDocumentId`. Bucket `job-plans` (private, signed URLs).
- Crew: `GET /api/worker/crew/day?date=&jobId=&jobType=` (leading-hand; same site-spine + day; charge-up narrowed fail-soft).
- Multi-assign: `task_assignments` (mig 153) + pure/impure helpers in `server/lib/taskAssignments.mjs` (`visibleToWorker`, `firstAssigneeId`, `overlayAssignees`, `attachAssigneesFromDb`, `assigneesForTask`, `setAssignees`). Assign: `POST /api/carpentry/tasks/:id/assignees` (admin/supervisor) + `POST /api/worker/tasks/:id/assignees` (leading-hand). Shared `AssigneeStack` + `AssigneePickerSheet`. Dual-read/write, probe-gated fail-soft. Unit tests `scripts/tests/task-assignments.test.mjs`.
- Autofill: `WorkerLogHours` reads `/api/worker/allocations/week?from=to=date`.

## 11. Screenshots
Not yet captured — capture on first live use (Plans sheet, Crew toggle, multi-assign picker, autofill hint).

## 12. Edge cases
- No rostered site for a day → no autofill default; crew view shows an empty row.
- Pre-migration → plans/tasks degrade to empty/legacy single-assign (no crash).
- Charge-up sites share one carpentry job → crew narrows by `charge_up_job_id` (fail-soft pre-mig-146).

## 13. Owner
Admin. Next review: 2026-11-30.

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Migrations 152 + 153 applied; a worker link + a leading-hand employee exist.

**TC-01 — Issue + open a plan**
1. Hub → carpentry job → Plans card → upload a PDF (New plan) → Expected: it lists.
2. Worker app → Today/Tasks → Plans → tap it → Expected: the correct PDF opens.
- [ ] Pass  [ ] Fail

**TC-02 — Explicit supersession**
1. Upload a differently-named revision as **Revision of** the first plan → Expected: exactly one current for that slot; two current plans of the same type can coexist.
- [ ] Pass  [ ] Fail

**TC-03 — Plans access control**
1. As a worker, request a plan for a job you're not on (via the API) → Expected: 403, not the file.
- [ ] Pass  [ ] Fail

**TC-04 — Crew view (leading hand only)**
1. As a leading hand: Week → Crew → Expected: each day shows the site + who's rostered there, matching the Planner; follows you across sites in the week.
2. As a normal worker: Expected: no toggle.
- [ ] Pass  [ ] Fail

**TC-05 — Multi-assign holds several + survives**
1. Assign 3 workers to a task → Expected: an avatar stack (+N overflow); pre-existing single assignees still show.
2. Remove the first assignee → Expected: it re-points to the next (primary mirror stays valid); remove all → Unassigned.
- [ ] Pass  [ ] Fail

**TC-06 — No leak of others' tasks + co-assignee visibility**
1. Worker M (not leading hand): task assigned only to X → Expected: M does NOT see it; a shared (unassigned) task and M's own tasks DO show; any assignee can tick a shared/own task done.
2. Task assigned to [M, X]: as worker M → Expected: the row shows "with [X's first name]"; opening it lists "Assigned: you, [X]". A solo task assigned only to M still shows "Assigned to you".
- [ ] Pass  [ ] Fail

**TC-07 — Timesheet autofill**
1. Log hours for today → Expected: the site is pre-filled from your schedule ("from your schedule" hint) and is still changeable.
2. Back-fill a past rostered day via Week → Expected: that day's scheduled site pre-fills. Unrostered day → no default.
- [ ] Pass  [ ] Fail

**TC-08 — Edit dictated tasks + hold-to-edit (leading hand)**
1. From transcript → Extract → **tap** a draft → change its name, info and category → the row reflects the change → **Add**. Expected: the added task shows the edited name/category (and info in its detail).
2. **Press and hold** an existing task → editor opens → change the name/category → **Save**. Expected: the row updates; reopening shows the new values; a plain tap still opens the completion sheet (not the editor).
3. As a normal worker (not leading hand): Expected: holding a task does nothing (no editor); tap opens the task to tick it done.
- [ ] Pass  [ ] Fail

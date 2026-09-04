---
sop_version: 1.0
last_reviewed: 2026-08-30
app_version: main
screenshot_status: placeholders_only
owner: Admin / Supervisor
test_status: untested
---

# SOP: The construction programme — proposal, Won schedule handoff & client timeline

**Module:** Sales
**SOP ID:** 02-26
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin and Supervisor staff who own a lead through the back half of the pipeline:

- The **Sales / estimating owner** who previews the construction programme in the **Tender** stage and signs it off before it goes to a client.
- The **Supervisor / operator** who, once the lead is **Won**, sets the target start date, drafts the Operations schedule, adds the mandatory building notifications, and keeps the client portal timeline in step.

You do not need to be technical. You do need the Buildxact estimate to already carry SCHED (duration) lines — that is where the whole programme comes from.

## 2. When to use it

Use this SOP when a lead reaches the **Tender** stage and you need a build timeline to put in front of the client, and again when the lead moves to **Won** and Operations needs a starting schedule.

Typical moments:

- You are building the Fixed-Price Proposal and need the "how long will it take" answer.
- The client has asked for an indicative programme or a timeline page.
- The lead has just been marked **Won** and you are doing the Operations handoff.
- Building Consent (the DNF) has been granted and the mandatory inspection notifications need to sit on the schedule.
- Operations has refined the dates and the client's portal timeline needs a re-sync.

This is **one continuous chain from one source**: the estimate feeds the programme, the programme feeds the proposal, the proposal number becomes the Ops draft schedule, and the Ops schedule feeds the client portal. You never re-type a timeline by hand.

## 3. What this does

The construction programme is **derived automatically** from the Buildxact estimate's SCHED line items. Each SCHED line carries a duration; the system buckets those durations into eight readable client stages and adds Blue Leaf's internal buffer scheme ("under-promise, over-deliver"). The eight stages are:

1. Site establishment
2. Earthworks & footings
3. Frame
4. Roof & lock-up
5. Services rough-in
6. Linings & waterproofing
7. Fit-out & joinery
8. Finishes & handover

The programme is **time-based** — weeks and months **from site start** — never calendar dates, because there is no start date until the job is Won.

The chain has four linked pieces plus the notifications step:

- **SC-1 — the programme (Tender stage preview).** A bar chart of the eight stages with a "≈ N months" headline, shown on the Tender-stage panel. Buffers are baked in but shown to staff only.
- **SC-2 — the client page + sign-off.** A clean SVG "Preview client page" of the programme, and a **hard sign-off gate**: the programme must be signed off before it is allowed into a client document.
- **SC-3 — the Won handoff.** At Won, you set a **Target start date** and draft the Operations schedule from the same programme. Operations then owns and refines it.
- **CW-3 — building-notification hold-points.** One click drops the SA mandatory notifications (commencement, pre-slab/footings, frame, wet-area, completion) onto the schedule as pinned inspection hold-points. These stay internal.
- **SC-4 — the client portal timeline.** The client portal's timeline auto-feeds from the Ops schedule, so the client sees the real build stages (never the internal buffers or hold-points).

> The buffers are an **internal policy**. The client only ever sees the final, rounded programme.

## 4. Before you start

- [ ] The lead exists and has a **Buildxact estimate linked** — either a Fee Proposal (`fee_proposal_id`) or a Buildxact estimate on the job (`job_id`). Without it, the programme cannot build.
- [ ] The estimate contains **SCHED (duration) lines**. If there are no SCHED lines, the panel shows a "no timeline yet" message and there is nothing to sign off. Add SCHED lines in Buildxact first.
- [ ] For the **sign-off** step, migration **197** must be applied (it adds `schedule_signed_off_at` / `schedule_signed_off_by` on `leads`). If it is not applied, sign-off will error.
- [ ] For the **Won handoff**, the lead must be at stage **Won**, must have a job (`job_id`), and that job must have an Operations project row. Winning the lead and creating the job produces this.
- [ ] For **building notifications**, the build schedule must already be seeded (do the "Draft the build schedule" step first) and Building Consent (the DNF) should be granted.
- [ ] You are logged in as active staff (Admin or Supervisor). Client portal accounts cannot use these screens.

## 5. Step-by-step process

### Part A — Preview and sign off the programme (Tender stage)

1. Open the lead and confirm the stage badge reads **Tender**.
2. Scroll to the **Construction programme** panel (headed "Construction programme (draft — from the estimate)").
3. Read the programme. Each row is a stage with a bar and a weeks count; the chip in the top-right shows the overall headline, e.g. **"≈ 7 months"**. The footer line shows how the buffers were applied, e.g. *"base 24w → 28w with buffers (stage +15% · programme +10% · +3w calendar)"*.
4. If instead you see *"No SCHED line items found…"* or *"No estimate linked yet…"*, stop and fix the estimate in Buildxact — there is nothing to sign off yet.
5. Click **Preview client page ↗** to open the SVG programme chart (the clean, client-facing visual) in a new tab. Check the stage labels and rough proportions read correctly.
6. When you are happy the programme is right, click **Sign off programme**. The button changes to **✓ Signed off**.
7. If the estimate later changes and the programme is now wrong, click **revoke** next to "✓ Signed off", fix the estimate, and sign off again.

### Part B — Draft the Operations schedule at Won (SC-3)

8. When the lead is marked **Won**, open it and scroll to the **Operations schedule handoff** panel.
9. Set the **Target start date**. It defaults to about four weeks out; adjust it to the realistic site start.
10. Click **Draft the build schedule →**. The system creates a draft Operations schedule from the estimate programme, dated from your target start. On success the button reads **✓ Schedule drafted** and the message confirms how many stages were created and that the client timeline was auto-fed.
11. If you see *"This project already has a schedule…"*, a schedule already exists — do not try to re-draft; edit it in Operations instead.

### Part C — Add the building-notification hold-points (CW-3)

12. Once **Building Consent (the DNF)** is granted, click **Add building-notification hold-points**. This drops the five SA mandatory notifications onto the schedule as pinned inspection points. The button reads **✓ Notifications added**.
13. These hold-points are internal reminders for the leading hand to give notice before proceeding past each stage. They never appear on the client timeline.

### Part D — Keep the client timeline in step (SC-4)

14. The client portal timeline is fed automatically when you draft the schedule. After **Operations refines the dates**, click **↻ Re-sync client timeline** to push the updated stages to the portal.
15. The re-sync **preserves** any achieved dates and hero photos already attached to a milestone, and it excludes the internal hold-points. Confirm the success message shows the number of milestones synced.

## 6. What happens next

- Once **signed off**, the programme is authorised to go into the client-facing proposal. (The automatic DOCX embed into the PBSA proposal template is deferred until that template is finalised; for now the signed-off programme is the "Preview client page" visual you present.)
- Once the schedule is **drafted at Won**, ownership passes to **Operations** — they refine dates, overlaps and dependencies in the Schedule Manager. Sales does not edit it after this.
- The **client portal** shows a light timeline of the real build stages, updating whenever Operations re-syncs.
- The **building-notification hold-points** sit on the Ops schedule as pinned inspections the site team must action before each gated stage.
- A note is logged to the lead's activity timeline for each sign-off, seed, notification add, and (implicitly) each portal change, so there is an audit trail.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Trying to build the programme with no SCHED lines | Buildxact estimate has cost lines but no duration (SCHED) lines | Add SCHED lines to the estimate in Buildxact first; the panel builds automatically once they exist |
| Presenting a programme that was never signed off | The sign-off gate is easy to skip in a hurry | Always click **Sign off programme** before putting the timeline in front of a client |
| Re-drafting the Ops schedule after Operations started editing | Assuming "Draft the build schedule" refreshes an existing schedule | It never clobbers an existing schedule — it refuses with a 409; edit in Operations instead |
| Setting the target start to today | The default is ~4 weeks out and gets accepted without thought | Set a realistic site start; every Ops date and the portal timeline flow from it |
| Adding building notifications before seeding the schedule | Doing steps out of order | Draft the build schedule first, then add notifications — they anchor to the seeded stages |
| Expecting buffers to show on the client view | Confusing the internal staff panel with the client page | Buffers are internal only; the client sees the final rounded programme and the portal shows stages only |
| Forgetting to re-sync after Operations moves dates | The portal does not live-mirror every edit | Click **↻ Re-sync client timeline** after Operations refines the schedule |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| "No SCHED line items found in the estimate yet…" | Estimate has no duration lines | Add SCHED lines in Buildxact; reload the panel |
| "No estimate linked yet — upload the Buildxact estimate…" | Lead has no `fee_proposal_id` and no estimate on the job | Link the Fee Proposal or import the Buildxact estimate onto the job |
| Sign-off click errors / column not found | Migration 197 not applied to this database | Apply `197_schedule_signoff.sql` in Supabase, then run `NOTIFY pgrst, 'reload schema';` |
| "Preview client page" opens a tab that says "Unauthorised" | The preview link opens the raw API image URL in a new tab, which does not carry your login token | Known limitation of the inline preview link; use the panel bars to review, or open it from within an authenticated session |
| "No schedule to seed — add SCHED lines to the estimate first." | Trying to draft the Ops schedule with an empty programme | Fix the estimate so the programme builds, then draft |
| "No Operations project yet — the job must be won." | Job/project not created for the Won lead | Create the Job from the Won lead first, then draft the schedule |
| "This project already has a schedule — edit it in Operations." | The Ops schedule was already seeded | Do not re-draft; open Operations and edit there |
| "Building-notification hold-points are already on the schedule." | Notifications were already added | They only go on once; no action needed |
| "Seed the build schedule first, then add the notifications." | Notifications clicked before the schedule was drafted | Draft the build schedule, then add notifications |
| Client timeline looks stale | Operations changed dates but nobody re-synced | Click **↻ Re-sync client timeline** |

## 9. Related modules

- [02-22 Run the Tender stage](02-22_tender_stage.md) — the stage where the programme preview and sign-off live.
- [02-23 Complete a Won lead and hand off to Operations](02-23_won_ops_handoff.md) — the Won handoff this SOP's Part B/C/D sit inside.
- [02-21 Run the Consultants stage](02-21_consultants_stage.md) — where the specified F&F schedule that feeds the proposal is assembled.
- [02-02 Move a lead through pipeline stages](02-02_move_lead_through_stages.md) — moving the lead to Tender and Won.
- [02-03 Log a call, meeting or note](02-03_log_activity.md) — the activity timeline where sign-off and seed notes are recorded.

## 10. Screenshot placeholders

- [insert screenshot: Tender stage — Construction programme panel with stage bars and the "≈ N months" chip]
- [insert screenshot: buffer footer line showing "base Xw → Yw with buffers (stage +15% · programme +10% · +3w calendar)"]
- [insert screenshot: the "Preview client page" SVG programme chart opened in a new tab]
- [insert screenshot: programme panel showing "✓ Signed off" with the revoke link]
- [insert screenshot: Won lead — Operations schedule handoff panel with Target start date and the three action buttons]
- [insert screenshot: success message after drafting — "Draft Ops schedule created — N stages…; client timeline auto-fed"]
- [insert screenshot: "✓ Notifications added" state after adding building-notification hold-points]
- [insert screenshot: empty state — "No SCHED line items found in the estimate yet…"]

## 11. Automation notes

Every automated action in this chain:

- **View programme** — `GET /api/sales/leads/:id/schedule`. Read-only. Resolves the estimate categories (from `fee_proposals.categories` via `fee_proposal_id`, else `buildexact_estimates.categories` via `job_id`), loads the buffer scheme from `user_settings` key `crm_schedule_buffers` (defaults: per-stage +15%, programme +10%, +3 calendar weeks), and returns the built schedule. Writes nothing.
- **Preview image** — `GET /api/sales/leads/:id/schedule/gantt.svg`. Renders the programme to an SVG (`Content-Type: image/svg+xml`, `Cache-Control: no-store`). Writes nothing. Returns 404 if there is no schedule.
- **Sign off** — `POST /api/sales/leads/:id/schedule/sign-off`. Sets `leads.schedule_signed_off_at` (timestamptz = now) and `leads.schedule_signed_off_by` (uuid = caller). With body `{ revoke: true }` it nulls both. Inserts a `lead_activities` row (`activity_type = "note"`, summary "Construction programme signed off" / "…revoked"). Best-effort — the note failing does not fail the sign-off.
- **Draft the Ops schedule** — `POST /api/sales/leads/:id/seed-ops-schedule` with `{ startDate: "YYYY-MM-DD" }`. Inserts `schedule_tasks` rows (one per stage: `status = "planned"`, `task_type = "build"`, `is_hold_point = false`, `depends_on = []`, dated sequentially from `startDate`). Best-effort updates `projects.tentative_start_date`. Then auto-runs the portal sync (below). Inserts a `lead_activities` note. Refuses (409) if a schedule already exists.
- **Add building notifications** — `POST /api/sales/leads/:id/building-notifications`. Inserts `schedule_tasks` rows for the five SA notifications (`task_type = "inspection"`, `is_hold_point = true`, `duration_days = 0`, `hold_point_description` = the give-notice reminder), each anchored to a matching seeded stage. Inserts a `lead_activities` note. Refuses (409) if inspection tasks already exist.
- **Sync client timeline** — `POST /api/sales/leads/:id/sync-portal-timeline` (also runs automatically inside the seed step). Upserts `portal_milestones` (one per client-facing build stage, `key = "sched:<phase>"`, `label`, `eta = end_date`, `sort_order`) on conflict `(project_id, key)`. **Deliberately omits `achieved_at` and `hero_photo_id` from the payload so they are preserved.** Excludes hold-points and inspection tasks. Deletes stale `sched:%` milestones whose stage no longer exists.

No client emails are sent by any step in this SOP. The only client-visible output is the portal timeline (via `portal_milestones`).

## 12. Edge cases and limits

- **No calendar dates until Won.** The programme is purely time-based (weeks/months from site start). Real dates only exist once you set the Target start at Won.
- **Buffers are internal and never labelled to the client.** The staff panel shows the base-vs-buffered maths; the client page and portal show only the final figures.
- **Unmatched estimate phases fall to "Finishes & handover."** If a SCHED line's phase does not map to one of the first seven stages, its duration lands in the last stage. Check the bars look sensible.
- **Sign-off is a gate, not a lock on the estimate.** Signing off does not freeze the estimate; if the estimate changes afterwards, revoke and re-sign so the client never sees a stale programme.
- **Draft never overwrites.** The seed step refuses if any live `schedule_tasks` exist for the project — this protects Operations' work. Same for notifications (skips if inspections already exist).
- **The DOCX embed is deferred.** The programme is not yet auto-inserted into the PBSA proposal DOCX; that waits until the proposal template is finalised. Today the signed-off "Preview client page" is what you present.
- **Portal sync needs an Ops project.** Re-sync and seed both require the Won job to have an Operations project row; without it you get a 422.
- **Notifications anchor to seeded stages.** If the schedule has no tasks, or none can be anchored, the notification step returns a 422 rather than adding orphan rows.

## 13. Owner of the process

**Owner:** Admin / Supervisor. The Sales/estimating owner is responsible for the Tender-stage preview and sign-off; the Supervisor/operator is responsible for the Won handoff, building notifications, and portal re-syncs. Operations owns the schedule once it is drafted.

**Next review date:** 2027-02-28 (6 months from last_reviewed 2026-08-30).

## 14. Troubleshoot Agent Test Script

**Pre-test setup**

- Confirm migration **197** is applied (`leads.schedule_signed_off_at`, `leads.schedule_signed_off_by` exist). If unsure, run `NOTIFY pgrst, 'reload schema';` after applying.
- Create or pick a **test lead** (use the `is_test` test-lead harness from SOP 02-13 so nothing touches real data). Give it a linked Buildxact estimate that contains **at least 3 SCHED lines** across different phases (e.g. site_prep, frame, fix_out).
- Have a **second test lead** with an estimate that has **cost lines but no SCHED lines** (for the empty-programme case).
- Note the lead ids. Have a valid staff auth token (Admin or Supervisor) and, for TC-04, a portal **client** account token.
- For the Won-side tests (TC-06, TC-07): win the first test lead so it has a `job_id` and an Operations `projects` row, or use a pre-won test lead that meets those conditions.

---

**TC-01 — Happy path: preview and sign off the programme**
Steps:
1. Open the first test lead (stage **Tender**).
2. Confirm the **Construction programme** panel renders stage bars and a "≈ N months" chip.
3. Click **Preview client page ↗** and confirm an SVG chart opens.
4. Click **Sign off programme**; confirm the button becomes **✓ Signed off**.

Expected UI: bars for each mapped stage, the months chip, the buffer footer line, and the "✓ Signed off" state with a **revoke** link.
Expected DB: in table `leads`, for this lead, `schedule_signed_off_at` is a non-null timestamptz and `schedule_signed_off_by` equals the caller's user id. A `lead_activities` row exists with `activity_type = "note"` and `summary = "Construction programme signed off"`.
- [ ] Pass  [ ] Fail

---

**TC-02 — Empty required field: draft schedule with no target start date**
Steps:
1. Open the Won test lead's **Operations schedule handoff** panel.
2. Clear the **Target start date** field (or send `POST /api/sales/leads/:id/seed-ops-schedule` with an empty/invalid `startDate`).
3. Click **Draft the build schedule →**.

Expected UI: an error message *"A target start date (YYYY-MM-DD) is required."* (HTTP 400). The button does not switch to "✓ Schedule drafted".
Expected DB: no new rows in `schedule_tasks` for this project.
- [ ] Pass  [ ] Fail

---

**TC-03 — Duplicate submission: draft the schedule twice**
Steps:
1. On the Won test lead, set a valid Target start date and click **Draft the build schedule →** — confirm it succeeds.
2. Reload and click **Draft the build schedule →** again (or POST the seed endpoint a second time).

Expected UI: the second attempt returns *"This project already has a schedule — edit it in Operations."* (HTTP 409).
Expected DB: in `schedule_tasks`, the count of `task_type = "build"` rows for this `project_id` is unchanged from after the first draft — no duplicate stage rows.
- [ ] Pass  [ ] Fail

---

**TC-04 — Wrong role: portal client cannot use the endpoints**
Steps:
1. Using a portal **client** account token, call `POST /api/sales/leads/:id/schedule/sign-off` (and/or `GET /api/sales/leads/:id/schedule`).

Expected UI/response: HTTP 403 with `{ ok: false, error: "Forbidden" }` (client role is blocked by `requireAuth`; a request with no token returns 401 "Unauthorised").
Expected DB: no change — `leads.schedule_signed_off_at` is not written.
- [ ] Pass  [ ] Fail

---

**TC-05 — Feature edge: estimate has no SCHED lines**
Steps:
1. Open the second test lead (estimate with cost lines but no SCHED lines) in the **Tender** stage.
2. Observe the Construction programme panel.
3. Also call `GET /api/sales/leads/:id/schedule/gantt.svg` directly.

Expected UI: the panel shows *"No SCHED line items found in the estimate yet — add duration (SCHED) lines in Buildxact…"*, with **no** sign-off button. The gantt.svg call returns HTTP 404 *"No schedule to render — add SCHED lines to the estimate."*
Expected DB: no change to `leads` sign-off columns; nothing written.
- [ ] Pass  [ ] Fail

---

**TC-06 — Feature edge: building-notification hold-points (add + idempotency)**
Steps:
1. On the Won test lead with a drafted schedule, click **Add building-notification hold-points**.
2. Confirm the button becomes **✓ Notifications added**.
3. Click / POST the notifications endpoint again.

Expected UI: first add succeeds with "Added N building-notification hold-points…"; the second returns *"Building-notification hold-points are already on the schedule."* (HTTP 409).
Expected DB: in `schedule_tasks` for this `project_id`, five rows exist with `task_type = "inspection"`, `is_hold_point = true`, `duration_days = 0`, and a non-empty `hold_point_description`. The count does not increase on the second attempt.
- [ ] Pass  [ ] Fail

---

**TC-07 — Feature edge: re-sync preserves achieved dates and excludes hold-points**
Steps:
1. On the Won test lead with a drafted schedule (portal milestones already auto-fed), manually set `achieved_at` (and, if available, `hero_photo_id`) on one `portal_milestones` row whose `key` starts with `sched:`.
2. Click **↻ Re-sync client timeline**.

Expected UI: success message "Client portal timeline synced from the schedule — N milestones."
Expected DB: in `portal_milestones`, the row you edited **still** has its `achieved_at` (and `hero_photo_id`) value — the re-sync did not clear it. There is **no** `portal_milestones` row for any inspection/hold-point task (keys only exist for client-facing build stages). Stale `sched:%` rows for stages no longer in the schedule are removed.
- [ ] Pass  [ ] Fail
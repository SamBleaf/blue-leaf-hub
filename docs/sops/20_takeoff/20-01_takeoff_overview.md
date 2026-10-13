---
sop_version: 1.0
last_reviewed: 2026-10-13
app_version: takeoff-r03
screenshot_status: placeholders_only
owner: Admin / Director
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP: Takeoffs — Overview, Access and Switching It On

**Module:** Takeoffs (flashing takeoff from plans)  
**SOP ID:** 20-01  
**Status:** Draft  
**Priority:** High

> **Feature status (2026-10-13):** Takeoffs are built on branch `takeoff-r03` and ship **switched off**. The API only serves them when the server environment variable `TAKEOFF_ENABLED=true` is set, and **database migration 206 (`supabase/migrations/206_takeoff_foundation.sql`) has not been applied in production**. Until both are done the **Takeoffs** buttons do not appear anywhere. Nothing in this SOP has been tested against the live app.

---

## 1. Who uses this

| Action | Admin (Director) — Hub | Supervisor — Hub | Leading hand — Worker app | Worker-app login linked to an admin/supervisor | Ordinary field worker | Admin "preview as worker" |
|---|---|---|---|---|---|---|
| See the Takeoffs button and open takeoffs | Yes | Yes | Yes — only on jobs they can already see | Yes | **No** | Only if the previewed employee is a leading hand — **read-only** |
| Start a takeoff, scale plans, measure, edit materials | Yes | Yes | Yes | Yes | No | No |
| Prepare a supplier order and export PDFs | Yes | Yes | Yes | Yes | No | No |
| Edit company standards / **Save as standard** | Yes | Yes | No | No | No | No |
| **Record order placed** / **Record a cancellation** | **Yes (only role)** | No | No | No | No | No |
| See supplier order contact (name/email/phone) — never account terms or notes | Yes | Yes | Yes (they send the PDF themselves) | Yes | No | Yes, read-only (if the previewed employee is a leading hand) |

Source of truth: `server/lib/takeoff/takeoffAccess.mjs` (`staffCapabilities`, `workerCapabilities`). Hub "employee" logins and client-portal users have no takeoff access at all.

Switching the feature on (Section 5A) is a Director / developer task (Railway variables + Supabase SQL editor).

---

## 2. When to use it

- Before anyone uses Takeoffs for the first time — to understand what it does, who can use it and where it lives.
- When the Director decides to switch Takeoffs on (or off) for the business.
- When someone says "I can't see the Takeoffs button" or "it says I don't have access".
- When a new leading hand needs to start preparing flashing orders from the Worker app.

---

## 3. What this does

Takeoffs lets the office and leading hands measure flashings straight off the job's issued PDF plans on a phone or computer, draw the flashing profile, and turn the measurements into a length schedule (quantity × finished length). From that schedule you export a frozen supplier PDF, send it to the supplier yourself, and then the Director records that the order was placed. **The Hub never sends anything to the supplier, never prices anything, and a takeoff is not an estimate** (estimating stays in Bestimator / Buildxact).

---

## 4. Before you start

- The feature must be switched on (Section 5A). If it is off, no Takeoffs button appears.
- The job must have at least one plan **uploaded as a PDF through the job's Plans card** (plans stored only in Dropbox do not appear in Takeoffs).
- You need the right role (Section 1). Leading hands are set in **Workforce › Team** by ticking **Leading hand (enables photo logging)** on the employee.
- An Operations project must be linked to its job before it can hold takeoffs.
- A BLB Charge Up site must belong to a carpentry job before its Plans tab shows Takeoffs.

---

## 5. Step-by-step process

### A. Switch Takeoffs on (Director / developer — one-off)

1. Open the Supabase dashboard → **SQL editor** for the production project.
2. Check whether migration 206 is applied by running these read-only checks (they are at the bottom of the migration file):
   - `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'takeoff_%';` — expect **13** tables.
   - `SELECT column_name FROM information_schema.columns WHERE table_name='job_documents' AND column_name IN ('revision_label','content_sha256','archived_at');` — expect 3 rows.
   - `SELECT has_function_privilege('anon','public.takeoff_commit(uuid,integer,jsonb,jsonb,text)','EXECUTE');` — expect `false`.
3. If they are missing, paste the whole of `supabase/migrations/206_takeoff_foundation.sql` into the SQL editor and run it once. It is additive: new `takeoff_*` tables and functions, a private `takeoff-exports` storage bucket, five nullable columns on `job_documents` (`revision_label`, `content_sha256`, `byte_size`, `archived_at`, `archived_by`), and a guard trigger on `job_documents` that stops a hash-recorded plan's stored file or job from being changed after upload (older plans without a hash are not affected). It ends with `NOTIFY pgrst, 'reload schema';`.
4. In **Storage**, confirm a private bucket called `takeoff-exports` now exists.
5. In **Railway → the API service → Variables**, add `TAKEOFF_ENABLED` = `true`, then redeploy / restart the API. (Local development: add `TAKEOFF_ENABLED=true` to `.env` and restart `npm run dev`.)
6. Check the API log for `[takeoff] staff routes registered` with **no** "(TAKEOFF_ENABLED is off)" on the end.
7. Make sure each leading hand who should prepare takeoffs has **Leading hand** ticked in **Workforce › Team**.

> 💡 **Tip:** To switch Takeoffs off again, remove `TAKEOFF_ENABLED` (or set it to anything other than `true`) and restart the API. All takeoffs, exports and order records stay in the database. **Never drop the takeoff tables** — they hold job evidence.

[insert screenshot: Railway API service Variables tab with TAKEOFF_ENABLED = true]

### B. Open Takeoffs from the Hub (Admin / Supervisor)

1. Open the job:
   - **Carpentry job:** **Carpentry** → open the job → **Overview** tab → scroll to the **Plans (issued to the field)** card.
   - **Construction project:** **Operations** → open the project → **Files** tab → **Plans (issued to the field)** card.
   - **BLB Charge Up site:** open the BLB Charge Up job → tap the site → in the site pop-up tap the **Plans** tab.
2. Click **Takeoffs** at the top-right of the Plans card.
3. The **Takeoffs** page opens with the job address underneath. **‹ Back to job** returns you to the job.
4. If there are no takeoffs yet you will see "No takeoffs on this job yet." Click **Start a flashing takeoff**. A takeoff called **Flashings** is created and opens.
5. If the job already has one takeoff it opens straight away. If it has more than one, pick it from the list (a **Needs review** badge means a plan it used has been replaced — see SOP 20-02). **New takeoff** starts another one.

[insert screenshot: carpentry job Overview tab — Plans card with the Takeoffs button]

### C. Open Takeoffs from the Worker app (leading hands)

1. In the Worker app, either:
   - on **Today**, tap **Plans — View →** on the site card, or
   - on **Tasks**, choose the job and tap **Plans — View →**.
2. The **Plans** sheet slides up. Leading hands see a blue button **Takeoffs — measure & order flashings** under the plan list. Tap it.
3. The same takeoff screens as the Hub open inside the Worker app.

> 💡 **Tip:** Ordinary workers never see this button — they can still open plans in their phone's PDF viewer as before.

[insert screenshot: Worker app Plans sheet with "Takeoffs — measure & order flashings" button]

### D. Find your way around a takeoff (overview screen)

1. **Header** — takeoff name, job address, and the save chip (**Saved / Saving… / Not synced / Conflict / Not saved** — see SOP 20-07).
2. **Plan** section — the plan and page you are working on with a chip **Not scaled / Ready / Needs review** (a red **Replaced** chip if that plan has been superseded). Buttons: **Set up plans**, **Scale this page**, **Measure** (read-only users see **View plan**). See SOPs 20-02 and 20-03.
3. **Materials** section — each flashing/material with its finish, colour, BMT, indicative girth, item count and piece count. Buttons: **Profile**, **Rules**, **Add lengths**, **Save as standard** (Hub staff only), **Remove**, and **Add material** at the top. See SOP 20-04.
4. **Length schedule** section — total pieces and LM, **Open schedule** and **Review & export order** (read-only users see **Orders**). See SOPs 20-05 and 20-06.
5. Banners appear at the top when something needs you: recovered changes, a save conflict, "Recovery unavailable", or a replaced plan (**Mark reviewed**).

[insert screenshot: takeoff overview — Plan, Materials and Length schedule sections]

### E. Look at a leading hand's takeoffs read-only (Admin "preview as worker")

1. Open the worker preview for the leading hand (Director only — supervisors are refused).
2. Open their Plans sheet → **Takeoffs — measure & order flashings**.
3. A blue banner reads "Preview — read-only. You can look, but nothing can be changed as this worker." Every save, export and order action is refused.

---

## 6. What happens next

- Starting a takeoff creates one record for the job; from there you set up and scale the plan (SOP 20-02), measure runs and count pieces (SOP 20-03), set up the flashing profile and material (SOP 20-04), check the length schedule (SOP 20-05) and export the supplier order (SOP 20-06).
- Everything saves automatically (SOP 20-07). Nobody is notified and no email is sent at any stage.
- The Director is the only person who records an order as placed; until then nothing counts as ordered.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Expecting Takeoffs to appear after only applying migration 206 | The feature flag is separate | Set `TAKEOFF_ENABLED=true` **and** restart the API |
| Switching the flag on before migration 206 is applied | The button appears but every takeoff screen errors | Apply migration 206 first, then the flag |
| A leading hand can't see Takeoffs | **Leading hand** isn't ticked, or they aren't assigned/visible on that job | Tick Leading hand in Workforce › Team; check the job shows in their Worker app |
| Plans exist in Dropbox but Takeoffs says there are none | Takeoffs only reads PDFs uploaded through the Plans card | Upload the plan PDF on the Plans card |
| Treating a takeoff as a quote/estimate | It measures for ordering, not pricing | Keep estimating in Bestimator / Buildxact |
| Clicking **New takeoff** to "refresh" | It creates a second takeoff on the job | Open the existing takeoff from the list instead |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| No **Takeoffs** button on the Plans card / Plans sheet | Feature off (`TAKEOFF_ENABLED` not `true`), wrong role, or (worker) not a leading hand | Section 5A; check role table in Section 1 |
| "Takeoffs aren't switched on yet." | Flag is off on the API server | Set the flag and restart the API |
| "Takeoffs need database migration 206 before they can be used." | Flag is on but migration 206 isn't applied in that database | Apply migration 206 (Section 5A steps 2–4) |
| "This project has no linked job to hold takeoffs. Link the project to its job first." | Operations project has no linked job (`projects.job_id` is empty) | Ask the Director to link the project to its job record, then retry. The project's Plans card shows the same problem ("This project has no linked job to hold plans.") |
| "You don't have access to this." followed by "Takeoffs are for leading hands and office staff." | Ordinary worker or non-leading-hand login | Only leading hands / admin / supervisor can use Takeoffs |
| "You don't have access to this job." | Worker app: the job/site isn't one this worker can see | Assign the worker to the job, or have the office prepare the takeoff |
| "No employee record found." | Worker app opened by a login with no employee record | Link the login to an employee in Workforce |
| "Forbidden" when previewing as a worker | Preview is a Director-only tool | Use an admin login |
| "This job has no plans yet. Upload a plan to the job first, then come back to measure it." | No PDF plans on the job's Plans card | Upload the plan on the Plans card (Hub) |
| Charge Up site Plans tab has no Takeoffs button | The site isn't linked to a parent carpentry job | Link the site to its carpentry job |
| "This plan is too large to measure in the app. Open it in your device viewer instead." | PDF over 40 MB | Use **Open in device viewer**; ask the designer for a smaller/split PDF to measure |
| "This plan set has N pages — more than the 100 the in-app viewer supports." | PDF over 100 pages | Upload just the sheets you need as a separate PDF |
| "Couldn't download the plan. Try again." | Storage download failed | **Try again**; if it repeats, check Supabase storage |
| "The stored plan doesn't match its record — re-upload it." | Stored bytes don't match the recorded checksum | Re-upload the plan as a revision |
| "This plan's file no longer matches the one that was scaled — re-upload the plan as a new revision." | The file behind a scaled plan has changed | Upload the plan again as **Revision of: …**, then re-scale (SOP 20-02) |
| "This file couldn't be opened as a PDF." | Corrupt or non-PDF file | Re-export the PDF and upload it again |

---

## 9. Related modules

- [20-02 Set up plans and scale a page → the first thing to do in a new takeoff](20-02_set_up_and_scale_plans.md)
- [20-03 Measure runs and count pieces → measuring on the plan](20-03_measure_runs_and_count.md)
- [20-04 Flashing profiles, materials and company standards → what you are measuring](20-04_profiles_materials_standards.md)
- [20-05 Length schedule and splitting long pieces → checking the cut list](20-05_length_schedule_and_split.md)
- [20-06 Export a supplier order and record it as placed → ordering](20-06_export_and_record_orders.md)
- [20-07 Saving, recovery and conflicts → what the save chip means](20-07_saving_recovery_conflicts.md)
- [10-06 Worker PWA — plans on device → where the Worker app Plans sheet comes from](../10_workforce/worker_pwa_updates.md)
- [10-05 BLB Charge Up sites → Charge Up site Plans tab](../10_workforce/charge_up_sites.md)
- [15-01 Carpentry overview → carpentry job Overview tab](../15_carpentry/15-01_carpentry_overview.md)
- [12-03 Manage user roles and access → admin / supervisor roles](../12_admin_settings/settings_manage_users.md)

---

## 10. Screenshot placeholders

[insert screenshot: carpentry job Overview tab — Plans (issued to the field) card with the Takeoffs button top-right]
[insert screenshot: Operations project Files tab — Plans card with the Takeoffs button]
[insert screenshot: BLB Charge Up site pop-up — Plans tab with the Takeoffs button]
[insert screenshot: Takeoffs page — "No takeoffs on this job yet." with Start a flashing takeoff]
[insert screenshot: Worker app Plans sheet showing "Takeoffs — measure & order flashings"]
[insert screenshot: takeoff overview with the "Preview — read-only" banner]

---

## 11. Automation notes

- **Feature flag:** `TAKEOFF_ENABLED` (server env). Off → every takeoff endpoint returns HTTP 404 `{ ok: false, error: "Takeoffs aren't switched on yet.", code: "FEATURE_DISABLED" }`, except `GET …/capabilities`, which returns `{ ok: true, enabled: false, capabilities: null }` so the UI hides the entry.
- **Entry points:** Hub `JobPlansCard` calls `GET /api/takeoff/capabilities` and shows **Takeoffs** only when `enabled && capabilities.view`. Worker `PlansSheet` calls `GET /api/worker/takeoff/capabilities?jobType=…&jobId=…` the same way.
- **Hub routes:** `/carpentry/:jobId/takeoff`, `/operations/:projectId/takeoff`, `/carpentry/:jobId/sites/:siteId/takeoff` (admin/supervisor only; others are redirected to `/home`). **Worker route:** `/worker/takeoff/:jobType/:jobId` with `jobType` = `carpentry` | `project` | `charge-up`.
- **API:** staff `/api/takeoff/…` (requireAuth + admin/supervisor); worker `/api/worker/takeoff/…` (existing worker token/visibility checks + leading-hand capability). Recording placed orders is only on the staff API and only for admin.
- **Start a flashing takeoff:** `POST …/jobs/:jobType/:jobId/workspaces` → row in `takeoff_workspaces` (exactly one of `job_id` / `carpentry_job_id` / `charge_up_job_id`, `name` "Flashings", `revision` 1, `state` 'active', `created_by_type` 'staff' or 'employee').
- **Project entry** resolves the project to its `jobs` row; a project with no job returns HTTP 409 `NO_LINKED_JOB` (no shadow job is created).
- **Missing migration:** any missing takeoff table/function returns HTTP 503 "Takeoffs need database migration 206 before they can be used." (`MIGRATION_PENDING`) — never raw Postgres text.
- **Database security:** all 13 `takeoff_*` tables have RLS on, no policies, and no anon/authenticated privileges; every `takeoff_*` function has EXECUTE revoked from PUBLIC/anon/authenticated and granted only to `service_role`.
- No email, notification or Dropbox file is created by anything in this SOP.

---

## 12. Edge cases and limits

- Only PDFs uploaded through the Plans card (stored in Supabase `job-plans`) with a plan type (Architectural, Engineering, Structural, Survey, Specification, Plan) appear in Takeoffs.
- In-app viewing limit: 40 MB per PDF and 100 pages. Larger plans can still be opened in the device's PDF viewer, but not measured in the app.
- Plans are downloaded each time a takeoff plan is opened — they are **not** stored for offline use.
- A job can have more than one takeoff; there is no rename button (every new one is called "Flashings").
- If the flag is switched off while someone has a takeoff open, their next save fails with "Takeoffs aren't switched on yet." (their unsaved edits stay in device recovery — SOP 20-07).
- Worker visibility is the same as the rest of the Worker app: a leading hand only reaches takeoffs on jobs/sites they can already see.
- Preview-as-worker is admin-only and read-only for every takeoff action (no exceptions).
- Client-portal logins and Hub "employee" logins cannot reach any takeoff route.

---

## 13. Owner of the process

Admin / Director  
Next review date: 2027-04-13

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Run locally (`npm run dev`) against an **isolated/test database with migration 206 applied** — never production (206 is not applied in production as of 2026-10-13).
- [ ] `TAKEOFF_ENABLED=true` in `.env` (TC-05 also needs a run with it unset).
- [ ] Test data, all with the `BLH TEST` marker (`buildTestJobAddress()` in `scripts/lib/testArtifactPrefixes.mjs`): one carpentry job with one PDF plan uploaded on its Plans card; one Operations project linked to a job; one project **without** `job_id`; one BLB Charge Up site under a carpentry job with its own plan.
- [ ] Logins: Admin, Supervisor, a Hub "employee"-role login; Worker-app magic-link tokens for a **leading hand** assigned to the carpentry job and an **ordinary worker** assigned to the same job.
- [ ] Optional: `npm run test:takeoff` runs the automated calculation / handler / isolated-DB tests. Record its output separately — it does not replace this script.

### Test cases

**TC-01 — Happy path (start a takeoff from the Hub)**
1. Log in as Admin. Open the test carpentry job → **Overview** → Plans card → **Takeoffs**.
2. Confirm "No takeoffs on this job yet." then click **Start a flashing takeoff**.
3. Expected result: the overview opens titled **Flashings** with the job address and a **Saved** chip; Plan section lists the uploaded plan; Materials says "No materials yet. Add a flashing to start measuring."
4. Expected API: `GET /api/takeoff/jobs/carpentry/:jobId` → `{ ok: true, job: { jobType: "carpentry", jobId, label }, workspaces: [], plans: [{ id, title, documentType, status: "current", … }], capabilities: { view: true, edit: true, export: true, editStandards: true, placeOrders: true, viewSupplierContacts: true, isPreview: false, actorKey: "staff:<uid>" } }`; `POST …/workspaces` → `{ ok: true, workspace: { id, name: "Flashings", revision: 1, state: "active", … } }`.
5. Expected DB record: one `takeoff_workspaces` row — `carpentry_job_id` = job id, `job_id` NULL, `charge_up_job_id` NULL, `name` 'Flashings', `revision` 1, `state` 'active', `created_by_type` 'staff', `created_by_user_id` = admin's auth uid.
- [ ] Pass  [ ] Fail

**TC-02 — Empty / invalid required field (job reference)**
1. Call `GET /api/takeoff/jobs/carpentry/not-a-uuid` as Admin.
2. Call `GET /api/takeoff/jobs/unknown/<valid uuid>`.
3. Call `POST /api/takeoff/jobs/carpentry/<job id>/workspaces` with body `{ "name": "" }`.
4. Expected result: step 1 → HTTP 400 `{ ok: false, error: "Invalid job id.", code: "INVALID" }`; step 2 → HTTP 400 "Unknown job type."; step 3 → succeeds and the takeoff is named **Flashings** (blank names fall back to the default).
5. Expected DB: no `takeoff_workspaces` row for steps 1–2.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission**
1. Send `POST …/workspaces` twice with the **same** body `{ "id": "<fixed uuid>", "name": "Flashings" }`.
2. In the UI, click **New takeoff** once.
3. Expected result: step 1 returns the same workspace both times (idempotent on the client id) and creates **one** row; step 2 deliberately creates a **second** takeoff called "Flashings" (no duplicate warning — this is the documented behaviour). The button is disabled while the request runs.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role (maps to A04)**
1. Hub "employee"-role login: visit `/carpentry/<job id>/takeoff` and call `GET /api/takeoff/capabilities`.
2. Ordinary worker token: open the job's Plans sheet; call `GET /api/worker/takeoff/capabilities?jobType=carpentry&jobId=<id>` and `GET /api/worker/takeoff/jobs/carpentry/<id>`; attempt `POST /api/worker/takeoff/workspaces/<ws id>/commit`.
3. Leading-hand token: open the Plans sheet and the takeoff; add a manual length (SOP 20-03 Section 5D).
4. Expected result: step 1 → redirected to `/home`; API HTTP 403 "Forbidden". Step 2 → no Takeoffs button; capabilities `{ ok: true, enabled: true, capabilities: { view: false, edit: false, export: false, editStandards: false, placeOrders: false, … } }`; jobs → HTTP 403 "Takeoffs are for leading hands and office staff." (`FORBIDDEN`); commit → HTTP 403. Step 3 → works; capabilities show `view: true, edit: true, export: true, editStandards: false, placeOrders: false, viewSupplierContacts: true, isPreview: false`.
5. Expected DB: no rows written by steps 1–2; the step-3 measurement has `created_by_type` 'employee' and `created_by_employee_id` = the leading hand's employee id (`created_by_user_id` NULL).
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (feature flag + entry visibility)**
1. Stop the API, remove `TAKEOFF_ENABLED`, start it again.
2. Check: API log shows `[takeoff] staff routes registered (TAKEOFF_ENABLED is off)`.
3. Check: `GET /api/takeoff/capabilities` → `{ ok: true, enabled: false, capabilities: null }`; the Plans card shows **no** Takeoffs button; `GET /api/takeoff/jobs/carpentry/<id>` → HTTP 404 `{ ok: false, error: "Takeoffs aren't switched on yet.", code: "FEATURE_DISABLED" }`; the same for `/api/worker/takeoff/jobs/…`.
4. Check: existing takeoff rows are untouched (row count in `takeoff_workspaces` unchanged).
5. Restore `TAKEOFF_ENABLED=true`, restart, confirm the log line has no "(off)" suffix and the button returns. Confirm no email/notification was sent at any point (check mail transport logs).
- [ ] Pass  [ ] Fail

**TC-06 — Operations project resolves to its job (A02)**
1. As Admin open the linked project → **Files** → Plans card → **Takeoffs** → **Start a flashing takeoff**.
2. Open `/operations/<project without job>/takeoff`.
3. Expected result: step 1 works; step 2 shows "This project has no linked job to hold takeoffs. Link the project to its job first." (HTTP 409, `NO_LINKED_JOB`).
4. Expected DB: step 1 row has `job_id` = the project's `job_id` (not the project id) and NULL carpentry/charge-up ids; no row for step 2.
- [ ] Pass  [ ] Fail

**TC-07 — Charge Up site scope (A03 / A06)**
1. As Admin open the Charge Up site pop-up → **Plans** → **Takeoffs** → start a takeoff.
2. As a leading hand who cannot see that site, call `GET /api/worker/takeoff/jobs/charge-up/<site id>`.
3. Commit a calibration on the site takeoff using a plan document id from the **parent carpentry job**.
4. Expected result: step 1 row has `charge_up_job_id` = site id only; step 2 → HTTP 403 "You don't have access to this job."; step 3 → HTTP 403 "That plan is not on this job."
5. Expected DB: no calibration row from step 3.
- [ ] Pass  [ ] Fail

**TC-08 — Admin preview is read-only (A05)**
1. As Admin open the Worker app preview for the leading hand; open their Plans sheet → Takeoffs → the takeoff.
2. Send `POST /api/worker/takeoff/workspaces/<id>/commit`, `POST /api/worker/takeoff/workspaces/<id>/orders` and `POST /api/worker/takeoff/orders/<id>/exports` with header `x-preview-employee-id: <leading hand id>`.
3. Repeat step 1 logged in as a Supervisor.
4. Expected result: step 1 shows "Preview — read-only. You can look, but nothing can be changed as this worker." and no edit buttons; every step-2 call → HTTP 403 "Read-only preview — you can't submit or complete work as a worker."; step 3 → HTTP 403 "Forbidden".
5. Expected DB: `takeoff_workspaces.revision` unchanged; no new order/export rows.
- [ ] Pass  [ ] Fail

**TC-09 — Missing migration reports unavailable (A25)**
1. Point the API at a database **without** migration 206, with `TAKEOFF_ENABLED=true`.
2. Open a job's Plans card → **Takeoffs**.
3. Upload a new plan on the Plans card.
4. Expected result: the takeoff page shows "Takeoffs need database migration 206 before they can be used." (HTTP 503 `MIGRATION_PENDING`) — no partial success, no raw Postgres message. Plan upload in step 3 still succeeds (pre-206 fallback).
- [ ] Pass  [ ] Fail

**TC-10 — Direct database access is denied (A07)**
1. In the SQL editor run `SELECT has_function_privilege('anon','public.takeoff_commit(uuid,integer,jsonb,jsonb,text)','EXECUTE');` and the same for `authenticated`.
2. Run `SELECT has_table_privilege('authenticated','public.takeoff_workspaces','SELECT');` and `SELECT relrowsecurity FROM pg_class WHERE relname='takeoff_workspaces';`.
3. With the anon key, call `GET <SUPABASE_URL>/rest/v1/takeoff_workspaces` and `POST <SUPABASE_URL>/rest/v1/rpc/takeoff_commit`.
4. Expected result: privileges `false`, RLS `true`; REST calls return permission denied (never rows); RPC is refused.
- [ ] Pass  [ ] Fail

**TC-11 — Open an existing carpentry plan, original-view fallback (A01)**
1. Upload a PDF larger than 40 MB to the test job; open Takeoffs → **Set up plans** → choose it.
2. Expected result: "This plan is too large to measure in the app. Open it in your device viewer instead. You can still view it in your device's PDF viewer." with **Open in device viewer**, which opens the plan in a new tab. `GET /api/takeoff/documents/<docId>/content` → HTTP 413 `TOO_LARGE`. The normal-sized plan opens with its correct title and page count.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

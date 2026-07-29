---
sop_version: 1.0
last_reviewed: 2026-07-29
app_version: 1.0 — built (Phase 1)
screenshot_status: placeholders_only
owner: Director / Leading hand
test_status: untested
---

# SOP 08-08: Carpentry SWMS & Worker Sign-on

**Module:** Carpentry job → Safety tab (`/carpentry/:jobId`), Settings → WHS / SWMS Library, Worker field app (Today's site → Safety)
**SOP ID:** 08-08
**Status:** Draft — SWMS content is DRAFT pending WHS-professional review
**Priority:** High

---

## 1. Who uses this
- **Director / office** — maintains the SWMS library (Settings) and checks who has signed (Safety tab).
- **Leading hand / supervisor** — checks the crew has signed before work starts.
- **Carpenters (employees)** — read and sign on to the SWMS in the field app.

## 2. When to use it
- **Once, when setting up:** review the SWMS library and mark each SWMS "reviewed" after your WHS consultant signs it off.
- **Per job:** nothing — the right SWMS attach automatically from the job's type. Adjust only by exception.
- **Every worker, per job:** sign on to the job's SWMS before starting that work; re-sign if a SWMS is updated.

## 3. What this does
Gives each carpentry job the Safe Work Method Statements for the work it involves (auto-selected from the job type), lets workers read and **sign on** to them in the field app, and records **which worker acknowledged which SWMS version, when** — the defensible record that protects the business in a SafeWork SA investigation or an injury dispute. In-house only (employees), no subcontractor management.

## 4. Before you start
- The SWMS library seeded (migrations 162 + 163 applied).
- The worker has their field-app link (`worker_token`) and is rostered to the job on the Planner.

## 5. Step-by-step process
**Office — maintain the library (one-time / occasional):**
1. Settings → Modules & templates → **WHS / SWMS Library**.
2. Open a SWMS, read it, and (after your consultant reviews it) click **Mark reviewed**. Edit content via **Edit**; tick **"require re-sign"** when publishing a revision (bumps the version so everyone re-signs).

**Office — per job (by exception only):**
3. Open the carpentry job → **Safety** tab. The SWMS are already attached (auto from job type). Use **+ Add SWMS** / **Remove** only if the job is unusual.
4. Check the **sign-on matrix** to see who has / hasn't signed.

**Worker — sign on (field app):**
5. Open the app → **Today's site** card → **Safety — sign SWMS**.
6. Tap a SWMS → read it → tick **"I have read and understood"** → sign with a finger → **Sign & confirm**.

## 6. What happens next
- The worker's sign-on is recorded against the job with their signature and the SWMS version.
- The Safety-tab matrix shows a ✓ for that worker/SWMS; a revised SWMS shows **re-sign** until they sign the new version.

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Relying on a DRAFT SWMS on site | Not reviewed yet | Have your WHS consultant review + mark each SWMS "reviewed" first |
| Worker didn't sign before starting | Skipped the Safety button | Leading hand checks the matrix / the "N to sign" count |
| Revised SWMS not re-signed | Edited without bumping the version | Tick "require re-sign" when saving a revision |

## 8. Troubleshooting
| Problem | Cause | Fix |
|---|---|---|
| Safety tab empty | Job type has no matching SWMS, or library not seeded | Apply migration 163; add SWMS by exception |
| Worker sees no SWMS | Not rostered / no access to the job | Roster the worker to the job on the Planner |
| "Read-only preview" on sign | Admin previewing as worker | Sign-on must be done on the worker's own device |
| Sign-on doesn't stick | Migration 162 not applied | Apply migration 162 (whs_swms_signon) |

## 9. Related modules
- Site induction (SOP 08-04), WHS engine / management plan (Operations), Planner (rostering), Worker field app.

## 10. Screenshot placeholders
- [ ] Settings → WHS / SWMS Library
- [ ] Carpentry job → Safety tab (SWMS list + sign-on matrix)
- [ ] Field app → Safety sheet (read + sign)

## 11. Automation notes
- SWMS auto-attach: on first Safety-tab / worker-SWMS load, `ensureCarpentryJobSwms` seeds `project_swms` from `workCategoriesForProjectType(project_type)` overlapping `swms_templates.work_category`.
- Sign-on version is taken server-side from the current template version (never the client), so a revision forces a re-sign (version-keyed unique index).
- WHS records are RLS read-only to the browser; all writes go through the server (service role).

## 12. Edge cases and limits
- **Phase 1 scope:** SWMS + sign-on only. No incident reporting, SDS register, or White Card capture yet.
- **DRAFT content:** every seeded SWMS is `review_status='draft'` and shows a DRAFT banner until marked reviewed — it is **not legal advice** and must be reviewed by a WHS professional before reliance.
- **Only REVIEWED SWMS can be signed on.** A DRAFT is read-only in the field app (and the server rejects a sign-on with HTTP 409) until you mark it reviewed in Settings — so no signature is ever collected against an unreviewed document.
- Sign-on is once per job; a bumped version requires a fresh sign-on.

## 13. Owner of the process
Director owns the library + review sign-off; leading hand owns crew sign-on on site.

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Migrations 162 + 163 applied
- [ ] A carpentry job (any `project_type`) and an employee rostered to it with a worker link

### Test cases

**TC-01 — Auto-attach by job type (happy path)**
1. Open a `full_package` carpentry job → Safety tab
2. Expected: all 8 SWMS attached; `autoSeeded` true on first load
3. Expected DB: `project_swms` rows with `carpentry_job_id` set
- [ ] Pass  [ ] Fail

**TC-02 — Fit-off attaches the interior set only**
1. Open a `fitoff` job → Safety tab
2. Expected: Working at Heights and Roof Work are NOT attached; manual handling, electrical, silica, nail guns ARE
- [ ] Pass  [ ] Fail

**TC-03 — Worker sign-on records the shield**
0. In Settings → WHS / SWMS Library, mark the SWMS **reviewed** first (a DRAFT is read-only)
1. In the field app (real worker token), Today's site → Safety → open the reviewed SWMS → tick + sign → confirm
2. Expected: success; `whs_swms_signon` row with `employee_id`, `carpentry_job_id`, `swms_version`, signature
3. Expected: Safety-tab matrix shows ✓ for that worker/SWMS
- [ ] Pass  [ ] Fail

**TC-04 — Re-sign on version bump**
1. Settings → edit a signed SWMS with "require re-sign" ticked (version bumps)
2. Expected: the matrix shows **re-sign** for that worker; the field app shows it unsigned again
- [ ] Pass  [ ] Fail

**TC-05 — Access control**
1. Call `GET /api/carpentry/jobs/:jobId/swms` unauthenticated
2. Expected: HTTP 401
3. Worker requests SWMS for a job they're not rostered to → HTTP 403
- [ ] Pass  [ ] Fail

**TC-06 — Preview cannot sign**
1. As admin "preview as worker", attempt a SWMS sign-on
2. Expected: HTTP 403 (read-only preview) — no `whs_swms_signon` row
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Auto-attach correct per job type
- [ ] Worker sign-on records with signature + version
- [ ] Re-sign enforced on version bump
- [ ] Access control (401/403) holds; preview cannot sign
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

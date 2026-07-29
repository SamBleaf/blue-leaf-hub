---
sop_version: 2.0
last_reviewed: 2026-07-30
app_version: 2.0 — site WHS pack (Phases A–C)
screenshot_status: placeholders_only
owner: Director / Leading hand
test_status: untested
---

# SOP 08-08: Carpentry Site WHS Pack & Worker Sign-on

**Module:** Carpentry job → **WHS** tab (`/carpentry/:jobId`), Settings → Modules → **WHS / SWMS Library**, Worker field app (Today's site → Site WHS pack)
**SOP ID:** 08-08
**Status:** Draft — all module content is DRAFT pending a competent WHS reviewer
**Priority:** High

---

## 1. Who uses this
- **Director / office** — maintains the control-module library (Settings) and marks each module "reviewed" after the WHS consultant signs it off.
- **Site supervisor / leading hand** — builds the job's **site WHS pack**: ticks which high-risk (HRCW) and task modules apply, selects the controls actually used, fills the site details, then has it approved.
- **Carpenters (employees)** — read and **sign the one composed pack** in the field app before starting work.

## 2. When to use it
- **Once, when setting up:** review each control module in the library and mark it "reviewed" after your WHS consultant approves it.
- **Per job (supervisor):** open the WHS tab, confirm what applies, select the controls, generate + approve the pack.
- **Every worker, per job:** sign the issued pack before starting; re-sign if the pack is revised (new version).

## 3. What this does
Turns the reviewed control-module library into **one site-specific WHS pack per carpentry job**, in three parts:
- **Part 1 — Combined HRCW SWMS:** only the high-risk construction work that actually applies (e.g. falls >2 m, load-bearing demolition, temporary support, work near energised services, powered mobile plant), each showing **only the controls the supervisor ticked**.
- **Part 2 — Task-control modules:** important non-HRCW work (nail guns, silica/fibre-cement cutting, manual handling, ladders, housekeeping), visually separated from Part 1.
- **Part 3 — Site implementation record:** resolved PPE matrix, emergency/rescue, consultation, and the sign-on placeholder.

Workers sign **that exact pack version**. The record of **which worker signed which pack version, when** is the defensible liability shield in a SafeWork SA investigation or an injury dispute. In-house only (employees) — no subcontractor management.

## 4. Before you start
- The control-module registers seeded (migrations 165 applied + `seedWhsRegisters.mjs` run) and each applicable module **marked reviewed** in Settings.
- The pack tables applied (**migrations 166 + 167**).
- The worker has their field-app link (`worker_token`) and is rostered to the job on the Planner.

## 5. Step-by-step process
**Office — maintain the library (one-time / occasional):**
1. Settings → Modules → **WHS / SWMS Library**. Each module is plain-english fields (activity, hazards, hierarchy-ordered control options, PPE rules) with a live finished-doc preview.
2. After your consultant reviews a module, mark it **reviewed**. Only reviewed modules can go into an issued pack.

**Supervisor — build the pack (WHS tab):**
3. Open the carpentry job → **WHS** tab. The HRCW and task modules are **pre-ticked** from the job type — untick what doesn't apply, tick what does.
4. For each ticked module, tick the **controls actually installed/used** on this site (never state a control you don't use — big penalties). PPE resolves automatically from the modules + the site-condition toggles (crane → hard hat, plant → hi-vis).
5. Fill **Site details** (supervisor, hospital, first aider, muster point, rescuer).
6. Click **Generate / preview pack** to see the finished 3-part document. It is **DRAFT** until approved.
7. When correct and every selected module is reviewed, click **Approve & issue**. (If a selected module isn't reviewed yet, approval is blocked with a message naming it.)

**Worker — sign on (field app):**
8. App → **Today's site** → **Site WHS pack** → **Read & sign the pack** → read all parts → tick **"I have read and understood"** → sign with a finger → **Sign & confirm**.

**Supervisor — on a change:**
9. If the work or controls change, click **New revision** — the pack version bumps and returns to DRAFT; everyone must re-sign the new version.

## 6. What happens next
- The worker's sign-on is recorded against the job with their signature and the **pack version**.
- The WHS-tab **Crew sign-on** list shows ✓ Signed v{n} for each worker; a revised pack shows **Re-sign** until they sign the new version.

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Trying to issue a pack with an unreviewed module | A selected module isn't reviewed | Mark every applicable module reviewed in Settings first (approval is blocked otherwise) |
| Stating a control you don't actually use | Left a pre-tick on | Only tick controls actually installed — untick the rest before approving |
| Worker didn't sign before starting | Skipped the pack | Leading hand checks the Crew sign-on list |
| Changed the pack but crew didn't re-sign | Edited selections without a revision | Use **New revision** for any material change (bumps the version → re-sign) |

## 8. Troubleshooting
| Problem | Cause | Fix |
|---|---|---|
| WHS tab won't load the pack | Migration 166 not applied | Apply migration 166 (`carpentry_whs_packs`) |
| "awaiting review/approval" in the field app | Pack not issued yet | Supervisor must Approve & issue it first |
| Worker sees no pack | Not rostered / no access to the job | Roster the worker to the job on the Planner |
| "Read-only preview" on sign | Admin previewing as worker | Sign-on must be on the worker's own device |
| Sign-on doesn't stick | Migration 167 not applied | Apply migration 167 (pack sign-on columns) |
| Approval blocked naming a module | That module isn't reviewed | Mark it reviewed in Settings → WHS / SWMS Library |

## 9. Related modules
- Site induction (SOP 08-04), WHS engine / management plan (Operations), Planner (rostering), Worker field app.

## 10. Screenshot placeholders
- [ ] Settings → WHS / SWMS Library (plain-english editor + preview)
- [ ] Carpentry job → WHS tab (questionnaire + control picker + Crew sign-on)
- [ ] WHS tab → composed pack preview (Parts 1–3)
- [ ] Field app → Site WHS pack (read + sign)

## 11. Automation notes
- Pre-tick: on first WHS-tab load, `getOrCreatePack` scaffolds `carpentry_whs_packs` with `selected_hrcw`/`selected_task` from `workCategoriesForProjectType(project_type)` overlapping `swms_templates.work_category`.
- Compose: `composeWhsPack` renders **only the ticked controls** (`selected_controls` indexes); `resolvePpe` unions each module's PPE rules (R>C>S>NA) and applies the crane/plant overrides.
- Approve: server re-checks that **every** selected module is `review_status='reviewed'` (409 with the offending codes otherwise); Revise bumps `version` → `draft`.
- Sign-on version is taken **server-side** from the current pack version (never the client); the `(pack_id, pack_version, employee_id)` unique index forces a fresh sign-on after a bump.
- WHS records are RLS-locked from the browser; all reads/writes go through the server (service role).

## 12. Edge cases and limits
- **DRAFT content:** every module ships `review_status='draft'`; a pack shows a **DRAFT — NOT FOR SITE USE** watermark until it is issued AND every included module is reviewed. It is **not legal advice** and must be reviewed by a competent WHS person before reliance.
- **Only an ISSUED pack can be signed.** A draft/un-issued pack is read-only in the field app (the server rejects a sign-on with HTTP 409) — so no signature is ever collected against an unapproved document.
- **A selected module with no ticked controls** is flagged in the pack as "cannot proceed until a control is selected" rather than rendered blank.
- One pack per job; the current version is what workers sign — history is the version number + the sign-on rows.

## 13. Owner of the process
Director owns the library + the review sign-off; site supervisor owns building + issuing the pack; leading hand owns crew sign-on on site.

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Migrations 162 + 165 + 166 + 167 applied; `seedWhsRegisters.mjs` run
- [ ] The applicable modules marked **reviewed** in Settings
- [ ] A carpentry job (any `project_type`) and an employee rostered to it with a worker link

### Test cases

**TC-01 — Pre-tick + build (happy path)**
1. Open a `full_package` carpentry job → WHS tab
2. Expected: HRCW + task modules pre-ticked from the job type; a scaffold `carpentry_whs_packs` row exists (`review_status='draft'`, version 1)
3. Tick controls on 2–3 modules, fill site details, **Save**
4. Expected DB: `selected_controls`, `answers` persisted
- [ ] Pass  [ ] Fail

**TC-02 — Compose shows only ticked controls**
1. Click **Generate / preview pack**
2. Expected: each module lists **only** the controls you ticked (not the full option list); DRAFT watermark present; a module with no ticked control shows "cannot proceed"
- [ ] Pass  [ ] Fail

**TC-03 — Approval gate on unreviewed module**
1. Ensure one selected module is NOT reviewed → click **Approve & issue**
2. Expected: HTTP 409 naming the unreviewed module code; pack stays draft
3. Mark it reviewed → Approve again → Expected: pack `review_status='issued'`, `approved_at` set
- [ ] Pass  [ ] Fail

**TC-04 — Worker signs the issued pack**
1. Field app (real worker token) → Today's site → **Site WHS pack** → Read & sign → tick + sign → confirm
2. Expected: success; `whs_swms_signon` row with `pack_id`, `pack_version`, `employee_id`, signature
3. Expected: WHS-tab Crew sign-on shows ✓ Signed v1 for that worker
- [ ] Pass  [ ] Fail

**TC-05 — Draft pack cannot be signed**
1. Supervisor clicks **New revision** (version 2, back to draft)
2. Worker opens the field app pack
3. Expected: "awaiting review/approval" — no sign button; a forced `POST /whs-pack/signon` returns HTTP 409; Crew sign-on shows **Re-sign (signed v1)**
- [ ] Pass  [ ] Fail

**TC-06 — Access control**
1. `GET /api/carpentry/jobs/:jobId/whs-pack` unauthenticated → HTTP 401
2. Worker requests the pack for a job they're not rostered to → HTTP 403
3. Admin "preview as worker" attempts a sign-on → HTTP 403 (read-only preview); no `whs_swms_signon` row
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Pre-tick correct per job type; selections persist
- [ ] Composed pack shows only ticked controls + DRAFT watermark
- [ ] Approval blocked on unreviewed module; issues once reviewed
- [ ] Worker sign-on records with signature + pack version
- [ ] Draft/revised pack unsignable; re-sign enforced on bump
- [ ] Access control (401/403) holds; preview cannot sign
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

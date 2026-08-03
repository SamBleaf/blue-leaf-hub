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
3. Open the carpentry job → **WHS** tab. Answer **Section 1 — What's on this job?** (which stages are on the job, and the yes/no scope questions: work over 2 m, openings/voids, load-bearing work, pre-2004 structure, silica cutting, road/footpath, deep excavation, powered mobile plant, overhead/live/buried services). As you answer, the matching HRCW and task modules **tick themselves automatically** in sections 2 and 3 (each marked **§1**). This is a starting point — **confirm every one**: untick what doesn't apply, tick anything the questions didn't reach. The blue banner shows how many modules Section 1 selects and flags any you've removed or added beyond it; **Select all from section 1** / **Reset to section 1** bulk-apply it. A "no" is recorded as a considered-not-applicable answer, and every Section 1 question must be answered before you can issue (G-6).
4. For each module, **confirm the controls actually in place** on this site. **Section 1 never ticks a control** — control selection is always your act, because a ticked control asserts that control *is in place on this site*. Each control has three states, distinct at a glance and in greyscale:
   - **Confirmed** (solid box, ✓) — you tapped it: the assertion it is in place. Only confirmed controls compose into the pack and count toward issue.
   - **Suggested** (dashed box, "confirm on site") — the Blue Leaf standard proposed it, but nobody has confirmed it. It asserts **nothing** and does **not** count. Tap it to confirm once you've checked it on site.
   - **Not used** (empty box) — considered, not selected.
   A module with only *suggested* controls (none confirmed) still **blocks issue (G-1)** — every assertion must be a human tap. Never confirm a control you don't use (big penalties). PPE resolves automatically from the modules + the site-condition toggles (crane → hard hat, plant → hi-vis).
5. **(Optional) House standard.** *Blue Leaf standard controls* bar: **Pre-fill standard (as suggestions)** drops the standard control per hazard onto the in-scope modules as dashed suggestions to confirm — never for out-of-scope modules. Once you've built a good pack, **Save confirmed as standard** stores *your confirmed picks* (never suggestions) as the house standard, so future jobs pre-fill them.
6. Fill **Site details** (supervisor, hospital, first aider, muster point, rescuer).
7. Click **Generate / preview pack** to see the finished 3-part document (only **confirmed** controls appear — suggestions never compose). It is **DRAFT** until approved.
8. When correct and every selected module is reviewed, click **Approve & issue**. (If a selected module isn't reviewed yet, or has only suggested controls, approval is blocked with a message naming it.)

**Worker — sign on (field app):**
9. App → **Today's site** → **Site WHS pack** → **Read & sign the pack** → read all parts → tick **"I have read and understood"** → sign with a finger → **Sign & confirm**.

**Supervisor — on a change:**
10. If the work or controls change, click **New revision** — the pack version bumps and returns to DRAFT; everyone must re-sign the new version.

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
- §1→§2 wiring (client): answering Section 1 recomputes `deriveModulesFromScope(jScope)` (`carpentryScope.js` — stage lists + per-module gates + always-modules + J-yes/no extras). A non-destructive React effect auto-ticks only the **newly-derived MODULES** (delta vs a `useRef` seeded on load), so manual unticks and a curated saved pack are never overwritten and nothing is auto-removed. **The questionnaire never ticks a control** — the effect touches `setHrcw`/`setTask` only. Selection is client-only until **Save**; `deriveModulesFromScope` server-parity is asserted by `scripts/tests/carpentry-scope-parity.test.mjs`, the effect behaviour by `scripts/tests/whs-scope-wiring.test.mjs`.
- Three-state controls + house template: `controls` = **confirmed** (the assertion — persists to `selected_controls`, composes, and is the ONLY thing that satisfies G-1 on client and server); `suggested` = template proposals (persist in `answers.suggestedControls`, never compose, never satisfy G-1). Confirming a control (`toggleCtrl`) resolves its suggestion. The house standard lives in `whs_control_templates` (mig 169, one carpentry row, `{code:[text]}` of confirmed picks); `GET/PUT /api/carpentry/whs-control-template` load/save it, and the pack GET returns `standardControls`. A fresh pack pre-fills the standard as suggestions for scoped-in modules; a saved pack re-applies only on the explicit **Pre-fill standard** button (so a dismissed suggestion never silently returns). Safety invariants proven by `scripts/tests/whs-control-states.test.mjs`.
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

**TC-07 — Section 1 drives module selection (§1→§2 wiring)**
1. On a fresh pack, in **Section 1** select the **First fix** stage.
2. Expected: task modules for first fix auto-tick in section 3 (each showing a **§1** badge); the fall HRCW **H-01/H-02** stay unticked.
3. Answer **"Any work more than 2 m…" = Yes**.
4. Expected: **H-01** and **H-02** now auto-tick in section 2 (this is the previously-broken case — answering Section 1 must visibly change section 2).
5. Untick H-01 by hand, then answer an unrelated question (e.g. road/footpath = No).
6. Expected: H-01 stays unticked — an unrelated Section 1 change does **not** re-add a module you removed.
7. Reload the pack (or reopen the tab).
8. Expected: opening a saved pack makes no changes — your curated selection (H-01 still unticked) is preserved.
9. Click **Reset to section 1**, then verify a selected module with no ticked control still blocks **Approve & issue** (G-1).
- [ ] Pass  [ ] Fail

**TC-08 — Three-state controls + house template (the model correction)**
1. On an in-scope module, note a **dashed "suggested · confirm on site"** control (if a house standard is saved) — it must **not** look ticked.
2. With that module having only *suggested* controls (none confirmed), click **Approve & issue**.
3. Expected: blocked (G-1) naming the module — a suggestion does not count as a control in place.
4. **Tap** the suggested control → it becomes **confirmed** (solid ✓) and the dashed suggestion is gone.
5. **Generate / preview pack** → the confirmed control appears; any still-*suggested* control on other modules does **not** appear in the document.
6. Save the pack, reopen it → confirmed stays confirmed, suggestions persist as suggestions (not re-proposed on top of, and not silently confirmed).
7. Confirm your standard controls across modules, click **Save confirmed as standard** → confirm the dialog. On a *new* job, the same controls appear as **suggestions** (dashed) on the in-scope modules, and **nothing** on out-of-scope modules.
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

---
sop_version: 1.0
last_reviewed: 2026-06-29
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP 08-07: Set Up the WHS Profile (WHS Setup / Risk Engine)

**Module:** Operations Manager — WHS
**SOP ID:** 08-07
**Status:** Draft
**Priority:** High

> Decision reference: **SAM-SOP-002** (2026-06-29) — this admin setup workflow now has a proper SOP.

---

## 1. Who uses this
Admin and Site Supervisors who set up a project's Work Health & Safety profile before work starts.

## 2. When to use it
Once per project, early in the project lifecycle (ideally at operations handover, before any
high-risk work begins) — and again whenever the scope changes (e.g. excavation, work at height,
or hot works are added) so the safety documents stay accurate.

## 3. What this does
You answer a short, plain-English questionnaire about the job. The **risk engine** reads your
answers (and canonical construction facts already on the project record) and works out the
high-risk activities, the SWMS you need, the permits, the required inspections and registers, and
the site hazards — then generates a **WHS Management Plan** document from them. Answer once; the
system assembles the safety paperwork.

## 4. Before you start
- You are logged in as **Admin** (or a Supervisor with WHS access).
- The **project exists** in Operations (you have its project page open).
- Helpful: the project's core construction facts (storeys, site conditions, etc.) are already on
  the job record — the engine pre-fills from them where it can.

## 5. Step-by-step process

1. Open the project in **Operations Manager**.
2. Open **WHS Manager** for the project, then click **WHS Setup** (or go directly to
   `/operations/<projectId>/whs-setup`).
3. Work through the **question modules** (collapsible panels). Module 0 shows **canonical
   construction facts** read from the project record — confirm a pre-filled suggestion or
   override it (the change is stamped to the job's fact history).
4. Answer each question — answer types include yes/no, dropdown select, number, list (one item per
   line), and free text. Pre-filled fields show an info note; saved answers always win over a
   pre-fill.
5. If the job uses a **site induction QR**, paste/confirm the induction URL in the
   **site induction URL** field and use **Copy** to share it.
6. Click **Save WHS profile**. The risk engine recalculates and shows the **Generated risk
   profile**: High-risk work · Applicable SWMS · Permits · Inspections · Registers · Site hazards.
7. Review the generated risk profile. If anything looks wrong, adjust your answers and Save again.
8. Click **Generate WHS Plan**. The system builds the **WHS Management Plan** document from the
   current profile and lists it under **Generated documents** (click a document to preview it).

> 💡 **Tip:** If you see a warning that required field(s) are still blank after generating, open the
> relevant module, fill the missing answers, Save, and Generate again.

[insert screenshot: WHS Setup questionnaire with modules expanded]
[insert screenshot: Generated risk profile + Generated documents list]

## 6. What happens next
- Your answers are stored as the project's **WHS profile** (a new **version** each time you save),
  and the derived risk outputs are recalculated.
- The generated **WHS Management Plan** is saved against the project and can be previewed/printed.
- If you later change answers, previously generated documents are flagged **Stale** so you know to
  regenerate them.
- The induction URL feeds the site induction QR flow (see SOP 08-03 / 08-04).

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Generating the plan before saving | Clicking Generate first | Always **Save WHS profile** before **Generate WHS Plan** — Generate uses the saved profile |
| Ignoring the "required field blank" warning | Rushing | Fill the listed required answers, Save, then regenerate |
| Overriding a correct pre-filled construction fact | Assuming the pre-fill is wrong | Pre-fills come from the project record — only override if you know the real value differs |
| Forgetting to regenerate after a scope change | Plan looks "done" | When a document shows **Stale**, regenerate it |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Save failed" message | Network/permission issue | Check connection; confirm you have WHS/admin access; retry |
| Generate is disabled | No saved profile yet | Save the WHS profile first — Generate enables once a profile exists |
| Risk outputs are empty after saving | Questionnaire largely unanswered | Answer the applicable modules and Save — outputs derive from your answers |
| Some modules don't appear | They only show when relevant | A module appears only when a triggering answer (e.g. "work at height = yes") is set |

## 9. Related modules
- [Check compliance status for a project](whs_check_compliance_status.md) — SOP 08-02
- [Set up a site induction QR code](whs_site_induction_setup.md) — SOP 08-03
- [Complete a site induction](whs_complete_induction.md) — SOP 08-04

## 10. Screenshot placeholders
[insert screenshot: WHS Setup landing — modules collapsed]
[insert screenshot: a module expanded with questions answered]
[insert screenshot: WHS Management Plan preview modal]

## 11. Automation notes
- Load: `GET /api/whs/projects/:projectId/profile` — returns the questionnaire, any saved profile +
  answers, the prefill map, and Module-0 canonical construction facts (with provenance).
- Save: `PUT /api/whs/projects/:projectId/profile` body `{ answers }` — upserts the WHS profile
  (new **version**), recalculates derived outputs (high-risk activities, applicable SWMS, permits,
  required inspections/registers, site hazards). Writes to `whs_site_profiles`.
- Generate: `POST /api/whs/projects/:projectId/generate/project_whs_management_plan` — creates a
  document row in `whs_documents`; returns `missingRequired` (blank required fields) if any.
- Documents: `GET /api/whs/projects/:projectId/documents` — lists generated documents with status +
  `isStale`.
- Construction-fact confirm/override goes through the facts service (stamped to job fact history).

## 12. Edge cases and limits
- **Blank required fields:** Generate still produces a document but returns a warning listing the
  missing required fields — the plan is incomplete until they're filled.
- **Saving twice:** re-saving does not create a duplicate profile — it bumps the profile **version**
  and recalculates outputs; previously generated documents become **Stale**.
- **No answers:** saving an empty questionnaire yields empty risk outputs (nothing to derive).
- **Deleted project:** the WHS profile is project-scoped; if the project is removed, its WHS setup
  is no longer reachable.

## 13. Owner of the process
Admin / Director (WHS)
Next review date: 2026-12-29

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run in order; record pass/fail. Do not set
> `test_status: passed` if any test fails.

### Pre-test setup
- [ ] Log in as **Admin**
- [ ] A project exists in Operations; note its `projectId`
- [ ] Open `/operations/<projectId>/whs-setup`

### Test cases

**TC-01 — Happy path (answer → save → outputs)**
1. Open WHS Setup; expand the modules and answer the applicable questions (set at least one
   high-risk trigger, e.g. "work at height = yes").
2. Click **Save WHS profile**.
3. Expected result: success message ("WHS profile saved. Risk outputs recalculated.") and the
   **Generated risk profile** populates (SWMS / permits / inspections etc.).
4. Expected DB: a row in `whs_site_profiles` for `projectId` with the saved `answers` and a
   `version`.
- [ ] Pass  [ ] Fail

**TC-02 — Required field blank (generate warning)**
1. Leave a required field blank; Save; click **Generate WHS Plan**.
2. Expected result: a warning listing the missing required field(s) (e.g. "Generated, but N
   required field(s) still blank: …").
- [ ] Pass  [ ] Fail

**TC-03 — Re-save updates the same profile (version bump, no duplicate)**
1. Complete TC-01, then change one answer and Save again.
2. Expected result: same project profile updated; `version` increases.
3. Expected: any previously generated document now shows a **Stale** badge.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Log out; log in as a non-admin (e.g. Employee / worker) without WHS access.
2. Navigate to `/operations/<projectId>/whs-setup`.
3. Expected result: access is blocked / the WHS Setup is not reachable (no 200 render of the
   admin setup screen).
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (generate creates a document)**
1. Complete TC-01, then click **Generate WHS Plan**.
2. Expected result: a document appears under **Generated documents**; clicking it previews the
   rendered WHS Management Plan.
3. Expected DB: a row in `whs_documents` for `projectId` with the plan content/status.
- [ ] Pass  [ ] Fail

**TC-06 — Feature-specific: prefill + stale flag**
1. On a project that has canonical construction facts, open WHS Setup.
2. Expected: relevant fields are **pre-filled** (info banner shown); a saved answer overrides a
   pre-fill.
3. After generating a plan, change an answer and Save — expected: the generated document is
   flagged **Stale** (prompting regeneration).
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Save persists to `whs_site_profiles` with version + answers
- [ ] Risk outputs derive from answers
- [ ] Generate creates a `whs_documents` row; missing-required warning works
- [ ] Stale flag appears after a post-generate change
- [ ] Non-admin cannot reach WHS Setup
- [ ] No console / network errors
- [ ] Update `test_status` in frontmatter; add a SOP_CHANGELOG.md entry

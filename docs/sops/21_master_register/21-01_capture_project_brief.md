---
sop_version: 1.0
last_reviewed: 2026-11-07
app_version: master-register-r02 (R03, not deployed)
screenshot_status: placeholders_only
owner: Director / Sales lead
test_status: untested
---

# SOP: Capture the project brief — Project, Whole house, Site & existing, Rooms

**Module:** Sales → Lead → Project brief & register
**SOP ID:** 21-01
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Director, sales lead, estimator, project manager — anyone meeting the client or walking the site.

## 2. When to use it
At a Discovery meeting, a concept meeting, a site walk, or any time the client tells you what they want. Detailed room work normally starts once the PTSA is signed, but you can work ahead at any stage — nothing waits for a payment.

## 3. What this does
It records what the client wants, room by room, in one place. Each answer becomes one row in the project register: a **scope** item (what work happens), a **requirement** (what the client needs it to do), a **selection** (a product or finish) or an **action** (something someone must check). Facts Sales already holds — client, site, budget, project type, consultants, meetings — are shown, never typed again. The same rows later produce the client brief, the architect brief and the selections schedule.

## 4. Before you start
- The lead exists and has a project type (Sales → lead → Key details).
- You are signed in as staff (Admin). Portal clients never see this screen.
- Know the current drawing set and revision, if there is one (for example "Concept set B — 03 Nov").
- The register is switched on for this lead (pilot). If it is off, the stage shows the old **Finishes schedule** / **Provisional fittings & fixtures schedule** lists instead — ask the director to add the lead to the pilot.

## 5. Step-by-step process

1. Go to **Sales → Pipeline** and open the lead.
2. In the current stage panel, find the card **Project brief & register**. Click the header to expand it if it is collapsed.
3. **Project** step:
   1. Check **On file in Sales — not re-entered here**. If something is wrong, fix it in the lead's own details or Sales stage, not here.
   2. Under **Project setup**, enter the **Current drawing set / revision (P-002)**, choose the **Delivery model (P-007)** (Design & build, Build only, Construction management or Other) and **Occupancy during works (P-008)**.
   3. Turn on **Existing-building prompts** for any renovation or extension.
   4. Under **Rooms & levels — follow the plans**, tap **+ Kitchen**, **+ Bathroom** and so on (or **+ Other**) for each room on the plan, level by level. Rename a room by typing over its name.
   5. Record the client's priorities (P-005) and the areas of work (P-006).
4. **Whole house** step — set each standard once for the whole home:
   1. Type the answer in the box (for example "Render, timber feature").
   2. Choose the decision in the dropdown beside it — for a **selection**: **Not discussed**, **Preference**, **Proposed** or **Client-approved**; for a **requirement**: **Not discussed**, **Client wants** or **Client-approved**.
   3. Use the quick buttons when the answer is short: **N/A**, **Excluded**, **By others**, **Undecided** (requirements show only N/A and Undecided).
   4. Tap a **+ suggestion** chip to add a common answer to the text, or type your own.
   5. Tap **More** for product, manufacturer, model, finish, supplier, quantity, supplied by, technical check and pricing link.
5. **Site & existing** step — answer access, services, existing-building condition and unknowns for the whole project (not per room).
6. **Rooms** step:
   1. Pick a room from the room list at the top (or step with ← and →; it shows "Room 4 of 8"). Check its name, level and type, and set its scope: **New**, **Renovated**, **Existing — Remain** or **Not in scope**. Add the drawing sheet if you are working from one.
   2. Answer the prompts that appear for that room type. Floors and walls show the **Whole-house default** — leave it, or tap **Record a room exception** where this room differs.
   3. Tap **Save & next room →** to move on. The last room shows **Save — last room**.
7. Tick **Show detailed prompts** only when you want the detailed (later-stage) questions now.

> 💡 **Tip:** The card saves by itself about a second after you stop typing. Watch the word beside **Save**: *Unsaved… → Saving… → Saved*. You can close the lead and come back — it reopens where you stopped.

[insert screenshot: Project step with On file in Sales and Project setup]
[insert screenshot: Whole house prompt with decision chips and quick buttons]
[insert screenshot: Rooms step — kitchen with a room exception]

## 6. What happens next
- Before a project record exists the brief is saved on the lead ("Lead brief" badge). When the job/project is created, the brief moves onto the project record once, automatically ("Project record" badge). Nothing is sent to the client.
- Every selection stays **internal** (not visible in the client portal) until staff issue it — see 21-02.
- Items that still need a decision, a check or an owner are counted as **outstanding** in the card header.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Re-typing the address, budget or consultants into a prompt | Habit from paper briefs | Those come from Sales automatically — fix them at source |
| Ticking **Client-approved** for "they liked it" | Approval means the client has signed off | Use **Preference** or **Proposed**; Client-approved asks for who / when / how |
| Recording the same floor in every room | Not using the whole-house default | Set W-017 once; only record room exceptions |
| Putting a supplier price in the notes | Old habit | Prices never go in the register — link the estimate line in **Pricing (link — never a price)** |
| Typing "0" for an unmeasured quantity | Field looks required | Leave it blank — blank means *not measured* |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Save failed" beside Save | Lost connection or the server refused the change | Check the message under the header, then tap **Save**. Your typing is kept on screen. |
| A banner says someone else changed an item | Two people edited the same item | The card merges both changes; where both changed the same field it keeps the server's copy and tells you which item to re-check |
| Kitchen prompts appear for a bathroom | Wrong room type picked | Remove the room (✕ **Remove room**) and add it again with the right type |
| No existing-building questions on a renovation | **Existing-building prompts** is off, or the room is set to **New** | Turn the toggle on (Project step) or set the room to **Renovated** |
| "This brief was moved onto the project record" banner | The job/project was created | Normal — keep working; the same rows carry on |
| No **Project brief & register** card; the old Finishes schedule shows instead | The register is switched off for this lead | Ask the director to add the lead to `REGISTER_PILOT_LEADS` (or turn on `REGISTER_ENABLED`) — rows typed in the old list are adopted when it is switched on |

## 9. Related modules
- [21-02 Review the register, approvals and the client portal](21-02_register_review_approvals_portal.md)
- [21-03 Issue briefs and the selections schedule](21-03_issue_briefs_and_schedule.md)
- [02-19 Concept stage](../02_sales/02-19_concept_stage.md) · [02-20 PTSA / Plans stage](../02_sales/02-20_ptsa_plans_stage.md)

## 10. Screenshot placeholders
[insert screenshot: card collapsed in the stage panel]
[insert screenshot: Project setup filled]
[insert screenshot: Rooms step with Save & next room]

## 11. Automation notes
- Before a project exists: saved to `leads.selections_schedule` (lead scratchpad). Each item is merged per item so two people can work at once.
- When a job is created: one automatic promotion moves the brief into `client_selections` (choices, staged `client_visible = false`), `room_scope_items` (scope, requirement, action) and `projects.register_meta`. A `job_events` row records it. The lead scratchpad then refuses further writes.
- Delivery model before the job: `leads.delivery_model`; after the job: the facts service (`delivery_model` fact), stamped forward at conversion.
- No email, notification or portal invitation is sent by anything in this SOP.

## 12. Edge cases and limits
- Two people on the same lead: changes to different items merge; the same field edited by both shows a conflict notice.
- The card can appear in the desktop and mobile layouts at once; only the visible one loads and saves.
- Question wording comes from the approved Tab 21 library (`tab21-v1.0`); old R02 prompt keys are mapped to the new IDs automatically.
- If the database is missing migration 213, the card still saves to the lead, and document issuing is switched off with a notice.
- Feature switch (server): `REGISTER_ENABLED=true` (every lead) or `REGISTER_PILOT_LEADS=<lead id>,…` (pilot leads only). Default off: the card is hidden, every `/api/register` route returns 404 `REGISTER_DISABLED`, no automatic promotion runs, and the stage shows the pre-register lists exactly as before.

## 13. Owner of the process
Director / Sales lead
Next review date: 2027-05-07

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run against the local register sandbox (`scripts/dev/register-sandbox`), never production. Record pass/fail against each item.

### Pre-test setup
- [ ] Sandbox running (`postgrest`, `gateway`, `api`, `vite`) with `REGISTER_ENABLED=true` in the sandbox env; signed in as the sandbox staff user
- [ ] A renovation lead with project type "Extension" at stage Concept and no job yet
- [ ] Browser devtools open on Console and Network

### Test cases

**TC-01 — Happy path (standard use)**
1. Open the lead → **Project brief & register** → **Project**. Enter drawing revision, choose Design & build, add Kitchen and Bathroom.
2. **Whole house** → W-017 tap "+ Timber", choose **Preference** in the dropdown.
3. **Rooms** → pick Kitchen in the room list → set its scope to **New** → K-005 benchtop: type "Stone 40 mm", choose **Proposed**.
4. Expected result: header shows "Saved"; the kitchen item shows "Proposed".
5. Expected DB record: `leads.selections_schedule.items` has items with `promptKey` W-017 and K-005; `meta.rooms` has 2 rooms.
- [ ] Pass  [ ] Fail

**TC-02 — Approval abandoned (required evidence not given)**
1. On a selection at **Proposed**, tap **Client-approved**.
2. In **Record the client approval**, tap **Cancel**.
3. Expected result: the item stays **Proposed**; no approval line is shown.
4. Expected DB: the item's `certainty` is still `proposed` and `evidence` is null.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission**
1. Tap **Save** twice quickly after an edit.
2. Expected result: one saved copy; no duplicate items (item count unchanged).
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. With a portal client JWT call `GET /api/register/leads/:id` and query `/rest/v1/room_scope_items`.
2. Expected result: 401/403 from the API; zero rows from PostgREST (RLS `deny_clients`).
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification**
1. Create the job for the lead (convert to job).
2. Reopen the lead.
3. Check: banner "This brief was moved onto the project record"; badge "Project record".
4. Check: `client_selections` rows exist with `client_visible = false`; `room_scope_items` rows exist; a `job_events` row `register.promoted` exists; `PATCH /api/sales/leads/:id` with `selections_schedule` now returns 409 `REGISTER_PROMOTED`.
- [ ] Pass  [ ] Fail

**TC-06 — Client-approved records evidence**
1. Tap **Client-approved** on a selection, choose how it was approved (e.g. meeting), add a reference, **Confirm**.
2. Expected: the item shows "Client approval: <your name> · <today> · meeting — <reference>"; the evidence is saved with the item.
- [ ] Pass  [ ] Fail

**TC-07 — Switched off (pilot not including this lead)**
1. Restart the sandbox API with `REGISTER_ENABLED=false` and no `REGISTER_PILOT_LEADS`; open a Concept-stage lead.
2. Expected: no register card; the **Finishes schedule** list shows; `GET /api/register/leads/:id` returns 404 `REGISTER_DISABLED`.
3. Add a row, type, delete it at once. Expected: the lead's register-format rows are untouched and no stray row remains.
- [ ] Pass  [ ] Fail

**TC-08 — Room relevance (Scenario C)**
1. On a bathroom + laundry renovation, open each room.
2. Expected: no kitchen, living, bedroom, outdoor or new-build prompts; renovation make-good prompts present.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

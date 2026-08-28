---
sop_version: 1.0
last_reviewed: 2026-08-29
app_version: main
screenshot_status: placeholders_only
owner: Admin / Supervisor
test_status: untested
---

# SOP: Run the Consultants stage (coordination, approval risk, provisional F&F)

**Module:** Sales
**SOP ID:** 02-21
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin and Supervisor staff running a lead through the **Consultants** stage of the sales pipeline — the stage that sits between **PTSA / Plans** and **Tender**.

This is the stage where you coordinate the outside specialists (structural engineer, private certifier, lighting, sanitary, energy, land surveyor, interior designer), track the **council / certifier approval risk**, issue the **provisional fittings & fixtures schedule** to suppliers, and tick the three boxes that say the job is ready to go to tender.

You do **not** need to be a director or admin to work this stage — any signed-in Sales user can open the lead and drive the panel.

---

## 2. When to use it

Use this SOP when a lead has reached the **Consultants** stage (its stage badge reads "Consultants"). A lead lands here after the PTSA / Plans has been signed and the job has been created.

Work this stage when you need to:

- Line up the engineer, certifier and other consultants and track the brief out and the response back.
- Record how risky council / certifier approval looks, so the team and the client both know what they're dealing with.
- Issue the provisional F&F (fittings & fixtures) schedule to suppliers before the tender goes out.
- Confirm the job is ready to advance to **Tender**.

Do **not** wait for full certification **approval** before moving on — approval is tracked as a risk here, it is never a hard gate. What gates the move to Tender is: engineering is far enough along, the certification **pathway** is confirmed, and the provisional F&F has been issued.

---

## 3. What this does

The Consultants stage is a single control panel inside the lead's "Do this now" focus. It has four blocks, top to bottom:

1. **Council / certifier approval risk** — an advisory chip (Unknown, Low, Medium, High). You set it with one of four buttons. It never blocks anything; a High rating shows a red reminder and puts a coloured chip on the pipeline board card so the whole team can see it.
2. **Consultants** — a roster of the specialists on the job. Each row is a discipline (role) + a CRM contact, with two toggle stamps ("Brief issued" and "Returned") and a free-text notes box.
3. **Provisional fittings & fixtures schedule** — the same finishes list carried forward from Concept. You issue it to suppliers, then tick "issued".
4. **Ready for tender** — two checkboxes ("Engineering complete enough for tender" and "Certification pathway confirmed") plus the provisional-F&F tick above them.

Everything you touch saves the instant you change it — there is no separate "Save" button. Each change is written straight to the lead record.

**The exit gate to Tender** — the "Move to Tender →" button turns on only when **all** of these are true:

- Engineering complete enough for tender is ticked
- Certification pathway confirmed is ticked
- Provisional F&F schedule issued is ticked
- A site address is set on the lead
- A job has been created from the lead

---

## 4. Before you start

- The lead must already be at the **Consultants** stage. If it isn't, work the earlier stages first (see SOP 02-02).
- The consultants you want to add must already exist as **contacts in the CRM**. The roster's contact dropdown lists CRM contacts typed as architect, designer, interior designer, engineer, supplier or other. If someone is missing, add them in the CRM first (see SOP 02-14).
- A **site address** should be on the lead. You'll need it to create the job and to advance to Tender.
- You must be **signed in**. No special admin role is needed for this stage, but you cannot open it while logged out.

---

## 5. Step-by-step process

1. Open the lead. It will show the **Consultants** stage badge and the Consultants control panel in the "Do this now" focus.

2. **Set the approval risk.** In the "Council / certifier approval risk" block, click one of the four buttons: **Unknown**, **Low**, **Medium** or **High**. The chip at the top-right of the block updates to match. If you choose **High**, a red reminder appears telling you to flag it in the proposal and manage the client's timing expectations.

   [insert screenshot: approval risk block with the four buttons and the High red note]

3. **Add each consultant.** In the "Consultants" block, click **+ Add consultant**. A new row appears defaulted to "Structural engineer".
   - Pick the **discipline** in the left dropdown (Structural engineer, Private certifier, Interior designer, Lighting, Sanitary / tapware, Energy / NatHERS, Land surveyor, Other consultant).
   - Pick the **contact** in the right dropdown ("— select contact —" then the CRM contacts).
   - Repeat **+ Add consultant** for every specialist on the job.

   [insert screenshot: a consultant roster row showing the role dropdown, contact dropdown, and the Brief issued / Returned toggles]

4. **Track the brief and the response.** On each consultant row, click **○ Brief issued** when you send that consultant their brief — it turns into a green **✓ Brief issued** and stamps the time. Click **○ Returned** when their response comes back — it turns into green **✓ Returned**. Clicking a green stamp again clears it. Use the **Notes** box for anything specific.

5. **Issue the provisional F&F schedule.** In the "Provisional fittings & fixtures schedule" block you'll see the finishes carried over from Concept. Click **+ Add row** to add anything new. Fill the **Area**, **Item** and **Supplier** boxes. Send the schedule to your suppliers, then tick **Provisional F&F schedule issued to suppliers**.

   [insert screenshot: provisional F&F schedule rows plus the "issued to suppliers" checkbox]

6. **Confirm ready for tender.** In the "Ready for tender" block, tick:
   - **Engineering complete enough for tender** — once the engineer's work is far enough along.
   - **Certification pathway confirmed** — once you know the approval route (private certifier vs council). Remember: this is the **pathway**, not final approval.

7. **Create the job if you haven't.** If no job exists yet, a **Create Job from Lead →** button shows in the advance panel. It needs a site address first (a note appears if the address is missing). Click it to create the job. Once linked, you'll see "Job linked — ready to advance".

8. **Advance to Tender.** When all five conditions are met, the **Move to Tender →** button becomes active. Click it. The lead moves to the **Tender** stage and is handed to the Tender Manager.

   [insert screenshot: the "Ready for tender" checkboxes and the active "Move to Tender →" button]

---

## 6. What happens next

- The lead's stage changes to **Tender**. It leaves the Consultants column on the pipeline board and appears under Tender.
- The Tender Manager picks it up from there — RFQ pack, subcontractor pricing, and the Fixed-Price Proposal (see the Tender / RFQ SOPs).
- The provisional F&F schedule you issued carries forward — it is the same finishes list used from Concept onward, so nothing is re-typed.
- The consultant roster, the approval-risk rating and the three ready flags all stay on the lead as a record of what happened in this stage.

If you set approval risk to Medium or High, that chip stays visible on the board card while the lead is in Consultants, so anyone scanning the board sees it.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Waiting for full certification **approval** before advancing | Staff assume approval must be granted before tender | Approval is advisory only — confirm the **pathway** (tick "Certification pathway confirmed") and track the risk with the chip. Approval is never required to tender. |
| Consultant contact missing from the dropdown | The person isn't in the CRM, or is typed as a client not a consultant | Add them in the CRM as architect / designer / interior designer / engineer / supplier / other first (SOP 02-14), then re-open the roster. |
| "Move to Tender →" button stays greyed out | One of the five conditions isn't met | Check all three ready-flags are ticked, the site address is set, and a job exists. The requirement list under the button shows exactly what's still missing. |
| Forgetting to tick "Provisional F&F issued" | It's a separate tick below the schedule rows, easy to miss | Filling the schedule rows is not enough — you must tick the "issued to suppliers" box for the gate to pass. |
| Ticking the ready flags before the work is actually done | Rushing to advance the lead | The flags are your own confirmation to the Tender Manager — only tick them when engineering is genuinely far enough along and the pathway is real. |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| Consultant dropdown is empty, with "No consultant contacts yet — add engineers/suppliers in the CRM." | No CRM contacts of a consultant/supplier type exist | Add the engineer, certifier and suppliers in the CRM (SOP 02-14), then re-open the stage. |
| "Move to Tender →" is disabled and I've ticked everything | Site address missing or no job created | Add the site address, then use **Create Job from Lead →**. The button enables once a job is linked. |
| The approval-risk chip won't change | The click didn't register, or the page didn't refresh | Click the button again; the chip and the board card update on save. If the value looks stale after a migration, it's a schema-cache issue — see the note below. |
| Brief issued / Returned won't turn green | You clicked a green stamp, which clears it (toggle) | Click it once more to re-stamp; each click flips it on/off. |
| A newly added column reads as missing ("could not find column … in the schema cache") | Migration 193 was applied but PostgREST cached the old schema | Run `NOTIFY pgrst, 'reload schema';` in the Supabase SQL editor. The stage is deploy-ahead safe — before migration 193 the flags simply pass and nothing blocks. |

---

## 9. Related modules

- **[02-02 Move a lead through the stages](02-02_move_lead_through_stages.md)** — the overall stage machine and the advance button.
- **[02-14 Select the designer and fees](02-14_select_designer_and_fees.md)** — adding consultant / designer contacts to the CRM so they appear in the roster.
- **[02-16 Generate and accept the concept agreement](02-16_concept_agreement.md)** — where the F&F / selections schedule first begins (carried forward here as the provisional F&F).
- **[02-13 Test lead — walk the pipeline](02-13_test_lead_walk_the_pipeline.md)** — the test-lead harness used for the Section 14 pre-test setup (bypasses hard gates).

---

## 10. Screenshot placeholders

- [insert screenshot: Consultants stage full panel — approval risk, roster, provisional F&F, ready-for-tender blocks]
- [insert screenshot: approval risk block with Unknown / Low / Medium / High buttons and the High red note]
- [insert screenshot: consultant roster row — role dropdown, contact dropdown, Brief issued / Returned stamps, notes]
- [insert screenshot: provisional F&F schedule rows plus the "issued to suppliers" checkbox]
- [insert screenshot: "Ready for tender" checkboxes with the active "Move to Tender →" button]
- [insert screenshot: pipeline board card showing the "High approval risk" chip on a Consultants-stage lead]

---

## 11. Automation notes

Every action in this stage writes to the **`leads`** table via `PATCH /api/sales/leads/:id`. There is no separate save step — each control patches its own column the moment you change it.

| Action | What is written | Table + column | Value |
|---|---|---|---|
| Click an approval-risk button | Sets the risk rating | `leads.approval_risk` | `unknown` \| `low` \| `medium` \| `high` |
| Add / edit / remove a consultant, toggle Brief issued / Returned, edit notes | Re-writes the whole roster array | `leads.consultant_roster` (jsonb) | array of `{ role, contactId, briefIssuedAt, returnedAt, notes }` — stamps are ISO timestamps or null |
| Add / edit / remove an F&F row | Re-writes the schedule array | `leads.selections_schedule` (jsonb) | array of `{ area, item, supplier, notes }` |
| Tick "Provisional F&F schedule issued to suppliers" | Sets the issued flag | `leads.provisional_ff_issued` (boolean) | `true` / `false` |
| Tick "Engineering complete enough for tender" | Sets the engineering flag | `leads.consultants_engineering_ready` (boolean) | `true` / `false` |
| Tick "Certification pathway confirmed" | Sets the cert flag | `leads.consultants_cert_pathway_confirmed` (boolean) | `true` / `false` |
| Click "Create Job from Lead →" | Creates the job and links it | `leads.job_id` set (via `POST /api/sales/leads/:id/convert-to-job`) | job id |
| Click "Move to Tender →" | Advances the stage | `leads.stage` | `tender` (plus `stage_entered_at`, `last_activity_at` stamped) |

**Consultant contacts** are loaded read-only from `GET /api/sales/consultants`, which returns CRM contacts (`crm_contacts`) typed `architect`, `designer`, `interior_designer`, `engineer`, `supplier` or `other`.

**Approval risk is advisory** — it never blocks a stage change. **No emails are sent and no files are created** by this stage itself. The tender exit gate is enforced in the UI (the button stays disabled until it passes). Server-side (`STAGE_GATES.tender` in `salesRoutes.mjs`) the same gate is **advisory during hardening**: a bypass is logged (`[gate-bypass]`), recorded as a timeline event, and returned to the caller as `gateWarnings` — it does not hard-block. Approval-risk changes do **not** move the board chip except while the lead is in Consultants at Medium or High.

**Migration:** all five new columns come from migration **193** (`approval_risk` default `'unknown'`, `consultant_roster` default `'[]'`, `consultants_engineering_ready`, `consultants_cert_pathway_confirmed`, `provisional_ff_issued`). The stage is deploy-ahead safe: before 193 is applied, the three new-column gate checks (engineering-ready, cert-pathway, provisional-F&F) pass because their columns are absent (`!("col" in lead)`), so the new flags never block early. The `site_address` and `job_id` checks are separate always-on requirements — they still apply pre-migration.

---

## 12. Edge cases and limits

- **Certification approval is never a hard gate.** Only the pathway confirmation, engineering-ready flag and provisional-F&F tick gate the move to Tender. Full council/certifier approval can still be outstanding when the lead advances.
- **The roster has no duplicate check.** Adding the same consultant twice creates two rows — both persist. Remove the extra with the **×** button.
- **The F&F schedule is shared with Concept.** It is the same `selections_schedule` list. Editing it here edits the one shared thread — do not expect a separate "consultants copy".
- **Test leads bypass the gate.** A lead flagged as a test lead (migration 178 `is_test`) can jump straight to Tender regardless of the flags; and a **backward** move is corrective and never gated. Hard gates apply only to a forward advance of a real lead.
- **Board chip only shows in this stage.** The Medium / High approval-risk chip on the board card only appears while the lead is in Consultants. It disappears once the lead moves to Tender.
- **No amounts here.** The provisional F&F schedule captures area / item / supplier / notes only — it holds no pricing. Costs are priced in the Tender stage; all amounts elsewhere are stored ex-GST (Xero adds GST).

---

## 13. Owner of the process

**Owner:** Admin / Supervisor (Sales).

Responsible for keeping the consultant roster current, setting an honest approval-risk rating, issuing the provisional F&F on time, and only ticking the ready flags when the work genuinely supports advancing to Tender.

**Next review due:** 2027-03-01 (6 months from last review).

---

## 14. Troubleshoot Agent Test Script

**Pre-test setup**

1. Confirm migration **193** is applied (columns `approval_risk`, `consultant_roster`, `consultants_engineering_ready`, `consultants_cert_pathway_confirmed`, `provisional_ff_issued` exist on `leads`). If a column reads as missing, run `NOTIFY pgrst, 'reload schema';`.
2. Create or reset a **test lead** (see SOP 02-13) so hard gates can be bypassed during teardown, and move it to the **Consultants** stage.
3. Ensure at least one CRM contact exists typed `engineer` or `supplier` (so the roster dropdown is populated). If `GET /api/sales/consultants` returns an empty list, add one in the CRM.
4. Set a **site address** on the test lead.
5. Sign in as a normal Sales user for TC-01 through TC-03 and TC-05 onward; have a signed-out session available for TC-04.

---

**TC-01 — Happy path: work the stage and advance to Tender**

Steps:
1. Open the test lead at the Consultants stage.
2. In "Council / certifier approval risk" click **Low**.
3. Click **+ Add consultant**; set the role to **Structural engineer** and pick a CRM contact.
4. Click **○ Brief issued** on that row (it turns green ✓).
5. In the F&F block click **+ Add row**; enter Area "Kitchen", Item "Tapware", Supplier "Reece".
6. Tick **Provisional F&F schedule issued to suppliers**.
7. Tick **Engineering complete enough for tender**.
8. Tick **Certification pathway confirmed**.
9. If no job exists, click **Create Job from Lead →**.
10. Click **Move to Tender →**.

Expected UI result: each control saves immediately; the risk chip reads "Low"; the ready-for-tender requirement list clears; the "Move to Tender →" button enables and, when clicked, the lead moves to the **Tender** stage.

Expected DB record: in `leads` for this lead — `approval_risk` = `low`; `consultant_roster` (jsonb) contains an element with `role` = `engineer`, a non-null `contactId`, and a non-null ISO `briefIssuedAt`; `selections_schedule` (jsonb) contains a row `{ area: "Kitchen", item: "Tapware", supplier: "Reece" }`; `provisional_ff_issued` = `true`; `consultants_engineering_ready` = `true`; `consultants_cert_pathway_confirmed` = `true`; `job_id` is set; `stage` = `tender`.

- [ ] Pass  [ ] Fail

---

**TC-02 — Empty required field: gate blocks advance**

Steps:
1. Open a fresh Consultants-stage test lead with a site address and a linked job.
2. Tick **Engineering complete enough for tender** and **Certification pathway confirmed**, but leave **Provisional F&F schedule issued** un-ticked.
3. Look at the advance panel.

Expected UI result: the **Move to Tender →** button stays **disabled**; the requirement list shows "Provisional F&F schedule issued" as not met; the message "Complete the requirements above to advance." is shown.

Expected DB record: `leads.stage` remains `consultants` (unchanged); `leads.provisional_ff_issued` = `false`.

- [ ] Pass  [ ] Fail

---

**TC-03 — Duplicate submission: re-toggling does not create duplicate records**

Steps:
1. On a Consultants-stage test lead, tick **Provisional F&F schedule issued** on, then off, then on again in quick succession.
2. Add the **same** consultant (same role + same contact) twice with **+ Add consultant**.

Expected UI result: the checkbox reflects its final state with no error; two identical roster rows appear (the roster has no de-duplication).

Expected DB record: exactly **one** `leads` row for this lead id (no duplicate lead is created); `leads.provisional_ff_issued` = final toggled value (`true`); `leads.consultant_roster` (jsonb) contains **two** array elements for the repeated consultant — confirming re-patching updates the single row in place rather than inserting new rows.

- [ ] Pass  [ ] Fail

---

**TC-04 — Wrong role / no auth: request is rejected**

Steps:
1. Sign out (or use a session with no valid token).
2. Attempt `GET /api/sales/consultants` and `PATCH /api/sales/leads/:id` (e.g. `{ "approval_risk": "high" }`) for the test lead.

Expected UI result: the request is rejected by the authentication guard (`requireAuth`); the Consultants panel is unreachable without signing in.

Expected DB record: no change — `leads.approval_risk` is unchanged from its prior value. (Note: this stage requires authentication but no elevated role; the only role-gated sibling endpoint is the admin-only test-reset in SOP 02-13.)

- [ ] Pass  [ ] Fail

---

**TC-05 — Feature edge: High approval risk is advisory, never a blocker**

Steps:
1. On a Consultants-stage test lead, click **High** in the approval-risk block.
2. Observe the block, then open the pipeline board.
3. Ensure the three ready flags, site address and job are all in place, then click **Move to Tender →**.

Expected UI result: a red note appears ("High approval risk — flag it in the proposal and manage the client's expectations on timing."); the board card shows a red **"High approval risk"** chip while the lead is in Consultants; the advance to Tender still succeeds — the High rating does **not** block it.

Expected DB record: `leads.approval_risk` = `high`; after advancing, `leads.stage` = `tender` (proving the risk chip is advisory only).

- [ ] Pass  [ ] Fail

---

**TC-06 — Feature edge: Brief issued / Returned stamps are toggled timestamps**

Steps:
1. On a consultant roster row, click **○ Brief issued** (turns green ✓), then click **○ Returned** (turns green ✓).
2. Click **✓ Brief issued** again to clear it.

Expected UI result: each stamp toggles between the outlined ○ (grey) and filled ✓ (green) states; clearing turns it back to ○.

Expected DB record: after step 1, the matching element in `leads.consultant_roster` has non-null ISO `briefIssuedAt` and `returnedAt`; after step 2, that element's `briefIssuedAt` is `null` while `returnedAt` stays a timestamp.

- [ ] Pass  [ ] Fail

---

**TC-07 — Feature edge: provisional F&F is the shared selections schedule**

Steps:
1. Note the F&F rows already present in the Consultants stage (carried from Concept).
2. Add a new F&F row: Area "Bathroom", Item "Vanity", Supplier "Highgrove".
3. Inspect the lead's Concept selections schedule (the same list used earlier in the pipeline).

Expected UI result: the new row appears in the Consultants F&F block and is the same list surfaced at Concept — there is one shared schedule, not a separate copy.

Expected DB record: `leads.selections_schedule` (jsonb) contains the row `{ area: "Bathroom", item: "Vanity", supplier: "Highgrove" }` — the identical column written by the Concept stage, confirming continuity.

- [ ] Pass  [ ] Fail

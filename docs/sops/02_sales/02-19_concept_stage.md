---
sop_version: 1.0
last_reviewed: 2026-08-29
app_version: main
screenshot_status: placeholders_only
owner: Admin / Supervisor
test_status: untested
---

# SOP: Run the Concept stage (design-lock, concept design, client emails)

**Module:** Sales
**SOP ID:** 02-19
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin and Supervisor staff who run a lead through the **Concept** stage of the sales pipeline — the paid concept-design part of the job. This is where the client has agreed to pay for a concept, the concept fee has been invoiced, and we now deliver the first design.

A Director (Sam or Josh) is needed for one thing only: the design-lock **Override** (letting design start before the fee is paid). Everything else is normal Admin/Supervisor work.

## 2. When to use it

Use this SOP when a lead has reached the **Concept** stage. On the pipeline stepper the stage is labelled **Concept** (its internal key is `winning_offer`). A lead lands here after Discovery, once the concept agreement has been accepted.

You are in the right place when you open the lead and the focus panel at the top shows the Concept controls: a design-lock banner, a **Concept design** row of buttons, **Client emails**, a **Finishes schedule**, the **Design meeting** and **Concept presentation** cards, and a **PTSA / Plans pathway** box.

Stop using this SOP once the lead advances to **PTSA / Plans** (internal key `fee_proposal`) — from there follow the PTSA / Plans SOP.

## 3. What this does

The Concept stage turns "client has paid for a concept" into "client has approved a concept, and we're ready to price the build". It gives you one control panel that:

- **Locks the design work** until the concept fee actually shows as paid in Xero (or a Director overrides the lock).
- Tracks the **concept design** as it moves **With designer → Sent to client → Approved**.
- Holds the growing **finishes schedule** (areas, items, notes) that carries forward to Consultants and the proposal.
- Sends the two **Blue Leaf client emails** for this stage (brief questions before the design meeting, and an interim "your concept is underway" update), plus an automatic 7-day follow-up chase.
- Books the two **meetings** for this stage (Design meeting and Concept presentation) via Cal.com.
- Prepares the exit to **PTSA / Plans** by capturing the pre-construction fee and confirming the pathway was explained to the client.

## 4. Before you start

- The lead must already be in the **Concept** stage. If it isn't, it hasn't passed Discovery yet — don't force it.
- A **concept fee invoice** should have been raised in Discovery (Xero). Design stays locked until that invoice reads **paid** or **part paid**. Check the design-lock banner at the top of the panel.
- Know the **designer** assigned to the lead — their name is merged into the client emails. If no designer is selected the emails say "your designer".
- Confirm the lead has a valid **client email address** if you intend to preview or send any Concept email. A valid email is required even to build a preview (see Troubleshooting).
- To actually *send* Concept emails (not just preview), the environment flag `CONCEPT_EMAIL_ENABLED` must be set to `true`. Preview always works regardless of that flag (provided the lead has a valid email).
- Only a Director should use the **Override** button on the design-lock.

## 5. Step-by-step process

1. Open the lead and confirm the stage stepper shows **Concept**. The Concept control panel appears at the top of the page.
2. Look at the **design-lock banner**:
   - Green "Design unlocked" means the concept fee is paid (or a manual override is in place) — go to step 4.
   - Amber "Concept design is locked" means the fee is not paid yet.
3. If it is locked and the fee genuinely cannot be collected before design must start, ask a Director to click **Override**. The banner turns green and the override is logged. (If the fee simply hasn't been chased, collect it first — don't override by habit.)
4. In the **Concept design** row, click the button that matches where the design is now: **With designer**, **Sent to client**, or **Approved**. Earlier steps show a green tick once you move past them. (Clicking the button that is already current clears it back to blank — see Common mistakes.)
5. Upload the actual concept drawings in the **Documents** tab: choose document type **Concept drawings** and upload. Upload a new version each time the drawings change.
6. Before the design meeting, send the brief-questions email: in **Client emails** click **Brief questions (pre-meeting)**. A preview opens — read it, edit the subject or message if needed, then click **Send email**. This email attaches the Blue Leaf company-profile PDF automatically.
7. While the concept is being drawn, send the interim update: click **Interim update**, preview, then **Send email**.
8. Build the **Finishes schedule** as selections firm up: click **+ Add row** and fill **Area**, **Item / finish** and **Notes**. Add a row per selection. This list carries through to Consultants and the proposal, so keep it current.
9. Book the meetings using the **Design meeting** and **Concept presentation** cards — either copy the self-book link to the client or book a slot on their behalf.
10. When the client approves the concept, set **Concept design** to **Approved** (step 4).
11. In the **PTSA / Plans pathway** box at the bottom, enter the **Pre-construction fee (ex GST)** and tick **PTSA / Plans pathway explained to the client** once you have talked the client through what happens next.
12. When all three exit requirements are met (design **Approved**, pathway ticked, pre-con fee set), the **Move to PTSA / Plans →** button becomes active. Click it to advance the lead.

[insert screenshot: Concept panel with green "Design unlocked" banner and the Concept design button row]
[insert screenshot: Brief-questions email preview modal with Subject and Message fields]
[insert screenshot: PTSA / Plans pathway box with pre-construction fee field and pathway checkbox]

## 6. What happens next

Once you advance the lead, it moves to **PTSA / Plans** (internal key `fee_proposal`). The finishes schedule you built and the pre-construction fee you entered travel with the lead. From there, staff sign the PTSA, invoice the pre-construction fee, produce the working drawings, and present the plans — follow the PTSA / Plans SOP.

If you don't advance, the lead stays in Concept and the follow-up cadence keeps chasing the client (see Automation notes).

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Clicking a Concept design button that is already selected | Each status button is a toggle — clicking the current one clears it back to blank | Only click a status button to *move forward*; if you cleared it by accident, click it again to set it back |
| Using Override instead of collecting the fee | Override is right there and looks like the quick way to unlock design | Override is a Director decision for genuine cases only; chase the concept-fee invoice first |
| Trying to advance with a blank pre-construction fee or unticked pathway | The three exit requirements aren't all met | Fill the pre-con fee **and** tick the pathway checkbox **and** set design to Approved — the Move button stays disabled until all three are done |
| Sending the interim email before the brief-questions email | Buttons sit side by side | Brief questions goes out *before* the design meeting; interim goes out *while* the concept is being drawn |
| Expecting the client email to arrive during testing | Sending is gated by `CONCEPT_EMAIL_ENABLED` | Preview always works; if nothing sends, the flag is off — confirm with an admin before assuming a fault |
| Uploading concept drawings as "Other" | Wrong document type picked on upload | Always choose **Concept drawings** as the document type so the drawings are tracked and versioned |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| Design-lock banner stays amber even after payment | The concept-fee invoice in Xero isn't marked paid/part-paid yet, or the invoice hasn't synced | Confirm the invoice status in Xero; reload the lead; if it's genuinely paid but still locked, a Director can Override |
| Concept design buttons are greyed out and won't click | The stage is still locked (no paid fee, no override) | Get the fee paid or ask a Director to Override — buttons enable once unlocked |
| "Concept email sending is turned off" when sending | `CONCEPT_EMAIL_ENABLED` is not set to `true` | This is expected outside live sending; ask an admin to enable it, or just use Preview |
| Clicking Brief questions / Interim shows "no valid email on lead" and no preview opens | The lead has no valid email address (the preview is built server-side and is skipped without one) | Add the client's email to the lead, then click the email button again |
| Brief-questions email sends but no company-profile PDF attached | `CONCEPT_EMAIL_COMPANY_PROFILE_PATH` isn't set, or the Dropbox folder has no PDF | Ask an admin to point the env var at the folder that holds the company-profile PDF; sending still works without it |
| "Move to PTSA / Plans" button is disabled | One of the three exit requirements is missing | Check the "to advance" checklist — set design to Approved, tick the pathway, and enter the pre-con fee |
| Lead advanced to PTSA / Plans with an exit item still missing | This exit gate is enforced by the disabled button in the UI only — server-side it is advisory (a forced/API move is allowed and just logged as a gate-bypass), so it does not hard-block | Not a fault; move the lead back to Concept, complete the missing item, then advance again from the panel |

## 9. Related modules

- [02-16 Generate and accept the concept agreement](02-16_concept_agreement.md) — the Discovery step that unlocks the Concept stage.
- [02-14 Select the designer and set fees](02-14_select_designer_and_fees.md) — sets the designer whose name merges into Concept emails.
- [02-18 Pipeline meeting scheduling](02-18_pipeline_meeting_scheduling.md) — how the Design meeting and Concept presentation cards work.
- [02-02 Move a lead through the stages](02-02_move_lead_through_stages.md) — the stepper and stage-gate model this stage plugs into.
- [02-12 Lead mailbox](02-12_lead_mailbox.md) — where the sent Concept emails and any client replies appear.

## 10. Screenshot placeholders

[insert screenshot: Concept stage focus panel — locked (amber) state with the Override button visible]
[insert screenshot: Concept stage focus panel — unlocked (green) state with the design button row]
[insert screenshot: Client emails section with Brief questions and Interim update buttons]
[insert screenshot: Brief-questions email preview modal, editable Subject and Message]
[insert screenshot: Finishes schedule with two rows filled in]
[insert screenshot: PTSA / Plans pathway box and the "to advance" checklist showing all three items met]

## 11. Automation notes

- **Design-lock read** — on opening the panel the app calls `GET /api/finance/leads/:id/xero-invoices`, finds the invoice whose type is `concept_fee`, and treats the stage as unlocked when that invoice status is `paid` or `part_paid`, **or** when `leads.concept_fee_override_at` is set. No record is written by this read.
- **Override** — `POST /api/sales/leads/:id/concept-fee/override` sets `leads.concept_fee_override_at` (timestamp) and `leads.concept_fee_override_by` (the caller's user id), and inserts a `lead_activities` row (`activity_type` = `note`, summary "Concept design unlocked before payment (manual override)"). Intended for Directors (Sam/Josh); every use is logged.
- **Concept design status change** — clicking a status button issues `PATCH /api/sales/leads/:id` writing `leads.concept_design_status` = `with_designer` | `sent_to_client` | `approved` (or back to null if you click the current one).
- **Finishes schedule save** — editing rows issues `PATCH /api/sales/leads/:id` writing `leads.selections_schedule` (jsonb array of `{area, item, notes}`).
- **Concept emails (send)** — `POST /api/sales/leads/:id/concept-email/send` with `{which}` (`brief_questions` | `interim`). Sending is gated by `CONCEPT_EMAIL_ENABLED=true`; preview (`{preview:true}`) always works. On a real send the app:
  - Sends a text-signature-only email (no logo image). `brief_questions` attaches the company-profile PDF loaded from the Dropbox folder in `CONCEPT_EMAIL_COMPANY_PROFILE_PATH`.
  - Stamps the lead: `leads.concept_brief_questions_sent_at` for brief questions, `leads.concept_interim_sent_at` for interim (migration 191).
  - Inserts a `correspondence` row (`direction` = `outbound`) and a `lead_activities` row (`activity_type` = `email`).
- **Follow-up cadence (automatic)** — gated by `CONCEPT_EMAIL_FOLLOWUP_ENABLED` (checked at the daily scheduler in `dev-api.mjs`). `runConceptFollowups` chases any **Concept** (`winning_offer`) lead whose `concept_brief_questions_sent_at` is 7+ days ago, that has had no inbound reply since, whose `concept_followup_sent_at` is still empty, whose `concept_design_status` is not `approved`, and that is not a test lead (`is_test`). On send it sets `leads.concept_followup_sent_at`, inserts a `correspondence` outbound row and a `lead_activities` email row.
- **Advance to PTSA / Plans** — `PATCH /api/sales/leads/:id` writing `leads.stage` = `fee_proposal`. The three exit requirements are enforced **client-side** — the **Move to PTSA / Plans →** button stays disabled until all three pass. Server-side this particular transition is **advisory only**: a forced/direct-API move is allowed through and merely logged (a `[gate-bypass]` server warning plus a `lead_activities` `stage_change` row whose `detail` reads `Gate bypass — missing: …`), never hard-blocked. (The hard, server-blocking gates in this pipeline sit on other transitions — e.g. advancing *into* Concept requires `concept_agreement_status` = `accepted`, which returns a `422 GATE_BLOCKED` — not on the Concept→PTSA exit.)

## 12. Edge cases and limits

- **The exit gate is a disabled button, not a server block.** The three Concept→PTSA exit requirements are enforced by the greyed-out **Move to PTSA / Plans →** button in the UI. Server-side the `fee_proposal` gate is advisory (a forced/API move succeeds and is only logged as a gate-bypass). The hard server gates that return an error live on other transitions (into Concept, into Won).
- **Pre-migration safety.** The client-side exit-gate checks pass automatically when the underlying column is absent from the lead (they use an "is the column present?" test — `!("col" in lead)` for `concept_design_status` / `concept_pathway_explained`). If migrations 188/191 have not been applied on an environment, those checks won't hold the button and email stamps won't be written — this is intentional fail-soft behaviour, not a bug.
- **Override is not role-enforced at the button.** The endpoint only requires a signed-in staff account (`requireAuth`); it does not restrict to Sam/Josh. The panel shows the Override button to any staff and simply logs who used it. Treat it as a Director-only action by policy; the audit trail records the actual user.
- **Re-sending an email sends again.** There is no "already sent" guard on Concept emails — clicking send twice sends two emails and re-stamps the sent-at column. Send once.
- **Part-paid unlocks.** A `part_paid` concept-fee invoice unlocks design just like a fully paid one.
- **Amounts are ex-GST.** The pre-construction fee is entered and stored ex-GST; Xero adds GST when the fee is later invoiced.
- **No valid email = no preview and no send.** If the lead has no valid email, both preview and send are rejected with the reason `no valid email on lead` (the `isEmail` check runs before the preview is returned) — the preview modal does not open. Add a valid email to the lead first.
- **Interim email has no attachment.** Only the first-touch brief-questions email carries the company-profile PDF.

## 13. Owner of the process

**Owner:** Admin / Supervisor (Sales). The design-lock Override is reserved for a Director (Sam or Josh) by policy (it is not enforced at the button).
**Next review date:** 2027-02-28 (6 months from last review).

## 14. Troubleshoot Agent Test Script

**Pre-test setup**
- Sign in as a staff user with the Sales module (Admin/Supervisor).
- Create or reset a **test lead** and move it to the **Concept** stage (`stage` = `winning_offer`). Give it a valid client email.
- Ensure migrations 188 and 191 are applied on the environment under test.
- For the design-lock tests, have a test lead both **with** a paid `concept_fee` Xero invoice and **without** one.
- Note the test lead's id for the DB checks below.

**TC-01 — Happy path (run the stage and advance)**
Steps: With a Concept lead whose concept fee shows paid, confirm the green "Design unlocked" banner → click **Approved** in Concept design → enter `15000` in Pre-construction fee (ex GST) → tick **PTSA / Plans pathway explained to the client** → click **Move to PTSA / Plans →**.
Expected UI: The three "to advance" items all show met; the Move button is active; the lead moves to **PTSA / Plans**.
Expected DB: `leads` row for the test lead has `concept_design_status` = `approved`, `concept_pathway_explained` = `true`, `preconstruction_fee` = `15000`, and `stage` = `fee_proposal`.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field (blocked advance)**
Steps: On a Concept lead, set design to **Approved** and tick the pathway, but leave **Pre-construction fee** blank → observe the "to advance" checklist and the Move button.
Expected UI: The "Pre-construction fee set" item shows unmet and **Move to PTSA / Plans →** stays **disabled** — the disabled button is the enforcement for this transition (there is no server hard-gate on Concept→PTSA; a forced direct-API `PATCH … {stage:"fee_proposal"}` would be *allowed* and only logged as a gate-bypass, so do not rely on the server to block it).
Expected DB: `leads.stage` for the test lead is unchanged at `winning_offer`; `leads.preconstruction_fee` is null.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission (Override twice)**
Steps: On a locked Concept lead, click **Override** and wait for the green banner. The Override button disappears once unlocked, so trigger the override a second time by repeating `POST /api/sales/leads/:id/concept-fee/override` directly.
Expected UI: Both calls succeed; the banner stays green ("✓ Design unlocked — manual override"); no error.
Expected DB: `leads.concept_fee_override_at` is set (re-stamped to the later time), `leads.concept_fee_override_by` holds the caller's user id, and `lead_activities` has **two** rows with `activity_type` = `note` and summary "Concept design unlocked before payment (manual override)" — confirming there is no idempotency guard.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role (non-staff blocked)**
Steps: Call `POST /api/sales/leads/:id/concept-fee/override` with a portal-client / non-staff token (a token that is not an active staff `user_profiles` account, or whose `role` = `client`).
Expected UI/response: Request is rejected with 401/403 (staff-only endpoint via `requireAuth` — no token → 401; inactive/no profile → 403 "Account inactive"; client role → 403 "Forbidden"); no override is applied.
Expected DB: `leads.concept_fee_override_at` for the test lead is unchanged (still null if it was null); no new `lead_activities` override note is inserted.
- [ ] Pass  [ ] Fail

**TC-05 — Design-lock enforcement (feature edge)**
Steps: On a Concept lead with **no** paid concept-fee invoice and **no** override, try to click a **Concept design** status button.
Expected UI: The banner reads amber "🔒 Concept design is locked until the concept fee is paid …"; the design status buttons are greyed out / not clickable; helper text reads "Unlock (fee paid or override) to start moving the design forward." After a Director clicks **Override**, the banner turns green and the buttons become clickable.
Expected DB: `leads.concept_design_status` stays null while locked; it only changes (via `PATCH /api/sales/leads/:id`) after unlocking and clicking a status.
- [ ] Pass  [ ] Fail

**TC-06 — Email preview always works, sending is gated + attaches profile**
Steps: With `CONCEPT_EMAIL_ENABLED` unset, on a lead with a valid email click **Brief questions (pre-meeting)** → the preview opens; click **Send email**. Then set `CONCEPT_EMAIL_ENABLED=true` and send again with `CONCEPT_EMAIL_COMPANY_PROFILE_PATH` pointing at a Dropbox folder that holds a PDF.
Expected UI: With the flag off, the preview renders but sending shows "Concept email sending is turned off." With the flag on, the email sends and the preview closes with "Email sent."
Expected DB (successful send): `leads.concept_brief_questions_sent_at` is set; a `correspondence` row exists with `direction` = `outbound` and the email subject; a `lead_activities` row exists with `activity_type` = `email` and summary "Concept brief-questions email sent". The sent email carries the company-profile PDF attachment.
- [ ] Pass  [ ] Fail

**TC-07 — Finishes schedule persists (jsonb)**
Steps: In **Finishes schedule** click **+ Add row**, fill Area = `Kitchen`, Item / finish = `Stone benchtop`, Notes = `20mm`, then add a second row → reload the lead.
Expected UI: Both rows are still present after reload and carry through the stage.
Expected DB: `leads.selections_schedule` for the test lead is a jsonb array containing `{ "area": "Kitchen", "item": "Stone benchtop", "notes": "20mm" }` plus the second row.
- [ ] Pass  [ ] Fail

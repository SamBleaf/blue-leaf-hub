---
sop_version: 1.0
last_reviewed: undefined
app_version: main
screenshot_status: placeholders_only
owner: Admin / Supervisor
test_status: untested
---

# SOP: Run the Tender stage (sub-status, proposal checklist, named actions, contract)

**Module:** Sales
**SOP ID:** 02-22
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin and Supervisor staff who run a lead through the **Tender** stage — the stage where the client's **Fixed-Price Proposal** is built, presented, and the **building contract** is signed. This is the last stage before **Won**, so it is the point where a design-and-build client becomes a construction project.

## 2. When to use it

Use this SOP once a lead has reached the **Tender** stage (it has already passed Enquiry, Qualify, Discovery, Concept, PTSA / Plans and Consultants). You are in the Tender stage when the lead detail screen shows the **"Tender progress"** control panel. Use it to:

- Track exactly where the tender is up to (the sub-status strip).
- Build the estimate and generate the client Fixed-Price Proposal.
- Quality-check the proposal against the Blue Leaf Proposal Checklist before you present it.
- Book the proposal presentation meeting and send the four named client emails.
- Record the building contract as it moves prepared → sent → signed.

## 3. What this does

The Tender stage turns a single "tender" bucket into a tracked mini-pipeline. In one screen you can:

- **See and set progress** on a 10-step sub-status strip (pack prep → RFQs → pricing → estimate → proposal → presented → reviewing → contract prep/sent/signed).
- **Start the estimate** in the RFQ Engine and **generate the Fixed-Price Proposal** — the proposal is treated as a first-class client sales tool, not a file attachment.
- **Run the Blue Leaf Proposal Checklist**, a client-facing quality gate. It shows a readiness percentage; below 80% it warns the proposal is "not ready to present".
- **Take five named actions** (each a distinct, deliberate step, never one generic "send"): book the proposal presentation meeting, plus four separately-worded client emails.
- **Capture the building contract** through prepared → sent → signed, which stamps the sent and signed dates. A signed contract is required before the lead can move to Won.

Everything is stored on the lead record, so any staff member opening the lead sees the same live picture.

## 4. Before you start

- The lead must be at the **Tender** stage. If it is not, work through the earlier stages first (see 02-02).
- The lead must have a **site address**. The "Proceed to RFQ Engine & Estimate →" button is disabled without one.
- The Consultants stage should have produced the specified fixtures-and-fittings (F&F) schedule — it feeds the proposal.
- To actually **send** client emails, an admin must have set the `TENDER_EMAIL_ENABLED` environment variable to `true` on the server. **Previewing an email always works**, even when sending is off.
- All amounts you enter (fixed price, allowances) are stored **ex-GST**. GST is added by Xero on the invoice — never add 10% by hand.

## 5. Step-by-step process

1. Open the lead and confirm the stage badge reads **Tender**. The Tender control panel appears in the "Do this now" focus area.

2. In the **Tender progress** strip, click the sub-status that matches where the work actually is (for example **Tender pack being prepared**). The one you click turns blue; earlier steps show a green tick. Update it whenever the work moves on.
   *[insert screenshot: Tender progress sub-status strip with one status active]*

3. When you are ready to build the estimate, click **Proceed to RFQ Engine & Estimate →**. This creates the job first if the lead does not have one yet, then opens the RFQ Engine pre-filled from this lead.
   *[insert screenshot: Estimate & proposal panel with the RFQ Engine button]*

4. Once the estimate is priced, come back to the lead and click **Create Fixed-Price Proposal →**. This opens the new Fixed-Price Proposal builder. The specifications, allowances and the specified F&F schedule (from Consultants) feed straight into it.

5. Work down the **Blue Leaf Proposal Checklist** and tick each item as it is finished: Scope of works complete, Inclusions list finalised, Specifications + allowances set, Specified F&F schedule attached, Fixed price calculated with margin, Exclusions clearly stated, Payment schedule set, Build timeline / weeks stated, Testimonials + past work included, Terms + validity period set.
   *[insert screenshot: Blue Leaf Proposal Checklist with readiness percentage]*

6. In the **Testimonials / references to include** box, type which past clients or projects to reference in this proposal, then click outside the box to save it.

7. Check the readiness badge (top-right of the checklist). If it shows an **amber "not ready to present"** warning (under 80%), finish the outstanding items before you book the presentation.

8. When the proposal is ready, scroll to the **Proposal presentation** meeting block. Either click **Copy client booking link** to send the client a self-book link, or **Set a time yourself** to pick an open slot and book it on their behalf.
   *[insert screenshot: Proposal presentation meeting scheduler]*

9. After the presentation, use the **Client emails** row. Click **Proposal follow-up (24h)** the day after presenting. A preview opens — read it, edit the wording if needed, then click **Send email**. Sending this email also moves the sub-status to **Client reviewing**.
   *[insert screenshot: Client emails row with the four named buttons]*

10. While the client is deciding, click **Client-review follow-up** to gently check in (preview, edit, send).

11. When the building contract goes out, click **Contract sent**. Preview and send the email; sending it also sets the contract status to **Sent** and stamps today as the sent date.

12. If the contract is not signed after a while, click **Unsigned-contract follow-up** to chase it (preview, edit, send).

13. In the **Building contract** block, click the status that matches reality: **Prepared**, **Sent**, or **Signed**. Clicking **Sent** stamps the sent date; clicking **Signed** stamps the signed date. (The "Sent … · Signed …" date line only appears once a sent date has been stamped — so click **Sent** before **Signed** if you want both dates shown.)
    *[insert screenshot: Building contract status buttons with sent/signed dates]*

14. When the client returns the signed contract, open the **Documents** tab, choose document type **Construction contract** from the type dropdown, and upload the signed PDF.

15. You can now move the lead to **Won** (see 02-02). The Won move is blocked until the contract status is **Signed**.

## 6. What happens next

- Once the contract status is **Signed** and the signed contract is uploaded, the Won gate opens.
- Moving the lead to **Won** carries the win value onto the job and enters the **Contract secured** sub-state, ready for the clean handoff to Operations.
- Every email you send is logged on the lead's timeline, so anyone can see what has been sent and when.
- The Fixed-Price Proposal you generated stays on the lead as the client-facing sales document, not a stray attachment.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Booking the presentation before the checklist is 80%+ | The amber warning is easy to skim past | Finish the checklist first — the badge should read green, not amber, before you book the meeting |
| Adding 10% GST to the fixed price by hand | Staff expect to type the "final" number | Enter the price ex-GST; Xero adds GST on the invoice |
| Saying "APB" anywhere the client can see | APB is internal guidance only | Everything client-facing is Blue Leaf branded — use "Fixed-Price Proposal" and "Blue Leaf Proposal Checklist" |
| Clicking one generic "send" and moving on | Old habit from single-button tools | Use the correct named button — each of the four emails is worded for its exact moment |
| Marking the contract **Signed** without uploading the file | The status button feels like enough | Also upload the signed PDF in Documents as "Construction contract" — the Won handoff expects the file |
| Forgetting to advance the sub-status strip | The strip is manual, not automatic | Nudge the strip each time the work moves so the whole team sees the true position |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| "Proceed to RFQ Engine & Estimate →" button is greyed out | The lead has no site address | Add the site address to the lead, then retry |
| "Add site address before starting tender." message under the button | Same — missing site address | Fill in the site address field first |
| Email preview opens but **Send email** returns "Tender email sending is turned off…" | `TENDER_EMAIL_ENABLED` is not set to `true` on the server | Ask an admin to set `TENDER_EMAIL_ENABLED=true`; preview still works meanwhile |
| Email won't build a preview | The lead has no valid email address | Add a valid client email to the lead, then reopen the preview |
| Readiness badge stuck under 80% | Not all checklist items are ticked | Tick the remaining items; readiness = ticked ÷ 10 |
| Clicked **Signed** but no "Signed …" date line appears | The date line only renders once a **sent** date exists | Click **Sent** first (stamps the sent date), then **Signed** — both dates then show |
| Can't move the lead to Won ("the building contract must be signed") | Contract status is not yet **Signed** | Set the contract status to **Signed** in the Building contract block first |
| A test lead moves straight to Won without the "contract must be signed" block | Test leads (`is_test = true`) bypass every hard gate by design (mig 178) | Expected behaviour — the Won gate only enforces on real (non-test) leads; test on a real lead to see the block |
| A checklist tick or sub-status "un-saves" itself | The save round-trip failed (e.g. migration 194 not applied) | Confirm migration 194 is applied; the control reverts on a failed save so you know it did not persist |

## 9. Related modules

- [02-02 Move a lead through the pipeline stages](02-02_move_lead_through_stages.md) — the stage stepper and the Won gate.
- [02-14 Select the designer & set the fees](02-14_select_designer_and_fees.md) — the Consultants work that feeds the F&F schedule.
- [02-16 Generate & accept the concept agreement](02-16_concept_agreement.md) — the earlier client agreement in the pipeline.
- [02-18 Schedule pipeline meetings with Cal.com](02-18_pipeline_meeting_scheduling.md) — how the proposal presentation booking works.
- 03-01 Create a fee proposal / 03-02 Send a fee proposal to a client (Tender Manager) — the Fixed-Price Proposal builder opened from this stage.

## 10. Screenshot placeholders

- *[insert screenshot: full Tender control panel — sub-status strip, estimate & proposal, checklist, meeting, emails, contract]*
- *[insert screenshot: Tender progress sub-status strip with one status active and earlier ones ticked]*
- *[insert screenshot: Estimate & proposal panel — "Proceed to RFQ Engine & Estimate →" + "Create Fixed-Price Proposal →"]*
- *[insert screenshot: Blue Leaf Proposal Checklist with 10 items and the readiness badge]*
- *[insert screenshot: amber "not ready to present" warning under 80%]*
- *[insert screenshot: Proposal presentation meeting scheduler (copy link + set a time)]*
- *[insert screenshot: Client emails row with the four named buttons]*
- *[insert screenshot: email preview modal with Subject + Message + Send email]*
- *[insert screenshot: Building contract status buttons showing sent/signed dates]*

## 11. Automation notes

Every automated action triggered from this stage:

- **Set a sub-status** → writes `leads.tender_substatus` (text) via `PATCH /api/sales/leads/:id`. Values in order: `pack_prep`, `rfqs_issued`, `awaiting_pricing`, `estimate_review`, `proposal_generated`, `proposal_presented`, `client_reviewing`, `contract_prep`, `contract_sent`, `contract_signed` (`TENDER_SUBSTATUS_ORDER` in `constants.js`).
- **Tick a checklist item** → writes `leads.proposal_checklist` (jsonb) as `{ itemKey: true/false }`. Item keys (`PROPOSAL_CHECKLIST_ITEMS`): `scope`, `inclusions`, `specifications`, `ff_schedule`, `fixed_price`, `exclusions`, `payment_terms`, `timeline`, `testimonials`, `terms`. The testimonials note saves to `proposal_checklist._testimonials`. Readiness = ticked ÷ 10; below `PROPOSAL_READY_THRESHOLD = 0.8` shows the amber "not ready to present" warning. Saved via the same `PATCH /api/sales/leads/:id`.
- **Proceed to RFQ Engine & Estimate** → creates the job first if the lead has none (`POST /api/sales/leads/:id/convert-to-job`), then navigates to the RFQ Engine (`/tender-manager/rfq-engine?leadId=…&jobId=…`). No email is sent.
- **Create Fixed-Price Proposal** → opens `/tender-manager/fee-proposal/new`. No email is sent.
- **Book proposal presentation meeting** → `MeetingScheduler` with `meetingType="proposal_presentation"` (Cal.com `fee-proposal` event slug, env `CAL_FEE_PROPOSAL_SLUG`). A booking writes to the `lead_meetings` spine.
- **Proposal follow-up (24h) email** → `POST /api/sales/leads/:id/tender-email/send` with `{ which: "proposal_followup" }`. Also advances `tender_substatus` to `client_reviewing` (client-side, only if the strip was earlier than that step). On a real send it inserts a `correspondence` row (`direction = 'outbound'`, subject "Great to walk you through your proposal") and a `lead_activities` row (`activity_type = 'email'`, summary "Proposal follow-up (24h) email sent").
- **Client-review follow-up email** → same endpoint, `{ which: "review_followup" }` (subject "Any questions on your proposal?"). Logs to `correspondence` + `lead_activities` (summary "Client-review follow-up email sent").
- **Contract sent email** → same endpoint, `{ which: "contract_sent" }` (subject "Your building contract is on its way"). On a successful send the UI also sets `leads.contract_status` to `sent` and stamps `leads.contract_sent_date` (today) if not already set. Logs to `correspondence` + `lead_activities` (summary "Contract-sent email sent").
- **Unsigned-contract follow-up email** → same endpoint, `{ which: "contract_followup" }` (subject "Ready when you are — your building contract"). Logs to `correspondence` + `lead_activities` (summary "Unsigned-contract follow-up email sent").
- **All four emails** are gated by env `TENDER_EMAIL_ENABLED`; when it is not `"true"` the send returns HTTP 503 ("Tender email sending is turned off. Set TENDER_EMAIL_ENABLED to send — preview still works.") and no email leaves — and none of the side-effects above run. Preview (`preview: true`) is never gated and always works. The endpoint is guarded by `requireAuth` (a valid staff session; portal `client` accounts and unauthenticated callers are rejected) — there is **no** per-staff-role restriction on it. Templates live in `server/lib/tenderEmails.mjs` (admin-editable via `user_settings` key `crm_tender_email`); emails are text-signature only (no inline logo image).
- **Set contract status** → writes `leads.contract_status` (`prepared` / `sent` / `signed`) via `PATCH /api/sales/leads/:id`. Choosing `sent` stamps `leads.contract_sent_date`; choosing `signed` stamps `leads.contract_signed_date` (today, if not already set).
- **Upload signed contract** (Documents tab) → stored on `lead_documents` with `document_type = 'construction_contract'` via `POST /api/sales/leads/:id/documents`.
- **Move to Won** → `PATCH /api/sales/leads/:id` with `{ stage: "won" }`. For a real (non-test) lead moving **forward**, the server checks `leads.contract_status`; if it is not `signed` the move is refused with HTTP 422 "Can't move to Won yet — the building contract must be signed." (`GATE_BLOCKED`). On success it enters `won_substatus = 'contract_secured'` (Won dual-state, Sales Pipeline Phase 6).

## 12. Edge cases and limits

- The sub-status strip is **manual** — clicking a status never sends anything or moves the pipeline stage; it only records where the work is. Two of the strip's steps advance on their own: sending the Proposal follow-up email sets `client_reviewing`, and sending the Contract sent email sets the contract status to `sent`.
- The checklist readiness is a straight count of the 10 items — it does not verify the proposal content, only that a human ticked each box.
- Previewing an email never sends and is never gated. Only the actual **Send email** is gated by `TENDER_EMAIL_ENABLED`.
- Edited email copy in a preview applies to **that one send only** — it does not change the saved template.
- Contract dates are stamped on the **first** transition to sent/signed; re-clicking the same status does not overwrite a date already set. The "Sent … · Signed …" line only renders once a sent date exists — jumping straight to **Signed** stamps `contract_signed_date` but shows no date line until a sent date is also set.
- **Test leads bypass the Won gate.** A lead with `leads.is_test = true` (mig 178) bounces freely across every stage with all hard gates bypassed, so the "contract must be signed" block is only observable on a real (non-test) lead making a forward move. Any **backward** stage move is also un-gated for all leads.
- The Won gate only enforces "contract signed" once migration 194 is applied (the `contract_status` column exists). On a database without it applied, the gate passes so nothing is blocked — but the strip, checklist and contract capture will not persist.
- All amounts are ex-GST throughout; GST is added by Xero on the invoice, never in the Hub.

## 13. Owner of the process

**Owner:** Admin / Supervisor (Sales). The Admin who runs the tender owns keeping the sub-status, checklist and contract status truthful; the Supervisor signs off that the proposal is ready before it is presented.

**Next review:** 2027-02-28 (6 months after authoring; update `last_reviewed` at first sign-off and reset the review date to 6 months on).

## 14. Troubleshoot Agent Test Script

**Pre-test setup:**
- Confirm migration `194_tender_stage.sql` is applied (columns `leads.tender_substatus`, `leads.proposal_checklist`, `leads.contract_status`, `leads.contract_sent_date`, `leads.contract_signed_date` exist, and `lead_documents.document_type` allows `construction_contract`).
- Create or pick a **test lead** (`leads.is_test = true`) at stage `tender`, with a valid `email` and a non-empty `site_address`. Use it for TC-01, TC-02, TC-03, TC-06 and TC-07.
- **TC-05 needs a separate REAL (non-test) lead** (`is_test = false`) at stage `tender` — test leads bypass the Won hard gate, so the block cannot be observed on one.
- Log in as an Admin / Supervisor for the UI test cases. TC-04 is an auth-boundary test that uses an unauthenticated request (or a portal-client token), not a staff role.
- For send tests, note whether `TENDER_EMAIL_ENABLED` is `"true"` (sending on) or not (preview-only). TC-03 assumes sending is on; TC-06 assumes it is off.

---

**TC-01 — Happy path: set sub-status, tick checklist, capture contract**
1. Open the test lead at the Tender stage.
2. In the Tender progress strip, click **Estimate review**.
3. In the Blue Leaf Proposal Checklist, tick **Scope of works complete**.
4. In the Building contract block, click **Sent**, then click **Signed**.
- Expected UI: **Estimate review** turns blue with earlier steps ticked; the checklist badge increments (e.g. 1/10 · 10%); the Building contract shows **Signed** active with a date line reading "Sent [today] · Signed [today]".
- Expected DB: `leads.tender_substatus = 'estimate_review'`; `leads.proposal_checklist->>'scope' = 'true'`; `leads.contract_status = 'signed'`; `leads.contract_sent_date =` today's date and `leads.contract_signed_date =` today's date (`YYYY-MM-DD`).
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field: start tender with no site address**
1. Clear the test lead's `site_address` (blank it).
2. Open the Tender stage and look at the Estimate & proposal panel.
- Expected UI: the **Proceed to RFQ Engine & Estimate →** button is disabled (greyed), and the message **"Add site address before starting tender."** shows beneath it. No job is created.
- Expected DB: no change — `leads.job_id` stays as it was; no new `jobs` row for this lead.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission: send the same named email twice**
1. Ensure `TENDER_EMAIL_ENABLED="true"`. Use a test lead whose `tender_substatus` is earlier than `client_reviewing` (e.g. blank or `estimate_review`).
2. Click **Proposal follow-up (24h)**, then in the preview click **Send email**.
3. Click **Proposal follow-up (24h)** again and click **Send email** a second time.
- Expected UI: both sends succeed with "Email sent."; the sub-status shows **Client reviewing** after the first send and stays there.
- Expected DB: two `correspondence` rows for this `lead_id` (`direction = 'outbound'`, `subject = 'Great to walk you through your proposal'`) and two `lead_activities` rows (`activity_type = 'email'`, `summary = 'Proposal follow-up (24h) email sent'`). `leads.tender_substatus = 'client_reviewing'`. (The named emails are intentionally idempotent-free — each click is a real, separately-logged send.)
- [ ] Pass  [ ] Fail

**TC-04 — Unauthorised caller: the tender-email endpoint rejects non-staff callers**
1. Send `POST /api/sales/leads/:id/tender-email/send` with body `{ "which": "contract_sent" }` and **no** `Authorization` header (unauthenticated).
2. Repeat the same request using a **portal-client** account's token (a user whose `user_profiles.role = 'client'`).
- Expected UI / response: the unauthenticated request returns HTTP 401 `{ ok: false, error: "Unauthorised" }`; the portal-client request returns HTTP 403 `{ ok: false, error: "Forbidden" }`. Neither send goes through. (Note: `requireAuth` gates on a valid **staff** session, not on a specific staff role — any active non-client staff account is permitted to send.)
- Expected DB: no new `correspondence` or `lead_activities` row for this lead; `leads.contract_status` unchanged.
- [ ] Pass  [ ] Fail

**TC-05 — Feature-specific edge case: Won gate blocks until contract signed (real lead)**
1. On the **real (non-test)** lead at the Tender stage, set the Building contract status to **Prepared** (not signed).
2. Try to move the lead to **Won** via the stage stepper.
- Expected UI: the move is refused with the message **"Can't move to Won yet — the building contract must be signed."** The stage stays at **Tender**.
- Expected DB / response: `leads.stage` remains `tender`; response code 422 with error code `GATE_BLOCKED`. After setting the contract status to **Signed** and retrying, the move succeeds, `leads.stage = 'won'` and `leads.won_substatus = 'contract_secured'` (the last requires the Phase-6 Won dual-state migration).
- [ ] Pass  [ ] Fail

**TC-06 — Feature-specific: email send gated off (preview still works)**
1. Ensure `TENDER_EMAIL_ENABLED` is **not** `"true"` (sending off).
2. Click **Client-review follow-up** to open the preview, confirm it renders, then click **Send email**.
- Expected UI: the preview opens and shows subject "Any questions on your proposal?"; on Send, an error shows: **"Tender email sending is turned off. Set TENDER_EMAIL_ENABLED to send — preview still works."**
- Expected DB: no `correspondence` row and no `lead_activities` row created for this send (HTTP 503, no email dispatched).
- [ ] Pass  [ ] Fail

**TC-07 — Feature-specific: readiness threshold flips at 80%**
1. On a fresh test lead, tick exactly **7** of the 10 checklist items.
2. Note the badge, then tick an **8th** item.
- Expected UI: at 7/10 (70%) the badge is amber with the "Under 80% — not ready to present" warning; at 8/10 (80%) the warning clears and the badge turns green.
- Expected DB: `leads.proposal_checklist` holds 7 then 8 item keys set to `true` (readiness = keys ÷ 10; `PROPOSAL_READY_THRESHOLD = 0.8`).
- [ ] Pass  [ ] Fail

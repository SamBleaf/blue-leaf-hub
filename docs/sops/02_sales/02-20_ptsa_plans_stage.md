---
sop_version: 1.0
last_reviewed: 2026-08-29
app_version: main
screenshot_status: placeholders_only
owner: Admin / Supervisor
test_status: untested
---

# SOP: Run the PTSA / Plans stage (sign PTSA, design fee, working drawings)

**Module:** Sales
**SOP ID:** 02-20
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Admin and Supervisor. This is the stage you run once the client has approved their concept and you are ready to lock in the design and pre-construction work.

## 2. When to use it
Use this when a lead sits at the **PTSA / Plans** stage (the coloured stage chip reads "PTSA / Plans"). You get here straight after the **Concept** stage, once the concept design is approved, the PTSA / Plans pathway has been explained to the client, and the pre-construction fee has been set.

Run this stage to do five things, in order:
1. Send the client the "concept approved — here's what happens next" email.
2. Get the Pre-Tender Service Agreement (PTSA) signed.
3. Invoice the design & pre-construction fee.
4. Produce and file the working drawings.
5. Present the plans to the client before anything goes to engineering.

## 3. What this does
The PTSA / Plans stage turns the approved concept into a signed agreement, a paid design fee, and a full set of working drawings. It is **not** the final proposal — that comes later at Tender.

- The **PTSA is the Full Design Package and the pre-construction agreement all in one** — one agreement, one fee. That fee is the pre-construction fee you set back in the Concept stage; here it is shown read-only as the "PTSA fee".
- When you **mark the PTSA signed**, the Hub stores the signed PDF, stamps the lead as signed, and (behind the scenes) creates the job and its Dropbox folder tree so the project has a home from day one.
- Once the PTSA is signed you can raise the **design & pre-construction fee invoice** straight into Xero (Xero adds GST — you enter the fee ex-GST).
- The **working drawings** (plans, elevations, 3D render) are uploaded in the Documents tab and carry through to the job's PLANS folder.
- A **plan presentation** meeting lets you walk the client through the detailed drawings and capture any layout or opening changes **before** engineering starts.

The one thing that unlocks the next stage (Consultants) is the **PTSA being signed**.

## 4. Before you start
- The lead is at the **PTSA / Plans** stage (internal key `fee_proposal`).
- The **pre-construction fee** is already set (done in the Concept stage — it shows as the read-only "PTSA fee" here).
- Migrations **190, 191 and 192** are applied (design-fee invoice keying, concept-email stamps, and the `working_drawings` document type).
- To **send** the accepted-concepts email: `CONCEPT_EMAIL_ENABLED=true` on the server (preview works without it).
- To **raise the design fee in Xero**: Xero is connected (Settings → Integrations → Xero) and `XERO_ENABLED=1` on the server.
- Dropbox is configured (so the job folder can be created when the PTSA is marked signed).

## 5. Step-by-step process
1. Open the lead at the **PTSA / Plans** stage. The focus panel shows the stage's tools top to bottom: Client email, Pre-Tender Service Agreement, Design & pre-construction fee invoice, Working drawings, Plan presentation.
   [insert screenshot: PTSA / Plans focus panel with all five cards]
2. Under **Client email**, click **Accepted-concepts acknowledgement**. Review the preview (subject defaults to "Your concept is approved — here's what happens next"), edit the copy if you like, then **Send email**. This confirms the approved concept and sets up the PTSA + working-drawings stage.
   [insert screenshot: Accepted-concepts email preview modal]
3. In the **Pre-Tender Service Agreement** card, check the **PTSA fee** matches the pre-construction fee (it is read-only here — change it in the Concept stage if wrong).
4. Open the **Services** section and tick the services included in the agreement (five are ticked by default). Open **Project scope** and fill in the scope — this text appears **verbatim in the PTSA** and is client-facing. Open **Terms** to set the validity period (default 14 days), the "Fee credited back on contract signing" toggle, and any special terms.
   [insert screenshot: PTSA Services / Project scope / Terms accordions]
5. In the **Signing** section, click **⬇ Generate PTSA Document**. A branded Word document (DOCX) downloads ready to send to the client. Set the PTSA status to **Sent to Client** (the status control at the top of the card) when you send it.
6. When the client returns the signed agreement, use **Mark PTSA as signed**: choose the client-signed PDF, optionally set the date signed, then click **✓ Mark PTSA as signed**. The Hub stores the PDF, stamps the lead **Signed**, and creates the job + Dropbox folder tree.
   [insert screenshot: Mark PTSA as signed upload control]
7. In the **Design & pre-construction fee invoice (Xero)** card, click **Create invoice in Xero**. Confirm the amount (shown ex-GST and inc-GST). This raises the design & pre-construction fee as a real Xero invoice. Use **Send to client** to email it, or **Download PDF** / **Pay link** as needed.
   [insert screenshot: Design fee Xero invoice card after creation]
8. Go to the **Documents** tab. Upload the working drawings, elevations and 3D render, choosing document type **Working drawings**. They carry to the job's PLANS folder.
9. Back in the focus panel, use **Plan presentation** to book the meeting (or copy the booking link). Present the plans, capture any layout/opening changes, and fold them into the working drawings **before** engineering.
10. When the PTSA is signed, the **Advance to Consultants** panel shows a green "PTSA signed" tick. Advance the lead to **Consultants**.

## 6. What happens next
The lead moves to the **Consultants** stage, where engineering and certification are coordinated on the now-signed design. The job created at PTSA signing carries forward with its Dropbox folder tree; the working drawings sit in the PLANS folder ready for the consultants. The design fee invoice tracks in Xero and Finance until paid.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Trying to raise the design fee before the PTSA is signed | The invoice card looks ready but is gated | Mark the PTSA signed first — the card shows the hint "Mark the PTSA as signed first" until then |
| Setting the PTSA status dropdown to "signed" | Expecting the dropdown to record signing | The dropdown only offers draft / sent / declined. Signing is done only via **Mark PTSA as signed**, which also stores the PDF and creates the job folder |
| Leaving the Project scope blank | It sits inside a collapsed accordion | Open **Project scope** and fill it — otherwise the PTSA prints placeholder text. It is client-facing and appears verbatim |
| Editing the PTSA fee here | Expecting it to be editable in this card | The fee is read-only here. Change the pre-construction fee back in the Concept stage |
| Uploading working drawings under the wrong document type | The Documents tab defaults to "Other" | Choose **Working drawings** in the type dropdown so they file to the PLANS folder |
| Marking the PTSA signed with no site address on the lead | The job needs an address to be created | Add the site address first, or add it after — the signed stamp holds but no job is created until the address is set |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| "Concept email sending is turned off" when sending the accepted-concepts email | `CONCEPT_EMAIL_ENABLED` is not `true` on the server | Turn the flag on; the **preview** works regardless |
| Design fee invoice button is disabled | PTSA not signed, or no fee set, or Xero off/not connected | Sign the PTSA, confirm the fee, and connect + enable Xero (`XERO_ENABLED=1`) |
| "Xero isn't connected / configured" hint on the invoice card | Xero not set up | Settings → Integrations → Xero, then connect |
| Clicking **Create invoice in Xero** again makes no second invoice | Correct — creation is idempotent | This is expected; the button reads "Design fee invoiced" once done |
| Orange "no job could be created" warning after signing | The lead had no site address | Add the site address; the job and folder are created when the address is present |
| Working drawings don't appear in the PLANS folder | Uploaded under the wrong type, or Dropbox not configured | Re-upload as **Working drawings**; confirm Dropbox is configured |
| "View signed PTSA PDF" link missing after signing | The short-lived signed URL hasn't resolved | Refresh the lead; the stored PDF path is on the lead record |

## 9. Related modules
- [02-16 Generate and accept the concept agreement](02-16_concept_agreement.md) — the Concept stage that precedes this one and sets the pre-construction fee.
- [02-14 Select the designer and set the fees](02-14_select_designer_and_fees.md) — where the fees this stage bills originate.
- [02-18 Pipeline meeting scheduling](02-18_pipeline_meeting_scheduling.md) — how the plan presentation (and other) meetings are booked.
- [02-02 Move a lead through the stages](02-02_move_lead_through_stages.md) — stage gates and how advancing works.
- [02-13 Test lead — walk the pipeline](02-13_test_lead_walk_the_pipeline.md) — using a test lead to exercise this stage end to end.

## 10. Screenshot placeholders
- [insert screenshot: PTSA / Plans focus panel — Client email, PTSA, Design fee, Working drawings, Plan presentation cards]
- [insert screenshot: Accepted-concepts acknowledgement email preview modal]
- [insert screenshot: Pre-Tender Service Agreement card — status, PTSA fee, Services / Scope / Terms accordions]
- [insert screenshot: Signing section — Generate PTSA Document + Mark PTSA as signed upload]
- [insert screenshot: PTSA signed confirmation with "View signed PTSA PDF" link]
- [insert screenshot: Design & pre-construction fee invoice card after creation, showing ex/inc GST]
- [insert screenshot: Documents tab upload with document type "Working drawings" selected]
- [insert screenshot: Plan presentation meeting scheduler with booking link]
- [insert screenshot: Advance to Consultants panel with green "PTSA signed" tick]

## 11. Automation notes
- **Accepted-concepts email** — `POST /api/sales/leads/:id/concept-email/send` with `which=accepted_concepts`. Sending is gated by `CONCEPT_EMAIL_ENABLED=true` (returns 503 when off; preview always works). On send it writes an outbound row to **`correspondence`** (`direction='outbound'`) and a **`lead_activities`** row (`activity_type='email'`). This email carries no forward "sent" stamp of its own.
- **Generate PTSA Document** — `POST /api/sales/leads/:id/ptsa/generate-docx`. Renders a branded DOCX and returns it for download. Download-only — it does **not** save a record.
- **Mark PTSA as signed** — `POST /api/sales/leads/:id/ptsa/mark-signed`. In order: (1) uploads the signed PDF to the `lead-documents` bucket at `leads/<id>/<YYYY-MM-DD>-<sanitised-filename>`; (2) stamps **`leads`** — `ptsa_status='signed'`, `pretender_signed_date`, `ptsa_signed_document_path`, `ptsa_signed_at`; (3) inserts a **`lead_documents`** row (`document_type='ptsa_signed'`); (4) non-fatally provisions the job (`convertLeadToJob`) and the Dropbox folder tree, and backfills the lead's documents into INTERNAL/LEAD DOCS. If the lead has no site address, the signed stamp still persists but no job is created and `provisioning.siteAddressWarning` is returned.
- **Design & pre-construction fee invoice** — `POST /api/finance/leads/:leadId/design-fee/invoice`. Gated by `XERO_ENABLED`, `ptsa_status='signed'`, and a positive `preconstruction_fee`. Creates a **`xero_invoices`** row (`invoice_type='design_package'`, `source_type='lead'`, `source_id=lead.id`, `lead_id`, `amount_ex_gst`). The invoice is posted to Xero as **AUTHORISED**, so on success the row's `status` lands at **`authorised`** (it is inserted `draft` only for the moment before the Xero post; on a Xero failure it is stamped `error`). Idempotent — the unique key `(invoice_type, source_type, source_id)` prevents a duplicate. Amount is stored **ex-GST**; Xero adds GST. The invoice PDF is best-effort filed to Dropbox.
- **Working drawings** — uploaded via the Documents tab; stored as a **`lead_documents`** row with `document_type='working_drawings'` (mig 192) and carried to the job's PLANS folder.
- **Plan presentation** — `MeetingScheduler` with `meetingType='plan_presentation'` (Cal.com). Booking records a meeting on the lead's meeting spine.
- **Advance gate** — advancing to Consultants requires `leads.ptsa_status='signed'`.

## 12. Edge cases and limits
- **Signing is one-way in the UI.** The status dropdown never offers "signed"; the only way to sign is the upload flow, which is terminal (the dropdown is replaced by a static "Signed" badge afterwards).
- **PATCH cannot set `ptsa_status='signed'`.** The blanket lead PATCH rejects it with a message pointing to the mark-signed endpoint, so the signed PDF and job folder are always created together.
- **No site address → no job (yet).** The PTSA still signs; an orange warning appears and Tender handoff stays blocked until an address is added.
- **The design fee is distinct from the concept fee.** They are separate `xero_invoices` rows keyed by `invoice_type` (`design_package` vs `concept_fee`) and never collide.
- **Fee is read-only in this stage.** Change the pre-construction fee in the Concept stage; it flows through here as the PTSA fee.
- **APB is internal only.** Nothing shown to the client says "APB" — the client-facing names are the Pre-Tender Service Agreement, the Fixed-Price Proposal, and the Blue Leaf Proposal Checklist.

## 13. Owner of the process
**Owner:** Admin / Supervisor (Sales).
**Next review date:** 2027-02-28 (6 months from last_reviewed 2026-08-29).

## 14. Troubleshoot Agent Test Script

> **Pre-test setup:** A lead at the **PTSA / Plans** stage (`stage='fee_proposal'`) with a `preconstruction_fee` set. Migrations **190, 191, 192** applied. For the email send: `CONCEPT_EMAIL_ENABLED=true`. For the Xero tests (TC-03, TC-06): Xero connected and `XERO_ENABLED=1`; if Xero is unavailable, record those as environment-gated. Dropbox configured. Sign in as a staff user. Use a **test lead** (`is_test=true`) so no real client email or job is created.

### Test cases

**TC-01 — Happy path: mark the PTSA signed**
Steps: Open the lead → Pre-Tender Service Agreement → Signing → **Mark PTSA as signed** → choose a PDF → set date signed → **✓ Mark PTSA as signed**.
Expected UI: The card flips to a green "PTSA signed on <date>" badge with a "View signed PTSA PDF" link.
Expected DB: **`leads`** row for this lead has `ptsa_status='signed'`, `pretender_signed_date=<date>`, `ptsa_signed_document_path='leads/<id>/<date>-<file>.pdf'`, `ptsa_signed_at` set; a new **`lead_documents`** row exists with `document_type='ptsa_signed'` and `storage_path` matching that path.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field: mark signed with no file**
Steps: In the Mark PTSA as signed area, do not choose a PDF and try to submit.
Expected UI: The **✓ Mark PTSA as signed** button is disabled; if forced via API (`POST /api/sales/leads/:id/ptsa/mark-signed` with no `signedPdfBase64`/`filename`), the server returns **400** ("filename is required." / "signedPdfBase64 is required.").
Expected DB: No change — `leads.ptsa_status` unchanged and no new `lead_documents` row.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission: create the design fee invoice twice**
Steps: With the PTSA signed, click **Create invoice in Xero**, then click it again.
Expected UI: First click creates the invoice ("Invoice … created in Xero"); the button then reads "Design fee invoiced" and no second invoice is made on re-click.
Expected DB: Exactly **one** **`xero_invoices`** row with `invoice_type='design_package'`, `source_type='lead'`, `source_id=<lead id>` (protected by the unique key `(invoice_type, source_type, source_id)`).
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role / not signed in**
Steps: While signed out (or with an expired session), call `POST /api/sales/leads/:id/ptsa/mark-signed`.
Expected UI: **401 Unauthorised**; the stage tools are not reachable without a staff login.
Expected DB: No change to `leads` and no new `lead_documents` row.
- [ ] Pass  [ ] Fail

**TC-05 — Feature edge: sign the PTSA with no site address**
Steps: On a lead with a blank `site_address`, mark the PTSA signed.
Expected UI: The green "PTSA signed" badge shows, plus an orange warning that no job could be created because there is no site address; Tender handoff stays blocked.
Expected DB: **`leads`** has `ptsa_status='signed'` and `ptsa_signed_document_path` set, but `leads.job_id` remains **NULL** (no `jobs` row created); the response carries `provisioning.siteAddressWarning=true`.
- [ ] Pass  [ ] Fail

**TC-06 — Feature edge: design fee gated until PTSA signed**
Steps: On a lead where `ptsa_status` is not `signed`, view the Design & pre-construction fee invoice card and attempt to create the invoice.
Expected UI: The card shows the hint "Mark the PTSA as signed first — then you can raise the design & pre-construction fee in Xero" and the create button is disabled; forcing `POST /api/finance/leads/:leadId/design-fee/invoice` returns **422** with code `GATE_BLOCKED`.
Expected DB: No **`xero_invoices`** row is created for this lead with `invoice_type='design_package'`.
- [ ] Pass  [ ] Fail

**TC-07 — Feature edge: accepted-concepts email preview vs send gate**
Steps: Click **Accepted-concepts acknowledgement** to open the preview. Then send.
Expected UI: The preview always renders (subject "Your concept is approved — here's what happens next"). If `CONCEPT_EMAIL_ENABLED` is not `true`, sending returns **503** ("Concept email sending is turned off…"); with the flag on, "Email sent." shows.
Expected DB: On a successful send, a new **`correspondence`** row with `direction='outbound'` and the email subject, plus a **`lead_activities`** row with `activity_type='email'`; on a blocked (503) send, no such rows are written.
- [ ] Pass  [ ] Fail

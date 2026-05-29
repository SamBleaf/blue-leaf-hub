---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: placeholders_only
owner: Admin
test_status: static_pass
---

# SOP 03-02: Send a Fee Proposal to a Client

**Module:** Tender Manager → Fee Proposals  
**SOP ID:** 03-02  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Supervisor (tender coordinators)

## 2. When to use it
After creating and finalising a fee proposal (SOP 03-01), when you're ready to email the PDF to the client.

## 3. What this does
Converts the finalised Google Doc (or generated DOCX) to a PDF, saves a copy to the project's Dropbox PRESALE DOCS folder, and emails it to the client from the Blue Leaf email account. Updates the proposal status to `sent`.

## 4. Before you start
- The fee proposal has been created and the wording finalised (SOP 03-01)
- You have the client's email address
- Mail integration (Gmail or SMTP) is configured

## 5. Step-by-step process

1. In the fee proposal wizard, with your finalised proposal open, click **Send PDF to client**
2. The system converts the document to a PDF (exported from Google Drive for best quality)
3. Fill in the send form:
   - **To** (required) — client's email address
   - **CC / BCC** (optional)
   - **Send me a copy** — ticks BCC to the Blue Leaf sender address
   - **Subject** — pre-filled, e.g. "Fee Proposal - [address]"
   - **Message body** — pre-filled, editable
4. Click **Send**

The PDF is emailed to the client with the proposal attached.

## 6. What happens next

- The PDF is generated and (if Dropbox configured) saved to the project's PRESALE DOCS folder
- The email is sent with the PDF attached, from the Blue Leaf account
- `fee_proposals.status` → `'sent'`, `sent_at` = now, `sent_to_email` = recipient
- A row is logged to `correspondence` (outbound) against the job
- If the job is linked to Buildexact with an estimate, the "sent" status is synced to Buildexact

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Sending before finalising the doc | Rushing | Review the Google Doc fully before converting to PDF — the PDF is what the client sees |
| Wrong client email | Typo | Double-check the To field — this is a client-facing document |
| Forgetting to copy yourself | Missed the checkbox | Tick "Send me a copy" so there's a record in your inbox |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Mail not configured" (503) | Gmail or SMTP credentials are missing — configure mail integration |
| "to and pdfBase64 required" (400) | The recipient or the converted PDF is missing — re-convert and re-enter the email |
| PDF quality looks off | Convert from the Google Drive file (driveFileId) rather than a local DOCX — Drive export matches Google Docs rendering |
| Dropbox copy not saved | Dropbox may not be configured — the email still sends; the Dropbox copy is best-effort |

## 9. Related modules
- [Create a fee proposal](tendering_fee_proposal_create.md) — SOP 03-01
- [Use the tender board](tendering_tender_board.md) — SOP 03-03

## 10. Screenshot placeholders
[insert screenshot: Send PDF to client form]
[insert screenshot: sent confirmation]

## 11. Automation notes
- Convert: `POST /api/fee-proposal/docx-to-pdf` with `{ driveFileId | docxBase64, jobAddress, quoteNumber, proposalId }` → returns `{ ok, pdfBase64, filename, dropbox_pdf_path }`
- Send: `POST /api/fee-proposal/send` with `{ to, cc?, bcc?, sendCopy?, subject?, body?, pdfBase64, proposalId?, jobId?, address?, quoteNumber? }`
- Requires `to` and `pdfBase64` (or `docxBase64`) — returns 400 otherwise
- On send: `fee_proposals.status = 'sent'`, `sent_at`, `sent_to_email` set; `correspondence` row logged; Buildexact sent-sync triggered if linked
- Sender address: `SMTP_FROM` or `GMAIL_SENDER_EMAIL`
- `sendCopy = true` BCCs the sender

## 12. Edge cases and limits
- If `proposalId` is omitted, the email still sends but no `fee_proposals` status update happens
- If `jobId` is omitted, no correspondence row is logged
- Dropbox upload is best-effort — a failure is logged but does not block the email
- Attachment is a PDF when `pdfBase64` is provided; falls back to DOCX attachment if only `docxBase64` is given

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A finalised fee proposal with a `proposalId` and `jobId`
- [ ] Mail integration configured (Gmail or SMTP)
- [ ] Test recipient = **sam@blueleafbuilding.com.au**

### Test cases

**TC-01 — Send fee proposal (happy path)**
1. Convert the proposal to PDF, then send to sam@blueleafbuilding.com.au
2. Expected: email arrives with the PDF attached, subject "Fee Proposal - [address]"
3. Expected DB: `fee_proposals.status = 'sent'`, `sent_at` set, `sent_to_email = 'sam@blueleafbuilding.com.au'`
4. Expected DB: `correspondence` row inserted (direction `outbound`, logged_by `fee-proposal-send`)
- [ ] Pass  [ ] Fail

**TC-02 — Missing recipient rejected**
1. Attempt to send with no `to` value
2. Expected: HTTP 400 `{ ok: false, error: "to and pdfBase64 required." }`
3. Expected: no email sent, no status change
- [ ] Pass  [ ] Fail

**TC-03 — Send me a copy (BCC)**
1. Send with "Send me a copy" ticked
2. Expected: the sender address receives a BCC copy
- [ ] Pass  [ ] Fail

**TC-04 — Mail not configured**
1. With mail integration disabled, attempt to send
2. Expected: HTTP 503 `{ ok: false, error: "Mail not configured." }`
- [ ] Pass  [ ] Fail

**TC-05 — DOCX to PDF conversion + Dropbox save (automation)**
1. Convert a Drive doc to PDF with `jobAddress` set
2. Expected: `{ ok: true, pdfBase64, filename, dropbox_pdf_path }`
3. Expected DB: `fee_proposals.dropbox_pdf_path` updated when `proposalId` provided and Dropbox configured
- [ ] Pass  [ ] Fail

**TC-06 — No proposalId: email sends, no status update**
1. Send with `to` and `pdfBase64` but no `proposalId`
2. Expected: email sends successfully (`{ ok: true }`)
3. Expected DB: no `fee_proposals` row updated
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Email arrives at test address with PDF attached
- [ ] Status updates to sent
- [ ] Correspondence logged
- [ ] Required-field validation works
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

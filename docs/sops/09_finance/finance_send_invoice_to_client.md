---
sop_version: 1.0
last_reviewed: 2026-08-17
app_version: main
screenshot_status: placeholders_only
owner: Finance (Admin / Director)
test_status: untested
---

# SOP: Send a Xero invoice to the client (with PDF + pay link)

**Module:** Finance / Sales (Discovery)
**SOP ID:** 09-15
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Admin (Director).

## 2. When to use it
After the concept-fee invoice is created in Xero (SOP 09-14) — to email the client the **official branded PDF** and a **pay-online link**, and file the PDF against the lead.

## 3. What this does
Fetches the invoice's official PDF (rendered by Xero's Branding Theme) and its online pay link, files the PDF to the lead's documents + Dropbox client folder, then emails it to the client from the Hub (so it carries Blue Leaf branding and is logged in the lead's correspondence). Xero stays the accounting/payment source of truth — the Hub only sends and files.

> The invoice is **emailed once** (an atomic lock prevents accidental double-sends). Payment status still updates via **Sync** (automatic webhook sync arrives in P3).

## 4. Before you start
- The concept-fee invoice exists in Xero (SOP 09-14) — `XERO_ENABLED=1`, connected.
- The lead has a valid client email.
- Migration **183** applied (for the `invoice` document type; the Dropbox/storage copy still lands without it).

## 5. Step-by-step process
1. On the Discovery lead → **Concept fee invoice (Xero)** card, find the invoice row.
2. **Download PDF** opens the official Xero PDF (to check it) · **Pay link** opens the client pay page.
3. Click **Send to client** → a **preview of the email loads** (from your editable template, autofilled with the client, invoice number, amount + pay link) → review it → **Send email**.
4. The client receives the branded PDF + pay link; the row shows **✓ Sent {date}**, and the PDF is filed to the lead's documents + the Dropbox client folder's **INVOICES** subfolder.

> Edit the email copy in **Settings → General → Invoice email** (like the qualify/discovery emails). The concept agreement is also filed to Dropbox as a **PDF** (converted from the DOCX), not the editable Word file.

[insert screenshot: invoice row — Download PDF / Pay link / Send to client]
[insert screenshot: Sent state]

## 6. What happens next
The client can pay via the Xero link. When they do, click **Sync status** (or wait for the P3 webhook) → the row moves to **Part paid** / **Paid**. The filed PDF stays in the lead's documents + Dropbox.

## 7. Common mistakes

| Mistake | Why | Avoid |
|---|---|---|
| Sending before creating the Xero invoice | Nothing to attach | Create it first (SOP 09-14). |
| Expecting a second send to re-email | The send lock blocks duplicates | It's emailed once; re-send is intentionally blocked. |
| Marking paid in the Hub | Xero is the payment truth | Let Sync reflect the real Xero status. |

## 8. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| "already been sent" (409) | The atomic send lock is set | It's already gone to the client — check your Sent mail. |
| "No valid client email" | Lead has no email | Add a client email to the lead. |
| PDF won't download | Xero fetch failed / not connected | Check Xero is connected; retry. |
| No pay link | Invoice not AUTHORISED, or link not yet issued | Sync; the pay link exists only for AUTHORISED invoices. |
| Not filed to Dropbox | No client folder / Dropbox down | The client folder is created at concept-agreement acceptance; re-accept is idempotent. |

## 9. Related modules
- [Raise the concept fee in Xero](finance_raise_concept_fee_invoice.md) · [Connect Xero](finance_connect_xero.md) · [Concept agreement](../02_sales/02-16_concept_agreement.md)

## 10. Screenshot placeholders
[insert screenshot: Send confirm] [insert screenshot: filed PDF in the lead's documents]

## 11. Automation notes
- PDF link → `GET /api/finance/xero-invoices/:id/pdf-url` (admin) — files the official PDF on demand if not yet filed (`fileXeroInvoicePdf`), returns a 1-hour signed URL from the `lead-documents` bucket.
- Preview → `POST …/send { preview:true }` assembles the email from the admin-editable template (`invoiceEmail.buildInvoiceEmail`, tokens `{{client_salutation}}`/`{{invoice_number}}`/`{{amount_inc}}`/`{{pay_link}}`/`{{user_signature}}`, HTML-escaped) **without** claiming the lock or sending — the card shows it before Send. Template stored in `user_settings/crm_invoice_email`, edited at Settings → General → Invoice email (`GET/POST /api/sales/invoice-email-template`).
- Send → `POST …/send` (admin; gated by `XERO_ENABLED`). **Atomic anti-double-send:** claims `send_source='hub_smtp', sent_at=now(), sent_to_email` with `WHERE send_source IS NULL` before any SMTP — 0 rows ⇒ 409 `ALREADY_SENT`. Then `fileXeroInvoicePdf` (upload the official PDF to `lead-documents` storage → `lead_documents` row `type='invoice'` → **file the PDF directly into `{clientFolder}/INVOICES`** via `fileInvoicePdfToClientFolder`, independent of the row/mig 183), `fetchXeroInvoicePdf`, `sendPlainMail` (template email + PDF attachment + pay link), sets Hub status `sent` (unless already part_paid/paid/void), logs `correspondence` + `lead_activities`. On an SMTP failure the send lock is released so it can be retried.
- Concept agreement filing → `backfillLeadDocsToClientFolder` now **converts any DOCX to PDF** (via Google Docs export) before uploading, so the client folder gets PDFs, not editable Word files.
- `syncXeroInvoice` preserves the `sent` marker (never downgrades sent→authorised) — it only moves off `sent` when Xero shows part_paid / paid / void.
- All filing is best-effort (fail-soft): a Dropbox/storage failure never blocks the email or the invoice.

## 12. Edge cases and limits
- Send is currently wired for **lead-scoped** invoices (concept fee); job-scoped claim/variation invoices arrive in P4.
- Re-filing (on send) dedupes the `lead_documents` row by storage path — no duplicate document rows.
- The pay link (`online_invoice_url`) refreshes on create + sync.

## 13. Owner of the process
Finance (Admin / Director). Next review: 2027-02-17

---

## 14. Troubleshoot Agent Test Script

> Requires: SOP 09-14 passing (an invoice created in the Xero **Demo Company**), `XERO_ENABLED=1`, mig 183 applied, a lead with a safe test email.

### Test cases
**TC-01 — Download PDF** Click **Download PDF** on an invoice row → the official Xero PDF opens (right branding, contact, line, GST). [ ] Pass [ ] Fail
**TC-02 — Pay link** After create/sync, **Pay link** opens the Xero online-invoice page for this invoice. [ ] Pass [ ] Fail
**TC-03 — Send** Click **Send to client** → confirm → the test email arrives with the PDF attached + a pay link; the row shows **✓ Sent**; a `correspondence` outbound row exists. [ ] Pass [ ] Fail
**TC-04 — Filed** After send (or create), the invoice PDF is in the lead's documents (`lead_documents` type `invoice`) and in the Dropbox client folder. [ ] Pass [ ] Fail
**TC-05 — Anti-double-send** Click **Send** again (or POST the send route) → 409 `ALREADY_SENT`; no second email. [ ] Pass [ ] Fail
**TC-06 — Wrong role** Non-admin token → `POST …/send` → 403. [ ] Pass [ ] Fail
**TC-07 — Sync keeps 'sent'** With the invoice `sent` and still AUTHORISED in Xero, click **Sync status** → the row stays **Sent** (not downgraded to Authorised). Then pay it in Xero + Sync → **Paid**. [ ] Pass [ ] Fail

### Post-test checklist
- [ ] All passed · [ ] No console/network errors · [ ] `xero_invoices` + `lead_documents` + Dropbox correct · [ ] Update test_status · [ ] Changelog entry

---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 09-01: Upload an Invoice

**Module:** Finance — Inbox  
**SOP ID:** 09-01  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin

## 2. When to use it
When a supplier invoice arrives and needs to be entered into the Hub for approval and payment. Invoices arrive via two paths:
- **Auto-import** — emails sent to `admin@blueleafbuilding.com.au` or `accounts@blueleafbuilding.com.au` are pulled automatically via IMAP every few minutes. PDF attachments are extracted and queued.
- **Manual upload** — drag a file into the inbox drop zone, or use the photo upload button on mobile for paper invoices photographed on site.

## 3. What this does
Places the invoice into the Finance Inbox for AI extraction. The system reads the PDF and extracts supplier name, ABN, invoice number, date, and total amount. The document then appears in the Approval Queue for review.

## 4. Before you start
- You are logged in as Admin
- The Finance module is accessible from the left sidebar
- For manual upload: the invoice PDF is saved on your device, OR you are on site with the paper invoice and a phone camera

## 5. Steps — Auto-import (no action needed)
1. Supplier emails their invoice to `admin@blueleafbuilding.com.au` or `accounts@blueleafbuilding.com.au`
2. The IMAP poller runs every few minutes and pulls the attachment
3. The document appears in **Finance → Inbox** automatically with status "extracting" briefly, then "pending_approval"
4. No further action required for upload — proceed to SOP 09-02

## 6. Steps — Manual drag-drop upload
1. Open **Finance** from the left sidebar
2. You are on the **Inbox** tab by default
3. Drag the invoice PDF from your computer onto the drop zone labelled **"Drop invoice PDFs here"**
4. The file uploads and appears in the inbox list within a few seconds
5. Status shows "extracting" momentarily while the AI reads the document
6. Once status shows "pending_approval", proceed to SOP 09-02

## 7. Steps — Mobile photo upload (paper invoice on site)
1. Open Finance → Inbox on your phone
2. Tap **"Upload photo"** (camera icon)
3. Your phone camera opens — photograph the invoice clearly, all four corners visible
4. The image uploads and AI extracts what it can from the photo
5. Because photos are lower quality than PDFs, always verify the extracted fields carefully (SOP 09-02)

## 8. What happens next
The invoice moves to the AI extraction step automatically. Continue to SOP 09-02.

## 9. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Invoice not appearing after email | IMAP poller has a few-minute delay, or the email bounced | Wait 5 minutes, then check the sender received no bounce; refresh the inbox |
| Duplicate invoice in inbox | Invoice emailed AND uploaded manually | Check the inbox for an existing entry before uploading manually |
| Photo extraction poor quality | Camera shake or poor lighting | Re-photograph in good light, hold phone steady, crop close to the document |

## 10. Troubleshooting
| Problem | Solution |
|---------|----------|
| Drop zone not accepting file | File must be PDF — JPG/PNG use the photo upload button instead |
| "Upload failed" error | Check file size (max ~20MB); try refreshing and re-uploading |
| Email not imported after 15 min | Check IMAP credentials in Railway env vars; check the inbox email account for bounce messages |

## 11. Related SOPs
- [Review AI invoice extraction](finance_review_ai_extraction.md) — next step after upload

## 12. Automation notes
- IMAP polling runs on the API server; interval is configured in `server/dev-api.mjs`
- AI extraction cascade: regex first → Claude Haiku → Claude Sonnet (escalates on failure)
- Supplier ABN match against `supplier_trade_defaults` for auto-trade tagging

## 13. Owner
Admin  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

> Run these tests after confirming the Finance module is accessible.

### Pre-test setup
- [ ] Logged in as Admin
- [ ] A test PDF invoice is available (any real or dummy PDF)
- [ ] Finance → Inbox is visible in the sidebar

### Test cases

**TC-01 — Inbox loads without error**
1. Navigate to Finance → Inbox
2. Expected: page loads, inbox tab is active, drop zone is visible
3. Expected: no JavaScript errors in browser console
- [ ] Pass  [ ] Fail

**TC-02 — Manual PDF upload succeeds**
1. Drag a PDF onto the drop zone
2. Expected: file is accepted (not rejected)
3. Expected: document appears in the inbox list within 5 seconds
4. Expected: status shows "pending_approval" or "extracting" → transitions to "pending_approval"
5. Check DB: `SELECT id, status FROM financial_documents ORDER BY created_at DESC LIMIT 1` — new row exists
- [ ] Pass  [ ] Fail

**TC-03 — Non-PDF file rejected**
1. Drag a `.txt` or `.xlsx` file onto the drop zone
2. Expected: file is rejected with an error message — not uploaded
3. Expected: no row inserted into `financial_documents`
- [ ] Pass  [ ] Fail

**TC-04 — Duplicate detection**
1. Upload the same PDF a second time
2. Expected: either a warning about a potential duplicate appears, OR the second upload succeeds (no hard block — staff must spot manually)
3. Document: whether the system warns about duplicates or relies on staff review
- [ ] Pass  [ ] Fail  [ ] N/A (no duplicate detection — note for improvement

**TC-05 — IMAP auto-import (if IMAP configured)**
1. Send a test email with a PDF attachment to `accounts@blueleafbuilding.com.au`
2. Wait up to 5 minutes
3. Expected: the PDF appears in Finance → Inbox automatically
4. Check DB: `SELECT id, original_filename, created_at FROM financial_documents ORDER BY created_at DESC LIMIT 1`
- [ ] Pass  [ ] Fail  [ ] Skip (IMAP not configured)

### Post-test checklist
- [ ] Inbox renders correctly with uploaded documents
- [ ] Status transitions from extracting → pending_approval visible
- [ ] No console errors
- [ ] Update `test_status` in frontmatter after passing

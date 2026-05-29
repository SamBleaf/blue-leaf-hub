---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: placeholders_only
owner: Admin
test_status: static_pass
---

# SOP 05-03: Issue a Purchase Order to a Trade

**Module:** Operations Manager → Project Detail → Trades  
**SOP ID:** 05-03  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Supervisor

## 2. When to use it
After a trade's quote has been accepted, to formally engage the subcontractor. The PO generates a branded PDF, emails it to the subcontractor, files a copy in Dropbox, and (if linked) syncs to Buildexact.

## 3. What this does
Creates a purchase order: allocates the next PO number, builds a Blue Leaf-branded PDF with the scope and line items, emails it to the subcontractor with the PDF attached, saves a copy to the job's Dropbox folder, and records the PO in the system.

## 4. Before you start
- The project, job address, and trade are known
- You have the subcontractor's email address
- Mail integration is configured (Gmail or SMTP)
- The PO total must be greater than zero

## 5. Step-by-step process

1. Open the project in Operations (SOP 05-02)
2. On the trade you want to engage, click **Issue PO**
3. Fill in the PO form:
   - **Trade** and **job address** (pre-filled from the project)
   - **Subcontractor email** (required) and contact name
   - **Line items** — description, quantity, unit, unit cost (or a single total)
   - **Scheduled completion** and **tentative start** label
4. Review the line items and total
5. Click **Issue PO**

The PO is numbered, the PDF is generated and emailed to the subcontractor, and a copy is filed in Dropbox.

## 6. What happens next

- A PO number is allocated: `BLB-[year]-[NNN]` (zero-padded)
- GST is added at 10%; totals computed (ex-GST, GST, inc-GST)
- A branded PO PDF is generated and saved to the job's Dropbox folder (if configured)
- A `purchase_orders` row is inserted with `status = 'issued'` and `issued_at` = now
- The PO email is sent to the subcontractor with the PDF attached (the email notes if they're a familiar trade — i.e. have prior completed/accepted POs)
- If the job is linked to Buildexact, a PO is created there too

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Zero total | No line items entered | The PO total must be > 0 — add line items or a total |
| Wrong subcontractor email | Typo | Verify the email — the PO is sent immediately on issue |
| Issuing before quote accepted | Out of order | Accept the quote in the RFQ Engine first, then issue the PO |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "projectId, jobAddress, trade, toEmail required" (400) | One of these fields is missing — complete the form |
| "PO total must be greater than zero" (400) | Add line items or a total ex-GST |
| "Mail not configured" (503) | Configure Gmail or SMTP before issuing |
| Buildexact sync skipped | The job isn't linked to Buildexact, or Buildexact isn't configured — the PO still issues locally |

## 9. Related modules
- [Open a project in operations](operations_open_project.md) — SOP 05-02
- [Accept a quote](../04_rfq_engine/04-08_accept_quote.md) — SOP 04-08
- [Link a project to Buildexact](operations_link_buildexact.md) — SOP 05-04

## 10. Screenshot placeholders
[insert screenshot: issue PO form with line items]
[insert screenshot: issued PO confirmation]

## 11. Automation notes
- API: `POST /api/po/issue` (requires auth) with `{ projectId, jobAddress, trade, toEmail, lineItems[], scheduledCompletion?, tentativeStartLabel?, contactName?, vendor{}, company{}, subcontractorId?, rfqId?, jobId?, buildexactJobId? }`
- Required: `projectId`, `jobAddress`, `trade`, `toEmail` (400 otherwise); total must be > 0 (400 otherwise)
- PO number via `alloc_po_sequence` RPC → `BLB-[year]-[NNN]`
- GST hardcoded at 10% in this route (`subtotal * 0.1`)
- Inserts `purchase_orders` row: `status = 'issued'`, `issued_at`, totals, `dropbox_pdf_path`
- Emails PO PDF via `sendPlainMail`; "familiar" flag set if subcontractor has prior complete/accepted POs on other projects
- Buildexact: `createPurchaseOrder()` if `buildexactJobId` set and Buildexact configured

## 12. Edge cases and limits
- If no `lineItems`, a single line item is created from the trade + total
- Dropbox filing is best-effort — failure does not block issuing
- Buildexact sync failure is logged but does not block the local PO
- "Familiar trade" only considers POs with status `complete` or `accepted` on *other* projects

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in
- [ ] A project with an accepted trade
- [ ] Mail configured; test recipient = **sam@blueleafbuilding.com.au**

### Test cases

**TC-01 — Issue a PO (happy path)**
1. Issue a PO for a trade to sam@blueleafbuilding.com.au with one line item (total > 0)
2. Expected: `{ ok: true }` with a PO number `BLB-[year]-NNN`
3. Expected: PO email arrives at sam@blueleafbuilding.com.au with the PDF attached
4. Expected DB: `purchase_orders` row with `status = 'issued'`, `issued_at` set, correct totals
- [ ] Pass  [ ] Fail

**TC-02 — Missing required field**
1. Attempt to issue with no `toEmail`
2. Expected: HTTP 400 "projectId, jobAddress, trade, toEmail required."
- [ ] Pass  [ ] Fail

**TC-03 — Zero total rejected**
1. Issue with no line items and no total
2. Expected: HTTP 400 "PO total must be greater than zero."
- [ ] Pass  [ ] Fail

**TC-04 — GST calculation**
1. Issue a PO with subtotal $10,000
2. Expected: GST = $1,000, inc-GST = $11,000 on the PDF and DB row
- [ ] Pass  [ ] Fail

**TC-05 — PO number sequence**
1. Issue two POs in a row
2. Expected: sequential PO numbers (e.g. BLB-2026-005 then BLB-2026-006)
- [ ] Pass  [ ] Fail

**TC-06 — Mail not configured**
1. With mail disabled, attempt to issue
2. Expected: HTTP 503 "Mail not configured."
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] PO issues, numbers correctly, emails the subcontractor
- [ ] Required fields enforced
- [ ] Zero total rejected
- [ ] GST computed at 10%
- [ ] purchase_orders row created with status issued
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md

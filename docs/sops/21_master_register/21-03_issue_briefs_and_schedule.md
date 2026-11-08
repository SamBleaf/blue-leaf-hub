---
sop_version: 1.0
last_reviewed: 2026-11-07
app_version: master-register-r02 (R03, not deployed)
screenshot_status: placeholders_only
owner: Director / Project manager
test_status: untested
---

# SOP: Issue the client brief, architect brief and selections schedule — and record received documents

**Module:** Sales → Lead → Project brief & register → Documents
**SOP ID:** 21-03
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Director, project manager, office staff preparing documents for the client, the architect or consultants.

## 2. When to use it
- After a concept meeting: issue the **Preliminary Client Project Brief** (D1) so the client can confirm what was heard.
- Before design work: issue the **Architect Design Brief** (D2).
- From PTSA onwards: issue the **Selections & Finishes Schedule** (D3), and re-issue it when it changes.
- When an architect, engineer or supplier sends a document (drawings, schedules, quotes): record it under **Received consultant & supplier documents**.

## 3. What this does
It makes each document from the same register rows — nothing is retyped. Before a document is issued the Hub checks it (drawing basis named, recipient named, approvals evidenced, verified items referenced, **no dollar figures**). Each issue is a permanent, numbered revision (P01, P02 …) with a PDF, a controlled Word copy and a checksum. A new issue supersedes the old one; old revisions are never deleted. Nothing is emailed — you send the PDF yourself.

## 4. Before you start
- The register has the content you want to issue (see 21-01 and 21-02).
- **Current drawing set / revision (P-002)** is filled in on the Project step.
- Database migration 213 is applied (otherwise you can preview but not issue — the screen says so).

## 5. Step-by-step process

1. Open the lead → **Project brief & register** → **Documents**.
2. Find the document: **Preliminary Client Project Brief**, **Architect Design Brief** or **Selections & Finishes Schedule**.
3. Click **Preview draft**. Read the PDF in the preview. Any warnings are listed above it.
4. Fix anything the checks list (in the register), then **Preview draft** again.
5. Fill **Issue to (name)** (and the email if you want it on the record — **nothing is sent**).
6. Click **Issue revision P01** (or the next number). If a check fails, the issue stops and the reasons are listed — nothing is created.
7. The history row shows **Current**, the date, the recipient and the **Checksum**. Use **PDF** to download and send it yourself; **DOCX** is the controlled editable export.
8. **Coordination packs:** under **Coordination requests (draft packs from the same register)** click a pack — Architect, Routleys (plumbing fixtures), TLI (lighting & electrical), Window supplier, Engineer, Energy assessor, Joiner — to get a draft list of only the items tagged for them.
9. **Received documents:** click **Add received document**:
   1. Choose **Record type** (Consultant document or Supplier schedule / quote), **Discipline**, **Issuer**, **Document no.**, **Revision**, **Received** date, and attach the **File (PDF)**.
   2. Click **Review & link**. Write **Review notes (what changed, what was accepted / rejected)**.
   3. On each register item it affects, click **Set as source**, or **Mark verified by this document** for a technical check it confirms.
   4. Set the document's status: **Received → Under review → Reconciled** (or **Superseded** when a newer revision arrives).

> 💡 **Tip:** Received documents never change the register by themselves. You decide what each one changes — that is the reconciliation.

[insert screenshot: Documents step with three documents and Preview draft]
[insert screenshot: issue history showing P01 Superseded and P02 Current]
[insert screenshot: received document under review with Set as source]

## 6. What happens next
- The issued PDF and DOCX are stored in the `lead-documents` bucket under `leads/<lead id>/register/<type>/` and listed in the lead's documents. They cannot be deleted from the lead Documents tab.
- A `job_events` row `register.document.issued` records who issued what (once a job exists).
- The previous revision is marked **Superseded** in the same step.
- Items you mark verified by a document carry that document number as their technical reference.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Issuing before naming the drawing set | Field left blank on the Project step | Fill P-002 first — the issue is blocked without it |
| Expecting the Hub to email the PDF | Email field on the form | The email is a record only; send the PDF yourself |
| Typing an allowance amount into a description | Habit | Register documents never show prices; the issue is blocked |
| Editing the Word copy and treating it as the record | DOCX is editable | The issued PDF + checksum is the record; re-issue from the register to change it |
| Marking an item verified from an email | No document recorded | Add the received document first, then **Mark verified by this document** |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Record the current drawing set / revision (Project step) before issuing." | P-002 blank | Fill it on the Project step |
| "Enter who the document is being issued to." | Recipient blank | Fill **Issue to (name)** |
| "… marked client-approved without evidence …" | Old approvals without who/when/how | Record the approval evidence or step them back to Proposed |
| "The document would contain a dollar figure …" | A $ amount in a description, note or pricing link | Remove the amount; keep pricing as a link |
| "There are no client selections to schedule yet." | Only scope/requirements recorded | Record selections first |
| "Document issuing needs migration 213 — drafts still preview." | Database not updated | Ask the director; the migration needs approval to apply |
| "No register items are tagged for … yet." | No items with that supplier/discipline | Tag items (supplier or category) in the register |
| Someone else issued at the same moment | Two people clicked Issue | One issue wins; the other is retried with the next number automatically |

## 9. Related modules
- [21-02 Review the register](21-02_register_review_approvals_portal.md)
- [21-04 Tender, contract baseline and handover](21-04_tender_baseline_handover.md)
- [02 Sales — lead documents](../02_sales/)

## 10. Screenshot placeholders
[insert screenshot: pre-issue checks blocking an issue]
[insert screenshot: Routleys coordination pack]

## 11. Automation notes
- Preview: `POST /api/register/leads/:leadId/documents/:docType/preview` (renders the same docx templates as the doc engine, converts to PDF with LibreOffice; nothing stored).
- Issue: `POST /api/register/leads/:leadId/documents/:docType/issue` → uploads PDF + DOCX (never overwrites), SHA-256 checksum, `register_issue_document` RPC (one current issue per type, version numbers unique, advisory lock). A database trigger blocks deleting or editing issued rows.
- Received documents: `POST /sources`, `PATCH /sources/:docId` → `lead_documents` with `document_type` consultant_document / supplier_document.
- No email is sent and no portal invitation is created by anything in this SOP.

## 12. Edge cases and limits
- Two people issuing the same document at once: the advisory lock serialises them; the second gets the next revision number.
- Internal financials (estimate lines, allowances, margins) never reach any document — pricing appears only as "allowance / quoted" status words.
- Excluded, By others and Deferred items appear in the client brief's scope boundary, not in the selections schedule.
- The DOCX is for controlled edits by Blue Leaf only; the PDF is what is issued.

## 13. Owner of the process
Director / Project manager
Next review date: 2027-05-07

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run against the local register sandbox, never production.

### Pre-test setup
- [ ] Sandbox running (LibreOffice installed for PDF rendering); signed in as sandbox staff
- [ ] A lead with a drawing basis, at least 4 selections (one Routleys-tagged) and some scope items

### Test cases

**TC-01 — Happy path (standard use)**
1. Documents → Preliminary Client Project Brief → **Preview draft** → fill **Issue to (name)** → **Issue revision P01**.
2. Expected result: history shows P01 **Current** with checksum, PDF and DOCX links; the PDF opens.
3. Expected DB record: `lead_documents` row `document_type = 'client_brief'`, `version = 1`, `revision_label = 'P01'`, `status = 'current'`, `issued_at` and `content_sha256` set.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. Clear **Issue to (name)** and click Issue.
2. Expected result: "Enter who the document is being issued to."; 422; nothing stored.
3. Expected DB: no new `lead_documents` row; no new storage object.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission**
1. Issue the Selections schedule, then issue it again.
2. Expected result: P01 becomes **Superseded**, P02 is **Current**; two rows, one current.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. As a portal client JWT call `POST /api/register/leads/:id/documents/client_brief/issue`, and try `DELETE /api/sales/leads/:id/documents/:issuedDocId` as staff.
2. Expected result: 403 for the client; 409 `ISSUED_IMMUTABLE` for the staff delete, and the file still exists in storage.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification**
1. After TC-01 (with a job), check `job_events` for `register.document.issued`.
2. Check: the PDF text contains no `$` figure and no `{placeholder}` text.
3. Check: no email was sent (mail log empty for the run).
- [ ] Pass  [ ] Fail

**TC-06 — Money guard**
1. Put "$4,500 allowance" in a selection description, preview and issue the schedule.
2. Expected: preview warns; issue is blocked with the dollar-figure message.
- [ ] Pass  [ ] Fail

**TC-07 — Received document reconciliation**
1. Add a received engineer document (Rev B), **Review & link**, **Mark verified by this document** on a structural action, set **Reconciled**.
2. Expected: the action shows "Tech: verified" with the document number as its reference; the document's status is Reconciled.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

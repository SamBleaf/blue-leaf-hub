---
sop_version: 1.3
last_reviewed: 2026-11-16
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
   - **Check wording (optional):** click **Check wording** under the preview. Blueprint reads the draft's words for spelling, grammar and wording a client would stumble on. Its suggestions are listed under the preview, numbered, and each one is highlighted in yellow with its number on a **Highlighted copy** of the draft (switch back with **Clean draft**). Nothing is changed for you: fix the wording in the register (or tell the office if it is fixed template wording), then **Preview draft** again. It reads every word the document prints, including the template's fixed wording and the page header and footer. A suggestion that says "(not marked on the page)" runs across two pieces of text, sits in the header or footer, or its words print in more than one place (so it can't say which), so it is only listed. The check doesn't stop or change an issue, and the issued document is never marked.
5. Fill **Issue to (name)** (and the email if you want it on the record — **nothing is sent**).
6. Click **Issue revision P01** (or the next number). If a check fails, the issue stops and the reasons are listed — nothing is created.
7. The history row shows **Current**, the date, the recipient and the **Checksum**. The card's summary line reads **Recorded: P01 (current) · date · for [name] · not emailed** — an issue is a record, not a delivery. Use **PDF** to download and send it yourself; **DOCX** is the controlled editable export.
   - **Selections & Finishes Schedule, Client presentation:** an item with nothing chosen yet says **Still to be decided** once, with the item as its heading, instead of repeating "TBC". The **Technical register** layout keeps TBC for the trade.
   - **Architect Design Brief:** a client-approved requirement that still needs a technical check is listed under Confirmed project requirements with **(technical check pending)** after it.
   - Every document's footer reads **PAGE 1 / 2** in the same small grey type as the label.
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

### Tender Scope & Pricing Notes (internal)

1. Open **Documents**. The card is marked **Internal only**.
2. Tap **Preview**. The recipient is already set to Blue Leaf estimating.
3. Read it against the drawings. It lists included work, existing works, excluded work, work by others, systems and materials, finishes, site facts, risks, undecided items, technical questions, Blue Leaf pricing assumptions and drawing references. Each register line carries its item ID.
4. Tap **Issue**. It is stored as P01 and is never overwritten. Issue it again and it becomes P02, and P01 stays on file.
5. Use it to price in Buildxact. Don't send it to the client, a consultant or a trade. It has no amounts and no quantities, because Buildxact holds the numbers.

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
| "The register changed since this preview. Preview the draft again, then check the wording." | The register was edited after the preview | **Preview draft**, then **Check wording** |
| "The AI model isn't available to this API key …" or "… rate limit …" | Blueprint can't reach its model right now | Try again in a minute; admin: see SOP 02-05 §8 (`/api/blueprint/health`) |
| A wording suggestion is wrong (for example it flags Australian spelling or a product name) | The check is a proofreader, not the record | Ignore it. Nothing changes unless you change the register |

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

**TC-08 — Card answers print**
1. Answer W-013 twice (main walls and a feature), W-014 with gutters, W-001 and a W-004 row. Preview each of the three existing documents.
2. Expected: the chosen words appear. Two wall systems are two lines. Gutters say which roof. Project defaults and room exceptions are labelled. Steep access doesn't appear as Included work.
3. Expected: no Blue Leaf assumption, staff note or review suggestion appears in any of the three.
- [ ] Pass  [ ] Fail

**TC-09 — Tender Scope & Pricing Notes**
1. Preview. Expected: marked internal, no dollar sign, no quantity, pricing assumptions labelled, and draft wording says so.
2. Issue. Expected: P01, audience internal. Change an item and issue again. Expected: P02 current, P01 superseded and still opens, and its hash is unchanged.
3. Reject paths. No recipient: blocked. A dollar figure in a description: blocked. Changing the register after the preview: refused as stale. A client login: no document list and no row.
- [ ] Pass  [ ] Fail

**TC-10 — Tab 26 R05 retest follow-ups**
1. Issue any document. Expected: the card reads **Recorded: P0n (current) · date · for [name] · not emailed**, not "Issued … to".
2. Preview the Selections & Finishes Schedule as **Client presentation** with one item that has nothing chosen. Expected: that item says **Still to be decided** once, with no "TBC" anywhere and no stray "/" where there's no supplier; the reading key explains the label. Switch to **Technical register**: TBC is still used.
3. Mark a requirement client-approved (with evidence) while its technical status is **Needs verification**, then preview the Architect Design Brief. Expected: it reads "… (technical check pending)" under Confirmed project requirements.
4. Look at any two-page preview's footer. Expected: **PAGE 1 / 2** with the numbers the same size and grey as the word PAGE.
- [ ] Pass  [ ] Fail

**TC-11a — Check wording (Blueprint proofread)**
1. Preview a Client Project Brief. Click **Check wording**.
2. Expected: the button reads "Checking the wording…", then a list headed "Blueprint's wording check: N suggestions" (or "found nothing to fix") with the note "Suggestions only — nothing has been changed".
3. Expected (if there are suggestions): the preview switches to **Highlighted copy** with each suggestion's words highlighted and its number in red after them; **Clean draft** shows the original draft.
4. Add a typo to a scope line in the register (for example "teh kitchen"), save, **Preview draft**, **Check wording**. Expected: a spelling suggestion for it, highlighted on the page.
5. Edit the register again without previewing, then click **Check wording**. Expected: "The register changed since this preview…"; nothing else happens.
6. Issue the document. Expected: the issued PDF has no highlights; `ai_call_log` has a `documentProofread` row with the model and cost (about a tenth of a cent on Haiku 5.5).
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

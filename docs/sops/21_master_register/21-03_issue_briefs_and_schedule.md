---
sop_version: 1.3
last_reviewed: 2026-11-15
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
- From the Consultants stage onwards: issue the **Technical Selections Schedule** to the design team, estimator, suppliers and trades, and the **Client Selections Presentation** to the client. They are two documents made from the same register records, each with its own revisions. Re-issue either when it changes.
- When an architect, engineer or supplier sends a document (drawings, schedules, quotes): record it under **Received consultant & supplier documents**.

## 3. What this does
It makes each document from the same register rows — nothing is retyped. Before a document is issued the Hub checks it (drawing basis named, recipient named, approvals evidenced, verified items referenced, **no dollar figures**, **no prohibited product such as engineered stone**, and the PDF printed in the Blue Leaf font). Each issue is a permanent, numbered revision (R01, R02 …) with a PDF, a controlled Word copy and a checksum. Every page carries the document number, for example **BLB-CPB-0417-R01** (Blue Leaf · document type · project reference · revision). A draft preview shows **Draft — not issued** and no revision number. Documents issued before 15 November 2026 keep their original labels (P01, P02). A new issue supersedes the old one; old revisions are never deleted. Nothing is emailed — you send the PDF yourself.

## 4. Before you start
- The register has the content you want to issue (see 21-01 and 21-02).
- **Current drawing set / revision (P-002)** is filled in on the Project step.
- Database migration 213 is applied (otherwise you can preview but not issue — the screen says so). Issuing the Client Selections Presentation also needs migration 220.

## 5. Step-by-step process

1. Open the lead → **Project brief & register** → **Documents**.
2. Find the document: **Preliminary Client Project Brief**, **Architect Design Brief**, **Technical Selections Schedule** or **Client Selections Presentation**.
3. Click **Preview draft**. Read the PDF in the preview. Any warnings are listed above it.
4. Fix anything the checks list (in the register), then **Preview draft** again.
5. Fill **Issue to (name)** (and the email if you want it on the record — **nothing is sent**).
6. Click **Issue revision R01** (or the next number). If a check fails, the issue stops and the reasons are listed — nothing is created.
7. The history row shows **Current**, the date, the recipient and the **Checksum**. The card's summary line reads **Recorded: R01 (current) · date · for [name] · not emailed** — an issue is a record, not a delivery. Use **PDF** to download and send it yourself; **DOCX** is the controlled editable export.
   - **Technical Selections Schedule** (A4 landscape): the selections grouped by trade (roof and walls, windows and doors, internal finishes, joinery, plumbing fixtures, lighting, services, external works). Each row shows the product, its maker, supplier and code, the finish, a quantity only where one is recorded, the status, and a source key (S1, S2 …) listed under **Source documents** at the end. It also lists the requirements the selections must meet and every open action, with who. Page 1 says what each status means and how many selections are known, provisional and unresolved.
   - **Client Selections Presentation** (A4 portrait): what we need from the client first, then their selections room by room. No references, codes, suppliers' document numbers, technical states, quantities or prices. A preference shows the client's own words; a product shows only once it's proposed to them or chosen. An item with nothing chosen says **To be decided**, the same as in the technical schedule.
   - **Client label and client description** (register office fields): what the client reads, for example "Kitchen mixer" and "Luxe pull-down sink mixer". Fill them in for every supplier product before issuing the presentation, especially where the supplier's line is technical or two items share a question (sink and mixer). The supplier's own wording stays in Product for the technical schedule.
   - A product from a supplier document still **Received** or **Under review** isn't put to the client: it prints **Being confirmed** until you reconcile the document. A proposal with nothing a client can read prints **To be decided**, and the checks list it.
   - Both: a record that cites a **superseded** received document, or one no longer on file, stops the issue until you link it to the current document. A record **verified** against a document nobody has reviewed also stops it. An approval recorded only on the portal board, with no who, when or how, stops it and prints as Proposed.
   - **Architect Design Brief:** a client-approved requirement that still needs a technical check is listed under **What the design must achieve**, marked Client-approved, with **(technical check pending: [who confirms it])** after it — the owner on the record, or "owner to be agreed".
   - Every document's footer reads **PAGE 1 / 2** in the same small grey type as the label.
8. **Coordination packs:** under **Coordination requests (draft packs from the same register)** click a pack — Architect, Routleys (plumbing fixtures), TLI (lighting & electrical), Window supplier, Engineer, Energy assessor, Joiner — to get a draft Technical Selections Schedule of only their items: those tagged for them, those citing a document from their discipline, and their requirements and actions. The pack names who it is for. It runs the same checks as an issue, so a superseded source, a price or a prohibited product stops it.
9. **Received documents:** click **Add received document**:
   1. Choose **Record type** (Consultant document or Supplier schedule / quote), **Discipline**, **Issuer**, **Document no.**, **Revision**, **Received** date, and attach the **File (PDF)**.
   2. Click **Review & link**. Write **Review notes (what changed, what was accepted / rejected)**.
   3. On each register item it affects, click **Set as source**. For a technical check a **consultant's** document confirms, mark the document **Reconciled** first, then click **Mark verified by this document**. A supplier's selection or quote is never technical verification, so it only offers **Set as source**.
   4. Enter each product the client chooses as its own record, with its own code and quantity (three tapware products are three records). Accessories that come with it (wastes, grates, isolation stops, flush plates, towel rails) stay in the supplier's document, which the record cites.
   5. Set the document's status: **Received → Under review → Reconciled** (or **Superseded** when a newer revision arrives). Records citing a superseded document must be relinked before the next issue.

> 💡 **Tip:** Received documents never change the register by themselves. You decide what each one changes — that is the reconciliation.

[insert screenshot: Documents step with three documents and Preview draft]
[insert screenshot: issue history showing R01 Superseded and R02 Current]
[insert screenshot: received document under review with Set as source]

### What the Client Project Brief contains (design cpb-2.4, from 16 Nov 2026)

The brief reads in this order and leaves out any section with nothing in it: **The project** (your Sales description, the client's top three priorities and their own note, the client vision as the design direction) → **Scope of works** (what we propose to build, then, under a heading that names only the lists shown: what stays, what's outside the scope, by others, items the client supplies, still to be decided, and what still needs checking, with who confirms) → **Design direction** (preferences grouped by category, every row naming its room, each status in words, with a key under the last group explaining the statuses used) → **Assumptions** → **Decisions to make** (only real actions, 3–7, client's first; an unassigned one reads "To be agreed") → **What happens next** (follows the pathway: the PTSA is only explained before it is signed, never on a plans-supplied or architect-tender lead).

### What the Architect Design Brief contains (design adb-1.0, from 16 Nov 2026)

It goes to the architect and the design team, and reads coordination first. It leaves out any section with nothing in it:
1. **The project and its design basis.** The Sales description, and the drawings and documents on file. A superseded document isn't listed, and the drawing basis is on the cover.
2. **What we need from the design team.** Each open next action, or technical check, whose Who is Architect / designer, Engineer / consultant or Trade. It names the firm from the Consultants step (for example "Ellison Architecture"), or the discipline if none is recorded ("Engineer").
3. **Decisions that affect the drawings.** Open next actions for the client or Blue Leaf. An action with no Who reads "To be agreed": it is never handed to the architect.
4. **What the design must achieve.** The client's priorities in their own words, then the requirements. Only Client-approved (with evidence) and For consultant review are labelled.
5. **Scope and boundaries.** The work, then what stays, what's out, by others, what the client supplies, what's still to be decided, and the site and household facts. "To verify" marks an open technical check.
6. **Design direction by location.** What applies throughout the house is listed once. Each room then lists its own choices. A room's choice says what it replaces only when the house default really applies to that room (for example a bedroom only reads a bedroom-floor default). Rooms with identical choices share one group. Proposed and Client-approved are marked; preferred is the unmarked norm.

> 💡 **Tip:** Give a house-wide floor default its zone (Main floor, Bedroom floor, Wet-area floor). Then each room reads the right one, and a bedroom's carpet isn't shown as replacing the living-area timber.

> 💡 **Tip:** To put a request to the architect, engineer or energy assessor, give the record a next action and set **Who** to Architect / designer or Engineer / consultant. Record the firm on the Consultants step so the brief names it.

> 💡 **Tip:** If a decision you expected is missing, give it a next action in the register. A preference on its own is direction, not a decision.

> 💡 **Tip:** A room that is simply new, such as "New study as shown on the concept plans" or just "New" on the card, prints once with the other rooms of its kind ("New main bedroom, bedrooms 2 to 4, walk-in robe and study"). If the project description line is simply "New … home with …" and lists the room ("New two-storey home with a double garage on a sloping block"), the room isn't listed again. Anything else in that line (a note in brackets, "excluded", "stage 2", "New roof over the house with …") leaves the room's own line in place. The same goes for rooms marked Renovate, Refurbish or Alter: each keeps its own word, and they're never merged. For a room with particular work, write what happens there ("New ensuite with a walk-in shower and a freestanding bath"); it keeps its own line. A record whose words don't match its status (for example "Full renovation" on a room marked New) also prints exactly as typed, so check the status if it looks odd.

> ℹ️ **Note:** The brief prints the drawing basis exactly as recorded on the Project step. When the client's plans change (for example, they supply their own set), update the drawing basis before you issue the next revision. The earlier revision keeps the set it was issued against.

> ⚠️ **Engineered stone:** Engineered stone is prohibited in Australia from 1 July 2024.
>
> **What stops an issue.** Anything the brief would print that names engineered stone, whatever the wording: a scope line, an item kept, a requirement (even "No engineered stone"), a decision or the client's priority note. For stone that is already there, write the line without the material, for example "Remove the existing kitchen benchtops", mark the record Retain, Remove, Make good or Alter, and put "Engineered stone" in its **Product** field: the brief doesn't print it, the register keeps it, and the WHS warning still shows. Record existing stone on a scope line, not a selection, because the selections schedule prints Product. A selection that names engineered stone also stops it in its description, product, colour, supplier, source or chosen option, or the "Engineered stone" card is chosen. Then the brief, the architect brief and the schedule won't issue. Shorthand counts too ("eng. stone", "E-stone", "quartz benchtop", or just "Quartz" on a benchtop, splashback, vanity or laundry bench). The check doesn't read around the words: "Porcelain instead of engineered stone" on a selection still stops the issue.
>
> **What to do.** Agree a compliant alternative with the client if needed (porcelain, sintered stone, natural stone). Then reword the selection to name only what will be supplied, for example "Porcelain benchtop, 20 mm". The register keeps the original wording in its history.
>
> **What only warns.** These are recorded but don't stop the issue:
> - existing stone recorded in the Product field of a record marked Retain, Remove, Make good or Alter. The warning is not WHS clearance: if it is stone already installed, removing, repairing, making a minor modification to, or disposing of it is controlled work, and SafeWork SA must be notified before it starts. Plan it through the job's WHS process
> - the client's own note (unless the brief prints it)
> - a brand name such as Caesarstone (check it's a compliant range)
> - the internal Tender Notes
>
> Each message names the record and its room.
>
> ⚠️ **Font warnings:** "Some characters printed in a fallback font" or "may not print in the Blue Leaf font" means a symbol or a character from another language is in a name or description. Check the preview and retype it in plain text. If the issue is refused with "the server needs the Lato font installed", tell the office: the server is missing the Blue Leaf font.

### Tender Scope & Pricing Notes (internal)

1. Open **Documents**. The card is marked **Internal only**.
2. Tap **Preview**. The recipient is already set to Blue Leaf estimating.
3. Read it against the drawings. It lists included work, existing works, excluded work, work by others, systems and materials, finishes, site facts, risks, undecided items, technical questions, Blue Leaf pricing assumptions and drawing references. Each register line carries its item ID.
4. Tap **Issue**. It is stored as R01 and is never overwritten. Issue it again and it becomes R02, and R01 stays on file.
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
1. Documents → Preliminary Client Project Brief → **Preview draft** → fill **Issue to (name)** → **Issue revision R01**.
2. Expected result: history shows R01 **Current** with checksum, PDF and DOCX links; the PDF opens.
3. Expected DB record: `lead_documents` row `document_type = 'client_brief'`, `version = 1`, `revision_label = 'R01'`, `status = 'current'`, `issued_at` and `content_sha256` set.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. Clear **Issue to (name)** and click Issue.
2. Expected result: "Enter who the document is being issued to."; 422; nothing stored.
3. Expected DB: no new `lead_documents` row; no new storage object.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission**
1. Issue the Selections schedule, then issue it again.
2. Expected result: R01 becomes **Superseded**, R02 is **Current**; two rows, one current.
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
2. Issue. Expected: R01, audience internal. Change an item and issue again. Expected: R02 current, R01 superseded and still opens, and its hash is unchanged.
3. Reject paths. No recipient: blocked. A dollar figure in a description: blocked. Changing the register after the preview: refused as stale. A client login: no document list and no row.
- [ ] Pass  [ ] Fail

**TC-10 — Tab 26 R05 retest follow-ups**
1. Issue any document. Expected: the card reads **Recorded: R0n (current) · date · for [name] · not emailed**, not "Issued … to".
2. Preview the **Client Selections Presentation** with one item that has nothing chosen. Expected: that item says **To be decided** once, with no "TBC" anywhere, and the reading note explains the label. Preview the **Technical Selections Schedule**: the same item says **To be decided** (pair 2: one label in both documents).
3. Mark a requirement client-approved (with evidence) while its technical status is **Needs verification**, then preview the Architect Design Brief. Expected: under What the design must achieve it reads "… (technical check pending: [the record's owner])", with the status Client-approved.
4. Look at any two-page preview's footer. Expected: **PAGE 1 / 2** with the numbers the same size and grey as the word PAGE.
- [ ] Pass  [ ] Fail

**TC-11 — Client Project Brief design and identity (doc suite R01)**
1. Preview the Client Project Brief on a lead with scope, preferences and decisions. Expected: every page has the logo, "Client Project Brief" and the address at the top, and "BLB-CPB-[ref] · Draft — not issued" and "Page X of Y" at the bottom; no revision number on a draft.
2. Issue it. Expected: the PDF reads **BLB-CPB-[ref]-R0n · Issued [date]** on every page, the date being today's date in Adelaide (also before 10:30 am); `lead_documents.revision_label` is `R0n`. On R02 or later, the box on page 1 starts "This revision replaces R0[n-1], issued [that revision's date]."; R01 and a draft don't have that line.
3. Expected content: no register codes in the scope or boundary lists (they stay in the decisions table only); no recorded preference listed as a decision; no decision owner invented ("To be agreed"); preferences grouped by category under a header row "WHERE · [CATEGORY] · STATUS", every row naming its room (bold at the start of each room, grey after); a status key under the last group that explains each status shown, including Requirement; a long table repeats its header and never leaves a single row on a page; the closing note never sits on a page by itself; an empty section (e.g. no decisions) is left out and the numbers close up.
4. On a plans-supplied lead, and on a build-only lead with no plans: no PTSA and no Concept or agreement step. The plans-supplied brief says "You've supplied plans for this project. We'll confirm the consultant information and any remaining details required before pricing." The build-only brief says it is "proceeding on a build-only pathway" and that drawings or approvals needed are confirmed before the price; on a small job with no recorded site or structural check it names no consultant disciplines. The label at the top of page 1 reads "Preliminary / Plans review" (plans supplied) or "Preliminary / Scope review" (build only), never a word about pricing.
5. Add a selection "Engineered stone benchtop" and try to issue. Expected: refused, with the reason; the Tender Notes still issue with a warning.
6. Change it to "Porcelain instead of engineered stone". Expected: still refused (a selection names only what is supplied). Change it to "Porcelain benchtop, 20 mm". Expected: issues. Add a scope line "Existing vanity top" with disposition **Retain** and Product "Engineered stone". Expected: issues, with a warning that says it is not WHS clearance and that SafeWork SA must be notified before installed stone is removed, repaired, modified or disposed of. Change its description to "Existing engineered stone vanity top", or add a requirement "No engineered stone in the kitchen", or a scope line "New engineered stone island benchtop". Expected: each is refused, naming the line.
7. On a new home whose rooms each say only "New [room] as shown on the concept plans": the scope prints one line per group of rooms, with every room named and no category label. Where the project description line already names a room (a double garage), there is no separate "New garage" line. Mark one room Alter with the description "Full renovation". Expected: it keeps its own line. Make the scope list long enough to run onto a second page. Expected: that page opens with "What we propose to build" again. A boundary list that runs onto a new page opens it with its label. Add enough selections to the ensuite, bathroom and laundry that the bathrooms group runs onto a new page. Expected: that page opens with "WHERE · BATHROOMS AND LAUNDRY · STATUS", and its first row names its room.
8. Record site access as Steep and Narrow or restricted. Expected: "Site access is steep, with narrow or restricted areas." Add Crane or plant access. Expected: "Crane or plant access will need to be planned for." Mark the answer Client unsure. Expected: "Site access: still to be confirmed (noted so far: …)". Issue R01, change the drawing basis on the Project step, issue R02. Expected: R02 prints the new set; R01 still opens with the old one.
- [ ] Pass  [ ] Fail

**TC-12 — Architect Design Brief (adb-1.0)**
1. On a lead at Consultants with an architect, an engineer and an energy assessor on the Consultants step, preview the Architect Design Brief.
2. Expected: the cover reads **Prepared for** the architect (name, firm) and shows the client, drawing basis, document number BLB-ADB-[ref] and status. Every page has the header ARCHITECT DESIGN BRIEF with the address, and the footer with the identity and Page X of Y.
3. Give a record a next action with Who = Architect / designer. Expected: it appears under **What we need from the design team** with the architect's firm. Give one Who = Client. Expected: it appears under **Decisions that affect the drawings** as Client. Leave Who blank. Expected: "To be agreed", under decisions.
4. Expected: "Whole house" and "(project default)" appear nowhere. House-wide choices are listed once under **Throughout the house**. Zone a floor default to Main floor and give a bedroom its own carpet linked to it. Expected: the bedroom reads just "Wool carpet". Zone the default to Bedroom floor. Expected: "Wool carpet, instead of the …".
5. Give two rooms the same choices. Expected: one group names both rooms ("Ensuite and bathroom") and lists both references on each row.
6. Expected: nothing reads Preferred. Only Proposed and Client-approved are marked in the design direction.
- [ ] Pass  [ ] Fail

**TC-13 — Technical Selections Schedule and Client Selections Presentation (tss-1.0, csp-1.0)**
1. On a lead at Consultants with client selections, add a received **Supplier schedule / quote** (Discipline Routleys), then **Set as source** on two selections and enter their product, maker, code and quantity.
2. Preview the **Technical Selections Schedule**. Expected: A4 landscape; header TECHNICAL SELECTIONS SCHEDULE on every page; document BLB-TSS-[ref]. The two rows show the product, "maker · Routleys · code", the quantity and source **S1**, flagged **Source not yet reviewed** while the document is Received. **Source documents** lists S1 with "No revision printed" if none was entered.
3. Set the document to **Superseded** and preview again. Expected: the rows say **Source superseded**, and the pre-issue checks list an error naming the record. Issue is refused. Link the records to a current document. Expected: the error clears.
4. Preview the **Client Selections Presentation**. Expected: A4 portrait, BLB-CSP-[ref]; no Ref column, no code, no S1, no "To verify". Each item marked Proposed is asked about once in the intro to **What we need from you**, not once per row.
5. Issue the presentation, then look at the technical schedule's history. Expected: the presentation is R01 of its own; the technical schedule's current revision is unchanged.
6. Open the **Routleys** coordination pack. Expected: its kicker reads "Coordination request: Routleys (plumbing fixtures)", and it lists only Routleys items. Section 03 reads **What we need from Routleys** and holds only actions owned by Trade / supplier; the client's and Blue Leaf's open items are under **Waiting on others**, for information.
7. Give a kitchen sink and mixer client labels, and a Rylock record a client description. Preview the presentation. Expected: "Kitchen sink" and "Kitchen mixer"; the client description in place of the supplier's line; no room named twice in a group heading. Set the Rylock document to **Under review**. Expected: its products read **Being confirmed**, with the client's own words.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

# Technical Selections Schedule and Client Selections Presentation: shared model and page specifications

16 November 2026. Branch `doc-suite-r01`. Pair 2 of the document suite: two documents from one register, on the CPB and ADB design system (`scripts/documents/design-system.mjs`), each with its own page composition. Templates `tss-1.0` (`author-tss.mjs`) and `csp-1.0` (`author-csp.mjs`). **Neither document is authorised for live issue.**

**How this was produced:**
1. **Research,** in six parallel reports (summarised in the checkpoint pack):
   - the repository's selection model;
   - how supplier and consultant documents enter the Hub;
   - the Master Register (all 29 tabs);
   - the ZJ supplier examples in Dropbox `SALES/ZJ EXAMPLE MATERIAL` (Routleys selections 452494 and 452499, the TLI lighting legend, Rylock quotation RM-6403 Ver 1);
   - the design system.
2. **A first spec,** reviewed by three independent critics (the brief, the Master Register rules, the code) before any code was built.
3. **This revision,** which takes their findings: 3 blockers and 28 other findings, recorded in the checkpoint's `QA.md`.
4. **One focused QA round** on the rendered specimens: four reviewers, each checked by a sceptic. 40 findings, 32 confirmed, all fixed or recorded below.
5. **The owner's review of checkpoint 01** (16 Nov): TSS close to ready; CSP needs one focused correction pass. Six rendered-page defects, the release-control concern and decisions 1 to 8 (§9) are answered in **checkpoint 02**. The TSS design and the shared model are unchanged.

---

## 1. Decisions taken under the brief

Each is reversible. The owner's confirmation is asked for in §9.

| # | Decision | Why |
|---|---|---|
| S1 | **Two documents, one register.** The Technical Selections Schedule is `selections_schedule`, code **TSS**. The Client Selections Presentation is its own type `client_presentation`, code **CSP**, with its own revision series. **Migration 220** (prepared, applied to the sandbox only) adds the type. Until it is applied, the presentation previews but can't be issued, and the refusal names 220. The older "client layout" request on `selections_schedule` maps to the presentation before anything else runs. | When the two were layouts of one type, issuing either superseded the other (issue is keyed on `document_type`). The Master Register's "one output family" rule is about data, and it holds: one record, two renderings, never two approval states. Closes DOCUMENT_SUITE row 05-E. |
| S2 | **One shared model**, `selectionRecords(register, context)`. Every selection field of both documents comes from it. The schedule's requirements, actions and source list read the same register and context. | Replaces `selectionRows` (research A found 23 defects). |
| S3 | **One status vocabulary**, the same words in both documents (owner decision Q2, extended for the portal states). Each status is explained once. A preference is unmarked. Client approval and technical verification are never merged. | Q2; the editorial rule; Master Register Tab 11:44 ("status labels shared"). |
| S4 | **Grouping.** The schedule groups **by trade and system**, as Q4 allows, with location as a column. The presentation groups **by location**: throughout the house, then each room, with identical rooms merged. An exception names what it replaces only under the `roomDefaultsFor` rule. | Suppliers and trades work by system; clients think in rooms. |
| S5 | **No images yet.** The presentation is text-first. The brief's "imagery where available" isn't met. Imagery exists in the Routleys documents (a photo and line drawing per line), but it can't be used, for four reasons. Reuse terms aren't stated. In 11 codes the image is a sibling variant's. 3 lines say outright that the image is not the selected finish. And the renderer has no image module, and no register field holds an image. **Owner decision (§9).** | Master Register Tab 22:26 ("only if genuine and cleared"), Tab 17:70 ("a clean text-first composition instead of a blank photo frame"). |
| S6 | **Selected vs proposed, from the register as it is.** The client sees what they've chosen (Client-approved), what is proposed and awaiting their answer (Proposed), their own direction (unmarked), and what is still open. Where a proposal replaces what they first asked for, and staff have raised it with them, both show. Option lists from the portal (`selection_options`) aren't read. **Owner decision (§9).** | The register holds no alternatives. Options live only on the portal, with no images and at most two from the admin screen. |
| S7 | **Quantities are never invented and never zero.** The schedule prints a quantity only where one is recorded; 0 prints blank and warns. A supplier's count is that supplier's count, shown with its source key. The presentation never prints quantities. | Tab 22:25, Tab 27 B08. |
| S8 | **One record per product the client chooses** (a fixture, fitting or finish), each with its own code and quantity. One element can hold several (the ensuite's basin mixer, bath/shower mixer and shower system are three B-008 records). Accessories and rough-in parts stay in the supplier's document, which the record cites: wastes, grates, isolation stops, flush plates, roll holders and towel rails. | The supplier documents examined print several lines per element. One record per element would need concatenated codes and quantities. One record per supplier line would re-key whole supplier tables, which Tab 14:76 forbids. |
| S9 | **A supplier's document is cited, never adopted.** The schedule's note says citing it isn't acceptance of its content. "Mark verified by this document" is now offered only for a consultant document marked reconciled. | Tab 14:76, Tab 15:51 ("receiving a PDF is never equivalent to client approval"). |
| S10 | **An approval held only as the portal board's status prints as Proposed**, and blocks issue in both documents until the who, when and how are recorded. | Research A SFS-15: a promoted scratchpad approval gets made-up evidence ("Portal board"). Applied to the selections documents only; the CPB and ADB are frozen (§9). |
| S12 | **A supplier's words print as the supplier wrote them.** On the schedule, a product line is verbatim (truncation kept, sizes labelled as printed, handing with its viewpoint); the only change is a finish split from the end of a Routleys line. A code says whose it is ("Routleys code 62397"). In the presentation, a supplier's line written mostly in capitals or as a bare code is replaced by the record's own description ("Ensuite window, with privacy glass"); other supplier wording prints as written. Plain client wording for every supplier product needs a field of its own: **owner decision (§9)**. | QA: paraphrased supplier lines can't be checked against the supplier's document, and a truncated line read as complete. |
| S13 | **Client wording (owner decision 8).** Each record has an optional, staff-reviewed **client label** ("Kitchen mixer") and **client description** ("Luxe pull-down sink mixer"), entered in the register's office fields and kept in `register_detail` (no database column). The presentation prints them; the schedule keeps the supplier's line untouched. They are wording, so editing them never needs the client's re-approval. | Owner review: "CS Hinged Door Open In LHH" reached the client; two rows both read "Sink & mixer". |
| S14 | **A supplier's product reaches the client only once its document is reconciled** (owner review, release control). A proposal citing a document still received or under review prints in the presentation as **Being confirmed**, with the client's own direction and no product. A proposal with nothing a client can read prints **To be decided**. So a Proposed row always describes a real option. The technical schedule keeps both, flagged. | The Kestrel presentation was issued with seven selections from documents under review. |
| S15 | **Visible accessories get their own records (owner decision 6):** towel rails, roll holders, flush buttons, wastes and grates the client sees and chooses. Concealed rough-in parts (isolating cocks, isolation stops) stay in the supplier's schedule. | Supersedes the accessories part of S8. |
| S16 | **A coordination pack asks its party for what is theirs.** Section 03 becomes "What we need from Routleys": the actions owned by the trade or supplier, Who = the party. A following section, "Waiting on others", lists the client's and Blue Leaf's open items for information only. | Owner review: the Routleys pack read as Blue Leaf's to-do list. |
| S11 | **A hand-added record goes to the trade of the document it cites.** A hand-added record has category `notes` (the register can't set another). It joins the trade of its cited document's discipline (TLI → Lighting and electrical, windows → Windows and doors, Routleys → Plumbing fixtures, joiner → Joinery). A coordination pack also takes a record by that discipline. | Without this, every TLI fitting and window maker's opening would land in "Other selections". No supplier name is guessed. |

---

## 2. The shared model: `selectionRecords(register, context, { coord })`

One record per client selection: an item of kind `selection` that isn't excluded, by others, not applicable or deferred (`isClientSelection`). **No database field is added.**

| Field | From | Rule |
|---|---|---|
| `ref` | `refCode` | Printed by the schedule only |
| `group` | a cited **supplier** document's discipline (a laundry trough on Routleys' selection is a plumbing fixture); else `category` → trade group (§3.2); else a hand-added record's cited document's discipline | S11 |
| `item` | the question's short label, without "— who?"; a hand-added record's description; a legacy row's item only | |
| `location` | the room; else the rooms `answer.areaIds` names; else, for a house default, its zone or "Throughout the house"; else "Site"; else the portal row's area; else "No room recorded" | Never claims "throughout the house" for a record that isn't a default, or for a zoned default (the presentation groups it under its zone) |
| `replaces` | `overridesDefaultId` → the default's words, only when `roomDefaultsFor` includes it | ADB-01 |
| `product` | the named product, else the client's words (description, else the card answer), with the parent ("Main roof") kept | |
| `direction` | the client's words, when a named product differs from them (not for portal-created rows) | |
| `manufacturer` / `model` / `supplier` / `finish` | their own fields | Blank when not recorded; never "TBC" |
| `quantity` | `quantity` + `unit` when above 0 | S7 |
| `supplyBy` | the supply label | Schedule only |
| `state` | disposition, portal status, answer state, certainty and evidence | **existing** (retain) · **change_requested** · **with_blue_leaf** (the client answered on the portal) · **undecided** (client unsure, unresolved, stale, or nothing recorded on a preference) · **approved** (with real evidence: S10) · **proposed** · **preferred** · **not_discussed** (nothing recorded, no owner, no action) |
| `selection` | the state in words | "Existing to remain", "Change requested, with Blue Leaf", "Client's choice, with Blue Leaf", "To be decided", "Client-approved", "Proposed", "" (preferred), "Not yet discussed" |
| `technical` | `technicalStatus` | "To verify", or "Verified" only with its reference |
| `knowledge` | derived | **Known**: client-approved or existing, with words, no technical check open and no source flag. **Unresolved**: to be decided, not yet discussed, change requested, or nothing recorded. **Provisional**: everything else. |
| `source` / `sourceFlag` | `sourceDocId` → the document, looked up by id (not the 30-row list); else the free-text source | Flags: **superseded**, **not yet reviewed** (received or under review), **not on file** |
| `clientVisible` | the portal's release flag | An unreleased item is never asked about |

The CSP reads only `item`, `location`, `replaces`, the client's words or the named product (manufacturer first, no code), `finish` and the state. It is deliberately stricter than the portal, which shows the client the supplier and model code.

---

## 3. Technical Selections Schedule (TSS)

**Reader:** Blue Leaf staff and the estimator, the architect and consultants, suppliers and subcontractors. **Format:** A4 landscape (`usePage("landscape")`). The PDF is authoritative; a controlled DOCX is available on request (owner decision Q5). **Stage:** offered from consultants, tender and won; previewed and issued at any stage, with no further restriction (the principle of the owner's ADB decision Q6). The early specimen is a draft.

### 3.1 Pages

| Block | Content | Layout |
|---|---|---|
| Header, footer | Logo, "TECHNICAL SELECTIONS SCHEDULE" (a pack: "COORDINATION REQUEST"), project; identity and page | design system |
| Title block | Kicker "Selections and coordination" (a pack: "Coordination request: Routleys (plumbing fixtures)"); "Draft /" when not issued | `titleBlock` |
| Metadata | Prepared for, Client, Site, Drawing basis, Stage, Document, Prepared by, Status. A pack keeps its Status row | `metaGrid` |
| Status note | **"Issued for coordination"** or **"Draft for coordination — not issued"**. "It isn't a purchase order, a variation or a technical approval. A product is the client's choice only where it is marked Client-approved, and a technical item is settled only where it is marked Verified. A supplier's document cited here is that supplier's own information: citing it isn't acceptance of its content." | `callout` |
| Reading this schedule (page 1) | Each printed status defined once. "A row with no location applies throughout the house." The recorded direction. "Blue Leaf supplies each item unless its supply is noted." The source key. "A blank finish or quantity hasn't been recorded; a quantity from a supplier's schedule is that supplier's count." | label + body |
| Summary (page 1) | "27 selections. Known: 8 (…); Provisional: 19 (…); Unresolved: …", each class defined in brackets | body |
| **01 Selections by trade** | One table per trade group. Its name and column labels repeat on every page: **Ref · Item and location · Selection · Finish · Qty · Status · Source**. Item cell: the item, then the location (and "instead of …"). Selection cell: the product; then manufacturer · the supplier's code ("Routleys code 62397") · supply when it isn't Blue Leaf; then "Recorded direction: …". With no product, only the detail line, and the Status says "To be decided" once. Status cell: the selection status, then To verify / Verified. Source cell: the key (S1), then a flag. | `bandTable` (new, multi-column) |
| **02 Requirements these selections must meet** | Ref · Requirement · Applies to (trade) · Status (Client-approved / To verify / Verified / For consultant review, with who confirms) | `dataTable` |
| **03 Open actions and checks** | Ref · What is needed · Who. Each open next action on a schedule record, and each open action that is a selection decision: an action in a trade, a K-012 choice, or one citing a document the schedule's records cite. **The same rule picks the client's asks in the presentation**, so every decision the client is asked about is here too. The intro says a To-verify row in 01 still needs its check. Source problems are pre-issue checks in the Hub, never printed as instructions. | `dataTable` |
| **04 Source documents** | Key (numbered in the order rows print) · Document (issuer and number, or its title: "TLI lighting legend") · Revision and date ("No revision printed, received 14 November 2026") · Review status | `dataTable` |

Every section is optional; the numbers count only what prints.

### 3.2 Trade groups

1. **Roof and walls:** roof, cladding, insulation.
2. **Windows and doors:** windows, doors.
3. **Internal finishes:** flooring, walls_ceiling, paint, trim, stairs.
4. **Joinery and benchtops:** joinery, benchtop, appliances.
5. **Plumbing fixtures and tiling:** sanitary, tiling, plumbing.
6. **Lighting and electrical:** electrical.
7. **Heating, cooling and services:** hvac, services.
8. **External works:** external, site.
9. **Other selections:** anything else (S11 first).

### 3.3 Rows

- One row per record. Rows whose printed content is identical except the room merge, keeping every reference, except a counted product (one quantity can't speak for two rooms) and two records in the same room (a product the supplier listed twice is two items).
- No "TBC", "Whole house", "(project default)" or "(room exception)". An open selection reads "To be decided"; blank only ever means a recorded preference. This applies the editorial rule in place of Tab 13:67's "explicit TBC".

### 3.4 Coordination packs

A pack holds the schedule's records for one party. A record belongs to the party when any of these match:
- the question's coordination tag;
- the cited document's discipline;
- for Routleys and TLI, the supplier's name (as before).

The pack also holds that party's requirements and actions, and the actions that cite a document its records cite.

Before a pack is produced, the issue checks run (superseded source, a price, engineered stone), and a pack is refused when one fails. Packs are drafts and aren't recorded (§7).

---

## 4. Client Selections Presentation (CSP)

**Reader:** the client. **Format:** A4 portrait. The PDF is authoritative. **Stage:** as the schedule.

| Block | Content | Layout |
|---|---|---|
| Header, footer | Logo, "YOUR SELECTIONS", project | design system |
| Title block | "Client selections", "Your selections", the project | `titleBlock` |
| Metadata | Prepared for, Site, Prepared by, Date, Document, Status | `metaGrid` |
| Status note | **Negative statements only:** "This records your selections as they stand on <date>. It isn't a contract document, a price or a technical approval. A selection marked Client-approved records your choice; it doesn't mean the item has been checked or ordered." | `callout` |
| **01 What we need from you** (optional) | Item (with its room) · What we need. Each open action the client owns on a selection, or on a selection decision recorded elsewhere (K-012), in the record's words. Also each selection the client is to decide. Proposals are not listed one per row: one sentence, with no count, asks about each selection marked Proposed. Never anything the client has already answered, and never an unreleased item. | `dataTable` |
| **02 Your selections, room by room** | Item = the client label, else the question's label; Your selection = the client description, else the rules below (S13, S14). Each room appears once in a group's name ("Bathroom and bathroom" is impossible); two identical records in one room are two rows. A finish line already said by the client description is left out. "Throughout the house" first, then a zoned default under its zone ("Main floor"), then each room, with identical rooms sharing a group; "Not yet placed in a room" last. **Item · Your selection · Status.** Your selection is the client's own words for a preference. For anything proposed, chosen or approved, it is the product named, manufacturer first, with no code. The finish is a quieter second line. Where staff have raised a replacement with the client, a further line reads "Previously recorded: …" (neutral: the earlier words may have been a proposal). A supplier's line in capitals or a code shows as the record's description (S12). Nothing chosen: the cell is empty and the status says "To be decided". The status shows only when marked. The intro defines each printed status once. | `groupedTable` |

**Never in the presentation:**
- register references, product codes or supplier document numbers (checked at issue);
- sources, technical states, quantities or prices;
- owners other than the client;
- staff notes or a legacy row's supplier and notes;
- "Whole house", "(project default)" or "TBC";
- a selection not yet discussed.

---

## 5. Pre-issue checks

The existing checks apply to both documents: drawing basis, recipient, unevidenced approvals, verification without a reference, `$`, the engineered-stone policy (§9), and Lato.

New, for both documents unless stated:

| Check | Level |
|---|---|
| A record cites a **superseded** document | Error. Relink it and check its product, finish and quantity. |
| A record cites a document **no longer on file**, or the cited documents can't be read | Error |
| A record is **verified against a document not yet reviewed** | Error |
| A record cites a document still **received or under review** | Warning (and flagged on the schedule's row) |
| An approval held **only as the portal board's status** | Error (S10) |
| Two client-approved records for one element (question, room, zone, element) with no code, or the same code, naming different products | Warning |
| A **quantity of 0** | Warning; prints blank |
| CSP: a **preference with only a product** recorded | Warning |
| CSP: a printed **reference, product code or supplier document number** (from a record's words or action) | Error |

---

## 6. Supplier and consultant integration

### 6.1 What the ZJ examples show (examined, not assumed)

| Document | Identity | Location | Lines | Status | Revision |
|---|---|---|---|---|---|
| **Routleys Product Selection**: 452494 (25 lines) and 452499 (39 lines), 7 Mar 2025, A4 landscape | Selection number, date and time, prepared for and by. No builder label. | A "ROOM" band ("WC'S - *** POOL WC", "GUEST", "ENSUITE"…), no level | An unlabelled 5-digit code (Routleys' own, inferred from its link paths); "N x" quantity; one string holding product, size, configuration and finish; description; warranty; spec-sheet links; photo and line drawing | **None.** A disclaimer frames it as information | **None printed.** "Stage" is only in the file name. 452499 was changed after issue: a hot-water page was removed on 9 Apr 2025, and a text extractor still reads it. |
| **TLI lighting legend** (2 pp) | **None.** No job, client, date or revision; TLI is only the code prefix. | **None.** By fitting type, with whole-plan totals; only the pendants name rooms. | Legend key (DL.1…), code string (wattage, colour temperature, finish), total with unit | "TBC by Designer / Client / Electrician" on 6 of 17 lines | None |
| **Rylock quotation** RM-6403 Ver 1 (4 Mar 2025) | Number, version, date, issuer, builder; unsigned; valid 30 days | Room names in each item's comments | Size, frame depth, reveal, operation and handing, hardware, screen, glazing make-up, weight; series codes ("CS", "AA 65") | Frame colour "CHOOSE FINISH"; "Builder to confirm frame depth"; "BUILDER TO C.O.S" | Version printed. A whited-out price and bank details are still in the file. |

### 6.2 The owner's six questions

**1. What maps to register records**

- **Verbatim from the document:**
  - Routleys: code → `model`, labelled as Routleys' code; quantity; product line → `product`; Routleys → `supplier`.
  - TLI: legend key and code → `model`; total → `quantity` + `unit`.
  - Rylock: description and size → `product`, verbatim; item number → `model` ("quote item 2"); quote number and version → the received document.
- **Entered by staff at upload:**
  - TLI's identity (nothing printed).
  - Routleys' revision: none; the selection number identifies it, and "Stage n" is never used.
  - Discipline.
  - **Not captured:** a document's own printed date (Rylock 4 Mar 2025, Routleys 7 Mar 2025 11:16 am). The received document has a received date only (§7).
- **Staff review:** every room mapping; TBC owners → responsibility; maker vs supplier. `model` stays blank where nothing printed is a code.

**2. What needs staff review**

- Splitting the finish from the product line.
- The manufacturer: never labelled; read from a warranty web address, and the sources can disagree.
- Supplier rooms → Hub rooms.
- Whether two selections describe the same room: Routleys 452494 and 452499 share 19 lines, with different ensuite quantities.
- TLI fittings: no rooms until the lighting plan arrives.
- Truncated lines: a laundry sink's finish is cut off.
- Content hidden in the PDF.
- Lines that conflict with the plans: Routleys puts a bath in the bathroom; the plans put it in the ensuite.
- Every status: no supplier document carries one, and receiving a document is never approval.

**3. How source revisions are kept**

- The original PDF is stored once, unchanged, in `lead_documents` with issuer, number, revision, received date and review status (received → under review → reconciled → superseded).
- A record points to it by `sourceDocId`, resolved by id.
- An issued document's snapshot keeps its fixture, so it records which document every row cited.
- **Gaps:** nothing links one revision of a supplier document to the next. A received file has no checksum, so a re-sent file under the same number can't be told apart. "Review & link" (`register_item_ids`) and "Set as source" (`sourceDocId`) are two links that can disagree. A received document's number and revision can't be corrected after upload. (§7)

**4. How discrepancies show**

- A superseded or missing source blocks issue; an unreviewed one is flagged and warned.
- Where a supplier's product differs from what the client asked for, the record keeps both. The schedule shows the recorded direction under the product. Once staff raise it as the client's next action, the presentation asks the client and shows "You first asked for".
- A conflict with the plans is an open action for Blue Leaf.
- Verification against an unreviewed document blocks issue.
- **Not built:** comparing a new supplier revision with the register automatically. It needs a structured import first (§7).

**5. How updates flow into both documents**

- Staff reconcile a received document, then "Set as source" and edit the record's product, finish, code and quantity. The next preview of both documents shows the change. The schedule shows the code and source; the presentation shows only the product's name and finish.
- **Approved records:** editing the product, model, manufacturer, finish or supplier of an approved record steps it back to Proposed in the register screen. In project mode the save is refused without fresh evidence (`reapproval_required`, migration 213). Entering a supplier's code on an approved record therefore needs the client's re-approval: **owner decision (§9)**. Until it is decided, enter codes before recording the approval.

**6. How duplicate entry and contradictions are avoided**

- One record per product the client chooses, never one per supplier line. Accessories stay in the supplier's PDF.
- Both documents come from one function, so generated from the same register state they agree. Issued separately, each records its own date.
- A superseded source can't be issued in either document.
- Client approval, technical verification and the supplier's document stay separate.
- The duplicate-approval warning catches one choice recorded twice.

### 6.3 Exact examples still needed

- A **joinery** schedule (a joiner's or a supplier's).
- The **TLI lighting plan** the legend keys to.
- A **true revision** of a Routleys selection, to test supersession.
- An **energy assessment** with glazing values (the Rylock quote has none).

---

## 7. Not built

| Gap | Next step |
|---|---|
| Images (S5) | A cleared image source and reuse terms; a register image field; an image module or post-render insertion. Owner decision. |
| Option lists (S6) | Load `selection_options` into the register (project mode), without prices. |
| Size as a field | A `size` field (database change). |
| Assisted supplier import | Read a received PDF into proposed rows (Claude PDF reading exists in the codebase) for staff to accept line by line. Never auto-accept (Tab 18:10, Tab 08:99). It must ignore content hidden in the file. |
| A received document's own date | A document-date field captured at upload and printed beside its revision. |
| Plain client wording for supplier products | A "client description" field on a record, printed by the presentation in place of the supplier's line (S12). |
| Revision linking, checksum, link divergence | `supersedes_id` and `content_sha256` on received documents; one link between a record and its source. |
| SFS-15 in the CPB and ADB | The same rule as S10 in `approvalIsEvidenced`, once the frozen briefs are reopened. |
| Packs not recorded | Record a pack as an issue (recipient, revision, date) so a returned revision can be compared with what was sent. |
| A stale companion document | At issue, warn when the other document's current revision was built from older records. |

---

## 8. QA and fixture policy

**Specimens** (`render-register-specimens.mjs`, docTypes `selections_schedule` and `client_presentation`):
- **Kestrel Court**, a renovation and extension at design coordination, with Rylock RM-6403 Ver 1 (under review) and the TLI legend (received). A draft shows the superseded-source flag; the issued copy is relinked.
- **Ridgeline Drive**, a new home at tender, with Routleys 452499 reconciled. The Routleys coordination pack.
- **Ridgeline at concept**, with no supplier data.

**Fixture policy** (`register-projects.mjs`):
- Supplier product words, codes and quantities are copied verbatim from the ZJ documents (truncation kept); the only change is a finish split from the end of a Routleys line.
- Every staff decision is marked "staff:" in the code.
- Accessories aren't entered.
- Approvals, dates and recipients are the fictional project's, like every other record in the file.

**Tests:**
- `documents-selections` (66): the model, both documents, every check above, packs, templates, and the QA fixes.
- Updated to the new shape: `documents-r01` T3, T11 and T15, `register-documents-structured`, `register-structured-store`, and `register-e2e` #17. New `register-e2e` #18b: issuing the presentation leaves the schedule's R02 current, and no code prints.
- Unchanged and passing: `documents-cpb` 152, `documents-adb` 63.
- The CPB and ADB templates re-author identical except their timestamps.

---

## 9. Decisions for the owner

**Owner's answers, 16 Nov (checkpoint 01 review):**
1. Separate document types: **yes**. Migration 220 needs controlled deployment.
2. Images: verified Blue Leaf photography, or images with confirmed reuse rights; text-only where no reliable image exists.
3. Option lists: show only options intentionally released for client review.
4. Codes on approved items: an administrative code correction, with product and finish unchanged, shouldn't automatically need re-approval; a material change does. **Not built yet:** today the register steps an approved record back when its code changes (§6.2, question 5).
5. Existing engineered stone: keep the current protection until a separate compliance review.
6. One record per product: yes, with visible client-chosen accessories as their own records (S15).
7. Keep "Client-approved" across the suite for now.
8. Client descriptions: yes (S13).

**The questions as asked at checkpoint 01:**
1. **S1 confirmed:** two documents, two revision series, codes TSS and CSP. Then apply migration 220 after 218.
2. **Images (S5):** use supplier imagery (needs Routleys' reuse terms, and a check that each image is the selected variant), Blue Leaf's own sample photography, or neither for now.
3. **Option lists (S6):** show the portal's options (without prices) in the presentation, or keep proposals only.
4. **Approved records and codes (§6.2, question 5):** does entering a supplier's code or quantity on an approved record, with product and finish unchanged, need the client's re-approval?
5. **Engineered stone on the technical schedule:** existing stone to be retained or removed can't be named on the schedule today. The rule blocks any client-facing document that prints it, and the schedule prints the product field where staff are told to record it. Recommended: the schedule may name existing stone on a Retain, Remove, Make good or Alter record, with the SafeWork SA notice as a warning; supply selections still block. This changes a release blocker.
6. **One record per product (S8):** confirm. The alternative is one record per element carrying only the principal product, with "plus further lines, see the supplier's document".
7. **"Client-approved" or "Client-confirmed"** (release checklist R4, B2): this pair uses whichever the owner chooses for the suite.
8. **Plain client wording for supplier products (S12):** add a "client description" field, so a homeowner never reads "CS Hinged Door Open In LHH…"? Until then, only capitals-and-code lines are replaced.

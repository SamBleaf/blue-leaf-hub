# Client Project Brief: final candidate for Blue Leaf (template cpb-2.4, the cpb-2.3 design)

16 November 2026. **Status: final candidate, not approved.** The fourth independent review (ChatGPT, of checkpoint 4) found CPB3-01 to CPB3-07 resolved, saw no reason for another layout redesign, and recommended preparing cpb-2.3 as a final candidate with the remaining decisions listed clearly. That review is an independent recommendation, not approval on Blue Leaf's behalf. Nothing here has been deployed, issued or sent.

This note has four parts:
- **A.** What changed since checkpoint 4.
- **B.** The decisions only Blue Leaf can make.
- **C.** The release controls to close before production.
- **D.** What "freeze" means once Blue Leaf approves.

## A. Changed since checkpoint 4

| # | Review point | Change | Test |
|---|---|---|---|
| 1 | Aldgate p1: "PRELIMINARY / SCOPE AND PRICING" promises a price the brief doesn't contain | A build-only brief now reads **Preliminary / Scope review**. A plans-supplied brief had the same problem ("Plans and pricing") and now reads **Preliminary / Plans review**. Design and build and architect tender are unchanged | `documents-cpb`: no brief's label mentions a price, quote, cost or estimate on any of the four pathways at any of the seven stages before Won (28 cases) |
| 5 | Full final PDF inspection of all five specimens | Done: five inspectors read all 18 pages, and a sceptic re-checked each one's findings against the pages. 50 findings; 32 confirmed: 28 fixed, 1 part fixed, 3 kept on purpose. A second pass after the fixes compared every page before and after and reviewed the code; it confirmed 4 more, all fixed. Every finding and what was done: `evidence/FINAL_INSPECTION.md` | `documents-cpb` (16 new checks, 152 in all); `sandbox-cpb-issue` (R02 says it replaces R01, with the date R01 printed) |

**What the inspection changed.** No layout or design change; the page counts are unchanged (4/4/4/2/4):
- **The PTSA note** printed an office acronym ("PTSA") that doesn't match the name beside it, then repeated the table row above it. It now reads: "The pre-construction agreement is separate from this brief and from any building contract."
- **The closing note** read "Sam Morris, Blue Leaf Building prepared this brief …". It now reads "We prepared this brief …"; the cover still names who prepared it.
- **A revised brief now says what it replaces.** The R02's page-1 box opens with "This revision replaces R01, issued 15 November 2026." R01 and drafts don't print this.
- **The plans-supplied cover** said "Renovation · Design & build". It now reads "Renovation · Plans supplied", following the same pathway as the label and next steps. Project types are in sentence case ("New build").
- **The drawing basis was dropped into sentences** ("based on Measured sketch …"). It's now quoted: "based on the drawing basis above", and "This brief is based on the drawing basis recorded on page 1 (Measured sketch, 6 November 2026)."
- **Smaller wording fixes:**
  - The decisions intro: "This needs to be settled …" for one decision, "These need to be settled …" for several, replacing "someone's input".
  - "We record the direction discussed so far" replaces "the agreed direction".
  - A plans-supplied brief's current stage is "Plans review", matching its label.
  - "Family room", not "Family", in the preference table.
  - The boundaries heading names only the lists shown, so a new build no longer promises "what stays".
- **Spacing:** two empty spacer rows were removed. One sat before section 04, the other above the About box when there is no PTSA note. The gap above the About box is now 14 pt on every pathway, and the steps table keeps its closing line (the second pass found it had gone).
- **From the second pass:**
  - The "replaces" line takes R01's date from what R01 printed, not from the database timestamp.
  - A status name such as "For consultant review" no longer breaks across a line.
  - The cover's middle dot is spaced like the cell beside it.
- **Issue dates now use the Adelaide calendar day.** Using the UTC day dated anything issued before 10:30 am as the day before. This was a live bug, found while adding the "replaces" line.
- **Three slips in the sample data**, not the template, were corrected: the laundry that was both removed and reconfigured, "Full renovation of the powder room" repeating the room, and the third-person "The family wants …".

**Kept on purpose:**
- "Living on site during works: Yes.", the label-and-answer format reviewed at checkpoint 3.
- The build-only paragraph "… before finalising the price.", the reviewer's own wording from checkpoint 2.
- The status key's punctuation, accepted at checkpoint 4.

**Template version.** The template file changed (the heading and two spacer rows), so its version is now `cpb-2.4`. That keeps each stored issue traceable to the exact template it used. The design is the cpb-2.3 design the review accepted.

## B. Decisions for Blue Leaf

### B1. Engineered stone: what a client document may say (decision needed; your WHS adviser should confirm the wording)

The review asks for three things to be kept apart:

| Concern | Where it belongs |
|---|---|
| 1. Stopping a prohibited new product being specified | The issue check. **Unchanged in every option below**: a selection that would supply engineered stone stops the issue, and so does typed wording that names it |
| 2. Recording existing materials and the proposed work accurately | The document |
| 3. The WHS obligations for work on stone already installed (notifying SafeWork SA, the SWMS, controls) | The job's WHS process. The document check is **never** WHS clearance |

**As built (cpb-2.3 and cpb-2.4):**
- A client document never prints engineered stone, whatever the wording.
- For stone already installed, staff write the line without the material ("Remove the existing kitchen benchtops") and record the material in the Product field, which the brief doesn't print.
- Staff then get a warning that says this is controlled work, that SafeWork SA must be notified before it starts, and that the check is not WHS clearance.
- **What the client doesn't get:** they aren't told that the benchtop being removed is engineered stone.

**Option 1: keep it as built.** Nothing more to build. The client document stays silent about the existing material.

**Option 2: a fixed, system-written statement for installed stone (recommended).**
- On a scope record marked Retain or Remove, staff choose "Existing material: engineered stone" from a fixed list. They don't type it.
- The brief prints the staff's line, followed by one fixed sentence the system writes. Typed wording that names engineered stone still stops the issue.
- A selection can never carry this choice.
- Records marked Make good or Alter stay as Option 1 for now, because changing installed stone is where new supply hides (an "add a waterfall end" wording beat an earlier check).

Draft wording (2a includes the notification, 2b doesn't):

| Record | 2a: names the notification | 2b: shorter |
|---|---|---|
| Retain | "Existing material: engineered stone, already installed. It stays as it is. No new engineered stone will be supplied or installed." | "Existing material: engineered stone, already installed. It stays as it is." |
| Remove | "Existing material: engineered stone, already installed. Removing it is controlled work: we'll plan it under our WHS process and notify SafeWork SA before it starts. No new engineered stone will be supplied or installed." | "Existing material: engineered stone, already installed. Its removal is managed separately under our WHS process." |

- **Gains:** the client gets an accurate record and knows why removal needs extra steps, and nothing is read out of free text.
- **Costs:**
  - A small build: one fixed choice on the record, two sentences, and tests.
  - The wording needs your sign-off.
  - 2a commits Blue Leaf's WHS process to the notification step it describes.

**Option 3: let staff's own words print on Retain, Remove, Make good and Alter records, if the issuer ticks "This describes stone already installed; nothing new is supplied".** Their name is recorded with the tick. **Not recommended.** It relies on someone reading the words at issue. The review rounds produced wordings that would mislead a client too: "Retain cabinetry - engineered stone benchtops" and "Island benchtop to match the existing engineered stone".

**Related choices:**
- **B1b. A client's "No engineered stone" requirement.** Today it stops the issue until it's reworded ("Porcelain or natural stone benchtops only"). Option: a fixed statement staff can tick to print once in the brief: "Blue Leaf doesn't supply or install engineered stone: it has been prohibited in Australia since 1 July 2024."
- **B1c. A tracked WHS task.** When a record has existing engineered stone and is marked Remove, Make good or Alter, the job could get a WHS action: notify SafeWork SA and include it in the SWMS. Today it's only a warning in the issue screen. This is a WHS-module build, separate from the document suite. Recommended after the CPB release.
- **B1d. The "Engineered stone" option on the benchtop question card (K-005).** It's still offered, and blocked at issue. Removing it is a question-library change. Recommended.

### B2. "Client-approved" or "Client-confirmed"

**How it works today:**
- A selection or requirement prints this status only when the approval is recorded: who, when and how (meeting, email, phone and so on), entered when staff mark it approved, or the client's own approval on the portal board.
- Without that, the document prints "Proposed" instead, and the issue is stopped ("marked client-approved without evidence").
- The database refuses a new item created as already approved without evidence (migration 213).
- A material change to an approved answer needs a fresh approval.

**Choices:**
- **(a) The word.** "Client-approved" or "Client-confirmed". The status key already explains it as "you've confirmed it with us", and a pre-contract document may read "approved" as more binding than intended. So **"Client-confirmed" is the recommendation**, keeping `client_approved` as the internal value. Your call.
- **(b) Should a reference be required?** For example, the email or the signed selection sheet, except for portal-board approvals. Today the reference is optional.

### B3. Decision references (CPB2-09)

Today each decision prints a stable code such as "P009-UAZ". It's the same in every revision and in the internal documents, but it means nothing to a homeowner.

| Option | What the client sees | Note |
|---|---|---|
| (a) Keep the codes | P009-UAZ | No change |
| (b) Simple display numbers | D1, D2 … | Each number must be allocated once per project at first issue and stored. Numbering by position would renumber between R01 and R02, so a client comparing revisions would see "D3" change meaning. A closed decision keeps its number, and an R02 may skip numbers. The code stays in the register and internal documents. A small build |
| (c) No reference | Nothing | The client can't point to a decision in conversation |

The recommendation is **(b)** if clients will refer to decisions by number, otherwise (a).

### B4. Stage label wording

Confirm **Scope review** (build only) and **Plans review** (plans supplied).

A brief issued while a lead is still at Enquiry or Qualify would print the internal pipeline word ("PRELIMINARY / QUALIFY"), and at the PTSA stage it prints "PTSA / PLANS". Suggestion: "Initial brief" for Enquiry and Qualify. This is a small change, and your call.

**The agreement's name.** The brief calls it "the pre-construction agreement", but Blue Leaf's own document is titled "PTSA — Pre-Tender Services Agreement", and the concept email says "Pre-Tender Service Agreement (PTSA)". Should the brief use the agreement's real name, and is it "Service" or "Services"?

### B5. Project number

The five questions in `PROJECT_NUMBER_DECISION.md` are still open:
1. When an estimate is first opened in Buildxact.
2. The number's format (0417 or 26-014).
3. Whether staff put the Hub number in the Buildxact estimate name.
4. Whether carpentry jobs share the number.
5. Whether jobs created straight from an RFQ need one.

Until then, live documents print the lead reference (`BLB-CPB-BL3F9A2C-R01`).

### B6. "What changed" on a revision

An R02 now says which revision it replaces, but not what changed. An optional one-line note typed at issue (for example "Now based on your supplied plans A-100 Rev D; decisions updated") would print under that line. This is a small build: one field in the issue dialog and its tests.

## C. Release controls before production

| Control | State | What's needed |
|---|---|---|
| Lato on Railway | **Open: release gate.** The Railway build (`nixpacks.toml`) installs Node, LibreOffice and ffmpeg, but no Lato. The issue check refuses a PDF without Lato, so production would refuse every register document until this is fixed: nothing typeset in a substitute font can go out | A separate release task (offered as a task chip). Make Lato available to LibreOffice on Railway (Lato is open-licensed, OFL 1.1), and verify on a Railway preview or staging deploy by rendering one preview and reading its embedded fonts. Don't set `DOCUMENT_FONT_CHECK=warn` for client issue |
| Project number | **Open: owner decision B5** | Your answers, then a small build (allocate, lock and carry forward) |
| Immutable issue and retrieval of earlier revisions | **In place, and verified on the sandbox** | One production check, below |
| Client-portal test failure | **Tracked separately, not CPB.** The Operations projects list fails once there are hundreds of projects. A separate fix session is running | Its own fix and review |
| Full final PDF inspection | **Done** (part A) | — |
| Legal and WHS wording | **Open** | Your WHS adviser confirms the B1 wording you choose, and the legacy-stone warning staff see |
| Blue Leaf sign-off | **Open** | Your separate sign-off for client issue, after the gates above |

**How immutable issue works:**
- Each revision is stored under its own path, and uploads never overwrite.
- The PDF's sha256 is recorded with the revision.
- One database transaction writes the new revision and marks the previous one superseded.
- A database trigger (`trg_lead_documents_issue_guard`, migration 213) refuses any change to, or deletion of, an issued row. Deleting the whole lead still cascades.

**Sandbox evidence:**
- R01, then R02 after a changed selection and drawing basis.
- R01 reopened after R02 is byte-identical to the original (sha256 `bf78934b…`).
- The registry shows R01 superseded and R02 current.

**Limit:** an administrator with the service key can still delete a stored file, because storage has no lock of its own. The recorded sha256 shows whether a file was changed.

**Production check (read-only):** run this in the Supabase SQL editor. It should return one row.

```sql
select tgname from pg_trigger where tgname = 'trg_lead_documents_issue_guard';
```

## D. Freezing the design once Blue Leaf approves

- Tag `cpb-2.4` (the cpb-2.3 design with the final-inspection fixes) as the frozen template.
- Pin the design tokens in `scripts/documents/design-system.mjs` with a test that fails if they change without a version bump. That covers colours, type sizes, spacing, table styles, the header row, the kicker and the footer.
- The Architect Design Brief and later documents import `design-system.mjs`; they don't copy it. A change to the foundation is then a deliberate new version, reviewed once, rather than drift between documents.

## Sign-off checklist for Blue Leaf

- [ ] B1 engineered stone: option, wording and related choices B1b to B1d.
- [ ] B2 status word, and whether a reference is required.
- [ ] B3 decision references.
- [ ] B4 stage labels.
- [ ] B5 project number answers.
- [ ] B6 a "what changed" note on revisions (yes or no).
- [ ] The five specimens read and accepted as the design.
- [ ] Release controls in C closed: Lato verified on Railway, WHS wording confirmed.
- [ ] Separate sign-off for client issue.

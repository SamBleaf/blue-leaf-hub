# C. Requirements matrix: the PBSA and the Tender Proposal as two separate documents

Planning note, 16 November 2026. **Read-only.** Nothing was edited, committed, uploaded or sent. No database, `.env`, Supabase storage or production system was touched.

Working names, following the owner's 16 Nov answers:
- **PBSA**: the paid pre-construction services agreement. The Hub calls it the PTSA.
- **Tender Proposal (TP)**: the fixed-price construction proposal produced from the Buildxact estimate in Module 5 (the "fee proposal").

---

## 0. Sources and citation conventions

| Short form | What it is |
|---|---|
| `Tab N:pM` | Master Register Google Doc `14WHJs4rbmZAX4b1J9q9H0tR-3kVlL7ZsPLE-45qEbtI`. Tab titled "N \| …", paragraph `[pM]` in the extract `scratchpad/pbsa/mr/tab_{N+1}.txt` (0-based, extracted 16 Nov). This is the same count research note C uses. Research note A used a different count. |
| `file:line` | Repo `/Users/samuelmorris/Desktop/blue-leaf-hub.nosync`, branch `doc-suite-r01`, HEAD `b0fc85c` (16 Nov). The only commit since the research notes is the docs-only `TENDER_PROPOSAL_REVIEW.md`. |
| `Draft:L` | Line L of the text extract of `~/Downloads/PBSA DRAFT COPY-2.docx` at `scratchpad/pbsa/research/x/PBSA_DRAFT_COPY-2.txt`. Pandoc is not installed on this Mac, so I used the existing extract made with `tools/docx2txt.py`. Lines 1–93 are the agreement (pp. 1–10); lines 94–554 are the appended Q1196 construction proposal (pp. 11–37). |
| `Spec §NN` | Drive `1mYYlFaptld84NPhOOMZt-r53KQpAP5IbtZdqO23Mm6s`, "Fixed-Price Tender Proposal — Page, Data & Design Specification v0.1", read 16 Nov. |
| `APB-sales:L` | `/Users/samuelmorris/Desktop/blueprint-agent/src/blueprint/knowledge/apb-sales.md` (4,557 lines; byte-identical to its `_staging` copy). |
| `APB-presales:L` | `~/Downloads/apb-presales.md` (the APB 13-section proposal outline). |
| `BWCA s` / `Regs 2026 r` | Building Work Contractors Act 1995 (SA), version 15.1.2026, and Building Work Contractors Regulations 2026, version 1.9.2026. Read from the sibling legal agent's local copies in `scratchpad/pbsa/planning/law/` and from legislation.sa.gov.au (URLs in §7). |
| `Owner 16 Nov` | The owner's answers in this phase's request: two different documents, both to be built; page 6 = construction programme; claims approved except the 25 % margin; 5/20/30/20/15/10 preferred subject to SA law; Playfair Display + Lato per the Spec; take it back to planning. |

APB and ZJ material is third-party. It is paraphrased here, never reproduced. Client names from real proposals are left out; jobs are named by quote number.

---

## 1. The answer in brief

1. **Two documents, two moments, two kinds of signature.** The register has required this since 5 Nov (Tab 13:p43, p60, p78–p79; Tab 15:p7). APB's own method splits it the same way (§2).
   - **The PBSA** is the paid pre-construction services agreement.
     - It is signed at stage 5, "PTSA / Plans" (key `fee_proposal`).
     - It buys the design, consultant, approvals and pricing work that makes a fixed price possible.
     - It carries a services fee and no construction price.
   - **The Tender Proposal** is the construction offer.
     - It is produced at stage 7, Tender, after RFQs and a priced Buildxact estimate.
     - It carries the fixed price, inclusions, PC/PS, exclusions, the progress-payment schedule and the **construction programme** (its page 6).
     - It is not itself a contract. The signed building contract follows it.
2. **Most of the current mess comes from four places.**
   - **One label for two documents.** "PBSA" is used for the proposal in Spec v0.1 (§01, §02 S1, §04 P06, §10 Gate 0, §11 D-01), `SCHEDULE_DECISIONS.md:6,17,27`, `scheduleGantt.mjs:4` and `TENDER_PROPOSAL_REVIEW.md:11,59`.
   - **A draft that holds both documents.** `PBSA DRAFT COPY-2.docx` is pp. 1–10 agreement plus pp. 11–37 of another client's proposal (Tab 13:p43).
   - **"Fee proposal" means two things.** The PTSA stage key is `fee_proposal`, while Module 5's construction proposal is also called the "fee proposal".
   - **Construction content in the agreement.** Warranties, "every home" inclusions, fixed-price language and the 25 % margin were copied into the agreement draft (Draft:73–93).
3. **The owner's 16 Nov answers settle where these belong.** §6 lists 36 misplaced or double-claimed requirements, each with where it belongs. The headline moves:
   - All construction promises (warranties, "every home", weekly site meetings, portal features, fixed price) move to the TP.
   - The 25 % margin goes nowhere.
   - The construction Gantt goes to TP page 6. The PBSA gets its own pre-construction programme (Tab 15:p30–p38). Its draft's only note on that page, "INC COUNCIL APPROVAL IN THIS" (Draft:65), already points that way.
4. **One new legal flag bears directly on the PBSA.** It needs SA legal advice before any fee terms are designed.
   - BWCA s 30(1) and (2a) restrict what a builder may demand under a **"preliminary work contract"**. Section 30(4) defines that as a contract related to a contemplated domestic building work contract, for work preliminary or ancillary to it. The maximum penalty is $100,000 for an individual and $500,000 for a body corporate.
   - On a plain reading, the permitted payments are:
     - genuine progress payments for work already performed;
     - payments to third parties for engineering, drawing, surveying or other professional services;
     - statutory fees and building indemnity insurance.
   - The live PTSA prints "50 % payable upon execution" (PTSA template §3). The Hub raises the design-fee invoice as soon as the PTSA is signed (SOP 02-20:39, due in 14 days per `xeroInvoices.mjs:38`). Both look exposed. §7 has the detail.
5. **The preferred 5/20/30/20/15/10 schedule is lawful in form for the TP and the building contract, with two conditions.**
   - The deposit must not exceed 5 % (BWCA s 30(4)(d)(ii)).
   - Every claim must be a genuine progress payment for work already performed (s 30(1)(a)), requested in writing (s 30(3)).
   - SA prescribes no stage percentages. Whether 30 % at frame is "genuine" depends on each job's cost profile, so the TP needs a per-job check against the Buildxact cost, not just a 100 % sum check.
6. **Typeface.** The owner chose Playfair Display headings with Lato body, as the Spec sets out. Two things follow:
   - Playfair must be bundled and proven on Railway, as Lato is on `release/lato-railway` (R1). Spec §03 says to stop the design lock if it can't be proven.
   - Whether the PBSA also uses Playfair is an open question. The owner answered for the TP.

---

## 2. What APB's sales file says (the owner asked us to check it)

APB describes three **paid** steps before construction starts (APB-sales:3211–3238; sequence at :839, :979):

| APB step | What it buys (APB) | Blue Leaf equivalent | Hub artefact today |
|---|---|---|---|
| Concept design agreement | Concept sketches, an agreed number of revisions and meetings | Concept Agreement (Concept Design Package) | `public/templates/concept-agreement-template.docx`, generated at Concept (stage 4) |
| **Preliminary building agreement (PBA)** | Everything needed before the contract: itemised quotation, detailed schedule, engineering, contour surveys and so on, so that a fixed-price proposal can be made (APB-sales:3220) | **PBSA**: "Full Design Package and the pre-construction agreement all in one" (SOP 02-20:37) | PTSA generator `salesRoutes.mjs:2357-2430`; draft pp. 1–10 |
| Fixed-price construction proposal | The fixed price, earned by completing the preliminaries first (APB-sales:2765–2789). It is an acceptance step, not the legal contract (APB-sales:1664–1687, 2793–2822) | **Tender Proposal** | Module 5 `BLB_TENDER_TEMPLATE.docx` (working) and `BLB_APB_TEMPLATE.docx` (newer) |
| Building contract | The legal instrument, signed last | MBA SA or HIA SA form (the Sales blueprint's CT-00 discovery; `b-ext/sales_active_blueprint.txt:665`) | External PDF, uploaded at Tender; hard gate into Won (`stageGates.js:139-145`) |

What APB puts in each, and where it conflicts with the register:
- **PBA (the PBSA).** APB gives the purpose and the price range only. It gives no clause pack, no deliverables matrix and no SA legal terms (Tab 15:p6). ZJ's PBA, which follows the APB shape, covers:
  - brief;
  - included services;
  - fee with an acceptance form;
  - a two-stage programme (Design, then Approvals);
  - an approvals explainer;
  - about 10 pages of marketing.

  Research B §7 has the detail. The register keeps the structure and drops the marketing and the guarantees (Tab 13:p24–p27).
- **Fixed-price proposal (the TP).** APB's 13 sections are, in order (APB-presales:62–160):
  1. cover;
  2. introduction;
  3. fixed price and scope;
  4. why us;
  5. online project management;
  6. guarantees;
  7. testimonials;
  8. construction schedule;
  9. awards;
  10. licences;
  11. progress payments;
  12. next step;
  13. summary.

  Three APB defaults conflict with Blue Leaf decisions:
  - the variation margin of cost plus 25 % (APB-presales section 3; APB-sales:2777) is rejected by the owner (16 Nov);
  - APB membership in "why us" and licences (APB-presales sections 4 and 10) is never client-facing (SOP 02-20:129; Tab 11:p89);
  - a schedule "guarantee" template (APB-presales section 8) conflicts with "the client page never advertises padding" (`SCHEDULE_DECISIONS.md:12`).

  APB's payment default is 5/20/20/25/25/5. That is the Hub's *server* default (`feeProposalTransform.mjs:210-217`); the owner's preferred schedule is the wizard default (`feeProposalDefaults.js:9-16`).
- **Detail.** The full APB section-by-section reading is in the sibling note `scratchpad/pbsa/planning/A-apb-method.md`. This matrix only uses APB to confirm the split.

---

## 3. The matrix, side by side

| | **PBSA: pre-construction services agreement** | **Tender Proposal: fixed-price construction proposal** |
|---|---|---|
| **Purpose** | Commit the client to the paid design, consultant, approvals and pricing work, before any building contract. Records what the fee buys and what it doesn't. "Separate preliminary cost indication and fixed-price proposal; do not promise final contract price" (Tab 15:p7, p13, p26) | Make the construction offer: one current scope, a fixed price inc GST, inclusions, PC/PS, exclusions, options, programme and payment schedule, with a clear next step to the building contract (Spec §01, §04; Tab 26:p89; blueprint Tender 04–06) |
| **Reader** | Homeowner(s), as **signatory**; Blue Leaf directors are the counterparty (Tab 13:p78) | Homeowner(s), as **decision-maker**. Not a signatory: acceptance belongs to the contract (Spec §04 P08 rule) |
| **Stage (8-stage pipeline)** | Proposed at 4 Concept (`winning_offer`): "PTSA deliverables proposal" (Tab 03:p15). Fee set there (`stageGates.js:116-117`). **Issued and signed at 5 PTSA / Plans (`fee_proposal`)** (Tab 03:p18; SOP 02-20:25-37). Not used on architect-tender, plans-supplied or build-only pathways (Tab 26:p184; `DOCUMENT_SUITE.md:97`) | **Generated and presented at 7 Tender**, after RFQs and a priced estimate. Sub-status `estimate_review → proposal_generated → proposal_presented → client_reviewing` (`constants.js:179-180`; SOP 02-22:65). The accepted proposal's value stamps `original_contract_value` at 8 Won (Tab 02:p78) |
| **Gate** | Entry to stage 5 (all advisory): concept design approved, pathway explained, fee set (`stageGates.js:109-118`). Exit: "PTSA signed" into Consultants is **advisory** in code (`stageGates.js:121-124`) but described as required in SOP 02-20:121. Payment is never a gate (D-029, Tab 01:p115; D-038, Tab 01:p195). The design-fee invoice is allowed only once signed (SOP 02-20:118) | Today "Fixed-Price proposal generated" is an advisory **entry** check for Tender (`stageGates.js:127-128`). It is misplaced (§6 row 27). Exit to Won is a **hard** gate: building contract signed **with** the signed PDF on file (`stageGates.js:139-145`) |
| **Inputs** | Lead and register only. **No Buildxact**: no estimate exists at Concept or PTSA (`PROJECT_NUMBER_DECISION.md:12`). Detail in §4.3 | Buildxact Estimate Items XLSX plus the saved `fee_proposals` row plus the canonical signed-off schedule. Register only through a tested adapter (Spec §02 C10). Detail in §5.3 |
| **Section-by-section** | §4.4 (11 sections from Tab 15:p11-p20) | §5.4 (8 locked pages and appendices A–F from Spec §04-§05) |
| **Must never appear** | §4.5: any construction price, quote or other-client data; construction warranties, guarantees, fixed-price or margin language; the construction Gantt; placeholders | §5.5: the 25 % margin, example testimonials, placeholders, buffer or "under-promise" wording, a 110 % schedule, APB, a contract-acceptance block, the PBSA's own terms |
| **Commercial terms carried** | Services fee (one GST basis), fee milestones, third-party and authority fee treatment, extra-services process, revision limits, credit against the contract (if kept), IP and use of drawings, termination and exit, validity (Tab 15:p17, p23-p25) | Fixed price inc GST; PC and PS listed separately; options outside the base price; exclusions; 5 % deposit; progress-claim schedule; variation process (no 25 %); validity; programme in weeks from site start; approved warranties; the credit for any PBSA fee |
| **Signature / acceptance** | **Signed by the client and an authorised Blue Leaf director** (PTSA §6; Draft:60-63). The legal signing method is to be reviewed: the portal `/sign` click is not adequate (Tab 13:p89; Tab 15:p27) | **No signature block** by default (Spec §04 P08). The client "confirms intention to proceed", which staff record with **Mark as Accepted** (`FeeProposalWizard.jsx:1283` → `leads.fee_proposal_id`). Then the building contract is signed and uploaded |
| **Issued and recorded: today** | "Generate PTSA Document" downloads a DOCX that is **not stored** (`LeadDetail.jsx:2365`; SOP 02-20:116). It is signed off-Hub. Mark-signed uploads the signed PDF to `lead-documents`, stamps `ptsa_status='signed'`, inserts a `lead_documents` row `ptsa_signed`, and creates the job and Dropbox tree (`salesRoutes.mjs:1901-2058`) | Wizard → DOCX or Google Doc → PDF (Drive export or LibreOffice) → Dropbox presale folder → email, status `sent` → Mark as Accepted (`module5Routes.mjs:475-698`; `FeeProposalWizard.jsx:669-733`). No issue snapshot or revision, and Google Docs hand edits are not recorded (A §4.5 O7) |
| **Issued and recorded: target** | Doc-suite controlled issue: Register → payload → DOCX → PDF → immutable `lead_documents` issue with `R0n` revision, `BLB-[TYPE]-[REF]-R0n` code, snapshot and preview-before-issue (`DOCUMENT_SUITE.md:5`, §2; mig 213 guard, R8). Then signed evidence through mark-signed. Needs a new document type (as mig 220 did for CSP) and a type code (R6) | One snapshot per issued proposal: quote source and hash, saved fields, approved company-copy version, programme fingerprint, image IDs and template hash. Immutable revision `BLB-FCP-[REF]-Rnn`, with the Buildxact quote number kept separate (Spec §08, §11 D-06). Superseded on any price or drawing change (blueprint Tender 05) |

---

## 4. PBSA in detail

### 4.1 Purpose and position
- A "genuinely paid SERVICES AGREEMENT". It is not the issue-only Client Project Brief, not the fixed-price proposal and not the building contract. Each keeps its own IDs, approval and signature rules, and template (Tab 15:p7; Tab 13:p40, p86).
- "The client must never mistake PTSA for a fixed-price building contract" (Tab 26:p85).
- APB frames it as the paid step that buys the preliminaries a defensible fixed price needs (APB-sales:3220, 2773).
- The owner decided (Aug 2026) that the PBSA is the Full Design Package and the pre-construction agreement in one: one agreement, one fee (SOP 02-20:37; `xeroInvoices.mjs:32` "design_package_fee ≡ preconstruction_fee").

### 4.2 Reader, stage and gate
Covered in the §3 matrix. Two extra points:
- **Relationship to the CPB.** The Client Project Brief, issued at Concept, already ends with "one concise PTSA clarification" in its Next steps (`DOCUMENT_SUITE.md:97`). The PBSA must use the same name and boundary as that clarification.
- **Name still open (R6).** The candidates in the evidence are:
  - "Preliminary Building Sales Agreement" (Draft:3);
  - "Pre-Tender Service Agreement" (PTSA template; `conceptEmails.mjs:70`);
  - "the pre-construction agreement" (CPB).

### 4.3 Inputs

| Field | Source today | Status |
|---|---|---|
| Client legal name(s) | `leads.name` is canonical (owner decision, memory: lead→job identity). The PTSA builds the name from `first_name`/`last_name` (`salesRoutes.mjs:2393-2395`), which loses the second person of "A & B" | **Fix**: use `leads.name` |
| Client contact, site, project type, delivery pathway | `leads.email/phone/site_address/project_type`; pathway on the lead or brief | Exists. Placeholders like `[SITE ADDRESS]` print when empty (`salesRoutes.mjs:2393-2401`), which must become a pre-issue block (Tab 11:p91; Tab 15:p28) |
| Fee | `leads.preconstruction_fee` (≡ `design_package_fee`), set at Concept; read-only at PTSA (SOP 02-20:37) | Exists. **GST basis conflict, confirmed in code**: the PTSA prints it as "(inc. GST)" (`salesRoutes.mjs:2380`), but Xero bills the same number ex-GST (`xeroRoutes.mjs:95,105`; `xeroInvoices.mjs:9,217`) |
| Services / deliverables | `leads.ptsa_services`, a flat list of 7 pre-tender labels, 5 on by default (`salesRoutes.mjs:283-296`) | **Gap.** Tab 15:p14 needs per-deliverable owner, revision allowance, included/excluded, third-party cost responsibility, milestone, acceptance condition and dependencies. No such data model exists |
| Scope summary | `leads.ptsa_project_scope`; register brief fields via `documentPayloads.mjs` (allowed: "safe scoped fields such as project brief and deliverables", Tab 18:p101; Tab 22:p33) | Partial. Reference the issued CPB revision rather than re-capturing it (Tab 13:p86) |
| Drawing basis | Register `planRev` (concept set) (`DOCUMENT_SUITE.md:39`) | Exists in the register |
| Consultants and who engages them | Consultant roster / `job_contact_roles` (Tab 20:p119) | Exists. Who pays is not modelled (Tab 15:p23) |
| Pre-construction programme | Stage-entered timestamps, `lead_meetings`, PTSA signed date, consultant statuses, approval references, tender events (Tab 15:p35); `leads.desired_start_date` | **Gap**: "No sales 'agreed milestones' table" (Tab 20:p151). First version = milestone table plus a thin stage band (Tab 15:p37) |
| Terms | `ptsa_validity_days` (default 14), `ptsa_credit_to_contract`, `ptsa_special_terms` (mig 045) | Exists. No approved clause pack (Tab 15:p6, p22; PTS-02) |
| Builder identity | ABN hardcoded (`salesRoutes.mjs:2404`); licence BLD 332830 (concept template footer) | Exists. Verify both are current |
| Agreement reference | `PTSA-{year}-{lead id 6}` (`salesRoutes.mjs:2387`) | Replace with the doc-suite code once R6 sets the type |
| **Not an input** | Buildxact estimate, quote number, `fee_proposals`, construction schedule | None exists at stage 5 (`PROJECT_NUMBER_DECISION.md:12`) |

### 4.4 Section-by-section contents (what the owner's sources ask for)
The register's own structure (Tab 15:p9-p20) is the spine. It aims at about 6–10 purposeful pages plus an annexure, and is "not a mandated page count" (Tab 15:p10). The last two columns say what exists today.

| # | Section | Required content (source) | Draft pp. 1–10 | PTSA generator |
|---|---|---|---|---|
| 01 | Cover / document control | Client, site, agreement type, issue and revision, reference and date; one restrained real photo is optional (Tab 15:p11; Tab 13:p68; Tab 11:p88 "presentation" layout) | Cover, photo, title, "Prepared for / At", but "**Quote Number** - 1234" and test client (Draft:2-9) | Title block, ref, issue date, valid until; no logo |
| 02 | Short letter | Director signatory, plain voice (Tab 13:p23; website voice Tab 13:p69) | "Thank You" letter (Draft:11-17) | none |
| 03 | Client and project summary | What they want to achieve, broad existing and new work, design basis, project type and delivery; auto-filled (Tab 15:p12). ZJ adds a budget anchor (Tab 13:p18) | "Client Brief" table full of placeholders and a sample budget and timeframe (Draft:19-25; Tab 13:p44) | "Project scope and key requirements" free text |
| 04 | What this stage achieves | The work proposed, why it comes before a building contract, what is excluded, the status of preliminary costs and the expected result (Tab 15:p13) | missing | missing |
| 05 | **Deliverables and responsibilities (core)** | Architecture, design changes, engineering, NatHERS, survey and soil, selections, planning and building approvals, certifier, **updated cost plan, detailed tender package**, client meetings, consultant coordination. For each: owner, revision allowance, included/excluded, third-party charge, milestone, acceptance, dependencies. "Do not promise every item on every job" (Tab 15:p14). ZJ states quantities such as 3 concept options (Tab 13:p19) | "Inclusions — Services included": concept review, plans, 3D, engineering, NatHERS, council, private certifier (Draft:26-50). No owners, limits or cost responsibility | 7 pre-tender services plus 4 fixed deliverables, including "Final tender price valid for 30 days" (template §2, §4) |
| 06 | Scope assumptions and exclusions | Who engages consultants, existing information quality, site conditions, authority timings, changes outside revisions, client data, optional services, survey assumptions (Tab 15:p15) | missing | missing |
| 07 | **Pre-construction programme** | Phases Concept → Paid pre-construction → Design/Consultants → Approvals → Pricing/Tender → Contract → Construction, showing only the relevant ones. Indicative windows or conditions, decision checkpoints, who must act. Marked indicative or confirmed. "Timing to be confirmed following consultant programme" rather than a blank. No fake precision (Tab 15:p16, p30-p38). ZJ's approvals explainer is a good model (Tab 13:p22). **Owner 16 Nov: the service agreement covers the pre-construction stages** | "Process and Timeline", empty apart from "INC COUNCIL APPROVAL IN THIS" (Draft:64-65) | "Preliminary schedule of works" as a deliverable only |
| 08 | Fee and commercial terms | Fee inc/ex GST "clearly", itemised or staged; invoice milestones; whether third-party fees are included; extra services; permit and authority fees; deadlines; cancellation and exit. Also revision limits, copyright and use rights, who owns purchased reports, GST, refunds, suspension (Tab 15:p17, p23-p25). Legal review needed (Tab 13:p85) | One line, "$15,000 including GST" (Draft:51-59). No milestones or terms | Fee, credit clause, 50/50 terms, exclusivity, IP, confidentiality, non-proceeding, validity (template §3, §5) |
| 09 | How decisions and communication work | The register, client meetings, scope approvals, when documents become issued. **No portal promise before authorised onboarding** (Tab 15:p18) | missing | missing |
| 10 | Next steps and acceptance | What happens when signed, what information is needed, who the contact is; signatures (Tab 15:p19) | "Client acceptance" lines (Draft:60-63) | §6 Acknowledgement, both parties |
| 11 | Annexure (if needed) | Drawing list and revisions, deliverables schedule, CPB reference, consultant appointments, service exclusions. "**No duplicate full construction proposal**" (Tab 15:p20) | pp. 11–37 hold another client's full construction proposal | none |

Two draft sections sit outside the register's list:
- Draft "Why Blue Leaf" (Draft:66-77) and "Guarantees" (Draft:78-93) are not in Tab 15's sequence. §6 rows 3–5 say where their content belongs.
- An "about us" page in the PBSA is optional and is an owner question (Q6).

### 4.5 Must never appear in the PBSA
- **Any construction price, quote number, Buildxact data or other-client data.** These "must NEVER ship together" (Tab 13:p43); "no cross-job carry-over" (Tab 15:p28).
- **The construction proposal's warranties, fixed-price language or margin clauses**, by default (Tab 13:p46, p85). The 25 % margin never appears in either document (Owner 16 Nov).
- **The construction programme** in weeks from site start (Owner 16 Nov). Only the pre-construction programme belongs here, with Construction as an end marker.
- **A promise of the final contract price** before documentation and pricing are complete (Tab 15:p26), and any wording that could read as a building contract (Tab 26:p85).
- **A portal promise** before authorised onboarding (Tab 15:p18; D-028 Tab 01:p112).
- **Placeholders and test content**: "Insert clients ideas", "ect", dotted lines, sample budget or timeframe, "INC COUNCIL APPROVAL IN THIS" (Tab 13:p44-p45). Also `[TO BE DETERMINED]`, `[CLIENT NAME]`, `[SITE ADDRESS]` and `[Scope to be confirmed with client]` (`salesRoutes.mjs:2381,2393-2401`). "NO ISSUE button until requirements pass" (Tab 11:p91).
- **APB references, website-banned words, unsupported awards, testimonials or guarantees** (Tab 13:p25, p50, p69; Tab 11:p89). The draft says "bespoke" and "seamless" (Draft:71).
- **Internal margin or cost basis** (D-004, Tab 01:p18).

### 4.6 Signature and acceptance
- Signed by the homeowner(s) and an authorised Blue Leaf signatory, as in the PTSA template's §6.
- **The method needs legal review.** Portal click-acknowledgement is not proof (Tab 13:p89; blueprint PTSA 03), and there is no e-signature engine (Tab 11:p111).
- **If the PBSA is a building-work-related contract under BWCA**, s 28-style formalities may matter: in writing, all terms, licence name and number, signed personally. That is a question for the lawyer (§7).

### 4.7 Issue and record
- **Today**: download only, nothing stored (SOP 02-20:116). The signed PDF is uploaded through `POST /api/sales/leads/:id/ptsa/mark-signed`, which also creates the job (`salesRoutes.mjs:1901-2058`).
- **Target**: controlled issue (preview, then issue `R0n` with snapshot and recipient), then a separate "signed" event with evidence. Preview, issue, sent, signed and payment are distinct events (blueprint PTSA 02). The Xero invoice stays a separate commercial event (D-029).

---

## 5. Tender Proposal in detail

### 5.1 Purpose and position
- "Blue Leaf's principal client-facing construction offer", developed from the newer template and keeping the original as fallback (Spec §01).
- Register D5 in Tab 13:p79. The same document is D6 in Tab 22:p43 and Tab 20:p247, so the numbering collides.
- Its basis is "one coherent current scope and assumptions, clear inclusions/exclusions/allowances and pricing maturity" (Tab 26:p89).

### 5.2 Reader, stage and gate
Covered in the §3 matrix. Two cautions:
- **Consultants-stage link.** The Consultants stage shows a "Generate Fixed-Price proposal →" link (`LeadDetail.jsx:2441-2448`), and the Tender **entry** check asks for a generated proposal (`stageGates.js:127-128`). Both sit before RFQs and pricing, which is the wrong place (blueprint TEN-02; C §12.8).
- **Pathways without a PBSA.** On architect-tender and build-only pathways there is no PBSA, so the TP must not mention a PBSA credit.

### 5.3 Inputs

| Field | Source | Status (Spec §06 unless noted) |
|---|---|---|
| Price, GST, category summary | Buildxact Estimate Items XLSX → `parse-xlsx` (`module5Routes.mjs:52-152`) → `total_inc_gst`, `SUMMARY_ROWS` | Verified. Validate against the current estimate at issue |
| PC/PS | Buildxact `Allowance` flag only → `pc_sums` (`feeProposalTransform.mjs:152-166`) | Verified for XLSX. PDF imports must say "PC/PS verification required" |
| Inclusions | `inclusion_sections` plus categories plus the RFQ blend (`module5Routes.mjs:158-190`) | Verified; needs staff review |
| Exclusions | `fee_proposals.exclusions` plus `DEFAULT_EXCLUSIONS` (`feeProposalTransform.mjs:193-207`) | Verified; wording approval not proven |
| Options | `optional_items` | Verified; the section is conditional |
| Payment schedule | `fee_proposals.fee_schedule`; defaults differ: client 5/20/30/20/15/10 (`feeProposalDefaults.js:9-16`), server 5/20/20/25/25/5 (`feeProposalTransform.mjs:210-217`). The 100 % guard is never called (`:220-222`) | **Owner 16 Nov: 5/20/30/20/15/10.** Align the server default, call the guard, and add the per-job "genuine" check (§7) |
| Identity | `fee_proposals.client_name/address/architect_name`, job and lead hydration (`FeeProposalWizard.jsx:249-329`) | Verified. Reconcile with `leads.name` and `jobs.address` before issue |
| Quote number | Mirrors Buildxact Q-number (`feeProposalTransform.mjs:234-236`) | Verified. Kept separate from the BLB document code (Spec D-06) |
| Date, floor area | Not persisted by `proposalToDb` (`FeeProposalWizard.jsx:81-111`) | **Gap**: re-sends print today's date |
| Drawing basis | `arch_ref` / `eng_ref` / `spec_ref` strings | Partial: Appendix F needs a revision-aware mapping |
| **Construction programme** | Buildxact SCHED → `buildCanonicalSchedule` → Gantt (`salesRoutes.mjs:889`), sign-off (`:903`) | Partial. Two models (`buildRelativeSchedule`, `feeProposalTransform.mjs:413-469`, versus canonical). The sign-off is timestamp-only, and no image module is installed |
| Company content (why us, warranties, portal, licences) | `APB_CONTENT` constants (`feeProposalTransform.mjs:332-368`); the `p.apb` overrides have no UI and aren't persisted | **Replace** with a versioned, owner-approved company-content block (Spec §06, §08) |
| PBSA link | `leads.ptsa_status`, `ptsa_credit_to_contract`, `preconstruction_fee` | New: needed only if the credit is shown |
| Register | Separate pipeline (`registerDocuments.mjs`) | Not a direct source. Needs a tested read-only adapter (Spec C10; Tab 27:p308). The TSN is internal and must not feed client copy (Tab 27:p303-p304) |

### 5.4 Section-by-section contents (Spec v0.1, now confirmed as the TP's structure)

| Page | Content (Spec §04-§05) | Owner 16 Nov effect |
|---|---|---|
| P01 Cover | Project photo or a typographic alternative; "Fixed-Price Construction Proposal"; address, prepared for, quote reference, date, revision; no price | Playfair title, per the Spec |
| P02 Introduction and understanding | Director introduction of 60–90 words; snapshot; "our understanding" of 90–130 words from a reviewed tender summary | — |
| P03 The offer | Total inc GST, tender status, validity, drawing basis; included / allowances / outstanding-conditions panels. Hard gate: no $0, stale estimate, unclassified PC/PS or unqualified fixed price | Validity is a policy field (Q9) |
| P04 Scope and tender basis | 4–6 construction-system groups marked included, excluded or clarify; drawing basis | — |
| P05 Why Blue Leaf | At most three proof-based points | **"Every home" standard inclusions and the warranties are approved**; still check them against the job's inclusions (§6 row 4) |
| **P06 Process and timeline** | **Construction programme**: about N weeks from site commencement; 8-stage Gantt from the canonical engine; stage table; neutral basis note; signed-off source fingerprint; no dates; no buffer disclosure | **Confirmed: construction programme** |
| P07 How we deliver | People, site and quality coordination, updates and approvals; portal only if it is real | **Weekly site meetings and portal features approved** |
| P08 Next steps | Review → clarify → confirm intention to proceed to the formal contract. No contract acceptance on this page | — |
| App. A | Inclusions by Buildxact category | — |
| App. B | PC and PS listed separately, with assumptions | — |
| App. C | Exclusions, by-others and clarifications | — |
| App. D | Options, only if they exist | — |
| App. E | Price summary plus progress claims, validated to 100 % | 5/20/30/20/15/10, subject to §7 |
| App. F | Drawing and specification register | — |

The Spec does not place three items:
- **Responsibilities (ours and yours).** These are in APB and the newer template (`feeProposalTransform.mjs:362-368`). Fold them into P07 or Appendix C, and fix the contradiction first (§6 row 18).
- **Licences.** Licence number and ABN are facts; MBA membership needs confirmation; APB never (Q14).
- **Testimonials.** Only real ones with permission, otherwise omit (Spec §07; Q13). The SOP checklist expects them (SOP 02-22:67).

### 5.5 Must never appear in the TP
- **The 25 % variation margin**, in either the variations clause or the "Fixed Price" guarantee (`feeProposalTransform.mjs:340-341,349`). This is the owner's decision, and SA law adds a reason (§7).
- **Example testimonials**, the "[ Replace with portal screenshot ]" box, `[ADD WEEKS]`, blank "Starts week / Duration" cells, $0.00 and blank address or date (Tab 13:p56, p58; A §5A N1, N2, N6).
- **Buffer or padding language**: "under-promise and over-deliver" (`feeProposalTransform.mjs:339`; `SCHEDULE_DECISIONS.md:12`; Spec P06). Also no calendar dates before commencement is agreed.
- **A schedule that doesn't total 100 %.** The static original template prints 110 % (A §4.5 O2).
- **APB membership or any APB reference** (`feeProposalTransform.mjs:360`; SOP 02-22:112).
- **Internal markup or margin.** `fee_proposals.markup_percent` is stored and must never print (D-004).
- **A contract acceptance or signature block** (Spec §04 P08 rule).
- **"Fee proposal" or "fee structure" wording**: "provide this fee proposal… fee structure", "queries on this fee proposal within 14 days", the email subject "Fee Proposal - …" (`feeProposalTransform.mjs:224,226`; `feeProposalDefaults.js:18,20`; `FeeProposalWizard.jsx:642`). "Fee" belongs to the PBSA.
- **The PBSA's own content**: its service list, fee acceptance form and client-brief table.
- **Engineered stone** (R3); website-banned words; unverified awards.

### 5.6 Signature, issue and record
Covered in the §3 matrix. One addition: the building-contract form, MBA SA or HIA SA, is still open (blueprint CT-00) and should be named on P08 (Q11).

---

## 6. Requirements claimed by both, or by the wrong one, and where each belongs

| # | Requirement / content | Where it is claimed now | Belongs in | Basis |
|---|---|---|---|---|
| 1 | The name "PBSA" for the construction proposal | Spec §01, §02 S1, §04 P06, §10 Gate 0, §11 D-01; `SCHEDULE_DECISIONS.md:6,17,27`; `scheduleGantt.mjs:4`; SOP 02-26:107,179; `TENDER_PROPOSAL_REVIEW.md:11,59` ("reading B assumed") | **PBSA = the agreement only.** Retitle these references "Tender Proposal". Spec v0.1 needs a terminology revision (v0.2), and `TENDER_PROPOSAL_REVIEW.md` is superseded by the owner's answer | Owner 16 Nov; Tab 13:p78-p79 |
| 2 | Draft pp. 11–37 (Q1196 construction proposal) | Inside the PBSA draft | **TP only**, as a sandbox regression specimen (Spec §09 T2). Never as PBSA content | Tab 13:p43, p47 |
| 3 | Warranties: 10-yr structural, 5-yr non-structural, transferable, 6-month defects | PBSA draft "Guarantees" (Draft:81-88); TP P05 / `GUARANTEES` (`feeProposalTransform.mjs:345-348`) | **TP** (P05), then the building contract. **Not the PBSA** by default. Approved as policy, but the comparison wording needs SA review (§7) | Tab 13:p46, p85; Owner 16 Nov |
| 4 | "Every home" standard inclusions (LVL frames, membranes, vented cavity, double glazing, "at no extra cost") | PBSA draft "Why Blue Leaf" (Draft:73-76); TP `WHY_BUILD_WITH_US`, `NICHE_STATEMENT` | **TP** P05, approved. Add a consistency gate: the claim must not contradict the job's Appendix A. The original template lists double glazing as a job item, and inclusions differ between jobs (research B §6.4) | Owner 16 Nov; Spec P05; Tab 15:p27 |
| 5 | "Fixed Price — the price you sign is the price you pay" | PBSA draft (Draft:89-90); TP guarantee (`feeProposalTransform.mjs:349`) | **TP only**, rewritten without the 25 % and consistent with the PC/PS appendix. The PBSA must instead say preliminary costs are not a fixed price | Tab 13:p85; Tab 15:p26; BWCA s 29(1) |
| 6 | Variation margin 25 % | PBSA draft (Draft:90, 148, 186); `VARIATIONS_CLAUSE` (`feeProposalTransform.mjs:340-341`); APB template | **Neither.** The TP explains the variation process with no percentage unless the owner sets one (Q8) | Owner 16 Nov; research B §6.2 |
| 7 | Weekly site meetings / updates | PBSA draft "weekly site updates" (Draft:77) and "Weekly updates" (Draft:92); TP `GUARANTEES` "Weekly on-site meetings" (`:350`); three different wordings (research B §6.4) | **TP** P07, approved; use one wording. The PBSA describes pre-construction meeting cadence (design and review meetings) in §09, not site meetings | Owner 16 Nov; Spec P07 |
| 8 | Portal features | TP `ONLINE_PM_BODY` and template tiles; the draft's appended proposal (Draft:196-198) | **TP** P07, approved, stating only what the live portal does (Spec P07). **The PBSA must not promise the portal** before onboarding, unless the owner extends the pilot's early access to the PBSA (Q15) | Owner 16 Nov; Tab 15:p18; `R05_RELEASE_PACKAGE.md:54` |
| 9 | Page 6 "Process and Timeline" = construction Gantt | `SCHEDULE_DECISIONS.md:17` ("Home in the doc = the PBSA … page 6"); Spec P06 ("existing PBSA's reserved Process and Timeline page") | **TP** P06, the construction programme | Owner 16 Nov |
| 10 | Draft's own p. 6 timeline (pre-construction, "INC COUNCIL APPROVAL") | PBSA draft (Draft:64-65) | **PBSA** §07, the pre-construction programme (Tab 15 §C) | Owner 16 Nov; Tab 15:p30-p38 |
| 11 | "Quote Number" and "Job Number" labels | PBSA draft (Draft:8, 53) | **TP** only (Buildxact Q-number). The PBSA uses an agreement reference / doc-suite code; there is no job number yet | `PROJECT_NUMBER_DECISION.md:12` |
| 12 | "Final tender price valid for 30 days from issue" | PTSA template §4 deliverable | **TP** validity, as a policy field (Spec P08). The PBSA can only promise to *deliver* a Tender Proposal | Spec P03, P08 |
| 13 | PBSA fee credit "within N days of the tender price being issued" (reuses the 14-day PBSA validity, `salesRoutes.mjs:2383-2385`) | PTSA only | **Rule in the PBSA**; the credit shown in the **TP** price summary or next step (Q4). The credit window must be its own field, not `ptsa_validity_days` | A §6 P2 |
| 14 | Detailed cost plan, preliminary schedule of works, tender report, specification | PTSA deliverables (template §2, §4; `salesRoutes.mjs:283-291`) | **PBSA** deliverables (what the fee buys). The client-facing *results* (the price and the programme) arrive in the **TP** | Tab 15:p14, p26 |
| 15 | Client brief table / project understanding | PBSA draft p. 3 (Draft:19-25); TP P02 "our understanding" | **Both, from one source.** Reference the issued CPB revision; never re-capture it or add placeholders | Tab 13:p86; Tab 22:p5-p11 |
| 16 | Payment schedule | TP fee schedule (wizard / server / template, three different defaults); PTSA "50 % on execution, 50 % on Detailed Cost Plan" | **TP**: construction progress claims 5/20/30/20/15/10. **PBSA**: its own fee milestones, designed after legal advice (§7). Never mix them | Owner 16 Nov; BWCA s 30 |
| 17 | Fee wording ("fee proposal", "fee structure", "Fee Proposal -" subject, "after the discovery meeting") | TP defaults (`feeProposalTransform.mjs:224,226`; `FeeProposalWizard.jsx:642`); catalogue (`templateCatalog.mjs:36`) | "Fee" language → **PBSA**. TP = "proposal" / "Fixed-Price Construction Proposal" | C §12.2 |
| 18 | "Our responsibilities: all local government fees and permits" against exclusions "council permits", "authority fees" | TP (`feeProposalTransform.mjs:364` vs `:200-201`) | **TP**: one rule. **PBSA**: authority and consultant fee treatment for the *pre-construction* stage (paid direct, reimbursed or included) is a PBSA term (Tab 15:p17, p23) | A §5A N3 |
| 19 | Exclusions | TP `DEFAULT_EXCLUSIONS` (construction); PBSA needs service exclusions | **Both, but different lists.** Never reuse construction exclusions in the PBSA | Tab 15:p15; Spec App. C |
| 20 | Signature / acceptance form | PBSA draft (Draft:60-63); ZJ PBA; APB suggests e-signing proposals (APB-sales:1701-1704); Hub "Mark as Accepted" on the TP | **PBSA: signed.** **TP: no signature block**; acceptance is recorded, then the contract is signed (Spec P08). Whether the TP has a written "intention to proceed" line is Q11 | Tab 13:p89; Spec P08 |
| 21 | IP / drawings ownership | Concept Agreement: the planning set is "yours to keep" (`x/concept-agreement-template.txt`, Full Design Package); PTSA 5.2: it "remains the property of Blue Leaf Building until the construction contract is executed" | **PBSA**, one rule, and the Concept Agreement must match it (Q5) | Tab 15:p24 |
| 22 | Fee amount instruments | Concept Agreement `DESIGN_PACKAGE_FEE`; PBSA draft $15,000; PTSA $3k–$25k samples (research B §6.6) | **One field** (`preconstruction_fee`), quoted at Concept and confirmed in the **PBSA** | SOP 02-20:37 |
| 23 | GST label on the services fee | PTSA "(inc. GST)" printed twice (`salesRoutes.mjs:2380` + template §3); Xero bills ex-GST | **PBSA**: one basis, stated once (Q3) | `xeroRoutes.mjs:95,105` |
| 24 | Testimonials, awards | Draft appended proposal (Draft:430-431, example text); TP template; SOP checklist | **TP only, real only**; none in the PBSA | Tab 13:p25; Spec §07 |
| 25 | Licences and associations (BLD, ABN, MBA, APB) | TP `LICENCES` (`feeProposalTransform.mjs:356-361`); Draft:440-443 | **TP**: licence and ABN (facts), MBA if confirmed, APB never. **PBSA**: licence and ABN in the parties block | SOP 02-20:129; Q14 |
| 26 | Why-us / company marketing | PBSA draft pp. 7–8; TP P05 | **TP**. The PBSA has at most a short factual "about us" (Q6) | Tab 13:p25, p49; Tab 15:p10 |
| 27 | "Fixed-Price proposal generated" as a Tender **entry** check; "Generate Fixed-Price proposal →" in Consultants | `stageGates.js:127-128`; `LeadDetail.jsx:2441-2448` | **TP is produced inside Tender** after pricing: move it to the sub-status or the Won exit | blueprint TEN-02; SOP 02-22:65 |
| 28 | "PTSA signed" gate: hard (SOP 02-20:121) or advisory (code) | SOP vs `stageGates.js:121-124` | **PBSA** gate. Decide hard or advisory; D-029 and D-038 allow work-ahead either way | C §12.7 |
| 29 | "Specs, allowances and the F&F schedule from Consultants feed the proposal" | SOP 02-22:65; `TenderStage.jsx:231` | **TP**, but it is untrue today. It needs the Register→TP adapter (Spec C10) | A §8 docs drift |
| 30 | Register "fee proposal / PBSA document" | Tab 18:p25, p101 | **PBSA** (the stage-5 agreement), not Module 5 | C §12.2 |
| 31 | D-numbers: D4 PTSA/PBSA; D5 proposal (Tab 13) vs D5 consultant request and D6 proposal (Tab 22, Tab 20) | Register | Record one numbering in a register decision | C §6 |
| 32 | Deferral: "Do NOT rebuild", "Owned elsewhere, not rebuilt" | Tab 13:p78; Tab 14:p15; Tab 20:p245; Tab 22:p33; Tab 23:p74; `DOCUMENT_SUITE.md:23` | Superseded by the owner's 16 Nov instruction that both documents be built. **Record it as a register decision (D-045)** and update `DOCUMENT_SUITE.md:23` | C §12.5 |
| 33 | Validity: PBSA offer 14 days; TP 30 days, hardcoded in three places | PTSA (`salesRoutes.mjs:2365`); TP templates, `DEFAULT_EXCLUSIONS` "(30 days)" (`feeProposalTransform.mjs:205`) | **Each document has its own validity field**, approved as policy (Q9) | Spec P08 |
| 34 | "$" ban in register documents | Doc-suite preflight (Tab 27:p264, p304) | **Both commercial documents print money**: a narrowly scoped money policy for PBSA and TP fields, with no global relaxation. The TSN stays currency-free | C §9 |
| 35 | Typeface | Doc suite Lato only (`design-system.mjs:14`); Spec Playfair + Lato | **TP: Playfair + Lato** (Owner 16 Nov). **PBSA: open** (Q7). Both need font-on-Railway proof (R1 extended to Playfair) | Spec §03; Tab 11:p79 |
| 36 | Pre-construction deliverables (3D, NatHERS, council approval, certifier) | PBSA draft (Draft:38-50) | **PBSA** deliverables. In the TP they appear only as the drawing/spec basis (App. F) and as inclusions or exclusions for authority fees | Tab 15:p14 |

---

## 7. SA legal check (evidence for the lawyer, not legal advice)

The register already requires SA legal review of the PBSA terms, the signing method and the payment and termination wording (Tab 15:p27; Tab 13:p85; PTS-02). This section only lists what the statute says that bears on design choices.

**Which instruments the Act reaches.**
- A **domestic building work contract** is any contract for domestic building work (BWCA s 3). The building contract the TP leads to is one.
- A **preliminary work contract** is "collateral to or otherwise related to an existing or contemplated domestic building work contract" and is for work "preliminary or ancillary" to that work (BWCA s 30(4)).
  - The PBSA fits that description on its face: it credits its fee against the contemplated building contract and buys design, engineering and approvals.
  - **Ask the lawyer first whether the PBSA is a preliminary work contract.**
- The Tender Proposal is an offer, not a contract. Its terms flow into the building contract, so they must be terms that contract can lawfully contain.

**Payments (BWCA s 30, penalties raised from 15 Jan 2026).**
- **s 30(1)** applies to both kinds of contract. No payment may be demanded unless it is a **genuine progress payment for work already performed** (or a Security of Payment Act entitlement). The maximum penalty is **$100,000 for an individual or $500,000 for a body corporate**.
- **s 30(2a)** also applies to both. No payment may be demanded unless it is a **prescribed payment** (expiation $5,000).
- **s 30(4)** lists the prescribed payments:
  - (a) a payment to a **third party** for engineering, drawing, surveying or other professional services;
  - (b) building indemnity insurance, or a fee required under an Act;
  - (d) a deposit of **no more than 5 %** of a domestic building work contract price of $20,000 or more ($1,000 below that);
  - (e) anything else the regulations add. Regs 2026 add nothing (Part 4 has regs 16–20 only).
- **s 30(3)** says progress payments are owed only after a **written request**.
- **The CBS plain-English FAQ reads these together** as: third-party services, insurance, progress payments for completed work, or a deposit of up to 5 %. Source: "What money can I require to be paid…", p. 2 (https://cbs.sa.gov.au/documents/occlicensing/Building-licence-faqs.pdf). The FAQ still shows the old $5,000 penalty.
- **The prescribed owner notice says the same.** Regs 2026 Sch 2 Form, items 13–14: the builder is entitled only to genuine progress payments; payments in advance only for third-party fees; no deposit above $1,000 or 5 %; no progress payment in advance of the work.

**What this means for the TP's payment schedule (owner's 5/20/30/20/15/10).**
- **Lawful in form.** A 5 % deposit at contract is the cap, so it is fine.
- **No prescribed stage percentages.** SA sets none; each claim must equal value already delivered. A flat 30 % at "wall and roof frames" may be more than the value delivered on an extension, a renovation or a second-storey job, and several of those have no slab.
- **Recommendation for planning:**
  - keep 5/20/30/20/15/10 as the default;
  - let staff rename stages per job;
  - add a per-job check that cumulative claims don't run ahead of the cumulative Buildxact cost of the work completed at each milestone;
  - present the schedule as "claimed on completion of the stage, by written request".
- **Legal sign-off** of the default, and of how the PBSA credit interacts with the 5 % deposit cap, is still required.

**What this means for the PBSA fee (if it is a preliminary work contract).**
- **Exposed today:**
  - "50 % payable upon execution" (PTSA template §3);
  - invoicing the full design and pre-construction fee as soon as the PTSA is signed (SOP 02-20:39; `xeroInvoices.mjs:38` due in 14 days);
  - a non-refundable fee demanded before the work is done.
- **Likely safer patterns, for the lawyer to confirm:**
  - fee milestones invoiced **in arrears** on delivery (for example, on issue of the drawing set, on lodgement of approvals, on issue of the Tender Proposal);
  - third-party consultant and authority fees passed through at cost or paid direct by the client.
- **Whether Blue Leaf's own coordination fee counts as a "payment to a third party" when Blue Leaf collects it** is exactly the kind of point the register says needs local legal advice (Tab 15:p17, p27).

**Price, PC and variation terms (BWCA s 29; Regs 2026).**
- **s 29(1)**: the building contract must stipulate a **fixed price** and the terms of payment. This supports the TP's "fixed price" framing.
- **s 29(5)–(6)**: cost-plus recovery is capped at actual cost plus a prescribed percentage, which Regs 2026 r 19(1) sets at **15 %**. Any price that may change must carry "THIS PRICE MAY CHANGE" or "ESTIMATE ONLY".
- **The prescribed notice** says a PC upgrade may attract a surcharge of "up to 15%" (Regs 2026 Sch 2 Form item 7). Provisional sums must be "fair and reasonable estimates" (item 8; s 29(8)).
- **Variations.** The rejected 25 % margin sits above both 15 % figures. The issued Q1189 proposal used 15 % (research B §6.2). Any variation-pricing wording the owner chooses (Q8) needs the lawyer to check it against s 29(5) and the contract form.
- **s 29(8a)–(8b)**: no GST-increase clause in a fixed-price contract. The TP should state the price inc GST, once.

**Statutory warranties (BWCA s 32).**
- Statutory warranties are implied into domestic building work contracts.
- They **pass to successors in title** (s 32(3)).
- Proceedings must start **within five years after completion** (s 32(5)), and that period can't be extended (s 32(6)).
- **Consequences for the approved warranty wording:**
  - "**Transferable**" is already statutory in SA. Saying so is fine; presenting it as a Blue Leaf extra may overclaim.
  - "**instead of the standard 2**" for non-structural work (Draft:84; `feeProposalTransform.mjs:346`) finds no support in s 32, which has one five-year period for every defect.
  - "**well beyond the industry's 5-year standard**" for the 10-year structural warranty is consistent with s 32(5).
  - "**Twice the standard**" for the 6-month defects period depends on the contract form's standard defects period, which I didn't verify.
- **Recommendation:** keep the four approved terms as offered, drop the comparative claims until the lawyer approves them, and write the voluntary warranties into the building contract, because a proposal claim isn't enough on its own.

**Other formalities, for the contract pack, not this design.**
- s 28(1): a domestic building work contract must be in writing, set out all its terms, name the licence holder and licence number, be signed by both parties personally, and come with a copy of the prescribed notice.
- s 36: five clear business days' cooling-off (not for minor domestic building work). Regs 2026 r 4(4)(c) sets the minor-work threshold at $20,000 for contracts made on or after 10 Nov 2025.
- Regs 2026 r 18(2)(c): prescribed forms must be in at least 10 pt Times New Roman. This affects the notice attached to the contract, not the TP's design.

**Sources:**
- Act (version 15.1.2026): https://www.legislation.sa.gov.au/_legislation-documents/lz/c/a/building-work-contractors-act-1995/current/1995.87.un.rtf. Local copy: `scratchpad/pbsa/planning/law/bwc-act.txt`, s 30 from line 1097.
- Regs 2026 (version 1.9.2026): local copy `scratchpad/pbsa/planning/law/bwc-regs-2026.txt` (r 4 at line 73; r 16–19 at 478–531; Sch 2 notice at 888–1075).
- Penalty increases from 15 Jan 2026: https://lynchmeyer.com.au/legal-updates/changes-to-the-building-work-contractors-act-1995-sa
- CBS FAQ: https://cbs.sa.gov.au/documents/occlicensing/Building-licence-faqs.pdf

---

## 8. What the owner's 16 Nov answers change in existing plans

| Item | Before | After |
|---|---|---|
| Scope of the package | One "PBSA / Tender Proposal" (`RELEASE_CHECKLIST.md:7`), assumed to be the TP (`TENDER_PROPOSAL_REVIEW.md:14-19`) | **Two documents**, planned and built separately; never issued together (Tab 13:p43) |
| Spec v0.1 | Treats "NEWER PBSA" as the proposal | Valid as the **TP** spec once the terminology is revised. Source S1 splits in two: pp. 11–37 feed the TP, pp. 1–10 feed the PBSA |
| PBSA spec | None. The register deferred it (Tab 13:p78; Tab 22:p33) | **New spec needed** on Tab 15:p9-p38, plus legal input (§7) before the fee and terms sections |
| Page 6 | Contested (C §12.4) | TP = construction programme; PBSA = pre-construction stages |
| Company claims | All policy-verify (Spec §07, D-03) | Approved: warranties, "every home", weekly site meetings, portal features. **Out: 25 % margin.** MBA membership, testimonials, awards and the comparative warranty wording remain unapproved |
| Payment default | Two defaults in code | 5/20/30/20/15/10, subject to the SA "genuine progress payment" rule and legal sign-off |
| Typeface | Lato only (doc suite), recommended in the review | TP: Playfair Display headings + Lato body. Adds a font-on-Railway release control |

---

## 9. Open questions only the owner can answer

Grouped by document. Each is something the evidence can't settle.

**PBSA**
1. **Name and code (R6).** What does the client see: "Preliminary Building Sales Agreement", "Pre-construction Services Agreement", "Pre-Tender Service(s) Agreement", or another name? And what 3-letter document code should it carry?
2. **What the fee buys.** The design package (draft pp. 4–5: drawings, 3D, engineering, NatHERS, council, certifier), the pre-tender services (PTSA: cost plan, specification, tender report), or both as SOP 02-20:37 says?
   - Which deliverables are standard and which are chosen per job?
   - What revision allowances and how many meetings are included?
3. **Fee structure and GST.**
   - One fee or staged?
   - Is the printed figure inc or ex GST? Xero bills `preconstruction_fee` ex-GST.
   - When is it invoiced? Subject to the lawyer's view on BWCA s 30 (§7).
   - Are consultant and authority fees included, reimbursed at cost, or paid direct by the client?
4. **Credit against the building contract.**
   - Keep it?
   - For how long after the Tender Proposal is issued?
   - How does it show in the TP?
5. **Drawings and IP if the client doesn't proceed.** "Yours to keep" (Concept Agreement) or "Blue Leaf's until contract" (PTSA 5.2)? And who owns purchased reports?
6. **Marketing page.** Does the PBSA carry any "about Blue Leaf" page, and may it mention the approved warranties or "every home" inclusions? The register says not by default.
7. **Typeface for the PBSA.** Playfair + Lato like the TP, or Lato-only like the rest of the doc suite?
8. **Remaining PBSA terms.**
   - Termination, refund and exit terms, and exclusivity (PTSA 5.1 reads backwards).
   - Should the PBSA restate the client's budget direction (ZJ and the draft do), or leave that to the CPB?

**Tender Proposal**

9. **Variations without 25 %.** Describe the process only ("priced and approved in writing under the building contract"), or set a figure? The issued Q1189 proposal used 15 %, and SA prescribes 15 % in related provisions (§7).
10. **Validity periods.** How long is the TP valid (30 days today)? And the PBSA offer (14 days today)?
11. **Contract form and acceptance.** Which building contract form does P08 name (MBA SA or HIA SA)? Does the TP carry a written "intention to proceed" line, or is acceptance recorded by staff only (Spec P08)?
12. **Payment schedule per job.**
    - Confirm the milestone names: Deposit, Slab, Wall and roof frames, Lock up, Internal linings, Practical completion.
    - Do you accept a per-job check that claims match the value of work done?
    - Who gives the legal sign-off: your lawyer or MBA SA?
13. **Testimonials.** Are real, permissioned testimonials available? If not, the section is omitted.
14. **Licences and associations.** Is MBA membership current, and should it be shown? Please also confirm licence BLD 332830 and ABN 88 656 051 188.
15. **Scope of the approved claims.**
    - Does "every home" also cover extensions and renovations (the new work only)?
    - May the comparative warranty wording ("standard 2", "twice the standard") be dropped pending legal review?
    - Do you accept that portal features are listed only where the live portal provides them?

**Both / sequencing**

16. **Fallbacks.** Which existing versions must stay untouched?
    - PBSA: the inline PTSA generator.
    - TP: `BLB_TENDER_TEMPLATE.docx`, plus whatever is stored in Supabase `templates/fee-proposal-template.docx`.
17. **Order of work.** Which document is designed first? The release checklist lists only one combined item.
18. **Register record.** May the change from "deferred, do not rebuild" to "build both" be recorded as a register decision (D-045) that supersedes Tab 13:p78, Tab 20:p245, Tab 22:p33 and `DOCUMENT_SUITE.md:23`?
19. **Lawyer.** Who is the SA lawyer, or is it MBA SA's contracts service? The PBSA's fee and terms sections can't be finalised without them (Tab 15:p27; PTS-02).

---

## 10. Not verified
- The Supabase-stored template binaries (`fee-proposal-template.docx`, `-apb.docx`) and any browser localStorage overrides. Not accessed, by design.
- The Sales Pipeline blueprint's superseded Tabs 16–17 (contract architecture DEC-CT-001..007). Not read; they matter for TP P08 and the contract interface.
- Whether the PBSA is legally a "preliminary work contract", and how s 30(1) and (2a) combine. This is a reading of the statute for the lawyer, not advice.
- The standard defects-liability period in MBA SA and HIA SA contracts, which the "twice the standard" claim depends on.
- The `release/lato-railway` font bundling for Playfair Display. Not checked; the branch bundles Lato only.
- Register paragraph numbers come from today's 15:37 extract. Later edits to the Google Doc would shift them.

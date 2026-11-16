# PBSA and Tender Proposal: planning brief

16 November 2026. This brief is for the planning discussion (owner and ChatGPT) that happens **before either document is built**. Nothing has been built or changed. It replaces the working assumption in `TENDER_PROPOSAL_REVIEW.md` (that "PBSA" meant the proposal); the defects that review found still stand.

**Section 7 is research from the primary legislation, not legal advice.** An SA building lawyer must confirm it (§9.4).

**Evidence** is in `docs/documents/pbsa_planning/`, with full citations to file and line, register tab and paragraph, and statute section. Client street addresses have been removed: jobs are named by quote number.
- `A-apb-method.md`: the APB method, read in full, with a 44-row "what belongs where" table and 21 conflicts with the register;
- `B-sa-payment-law.md`: SA law, read from the Act and Regulations;
- `C-requirements-matrix.md`: what every Blue Leaf source asks of each document, and 36 requirements currently in the wrong place.

The statute extracts the legal report cites are in the review pack (`evidence/law/`).

---

## 1. The short version

**There are two documents, used at two different moments.**
- **PBSA** (Preliminary Building Sales Agreement; the Hub calls it the PTSA):
  - the **paid pre-construction services agreement**;
  - signed at stage 5 (PTSA / Plans);
  - buys the design, consultant, approvals and pricing work that makes a fixed price possible;
  - **lists the Tender Proposal as one of its deliverables, and never contains it.**
- **Tender Proposal:**
  - the **fixed-price construction offer**, built from the Buildxact estimate;
  - produced at stage 7 (Tender);
  - not a contract and not signed: the building contract follows it.

**APB's method, the Master Register and your answers all draw the line in the same place.** The mess has three sources:
- one draft holds both documents: `PBSA DRAFT COPY-2` is a 10-page agreement followed by 27 pages of another job's construction proposal;
- one label is used for both: Spec v0.1 calls the proposal "PBSA";
- "fee proposal" means both: it is the PTSA's stage key, and also the name of Module 5's construction proposal.

**Two legal findings change the plan.**
1. **The PBSA is very probably a "preliminary work contract"** under the *Building Work Contractors Act 1995* (SA), s 30(4).
   - If it is, Blue Leaf may only demand payment for pre-construction work **already done**, plus third-party professional fees and statutory fees.
   - The live PTSA prints "50% payable upon execution of this agreement". Once a PTSA is marked signed, the Hub also lets staff raise the full-fee invoice (when Xero invoicing is switched on). **Taking 50% on signing, or invoicing the whole fee on signing, probably breaches s 30.**
   - Since 15 January 2026 this carries a $5,000 expiation fee, and up to $500,000 for a company.
   - **This affects agreements going out today, not only the rebuild** (§8).
2. **Your 5/20/30/20/15/10 schedule is lawful in form.** It is already the wizard's default, so it is in proposals going out today. In its favour:
   - 5% is the legal maximum deposit;
   - it totals 100%;
   - the last 10% is paid at practical completion.

   But **every stage claim must be a genuine payment for work already done.** A rough test on a real estimate (Q1196):

   | Stage | Paid by then | Value of work done |
   |---|---|---|
   | Frame | 55% | about 26% |
   | Internal linings | 90% | about 68% |

   So the middle percentages need either a lawyer's sign-off or working out per job (§7.2).

**Recommendation: build the Tender Proposal first.**
- Its spec exists (Spec v0.1), and its data already flows from Buildxact.
- The template in use today sends clients wrong content (§8).
- Write the PBSA spec alongside it, but **hold its fee and terms sections until the lawyer has answered.**
- The Tender Proposal can be built now. **Before it is issued, the lawyer must clear four things:**
  - the warranty wording and the consumer-law warranty text (P05);
  - the "not the contract" wording (P03);
  - any variation figure;
  - the payment schedule (Appendix E), unless it is worked out per job (option A).

---

## 2. Your decisions of 16 November, as recorded

| # | Question | Your answer | Effect |
|---|---|---|---|
| 1 | What is "PBSA"? | Two different documents, both to be built. The Tender Proposal comes through the Tender module. The PBSA must also be built and nailed down | Two specs, two builds, never issued together (register Tab 13:p43) |
| 2 | Page 6 "Process and timeline" | The **construction programme**. The services agreement covers the pre-construction stages | Tender Proposal page 6 is the signed-off construction Gantt. The PBSA has its own pre-construction programme |
| 3 | Which company claims are approved policy | **Approved:** warranties (10-year structural, 5-year non-structural, transferable, 6-month defects), "every home" standard inclusions, weekly site meetings, portal features. **Not approved:** the 25% variation margin. Anything unconfirmed stays out | These claims go in the Tender Proposal only. The 25% appears nowhere. Testimonials, awards, memberships and the comparison wording stay out until confirmed (§7.4) |
| 4 | Default payment schedule | 5/20/30/20/15/10 preferred, subject to what is legally acceptable | It is already the wizard's live default. See §7.2: lawful in form, but the middle stages need checking |
| 5 | Typeface | Playfair Display headings, as in the spec | Tender Proposal uses Playfair Display headings and Lato body. **Neither font is proven on Railway yet.** Lato's fix is built (branch `release/lato-railway`) but awaits a staging check (release control R1). Playfair must be bundled and pass the same check: Spec §03 stops the design lock if it can't. The PBSA's typeface is still open (question P8) |

---

## 3. The two documents side by side

| | **PBSA** | **Tender Proposal** |
|---|---|---|
| What it is | A paid services agreement for the pre-construction work | A fixed-price offer for the building work |
| Reader | The homeowner(s), as **signatory** | The homeowner(s), as **decision-maker** |
| When | Proposed at stage 4 (Concept), where the fee is set. Issued and signed at stage 5 (PTSA / Plans) | Produced at stage 7 (Tender), after RFQs and a priced estimate. Accepted, then the building contract is signed (stage 8, Won) |
| Pathways | Design and build only | **Every pathway**, including plans-supplied, build-only and architect-tender, where there is no PBSA. It must stand on its own |
| Built from | The lead and the register (client, site, scope, concept drawings, consultants, fee). **No Buildxact**: no estimate exists yet | The Buildxact estimate, the saved proposal fields, and the signed-off construction schedule. The register is used only through a tested adapter |
| Signed? | **Yes**, by the client and a Blue Leaf director. Signing method still to be settled (a portal click isn't enough) | **No signature block.** Staff record acceptance, then the building contract is signed |
| Money it carries | The services fee, its milestones, how third-party and authority fees are handled, the credit rule | The fixed price inc GST, PC and PS allowances, options, the 5% deposit and the progress-claim schedule |
| Programme | Pre-construction stages (design, consultants, approvals, pricing), marked indicative or confirmed | The construction programme in weeks from site start (page 6) |
| Company claims | None by default. At most a short factual "about us" (question P7) | The approved claims only |
| Length | About 6–10 purposeful pages, plus an annexure if needed (Tab 15:p9–p10) | 8 pages plus appendices A–F (Spec v0.1) |
| Issue and record | Controlled issue (preview, issue R01 with a snapshot), then a separate "signed" event with the signed PDF | Controlled issue with a snapshot (quote, fields, approved company copy, programme fingerprint), revised whenever the price or drawings change |

---

## 4. What goes where

| Content | PBSA | Tender Proposal |
|---|---|---|
| Cover, letter from a named director, date, validity | Yes | Yes |
| The client's brief (goals, scope) | Yes, from the issued Client Project Brief, never re-typed | One-paragraph "our understanding", from the same source |
| What this stage buys and what it excludes | **Yes** | No |
| Pre-construction deliverables (drawings, engineering, survey and soil, energy rating, selections, approvals, cost plan, tender package), each with owner, revisions allowed and who pays third parties | **Yes** | Only as the drawing and specification basis (Appendix F) |
| "You will receive a fixed-price Tender Proposal", with when | **Yes**, as a deliverable | — |
| Pre-construction programme | **Yes** | One line on where the project stands |
| Construction programme (weeks from site start, Gantt) | No | **Yes, page 6** |
| The services fee, GST basis, milestones | **Yes** | No |
| Credit of the fee against the contract | The rule | Shown as a visible **discount** line, with the contract price stated after the discount and the PBSA reference cited. Never shown as a fee "already paid" or as part of the deposit (it could then count toward the 5% cap). Never hidden by raising the price (APB's "inflate the contract" option is out) |
| Who pays authority and consultant fees | For the pre-construction stage | For the construction stage. **Each fee stated once, the same way in both** (today council fees appear in both "our responsibilities" and the exclusions) |
| IP and drawings, termination, what happens if no contract follows | **Yes** | No |
| Fixed price inc GST, plain-English explanation first | No | **Yes** |
| PC and PS allowances, in one list, each marked "ESTIMATE ONLY" or "THIS PRICE MAY CHANGE" | No | **Yes** (this is the form the law requires of the contract) |
| Options priced outside the contract | No | Yes, only if there are any |
| Inclusions (by Buildxact category) and exclusions | Service exclusions only | Construction inclusions and exclusions |
| Variation process (written, priced and approved before the work) | No | Yes, with **no percentage** unless you set one (question T2) |
| Warranties, "every home" inclusions, weekly site meetings, portal features | No | **Yes**, worded as in §7.4 |
| Progress-claim schedule | No (the PBSA has its own fee milestones) | **Yes** |
| Responsibilities (ours and yours) | Pre-construction (client decisions, access, information) | Construction (site access, connections, selections, payments) |
| Next step | Sign, then the first design meeting | Confirm intention to proceed, then the building contract |
| Licence name and number, ABN | Yes, in the parties block | Yes |
| **In neither** | The 25% margin; APB and its wording; "valued at" price stacks; deadline pressure tricks (today-only and 7-day prices, seasonal specials, scarcity lines); a guaranteed start or handover date; "defect-free" and "satisfaction" guarantees; example testimonials or screenshot placeholders; "under-promise and over-deliver"; internal markup; another job's data; engineered stone in any form (the document suite's issue check applies: a selection or wording that names it stops the issue) | |

---

## 5. PBSA contents (outline for planning)

The register's structure for the paid pre-construction document (Tab 15:p9–p38), with what exists today:

| # | Section | What it holds | Today |
|---|---|---|---|
| 01 | Cover and document control | Client, site, agreement name, reference, revision, date | The draft prints "Quote Number 1234" and a test client |
| 02 | Short letter | From a director, in Blue Leaf's voice | Draft "Thank you" letter |
| 03 | Client and project summary | Goals, existing and new work, design basis, project type | Draft table full of placeholders |
| 04 | What this stage achieves | The work, why it comes before a building contract, what is excluded, the status of preliminary costs | Missing |
| 05 | **Deliverables and responsibilities** (the core) | Each deliverable with: who does it, revisions allowed, included or excluded, who pays third parties, milestone, what "done" means. "Do not promise every item on every job" | The draft lists services with no owners, limits or cost responsibility. The PTSA generator has 7 pre-tender services. **No data model exists yet** for per-deliverable detail |
| 06 | Assumptions and exclusions | Who engages consultants, quality of existing information, site conditions, authority timing, changes outside the revisions | Missing |
| 07 | **Pre-construction programme** | Concept → design and consultants → approvals → pricing → Tender Proposal → contract, showing only the stages that apply. Indicative windows, decision points, who must act. "Timing to be confirmed following the consultant programme" rather than a blank | The draft page is empty apart from "INC COUNCIL APPROVAL IN THIS". **No milestone data exists yet** |
| 08 | Fee and terms | The fee and its GST basis; milestones; third-party and authority fees; extra services; revisions; IP and use of drawings and reports; suspension; termination; the credit rule. **Waits for the lawyer** (§7.3) | Draft: one line, "$15,000 including GST". PTSA generator: 50/50 terms, credit clause, IP, exclusivity |
| 09 | How decisions and communication work | The register, meetings, approvals, when documents become issued. **No portal promise** before onboarding | Missing |
| 10 | Next steps and acceptance | What happens on signing, what's needed, the contact, signatures | Signature lines exist |
| 11 | Annexure (if needed) | Drawing list, deliverables schedule, Client Project Brief reference. **Never a construction proposal** | The draft annexes another client's full proposal |

The PBSA draft's "Why Blue Leaf" and "Guarantees" pages move to the Tender Proposal (warranties, "every home", fixed price) or go entirely (the 25% margin).

---

## 6. Tender Proposal contents (Spec v0.1, with your decisions)

| Page | Content | Change from your answers |
|---|---|---|
| P01 Cover | Photo or typographic cover; "Fixed-Price Construction Proposal"; address, client, quote reference, date, revision; no price | Playfair Display title |
| P02 Introduction | Director's letter; snapshot; "our understanding" | — |
| P03 The offer | Total inc GST, validity, drawing basis; what's included, the allowances, outstanding conditions. Refuses to issue on a $0 or stale estimate, or on unclassified PC/PS | Add a statement that this proposal is not the building contract, and can't be accepted to form one; the final wording comes from the lawyer (§7.1) |
| P04 Scope and tender basis | 4–6 construction-system groups, each marked included, excluded or to clarify | — |
| P05 Why Blue Leaf | At most three points backed by proof | "Every home" inclusions and the warranties, checked against this job's inclusions |
| **P06 Process and timeline** | **Construction programme**: about N weeks from site start; Gantt from the signed-off schedule; no dates; no buffer talk | Confirmed |
| P07 How we deliver | People, site coordination, updates and approvals | Weekly site meetings; portal features limited to what the live portal does |
| P08 Next steps | Review, clarify, confirm intention to proceed, then the building contract. No contract acceptance on this page | Name the contract form (question T4) |
| App. A | Inclusions by Buildxact category | — |
| App. B | PC and PS allowances, in one list, each labelled as the law requires | §7.1 |
| App. C | Exclusions, work by others, clarifications | — |
| App. D | Options, only if any | — |
| App. E | Price summary and progress claims, validated to 100% | §7.2 |
| App. F | Drawing and specification register | — |

The spec puts licensing and memberships, and testimonials (sourced ones only), on P05. It doesn't yet place responsibilities: fold them into P07 or Appendix C.

---

## 7. SA law: what each document must respect

**Sources.** The *Building Work Contractors Act 1995* (SA), version 15.1.2026, and the *Building Work Contractors Regulations 2026*, in force from 1 September 2026; these replaced the 2011 Regulations. Plus CBS guidance (September 2026). **Three recent changes:**
- s 30 was restructured on 15 January 2026, with new penalties;
- the threshold for "minor" work (no formal contract, cooling-off or insurance) rose from $12,000 to **$20,000** for contracts from 10 November 2025;
- the minimum building indemnity insurance cover is now **$250,000**.

### 7.1 The construction side (Tender Proposal, then the contract)

- **Deposit:** at most **5% of the contract price** (contracts of $20,000 or more).
  - Nothing else may be taken up front, except:
    - third-party professional fees (engineer, surveyor, drafter);
    - the insurance premium;
    - fees required by law.
  - So: no "administration fee", and no supplier-deposit milestones (windows, cabinetry) before that work is done.
- **Progress payments:**
  - only "a genuine progress payment in respect of work already performed";
  - requested in writing.
  - SA sets **no stage names and no percentages**. Each milestone must be defined so a claim can be checked (for example, "Base: footings and slab poured and inspected").
- **Price:** a fixed price, **including GST**. No clause passing GST changes through.
- **PC and PS allowances:** each marked "ESTIMATE ONLY" or "THIS PRICE MAY CHANGE", beside or below it, all in one list. Estimates must be fair and reasonable.
- **Cost-plus work is capped at cost plus 15%** (s 29(5)(a); reg 19(1)). If that cap reaches variation pricing (likely; the lawyer to confirm, §9.4 item 4), a 25% variation margin would exceed it. It is out anyway, by your decision.
- **Variations:** in writing, and very probably signed.
- **The contract** (not the proposal) must:
  - be written and signed by both parties;
  - set out all terms;
  - name the licensee and give the licence number;
  - come with the prescribed notice ("Form 1"). That notice must be printed **in at least 10 pt Times New Roman, unaltered**, so it can't be restyled. This doesn't affect the proposal's design.
  - Cooling-off: 5 clear business days.
  - Insurance certificate: given before work starts.
- **Recommended: the proposal says it is not the building contract and can't be accepted to form one.** Blue Leaf is bound only when both parties sign the building contract, which comes with Form 1. The Act doesn't require this statement; it is a safeguard. If the client's acceptance (by email, say) formed a contract that missed these rules, that would be an offence, and cooling-off would run until completion. Final wording from the lawyer (§9.4 item 6).
- **Licence:** show the licensed name and number on advertisement-like pages. Confirm that "Blue Leaf Building" is the licensed name, or a business name registered with ASIC that CBS was told about in writing beforehand (s 49).

### 7.2 Your payment schedule

The wizard's stages are Deposit, Slab, Wall and roof frames, Lock up, Internal linings and Practical completion. The table compares them with an illustrative split of Q1196's estimate into stages. **This is an illustration, not a valuation.**

| Stage | Your % | Paid by then | Rough value of work done by then | Ahead of the work |
|---|---|---|---|---|
| Deposit | 5 | 5 | (not for work) | lawful deposit |
| Slab | 20 | 25 | 15% | about 10 points |
| Wall and roof frames | 30 | **55** | **26%** | **about 29 points (≈ $317k)** |
| Lock up | 20 | 75 | 54% | about 21 points |
| Internal linings | 15 | **90** | **68%** | about 22 points |
| Practical completion | 10 | 100 | 100% | — |

- **Insurance:** on Q1196, the amount paid ahead of the work at frame (about $317k) is more than the $250,000 minimum insurance cover. Part of the client's money would be uninsured if the builder failed.
- **Confirmed:** the 5% deposit (at the cap), the 100% total, and the final 10% at practical completion.
- **Not confirmed, and probably not "genuine" on a typical job:**
  - frame at 30%;
  - 90% paid by linings, which leaves 10% to cover fix-out (joinery, tiling, painting, fit-off, flooring), worth about a third of this job.
- **Extensions and renovations** often have no slab or frame stage, and a claim for a stage that doesn't happen can't be genuine. Stage names must follow the job.
- **For comparison:**
  - Blue Leaf's issued Q1189 proposal used 5/15/20/25/25/10, on the same stage names as the wizard;
  - APB's template uses 5/20/20/25/25/5;
  - the server default is the same 5/20/20/25/25/5, labelled "standard SA schedule" in the code. **No SA standard exists**, so that label is unsupported.

**Options for planning.**
- **A (recommended):** keep your stage names, the 5% deposit and the final 10% at practical completion, and **work out the middle percentages per job from the Buildxact estimate**. Each stage's claim then matches the value of its work. The issue check refuses a schedule that runs ahead.
- **B:** a less front-loaded default, such as Q1189's 5/15/20/25/25/10.
  - It pays 40% by frame instead of 55%, but that is still about 14 points ahead of the work on Q1196.
  - It still reaches 90% by internal linings.
  - It fixes the fix-out gap only with a separate fixing stage and 10% or more at practical completion.
  - It still needs the per-job check.
- **C:** keep 5/20/30/20/15/10 only with a lawyer's written sign-off for the job types you build.

### 7.3 The PBSA under the Act

- **It is probably not "domestic building work"**, as long as it holds no physical site work. So the formal contract rules, cooling-off and insurance don't apply to it.
- **It is very probably a "preliminary work contract"**: related to a contemplated building contract, and for work preliminary to it. **The s 30 payment rule therefore applies.** Blue Leaf may demand:
  - its own fee only as **payments for pre-construction work already performed** (s 30(1)(a)). Requesting each one by written invoice is good practice: the s 30(3) writing rule strictly covers only the building contract;
  - in advance, third-party professional fees and statutory fees (for example, development application fees).
- **Whether any deposit can be taken under a PBSA is unclear.** There are three readings:
  - none at all;
  - treating the PBSA fee as "the price", at most $1,000;
  - 5% of the fee, if the fee is $20,000 or more.

  **On no reading is 50% on signing allowed.**
- **If money is received, it is presumed to have been demanded**, unless the contrary is proved (s 30(2), (2b)). So a client paying willingly doesn't settle it.
- **A fee shape that fits** (for the lawyer to confirm):
  - **stage fees invoiced in arrears**, each on delivery of a defined deliverable (for example, design signed off, documents lodged, approvals obtained, Tender Proposal issued);
  - third-party and authority costs listed separately, at cost or paid direct by the client;
  - no "deposit" wording;
  - the credit shown as a discount on the later contract price;
  - no site work in the PBSA;
  - the licence name and number shown.
- **Keep the two documents apart.** Bundling them makes the PBSA look like a stage of the building contract. The Act can then treat the two as one staged contract.
- **Exclusivity needs care.** Today's clause 5.1 is garbled: "Blue Leaf Building will not tender for the same project brief from the same client with any other builder". As written it binds Blue Leaf, not the client. APB's purpose for this agreement is to take the client out of the market. But **a clause binding the client to build with Blue Leaf could make the PBSA part of the building contract.** So any exclusivity wording must come from the lawyer (question P11).
- **Consumer law also applies:**
  - unfair contract terms (the non-refundable fee, retained IP and a discretionary credit, taken together);
  - the consumer guarantees for the design services;
  - possibly the unsolicited-agreement rules, if a PBSA is ever signed at the client's home.

### 7.4 Warranty wording (the terms stay; some wording must change)

SA's statutory warranties already cover **all** domestic building work, structural and non-structural, for 5 years after completion. They pass to the next owner by law, and no contract term can cut them down. So:

| Approved term | Current wording | Change to |
|---|---|---|
| 10-year structural | "well beyond the industry's 5-year standard" | Keep the term. Define "structural", when the period starts and how to claim. State that it is in addition to the statutory warranties and consumer guarantees. Drop the comparison |
| 5-year non-structural | "instead of the standard 2" | **Wrong for SA**: 5 years is the law, not an extension. At most: "all work is covered for 5 years from completion; here's how to raise a claim" |
| Transferable | "the coverage transfers to the new owner" | Keep, framed as "like your statutory warranties, our structural warranty passes to the next owner" |
| 6-month defects period | "twice the standard" | Keep 6 months as a period running alongside the warranties, never as a limit. Drop "twice the standard": SA has no standard defects period to double |
| Fixed price | "the price you sign is the price you pay … plus a 25% builder's margin" | Drop the 25%. Qualify it with the PC/PS allowances and written variations |
| Builders indemnity insurance, listed as an inclusion (under Preliminaries) | | Keep, but present it as a legal requirement, not a selling point |

Three more points:
- **The promises are a "warranty against defects" under consumer law**, so they need the prescribed consumer-law text somewhere. The lawyer should say where: the proposal, the contract or the handover pack.
- **Each approved warranty and promise must also be written into the building contract.** The contract must set out all its terms (s 28(1)(b)), and a claim in the proposal isn't enough on its own. On a standard MBA or HIA form that means special conditions. The "every home" claims must be true on every job, or they risk misleading conduct.
- **Renovations:** does the 10-year structural warranty on extensions and renovations cover only the new work Blue Leaf builds? APB drops it on renovations (question T6).

---

## 8. Live issues now, outside the rebuild

These affect documents going to clients today. **Nothing has been changed**: the working templates stay untouched, as you asked.

1. **PTSA payment terms.**
   - **What happens now:**
     - The live agreement prints "50% payable upon execution of this agreement; 50% payable on delivery of the Detailed Cost Plan".
     - Once a PTSA is marked signed, the Hub lets staff raise the full design and pre-construction fee invoice, due in 14 days. That only applies when Xero invoicing is switched on (`XERO_ENABLED=1`): please confirm whether it is on in production.
     - Under s 30 both look exposed (§7.3).
   - **Recommendation:** ask the lawyer first, and include agreements already signed or invoiced. Until the lawyer answers:
     - don't issue a PTSA with the 50%-on-signing clause;
     - don't invoice the whole fee on signing.

     Money received counts as demanded unless proved otherwise.
2. **PTSA fee GST basis.** The agreement prints the fee "(inc. GST)", but Xero (when on) bills the same figure as **ex-GST**. One of them is 10% wrong for the client.
3. **Other faults in the live PTSA:**
   - it builds the client name from first and last name only, so the second owner of "A & B" drops off a signed agreement (the canonical name is `leads.name`);
   - it prints placeholders such as `[CLIENT NAME]`, `[SITE ADDRESS]` and `[TO BE DETERMINED]` when a field is empty;
   - it shows the ABN but no licence number.

   Check each PTSA by hand before it goes out.
4. **The working Tender template** (`BLB_TENDER_TEMPLATE.docx`) has three faults:
   - it prints one past job's inclusions on every proposal;
   - its payment schedule totals 110%;
   - it reprints today's date when an old proposal is re-sent.

   These come from the earlier review. **The 110% is your preferred 5/20/30/20/15/10 plus an extra 10% row.** Deleting that row still leaves 55% paid by frame and 90% by linings (§7.2).
   - Until the lawyer answers, check each live proposal's stages against its estimate.
   - Tell the lawyer which current contracts use this schedule.
   - Or let me fix a copy that you approve first.
5. **Warranty comparisons and the 25% margin are in the content constants** (`APB_CONTENT` in `feeProposalTransform.mjs`) and in the PBSA draft. If any issued document carries them, it states "instead of the standard 2", which SA law contradicts.
6. **The Concept Agreement's "small upfront fee"** raises the same s 30 question. It may be defensible if it pays a third-party designer, or if it is $1,000 or less. Flagged only.

---

## 9. Questions for planning

### 9.1 For you: the PBSA

| # | Question | Blocks |
|---|---|---|
| P1 | **Name and code.** What does the client see: "Preliminary Building Sales Agreement", "Pre-construction Services Agreement" or another? Today clients receive a document titled "Pre-Tender Service Agreement" (the PTSA), and the Client Project Brief calls it "the pre-construction agreement" | Spec |
| P2 | **What the fee buys.** The design package (drawings, 3D, engineering, energy rating, council, certifier), the pre-tender services (cost plan, specification, tender report), or both, as the PBSA does today? Which deliverables are standard, and which are chosen per job? How many revisions and meetings? | Section 05 |
| P3 | **Where approvals sit.** Inside the PBSA stage (the register's model) or after the building contract (ZJ, and some of APB)? This drives the PBSA's programme and fee scope, and the Tender Proposal's "subject to approval" wording | Sections 05, 07 |
| P4 | **Fee structure.** One fee or stage fees? Printed inc or ex GST (today the agreement and Xero disagree)? Consultant and authority fees: included, at cost, or paid direct by the client? (When it's invoiced waits for the lawyer) | Section 08 |
| P5 | **Credit against the contract.** Keep it? Within what window after the Tender Proposal is issued (today it reuses the 14-day PBSA validity)? | Section 08; Tender Proposal price summary |
| P6 | **Drawings and IP if no contract follows.** The Concept Agreement says the planning set is "yours to keep"; the PTSA says it stays Blue Leaf's until a contract. Which? Who owns paid-for reports (survey, soil, engineering)? | Section 08 |
| P7 | **About-us page.** Does the PBSA carry a short factual "about Blue Leaf" page? The register says no marketing or claims by default | Layout |
| P8 | **Typeface.** Playfair Display headings like the Tender Proposal, or Lato only like the rest of the document suite? | Design |
| P9 | **Exit.** What happens on termination, and what does the client keep and owe if no contract follows? APB expects only about half of these agreements to become contracts | Section 08 |
| P10 | **The "PTSA signed" gate.** Hard (the SOP says required) or advisory (the code)? Work can start before payment either way (D-029, D-038) | Hub |
| P11 | **Exclusivity.** Today's clause 5.1 is garbled (§7.3). Did you mean it to stop the client going to other builders? If so, the lawyer must word it, because a clause binding the client could make the PBSA part of the building contract | Section 08 |

### 9.2 For you: the Tender Proposal

| # | Question | Blocks |
|---|---|---|
| T1 | **Payment schedule:** option A, B or C (§7.2)? Do renovations get their own stage set (no slab, for example)? | Appendix E |
| T2 | **Variations without 25%.** Describe the process only ("priced and approved in writing before the work"), or print a figure (at most 15%, subject to the lawyer)? | P03, contract |
| T3 | **Validity.** How long is the proposal valid (30 days today)? And the PBSA (14 days)? Each needs a genuine reason, not a deadline trick | P03, P08 |
| T4 | **Contract form and acceptance.** Which building contract does P08 name (MBA SA, HIA SA or Blue Leaf's own)? The approved warranties and promises must go into it, as special conditions on a standard form (§7.4). Does the client confirm in writing, or do staff record acceptance only? | P08; the contract |
| T5 | **Price layout.** Category totals that add up to the price (current practice), or one headline price plus allowances and options (APB)? | P03, Appendix E |
| T6 | **Scope of the approved claims on renovations.** Does the 10-year structural warranty cover only the new work? Does "every home" apply to extensions? | P05 |
| T7 | **Warranty comparisons.** Drop "instead of the standard 2", "twice the standard" and "beyond the industry standard", as §7.4 recommends? | P05 |
| T8 | **Testimonials and awards.** Are real, permissioned ones available? Otherwise those sections are left out | Layout |
| T9 | **Licences.** Confirm licence BLD 332830 and ABN 88 656 051 188 for print. Is MBA membership current, and should it show? | P05 |

### 9.3 For you: both documents

| # | Question |
|---|---|
| B1 | **Order of work:** Tender Proposal first, with the PBSA spec in parallel and its terms after the lawyer (recommended)? |
| B2 | **Fallbacks that stay untouched:** the PTSA generator, and `BLB_TENDER_TEMPLATE.docx`. Also the template stored in Supabase? Exception: the PTSA's payment clause, if the lawyer says it must change (§8 item 1) |
| B3 | **Register record:** record "build both" as a register decision (D-045)? It would replace "owned elsewhere, not rebuilt" and "do not rebuild" (Tab 20:p245; Tab 22:p32–p33; `DOCUMENT_SUITE.md` §1). Tab 13:p78 already planned a later refresh, and its rule to remove mixed-document content before any external issue still stands |
| B4 | **Spec v0.1 wording:** may it be revised to v0.2, changing "PBSA" to "Tender Proposal" throughout? It's your Drive document, so I haven't touched it |
| B5 | **The lawyer:** who is it, or is it MBA SA's contracts service? |
| B6 | **Money in register documents.** The document suite's issue check rejects any "$" value, and the register says that ban must not be weakened across the board. May the PBSA fee fields and the Tender Proposal price fields have a narrow money exception, with the ban kept everywhere else? (The estimator's TSN stays currency-free.) |

### 9.4 For the SA building lawyer

0. **How s 30 reads.** Confirm that s 30(1) and s 30(2a) (from 15 January 2026) are alternatives. Read literally they are two separate prohibitions. Everything else here assumes a capped deposit and payments in arrears for work done are both lawful.
1. **PTSA payment terms, urgently.**
   - Is "50% payable upon execution" and a full-fee invoice on signing a breach of s 30?
   - What about agreements already signed or invoiced?
   - Can any of Blue Leaf's own fee be taken up front: none, $1,000, or 5% of the fee?
   - Which consultant costs count as third-party professional fees that can be requested in advance: the certifier, the energy assessor, an external designer Blue Leaf engages? May Blue Leaf collect them itself?
   - Is the CITB levy a fee required by an Act?
2. **Is the PBSA a "preliminary work contract"** and not a domestic building work contract?
   - Does the under-$20,000 minor-work rule take a small PBSA out of s 30?
   - Does the credit against the contract risk counting toward the 5% deposit cap, or make the two documents one staged contract?
3. **Payment schedule.** Is 5/20/30/20/15/10 acceptable for new homes, extensions and renovations, or should percentages follow each job's estimate? How should milestones be defined?
4. **Variations.** Must they be signed by both parties? Does the 15% cost-plus cap apply to variation pricing?
5. **Warranty wording.** Word the four approved terms so they neither misstate nor limit the statutory warranties. Where must the consumer-law warranty text sit? How should they go into the building contract (special conditions)?
6. **Proposal status.** Wording that stops the Tender Proposal, or the client's acceptance of it, from forming a non-compliant contract.
7. **PBSA terms under consumer law.** The non-refundable fee, retained IP, the discretionary credit, exclusivity (P11) and termination. Also the signing method.
8. **Contract form and licence name.** Which contract form? Is "Blue Leaf Building" the licensed name, or an ASIC-registered business name notified to CBS (s 49)?

---

## 10. After planning: proposed order

1. **Record the decisions.** A register decision (D-045). `DOCUMENT_SUITE.md` updated from "owned elsewhere" to "build both". Spec v0.2 terminology, if you agree (B4).
2. **Brief the lawyer.** The PTSA payment terms first (they're live), then the rest of §9.4.
3. **Tender Proposal.**
   - Settle spec v0.2 with your answers to T1–T9.
   - Build on the document design system. It is Lato-only today: add Playfair Display, and prove both fonts on Railway (release control R1).
   - Agree the narrow money exception (B6).
   - Produce realistic specimens: one new home, one extension, and one plans-supplied job with no PBSA.
   - One focused QA round, then a checkpoint with a review brief.
   - **Before live issue:** the lawyer clears the warranty wording, the "not the contract" wording, any variation figure, and the payment schedule unless option A.
4. **PBSA.**
   - Write the spec now, covering sections 01–07 and 09–11, with your answers to P1–P10.
   - Model the deliverables and the pre-construction milestones (neither exists in the Hub yet).
   - Write section 08 (fee and terms) once the lawyer has answered.
   - Then build, specimens, QA, checkpoint.
5. **Never together.** The two documents stay separate types with separate revision series, and neither is issued with the other.

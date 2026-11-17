# A. The APB method: what goes in the PBSA and what goes in the Tender Proposal

Planning note for the PBSA / Tender Proposal package, 16 Nov 2026. This was read-only work. Nothing was edited, committed, uploaded or sent.

---

## 0. Sources and conventions

**APB sources**
- Read in full, both in `/Users/samuelmorris/Desktop/blueprint-agent/src/blueprint/knowledge/`:
  - `apb-sales.md` (4,557 lines), cited as `sales:N`;
  - `apb-presales.md` (1,245 lines), cited as `presales:N`.
- Read in part. These sibling files in the same folder were grepped for PBA, proposal and payment terms, and only the matching chunks were read:
  - `apb-operations.md`, cited as `ops:N`;
  - `apb-estimating.md`, cited as `est:N`.
- The text of APB's generic proposal template, extracted in earlier research: `research/b-ext/APB_Fixed_Price_Construction_Proposal_Template.docx.txt`, cited as `apbtpl:N`.

**Blue Leaf sources**
- Master Register citations use the `Tab NN:pNN` numbering from `research/C-master-register.md`.
- Prior research: `research/A-repo-templates.md` (`A:N`), `research/B-external-templates.md` (`B:N`) and `C-master-register.md` (`C:N`).
- `docs/documents/TENDER_PROPOSAL_REVIEW.md` (`TPR:N`).
- The Sales Pipeline blueprint extract `research/b-ext/sales_active_blueprint.txt` (`SPB:N`).
- The owner's answers of 16 Nov.

**Caveats**
- The knowledge files are the Hub's condensed notes of APB courses, not the courses themselves. Dollar figures, the warranty years and the guarantee stack come from APB's fictional "APB Luxury Homes" worked example.
- APB is third-party material and internal guidance only. The Register bans APB references and APB sales tone in client documents (Tab 13:p50, p59; Tab 11:p89; SOP 02-20:129). Borrow structure and ideas from it, never wording.

**Name mapping used throughout**

| APB term | Blue Leaf term |
|---|---|
| Concept design agreement ("concepts") | Concept Agreement, stage Concept (`winning_offer`) |
| Preliminary Building Agreement, PBA ("prelims") | **PBSA**, called the PTSA in the Hub; stage PTSA / Plans (`fee_proposal`) |
| Fixed Price Construction Proposal / contract proposal | **Tender Proposal**, the Module 5 "fee proposal", at stage Tender |
| Building contract | Building contract, stage Won (DEC-CT still open) |

---

## 1. The answer in brief

1. **APB treats them as two separate paid offers in a fixed order:** concept design agreement → PBA → building contract (sales:832-839, 3216-3221). The fixed-price proposal is the bridge from the PBA to the contract (sales:4291-4296). Each offer gets its own internal offer document (presales:98-99).

2. **The PBA produces the Tender Proposal.**
   - The PBA buys the work that makes a fixed price possible: drawings, engineering, surveys, selections, a detailed estimate and a schedule (sales:3220).
   - Its headline deliverable is the fixed-price contract proposal (presales:373-374).
   - APB's own subtitle for the PBA is "a pre-contract agreement for the preparation of a fixed price building contract" (presales:165, 370).
   - So **the PBSA should promise the Tender Proposal as a deliverable, with its timing, and must never contain it.** This is the Register's "must NEVER ship together" rule (Tab 13:p43, p60) seen from APB's side.

3. **APB's PBA is a short priced offer.**
   - It has a title and subtitle, three to seven features each tied to a client fear, deliverables, one simple guarantee, FAQs, proof, a price, a validity date and a call to action (presales:117-139, 362-393).
   - It is paid up front at signing (presales:309; sales:3150).
   - Pricing runs from $5k–$10k to six figures (sales:3226). The worked example charges $15,000 (presales:377).

4. **APB's fixed-price proposal is a long, glossy sales document**, not a contract.
   - Sixteen sections in a fixed order, with the price near the top (presales:770-786).
   - It carries no legal terms and conditions (presales:571, 602).

5. **Owner decision 2 is APB's position.**
   - The construction programme (a week count from start of construction plus a simplified Gantt) belongs in the proposal (presales:694; ops:4476-4495).
   - APB also wants a worked-out schedule for PBAs before anything is presented (ops:2373-2380).
   - So the PBSA carries the **pre-construction** programme.

6. **Owner decision 3 is much narrower than APB.** APB's proposal stacks seven guarantees plus "satisfaction guaranteed" (presales:937-958).
   - Approved: the warranties, the "every home" standard inclusions, weekly site meetings and the portal features.
   - Everything else in APB's stack stays out:
     - the guaranteed handover date with a daily payment to the client;
     - defect-free at handover;
     - "satisfaction";
     - "friendly trades";
     - "change your mind" flexibility;
     - the PBA's "guaranteed fixed price" promise;
     - APB's cost + 25% variations sentence (sales:2775; presales:588, 881).

7. **Owner decision 4: APB doesn't settle SA legality.**
   - APB's example schedule is 5/20/20/25/25/5. It uses the same six stage names Blue Leaf uses: Deposit, Foundations and slab, Frame, Enclosed, Fixing, Practical completion (apbtpl:271-278; presales:983).
   - APB's only legal guidance is to stay within local legal limits and banking rules and to have the contract reviewed by a lawyer (presales:19, 45, 54).
   - The owner's 5/20/30/20/15/10 totals 100% on APB-standard stages.

8. **Owner decision 5 (Playfair Display headings, Lato body) has no APB counterpart.** APB's only rule is order: get the content right, then proofread, then apply the brand (sales:1704-1717; presales:499-514). That supports going back to planning before design.

9. **The largest APB-versus-Register conflicts** (section 7):
   - APB's sales devices: "valued at" stacking, 7-day or today-only prices, scarcity lines, seasonal specials, "dream home", lifestyle images on every page, APB membership.
   - APB's pay-in-full-at-signing against D-029 and D-038 and the PTSA's 50/50 terms.
   - APB says almost nothing about the terms a signed services agreement needs: IP, revisions, third-party fees and termination (Tab 15:p17, p22-p28).

10. **APB assumes design-and-build only and says never to tender** (sales:1819, 2741-2758, 2835).
    - Blue Leaf also runs plans-supplied, build-only and architect-tender pathways that have no PBSA (Tab 26:p184; `DOCUMENT_SUITE.md:97`; SPB:753-757).
    - So **the Tender Proposal must stand on its own.** It can't assume a PBSA came first.

---

## 2. Where each document sits in the sales sequence

APB states the sequence several times:

- qualifying call → discovery call → in-office meeting → selling concepts → preliminary building agreement → building contract (sales:832, 839);
- meeting → concept designs → prelim → building contract, "there is always a next step" (sales:979);
- Qualification → Discovery → Concept agreement → PBA → presentation of the proposal → contract (sales:4291-4296). At the PBA step, construction-ready drawings let the estimator produce a detailed costing and arrive at a fixed price. At the presentation step, the proposal is "present[ed] and convert[ed] into a contract". End to end this takes 6 weeks to 12 months (sales:4301);
- the yes-ladder: yes to content → enquiry → phone → concepts → PBA → contract (sales:2368);
- "splintering": the last three steps are paid (sales:3216-3221).

| APB step | What is sold or presented | Blue Leaf stage (key) | Blue Leaf document |
|---|---|---|---|
| Qualification, discovery | Nothing; the next meeting is booked | enquiry, qualify, discovery | — |
| In-office meeting → concept design agreement | Concept design | Concept (`winning_offer`) | Concept Agreement; preliminary Client Brief (issue-only, D-035) |
| Concept review meeting → PBA | The paid pre-construction package | PTSA / Plans (`fee_proposal`) | **PBSA**, issued and signed (Tab 03:p18) |
| PBA work | Drawings, engineering, surveys, selections, approvals, estimate, schedule | PTSA/Plans → Consultants → Tender (SPB:545) | TSN (internal); Buildxact estimate |
| Presentation of the proposal | The fixed-price proposal | Tender (`proposal_generated` → `proposal_presented`) (SPB:655) | **Tender Proposal** |
| Contract | Building contract + deposit | Won | Building contract |

**When the PBA is sold.**
- At the meeting that reviews the finished concept. The worked opening line reviews "the finalised concept design" before "discussing the next steps" (sales:1065).
- The close is "Would it make sense to move to a preliminary building agreement today?" (sales:1147), followed by the five-step objection loop (sales:1233).
- Construction slots are kept for "the planning/budgeting stage when there's a prelim on the table" (sales:1554).

**When the proposal is presented.**
- After the preliminaries (presales:767). The fixed price is "earned" by finishing them first: soil, contours, colour, electrical and tile selections (sales:2770-2786).
- The price is never a surprise, because during prelims the builder tells the client the revised budget after every change (presales:526-541).

---

## 3. The Preliminary Building Agreement (PBA)

### 3.1 Purpose
- To get paid for the 30–50 hours of detailed estimating instead of quoting free, by packaging that work into a value bundle (presales:742-755). A custom-home or large-renovation quote costs about $2k–$3k to produce (presales:74).
- To cover "everything needed before signing the contract": a detailed itemised quotation, a detailed schedule, engineering drawings, contour surveys and so on, so that a fixed-price proposal can be prepared (sales:3220).
- To act as a "tripwire": a smaller paid step that gets the client used to buying from you and builds trust before the big commitment (sales:3216).
- To take the client out of the market early (presales:67, 71).

### 3.2 When
- After the concept is finalised (section 2). Never jump a qualified lead straight to a contract, because it stalls the sale (sales:3234).
- Sequence matters more than speed. Never skip a step to get a signature (sales:1199-1214, 3192).

### 3.3 Price and fee model
- **Range:** $5,000–$10,000 to over six figures, by company, niche, market and home size (sales:3226). If asked for the price on the spot, give a range ($2k–$20k in the example), then take control back with questions (sales:1204).
- **Worked example:**
  - seven features with "valued at" figures summing to $22,000, price $15,000 (presales:377-381);
  - valid for about 7 days (presales:278, 282);
  - with a "why that price" reason ready, such as current capacity (presales:377).
- **Payment:**
  - sign the agreement and pay by credit card up front to activate it (presales:309);
  - take payment on the spot. For a bank transfer, issue the invoice and mark the first meeting "TENTATIVE" until the funds clear;
  - deliver nothing before payment in full (sales:3150-3153).
- **Credit against the contract:** APB leaves this to the builder.
  - Option 1: keep the fee separate.
  - Option 2: "refund" it by building the same amount into the contract price, so the builder is paid either way (presales:384).
  - The PBA FAQ asks "Will I get the prelim money back if I sign a contract?" (presales:375).
- **GST:** in Australia, any price shown to a consumer includes GST (presales:591, 597).
- **Conversion target:** about one PBA in two becomes a contract (sales:2554, 2597, 2606; ops:4987). So APB expects many PBA clients not to go on to build.

### 3.4 What it contains
**The offer anatomy** (presales:117-139):
1. Title.
2. Subtitle.
3. Three to six features and benefits, each in the form "[feature] so you can [benefit]" and tied to a fear (presales:126-128, 161-176).
4. How we do it (internal only).
5. A bulletproof guarantee.
6. Deliverables.
7. FAQs.
8. Proof.
9. Valued at.
10. Price.
11. Price valid until.
12. Why that price.
13. Call to action.

**The worked PBA** (presales:362-393):
- **Features:**
  - a colour consultation;
  - meetings with an interior designer ("set the number");
  - detailed construction drawings;
  - structural and footings engineering "so you avoid being exposed to allowances";
  - a branded "Price Optimisation Service", which is the quoting process renamed so the builder isn't seen as a commodity quoter;
  - a job schedule covering every stage, "so you know the exact date your new home will be handed over, before we start";
  - permit and approvals lodgement.
- **Deliverables** (presales:374):
  - the fixed-price contract proposal;
  - documented selection and colour choices;
  - construction drawings;
  - engineering drawings;
  - the job schedule;
  - "all permits approved";
  - a "guaranteed start date".
- **Guarantee:** one simple one, scaled to the smaller sum. On completion the client gets a guaranteed fixed-price building contract proposal, and the only allowances are for items not yet decided (presales:194, 197-198, 373).
- **How we do it:** "We book the meetings with the interior designer and colour consultant; we take care of the rest." The builder documents internally how long each service takes and the council lodgement steps (presales:372).
- **Proof:** NPS or satisfaction ratings and testimonials about the prelim process itself (presales:254-255, 376).
- **FAQs:** How long does it take? Why pay, can I skip it, can't I just sign the contract? Do I get the money back if I sign? (presales:375).
- **Other bundle items** APB lists: soil tests, engineering, permit lodging, selection choices, colour consultants (presales:746).
- **Timeline:** keep schedules for designs, concepts and PBAs as well as contracts. Present nothing before a full, committed timeline exists. Build an average PBA schedule and adjust it per project (ops:2373-2380).

### 3.5 What it must not contain
- A line-by-line breakdown of each trade's or supplier's quote (presales:369, 389; sales:1786-1799).
- A promise of a fixed price before the preliminaries are done (sales:2786).
- FAQs or marketing from a different stage (presales:221, 229).
- The internal offer document itself, which is never handed to a client (presales:122, 146).
- An over-engineered guarantee; keep it simple (presales:204).
- APB never says outright "don't put the proposal inside the PBA". That follows from making the proposal a PBA *deliverable*.

### 3.6 How it is presented and signed
- In person (or on Zoom) at the concept review meeting. Prepare the agenda, opening line, close and the drawn-up agreement in advance, "no fumble" (sales:1061-1068). The presentation folder used for proposals also works for prelims (sales:1701).
- Close with "Would it make sense to move to a preliminary building agreement today?", then stay silent (sales:1147-1151). Follow with a choice between two yeses about payment (sales:1233, 2401).
- The client leaves with the first design meeting booked and a calendar invite carrying the agenda (sales:3151).
- Acceptance is a signature plus payment (presales:309).

### 3.7 Objections APB prepares for at this stage
- "Why pay? Can I skip this? Can't I just sign the contract?" (presales:375).
- "How much if we go to prelims today?" (sales:1204).
- "I need to think about it" (sales:1258, 3121).
- "I need to speak to my adviser or family" (sales:1259).
- The builder may also end things here. The "fire bad apples" script is used at the concept or prelim stage. It ends with the builder saying that the preliminary process has concluded and it won't build the home (sales:2593). APB therefore expects the PBA to be able to end without a contract.

### 3.8 How it converts to a contract
The chain runs PBA → fixed-price proposal (the PBA's guarantee) → acceptance → contract (sales:1672, 2798-2810; presales:308, 343):
- the builder prepares the contract, named by type if it comes from a major association ("HIA or equivalent");
- at signing, before any permit is lodged, the client pays a 5% deposit and gives proof of land ownership and the lender's confirmation of funds;
- the portal is set up, construction runs, then handover and a check over the following 4 weeks.

A contract counts as sold only when it is **both** signed **and** the deposit is paid (sales:1399-1413).

**APB contradicts itself on approvals.**
- Winning Offer has the PBA deliver "all permits approved" (presales:374).
- The proposal's next step takes the deposit "prior to lodgement of any permits" (sales:1672, 2802), and the proposal is "subject to … local government development approval" (presales:849).

How others handle it:
- **ZJ** puts approvals *after* the contract, as "PBA2" (B:264-265, 279).
- **The Register** puts planning and building approvals inside the paid stage (Tab 15:p14) and before pricing in its timeline (Tab 15:p32-p38).

This is an owner decision (section 9).

---

## 4. The fixed-price construction proposal

### 4.1 What it is
- The sales document presented after the preliminaries to win the build. It is a persuasion document, "not just a price" (presales:767).
- It sells value, not price; stop sending two-to-five-page quotes (presales:470-486).
- It is glossy and light, because "plain white paper" is for contracts (sales:1694, 1715; presales:552, 566).
- It contains no legal terms and conditions (presales:571, 602).
- It is not the contract. The client accepts it and the builder then draws up the legal contract (sales:1669, 1682).

### 4.2 Section order (presales:770-786)

| # | Section | What APB puts in it |
|---|---|---|
| 1 | Cover | A niche statement; "Fixed Price Construction Proposal prepared for [client] at [address]"; a render; company name and address, not a big logo (presales:556, 809-825) |
| 2 | Introduction letter | Thanks; 30-day validity; "subject to" conditions; signed by a named person (presales:836-856) |
| 3 | Fixed price and scope of work | Plain-English explanation, then the total; the variation process (presales:583-602, 868-891) |
| 4 | Included items | PC, PS and optional-extras tables (est:480-497) |
| 5 | Your inclusions | The full categorised list (est:509-539) |
| 6 | Why build with us | (presales:900-922) |
| 7 | Online project management | (ops:4446-4472) |
| 8 | Our guarantees | (presales:937-958) |
| 9 | Testimonials | (presales:693) |
| 10 | Construction schedule | (presales:694; ops:4476-4495) |
| 11 | Awards | (presales:695) |
| 12 | Licences and associations | (presales:720) |
| 13 | Responsibilities | (presales:721; ops:4502-4528) |
| 14 | Schedule of progress payments | (presales:722) |
| 15 | The next step | (sales:1672, 2798) |
| 16 | Summary letter | (presales:968-989) |

The back cover carries the full contact details (sales:1674). The blank template runs 19 pages and the worked example 28–30 (presales:566, 791).

### 4.3 How the price is presented
- Near the top, under "Fixed price and scope of work". Because the client heard about every change during prelims, the price is no surprise (presales:476, 532-540).
- In this order (presales:586-592):
  1. a plain-English explanation, with no unexplained jargon;
  2. any "subject to approval" notes;
  3. the cost-to-build figure and the company guarantee;
  4. pointers to the sections that break it down;
  5. the total fixed price including GST.
- Only the extras are itemised. The whole estimate is never broken down line by line: give the end price plus the optional extras, like buying a car (sales:1786-1799).
- Value first, price second (sales:3660).

### 4.4 Inclusions, exclusions, PC/PS and options
- **Allowances and extras** (est:480-497; presales:613-628):
  - PC items, PS items and optional extras go in separate labelled tables, each priced inc. GST;
  - optional extras sit outside the contract price, so the client can add them;
  - a late request is never quietly folded into the price.
- **Inclusions:**
  - the full list comes from the PM software, ideally with photos (presales:619-620), grouped by category (est:513-536);
  - a statement says the full selection schedule is attached or available to view (presales:876).
- **Exclusions:**
  - shown inline as "No Allowance has been made for …" notes (est:539);
  - APB's template has **no separate exclusions section**.
- **Renovations** are priced as a base price plus provisional sums plus prime cost items (presales:344, 349).

### 4.5 Variations
- State the variation process and fee at a high level on the scope page. Promise that a variation order will be "generated promptly". Use consumer language such as "builder's margin" even though the builder actually applies a markup (presales:583-597, 881-890; sales:2775, 2785).
- **APB's figure is cost plus 25%** (presales:588, 881; sales:2775). The negotiation story elsewhere uses 20% (sales:2234).

### 4.6 Progress payments
- Set them out as a table by stage that **must total 100%**. Name the stages for your company and explain that work can't move to the next stage until certain things are done (presales:722-731).
- **APB template:** Deposit 5%, Foundations and slab 20%, Frame 20%, Enclosed 25%, Fixing 25%, Practical completion 5% (apbtpl:271-278; presales:983).
- **APB's suggested stage list:** Deposit; Site preparation/excavation; Slab/base; Lower frame; Upper frame; Lockup; Drywall; Fitout/fixing; Practical completion. Use as many as the client will accept, to help cash flow (est:284-296).
- **Front-load where the law allows:**
  - take a significant deposit, use frequent milestones and leave as little as possible to the end;
  - stay within local legal limits and banking rules (presales:39-55);
  - get the payment terms and late-fee clauses legally reviewed (presales:11-27).
- **Deposit:** 5%, at contract signing, before permits (sales:1672, 2802).
- **Renovations:** renovators often bill monthly rather than by stage (ops:1705, 1720).

### 4.7 Programme
- "Your entire project as described in this proposal will be completed within [N] weeks upon commencement of construction", plus a **simplified** Gantt rather than the full detailed schedule (presales:694, 704; ops:4476-4495).
- Count from the start of construction, not from contract signing (ops:4476-4495).
- APB links it to "we can guarantee adherence to this timeframe" and to the handover-date guarantee (presales:694; ops:4476-4495).

### 4.8 Guarantees and warranties
- **The seven guarantees** (presales:937-958, 668-669):
  1. a structural guarantee: six years in the example, "subject to" the contract;
  2. flexibility to change your mind;
  3. superior communication, with "regular on-site meetings";
  4. a home free of defects at handover;
  5. no hidden costs, a fixed price;
  6. a guaranteed handover date, with the builder paying the client for every day over, subject to EOTs for weather and council;
  7. a friendly, transparent team.

  The section closes with a "satisfaction guaranteed" statement.
- Know the legally required periods, which vary by location, and explain the warranty in plain English (sales:4461, 4477).
- On renovations, **drop the structural guarantee** (presales:344, 355).
- Back every claim with a guarantee, proof point or process described elsewhere in the document (presales:988).

### 4.9 Why us, portal and proof
- **Why build with us:** values, unique selling points and value propositions, memberships, and benefits rather than features. The framing is "your journey, not ours" (presales:640-645, 900-922).
- **Portal:** high-level benefits, real screenshots and a demo link. Not a tutorial: the how-tos and the handbook come after signing, "don't overlap" (presales:644-653; ops:4446-4472).
- **Testimonials:** three to eight, at least a full page, with real photos (presales:693, 698; sales:2434).
- **Awards:** include nominations (presales:695).
- **Licences and memberships:** include the numbers, because clients look them up (presales:720, 728). The builder's licence goes on contract offers (presales:247).

### 4.10 Responsibilities
Builder versus owner (presales:721; ops:4502-4528):
- **Builder:** all construction, codes and standards, **"all local government fees and permits"**, insurances, hire, WHS, and notice of required changes.
- **Owner:** water and power connections, site access, site rules, timely selections, prompt answers, and timely payment of claims and variations.

### 4.11 Next step, summary and the presentation meeting
- **Next step:** on acceptance, the builder prepares the contract. Then come the deposit, proof of land ownership and finance, the portal and the handover walkthrough (sales:1672, 2798-2810).
- **Summary letter:** thanks, a restatement of the guarantees and an ask for the business (sales:1673; presales:968-989).
- **Validity:** 30 days from the letter's date, with the reason that supplier and trade prices have been locked (presales:277, 789, 848).
- **FAQs at contract stage:** When will it be finished, and when will it start? Who is my contact? How do I pay the deposit? Will there be more to pay than the contract price? (presales:341).
- **The meeting:**
  - in person or on Zoom, with a presentation folder and two or three copies;
  - walk the client through it step by step;
  - remote acceptance by e-signature, then the legal contract (sales:1694-1711).
- **The close:**
  - ask "Would it make sense to draw up a building contract based on this proposal?" (sales:1147);
  - offer a choice of two construction slots (sales:2402);
  - the price holds only if the work starts by a stated date (sales:2558);
  - at the contract itself: "sign here", then silence (sales:1729-1736).

---

## 5. APB's rules for keeping the offers apart

1. Each offer is a separate offer with its own central offer document (presales:98-99, 107).
2. Splintering: three distinct paid steps. Never sell a contract straight off a qualified lead (sales:3216-3236).
3. Sequence over speed. Never skip a step (sales:1199-1214, 3182, 3192).
4. The guarantee matches the offer: many on the contract, one simple guarantee on the PBA (presales:193, 204).
5. The proof matches the offer: the licence on the contract, NPS for prelims, certifications for concepts (presales:245-261).
6. FAQs belong to this offer at this stage only (presales:221, 229).
7. Validity differs by offer: contract 30 days, prelims about 7 days, concepts today only (presales:276-286).
8. The proposal is not the contract. Terms and conditions go in the contract (presales:571, 602). Portal how-tos and the handbook come after signing, and the two must not overlap (presales:645).
9. Optimise backwards: the contract proposal first, then prelims, then concepts (presales:440, 454).

The explicit rule that the PBSA never carries the construction proposal is the Register's (Tab 13:p43, p60; Tab 15:p20). APB's structure supports it but doesn't state it.

---

## 6. What belongs where

Key:
- **Yes**: belongs in this document.
- **Ref**: this document only refers to the item (by ID, status or one line).
- **No**: keep it out.
- "Owner-approved" means the owner's 16 Nov answers. "Not approved" means stays out (the owner's rule: "Anything not confirmed stays out").

| # | Content | PBSA | Tender Proposal | APB basis | Blue Leaf status / note |
|---|---|---|---|---|---|
| 1 | Personal cover letter, named signatory, date, validity | Yes | Yes | presales:836-856; ZJ PBA p.3 (B:260) | Both docs. Blue Leaf voice, no APB formula wording (Tab 13:p50) |
| 2 | Client brief restated: goals, scope, budget anchor | Yes | Ref (drawing and scope basis only) | sales:3052; presales:126-128; ZJ p.4 (B:261) | PBSA reads the Register brief (Tab 18:p101). The Tender Proposal states its scope from Register and Buildxact |
| 3 | What this stage achieves and excludes | Yes | No | presales:165, 370 | Tab 15:p9-p20 section 03 |
| 4 | Pre-construction deliverables: drawings, engineering, survey/soil, NatHERS, selections and colour, consultant coordination, approvals, cost plan, tender package | Yes | No | sales:3220; presales:371-374, 746 | Tab 15:p14 "Do not promise every item on every job". Two service lists disagree (PBSA draft vs PTSA generator, C:99-121) |
| 5 | "Fixed-price Tender Proposal" listed as a deliverable, with when it is produced | Yes | No | presales:373-374 | Resolves the "mess": the PBSA promises it and never contains it (Tab 13:p43) |
| 6 | Revision limits, number of meetings, who books what | Yes | No | presales:219, 371-372 | Tab 15:p14, p23-p24 |
| 7 | Pre-construction programme: design → consultants → approvals → pricing/tender → contract | Yes | Ref (one line on where the project now stands) | ops:2373-2380; presales:371 | Owner decision 2; Tab 15:p32-p38; "no fake precision" (Tab 15:p16) |
| 8 | Construction programme: weeks from start + simplified Gantt | No (Ref only as a PBSA deliverable) | Yes, page 6 | presales:694, 704; ops:4476-4495 | Owner decision 2; `SCHEDULE_DECISIONS.md:11-18` (signed-off canonical schedule, weeks from site start, no padding shown) |
| 9 | The pre-construction fee: one figure, GST stated | Yes | No (except a credit line, row 11) | sales:3226; presales:377, 591 | Possible inc/ex GST mislabel on the PTSA fee (C:275-280) |
| 10 | How the fee is paid (up front vs milestones) | Yes | No | sales:3150-3153; presales:309 | **Conflict 8**: APB is pay in full first; D-029/D-038 and the PTSA's 50/50 differ |
| 11 | Fee credit against the contract | Yes (the rule) | Yes (shows the credit applied, citing the PBSA ID) | presales:375, 384 | PTSA credit clause, `salesRoutes.mjs:2380-2382`. Never "inflate the contract" (conflict 10) |
| 12 | Who pays third-party and authority fees, and how | Yes (pre-construction fees) | Yes (construction-stage fees) | ZJ p.8 (B:265); ops:4510-4528 | Must be one fact stated the same way in both. Today council fees sit in both responsibilities and exclusions (TPR:34) |
| 13 | IP and design ownership, termination, non-proceeding, extra services, suspension | Yes | No | Not in APB (gap, section 8); sales:2593 implies non-proceeding | Tab 15:p17, p22-p28; legal review needed (Tab 15:p27) |
| 14 | One simple PBA guarantee ("a fixed-price proposal with allowances only for undecided items") | No (not approved) | No | presales:194, 373 | Not on the approved list. Tab 15:p26 "do not promise final contract price until documentation and pricing completed" |
| 15 | Next step: sign, pay, first design meeting booked | Yes | No | presales:309; sales:3151 | Signing method open (Tab 13:p89; DEC-CT) |
| 16 | PBSA acceptance / signature block | Yes | No | presales:309 | D-035 doesn't apply; the PBSA is signed (Tab 01:p176) |
| 17 | Total fixed price inc GST, near the top, plain-English explanation first | No | Yes | presales:476, 532-540, 586-592, 881-882 | Spec P03; Buildxact is the sole price authority (Tab 27:p308) |
| 18 | "Subject to" conditions (drawings, engineering, approvals) | No | Yes | presales:849, 853 | Should reflect the real approval status from the Register, not a fixed caveat |
| 19 | PC items and PS items, separate tables | No | Yes | est:480-497; presales:613-617 | PC/PS only from the Buildxact allowance flag (Tab 11:p43; Tab 05:p15) |
| 20 | Optional extras priced outside the contract | No | Yes | presales:618, 628; sales:1786-1799 | Spec Appendix D |
| 21 | Full inclusions list | No | Yes | presales:619-620; est:509-536 | Spec Appendix A. The original template's static inclusions are a live defect (TPR:24) |
| 22 | Exclusions / work by others | Yes (stage exclusions) | Yes (construction exclusions) | est:539 (inline "No Allowance") | APB has no separate list; Blue Leaf needs one (spec Appendix C; empty-exclusions defect B:214) |
| 23 | Trade-by-trade or line-by-line cost breakdown | No | No | sales:1786-1799; presales:389 | **Conflict 15**: issued Blue Leaf proposals show category totals (B:239). Owner to choose |
| 24 | Variation process: written, priced before work proceeds | No | Yes | presales:583-597, 885-887 | Keep the process. Detailed mechanics go in the contract (presales:602) |
| 25 | Variation margin % | No | No (25%); any other % only if the owner sets one | sales:2775; presales:588, 881 | **Owner: 25% not approved.** The issued Q1189 proposal said 15% (B:209) |
| 26 | Warranties: 10-year structural, 5-year non-structural, transferable, 6-month defects | No | Yes | presales:668-669, 939; sales:4461, 4477 | **Owner-approved.** Register keeps warranties out of the PBSA (Tab 13:p85, p46). Scope on renovations open (conflict 4) |
| 27 | Other APB guarantees: handover date with daily payment, defect-free, satisfaction, friendly trades, change-your-mind | No | No | presales:937-958 | Not approved. Register bans unbacked guarantees (Tab 13:p25, p57; Tab 11:p89) |
| 28 | "Every home" standard inclusions | No | Yes, checked against the job's inclusions | (Blue Leaf's own; APB "why build with us" presales:643) | **Owner-approved.** Must not contradict job inclusions (B:227; spec P05 hard gate) |
| 29 | Weekly site meetings | No | Yes | presales:337, 940 | **Owner-approved.** Pick one wording: "meetings", not "updates" (B:226) |
| 30 | Portal features (benefits, real screenshots) | No (or one line if the pilot policy allows) | Yes | presales:644-653; ops:4446-4472 | **Owner-approved for the Tender Proposal.** PBSA must not promise the portal before onboarding (Tab 15:p18). Pilot early access (`R05_RELEASE_PACKAGE.md:54`). No placeholder screenshot (Tab 13:p56) |
| 31 | Why Blue Leaf (values, how we work) | Short (why this stage protects you) | Yes | presales:126-128 (PBA); 900-922 (proposal) | Blue Leaf voice; banned words (Tab 13:p69) |
| 32 | Testimonials | No | No, until real permissioned ones exist | presales:376, 693; sales:2434 | Not confirmed. Stock or sample testimonials are banned (Tab 13:p25, p56) |
| 33 | Awards | No | No, unless real and confirmed | presales:695 | Not confirmed (Tab 13:p25) |
| 34 | Builder's licence number, ABN | Yes (identifiers) | Yes | presales:247, 720, 728 | A factual identifier, not a "claim", but not on the confirmed list. Confirm. Data holds BLD and ABN (A:215) |
| 35 | APB or other association membership | No | No (APB); others only if confirmed | presales:720, 909, 921 | Register bans APB client-facing (SOP 02-20:129). The APB template prints it (A:228) |
| 36 | Responsibilities, builder vs client | Yes (pre-construction: client decisions, access, information) | Yes (construction: site access, connections, selections, payments) | presales:721; ops:4502-4528 | Keep the two lists consistent with row 12 |
| 37 | Progress payment schedule, totalling 100% | No | Yes | presales:722-731, 983; est:284-296; apbtpl:271-278 | **Owner prefers 5/20/30/20/15/10**, subject to SA law (section 7, conflict 2) |
| 38 | Contract next step: contract type, deposit, proof of finance, slot confirmation | No | Yes | sales:1672, 2798-2810; presales:308, 343 | Contract template open (DEC-CT); onboarding only after a signed contract (D-028, Tab 01:p112) |
| 39 | Handover walkthrough, 4-week check | No | No (not approved), apart from the approved 6-month defects term | sales:2805-2806; presales:950 | Not on the approved list |
| 40 | Construction slot / "guaranteed start date" | No | No, unless the owner approves real slot wording | presales:374; sales:1554, 2402, 2557 | "No false construction commitments" (Tab 17:p55); no fake scarcity (Tab 13:p25) |
| 41 | Price validity | Yes (genuine period) | Yes (30 days, from the dated letter) | presales:276-286, 789, 848 | Hub PTSA 14 days default; proposal letter 30 vs next steps 14 (A:236). Must be genuine, not urgency theatre |
| 42 | Legal terms of the building contract | No | No (summary only) | presales:571, 602 | They belong in the contract |
| 43 | Construction drawing and spec revision basis | Ref (the concept drawing it starts from) | Yes | presales:849; ZJ proposal (B:344); Q1189 p.1 (B:238) | Spec Appendix F |
| 44 | Selections status | Yes (as a deliverable) | Ref (the selection schedule the price relies on) | presales:371, 876 | Register selections pair is the source |

**In neither document:**
- "Valued at" stacking and discounted-from prices (presales:377-381, 412).
- Today-only or 7-day urgency used as theatre (presales:278-292).
- Seasonal "why that price" specials (presales:280, 412).
- Scarcity lines ("we only build 12 homes a year") unless genuine and approved (sales:2552).
- The "Price Optimisation Service" branding (presales:369).
- "Dream home" and "your journey, not ours" (presales:913, 973).
- Lifestyle images on every page, per "remember you are still selling!" (presales:794, 877). The Register allows one hero photo (Tab 13:p68; Tab 11:p88).
- APB membership.
- The internal offer document (presales:122).
- The client handbook and portal how-tos (presales:645).

---

## 7. Where APB conflicts with the Master Register or the owner's decisions

| # | APB says | Blue Leaf position | What it means for planning |
|---|---|---|---|
| 1 | Variations at cost + 25% "builder's margin", stated in the proposal (sales:2775, 2780; presales:588, 881-885, 978, 983) | **Owner: 25% not approved, stays out.** The Register already flagged a "universal 25% variation margin" (Tab 11:p89; Tab 13:p57). The issued Q1189 proposal used 15% (B:209). The 25% is hard-coded in `feeProposalTransform.mjs:341, 349` (B:208) | Keep APB's *principle* (state how variations are priced up front) but no percentage until the owner sets one. Remove the hard-coded 25% from any rebuilt data path |
| 2 | Progress payments 5/20/20/25/25/5 (apbtpl:271-278; presales:983). Front-load within local legal limits; get legal review (presales:19, 39-55) | **Owner prefers 5/20/30/20/15/10**, "subject to what is legally acceptable". Cumulative 5/25/55/75/90/100 against APB's 5/25/45/70/95/100. The owner's is more front-loaded to frame and keeps 10% (not 5%) to practical completion | APB gives no SA rule. The legality of the deposit size and of any payment ahead of work done must be checked against SA domestic building law (Building Work Contractors Act 1995 (SA) and its regulations). Not researched here. Renovations may need different stages or monthly claims (ops:1705); a "slab/base" stage won't exist on many alterations |
| 3 | Structural guarantee of **6 years** in the worked example (presales:939, 948). Legal periods "~6 years structural, a couple of years non-structural" (sales:4461, 4477) | **Owner-approved: 10-year structural, 5-year non-structural, transferable, 6-month defects** | Use Blue Leaf's terms. Word them as company warranties and say how they relate to statutory warranties and insurance. Check the wording with a lawyer (APB: "know your legally mandated periods") |
| 4 | Drop the structural guarantee on remodels (presales:344, 355) | The 10-year structural warranty is approved without a stated scope. Blue Leaf mostly does extensions and renovations | Owner to confirm the scope, for example whether it covers the new structural work Blue Leaf performs. Otherwise the claim overreaches on alterations |
| 5 | A seven-guarantee stack, including a handover date with a daily payment to the client and "satisfaction guaranteed" (presales:937-958) | Only the warranties, "every home", weekly meetings and portal are approved. The Register bans guarantees without contract backing (Tab 13:p25, p57; Tab 11:p89) | All other APB guarantees stay out. The fixed price can be described as a plain fact of the offer, without "no surprises, guaranteed" language |
| 6 | Construction schedule with "we can guarantee adherence" (presales:694; ops:4476-4495) | The schedule must be signed off and shown in weeks, never as dated promises, with no padding shown (`SCHEDULE_DECISIONS.md:11-18`); "under-promise" language rejected (TPR:36) | Page 6 shows the signed-off programme without an adherence guarantee |
| 7 | Name APB and other associations in "Why build with us" and Licences (presales:720, 909, 921) | No client-facing APB (Tab 13:p50, p59; SOP 02-20:129) | Delete APB everywhere client-facing. Other memberships only if the owner confirms them |
| 8 | The PBA is paid **in full, up front**, by card on signing; no service before payment (sales:3150-3153; presales:309) | D-029: detailed work starts when the PTSA is **signed**, with no payment gate. D-038: staff may work ahead (Tab 01:p115, p195). The live PTSA uses 50/50 (execution / delivery of the cost plan) (A:298; B:244) | Owner to choose the PBSA's payment terms. APB's model isn't Blue Leaf policy. The Xero invoice flow follows signing (`XeroInvoiceCard.jsx:30`) |
| 9 | PBA deliverables include "all permits approved" and a "guaranteed start date" (presales:374) | "Do not promise every item on every job" (Tab 15:p14); "no … false construction commitments" (Tab 17:p55); a start-date guarantee isn't approved | The deliverables table is per job, with owner, revision allowance and what is excluded. No start-date guarantee |
| 10 | The prelim fee can be "refunded" by inflating the contract price by the same amount (presales:384) | D-004: no internal margin or cost basis client-facing; documents built from shared data (Tab 01:p18). The PTSA credit clause credits openly (`salesRoutes.mjs:2380-2382`) | Never inflate. If credited, the PBSA states the rule and the Tender Proposal shows the credit as a visible line tied to the PBSA reference |
| 11 | Sales devices: "valued at" anchors, 7-day or today-only prices, seasonal specials, scarcity and urgency lines (presales:273-292, 377-381, 412; sales:2543-2578) | Fake scarcity, APB tone and unbacked claims are banned (Tab 13:p25, p57; Tab 11:p89) | Keep validity periods genuine (prices held, consultant availability). No valued-at tables |
| 12 | Lifestyle images on every page; a 19–30-page glossy proposal (presales:566, 791, 794, 877) | One real hero photo only where appropriate (Tab 13:p68; Tab 11:p88). PBSA about 6–10 purposeful pages (Tab 15:p9). Spec v0.1: 8 editorial pages plus appendices A–F (A:277-278) | Follow the Register and the spec. APB's page count isn't a target |
| 13 | Testimonials (3–8) and awards are standard proposal sections (presales:693-695) | Not on the approved list; stock or sample testimonials banned (Tab 13:p25, p56) | Leave the sections out until real, permissioned material exists. No placeholders |
| 14 | Builder responsibilities include "all local government fees and permits" (ops:4510-4528) | In Blue Leaf's model, approvals mostly happen during the PBSA stage (Tab 15:p14). Today the proposal lists council fees in both responsibilities and exclusions (TPR:34) | Decide once who pays which authority fees in each stage, and print the same fact in both documents |
| 15 | Don't itemise the estimate; show the end price plus extras (sales:1786-1799; presales:389) | Blue Leaf's issued proposals show category totals that add up to the total (B:239); spec Appendix E is a "price summary" | Owner choice: category totals (current practice) or headline plus allowances and extras (APB) |
| 16 | Design-and-build only; never quote other people's plans or tender (sales:1819, 2741-2758, 2835) | Build-only, plans-supplied and architect-tender pathways skip Concept and the PTSA (Tab 26:p184; `DOCUMENT_SUITE.md:97`; SPB:753-757) | The Tender Proposal must work with no PBSA: no assumed credit, no assumed PBSA-produced drawings, and the drawing basis always stated |
| 17 | Approvals: inside the PBA (presales:374) **or** after the contract (sales:1672, 2802; presales:849). ZJ: after the contract (B:279) | The Register puts approvals in the paid pre-construction stage and before pricing (Tab 15:p14, p32-p38) | Owner to confirm where approvals sit. This drives the PBSA programme, its fee scope and the Tender Proposal's "subject to" wording |
| 18 | Proposal "subject to full working drawings, engineer's design and local government development approval" (presales:849) | The issue gate requires validated data and no stale caveats (Tab 11:p91; Tab 15:p28) | Generate the caveat from the actual status of drawings, engineering and approvals |
| 19 | The PBA is an offer form: features, sign and card (presales:362-393). APB says nothing about IP, revisions, termination or third-party costs | The PBSA is a signed services contract needing those terms and SA legal review (Tab 15:p17, p22-p28; `R05_RELEASE_PACKAGE.md:52` PTS-02) | APB can't be the template for the PBSA's terms (section 8) |
| 20 | Brand last; no typeface rule (sales:1704-1717; presales:499-514) | Owner: Playfair Display headings and Lato body, per Spec v0.1. The document suite is Lato-only (`design-system.mjs:14`; A:286) | No APB conflict. Open: does the PBSA also take Playfair headings, so both documents share one look? |
| 21 | Weekly *updates* from the site supervisor (presales:337) and "regular on-site meetings" (presales:940) | Owner approved weekly site **meetings**. Blue Leaf drafts mix "updates" and "meetings" (B:226) | Use "weekly site meetings" consistently, in the Tender Proposal only |

---

## 8. What the PBSA needs that APB doesn't supply

APB's PBA amounts to a signature and a card payment (presales:309), and the ZJ example is just as thin on terms (B:278, 282). The Register requires the PBSA to state the following (Tab 15:p17, p22-p28):
- the fee inc/ex GST, itemised or by stage;
- invoice milestones;
- whether consultant and authority costs are included, reimbursed at cost, or contracted directly by the client;
- revision limits;
- extra services and how they are charged;
- deadlines;
- programme dependencies;
- suspension and schedule changes;
- cancellation, termination and refunds;
- design and IP ownership, and use of purchased reports if the client leaves;
- how the preliminary cost indication relates to the later fixed price (Tab 15:p26);
- the signature method;
- SA legal review (Tab 15:p27).

APB expects only about half of PBAs to become contracts (sales:2554, 2597), and the builder may decline after the PBA (sales:2593). So **what the client keeps and owes if no contract follows** is the PBSA's central legal question, and APB doesn't answer it.

---

## 9. For the planning conversation

**The split rule APB supports:**
- The **PBSA** is about the pre-construction work: what it delivers, when, what it costs and on what terms. One of its deliverables is the Tender Proposal.
- The **Tender Proposal** is about the building work: price, what's in and out, programme, payment stages, warranties and approved claims, and the step to the contract.
- Marketing claims live only in the Tender Proposal, and only if approved. The PBSA stays lean.

**Facts both documents must state the same way.** Each should come from one source, never re-typed:
- the PBSA reference and fee, and the credit rule;
- who pays authority and consultant fees in each stage;
- approval status;
- the drawing and spec basis;
- client and site identity.

**Pathways.**
- Design-and-build: PBSA → Tender Proposal.
- Plans-supplied, build-only and architect-tender: Tender Proposal only. Its template must not depend on the PBSA.

**Decisions the APB reading raises** (beyond the five already answered):
1. Where do approvals sit: inside the PBSA stage (Register) or after the contract (ZJ and part of APB)? (Conflict 17.)
2. How is the PBSA fee paid: in full at signing (APB), 50/50 (live PTSA), or something else? Is it credited against the contract, and within what window? (Conflicts 8 and 10.)
3. Is any variation margin printed at all now that 25% is out, and if so what figure? (Conflict 1.)
4. What is the scope of the 10-year structural warranty on extensions and renovations? (Conflict 4.)
5. Does the Tender Proposal show category totals or a headline price plus allowances and extras? (Conflict 15.)
6. Are licence and ABN identifiers confirmed for print? Which memberships, if any? (Rows 34-35.)
7. Do renovations get a different payment-stage set, such as no slab stage or monthly claims? (Conflict 2.)
8. Do both documents share Playfair Display headings, or is the PBSA Lato-only? (Conflict 20.)
9. Will SA legal review cover the PBSA terms, the deposit and payment-stage percentages, and the warranty wording together? (Conflicts 2, 3, 19.)

# B. South Australian payment and contract law for the PBSA and the Tender Proposal

16 November 2026. Planning research, workstream B. Read-only: nothing in the Hub, Drive or Dropbox was edited, committed, uploaded or sent.

> **This is research, not legal advice.** It reads the primary legislation and official guidance in force on 16 November 2026 and flags where the text is unclear. A South Australian building and construction lawyer must confirm the points in §9 before either document is issued.

**Path shorthand used in citations**
- `L/` = `/private/tmp/claude-501/-Users-samuelmorris/715d0884-48f4-42a4-8fc0-9d32e311a3a3/scratchpad/pbsa/planning/law/`. Text extracted from the official PDFs is kept there, so line citations can be checked.
- `R/` = `/private/tmp/claude-501/-Users-samuelmorris/715d0884-48f4-42a4-8fc0-9d32e311a3a3/scratchpad/pbsa/research/`.
- Repo paths are relative to `/Users/samuelmorris/Desktop/blue-leaf-hub.nosync`, branch `doc-suite-r01` at `b0fc85c`.

---

## 0. Bottom line

1. **The brief's legal sources are out of date.** Three things have changed:
   - The *Building Work Contractors Regulations 2011* were **repealed on 1 September 2026**. The *Building Work Contractors Regulations 2026* replaced them (`L/bwc-regs-2026.txt:1,56,1108`).
   - Section 30 of the Act was **restructured on 15 January 2026** by the *Statutes Amendment (Building and Construction Industry Review—Penalties) Act 2025*, with new expiation fees (`L/bwc-act.txt:2214-2224`; `L/act-68-2025.txt:137-175`).
   - The "minor domestic building work" threshold rose from $12,000 to **$20,000** for contracts made on or after 10 November 2025 (`L/bwc-regs-2026.txt:114-121`).
2. **Deposit.** A deposit under a domestic building work contract may be **at most 5% of the price if the price is $20,000 or more**, and at most $1,000 below that. Nothing else may be taken before the work is done, except "prescribed payments":
   - fees paid to third parties for professional services (engineer, drafter, surveyor);
   - the building indemnity insurance (BII) premium;
   - fees required by an Act.

   (Act s 30(4), `L/bwc-act.txt:1146-1172`.)
3. **Progress payments.**
   - SA law **sets no stage names or stage percentages**.
   - Every claim must be **"a genuine progress payment in respect of work already performed"** (s 30(1)(a)).
   - The owner need not pay unless the claim is **made in writing** (s 30(3)).
   - A staged percentage schedule is therefore lawful in form. Whether each percentage is lawful depends on the value of the work actually done at that stage, on that job.
4. **The owner's schedule, 5/20/30/20/15/10.** The wizard default is Deposit, Slab, Wall and roof frames, Lock up, Internal linings, Practical completion (`src/lib/feeProposalDefaults.js:9-16`).
   - **Confirmed:**
     - the 5% deposit is exactly at the legal cap;
     - the total is 100%;
     - the last 10% is tied to practical completion.
   - **Not confirmed, and the main risk:** frame at 30% (55% paid in total by frame) and 90% paid by internal linings run well ahead of the value of work done. A rough test on a real Blue Leaf estimate (Q1196, $1,090,164) puts the value done at frame at about 26% and at linings at about 68% (§3.2). Fix-out (joinery, tiling, painting, fit-off, flooring) is about a third of the job's value but has no stage of its own.
5. **The PBSA is very probably a "preliminary work contract" under s 30(4).** It is probably not itself a domestic building work contract.
   - The **s 30 payment rule applies to it**: Blue Leaf may demand payment only for pre-construction work already performed, plus prescribed third-party and statutory payments.
   - The **current PTSA's "50% payable upon execution"** (`L/ptsa-template.txt:24`) and the Hub's whole-fee invoice raised on signing (`src/components/sales/lead-detail/XeroInvoiceCard.jsx:29-31`) **probably contravene s 30**. Since 15 January 2026 the expiation fee for this is $5,000, and the maximum penalty is $500,000 for a company.
   - The formal contract requirements (s 28), the cooling-off right (s 36) and building indemnity insurance do not apply to the PBSA itself, provided it contains no building work.
6. **Warranties.** The approved terms can be offered as contractual extras: 10-year structural, 5-year non-structural, transferable, 6-month defects period. But **the current wording is wrong for SA**:
   - The statutory warranties already cover **all** building work, structural and non-structural, for 5 years after completion (s 32(5)).
   - They pass to later owners by law (s 32(3)).
   - Contract terms cannot cut them down (s 42).
   - So "instead of the standard 2", "twice the standard" and "well beyond the industry's 5-year standard" should go (§6).
7. **The 25% variation margin** is already out (owner decision). There is also a legal reason: a cost-plus margin in an SA domestic building contract is **capped at 15%** (s 29(5)(a); reg 19(1), `L/bwc-regs-2026.txt:526-527`).
8. **Typeface caveat for the contract stage.** The prescribed Form 1 notice must be printed in type "not smaller than 10 point Times New Roman font". It must contain only the prescribed content (reg 18(2), `L/bwc-regs-2026.txt:507-520`). It cannot be restyled in Playfair Display or Lato. This does not affect the Tender Proposal or the PBSA.

---

## 1. Sources read and their versions

| Source | Version and status | Where |
|---|---|---|
| *Building Work Contractors Act 1995* (SA) | Version 15.1.2026, current authorised | https://www.legislation.sa.gov.au/_legislation-documents/lz/c/a/building-work-contractors-act-1995/current/1995.87.auth.pdf → `L/bwc-act.txt` |
| *Building Work Contractors Regulations 2026* (SA) | Version 1.9.2026, in force from 1 Sep 2026; Schedule 3 repeals the 2011 Regulations | https://www.legislation.sa.gov.au/_legislation-documents/lz/c/r/building-work-contractors-regulations-2026/current/2026.58.auth.pdf → `L/bwc-regs-2026.txt` |
| *Building Work Contractors Regulations 2011*: historical version 1.7.2020–9.11.2025, for the history of s 30 | Repealed | https://www.legislation.sa.gov.au/_legislation-documents/lz/c/r/building-work-contractors-regulations-2011/2025.11.09/2011.197.auth.pdf → `L/bwc-regs-2011-hist.txt:491-508` |
| *Statutes Amendment (Building and Construction Industry Review—Penalties) Act 2025* (No 68 of 2025) | Commenced 15 Jan 2026 (Act history, `L/bwc-act.txt:2214-2224`) | https://www.legislation.sa.gov.au/_legislation-documents/lz/v/a/2025/statutes-amendment-building-and-construction-industry-review-penalties-act-2025_68/2025.68.un.pdf → `L/act-68-2025.txt` |
| *Building and Construction Industry Security of Payment Act 2009* (SA) | Current authorised (consolidated 10.12.2011) | https://www.legislation.sa.gov.au/_legislation-documents/lz/c/a/building-and-construction-industry-security-of-payment-act-2009/current/2009.77.auth.pdf → `L/sop-act.txt:271-292` |
| CBS factsheet, "Working as a builder in SA" | Version 3.1 (September 2026); cites the 2026 Regulations | https://www.cbs.sa.gov.au/documents/AMR-Working-as-a-builder-in-SA.pdf → `L/cbs-working-as-builder.txt` |
| CBS campaign page, "South Australia's building and construction industry changes" (Stage 1, tougher penalties) | Read 16 Nov 2026 | https://cbs.sa.gov.au/campaigns/south-australias-building-and-construction-industry-changes |
| SA Government, "Builder responsibilities" | Last updated 10 Nov 2025 | https://www.sa.gov.au/topics/planning-and-property/land-and-property-development/planning-professionals/builder-responsibilities |
| Law Handbook SA, "Building work contracts" | Revised Feb 2025, content reflects the Nov 2025 changes | https://lawhandbook.sa.gov.au/ch23s11s02.php |
| HIA, "Updates to SA building contract for new homes" | 26 Oct 2026 | https://hia.com.au/resources-and-advice/managing-your-business/dealing-with-contracts/articles/updates-to-sa-building-contract-for-new-homes |
| HIA, "What is a preliminary agreement?" | 3 Sep 2026, **Victoria only** | https://hia.com.au/resources-and-advice/managing-your-business/dealing-with-contracts/articles/what-is-a-preliminary-agreement |
| HIA, "Charging for a quote" | 25 Mar 2021 | https://hia.com.au/resources-and-advice/managing-your-business/dealing-with-contracts/articles/charging-for-a-quote |
| The Good Builder, deposit caps and stage claims by state | 31 Oct 2026 | https://thegoodbuilder.com.au/deposit-caps-and-stage-claims-differ-in-every-state-victorias-rules-change-by-march-2027/ |
| Lynch Meyer on *Duncan v Bert Farina Constructions* [2024] SASCA 67 | 10 Oct 2024 | https://lynchmeyer.com.au/legal-updates/limitation-period-for-statutory-warranty-claims-duncan-v-bert-farina-constructions-pty-ltd-2024-sasca-67 |
| Lynch Meyer, "Changes to the Building Work Contractors Act 1995 (SA)" | 27 Mar 2026 | https://lynchmeyer.com.au/legal-updates/changes-to-the-building-work-contractors-act-1995-sa |
| ACCC, "Warranties" (warranties against defects) | Undated; refers to the 9 June 2019 mandatory text | https://www.accc.gov.au/business/selling-products-and-services/warranties |
| ACCC, "Unfair contract terms" | Penalties from 9 Nov 2023 | https://www.accc.gov.au/business/selling-products-and-services/unfair-contract-terms |

**Not obtained:**
- CBS "Building work in SA: what you need to know" (the PDF is over the 10 MB fetch limit).
- Hansard second-reading speeches for the 2025 Act (HTTP 403).
- AustLII (HTTP 403).
- The Master Builders SA residential contract and the ABIC SA staged-payment schedule (paywalled, or HTTP 404).
- **I found no SA case law on "preliminary work contract" or on what makes a progress payment "genuine".**

---

## 2. (a) The deposit

**The rule** (Act s 30, `L/bwc-act.txt:1097-1172`):
- A person must not demand or require a payment under a domestic building work contract **or preliminary work contract** unless it is "a genuine progress payment in respect of work already performed", or a payment the Security of Payment Act entitles them to (s 30(1)).
- Separately, a person must not demand a payment "unless the payment is a prescribed payment" (s 30(2a), inserted 15 Jan 2026). The expiation fee is $5,000; the maximum is $100,000 for an individual and $500,000 for a company.
- If the payment was received, it is presumed to have been demanded (s 30(2), (2b)).
- **"Prescribed payment"** (s 30(4)) means:
  - (a) a payment to a third party for engineering, drawing, surveying or other professional services;
  - (b) reimbursement of the BII premium, or of a fee required by an Act;
  - (d) for contracts made on or after 1 Sep 2011, a deposit of **not more than $1,000** if "the price stipulated in the contract for the performance of the building work" is under $20,000, or **not more than 5% of the price** if it is $20,000 or more;
  - (e) anything else the Regulations prescribe. The 2026 Regulations prescribe nothing more (`L/bwc-regs-2026.txt`, no s 30 regulation).
- The prescribed owner notice says the same in plain words: apart from third-party fees paid in advance, "the law prohibits the taking of any deposit on a domestic building work contract in excess of $1 000, or if the contract price is over $20 000, 5% of the contract price" (Form 1 cl 13, `L/bwc-regs-2026.txt:1054-1062`).
- CBS (Sept 2026): "You can ask for a deposit before you start work, but it can be no more than … 5 percent of the total contract if $20,000 or more" (`L/cbs-working-as-builder.txt:51-56`). Note the small inconsistency: Form 1 says "over $20 000", the Act says "$20 000 or more".

**History.** Before 15 Jan 2026 the same list sat in reg 17 of the 2011 Regulations, as payments "authorised" under s 30(1)(b) (`L/bwc-regs-2011-hist.txt:491-508`). The 2025 Act deleted s 30(1)(b), moved the list into the Act as "prescribed payment" and created the separate (2a) offence with an expiation fee (`L/act-68-2025.txt:137-175`). The substance of the deposit cap is unchanged; the enforcement is new. CBS says it now issues $5,000 expiation notices for "demanding or requiring payments you are not entitled to", and has set up a Building Industry Response Team that targets "improper payment demands" (CBS campaign page).

**Drafting point for the lawyer.** Read literally, s 30(1) and s 30(2a) are two separate prohibitions:
- a progress payment for work done satisfies (1) but is not on the (2a) list;
- a 5% deposit satisfies (2a) but is not a payment for work done.

The pre-2026 structure (alternatives (a), (ab) or (b)) and the title of the amending Act (a *Penalties* Act) both point to the sensible reading: the two are still alternatives. Every guidance source reads it that way (CBS, Law Handbook, Form 1). **Confirm this.**

**What it means for the Tender Proposal and the construction contract**
- Show the deposit as **5% of the contract price**, with that price GST-inclusive (see §4, GST). It can be demanded on signing.
- **No other up-front amount** may be added: no "contract administration fee", and no ZJ-style **supplier-deposit milestones** for windows, timber or cabinetry before that work is done (`R/B-external-templates.md:343`). Supplier deposits for goods are not on the prescribed list.
- Up-front pass-through items must be listed separately and must be genuinely prescribed: the BII premium, council or authority fees, and third-party engineer or surveyor fees.
- If the client cools off within 5 clear business days, the Magistrates Court can order money returned, or Blue Leaf paid for work done (s 36(4), `L/bwc-act.txt:1299-1335`). The contract should say what happens to the deposit in that case.

---

## 3. (b) Progress payments, and the owner's schedule

### 3.1 The rules

| Rule | Source |
|---|---|
| Only "a genuine progress payment in respect of work already performed" | s 30(1)(a), `L/bwc-act.txt:1097-1105` |
| The owner need not pay unless the builder requested the payment **by notice in writing** | s 30(3), `L/bwc-act.txt:1131-1138` |
| "Progress payments should not be made in advance of the performance of the building work to which the demand relates" | Form 1 cl 14, `L/bwc-regs-2026.txt:1063-1068` |
| "After building work has started, you can only ask to be paid for completed work, via an invoice" | CBS factsheet v3.1, `L/cbs-working-as-builder.txt:51-56` |
| **No statutory stage names, definitions or percentage caps** in SA. I read Part 5 of the Act and Part 4 and Schedule 2 of the Regulations in full: neither has any. A trade article states it directly: in SA "the law does not set the stages" | Act Pt 5; Regs Pt 4; The Good Builder, 31 Oct 2026 |
| Industry norm: the HIA SA New Homes contract (updated Oct 2026) cl 3.4 says "the builder cannot claim a progress claim until the works have been completed" | HIA, 26 Oct 2026 |
| Final payment: the Act has no express "practical completion" rule. But under s 30(1)(a) the last claim can only be demanded once the work it covers is done. Standard forms tie it to practical completion and handover | s 30(1)(a); HIA cl 3.4 |
| Benchmark only, **not SA law**: Victoria caps stage claims for a full build at base 10%, frame 15%, lock-up 35%, fixing 25% (*Domestic Building Contracts Act 1995* (Vic) s 40), with a 5% deposit at $20,000 or more. That is commonly run as 5/10/15/35/25/10 | The Good Builder, 31 Oct 2026; HIA Victoria article |

**Answer to (b).**
- A staged percentage schedule is **acceptable in principle in SA**; it is how the standard forms work.
- What makes it lawful on a given job is that **each claim reflects work actually performed, is made in writing, and is made only after the stage is complete**.
- Because SA defines no stages, the contract must define each milestone objectively (for example, "Base: footings and slab poured and inspected"), so a claim can be checked.

### 3.2 The owner's preferred schedule, 5/20/30/20/15/10

Wizard default: Deposit 5, Slab 20, Wall and roof frames 30, Lock up 20, Internal linings 15, Practical completion 10 (`src/lib/feeProposalDefaults.js:9-16`).

**A rough "genuine progress payment" test on a real Blue Leaf estimate.** Q1196, $1,090,164.20 inc GST. Categories are from `R/b-ext/PBSA_DRAFT_COPY-2.docx.txt:468-498`. Each Buildxact category was assigned to a stage on stated assumptions (script `L/stage_alloc.py`):
- preliminaries and hire spread evenly across the stages;
- carpentry split 60% frame, 15% lock-up, 25% fix;
- plumbing split 25% base, 35% rough-in, 40% fit-off;
- electrical and HVAC split 50/50 between rough-in and fit-off.

**This is an illustration, not a valuation.**

| Stage | Owner % | Paid to date (owner) | Rough value of the stage | Value done to date | Paid ahead of value (to date) | Victorian caps, cumulative (benchmark) | APB server default, cumulative (`server/lib/feeProposalTransform.mjs:208-217`) | Issued Q1189, cumulative (`R/B-external-templates.md:201`) |
|---|---|---|---|---|---|---|---|---|
| Deposit | 5 | 5 | — (not for work) | — | lawful deposit | 5 | 5 | 5 |
| Slab / base | 20 | 25 | 15.4% | 15.4% | ≈ 10 pts (≈ $105k) | 15 | 25 | 20 |
| Wall and roof frames | 30 | **55** | 10.5% | **25.9%** | **≈ 29 pts (≈ $317k)** | 30 | 45 | 40 |
| Lock up | 20 | 75 | 27.8% | 53.7% | ≈ 21 pts (≈ $232k) | 65 | 70 | 65 |
| Internal linings | 15 | **90** | 14.5% | **68.1%** | ≈ 22 pts (≈ $239k) | 90 (at Vic "fixing", later than linings) | 95 (at "Fixing") | 90 |
| Practical completion | 10 | 100 | 31.9% (fix-out to PC) | 100% | — | 100 | 100 | 100 |

**Reading the table**
- **Frame at 30% is the outlier.** On Q1196, frame-stage work (steel, about 60% of carpentry, a share of preliminaries) is worth roughly 10–11% of the price, not 30%.
- Even if all preliminaries and hire are loaded into the base stage, the value done at frame stays near 30%, against 55% paid.
- 90% paid by internal linings leaves **10% to cover fix-out, which is worth about 32%** on this job: joinery, tiling, painting, flooring, fit-offs, stairs and HVAC fit-off.
- On these assumptions, several of the owner's stage claims would include money for work not yet performed. **That is exactly what s 30(1)(a) prohibits.**
- **Consumer-protection angle.** For policies from 10 Nov 2025, BII must cover at least $250,000 per dwelling for non-completion and warranty loss on the builder's insolvency, death or disappearance (reg 20(1)(c), `L/bwc-regs-2026.txt:532-551`). On a job of this size, a claim run about $317k ahead of value at frame is larger than that minimum cover.
- **Extensions and renovations**, which are most of Blue Leaf's work, may have no "slab" or "wall and roof frames" stage, or stages of very different value. A claim for a stage that does not happen cannot be a genuine progress payment. Stage labels must follow the job.
- **Lenders.** Form 1 cl 14 notes that a lender "is likely to make progress payments on your behalf". Lenders may inspect before releasing funds (homeloanexperts.com.au, 18 Sep 2026). A front-loaded schedule risks a shortfall the client must fund. This is a practical point, not a legal one.

**Verdict on 5/20/30/20/15/10**

| Element | Status |
|---|---|
| 5% deposit | **Confirmed lawful** for contracts of $20,000 or more. It is at the cap, so nothing else may be added up front except prescribed payments |
| Total 100% | **Confirmed.** Fixes the 110% template defect (`R/B-external-templates.md:194-202`) |
| Final 10% at practical completion | **Consistent** with s 30(1)(a) and industry forms. Keep it at practical completion, never at "joinery" (the PBSA draft adds a joinery row and reaches 110%: `R/b-ext/PBSA_DRAFT_COPY-2.docx.txt:507-515`) |
| Schedule shape (staged percentages) | **Lawful in form** |
| 20% base, **30% frame**, 90% by linings | **Not confirmed. Likely not "genuine" on a typical Blue Leaf job** (Q1196 test above). Needs a lawyer, ideally with a QS or estimator check on two or three real jobs |
| The code comment calling the server default the "Standard SA residential progress-payment schedule" | **No SA standard exists.** The label is unsupported (`server/lib/feeProposalTransform.mjs:208`) |

**Options for planning** (not decided here):
- **A. Estimate-derived percentages.** Keep the owner's stage labels, fix the 5% deposit and the 10% (or more) at practical completion, and **derive the middle stages per job from the Buildxact estimate** (category-to-stage map, validated to 100%). This is the most defensible under s 30(1)(a).
- **B. A less front-loaded default with a separate fixing stage.** Blue Leaf's own issued Q1189 schedule, 5/15/20/25/25/10 (stage labels not checked), is much closer to value, though still ahead at frame on Q1196.
- **C. Keep 5/20/30/20/15/10** only with a lawyer's written sign-off for the job types Blue Leaf builds. **Not recommended without it.**

---

## 4. (c) What the construction contract must contain

The Tender Proposal is an offer. Everything below applies to the **domestic building work contract**, and to the Tender Proposal **only if a signature on it would itself form the contract**. Avoid that: a signed acceptance that formed the contract without meeting s 28 (for example, no Form 1 notice) would be an offence, and it would **extend the cooling-off right until completion** (s 36(5)(b)).

| Requirement | Source |
|---|---|
| **Scope:** applies unless the contract is "minor domestic building work", i.e. **under $20,000** for contracts made on or after 10 Nov 2025 | s 27(2), `L/bwc-act.txt:968-978`; reg 4(4)(c), `L/bwc-regs-2026.txt:114-121` |
| **In writing**, setting out **all** the contract terms | s 28(1)(a)-(b), `L/bwc-act.txt:980-1012` |
| The **name the contractor is licensed in, and the licence number** (and partners' names and numbers) | s 28(1)(c). Blue Leaf shows "Licensed Builder BLD 332830" (`R/x/concept-agreement-template.txt:25`; `R/b-ext/PBSA_DRAFT_COPY-2.docx.txt:440`). Check that "Blue Leaf Building" is the licensed name, or a registered business name notified to CBS (s 49, `L/bwc-act.txt:1703-1711`) |
| Any contents the **Regulations** require: reg 16, the four statements for a **charging clause** (caveat), including "seek independent legal advice"; reg 17, **pool and spa safety** information for contracts from 1 Sep 2026 | s 28(1)(d); `L/bwc-regs-2026.txt:478-506` |
| **Signed** by both parties, or their authorised agents | s 28(1)(e) |
| A copy of the signed contract given **as soon as reasonably practicable**, with the prescribed **Form 1 notice** "Your building contract: your rights and obligations" | s 28(1)(f); Sch 2 Form 1, `L/bwc-regs-2026.txt:868-1106` |
| Form 1 must contain only the prescribed content, in type "not smaller than 10 point Times New Roman font", legibly. **Do not restyle it** | reg 18(2), `L/bwc-regs-2026.txt:507-520` |
| A **specific, fixed price** and the **terms of payment** | s 29(1), `L/bwc-act.txt:1013-1018`; s 27(3) |
| Rise-and-fall clause only if a completion period is stipulated, with limits after that period | s 29(2)-(4) |
| **Cost-plus items:** actual cost **plus at most 15%** | s 29(5)(a); reg 19(1), `L/bwc-regs-2026.txt:526-527` |
| Hourly-rate work: allowed if the contract specifies the rate | reg 19(2) |
| Any price that may change or is an estimate (PC sums, provisional sums, cost-plus) must carry **"THIS PRICE MAY CHANGE" or "ESTIMATE ONLY" immediately alongside or below it**. All such prices must be set out **in a single list**, and estimates must be "fair and reasonable" | s 29(6)-(8), `L/bwc-act.txt:1046-1065`; Form 1 cl 5, 7, 8 (PC surcharge "up to 15%") |
| **GST:** a fixed-price contract may not contain a GST pass-through clause, so the **fixed price must include GST** | s 29(8a)-(8c), `L/bwc-act.txt:1066-1078` |
| Payments: deposit cap; progress payments for work done; demanded in writing | s 30 (§§2–3) |
| **Cooling-off:** the owner may terminate by signed written notice, served personally or sent by certified mail, within **5 clear business days** after the contract is made. That window runs to **completion** if Division 1 (formal, price or payment requirements) or Division 3 (insurance) was not complied with | s 36(3),(5), `L/bwc-act.txt:1299-1335`; Form 1 cl 2 |
| **BII:** a policy must be in force, and the owner given the **certificate (Form 2), before work starts**, for domestic building work that needs development approval and is not minor ($20,000 or more). Minimum cover $250,000 for policies from 10 Nov 2025; excess at most $400; claim window at least 90 days. CBS: the certificate also goes to council | ss 33-35, `L/bwc-act.txt:1245-1297`; reg 20; Form 2; `L/cbs-working-as-builder.txt:58-64` |
| **Statutory warranties** are implied, and cannot be excluded | s 32; s 42; Form 1 cl 11 (§6) |
| **Variations.** The Act has no stand-alone "variations must be in writing" section. But a "domestic building work contract" is defined to include "any variation of such a contract", so s 28's writing and signature requirements very probably attach to each variation. Form 1 says "most variations require your written approval in advance". HIA SA cl 12: "The owner must provide approval or consent in writing" | s 3(1), `L/bwc-act.txt:174-177`; Form 1 cl 4-5; HIA, 26 Oct 2026 |
| Harsh or unconscionable terms can be avoided or modified by the court | s 38, `L/bwc-act.txt:1415-1440` |
| Separate contracts for staged domestic building work at one site are treated as **one contract** | s 3(2), `L/bwc-act.txt:221-224` |
| Advertising and site sign must show the licensed name and licence number | ss 50-51, `L/bwc-act.txt:1712-1750` |
| **Penalties** (company maximum / expiation fee): | |
| — s 28 | $250k / $5,000 |
| — s 29 | $250k / $5,000 |
| — s 30(2a) | $500k / $5,000 |
| — s 34 (no BII) | $500k / $20,000 |
| — CBS says it is increasing compliance activity | CBS campaign page |

**What this means for the Tender Proposal**
- State that it is **not the contract**. Acceptance leads to a compliant contract with Form 1, the BII certificate before start, and so on.
- Build the price, PC and PS pages in the **s 29(6)-(7) format now** ("ESTIMATE ONLY" or "THIS PRICE MAY CHANGE" beside each allowance, in one list) so they carry into the contract unchanged.
- Show the price **GST-inclusive**.
- Show the **licensed name and BLD number**: the marketing pages are likely an "advertisement" under s 50.

---

## 5. (d) The PBSA under the Act

### 5.1 Is the PBSA itself "domestic building work"? Probably not, if it holds no building work

- "Domestic building work" means constructing, erecting, underpinning, altering, repairing, improving, adding to or demolishing a house; site excavation or filling for that work; or a class the Regulations prescribe (s 3(1), `L/bwc-act.txt:168-173`). The classes reg 4(2) adds (pools, insulation, painting, air-conditioning, solar, plumbing, gas and electrical, other work within the curtilage) include **no design or approvals work** (`L/bwc-regs-2026.txt:89-107`).
- "Perform" includes to "organise or arrange for the performance of building work" (`L/bwc-act.txt:209-212`). The PBSA arranges design, consultants, approvals and pricing, not building work.
- **So a PBSA limited to pre-construction services is very probably not a domestic building work contract.** In that case:
  - s 28 (formalities and Form 1) does not apply;
  - s 29 (fixed price) does not apply;
  - s 36 (cooling-off) does not apply;
  - Part 5 Division 3 (BII) does not apply.
- **Ways this could change** (for the lawyer):
  1. Any **physical site work** in the PBSA (demolition, clearing, excavation, early works) is domestic building work. Section 3(2) could then treat the PBSA and the construction contract as one staged contract, with Form 1, cooling-off and a single 5% deposit cap across both.
  2. A PBSA that **binds the client to build with Blue Leaf** could be argued to be part of a contract "for the performance of domestic building work". The current exclusivity clause binds Blue Leaf, not the client (`L/ptsa-template.txt:33`). Keep it that way.
  3. This research supports the Master Register rule that the two documents **never ship together** (`R/C-master-register.md`, Tab 13:43). Bundling them makes the PBSA look like a stage or variation of the construction contract.

### 5.2 It is very probably a "preliminary work contract"

The definition (s 30(4), `L/bwc-act.txt:1140-1145`) has two limbs:

| Limb | PBSA |
|---|---|
| "(a) collateral to or otherwise related to an existing or **contemplated** domestic building work contract" | Yes. Its purpose is a fixed-price construction tender, and its fee is credited "against the construction contract if executed" (`server/lib/salesRoutes.mjs:2382-2385`) |
| "(b) provides for the performance of work that is **preliminary or ancillary** to the domestic building work" | Yes: design development, consultants, approvals, pricing |

**The consequences: the s 30 payment rule applies to the PBSA**
- Blue Leaf may demand payment of **its own fee only as genuine progress payments for pre-construction work already performed** (s 30(1)(a)). The Security of Payment route is closed: the SOP Act excludes domestic building work on premises the owner lives in or plans to live in (SOP Act s 7(2)(b), `L/sop-act.txt:280-283`).
- It **may request in advance**:
  - **third-party** professional fees (engineer, external designer or drafter, surveyor, and probably certifier and energy assessor under "other professional services");
  - **statutory fees** (development application and lodgement fees; probably the CITB levy as "a fee required to be paid under an Act": confirm).

  (s 30(4)(a)-(b); Form 1 cl 13.)
- **A deposit under a PBSA is unclear.** The deposit cap is keyed to "the price stipulated in the contract for the performance of the building work" (s 30(4)(d)), and a PBSA has no building-work price.
  - One reading: no deposit at all.
  - Another: the PBSA fee is "the price", so a deposit of at most $1,000 applies, or 5% if the fee is $20,000 or more.
  - **On no reading is 50% on signing permitted.**
- **The maximum penalty** is $500,000 for a company. The expiation fee is $5,000. Receiving the money is presumed to be demanding it (s 30(2), (2b)).

### 5.3 Where the current PTSA and Hub conflict

| Item | Where | Problem |
|---|---|---|
| "Payment terms: 50% payable upon execution of this agreement; 50% payable on delivery of the Detailed Cost Plan" | `L/ptsa-template.txt:24`, decoded from `PTSA_TEMPLATE_B64` (`server/lib/salesRoutes.mjs:307`; `R/A-repo-templates.md:78,298`) | The first 50% is demanded before any work is done, and it is not a prescribed payment. **Likely contravenes s 30.** The second 50% is in arrears, which is fine if it reflects the work performed |
| The full "design & pre-construction fee" invoice can be raised as soon as the PTSA is marked signed | `src/components/sales/lead-detail/XeroInvoiceCard.jsx:25-31` | An invoice is a demand. A whole-fee invoice on signing has the same s 30 problem |
| The fee field is named `pretender_deposit_amount` (mig 024), used as a fallback | `server/lib/salesRoutes.mjs:2378`; `R/A-repo-templates.md:109` | "Deposit" wording invites the s 30(4)(d) argument, and the "credited as a deposit" reading below. Do not use it in client documents |
| Credit clause: "credited in full against the construction contract if executed … within N days" | `server/lib/salesRoutes.mjs:2382-2385` | Risk: the credit is read as a pre-payment or deposit on the construction contract. The 5% deposit plus the credited PBSA fee could then exceed the cap. Safer: fees are paid for services performed, and the construction contract states its price **net of a discount** equal to the credit. Lawyer to settle |
| "Non-refundable but may be partially credited at Blue Leaf Building's discretion" (5.4), with Blue Leaf keeping the documents' IP until a construction contract (5.2) | `L/ptsa-template.txt:34,36` | Australian Consumer Law (ACL) **unfair contract terms**: since 9 Nov 2023, using or relying on unfair terms in standard-form consumer contracts is prohibited and attracts penalties (ACCC). Together, a non-refundable fee, retained IP and a discretionary credit need review |
| No licence number; ABN only | `L/ptsa-template.txt:10` | Add the licensed name and BLD number. Section 50 applies if the document is promotional; it is best practice in any case |
| The concept agreement's "small upfront fee" | `R/x/concept-agreement-template.txt:11-12` | Same s 30 analysis. It is probably defensible if it is a third-party designer's fee, or within a $1,000 deposit reading. Outside this brief: flagged only |

### 5.4 A PBSA fee shape that fits s 30 (for the planner)

1. **Split the fee into stage fees** for Blue Leaf's own services, **each invoiced in writing only once that stage is delivered**. Example stages: brief and design development signed off; documentation lodged for approval; approvals obtained; tender price issued. Tie each fee to a defined deliverable.
2. List **third-party consultant and authority costs separately**. Either the client pays them direct, or Blue Leaf requests them in advance as prescribed payments, shown at cost.
3. No "deposit" and no up-front percentage of Blue Leaf's own fee, unless the lawyer confirms a reading that allows one.
4. Show the licensed name and BLD number, state GST, and say how the credit works as a price discount on the later contract.
5. Keep **all physical site work out** of the PBSA.
6. **ACL points**:
   - The PBSA is a consumer services contract, so the consumer guarantees (due care and skill, fitness for purpose, reasonable time) apply and cannot be excluded.
   - Check the **unsolicited consumer agreement** rules if a PBSA is ever signed at the client's home after a meeting Blue Leaf initiated. These rules give a 10-business-day termination period and restrict taking payment within it. Not researched in primary sources here; flagged only.

---

## 6. (e) The statutory warranties the Tender Proposal must not contradict

**The law**
- **Implied in every domestic building work contract** (s 32(2), `L/bwc-act.txt:1194-1232`):
  - (a) work done in a proper manner, to accepted trade standards, and to the agreed plans and specifications;
  - (b) good and proper materials;
  - (c) compliance with all statutory requirements;
  - (d) reasonable diligence, if no completion period is stated;
  - (e) for a new house, reasonably fit for human habitation;
  - (f) fit for a purpose the owner made known, where the owner relied on the builder.
- They **pass to later owners** (s 32(3)) and to purchasers from a builder-vendor (s 32(4)).
- **Proceedings must start within 5 years of completion, and that cannot be extended** (s 32(5)-(6)).
- It is a defence that a defect came from the owner's instructions given against the builder's **written** advice (s 32(7)).
- **Any purported exclusion, limitation, modification or waiver** of a right or warranty under the Act **is void** (s 42, `L/bwc-act.txt:1472-1474`).
- Separately, *Planning, Development and Infrastructure Act 2016* s 159 is a **10-year long-stop** for economic-loss or rectification claims over defective building work. *Duncan v Bert Farina Constructions* [2024] SASCA 67 held that it does **not** extend the 5-year statutory-warranty limit (Lynch Meyer, 10 Oct 2024).
- **How CBS puts it** (Sept 2026): "Claims can be made up to five years after the work was finished. Defective building work is covered for ten years" (`L/cbs-working-as-builder.txt:66-75`).
- **ACL "warranty against defects"** (ACCC). If Blue Leaf promises to repair or compensate for defects (its 10-year, 5-year and 6-month promises), the warranty document must:
  - give the business's name, address, phone and email;
  - say what the client must do to claim, how long the warranty lasts, and who pays claim costs;
  - state that the benefits "are in addition to other rights and remedies";
  - carry the prescribed **mandatory text**, which for goods and services begins "Our goods and services come with guarantees that cannot be excluded under the Australian Consumer Law";
  - not suggest the client's rights are limited to the warranty.

**The current claims tested.** The owner has approved these terms; the problem is the wording.

| Claim | Current wording | SA position | Keep, change or drop |
|---|---|---|---|
| 10-year structural warranty | "well beyond the industry's 5-year standard" (`R/b-ext/PBSA_DRAFT_COPY-2.docx.txt:81-82,177-178`) | A legitimate contractual extra. But the "5-year standard" comparison is shaky: the statutory warranties already cover structure for 5 years, and CBS tells consumers defective work "is covered for ten years" | **Keep the term.** Define "structural", the start date (completion or handover) and the claim process. State that it is in addition to the statutory warranties and the ACL guarantees. Drop the comparison, or make it exact |
| 5-year non-structural warranty | "We extend coverage on non-structural elements to 5 years, instead of the standard 2" (`:83-84,179-180`) | **Wrong for SA.** Section 32 already covers all work, non-structural included, for 5 years. There is no "standard 2" in SA (that structure belongs to another state's scheme). Presenting a statutory right as a Blue Leaf extension risks ACL misleading-conduct and false-representation provisions (ss 18, 29(1)(m)) | **Change.** At most: "All work is covered for 5 years from completion; here is how to raise a claim." No "extend", no "instead of 2" |
| Transferable | "If you sell your home within the warranty period, the coverage transfers to the new owner" (`:85-86,181-182`) | Statutory warranties transfer by law (s 32(3)). Blue Leaf's own 10-year warranty transfers only if its terms say so | **Keep,** worded as "like your statutory warranties, our structural warranty passes to the next owner". Do not imply the transfer is a Blue Leaf gift |
| 6-month defects period | "Twice the standard" (`:87-88,183-184`) | SA domestic law has **no statutory defects liability period**. The "standard" has no source here (the ZJ and APB precedents use a 3-month maintenance call, `R/B-external-templates.md:268`). The period must not be drafted or described as the limit of Blue Leaf's liability (s 42; ACL s 29(1)(m)) | **Keep 6 months** as a rectification period running *alongside* the warranties. **Drop "twice the standard"** |
| Fixed price; variations at cost plus 25% | "the price you sign is the price you pay … cost plus a 25% builder's margin" (`:89-90`; `server/lib/feeProposalTransform.mjs:341,349`) | 25% is out (owner decision). The cost-plus margin cap is 15% (reg 19(1)). Form 1 cl 5 tells owners the price can change through variations, PC sums and provisional sums | **Drop 25%.** Qualify "fixed price" with the PC/PS allowances ("ESTIMATE ONLY") and written variations |
| BII listed as a "Builders Warranty" inclusion (`:209-215`) | Required by law (s 34) | | Keep, but **as a legal requirement, not a bonus** |
| "Every home" inclusions, weekly site meetings, portal (`:75-77,165-167,188,196`) | These are not statutory warranties. They are pre-contract representations: ACL misleading conduct if untrue on any job. If they are meant as promises, s 28(1)(b) wants them in the contract | | **Keep (owner-approved) only where true on every job.** Fix "weekly site updates" versus "weekly site meetings" (`R/B-external-templates.md:224`) |

---

## 7. Other regimes checked

- **Security of Payment Act.** Excludes domestic building work on the part of premises the owner "resides in or proposes to reside in" (s 7(2)(b), `L/sop-act.txt:280-283`). Section 30(1)(ab) and (3)(b) of the BWC Act therefore rarely apply to Blue Leaf's owner-occupier clients. Investor, developer or company owners could fall inside the SOP Act; interstate authority suggests a company cannot "reside". Lawyer to confirm.
- **Licensing, name, advertising and site sign** (ss 49-51): trade under the licensed name or a notified registered business name. Every advertisement shows the name and licence number.
- **Victorian preliminary-agreement rules** (HIA, 3 Sep 2026: $10,000 threshold, deposit limits) are **Victorian**. Do not import them. HIA's 2021 article says there is no general ban on charging for a quote outside Victoria, but SA's s 30 still governs *when* a preliminary-work fee can be demanded.

---

## 8. Confirmed versus not confirmed

| Question | Status |
|---|---|
| Deposit at most 5% of the price for contracts of $20,000 or more ($1,000 below) | **Confirmed** (s 30(4)(d); Form 1 cl 13; CBS) |
| Up-front payments beyond the deposit limited to third-party professional fees, BII and statutory fees | **Confirmed** (s 30(4)(a)-(b)) |
| Progress payments only for work already performed, demanded in writing | **Confirmed** (s 30(1)(a), (3); Form 1 cl 14) |
| SA prescribes no stages or stage percentages | **Confirmed** for the Act and Regulations as read; consistent with trade commentary |
| 5/20/30/20/15/10 lawful in form, totals 100%, final payment at practical completion | **Confirmed** |
| 5/20/30/20/15/10 "genuine" for Blue Leaf jobs | **Not confirmed. Likely not** at the frame and linings stages, on a rough Q1196 test |
| Form 1 must be given with the signed contract, in at least 10pt Times New Roman, unaltered | **Confirmed** (s 28(1)(f); reg 18(2)) |
| Cooling-off 5 clear business days, extended to completion on non-compliance | **Confirmed** (s 36) |
| BII required for work needing approval at $20,000 or more, certificate before start, at least $250k cover | **Confirmed** (ss 33-35; reg 4(4), reg 20) |
| Cost-plus margin at most 15% | **Confirmed** (s 29(5); reg 19(1)). Whether it caps a "cost + X%" **variation** clause: **likely, not confirmed** |
| Variations must be in writing and signed | **Likely** (definition plus s 28), **not expressly stated** |
| PBSA is not domestic building work, but is a preliminary work contract | **Probable,** not confirmed: no case law found |
| PBSA "50% on execution" contravenes s 30 | **Probable,** not confirmed |
| Whether any deposit can be taken under a PBSA | **Unclear** |
| s 30(1) and (2a) operate as alternatives | **Probable** (history and guidance), but the literal text is ambiguous |
| The warranty wordings "instead of the standard 2" and "twice the standard" are inaccurate for SA | **Confirmed** against s 32 for the first; the second has no source |
| ACL warranty-against-defects text required for Blue Leaf's 10, 5 and 6-month promises | **Probable** (ACCC). Lawyer to confirm where it must sit |

---

## 9. What an SA building lawyer should confirm

1. **Section 30 structure.** Confirm that s 30(1) and s 30(2a) (in force from 15 Jan 2026) are alternatives, so that arrears progress payments and capped deposits are both lawful.
2. **PBSA classification.** Confirm the PBSA (design development, consultants, approvals, pricing, no site work) is a "preliminary work contract" and not a domestic building work contract. Confirm s 27(2) (the minor-work exclusion) does not take a PBSA under $20,000 out of s 30.
3. **PBSA fee timing.** Can *any* up-front amount of Blue Leaf's own fee be taken: none, $1,000, or 5% of the fee? Which consultant costs count as "a payment to a third party for … professional services" (certifier, energy assessor, an external designer engaged by Blue Leaf)? Is the CITB levy a "fee required to be paid under an Act"?
4. **The PBSA credit.** Is a credit of the PBSA fee against the construction contract safe as drafted? Should it be a price discount? Could it count towards the 5% deposit cap? Does anything in the PBSA risk s 3(2) (staged contracts treated as one)?
5. **The progress-payment schedule.**
   - Is 5/20/30/20/15/10 acceptable for Blue Leaf's job types (new homes, extensions, renovations)?
   - Should percentages be derived per job from the estimate?
   - How should stage milestones be defined objectively?
   - Should the 10% at practical completion be larger where fix-out value is higher?
6. **Contract form.** Which contract to use (HIA SA New Homes, HIA renovations, MBA SA, or Blue Leaf's own), and its compliance with s 28, s 29 and regs 16–18. Check the charging-clause statements, the pool and spa information, and the Form 1 typography.
7. **Variations.** Must they be signed by both parties? Does the 15% cost-plus cap apply to variation pricing?
8. **Warranty package.** Wording of the 10-year structural, 5-year, transferable and 6-month promises so they do not misstate or limit the s 32 warranties (s 42). Whether, and where, the ACL warranty-against-defects mandatory text and particulars must appear (proposal, contract or handover document).
9. **Tender Proposal status.** Wording that makes clear the Tender Proposal is not itself the contract, so that a client's signature on it cannot form a non-compliant contract (an offence under s 28, and a cooling-off right extended to completion under s 36(5)(b)).
10. **PBSA terms under the ACL.** Unfair contract terms (non-refundable fee, retained IP, discretionary credit, exclusivity, termination); consumer guarantees for the design services; whether unsolicited consumer agreement rules could apply.
11. **Licence and business name.** Is "Blue Leaf Building" the licensed name, or a registered business name notified to CBS (s 49)? Is the BLD number on every advertisement-like page (s 50)?
12. **Security of Payment Act.** Does it reach company or investor clients?

---

## 10. What this means for planning the two documents

**The PBSA (paid pre-construction services agreement)**
- Plan it as a **preliminary work contract**, not a building contract.
- Fees in arrears, per completed stage, by written invoice.
- Third-party and statutory costs listed separately; licence details shown.
- No site work, and no "deposit" wording.
- The credit set out as a discount on the later contract price.
- No warranty or construction-programme content: that belongs to the Tender Proposal and the contract. This supports the register's never-ship-together rule.

**The Tender Proposal (fixed-price construction offer)**
- Page 6 shows the **construction** programme (owner decision).
- The payment page shows a **5% deposit, written-claim stage payments tied to defined completed stages, and the final payment at practical completion**. The middle-stage percentages are pending the lawyer's sign-off, or derived from the estimate.
- PC and PS items carry "ESTIMATE ONLY" or "THIS PRICE MAY CHANGE" in a single list.
- The price is GST-inclusive.
- The warranty page uses the approved terms with SA-accurate wording, plus "in addition to your statutory rights".
- No 25% margin.
- It states that it is an offer leading to a compliant contract (Form 1, and the BII certificate before start).

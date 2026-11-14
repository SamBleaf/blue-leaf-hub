# Project number and Buildxact: decision note

15 November 2026. For Sam. Read-only mapping of the code, the Master Register tabs and Buildxact's public help pages; nothing was called or changed. Full working: the mapping reports in the doc-suite review pack.

## The question

When does Blue Leaf start quoting in Buildxact, compared with when the Hub needs a project number, and how should the two be linked?

## What the mapping found

1. **The Hub needs the number at Concept.** The first controlled document, the Client Project Brief, is issued after the concept presentation. The Tender Scope & Pricing Notes and the tender handover (document 04) are also issued before the estimate is priced. So the number has to exist before any pricing work.
2. **Today the first Buildxact number appears at Tender.** It's the quote number (Q1196), when the estimate is started. The proposal prints "Quote 1196" from it (`feeProposalTransform.mjs`). The job number (J1196) only exists once someone converts the estimate to a job in Buildxact, normally on acceptance or contract. No source shows an estimate being opened at Concept or PTSA.
3. **Buildxact's numbering is rigid** (help.buildxact.com, articles 3829925 and 8482858):
   - Estimate and job numbers come from one sequence.
   - A job keeps its estimate's original number.
   - Re-using a number is refused ("already in use").
   - A re-quote is a copied estimate with a new number.
   - So a Buildxact number can't reliably stay the same for a whole project.
4. **The Hub mostly reads Buildxact.** It reads jobs, estimates and the financial mirror, and writes only purchase orders and work orders. Creating a Buildxact job or lead from the Hub exists in the client code but has never been used. Your Buildxact sync plan defers Hub-originated records to Phase 2 "when confident" (`docs/agent_knowledge/BUILDXACT_HUB_SYNC_PLAN.md`).
5. **Today's link is fragile.** The Hub stores Buildxact's internal job ID (a GUID), entered by hand or matched by address. Lead-to-job conversion doesn't set it.
6. **There's a house precedent.** Carpentry jobs use the Buildxact J-number when linked, otherwise a Hub sequence (CJB-001 …) (`carpentryRoutes.mjs`).

## Options

| | When the number exists | What prints on the Client Brief | Buildxact dependency | Main risk |
|---|---|---|---|---|
| **A. Hub project number** (recommended) | Concept accepted, or the first controlled issue | BLB-CPB-**0417**-R01 | None | Two numbers to relate (Hub and Q/J): handled by the link below |
| B. Buildxact quote number | Only if you open an empty estimate at Concept | BLB-CPB-**1196**-R01 | A manual Buildxact step before the brief can issue | Re-quotes change the Q; empty estimates clutter Buildxact |
| C. Hub creates the Buildxact job or lead by API | Concept | The J-number | Untested API writes, Phase 2 by your own plan | Buildxact down = brief can't issue |
| D. Hub number typed over the Buildxact job number | Contract | As A | Untested: Buildxact may refuse the format or collide with its sequence | Easy to skip |

## Recommendation

1. **A Hub-minted project number on the lead**, allocated by a staff "Allocate project number" action when the concept agreement is accepted (or at the first controlled issue), human-confirmed, locked once a document carries it, and carried to the job when it's created (never overwriting a number an adopted job already has). Format to be decided, e.g. `0417`.
2. **Buildxact numbers are linked to it, not substituted for it.** Quote numbers per estimate, job number, and the internal job ID are recorded as linked facts using the stores the Hub already has (no duplicate columns).
3. **Link without writing to Buildxact.** When estimating starts at Tender, staff put the Hub number in the Buildxact estimate's name or description, e.g. "0417 · Whitcombe · 14 Kestrel Court". The Hub's existing read-only search finds it and links the estimate, and later the job, by number instead of by address.
4. **Leave API creation (C) for Phase 2**, and test D by hand in Buildxact once before relying on it.
5. **Transition:** a lead that already has an issued document under its old `BL…` reference keeps that reference for that document's revisions, so a series never changes number partway.

## Questions for Sam

1. At which stage do you first open an estimate in Buildxact today: concept budget, PTSA cost plan, or not until Tender?
2. Number format: four digits continuing from a starting value (e.g. 0417), or year plus sequence (e.g. 26-014)?
3. Are you happy for staff to put the Hub number in the Buildxact estimate name when they start estimating?
4. Should carpentry jobs move to the same project number, or keep their J-number / CJB scheme?
5. Do jobs created at Tender without a lead (straight from an RFQ) need a project number too?

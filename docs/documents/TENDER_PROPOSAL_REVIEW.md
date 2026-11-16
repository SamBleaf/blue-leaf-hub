# PBSA / Tender Proposal: review of both template versions, and a recommendation

16 November 2026. Read-only research: the repository and its history, Google Drive, Dropbox, the Master Register (all tabs) and the ZJ example. Every claim is cited in the research reports, kept in the session scratchpad (`pbsa/research/A–C`). **Nothing has been changed, and the working template is untouched.**

## What "PBSA" means: the working assumption

The term is used for two documents that the Master Register says must **never ship together** (Tab 13:43):

| Reading | Document | Older, working | Newer, in development |
|---|---|---|---|
| **B (assumed)** | The **Fixed-Price Construction Proposal** (Tender Proposal), priced from Buildxact at Tender | `public/BLB_TENDER_TEMPLATE.docx`: the wizard's default and the only style the Send button renders | `public/BLB_APB_TEMPLATE.docx` (premium style, June 2026) + Spec v0.1 in Drive (15 Nov) + pages 11–37 of `PBSA DRAFT COPY-2.docx` |
| A | The paid **pre-construction services agreement** (the Hub's PTSA; your "Preliminary Building Sales Agreement") | the PTSA generator in `salesRoutes.mjs` | pages 1–10 of `PBSA DRAFT COPY-2.docx` |

Reading B is assumed because:
- your Spec v0.1 and the Hub's planning notes (`SCHEDULE_DECISIONS.md`) use "PBSA" for the construction proposal;
- your phrase "PBSA / Tender Proposal" fits it;
- "the older one works, the newer one is under development" matches these two templates exactly.

**Please confirm.**

## Urgent: the working template has live client-facing errors

`BLB_TENDER_TEMPLATE.docx` is what goes to clients today. It:
1. **Prints one past job's inclusions on every proposal**: "Removal of pergola", "Metal roof sheeting — Kingklip", "Downlight installation x 10 — Haneco viva", and so on. Inclusions, exclusions, the fee schedule and next steps are static text in the template. The wizard saves your edits, but this template never prints them.
2. **Prints a progress-payment schedule totalling 110%**: 5 + 20 + 30 + 20 + 15 + 10 + 10. The August fix changed only the wizard's defaults, which this template doesn't read.
3. **Reprints today's date** when an old proposal is re-opened and re-sent, because the date isn't saved.

You asked that the working version not be overwritten, so I haven't changed it. Until the new proposal replaces it, check those pages of every proposal by hand, or let me make a minimal fix to a **copy** that you approve first.

## The newer version: not issue-ready

The APB premium template is data-bound and closer to the target, but:
- example testimonials and a "[Replace with portal screenshot]" box print to the client, and the placeholder check misses them;
- responsibilities and exclusions contradict each other (council fees are in both);
- warranty, "every home" and a 25% variation-margin claim are not confirmed as Blue Leaf policy;
- "under-promise and over-deliver" goes against your schedule decision;
- the schedule prints blank start weeks and durations, from a second schedule model that isn't the signed-off one;
- fonts aren't embedded;
- the Send button can't issue it.

The PBSA Google Doc is a static working copy with no merge fields and an empty timeline page.

## Recommendation: rebuild, don't refine

**Rebuild the Tender Proposal as a new controlled document on the document design system**, as the CPB, ADB and selections pair were. Keep both existing templates untouched as fallbacks until the new one is approved.

- **Refining the original isn't viable.** Its architecture is the fault: the content is fixed text, not data.
- **Refining the APB template carries forward:** unverified claims, two schedule models, no issue record or revision, fonts that Railway can't render, and a separate design language.
- **What the rebuild reuses:**
  - the working Buildxact import and price data (categories, PC/PS from the estimate's allowance flag, optional items, totals);
  - the wizard's saved inclusions, exclusions and payment schedule, validated to 100%;
  - Spec v0.1's page set (cover, introduction, the offer, scope and tender basis, why Blue Leaf, process and timeline from the canonical schedule, how we deliver, next steps, then appendices A–F);
  - the register's issue, revision and snapshot controls;
  - the selections pair's source mapping, so every scope line, allowance and exclusion traces to Buildxact or the register.
- **Never in it:** unverified claims, example content, padding language, or anything from the services agreement (the two stay separate, as the register requires).

## Decisions needed before the build

1. Confirm **PBSA = the Tender Proposal** (reading B). If you mean the services agreement, or both, say so.
2. **Page 6 "Process and timeline":** the construction programme from the canonical schedule engine (Spec v0.1), or the pre-construction stages (Master Register Tab 15)?
3. **Company claims:** which are approved policy? Warranties (10-year structural, 5-year non-structural, transferable, 6-month defects), "every home" standard inclusions, the 25% variation margin, weekly site meetings, portal features, licences and memberships. Anything not confirmed is left out.
4. **The default progress-payment schedule:** 5/20/30/20/15/10 (the wizard) or 5/20/20/25/25/5 (the server)?
5. **Typeface:** the document suite is Lato only, and Spec v0.1 adds Playfair Display for display headings. Lato only (recommended, for one design language), or Playfair for headings?

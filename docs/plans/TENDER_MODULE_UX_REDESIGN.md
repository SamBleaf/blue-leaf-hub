# Tender Module — Structure & UX Redesign Plan

**Status:** Planning (no code). Written 2026-07-24 after a page-by-page review of the live module against the one real tender, **2 Forrest Avenue, Marino** (job `891c35d3…`).
**Companion:** `docs/plans/TENDER_MODULE_RESTRUCTURE.md` (the data-layer restructure, steps 2–10, already shipped). This plan is the **structure + UX** layer that sits on top of it.
**Decisions locked by Sam (2026-07-24):** ① landing = Tender Board; ② collapse the dual amount model to the new submission strip; ③ Tender Detail becomes the single work-screen (compact compare/verify/award); ④ deliver a written plan + full UI mockup.

---

## 1. Why — findings from the live walkthrough

Reviewed read-only in Chrome against 2 Forrest Ave. Evidence in brackets.

| # | Finding | Evidence (live) |
|---|---------|-----------------|
| F1 | **No module landing.** `/tender-manager` redirects to Home; clicking "Tendering" from outside the module does nothing. | root → `/home` |
| F2 | **Wrong entry point.** RFQ Engine (a blank "upload PDFs" wizard = the *start* of a tender) is the 1st nav item; the Tender Board (the real overview) is 4th. | nav order |
| F3 | **Quote Tracker is a redundant double-up.** Its "Direct RFQs" tab = a weaker copy of the Tender Board (same job list + coverage %); its "Unmatched" tab = the *same component* as Quote Inbox. Its only unique value: expand-a-job → send reminder. | Quote Tracker vs Board both list 2 Forrest Ave @ "26 trades · 50%" |
| F4 | **Every quote amount shows twice.** Each quoted card renders the price in the new submission strip *and* the legacy "Quote amount + Extracted $X — tap to use" box — two "use this" mechanisms. Confusing. | every quoted trade card |
| F5 | **Multi-scope quotes are mis-modeled.** Joinery/Allan Carter sent cabinetry (`Quote.pdf`, no value) **and** stone (`QU-22138.pdf`, $12,390.94). They're two *parallel scopes* but the model treats stone as a **version that supersedes** cabinetry, so cabinetry is flagged superseded, valueless, and excluded from the comparison. The file is recovered (the original bug) but the data shape is wrong. | Joinery card: `v1` (no $) / `v2 · current · $12,390.94` |
| F6 | **Editability gaps.** You can edit amount / verify / reject / pick primary PDF / re-match a stray email. You *cannot* fix a wrong trade or sub, split one email into two scopes, or delete a junk recipient. | a live "**test** · info@blueleafbuilding.com.au" recipient sits in Excavation with no way to remove it |
| F7 | **Cost Intelligence is disconnected.** A large module (37-cat Buildxact template + Benchmarks/Intelligence/Trends/Pre-Tender) that reads the trade taxonomy + Buildxact + the *legacy* cost table — **not** the verified quotes. So real prices never reach it; accuracy is unknowable. | `costIntelligenceRoutes.mjs` reads `cost_intelligence`, never `rfq_quote_submissions` |
| F8 | **One tender = a 26-trade scroll.** No filter (quoted/unquoted), no collapse, no jump-to-trade. ~6 of 26 trades quoted; you scroll past 20 empties. | 2 Forrest Ave detail |
| F9 | **Terminology & hygiene debt.** RFQ Engine stage 3 still "Recipients & **packaging**"; Home action "New RFQ **Package**"; Board H1 "Tendering" vs nav "Tender Board"; duplicate "21 Folkstone Road" job cards; several 0-trade test jobs; "test" recipient in the live tender. | Home / RFQ Engine / Board |

**What's genuinely good already (keep):** trade-grouped comparison headers ("Joinery · 1/1 quoted · lowest $12,390.94"), the verify → benchmark-eligible gate, the award pointer, the recovered quotes, real extraction values on the live data ($61,980 / $46,905 / $33,720 / $19,970 / three window quotes). The bones are right; the *arrangement* and a few data shapes are wrong.

---

## 2. Target information architecture

**Principle: the module opens on the overview, and the workflow reads as one path.**

```
+ New tender  (RFQ Engine wizard — an ACTION, launched from the Board, not a landing)
       │
       ▼
Tenders  ......... the module LANDING (today's Tender Board): KPIs · action queue · job list
       │  open one
       ▼
Tender Detail  ... the ONE work-screen: compare · verify · award every trade, editable
       │  quotes that didn't auto-match
       ▼
Quote Inbox  ..... assign stray inbound quotes to a job+trade
       │  verified quotes
       ▼
Cost Intelligence  benchmarks fed by VERIFIED quotes
Subcontractors ... the directory (supporting)
```

**Nav change:** 6 items → **4 + an action**.

| Today | → | Proposed |
|-------|---|----------|
| RFQ Engine | → | **+ New tender** button on the Board (+ a secondary "New tender" entry); wizard kept, not a primary nav item |
| Quote Tracker | → | **retired** (its reminder/expand folds into the Board/Detail; Unmatched already lives in Quote Inbox) |
| Subcontractors | → | **Subcontractors** (unchanged) |
| Tender Board | → | **Tenders** (the landing; module root redirects here, not Home) |
| Quote Inbox | → | **Quote Inbox** (unchanged; the single home for unmatched) |
| Cost Intelligence | → | **Cost Intelligence** (unchanged nav; wired to verified quotes — §4) |

---

## 3. The Tender Detail redesign — the one work-screen

Today: a vertical stack of 26 trade sections, each a tall card, each amount shown twice. Target: **a dense, filterable comparison table** you can run a whole tender from.

**Layout, top to bottom:**
1. **Header** — address · status · condensed actions (Dropbox · Fee Proposal · Mark won/lost). "Resume RFQ Engine / Email recipients / Add trade / Add sub / Scan inbox / Import backlog" collapse into a single **"⋯ Tender actions"** menu so the 6-button row goes away.
2. **Summary strip** — `26 trades · 6 quoted · 1 verified · lowest-committed $0` + a live **Committed $** as trades get awarded.
3. **Filter row** — chips: **All · Quoted · Awaiting · Awarded · Issues**, plus a trade search. Default view hides the 20 empty trades behind "Awaiting".
4. **The table** — one row per recipient, grouped by trade, quoted-first then cheapest-first:

   | Trade | Subcontractor | Status | Quote (ex GST) | | |
   |-------|---------------|--------|----------------|--|--|
   | Concrete & Footings | LOUMA | ● Received | **$61,980** *(auto)* | Verify | Award · ⋯ |
   | | D Wilson | ○ Overdue | — | | Chase · ⋯ |
   | Joinery | Allan Carter · Cabinetry | ● Received | **$__ needs value** | Verify | Award · ⋯ |
   | | Allan Carter · Benchtops (stone) | ● Received | **$12,390** *(auto)* | Verify | Award · ⋯ |
   | Structural Steel | JDM | ✓ Verified | **$19,970** | ✓ | Award · ⋯ |

   - **One amount model (decision ②):** the amount is a single inline field, pre-filled from extraction with a subtle *(auto)* hint. **Verify** confirms it → the row goes ✓ Verified and **feeds Cost Intelligence**. The legacy "Quote amount / tap to use / Accept-Decline-Query" box is gone; Accept becomes **Award**, Query/Decline move to the row **⋯** menu.
   - **Multi-scope (fixes F5):** a sub's parallel scopes (cabinetry **and** benchtops) render as **sibling rows under the same sub**, both "current", each with its own amount/verify/award — never a supersession chain. A quote that arrives on the wrong scope can be **Split** from the ⋯ menu.
   - **Row ⋯ menu (fixes F6):** *Change trade · Change subcontractor · Split into scopes · View correspondence · Remove recipient.* This is the "rectify in the UI, not in code" layer.
   - **Correspondence** moves from a per-card toggle to the row ⋯ / a slide-in, so the table stays scannable.

5. **Compare drawer** (optional, per trade) — click a trade header → side-by-side of that trade's quotes (the Windows case: Trend $88,680 · Jolong $69,153 · Green Life $44,622) with the cheapest and the verified highlighted.

---

## 4. Cost Intelligence — close the loop (fixes F7)

The restructure made every quote a submission with a `verification_status`; **Cost Intelligence must now consume it.** Add a benchmark source that reads **verified, current, non-superseded** submissions (`getJobSubmissionView`'s `isBenchmarkEligible`) keyed by trade category, so once Sam verifies 2 Forrest Ave's quotes they appear as real per-trade benchmarks ($/trade, spread, sample size). Only then can accuracy be judged. Keep the Buildxact template as the taxonomy; add "live quote benchmark" as a column/tab beside it.

---

## 5. Data hygiene (fixes F9)

- One-off cleanup: remove test/0-trade jobs (99 Debug St, empty Folkstone dup, etc.) and the "test" recipient — as a reviewed script, not silent deletes (mirrors the Quote-Inbox junk task already spawned).
- Terminology sweep: "packaging"→"recipients"/"send"; "New RFQ Package"→"New tender"; Board H1 "Tendering"→align with the "Tenders" nav.

---

## 6. Suggested build sequence (after mockup sign-off)

Each phase independently shippable, same discipline as the restructure (deploy per phase, no live emails, SOPs each phase):

1. **IA / nav** — Tenders as landing + module-root redirect; retire Quote Tracker; fold reminder/expand into the Board; rename. *(low risk, high daily value)*
2. **One amount model** — collapse the dual display on the Tender Detail to the submission strip; Accept→Award; Query/Decline→⋯. *(removes the biggest confusion)*
3. **Table + filters + collapse** — reshape the 26-card stack into the filterable comparison table.
4. **Edit controls** — row ⋯: change trade/sub, split scopes, remove recipient. *(the "rectify in UI" layer; also the real fix for F5)*
5. **Cost Intelligence loop** — verified submissions → benchmarks.
6. **Hygiene + terminology** — cleanup script + rename sweep.

---

## 7. Open questions for Sam

- **Q1** Keep a lightweight "Direct RFQs"-style flat list anywhere (e.g. a Board **List** tab), or is the Board + Detail enough once Quote Tracker retires?
- **Q2** On the Tender Detail table — default to **hiding unquoted trades** (cleaner) or show all with unquoted greyed (completeness)? (Recommend: hide behind an "Awaiting" chip.)
- **Q3** Award behaviour when a sub has two scopes (cabinetry + stone): award **per scope** (recommend) or per sub?
- **Q4** Cost Intelligence benchmark: include **unverified** quotes as a faint "unconfirmed" band, or verified-only? (Recommend verified-only feeds the number; show unverified as context.)

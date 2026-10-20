# Hub review — work log

Source of faults: Google Doc "Blue Leaf Hub Review and Changes" (id 1vuv53UousdRcWyHcCzjxLu8IJg1L4p1_K3QyPQeDYec).
Each fault gets a "Verdict:" paragraph in that doc. This log records every run: what was built, tested, committed,
deployed, and what is waiting on Sam. Newest entry first. The viewable plan page is published from
`docs/hub_review/hub-review-plan.html`.

Status words follow the doc: Open → Implemented, awaiting deploy → Implemented, live → Verified (only Sam verifies).

## Current state (updated 21 October 2026, after deploy)

| Item | Status | Commit | Waiting on |
|---|---|---|---|
| HUB 001 margin / forecast | Not started (Sam: leave for now) | — | Sam's forecast rule |
| HUB 002 Flashings vs Timber and cladding | Implemented, live | a295f13 | iPhone check |
| HUB 003 Save as company standard | Implemented, live | 1f06680 | iPhone check |
| HUB 004 Perforation details folded | Implemented, live | 1f06680 | iPhone check |
| HUB 005 Split to handling length | Implemented, live (300 mm step, mig 209) | 6edcc9f | iPhone check |
| HUB 006 Status labels into Details | Implemented, live | 1f06680 | — |
| HUB 007 Separate orders per section | Implemented, live (mig 208) | a295f13 | Real supplier export |
| HUB 008 Add supplier from the order | Implemented, live (Worker app: 44af8a9) | 1f06680, 44af8a9 | Add the real supplier |
| HUB 009 Order contact prefilled | Implemented, live | 1f06680 | iPhone check |
| HUB 010 Fix an order warning in place | Implemented, live | 6edcc9f | Live 3,000 mm line |
| HUB 011 Takeoffs ▾ show / hide list | Implemented, live | 1f06680, 7bcc090 | iPhone check |
| HUB 012 Lengths inside a flashing | Implemented, live | 1f06680 | Flashing 5 check |
| HUB 013 Flashing order matches the takeoff | Implemented, live | 463aab0 | iPhone check |
| HUB 014 Company cladding defaults | Implemented, live | b56ff14 | Migration 211 |
| HUB 015 Automatic sheet joint | Implemented, live | af660b3 | iPhone check |
| HUB 016 Shared sheets (8, not 7) | Implemented, live | f802d67 | Sam confirms 8 |
| HUB 017 Gable values kept | Implemented, live | fbbcfe6 | iPhone check |
| HUB 018 Drawing recovery cards | Implemented, live | 2cde077 | iPhone check |
| HUB 019 Supplier address + edit | Implemented, live | 1934643 | Migration 210 |
| HUB 020 Reopen / revise a draft | Implemented, live | 463aab0 | iPhone check |
| HUB 021 Plan kept on the phone | Implemented, live | b361b95 | iPhone check |
| HUB 016 follow-up: offcuts shared across walls | Implemented, live | c220c90 | Two-wall iPhone check |
| HUB 022 Height first, trace the whole run | Planned with Sam (not built) | — | Sam's go (answers in) |
| HUB 023 Rectangle and Area on elevations | Planned with Sam (not built) | — | Sam's go (answers in) |

**Migrations for Sam to paste (Supabase SQL editor, in order):**
`supabase/migrations/210_takeoff_supplier_address.sql`, then `supabase/migrations/211_takeoff_company_cladding_defaults.sql`.
Both are one statement and safe to re-run. Applied already: 206, 207, 208, 209.

**Decisions waiting on Sam:** HUB 016 (the recorded wall comes to 8 sheets under the factory-edge rule; confirm, or say
which cut gets to 7). HUB 001 (the ongoing forecast rule). The wall-by-wall plan (`docs/hub_review/WALL_BY_WALL_PLAN.md`):
his OK and six questions before anything is built.

## Log

### 2026-10-21 (later) — deployed; new review items HUB 022–023; revised wall plan
- Deployed main a8e5b22 (HUB 013–021 + HUB 016 follow-up). Live bundle checked; /api/takeoff/company-defaults answers 401.
  Review doc statuses and verdicts set to live. Migrations 210 and 211 still to paste.
- The doc's new HUB 022 (height first, trace the run) and HUB 023 (Rectangle / Area on elevations) arrived. The offcut
  follow-up had been called "HUB 022" here; relabelled "HUB 016 follow-up" (code HUB 016b) everywhere. The 5am run skips
  HUB 022/023 and the wall-flow work.
- Sam answered the wall plan: wall-to-wall ‹ › for the end review only; line tool with a height set first (changeable
  mid-run); windows and doors drawn on the plan into the traced wall; no "Same as W1"; battens worked out from each
  product's fixing rules (Axon: perimeter, top, bottom, behind H joints, uprights at 600; Linea/Stria/timber one way at
  450 or 600), Axon H-flashing and black foam tape behind sheet joins counted. Revised plan (3 readers, 1 planner, 1 skeptic):
  docs/hub_review/WALL_BY_WALL_PLAN.md. About 70 → 35 taps for the 4-wall Axon job. Sam answered the 4 questions (Height + Sill boxes; Linea/Stria battens 600 either way, timber 450;
  batten openings, no nail count; foam tape behind vertical joins, H-flashing by the metre). Waiting on his go.

### 2026-10-21 — HUB 016 follow-up (offcuts across walls) + wall-by-wall plan
- Sam asked for offcuts to be shared through the whole takeoff, not just within a wall. Built as HUB 016 follow-up (c220c90, local):
  one cut plan for every wall of a fibre-cement material under the HUB 016 rules; a shared sheet is counted on the wall of
  its first piece and the cut list names every wall; "Plan each wall on its own" switches it off; the shared plan is used
  only when it is no worse than the walls' own plans. Two recorded 6,573 × 3,600 walls: 16 → 15 sheets.
- Two adversarial review passes (6 + 2 agents). Fixed: a piece within one saw cut of a sheet length was left off the order
  (from HUB 016, ordering short) — now takes the sheet whole, and an unplaceable piece blocks the order; one single-piece
  rule for every listed length; either-edge offcut for a piece needing no edge; wall counts add up to the order; the
  switch only for editors and on the screen's own material; a shared plan never costs more than per-wall plans.
- Tests: 14 HUB 016 follow-up engine tests; all node suites; 220 screen tests; real-server journeys pass in Chromium and WebKit
  iPhone 13 (desktop needed one re-run after a Playwright response-body error, not an app fault). SOP 20-09 v1.5 TC-17.
- Google Doc: follow-up verdict under HUB 016.
- Sam asked for a plan for a seamless wall-by-wall takeoff. Planned only (3 readers, 3 designs, 1 judge):
  `docs/hub_review/WALL_BY_WALL_PLAN.md`. About 60 → 36 taps by numbers for a 4-wall Axon job. Waiting on his OK and six
  decisions; nothing built.

### 2026-10-20 (evening) — review round 2, HUB 013–021
- Deployed first: 44af8a9 (HUB 008 follow-up, Add supplier in the Worker app for office logins). main = 44af8a9.
- Planned HUB 013–021 against the code, then built and committed each on takeoff-r03 (local, not pushed):
  463aab0 HUB 013 + 020 · 1934643 HUB 019 · fbbcfe6 HUB 017 · af660b3 HUB 015 · f802d67 HUB 016 · b56ff14 HUB 014 ·
  2cde077 HUB 018 · b361b95 HUB 021.
- Sam's calls used: HUB 015 joint = 10 mm gap + H-flashing; HUB 016 long tongue-and-groove edges stay factory, the
  other direction can be cut any way.
- Defaults taken where the doc left a choice (written into each verdict): HUB 014 Sam's values seeded by migration 211
  for every James Hardie cladding product, each taking only the answers its own assembly asks; HUB 018 leaving a drawing
  finishes it (an invalid typed size is dropped); HUB 021 plan-level offline only (the takeoff itself still needs signal).
- Tests: 26 node suites green; 219 mocked UI tests green; lint and build green. Real-server journeys: two journey
  checks still encoded the old behaviour (Flashings needed "New order"; the old "occupied cells" wording) and were
  updated for HUB 013 / HUB 016. Re-run: all real-server journeys pass in desktop Chrome and the iPhone 13 emulator.
- Verdicts written in the Google Doc for HUB 013–021, statuses set to "Implemented, awaiting deploy".
- New migrations (not applied): 210 supplier address, 211 company cladding defaults.
- Daily 5am run `hub-review-daily-fixes` set up: it works new Open faults, commits locally, writes verdicts, never
  deploys, and appends to this log.

### 2026-10-20 (day) — batches 2–3 live
- Migrations 208 and 209 applied by Sam and verified read-only. 209 rewritten as one statement (25f026a).
- Deployed main 7bcc090: HUB 002, 005, 007, 010, plus the per-item Takeoffs ▾ list (HUB 011 follow-up).
- Verdicts for HUB 002–012 written in the Google Doc.

### 2026-10-19 — batch 1 live
- Deployed main 1f06680: HUB 003, 004, 006, 008, 009, 011, 012. HUB 001 left alone at Sam's request.

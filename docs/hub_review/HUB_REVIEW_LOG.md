# Hub review — work log

Source of faults: Google Doc "Blue Leaf Hub Review and Changes" (id 1vuv53UousdRcWyHcCzjxLu8IJg1L4p1_K3QyPQeDYec).
Each fault gets a "Verdict:" paragraph in that doc. This log records every run: what was built, tested, committed,
deployed, and what is waiting on Sam. Newest entry first. The viewable plan page is published from
`docs/hub_review/hub-review-plan.html`.

Status words follow the doc: Open → Implemented, awaiting deploy → Implemented, live → Verified (only Sam verifies).

## Current state (updated 20 October 2026, evening)

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
| HUB 013 Flashing order matches the takeoff | Implemented, awaiting deploy | 463aab0 | Deploy |
| HUB 014 Company cladding defaults | Implemented, awaiting deploy | b56ff14 | Migration 211 + deploy |
| HUB 015 Automatic sheet joint | Implemented, awaiting deploy | af660b3 | Deploy |
| HUB 016 Shared sheets (8, not 7) | Implemented, awaiting deploy | f802d67 | Deploy + Sam confirms 8 |
| HUB 017 Gable values kept | Implemented, awaiting deploy | fbbcfe6 | Deploy |
| HUB 018 Drawing recovery cards | Implemented, awaiting deploy | 2cde077 | Deploy |
| HUB 019 Supplier address + edit | Implemented, awaiting deploy | 1934643 | Migration 210 + deploy |
| HUB 020 Reopen / revise a draft | Implemented, awaiting deploy | 463aab0 | Deploy |
| HUB 021 Plan kept on the phone | Implemented, awaiting deploy | b361b95 | Deploy |

**Migrations for Sam to paste (Supabase SQL editor, in order):**
`supabase/migrations/210_takeoff_supplier_address.sql`, then `supabase/migrations/211_takeoff_company_cladding_defaults.sql`.
Both are one statement and safe to re-run. Applied already: 206, 207, 208, 209.

**Decisions waiting on Sam:** HUB 016 (the recorded wall comes to 8 sheets under the factory-edge rule; confirm, or say
which cut gets to 7). HUB 001 (the ongoing forecast rule).

## Log

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

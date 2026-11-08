# Hub review — work log

Source of faults: Google Doc "Blue Leaf Hub Review and Changes" (id 1vuv53UousdRcWyHcCzjxLu8IJg1L4p1_K3QyPQeDYec).
Each fault gets a "Verdict:" paragraph in that doc. This log records every run: what was built, tested, committed,
deployed, and what is waiting on Sam. Newest entry first. The viewable plan page is published from
`docs/hub_review/hub-review-plan.html`.

Status words follow the doc: Open → Implemented, awaiting deploy → Implemented, live → Verified (only Sam verifies).

## Current state (updated 26 October 2026, HUB 029 and HUB 030 live)

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
| HUB 014 Company cladding defaults | Implemented, live | b56ff14 | iPhone check |
| HUB 015 Automatic sheet joint | Implemented, live | af660b3 | iPhone check |
| HUB 016 Shared sheets (8, not 7) | Implemented, live | f802d67 | Sam confirms 8 |
| HUB 017 Gable values kept | Implemented, live | fbbcfe6 | iPhone check |
| HUB 018 Drawing recovery cards | Implemented, live | 2cde077 | iPhone check |
| HUB 019 Supplier address + edit | Implemented, live | 1934643 | iPhone check |
| HUB 020 Reopen / revise a draft | Implemented, live | 463aab0 | iPhone check |
| HUB 021 Plan kept on the phone | Implemented, live | b361b95 | iPhone check |
| HUB 016 follow-up: offcuts shared across walls | Implemented, live | c220c90 | Two-wall iPhone check |
| HUB 022 Height first, trace the whole run (+ windows/doors on the plan, auto battens, end review) | Implemented, live | 9f4818d, 57314d5, 2e37dae, ee7418d | iPhone check |
| HUB 023 Rectangle and Area on elevations | Implemented, live | d9acb34 | iPhone check |
| HUB 024 Aluminium setup as a company product | Implemented, live | 7e6759e | iPhone check |
| HUB 025 Aluminium Conflict explained (false conflict fixed) | Implemented, live | 7e6759e | iPhone check |
| HUB 026 Aluminium plan measuring first | Implemented, live | 7e6759e | iPhone check |
| HUB 027 Timber presets by purpose | Implemented, live | 7e6759e | iPhone check |
| HUB 028 Walls: trace once, studs + plates + noggins together | Implemented, live (25 October, main 0b9d6dc) | 7fcc43a, 4d241a2, eb2edf5, f11bc21, ed2387f, 36ad816, cfaca0f, 9bf6138 | iPhone check |
| HUB 029 Blockers you can tap; an order you can place | Implemented, live (26 October, main 7f83954) | f33c7b5, 6557910, 058186a, a3a7ee2, 849ccc2 | Sam's 3-tap restore on job 413d9151 and the Wall 3 height, then iPhone check |
| HUB 030 Battens are 90 × 35 H3 pine | Implemented, live (26 October, main 7f83954) | 678fedf | iPhone check |

**Migrations:** none waiting for the takeoff. 206–211 are all applied (210 and 211 confirmed read-only on 21 October). HUB 028, HUB 029 and HUB 030 need none.

**Decisions waiting on Sam:** HUB 028's main questions are answered (25 October, rounds 1–3). Its smaller build defaults
are tagged [Default, needs Sam] in docs/hub_review/WALLS_FRAMING_PLAN.md (for example LVL stock in 300 mm steps with
11,000 allowed, the pieces after a join over 11 m, side studs between close openings, no corner plate deduction).
One HUB 028 question is still open: should a cladding's Wall height ignore walls that are only on a Walls item? Today
a cladding traced after Walls starts at the stud cut length (2,700, not the cladded 2,745). The mirror case came up in
the final review: Use here of a cladding wall on Walls takes the cladded 2,745 as the stud length. Walls now says so on
the Use here banner and the SOP says to trace the framing fresh; should it refuse it instead? HUB 016 (8 sheets under the factory-edge rule, or
which cut gets to 7). HUB 001 (the ongoing forecast rule). The aluminium kerf/tolerance feedback (Recording review 06:
drop the per-job saw-cut confirmation for a fixed 3 mm?). The 19 October doc comment asking for Add supplier is built
(HUB 008/019) and can be resolved.

## Log

### 2026-10-26 — HUB 029 and HUB 030 live (main 7f83954)
- Deployed on Sam's standing word ("yes keep going, deploy once everything passes"): merged origin/main (the HUB 028
  retry 0b9d6dc) into takeoff-r03, pushed takeoff-r03 → main as a fast-forward. Railway status success; live bundle
  main-CDDQT-yR.js (was main-Y2iXzoiN.js), and the live TakeoffApp-yrfDPOlF.js is byte-identical to the tested build.
- Final checks before the push: npm run test:takeoff all 40 suites, lint 0, build, screens 305 passed / 1 skipped, both
  real-stack journeys (desktop Chrome, iPhone 13 WebKit).
- Review doc: HUB 029 and HUB 030 verdicts written, both "Status: Implemented". Plan page republished.

### 2026-10-26 — HUB 029 and HUB 030 built (steps 1–6)
- Plan: docs/hub_review/ORDER_BLOCKERS_PLAN.md with Sam's decisions of 25 October (a wall with no height holds the whole
  cladding; Support battens with nothing entered = 600 centres, fixings not counted; the mis-tapped Axon on job 413d9151
  is restored by Sam after the deploy in 3 taps; pine battens H3, 300 mm steps to 6.0 m, pooled for the whole job;
  decision 6: the Walls default products). Scope cut: no Hardie reconcile row (a read-only check found 0 placed or
  exported Hardie batten lines).
- Step 1 f33c7b5: wall_incomplete wording, scope and refs; orderReady; traced walls on a re-scaled page.
- Step 2 6557910: shared/takeoff/fixes.js (every blocker as a one-tap row with a target); decision 6 defaults.
- Step 3 678fedf (HUB 030): OWNER_BATTEN pine, shared across the job; SUPPORT_BATTEN_DEFAULTS.
- Step 4 058186a: the card, the walls and the schedule show fix buttons; Installation "Not checked by the app".
- Step 5 a3a7ee2: Orders "Before you can order" card (chips save at once, Update all, Add all), "Order without …"
  (shared/takeoff/leftOff.js, server + mock; snapshot notIncluded; site appendix line), per-section supplier, held lines
  never pre-filled, Review order › opens a pre-filled draft.
- Step 6: SOPs 20-05 v2.2, 20-06 v2.7, 20-08 v1.6, 20-09 v2.2, 20-12 v1.5; source register OWNER-2026-10-25 entries.
- Tests: npm run test:takeoff all 40 suites; lint 0; build; screens and journeys (see the deploy entry). Two older API
  tests (HUB 022 step 2 and wall-by-wall step 4) fail now and then on random ids, on the previous commit too; flagged as
  a separate task.

### 2026-10-25 — HUB 028 Walls built (steps 1–6), not deployed
- Plan: docs/hub_review/WALLS_FRAMING_PLAN.md with Sam's decisions of 25 October (round 1: Wall height = stud cut, 2
  studs per corner, nothing under or over windows, 6.0 m longest for plates and noggins, 1 noggin row at 2,700 or under
  and 2 over; round 2 from the Gibson order: bottom plate bought full length, 2 full studs beside every opening, all
  timber in 300 mm steps, wet-area walls as their own Walls item at 450; round 3: plates over 6.0 m are one 90 × 45 LVL
  length up to 11.0 m, joined over a stud only past that).
- Built in six local commits on takeoff-r03: 7fcc43a engine options, 4d241a2 material and registry (and the 300 mm grid
  for all timber), eb2edf5 the Walls calculation, f11bc21 Add walls and the Line panel, ed2387f the Walls card and wall
  pages, then step 6 (real-server reload test, the Walls journey, SOPs and this log).
- What Sam gets: **Add walls** (first in the Timber part and in Measure with…) opens the plan with Line, Wall height,
  Stud centres and Double top plate. Trace the run, add the door and window, and one line reads, for the worked
  example, "Walls: 21 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 13 noggins (1 row)". Studs, plates
  and noggins have their own order lines and cut lists. Lintels, jacks and trimmers are never counted (one plain line
  says so). Studs, Plates and Noggins stay for exceptions.
- Tests (step 6 run): 38 node suites pass, 1,119 tests (takeoff-tc-hub028 83; takeoff-api 76 and takeoff-db 26 on the
  isolated Postgres, with the new reload case: parts and their stock, rules, runId/seq, heights and opening types come
  back, the lines after the reload are the preview's, and a run, manual or count measurement on Walls is refused).
  Lint clean, build OK, mocked screens 295 passed and 1 skipped (the real-stack spec, which needs the sandbox). The
  real-stack journeys pass on desktop Chromium and iPhone 13 WebKit, including the new WF journey (Add walls, trace,
  add a door, reload, the same line and the same lines from the real server).
- SOPs: 20-08 v1.5 (new Section 5D Walls, Sections 2–4, 7, 8, 11, 12, TC-15 to TC-17), 20-09 v2.1 (one note), 20-01
  v1.2 (Add walls in the Timber part), 20-12 v1.4.1 (the 300 mm grid line), SOP_CHANGELOG and SOP_INDEX.
- Final review fixes (one local commit "HUB 028: final review fixes"): a Longest length under 1,200 is refused at the
  field and, if one comes in, named once as the part's need with every wall "not counted" (never 0.00 m of plates); a
  wall with a plate that can't be joined is "not counted"; LVL stock starts over the plates' own longest (a 4,800 plate
  product buys 5,100 LVL, not 6,300); a wall on two Walls items is noted on both; Use here on Walls says the height it
  will use as the stud length; Add walls waits for the company products on a slow signal; cut lists read @ 600 before
  @ 1,200; step 1's unused plate gaps removed. SOP 20-08 v1.5.1 (TC-18), SOP_CHANGELOG and SOP_INDEX.
- NOT pushed or deployed. No migration. Waiting on Sam's "deploy", then an iPhone check of Add walls on a real job.

### 2026-10-24 — HUB 022–027 live; Railway secrets reset checklist
- Railway's 21–23 October incident is over. An empty commit 8cb24f8 on main started a build straight away (the GitHub
  link didn't need reconnecting). Live bundle main-0xWSitf3.js = the local build of 90a1a3b; the takeoff chunk with
  Review walls, Add to company products, Measure runs on the plan, Wall height and Size and grade is served;
  POST /api/takeoff/company-products and /company-defaults answer 401 unsigned.
- Doc: HUB 022–027 statuses → Implemented; verdicts → "live 24 October 2026" (6 + 6 replacements, read back).
- Railway asked customers to treat every stored variable as exposed. Published a tick-through reset checklist for Sam
  (artifact FzVt2eGBJfXVT9SAy5LQjW, names only, no values). Read-only checks: GitHub clean (no deploy keys, hooks,
  Actions secrets or other collaborators; all pushes Sam's); no new Hub accounts since 19 October; 3 admins; one saved
  Xero connection in xero_credentials.
- New in the doc since the last run: HUB 028 (added by the 22 October 5am run from 1750.mp4). Not built; waits on Sam.
- The HUB 016 follow-up verdict ("live 21 October") is correct: c220c90 is in a8e5b22.

### 2026-10-21 (night) — HUB 024–027 built; deploy stuck behind Railway's outage
- Sam said deploy: pushed main d066d1e, then an empty commit 3e3cca8 to retrigger. Neither Vercel nor Railway built it:
  Railway had a major outage (builds paused, from 07:24 UTC). main = 3e3cca8 waits for Railway; live is still a8e5b22.
- New doc items HUB 024–027 (Recording reviews 06–07). One workflow: 4 planners, 4 sequential builds, 2 reviewers, 1 fixer.
  HUB 025 cause reproduced on the real server: one save archived and re-created the same wall-opening assignment (untick and
  re-tick inside the 500 ms debounce) → unique-key 23505 → 409 "That was already saved." shown as Conflict. Fixed by
  sending the halves in order; only a real edit clash shows Conflict. HUB 024 Add to company products (office logins;
  same-name other size refused). HUB 026 Measure runs on the plan first. HUB 027 timber Size and grade presets (Sam
  confirmed 120 studs MGP10). 7 review findings fixed. 37 node suites, 282 screen tests, journeys (both browsers) pass.
- Committed 7e6759e on takeoff-r03; NOT pushed to main (deploy needs Sam's word). Verdicts written in the doc.
- Left alone: the kerf/tolerance feedback (Recording review 06) and the reserved 1750.mp4 for the 5am run.

### 2026-10-21 (evening) — wall-by-wall takeoff built (steps 1–5), not deployed
- Migrations 210 and 211 confirmed live (read-only): suppliers.address exists; 10 James Hardie company defaults.
- Products from Sam: foam tape 304560 (25 m rolls), H-flashing 305613 (3,000 lengths).
- Each step: one build agent, three reviewers (Sam's words / regressions / phone), one fixer, full retest; then the
  orchestrator ran the real-server journeys (Chromium + WebKit iPhone 13) and committed.
  1. 9f4818d Line tool + Wall height + runs (HUB 022) — 11 findings fixed.
  2. 57314d5 + Window / + Door drawn on the plan — 18 findings fixed.
  3. d9acb34 Rectangle / Area / Page chip (HUB 023) — 13 findings fixed.
  4. 2e37dae Automatic battens, foam tape, H-flashing — 15 issues fixed (incl. walls cut from another wall's sheets got
     no battens); also capped the cross-wall sheet search (20 walls 632 → 158 ms); journeys J2/J5 updated for the new lines.
  5. ee7418d End review: wall-to-wall Previous/Next, Review order, detail under More — 10 findings fixed.
- Final: 34 node suites (1,005 tests), 260 screen tests, lint, build, real-server journeys all pass.
- Review doc: HUB 022 and HUB 023 verdicts written, status "Implemented, awaiting deploy".

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

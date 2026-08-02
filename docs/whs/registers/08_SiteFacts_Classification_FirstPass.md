# Site-Facts A–E Classification — FIRST PASS (for WHS reviewer sign-off)

Mechanical application of the remediation-brief §2 rule. **Class A = auto-fill** (control asserts a state and nothing more). **B** sequencing · **C** dimension · **D** precondition · **E** two obligations → **highlight-only**. Conservative: any non-A match ⇒ not A.

The `audit` column carries the 13 map-audit findings — several class-A/clean-looking rows are also over-ticks or mis-maps to be fixed in Steps 1–5 *before* even highlight-behaviour ships.

**Summary: 45 targets — 13 proposed class A (auto-fill), 32 highlight-only (B–E).** Reviewer confirms each class + the audit fixes.

| # | SF (answer) | module L | class | why (matched clause) | audit finding | control text |
|---|---|---|---|---|---|---|
| 1 | sf01Scaffold=green | H-01 L3 | **D** | D:"by a licensed scaffolder, handover certi" · C:"300 mm" · B:"before any person accesses the floor lev" · E:"2 obligations in one control" |  | Perimeter scaffold erected to AS/NZS 1576 by a licensed scaffolder, handover certificate received and scaffold tag green before any person accesses th |
| 2 | sf01Scaffold=green | H-02 L3 | **E** | B:"before upper-storey frames are stood" · E:"2 obligations in one control" |  | Perimeter scaffold with green tag in place before upper-storey frames are stood. Frames stood from the scaffold deck, not from the floor edge. |
| 3 | sf01Scaffold=green | H-03 L3 | **B** | B:"decked to a level that allows work on th" | minor over-tick (finding 13) | Perimeter scaffold with green tag, decked to a level that allows work on the top plate from the scaffold deck rather than off the plate. |
| 4 | sf01Scaffold=green | H-04 L3 | **B** | B:"deck set at the correct height relative " | minor over-tick (finding 13) | Perimeter scaffold with green tag, deck set at the correct height relative to the eave for fascia and batten work. |
| 5 | sf01Scaffold=green | H-05 L3 | **E** | C:"300 mm" · E:"2 obligations in one control" | minor over-tick (finding 13) | Perimeter scaffold with green tag, decked at working height with the deck within 300 mm of the wall face or infill fitted. Scaffold is the working pla |
| 6 | sf01Scaffold=green | T-13 L4 | **E** | B:"before first use" · E:"2 obligations in one control" |  | Handover certificate received and scaffold tag inspected before first use. No access to an untagged, red-tagged or incomplete scaffold. |
| 7 | sf01Scaffold=green | T-13 L4 | **A** | state only |  | Deck complete, guardrails and toeboards in place, gap between deck and structure within tolerance or infilled, safe access provided. |
| 8 | sf02Guardrail=yes | H-01 L4 | **C** | C:"900–1100 mm" · B:"installed before framing at that edge co" |  | Guardrail system to the full open perimeter — top rail 900–1100 mm, mid rail, toeboard — installed before framing at that edge commences. |
| 9 | sf02Guardrail=yes | H-02 L4 | **B** | B:"before frames are handled at that edge" |  | Guardrail to the full open perimeter of the working level before frames are handled at that edge. |
| 10 | sf02Guardrail=yes | H-04 L4 | **B** | B:"installed before battening commences at " |  | Perimeter guardrail / edge protection to the roof perimeter installed before battening commences at that edge — not progressively as the work reaches  |
| 11 | sf03Openings=covers | H-06 L4 | **A** | state only | guardrail branch also MISSING H-01/H-03 void controls (finding 9, Step 5) | Load-rated cover, mechanically fixed (not merely laid over), sized to overlap the opening, marked HOLE — DO NOT REMOVE. |
| 12 | sf03Openings=covers | H-01 L4 | **E** | B:"at the moment the void is created" · E:"2 obligations in one control" |  | All stair voids, lift shafts and penetrations covered with a fixed, load-rated cover, mechanically secured and marked HOLE — DO NOT REMOVE, or guardra |
| 13 | sf03Openings=covers | H-03 L4 | **B** | B:"before truss work starts" |  | All stair voids and openings within the working area covered or guardrailed before truss work starts. |
| 14 | sf03Openings=guardrail | H-06 L4 | **A** | state only | guardrail branch also MISSING H-01/H-03 void controls (finding 9, Step 5) | Guardrail to full perimeter of the opening — top rail, mid rail, toeboard. |
| 15 | sf03Openings=decking | H-06 L4 | **A** | state only | guardrail branch also MISSING H-01/H-03 void controls (finding 9, Step 5) | Opening infilled with temporary structural decking. |
| 16 | sf04Mesh=yes | H-01 L4 | **A** | state only | ⚠ OVER-TICK — mesh doesn't satisfy H-01 catch-platform; split SF-04 (Step 2) | Catch platform / perimeter containment scaffold installed below the working level. |
| 17 | sf04Mesh=yes | H-04 L4 | **A** | state only | H-04 accepts mesh OR catch platform (clean) | Safety mesh or catch platform installed beneath the roof frame to arrest a fall through the batten zone. |
| 18 | sf05Exclusion=yes | H-01 L5 | **D** | D:"only where a fall prevention device cann" · C:"1.5 m" · E:"2 obligations in one control" |  | 1.5 m exclusion from any unprotected edge, physically demarcated with barrier mesh or star-picket-and-tape — not verbal. Applies only where a fall pre |
| 19 | sf05Exclusion=yes | H-02 L5 | **C** | C:"1.5 m" |  | 1.5 m exclusion from unprotected edges, physically demarcated. |
| 20 | sf05Exclusion=yes | H-03 L4 | **C** | C:"1.5 m" | ⚠ MIS-MAP — resolves to the guardrail control (opposite of exclusion); repoint to top-plate setback (Steps 1+5) | Guardrail or edge protection to the external perimeter where work within 1.5 m of the external wall is unavoidable. |
| 21 | sf05Exclusion=yes | H-04 L5 | **C** | C:"1.5 m" |  | Workers do not stand on or work closer than 1.5 m to the external top plate unless perimeter fall prevention is installed. |
| 22 | sf07FallSystem=restraint | H-01 L6 | **D** | D:"installed by a competent person" | ⚠ arrest needs ground-clearance + rescuer via G-3 before it may tick (N-3) | Travel-restraint system: full-body harness with fixed-length lanyard adjusted so the worker physically cannot reach the edge, anchored to a rated anch |
| 23 | sf07FallSystem=restraint | H-02 L6 | **D** | D:"never to an unbraced frame" | ⚠ precondition: anchor never to an unbraced frame (N-2) | Travel restraint as per H-01, anchored to a rated anchor — never to an unbraced frame. |
| 24 | sf07FallSystem=restraint | H-03 L6 | **D** | D:"installed by a competent person — not to" | ⚠ precondition: not to trusses (N-2) | Travel restraint anchored to a rated anchor installed by a competent person — not to trusses. |
| 25 | sf07FallSystem=restraint | H-04 L6 | **D** | D:"permitted only once trusses are fully br" | ⚠ OVER-TICK — ewp branch ticks H-04 L1 elimination + §8 grey-out; REMOVE (finding 2, Step 5) | Travel restraint to a rated anchor — permitted only once trusses are fully braced and the anchor is installed by a competent person. |
| 26 | sf07FallSystem=arrest | H-01 L6 | **D** | D:"permitted only where part 3 records a co" · B:"before impact, an equipped rescue arrang" · E:"2 obligations in one control" | ⚠ arrest needs ground-clearance + rescuer via G-3 before it may tick (N-3) | Fall-arrest system — permitted only where Part 3 records a completed ground-clearance calculation confirming arrest before impact, an equipped rescue  |
| 27 | sf07FallSystem=ewp | H-05 L4 | **E** | E:"2 obligations in one control" | ewp → H-05 EWP control (clean) | EWP with operator holding the appropriate high risk work licence where the licence threshold applies; harness worn inside a boom-type EWP. |
| 28 | sf07FallSystem=ewp | H-04 L1 | **E** | E:"2 obligations in one control" | ⚠ OVER-TICK — ewp branch ticks H-04 L1 elimination + §8 grey-out; REMOVE (finding 2, Step 5) | Fascia and barge fixed from an EWP or from the scaffold deck; no person on the roof frame. |
| 29 | sf10Dust=extraction | T-01 L4 | **A** | state only | ⚠ over-tick — review (finding 11) | On-tool dust extraction with an H-class vacuum, correctly fitted and emptied per manufacturer instructions. |
| 30 | sf10Dust=extraction | T-02 L4 | **A** | state only | ⚠ over-tick — review (finding 11) | On-tool dust extraction fitted to saws, routers and sanders, connected to an appropriate class vacuum. |
| 31 | sf10Dust=wet | T-01 L4 | **A** | state only | ⚠ over-tick — review (finding 11) | Wet suppression / water-fed cutting with slurry managed and not allowed to dry and re-aerosolise. |
| 32 | sf11CutStation=ground | T-01 L3 | **E** | E:"2 obligations in one control" |  | Designated outdoor cutting station, downwind, away from the crew and site boundary; no cutting inside the building envelope. |
| 33 | sf11CutStation=ground | T-02 L3 | **E** | E:"2 obligations in one control" | ⚠ over-tick — review (finding 12) | Cutting station located outdoors and downwind; second-fix machining done in a ventilated area, not an enclosed room. |
| 34 | sf11CutStation=ground | H-05 L2 | **E** | E:"2 obligations in one control" |  | Sheets cut to size at ground level in a designated cutting station; no cutting at height. |
| 35 | sf12Overhead=confirmed | H-07 L4 | **E** | B:"before any lift" · E:"2 obligations in one control" | confirmed → H-07 clearances (clean) | Overhead electrical services identified and no-go clearances confirmed with the network operator before any lift. Where clearances cannot be maintaine |
| 36 | sf12Overhead=confirmed | H-11 L3 | **E** | E:"2 obligations in one control" | ⚠ OVER-TICK — deenergised ticks 2 exclusive L1s; confirmed ticks tiger-tail L3; SPLIT into 3 options (Step 4) | Overhead lines insulated/tiger-tailed by the network operator; no-go clearance distances confirmed with the network operator and physically marked on  |
| 37 | sf12Overhead=deenergised | H-11 L1 | **D** | D:"proved dead by a licensed electrician be" · B:"before work commences" | ⚠ OVER-TICK — deenergised ticks 2 exclusive L1s; confirmed ticks tiger-tail L3; SPLIT into 3 options (Step 4) | Supply de-energised, isolated, locked and tagged, and proved dead by a licensed electrician before work commences. |
| 38 | sf12Overhead=deenergised | H-11 L1 | **A** | state only | ⚠ OVER-TICK — deenergised ticks 2 exclusive L1s; confirmed ticks tiger-tail L3; SPLIT into 3 options (Step 4) | Overhead service relocated or undergrounded by the network operator prior to works. |
| 39 | sf14Access=scaffold | T-10 L4 | **E** | E:"2 obligations in one control" |  | Defined, maintained access and egress route to every work level; scaffold stairs or a secured ladder access, not climbing the frame. |
| 40 | sf14Access=ladder | T-10 L4 | **E** | E:"2 obligations in one control" |  | Defined, maintained access and egress route to every work level; scaffold stairs or a secured ladder access, not climbing the frame. |
| 41 | sf06=set | H-02 L5 | **E** | E:"3 obligations in one control" | ⚠ OVER-TICK — wind control fires on heat-only; gate on stopWind (Step 3) | Stop-work wind limit stated in Part 3; cease standing frames above the stated wind limit (measured or forecast). Frames left standing overnight must b |
| 42 | sf06=set | H-03 L5 | **A** | state only | ⚠ OVER-TICK — wind control; gate on stopWind (Step 3) | Stop-work wind limit stated in Part 3. |
| 43 | sf06=set | H-04 L5 | **E** | E:"2 obligations in one control" | ⚠ OVER-TICK — asserts wind AND rain; require both inputs (Step 3) | Stop-work limits for wind and rain stated in Part 3. No roof frame work on wet or frosted members. |
| 44 | sf06=set | H-05 L5 | **A** | state only | ⚠ OVER-TICK — wind control; gate on stopWind (Step 3) | Stop-work wind limit for sheet handling stated in Part 3. |
| 45 | sf06=set | H-07 L5 | **A** | state only | ⚠ OVER-TICK — crane operator's limit, not site wind; REMOVE from STOPWORK (Step 3) | Stop-work wind limit per the crane operator's stated limit, recorded in Part 3. |

## The rule, encoded (Step 7 CI gate)

A target may be class A only if its control text matches NONE of: sequencing (`before`, `at the moment`, `not progressively`, `in erection order`, …), a dimension (`mm`, `m`, `km/h`, `°C`, `%`, `≥`), a precondition (`only where`, `installed by a competent person`, `proved dead`, `never to`, …), or ≥2 obligations in one line. The build-failing test asserts exactly this.


## Bottom line for the reviewer

**Auto-fill is only safe where a row is class A AND carries no ⚠ audit flag** — the intersection of "asserts a state and nothing more" (pattern) and "the mapping is semantically right" (audit). Everything else is **highlight-only**: the supervisor sees "site facts suggest this — confirm", and class D additionally demands its conditional fields (anchor / rescuer / clearance) before the tick is offered.

That is the honest reduction: ~14 site-fact answers auto-fill a small confirmed set and *suggest* the rest for one-tap confirmation, versus 196 individual ticks.

Two things to confirm before anything ships:
1. **The class of each of the 45 rows** (the A–E column) — I applied the §2 pattern mechanically; you are the authority on any judgement call.
2. **The Steps 1–5 map fixes** the ⚠ rows need — repoint SF-05 to H-03's setback, split SF-12 into three options, gate SF-06 on wind-vs-heat, drop H-07 from stop-work, split SF-04 mesh/catch-platform, add T-11, remove the SF-07 EWP to H-04 tick. I apply all of those mechanically on your confirmation.

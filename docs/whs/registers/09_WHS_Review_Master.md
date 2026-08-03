# WHS Site-Pack — Master Review Doc (one place, work top-to-bottom)

_Generated against the live register. DRAFT — nothing is usable on site until the competent WHS reviewer confirms the items below and marks each module reviewed._

## A. Reviewer checklist — tick to get 4b over the line

- [ ] **1. Stage→module matrix** (§B) — confirm which modules each §1 job stage selects.  *(operational — Sam)*
- [ ] **2. SF→control classes** (§C) — confirm the A–E class of all 45 rows.  *(WHS reviewer)*
- [ ] **3. SF map fixes** (§C ⚠ rows) — approve the repoints / splits / removals.  *(WHS reviewer)*
- [ ] **4. Compound-control splits** (§D) — confirm the 5 controls to split.  *(WHS reviewer)*
- [ ] **5. Standing vs site-variable** (Phase 4c) — not started; classify each control.  *(WHS reviewer)*
- [ ] **6. Mark all 28 modules 'reviewed'** in Settings — the gate on any pack issuing.  *(WHS reviewer)*

---

## B. §1 → §2  Stage → module map (first pass — editable in `10_StageModule_Matrix.csv`)

When a §1 job stage is selected, these modules select in §2. `gate` = only if that yes/no is Yes. Edit the CSV to work the dependencies; I re-sync the code from it.

| Code | Type | first_fix | cladding | second_fix | roofing | demo_propping | ALWAYS | gate |
|---|---|---|---|---|---|---|---|---|
| H-01 | HRCW | ✓ |  |  |  |  |  |  |
| H-02 | HRCW | ✓ |  |  |  |  |  | j2Heights |
| H-03 | HRCW | ✓ |  |  |  |  |  |  |
| H-04 | HRCW | ✓ |  |  |  |  |  |  |
| H-05 | HRCW |  | ✓ |  |  |  |  |  |
| H-06 | HRCW | ✓ |  |  |  |  |  | j3Openings |
| H-07 | HRCW |  |  |  |  |  |  |  |
| H-08 | HRCW |  |  |  |  | ✓ |  | j4Loadbearing |
| H-09 | HRCW |  |  |  |  | ✓ |  | j4Loadbearing |
| H-10 | HRCW |  |  |  |  |  |  | j5Pre2004 |
| H-11 | HRCW |  |  |  |  |  |  |  |
| H-12 | HRCW |  |  |  |  |  |  | j7Road |
| H-13 | HRCW |  |  |  |  |  |  | j8Excavation |
| H-14 | HRCW |  | ✓ |  |  |  |  | j6Silica |
| T-01 | Task |  | ✓ |  |  |  |  | j6Silica |
| T-02 | Task | ✓ |  | ✓ |  |  |  |  |
| T-03 | Task | ✓ |  |  |  |  |  |  |
| T-04 | Task | ✓ | ✓ |  |  |  |  |  |
| T-05 | Task | ✓ | ✓ | ✓ |  |  |  |  |
| T-06 | Task | ✓ | ✓ | ✓ |  |  |  |  |
| T-07 | Task | ✓ | ✓ | ✓ |  |  |  |  |
| T-08 | Task | ✓ | ✓ | ✓ |  |  |  |  |
| T-09 | Task | ✓ | ✓ | ✓ |  |  |  |  |
| T-10 | Task | ✓ | ✓ |  |  |  |  |  |
| T-11 | Task | ✓ | ✓ |  |  |  |  |  |
| T-12 | Task |  | ✓ |  |  |  |  |  |
| T-13 | Task | ✓ |  |  | ✓ |  |  |  |
| T-14 | Task |  |  |  |  |  | ✓ |  |

> Not yet mapped to a stage: H-07, H-11 — these currently only appear via a J yes/no gate or need a home.

---

## C. SF → control resolution + A–E class + audit  (45 targets · 5 truly auto-fillable)

**auto** = class A AND audit-clean (the only rows safe to auto-tick). Everything else is highlight-only. Confirm the class + resolve every ⚠.

| SF = answer | module L | class | auto? | audit | control text (as it will render) |
|---|---|---|---|---|---|
| sf01Scaffold=green | H-01 L3 | **D** | — |  | Perimeter scaffold erected to AS/NZS 1576 by a licensed scaffolder, handover certificate received and scaffold tag green before any person accesses the floor le |
| sf01Scaffold=green | H-02 L3 | **E** | — |  | Perimeter scaffold with green tag in place before upper-storey frames are stood. Frames stood from the scaffold deck, not from the floor edge. |
| sf01Scaffold=green | H-03 L3 | **B** | — | minor over-tick (13) | Perimeter scaffold with green tag, decked to a level that allows work on the top plate from the scaffold deck rather than off the plate. |
| sf01Scaffold=green | H-04 L3 | **B** | — | minor over-tick (13) | Perimeter scaffold with green tag, deck set at the correct height relative to the eave for fascia and batten work. |
| sf01Scaffold=green | H-05 L3 | **E** | — | minor over-tick (13) | Perimeter scaffold with green tag, decked at working height with the deck within 300 mm of the wall face or infill fitted. Scaffold is the working platform — no |
| sf01Scaffold=green | T-13 L4 | **E** | — |  | Handover certificate received and scaffold tag inspected before first use. No access to an untagged, red-tagged or incomplete scaffold. |
| sf01Scaffold=green | T-13 L4 | **A** | ✅ |  | Deck complete, guardrails and toeboards in place, gap between deck and structure within tolerance or infilled, safe access provided. |
| sf02Guardrail=yes | H-01 L4 | **C** | — |  | Guardrail system to the full open perimeter — top rail 900–1100 mm, mid rail, toeboard — installed before framing at that edge commences. |
| sf02Guardrail=yes | H-02 L4 | **B** | — |  | Guardrail to the full open perimeter of the working level before frames are handled at that edge. |
| sf02Guardrail=yes | H-04 L4 | **B** | — |  | Perimeter guardrail / edge protection to the roof perimeter installed before battening commences at that edge — not progressively as the work reaches it. |
| sf03Openings=covers | H-06 L4 | **A** | ✅ |  | Load-rated cover, mechanically fixed (not merely laid over), sized to overlap the opening, marked HOLE — DO NOT REMOVE. |
| sf03Openings=covers | H-01 L4 | **E** | — |  | All stair voids, lift shafts and penetrations covered with a fixed, load-rated cover, mechanically secured and marked HOLE — DO NOT REMOVE, or guardrailed. Inst |
| sf03Openings=covers | H-03 L4 | **B** | — |  | All stair voids and openings within the working area covered or guardrailed before truss work starts. |
| sf03Openings=guardrail | H-06 L4 | **A** | ✅ |  | Guardrail to full perimeter of the opening — top rail, mid rail, toeboard. |
| sf03Openings=decking | H-06 L4 | **A** | ✅ |  | Opening infilled with temporary structural decking. |
| sf04Mesh=yes | H-01 L4 | **A** | — | ⚠ OVER-TICK — mesh ≠ H-01 catch-platform; split SF-04 | Catch platform / perimeter containment scaffold installed below the working level. |
| sf04Mesh=yes | H-04 L4 | **A** | ✅ |  | Safety mesh or catch platform installed beneath the roof frame to arrest a fall through the batten zone. |
| sf05Exclusion=yes | H-01 L5 | **D** | — |  | 1.5 m exclusion from any unprotected edge, physically demarcated with barrier mesh or star-picket-and-tape — not verbal. Applies only where a fall prevention de |
| sf05Exclusion=yes | H-02 L5 | **C** | — |  | 1.5 m exclusion from unprotected edges, physically demarcated. |
| sf05Exclusion=yes | H-03 L4 | **C** | — | ⚠ MIS-MAP → guardrail control (opposite of exclusion); repoint to setback split | Guardrail or edge protection to the external perimeter where work within 1.5 m of the external wall is unavoidable. |
| sf05Exclusion=yes | H-04 L5 | **C** | — |  | Workers do not stand on or work closer than 1.5 m to the external top plate unless perimeter fall prevention is installed. |
| sf07FallSystem=restraint | H-01 L6 | **D** | — | ⚠ arrest needs ground-clearance + rescuer via G-3 before tick (N-3) | Travel-restraint system: full-body harness with fixed-length lanyard adjusted so the worker physically cannot reach the edge, anchored to a rated anchor install |
| sf07FallSystem=restraint | H-02 L6 | **D** | — | ⚠ precondition: anchor never to unbraced frame (N-2) | Travel restraint as per H-01, anchored to a rated anchor — never to an unbraced frame. |
| sf07FallSystem=restraint | H-03 L6 | **D** | — | ⚠ precondition: not to trusses (N-2) | Travel restraint anchored to a rated anchor installed by a competent person — not to trusses. |
| sf07FallSystem=restraint | H-04 L6 | **D** | — | ⚠ OVER-TICK — ewp ticks H-04 L1 elimination + §8 grey-out; REMOVE | Travel restraint to a rated anchor — permitted only once trusses are fully braced and the anchor is installed by a competent person. |
| sf07FallSystem=arrest | H-01 L6 | **D** | — | ⚠ arrest needs ground-clearance + rescuer via G-3 before tick (N-3) | Fall-arrest system — permitted only where Part 3 records a completed ground-clearance calculation confirming arrest before impact, an equipped rescue arrangemen |
| sf07FallSystem=ewp | H-05 L4 | **E** | — |  | EWP with operator holding the appropriate high risk work licence where the licence threshold applies; harness worn inside a boom-type EWP. |
| sf07FallSystem=ewp | H-04 L1 | **E** | — | ⚠ OVER-TICK — ewp ticks H-04 L1 elimination + §8 grey-out; REMOVE | Fascia and barge fixed from an EWP or from the scaffold deck; no person on the roof frame. |
| sf10Dust=extraction | T-01 L4 | **A** | — | ⚠ review (finding 11) | On-tool dust extraction with an H-class vacuum, correctly fitted and emptied per manufacturer instructions. |
| sf10Dust=extraction | T-02 L4 | **A** | — | ⚠ review (finding 11) | On-tool dust extraction fitted to saws, routers and sanders, connected to an appropriate class vacuum. |
| sf10Dust=wet | T-01 L4 | **A** | — | ⚠ review (finding 11) | Wet suppression / water-fed cutting with slurry managed and not allowed to dry and re-aerosolise. |
| sf11CutStation=ground | T-01 L3 | **E** | — |  | Designated outdoor cutting station, downwind, away from the crew and site boundary; no cutting inside the building envelope. |
| sf11CutStation=ground | T-02 L3 | **E** | — | ⚠ review (finding 12) | Cutting station located outdoors and downwind; second-fix machining done in a ventilated area, not an enclosed room. |
| sf11CutStation=ground | H-05 L2 | **E** | — |  | Sheets cut to size at ground level in a designated cutting station; no cutting at height. |
| sf12Overhead=confirmed | H-07 L4 | **E** | — |  | Overhead electrical services identified and no-go clearances confirmed with the network operator before any lift. Where clearances cannot be maintained, the lif |
| sf12Overhead=confirmed | H-11 L3 | **E** | — | ⚠ OVER-TICK — deenergised ticks 2 exclusive L1s / confirmed ticks tiger-tail; SPLIT into 3 | Overhead lines insulated/tiger-tailed by the network operator; no-go clearance distances confirmed with the network operator and physically marked on site. |
| sf12Overhead=deenergised | H-11 L1 | **D** | — | ⚠ OVER-TICK — deenergised ticks 2 exclusive L1s / confirmed ticks tiger-tail; SPLIT into 3 | Supply de-energised, isolated, locked and tagged, and proved dead by a licensed electrician before work commences. |
| sf12Overhead=deenergised | H-11 L1 | **A** | — | ⚠ OVER-TICK — deenergised ticks 2 exclusive L1s / confirmed ticks tiger-tail; SPLIT into 3 | Overhead service relocated or undergrounded by the network operator prior to works. |
| sf14Access=scaffold | T-10 L4 | **E** | — |  | Defined, maintained access and egress route to every work level; scaffold stairs or a secured ladder access, not climbing the frame. |
| sf14Access=ladder | T-10 L4 | **E** | — |  | Defined, maintained access and egress route to every work level; scaffold stairs or a secured ladder access, not climbing the frame. |
| sf06=set | H-02 L5 | **E** | — | ⚠ OVER-TICK — wind fires on heat-only; gate on stopWind | Stop-work wind limit stated in Part 3; cease standing frames above the stated wind limit (measured or forecast). Frames left standing overnight must be fully br |
| sf06=set | H-03 L5 | **A** | — | ⚠ OVER-TICK — wind; gate on stopWind | Stop-work wind limit stated in Part 3. |
| sf06=set | H-04 L5 | **E** | — | ⚠ OVER-TICK — asserts wind AND rain; require both | Stop-work limits for wind and rain stated in Part 3. No roof frame work on wet or frosted members. |
| sf06=set | H-05 L5 | **A** | — | ⚠ OVER-TICK — wind; gate on stopWind | Stop-work wind limit for sheet handling stated in Part 3. |
| sf06=set | H-07 L5 | **A** | — | ⚠ OVER-TICK — crane operator's limit; REMOVE from stop-work | Stop-work wind limit per the crane operator's stated limit, recorded in Part 3. |

SF question wording: **sf01Scaffold** Perimeter scaffold on site? · **sf02Guardrail** Perimeter guardrail / edge protection installed? · **sf03Openings** How are openings and voids protected? · **sf04Mesh** Safety mesh or catch platform below the working level? · **sf05Exclusion** 1.5 m edge exclusion demarcated? · **sf07FallSystem** Fall system beyond scaffold / guardrail? · **sf10Dust** Dust control available for cutting? · **sf11CutStation** Cutting station? · **sf12Overhead** Overhead electrical services on the frontage? · **sf14Access** Site access and egress to each work level?

---

## D. Compound-control splits (Step 1 — preserve every obligation, only separate)

| Module | Split the one control into |
|---|---|
| H-03 L4 | (a) top-plate prohibition · (b) erection from internal plates/planks · (c) 1.5 m setback |
| H-07 L4 | (a) identification + clearance confirmation · (b) the stop-lift rule |
| H-11 L3 | (a) insulation/tiger-tailing · (b) clearance confirmed + marked |
| T-02 L3 | (a) outdoor cutting station · (b) second-fix ventilation |
| H-01 L4 | (a) cover-or-guardrail + marking · (b) install-at-creation timing |

Once split, SF-05→H-03 repoints at split (c); the SF-03 guardrail branch gains H-01/H-03 void controls; SF-12 `confirmed` points at the clearance half only.

---

## E. Register defects

**Fixed + shipped** (527e4ca): R-1 sort by level · R-2 H-10 non-PPE row→note · R-3 H-14 bar→'see T-01' · R-4 '[Site Supervisor]' placeholder · R-6 notes no longer render · R-7/R-8/N-6 data. **Shipped bugs** (7b2de15): hierarchy bar was inverted (now best-control) · PDF glyph corruption (≥ ■ ✓).

**Remaining:** R-5 cross-module dependency check (H-09 references H-10/H-08 — warn at compose if the referenced module is absent).

---

## F. Module review status (the gate on everything)

All 28 carpentry modules are currently **review_status = draft**. No pack can issue until the competent WHS reviewer marks each **reviewed** in Settings → WHS/SWMS Library. That is checklist item 6 and it blocks every pack.


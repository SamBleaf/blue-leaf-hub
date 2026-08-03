# WHS Site-Pack — Master Review Doc (one place, work top-to-bottom)

_Generated against the live register. DRAFT — nothing is usable on site until the competent WHS reviewer confirms the items below and marks each module reviewed._

## A. Reviewer checklist — tick to get 4b over the line

- [ ] **1. Stage→module matrix** (§B) — confirm which modules each §1 job stage selects.  *(mostly operational — Sam; BUT the two un-orphaned HRCW modules H-07/H-11, the new j_plant/j_services gates, and the >2 m gating on H-01/H-02/H-05 are safety items — WHS reviewer)*
- [ ] **2. SF→control classes** (§C) — confirm the A–E class of all 45 rows.  *(WHS reviewer)*
- [ ] **3. SF map fixes** (§C ⚠ rows) — approve the repoints / splits / removals.  *(WHS reviewer)*
- [ ] **4. Compound-control splits** (§D) — confirm the 5 controls to split.  *(WHS reviewer)*
- [ ] **5. Standing vs site-variable** (Phase 4c) — not started; classify each control.  *(WHS reviewer)*
- [ ] **6. Mark all 28 modules 'reviewed'** in Settings — the gate on any pack issuing.  *(WHS reviewer)*

---

## B. §1 → §2  Stage → module map (CORRECTED — editable in `10_StageModule_Matrix.csv`)

When a §1 job stage is selected, these modules select in §2. `gate` = only if that yes/no is Yes. Edit the CSV to work the dependencies; the code re-syncs from it.

**⚠ The first-pass matrix had two orphaned HRCW modules and mis-filed the roofing work. Corrected below; every change carries a note in the CSV's `reviewer_notes` column and is listed in §B.1.**

| Code | Type | first_fix | cladding | second_fix | roofing | demo_propping | ALWAYS | gate |
|---|---|---|---|---|---|---|---|---|
| H-01 | HRCW | ✓ |  |  |  |  |  | j2Heights |
| H-02 | HRCW | ✓ |  |  |  |  |  | j2Heights |
| H-03 | HRCW |  |  |  | ✓ |  |  | j2Heights |
| H-04 | HRCW |  |  |  | ✓ |  |  | j2Heights |
| H-05 | HRCW |  | ✓ |  |  |  |  | j2Heights |
| H-06 | HRCW | ✓ |  |  | ✓ |  |  | j3Openings |
| H-07 | HRCW |  |  |  |  |  |  | j_plant *(gate-only)* |
| H-08 | HRCW |  |  |  |  | ✓ |  | j4Loadbearing |
| H-09 | HRCW |  |  |  |  | ✓ |  | j4Loadbearing |
| H-10 | HRCW |  |  |  |  |  |  | j5Pre2004 |
| H-11 | HRCW |  |  |  |  |  |  | j_services *(gate-only)* |
| H-12 | HRCW |  |  |  |  |  |  | j7Road |
| H-13 | HRCW |  |  |  |  |  |  | j8Excavation |
| H-14 | HRCW |  | ✓ |  | ✓ | ✓ |  | j6Silica |
| T-01 | Task |  | ✓ | ✓ | ✓ | ✓ |  | j6Silica |
| T-02 | Task | ✓ |  | ✓ |  |  |  |  |
| T-03 | Task | ✓ |  |  | ✓ |  |  |  |
| T-04 | Task | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |
| T-05 | Task | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |
| T-06 | Task | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |
| T-07 | Task | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |
| T-08 | Task | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |
| T-09 | Task | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |
| T-10 | Task |  |  |  |  |  | ✓ |  |
| T-11 | Task | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |
| T-12 | Task | ✓ |  | ✓ |  | ✓ |  |  |
| T-13 | Task |  | ✓ |  | ✓ |  |  | sf01Scaffold |
| T-14 | Task |  |  |  |  |  | ✓ |  |

### B.1 What changed and why

| Code | Change | Why |
|---|---|---|
| **H-03** | first_fix → **roofing** | Truss erection *is* the roofing stage. Mis-filed under first fix — the pack would have shown truss fall controls on a framing-only job and hidden them on a roofing job. |
| **H-04** | first_fix → **roofing** | Battens, fascia and barge are roofing work, not first fix. Same mis-file. |
| **H-07** | **was orphaned** → gate `j_plant` (gate-only) | No stage tick and no gate meant it never selected. It's the crane-and-telehandler module — HRCW on *any* powered mobile plant, including plant brought by others. Encoded as gate-only so it fires whenever plant is on site, on any stage. |
| **H-11** | **was orphaned** → gate `j_services` (gate-only) | Same — never selected. J-question for overhead lines / live wiring / buried services, and auto-set when `sf12Overhead` ≠ none. |
| **H-01, H-02, H-05** | added `j2Heights` gate | Fall-from-height modules are only HRCW when the fall is >2 m. Slab-on-ground first fix and single-storey ground-level cladding aren't. Prevents over-scoping a single-storey job. |
| **H-06** | added **roofing** | Voids and penetrations are a live fall-through risk during roofing, not only first fix. |
| **H-14 / T-01** | added roofing + demo (T-01 also second_fix) | Silica cutting happens wherever fibre-cement, AAC, masonry or tile is cut — not only during cladding. |
| **T-04, T-05, T-06, T-07, T-08, T-09** | added roofing + demo | Powered cutting, site power, manual handling, noise, ladders and deliveries occur on every stage. The empty roofing column would have stripped all of these from any roofing job. |
| **T-03** | added roofing | Nail guns fix battens and fascia. |
| **T-10** | stage ticks → **ALWAYS** | Its own trigger is "every day, every job". |
| **T-11** | added second_fix, roofing, demo | Roofing is the most sun- and heat-exposed stage; it wasn't ticked for it. |
| **T-12** | added first_fix, second_fix, demo | Treated-timber framing, construction adhesive, sealants and demo dust — not cladding-only. |
| **T-13** | fixed stages → gate `sf01Scaffold` | Scaffold interface applies whenever scaffold is on site and drops out when it isn't — a site fact, not a stage. |

> **New J-questions added (§1):** `j_plant` (any powered mobile plant on site, incl. brought by others?) and `j_services` (overhead lines, live wiring or buried services in the work path?). Both are reg 291 HRCW categories that no current question reached. **These are now live in the code** — G-6 completeness now requires all 10 §1 answers.
>
> **Reviewer note:** the roofing column being near-empty in the first pass was the single biggest gap — a roofing job would have generated a pack missing truss falls, batten falls, silica, saws, ladders and manual handling. This is Sam's operational sign-off (which module on which stage), but the two orphaned HRCW modules and the >2 m gating are safety items for the WHS reviewer.

---

## C. SF → control resolution + A–E class + audit  (45 targets · 5 auto-fillable as-is, more after the ⚠ fixes land)

**auto** = class A AND audit-clean (the only rows safe to auto-tick *today*). Everything else is highlight-only. Confirm the class + resolve every ⚠.

**⚠ Read the class AND the audit column — never the class alone.** A row is only safe to auto-fill when it is class **A** *and* carries **no ⚠**. Several rows were originally marked A while carrying a ⚠ or a deployment/precondition clause; those have been corrected in this pass (see §G change-log). On the corrected test, exactly **five** rows qualify now:

1. sf03Openings=covers → H-06 L4 (load-rated cover)
2. sf03Openings=guardrail → H-06 L4 (guardrail to opening)
3. sf03Openings=decking → H-06 L4 (temporary decking)
4. sf04Mesh=yes → H-04 L4 (safety mesh / catch platform — the H-04 target only; the H-01 target is a flagged over-tick)
5. sf01Scaffold=green → T-13 L4 (deck complete, guardrails and toeboards)

Every "A + ⚠" and every B/C/D/E row becomes auto-fillable only after its fix lands and the reviewer confirms the class.

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
| sf10Dust=extraction | T-01 L4 | **E** | — | ⚠ CLASS CORRECTED A→E ("correctly fitted and emptied per manufacturer instructions" is a deployment/maintenance assertion, not a state) + finding 11: SF-10 asks "available" not "in use" — reword the question | On-tool dust extraction with an H-class vacuum, correctly fitted and emptied per manufacturer instructions. |
| sf10Dust=extraction | T-02 L4 | **E** | — | ⚠ CLASS CORRECTED A→E ("fitted to saws, routers and sanders, connected to an appropriate class vacuum" = deployment) + finding 11 | On-tool dust extraction fitted to saws, routers and sanders, connected to an appropriate class vacuum. |
| sf10Dust=wet | T-01 L4 | **E** | — | ⚠ CLASS CORRECTED A→E ("with slurry managed and not allowed to dry and re-aerosolise" = ongoing management, not a state) + finding 11 | Wet suppression / water-fed cutting with slurry managed and not allowed to dry and re-aerosolise. |
| sf11CutStation=ground | T-01 L3 | **E** | — |  | Designated outdoor cutting station, downwind, away from the crew and site boundary; no cutting inside the building envelope. |
| sf11CutStation=ground | T-02 L3 | **E** | — | ⚠ review (finding 12) | Cutting station located outdoors and downwind; second-fix machining done in a ventilated area, not an enclosed room. |
| sf11CutStation=ground | H-05 L2 | **E** | — |  | Sheets cut to size at ground level in a designated cutting station; no cutting at height. |
| sf12Overhead=confirmed | H-07 L4 | **E** | — |  | Overhead electrical services identified and no-go clearances confirmed with the network operator before any lift. Where clearances cannot be maintained, the lif |
| sf12Overhead=confirmed | H-11 L3 | **E** | — | ⚠ OVER-TICK — deenergised ticks 2 exclusive L1s / confirmed ticks tiger-tail; SPLIT into 3 | Overhead lines insulated/tiger-tailed by the network operator; no-go clearance distances confirmed with the network operator and physically marked on site. |
| sf12Overhead=deenergised | H-11 L1 | **D** | — | ⚠ OVER-TICK — deenergised ticks 2 exclusive L1s / confirmed ticks tiger-tail; SPLIT into 3 | Supply de-energised, isolated, locked and tagged, and proved dead by a licensed electrician before work commences. |
| sf12Overhead=deenergised | H-11 L1 | **D** | — | ⚠ CLASS CORRECTED A→D (asserts the network operator did the relocation) + OVER-TICK: deenergised ticks 2 exclusive L1s; SPLIT into 3 | Overhead service relocated or undergrounded by the network operator prior to works. |
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

**⚠ Verify R-4 fully closed.** R-4 is logged as "'[Site Supervisor]' placeholder" fixed — that's the HRCW-module placeholder. But the register also has **every T-module carrying empty `responsibleInstall`/`responsibleUse`** (a separate defect: blank, not placeholder). Confirm Part 2 now renders a named or "see site supervisor" value rather than blank; if it's still empty, R-4 is only half done.

---

## F. Module review status (the gate on everything)

All 28 carpentry modules are currently **review_status = draft**. No pack can issue until the competent WHS reviewer marks each **reviewed** in Settings → WHS/SWMS Library. That is checklist item 6 and it blocks every pack.


---

## G. Change-log for this review pass (2 Aug 2026)

Every edit made to this doc and to `10_StageModule_Matrix.csv`, so the diff is auditable.

### Stage → module matrix (§B and the CSV)
1. **H-03, H-04 moved first_fix → roofing.** They are roofing-stage work (truss erection; battens/fascia/barge), mis-filed under first fix. Highest-impact correction: a roofing job would otherwise have generated a pack with no truss- or batten-fall controls.
2. **H-07 un-orphaned.** Had no stage and no gate → never selected. Now gate `j_plant`.
3. **H-11 un-orphaned.** Same → never selected. Now gate `j_services`, auto-set when `sf12Overhead` ≠ none.
4. **H-01, H-02, H-05 gained a `j2Heights` gate.** Fall modules are HRCW only above 2 m; prevents over-scoping single-storey/slab jobs.
5. **H-06 gained roofing.** Fall-through risk is live during roofing.
6. **H-14, T-01 gained roofing + demo (T-01 also second_fix).** Silica cutting isn't cladding-only.
7. **T-03/04/05/06/07/08/09/11 gained roofing (+ demo where relevant).** The empty roofing column would have stripped saws, power, manual handling, noise, ladders, deliveries and heat from every roofing job.
8. **T-10 → ALWAYS.** Its trigger is "every day, every job".
9. **T-12 gained first_fix, second_fix, demo.** Treated timber, adhesives, sealants, demo dust — not cladding-only.
10. **T-13 → gate `sf01Scaffold`.** Scaffold interface is a site fact, not a fixed stage.
11. **Two new J-questions required:** `j_plant`, `j_services`. Both are reg 291 categories no current question reaches.

### SF → control table (§C)
12. **Header count corrected** — re-derived to exactly **five** clean class-A rows and named them. Added the "read class AND audit" warning.
13. **sf12Overhead=deenergised → H-11 (relocated/undergrounded): class A → D.** Asserts the network operator performed the relocation — a precondition, not a state.
14. **sf10Dust extraction/wet → T-01/T-02 (×3): class A → E.** "correctly fitted and emptied", "connected to…", "slurry managed" are deployment/maintenance assertions, not states. These were the most dangerous miscodes — class A would have auto-asserted silica dust controls were deployed on the highest-consequence task module.

### Checklist (§A)
15. **Item 1 re-attributed.** Was "operational — Sam" only; the un-orphaned HRCW modules, the new gates and the >2 m gating are safety items and now flagged for the WHS reviewer too.

### Register defects (§E)
16. **R-4 flagged as possibly half-closed** — empty T-module responsible fields are a separate defect from the fixed placeholder.

### Not changed (confirmed correct as-is)
- H-08, H-09, H-10, H-12, H-13 stage/gate mapping.
- The A–E class rule itself, and the compound-split list in §D.
- All ⚠ audit findings from the prior pass — carried through unchanged; this pass added class corrections on top, it didn't remove any finding.

### Still for the reviewer (not something this pass could decide)
- The A–E class of all 45 rows (§A item 2) — I corrected four demonstrable miscodes; the full set still needs sign-off.
- Whether a green-tagged perimeter scaffold is sufficient evidence of per-trade deck height (audit finding 13) — left as reviewer judgement.
- Marking all 28 modules `reviewed` (§F) — the gate on everything.

---

## H. Encoding + reconciliation (3 Aug 2026 — how the review became code)

Sam's 2-review matrix is now **encoded** in `server/lib/whs/carpentryScope.mjs` + `src/lib/carpentryScope.js` (parity-tested, 47 assertions green). The code is now the source of truth; `10_StageModule_Matrix.csv` was regenerated from it, so CSV, this doc's §B and the code all agree.

**The two source files disagreed on 6 rows** (hand-edit drift between the uploaded CSV and the pasted §B table). I adopted the pasted §B (the more-worked, annotated version) in every case. Confirm these on the next pass:

| Code | uploaded CSV said | §B (adopted) | note |
|---|---|---|---|
| **H-07** | ALWAYS + j_plant | gate-only j_plant | Encoded gate-only (like H-10/H-12/H-13): fires whenever `j_plant`=yes, on any stage — matches your "any stage" note, stricter than tying it to roofing+demo. |
| **H-14** | cladding, demo | cladding, roofing, demo | §B added roofing. |
| **T-01** | first_fix, cladding, second_fix, demo | cladding, second_fix, roofing, demo | §B dropped first_fix, added roofing. |
| **T-11** | first_fix, cladding, roofing, demo | all 5 stages | §B added second_fix. |
| **T-12** | cladding, second_fix, demo | first_fix, second_fix, demo | §B dropped cladding, added first_fix. **⚠ Your §G note #9 says "gained first_fix, second_fix, demo" but the table dropped cladding — confirm whether T-12 should also keep cladding (adhesives/sealants at cladding stage).** |
| **T-13** | first_fix, cladding, roofing | cladding, roofing | §B dropped first_fix. |

**Other encoding decisions:**
- **`roofing` stage relabelled "Roof framing"** in the UI (your CSV column rename). The stage *key* stays `roofing` so no data breaks.
- **`j_plant` / `j_services` are now live §1 questions.** G-6 completeness now requires **10** answers, not 8. They also make H-07/H-11 selectable in the builder (added to `J_MAP_CODES`).
- **Site-fact gates** (`sf01Scaffold` on T-13, `sf12Overhead`→H-11 auto) are wired into `deriveModulesFromScope(jScope, siteFacts)` but only resolve once the §2 site-facts layer ships (currently held). Until then a scaffold/overhead answer can't fire — noted so it isn't mistaken for a bug.
- **Not yet wired into the builder UI.** `deriveModulesFromScope` is inert data + logic used by the docs/tests. The live §1→§2 wiring into `WhsPackTab` lands once you're happy with the matrix — so your next dependency pass doesn't fight a half-built UI.

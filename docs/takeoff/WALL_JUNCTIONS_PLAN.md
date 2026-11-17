# Wall junctions in the Hub takeoff (18 November 2026)

## 0. Owner rules (Sam, 18 November 2026): authoritative, they replace anything below that disagrees

**A. T-junction (a wall's end lands on another wall's run).** The continuous wall gets 2 junction studs with a 90 mm space between them (the butting wall's thickness). As built: the studs sit against the butting wall's faces. Plus **junction blocks**: 300 mm long 90 x 45 blocks laminated in pairs, at 900 centres up the wall, fixed in the 90 mm space between the junction studs.
- Count per junction = 2 x ceil(continuous wall height / 900): **6 for 2.4 to 2.7 m, 8 for 3.0 m** (3.3 and 3.6 m also 8).
- Pair heights: the wall height is split into equal bands of at most 900 and a pair sits in the middle of each (2,700: 450, 1,350, 2,250). Shown on the elevation between the junction studs at those heights.
- Ordering: each junction buys its blocks as ONE length, count x 300 mm (6 x 300 = 1,800 mm; 8 x 300 = 2,400 mm), rolled into a stock length on the product's grid (MGP10: 1,200 minimum, 300 mm steps to 3,000, 600 mm above), and printed under **JUNCT. BLK** as a cut like "1/1.8" with the junction studs. The crew cuts the blocks from it. Product: the Walls item's **Plates** part (90 x 45 MGP10 by default); it is the product Sam's 90 x 45 blocks are cut from, and the cut list names it "Junction blocks @ 3,000 (butts Wall 2): 6 x 300 mm".
- A junction with no counted stud (removed by hand, or both studs inside an opening) has no blocks. A junction on a wall traced in two legs is one junction: its blocks are counted once.
- Junction studs stay under JUNCT. BLK as built.

**B. Corner (L): a wall end meets another wall's end at an angle of 20 degrees or more (the existing test).** Direction-based. Walls are traced as continuous lines clicked through, so at the point where a wall ENDS it has just its normal single end stud. Where a wall STARTS (its first traced point) at a corner it gets 2 studs: its normal start stud plus a second stud for the internal-corner plasterboard fixing, near face one wall thickness (90 for a 90 wall) from the wall start, just past the butting wall: centre 112.5 mm on 90 x 45. Total 3 studs a corner.
- Both walls START at the corner, or both END there (drawn separately): the **longer** wall gets the 2 studs (equal lengths: the lower wall id). When the wall that gets it ENDS at the corner, the second stud mirrors to its far end (centre L minus 112.5).
- Per-corner **Swap** on the wall page hands the second stud to the other wall. Stored as `rules.cornersSwapped`, a list of corner keys (`corner:` + the sorted wall-end ids), like `junctionsOff`; a key naming a wall that is gone matches nothing and is dropped the next time a switch is saved.
- The second stud is a full stud at that wall's height: it prints under **STUDS**, is counted in the Walls line, and (as built) is a normal stud for plate joins and noggin bays (a short noggin between it and the end stud is cut from offcuts). It is merged into any stud within one stud width and not counted inside an opening.
- Elevation: same teal as junction studs, legend **Corner stud**.
- Collinear joins (angle under 20 degrees) are NOT corners: no extra stud, not reported. Three or more wall ends at one point: no corner stud and a note ("wall_corner_unclear").

**C. Review findings fixed.**
1. A wall traced in two collinear legs with a wall meeting the join is ONE continuous wall: the junction station is not clamped to a leg (so the studs of the two legs line up either side of the butting wall), and the two leg-end studs at the join are dropped. Correct total = 2 junction studs. One switch (the junction key, shared by both legs) turns it off, and the leg-end studs come back.
2. Junctions are grouped by document + page, each wall converted to real mm with its OWN calibration. If the calibrations on a page disagree (scale differs by more than 1 percent, or the rotation differs) the page is skipped and a note says so (`junction_calibration_conflict`), never silently.
3. A blocked wall still gives its neighbours their junction and corner studs (worked out from where it is drawn). The continuous wall carries a note naming each butting wall that isn't counted (`junction_wall_not_counted`).
4. The misleading "corner on this wall: each wall keeps its own end stud" note is gone. A collinear join is no longer reported as a corner. Each corner has its own line on the wall page.
5. The removal key is per junction: butting wall + end + continuous wall (`b:0@a`; two-leg wall `b:0@a1+a2`). One butting end between two walls no longer turns off both. A key for a deleted wall is dropped when a switch is saved and matches nothing in the meantime.

Calculation version `takeoff-calc@8`: a saved order from before offers the one-tap update.

---

Sam: where one wall butts into a continuous wall, two extra studs trim both sides of the butting wall. Work out automatically, positioned from where walls start and finish on the takeoff.

## 1. Investigation: did the takeoff know where lines meet?

Before: no. A wall is a straight measurement of two points in PDF space (`points: [a, b]` on a page, with a calibration; typed walls have no points). Walls were framed one at a time. The only relationship code was `sharedCorners` in `measure/geometry.js`, used when you drag a corner on the plan so linked walls move together (exact point match). The engine never compared walls. `dispatch.js` said "nothing at T-junctions" and `timber.js` said T-junctions were "explicit additions only". Endpoints snap to a 10 mm grid, not to other walls (openings snap to walls, wall ends do not).

Now: yes. `shared/takeoff/engine/junctions.js` compares the walls of a Walls item that share a page and a calibration, in real mm. Nothing is stored; junctions are recalculated, so moving a wall moves them.

## 2. Rules

- T: wall B's end lies within the tolerance of wall A's centreline and more than the tolerance from A's ends; angle at least 20 degrees. A gets junction studs.
- Studs sit with their faces on B's two faces: centre = station +/- (half span + stud width / 2), half span = (thickness / 2) / sin(angle). Square wall, 90 x 45: station +/- 67.5.
- Merge: a junction stud within one stud width (45) of a counted stud is not added (the existing stud serves). Inside an opening, or past the wall's ends: not counted. Each is said on the wall page.
- Height and cut: the continuous wall's own Wall height, never the butting wall's.
- Collinear legs: a continuous wall traced as two legs meeting at B's end is treated as one wall; each leg gets the stud that lies on it.
- L corners (ends on ends): see section 0B (direction-based second stud). This replaces the first build's "no extra studs".
- X crossings: flagged in a non-blocking note, not counted.
- Counting: junction studs are their own ticks (state "junction") and demands (role "junction stud", same stud product); they print under JUNCT. BLK. They are not in the stud count, the plate joins or the noggin bays.
- Removal: `rules.junctionsOff` (list of junction keys, one per junction: butting wall + end + continuous wall); `rules.junctionStuds: false` turns the lot off; `rules.junctionToleranceMm` overrides the tolerance. See section 0.
- UI: wall page lists each junction with Remove / Count; elevation draws junction studs teal; Walls line says "+ 2 junction studs".

## 3. Defaults Sam must confirm

1. Tolerance = one wall thickness (90 for a 90 x 45 stud), not half (45): an end traced to the face of the plan wall still meets. Say if you want 45.
2. Studs with faces on the butting wall's faces (so 67.5 either side of its centreline on a square 90 wall), 2 per junction.
3. Merge threshold = one stud width.
4. SUPERSEDED by section 0B (3-stud corner, direction-based).
5. Junction studs are not given noggins and do not affect plate joins.
6. SUPERSEDED by section 0C1 (the two leg-end studs at the join are dropped).
7. Only walls in the same Walls item are compared (a T across two different Walls items is not found).
8. Walls on a different scale region of the same page are not compared.
9. A butting wall whose end sits within one thickness of the end of the continuous wall is a corner, not a T.

## 4. Tests

`scripts/tests/takeoff-tc-junctions.test.mjs` (41): the first 21 (tolerance, angled walls, either direction, collinear legs, X, L, two-ended wall, different heights, merge, opening, move, removal and switch, supplier heading, Walls line) plus blocks at 2.4/2.7/3.0 m, blocks in the supplier order and cut lengths, corner direction (end 1, start 2 at 112.5), both-start and both-end (longer wall), swap, collinear join not a corner, the 20 degree test, split-leg T (exactly 2 junction studs), cross-calibration on one page (same scale compared, conflicting scale skipped with a note), blocked butting wall note, per-junction removal and stale keys, and the version stamp.

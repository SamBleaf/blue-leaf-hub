# Wall junctions in the Hub takeoff (18 November 2026)

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
- L corners (ends on ends): reported, no extra studs (existing behaviour: each wall keeps its own end stud). Common practice is a 3-stud corner or 2 + blocking; proposed, not built.
- X crossings: flagged in a non-blocking note, not counted.
- Counting: junction studs are their own ticks (state "junction") and demands (role "junction stud", same stud product); they print under JUNCT. BLK. They are not in the stud count, the plate joins or the noggin bays.
- Removal: `rules.junctionsOff` (list of butting-wall-end ids, one toggle per junction); `rules.junctionStuds: false` turns the lot off; `rules.junctionToleranceMm` overrides the tolerance.
- UI: wall page lists each junction with Remove / Count; elevation draws junction studs teal; Walls line says "+ 2 junction studs".

## 3. Defaults Sam must confirm

1. Tolerance = one wall thickness (90 for a 90 x 45 stud), not half (45): an end traced to the face of the plan wall still meets. Say if you want 45.
2. Studs with faces on the butting wall's faces (so 67.5 either side of its centreline on a square 90 wall), 2 per junction.
3. Merge threshold = one stud width.
4. Corners unchanged (no extra corner studs). Say if you want a 3-stud corner.
5. Junction studs are not given noggins and do not affect plate joins.
6. When a continuous wall is traced in two legs and a wall meets their join, the two existing end studs at the join are kept as well as the junction studs.
7. Only walls in the same Walls item are compared (a T across two different Walls items is not found).
8. Walls on a different scale region of the same page are not compared.
9. A butting wall whose end sits within one thickness of the end of the continuous wall is a corner, not a T.

## 4. Tests

`scripts/tests/takeoff-tc-junctions.test.mjs` (21): tolerance, angled walls, either direction, collinear legs, X, L, two-ended wall, different heights, merge, opening, move, removal and switch, supplier heading, Walls line.

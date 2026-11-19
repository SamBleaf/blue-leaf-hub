# HUB: Floor Framing module (implementation plan, no code)

**Status:** Sam answered 18 Nov 2026 (section 0 below, authoritative). **Phase 1 BUILT** on branch `takeoff/floor-framing` (merged with main `88b7233`), local, not pushed; calculation version `takeoff-calc@10`. **Phase 2 BUILT** on branch `takeoff/floor-p2` (from main `3dab04e`), local, not pushed; calculation version `takeoff-calc@12`. **Phase 3 BUILT** on branch `takeoff/floor-p3` (off main `e8df088`), local, not pushed; calculation version `takeoff-calc@13`. **Phase 4 BUILT** on branch `takeoff/floor-p4` (off main `77b52f3`), local, not pushed; no calculation change (`takeoff-calc@13`), PDF renderer `takeoff-pdf@6`. Phases 5 and 6 not started.
**Owner rule:** simple onsite. Fewest taps, advanced detail hidden, sensible defaults, derive don't ask, accurate counts, one phase at a time.
**Builds on:** the Hub takeoff Walls function (not the Bestimator repo; its rules are reused as knowledge, not code).

---

## 0. Owner answers, 18 Nov 2026 (authoritative: they override the recommendations below where different)

| # | Question | Sam's answer | Effect |
|---|---|---|---|
| 1 | Strongback spacing (Q1) | Accept the supplier rule as the default, per-job override | Built (P1): none up to 3.5 m, one row at midspan over 3.5 to 6.5 m, three rows over 6.5 m; per-job rows 0 to 3 |
| 2 | Ring beam size (Q2) | **No default size.** Engineer-determined: Sam specs it per beam during the takeoff. Later (not now): read the engineering | **Supersedes** the "one job-wide default" recommendation. Per beam: chips 400x63 LVL / 445x63 LVL / Other (type a size); the last size used in the job is the next beam's preselected chip; a beam with no size makes the order Incomplete with a clear line, never guessed. Built (P1) |
| 3 | Waste (Q3) | 5% applied after offcut reuse, editable per job; Hebel may go lower | P2+ (sheets). Not built yet |
| 4 | Hebel stagger (Q4) | Build as spec'd (600 to 900), flag UNCONFIRMED, get the Hebel Design & Installation Guide **before phase 3** | P3. Not built yet |
| 5 | Scyon on a 35 mm chord (Q5) | Warn, do not block; ask the truss supplier | P3 |
| 6 | Strongback size (Q6) | 120 x 35 default, editable per job | Built (P1): the Strongbacks part section; chips 90 / 120 / 140 x 35 under More |
| 7 | Last truss bay (Q7) | **Always a truss at the far edge**; flooring is cut off flush at the overhang. Short last bay is fine | **Supersedes** the "short-bay warning / split the difference" recommendation: count = ceil(width / centres) + 1, no warning, no split option. Built (P1) |
| 8 | Hebel floor height (Q8) | A one-line note that it raises the floor 75 mm | P3 |
| 9 | Thickness from centres (Q9) | Automatic | P2+ |

**P1 follow-up decisions, 18 Nov 2026 (Sam approved all six recommendations; built):**
1. A truss cut by a stair void counts as its pieces (kept as built).
2. Truss-count tolerance 5 mm: count = ceil((width - 5 mm) / centres) + 1.
3. Redrawing the floor outline clears the beam marks (no silent re-mapping onto new edges); one Undo restores.
4. Wet areas drawn on a floor item are allowed and ignored (non-blocking note "Wet areas are used in the sheets phase") until P2.
5. Truss-end edges with beams are labelled A, B, C (plan, sheet, order notes) instead of outline edge numbers.
6. Defaults confirmed: beams/trimmers LVL Smart 10 H2 longest 11,000; strongbacks MGP10 H2 longest 6,000.

**P2 decisions, 18 Nov 2026 (Sam approved; built):** waste 5% applied after offcut reuse, rounded up to whole sheets, editable per job; thickness derived from truss centres (Structaflor 19 mm at 450, 22 mm at 600); always a last truss at the edge, flooring cut off at the overhang; sheets 3600x800 default (3600x600 option); wet areas default Scyon, but Scyon sheets are P3, so in P2 wet areas give m² only plus the non-blocking note "Wet area flooring (Scyon, phase 3): X m² — not counted yet". The plan's "minimum 1 spare sheet over 10 m²" rule (7.6 step 5) is NOT built. Built as: `engine/floor/sheets.js` (PACK_FIT_TOLERANCE_MM = 10 implemented as stock length 3610 for the shared allocator with a 5 mm saw cut; a rip strip is a lane, k = floor(790 / width) lanes per sheet), FLOORING order heading, `takeoff-calc@12` (a floor item with an outline gains a sheet count, so saved floor results change). Sheet ends beside a void or wet edge are cut to the edge, not extended to a truss line (plan 7.3 step 2 not built); instead a non-blocking note "floor_sheet_opening_edge" says blocking is needed where such an end is off a truss line. Wet and void overlap is tested on real polygon shapes, not bounding boxes.

**P3 decisions, 19 Nov 2026 (Sam; built, override the recipes doc `FLOOR_P3_ACCESSORY_RECIPES.md` where different):** floor truss chords are 90 mm on the flat so supports pass the 45 mm rule (warn only if a width under 45 is ever set); wet areas Scyon Secura 2700x600x19 default, 2400x600x22 under More, framed at 450 (note when not 450); Hebel PowerFloor 1800x600x75 is the main-floor alternative (chips Structaflor / Hebel; stagger = max(450, one truss space) on a truss line, min cut length 2 truss spaces, min width 270, joints on trusses, "Hebel raises the floor 75 mm"); accessories under FLOORING ACCESSORIES with a basis note each: Hebel screws 8/m2 at 450 and 6 at 600 (boxes of 500), Hebel Adhesive 20 kg per 20 m2, Max Bond 900 g cartridges with one bead per truss line under every sheet (the guide's 10.8 m2/tube is NOT used), Scyon stainless first-fix nails (50, 75 under More), SMX50 480 mL sausages on Scyon tongues and butt joints, 1 anti-corrosive paint per Hebel job, backing rod for control joints; PU sealant, Hebel Patch, waterproofing and tile adhesive left off. **Structaflor tongues and butt joints are also glued with Max Bond (Sam, 19 Nov): its cartridge lm = truss-line bead + tongue lm + butt lm; SMX50 stays Scyon-only** (this answers the open question: yes for Structaflor, with Max Bond, not SMX50). Control joints: length rule only (Hebel 6000, Scyon tiled 5400 / 4800 at 22 mm), snapped to a truss line (run across trusses; sheets stop at the joint) or a row edge (run along), drawn on the plan; re-entrant corner is a note only. Constants needing confirmation (all in `engine/floor/accessories.js`): adhesive density 1.4 g/mL and 6 mm bead (22.7 lm per cartridge), sealant bead 20 mm2 (24 lm per sausage), nail box size. Built in `engine/floor/sheets.js` (product kinds structaflor / hebel / scyon, control joints, accessory basis), `accessories.js`, `framing.js`. Hebel on the 6.0 x 4.2 example packs to 26 (the 25 in the recipes doc used joints off the 450 truss grid), 28 ordered with 5% waste. Not built: support-width setting UI, joints at openings, Hebel perimeter gap, offcut pooling between separate wet areas (packed counts are summed, waste applied once).

**P4 notes, 19 Nov 2026 (built):** one **Layout** button on the floor panel opens a full-screen scaled drawing (`engine/floor/drawing.js` builds one data model of polygons, lines and text; the screen view and the PDF both draw it). The PDF carries it as one page per floor item in the SITE appendix (not the supplier order). Layer chips from the phasing table were NOT built (one button only, owner rule). Drawing stays in plan orientation (no rotation to the truss frame). Cut pieces: red corner tick plus size.

**Superseded text below:** section 4 step 4 ("Beam size default per section 12"), section 6.3 ("If the last bay is under 200 mm, warn"), section 7.7's "last bay 150 mm (warn)" column, section 12 Q2 and Q7 recommendations, and the risk row about the last bay. Left in place for the record.

**Phase 1 decisions made while building (not in the plan; check them):**
- A truss is also placed on every outline edge that runs along the trusses (for example the step of an L-shaped floor), so the arm of an L-shape has an edge truss. Same reading as "always a truss at the far edge".
- Truss direction is the two chips only (no two-tap direction yet; the engine accepts `rules.trussAngleDeg` for later).
- The floor frame item has a settings sheet on the plan instead of a Setup card; beam and trimmer sections are per beam and per stair void (stored as `rules.beams` and `rules.trimmerSizes`, `rules.lastBeamSize`), the strongback section is the item's Strongbacks part.
- Beam and trimmer LVL default to grade "LVL Smart 10", treatment H2, longest 11,000 (the Walls long-plate figures), the strongback to MGP10 H2, longest 6,000 [Defaults, confirm with Sam]. Beams and trimmers are separate cut lists and do not share LVL offcuts.
- Strongback runs longer than the longest stock are cut into stock-length pieces joined over a truss with no lap added (the supplier's two-spacing lap is P5).
- Truss pieces under 300 mm beside an opening are not counted as trusses (noted).
- A plain opening ("+ Opening") gets no trimmers; the stair void gets 4.
- All floor areas use the existing `area` measurement kind (`inputs.role` floor / void), role "primary" on the contribution: no new contribution role and no migration. The server whitelist keeps `role`, `kind`, `name`, `stair` only.

---

## 1. What Sam asked (short)

From the plan, work out everything to order for the floor frame on a job, plus a sheet layout.

- Floor trusses (usual case), mid-span strongbacks through the webs.
- Perimeter and ring beams at truss ends. Where a truss end has no beam, a 120 x 35 strongback ties the ends together.
- LVL trimmers (400 x 63 or 445 x 63) round stairs and openings.
- Substrate: main floor (Structaflor 3600 x 800 or Hebel 1800 x 600) and wet areas (Scyon 2700 x 600 by default), counted and laid out with staggered joints.
- Outputs: quantities, a visual layout, one combined order list.
- Trusses follow the **supplier's layout**, not AS1684. AS1684 stays for conventional joist floors (later phase).

## 2. What exists today (from the scouts)

- There is **no floor code** in the Hub. Greenfield, but it reuses the Walls plumbing: measurements, calibration, the engine contract, stock/allocator, supplier order, PDF.
- Reusable as-is: `calibration.js` (mm from plan points, polygon area), the Rectangle and Area tools in `MeasureScreen`, `engine/stock.js` + `engine/allocator.js` (stock lengths), `engine/sheetCutPlan.js` (packs cross-cut pieces into sheets; same idea we need), `supplierOrder.js` (headings), undoable auto-apply edits (`changeset.js`).
- DB: `takeoff_measurements.kind` already allows `area`, which needs a calibration and a document. So no new kind is needed for the outline, voids and wet areas.
- Bestimator has only a parked seed (one job, no layout logic). Its useful lessons: never invent joists for a trussed floor (884.9 lm of phantom joists on Gibson), flag what is not measured as "not measured", not as zero. Its sheet sizes are wrong for our products, so ignore them.

## 3. Spec vs manufacturer facts (discrepancies)

| # | Spec says | Manufacturer facts | Effect on the module | Source |
|---|---|---|---|---|
| 1 | Structaflor 3600 x 800 | Correct. Also 3600 x 600. 2.88 m2 per sheet. 3600 x 900 exists only for R-flor | None. Offer 800 (default) and 600 | CHH Structaflor brochure; Bretts install manual |
| 2 | (silent on thickness) | 19 mm max 450 centres; 22 mm and 25 mm max 600 | **Thickness is derived from truss centres**: 450 gives 19, 600 gives 22. Shown as one chip, ordered in the line text | CHH brochure; Bowens guide |
| 3 | Hebel 1800 x 600 | Correct (PowerFloor, 75 mm thick, steel reinforced, tongue and groove). 2400 x 600 also exists (NZ) | 75 mm thick sits proud of the frame: floor height and wall setout effect. Heavy (about 80 kg, an estimate). Max centres not in the sheet I read | Bretts Hebel PowerFloor sheet; hebel.co.nz |
| 4 | Hebel stagger 600 to 900 | **Not confirmed** by any source. Only the screw position (two per panel at each joist, 100 to 150 mm from edges) is given | Build the Hebel rule as a **setting with the spec value**, marked UNCONFIRMED until the Design & Installation Guide is obtained | Bretts Hebel sheet |
| 5 | Scyon 2700 x 600 for wet areas | 2700 x 600 x 19 mm only suits 450 centres. At 600 centres it is 2400 x 600 x 22 mm. 1800 x 900 x 19 mm also exists | Scyon size is **derived from centres** (450: 2700 x 600; 600: 2400 x 600). Spec size stays the 450 default | Scyon Secura install guide; Canterbury Timbers |
| 6 | Scyon "cut to 900 or 1800" | Guide only says "staggered pattern", no numeric stagger. 2700 does not divide into 450 or 600 centres evenly | Keep Sam's rule (joints at least 600 apart, on a truss). Cuts are snapped to truss lines, so 900/1800 are the preferred cuts at 450 and 600 | Scyon guide |
| 7 | (silent) | Scyon wants joists at least 45 mm nominal width. A 35 mm truss chord does not meet this | **Needs truss manufacturer's confirmation** before Scyon goes on a truss floor. Shown as a warning on the Scyon area, not a block | Scyon guide |
| 8 | (silent) | Tiled Scyon needs a movement joint where the run exceeds 5.4 m in the sheet direction | Warning on wet areas longer than 5.4 m in the sheet direction | Scyon guide |
| 9 | Strongback 120 x 35 | Size depends on truss connection: 90 x 35, 120 x 35 or 140 x 35 (F5/P10), 70/90/120 x 35 (F17). 120 x 35 suits the 250 connection in F5/P10 | **Size is a per-job setting, default 120 x 35**, with a note "set from the truss layout" | Pryda floor truss guide (July 2026) |
| 10 | Mid-span strongbacks (spacing open) | Up to 3.5 m span: none. Over 3.5 m up to 6.5 m: one row near midspan. Over 6.5 m: three rows (midspan and quarter points). The job's truss layout states exact positions | Gives the answer to Open Question 1 (section 12) | Pryda guide |
| 11 | 120 x 35 at truss ends with no beam | Guide shows end trimmers (90 x 35 F5 minimum) with cross bracing; **says nothing** about a 120 x 35 end strongback | Keep Sam's rule (it is his practice), but label it "confirm with truss supplier" in the notes | Pryda guide |
| 12 | LVL 400 x 63 / 445 x 63 | No manufacturer figure checked | Take as given. Sizes remain a user choice; engineer-specified | Spec only |

None of these block P1. Rows 4, 7, 10, 11 are the ones to confirm with a supplier before the layout goes to an order.

## 4. User flow (tap by tap)

Floor is a new item type, **Floor frame**, added next to Walls in "Add item". It opens one screen with a left-to-right step strip (1 to 10). It always shows only the current step; a finished step collapses to one summary line (tap to reopen). Every valid edit auto-applies and is undoable, like Walls.

Defaults are set once per item, so a normal job is: draw the outline, set direction and centres, tick the beams, done.

| Step | Taps / actions | Auto-derived or defaulted | Hidden under "More" |
|---|---|---|---|
| Add item | Add item, Floor frame (1 tap). Name defaults to "Floor, <level>" | Sheet defaults (below) | Level label |
| 1 Outline | Pick **Rectangle** (2 taps = 4 corners) or **Outline** (tap each corner, tap the first or Finish to close) | Area, perimeter, plan snapped to the calibrated plan. Needs the page to be calibrated (existing rule, same problem messages) | Edge snapping to wall lines |
| 2 Openings | **+ Stair void** or **+ Opening**: rectangle or outline, one at a time. Can be skipped ("No openings") | Opening must sit inside the outline (else a warning). Stair voids default to LVL trimmers all round | Mark an opening as "no trimmers" |
| 3 Truss direction and centres | **Direction:** tap two points along one truss (or tap one of two chips: **"Span the short way"** (default) / **"Span the long way"**; "span" is the direction the truss spans). **Centres:** one chip row **450 / 600**, default 450 | Direction defaults to trusses spanning the SHORT way of the outline (shorter truss, the usual case). Truss lines, count, and sheet direction (perpendicular) all follow from this | Other centres (300, 400, 500, typed); chord depth label |
| 4 Perimeter and ring beams | Screen shows every truss end edge as a line. Tap an edge to toggle **Beam** (LVL ring beam) or leave blank. **Select all ends** is one tap | An edge with no beam gets the 120 x 35 end strongback automatically (shown dashed). Beam size default per section 12 | Beam size per edge |
| 5 Stair trimmers | For each stair void, one chip: **445 x 63 / 400 x 63** (default 445) | 4 trimmers per void (2 side, 2 end), lengths from the void edges plus bearing allowance | Doubling, custom lengths |
| 6 Mid-span strongbacks | Nothing to tap by default. Shows "1 row, 4 runs, 21.6 lm" | Rows and positions from the span rule (section 6.5). Runs are cut around voids | Override rows (0 to 3), size |
| 7 Wet areas | **+ Wet area**, Rectangle or Outline, one at a time. Skip allowed | Wet material defaults to Scyon | Change wet material |
| 8 Substrate | Pick the main material chip: **Structaflor / Hebel** (default Structaflor) | Main area m2 = outline minus voids minus wet; wet m2 separate. Thickness from centres | Sheet width (800/600), thickness override |
| 9 Layout | Nothing to tap; the layout is drawn and counted. One toggle: **Reuse offcuts** (default on) | Direction, stagger, snaps, row starts, cuts around voids and wet edges | Stagger override per material; waste % |
| 10 Order | **Add to order** (1 tap). Shows the combined list | Headings, stock lengths, rounding up | Per-line edits (same as Walls order screen) |

Steps with nothing to ask (6 Mid-span strongbacks, 9 Layout) are not separate screens: they show as a summary line and the strip skips them, so a normal job is outline, direction, centres, beams, Add to order. 1 to 10 is the order of the flow, not ten screens.

Warnings use plain English ("This void is outside the outline", "Last truss bay is 150 mm, consider a different centre"). A warning never silently changes numbers.

## 5. Data model

### 5.1 Item (job material)

- `spec.family = "timber"`, `spec.purpose = "floor"` (new `FLOOR_PURPOSE` in `families.js`, next to `WALLS_PURPOSE`).
- `methodKey = "floor_framing"`, `methodVersion = 1`. Registered in `methods.js` like `wall_framing`.
- `spec.components` (like WALL_PARTS), small product identities with defaults:
  - `trusses` (EA, custom length, supplier-made; no product catalogue entry beyond a label and chord depth)
  - `strongback` 120 x 35 (LM, stocked)
  - `ringBeam` LVL (default size per section 12)
  - `trimmer` LVL 445 x 63 or 400 x 63
  - `mainSheet` Structaflor / Hebel product
  - `wetSheet` Scyon product
- Rules (`material.rules`, inside the existing 60-key, 6-level limits via `cleanGenericRules`):
  `trussDirectionDeg` (plan angle), `centresMm`, `mainMaterial`, `wetMaterial`, `reuseOffcuts`, `strongbackRows` (null = auto), `strongbackSizeKey`, `staggerMm` per material (null = auto), `wastePct` per material, `beamEdgeIds` map (edge id to beam size or "strongback"), `trimmerSizeByVoid` map (void id to size key). Per-edge and per-void maps use the existing UUID-key allowance.

### 5.2 Measurements

All use the existing kind `area` (no migration). Role goes in `inputs.role`:

| role | Meaning | Points |
|---|---|---|
| `floor` | Outline (rectangle stored as 4 points) | 3+ points, in PDF user space with page index |
| `void` | Stair void or opening, `parentId` = the floor measurement | 3+ points |
| `wet` | Wet area, `parentId` = the floor measurement | 3+ points |

Other inputs: `inputs.kind` ("rect" or "polygon", as Walls does), `inputs.stair` (bool, for void), `inputs.wetMaterial` (optional override).
Trusses, beams, strongbacks are **derived**, never stored as measurements, so changing direction or centres redraws everything with nothing stale.

### 5.3 Server changes (all in `takeoffService.mjs` unless noted)

- `cleanInputs("area", ...)`: allow `role`, `stair`, `wetMaterial`; drop anything else.
- `ROLE_KINDS`: a floor contribution role mapping to `area`; "surface" already allows `area`.
- `methodReads` in `dispatch.js`: `floor_framing` reads `area` only. Walls and cladding keep rejecting floor areas as `measurement_unused`.
- Commit validation: floor measurements need calibration and document (existing rule for `area`).
- `cleanGenericRules`: no limit changes expected; check key count with a full set of per-edge maps (an L-shaped outline with 8 edges is well inside 60 keys; maps count as one key each).
- **Migration:** none needed in P1 to P4. If a later phase needs a new contribution role in the `takeoff_commit` RPC, add one migration then (next free number at that time; `221` is the latest on main today, and other takeoff branches may claim some).

### 5.4 Calc version

`CALCULATION_VERSION` moves `takeoff-calc@7` to `@8` with the first phase that changes any number. The unmerged `takeoff/wall-junctions` branch also needs a bump, so whichever merges second takes `@9`. Recorded in the changelog comment on the same line. PDF `RENDERER_VERSION` `takeoff-pdf@5` to `@6` when the layout drawing is added to the appendix (P4).

## 6. Geometry engine

New pure module `shared/takeoff/engine/floor/` (plain functions, deterministic, no I/O), called from a new `runFloorFraming` in `dispatch.js`. It returns the standard `{ demands, layout, problems, status, explain }`. All maths is in millimetres in a local frame.

### 6.1 Local frame

1. Convert each polygon to mm using the calibration (`pointToMm`).
2. Rotate so the truss span axis is Y and the truss spacing axis is X. Everything below is in this frame; the drawing rotates back for display.
3. Truss direction: from two taps (angle snapped to the nearest outline edge if within 3 degrees) or from the long/short chip (angle of the longest or shortest outline edge, as a bounding rectangle in rotated space). Stored as an angle so it survives re-drawing.

### 6.2 Floor area minus openings

- Area = `polygonAreaMm2(outline)` minus the area of each void clipped to the outline (polygon clip, even-odd). Wet areas are clipped to the outline and the voids, then subtracted for the main floor.
- Self-intersecting or overlapping shapes are rejected with a plain message (never "fixed" silently).

### 6.3 Truss layout from direction + centres + outline

- First truss line on the outline's minimum X (the first edge), then every `centres`; a last truss is placed at the maximum X edge. Count = `ceil(width / centres) + 1`. If the last bay is under 200 mm, warn "Last bay is N mm".
- For each truss line, intersect with the outline and subtract voids: the result is one or more spans. Truss length = span length, rounded **up** to the next 10 mm for the supplier (the supplier confirms final lengths; it is their design).
- A truss line crossing a void is **interrupted**: counted as two shorter trusses, each ending at the void header trimmer ("trimmer carries ends"). These are flagged for the truss supplier ("by supplier layout").
- Outputs: truss list (length, count by length), total truss area (m2 of floor supported), and the line positions used later by sheets and strongbacks.
- This module never uses AS1684 tables for trusses. It states "Supplier designs truss layout and spans; counts here are for ordering and checking".

### 6.4 Perimeter and ring beams, and the end strongback rule

- The truss **end edges** are the outline edges the truss ends touch (the edges not parallel to trusses). Edges parallel to the trusses are **side edges**; the outer truss sits along them.
- For each end edge: `beam` (LVL ring beam, lm = edge length) or `none`.
- Every truss end with no beam is tied by a **120 x 35 end strongback** running the full edge length (one continuous run per unbeamed edge, lm = edge length). Where a side edge has no beam it carries the outer truss only, and no extra member.
- Perimeter beam on a side edge: an option under "More" (default off). Ring beams are only required by the plans; the module never invents one.
- Corners: beam lengths are edge lengths measured to the outline; mitre/overlap is not added (the supplier or carpenter cuts to suit). Warn on edges shorter than 300 mm.
- Beam lengths go through the stock allocator (section 9).

### 6.5 Mid-span strongback runs

- Rows by **truss span** (the longest truss in the region), following the supplier rule from the facts table: span up to 3.5 m: 0 rows; over 3.5 m up to 6.5 m: 1 row at midspan; over 6.5 m: 3 rows (midspan, quarter points). Both limits are settings, not hard-coded (the supplier layout wins).
- Each row runs across the trusses perpendicular to them, so its run is the full width of the truss field at that Y, minus voids. A run is broken at a void and at changes of span; each piece is a separate run to cut.
- Row Y position is placed at the fraction of each truss's own span, so a floor with trusses of different lengths gets a staggered row, following the real midspan. For an irregular outline, rows are split into runs where the span fraction changes by more than 50 mm.
- Splices: runs longer than the longest stock length overlap two truss spacings (the supplier rule) per splice; added to lm.
- Quantity: sum of run lengths (lm) in `strongbackSize` (default 120 x 35), plus splice overlaps, through the allocator.
- Flag: each run states "fix hard against a web; add a supplementary vertical web if none at this position" (supplier guide).

### 6.6 Stair and opening trimmers

- Each void with `stair = true` (default for "+ Stair void") gets 4 LVL trimmers. The 2 **end trimmers** (headers, across the trusses) must bear on the trusses beside the void, so length = void width **snapped outward to the truss line each side**. The 2 **side trimmers** (parallel to trusses) = void length plus bearing allowance (default 45 mm) each end, fixed to the headers. Where a void edge sits on a truss line the trimmer replaces the truss for that line (it carries the end of any interrupted truss).
- Size: 445 x 63 or 400 x 63 LVL per void, default 445 x 63. Doubling is an advanced toggle (default off, not assumed). All three are the engineer's call, so the item shows "Sizes by engineer".
- Non-stair openings default to **no trimmers** (user toggles one chip) to avoid ordering what was not asked.
- Quantity: lm per size, through the allocator.

## 7. Sheet layout algorithm

One engine function, `layoutSheets({ region, trussLines, material, rules })`, run once for the main floor and once for each wet area. It outputs placed pieces (for the drawing) and a demand list (for the order).

### 7.1 Common frame and rows

1. Local frame as above: trusses along Y, spaced along X. **Sheet length runs along X** (perpendicular to the trusses). Rows are stacked along Y, one sheet width apart. Nothing to ask the user.
2. Rows start at the outline's minimum Y edge and run to the maximum Y. The last row is ripped to the remaining width.
3. For each row, the covered region is the row strip intersected with the region polygon (minus voids and minus wet areas for the main floor). A strip that splits into several spans (around a void) is laid as separate segments, each with its own start point.
4. **Wet area boundary.** A wet region's sheet extent is snapped **outward** along X to the nearest truss line on each side, so its ends land on a truss. The main-floor sheeting butts to the wet sheet at that same truss line. Wet area m2 is reported as drawn; extra snap area is reported separately as "snap allowance" so the maths is visible.
5. Hard rule for every material: **every end joint lands on a truss line** (a snap list `T = {x_i}`). If a requested joint cannot land on one, the algorithm moves it to the nearest truss line that keeps the stagger rule, or raises a plain-English problem (never an unsupported joint).

### 7.2 Joint stagger

For each row r the algorithm computes a **joint set** `J_r` (X positions of end joints). Adjacent rows must satisfy `min |j - k| >= 600` for every `j` in `J_r`, `k` in `J_(r+1)`. If a layout fails, the next candidate offset is tried (below); if none works, a problem is reported.

Candidate offsets, in order, for the start piece of alternate rows:

- Structaflor: row A starts with a full 3600; row B starts with an **1800** half sheet, then full 3600s. Joints at 1800 + 3600k for B and 3600k for A. The 1800 offset is a multiple of both 450 and 600, so it always snaps. If centres are non-standard and 1800 is not on a truss line, the nearest truss line with a stagger of at least 600 is used and a note says so.
- Hebel (1800 x 600): preferred half panel (900), kept inside **600 to 900** (the spec's setting, unconfirmed). The offset must be a multiple of the truss centres:
  - 450 centres: 900 (2 bays).
  - 600 centres: 600 (1 bay). 900 is not on a 600 truss line, so 600 is used.
  - Other centres: the multiple of the centre between 600 and 900 nearest 900; if none exists, nearest multiple at or above 600 with a note.
- Scyon: free. Start pieces are cut to 900 or 1800 (snapped to a truss line); any joint is allowed as long as it is on a truss and at least 600 from the neighbour row's joints. The algorithm picks the offset nearest half the sheet length that the stagger test accepts.
- In all materials, the first piece of every row also starts on a truss line (x = outline min X is by definition on the first truss).

### 7.3 Row fill

For one row segment of length `L` starting at X0, joint list `J`:

0. If the row is no longer than one sheet, lay one piece with no start offset (no joint to stagger). Alternating starts apply only to rows longer than a sheet.
1. Place the start piece (length = offset) then full sheets along X until the remaining length is less than a full sheet.
2. The last piece is cut to the end, which is the outline edge or the end truss, so it is on a truss. If the end lands off a truss (an outline edge not at a truss, e.g. against a wet area edge), the end is **extended to the next truss line** (the sheet continues over the truss; trim at the wall by the carpenter), and the extra is shown.
3. If the final piece would be under 300 mm, the previous joint moves back one truss spacing (the last two pieces share) provided the stagger test still passes. This avoids slivers.
4. Run the stagger test against the previous row; on failure, try the next candidate offset.
5. Row width: full width = sheet width. The last row is ripped to the remaining width `w`.

### 7.4 Cutting around the outline, voids and wet areas

- The outline and each void are clipped against each row strip, giving one segment per strip piece. A void splits the row into two segments; each segment is laid from its own start (a void edge on a truss line is a natural start). The stagger test treats the segment starts and ends as joints too.
- A void edge that is not on a truss line is supported by its trimmer (stair void) or by the truss it cuts (non-stair). A segment end next to a void with no trimmer is flagged "needs support at this edge".
- Non-rectangular edges (a diagonal wall): the row strip is clipped by the polygon, and pieces are listed at their longest length; the cut is a wastage in the count.
- Main-floor sheets are placed over the whole outline minus voids minus wet areas. Wet areas are laid in the same way with their own start points, direction still perpendicular to trusses.

### 7.5 Ripping and long-edge rules

- Tongue and groove stays on the sheet's long edges (Sam's owner rule from HUB 016, same as `sheetCutPlan.js`). The first row starts on the **tongue-side or groove-side edge** that the manufacturer specifies (Structaflor: tongue to a string line, square to the joists).
- Last row is ripped to `w`. Strips per sheet = `floor((sheetWidth - 10) / w)` (10 mm allowance for the cut edge and tongue loss; a named constant). A strip is reusable only for another strip of equal or narrower width (no turning over; same rule as `sheetCutPlan.js`).

### 7.6 Counting (the count rules)

1. Every row segment produces **pieces**: `{ lengthMm, widthMm, rowId }`. Full-width pieces are cross-cuts; ripped pieces are strips.
2. **Cross-cuts** are packed into stock sheets of the material length by the existing `allocateLinear` (one cut allowance each, default `SHEET_KERF_DEFAULT_MM` = 5 mm) when **Reuse offcuts** is on (default). When off, every piece takes its own sheet (full sheets count once, cut pieces one sheet per piece).
3. Packing is by length because all pieces of a main row are one sheet wide. Rip strips are packed separately as in 7.5.
4. **Reuse limits:** an end offcut is reusable. A piece with a factory tongue or groove on its long edge is reused only for a piece needing the same edge, as per `sheetCutPlan.js`. For **Hebel** reuse is on by default but flagged "heavy, confirm cutting on site" (steel reinforced).
5. **Waste:** on top of the packed count, apply the material waste allowance (section 12; defaults 5% Structaflor, 5% Hebel, 5% Scyon) rounded up to a whole sheet, minimum 1 spare sheet only if the area is over 10 m2 (setting).
6. The order shows the **packed** count and the **ordered** count (packed plus waste); the drawing shows where the cuts and offcuts are.

### 7.7 Worked examples

Room 6.0 x 4.2 m, no voids, trusses span the 4.2 m side (short side). Trusses span Y and are positioned along X at `centres`.

**Trusses.**

| Centres | Trusses | Last bay | Truss length |
|---|---|---|---|
| 450 | `ceil(6000/450) + 1` = 14 + 1 = **15** | 150 mm (warn) | 4200 |
| 600 | `ceil(6000/600) + 1` = 10 + 1 = **11** | 600 | 4200 |

Truss area (floor area) = 25.2 m2. End strongbacks: trusses end on the two 6.0 m edges, so with no beams **2 x 6.0 = 12.0 lm** (0 if both take a beam). Mid-span: span 4.2 m is over 3.5 and up to 6.5, so **1 row** across the 6.0 m field: **6.0 lm** (18.0 lm of 120 x 35 in all) (plus splice only if above the longest stock length).

**Structaflor 3600 x 800 (19 mm at 450, 22 mm at 600).** Rows run along X (6000 long), rows stack along Y (4200): `4200 / 800 = 5.25`, so **5 full rows and one 200 mm ripped row = 6 rows**.

- Row A (rows 1, 3, 5): 3600 + 2400. Joints at 3600.
- Row B (rows 2, 4, and the ripped row 6): 1800 + 3600 + 600. Joints at 1800 and 5400.
- Joints: A at 3600; B at 1800 and 5400. Stagger = 1800 on each side, above the 600 minimum. All joints are on a truss line at both 450 (multiples 8, 4, 12) and 600 (6, 3, 9). The same layout works at both centres, because 1800 and 3600 are multiples of 450 and 600.
- Pieces for rows 1 to 5: A (3 rows): 3 x 3600, 3 x 2400. B (2 rows): 2 x 1800, 2 x 3600, 2 x 600. Full sheets used whole: 5.
- Cut pieces to pack: 3 x 2400, 2 x 1800, 2 x 600. Packing into 3600 stock (see the kerf rule below): [2400 + 600], [2400 + 600], [2400 + 1200 spare], [1800 + 1800] = **4 sheets**.
- Kerf rule: n pieces from one stock sheet need n-1 cuts, so exact fits (1800 + 1800, 3 x 600) come up a kerf short. The last piece of a row is cut to fit on site and a few mm short sits inside the joint gap, so a pack is accepted if its shortfall is at most `PACK_FIT_TOLERANCE_MM` (default 10 mm, named constant). The counts here assume this; without it Structaflor would be 11 and Hebel higher (25 at 450 centres). Golden tests must pin the choice.
- Row 6 is 200 mm wide: strips per sheet = `floor(790 / 200)` = 3. The strip lengths needed are 1800 + 3600 + 600; **1 sheet** supplies them.
- **Packed count: 5 + 4 + 1 = 10 sheets** (28.8 m2 of sheet for 25.2 m2 of floor). With **Reuse offcuts off: 13** (rows A cost 2 each, B cost 3, ripped row 1).
- Waste 5% rounded up: 10 x 1.05 = 10.5 gives **11 sheets ordered**.
- Area-based sanity check: 25.2 / 2.88 = 8.75, so 9 is the minimum possible. 10 is the realistic packed count.

**Hebel 1800 x 600.** Rows along X (6000), stack along Y: `4200 / 600 = 7` rows exactly, no rip.

- 450 centres, stagger **900**: Row A (4 rows): 1800 + 1800 + 1800 + 600, joints at 1800, 3600, 5400. Row B (3 rows): 900 + 1800 + 1800 + 1500, joints at 900, 2700, 4500. Minimum stagger 900. All on a 450 truss line (2, 6, 10 and 4, 8, 12).
  - Full panels: 4 x 3 + 3 x 2 = 18. Pieces: 4 x 600, 3 x 900, 3 x 1500. Pack into 1800: [1500], [1500], [1500], [900 + 900], [900 + 600], [600 + 600 + 600] = **6 panels** (last uses the kerf tolerance). Total **24 panels** (25.92 m2 for 25.2 m2). Without reuse: 18 + 4 + 6 = 28.
- 600 centres, stagger **600** (900 is not on a 600 truss line): Row A (4 rows): 1800 x 3 + 600, joints 1800, 3600, 5400. Row B (3 rows): 600 + 1800 x 3, joints 600, 2400, 4200. Minimum stagger 600 (at the 600 and 1800 neighbours), which equals the minimum and passes.
  - Full panels: 4 x 3 + 3 x 3 = 21. Pieces: 7 x 600, packed 3 to a panel: **3 panels**. Total **24 panels**.
- Waste 5%: 24 x 1.05 = 25.2, **26 ordered** (rounded up).

**Scyon 2700 x 600 wet area.** A 2.4 x 1.8 m bathroom (2.4 m along X, 1.8 m along Y), starting on a truss line.

- 450 centres: wet edge on X is snapped outward to the next truss line, which is 2700 (6 bays). Row length 2700 = **one full 2700 sheet**. Rows: `1800 / 600 = 3`. **3 sheets** (4.86 m2 of sheet for 4.32 m2 drawn). No joints, so the stagger rule is trivially met.
- 600 centres: the product is the 2400 x 600 x 22 mm size; 2400 is already a truss line. **3 sheets** of 2400 x 600 (4.32 m2). Order text names the 2400 size.

**Height and edge notes.** Hebel is 75 mm against Scyon at 19 or 22 mm, so Hebel main floor plus a Scyon wet area leaves a step of about 55 mm: warn on that combination. A wet-area edge crossing a main sheet mid-width leaves a cut long edge with no tongue and groove between trusses: warn "needs blocking at this edge" (no quantity added).

**Main floor with the 2.4 x 1.8 wet area cut out.** Main m2 = 25.2 - 4.32 = 20.88 m2 (wet drawn area, not the snap). The layout algorithm lays rows around the wet region (7.4) as separate segments.

## 8. Wet-area deduction and reporting

- Main floor m2 = outline minus voids minus wet areas (wet clipped to outline and voids). Wet m2 = sum of wet polygons (clipped). Both are on the Order screen: "Main floor 20.88 m2, wet areas 4.32 m2, openings 3.2 m2".
- Sheet counts are for the **laid regions**, so snap extensions (7.1 step 4) are included in the sheet count but not in the m2 line; the Order notes show "+0.54 m2 snap allowance".
- A wet area outside the outline, or overlapping a void, is a blocking problem with plain wording.

## 9. Outputs

### 9.1 Quantities (Floor screen summary, always visible)

Truss area (m2) and truss count by length; end strongback lm and mid-span strongback lm (120 x 35, or per-job size); ring/perimeter beam lm; LVL trimmer lm by size (445 x 63 and 400 x 63 shown separately); sheets by material (packed count, ordered count, m2).

### 9.2 Visual layout (new)

A plan drawing drawn on the plan page from the engine layout: the outline, truss lines (thin grey, with count), beams (heavy dark line), end strongbacks (dashed), mid-span strongback runs (orange), LVL trimmers (blue, by size label), openings (hatched), wet areas (tinted), and the sheet joints (thin lines with a different tint per row) with numbered rows. Toggle chips at the top turn layers on and off. The same drawing goes into the PDF appendix (`takeoff-pdf@6`), in the existing site appendix layouts, alongside the cutting list.

### 9.3 Combined order list

One floor-frame order for the job, under supplier-style headings in `supplierOrder.js` (add `GROUPS` rows and regex branches; mind the ordering because `/beam/` currently goes to LINTELS and `/trimmer/` to HD & SILL TR, so floor roles get explicit role names that match first):

| Heading | Lines | Unit |
|---|---|---|
| FLOOR TRUSSES | One line per distinct truss length, e.g. "FLOOR TRUSS 4200 x 15", note "per truss layout, supplier to confirm" | EA, by length (same pattern as the hoop/bracing EA rows) |
| RING BEAMS | LVL ring beam by size | LM through allocator, stock lengths |
| STRONGBACKS | 120 x 35 (or job size), end runs + mid-span runs | LM through allocator |
| LVL TRIMMERS | 445 x 63 and 400 x 63 | LM through allocator |
| SUBSTRATE | Structaflor / Hebel (thickness in text), Scyon (size and thickness in text) | EA, plus m2 in the note |

LVL, strongbacks and beams use `stock.js` (`selectStock`) and `allocator.js` (`allocateLinear`), so cuts share stock lengths exactly as wall framing does. Sheets use `allocateLinear` along the sheet length (7.6). Truss lengths are supplier-made and are **not** run through the allocator.

The client mirror (`OrdersScreen.jsx`) rebuilds supplier groups from edited quantities, so the new headings must be added to the client mirror at the same time (same change as the server group rows).

## 10. AS1684 (conventional joist floors, later phase)

- Applies only when the item's subfloor is "Bearers and joists" (not trusses). Joists: span tables by species/grade; bearers likewise; spans looked up from the licensed tables in `~/Documents/AS 1684 Span Tables`, transcribed once, per-cell cited. Not part of P1 to P5.
- Rules inherited from Bestimator notes (not code): floor live load Q 1.5 kPa residential, 2.0 kPa balcony; joist spacing 450 typical, 600 where sheet and joist allow; table numbers (T6 joists, T1-5/33-35/49 bearers) are assumed and **must be verified per supplement** before use.
- The truss path stays free of AS1684 by design. If a conventional-joist floor is chosen, the module shows a plain notice until that phase lands.

## 11. Phasing (small, shippable)

| Phase | Slice | Ships |
|---|---|---|
| **P1** (smallest useful) | Item + outline (rectangle/polygon) + voids + truss direction/centres + truss count and lengths + **strongbacks** (end + mid-span) + beams + trimmers as lm, quantities screen and combined order (non-sheet) | Trusses, strongbacks, ring beams, trimmers on the order. No sheets, no drawing beyond a simple plan overlay |
| P2 | Main-floor substrate: Structaflor (3600 x 800) layout, count, m2; wet-area polygons and deduction (no wet sheet layout yet) | Main floor sheets plus wet area m2 |
| P3 | Wet-area sheeting (Scyon), snap logic, Hebel with the unconfirmed rule flagged, offcut reuse | All three materials |
| P4 | Visual layout drawing, PDF appendix (`takeoff-pdf@6`), layer chips | Drawing and PDF |
| P5 | Polish: warnings, spans over 6.5 m (3-row strongbacks), splices, doubling, edge-by-edge beams, Scyon width/movement joint warnings | Polish and accuracy |
| P6 (later, separate approval) | Conventional bearers and joists with AS1684 | Not planned yet |

One phase at a time. Each phase finishes with a "done + next steps" recap and a calc-version note. P1 stays small on purpose: no layout algorithm until the truss quantities are checked against a real job.

## 12. Open questions (Sam's three, with recommendations)

1. **Strongback spacing along the truss span.** **Recommend: take it from the supplier's rule as the default, with override.** Default rows by span (up to 3.5 m: none; over 3.5 m up to 6.5 m: one row near midspan; over 6.5 m: three rows), from the Pryda guide, and the user can type 0 to 3 rows per job. When the supplier's truss layout arrives, the user overrides the rows. The order note says "positions per truss layout".
2. **Ring beam sizes.** **Recommend: one job-wide default, editable, with a per-edge override under "More".** Default to the LVL trimmer family (the same 445 x 63 unless the job says otherwise) because the engineer sizes ring beams; show "Sizes by engineer" next to it. A fixed default hidden from the user would give wrong orders.
3. **Waste allowance for sheets.** **Recommend: 5% for all three materials, applied after the packed count and rounded up to a whole sheet; editable per job under "More".** Sam may prefer lower for costly Hebel (setting). The packed count already includes offcut reuse; the allowance is for breakage and site error only.

**New questions (each with a recommendation).**

4. **Hebel stagger and max centres:** the spec says 600 to 900, but no source confirms it. **Recommend:** build it as spec'd, mark UNCONFIRMED, and get the Hebel PowerFloor Design & Installation Guide before P3 ships.
5. **Scyon on a 35 mm truss chord:** the guide wants 45 mm joist width. **Recommend:** warn on the Scyon area, and ask the truss supplier which products they approve; do not block.
6. **Strongback size 120 x 35:** depends on truss connection. **Recommend:** keep 120 x 35 as the default, show it as a per-job setting, and read it from the truss layout when available.
7. **Last truss bay:** 450 centres in a 6000 room leaves 150. **Recommend:** show a warning and let the user pick "start at both ends and split the difference" (default off) rather than silently changing centres.
8. **Hebel on trusses:** the 75 mm panel changes floor height and wall setout. **Recommend:** a one-line note on the Hebel option ("raises the floor 75 mm; check setout"); no calculation.
9. **Sheet thickness derived from centres** (19 mm at 450, 22 mm at 600): **Recommend:** yes, automatic, shown as one chip and written into the order text.

## 13. Test plan

- **Unit (pure engine):** polygon clip (rectangle, L-shape, void inside, void on the edge, void outside = problem); truss count and lengths at 450/600 for several widths (including a last bay under 200); strongback rows at span 3.5 / 3.6 / 6.5 / 6.6; end-strongback rule (beam on 1 of 2 ends); trimmer lengths; wet deduction maths.
- **Sheet algorithm:** the three worked examples in section 7.7 as golden tests (Structaflor 10 packed at both centres, Hebel 24 at both centres, Scyon 3 at both centres); stagger test (never under 600, every end joint on a truss line) as a **property test** on random rectangles and L-shapes, centres 300/400/450/600, all three materials; offcut reuse on and off; rip strips; segment split by a void; a wet area off a truss line (snap outward).
- **Determinism:** the same input gives the same output regardless of measurement order (existing pattern).
- **Server:** `cleanInputs` accepts the new inputs and drops unknown ones; `methodReads` makes floor areas unusable by Walls and vice versa (`measurement_unused`); `takeoff_commit` accepts area measurements with `role`; calibration problems (outside region, superseded) appear as for Walls.
- **Order:** headings and ordering (a floor beam must not land in LINTELS, a trimmer must not land in HD & SILL TR); client mirror equals server groups; snapshot freezes `takeoff-calc@8`; PDF appendix renders the layout (P4).
- **UI:** the step strip flow on iPhone and iPad widths; tap counts for a typical rectangle job (aim: 2 taps outline, 1 chip direction, 1 chip centres, 1 tap beams, 1 tap Add to order); undo/redo for every step.
- **Real job:** run P1 on one real floor plan and compare truss counts and lm to the truss supplier's layout before P2 starts (Bestimator lesson: one-house correlations do not transfer).

## 14. Risks

| Risk | Mitigation |
|---|---|
| **Merge conflicts with `takeoff/wall-junctions`** (both touch `dispatch.js`, `methods.js`, `supplierOrder.js`, `takeoffService.mjs`, `CALCULATION_VERSION`) | Keep floor code in new files (`engine/floor/`, `FloorScreen.jsx`); only small, additive edits in shared files; rebase on whichever merges first; version bump taken by the second to merge (`@8` or `@9`). Also `takeoff/wet-walls-cavity-doors` touches wall wet-area rules; no floor overlap expected |
| Supplier layout differs from our counts | Orders say "supplier to confirm". Trusses are a check number, not a design. P1 compares to a real layout |
| Hebel and Scyon rules not confirmed (rows 4 to 8 in section 3) | Settings with warnings; get the guides before P3 |
| Offcut reuse over-promises (damage, orientation) | Default on, toggle off, and the order shows both counts |
| Irregular outlines (non-rectangular, diagonal walls) | Clip rows by polygon; count at longest piece; warn on pieces under 300 mm; no mitre/hip logic |
| Heavy screen complexity onsite | The 10 steps are a strip with one visible step; advanced settings hidden; no step required except the outline, direction and centres |
| Rules key limits (60 keys) | Maps hold per-edge and per-void values as single keys; checked in tests |
| Calc/PDF version churn | Bump only when numbers change; recorded in the changelog line |

## 15. Done criteria for this plan

Sam answers section 12 (3 questions plus 6 new ones, each with a default) and says "go P1". Until then no code is written, nothing is pushed.

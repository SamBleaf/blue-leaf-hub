<!-- Planning only (21 Oct 2026). Nothing built. Replaces WALL_BY_WALL_PLAN.md with Sam's answers, HUB 022 and HUB 023. -->

# Wall-by-wall takeoff: revised plan (HUB 022 + HUB 023)

## What changes for you
- The Line tool shows the cladding and its Wall height together, and you trace a whole run in one go. If you change the height partway through, only the walls you trace after that get the new height.
- Finish keeps you on the plan and shows one card: "Run 1 · 4 walls · 2,700". Each wall still has its own elevation and sheets.
- + Window / + Door: set the height and sill once, then tap both ends of the opening on the wall you traced.
- Rectangle and Area draw cladding straight onto a scaled elevation. Sheet sizes, laps and offcuts still apply.
- Battens, H-flashing and foam tape are worked out for you. Nails are too, if you want them (question 3).
- The wall list shows each run as one line. Tap it to see its walls.
- At the end, ‹ › steps from wall to wall. Or tap a wall with Select to change its height.
- There are no new settings and no page types.

## The new flow, step by step
The job: 4 walls traced on a scaled plan, Axon 400 smooth, 2,700 high, 3 windows the same size and a door. Every touch counts as a tap. Typed digits don't.

1. Plans → Takeoffs → Timber and cladding. **3**
2. Add cladding → Axon 400 smooth → Walls → Trace on plan. **4**
3. Line is already chosen and the panel reads "Axon 400 smooth · Wall height". Tap Height, type 2,700, tap Done. **2 (1 number)**
4. Tap the start and the 3 corners, then double-tap the start. **6**
5. The run card appears with Undo, + Window, + Door and Review walls. **0**
6. + Window, Height, Sill, Done, then both ends of the window. **6 (2 numbers)**
7. Windows 2 and 3 are the same size, so just tap both ends of each. **4** (a different size adds about 3 taps)
8. + Door (no sill), Height, Done, then both ends. **5 (1 number)**
9. Review walls, › three times, then "Review order ›". **5**
10. Battens and extras are already on the schedule. **0**

**New: about 35 taps and 4 numbers. Today: about 70 taps and 21 numbers.** That's 58 taps and 19 numbers for the walls and openings (from the last plan), plus 12 taps and 2 numbers to add battens and attach them wall by wall.

On elevations:
- Changing page is 2 taps.
- A Rectangle wall is 3.
- A five-corner gable is about 7.
- A window drawn on an elevation is 3 (+ Window, then two opposite corners), with nothing typed.

## Battens, fixings, H-flashing and foam tape
**Axon (sheets standing up, on a cavity)**
- **Uprights:** at both ends and at every sheet join, with no gap over 600, set out from the first sheet.
- **Horizontals:** along the bottom, along the top and behind every H-flashing join. They run full length and join over an upright, which errs slightly over, never under.
- **Openings:** battens at the sides and head, plus the sill on windows (question 3).
- **Nails:** ND nails at 150 round every piece of sheet, including cuts at openings. That's about 52 per 1,200 × 2,700 sheet, with 300 centres on the middle uprights (question 3). Shown as a count until you give a box size.
- **Foam tape:** behind every vertical sheet join, full height, stopping at openings and at the H-flashing (question 4). Shown in metres until you give a roll length.
- **H-flashing:** on every horizontal join, by the metre, rounded up once per job (question 4). Only walls taller than the longest sheet (3,000) get one.
- **Battens:** Hardie Cavity Batten 70×19×3000, with offcuts shared across all walls.

**Linea, Stria, timber:** battens run one way only, across the boards (question 2).
- Flat boards go on upright battens at 600, on the studs.
- Standing boards go on horizontal battens at 450.
- Linea and flat Stria use Cavity Batten. Standing Stria uses Structural Batten 70×35×2700. Timber uses 70×35 H3 pine in the length you buy.

**All cladding:**
- Batten-to-stud fixings show as "not counted", so they never hold up the order.
- Direct-fixed cladding gets no battens.
- Gable and Area tops get a sloped batten.
- All of this can be changed once, on the cladding's defaults line (Edit).

**Check job** (I've guessed the walls at 6, 4, 6 and 4 m):
- 18 sheets at 2,750.
- 46 battens at 3,000: about 128 m fitted and 7% waste. Today the same 46 battens cover the uprights only.
- About 1,060 nails.
- 33 m of tape.
- No H-flashing, because every wall fits one sheet.

The catalogue has no nail, tape or H-flashing products yet, so you'd name them once in the defaults.

## What gets hidden or removed
- The jump to the elevation after tracing.
- "Use this material" and Remove on every wall row. Both are already inside each wall. Walls on other materials fold under "Other walls".
- The setup cards for the automatic battens and extras. They become one line: "Worked out from Axon 400 smooth. Edit on the cladding." Battens you set up by hand on older jobs keep their cards.
- Chips and notes on the wall screens. They fold under "More" and still show on the schedule and order.
- The sheet-by-sheet ‹ Previous / Next ›. It now steps wall to wall; tap a sheet or batten to see it.
- Not touched:
  - Wall by numbers
  - scaling
  - the product list
  - Centre
  - profile drawing
  - autosave
  - face-side switching
  - the perforated selector
  - break lines
  - Count
  - the flashing tools

## How we'd build it
Every phase also updates SOP 20-09 and SOP_CHANGELOG.md (CLAUDE.md SOP law).

**0. Prep (S)**
- Commit the HUB 016b relabel. It is still uncommitted across 10 files on takeoff-r03 (`git status`).
- Branch from origin/main (a8e5b22). The local main is stale at 5c9014e.
- Confirm migration 211 is pasted. HUB_REVIEW_LOG.md:77 says it isn't, and phase 4 builds on those defaults.
- Test the iPhone keypad.

**1. Line, height and runs: HUB 022 (L)**

Today:
- The tool is labelled "Wall" (measure/tools.js:33, 51).
- Height is read-only text (MeasureScreen.jsx:1055), copied from the last wall (tools.js:126-134), and every leg of a trace gets that same height (MeasureScreen.jsx:367-373).
- The draft keeps points only and is keyed by material (tools.js:72-73, 83-87). Choosing another material finishes the run (MeasureScreen.jsx:788).
- Taps in a straight line merge into one wall (geometry.js:110-124).
- Finish opens the first elevation (MeasureScreen.jsx:382).
- The server keeps only the wall fields it knows (takeoffService.mjs:218-234), but the test backend keeps everything (ui-review/fixtures/takeoff.js:205-207).
- Walls saved together share one save time (takeoffService.mjs:137; migration 206:185), so they reload in no set order.
- The list shows every wall in the takeoff (WallsScreen.jsx:1173), with Use/Remove on each row (1361-1366). The wall page already has both (1835-1844).
- Select shows height as text only (MeasureScreen.jsx:1162).
- A drag moves one wall only (MeasureScreen.jsx:538-552).

Adds:
- "Line" on cladding-type materials (timber keeps "Wall").
- A Wall height box beside the material name, starting at the last height. The material stays one per run: tapping it opens the existing list.
- The height in force at each tap is stored, and a straight wall splits where the height changes.
- runId + seq on each wall, with no migration (geometry is jsonb, takeoffService.mjs:513-514). Older walls show on their own.
- Finish stays on the plan and shows the run card.
- The run list shows this material's walls, with others folded away.
- A Height box in Select that changes one wall only.
- A shared corner drags both walls, with one Undo.

Files: measure/tools.js, measure/geometry.js, MeasureScreen.jsx, WallsScreen.jsx, takeoffService.mjs, ui-review/fixtures/takeoff.js, takeoff-api.test.mjs (real-server save and reload), tc-measure.spec.js (585-613), tc-walls.spec.js, SOP 20-09 (line 90), SOP 20-08 (line 104).

iPhone: checks 1–6.

**2. + Window / + Door on the plan (M)**

Today:
- Openings are made only on the elevation, by numbers or by a tap (WallsScreen.jsx:1258-1262, 1530-1576).
- A door's sill is set to 0 there (1535).
- The server refuses openings that carry plan points and needs the parent wall (takeoffService.mjs:507-510).
- Openings aren't drawn on the plan (MeasureScreen.jsx:143).
- The maths for a point along a wall exists (calibration.js:104-122, geometry.js:46-52).
- The engine already clips an opening that runs past the wall end, with a warning (wall.js:310-356).
- Openings are deducted for every material on the wall (dispatch.js:602-605).

Adds:
- + Window and + Door in the Line panel and on the run card.
- The boxes remember the last window and the last door.
- Two taps snap to the nearest traced wall and give the offset and width in real mm, to the nearest 10.
- Openings are saved exactly like elevation openings (W1, D1), so the server doesn't change.
- They're drawn on the plan. Undo removes one, and changes are made on the wall's elevation.

Files: MeasureScreen.jsx, measure/geometry.js, measure/Overlays.jsx, measure/tools.js, WallsScreen.jsx (shared W/D labels), tc-measure.spec.js.

iPhone: check 7.

**3. Rectangle, Area and pages: HUB 023 (M)**

Today:
- The only way to change page is Plan setup, which also resets the main plan page and goes back to the overview (PlanSetup.jsx:98, TakeoffApp.jsx:646-648).
- Elevation outlines are accepted and laid out with real sheets, but nothing creates one (takeoffService.mjs:506, dispatch.js:92-96, 349).
- An "area" measurement can't feed cladding (dispatch.js:40-52).
- Outlines are drawn open (Overlays.jsx:84-100) and picked by distance to that open line (MeasureScreen.jsx:636-645). Select says "mm along the plan" (1161).
- The area maths and the scale prompt exist (calibration.js:124-131, MeasureScreen.jsx:249-251, 936). Saving a scale returns to measuring (TakeoffApp.jsx:668).
- Openings are measured from the outline's lowest and leftmost corner, so they shift if that corner moves (dispatch.js:94-96).

Adds:
- A Page chip that opens the existing page picker. Tapping a page goes straight back to measuring and leaves the main plan page alone.
- Rectangle (two corners make four square corners) and Area (corners, then Finish), on every page. Both are saved as outline walls on the active cladding.
- A live m² readout.
- Outlines drawn closed, with the closing edge tappable.
- Corner drags on either shape.
- + Window on an outline: tap two opposite corners.
- Openings stay put when a corner moves.

Files: measure/tools.js, measure/geometry.js, MeasureScreen.jsx, measure/Overlays.jsx, TakeoffApp.jsx, PlanSetup.jsx, tc-measure.spec.js, takeoff-api.test.mjs, SOP 20-02.

iPhone: checks 8–9.

**4. Automatic battens and extras (L)**

Today:
- Each batten layer runs one direction only (supports.js:612-631).
- Battens get no shared offcuts and no joint stations unless they're uprights (dispatch.js:361-367).
- Spacing is never defaulted (supports.js:681).
- Only horizontal joins are stored (cladding.js:698-709).
- Tape can only go round openings or along seams (accessories.js:427-446).
- There's no H-flashing product picker (FamilySetup.jsx:1404-1435), so H-flashing is left off the order (dispatch.js:565-569).
- Spares are worked out per material (dispatch.js:539-558).
- Joins are grouped by wall (dispatch.js:651-659).
- Battens are attached one wall at a time (WallsScreen.jsx:1362-1364).
- Company defaults cover cladding, AAC and foam, but not timber cladding (companyDefaults.js:18).
- The catalogue has only two battens (seed.js:413-450).

Adds:
- (a) Engine: vertical joins, two Axon batten layers, one-way battens for Linea, Stria and timber, shared offcuts, tape, H-flashing by the metre, and "not counted" stud fixings.
- (b) Follower "Battens" and "Extras" materials. They pick up the cladding's walls in the same save and keep their own spares.
- (c) Nails, only if question 3 is yes.
- (d) Sloped top battens, built with phase 3.
- No migration: new default fields fall back to built-in values.

Files: cladding.js, wall.js, supports.js, accessories.js, dispatch.js, companyDefaults.js, FamilySetup.jsx, WallsScreen.jsx, MeasureScreen.jsx, TakeoffApp.jsx, new takeoff-tc-autobattens.test.mjs, takeoff-tc-integration.test.mjs (F08, QO-04, QO-11), ui-review/fixtures/takeoff.js:103.

iPhone: check 10.

**5. Review at the end (M)**

Today:
- ‹ › steps through the parts of one wall (WallsScreen.jsx:947-949).
- The only way out of a wall is ‹ Walls (1302).
- Chips sit on every row (1351-1356).
- A footer slot exists (ui.jsx:13, 28).
- Each wall's quantities already add up to the order (WallsScreen.jsx:279-365).

Adds:
- Wall-to-wall ‹ › at the bottom of each wall, in run order.
- "Review order ›" on the last wall.
- Chips and notes folded under "More".

Files: WallsScreen.jsx, MeasureScreen.jsx (Review walls), TakeoffApp.jsx, tc-walls.spec.js.

iPhone: checks 11–12.

## Acceptance checks
1. Line shows Axon 400 smooth and Wall height together, starting at the last height used.
2. HUB 022: set 3,000 and trace four connected walls. Finish leaves you on the plan with one run of four walls at 3,000, with no elevation forms or material questions.
3. Set 2,700, tap the start and two corners, then switch to 3,600 and tap two more corners. Walls 1–2 are 2,700 and walls 3–4 are 3,600. This also works partway along a straight wall.
4. Select one wall and set it to 3,600. Only that wall's size, sheets, battens and H-flashing change, and the other walls' layouts don't move. (A shared offcut may be counted on a different wall; the order total is correct.)
5. Reload. The run, its order, heights and edits are kept. Older walls still open, and Wall by numbers still works.
6. Drag a corner shared by two walls. Both follow, and one Undo puts it back.
7. Draw 3 windows and a door. Each wall's elevation shows them in the right place with the right width, height and sill, with the sheets cut round them. The door sits on the floor.
8. HUB 023: on an unscaled elevation, Rectangle asks for a scale first, then you're back measuring. A 4 × 3 m Rectangle reads 12 m², and its sheets use real sheet sizes.
9. A five-corner Area keeps all five corners and shows the right area. Dragging a corner of either shape updates the sheets straight away. Reload keeps the shape and the material.
10. Set up Axon from the defaults. Supports shows uprights at the joins and every 600, plus bottom and top battens. The schedule lists battens, tape and H-flashing (and nails, if yes) with nothing typed.
11. Review walls: ‹ › steps wall to wall in run order, and the totals match the order.
12. Flashings, scaling, Centre, autosave and Count work as before. The whole job takes about 35 taps.

## Risks
- **Shared offcuts:** making one wall taller can move a sheet onto another wall's count. That wall's layout doesn't move, and the order uses the total.
- **Wrong wall:** a window tapped near an inside corner could land on the wall next to it. It's clipped with a warning; Undo, or fix it on that wall's elevation.
- **Silent loss:** the server drops new fields that the test backend keeps, so phase 1 includes a test against the real server.
- **Keypad:** if the iPhone won't bring the keypad up on its own, each box needs one more tap.
- **Open orders:** batten quantities will change, and those order lines get flagged.
- **Double counting:** a wall drawn on both the plan and an elevation counts twice. Its row already says "From plan" or "Traced elevation" (WallsScreen.jsx:1352).
- **Two branches:** the 5am run keeps committing other fixes to takeoff-r03, so each phase is rebased onto it before you merge.

## Questions for you
1. **How do you want to set the height and sill of a window drawn on the plan?** Recommend: Height and Sill boxes that remember the last window, with doors asking for Height only. On a scaled elevation, tap two opposite corners instead.
2. **For Linea, Stria and timber, which direction gets 450 and which gets 600, and which timber batten do you buy?** Recommend: boards laid flat go on upright battens at 600, and boards standing up go on horizontal battens at 450. For timber, 70×35 H3 pine in your usual length (for example 5.4 m).
3. **Should the 150 mm Axon fixings be counted as nails, and do windows and doors get battens round them?** Recommend yes to both. ND nails round the edges of each piece of sheet, including cuts, with one nail per corner and 300 centres on the middle uprights. Battens at the sides and head, plus the sill on windows.
4. **Foam tape and H-flashing: where do they go, which products, and how are they bought?** Recommend: tape behind the vertical sheet joins only, full height. H-flashing by the metre, rounded up once per job, with no lap. Which products should I use for each?

## Changes from the draft
- **Tap count is now about 35, not 33.**
  - From the cladding setup, reaching the plan takes 4 taps today: setup "Walls" → "Trace on plan" (TakeoffApp.jsx:578, WallsScreen.jsx:1328).
  - The door needs Done, the same as the window.
- **Material can't change partway through a run.** Sam and HUB 022 only ask for the height to change mid-run. Tapping the material opens the existing list and finishes the run, as it does now (MeasureScreen.jsx:788). This removes the per-tap material and the change to the draft key.
- **"Line" applies to cladding materials only.** Timber keeps "Wall".
- **Dropped because nobody asked for them:**
  - selecting a shape by tapping inside it
  - opening a wall with a second tap
  - selecting and dragging windows on the plan
  - the N5/N6 warning
- **Page switching reuses the Plan setup page picker** and returns to Measure without changing the main page. There are no page types, and Rectangle and Area show on every page.
- **Added: openings stay put when an outline corner moves** (dispatch.js:94-96).
- **Prep now branches from origin/main.** The local main is stale at 5c9014e.
- **Nails are a separate step (4c), built only if question 3 is yes.**
  - Battens round openings are now part of question 3, and the timber batten is part of question 2.
  - The "Still guesses" list is gone.
- **Timber cladding has no company default** (companyDefaults.js:18), so its followers use built-in values.
- **Acceptance checks 3 and 4 are reworded** (exact heights, battens, the shared-offcut caveat).
- **File lists:** SOP 20-02, SOP 20-08 and PlanSetup.jsx added, and SOP law noted for every phase.
- **New risk:** the 5am run committing to takeoff-r03 in parallel.
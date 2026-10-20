<!-- Planning only (21 October 2026): nothing here is built. Written for Sam from a read of the code (three readers, three designs, one judge). Awaiting Sam's OK and answers to the six decisions. -->

# Wall-by-wall takeoff: the plan

## What changes for you
- A big button at the bottom of every wall shows the next step: "Next: Wall 3 ›", "+ Next wall" or "Walls done ✓". No more trips back to the wall list.
- "+ Window" and "+ Door" sit down there too. No scrolling, and a door never asks for a sill.
- A new wall starts with the last wall's height and shape. You type the length only.
- Trace the house once, type the height once, then walk round in the order you tapped.
- The top card on the overview says what's next: "Add cladding", "Carry on: Wall 3" or "Review order".
- After the last wall, one screen shows every wall, anything missing and the sheet total. The total matches the order.
- Status chips and compliance notes fold away under "More". The sheet numbers don't change.

## The new flow, step by step
Job: 4 walls 2,700 high, Axon 400 smooth, 3 windows and a door. Every touch counts, including tapping into a box and Done. Typing the digits doesn't count. Today's taps are in brackets.

1. Plans → Takeoffs → Timber and cladding. 3 (3).
2. Card "Add cladding" → Axon 400 smooth (top of the list) → "Next: walls ›". 3 (3, plus a scroll).
3. "Wall by numbers": the keypad is up on Length. Type, tap Height, type, "Add Wall 1 ›". 3 (5).
4. "+ Window": the keypad is on Width. Tap Height, Sill, From wall start, Done. 5 (7, after a scroll).
5. "+ Next wall": Wall 2 already says 2,700. Type the length, "Add Wall 2 ›". 2 (6, through the wall list).
6. Wall 2 window. 5 (7).
7. "+ Next wall" and length 2 (6), window 5 (7), "+ Door" with Width, Height, From wall start, Done 4 (7).
8. "+ Next wall", Wall 4's length. 2 (6).
9. "Walls done ✓": all walls ticked, "Wall 4 · no windows or doors", and the Axon total. 1.
10. "Review order ›". 1 (steps 9–10 today: 3).

**By numbers: about 36 taps, 20 typed numbers, no scrolling. Today: about 60 taps, 23 numbers, 5 scrolls.**

**Traced:** after step 2, tap "Trace on plan", the start, 3 corners, then double-tap the start (7). The plan stays open with a "4 walls traced" card: walls numbered 1–4, one Height box, Undo, and "Start Wall 1 ›" (1). Then do the same windows and door, moving on with "Next: Wall 2 ›" (1 tap, nothing to type), then steps 9–10. **About 38 taps and 16 numbers. Today: about 58 and 19.**

If the iPhone won't bring up the keypad by itself, add a tap for each wall or window: about 44 by numbers.

## What gets hidden or removed
- Under "More about this wall": the setout note, sheet and offcut explanations, "Plan each wall on its own", Gross/Openings/Net, Sheet setout, status chips, the materials list, rename and Remove wall.
- Anything that stops the order stays on top, with its one-tap fix.
- The Supports and Accessories tabs only show when those materials are on the wall.
- Wall list: the status box and "not verified" note go under "Details". The tick and red Remove on each row move into the wall.
- New window or door: no Type or Label chips, no edge lengths and no flashing note.
- "Measure" is no longer the big blue button in Timber and cladding. The Worker button just says "Takeoffs".
- Not touched: the calculation, plan scaling, the product list, sheet-by-sheet ‹ Previous / Next ›, Centre, autosave, and every flashing tool.

## How we'd build it
First: migration 211 pasted and this round deployed (HUB_REVIEW_LOG.md:27); a new branch; the 5am task that commits to takeoff-r03 paused (HUB_REVIEW_LOG.md:61); a keypad test on your iPhone. Each phase updates SOP 20-09, SOP_CHANGELOG.md and the tests that quote old labels.

**1. Walk the walls (L).** Bottom bar (‹, Next wall, Walls done, + Window, + Door), hidden while typing; compact wall page with "More"; Undo opens the wall it changed; start mark on the drawing. Today: the only exit is ‹ Walls (WallsScreen.jsx:1302); the only Previous/Next steps through sheets (947-949); Add opening is low down (1814); the wall box jumps once drawn (1600); the footer slot exists (ui.jsx:13, 28). Files: WallsScreen.jsx, WallElevation.jsx, measure/tools.js, tc-walls.spec.js. iPhone: walk 4 walls; gable Centre still works.

**2. Quick walls and openings (M).** Height on the new-wall sheet, carried over; keypad opens in the same tap; door without sill; half-done windows kept; "Same as W1". Today: new walls save shape, length and name only (WallsScreen.jsx:1224-1226); height carries over only when traced (measure/tools.js:126-134); Width waits 350 ms (WallsScreen.jsx:733); door sill is 0 only if Door is picked first (1535); closing a half-done opening drops it (1543). Files: WallsScreen.jsx, measure/tools.js, ui.jsx, tc-walls.spec.js. iPhone: Wall 2 shows 2,700; keypad comes up on + Window.

**3. Tracing hand-off (M).** "Walls traced" card with one height and Undo; tap order kept after reload (a "seq" on each wall, one server line, no migration); choosing a plan page returns to the walls. Today: the trace message is lost as the screen jumps (MeasureScreen.jsx:381-382); walls load by save time (takeoffService.mjs:137); wall fields not on its list are dropped (220-234); choosing a page returns to the overview (TakeoffApp.jsx:646-647). Files: MeasureScreen.jsx, TakeoffApp.jsx, measure/tools.js, takeoffService.mjs, ui-review/fixtures/takeoff.js, tc-measure.spec.js, tc-journeys-sandbox.spec.js. iPhone: trace, reload, order unchanged.

**4. Start and finish (M).** Next-step card; "Next: walls ›" at the bottom of setup; products listed first; walls summary with the total and Review order; "Carry on" kept on the phone; new button text. Today: Measure is the blue button (TakeoffApp.jsx:806); Walls is top-right (578); Company products sits above the list (580-588); the total is only on the overview (829); your place is kept only across a reload (246, 255); the button says flashings (PlansSheet.jsx:106). Files: TakeoffApp.jsx, WallsScreen.jsx, PlansSheet.jsx, tc-hub-review.spec.js, takeoff.spec.js. iPhone: do the whole job and count the taps.

**5. Battens follow the walls (S, if yes).** New walls also go on batten and accessory materials, never on a second cladding. Today they link to the current material only (WallsScreen.jsx:1227; MeasureScreen.jsx:375). Files: WallsScreen.jsx, MeasureScreen.jsx, measure/tools.js. iPhone: battens show on all 4 walls.

Risk sources: Centre relies on saves building on the latest wall (WallsScreen.jsx:1221-1235); the journey test leaves by the first header button (tc-journeys-sandbox.spec.js:126-127); the conflict choice is only on the overview (TakeoffApp.jsx:762).

## Acceptance checks
1. Takeoffs → Timber and cladding: the top card names the next step.
2. Axon 400 smooth: one defaults line, and "Next: walls ›" within thumb reach.
3. Wall by numbers: the keypad is up on Length. After Add Wall 1, + Window and + Door show without scrolling.
4. + Window: the keypad is on Width. Four numbers and Done draw the window. Done after two numbers keeps the sheet open.
5. + Next wall: 2,700 is already in. + Door: no sill asked, and it sits on the base.
6. ‹ goes back a wall. Change Wall 2, go to Wall 4, tap Undo: it takes you back to Wall 2.
7. Sheet-by-sheet ‹ › and gable Centre work as before.
8. Lock the phone mid-number, unlock: the number is kept. Reload: you're on the same wall.
9. Walls done: missing items link to their wall, and the total matches the order.
10. Trace 4 walls: one height fills them all, and the order is the same after a reload.
11. Reopen the next day: the card says "Carry on: Wall 3" or "Review order".
12. Count the job: about 36 taps by numbers, 38 traced. Flashings unchanged.

## Risks
- **Keypad.** Opening the keypad in the same tap hasn't been tested on an iPhone. Worst case is about 8 extra taps.
- **Shared sheets.** Wall 4 can change Wall 1's count. A tick means "measured", and the summary uses the material total.
- **Fragile bits.** Next must save the box before moving, or Centre and Undo break.
- **Old labels.** About 35 tests, the real-server journey and the SOP quote today's buttons. ‹ Walls stays first in the header.
- **Two phones.** The wall page needs the "load latest / apply mine" buttons too.
- **Overbuild.** One bar, one card, one fold, one summary. Nothing is ever shown as better than the calculation says.

## Decisions for you
1. Your keep list says "Previous/Next wall", but there is no wall-to-wall button today. The only ‹ › steps through the sheets on one wall. Is that the one you meant? **Recommend:** keep it as is and add the wall buttons separately.
2. Should new walls start with the last wall's height and shape, and should walls traced together share one height? **Recommend:** yes, shown on screen and easy to change.
3. Fold the status chips and notes away on the wall screens? **Recommend:** yes. They stay on the schedule and the order.
4. Show a summary before the order? **Recommend:** yes. It catches a missed window.
5. Add a "Same as W1" button for repeat windows? **Recommend:** yes. It saves 3 numbers each time.
6. Should new walls go on battens and accessories automatically? **Recommend:** yes, but never on a second cladding. Do it in Phase 5, once the walk works on your phone.

## Scores
Scored 1–5, 5 best. Taps recounted using the same rule for each design.

| Design | Fewest taps | Next step obvious | Low risk | Small build | Fits code | Total | Taken |
|---|---|---|---|---|---|---|---|
| Wall walk | 4 | 5 | 4 | 3 | 5 | 21 | Spine |
| Walk the walls | 4 | 4 | 3 | 3 | 4 | 18 | Trace card, wall order, Carry on |
| One quick screen per wall | 5 | 4 | 2 | 2 | 2 | 15 | Products first, Same as W1 |
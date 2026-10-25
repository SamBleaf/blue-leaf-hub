# HUB 028 Walls: plan

Planned 24 October 2026, branch `takeoff-r03`. Built 25 October 2026 in six steps on `takeoff-r03` (commits 7fcc43a, 4d241a2, eb2edf5, f11bc21 and ed2387f, then step 6; the notes on what was built are under Build steps and the worked examples). Not deployed: it waits for Sam's "deploy" and an iPhone check. This plan merges three separate plans: the "simplest onsite" plan is the base, with parts taken from the "reuse" and "correct data" plans. The appendix scores all three.

Here is the decision in short. Walls is one new timber item. It uses the HUB 022 Line tool and gives one result made of three tagged parts: studs, plates and noggins. It reuses the existing stud, plate and noggin engine functions, each with new options that are off unless Walls turns them on. It needs no migration and no change to the server cleaners. Studs, Plates and Noggins stay exactly as they are, for exceptions.

## Sam's decisions (25 October 2026) — these override every [Default, needs Sam] below

1. **Wall height = stud length.** The height typed is the stud cut length. Double top plate only adds a top plate. Tag: [Sam].
2. **Corners: 2 studs, one per wall.** Nothing extra at T-junctions. No corner finder. Tag: [Sam].
3. **Windows: leave them out.** Centre studs inside a window come out, no short studs under the sill or above the head,
   and no noggins in a bay that overlaps a door or window. Lintels, jacks and trimmers are not counted; Walls says so in
   one line. Tag: [Sam].
4. **Longest length 6.0 m for plates and noggins**, by default on every new Walls item (a saved company product's own
   longest length still wins). With it:
   - **Noggins** share lengths across every wall of the Walls item from the start (6,000 max), so the "each noggin buys
     its own 1,200" note never shows on a default item.
   - **Plates longer than 6,000 are split, joined over a stud.** NEW rule (replaces "plates are never joined" and the
     block for a plate over its longest length). For each plate piece (each layer: bottom pieces after door cuts, top,
     second top), cut it at the furthest stud centre that leaves the piece no longer than the longest length, and repeat
     until every piece fits. Each piece is then bought as one stock length (one length per piece, no plate offcut
     sharing). If no stud centre falls inside the allowed span, block that wall with a plain note naming it. Top and
     bottom joins are not staggered (not stated). Example: a 9,000 wall at 600 centres gives a 6,000 + 3,000 top plate,
     joined over the stud at 6,000.
   - **1 noggin row at 2,700 or under, 2 rows over 2,700.** Both are Sam's rules now: the "(1 row, to confirm)" wording
     and the "default" row source go; rows read "(1 row)" / "(2 rows)" / "(1–2 rows)".
5. **Question 5 (Walls as a Purpose chip):** not asked; the default stands (no chip; Add walls first in the Timber group
   and in Measure with…).

Every other [Default, needs Sam] rule below stays as written. In the build, re-tag the four answered ones as [Sam], and
update the worked examples, the screen-test texts ("to confirm" drops) and the SOP lines to match.

## Sam's decisions, round 3 (25 October 2026) — long plates are LVL; overrides rounds 1 and 2 where they differ

Sam: "lvl 90x45 plates come up 10 11m long and we use them when long plates are required". Then, in chat: the longest
90 × 45 LVL is **11.0 m**, and a wall longer than 6.0 m gets **one LVL length** for its plates.

1. **Pine plates up to the pine longest length (6,000 by default; a saved plate product's own longest length wins).**
2. **Any plate piece longer than that is ordered as ONE 90 × 45 LVL length** (bottom, top and second top alike, per
   wall per layer), on its own order line and cut list, e.g. "Plates 90 × 45 LVL". It is not joined.
3. **Only a plate longer than the LVL's longest length (11,000) is joined over a stud** (the step 1 helper, splitting
   against 11,000); each resulting piece then follows rules 1-2 (over 6,000 = LVL, otherwise pine). [Default for the
   pieces after a join, needs Sam; walls over 11 m are rare.]
4. **LVL stock:** bought in 300 mm steps like all timber, with 11,000 itself allowed as the longest (a stock LIST:
   6,300, 6,600 … 10,800, 11,000 — the grid alone can't reach 11,000 from 1,200 in 300 steps). [Default, needs Sam.]
5. **The LVL part** is a fourth Walls part, "Long plates", default 90 × 45, grade "LVL", longest 11,000, with the same
   product rules as the other parts (a saved company product can fill it; no copying between parts). Its needs (e.g.
   treatment) only show when at least one plate is long enough to use it. It sits in the closed "Studs, plates,
   noggins" fold, after Plates, labelled "Long plates (over 6.0 m)".
6. **Walls line wording is unchanged** (bottom plate / top plate totals include the LVL metres). Each wall page with an
   LVL plate says "Plates: 90 × 45 LVL (over 6.0 m)". The order and cut lists show LVL separately.
7. Example: a 9,000 wall at 2,700 → bottom 1 × 9,000 LVL, top 1 × 9,000 LVL (9,000 is on the 300 grid). A 12,000 wall
   at 600 centres → split over the stud at 10,800: 10,800 LVL + 1,200 pine per plate layer.

**Where it goes in the build:** LVL part, defaults and stock list in step 2; the per-piece pine/LVL choice, the join only
past 11,000, separate lines and cut lists in step 3; the fold row and wall-page line in steps 4-5; SOP lines in step 6
("plates over 6.0 m come as one 90 × 45 LVL length, up to 11.0 m").

## Sam's decisions, round 2 (25 October 2026, after checking Bestimator's real Gibson order) — these override round 1 and everything below

Source: Bestimator's V2E supplier cutting list for the Gibson house (eval/fixtures/gibson-v2e-takeoff-oracle.json in the
Bestimator repo, read-only). Sam's answers in chat:

1. **Bottom plate: buy it full length** (replaces "doors cut the bottom plate" for ORDERING). The bottom plate is ordered
   the full wall length, like the top plate; the crew cuts the doorway out after the frame is stood. So computePlates gets
   NO door gaps on Walls; bottom and top plate pieces are identical per wall. A plate over the longest length is still
   split over a stud (round 1, rule 4). The SOP says "cut the doorway out of the bottom plate after standing the frame".
2. **2 full-length studs each side of every opening** (windows, doors and "other"), not 1. Each is a full stud from the
   stud product at the wall's cut length, labelled "Stud beside D1" (never "king" or "jamb"). Placement: the first stud's
   face on the opening edge (centre at edge ∓ w/2), the second against it (centre at edge ∓ 3w/2), w = stud thickness
   along the wall. The merge rule (centres closer than one stud thickness are one stud; end > side > centre) still
   applies. Lintels, jacks, trimmers and short studs under/over openings are still NOT counted (round 1 rule 3).
3. **All timber is bought in 300 mm steps** (Sam: "Yes, 300 mm steps"; he was told it changes timber buying in
   general). Timber grid becomes minimum 1,200, increment 300 (1,200, 1,500, 1,800 … ) everywhere the owner timber grid
   is defined: shared/takeoff/engine/families.js TIMBER_GRID, timber.js TIMBER_STOCK_GRID, the inline timber grid in
   dispatch.js (check what it serves first), and products/seed.js timberOrderingPolicy (add source OWNER-2026-10-25).
   Applies to Walls AND the existing Studs/Plates/Noggins/other timber items. Do NOT change flashings, cladding sheets,
   aluminium, or the cladding followers (battens/tape/H-flashing) unless they deliberately use the owner timber grid —
   if one does, say so and leave it unchanged pending Sam. Existing timber test expectations that encode 600 mm steps
   are legitimately updated (list every one). Example: a 2,700 stud now buys 2,700; 4,000 buys 4,200; 6,000 buys 6,000.
4. **Wet areas:** one Stud centres setting per Walls item stays. SOP 20-08 says: trace wet-area walls as their own
   Walls item at 450.
5. Also add to SOP 20-08 Section 7 the two tracing reminders: trace every nib and return (especially wet-area nibs), and
   don't trace a shared wall twice.

**Expected figures for the 2,700 worked example under round 2** (orchestrator's hand check; the numbers reviewer must
confirm with the real engine): studs Wall 1 = 9 grid + 4 beside D1 = 13; Wall 2 = 4 grid (1,200 and 3,000 merge into the
first studs beside W1) + 4 beside W1 = 8; run 21 studs, ordered 21 × 2,700. Plates: bottom = top = 6,000 + 4,000 fitted,
ordered 2 × 6,000 + 2 × 4,200 (bottom 10.00 m, top 10.00 m). Noggins (1 row): Wall 1 = 9 (7 × 555, 287.5, 467.5 = 4,640
mm), Wall 2 = 4 (555, 487.5, 487.5, 355 = 1,885 mm); 13 noggins, 6,525 mm, stock from the allocator at 6,000 max on the
300 grid. Touching studs beside an opening leave no clear bay, so no noggin and no block. Line: "Walls: 21 studs at
2,700 · bottom plate 10.00 m · top plate 10.00 m · 13 noggins (1 row)". Recompute the 3,000 + Double top plate example
the same way.

**Confirmed with the real engine in build step 3** (computeWorkspace, scripts/tests/takeoff-tc-hub028.test.mjs, plates and
noggins at the 6,000 default, studs with no longest length):
- At 2,700, Double top plate off: exactly the figures above. Studs 21 × 2,700. Plates 2 × 6,000 + 2 × 4,200. The 13
  noggins (6,525 mm) are bought as 4,800 + 1,800 = 6,600, the least possible in 300 mm steps.
- At 3,000, Double top plate on: the same 21 stations, ordered 21 × 3,000. Plates 3 × 6,000 + 3 × 4,200 (bottom 10.00 m,
  top 2 × 10.00 m). 26 noggins (2 rows), 13,050 mm, bought as 4,800 + 4,500 + 3,900 = 13,200, the least possible.
- With no noggin longest length: 13 × 1,200 at 2,700 and 26 × 1,200 at 3,000, with one plain note.
- Round 3: a 9,000 wall buys 1 × 9,000 LVL for its bottom plate and 1 × 9,000 LVL for its top plate, on their own
  "Plates 90 × 45 LVL" line. A 12,000 wall at 600 centres joins over the stud at 10,800: 10,800 LVL + 1,200 pine per layer.

The Walls lines quoted in the worked examples ("Walls: 21 studs at 2,700 · …") were written by hand from the line
rules. Build step 4 built wallFramingText and confirmed every one with the real engine (node tests "Walls line …" in
`takeoff-tc-hub028.test.mjs`; the plan screens in `e2e/ui-review/tc-hub028.spec.js`).

**Where it goes in the build:** the 300 mm grid in step 2 (constants + tests) or the first step that touches stock;
no door gaps and 2 studs per side in step 3 (extend the step 1 options as needed: e.g. a studsPerSide count, default 1,
so Studs is unchanged); SOP lines in step 6. Update the plan's worked examples, tests and SOP figures to round 2.

## What Sam asked

From the review doc, HUB 028 "Trace a wall once and calculate its framing together":

> Required behaviour: add Walls as the normal wall-framing workflow and use the saved timber choices from HUB027 as its component defaults. Opening Walls goes directly to the selected plan with Wall height, Stud centres and the line tool visible. Successive taps trace connected walls; Finish saves the run and calculates its studs, plates and noggins together. Always include one bottom and one top plate, with a visible Double top plate toggle. Apply the owner-stated rule that a wall over 2,700 mm has two noggin rows. Keep component choices editable for exceptions without requiring three separate takeoffs.

> Boundary: this is an ordering calculation, not structural design. Do not infer kings, jacks, trimmers, lintels, tie-downs, structural adequacy or an unstated noggin rule from the wall line. Openings and special framing must use explicit details. Joists and rafters need a different workflow; this recording does not define it.

> Acceptance: choose Walls with saved component defaults, set 600 mm centres and a wall height, and trace a connected run. Finish creates one wall-framing result containing its stud count and plate/noggin quantities; it does not create three separate takeoffs. A wall above 2,700 mm shows two noggin rows. Double top plate changes only the top-plate quantity. Reload preserves geometry, settings and quantities. The plan is reached without completing the current long member form.

Sam, 24 October 2026:

> "studs at centres plus ends and corners, doors cut the bottom plate, and studs at sides of openings"

Read as three rules:
- Studs go at the stud centres along each wall, plus a stud at each wall end and at each corner.
- Doors cut the bottom plate. The top plate runs continuous.
- There is a stud at each side of every opening, windows and doors alike.

How it works today: Studs, Plates and Noggins are three separate timber items, each with its own long setup. Each one is measured with the old Wall tool (`src/components/takeoff/measure/tools.js:53-55`), which has no Wall height box and no + Window / + Door. Nothing links the three. Noggins even use their own centres and their own width as the stud thickness (`shared/takeoff/engine/dispatch.js:249-258`).

## The flow on the phone

| # | Step | Taps |
|---|------|------|
| 1 | Takeoff overview, Timber group: tap **Add walls**. This makes one Walls item from the defaults and opens the selected plan with Line already chosen. The Line panel shows Wall height, Stud centres (600) and Double top plate (off). No Timber card comes first. If no plan is chosen yet, it opens the Walls list with Trace on plan, as Studs does today (`src/components/takeoff/TakeoffApp.jsx:550-552`). | 1 |
| 2 | Tap **Wall height** and type 2700. The first time it is empty. On a later run it starts at this Walls item's own last height, so skip the tap if that is right. A cladding height is never carried over. | 1 |
| 3 | Leave **Stud centres** at 600 and **Double top plate** off. | 0 |
| 4 | Tap the start of the run. | 1 |
| 5 | Tap the corner. | 1 |
| 6 | Double-tap the end, or tap it and press Finish. Both walls save in one go with one Undo (`src/components/takeoff/MeasureScreen.jsx:522-559`, unchanged). | 2 |
| | **L run traced, no openings** | **6** |
| 7 | **+ Door**. Type Height 2040 (only the first door in a takeoff needs this). Tap both door edges on Wall 1. | 4 |
| 8 | **+ Window**. Type Height 1200 and Sill 900 (only the first window needs these). Tap both window edges on Wall 2. | 5 |
| 9 | Back to the overview. | 1 |
| | **Total: L run with a door and a window** | **16** |

**Compared like for like with today's count** (one straight wall, no openings, ending back on the overview):
- Walls: Add walls, Wall height, start, double-tap the end, Back. That is 6 taps and 1 typed number.
- Today: 31 taps and 2 typed numbers across three takeoffs (Studs 12, Plates 9, Noggins 10).
- Today a timber wall can't take + Window / + Door on the plan at all (`tools.js:70`).

**Getting to order-ready:**
- With saved company products for studs, plates and noggins (each with grade, treatment and longest length): no extra taps.
- Without them: about 8 taps and 5 typed values, once per Walls item (Details, open the fold, Treatment × 3, Grade on plates and noggins, Close).
- Today it is about 8 taps and 8 typed values across three cards.

**What the Line panel shows for a Walls item** (other materials are unchanged):

```
Walls ›                         Wall height [2,700]
Stud centres [600]     Double top plate [ off ]
Walls: 21 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 13 noggins (1 row)
                                                              Details: 3 to fix ›
```

- Stud centres and Double top plate share one row and apply to every wall in the item. Each is one change with one Undo, through the existing `setRule` (`MeasureScreen.jsx:1005-1009`).
- The Walls line is hidden while a run is being traced, because it only changes after Finish. That keeps Finish in view in the 42vh phone sheet (`MeasureScreen.jsx:1473`). Build step 4 also hides the Stud centres / Double top plate row and Details › while tracing (they only change the line), so Finish stays in view even with the "That's the last point" note and an empty Wall height.
- A wall the calculation blocks (sloped or outline, no Wall height, overlapping openings) adds nothing to the totals, so the line names it: "Walls: 8 studs at 2,700 · … · 7 noggins (1 row) · Wall 1 not counted" ("Walls: Wall 1 not counted" when no wall is worked out). The reason ("Wall 1: Openings W1 and W2 overlap …") sits straight under the line, in view (build step 4).
- The Quantity / Installation / Procurement fold under the panel reads "Status" for a Walls item, so "Details" means only the Walls card (build step 4).
- **Details ›** shows how many parts still need something, for example "Details: 3 to fix ›", and plain "Details ›" when nothing is missing. The needs themselves and the "Lintels, jacks and trimmers … aren't counted" note show on the Walls card and the wall pages, not on the panel.
- **Wall height** for a Walls item starts at the last height of that item's own walls, and is empty the first time. Switching to a Walls item on the plan resets the box the same way. Cladding keeps today's HUB 022 start (`tools.js:158-166`). [Open, needs Sam] That start still counts a Walls item's walls, so a cladding traced after Walls starts at the stud cut length (e.g. 2,700, not the cladded 2,745). The plan keeps HUB 022 as written until Sam says otherwise; the mirror rule would be a cladding ignoring walls that are only on Walls items.
- The run card, Undo, + Window / + Door and Review walls are the HUB 022 ones, unchanged.
- **Details ›** opens the short Walls card:
  - At the top: the needs, naming the part (for example "Plates: enter the treatment"), and the lintels note.
  - Then Name, Stud centres, Double top plate and the Walls line.
  - Then a closed fold called "Studs, plates, noggins".
- Inside the fold, each part gets the HUB 027 Size and grade list (`src/components/takeoff/FamilySetup.jsx:1021-1058`), Section, Grade, Treatment and Longest length.
- The card has no Purpose chips, offsets, plies or spares.
- Each wall page leads with its own line, for example "Wall 2: 8 studs at 2,700 · bottom plate 4.00 m · top plate 4.00 m · 4 noggins (1 row)".
- **The overview row** for a Walls item shows Setup, Walls and More › Remove. It has no Add lengths and no Save as standard (`TakeoffApp.jsx:318`, `:337`):
  - The server would refuse an entered length on Walls (`server/lib/takeoff/takeoffService.mjs:580`).
  - The catalogue editor has no Walls purpose (`src/components/takeoff/CatalogueEditor.jsx:47`).
  - Extra members such as trimmers or lintels go on a separate Timber item, as the SOP will say.

## How the quantities are worked out

Tags: **[Sam]** = his 24 October answer. **[doc]** = the review doc or an existing documented engine rule. **[Default, needs Sam]** = what the build uses until Sam says otherwise. Each default is one constant behind a test.

### Studs
- **[Sam]** Studs go at the Stud centres along each wall. Set-out uses the existing T1 rule (`shared/takeoff/engine/timber.js:91-126`): 0, c, 2c and so on, plus the wall end. Before openings, count = ceil(L ÷ c) + 1. An exact multiple ends on one stud, and the last bay is shorter.
- **[Sam]** A stud at each wall end. Walls always includes both ends and never uses offsets.
- **[Default, needs Sam]** Set-out starts again at each wall's first traced point. For the first wall that is where tracing began. For later walls it is the corner. Openings are measured from the same point (`src/components/takeoff/measure/geometry.js:249-288`), so the two always agree.
- **[Default, needs Sam]** One Stud centres value covers the whole Walls item (`rules.centresMm`, default 600). Wall height stays per wall.
- **[Sam] Corners.** Each wall keeps its own end stud:
  - A corner gets 2 studs, one from each wall. A closed run is the same where the last wall meets the first.
  - No third corner stud is added.
  - Nothing is added at a T-junction, because separate runs are not linked anywhere: each wall records only its own runId and seq (`tools.js:171-177`). So the engine needs no corner finder. (Question 2.)
- **[Sam, round 2]** Two full-length studs each side of every opening: window, door and "other". Each is a full stud from the stud product, labelled "Wall 1 stud @ 932.5 (beside D1)", never a king.
- **[Sam, round 2]** The first stud's face sits on the opening edge. Its centre is at xLeft − w/2 and xRight + w/2, where w is the stud thickness along the wall (45 for 90 × 45). The second sits against it, at xLeft − 3w/2 and xRight + 3w/2. The traced opening width is then the clear width between the side studs. A side stud never sits outside the wall.
- **[Default, needs Sam]** Between two openings, a further stud goes in only where it sits wholly outside the neighbouring opening. So openings g apart get floor(g ÷ 45) side studs between them, at least 1 and at most 4 (90 apart: 2, touching). Two openings closer than half a stud thickness share one stud in the gap.
- **[doc]** Centre studs strictly inside an opening are removed, as today (`timber.js:716`), for windows and doors alike. Nothing is added under sills or above heads. (Question 3.)
- **[Sam, round 2]** Two studs whose centres are closer than one stud thickness are one stud. An end stud beats a side stud, a side stud beats a centre stud, and a first side stud beats a second. Studs that touch, or sit further apart, are all kept.
  - This also stops trace noise doubling a stud. I ran the current engine on a 6,010 mm wall: Studs gives 12 studs (two of them 10 mm apart) and Noggins blocks with no noggins (`timber.js:865`). Walls gives 11 studs and normal noggins.
- **[Sam]** Stud cut length = that wall's own Wall height. This is today's Studs "Stud cut" mode (`timber.js:555-562`). Walls never reads the item-wide `studHeightMm` (`dispatch.js:220`), so a height change mid-run is respected. Double top plate never changes the cut length. (Question 1.)
- **[doc]** An explicit framing detail on an opening still adds its own members (`timber.js:605-672`). The doc names this as the path for openings and special framing. Without a detail, the Walls card and that wall's page show one plain line naming every such opening: "Lintels, jacks and trimmers at D1, W1 aren't counted." That line doesn't block, and the quantity status stays "incomplete", as today (`dispatch.js:784`).
- **[Default, needs Sam]** On Walls, an opening's sill and head are clipped into the stud height with a note instead of blocking the wall. Today Studs throws (`timber.js:593`).
- **[doc]** Overlapping openings still block. That wall gets no quantities, and the block goes on every line of the Walls item (`dispatch.js:817`, `:826`). The other walls still show their quantities, but nothing in the item can be ordered until the openings are fixed.
- **[Default, needs Sam]** Walls frames straight, rectangular walls only. A rake, gable or outline wall, or one with no height, gets one blocking line that names the wall. Like any block, it holds the whole item's order. Rectangle and Area are not offered for Walls, because an outline has no single wall length.

### Plates
- **[doc]** Every wall gets one bottom plate and one top plate.
- **[doc]** Double top plate is one switch for the item (`rules.doubleTopPlate`, off to start). It shows on the Line panel and the Walls card. When on, it adds a second top plate the full length of every wall. This uses the existing layer `top-2`, already named "Second top plate" (`src/components/takeoff/WallsScreen.jsx:67`).
- **[Sam, round 2]** The bottom plate is bought the full wall length, like the top plate. No opening cuts it on the order: the crew cuts the doorway out after standing the frame. A full-width door still gives a full bottom plate and no error.
- **[Sam, as read]** The top plate and second top plate run continuous over every opening, as one piece per wall per layer.
- **[Sam, round 3]** A plate piece longer than the pine plates' longest length (6,000 by default; a saved plate product's own wins) is ONE 90 × 45 LVL length from the Long plates part, on its own order line and cut list. LVL is bought on the 300 mm grid from the first step over the pine plates' longest length (6,300 over the 6,000 default; 5,100 over a saved 4,800 plate product, final review), with 11,000 itself allowed.
- **[Sam, round 3]** Only a plate longer than the LVL's longest length (11,000) is joined over a stud: at the furthest stud centre that keeps the piece within 11,000. [Default, needs Sam] Each piece after a join is then LVL if over 6,000, else pine. If no stud centre fits, that wall is blocked with a plain note naming it.
- **[Default, needs Sam]** Plate length = traced wall length. There is no deduction where walls overlap at a corner. That over-orders slightly but never short.

### Noggins
- **[doc + Sam]** A wall over 2,700 mm has 2 rows, at any height. The test is the wall's own height minus 2,700 > 0, so exactly 2,700 is not over. These rows are recorded as an owner rule ("HUB 028: over 2,700 mm = 2 rows"), never as "entered" and never "inferred".
- **[Sam]** 1 row at 2,700 or under, also an owner rule ("HUB 028: 2,700 mm or under = 1 row"). The line says "(1 row)", "(2 rows)" or "(1–2 rows)".
- **[doc]** The existing T5 bay rule applies (`timber.js:833-890`). There is one noggin per row in each clear bay between neighbouring studs that are actually counted: centre, end and side studs.
  - Clear length = gap − half of each bordering stud.
  - Walls uses the stud's thickness (45), not the noggin's. Today's Noggins uses the noggin's own 35 (`dispatch.js:254-255`), which gives 565 instead of 555.
- **[Sam]** A bay that overlaps any opening gets no noggins in any row. That means none under sills and none above heads. This is the existing rule (`timber.js:866`).
- **[Default, needs Sam]** Two touching studs leave no clear bay. That bay gets no noggin and doesn't block; today it throws (`timber.js:865`). A short bay is still counted as worked out, however short. (Question 3.)

### Height changes mid-run
- **[doc, HUB 022]** Each wall uses its own `inputs.heightMm`, so stud length and noggin rows are worked out per wall.
- **[Default, needs Sam]** A straight wall split by a height change is two walls. Each keeps its own end stud, so the join has 2 studs.

### Stock lengths, joins and offcuts
- **[Sam, round 2]** Every timber piece is bought on the 1,200 then 300 mm grid, using the smallest length that fits (`shared/takeoff/engine/stock.js:36`). Pieces are never clamped or spliced (`shared/takeoff/engine/allocator.js:25`).
- **[doc]** Studs: one length per stud, so a 2,700 stud buys a 2,700 length.
- **[Sam]** Plates: one length per piece, never sharing offcuts. Pieces over 6,000 are LVL and only plates over 11,000 are joined (see Plates). A block holds every line of the Walls item, studs and noggins included (`dispatch.js:817`, `:826`).
- **[Default, needs Sam]** If a part's longest length isn't set (studs on a new Walls item, as Sam gave none), one note names the parts without one: "Studs: the longest length isn't set. Confirm it before ordering." It replaces the existing "for this product" note, which can't say which of the four parts it means.
- **[Sam]** Noggins share lengths across every wall of the Walls item, at the 6,000 default (a saved noggin product's own longest length wins). There is one allocator call per material (`dispatch.js:537`).
  - If the noggins' longest length is cleared, each noggin buys its own length, and Walls shows one plain note: "Noggins: each is cut from its own 1,200 length. Set the noggins' longest length under Details to share lengths across walls." (It names the length when every noggin buys the same one.)
  - There is no pooling between two Walls items.
- **[Default, needs Sam]** Kerf is 0. Walls has no kerf field.

### Spares
- **[Default, needs Sam]** No spares and no spares field, the same as all timber today (`shared/takeoff/engine/families.js:141`).

### Products and order lines
- **[Default, needs Sam]** Studs default to 90 × 45 MGP10, one of HUB 027's four stud rows (`families.js:28`).
- **[doc, HUB 027]** Plates default to 90 × 45 and noggins to 90 × 35, the only row for each (`families.js:29-30`).
- **[Default, needs Sam]** If exactly one active company timber product is saved for that purpose, Walls uses it instead. If there are two or more, Walls uses the built-in row and the products are one pick away.
  - The product fills section, grade, treatment, species, supplier and code, as HUB 027 does (`families.js:65-71`).
  - Walls also copies the product's longest length and "not stocked" lengths into the part. HUB 027's fill leaves stock out, but company timber products store it (`CatalogueEditor.jsx:368-369`), and the noggins can't share lengths without it.
  - HUB 027's `timberProductFill` is left alone. Walls uses a small `wallPartFill` on top of it, both for the defaults and for a pick inside the fold.
- **[doc, HUB 027]** Nothing is copied between parts. Treatment, LVL and supplier come only from a saved product or typed text.
- **[doc]** Each part needs a section, a grade (or species) and a treatment before ordering. The need names the part, for example "Plates: enter the treatment".
- **[Default, needs Sam]** Studs, plates, long plates and noggins stay on separate order lines and separate cut lists ("Studs cut list", "Plates cut list", "Long plates cut list", "Noggins cut list"), even when they are the same product. Lines read like "Studs 90 × 45 MGP10 H2" or "Plates 90 × 45 LVL", then the stock length.

### Walls on two items
- **[Default, needs Sam]** A wall that is also on a Studs, Plates or Noggins item, or on another Walls item (final review: e.g. a wet-area "Walls 2" at 450), gets one note on each Walls item that doesn't block: "Wall 2 is also on Studs 1, so its framing may be counted twice." / "Wall 2 is also on Walls 2, …".
  - This follows the existing check that leaves automatic battens off a wall that has hand-made ones (`dispatch.js:721-734`).
  - Both are still counted. Studs, Plates and Noggins themselves don't change.

### Never counted
- **[doc]** Walls never counts kings, jacks, trimmers, lintels, cripples, sill trimmers, tie-downs, bracing or blocking, and it never says a frame is structurally adequate. These come only from an explicit framing detail.

## Worked examples

Updated to Sam's rounds 2 and 3 and confirmed with the real engine in build step 3
(`scripts/tests/takeoff-tc-hub028.test.mjs`). The Walls lines under "What Sam sees" were confirmed with wallFramingText
in build step 4.

**Setup.**
- A Walls item with the built-in defaults: studs 90 × 45 MGP10 (w = 45 along the wall), plates 90 × 45, noggins 90 × 35, long plates 90 × 45 LVL.
- Stud centres 600 and Double top plate off. Longest lengths: plates and noggins 6,000 (Sam's default), long plates 11,000, studs not set. Spares 0.
- One Line run A → B → C:
  - Wall 1 (A to B) is 6,000. Wall 2 (B to C) is 4,000. Both are 2,700 high.
- D1 is an 820 wide × 2,040 high door on Wall 1, at xMm 1,000 (1,000 to 1,820).
- W1 is a 1,800 wide × 1,200 high window on Wall 2, at xMm 1,200 from the corner (1,200 to 3,000), with sill 900 and head 2,100.
  - Its edges fall on the 600 grid on purpose, to show the merge rule.

### At 2,700, Double top plate off

**Studs** (cut 2,700 = Wall height. Stock 2,700, on the 300 mm grid.)

Wall 1:
- Grid: 0, 600, 1,200 … 6,000. That is ceil(6,000 ÷ 600) + 1 = 11. It is an exact multiple, so it ends once.
- 1,200 and 1,800 are strictly inside D1 and come out, which leaves 9.
- Two studs each side of D1: 977.5 and 932.5 on the left, 1,842.5 and 1,887.5 on the right. None is within 45 of another stud, so nothing merges.
- **Wall 1 = 13 studs:** 0, 600, 932.5, 977.5, 1,842.5, 1,887.5, 2,400, 3,000, 3,600, 4,200, 4,800, 5,400, 6,000.

Wall 2:
- Grid: 0, 600, 1,200, 1,800, 2,400, 3,000, 3,600, 4,000. That is ceil(4,000 ÷ 600) + 1 = 8, with a last bay of 400.
- 1,800 and 2,400 are strictly inside W1 and come out. 1,200 and 3,000 sit on the edges, which leaves 6.
- The first studs beside W1, at 1,177.5 and 3,022.5, are 22.5 from 1,200 and 3,000. That is less than 45, so each pair is one stud and the side stud stays. The second studs go at 1,132.5 and 3,067.5.
- **Wall 2 = 8 studs:** 0, 600, 1,132.5, 1,177.5, 3,022.5, 3,067.5, 3,600, 4,000.

Run total: **21 studs**, ordered as **21 × 2,700**.
- 9 sit at centres.
- 2 are at the free ends A and C, and 2 at corner B, one end stud from each wall.
- 8 are beside openings.

**Plates** (one stock length per piece, bottom and top the full wall length)

| Piece | Length | Stock |
|---|---|---|
| Wall 1 bottom | 6,000 | 6,000 |
| Wall 1 top | 6,000 | 6,000 |
| Wall 2 bottom | 4,000 | 4,200 |
| Wall 2 top | 4,000 | 4,200 |

- Bottom plate 10.00 m and top plate 10.00 m: 4 pieces, 20,000 mm fitted.
- Order: **2 × 6,000 + 2 × 4,200** (20,400 mm bought). No piece is over 6,000, so no LVL.

**Noggins** (90 × 35, 1 row: 2,700 is not over 2,700. Clear = gap − 22.5 − 22.5.)

Wall 1 bays:
- 0 to 600: 555.
- 600 to 932.5: 287.5.
- 932.5 to 977.5 and 1,842.5 to 1,887.5: touching studs, no noggin.
- 977.5 to 1,842.5: the doorway, no noggin.
- 1,887.5 to 2,400: 467.5.
- 2,400 to 6,000: 6 bays of 555.
- **Wall 1 = 9 noggins, 4,640 mm.**

Wall 2 bays:
- 0 to 600: 555.
- 600 to 1,132.5: 487.5.
- 1,132.5 to 1,177.5 and 3,022.5 to 3,067.5: touching studs, no noggin.
- 1,177.5 to 3,022.5: the window, no noggin.
- 3,067.5 to 3,600: 487.5.
- 3,600 to 4,000: 355.
- **Wall 2 = 4 noggins, 1,885 mm.**

Run total: **13 noggins** (8 × 555, 2 × 487.5, 467.5, 355, 287.5), **6,525 mm**.
- At the 6,000 default they share lengths: **4,800 + 1,800 = 6,600 mm**. That is the least possible in 300 mm steps.
- With the noggins' longest length cleared: **13 × 1,200**, plus the note "Noggins: each is cut from its own 1,200 length. Set the noggins' longest length under Details to share lengths across walls."

**What Sam sees**
- Plan line: "Walls: 21 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 13 noggins (1 row)".
- Wall 1 page: "13 studs at 2,700 · bottom plate 6.00 m · top plate 6.00 m · 9 noggins (1 row)".
- Wall 2 page: "8 studs at 2,700 · bottom plate 4.00 m · top plate 4.00 m · 4 noggins (1 row)".
- On the Walls card: "Lintels, jacks and trimmers at D1, W1 aren't counted." and "Studs: the longest length isn't set. Confirm it before ordering." Each wall page shows the lintels note for its own openings.

**Without the openings** (the first screen-test step), the same run gives 11 + 8 = 19 studs, bottom plate 10.00 m, top plate 10.00 m, and 10 + 7 = 17 noggins. At 450 centres it gives 15 + 10 = 25 studs and 14 + 9 = 23 noggins.

### At 3,000, Double top plate on

**Studs.** Positions don't depend on height, so the same 21 stations stay (13 + 8). The cut is 3,000 and the stock is 3,000. Order: **21 × 3,000**.

**Plates.**
- Bottom, top and second top: 6,000 → 6,000 and 4,000 → 4,200 each.
- That is 6 pieces and 30,000 mm fitted. Order: **3 × 6,000 + 3 × 4,200**.

**Noggins.**
- 3,000 is over 2,700, so both walls get 2 rows.
- The same 13 bays × 2 gives **26 noggins**, **13,050 mm**.
- At the 6,000 default: **4,800 + 4,500 + 3,900 = 13,200 mm**, the least possible (two 6,000 lengths are too short).
- With the noggins' longest length cleared: 26 × 1,200 = 31,200 mm.

**What Sam sees**
- Plan line: "Walls: 21 studs at 3,000 · bottom plate 10.00 m · top plate 2 × 10.00 m · 26 noggins (2 rows)".
- Wall 1 page: "13 studs at 3,000 · bottom plate 6.00 m · top plate 2 × 6.00 m · 18 noggins (2 rows)".
- Wall 2 page: "8 studs at 3,000 · bottom plate 4.00 m · top plate 2 × 4.00 m · 8 noggins (2 rows)".

**Double top plate check (the acceptance line).** At either height, turning the switch on adds exactly two pieces: the second top plate, 6,000 + 4,000 fitted, bought as 1 × 6,000 and 1 × 4,200.
- The studs (21) stay the same.
- The bottom plate (10.00 m) stays the same.
- The noggins (13 at 2,700, 26 at 3,000) stay the same.
- This holds because the stud cut is the Wall height, not the frame height minus plates.

**Mixed run.** Say Wall 1 is at 2,700 and the height changes to 3,000 before Wall 2:
- Wall 1: 13 studs cut 2,700 and 9 noggins (1 row).
- Wall 2: 8 studs cut 3,000 and 8 noggins (2 rows).
- Studs buy 13 × 2,700 and 8 × 3,000.
- Plan line: "Walls: 21 studs (13 at 2,700, 8 at 3,000) · bottom plate 10.00 m · top plate 10.00 m · 17 noggins (1–2 rows)".
- The line's rules: one height reads "N studs at H"; mixed heights read "N studs (a at H1, b at H2)", lowest first. Rows read "(1 row)", "(2 rows)" or "(1–2 rows)".

### Long walls (round 3)

- A 9,000 wall at 2,700: bottom 1 × 9,000 LVL and top 1 × 9,000 LVL, on their own "Plates 90 × 45 LVL" line and "Long plates cut list". The wall's bottom and top plate totals still read 9.00 m.
- A 6,000 wall stays pine. The Long plates part's needs (for example its treatment) only show once a plate uses it.
- A 12,000 wall at 600 centres is joined over the stud at 10,800: 10,800 LVL + 1,200 pine per plate layer.
- A plate over 11,000 with no stud centre to join over blocks that wall, naming it.

## What is stored and reloaded

**Stored: one new kind of job material, and nothing else.**

- **Job material** (`takeoff_job_materials`):
  - Name "Walls" ("Walls 2" and so on), method `wall_framing`, version 1.
  - `spec` = `{ v:1, family:"timber", purpose:"walls", plies:1, endAllowanceMm:0, spareRate:0, sizing, base fields, components:{ studs, plates, noggins } }`.
  - Each part = `{ section:{depthMm,widthMm}, grade, treatment, species, supplierName, productCode, stock:{maxMm, unavailableMm} }`. Each part is cleaned with the same field rules timber uses today (`families.js:136-153`).
  - The top-level section, grade and treatment stay empty and are ignored.
  - Part choices live in `spec`, because spec is the procurement identity.
  - `rules` = `{ centresMm: 600, doubleTopPlate: false }`. These are bounded scalars, which `cleanGenericRules` already keeps (`server/lib/takeoff/takeoffService.mjs:171-195`).
- **Walls, openings and contributions** are the HUB 022 records, unchanged:
  - Wall: kind "wall" with 2 points, `inputs { kind:"rect", heightMm, name, runId, seq }`, and widthMm set by the server.
  - Opening: kind "opening" with `parentId` and `inputs { xMm, sillMm, widthMm, heightMm, label, type, detail? }`.
  - One `role:"wall"` contribution per wall.
  - No new input keys are added, so `cleanInputs` (`takeoffService.mjs:221-279`) and the mock's `WALL_INPUT_KEYS` (`src/ui-review/fixtures/takeoff.js:219-227`) don't change.
- **Order lines** carry `item.component` (studs, plates or noggins) inside the existing `item` jsonb. The server copies `item` through (`takeoffService.mjs:967-968`).
- **Never stored:** stud stations, side studs, plate pieces, noggin rows and bays, row sources, stock lengths and the Walls line. `computeWorkspace` works them out again on the client, the server and the mock every time. The Size and grade choice for each part is worked out again from its fields (`families.js:93-99`).

**Server cleaners: no code change in `takeoffService.mjs`.** Three shared changes reach the server through code it already calls:
1. **`normaliseFamilySpec`** accepts purpose "walls" and keeps `components`. Without this, the server silently turns "walls" into "other" (`families.js:145`) and drops the parts. "walls" is kept out of `TIMBER_PURPOSES` (`families.js:16`), so the Purpose chips and the catalogue purpose list don't offer it.
2. **`methods.js`** registers `wall_framing@1` as production for timber (next to `shared/takeoff/methods.js:197-199`). Without this, `getMethod` throws (`methods.js:223-227`).
3. **`methodReads`** returns `["wall"]` for `wall_framing` (`dispatch.js:41-50`). The server checks every contribution against it (`takeoffService.mjs:580`), so a run, count or entered-length measurement can't be put on Walls. That is why Walls rows have no Add lengths.

**Why a new method key and not `wall_frame@1`.** Reusing `wall_frame@1` would also work, because the server never checks the method against the purpose (`takeoffService.mjs:310-319`). But an API that is behind the client would then accept a Walls save, store purpose "other" and drop the parts without saying so. With a new key, an old API refuses the save instead, and the device recovery copy keeps the work. It also leaves the Studs code path untouched.

**Migration: none.**
- `method_key` is plain `text NOT NULL` with no CHECK (`supabase/migrations/206_takeoff_foundation.sql:121`, `:139`).
- `spec`, `rules` and `item` are jsonb.
- Migration 207 checks only measurement kind, contribution role and line unit (`207_takeoff_generic_methods.sql:22`, `:46`, `:54`). Kinds wall and opening, role wall and unit piece are already allowed.

**Mock parity.** The mock keeps material specs exactly as sent (`fixtures/takeoff.js:288-289`), but the real server cleans them. The mock never checks `methodReads` either. So:
- The mock runs `normaliseFamilySpec` on any spec with purpose "walls".
- The mock refuses a measurement a Walls item can't read, with the server's message.
- A node test checks that every Walls spec the UI writes comes back from the normaliser unchanged.

**Reload.**
- The snapshot comes back with spec, rules, walls (runId/seq, heights, points), openings and contributions, so the quantities come out the same.
- An unfinished run comes back from the device with its per-tap heights (`tools.js:84-125`).
- Draft order lines keep today's single dependency key per material (`dispatch.js:686-694`).

**Deploy.** One Railway deploy carries both the app and the API (blueleafhub.com.au is served by Railway; vercel.json is unused), so they can't get out of step. Only when Sam says "deploy".

## Build steps

Each step can be tested on its own. Run `npm run -s test:takeoff` after every step, and keep it green.

1. **Engine options** (`shared/takeoff/engine/timber.js`). Each option is off unless asked for, so every existing result stays byte-identical.
   - Add `component` to `OPTIONAL_IDENTITY` (`:46`). Studs, plates and noggins then become separate allocator groups and purchase buckets with no allocator change, the same way `follower` keeps battens apart.
   - `computeStudWall` (`:696-774`):
     - `openingSideStuds { studWidthMm }` adds side stations, merges any closer than one stud thickness (end, then side, then centre) and marks those ticks `side`.
     - `clipOpeningLevels` clips sill and head instead of throwing.
     - `label` makes identity problems read "Studs: …".
   - `computePlates` (`:786-821`): per-layer `gapsMm`, dropping pieces of zero length or less. (Removed in the final review: unused once Sam's round 2 bought the bottom plate full length.)
   - `computeNoggins` (`:833-890`): two new row sources, `"owner-rule"` and `"default"`, each with `rowsRuleRef`, and `skipClosedBays`. The explain text says "owner rule" or "default, to confirm".
   - `setup()` (`:283-302`) takes the label.
   - Test: the per-wall worked-example figures, the merge and wall-end cases, the 2,700 / 2,701 row boundary and its two sources, and `timber.js` suites unchanged.
2. **Material and registry** (`families.js`, `methods.js`, `methodReads` in `dispatch.js`, `shared/takeoff/index.js`).
   - A `WALLS_PURPOSE` constant.
   - `normaliseFamilySpec` walls branch (`:136`).
   - `methodFor` (`:103`) maps walls to `wall_framing@1`.
   - `familyIdentity` (`:196`) includes the three part identities.
   - `familyProblems` (`:212`) checks each part and names it.
   - `describeFamilySpec` (`:244`) reads "Studs 90 × 45 MGP10 · plates 90 × 45 · noggins 90 × 35".
   - A new `wallPartFill(part, productSpec)`: `timberProductFill` (`:65-71`, unchanged) plus the product's `stock.maxMm` and `stock.unavailableMm`.
   - A new `wallFramingDefaults(presets)`, reusing `applyTimberPreset` (`:54`) and `wallPartFill`.
   - Test: normaliser round trip and fixed point, an unknown purpose still becomes "other", `getMethod`, `methodReads`, defaults with 0, 1 and 2 company products, product stock copied into the part, and HUB 027 suites unchanged.
3. **Walls calculation** (`dispatch.js`, `shared/takeoff/schedule.js`).
   - `runTimber` (`:189`) branches to a new `runWallFraming`. For each wall it does:
     1. `resolveWall` and the guards.
     2. `computeStudWall` (studs identity, `rules.centresMm ?? 600`, both ends, cut = Wall height, side studs, clipping).
     3. `computePlates` (bottom and top the full wall length, top-2 when the switch is on; round 3: a piece over the pine longest length is one LVL length, joined over a stud only past 11,000).
     4. `computeNoggins` (stud stations that aren't removed, stud width, rows and row source by wall height, `skipClosedBays`).
   - Each demand gets an `itemDescription` naming its part.
   - The per-opening framing problems fold into one framing-gap note that doesn't block. Repeated notes are deduplicated.
   - The noggins' `allocation_share_needs_max` becomes one plain note.
   - A map built before the material loop, next to `handMade` (`:721-734`), lists the walls that are also on a Studs, Plates or Noggins item. `runWallFraming` adds the "may be counted twice" note for each one.
   - `purchaseLines` (`:498-675`): one cut list per part ("Studs cut list" and so on, next to the follower titles at `:560-575`), plus `l.component` and `item.component`.
   - `schedule.js`: lines sort studs, then plates, then noggins, next to `followerRank` (`:299-301`). The `orderLineState` "Update" suggestion (`:335-336`) must match `item.component`. Today it matches only material, length and unit, so a 4,200 stud line could be offered a 4,200 plate line.
   - Test: both worked examples through `computeWorkspace`, the switch changing only top-2 demands, separate lines for identical products, item-wide blocks, the double-count note, and wall order not mattering.
4. **Entry and plan** (`tools.js`, `TakeoffApp.jsx`, `MeasureScreen.jsx`, `fixtures/takeoff.js`).
   - `usesWalls` includes walls, in both places it is defined (`tools.js:36`, `TakeoffApp.jsx:46`).
   - `toolsFor` returns `[line, select, pan]` for walls, before the studs check at `:53`.
   - New `wallFramingTotals` and `wallFramingText` (with the mixed-height and row wording above), next to `wallCladdingTotals` (`tools.js:351-388`).
   - `addWalls` next to `addTimber` (`TakeoffApp.jsx:418-425`) skips the setup card and opens the plan.
   - "Add walls" goes first in the Timber group (`:899`) and in the Measure with… window (`:781-785`).
   - `toLengths` (`:550-552`) sends a Walls item to the plan. Measure `onClose` (`:768`) returns it to the overview.
   - Walls rows drop Add lengths (`:337`) and Save as standard (`:318`).
   - The Line panel row (`MeasureScreen.jsx:1601-1637`) gets Stud centres and Double top plate on one row through `setRule`, the Walls line (hidden while drawing) and "Details: n to fix ›".
   - The Line panel's starting height (`MeasureScreen.jsx:139`) uses only the Walls item's own walls when a Walls item is active, and resets that way when the active material changes to one.
   - The mock refuses measurements a Walls item can't read.
   - Test: `tc-hub028.spec.js` steps 1 to 6, and lint.
   - Built in step 4 because Details › and the overview row's Setup both reach the card: the Walls card's shell. A Walls item opens `WallsSetup` (title "Walls", header button "Trace walls", the parts' needs at the top, then Name), never the generic Timber card. It has no Purpose chips and no `FamilyPresetPicker`, either of which would turn the item into Studs or another purpose, or replace its parts. Its header button clears where the card was opened from, so a later Close on another card goes back to the overview. Step 5 adds the rest to this same card.
5. **Walls card and wall pages** (`FamilySetup.jsx`, `WallsScreen.jsx`, `TakeoffApp.jsx:623-652`, `fixtures/takeoff.js`).
   - `WallsSetup` (its shell, routing and needs list are from step 4) with the needs and the lintels note at the top, then the closed "Studs, plates, noggins" fold. It reuses `TimberSizeChoice` three times through a small adaptor that fills with `wallPartFill`, with one key per part so a pick can't show against the wrong part.
   - The card has no `FamilyPresetPicker` and no Save as company product. Its title is "Walls" and its header button is "Trace walls".
   - `studEntry` (`WallsScreen.jsx:1617`) also matches `wall_framing`, so the framing-detail sheet keeps working.
   - Side ticks are drawn like full studs (`:583-608`).
   - Each wall page gets its Walls line and its own notes (next to `:1705-1709`).
   - The mock normalises walls specs and gets seeds `walls`, `walls-products` and `walls-after-cladding`.
   - Test: `tc-hub028.spec.js` steps 7 to 13, `tc-walls`, `tc-catalogue`, then build.
   - Built in step 5 (steps 9 to 13 came with step 4). The card's Needs are the parts' only (what "Details: n to fix"
     counts); why a wall isn't counted sits under the card's Walls line, as on the Line panel. Its notes are the item's
     plain notes, the lintels note first (then, for example, "Studs: the longest length isn't set …" or the noggins'
     share note). Each part's Longest length has no help text; a saved product's "not stocked" lengths show under it,
     read only. A wall page leads with "Walls: 13 studs at 2,700 · …" (the item's name, as a cladding's line does),
     then its own notes; the item's lintels note isn't repeated under More, and an opening's sheet says "Lintels, jacks
     and trimmers at D1 aren't counted." (never "base studs only"). The parts' needs are one banner on a wall page,
     "Walls: 3 parts need setup (studs, plates and noggins)." with one Setup. "Long plates (over 6.0 m)" reads the
     pine plates' longest stock length, the length above which a plate is one LVL length (6,000 not stocked → "over
     5.7 m"); when no plate can be LVL (the Long plates' longest isn't past it) the row reads plain "Long plates". The
     `walls-products` seed saves one company product per part (noggins with their own 5,400).
6. **Real server, journey, SOPs and log.**
   - Add the `takeoff-api.test.mjs` reload case (needs the test database).
   - Run one real-stack journey once, in a local sandbox, before asking Sam to deploy.
   - Update SOP 20-08 to v1.5, add the 20-09 note, update 20-01 (Add walls in the Timber group), `SOP_CHANGELOG` and `SOP_INDEX`, and a HUB 028 row in `docs/hub_review/HUB_REVIEW_LOG.md`.
   - Finish with a short "done + next steps" summary.
   - Built in step 6. The real-server reload case ("HUB 028 step 6" in `takeoff-api.test.mjs`) scales the plan first,
     works out the preview on the device's snapshot, saves a Walls item (a pick's noggin stock and treatments, Double top
     plate on), a 2-wall Line run at 2,700 and 3,000 and D1 + W1 in one commit, then reloads. Parts (stock included),
     rules, runId/seq, heights, points and opening types come back as sent, and the lines are the preview's: "Walls: 21
     studs (13 at 2,700, 8 at 3,000) · bottom plate 10.00 m · top plate 2 × 10.00 m · 17 noggins (1–2 rows)". Only the
     order-line dependency key moves, as for any wall: the server's cleaner fills each wall's inputs (its traced length,
     heightSource and the empty slope fields), and the shared engine on the stored snapshot gives the server's lines
     exactly. A Run, an entered length or a Count on Walls is refused with the server's message, nothing saved.
   - The real-stack journey WF (`tc-journeys-sandbox.spec.js`) runs after J5, so the orders are unchanged: Add walls,
     Wall height 2,700, a 6,000 + 4,000 L ("19 studs … 17 noggins"), + Door D1 ("Walls: 21 studs at 2,700 · bottom plate
     10.00 m · top plate 10.00 m · 16 noggins (1 row)"; studs 21 × 2,700, plates 2 × 6,000 + 2 × 4,200, noggins 4,800 +
     3,600), then a reload: the Walls card and the plan show the same line, Wall height starts at 2,700 and the real
     server's lines are the same. Passes on desktop Chromium and iPhone 13 WebKit. HUB 022 names walls after the
     takeoff's walls so far, so WF works its expected names out from the server's walls before tracing (today Wall 2
     and Wall 3, after J2's North wall). It doesn't depend on which other journeys added walls.
   - Correction to the flow table, step 1: with no plan on the takeoff, Add walls opens the Walls list with **Wall by
     numbers** only. **Trace on plan** shows once there is a plan (as Studs, `TakeoffApp.jsx` `onTrace` is null with no
     plan). SOP 20-08 Section 5D says so, and the mocked screen test "Add walls with no plan" checks it.

**Final review fixes (25 October 2026, one local commit "HUB 028: final review fixes").** Node tests "final review: …"
in `takeoff-tc-hub028.test.mjs`, screen tests "final review: …" and "the fold: …" in `tc-hub028.spec.js`, SOP 20-08
v1.5.1 (TC-18).
- A part's Longest length is at least 1,200 (the timber grid's shortest): the card's field refuses less ("Enter 1,200
  mm or more."). One that came in under it (an older entry, a saved product) is a need naming the part ("Plates: the
  longest length must be at least 1,200 mm."), and no wall is worked out, so the line reads "Walls: Wall 1 and Wall 2
  not counted" instead of 0.00 m of plates or 0 noggins with an unnamed "Longest stock" message per wall.
- A wall whose plates or noggins can't be worked out (a plate over 11,000 with no stud to join over, or a refused
  part setting) adds nothing to the totals and is named "not counted", like a refused wall. Before, its studs and
  noggins stayed in the line with 0.00 m of plates.
- LVL stock starts at the first 300 mm step over the plates' actual pine longest (`wallPinePlateMaxMm`, the length
  computePlates splits at): 6,300 over 6,000, 5,100 over a 4,800 plate product, 6,000 when 6,000 is not stocked.
- A wall on two Walls items gets the double-count note on both (see Walls on two items). SOP 20-08's wet-area tip
  says to trace those walls on the 450 item only, or take them off the main one.
- An empty Walls list says "No walls use Walls yet. Trace or add one." (no "open a wall under Other walls"), and Use
  here on a Walls item says "Its height, 2,745, would be the stud length." A cladding wall's height is the cladded
  height, so Use here of it on Walls buys longer studs and can add a noggin row. [Open, needs Sam] whether Walls
  should refuse Use here of a cladding wall outright; today it warns and the SOP (Section 7) says to trace fresh.
- Add walls tapped before the company products have loaded (a slow signal) waits for that first load, so each part
  still takes its saved product (it used to take the built-in rows: "Details: 3 to fix").
- Cut-list labels sort with the thousands separators taken out, so "@ 600" comes before "@ 1,200" (pre-existing for
  every timber cut list; every Walls cut list showed it).
- computePlates' per-layer `gapsMm` (step 1's door gaps, unused since round 2) is removed with its helpers; the step 1
  tests now check the full-length bottom plate.

## Tests

**Node: `scripts/tests/takeoff-tc-hub028.test.mjs`** (real `computeWorkspace`, picked up by `takeoff-run-all.mjs`)
Figures updated to Sam's rounds 2 and 3 (build step 3 built tests 1-4 and 6-16 this way; build step 4 added 5's
wallFramingText and the toolsFor part of 15).
1. The 2,700 example:
   - Stations: Wall 1 [0, 600, 932.5, 977.5, 1,842.5, 1,887.5, 2,400 … 6,000] and Wall 2 [0, 600, 1,132.5, 1,177.5, 3,022.5, 3,067.5, 3,600, 4,000].
   - Studs: 21 × 2,700, cut 2,700.
   - Plate pieces: [6,000, 6,000, 4,000, 4,000] (bottom = top), ordered as 2 × 6,000 + 2 × 4,200.
   - Noggins: 13 with exact lengths, 6,525 mm, bought as 4,800 + 1,800 at the 6,000 default.
   - With the noggins' longest length cleared: 13 × 1,200 plus the share note.
   - One material and one result.
2. The 3,000 example with Double top plate on: 21 × 3,000; plates 3 × 6,000 + 3 × 4,200; 26 noggins, 13,050 mm, bought as 4,800 + 4,500 + 3,900, or 26 × 1,200 with the longest length cleared.
3. The switch at 2,700 and at 3,000: the demand sets differ only by `top-2-plate`. Stud, bottom-plate and noggin lines are identical.
4. Rows:
   - 2,700 gives 1 row, owner rule "HUB 028: 2,700 mm or under = 1 row".
   - 2,701, 3,000 and 4,000 give 2 rows, owner rule "HUB 028: over 2,700 mm = 2 rows".
   - computeNoggins with no rows still gives `noggin_rows_missing`.
5. A mixed run (2,700 then 3,000) gives rows and cuts per wall. An item-wide `studHeightMm` is ignored. `wallFramingText` gives exactly "Walls: 21 studs (13 at 2,700, 8 at 3,000) · bottom plate 10.00 m · top plate 10.00 m · 17 noggins (1–2 rows)". All walls at 3,000 give "(2 rows)".
6. Side studs and merge:
   - A window on the grid gives 8 studs (2 each side, the first two merging with the grid studs on its edges).
   - A door at xMm 0 merges with the end stud.
   - A centre stud 20 mm from a side stud merges; one 50 mm away is kept.
   - Two openings 90 apart give 2 touching side studs between them, no throw and no noggin. Openings g apart get floor(g ÷ 45) side studs between them, 1 to 4.
   - A 6,010 wall gives 11 studs and normal noggins.
7. Corners:
   - An L run has exactly 2 studs at the corner.
   - A closed 3,000 × 3,000 square has 24 studs, 8 of them at corners.
   - A straight 6,000 wall split by a height change at 3,000 has 12 studs, against 11 unsplit. (A split at 2,500 gives 13.)
8. Bottom plate (round 2): the full wall length, like the top plate. Doors, windows, "other" and a full-width door never cut it, and there's no error.
9. With 90 × 45 studs and 90 × 35 noggins, the bay is 555. The existing Noggins material still gives 565, unchanged.
10. A window head above the stud length is clipped with a note. Overlapping openings give that wall no quantities, the other walls keep theirs, and every line of the item carries the block. A Studs material still throws as before.
11. Guards and item-wide blocks:
    - A rake, gable or outline wall, or one with no height, gets one blocking line naming that wall, on every line of the item.
    - Round 3: a 6,003 wall's plates are 6,300 LVL lengths, not a block. A 9,000 wall buys 1 × 9,000 LVL per plate layer; a 12,000 wall joins over the stud at 10,800. Only a plate over 11,000 with no stud to join over blocks, on every line of the item.
12. Separation:
    - Studs and plates of the same 90 × 45 MGP10 H2 get separate lines, separate cut lists and part-named descriptions. LVL plates get their own "Plates 90 × 45 LVL" line and "Long plates cut list".
    - `orderLineState` never offers a plate line for a stud line.
13. Products:
    - Defaults with 0, 1 and 2 company products behave as set out above.
    - A saved noggin product with a 6,000 longest length fills the noggins' stock: 4,800 + 1,800 and no share note.
    - `timberProductFill` output is unchanged (HUB 027).
    - A missing treatment gives "missing product" and names the part.
    - No king, jack, trimmer or lintel demand appears without a detail.
14. Double count: a wall on both Walls and Studs gives one note on Walls that doesn't block. The Studs lines and notes are unchanged.
15. Data:
    - The normaliser keeps a Walls spec unchanged and drops junk keys.
    - An unknown purpose is still "other".
    - `cleanMaterialContent` keeps parts and rules.
    - `getMethod("wall_framing",1)` is production.
    - `methodReads` is `["wall"]`.
    - `toolsFor(walls)` is `[line, select, pan]`, and studs, plates and noggins are unchanged.
16. Running the same input twice, or with the walls in any order, gives the same result. `JOB_GENERATED_LIMIT` (`dispatch.js:36`) still applies.
17. The existing suites pass with no expectation edits beyond step 2's 300 mm grid ones: `takeoff-tc-timber`, `-timber-adv`, `-integration`, `-hub022`, `-hub027`, `-autobattens` and `-review`.

**Node, real server: `scripts/tests/takeoff-api.test.mjs`** (needs the test database)
- Save a Walls item, a 2-wall Line run, D1 and W1, then reload.
- `spec.components` (part stock included), `rules`, runId/seq, heights and opening type all come back the same.
- The lines worked out after reload equal the preview before saving.
- A run or manual measurement put on Walls is refused.

**Mocked screen: `e2e/ui-review/tc-hub028.spec.js`** (seeds `walls`, `walls-products` and `walls-after-cladding`)
1. Add walls opens the plan with Line checked, no Rectangle or Area, and no Timber card. Wall height, Stud centres 600 and Double top plate are visible.
2. Trace the L and double-tap the end. This makes one Walls material (not three) with 2 walls of role wall. The line reads "17 noggins" and "19 studs".
3. Change Stud centres to 450. The line reads "25 studs". One Undo brings back 600 and "19 studs".
4. Add + Door and + Window. The line reads "21 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 13 noggins (1 row)".
5. Turn on Double top plate. Only the top plate text changes, to "2 × 10.00 m".
6. Trace a 2,800 wall. Its wall page shows "(2 rows)". The plan line shows the mixed form, "studs (… at 2,700, … at 2,800)" and "(1–2 rows)". (Build step 4 checks the plan line, "Walls: 27 studs (21 at 2,700, 6 at 2,800) · bottom plate 13.00 m · top plate 2 × 13.00 m · 23 noggins (1–2 rows)", for a 3,000 mm long wall at 2,800, traced as its own run with Double top plate still on from step 5. The wall page's own line comes with the wall pages in step 5.)
7. Reload. The same walls, settings and line come back.
8. On `walls-products`, the saved products fill every part, including the noggins' longest length, and no "missing product" or share note shows. Details shows the fold closed.
9. At 390 × 844 there is no sideways scroll. Finish (while tracing) and + Window / + Door (after Finish) sit inside the visible sheet without scrolling it. The Worker route `/worker/takeoff/carpentry/cjb-1` shows the same flow.
10. On a fresh `walls` seed, trace the L, set Stud centres to 450 and reload. 450 and "25 studs" come back.
11. On `walls-after-cladding` (a cladding wall at 2,745), Add walls shows an empty Wall height.
12. A Walls row on the overview has no Add lengths and no Save as standard.
13. Studs still opens the Wall tool.

Also update:
- `tc-hub-review.spec.js:157-182`: Add walls is in the Timber group and the Measure with… window, and not in Flashings.
- `tc-measure.spec.js:2262-2280`: add the walls keys; extend the 375 px layout check (`:1971`).

**Real stack: `e2e/ui-review/tc-journeys-sandbox.spec.js`.** Add walls, trace, add a door, reload and see the same line. Run it once before deploy, in an isolated local sandbox, on the Hub at desktop size and on the Worker app in iPhone WebKit.

**Commands** (targeted only, no multi-agent fan-out):
- `npm run -s test:takeoff`
- `npm run -s lint`
- `npm run -s build`
- Mocked screens, on any free port other than 5180 (Sam's dev port, the config's default at `playwright.ui-review.config.js:13`): `UI_REVIEW_PORT=5191 PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test --config=playwright.ui-review.config.js e2e/ui-review/tc-hub028.spec.js e2e/ui-review/tc-hub-review.spec.js e2e/ui-review/tc-measure.spec.js e2e/ui-review/tc-walls.spec.js e2e/ui-review/tc-catalogue.spec.js`. The default `playwright.config.js` looks in `./e2e/tests` (`:14`) and would find none of these.
- Real stack, once: start an isolated sandbox as the config header says (`playwright.tc-evidence.config.js:6-12`, `npm run takeoff:sandbox -- --reset …` with its own database, home and ports). Then run `TAKEOFF_SANDBOX_URL=http://localhost:5188 PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test --config=playwright.tc-evidence.config.js --project=desktop-chromium`. Reset the sandbox and run again with `--project=iphone13-webkit`.

**Doc acceptance mapped to tests**

| Acceptance | Checked by |
|---|---|
| Choose Walls with saved component defaults | Node 13; screen 8 |
| Set 600 centres and a wall height, trace a connected run | Screen 1-3, 10, 11 |
| Finish gives one wall-framing result with studs, plates and noggins, not three takeoffs | Node 1; screen 2, 4 |
| A wall above 2,700 shows two noggin rows | Node 4-5; screen 6 |
| Double top plate changes only the top-plate quantity | Node 3; screen 5 |
| Reload keeps geometry, settings and quantities | API reload; screen 7, 10; journey |
| Plan reached without the long member form | Screen 1 |
| Sam: centres plus ends and corners, sides of openings, doors cut the bottom plate | Node 6, 7, 8 |
| Boundary: no kings, jacks, trimmers or lintels inferred | Node 13 |
| Boundary: no unstated noggin rule shown as an owner rule | Node 4-5; screen 4 |

## SOP updates

- **20-08 frontmatter:** sop_version 1.4 → 1.5, last_reviewed set to the build date, and the commit in app_version. The title becomes "Timber Takeoff: Walls, Rafters, Joists, Studs, Plates, Noggins and Trim".
- **20-08 Sections 2-4:**
  - Walls is the normal way to take off wall framing. Studs, Plates and Noggins stay for exceptions.
  - Before you start you need a scaled plan. Ideally, also save company products for studs, plates and noggins, with grade, treatment and longest length.
- **20-08 Section 5:**
  - Add a new "D. Walls: trace once, studs, plates and noggins together". It covers Add walls, Wall height, Stud centres, Double top plate, tracing the run, + Window / + Door, reading the Walls line, Details for exceptions, and Review walls.
  - It says extra members such as trimmers or lintels go on a separate Timber item, because a Walls row has no Add lengths.
  - The current D becomes "E. Studs, plates or noggins on their own (exceptions)" and keeps the Wall tool. Later letters move down one.
- **20-08 Section 7 (common mistakes):**
  - Wall height is the stud cut length.
  - The first Walls run starts with an empty Wall height. Type it before you tap.
  - Noggins share lengths at 6,000 unless a saved noggin product says otherwise. Clear the noggins' longest length and every noggin buys its own 1,200.
  - Walls at 2,700 or under get one noggin row; walls over 2,700 get two.
  - Studs set out from where each wall was traced from.
  - Trace every nib and return (especially wet-area nibs), and don't trace a shared wall twice.
  - Trace wet-area walls as their own Walls item at 450 centres.
  - Cut the doorway out of the bottom plate after standing the frame (the bottom plate is ordered full length).
  - Don't put Studs, Plates or Noggins on walls that already have Walls. Walls shows a note if you do.
- **20-08 Section 8 (troubleshooting):**
  - "Details: n to fix" means pick or type the product for those parts under Details.
  - "Lintels, jacks and trimmers aren't counted" is expected, not a fault.
  - A wall can be blocked by a sloping, gable or outline shape, no height, or overlapping openings.
  - Plates over 6.0 m come as one 90 × 45 LVL length, up to 11.0 m. Longer plates are joined over a stud. Only a plate with no stud to join over is blocked: re-trace the wall, or trace it as two walls.
  - Any block on one wall holds the whole Walls order, studs and noggins included. The other walls still show their quantities.
- **20-08 Section 11:** every rule from "How the quantities are worked out", with its tag.
- **20-08 Section 12:** corners get 2 studs, T-junctions get none, 2 studs each side of every opening, a door at a wall end, a height-change join, short noggins beside windows, no corner plate deduction, and mixed heights on one line.
- **20-08 Section 14:**
  - TC-15 (HUB 028) is the 2,700 example with exact expected figures and a reload.
  - TC-16 is the 3,000 + Double top plate case: 21 studs, plates 3 × 6,000 + 3 × 4,200, 26 noggins (2 rows).
  - TC-17 is the 450 centres change, its Undo and a reload.
  - TC-12 stays, because Studs, Plates and Noggins still keep the Wall tool.
- **20-09:** one line saying Walls (timber framing) uses the same Line tool, openings, run card and Review walls as cladding, and that Rectangle and Area aren't offered for Walls.
- **20-01 (takeoff overview):** Section 5 step 4 reads "Timber (**Add walls**, **Add timber**)", and its TC step 5 expects Add walls first in the Timber part, and no Add walls under Flashings. (Added after the build step 4 review: step 4 puts Add walls in the Timber group and first in Measure with…, a 2 × 2 grid.)
- **SOP_CHANGELOG:** one HUB 028 row (20-08 v1.5 + 20-09 note + 20-01 update, no migration, Done, untested). **SOP_INDEX:** 20-08 v1.5 and 20-01's new version, test_status untested.

## Questions for Sam (answered 25 October 2026, see Sam's decisions at the top)

If Sam says go, the build uses the recommended default for each. Smaller defaults are tagged [Default, needs Sam] in the rules above.

1. **Is Wall height the stud length, or the overall frame height (stud = height less the plates)?**
   - Default: stud cut length = Wall height, and the line shows "studs at 2,700" so it can be checked at a glance.
   - Why: it keeps "Double top plate changes only the top plate" true, and it never cuts short. At 2,700 and 3,000 the stock bought is the same either way.
2. **At a corner, are the two walls' end studs enough, or do you add a third? What goes where a wall butts into the middle of another (T-junction)?**
   - Default: 2 studs at every corner (one per wall), 2 at a straight height-change join, and nothing extra at T-junctions.
   - Why: a third stud would need a corner finder, which is a small add-on. T-junctions between runs aren't recorded anywhere yet.
3. **Openings and close studs:**
   - Is it right that centre studs inside a window come out, with no short studs under the sill or above the head, and no noggins in a door or window bay?
   - How close can two studs sit before you count them as one?
   - What is the shortest noggin you'd cut?
   - Default: yes to the first. Studs closer than one stud thickness (45 mm) count as one. Every noggin is counted as worked out, however short. Lintels, jacks and trimmers come only from an explicit framing detail, and Walls says so in one line.
   - Why: the doc says not to infer them.
4. **Noggins and stock:**
   - Is it 1 row at 2,700 and under, and 2 rows at any height over?
   - What longest length do you buy noggins and plates in?
   - How do you join a plate longer than your longest length? Until you say, a wall longer than it blocks the whole Walls order, studs and noggins included.
   - Default: 2 rows over 2,700 (your rule). 1 row at 2,700 or under, shown as "to confirm". Until a noggin length is set, each noggin is cut from its own 1,200, with a note. Once set, noggins share lengths across all walls. Plates stay one length per piece and are never joined.
   - Why: in the example, sharing cuts noggin stock from 15.6 m to 7.2 m. Sharing needs a real longest length, which only you can give.
5. **Should Walls also be a choice in the Timber card's Purpose row, next to Studs, Plates and Noggins?**
   - Default: no. Add walls sits first in the Timber group and in Measure with…, one tap from the overview.
   - Why: a Purpose chip would have to turn an item that may already have Studs walls into Walls. That conversion is left out of this plan.

## Out of scope

- Kings, jacks, trimmers, lintels, sill and head pieces, cripples, bracing, tie-downs, hold-downs and any structural sizing or adequacy.
- Joists and rafters, which need a different workflow.
- Extra corner studs, T-junction studs, and linking separate runs.
- Plate joins or splices, plate offcut sharing, timber offcut entry, and pooling between two Walls items.
- Blocks per part, so one part could still be ordered while another is blocked.
- A spares field, per-wall stud centres, per-wall Double top plate, a noggin row override, plies and kerf on Walls.
- Sloping, gable and outline (Rectangle/Area) walls on Walls.
- Entered lengths (Add lengths) on a Walls item, and saving a Walls item as a company standard. Extra members go on a separate Timber item.
- Automatically sharing one trace between cladding and Walls. The existing Use here still works.
- Changing Studs, Plates or Noggins in any way. That includes:
  - their tool;
  - the 565 noggin-width flaw (`dispatch.js:254-255`);
  - the 6,010 mm wall defect found while planning (Studs gives 12 studs, Noggins blocks with none);
  - a double-count note on their side;
  - converting old three-item jobs.
- Changing where cladding's Wall height starts.
- Order-line staleness keys per part. One key per material stays.
- Walls as a Purpose chip (unless Sam says yes to Question 5) or as a company-product purpose.
- Any migration, and any deploy without Sam's "deploy".

## Risks

Risks 2, 3, 6 and 11 were written before Sam's 25 October answers. Since then a long plate is one LVL length (not a
block), noggins share at 6,000 by default and both row rules are his. They are kept as the planning record.

1. **Wall height meaning.** If Sam means frame height, every Walls cut list is one plate set too long. The stock bought is the same in most cases. The line shows the cut, and Question 1 asks him.
2. **One block holds the whole Walls order.** Every blocking problem goes on every line of its material (`dispatch.js:817`, `:826`).
   - That covers a plate longer than the longest length (`dispatch.js:540`), overlapping openings, a sloping or outline wall, and a wall with no height.
   - The other walls still show quantities, but nothing in the item can be ordered.
   - Example: with the plates' longest length at 6,000, a 6,000 wall traced as 6,003 needs a 6,600 plate (`stock.js:36`) and holds the studs and noggins too.
   - Walls can't join a plate (`timber.js:802`). Question 4 asks how Sam joins long plates, and SOP Section 8 says how to clear a block.
3. **Noggin over-order by default.** Until a noggin longest length is set, every noggin buys a 1,200 length (15.6 m bought for 6.7 m in the example). A saved noggin product with its longest length fixes this with no taps. Otherwise Walls shows a plain note, and Question 4 asks for the length.
4. **Not order-ready out of the box.** The built-in rows carry no treatment, and plates and noggins carry no grade (`families.js:27-32`).
   - Blocking problems apply to every line of a material (`dispatch.js:826-828`), so one missing noggin treatment also holds the stud lines.
   - Fix: save three company products once.
5. **Corner and junction counts** may be under Sam's practice (3-stud corners, junction studs) until he answers Question 2.
6. **Unconfirmed 1-row rule.** Until Sam answers Question 4, walls at 2,700 or under order 1 row. The line says "to confirm", so it is never shown as his rule.
7. **Deploy.** Not a risk here: the app and the API ship together in one Railway deploy. A phone still running the old app until it reloads gets "That calculation method is not available." only if it opens Walls before reloading, and the work is kept on the device.
8. **Mock drift.** A normaliser bug, or a measurement Walls can't read, would pass mocked screens. This is covered by the mock normalising walls specs and refusing those measurements, the fixed-point node test and the real-server reload case.
9. **One dependency key per material** (`dispatch.js:686-694`). The switch, a centres change or a product change marks every Walls draft order line for review. The quantities are still right.
10. **Double counting.** A wall with both Walls and old Studs, Plates or Noggins is still counted twice. Walls now shows a note, but nothing stops it. Tracing framing and cladding separately also enters each wall and its openings twice.
11. **Trace noise.** A 6,010 wall buys a 6,600 top plate (`stock.js:36`). Studs and noggins are protected by the merge rule.
12. **Trace direction** moves stud positions, and so merges and noggin bays, near openings. The SOP says where set-out starts.
13. **Stud centres is item-wide.** Changing it re-lays every wall already traced. Wall height, by contrast, only changes walls traced after it.
14. **Short noggins.** A centre stud just outside the merge distance leaves a short noggin (for example 32.5 mm). It is counted as worked out until Sam answers Question 3.
15. **Double count through a framing detail.** An explicit detail that lists kings at the side-stud positions would add them on top. Walls notes "check side studs aren't counted twice".
16. **Opening datum.** Studs read plan openings from the stud base, while the plan measures from the floor. On Walls this only affects clipping, which is now a note.
17. **Cladding height start.** Cladding keeps today's start from the last wall of any material (`tools.js:158-166`). So a cladding run traced straight after Walls starts at the stud cut height. The box shows it, as it does today.
18. **Test churn is small.** It touches `tc-hub-review.spec.js`, `tc-measure.spec.js` and one added line in `takeoff-tc-hub022.test.mjs`. The rule that timber keeps Wall (`:19-28`) and SOP TC-12 stay true.
19. **Generation limits.** Three parts per wall and 2 noggin rows count toward the 5,000-per-wall and 20,000-per-job limits (`timber.js:32`, `dispatch.js:36`). This only matters on very large jobs.

## Appendix: plan scores

Each criterion is scored out of 10, for a total out of 50.

| Plan | Simple onsite | Quantity correctness | Faithful to Sam + doc | Reuse / smallest change | Testability | Total |
|---|---|---|---|---|---|---|
| onsite-simple (base) | 9 | 8 | 9 | 7 | 9 | 42 |
| reuse-minimal | 8 | 7 | 8 | 9 | 8 | 40 |
| correct-data | 7 | 9 | 7 | 6 | 9 | 38 |

- **onsite-simple** is the base for the flow, the single Walls line on the plan, stud cut = Wall height, the new method key and "Add walls" first. It missed:
  - that computeNoggins throws on a closed bay;
  - the cut-list and order-suggestion overlaps between parts.
- **reuse-minimal** contributed:
  - the `component` tag in `OPTIONAL_IDENTITY` (`timber.js:46`) in place of a new identity scheme;
  - `setRule` for the panel fields;
  - the `TimberSizeChoice` adaptor;
  - a window on the grid that tests the merge;
  - a read-only engine check.

  Not taken from reuse-minimal:
  - Side studs centred on the opening edge, which would shave half a stud off the clear opening.
  - Reusing `wall_frame@1`, because an out-of-step API would silently drop the parts.
- **correct-data** contributed:
  - `skipClosedBays`;
  - clipping opening heads instead of blocking;
  - separate cut lists per part;
  - the part check in `orderLineState`;
  - the mock normalising walls specs;
  - the guards for non-rectangular walls.

  Not taken from correct-data:
  - Frame height as the default.
  - Staleness keys per part, which go beyond the stated change.

**Disputed claims checked by reading the code or running the engine read-only:**
- `wall_frame` already reads `["wall","manual","count"]` (`dispatch.js:45`). The server doesn't check the method against the purpose (`takeoffService.mjs:310-319`).
- computeNoggins fails on a closed bay (`timber.js:865`). Today a 6,010 mm wall gives 12 studs and a blocked Noggins result (engine run).
- Cut-list rows merge by cut and stock length inside one list per follower (`dispatch.js:560-575`). Spares are grouped by unit and follower only (`dispatch.js:648`).
- The order "Update" suggestion matches material, length and unit only (`schedule.js:335-336`).
- Notes that don't block are added to every line with no deduplication (`dispatch.js:828`). Blocking problems go on every line too (`dispatch.js:817`, `:826`).
- The mock keeps the spec exactly as sent (`fixtures/takeoff.js:288-289`) and never checks `methodReads`. The server normalises the spec, turns unknown purposes into "other" (`families.js:145`) and checks `methodReads` (`takeoffService.mjs:580`).
- `timberProductFill` copies no stock (`families.js:65-71`), while company timber products store a longest length and "not stocked" lengths (`CatalogueEditor.jsx:368-369`).
- Add lengths shows on every timber row (`TakeoffApp.jsx:337`). Save as standard opens the catalogue editor (`TakeoffApp.jsx:318`, `:441`), which has no Walls purpose (`CatalogueEditor.jsx:47`).
- The Line panel's starting height reads every wall in the takeoff, whatever its material (`MeasureScreen.jsx:139`, `tools.js:158-166`).
- `MeasureScreen.jsx:415` snaps a tap onto an earlier corner of the same run. It is not evidence that runs are unlinked. That comes from each wall holding only its own runId and seq (`tools.js:171-177`).
- Worked-example stock checked with the current engine:
  - studs 3,000;
  - plates 1,200, 4,200 × 3 and 6,000;
  - noggins 13 × 1,200 with no longest length, 6,000 + 1,200 (proven) at 6,000, and 6,000 + 6,000 + 1,800 for 2 rows.

## Critic findings not applied

None. All ten findings held when I checked them against the code and the brief, and all ten are applied above. For two of them I took the lighter of the critic's two options:
- **Walls in the Purpose row:** asked as Question 5, not built.
- **Add lengths and Save as standard on Walls rows:** hidden, not supported.

---
sop_version: 1.8
last_reviewed: 2026-10-21
app_version: takeoff-r03 (TC-R04 build, commit 8f9190f)
screenshot_status: placeholders_only
owner: Admin / Director
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP: Cladding — Walls, Openings and the Generated Elevation

**Module:** Takeoffs (timber, cladding, aluminium and flashing from plans)  
**SOP ID:** 20-09  
**Status:** Draft  
**Priority:** High

> **Feature status (2026-10-14):** Takeoffs ship **switched off** behind the server flag `TAKEOFF_ENABLED` (SOP 20-01). A read-only check on 2026-10-14 found migration 206's tables present in production (`docs/takeoff/evidence/live-206-verification-2026-10-14.txt`). Cladding takeoff is part of the **TC-R04 build on branch `takeoff-r03`** and also needs **migration 207 (`supabase/migrations/207_takeoff_generic_methods.sql`), which is NOT applied in production** — it must not be applied until the Director approves the TC-R04 release. Nothing in this SOP has been tested against the live app; Section 14 runs in UI Review Mode (mocked data).

> **Read this first:** the cladding takeoff works out **quantities for ordering**. Installation rules (support spacing, fixings, wind zones, edge zones, joint details) are **source-pending**: no manufacturer guide row has been reviewed into the app, so it never claims an installation is correct or compliant. The elevation it draws is a **setout aid derived from the plan and the heights you enter — not a surveyed elevation**.

---

## 1. Who uses this

| Action | Admin (Director) — Hub | Supervisor — Hub | Leading hand — Worker app | View-only / Admin preview |
|---|---|---|---|---|
| Open walls, elevations, quantities | Yes | Yes | Yes | Read only |
| **Add cladding**, choose product / assembly, add and edit walls and openings, joint rows, setout | Yes | Yes | Yes | No |
| **Save as standard** / company cladding products (SOP 20-12) | Yes | Yes | No | No |
| Export / record the order (SOP 20-06) | Yes (record placed: Director only) | Export only | Export only | No |

---

## 2. When to use it

- You need to order **fibre cement sheets or boards** (e.g. Axon, Linea, Stria, Matrix), **AAC panels** (Walsc first, Hebel), **Rendex EPS foam**, or **timber cladding** for walls.
- You need **support battens** (cavity battens, rails) laid out on the same walls.
- You want an **accessory set** (starters, trims, joint strips, membrane, tape, sealant, mesh, coatings) worked out along the real wall routes — or recorded as by others / excluded.
- A wall shows "Heights needed", "Needs attention", "No stock fits" or a joint-row problem.

---

## 3. What this does

You choose the cladding product and how it is installed, then enter each wall — **by numbers** (length and heights), **traced on the plan** with the heights typed in, or **drawn on a scaled elevation** with **Rectangle** or **Area** — and its openings (windows, doors), either on the wall's elevation, by tapping both ends on the plan, or by tapping two opposite corners on the elevation. For the wall you are looking at, the app generates an elevation and lays the product out: sheets per strip (a partly used cell still uses a whole sheet), boards per course, panels on a grid, AAC panels per column, or a total LM estimate for random-length timber. You see **one view at a time — Cladding, Supports or Accessories** — and can tap any sheet, board, panel or line to see the stock it comes from and its cut size. Gross, opening and net areas are shown separately; openings are deducted once even when they overlap. Quantities flow into the schedule and the supplier order by their real unit (sheets, pieces, LM, boxes …) and are never added together.

---

## 4. Before you start

- The takeoff is open (SOP 20-01). To trace walls you need a **Ready** scaled plan page (SOP 20-02); walls by numbers need no plan. To draw walls on an elevation, that elevation page needs its own scale (Rectangle and Area ask for one first).
- Know the **exact product** and size (the app lists researched products with their published widths, covers and lengths — "confirm with supplier" for availability).
- Know each wall's **length and cladding height** (the cladding boundary — not automatically slab to ceiling), sloping-top or gable heights, and each opening's **width, height, sill height and offset from the wall start**. On a scaled plan you only need each window's **height and sill** and each door's **height**: the width and position come from tapping its ends (Section 5, C2).
- AAC: the system's **approved adhesive joint** from its current guide. Matrix: the **expressed-joint gap**. Battens: the **maximum support spacing** from a reviewed rule or project detail. Timber cladding: the supplier's **effective cover** and **LM ordering increment**. None of these are defaulted.
- Edit access (Section 1) and migration 207 on the database.

---

## 5. Step-by-step process

### A. Add the cladding material and choose the product

1. Overview → **Materials** → **Add cladding**. The **Cladding** setup card opens ("… · this job only"). Changes save automatically — there is no Save button; **Undo** / **Redo** at the top.
2. **Company products** (top of the card): if the company has saved one, tap **Use on this job** (SOP 20-12). Otherwise set it up here.
3. **Material** — **Fibre cement**, **AAC (Walsc first)**, **Rendex foam**, **Timber cladding**, **Support battens** or **Accessories**.
4. **Product** — search (name, SKU, size) and tap the product. **James Hardie products (Axon, Linea, Stria, Matrix) open with the Blue Leaf defaults** (HUB 014): one summary line, e.g. "Cavity · Wind N2 · Timber frame · On studs · ND nails · 10% spares · 2,450 / 2,750 / 3,000 mm · 10 mm H-flashing joints", and you can go straight to **Walls**. Anything the product's assembly asks that the default doesn't answer is listed as "Still needed: …" (e.g. Linea's edge zone). Wind class is a company default — check it against this site. Tap **Edit** for an exception on this job (e.g. a different wind class); the changed value is marked "(this job)" and the company default doesn't change. **Save as company default** (Admin / Supervisor, also in the Worker app when your login is linked to one of those accounts) asks first, then every new takeoff of that product uses your values; jobs already set up keep their own. A product with no default yet shows the full form and "No company default for this product yet."; an older material of a product that now has one offers **Use Blue Leaf defaults**. Steps 5–8 below are under **Edit** when the defaults are in use. Without a default, a chosen product shows its facts: width, thickness, effective cover, SKUs and **Product sources** (e.g. H01, H02). "Product dimensions are published facts for quantity only."
5. **Lengths your supplier stocks** — untick any length the supplier doesn't have; the layout picks the shortest listed length that fits.
6. **Orientation** (boards / courses) — **Horizontal courses** or **Vertical boards** (only those the product is listed for).
7. **Installation assembly** — pick the researched assembly (badge **Candidate — not reviewed**, "0 reviewed rule rows · automatic fixings off"). If it needs one, choose **Fixing route (your choice — never assumed)**: **Direct fix** or **Cavity**. "Installation rules are **source-pending** …"
8. **Spares** (%), **Supplier**, **Availability**. For sheets, panels and AAC: **Advanced (joint rows, allowances, minimum strip)**.
9. Read **Needs…**, **On the order now (this job)**, **What the assembly needs** (unresolved rows say so — "fixings are unresolved (not zero)") and the three statuses.
10. If you change product, orientation or method, values that belonged to the old choice are moved to an amber box: "Check these — they belonged to the previous choice and are NOT being used". Tap **Use … for <new product>** only if it really applies, or **Discard** / **Dismiss**.
11. Tap **Walls**.

### B. Product-specific settings

- **Fibre cement sheets (e.g. Axon):** each vertical strip takes the **shortest listed sheet** that covers its highest point. A 1 mm cut strip still uses a whole sheet. **Sheets are shared across the wall:** pieces are cut across the sheet's length only, so the two long factory edges (tongue and groove) always stay and the 1,200 mm width is never cut down to fit another piece. Short pieces that sit in the same strip width (for example the course above a joint) are cut end to end from one sheet, allowing 5 mm per saw cut. A ripped strip's offcut is reused only by a piece that needs the offcut's factory edge. **Offcuts are also shared across walls (HUB 016 follow-up):** every wall of the same cladding material is planned together, so one wall's spare slices or ripped-strip offcuts serve pieces on another wall, under the same edge rule. The shared plan is only used when it saves sheets; it never orders more than planning each wall on its own. A single piece takes the shortest listed sheet that holds it (e.g. a 2,447 mm piece takes a 2,450 sheet). A shared sheet is counted on the wall of its first piece, and the cut list names every piece it serves (for example "Sheet 1 … : North strip 1, South strip 3"); a wall that takes a piece from another wall says so ("South: from other walls — strip 3 from Sheet 1 (counted on North; the offcut of North strip 1)"). If walls are clad on different days and offcuts won't be kept, tap **Plan each wall on its own** in the wall's sheet details (tap **Share offcuts across walls** to turn it back on). The wall's sheet details say how many pieces come from how many sheets, and each cell's details say which sheet it is cut from. A wall taller than the tallest listed sheet is **blocked** until you add a joint row (Section 5G) or choose a taller listed sheet.
- **Courses / boards (e.g. Linea, Stria):** counts use the **effective cover**, not the nominal width. An opening only removes a course where it spans the full course height; otherwise the board is notched.
- **Matrix panel grid:** **Expressed joint gap** ("10 mm — sourced assembly parameter (H10), not added to the panel size."). A 2,390 mm wide wall takes two 1,190 panels; 2,400 mm needs a third strip. Cut and narrow strips are flagged for the system's minimum-piece / edge-fixing check (**Minimum cut strip** in Advanced). Joint/backing strip product is "not selected" until you add one.
- **AAC panels:** Walsc is listed first ("Company preference"). **One system per material** — brands and wall systems are never mixed; add another material for a second system. **Approved adhesive joint (system value)** is required ("Never defaulted, and not a 10 mm movement gap"). Rails, fixings, adhesive bags, mesh, control joints and coating show as unresolved rows until reviewed quantities are entered; coating is the **net** finish area.
- **Rendex foam:** **Exact Rendex product / system**, **Sheet length**, **Sheet width**, **Thickness**, and **Coating: Factory-coated / Applicator-coated** — all from the current Rendex system document ("none are assumed"). AAC rails and adhesive never apply to foam.
- **Timber cladding:** **Species / profile**, **Supplier**, **Effective cover (this supplier/product's value)** — 70, 90, 120, 140 mm or **Other effective cover** (cover is already net of the overlap — nothing more is deducted), **Nominal width**, **Thickness**, **Supply**: **Random lengths (LM)** (enter the **Supplier ordering increment**; optional **Lengths in the supplier's random mix**) or **Fixed lengths (boards)** (enter **Board length(s)**), and **Ends** (Square / End-matched). Random lengths give **total LM = net area ÷ cover**, plus spares, rounded up to the increment — e.g. 24 m² at 120 mm → 200 LM; at 90 mm → 267 LM. It is labelled "estimate — not a piece count". Changing the supplier or profile flags the old cover for re-entry.
- **Support battens:** pick a researched batten or **Timber or other batten (enter its size)**; **Batten direction**; **Maximum support spacing** (required — "never defaulted. It varies with wind class, product and fixing"); **Spacing authority**; **Start / End offset**; **These supports already exist (layout only — not purchased)**.
- **Accessories:** the card opens with "**Source-pending — manual quantities.**" Name the set, then **Add an item** (Starter / base trim, Trim, Closer, Vent strip, Joint strip / backing, Membrane / wrap, Tape, Sealant, Mesh, Coating / render, Primer, AAC adhesive, Other item (entered quantity)). For each item: **Item (exact product)**, **Scope: Include / By others / Exclude** (with **Why it's by others / excluded**), the edges it **Runs along**, stock lengths, and for consumables a **Reviewed yield** with its source (tick "I've checked this yield against that source") or an **Entered quantity** with **Quantity from (detail, schedule or reviewer)**. **Accessory groups with no item in this set** must each be decided: **Not decided**, **By others**, **Exclude** or **Entered item above** — "Not decided" is not the same as excluded.

### C. Add walls

1. The **Walls** screen shows the material's statuses (**Quantity / Installation / Ordering**), "The app has not verified installation (supports, fixings, wind zones). Quantities are for ordering only.", any **Needs attention before ordering** list, and the walls.
2. **Wall by numbers** → **Wall name**, **Shape** (**Rectangle**, **Sloping top**, **Gable**), **Wall length** (Enter). The wall's editor opens with the missing height ready to type.
3. **Trace on plan** → the plan opens with the **Line** tool. The panel shows the cladding (for example "Axon 400 smooth") and **Wall height** side by side. The height starts at the last one used on this takeoff. (Timber studs, plates and noggins keep the **Wall** tool: SOP 20-08.)
4. Type the **Wall height** (for example 2,700) and tap **Done**. Then tap the start of the wall and each corner. Double-tap the last point, or tap **Finish**. To close a run round a building, double-tap the start point (the panel says so). If you clear the box, the walls you trace next have no height and show **Heights needed**.
5. You can change **Wall height** partway through a run. Only the walls you trace after that get the new height. Walls already drawn keep theirs. If you change it partway along a straight wall, that wall is split into two walls where you changed it.
6. **Finish** keeps you on the plan. One card shows the run, for example "Run 1 · 4 walls · 2,700". Each straight leg is its own wall ("Wall 3", "Wall 4" …) with its own elevation and sheets. All the walls are saved together, with the cladding already on them. If some walls have no height, the card says so ("… · 2,700 · 1 needs a height"). **Undo** on the card takes the whole run off in one go, and the toolbar **↶** puts it back. The card only shows while finishing the run is the last thing you did. After any other change (a height, a corner), use the toolbar **↶** instead.
7. The cladding stays the same for the whole run. While you are tracing, its name is only a label, so a stray tap beside the height box can't finish the run. Before you start, tapping the name (or **Material: …** at the top) opens the material list. **Material: …** during a run finishes the run first.
8. To change one wall's height later, tap **Select**, tap the wall and change **Wall height**. Only that wall changes. Tap **Done** on the keypad when you have typed it. If you tap the next wall (or anywhere on the plan) straight away, the height you typed is still kept. The same goes for the Line height and a Count length. To move a corner, drag its point. A corner shared by two walls moves both walls, and one **Undo** puts it back.
9. In the list, a traced run is one line ("Run 1 · 4 walls · 2,700"). Tap it to see its walls in the order you traced them. Each wall shows its shape, length, heights, openings, **Entered** or **From plan**, the materials using it and its quantities. **Heights needed** and **Needs attention** chips show what is missing (on the run's line too). Walls on other materials are folded under **Other walls** (tap it to open: ▸ / ▾). If this material has no walls yet (battens, for example), **Other walls** is already open.
10. To put this material on a wall, open the wall and tap **Use here** at the top ("Cavity batten 70 × 19 isn't on this wall yet."). Back in the list, **Other walls** and the run stay open, so the next wall is one tap away. **Materials on this wall** (further down) also has **Use … here** / **✓ Uses …** to take it off again. **Remove wall** is there too. It deletes the wall and its openings **for every material using it** ("Removed North and its 1 opening. Also gone from …"). **Undo** brings it back.

### C2. Add windows and doors on the plan

1. After you finish a run, the card has **+ Window** and **+ Door**. They are also in the Line panel whenever you are not tracing.
2. Tap **+ Window**. The panel (headed "Window · Axon 400 smooth", for example) shows **Height** and **Sill height** (up from the floor). They start at the last window in a wall on this takeoff. Change them if this window is a different size. Tap **Done** on the keypad, then tap one end on the plan. If you tap the plan straight away, what you typed is still kept. If a box is empty, the line under the boxes says so in amber ("Type the height and sill, then tap one end of the window.").
3. Tap one end of the window on the plan, then the other end. The window goes into the nearest wall you traced for this cladding (a tap right at a corner can be nearer the wall next to it: the window still goes on the wall both ends are on). It is saved exactly like a window added on the elevation: **W1**, **W2** … on each wall, with its offset from the wall start and its width to the nearest 10 mm. It doesn't matter which end you tap first.
4. You stay on **+ Window** for the next one. If it's the same size, just tap both ends. A card under the boxes says what was added, for example "W1 in Wall 3 · 1,200 wide". **Undo** on that card and the toolbar **↶** do the same thing: if you have tapped only one end, that end comes off first; otherwise the last opening comes off.
5. **+ Door** asks for **Height** only. A door sits on the floor (sill 0) and is labelled **D1**, **D2** …
6. Each opening is drawn on the plan as a coloured band in its wall (blue for a window, indigo for a door) with its label beside it. Every material on that wall deducts it, the same as an opening added on the elevation.
7. **Trace more walls** returns to the Line panel so you can trace more walls (tapping **Line**, **Select** or **Pan**, or changing the material, also ends windows and doors). To change an opening, open its wall's elevation (Section E). In **Select**, a wall lists its openings ("W1 in this wall. Change it on the elevation.").
8. If the two ends run past the end of the wall, or round a corner onto the next wall, the opening is cut back to the wall. When more than a finger's slip was cut off (about 12 px on screen, never more than 400 mm), the card says so in amber and keeps saying it until the next opening is placed, for example "W1 ran past the end of Wall 4, so it's cut back to the wall (you tapped 1,100). Undo, or change it on Wall 4's elevation." Round a corner, it goes on the wall that has most of it ("… went round the corner, so it's on Wall 3 only …"). Where a straight wall was split because its height changes, the card says "… runs on into Wall 4 (the wall height changes there), so it's on Wall 3 only … Tap the rest on Wall 4, or Undo." A tap just short of or just past a corner or wall end says nothing: the opening simply ends there.
9. If the window's sill plus its height is above the top of the wall, it is still saved and the card says "W1 is taller than Wall 3 (2,700 high), so only the part on the wall comes off. Check the height and sill, or Undo." The wall's elevation shows the same ("Extends past the wall edge").
10. A tap that isn't on a wall saves nothing ("No Axon 400 smooth wall here. Tap on a wall you traced."). Zoom in if a wall is hard to hit. If the two ends are well along two different walls, the panel says "Both ends go on the same wall …" and keeps the first end, so tap the other end again. Ends well along two walls in one straight line say "Wall 3 ends here and Wall 4 carries on. Tap the part on each wall separately."
11. On a page with no scale, **+ Window** and **+ Door** say "Scale this page before adding windows and doors." A page with more than one scaled region needs no region chosen: each traced wall keeps its own scale. If this cladding has no traced walls on the page yet, they say "Trace the … walls first, then add their windows and doors." If its walls are hidden in **Takeoffs ▾**, they say "Your … walls are hidden on this plan. Tap Show all, then add the windows and doors."

### C3. Draw walls on an elevation: Rectangle and Area

1. Go to the elevation page: tap **Page 1 ▾** in the toolbar, then tap the page. You come straight back to measuring on that page, with the same tool. The takeoff's main plan page doesn't change (SOP 20-02, Section F). A wall you were halfway through waits on its own page and comes back when you return.
2. The toolbar has **Line**, **Rectangle**, **Area**, **Select** and **Pan**. They are on every page.
3. **Rectangle:** tap one corner of the wall, then the opposite corner. The four corners are square. That's the wall, saved on the cladding you are using. A double-tap on the opposite corner does the same: it saves one wall and starts nothing new. The card shows it, for example "Wall 3 · 12.00 m²", "4,000 wide × 3,000 high" and its sheets ("4 sheets 3,000 × 1,200"). If the wall is taller than the longest sheet, the card says so in amber instead ("Taller than the longest sheet (3,600). Add a joint row on the elevation.") with **Open elevation** to add it.
4. **Area:** tap each corner of the wall in turn. For a gable end that is the two bottom corners, the eaves, the apex and the other eaves. As you go the panel shows the corners and the m² ("5 corners · 11.00 m²"), and a faint line shows the side back to the first corner. To finish, tap the first corner again, double-tap the last corner, or tap **Finish**. If the outline crosses itself it isn't saved: tap **↶** to take the last corner off.
5. The sheets come from the product, exactly as for a wall by numbers: real sheet sizes, laps, joint rows and shared offcuts. The m² is only a readout. Each corner lands on the nearest 10 mm, so a wall you tap at about 3,000 high is exactly 3,000 and takes a 3,000 sheet, not the next length up.
6. The wall is drawn closed with its m² beside it. **Undo** on the card takes it off, and **↶** puts it back.
7. **+ Window** (or **+ Door**) on the card or in the panel: tap one corner of the window on the elevation, then the opposite corner. Its width, height and sill come from the taps, so there is nothing to type. A door goes down to the floor. The card says what was added, for example "W1 in Wall 3 · 1,200 × 1,200, sill 1,000". If the corners run past the wall's edge, it is cut back to the wall and the card says so. Under a gable's slope the card says only the part on the wall comes off. **Draw more walls** goes back to Rectangle or Area.
8. **Select**, then tap any side of the wall (the side back to the first corner too). The panel shows its m², its size, its corners and its sheets. Drag a corner. Only that corner moves, on a Rectangle as on an Area, so you can lean a side or turn a Rectangle into a skillion. The m² follows your finger and the sheets change as soon as you let go. Windows and doors stay where they are on the elevation. One **Undo** puts the corner and the openings back.
   - If a window or door now runs past any side of the wall, it is cut back to fit and the panel says so ("W1 now runs past the edge of the wall, so it's cut back to fit. Undo puts the corner and W1 back.").
   - If it now reaches past a sloping side, it stays as it is and only the part on the wall comes off. The panel says so.
   - A door stays on the floor. If the floor moves, the door's height changes and the panel says so ("D1 is now 2,600 high, so it still reaches the floor.").
   - If the move would leave an opening wholly off the wall, on any side or above a lowered apex, it isn't made ("That would leave W1 off the wall. Move it on the elevation first.").
9. On a page with no scale, Rectangle and Area say once, in the panel, "This page has no scale yet. Scale it, then you come straight back here to draw." The **Scale page** button is right there. Tap it, scale the page (SOP 20-02) and you are back on that page with the same tool. **+ Window** and **+ Door** show once there is a wall on the page.
10. Draw each wall once. A wall traced on the floor plan and drawn again on its elevation is counted twice. The wall list says which is which ("From plan" or "Traced elevation").

### D. Enter the wall's size and read the elevation

1. **Wall** box: **Wall name**, **Shape**, **Wall length** (typed walls) or **Wall length (traced)** (read-only — retrace to change it), then **Wall height** (rectangle), **Height at start** / **Height at end** (sloping top) or **Eaves height**, **Apex height**, **Apex position from start** (+ **Centre**) for a gable. Incoherent values stay in the field with a message (e.g. "The apex must be higher than the eaves.").
2. The result line under it updates live: e.g. "Net 12.15 m² of 12.96 m² · Axon cladding: 4 sheets".
3. The elevation is labelled **Entered** or **Derived from plan + entered heights** and "Setout aid — not a surveyed elevation." **Gross / Openings / Net** areas are shown under it.

### E. Add and adjust openings

1. **Add opening**. The banner says "Tap the elevation where the opening is — or type its numbers below." Tap its rough position (optional), then type **Width**, **Height**, **Sill height** (up from the wall base) and **Offset from wall start** (to the opening's left edge), **Label** and **Type** (**Window / Door / Other**). It is added as soon as its numbers are complete (labels W1, W2 … / D1 …).
2. Tap an opening row (or the opening) to open **Opening W1**: it lists "Edges: head … · sill … · jambs 2 × … mm · head at … mm" and says "no reviewed flashing template is linked here yet — the lengths above are the opening's edges only."
3. Drag the highlighted opening on the drawing to move it (snaps to 10 mm). **The typed numbers are what count.** Two fingers never drag.
4. Overlapping openings are deducted **once**. The part of an opening past the wall edge is red-hatched and **not** deducted ("Extends past the wall edge — only the part on the wall is deducted."). An opening wholly off the wall blocks the layout ("… is entirely outside the wall") until moved or removed.
5. **Remove opening** (Undo brings it back).

### F. The three views — Cladding, Supports, Accessories

1. **Cladding** — sheets / courses / panels with a legend: **In use**, **Cut strip**, **Narrow — review**, **No stock fits**, **Empty — none used**, **Joint**. Tap one for its **Stock** and **Cut size**; **‹ Previous** / **Next ›** step through. Sheets show a summary, e.g. "4 strips × 1 course → 4 sheets. A cut strip still uses a whole sheet." and "N potential offcuts — listed only, never reused automatically". With more than one cladding on the wall, **Show** picks which one is drawn.
2. **Supports** — batten / rail lines (Support, Existing (not bought)) and studs (SOP 20-08). Tap a line for **Length**, **Stock** ("Cut from a 3,000 mm length") and fixings. With no support material: "No support layer on this wall. Battens and rails are their own material …".
3. **Accessories** — the routes: base (doors left out), wall ends, opening heads / sills / jambs and cladding joints, with totals ("Base (less doors)", "Opening edges", "Joints") — "Route lengths only." Each accessory set on the wall lists its scope per group (Include · calculated / entered, By others · reason, Exclude · reason, Not decided).
4. **On this wall** lists each material's statuses and quantities ("Layout quantities before spares and pack rounding — the schedule adds those.").

### G. Joint rows (walls taller than the sheet)

1. A wall taller than the tallest listed sheet shows "… need up to 3,500 mm but the tallest listed sheet is 3,000 mm …" and red **No stock fits** cells.
2. Tap **Add a joint row** (on the problem, a blocked cell, or under **Sheet setout**). In **Joint row** enter **Joint height** (suggested from the tallest sheet), **Joint gap** (from the detail — never defaulted) and **Detail reference**. The wall becomes two courses with a joint line; **Horizontal joint strips** appear on the wall.
3. A joint row applies to **every wall using this material**. Walls it doesn't fit inside are named and keep one course. **Remove joint row** clears it.
4. Joint rows can also be entered in the setup card (**Advanced → Horizontal joint rows**); they stay a draft until positions, gap and detail are all entered.

### H. Setout start (datum)

1. **Sheet setout** → **Setout starts at (from the wall start)**; **Course setout** → **First course starts at (from the wall base)** (0 or below — a negative value starts with a cut course).
2. The quantity change on this wall is shown, e.g. "Sheets on this wall: 5 → 6". It applies to every wall using the material and is never re-centred automatically.

### I. Check the schedule

1. **Open schedule**: each cladding / batten / accessory material is a group with its three statuses, "Quantities only — installation details are not verified by the app.", blocking needs, notes, per-wall areas ("North wall: net 12.15 m² (gross 12.96 − openings 0.81) · Entered length and heights") and rows by unit (sheets, pieces, LM, boxes …). Accessory groups show **Accessory scope** (By others / Excluded / Not decided / Included).
2. Tap a row → **Comes from** (wall + openings) and **Show on wall**.

---

## 6. What happens next

- Every change autosaves (SOP 20-07); the server recalculates every layout from the walls, openings and rules.
- The schedule and order use the real units; random-length LM is ordered as an estimate (never a board count). The **Site appendix (cutting & setout)** of each export includes each wall's setout (SOP 20-06).
- Statuses stay honest: Installation stays **Source pending — not verified** / **Not specified** unless a reviewed rule or project detail is recorded. Nothing is ordered, sent or emailed.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Entering slab-to-ceiling height as the wall height | Habit | Enter the **cladding** boundary height |
| Subtracting window area from the order "by eye" | Expecting an area calculation | Add the opening — the layout deducts whole cells only where they are empty |
| Using the nominal board width as cover | Product names show the width | Enter the supplier's **effective cover** |
| Re-using another product's joint gap / adhesive joint after changing product | Values look still valid | Check the amber "Check these" box — use only if it truly applies |
| Assuming "Not decided" accessory groups are excluded | They look empty | Decide each one: By others / Exclude (with reason) / entered item |
| Treating the elevation as surveyed | It looks exact | It is derived from the plan + typed heights — check site measurements |
| Removing a wall shared by several materials | Remove looks local | Read "Also gone from …"; Undo if wrong |
| Changing **Wall height** to fix a wall already traced | The box looks like it sets every wall | The box only changes the walls you trace next. Use **Select** → the wall → **Wall height** |
| Adding the same window on the plan and again on the elevation | Both ways are open | Use one. Two openings show as W1 and W2 on the wall: overlap is only deducted once, but the opening list and edge lengths count both. Remove one |
| Leaving the last window's size in the boxes for a different window | The boxes remember the last window | Check **Height** and **Sill height** before tapping the ends of a different-sized window |
| Ordering joint-strip lines as cladding boards | The line uses the cladding's product name (Section 12) | Leave them off the order until a joint product is chosen |
| Drawing a wall on its elevation that was already traced on the floor plan | Both ways are open | Use one. Remove the other with **Select** → **Remove wall** |
| Drawing the elevation on a page with another page's scale in mind | Each page has its own scale | Scale the elevation page itself (Rectangle and Area ask first) |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Enter the wall heights to generate the elevation." / **Heights needed** | Wall has a length but no height | Type the height(s) |
| "No height yet. Type it first, or each wall will need one." on the Line panel | No wall on this takeoff has a height yet | Type **Wall height** before tracing, or set each wall afterwards with **Select** |
| A wall I expected isn't in the list | It is on another material | Open **Other walls**, open the wall, tap **Use here** at the top |
| An unfinished drawing from before the update comes back as a **Line** run | Cladding no longer has the **Wall** tool; the drawing carries on as a Line run with the last wall height | Carry on tapping corners, or **Finish** / **Discard**. It finishes as a run and you stay on the plan |
| **Undo this run** isn't on the plan any more | You changed something after finishing the run (a height, a corner, a window) | Use the toolbar **↶**. It undoes the last change first |
| "No … wall here. Tap on a wall you traced." | The tap is more than a finger's width (or more than 1 m) off the cladding's traced walls, or the wall is on another material or hidden | Zoom in and tap on the wall line. Check the cladding with **Material: …** and the **Takeoffs ▾** list |
| "Tap the other end on the wall too." / "Both ends go on the same wall …" | The second tap missed the wall, or landed well along another wall | Tap the other end again on the same wall. The first end is kept (**↶** takes it off) |
| "… ran past the end of …" / "… went round the corner …" / "… runs on into …" on the card | An end was tapped well past the wall's end, onto the next wall, or into the next wall in a straight line | It's already cut back to the wall. Check the width on that wall's elevation, or **Undo** and tap again. For a straight wall split by a height change, tap the rest on the next wall |
| "… is taller than Wall 3 (2,700 high) …" on the card | The sill plus the height is above the wall top (a typo, or the wall height is too low) | Check **Height** and **Sill height**, then **Undo** and place it again, or fix the wall height with **Select** |
| "Your … walls are hidden on this plan …" / "That wall is hidden on this plan …" | The cladding's walls are switched off in **Takeoffs ▾** | Tap **Show all** (above the plan), then add the windows and doors |
| A window ending at a corner gave no warning although I tapped a little past it | A tap within a finger's slip (about 12 px) of a corner or wall end counts as that end | Nothing to do: it ends at the corner. Zoom in if you need it to stop short |
| "Type the window height first." / "Type the sill height first." / "Type the door height first." | The box is empty (there is no earlier window or door on this takeoff) | Type it, then tap the ends |
| "Scale this page before adding windows and doors." | The page has no scale at all (a page with several scaled regions is fine) | **Scale page** (SOP 20-02) and trace the walls first |
| "Tap the other end further away. Zoom in for a narrow opening." | The two taps are very close on screen | Zoom in, then tap both ends |
| "This page has no scale yet. Scale it …" in the Rectangle or Area panel | The elevation page has no scale | Tap **Scale page** in the panel (SOP 20-02). You come straight back with the same tool |
| "Taller than the longest sheet (3,600) …" on the wall's card, and no sheets | The wall is taller than the longest sheet listed for the product | **Open elevation** and add a joint row (or choose a taller sheet) |
| "… now runs past the edge of the wall, so it's cut back to fit" after a corner drag | The new corner moved the wall's side into a window or door | That's done for you. Check it on the elevation, or **Undo** puts the corner and the opening back |
| "D1 is now 2,600 high, so it still reaches the floor." after a corner drag | The floor corner moved, and a door always sits on the floor | Check the door height on the elevation, or **Undo** |
| "The outline crosses itself …" | The Area corners were tapped out of order | Tap **↶** to take corners off, then tap them in order round the wall |
| "That would leave W1 off the wall …" when dragging a corner | The corner would move a side of the wall (or a gable's apex) past a whole window or door | Move or remove the opening on the elevation first, then drag the corner |
| "Tap the opposite corner on Wall 3 too." | The second corner of a window missed the wall drawn with Rectangle or Area | Tap inside the same wall (or just on its edge) |
| "The apex must be higher than the eaves." / "The apex must sit between the two wall ends …" | Gable values don't fit | Correct the value — the old shape stays until valid |
| "… the tallest listed sheet is 3,000 mm …" / **No stock fits** cells | Wall taller than any listed sheet | **Add a joint row** with its detail, or choose a taller listed sheet |
| "… is entirely outside the wall" / "<material>: no layout on this wall — fix the problems below first." | An opening is off the wall | Move or remove the opening |
| "Extends past the wall edge — only the part on the wall is deducted." | Opening offset/width runs past the end | Check the opening numbers |
| "Enter the system's approved adhesive joint …" | AAC without the system value | Enter it from the current guide |
| "Enter the expressed-joint gap from the selected assembly." | Matrix without a gap | Enter it from the assembly detail |
| "Enter the maximum support spacing …" / "Support spacing is not set …" | Battens without spacing | Enter the spacing from the reviewed rule or project detail |
| "fixings not quantified — detail required" | No fixing rule selected (by design — never zero) | Enter a reviewed fixing quantity or record by others |
| "Effective cover is needed (supplier/product value — not the nominal width)." on a **support batten** group | Known issue (Section 12) | Report it; battens can't be made order-ready in this build |
| "Effective cover is needed …" on cladding | Cover not entered | Enter the supplier's effective cover |
| "Enter the supplier's LM ordering increment." | Random-length timber without increment | Enter it |
| "Choose factory-coated or applicator-coated." / "Enter the exact Rendex product / system name." | Rendex not set up | Enter from the current Rendex document |
| "Check these — they belonged to the previous choice and are NOT being used" | Product / orientation / method changed | Confirm each value for the new product or discard it |
| "… joint row … isn't inside this wall …" | A joint row taller/longer than a wall using the same material | Move the joint row, or put that wall on its own material |
| "No connection — your changes are kept on this device …" | Offline | Carry on; it saves when back online (SOP 20-07) |
| "Not saved: One or more values are not valid for this field." on a wall/opening | Migration 207 missing on that database | Apply 207 to that (non-production) database |

---

## 9. Related modules

- [20-02 Set up plans and scale a page → a Ready scale before tracing walls](20-02_set_up_and_scale_plans.md)
- [20-08 Timber takeoff → studs, plates and noggins use the same Walls screen](20-08_timber_takeoff.md)
- [20-10 Aluminium profiles and the cutting sheet → window angles from the same openings](20-10_aluminium_cutting_sheet.md)
- [20-12 Company product catalogue → company cladding / batten / accessory products](20-12_company_product_catalogue.md)
- [20-05 Length schedule and splitting → the schedule window](20-05_length_schedule_and_split.md)
- [20-06 Export a supplier order and record it as placed → ordering by unit, site appendix setout](20-06_export_and_record_orders.md)
- [20-07 Saving, recovery and conflicts → autosave and device recovery](20-07_saving_recovery_conflicts.md)

---

## 10. Screenshot placeholders

[insert screenshot: Cladding setup card — Material chips, product picker, chosen product facts, Installation assembly (Candidate), Needs…]
[insert screenshot: Line panel — cladding name and Wall height side by side; the run card "Run 1 · 4 walls · 2,700" with Undo]
[insert screenshot: Walls list — material status, Wall by numbers / Trace on plan, a run opened into its walls, Other walls folded]
[insert screenshot: + Window panel — Height and Sill height, "W1 in Wall 3" card with Undo; W1 bands on the plan (docs/takeoff/evidence/ui/tc-measure/hub022b-window-390x844.png)]
[insert screenshot: a window cut back at a corner — the amber note on the "W1 in Wall 3 · 600 wide" card, Trace more walls and + Door still on screen (docs/takeoff/evidence/ui/tc-measure/hub022b-corner-note-390x844.png)]
[insert screenshot: wall editor — Cladding view with 4 sheets, W1 opening, Gross/Openings/Net]
[insert screenshot: New opening sheet — Width, Height, Sill height, Offset from wall start, Label, Type]
[insert screenshot: tapped cell — Stock / Cut size with Previous / Next]
[insert screenshot: Supports view with battens; Accessories view with route totals and scope]
[insert screenshot: Joint row sheet — Joint height, Joint gap, Detail reference]
[insert screenshot: Timber cladding card — cover chips, Random lengths (LM), ordering increment, On the order now 200 LM]
[insert screenshot: schedule — Axon group, wall area line, 4 sheets row]

---

## 11. Automation notes

- **Add cladding** upserts a `takeoff_job_materials` row (`spec.family` 'cladding', layout 'sheet'); the method follows the product: `sheet_layout@2` (sheets, Rendex), `course_layout@1` (boards / fixed timber), `panel_grid@1` (Matrix), `aac_panel_layout@1` (AAC), `area_to_linear@2` (random-length timber), `support_grid@1` (battens), `accessory_routes@1` (accessories).
- **Wall:** `takeoff_measurements` `kind` 'wall', `geometry.inputs` { kind rect|rake|gable|polygon, widthMm, heightMm | start/end | eaves/apex, name }, traced walls also store plan points + `calibration_id` / `document_id`; contribution `role` 'wall' per material using it. A wall traced with **Line** (HUB 022) also stores `runId` (uuid, shared by the run) and `seq` (1, 2, 3 … in tap order) in `geometry.inputs`. No migration: the server keeps them only as a valid pair and drops anything else. A run's walls and their contributions are one commit, so they share one `created_at`; `seq` is what brings them back in order.
- **Opening:** `kind` 'opening', `geometry.parentId` = the wall, inputs { xMm, sillMm, widthMm, heightMm, label, type }. Removing a wall archives its openings and every contribution to them.
- **+ Window / + Door on the plan** (HUB 022 step 2) saves the same record (`openingRecord` in `measure/tools.js`, shared with the elevation): no plan points, no `document_id` / `calibration_id`, no contribution, no new fields and no migration. One Undo step per opening; autosave may send several openings in one save. The two taps are projected onto the wall in calibrated mm (`planOpening` in `measure/geometry.js`): `xMm` = the nearer end's distance from the wall's first plan point, `widthMm` = the length between the ends, both rounded to 10 and cut back so the opening never runs past the wall's ends. Every wall with both taps on it is a candidate (a tap at a corner may be nearer the next wall); the one carrying most of the opening wins. The cut-back note shows only when more than `tapSlopMm` was cut (`OPENING_SLOP_PX` 12 px in real mm at the zoom, 20–400 mm); the part along the next wall counts only for a tap at (or past) the chosen wall's end. Walls in one line (under 3° apart) are a "join", not a corner. A window above its wall is checked with the engine's own `buildWall` / `normaliseOpenings` (`openingAboveWall`). The note lives on the opening's card (MeasureScreen `lastOpening.note`) until the next opening. A door's `sillMm` is 0. Labels are the first free W / D number on that wall (`nextOpeningLabel`). The boxes start at the last window / door in a wall of the takeoff (`lastOpeningSizes`; aluminium openings with no wall are skipped). The page only needs any scale (`cals.length`): each wall uses its own calibration.
- **Rectangle / Area** (HUB 023) save ONE `kind` 'wall' measurement with `geometry.inputs` { kind 'polygon', name } and its corners as plan points (3–200, `outlineWallInputs` in `measure/tools.js`), plus a contribution `role` 'wall' on the material in use, in one commit. No new fields and no migration: the server's cleaner already took elevation outlines (a non-outline wall with more than 2 points is still refused). Every corner (each tap and each drag) is put on the nearest 10 mm of the page's real-mm grid (`snapToMmGrid`, from the page origin along the scale's axes; a corner that would leave a scaled region stays as tapped), so the sides are whole 10 mm and a tap a hair over a sheet length doesn't take the next sheet up. A Rectangle's corners are `rectCorners(a, b)` (square to the page; the scale's axes are always the page's). A corner drag in Select moves that corner only, on a Rectangle and an Area alike (HUB 023 "vertex edits"; there is no stored "rectangle" flag). A double-tap on a Rectangle's opposite corner, or on an outline window's (or a plan opening's) second tap, sets `lastFinishTap` so the trailing tap starts nothing. The engine lays the cladding out over the outline (`dispatch.js` `resolveWall`: x from the leftmost corner, y up from the lowest), so sheet sizes, laps and offcut rules apply; an `area` measurement on a cladding is still refused as unused. The m² is `polygonAreaMm2` on the scaled corners (`outlineAreaM2`). An outline that crosses itself is refused before saving (`outlineProblem`, the engine's `buildWall`).
- **+ Window / + Door on an outline** save the same opening record: `outlineOpening` maps the two corner taps into the outline's frame (`outlineFrame`, the engine's own) and rounds to 10 mm; a door's `sillMm` is 0 up to the higher tap. **Openings stay put:** a corner drag re-measures every opening on that outline from the new corners (`keepOpeningsInPlace`) and saves the wall and the changed openings in one commit (one Undo); a door keeps its head and stays on the floor (`resized`, noted when its height changes); a part past ANY side of the new outline's box is cut back (whole mm, `cut`, noted); one still on the wall but newly reaching outside the outline itself (a gable slope) is kept and noted (`outside`, the engine deducts only the part on the wall); an opening left wholly off the wall, by the box or by the engine's own `normaliseOpenings` test on the new outline (`opening_outside_wall`), is `lost` and refuses the move. A wall with no sheets shows `wallSheetIssue` (the engine's blocking problem on that wall, matched by its `wallTagOn` name: `sheet_too_tall` → "Taller than the longest sheet …") on its card and in Select.
- **Page chip** (HUB 023): opens the existing page picker (`PlanSetup` `purpose="measure"`); a page tap goes straight back to Measure on that page with the same tool. Nothing is saved: `primary_document_id` / `primary_page_index` are untouched, and an unfinished drawing stays on its page (kept on the device by `draftKey`, which includes the page; a device that can't keep it finishes it first). **Back** returns to the page you were on, also after looking at another plan in the picker (`usePlanDocument` reports loading until the plan for the chosen document is open, `forId`). The chip shows only when there is another page or plan to go to. **Scale page** from Measure returns to Measure on that page with the same tool (`TakeoffApp` `measureTool` / `scaleFrom`).
- **Joint rows, datum, route, spacing, adhesive joint** are material `rules` (one change → every wall using that material).
- **Calculation** (`shared/takeoff/engine/wall.js`, `cladding.js`, `supports.js`, `accessories.js`, `dispatch.js`): wall polygon, opening **union** clipped to the wall, gross / opening / net; occupied-cell sheet layout; course bands; panel grid n = ceil((W + g) ÷ (p + g)); AAC columns; area ÷ cover LM. Recomputed on every save on the server; the client never sends quantities.
- **Statuses:** three independent statuses per material — quantity, installation, procurement — exactly as the engine reports; the UI never upgrades them.
- **Order lines:** generic purchase lines with `unit` ('sheet', 'piece', 'lm', 'box' …) and `item.description` (migration 207).
- No email, notification or file is created.

---

## 12. Edge cases and limits

- **Known issue — support battens:** a researched support batten (e.g. Hardie Cavity Batten) is blocked on the schedule with "Effective cover is needed (supplier/product value — not the nominal width)." The setup card hides this need and has no cover field for battens, so battens stay **Product details missing** in this build. Reported to the owner 2026-10-14.
- **Known issue — joint / backing strip lines:** until a joint accessory product is selected, joint-strip lines on the schedule carry the cladding's own product name (e.g. "James Hardie Axon 400 smooth 9 thick — 6,000 mm length" for a horizontal joint strip, "James Hardie Matrix SKU 403811 8 thick — 2,390 mm length" for a Matrix joint). Don't order them as cladding; set their quantity to 0 on the order until the joint product is chosen. The wall screen labels them correctly ("Horizontal joint strips").
- Only the selected wall renders an elevation (20+ walls stay fast).
- Sheets: pieces and offcuts are shared across all walls of the same material (HUB 016 follow-up), unless **Plan each wall on its own** is chosen; offcuts are not carried between materials or jobs. Spares (%) on sheet products are added on top of the layout in the schedule.
- Corner trims can't be tagged on walls yet — add them as "Other item (entered quantity)".
- Opening flashings are not generated from openings — add them as a flashing material (SOP 20-11); the opening sheet lists the edge lengths.
- Random-length timber LM is an estimate; minimum board length, end-joint and stagger rules are not set in the app — agree them with the supplier and installer.
- Traced walls keep their plan length; to change it, retrace or drag a corner. A re-scale or replaced plan flags traced walls (SOP 20-02).
- Runs are numbered in takeoff order across the job (Run 1, Run 2 …). Removing every wall of a run renumbers the runs after it. A run with only one wall is listed as a plain wall. Walls traced before HUB 022 (and walls by numbers) have no run and are listed on their own.
- A corner moves both walls only where the two walls share the exact same point (walls traced in one run). Walls from separate runs that only look joined move on their own.
- **+ Window / + Door** snap to straight walls traced on the plan, or go inside walls drawn with Rectangle or Area, for the current cladding only. Walls by numbers take their openings on the elevation. Labels are per wall, so several walls can each have a **W1**.
- **Rectangle / Area:** an outline can have up to 200 corners. A corner drag moves one corner, so a Rectangle can be turned into any four-corner shape; to square it again, draw it again. A tap inside two overlapping outlines picks the smaller one. Outline openings are rectangles; a window across a gable's slope is kept, and only the part on the wall comes off.
- A wall drawn on an elevation and the same wall traced on the floor plan are two walls: both are counted. Remove one.
- A plan tap counts as on a wall within about a finger's width on screen (always within 400 mm), but never more than 1 m off it. Openings can't be dragged on the plan; move or resize them on the wall's elevation.
- An opening that starts or ends past a wall, or round a corner, is saved cut back to the wall, so the elevation shows no "Extends past the wall edge" note for the sides. The plan card is the only place the cut is noted, and only until the next opening is placed. An opening whose top is above the wall is not cut: the elevation shows "Extends past the wall edge" and only the part on the wall is deducted. Dragging a wall's corner later can still leave an opening past the new end (the elevation then says so).
- A window across the join of a straight wall split where its height changes goes on one wall only (the one with most of it). Add the rest on the other wall.
- On a busy plan, an opening's label keeps clear of its own wall's name but can still sit over another takeoff's labels. Zoom in or hide other takeoffs in **Takeoffs ▾**.
- Wind classification, edge zones and fixing patterns are never inferred.

---

## 13. Owner of the process

Admin / Director  
Next review date: 2027-04-14

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] **UI Review Mode on your own server — never port 5180 and never production.** `VITE_UI_REVIEW_MODE=true npx vite --port <PORT> --strictPort` (or the agents' no-HMR config); Playwright with `PLAYWRIGHT_BROWSERS_PATH=0` and `UI_REVIEW_PORT=<PORT>`. Stop the server afterwards.
- [ ] Phone viewport 390 × 844, touch (375 × 667 for layout checks).
- [ ] Default flashing job: `http://localhost:<PORT>/carpentry/cjb-1/takeoff?reviewRole=admin`. Mixed job: add `&takeoffSeed=mixed` — it has **Axon cladding** (Axon 133 smooth) and **Cavity battens** (max spacing 600) on **North wall** 4,800 × 2,700 with window **W1** 900 × 900 (sill 900, from start 1,500), and **Shiplap (random lengths)** (cover 120, increment 1 m) on **East wall** 3,000 × 3,000 with **W2** 1,800 × 1,200. Add `&takeoffFixings=1` for **Cladding fixings** (3 boxes entered; membrane by others, sealant excluded).
- [ ] Records: `await (await fetch("/api/takeoff/workspaces/ws-1")).json()` in the page console (snapshot); `window.__takeoffReviewState()`. A reload re-seeds the fake data.
- [ ] Optional live run: isolated test DB with migrations 206 + 207, `TAKEOFF_ENABLED=true`, `BLH TEST` job.

### Test cases

**TC-01 — Happy path (J2: Axon wall with a window)**
1. Default job → **Add cladding** → product **Axon 133 smooth** → **Walls**.
2. **Wall by numbers** → Wall name "North wall", Wall length 4800 (Enter) → **Wall height** 2700 (Enter).
3. **Add opening** → Offset from wall start 1500, Sill height 900, Width 900, Height 900 (Enter after each) → **✕** (Close panel).
4. Expected result: provenance chip **Entered** + "Setout aid — not a surveyed elevation."; **Gross 12.96 m²**, **Openings 0.81 m²**, **Net 12.15 m²**; "4 strips × 1 course → 4 sheets. A cut strip still uses a whole sheet."; result line "Net 12.15 m² of 12.96 m² · Axon 133 smooth: 4 sheets"; **On this wall**: "Sheets — Axon 133 smooth SKU 403932 2,750 × 1,200 mm · 4 sheets" with chips Calculated / Source pending — not verified / Ready to order; opening row "W1 · Window · 900 × 900 · sill 900 · from start 1,500"; opening sheet "Edges: head 900 · sill 900 · jambs 2 × 900 mm · head at 1,800 mm".
5. **Open schedule**: group shows "4 sheets · James Hardie Axon 133 smooth SKU 403932 — 2,750 × 1,200 mm" and "North wall: net 12.15 m² (gross 12.96 − openings 0.81) · Entered length and heights".
6. Expected record: measurement `kind` "wall" with `inputs` { kind "rect", widthMm 4800, heightMm 2700, name "North wall" } and a contribution `role` "wall" to the new material; measurement `kind` "opening" with `parentId` = the wall and `inputs` { xMm 1500, sillMm 900, widthMm 900, heightMm 900, label "W1", type "window" }. Live DB: `takeoff_measurements.kind` 'wall' / 'opening' (needs 207).
- [ ] Pass  [ ] Fail

**TC-02 — Empty / invalid required fields**
1. On the TC-01 material: **‹ Walls** → **Wall by numbers** → Wall length `0` (Enter); then 3000 (Enter) and leave the height blank → **‹ Walls**.
2. Open that wall → Shape **Gable** → **Eaves height** 2400 (Enter) → **Apex height** 2000 (Enter).
3. **Add opening** → type only Width 900 → **✕**.
4. Overview → **Add cladding** → Material **Support battens** → product **Hardie Cavity Batten**.
5. Expected result: step 1 — "Enter a number greater than 0." and no wall created for 0; the 3,000 wall's row shows **Heights needed** and its editor says "Enter the wall heights to generate the elevation."; step 2 — "The apex must be higher than the eaves." and the field keeps 2000 (nothing applied); step 3 — no opening is added (the hint says the opening is added once its numbers are complete); step 4 — **Needs…** contains "Enter the maximum support spacing from the selected rule or project detail — no default spacing is assumed." and **Maximum support spacing** is empty.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate / overlapping openings deducted once**
1. Mixed job → **Axon cladding** row → **Walls** → **Open North wall**.
2. **Add opening** with exactly W1's numbers (offset 1500, sill 900, 900 × 900).
3. Add another: offset 1950, sill 1350, 900 × 900 (overlaps W1 by 450 × 450).
4. Expected result: step 2 — a second opening **W2** is created (no merge, no warning), **Openings 0.81 m²** (union, not 1.62), **Net 12.15 m²**, result line still "… Axon cladding: 4 sheets"; step 3 — **W3** created, **Openings 1.42 m²** (0.81 + 0.81 − 0.2025 overlap with W1/W2), **Net 11.54 m²**; sheets stay 4.
5. **Undo** twice → W3 and W2 gone, Openings 0.81 m², Net 12.15 m².
6. Expected record: after step 3 the wall `m-wn` has three live `kind` "opening" children; after the undos only `m-w1` remains live.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Leading hand: `/worker/takeoff/carpentry/cjb-1?takeoffSeed=mixed` → **Axon cladding** → **Setup**.
2. Ordinary worker: `/worker/takeoff/carpentry/cjb-1?takeoffWorker=ordinary`.
3. Expected result: step 1 — walls can be added and edited; the card shows **Company products** but **no New company product…** and no **Edit company product**; overview rows have no **Save as standard**; step 2 — "You don't have access to this." / "Takeoffs are for leading hands and office staff.".
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (autosave + honest statuses)**
1. Mixed job → Axon cladding → **Walls** → **Open North wall**. Note `__takeoffReviewState()` revision R.
2. Change **Wall length** to 4801 (Enter). Wait for **Saved**.
3. Expected result: revision R + 1; "5 strips (1 cut: 1 mm wide) × 1 course → 5 sheets"; result line "… Axon cladding: 5 sheets"; **Net 12.15 m²** unchanged by the 1 mm (rounded); the Installation chip is **Source pending — not verified** (never "Reviewed rule selected"); the Walls list shows "The app has not verified installation (supports, fixings, wind zones). Quantities are for ordering only."
4. **Undo** → 4 sheets; **Redo** → 5 sheets.
5. Expected record: wall `m-wn.inputs.widthMm` = 4801 after redo. No email/notification.
- [ ] Pass  [ ] Fail

**TC-06 — Too tall → explicit joint row; empty cells use no sheet**
1. Default job → **Add cladding** → product **Axon 400 smooth** → **Walls** → **Wall by numbers** "Tall", 6000, height 3500.
2. On the problem tap **Add a joint row** → **Joint gap** 10 (Enter) (Joint height shows 3000).
3. **Add opening**: offset 0, sill 3000, width 1200, height 500.
4. Expected result: step 1 — problem "… need up to 3,500 mm but the tallest listed sheet is 3,000 mm …", 5 **No stock fits** cells; tap one → "None fits — needs 3,500 mm"; step 2 — the problem clears, 10 cells **In use** in two courses, one **Joint** line, On this wall lists 3,000 × 1,200 and 2,450 × 1,200 sheets and **Horizontal joint strips**; step 3 — strip 1's upper cell is **Empty — none used** (9 cells in use).
5. **Undo** (opening), **Undo** (joint row) → the 5 blocked cells return.
- [ ] Pass  [ ] Fail

**TC-07 — Views, cell details and setout datum**
1. TC-01 wall (or mixed North wall). Tap a sheet cell → read **Stock** / **Cut size**; **Next ›**.
2. **Supports** view; **Accessories** view.
3. Back to **Cladding** → **Sheet setout** → Setout starts at 600 (Enter).
4. Expected result: step 1 — Stock "SKU 403932 · 2,750 × 1,200 mm sheet", Cut size "1,200 × 2,700 mm" (full strip); step 2 — mixed job: support lines from **Cavity battens** ("Cut from a 3,000 mm length"); default-job wall: "No support layer on this wall …"; Accessories: "Base (less doors) 4,800 mm", "Opening edges 3,600 mm", "Joints 0 mm" and "Route lengths only. …"; step 3 — "Sheets on this wall: 4 → 5" (start and end cut strips), the datum guide moves.
- [ ] Pass  [ ] Fail

**TC-08 — Random-length timber cladding (cover, LM estimate)**
1. Mixed job → **Open schedule** → **Shiplap (random lengths)**; tap the row.
2. Back → overview → **Shiplap (random lengths)** → **Setup** → Effective cover **90 mm**.
3. Expected result: step 1 — "57 LM · Shiplap 19 thick — random lengths (LM)" with **estimate — not a piece count**, **Quantity: Estimate**, "East wall: net 6.84 m² (gross 9.00 − openings 2.16) · Entered length and heights", expanded "Random lengths: this is total linear metres. The supplier picks the lengths — no piece count is claimed." and "Minimum board length, end-joint and stagger rules aren't set in the app …"; step 2 — **On the order now** shows 76 LM and "Changed from: 57 LM" (6.84 ÷ 0.09 = 76).
- [ ] Pass  [ ] Fail

**TC-09 — AAC (Walsc) adhesive joint and unresolved rows; Matrix grid rule**
1. Default job → **Add cladding** → Material **AAC (Walsc first)**. Read the first product option, pick **Walsc External Wall System 50**.
2. Enter **Approved adhesive joint (system value)** 3.
3. New material: **Add cladding** → **Matrix 1,190 × 1,190** → **Walls** → wall 2390 × 2390; then change the length to 2400.
4. Expected result: step 1 — first option is Walsc with **Company preference**; "One system per material: Walsc External Wall System 50 (50 mm) only — brands and wall systems are never mixed."; Needs contains the adhesive joint; **What the assembly needs** → Fixings "No reviewed fixing row is active for Walsc External Wall System 50 — fixings are unresolved (not zero).", Rails "… rail spacing isn't seeded …"; Installation **Source-pending**; step 2 — the adhesive need clears; step 3 — 2,390 × 2,390 → **4** panels (2 × 2); 2,400 wide → **6** panels (3 columns × 2 rows) with the note "the wall edge (width) falls inside a 10 mm joint — it needs a narrow strip or a changed grid/stock format. Review the detail."
- [ ] Pass  [ ] Fail

**TC-10 — Accessory scope is shown, never hidden as zero**
1. `…/takeoff?reviewRole=admin&takeoffSeed=mixed&takeoffFixings=1` → **Open schedule** → **Cladding fixings**.
2. Overview → **Axon cladding** → **Walls** → **Open North wall** → **Accessories**.
3. Expected result: step 1 — "Accessory scope" lists "By others: Membrane / wrap (Wrap by the framer), Tape", "Excluded: Sealant (Painter seals the joints)", "Not decided: Corner trims", "Included: Cladding screws 8g × 40"; row "3 boxes · Cladding screws 8g × 40 (entered, Supplier quote Q-123)"; step 2 — "Cladding fixings — selected scope" lists fixings Include · entered, membrane By others · Wrap by the framer, sealant Exclude · Painter seals the joints, and "“Not decided” is not the same as excluded."
- [ ] Pass  [ ] Fail

**TC-11 — Known issue check: support battens blocked on cover**
1. Mixed job → **Open schedule** → **Cavity battens**.
2. Expected result (current build): **Ordering: Product details missing**, **Quantity: Incomplete**, "Needs before ordering:" contains "Effective cover is needed (supplier/product value — not the nominal width)." and "fixings not quantified — detail required"; row "10 pieces · James Hardie Hardie Cavity Batten 19 thick — 3,000 mm length" marked **needs attention**. Record the cover message as the Section 12 known issue (the fixings message is by design).
- [ ] Pass  [ ] Fail

**TC-12 — Phone layout**
1. 375 × 667: open the Walls list, the North wall editor and the New opening sheet.
2. Expected result: no sideways scrolling; every button / field at least 44 px tall; the elevation fits the screen width (zoom − / + buttons appear only when cells are smaller than a finger).
- [ ] Pass  [ ] Fail

**TC-13 — Gable values entered one at a time (HUB 017, UI Review + API)**
1. Axon wall 6,573 long, 3,600 high → **Gable** → Apex height 4200 → move to the next field and wait a second.
2. Expected: Apex height still shows 4200, with no "Not saved" banner; the wall stays "Heights needed" until the position is in.
3. Enter a position, then tap **Centre**. Expected: position 3287; gross area 25.63 m²; all values stay after **Next element** and closing the panel.
4. API: three separate saves (eaves → apex height → position) each succeed. An apex below the eaves, or a position at a wall end, is refused.
- [ ] Pass  [ ] Fail

**TC-14 — A wall taller than the sheet gets its joint automatically (HUB 015, UI Review + engine)**
1. Axon 400 smooth wall, 6,573 long × 3,600 high (tallest listed sheet 3,000). Expected: a problem "… the tallest listed sheet is 3,000 mm …" with **Use a 10 mm joint with an H-flashing** and **Other joint…**.
2. Tap **Use a 10 mm joint with an H-flashing**. Expected: the problem clears; "Joint added automatically at 3,000 mm — 10 mm gap, H-flashing …"; the setout card reads "Joints: 10 mm gap, H-flashing, placed automatically wherever a wall is taller than the sheet"; a joint line is drawn and the sheets are counted.
3. Engine (scripts/tests/takeoff-tc-hub015.test.mjs): 3,600 → one joint at 3,000 (two courses). 6,500 → joints at 3,000 and 6,010. 2,950 → none. Explicit heights win, and a sliver top course lowers the joint with a note. Per-wall settings keyed by a wall's id are kept by the server.
- [ ] Pass  [ ] Fail

**TC-15 — Sheets are shared across the wall, long factory edges kept (HUB 016, UI Review + engine)**
1. Axon 400 smooth wall, 6,573 long × 3,600 high, with the 10 mm H-flashing joint (TC-14). Open the wall's sheet details.
2. Expected: "N pieces cut from 8 sheets: sheets are shared across the wall, cut across their length only (the long factory edges stay), allowing 5 mm per saw cut."; the quantities show **SKU 404418 2,750 × 1,200 mm 1 sheet** for the five full-width upper pieces. The narrow upper piece at the end takes its own sheet, and the offcuts list explains it is not cut from the narrow strip's offcut (its factory edge would be on the wrong side).
3. Tap an upper cell. Expected: **From** names the shared sheet. The offcuts list reads "Sheet N (strip X): W × L mm"; a ripped strip's offcut is the sheet width less the strip and the 5 mm saw cut.
4. Engine (scripts/tests/takeoff-tc-hub016.test.mjs): 6,573 × 3,600 → 8 sheets (was 12, one per cell); a ripped strip's offcut is reused by a narrow strip needing its other factory edge; every occupied cell is covered exactly once; the plan is the same on every run.
- [ ] Pass  [ ] Fail

**TC-16 — Company cladding defaults (HUB 014, UI Review + API + engine)**
1. UI Review `?reviewRole=admin&section=timber_cladding&takeoffDefaults=1`: **Add cladding** → **Axon 400 smooth** (two taps). Expected: "Cavity · Wind N2 · Timber frame · On studs · ND nails · 10% spares · 2,450 / 2,750 / 3,000 mm · 10 mm H-flashing joints"; no stock lengths, spares, Advanced or product facts on screen; no Needs row; **Walls** available. The saved material has spares 10, those installation conditions and the joint rule.
2. **Edit** → Installation conditions → Wind class **N3** → **Hide details**. Expected: "Wind N3 (this job)", "changed for this job"; the company default is still N2 at revision 1 (nothing saved).
3. **Save as company default** → OK. Expected: "Saved as the company default for Axon 400 smooth …"; the default is now revision 2 with N3; the joint rule is saved without any wall heights.
4. Worker app as a leading hand: the defaults apply and **Edit** works, but there is no **Save as company default**. With `&takeoffWorker=office` (a login linked to an Admin account) the button shows. API: a leading hand is refused (403); the linked login saves; the route never overwrites a flashing standard or saves flashing content (400); a stale revision is refused; a job's own N3 and its link survive a reload while the default stays N2.
5. Engine/migration (scripts/tests/takeoff-tc-hub014.test.mjs, takeoff-db 211): each product gets only the answers its own assembly asks (Stria: wind; Matrix: no route, no substrate, no sheet joint); product sizes, cover and SKUs are never overwritten; migration 211 seeds the 10 James Hardie cladding products once and skips a product that already has a default.
- [ ] Pass  [ ] Fail

**TC-17 — Offcuts shared across walls; plan each wall on its own (HUB 016 follow-up, UI Review + engine)**
1. Axon 400 smooth on two walls, North and South, each 2,800 × 2,400; North with its datum at 400 (a 400 mm part strip first). Open South's sheet details.
2. Expected: "Sheets and offcuts are shared across all 2 walls of Axon 400 smooth: 6 pieces from 5 sheets in all …" and "1 piece on this wall comes from another wall's sheet or offcut". Tap strip 3: **From** reads "The offcut of North strip 1 (Sheet 1, counted on North)".
3. Tap **Plan each wall on its own**. Expected: "Each wall is planned on its own: offcuts are not used on other walls."; South → 3 sheets; strip 3 is "(its own)". Tap **Share offcuts across walls**: shared again.
4. Engine (scripts/tests/takeoff-tc-hub016b.test.mjs): two 6,573 × 3,600 walls → 15 sheets shared, 16 wall by wall; the matching-edge case 6 → 5; the same edge on both walls is refused, naming the other wall; every piece is cut once and every sheet is ordered once; the cut list names the wall; the same walls in any order give the same plan; a blocked wall shares nothing.
- [ ] Pass  [ ] Fail

**TC-18 — Line, height and runs (HUB 022, UI Review + API)**
1. `?takeoffSeed=mixed` → Timber and cladding → **Measure** → material **Axon cladding**. Expected: **Line** is chosen (there is no **Wall** tool for cladding); the panel shows "Axon cladding" and **Wall height** 3000 (the East wall's height, the last one used).
2. Leave 3000 → tap four corners of a rectangle → double-tap the start. Expected: you stay on the plan with no elevation form and no material question; the card reads "Run 1 · 4 walls · 3,000" with **Undo**; four walls are drawn; the fake server got ONE commit (`__takeoffReviewState().commits` + 1); each wall has role "wall" on Axon, the same `runId` and `seq` 1–4. **Undo** on the card takes all four walls off in one step with no drawing left ("Run 1 taken off (4 walls). Undo puts it back."); the toolbar **↶** brings them back.
3. New run: **Wall height** 2700, tap the start and two corners, change to 3600, tap two more corners → **Finish**. Expected: "Run … · 4 walls · 2,700 / 3,600"; walls 1–2 at 2,700, walls 3–4 at 3,600. Along a straight wall: 2700, tap the start and the middle, type 3000 (no Enter), tap the end → **Finish**. Expected: two walls, 2,700 then 3,000, joined exactly at the middle.
4. **Select** → tap one wall → **Wall height** 3600. Expected: only that wall changes (the other wall's record is untouched). Drag the corner it shares with the next wall. Expected: "Corner moved on 2 walls. Undo puts it back."; both walls follow and their free ends stay. One **Undo** puts the corner back on both; the height stays 3,600.
5. Leave the plan → **Walls**. Expected: the run is one line ("Run 1 · …"); tap it → its walls in tap order; walls on other materials sit under **Other walls**; the rows have no Use / Remove buttons (they are inside each wall under **Materials on this wall**); every target is at least 44 px; no sideways scroll at 390 px.
6. Offline: trace a run, change one wall's height with Select, reload → **Restore** → **Walls**. Expected: the run, its tap order and its heights are back; **North wall** still opens; **Wall by numbers** still works. An unfinished run also comes back after a reload with each tap's height and the height in the box.
7. Timber: a studs material shows **Wall** (not Line) and finishing opens the first wall's elevation, as before (SOP 20-08 TC-12).
8. API (scripts/tests/takeoff-api.test.mjs "HUB 022"): the real server keeps `runId` + `seq` in `geometry.inputs`; the run's walls share one save time and come back in tap order by `seq`; a bad `runId` or a non-whole `seq` is dropped (never guessed); saving one wall's new height leaves the other walls exactly as they were. Pure rules: scripts/tests/takeoff-tc-hub022.test.mjs. Screens: e2e/ui-review/tc-measure.spec.js and tc-walls.spec.js ("HUB 022").
9. Review fixes (screens "review fix"):
   - **Select** → wall 1 → type 3600 in **Wall height** without Enter or Done → tap wall 2. Expected: wall 1 is saved at 3,600 and the panel shows wall 2. Type 3300 → tap empty plan. Expected: wall 2 is saved at 3,300. In **Count**, a length typed without Enter counts from the next tap.
   - Finish a run → **Select** → change a wall's height → **Line**. Expected: no run card. Toolbar **↶** (the height goes back): the card is back. A corner drag also takes the card away.
   - Tap 3 corners. Expected: the cladding name is plain text (tapping it does nothing) and the panel says "To go right round, double-tap the start."
   - Clear **Wall height** → Enter. Expected: the box stays empty with "No height yet …". Tap two points, type 2700, tap a third → **Finish**. Expected: "Run 1 · 2 walls · 2,700 · 1 needs a height"; wall 1 has no height.
   - A drawing stored by the older **Wall** tool for Axon (device storage) comes back as a **Line** drawing at 3000; the next tap adds a corner; **Finish** makes a run and stays on the plan.
   - **Cavity batten** with no walls, Axon run of 4: **Walls (0)**, **Other walls (4)** already open (▾). Open Wall 2 → **Use here** is visible without scrolling → tap it → **‹ Walls**: **Walls (1)**, Other walls and the run still open.
- [ ] Pass  [ ] Fail

**TC-19 — + Window / + Door on the plan (HUB 022 step 2, UI Review + API)**
1. `?takeoffSeed=mixed` → Timber and cladding → **Measure** → **Axon cladding**. Before tracing, tap **+ Window**. Expected: "Trace the Axon cladding walls first, then add their windows and doors." and no window panel (North wall is entered by numbers).
2. **Wall height** 2700 → tap four corners of a rectangle → double-tap the start. Expected: the run card has **Undo**, **+ Window** and **+ Door**.
3. **+ Window**. Expected: **Height** 1200 and **Sill height** 1000 (the East wall's W2, the last window). Type 900 in **Sill height** (no Enter), tap one end on the first wall, then the other end about 1,200 further along. Expected: the panel is headed "Window · Axon cladding"; a blue band labelled **W1** on that wall; the card reads "W1 in Wall 3 · … wide". Fake server: one new `kind` "opening" with `parentId` = Wall 3, inputs exactly { xMm, sillMm 900, widthMm, heightMm 1200, label "W1", type "window" } (xMm and widthMm multiples of 10), no points, no contribution.
4. Tap both ends of a window on Wall 4, then on Wall 5 tapping the ends right to left. Expected: two more bands, each **W1** on its wall, 1,200 × 1,200, sill 900, nothing typed; Wall 5's offset is from Wall 5's own start. The line under the boxes reads "Tap both ends of the next window." and no card note.
5. **+ Door**. Expected: headed "Door · Axon cladding", only **Height** (empty: no door yet), the amber line "Type the door height, then tap one end." (never "the next door") and "A door sits on the floor." Tap the plan: "Type the door height first." and nothing placed. Type 2100 → tap both ends on Wall 6. Expected: an indigo band **D1**; record type "door", sillMm 0, heightMm 2100. No opening label sits on top of its own wall's name (Wall 6 runs up the page).
6. Tap a first end for another door, then the card's **Undo** (read as "Undo this end"). Expected: only the end marker goes, D1 stays. **Undo D1**: only the door goes. Toolbar **↷** puts it back.
7. **Trace more walls** → **Select** → tap Wall 3 away from its window. Expected: "W1 in this wall. Change it on the elevation." → **Open elevation**: one opening row "Window · … × 1,200 · sill 900 · from start …", the window drawn at that offset, **Openings** = width × 1.2 m². **‹ Walls** → open Wall 6: the door at sill 0.
8. Edge cases (a new L-shaped run, Wall 3 and Wall 4): after **Finish**, tap **+ Window** then the toolbar **↶**. Expected: the run is unfinished again and the Line panel shows **Finish** (not the window panel); **Finish** again. **Takeoffs ▾** → **Hide all** → **Done** → **+ Window**: "Your Axon cladding walls are hidden on this plan. Tap Show all, then add the windows and doors."; **Show all**. Then **+ Window**: tap the middle of the room → "No Axon cladding wall here. Tap on a wall you traced." and nothing saved. Tap one end on Wall 3 → **↶**: the end marker goes, the walls stay. Tap one end on Wall 3, then the middle of the room → "Tap the other end on the wall too." (the first end stays). Zoom in, tap 600 mm before the corner and about 400 mm down Wall 4 → the card "W1 in Wall 3 · 600 wide" with the amber note "W1 went round the corner, so it's on Wall 3 only (you tapped …). Undo, or change it on Wall 3's elevation."; **Trace more walls** and **+ Door** are on screen without scrolling the panel; tapping the next first end keeps the note. Tap 700 mm before Wall 4's free end and 400 mm past it → "W1 ran past the end of Wall 4, so it's cut back to the wall (you tapped …) …". Tap 1,000 mm along Wall 3 and about 2 px before its free start → "W2 in Wall 3" and no note. **Height** 1900 (sill 900, on a 2,700 wall) → tap both ends on Wall 3 → "W3 is taller than Wall 3 (2,700 high), so only the part on the wall comes off. …"; Undo W3 and W2. Tap the middle of Wall 3, then the middle of Wall 4 → "Both ends go on the same wall. Tap the other end on Wall 3." and nothing saved. Wall 3's elevation shows the clipped window with no off-wall hatching.
9. Unscaled page (open page 2 of the plan with **Page 1 ▾**): **+ Window** and **+ Door** both say "Scale this page before adding windows and doors." and nothing is saved. Page 2 with two labelled scaled regions (Ground, First): choose **Ground**, trace two walls, **Done** → **Trace on plan** (no region chosen now) → **+ Window**: the window panel opens (no "Scale this page") and two taps on Wall 3 save W1.
10. API (scripts/tests/takeoff-api.test.mjs "HUB 022 step 2"): the real server keeps a plan opening exactly (inputs unchanged, `geometry` holds only `v`, `parentId`, `inputs`), every material on the wall (Axon and battens) deducts it, an opening with plan points is still refused, and archiving one opening leaves the others. Pure rules and the engine (every material deducts, door on the floor, a finger's slip at a corner or end says nothing, joins in a straight wall, a corner-to-corner window, a window above its wall, aluminium windows never set the boxes): scripts/tests/takeoff-tc-hub022-openings.test.mjs. Screens: e2e/ui-review/tc-measure.spec.js "HUB 022 step 2".
- [ ] Pass  [ ] Fail

**TC-20 — Rectangle, Area and pages (HUB 023, UI Review + API)**
1. `?takeoffSeed=mixed&takeoffElevation=1` (page 3 is a scaled, empty elevation) → Timber and cladding → **Measure** → **Axon cladding**. Expected: the toolbar reads **Line · Rectangle · Area · Select · Pan** and has **Page 1 ▾**.
2. **Page 1 ▾**. Expected: "Choose a page", "Measure on another page. The main plan page stays the same.", page 1 marked "· main plan page · measuring now". **Back**: still page 1. **Rectangle** → **Page 1 ▾** → tap **Page 3**. Expected: straight back to measuring on "page 3 · scaled" with Rectangle still chosen; the fake server's workspace still has main page 0 and got no commit.
3. Zoom in → tap one corner, then the opposite corner 4,000 across and 3,000 up. Expected: after the first tap "Now tap the opposite corner."; then the card "Wall 3 · 12.00 m²", "4,000 wide × 3,000 high" (exactly: the corners are on the 10 mm grid) and its sheets ("4 sheets 3,000 × 1,200" for Axon 133); one commit; one `kind` "wall" with `inputs` { kind "polygon", name "Wall 3" }, four square corners, page 3's scale, and Axon "wall". The outline is drawn closed (`data-closed`, `data-area-m2` 12). **Undo this wall**: gone with nothing left drawn ("Wall 3 taken off. Undo puts it back."); **↶** brings it back.
4. **+ Window** on the card. Expected: no Height / Sill boxes; "Tap one corner of the window on the wall, then the opposite corner." Tap (2,000 across, 2,000 up) then (3,200, 3,200). Expected: "Now tap the opposite corner." after the first tap, then "W1 in Wall 3 · 1,200 × 1,200, sill 1,000"; record { xMm 1000, sillMm 1000, widthMm 1200, heightMm 1200, label "W1", type "window" }, no points. **+ Door** → (3,800, 1,100) then (4,600, 3,100). Expected: "D1 in Wall 3 · 800 × 2,100"; xMm 2800, sillMm 0, heightMm 2100. Both drawn on the elevation.
5. **Draw more walls** → **Select** → tap the left side (the side back to the first corner). Expected: "Wall 3 · 12.00 m² · Axon cladding", "Drag a corner to change the wall. The sheets update straight away.". Drag the bottom-left corner 1,400 left. Expected: while dragging the area reads 14.10 m² and the window doesn't move; after: "5,400 wide × 3,000 high · 4 corners", new sheets, no note; only that corner moved (the other three are where they were); W1 is now { xMm 2400, sillMm 1000 } and D1 { xMm 4200, sillMm 0, heightMm 2100 }: both exactly where they were on the page. One **Undo**: the corner and both openings back. Drag the bottom-right corner 500 down. Expected: "D1 is now 2,600 high, so it still reaches the floor." and "Undo puts the corner and D1 back."; D1 { sillMm 0, heightMm 2600 }, W1 sill 1,500. **Undo**.
6. **Area** on page 3 (offline: `window.__takeoffReviewOffline = true`): tap a gable's five corners (base 4,000, eaves 2,000 up, apex 3,500 up). Expected: "3 corners · 4.00 m²", "4 corners · 9.00 m²", "5 corners · 11.00 m²" and the faint closing side; tap the first corner → "Wall 3 · 11.00 m²", "4,000 wide × 3,500 high", five corners. **Select** → tap the closing side → drag the apex up 500: "12.00 m²" while dragging. Reload → **Restore**. Expected: the fake server has the outline with its five corners (the moved apex) and Axon "wall"; Measure reopens on **Page 3 ▾** with the 12 m² outline.
7. Unscaled page: `?takeoffSeed=mixed` → Axon → **Rectangle** → **Page 1 ▾** → **Page 4**. Expected: "page 4 · not scaled"; the panel says once "This page has no scale yet. Scale it, then you come straight back here to draw." with **Scale page** under it (no banner at the top, no **+ Window** / **+ Door**). A tap saves nothing and adds no second message. **Scale page** → whole page, horizontal 12,000, vertical 8,000, check 3,000 → **Save scale**. Expected: back on "page 4 · scaled" with Rectangle chosen; a 4 × 3 m rectangle reads "Wall 3 · 12.00 m²".
7a. Phone details (390 × 844). (a) Rectangle: tap a corner, then double-tap the opposite corner. Expected: one wall, its card, no new first corner; **+ Window**: tap a corner, double-tap the opposite one: W1 only, and the next tap is the first corner of the next window. (b) A 4,000 × 4,200 Rectangle on Axon 133: "Wall 3 · 16.80 m²", no sheet line, the amber "Taller than the longest sheet (3,600). Add a joint row on the elevation." (also in Select) and **Open elevation** on the card. (c) Area: three corners, then **Page 3 ▾** → **Page 1**. Expected: no commit and no wall; back on page 3 the three corners are there with Area chosen. **Page 3 ▾** → Plan list → Rev B → **Back**: "Rev C · page 3 · scaled" and the drawing is still there; **Finish** saves one three-corner wall. Each page tile is 150 high and doesn't move while the pages draw. (d) **Shiplap (random lengths)** with one takeoff hidden: **Page 1 ▾**, **Takeoffs (1 hidden) ▾** and **Fit** stay on the material's row (two rows in all; the material name shortens).
8. API (scripts/tests/takeoff-api.test.mjs "HUB 023"): the real server keeps a Rectangle (4 corners) and a five-corner Area exactly (points, `inputs.kind` "polygon", name, Axon "wall") through a reload; its quantities are 12 m² and 9.6 m² with real Axon 400 sheet sizes; a window from two corners and a later corner drag (wall + window in one commit) are kept, the window cut out where it was tapped; a bent wall that isn't an outline, and an outline with 201 corners, are refused. Pure rules and the engine (Rectangle and Area tools, square corners, a corner drag moving that corner only, the frame on every rotation and on separate X / Y scales, tapping the closing side, two-corner openings, openings staying put, a cut-back or lost opening on every side and above a lowered apex, a door that grows to the floor, area alone never bypassing the sheets, a corner drag changing the sheets): scripts/tests/takeoff-tc-hub023.test.mjs. Screens: e2e/ui-review/tc-measure.spec.js "HUB 023".
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values (fake-server snapshot; live DB only on an isolated test database)
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

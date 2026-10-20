---
sop_version: 1.4
last_reviewed: 2026-10-20
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

You choose the cladding product and how it is installed, then enter each wall — **by numbers** (length and heights) or **traced on the plan** with the heights typed in — and its openings (windows, doors). For the wall you are looking at, the app generates an elevation and lays the product out: sheets per strip (a partly used cell still uses a whole sheet), boards per course, panels on a grid, AAC panels per column, or a total LM estimate for random-length timber. You see **one view at a time — Cladding, Supports or Accessories** — and can tap any sheet, board, panel or line to see the stock it comes from and its cut size. Gross, opening and net areas are shown separately; openings are deducted once even when they overlap. Quantities flow into the schedule and the supplier order by their real unit (sheets, pieces, LM, boxes …) and are never added together.

---

## 4. Before you start

- The takeoff is open (SOP 20-01). To trace walls you need a **Ready** scaled plan page (SOP 20-02); walls by numbers need no plan.
- Know the **exact product** and size (the app lists researched products with their published widths, covers and lengths — "confirm with supplier" for availability).
- Know each wall's **length and cladding height** (the cladding boundary — not automatically slab to ceiling), sloping-top or gable heights, and each opening's **width, height, sill height and offset from the wall start**.
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

- **Fibre cement sheets (e.g. Axon):** each vertical strip takes the **shortest listed sheet** that covers its highest point. A 1 mm cut strip still uses a whole sheet. **Sheets are shared across the wall:** pieces are cut across the sheet's length only, so the two long factory edges (tongue and groove) always stay and the 1,200 mm width is never cut down to fit another piece. Short pieces that sit in the same strip width (for example the course above a joint) are cut end to end from one sheet, allowing 5 mm per saw cut. A ripped strip's offcut is reused only by a piece that needs the offcut's factory edge. The wall's sheet details say how many pieces come from how many sheets, and each cell's details say which sheet it is cut from. A wall taller than the tallest listed sheet is **blocked** until you add a joint row (Section 5G) or choose a taller listed sheet.
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
3. **Trace on plan** → the plan opens with the **Wall** tool: tap the start of the wall run and each corner, then double-tap the last point (or **Finish**). Each straight leg becomes its own wall ("Wall 3", "Wall 4" …); the first one's elevation opens next. The height last used on this takeoff is offered ("Height 2,700 mm (last used here)").
4. In the list each wall shows its shape, length, heights, openings, **Entered** or **From plan**, the materials using it and its quantities. **Heights needed** and **Needs attention** chips show what is missing.
5. **✓ Uses this material** / **Use this material** attaches or detaches the current material. **Remove** deletes the wall and its openings **for every material using it** ("Removed North and its 1 opening. Also gone from …") — **Undo** brings it back.

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
| Ordering joint-strip lines as cladding boards | The line uses the cladding's product name (Section 12) | Leave them off the order until a joint product is chosen |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Enter the wall heights to generate the elevation." / **Heights needed** | Wall has a length but no height | Type the height(s) |
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
[insert screenshot: Walls list — material status, Wall by numbers / Trace on plan, wall rows with chips]
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
- **Wall:** `takeoff_measurements` `kind` 'wall', `geometry.inputs` { kind rect|rake|gable|polygon, widthMm, heightMm | start/end | eaves/apex, name }, traced walls also store plan points + `calibration_id` / `document_id`; contribution `role` 'wall' per material using it.
- **Opening:** `kind` 'opening', `geometry.parentId` = the wall, inputs { xMm, sillMm, widthMm, heightMm, label, type }. Removing a wall archives its openings and every contribution to them.
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
- Sheets: pieces are shared within one wall (HUB 016); offcuts are not carried between walls or jobs, and are listed only. Spares (%) on sheet products are added on top of the layout in the schedule.
- Corner trims can't be tagged on walls yet — add them as "Other item (entered quantity)".
- Opening flashings are not generated from openings — add them as a flashing material (SOP 20-11); the opening sheet lists the edge lengths.
- Random-length timber LM is an estimate; minimum board length, end-joint and stagger rules are not set in the app — agree them with the supplier and installer.
- Traced walls keep their plan length; to change it, retrace. A re-scale or replaced plan flags traced walls (SOP 20-02).
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

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values (fake-server snapshot; live DB only on an isolated test database)
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

---
sop_version: 1.2
last_reviewed: 2026-10-21
app_version: takeoff-r03 (TC-R04 build, commit 8f9190f)
screenshot_status: placeholders_only
owner: Admin / Director
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP: Timber Takeoff — Rafters, Joists, Studs, Plates, Noggins and Trim

**Module:** Takeoffs (timber, cladding, aluminium and flashing from plans)  
**SOP ID:** 20-08  
**Status:** Draft  
**Priority:** High

> **Feature status (2026-10-14):** Takeoffs ship **switched off** behind the server flag `TAKEOFF_ENABLED` (SOP 20-01). A read-only check on 2026-10-14 found migration 206's tables present in production (`docs/takeoff/evidence/live-206-verification-2026-10-14.txt`). Timber takeoff is part of the **TC-R04 build on branch `takeoff-r03`** and also needs **migration 207 (`supabase/migrations/207_takeoff_generic_methods.sql`), which is NOT applied in production** — it must not be applied until the Director approves the TC-R04 release. Nothing in this SOP has been tested against the live app; Section 14 runs in UI Review Mode (mocked data).

> **Read this first:** the timber takeoff counts and lengths timber **for ordering only**. Every section size is a **manual selection** — the app never checks spans, loads, bracing, lintels or any other structural question, and nothing it shows is a structural or engineering approval.

---

## 1. Who uses this

| Action | Admin (Director) — Hub | Supervisor — Hub | Leading hand — Worker app | View-only / Admin preview |
|---|---|---|---|---|
| Open the timber setup card, the plan and the walls | Yes | Yes | Yes | Read only |
| **Add timber**, change the setup, draw member / distribution lines, tick changes, walls, counts, **Add lengths** | Yes | Yes | Yes | No |
| **Save as standard** / company timber products (SOP 20-12) | Yes | Yes | No | No |
| Order the timber (SOP 20-06) | Yes (record placed: Director only) | Yes (export only) | Yes (export only) | No |

---

## 2. When to use it

- You need to order **rafters, joists or battens** spaced at centres along a roof or floor (repeated members).
- You need **studs, plates or noggins** for a wall frame.
- You need **trim or other members** measured along a line, counted, or typed in from a cut list.
- A schedule line for timber says "needs attention", "Pitch is required." or "cannot be cut from any compatible stock".

---

## 3. What this does

You add a timber material (section, grade, treatment), choose what it is for, and measure it on the plan or on walls. For repeated members you draw **one member line** (how long each rafter or joist is) and **a distribution run** (the line they are spaced along); the app puts a tick at every member position and counts them. For walls it places studs at centres, takes out the studs inside openings, and works out plates and noggins. Every piece is then ordered on the **company stock grid — 1200 mm, then every 600 mm (1800, 2400, 3000 …)** — one stock length per member, never joined. The schedule shows quantity × stock length per section/grade/treatment, with a cut list ("18 × 5,196.2 mm — one cut from each 5,400 mm length"). Sizes are always shown as **"manual selection (not structurally checked)"**.

---

## 4. Before you start

- The takeoff is open (SOP 20-01) and, for anything traced on the plan, the page is scaled and shows **Ready** (SOP 20-02).
- Know the **section** (e.g. 90 × 45), **grade** (e.g. MGP10) or species, and **treatment** (e.g. H2, H3 or "untreated") — take them from the drawings or engineer's schedule. The app does not choose them.
- For rafters measured on the floor/roof plan: know the **roof pitch** from the drawings. A pitch is never read off the plan.
- For walls: know the **stud cut length** (or frame height and the plate thicknesses), and for noggins the **number of noggin rows** from the framing detail.
- You have edit access (Section 1).
- The database has migration 207 (Section 0 feature status). Without it, saving a member line, distribution run or wall is refused (SOP 20-07 "Not saved").

---

## 5. Step-by-step process

### A. Add a timber material and set it up

1. On the takeoff overview, in **Materials**, tap **Add timber**. The **Timber** setup card opens ("Timber · this job only"). A material called **Timber** is created straight away — there is no Save button; every valid change saves automatically ("Changes save automatically to this job only."). **Undo** / **Redo** at the top undo changes made in this card.
2. **Name** — e.g. "Rafters 90 × 45".
3. **Purpose** — tap one: **Rafters**, **Joists**, **Studs**, **Plates**, **Noggins**, **Battens**, **Trim** or **Other member**. The purpose decides the measuring tools (Section 5B–5E).
4. **Section depth** and **Section width** (mm), **Grade (e.g. MGP10)**, **Treatment (e.g. H3)**. The card says "Size: **manual selection** … The app does not check structural adequacy."
5. Repeated members (rafters, joists, battens) and studs: **Centres** (default 600 mm) and **Spacing** — **Fixed centres** or **Equal spacing** (equal bays no bigger than the centres).
6. Rafters / joists / battens — **Member length from**:
   - **Measure projection** (rafters only) — you measure the rafter **in plan**; enter the **Pitch** (°). The true length = plan length ÷ cos(pitch).
   - **Measure true length** (rafters) / **Measure length** (joists, battens) — you measure the real member length (e.g. on a section). Pitch is never applied again.
   - **Enter cut length** — type the **Cut length**; no member line is needed.
7. **Stock** (fixed): "1200 mm, then every 600 mm (1800, 2400, 3000 …) — same at every supplier." Optional: **Longest available length** (longer members are flagged unavailable — never clamped or joined) and **Grid lengths this supplier doesn't stock** (e.g. 6600 — the next grid length up is used instead; only grid lengths can be entered).
8. **More (offsets, allowance, ends, plies, supplier)** — **Start offset**, **End offset**, **End allowance (true length)** (0 unless you set one — no hidden allowance), **Plies**, **First member** / **Last member** (Included / Excluded), **Supplier**, **Size reference (schedule/drawing)** (records where the size came from, e.g. "S-101 engineer schedule"), **Availability**.
9. Read the bottom of the card: **Needs…** (what is still missing before it can be ordered — you can keep measuring), **On the order now (this job)** and the three statuses **Quantity / Installation / Procurement**. With nothing measured, Quantity reads **Not measured yet**.
10. Tap **Measure members**. Rafters / joists / battens / trim / other open the plan; studs / plates / noggins open the **Walls** screen.

> 💡 **Tip:** Changing the purpose to Joists or Battens switches the length source from "Measure projection" to a measured length — joists and battens on a plan are already their length, so no pitch is asked.

[insert screenshot: Timber setup card — Purpose chips, section, grade, treatment, centres, Member length from, Pitch, Stock fieldset]

### B. Rafters, joists and battens — member line + distribution run

1. On the plan the tool switch shows **Member | Distribution | Select | Pan** (only **Distribution | Select | Pan** when the cut length is entered). Check **Material: <name>** at the top right.
2. **Member** — zoom in and tap both ends of **one** rafter, across the roof slope, in plan, including the overhang. The panel shows e.g. "Member line 4,500 mm measured in plan (projected) → 5,196.2 mm true at 30°". Only one member line per material: a new one replaces the old ("The new member line replaces the previous one (Undo brings it back).").
3. **Roof pitch** — shown in the Member panel for projected rafters. **Type** the new value to change it; do **not** blank it out (see Section 12).
4. **Distribution** — tap the start and end of the line the members are spaced along (e.g. along the wall plate — **not** the roof perimeter). Ticks appear at every member position with a label such as **18 rafters**. Before the member length is known the label says "(preview)".
5. How the count works: usable run = run − start offset − end offset; members at 0, centres, 2 × centres … plus one at the end; the last bay can be shorter, never longer. Example: 10,000 mm at 600 mm centres → **18 rafters** (final bay 400 mm).
6. How the length works: true length (projected ÷ cos pitch, or as measured) + end allowance → the next stock length on the grid. Example: 4,500 mm at 30° → 5,196.15 mm → **5,400 mm** stock.

[insert screenshot: plan with a member line and a distribution run showing ticks and "18 rafters"]

### C. Change one member (tick) or the whole run

1. Tap **Select**, then tap a tick. The panel shows e.g. "Rafter at 1,200 mm along the run — Needs 5,196.15 mm · 1 piece here".
2. **Remove rafter** — that position is left out (the tick greys out, the count drops). **Put it back** restores it.
3. **Duplicate** — adds a second piece at that position (e.g. a doubled rafter); **Remove a copy** takes it off. If the calculation can't include duplicates you will see "… saved here, but this version of the calculation doesn't count duplicates yet — the order doesn't include it." Do not rely on the duplicate in that case.
4. **Length for this rafter only** — type the length that member needs (e.g. a longer one at a hip). It shows "(length changed for this one)"; **Use the measured length** clears it. These changes stay tied to that position; if the run or spacing later changes and the position no longer exists, the run says "1 member change no longer matches a station … — review." Tap **Clear them** after checking.
5. **‹ Whole run — N rafters: spacing, ends, offsets** opens the run's own settings: **Start offset**, **End offset**, **Member at the start**, **Member at the end**, and **Equal bays on every run of this material** (a material rule — it re-spaces every distribution run of this timber).
6. If an offset is longer than the run you will see "No members counted — see why below." with the reason.

### D. Studs, plates and noggins (walls)

1. **Measure members** on a studs / plates / noggins material opens the **Walls** screen (same screen as cladding — SOP 20-09). Add a wall with **Wall by numbers** (name, shape, length, then height) or **Trace on plan** (Wall tool: tap each corner, double-tap the last point or **Finish**; each straight leg becomes its own wall).
2. Make sure the wall uses this timber: open it and check **Materials on this wall** shows **✓ Uses …** (tap **Use … here** if not). The wall rows no longer carry these buttons (HUB 022), and walls on other materials are folded under **Other walls**.
   - Timber keeps the **Wall** tool. Cladding traces with **Line** instead, which sets the height before you trace and keeps you on the plan (SOP 20-09 Section 5C).
3. **Studs** — in the setup card: **Stud cut length (or frame height)** and **That is: Stud cut / Frame height**. Frame height needs **Bottom plate(s) thickness** and **Top plate(s) thickness** (never assumed). Blank uses the wall height as the stud cut length. On the wall, the **Supports** view shows a line per stud (e.g. a 3,600 mm wall at 600 centres → 7 studs).
4. Openings (add them on the wall — SOP 20-09 Section 5C): studs strictly inside an opening are **removed** (greyed "Removed stud"). The **Supports** view counts the studs ("Studs 90 × 45: 5 studs at 2,400 mm."). **More**, at the bottom of the wall, says what they cover ("Studs 90 × 45: base studs only; opening framing incomplete.") and holds the wall's note "W1: base studs only; opening framing incomplete — needs its framing detail." (notes, statuses and the drawing's explanations are folded there, as on cladding walls: SOP 20-09 Section C4). Tapping a stud shows its cut length; there is no stepping through the studs, and **‹ Previous wall** / **Next wall ›** at the bottom go wall to wall. **Kings, jacks, trimmers, sills and lintels are never guessed** — add them as their own timber material or entered lengths (Section 5E) from the framing detail.
5. **Plates** — **Plates per wall: Bottom + top** or **Bottom + double top**; each wall gives one piece per layer at the wall length (e.g. 3,600 wall → 2 × 3,600). Plates can also be measured with **Run** or counted with **Count** on the plan.
6. **Noggins** — **Stud centres** and **Noggin rows** (from the framing detail — "never inferred"). Each clear bay (centres − stud width) is one noggin per row, ordered on the stock grid (600 centres, 45 wide → 555 mm cuts from 1,200 mm stock). Without rows you will see "Enter the number of noggin rows or select it from a reviewed framing detail…".

### E. Trim, other members, counts and typed-in lengths

1. **Trim / Other member** on the plan: tools **Run | Count | Select | Pan**.
2. **Run** — tap the start and each corner, double-tap the last point (or **Finish**). **A plan corner is a joint for timber**: every straight leg becomes its own piece ("2 straight pieces added — each corner is a joint, so every straight leg is its own piece. Undo removes them all."). An extra tap part-way along a straight leg is merged, not a new piece.
3. **Count** — type **Cut length of each piece** first, then tap each place. Each tap is one piece, ordered on the next stock length.
4. **Typed-in lengths** — on the overview tap **Add lengths** on the timber row, type the length and **Qty**, tap **Add**. For timber this is a **cut length**: it is put on the stock grid (2,350 → 2,400; 500 → 1,200; 1,200.1 → 1,800). Entered lengths are listed under the form with a **Remove** button each.

### F. Check the schedule

1. Overview → **Open schedule**. Each timber material is its own group: name, "Timber · 90 × 45 · MGP10 · H2", "Size: manual selection (not structurally checked)", the three statuses (**Quantity / Installation / Ordering**), notes and problems.
2. Rows read **quantity × what is bought**, e.g. "18 pieces · 90 × 45 MGP10 H2 — 5,400 mm length". Tap a row for the cut list ("Cuts: 18 × 5,196.2 mm — one cut from each 5,400 mm length"), where it came from ("Distribution run …", "Member line … · projected") and **Show on plan** / **Show on wall**.
3. **How this was worked out** lists every step (true length, usable run, members, stock).
4. "Note: The longest available stock isn't set for this product — confirm it before ordering." is advisory — set **Longest available length** in the setup card once the supplier confirms it.

---

## 6. What happens next

- Every change autosaves (SOP 20-07). The server recalculates every count and length from the drawn lines, walls and rules — it never trusts numbers sent from the phone.
- The schedule and **Review & export order** show the timber lines by unit (pieces); the supplier PDF lists the **stock lengths to supply**, and the separate **Site appendix (cutting & setout)** lists the timber cut list (SOP 20-06).
- Nothing is ordered, sent or emailed. Nobody is notified.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Drawing the distribution run around the roof perimeter | The perimeter looks like "the roof" | Draw the line the members are spaced **along** (e.g. the wall plate) |
| Measuring the rafter's true length on the plan and also entering a pitch | Mixing "projection" and "true length" | On a plan choose **Measure projection** + pitch; on a section choose **Measure true length** (no pitch) |
| Blanking the **Roof pitch** on the plan screen to "remove" it | Expecting blank = not entered | Type the correct pitch; blank on the plan screen saves 0° (Section 12) |
| Treating the stud count as the full framing package | The wall shows studs | Base studs only — add kings, jacks, trimmers and lintels from the framing detail |
| Typing a cut length in **Add lengths** and expecting that exact length to be ordered | The help text says "used exactly" | For timber the cut length goes up to the next stock length (Section 12) |
| Expecting the app to pick the section | It looks like a design tool | Section, grade and treatment come from the drawings / engineer |
| Leaving **Noggin rows** blank | Assuming it follows cladding support spacing | Enter the rows from the framing detail |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Enter the timber section (e.g. 90 × 45)." / "Enter the grade or species." / "Enter the treatment (or "untreated")." | Setup incomplete | Fill those fields in the setup card |
| "Pitch is required." (schedule, no rafter line) | Projected rafters with no pitch | Enter the pitch (setup card **Pitch** or plan **Roof pitch**) |
| "Measure one member (the member line) or enter the cut length." | No member line | Draw one with **Member**, or choose **Enter cut length** |
| "Draw the distribution run the members are spaced along." | No distribution run | Draw one with **Distribution** |
| "No members counted — see why below." | Offsets longer than the run, or both ends excluded on a tiny run | Fix the offsets in **‹ Whole run …** |
| "N member change(s) no longer match(es) a station … — review." | The run or spacing changed after you changed single members | Check, then **Clear them** and redo the changes |
| "… cannot be cut from any compatible stock (… Unavailable — no clamping or splice.) …" | A member is longer than **Longest available length** (or every grid length up to it is marked unavailable) | Change the detail, or set a supplier-confirmed longer length |
| "Only grid lengths (1200, 1800, 2400 …) can be marked unavailable — off-grid sizes are never added." | Typed an off-grid length (e.g. 6500) | Enter grid lengths only |
| "W1: base studs only; opening framing incomplete — needs its framing detail." | A wall with studs has an opening | Add the opening framing from the detail as its own timber / entered lengths |
| "Enter the number of noggin rows …" | Noggins without rows | Enter **Noggin rows** |
| "Frame A: enter the bottom and top plate thickness to turn the frame height into a stud length." | Frame height chosen without plate thicknesses | Enter both, or switch to **Stud cut** |
| Rafters suddenly ordered shorter (e.g. 4,800 instead of 5,400) | The plan **Roof pitch** was blanked (saved as 0°) | Re-type the pitch |
| Tick label says "(preview)" | Member length not known yet | Draw the member line, enter the pitch or the cut length |
| "Not saved: One or more values are not valid for this field." on a member/distribution/wall | Migration 207 missing on that database | Apply migration 207 to that (non-production) database; production waits for the Director |

---

## 9. Related modules

- [20-01 Takeoffs overview, access & switching it on → who can use timber takeoff](20-01_takeoff_overview.md)
- [20-02 Set up plans and scale a page → a Ready scale before tracing members](20-02_set_up_and_scale_plans.md)
- [20-09 Cladding walls, openings and the generated elevation → the Walls screen used for studs, plates, noggins](20-09_cladding_walls_and_elevation.md)
- [20-05 Length schedule and splitting → the schedule window](20-05_length_schedule_and_split.md)
- [20-06 Export a supplier order and record it as placed → ordering timber, site appendix cut list](20-06_export_and_record_orders.md)
- [20-07 Saving, recovery and conflicts → the save chip](20-07_saving_recovery_conflicts.md)
- [20-12 Company product catalogue → company timber products](20-12_company_product_catalogue.md)

---

## 10. Screenshot placeholders

[insert screenshot: overview Materials section with Add timber / Add cladding / Add aluminium]
[insert screenshot: Timber setup card — Needs…, On the order now, three statuses]
[insert screenshot: plan — Member tool panel "Member line 4,500 mm measured in plan (projected) → 5,196.2 mm true at 30°"]
[insert screenshot: plan — distribution run with ticks "18 rafters"]
[insert screenshot: tick panel — Remove rafter, Duplicate, Length for this rafter only]
[insert screenshot: Whole run panel — offsets, Member at the start/end, Equal bays]
[insert screenshot: wall Supports view — studs, two removed inside W1]
[insert screenshot: schedule — Rafters group "18 pieces · 90 × 45 MGP10 H2 — 5,400 mm length" with cut list]

---

## 11. Automation notes

- **Add timber** upserts a `takeoff_job_materials` row at once: `spec` { family "timber", purpose "rafters", section {}, stock { kind "grid", minMm 1200, incrementMm 600 } }, `rules` { centresMm 600, lengthSource "projected" }, method `repeated_members@2` (studs → `wall_frame@1`, plates / noggins / trim / other → `linear_stock@1`). Each setup edit is a further upsert (autosave, SOP 20-07).
- **Member line:** `takeoff_measurements` `kind` 'member', two plan points, `geometry.inputs.mode` 'projected' | 'true'; contribution `role` 'member'. One per material — a new one archives the previous (`archived_at`).
- **Distribution run:** `kind` 'distribution', two points, inputs { startOffsetMm, endOffsetMm, includeStart, includeEnd, spacing, overrides[] }; contribution `role` 'distribution'. Tick changes are `overrides` entries { station, removed | lengthMm | duplicate } on that measurement.
- **Walls / openings:** `kind` 'wall' (`role` 'wall') and 'opening' (`parentId` = wall) — see SOP 20-09.
- **Runs / counts / typed lengths:** timber Run finishes as one `kind` 'polyline' per straight leg (`role` 'primary'); Count = `kind` 'count'; Add lengths = `kind` 'manual'.
- **Calculation** (`shared/takeoff/engine/timber.js`, `dispatch.js`, run in the browser for display and again on the server for every save/export): positions T1 (count = ceil(usable ÷ centres) + 1), length T2 (projected ÷ cos pitch), stock T3 = max(1200, ceil(L ÷ 600) × 600) within the longest available / unavailable list; one stock piece per member; studs T4; plates / noggins T5. Sizing provenance is `manual` unless a **Size reference** is entered — never "verified".
- **Schedule / order lines:** generic purchase lines `unit` 'piece', `item.description` "90 × 45 MGP10 H2 — 5,400 mm length"; order lines carry `unit` + `item` (migration 207).
- No email, notification or file is created.

---

## 12. Edge cases and limits

- **Known issue — Roof pitch on the plan screen:** blanking the **Roof pitch** field on the Member panel saves **0°** (the setup card's **Pitch** field correctly treats blank as "not entered"). Always type a value there. Reported to the owner 2026-10-14.
- **Known wording issue — Add lengths for timber:** the form's help says "Entered lengths are used exactly — no allowance or rounding." For timber the entered length is a **cut length** that is ordered on the next stock length (2,350 → 2,400). The schedule shows the stock length and the cut list shows the cut.
- Only one member line per repeated-member material; for rafters of different lengths use another material, change single ticks (**Length for this rafter only**), or enter hip/valley/jack lengths individually.
- Disconnected distribution runs each restart their own spacing; there is no automatic phase matching between runs.
- Studs: base studs only. Corners, T-junctions, brace panels and opening framing are explicit additions.
- Stock is one piece per member — members are never joined to reach a length, and a member longer than the longest available length is **unavailable**, never clamped.
- The overview's "Length schedule … pcs" total adds every unit together (pieces, sheets, bars, LM). Read quantities in the schedule window, not that total.
- Plan lines need a Ready scale on the current plan revision; a re-scale or replaced plan flags them (SOP 20-02).
- Undo/redo on the plan covers the current visit to that screen (up to 100 steps); the setup card has its own Undo/Redo.

---

## 13. Owner of the process

Admin / Director  
Next review date: 2027-04-14

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] **UI Review Mode, your own server — never port 5180 (the owner's preview) and never production.** From the repo: `VITE_UI_REVIEW_MODE=true npx vite --port <PORT> --strictPort` (agents in parallel may use a no-HMR config with `--config <your vite.nohmr.config.mjs>`). Playwright needs `PLAYWRIGHT_BROWSERS_PATH=0` and `UI_REVIEW_PORT=<PORT>`. Stop your server when done.
- [ ] Phone viewport 390 × 844 with touch (375 × 812 for layout checks).
- [ ] Open `http://localhost:<PORT>/carpentry/cjb-1/takeoff?reviewRole=admin&takeoffSeed=mixed` (SYNTHETIC mixed job). It contains **Rafters 90 × 45** (rafters, 600 centres, projected, 30°) with a seeded **10,000 mm distribution run** (`m-dist`) and a **4,500 mm projected member line** (`m-mem`), and **Trimmers** (other member) with an entered **4 × 2,350 mm**.
- [ ] "Expected record" in UI Review Mode = the fake server's copy. In the page console: `await (await fetch("/api/takeoff/workspaces/ws-1")).json()` → `snapshot.materials / measurements / contributions`; `window.__takeoffReviewState()` → `{ revision, commits, measurements }`. A full page reload re-seeds the fake data.
- [ ] Plan positions: PDF point for (x mm, y mm) on page 1 = `{ x: 120 + x × 0.0283464567, y: 150 + y × 0.0283464567 }`; screen position = `document.querySelector("[data-takeoff-viewport]").takeoffViewport.toScreen(pt)` + the viewport's bounding rect; zoom with `.takeoffViewport.zoomOn(pt, factor)`. Taps land on whole pixels — zoom in before drawing and allow ±40 mm on drawn lengths.
- [ ] Optional live-stack run (local only, isolated test DB with migrations **206 and 207**, `TAKEOFF_ENABLED=true`, `BLH TEST` job) for the DB checks marked "Live DB".

### Test cases

**TC-01 — Happy path (seeded rafters → schedule)**
1. On the overview tap **Open schedule**.
2. Find the group **Rafters 90 × 45** and tap the row starting **18 pieces**.
3. Expected result: row "18 pieces · 90 × 45 MGP10 H2 — 5,400 mm length"; "Timber · 90 × 45 · MGP10 · H2"; "Size: manual selection (not structurally checked)"; chips **Quantity: Calculated**, **Installation: Not specified**, **Ordering: Ready to order**; "Quantities only — installation details are not verified by the app."; "Note: The longest available stock isn't set for this product — confirm it before ordering."; expanded row "Cuts: 18 × 5,196.2 mm — one cut from each 5,400 mm length", "Comes from" lists "Distribution run — Distribution run · 10,000 mm" and "Member line — Member line · 4,500 mm · projected"; **Show on plan** button.
4. Tap **How this was worked out**: includes "4,500 mm projected ÷ cos 30° = 5,196.15 mm true length" and "10,000 mm usable → 18 members at 600 mm centres, final bay 400 mm".
5. Expected record: material `mat-raf` `methodKey` "repeated_members", `rules` { centresMm 600, lengthSource "projected", pitchDeg 30 }; contributions `c-dist` role "distribution", `c-mem` role "member". Live DB: `takeoff_measurements` kinds 'distribution' and 'member'; `takeoff_contributions.role` 'distribution' / 'member'.
- [ ] Pass  [ ] Fail

**TC-02 — Empty / invalid required fields**
1. Overview → **Add timber**. Read **Needs…**.
2. Type `6500` in **Grid lengths this supplier doesn't stock (optional)** and press Enter; then `6600`.
3. Type `0` in **Centres** and press Enter.
4. Close the card. Open the mixed job's **Rafters 90 × 45** → **Setup**, clear **Pitch** (blank, Enter), then **Open schedule**.
5. Expected result: step 1 — Needs lists "Enter the timber section (e.g. 90 × 45).", "Enter the grade or species.", "Enter the treatment (or "untreated")." and Quantity shows **Not measured yet**; step 2 — "Only grid lengths (1200, 1800, 2400 …) can be marked unavailable — off-grid sizes are never added." for 6500, accepted for 6600; step 3 — "Enter a number greater than 0." and centres stay 600; step 4 — the Rafters group shows "Needs before ordering:" with "Pitch is required." and "Nothing to order yet — see what it needs above."
6. Expected record: step 2 → new timber material `spec.stock.unavailableMm` = [6600] only; step 4 → `mat-raf.rules.pitchDeg` absent/null (not 0).
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission (one member line; Add lengths twice)**
1. Overview → **Measure** → **Material: …** → **Rafters 90 × 45**. Tool **Member**: zoom in and tap two points 3,500 mm apart vertically (e.g. (6200, 3000) and (6200, 6500)).
2. Overview → on **Trimmers** tap **Add lengths**, type 2350 / Qty 4 → **Add** (same as the seeded entry).
3. Expected result: step 1 — "The new member line replaces the previous one (Undo brings it back)." and exactly **one** member line is drawn (never two); **Undo** brings the 4,500 line back. Step 2 — the list under the form shows **two** separate "4 × 2,350 mm" rows each with **Remove** (entered lengths are not merged or de-duplicated); the schedule shows "8 pieces · 90 × 45 MGP10 H2 — 2,400 mm length".
4. Expected record: step 1 → one live contribution with role "member" for `mat-raf`; step 2 → two `kind` "manual" measurements for `mat-trim`.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Open `/worker/takeoff/carpentry/cjb-1?takeoffSeed=mixed` (leading hand). Check the timber rows and the **Add timber** card.
2. Open `/worker/takeoff/carpentry/cjb-1?takeoffWorker=ordinary`.
3. Expected result: step 1 — **Add timber**, **Setup**, **Add lengths**, **Remove** are available; **Save as standard** is **not** shown on any row, and the setup card has no **New company product** button. Step 2 — "You don't have access to this." / "Takeoffs are for leading hands and office staff." and no takeoff content.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (autosave + recalculation)**
1. Note `window.__takeoffReviewState().revision` (R) and `.commits` (C).
2. Rafters 90 × 45 → **Setup** → change **Centres** to 450 (Enter). Wait for the chip **Saved**.
3. **Open schedule**.
4. Expected result: chip **Saving…** then **Saved**; revision = R + 1 and commits = C + 1; Rafters group now "24 pieces · 90 × 45 MGP10 H2 — 5,400 mm length" (10,000 mm at 450 → 23 bays + 1); "How this was worked out" says "24 members at 450 mm centres".
5. Expected record: `mat-raf.rules.centresMm` = 450. Live DB: `takeoff_job_materials.rules.centresMm` 450, `takeoff_workspaces.revision` + 1. No email/notification.
- [ ] Pass  [ ] Fail

**TC-06 — Tick changes: remove, duplicate, length override**
1. **Measure** → material **Rafters 90 × 45** → **Select** → tap the **3rd** tick on the seeded run (1,200 mm along).
2. Type `6000` in **Length for this rafter only** (Enter), then tap **Duplicate**.
3. Tap the **6th** tick → **Remove rafter**. Tap **‹ Whole run — …**.
4. Tap **Done** → **Open schedule** → Rafters group.
5. Expected result: step 1 panel "Rafter at 1,200 mm along the run" / "Needs 5,196.15 mm · 1 piece here"; step 2 "Needs 6,000 mm (length changed for this one) · 2 pieces here" and **Use the measured length** / **Remove a copy** appear; step 3 run label "18 rafters" (18 stations − 1 removed + 1 copy) and the panel "18 rafters at 600 mm centres"; step 4 rows "2 pieces · 90 × 45 MGP10 H2 — 6,000 mm length" and "16 pieces · 90 × 45 MGP10 H2 — 5,400 mm length", footer "18 pieces". (If the tick panel instead says the calculation "doesn't count duplicates yet", record it — the order must then show 1 × 6,000 + 16 × 5,400.)
6. Expected record: `m-dist.inputs.overrides` holds { station …1200, lengthMm 6000, duplicate 1 } and { station …3000, removed true }.
- [ ] Pass  [ ] Fail

**TC-07 — Stock grid 1200 + 600 and unavailable stock**
1. Overview → **Trimmers** → **Add lengths**: add 500 × 1, 1200 × 1, 1201 × 1 and 4200 × 1 (one at a time). **Open schedule** → Trimmers.
2. Back → Trimmers → **Setup** → in the **Stock** box set **Longest available length (optional)** = 4800 (Enter) → **Close**. On the overview **Add lengths** 4801 × 1. **Open schedule** → Trimmers.
3. Expected result: step 1 rows "2 pieces … — 1,200 mm length" (500 and 1,200), "1 piece … — 1,800 mm length" (1,201), "1 piece … — 4,200 mm length" (4,200 stays 4,200) plus the seeded "4 pieces … — 2,400 mm length"; step 2 the group shows **Ordering: Stock unavailable** with "Needs before ordering:" containing "cannot be cut from any compatible stock" and "Unavailable — no clamping or splice."; no 4,800 or 5,400 line is added for the 4,801 piece, and the "longest available stock isn't set" note is gone.
4. Expected record: manual measurements keep the entered lengths (1201 stays 1201 in the record — only the order line is on the grid); `mat-trim.spec.stock.maxMm` = 4800.
- [ ] Pass  [ ] Fail

**TC-08 — Length source: true length and entered cut length (pitch never applied twice)**
1. Rafters 90 × 45 → **Setup** → **Member length from: Measure true length**. **Open schedule**.
2. Back → **Setup** → **Enter cut length**, **Cut length** 4300. **Measure members**.
3. Expected result: step 1 "18 pieces … — 4,800 mm length" and the explanation "4,500 mm measured true length — already sloped, pitch not applied"; step 2 the plan tools are **Distribution | Select | Pan** (no Member) and the schedule shows "18 pieces … — 4,800 mm length" with "4,300 mm entered cut length — pitch not applied".
- [ ] Pass  [ ] Fail

**TC-09 — Studs on a wall with an opening (base studs only)**
1. Overview → **Add timber** → Purpose **Studs**, section 90 × 45, grade MGP10, treatment H2 → **Measure members**.
2. **Wall by numbers**: name "Frame A", length 3600 (Enter), **Wall height** 2400 (Enter).
3. **Add opening** → Offset from wall start 1000, Sill height 900, Width 1200, Height 1200.
4. Expected result: step 2 — the **Supports** view is selected and shows 7 stud lines; tap one → "Cut length 2,400 mm"; step 3 — 2 studs show "Removed stud" (inside the opening), 5 remain; the Supports view reads "Studs 90 × 45: 5 studs at 2,400 mm."; **More** at the bottom of the wall (closed until tapped) shows "Studs 90 × 45: base studs only; opening framing incomplete." and the note "W1: base studs only; opening framing incomplete — needs its framing detail." and Quantity is not "Calculated" (shows Incomplete) and Ordering is not "Ready"; at the bottom "1 of 1" with **Review order ›**.
5. Expected record: wall measurement `inputs` { kind "rect", widthMm 3600, heightMm 2400, name "Frame A" } with contribution role "wall"; opening with `parentId` = the wall.
- [ ] Pass  [ ] Fail

**TC-10 — Trim run: a corner is a joint**
1. **Measure** → material **Trimmers** (tool **Run** selected). Zoom in. Tap (1500, 2000), (2700, 2000), (4000, 2000), (4000, 3500) → **Finish**.
2. **Undo**, then **Redo**. Switch to **Select** and tap the first leg.
3. Switch to **Count**.
4. Expected result: step 1 — before finishing "This run makes 2 pieces."; after **Finish** "2 straight pieces added — each corner is a joint, so every straight leg is its own piece. Undo removes them all." and two straight lines labelled ≈2,500 and ≈1,500 (±40); step 2 — one Undo removes both and reopens the drawing (4 points); Select shows "A straight piece — a corner is a joint, so trace the next leg as its own run." with no "+" markers; step 3 — the field is **Cut length of each piece** (not "Finished length (no allowance added)").
5. Expected record: +2 measurements of `kind` "polyline", each 2 points, role "primary" for `mat-trim`.
- [ ] Pass  [ ] Fail

**TC-11 — Known issue check: blank Roof pitch on the plan**
1. **Measure** → material **Rafters 90 × 45** → **Member** tool → clear **Roof pitch** and press Enter.
2. Expected result (current build): the panel reads "… → 4,500 mm true at 0°" and the stored `mat-raf.rules.pitchDeg` is **0**. Record this as the known issue in Section 12 (the desired behaviour is "not entered", as in the setup card). Re-type 30 and confirm "→ 5,196.2 mm true at 30°".
- [ ] Pass  [ ] Fail

**TC-12 — Timber walls keep the Wall tool (HUB 022)**
1. Add a **Studs** material (as TC-09) → **Measure members** → **Trace on plan**.
2. Expected: the tools are **Wall | Select | Pan** (no **Line**); the panel says the height last used here (e.g. "Height 3,000 mm (last used here)").
3. Tap three points of an L-shaped wall run, then double-tap the last point. Expected: two walls ("Wall N", "Wall N+1"), each one straight leg; the first wall's elevation opens, as before.
4. **‹ Walls**: the two walls are listed on their own (timber walls have no run); open one → **Materials on this wall** shows **✓ Uses Studs …**.
5. Screen test: e2e/ui-review/tc-measure.spec.js "Wall tool (timber studs)".
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values (fake-server snapshot; live DB only on an isolated test database)
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

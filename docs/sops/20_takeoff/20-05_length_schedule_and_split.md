---
sop_version: 2.2
last_reviewed: 2026-10-26
app_version: takeoff-r03 (HUB 029/030 build, commits f33c7b5 to a3a7ee2)
screenshot_status: needs_replacement
owner: Admin / Director
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP: Length Schedule and Splitting Long Pieces

**Module:** Takeoffs (timber, cladding, aluminium and flashing from plans)  
**SOP ID:** 20-05  
**Status:** Draft  
**Priority:** High

> **Feature status (2026-10-14):** Takeoffs ship **switched off** behind the server flag `TAKEOFF_ENABLED` (SOP 20-01). A read-only check on 2026-10-14 found migration 206's tables present in production (`docs/takeoff/evidence/live-206-verification-2026-10-14.txt`). **v2.0 describes the TC-R04 build (branch `takeoff-r03`)**: the schedule now also lists timber, cladding, battens, aluminium and accessories by their real unit; continuous flashing runs are split **on the plan** (SOP 20-11); entered and counted lengths can now be split here too. These need **migration 207 (`supabase/migrations/207_takeoff_generic_methods.sql`), which is NOT applied in production** and must not be applied until the Director approves the TC-R04 release. Nothing in this SOP has been tested against the live app.

---

## 1. Who uses this

- **Admin (Director)** and **Supervisor** — in the Hub.
- **Leading hand** — in the Worker app.
- View-only users (and an admin previewing a leading hand) can open and read the schedule, but the **Split / Edit split / Review split / Remove split** buttons and the split undo arrows are hidden.

---

## 2. When to use it

- After measuring, to check what will be ordered before ordering: flashing as **quantity × finished length**, everything else as **quantity × unit × what is bought** (pieces, sheets, bars, LM, boxes …).
- A line is labelled **long piece**, **over ceiling**, **needs attention**, or a material shows "Needs before ordering:".
- A straight run, an entered length or a counted length is longer than the supplier can make and must be split into shorter pieces with laps.
- A box says "Placed, but no longer in the takeoff".
- You want to see where a line came from (**Show on plan** / **Show on wall**).

---

## 3. What this does

The schedule lists every flashing piece you need, grouped by material and profile, as **quantity × finished length** (for example "4 × 4,600 mm") — different lengths are never lumped together as "linear metres". Every timber, cladding, batten, aluminium or accessory material is its own group with its three statuses (**Quantity**, **Installation**, **Ordering**) and rows by the unit you buy; units are never added together. Tapping a row shows exactly where it came from. A long piece can be **split** into pieces with a lap at each joint: for a measured straight run the pieces must cover the run's finished length (its allowance is **not** added again); for entered or counted lengths the pieces must cover the finished length and you choose how many of the identical pieces to split. **Continuous runs are split on the plan, not here** (SOP 20-11). "Ordered" counts come only from orders the Director recorded as placed.

---

## 4. Before you start

- Runs, walls, counts or manual lengths exist on the takeoff (SOPs 20-03, 20-08 to 20-11).
- For splitting: know the lap the supplier / installation instructions require at each joint — **there is no default lap**.
- Know the material's limits (**Rules** / **Details**): handling flag (default **above 6,000 mm**) and order ceiling (default **9,000 mm**).
- Edit access for splitting (SOP 20-01).

---

## 5. Step-by-step process

### A. Open and read the schedule

1. On the overview, the **Length schedule** section shows a total ("N pcs · X LM") and **Open schedule** / **Review & export order**. "Some lengths need attention before they can be ordered." means at least one line has a problem. (The overview total adds every unit together — read the real quantities in the schedule window.)
2. Tap **Open schedule**. The **Length schedule** window opens (**Back** top-left, save chip top-right). Its heading is **Length schedule** for a flashing-only takeoff ("X LM total"), **Flashing lengths and materials** when there are other materials too ("X LM flashing"), or **Materials to order** when there is no flashing.
3. **Flashing groups** (one per material/profile). Each line shows:
   - **Qty ×** and the **finished length** in mm (longest first).
   - **long piece** (amber) — longer than the handling flag; kept whole, needs care handling/transport.
   - **over ceiling** (red) — longer than the order ceiling; **blocks ordering** until split or the rule is changed.
   - **needs attention** (red) — another problem (scale not checked, page re-scaled since the run was measured, plan replaced, profile/material incomplete, split out of date …).
   - On the right: "N ordered · M left" (+ "· N surplus") or "not ordered" — counted **only** from orders the Director has recorded as placed.
4. Tap a flashing line to expand it: each problem in words and every source piece, e.g. "Measured 4,312 + allowance 200 → order 4,600 mm", "Counted 3 × 2,400 mm (finished length, no allowance)", "Entered 3 × 4,312 mm (finished length, no allowance)", or for a continuous run "Run R-xxxxxxxx: 10,000 mm tight along the path · 1 corner(s) at 6,000 mm — cut/folded on site, no extra pieces" with each piece. Each group ends with "N pieces · X LM".
5. **Other material groups** (timber, cladding, AAC, foam, timber cladding, battens, aluminium, accessories): name, kind and spec line, provenance ("Size: manual selection (not structurally checked)", "Cutting: 3 mm kerf, 0 mm end trim"), the three status chips, "Quantities only — installation details are not verified by the app.", **Needs before ordering:** (blocking) and **Note:** lines (advisory), accessory scope, per-wall areas ("North wall: net 12.15 m² (gross 12.96 − openings 0.81) · Entered length and heights"), spares actually added, cut-plan summaries, then rows such as "18 pieces · 90 × 45 MGP10 H2 — 5,400 mm length", "4 sheets · … — 2,750 × 1,200 mm", "2 bars · equal-angle 50 × 50 × 3 — 6,500 mm length (no joins)", "57 LM · … — random lengths (LM)" (**estimate — not a piece count**), "3 boxes · …". The group footer totals each unit separately ("18 pieces", "4 sheets"). **How this was worked out** shows every calculation step.
6. A cladding's own **battens**, **H-flashing** and **foam tape** (worked out from its walls — SOP 20-09, Section F2) are rows in the cladding's group, after its sheets or boards, with their product codes ("2 pieces · 90 × 35 H3 pine batten — 5,700 mm length" (HUB 030: Blue Leaf's pine, bought once for the whole job), "1 roll · Hardie™ 50mm Foam Back Sealing Tape, 25 m roll, code 304560"). The footer totals each unit on its own ("4 sheets · 1 roll"). Their spares are their own and named ("Spares added: 1 sheet, 2 sheets, 7 battens, 1 H-flashing length (10%) …"), and so are their cutting plans ("Battens: cuts need … mm …", "H-flashing: cuts need … mm …"). With two Axon claddings on one job the foam tape and H-flashing are worked out once for the job and listed under the first cladding; the other says "its foam tape is ordered once for the job with …". **Show on wall** from a batten row opens the wall on **Supports**.
6a. **Needs before ordering (HUB 029):** each item is a button that opens its fix, for example "Wall 3: enter the Wall height ›" opens Wall 3 with **Wall height** ready to type, and **Done** comes back to the schedule. **Installation** reads "Not checked by the app" (grey). It never stops an order, and the installation notes are one short line, not a list of fixes.
7. Tap a row of another material to see its note, cut list ("Cuts: 18 × 5,196.2 mm — one cut from each 5,400 mm length" or "Cut plan (planned — not cut yet): …"), **Comes from** (each source by name and kind) and **Show on plan** / **Show on wall** / **Show openings** (only when there is somewhere to show it).

| Finished length (default rules) | Shows | Can it be ordered? |
|---|---|---|
| 6,000 mm | nothing | Yes |
| 6,001 mm | **long piece** | Yes — kept whole, flagged |
| 9,000 mm | **long piece** | Yes — kept whole, flagged |
| 9,001 mm | **over ceiling** | **No** — split it or (authorised) change the material rule |

[insert screenshot: Length schedule — flashing group with "1 × 7,200 mm long piece", "4 × 4,600 mm", expanded explanation; a timber group with statuses and rows]

### B. Split a straight run, an entered length or a counted length

1. Expand the line and tap **Split** next to the source:
   - a measured **straight run** ("Measured …") opens **Split this run**: "This run needs X mm of coverage (its allowance is already included — pieces don't get another one). Enter each piece and the lap at each joint."
   - an **entered** or **counted** length opens **Split these pieces**: "Each piece is a finished X mm length — the split pieces must cover it (no allowance is added). Enter each piece and the lap at each joint." With more than one identical piece choose **How many of the N pieces to split** ("N stay whole at X mm.").
2. Type **Piece 1 length**, **Lap at joint 1** and **Piece 2 length** (all mm). **Add piece** adds a third piece (each extra piece adds another lap); **Remove piece** takes the last one off. Minimum 2, maximum 20 pieces.
3. Get the lap from the supplier or the product's installation instructions ("there is no default lap").
4. Read the result box:
   - Green: "Pieces 3,700 + 3,700 − laps 200 = coverage 7,200 mm — exact" (or "(N mm over)").
   - Red: "… = coverage 7,000 mm. Pieces cover 7,000 mm but 7,200 mm is needed." or "A piece is longer than the 9,000 mm order ceiling."
5. Piece lengths are rounded **up** to the material's increment (e.g. 3,650 becomes 3,700) and coverage is recalculated.
6. Tap **Apply split** (only possible when the box is green). The pieces replace what they split in the schedule — never both. The expanded line reads e.g. "7,200 mm split into 3,700 + 3,700 (laps 200 mm)" or "1 of 3 × 4,312 mm split into 2,200 + 2,300 (laps 100 mm) · 2 kept whole".
7. The **↶ / ↷** arrows at the top of the schedule undo / redo split changes; each is saved straight away.

> 💡 **Tip:** Coverage = total of the pieces − total of the laps. For a measured run it must reach the run's **finished** length (which already includes the 200 mm allowance). Don't add another allowance to the pieces.

[insert screenshot: Split this run — two pieces, lap at joint 1, green coverage box, Apply split]

### C. Change or undo a split

1. Expand the line showing the split.
2. **Edit split** reopens the sheet with your pieces and laps; change them and **Apply split**.
3. **Remove split** puts the source back to its original pieces.

### D. When a split goes out of date

1. If the run is moved, the entered/counted length changes, or the material rules change after splitting, the line shows **needs attention** — "The run or rules changed after this split — review the split." (the source text ends "— source changed, review") — and can't be ordered.
2. Tap **Review split**, check the pieces against the new required length, and **Apply split** again (or **Remove split**).
3. Right after you apply a split to several identical entered/counted pieces the line can show "source changed, review" until the chip says **Saved** (the server stamps the split when it saves it). If it is still there after **Saved**, review it.

### E. Continuous runs — split on the plan

1. A continuous run (SOP 20-11) has **no Split button** here. A piece over the maximum shows "over the maximum — split it on the plan".
2. Tap **Show on plan** — the plan opens with the run selected and framed — and split it there (tap the red part, or move the split).

### F. "Placed, but no longer in the takeoff"

1. If a box "Placed, but no longer in the takeoff" appears, a recorded order covers something the takeoff no longer has: "A measurement, product or stock changed after these were ordered. The placed orders are unchanged — check whether these can still be used before ordering more."
2. Each entry says what was **bought** and on which order, e.g. "18 pieces · 90 × 45 MGP10 H2 — 5,400 mm length · placed on FO-001001".
3. Check the measurements/products that changed and talk to the Director before ordering more (SOP 20-06). Placed orders are never changed automatically.

---

## 6. What happens next

- The schedule is what **New order** uses to pre-fill quantities (still needed = required − placed − already on another exported order) (SOP 20-06).
- Any line with a problem (over ceiling, needs attention, a material that "Needs before ordering") blocks an order-ready supplier PDF until fixed; a draft PDF can still be exported.
- Applying or removing a split autosaves like any other edit (SOP 20-07). Nothing is ordered, sent or emailed.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Adding 200 mm to each split piece | Habit from measured runs | The run's allowance is already in the required length — pieces get none |
| Guessing the lap | No default is given | Use the supplier's / installation manual's lap |
| Reading the LM total (or the overview "pcs") as the order | They are summaries | Order by the quantity lines, unit by unit |
| Raising the order ceiling to avoid a split | Quicker than splitting | Only change the ceiling when the supplier confirms that length |
| Ignoring "needs attention" / "Needs before ordering" | They look like warnings only | Those lines block the supplier PDF — fix them first |
| Splitting before the run is final | Moving the run later invalidates the split | Finish adjusting runs, then split |
| Looking for Split on a continuous run | The old runs had it | Split continuous runs on the plan (SOP 20-11) |
| Treating an LM estimate as a board count | It looks like a number of boards | Random-length LM is total metres — "no piece count is claimed" |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| **Apply split** stays grey | A piece or lap is blank, or coverage is short / a piece is over the ceiling | Fill every field; make pieces longer or laps smaller |
| "Pieces cover 7,000 mm but 7,200 mm is needed." | Coverage below the finished length | Lengthen a piece |
| "A piece is longer than the 9,000 mm order ceiling." | A split piece is still too long | Use more pieces |
| "Joint 1 lap is longer than a piece it joins." | Lap bigger than a piece | Check the lap |
| "Joint 1 lap must be 0 mm or more." / "Enter a number of 0 or more." | Negative lap | Enter 0 or more |
| "Enter a lap for every joint between pieces." / "A split needs at least two pieces." / "A split can have at most 20 pieces." | Server rejected an incomplete split | Reopen **Edit split** and complete it |
| "The run or rules changed after this split — review the split." / "— source changed, review" | Source or rules changed after splitting | **Review split** → **Apply split** (or wait for **Saved** right after applying — Section 5D) |
| "The split pieces do not cover the run." | Saved split no longer valid | **Edit split** or **Remove split** |
| "A piece is longer than the order ceiling — split it or change the material rule." | Line over the ceiling | Split it (Section B or, for a continuous run, on the plan) or, if authorised, change the rule |
| "over the maximum — split it on the plan" | Continuous run piece over the ceiling | **Show on plan** → split at the limit (SOP 20-11) |
| **Split** button missing | Continuous run (split on the plan) or view-only access | See Section E; ask an editor |
| "Needs before ordering: …" on a material group | Product facts, a rule or a measurement are missing | Fix what it names in that material's setup (SOPs 20-08 to 20-10) |
| "Ordering: Not ready — a line needs attention" | The material's status is ready but one of its lines has a problem (e.g. re-scaled page) | Open the line and fix the named problem |
| "No lengths yet — measure runs or walls, count pieces or add manual lengths." | Nothing measured | SOP 20-03 |
| "The schedule couldn't be worked out: …" | A calculation error | Note the message, reload, report it |
| "N ordered · 0 left" but you still need more | A measurement was added after the order | Start a **New order** for the remaining pieces (SOP 20-06) |

---

## 9. Related modules

- [20-03 Measure runs and count pieces → the sources of flashing lines](20-03_measure_runs_and_count.md)
- [20-11 Continuous flashing runs and splitting at the limit → split continuous runs on the plan](20-11_continuous_flashing_runs.md)
- [20-04 Flashing profiles, materials and company standards → handling flag and order ceiling rules](20-04_profiles_materials_standards.md)
- [20-08 Timber](20-08_timber_takeoff.md) · [20-09 Cladding walls](20-09_cladding_walls_and_elevation.md) · [20-10 Aluminium](20-10_aluminium_cutting_sheet.md) → the other material groups
- [20-06 Export a supplier order and record it as placed → ordering from the schedule](20-06_export_and_record_orders.md)

---

## 10. Screenshot placeholders

[insert screenshot: overview Length schedule section — total, "Some lengths need attention…" warning, Open schedule, Review & export order]
[insert screenshot: schedule heading "Flashing lengths and materials" with flashing lines and long piece / over ceiling / needs attention chips]
[insert screenshot: a timber / cladding group — statuses, Needs before ordering, rows by unit, Comes from, Show on wall]
[insert screenshot: Split these pieces — How many of the 3 pieces to split, green coverage box]
[insert screenshot: split applied — "7,200 mm split into 3,700 + 3,700 (laps 200 mm)" with Edit split and Remove split]
[insert screenshot: continuous run expanded — pieces, no Split button]
[insert screenshot: "Placed, but no longer in the takeoff" box]

---

## 11. Automation notes

- The schedule is calculated (in the browser for display, and again on the server for every save/order — client totals are never trusted) by `shared/takeoff/schedule.js` `computeWorkspace`, which dispatches each material to its method in `shared/takeoff/engine/` (flashing runs and paths, timber, cladding, supports, accessories, aluminium allocator).
- **Flashing grouping:** pieces share a line only when material method, product, product code, finish, BMT, colour, colour code, perforation, profile shape (a profile, its reverse and its mirror image count as the same part; the coating on the other face does not) **and** finished length all match. Each line is a "bucket" (spec + finished length).
- **Generic lines** (`generic: true`): one per material + unit + stock size + identity, with `unit` ('piece', 'sheet', 'bar', 'lm', 'm2', 'box' …) and `item` { description, stockLengthMm, note }. Units are never summed together.
- **Flags:** above the handling threshold → `handlingFlag` (long piece); above the order ceiling → `ceilingExceeded` (blocks order-ready export).
- **Split:** stored on the source's `takeoff_contributions` row as `split` = { pieces [mm…], laps [mm…], originals (manual/count: how many of the identical pieces), sourceFinishedMm, version, sourceSignature }; the server stamps `sourceSignature` on save, re-checks the split (coverage, ceiling, laps) and refuses invalid ones with HTTP 400 `SPLIT_INVALID`. **Remove split** sets `split` NULL. A continuous run's splits live on the measurement (`inputs.splitsMm`) instead (SOP 20-11).
- **Stale split:** the split is tied to the exact source it was made for (signature); a changed source marks it `split_stale` and blocks ordering until reviewed.
- **Ordered / left:** from `takeoff_placement_allocations` of placements with `status` 'placed' only (drafts and exports never count); the schedule re-reads `GET …/workspaces/:id/orders` when it opens. Buckets ordered but no longer required are listed under "Placed, but no longer in the takeoff" (`reconcile`).
- No email, notification or file is created.

---

## 12. Edge cases and limits

- Splits: 2–20 pieces; one lap per joint; laps must be 0 or more and shorter than both pieces they join.
- Straight runs, entered lengths and counts can be split here; continuous runs are split on the plan.
- Piece lengths are rounded up to the material increment before coverage is checked.
- The app never chooses a split for you (no "best split").
- Changing the material's rules or the source makes an existing split stale.
- Surplus inside a length that is still needed shows as "N ordered · 0 left · N surplus"; only lengths that disappeared entirely go into "Placed, but no longer in the takeoff".
- Total LM (flashing only) is rounded to 3 decimal places and is a summary only; the overview "pcs" total mixes units.
- Random-length LM lines are estimates; minimum board length, end-joint and stagger rules aren't set in the app.

---

## 13. Owner of the process

Admin / Director  
Next review date: 2027-04-14

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] **UI Review Mode** (TC-01 to TC-04, TC-06 to TC-11): your own server — **never port 5180 and never production** — `VITE_UI_REVIEW_MODE=true npx vite --port <PORT> --strictPort` (or the agents' no-HMR config); Playwright with `PLAYWRIGHT_BROWSERS_PATH=0`, `UI_REVIEW_PORT=<PORT>`. Phone 390 × 844 touch.
- [ ] Default flashing job `http://localhost:<PORT>/carpentry/cjb-1/takeoff?reviewRole=admin`: **Apron flashing** (2 × 4,600 from two 4,312 runs; entered 3 × 4,312) and **Barge flashing** (1 × 7,200 from a 7,000 run, 1 × 6,100, counted 2 × 2,400). Mixed job: add `&takeoffSeed=mixed` (timber, Axon, battens, aluminium, random-length shiplap, trimmers, two continuous runs).
- [ ] Records: `await (await fetch("/api/takeoff/workspaces/ws-1")).json()` (snapshot: `contributions[].split`) and `window.__takeoffReviewState()` (`commits`). A reload re-seeds.
- [ ] **Review-mode limitation:** the mock server does not stamp a split's source signature, so a split of **several identical** entered/counted pieces shows "source changed, review" in UI Review Mode even after saving. Use single pieces (or runs) there; check multi-piece splits on the live stack.
- [ ] **Live stack** (TC-05): isolated test DB with migrations 206 + 207, `TAKEOFF_ENABLED=true`, `BLH TEST` job, SQL access. Never production.

### Test cases

**TC-01 — Happy path (split the 7,200 run)**
1. Default job → **Open schedule** → expand "1 × 7,200 mm" (**long piece**) → **Split**.
2. Piece 1 = 3700, Lap at joint 1 = 200, Piece 2 = 3700 → **Apply split**.
3. Expected result: sheet **Split this run** — "This run needs 7,200 mm of coverage (its allowance is already included — pieces don't get another one)."; green "Pieces 3,700 + 3,700 − laps 200 = coverage 7,200 mm — exact"; the Barge group then shows "2 × 3,700 mm" and **no** 7,200 line; expanded: "7,200 mm split into 3,700 + 3,700 (laps 200 mm)" with **Edit split** / **Remove split**; group footer "5 pieces · 18.300 LM".
4. Expected record: contribution `c-3` has `split` { pieces [3700, 3700], laps [200], sourceFinishedMm 7200, version 1 }; `__takeoffReviewState().commits` + 1. Live DB: `takeoff_contributions.split` as above, `split_version` 1, measurement unchanged.
- [ ] Pass  [ ] Fail

**TC-02 — Empty / invalid input**
1. Open **Split** on the 7,200 run; leave **Lap at joint 1** blank; then type -10; then try 3600 / 200 / 3600.
2. Expected result: **Apply split** disabled while blank; -10 → "Enter a number of 0 or more."; 3600 + 3600 − 200 → red "… coverage 7,000 mm. Pieces cover 7,000 mm but 7,200 mm is needed." and **Apply split** disabled.
3. Expected record: `c-3.split` unchanged (null).
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission (apply the same split again)**
1. After TC-01 tap **Edit split** → **Apply split** without changes.
2. Expected result: still exactly "2 × 3,700 mm" (never 2 × 3,700 **plus** 1 × 7,200); the stored `split.version` increases by 1 (expected, not a duplicate); commits + 1.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Ordinary worker: `/worker/takeoff/carpentry/cjb-1?takeoffWorker=ordinary`.
2. Optional read-only: init script that sets `capabilities.edit = false` on every JSON response; open the default Hub URL → **Open schedule** → expand "1 × 7,200 mm".
3. Expected result: step 1 — "You don't have access to this." / "Takeoffs are for leading hands and office staff."; step 2 — lines and explanations visible, **no** Split / Edit split / Remove split buttons and no undo arrows.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (server validates splits, live stack)**
1. Via API commit an invalid split for the 7,200 run: `pieces: [3600, 3600], laps: [200]`.
2. Measure a straight run of raw 8,801 mm (finished 9,100, **over ceiling**) and via API commit a split on it with `pieces: [9100, 400], laps: [100], sourceFinishedMm: 9100`.
3. Apply a valid split to an entered 3 × 4,312 line (1 of 3) from the UI and wait for **Saved**.
4. Expected result: step 1 → HTTP 400 `SPLIT_INVALID` "Pieces cover 7,000 mm but 7,200 mm is needed."; step 2 → HTTP 400 "A piece is longer than the 9,000 mm order ceiling."; no DB change, `revision` unchanged; step 3 → after **Saved** the line is **not** "needs attention" and the stored `split.sourceSignature` is set.
- [ ] Pass  [ ] Fail

**TC-06 — Remove split restores the original once; undo arrows**
1. After TC-01 tap **Remove split**; then the schedule's **↶**; then **↷**.
2. Expected result: "1 × 7,200 mm" (long piece) once — not 1 × 7,200 plus 2 × 3,700; ↶ brings "2 × 3,700 mm" back; ↷ removes it again; each step is a save (commits + 1 each).
3. Expected record: `c-3.split` null after Remove.
- [ ] Pass  [ ] Fail

**TC-07 — Handling flag, order ceiling and splitting an entered length**
1. Default job → **Barge flashing** → **Add lengths** (one at a time): 6000 × 1, 6001 × 1, 9000 × 1, 9500 × 1. **Open schedule**.
2. Expand "1 × 9,500 mm" → **Split** → 4800 / 100 / 4800 → **Apply split**.
3. Expected result: 6,000 — no label; 6,001 — **long piece**; 9,000 — **long piece**; 9,500 — **over ceiling** with "A piece is longer than the order ceiling — split it or change the material rule." and **Split** next to "Entered 1 × 9,500 mm (finished length, no allowance)"; the sheet is **Split these pieces** — "Each piece is a finished 9,500 mm length — the split pieces must cover it (no allowance is added)."; box "Pieces 4,800 + 4,800 − laps 100 = coverage 9,500 mm — exact"; after applying, "2 × 4,800 mm" replaces the 9,500 line.
- [ ] Pass  [ ] Fail

**TC-08 — Grouping never merges different lengths or specs**
1. Default job → **Open schedule**.
2. Expected result: Apron: "2 × 4,600 mm" and "3 × 4,312 mm" on separate lines; Barge (a different colour) is its own group; each footer shows its pieces and LM ("5 pieces · 22.136 LM", "4 pieces · 18.100 LM"); heading **Length schedule** with "40.236 LM total".
- [ ] Pass  [ ] Fail

**TC-09 — Other materials by unit, honest statuses (mixed job)**
1. Mixed job → **Open schedule**.
2. Expected result: heading **Flashing lengths and materials** with "… LM flashing"; **Rafters 90 × 45** "18 pieces · 90 × 45 MGP10 H2 — 5,400 mm length", chips Quantity: Calculated / Installation: Not specified / Ordering: Ready to order, "Note: The longest available stock isn't set …"; **Axon cladding** "4 sheets · James Hardie Axon 133 smooth SKU 403932 — 2,750 × 1,200 mm" and "1 roll · Hardie™ 50mm Foam Back Sealing Tape, 25 m roll, code 304560" with "North wall: net 12.15 m² (gross 12.96 − openings 0.81) · Entered length and heights" and the note "North wall: battens come from Cavity battens (set up by hand), so the automatic battens from Axon cladding aren't added on this wall — nothing is counted twice." (no Cavity Batten row of its own); **Window angle 50 × 50 × 3** "2 bars · equal-angle 50 × 50 × 3 — 6,500 mm length (no joins)" with "minimum stock proven"; **Shiplap (random lengths)** "57 LM … estimate — not a piece count", Quantity: Estimate, and its own "7 pieces · Hardie Cavity Batten 70 × 19, code 405307 — 3,000 mm length" (battens at 450); **Cavity battens** "Needs before ordering:" incl. "fixings not quantified — detail required", Ordering: Product details missing; footers per unit only ("4 sheets · 1 roll", "18 pieces", "7 pieces · 57 LM") — never "pieces + sheets".
3. Tap the Rafters row: "Cuts: 18 × 5,196.2 mm — one cut from each 5,400 mm length", **Comes from** "Distribution run — Distribution run · 10,000 mm" and "Member line — Member line · 4,500 mm · projected", **Show on plan**; tap the Trimmers row: "Entered lengths — Entered · 4 × 2,350 mm" and **no** Show button.
- [ ] Pass  [ ] Fail

**TC-10 — Continuous run rows; split on the plan**
1. Mixed job → **Open schedule** → **Apron flashing** group.
2. Expected result: rows "1 × 9,000 mm" (**long piece**), "1 × 1,400 mm", "1 × 3,200 mm"; no 750 / 6,200 / 4,200 rows; expanding 9,000 shows "Run R-m-pl1: 10,000 mm tight along the path · 1 corner(s) at 6,000 mm — cut/folded on site, no extra pieces", "Piece 1: 0 → 8,800 mm, tight 8,800 → order 9,000 mm", "Piece 2: 8,800 → 10,000 mm, tight 1,200 → order 1,400 mm" and **no** Split button; the "2 × 4,600 mm" straight-run line still offers **Split**; **Show on plan** on the 9,000 row opens the plan titled **Apron flashing** with the run selected.
- [ ] Pass  [ ] Fail

**TC-11 — Stale split blocks ordering**
1. After TC-01: **Back** → **Measure** → **Select** → tap the 7,200 run (Barge, (0, 6000)–(7000, 6000)) → drag one end at least 30 px along the run so its order length changes (e.g. to 7,300+) → **Done** → **Open schedule**.
2. Expected result: the Barge line shows **needs attention** with "The run or rules changed after this split — review the split." and **Review split**; **Review split** → the sheet asks for the new required length → enter valid pieces → **Apply split** clears it.
- [ ] Pass  [ ] Fail

**TC-12 — Placed, but no longer in the takeoff (mixed job)**
1. Mixed job → **Review & export order** → **New order** → set **Cavity battens** quantity 0 → **Save order details** → **Export supplier PDF** → **Record order placed…** → Export 1 → **Record order placed**.
2. **Back** → **Rafters 90 × 45** → **Setup** → Grade "MGP12" → wait for **Saved** → **Close** → **Open schedule**.
3. Expected result: box "Placed, but no longer in the takeoff" with "A measurement, product or stock changed after these were ordered. The placed orders are unchanged …" and an entry "18 pieces · 90 × 45 MGP10 H2 — 5,400 mm length · placed on FO-001001"; the Rafters row now reads "18 pieces · 90 × 45 MGP12 H2 — 5,400 mm length" **not ordered**; Axon "4 sheets ordered · 0 left".
- [ ] Pass  [ ] Fail

**TC-13 — Needs before ordering are buttons (HUB 029, UI Review)**
1. `?reviewRole=admin&section=timber_cladding&takeoffSeed=cladding-wall3` → **Open schedule** → the first **Axon 400 smooth** group.
2. Expected: "Needs before ordering:" holds a button naming Wall 3 ("… enter the Wall height ›"); **Installation: Not checked by the app** (grey); no installation sentence among the needs; every batten row reads "90 × 35 H3 pine batten — …".
3. Tap the Wall 3 button → Wall 3 with **Wall height** focused → 3600 → **Done**. Expected: back on the schedule, and the group reads **Ordering: Ready to order**.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

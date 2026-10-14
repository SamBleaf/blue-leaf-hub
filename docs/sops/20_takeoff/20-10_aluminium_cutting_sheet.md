---
sop_version: 1.0
last_reviewed: 2026-10-14
app_version: takeoff-r03 (TC-R04 build, commit 8f9190f)
screenshot_status: placeholders_only
owner: Admin / Director
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP: Aluminium Profiles and the Cutting Sheet

**Module:** Takeoffs (timber, cladding, aluminium and flashing from plans)  
**SOP ID:** 20-10  
**Status:** Draft  
**Priority:** High

> **Feature status (2026-10-14):** Takeoffs ship **switched off** behind the server flag `TAKEOFF_ENABLED` (SOP 20-01). A read-only check on 2026-10-14 found migration 206's tables present in production (`docs/takeoff/evidence/live-206-verification-2026-10-14.txt`). Aluminium cutting is part of the **TC-R04 build on branch `takeoff-r03`** and also needs **migration 207 (`supabase/migrations/207_takeoff_generic_methods.sql`), which is NOT applied in production** — it must not be applied until the Director approves the TC-R04 release. Nothing in this SOP has been tested against the live app; Section 14 runs in UI Review Mode (mocked data).

> **Read this first:** the cutting sheet plans **square cuts** from whole stock bars for ordering and site cutting. The 50 × 50 × 3 angle, the 6,500 mm bar and the window allowances are the owner's example settings, not supplier or installation verification. Mitred or notched ends, fixing and installation of the profile are **not checked by the app**.

---

## 1. Who uses this

| Action | Admin (Director) — Hub | Supervisor — Hub | Leading hand — Worker app | View-only / Admin preview |
|---|---|---|---|---|
| Open the cutting sheet, Copy / Download CSV | Yes | Yes | Yes | Yes |
| **Add aluminium**, profile & cutting settings, openings, cuts, offcuts, window detail | Yes | Yes | Yes | No ("You can view this cutting plan but not change it.") |
| **Save as standard** / company aluminium products (SOP 20-12) | Yes | Yes | No | No |
| Export / record the bar order (SOP 20-06) | Yes (record placed: Director only) | Export only | Export only | No |

---

## 2. When to use it

- You need aluminium angles (or other profiles) cut from stock bars — e.g. window jambs and sills on cladding.
- You want to know **how many bars to buy** and the **site cutting sheet** (which cut comes from which bar, for which window).
- You have offcuts on hand and want them used before buying new bars.
- A cutting sheet says "Estimate", "can't be cut from stock" or "Best plan found — minimum not proven".

---

## 3. What this does

You add an aluminium material (profile, finish, stock length, saw kerf), then add the openings (by size and count, or tick openings already on walls) and any extra straight cuts. A **window detail** turns each opening into its finished cuts — by default **left jamb + right jamb + bottom** (head left out), with **+100 mm total per jamb**: a 600 × 2,400 window needs 2,500 + 2,500 + 600. Every cut from every opening of that material on the job is **pooled into one cutting plan**: the app packs the cuts into the fewest 6,500 mm bars, allowing for the saw cut, and says whether that is a **proven minimum** or the **best plan found**. Each bar lists its cuts in order and its **planned remainder** — which is never treated as stock until you measure and record the real offcut. No piece is ever joined: a cut longer than the bar is "can't be cut from stock".

---

## 4. Before you start

- The takeoff is open (SOP 20-01). Openings already entered on cladding walls (SOP 20-09) can be reused.
- Know the profile (legs and thickness), finish/colour, the **stock bar length** your supplier sells, and your **real saw kerf** (blade cut width). A cutting plan can be **ordered only after the kerf is entered and confirmed**.
- Know the window detail for this job: which edges get an angle and the allowance on each (the 100 mm per jamb is an example — confirm it for the job).
- Edit access and migration 207 on the database.

---

## 5. Step-by-step process

### A. Add the aluminium material and its settings

1. Overview → **Materials** → **Add aluminium**. The **Aluminium** card opens with a material called **Aluminium angle 50 × 50 × 3**. Changes save automatically; **Undo** / **Redo** at the top.
2. **Name**, **Leg A**, **Leg B**, **Thickness**, **Finish / colour**, **Stock length** (default 6500 — "Each required piece is ONE continuous length — never joined.").
3. **Cutting settings**: **Saw kerf** (blank until you enter it), **End trim** (default 0 — length squared off each new bar), **Keep offcuts from** (default 300 — remainders shorter than this are scrap).
4. Tick **The saw kerf above is confirmed for this job** once the kerf is your real blade width. Changing the kerf later clears the tick ("Changing it needs confirming again."). Until it is confirmed: "An estimate can use the kerf as entered; an order needs it confirmed." (or with no kerf: "… the cutting plan is an estimate with no kerf and can't be ordered.").
5. **Window detail (per opening)**: tap the edges to cut — **Left jamb**, **Right jamb**, **Bottom**, **Head** — and set **Jamb allowance (total per jamb)** (default 100) and **Bottom allowance** (default 0). "Allowances are this job's detail, not a universal rule."
6. **Supplier**, **Availability**. Read **Needs…** (e.g. "Confirm the saw kerf for the cutting plan (an estimate can use 0, ordering can't).") and the statuses.
7. Tap **Openings & cutting**. (Later you can open the same screen from the overview row with **Cutting**.)

### B. Add the openings and cuts

1. **Summary** (top): "Buy N × 6,500 mm", status chips (**Quantity**, **Installation**, **Ordering**), and an amber **Estimate.** banner with **Confirm saw kerf** while the kerf isn't confirmed. **Profile & cutting settings** opens the card again.
2. **Openings** → **Add openings by size**: **Opening label (optional)** (blank = W01, W02 …), **Opening width**, **Opening height**, **How many** → **Add opening** / **Add N openings**. Each opening shows its **nominal** size ("Opening 600 × 2,400 mm (nominal W × H) · standalone") and its **Finished cuts** separately (e.g. "Left jamb 2,500 — Bar 1").
3. **Openings already on walls** (if the job has cladding walls): tick each window to include it (**Include all windows** for all). The wall keeps owning the opening; its cuts say which wall.
4. **Window detail (all openings): … Change** — the same edge buttons and allowances as the card, applied to every opening of this material.
5. **Edit** on an opening → **Label**, **Width**, **Height**, **Remove opening** (or **Remove from this aluminium** for a wall's opening — "size changes apply there too").
6. **Extra straight cuts** → **Add a straight cut**: **Cut label (optional)**, **Finished cut length**, **Cut quantity** → **Add cut**. "Square cut, used exactly as entered — no allowance added." **Measure runs on the plan** lets you draw straight runs instead (each straight leg is its own piece).

### C. Read the cutting sheet

1. **Cutting sheet** (chip **Kerf 3 mm confirmed** or **Estimate — kerf not confirmed**).
2. The blue box: **Buy 1 × 6,500 mm** (+ "uses N existing offcut(s)" when offcuts are used), the proof chip — **Minimum proven** or **Best plan found — minimum not proven** — and **Lower bound: N bar(s)**.
3. Totals: **Total required length**, **Cut loss (saw kerf …)**, **End trim** (if any), **Reusable remainder (≥ 300 mm)**, **Scrap**, and a check line ("6,500 mm = 6,400 mm cuts + 12 mm cut loss + 88 mm remainder"). **Objective:** says how the plan was chosen ("Minimise new bars …"). "Pooled: every opening, run and cut of this material on this job … — one plan, not one per window."
4. Tap a bar (e.g. **Bar 1**) to see its cuts in order with the saw cut after each ("+ 3 saw", or "uses bar end" when the last piece ends exactly at the bar end) and "Planned remainder 891 mm — reusable. Not stock until this bar is actually cut."
5. Tap a cut to highlight its opening; tap a cut chip on an opening to jump to its bar.
6. **Can't be cut from the 6,500 mm stock — pieces are never joined …** lists any piece that doesn't fit, with the reason ("Longer than the 6,500 mm length — can't be cut, never joined." or "Fits the 6,500 mm length only without the 5 mm end trim …"). Those pieces are **not** in the bar count; Ordering shows **unavailable stock**.
7. **How this was worked out** explains the search (e.g. "First-fit-decreasing start: 3 new bars; branch-and-bound result: 2 new bars …").
8. **Copy cutting sheet** / **Download CSV** — the site cutting sheet (bar, cut order, cut, opening, wall, edge, length, saw cut after, planned remainder). Before the kerf is confirmed the file name ends **-ESTIMATE** and the kerf column says "ESTIMATE: kerf not confirmed".

### D. Offcuts — planned versus physical

1. A bar's **planned remainder** is a plan, not stock. Only offcuts you **record** are used as stock.
2. To record a real offcut after the bar is cut: open the bar → **Record remaining offcut** → measure the real piece → **Measured offcut length** (required — it is never taken from the plan), **Where it is (optional)** → **Record offcut**.
3. To add offcuts you already have: **Offcuts on hand** → **Add an offcut you have**: **Offcut label**, **Measured offcut length**, **Where it is**, **Identical pieces** → **Record offcut** / **Record N offcuts** (each piece is its own record, used at most once).
4. Each offcut shows **In this plan: <cut>** or **Available — not used by this plan**. **Mark consumed** takes it out of stock; **Mark available** returns it; **Remove** deletes the record.
5. Offcuts belong to this aluminium material only (same profile and finish); they are never used for a different finish or another job.

### E. After a bar order is placed

1. Once the Director records a bar order as placed (SOP 20-06), the summary says e.g. "Already ordered: 2 × 6,500 mm on placed orders. That covers this plan."
2. If the plan grows: "… Still to order: 1 more bar." If it shrinks: "… 1 bar more than this plan now needs — placed orders are not changed."

---

## 6. What happens next

- Every change autosaves and the plan recalculates at once (undo restores the previous plan exactly). The server re-checks the plan before any export.
- The schedule shows one line per bar length ("2 bars · equal-angle 50 × 50 × 3 — 6,500 mm length (no joins)") with "Suggested cut plan — minimum stock proven" and the cut / saw-loss / left-over summary.
- The **supplier PDF orders whole bars only**; the **Site appendix (cutting & setout)** of the same export lists every bar's cuts and remainders (SOP 20-06). Nothing is sent or ordered by the app.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Ordering from an **Estimate** plan | The kerf wasn't confirmed | Enter the real kerf and tick it confirmed |
| Adding the jamb allowance at each end | Thinking "+100 each end" | The jamb allowance is the **total** per jamb |
| Recording the planned remainder as an offcut without measuring | It looks exact | Measure the real piece after cutting; type that length |
| Expecting LM ÷ 6.5 bars | Habit | Pieces can't be joined — the plan packs real cuts (3 × 3,400 needs 3 bars) |
| One material per window | Thinking per opening | Use one material for all windows with the same profile/finish — cuts are pooled |
| Leaving doors in with a bottom cut | The window detail applies to every opening | Remove the door or untick its wall opening if it has no bottom angle |
| Duplicate labels | Typing W01 twice | Rename — the cutting sheet must be unambiguous |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| **Estimate.** "The saw kerf isn't confirmed — this plan uses 0 mm …" | Kerf missing or not ticked | **Confirm saw kerf** → enter kerf → tick confirmed |
| "Quantity: incomplete — saw kerf not confirmed" / "Ordering: not ready — saw kerf not confirmed" | Same | Same |
| "Longer than the 6,500 mm length — can't be cut, never joined." | A cut longer than the bar | Change the detail or choose a supplier-confirmed longer stock |
| "Fits the 6,500 mm length only without the 5 mm end trim …" | End trim leaves too little | Change the end trim or detail |
| "+ N piece(s) can't be cut from stock — not in this count" | Unavailable pieces | Fix those pieces before ordering |
| "Best plan found — minimum not proven" | The search ran out of time on a big set | Order from it if acceptable; it is never worse than the starting plan |
| "Enter the opening width and height first." | Add pressed with a blank size | Type width and height |
| "Enter how many openings of this size (1 to 50)." / "Enter how many pieces of this length (1 to 500)." | Count/quantity blank or invalid | Type a whole number |
| "Enter the finished cut length first." | Blank cut length | Type the length |
| "Enter the measured length of the offcut." | Blank offcut length | Measure and type it |
| "Another opening has the same label — rename one so the cutting sheet is clear." | Duplicate label | Rename one |
| "This is a door: the window detail gives it a bottom cut too. …" | A door with Bottom ticked | Leave it out if the door has no bottom angle |
| "Copying isn't available here — use Download instead." | Browser blocks clipboard | **Download CSV** |
| "No connection …" | Offline | Edits are kept on the device (SOP 20-07) |

---

## 9. Related modules

- [20-09 Cladding walls, openings and the generated elevation → wall openings reused here](20-09_cladding_walls_and_elevation.md)
- [20-12 Company product catalogue → a company aluminium product](20-12_company_product_catalogue.md)
- [20-05 Length schedule and splitting → the bar line on the schedule](20-05_length_schedule_and_split.md)
- [20-06 Export a supplier order and record it as placed → bars on the order, cuts in the site appendix](20-06_export_and_record_orders.md)
- [20-07 Saving, recovery and conflicts → device recovery after a reload](20-07_saving_recovery_conflicts.md)

---

## 10. Screenshot placeholders

[insert screenshot: Aluminium setup card — profile, stock length, Cutting settings with kerf confirmed tick, Window detail edges]
[insert screenshot: Summary — "Buy 1 × 6,500 mm", status chips, Estimate banner]
[insert screenshot: opening W01 — nominal 600 × 2,400 and finished cuts 2,500 / 2,500 / 600 with bar names]
[insert screenshot: cutting sheet — Minimum proven, Lower bound, totals, Bar 1 expanded with cuts and planned remainder]
[insert screenshot: unavailable piece banner "Can't be cut from the 6,500 mm stock — pieces are never joined"]
[insert screenshot: Offcuts on hand — Rack A 891 mm In this plan; Record remaining offcut form]
[insert screenshot: Download CSV / Copy cutting sheet]

---

## 11. Automation notes

- **Add aluminium** upserts a `takeoff_job_materials` row: `spec` = { family "aluminium", profile { shape "equal-angle", aMm 50, bMm 50, tMm 3 }, stockLengthMm 6500, kerfMm null, kerfConfirmed false, endTrimMm 0, minRetainedOffcutMm 300, windowPreset { left, right, bottom true, head false, jambAllowanceTotalMm 100, bottomAllowanceMm 0 } }, method `linear_stock@1`.
- **Openings by size:** `takeoff_measurements` `kind` 'opening' (no parent), inputs { widthMm, heightMm, label, type "window" }, contribution `role` 'opening'. **Wall openings ticked:** only a contribution `role` 'opening' is added (the wall keeps the measurement).
- **Extra cuts:** `kind` 'manual' (finished length × quantity), `role` 'primary'. **Plan runs:** `kind` 'polyline', one per straight leg.
- **Offcuts:** `kind` 'offcut', inputs { lengthMm, materialId, label, location, status 'available' | 'consumed' }, `role` 'offcut'. A cutting plan never creates an offcut record.
- **Allocator** (`shared/takeoff/engine/allocator.js`): demands expanded to unique cut ids; partitioned by profile/finish identity; first-fit-decreasing start, then a bounded branch-and-bound with a lower bound — `proven` true/false; cut-sequence simulation per bar (end trim, kerf between pieces, final piece may use the bar end); objective = fewest new bars, then fewest offcuts, then larger reusable remainders. Recomputed in the browser and on the server for every save/export.
- **Order lines:** `unit` 'bar', `item.description` "equal-angle 50 × 50 × 3 — 6,500 mm length (no joins)"; the export's site appendix carries the bars and cuts (migration 207 for `unit` / `item`).
- **Copy / CSV** are built in the browser; nothing is uploaded. No email, notification or file on the server.

---

## 12. Edge cases and limits

- Square cuts only; mitred / notched ends need a reviewed cutting plan outside the app.
- One stock length per material (6,500 by default). A piece longer than the bar is never split.
- An exact 6,500 piece fits a 6,500 bar only with no end trim.
- The search is bounded: very large sets may show "Best plan found — minimum not proven" with the lower bound — never a claim of minimum.
- Doors get the same window detail (including a bottom cut if ticked) — check them.
- Planned remainders change whenever the plan changes; only recorded, measured offcuts are stock. Undo of a draft edit never "uncuts" a recorded offcut.
- Offcut reuse is within this material on this job only (no cross-job inventory).
- Placed orders are never changed by the plan; differences are shown as still-to-order or surplus.

---

## 13. Owner of the process

Admin / Director  
Next review date: 2027-04-14

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] **UI Review Mode on your own server — never port 5180 and never production.** `VITE_UI_REVIEW_MODE=true npx vite --port <PORT> --strictPort` (or the agents' no-HMR config); Playwright with `PLAYWRIGHT_BROWSERS_PATH=0`, `UI_REVIEW_PORT=<PORT>`. Stop it afterwards.
- [ ] Phone viewport 390 × 844 with touch (375 × 812 for layout checks).
- [ ] Default job: `http://localhost:<PORT>/carpentry/cjb-1/takeoff?reviewRole=admin` (no aluminium yet). Mixed job: add `&takeoffSeed=mixed` — **Window angle 50 × 50 × 3** (kerf 3, confirmed) with wall openings **W1** 900 × 900 (North wall) and **W2** 1,800 × 1,200 (East wall).
- [ ] "Add aluminium → (setup) → Openings & cutting" is the path to the cutting screen unless stated.
- [ ] Records: `await (await fetch("/api/takeoff/workspaces/ws-1")).json()` (snapshot) and `window.__takeoffReviewState()` in the page console; a reload re-seeds the fake data.

### Test cases

**TC-01 — Happy path (exact example: 600 × 2400 window)**
1. Default job → **Add aluminium** → **Saw kerf** 3 (Enter) → tick **The saw kerf above is confirmed for this job** → **Openings & cutting**.
2. **Add openings by size**: label W01, width 600, height 2400 → **Add opening**.
3. Expected result: W01 shows "Opening 600 × 2,400 mm (nominal W × H) · standalone" and three finished cuts **Left jamb 2,500 — Bar 1**, **Right jamb 2,500 — Bar 1**, **Bottom 600 — Bar 1** (no head); **Buy 1 × 6,500 mm**; Total required length **5,600 mm**; Cut loss **9 mm**; Reusable remainder **891 mm**; Scrap **0 mm**; **Minimum proven**; **Lower bound: 1 bar**; Objective starts "Minimise new bars"; chips "Quantity: calculated", "Installation: not specified — not checked", "Ordering: ready to order"; chip **Kerf 3 mm confirmed**.
4. Tap **Bar 1**: cuts "1. W01 left jamb 2,500 mm", "2. W01 right jamb 2,500 mm", "3. W01 bottom 600 mm"; "Planned remainder 891 mm — reusable. Not stock until this bar is actually cut."; **Offcuts on hand (0)** — no offcut was created.
5. Expected record: material `spec.kerfMm` 3, `kerfConfirmed` true; one `kind` "opening" measurement (no parent) with inputs { widthMm 600, heightMm 2400, label "W01" } and contribution role "opening".
- [ ] Pass  [ ] Fail

**TC-02 — Empty / invalid fields**
1. In the cutting screen tap **Add opening** with width and height blank.
2. Width 600, height 2400, **How many** 0 → **Add opening**.
3. **Add cut** with **Finished cut length** blank; then **Cut quantity** 0 with length 800.
4. Offcut form: **Record offcut** with **Measured offcut length** blank.
5. Expected result: step 1 "Enter the opening width and height first."; step 2 "Enter a whole number of 1 or more." under How many and "Enter how many openings of this size (1 to 50)."; step 3 "Enter the finished cut length first." then "Enter how many pieces of this length (1 to 500)."; step 4 "Enter the measured length of the offcut."; no opening, cut or offcut is created (counts unchanged in the snapshot).
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission (same opening twice)**
1. After TC-01, add another opening labelled W01, 600 × 2400.
2. Expected result: a second **W01** is added (not merged); both W01 cards show "Another opening has the same label — rename one so the cutting sheet is clear."; Total required length 11,200 mm; **Buy 2 × 6,500 mm**.
3. **Edit** the second → Label W02 → the warning disappears. **Undo** reverts the label; **Redo** re-applies it.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Leading hand: `/worker/takeoff/carpentry/cjb-1?takeoffSeed=mixed` → **Window angle 50 × 50 × 3** → **Cutting**.
2. Ordinary worker: `/worker/takeoff/carpentry/cjb-1?takeoffWorker=ordinary`.
3. Optional view-only check (as AL-20): before loading the mixed Hub URL, add an init script that sets `capabilities.edit = false` on every JSON response; open **Cutting**.
4. Expected result: step 1 — editing works; no **Save as standard** on the overview row; step 2 — "You don't have access to this." / "Takeoffs are for leading hands and office staff."; step 3 — "You can view this cutting plan but not change it.", no Add / Edit / Remove / Undo / **Profile & cutting settings** / **Record …** / **Mark consumed** buttons, wall-opening ticks disabled, **Download CSV** still works.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (kerf confirmation + recalculation)**
1. Default job → **Add aluminium** (kerf left blank) → **Openings & cutting** → add W01 600 × 2400.
2. Note revision R (`__takeoffReviewState()`). Tap **Confirm saw kerf** → kerf 3 → tick confirmed → **Openings & cutting**.
3. Expected result: before — "Quantity: incomplete — saw kerf not confirmed", "Ordering: not ready — saw kerf not confirmed", Reusable remainder **900 mm** (0 mm kerf estimate), banner "Estimate. … this plan uses 0 mm"; after — revision higher than R (R + 1 or more — edits made within half a second can be saved together), chip **Saved**, banner gone, remainder 891 mm, chip **Kerf 3 mm confirmed**.
4. Change **Saw kerf** to 4 in the card → the confirmed tick clears (needs confirming again).
5. Expected record: `spec.kerfMm` 4, `spec.kerfConfirmed` false after step 4. No email/notification.
- [ ] Pass  [ ] Fail

**TC-06 — Pooling, three 3,400 cuts and an unavailable piece**
1. Default job → aluminium with kerf 3 confirmed → **Add a straight cut**: label "Long sill", 3400, quantity 3 → **Add cut**.
2. Add a cut "Too long", 6600.
3. Expected result: step 1 **Buy 3 × 6,500 mm**, Total required length 10,200 mm, **Lower bound: 3 bars**, three bars (never ceil(10.2 ÷ 6.5) = 2); step 2 — banner "Can't be cut from the 6,500 mm stock — pieces are never joined …" listing "Too long — 6,600 mm" with "Longer than the 6,500 mm length — can't be cut, never joined."; still **Buy 3 × 6,500 mm**; chip "+ 1 piece can't be cut from stock — not in this count"; "Ordering: unavailable stock".
4. **Edit cut** (Too long) → **Remove cut** → Ordering back to "ready to order".
- [ ] Pass  [ ] Fail

**TC-07 — Proven minimum vs best plan found**
1. Kerf 3 confirmed. Add single cuts 3300, 3200, 2000, 1600, 1300, 1200. Open **How this was worked out**.
2. New takeoff page (reload), new aluminium with kerf 3 confirmed; add these 23 single cuts: 1570, 1490, 2190, 1930, 2940, 2220, 3350, 2920, 2210, 3280, 1910, 2420, 3210, 2100, 1780, 2830, 3240, 3170, 1370, 1540, 1790, 1030, 1250.
3. Expected result: step 1 **Buy 2 × 6,500 mm**, **Minimum proven**, **Lower bound: 2 bars**, explanation starts "First-fit-decreasing start: 3 new bars; branch-and-bound result: 2 new bars", check line "13,000 mm = 12,600 mm cuts + 18 mm cut loss + 382 mm remainder"; step 2 **Buy 9 × 6,500 mm**, **Best plan found — minimum not proven**, **Lower bound: 8 bars**, and "Best plan found — minimum not proven." in the explanation.
- [ ] Pass  [ ] Fail

**TC-08 — Offcuts: planned vs physical**
1. Kerf 3 confirmed. Add cut 600. **Offcuts on hand → Add an offcut you have**: label "Rack A", length 891, where "Ute" → **Record offcut**.
2. Tap **Mark consumed** on Rack A.
3. Open **Bar 1** → **Record remaining offcut** → **Record offcut** with the length blank → then 5890 → **Record offcut**.
4. Expected result: step 1 — "Rack A · 891 mm · Ute", **Buy nothing new**, "+ uses 1 existing offcut", Rack A "In this plan: Cut 600", **Offcut Rack A** bar remainder "Planned remainder 288 mm"; step 2 — "Consumed", **Buy 1 × 6,500 mm**; step 3 — form says "Bar 1: planned remainder 5,897 mm", the label is prefilled "Bar 1 remainder", the length is empty, blank → "Enter the measured length of the offcut."; after 5890 a second offcut "Bar 1 remainder · 5,890 mm" is listed.
5. Expected record: two `kind` "offcut" measurements with inputs.materialId = this material; Rack A `inputs.status` "consumed".
- [ ] Pass  [ ] Fail

**TC-09 — Exact fill uses the bar end; end trim is honest**
1. Kerf 3 confirmed. Add cut 2500 × 2 and cut 1494 × 1. Open **Bar 1**.
2. Add cut "Exact" 6500 and "Over" 6501.
3. **Profile & cutting settings** → **End trim** 5 → **Openings & cutting**.
4. Expected result: step 1 **Buy 1 × 6,500 mm**, Cut loss **6 mm**, check "6,500 mm = 6,494 mm cuts + 6 mm cut loss + 0 mm remainder", third cut shows "uses bar end", "Planned remainder 0 mm — none — exact fit"; step 2 **Buy 2 × 6,500 mm**, only "Over — 6,501 mm" unavailable ("Longer than …"); step 3 two pieces unavailable — "Exact — 6,500 mm" says "Fits the 6,500 mm length only without the 5 mm end trim. Not split: change the end trim or detail, or choose a longer stock." (never "Longer than"); chip "+ 2 pieces can't be cut from stock — not in this count".
- [ ] Pass  [ ] Fail

**TC-10 — Wall openings pooled across windows (mixed job)**
1. Mixed job → **Window angle 50 × 50 × 3** → **Setup** → **Openings & cutting**.
2. Untick **W2** under **Openings already on walls**, then tick it again.
3. Expected result: both W1 and W2 ticked; W1 "… (nominal W × H) · on wall North wall" with "Left jamb 1,000 — Bar n"; W2 "Bottom 1,800 — Bar n"; **Buy 2 × 6,500 mm**, Total required length **7,300 mm**; bar lists mix W1 and W2 cuts (6 cuts over 2 bars); after untick — W2 card gone, required **2,900 mm**, **Buy 1 × 6,500 mm**; after re-tick — 7,300 mm again.
4. Expected record: untick archives only the `role` "opening" contribution from the aluminium to `m-w2`; the opening measurement stays on East wall.
- [ ] Pass  [ ] Fail

**TC-11 — Site cutting sheet export**
1. TC-01 state (W01, kerf 3 confirmed). **Download CSV**; **Copy cutting sheet**.
2. Expected result: file `aluminium-angle-50-50-3-cutting-sheet.csv`; header `Bar,Source,Stock length (mm),Cut order,Cut,Opening,Wall,Edge,Length (mm),Saw cut after (mm),Planned remainder (mm),Remainder`; rows "Bar 1,new,6500,1,W01 left jamb,W01,,Left jamb,2500,3,," … last row ends "600,3,891,reusable (planned)"; "Cutting sheet copied." and the copied text contains "Buy 1 × 6,500 mm.", "Minimum proven (lower bound 1 bar).", "Saw kerf 3 mm (confirmed)", "W01 (600 × 2,400): Left jamb 2,500 mm → Bar 1; Right jamb 2,500 mm → Bar 1; Bottom 600 mm → Bar 1".
3. With the kerf unconfirmed the file is `…-cutting-sheet-ESTIMATE.csv` and the header says "Saw cut after (mm) — ESTIMATE: kerf not confirmed".
- [ ] Pass  [ ] Fail

**TC-12 — Undo / redo restores the plan exactly**
1. TC-01 state. Add cut 800 → expect **Buy 1 × 6,500 mm**, Cut loss **12 mm**, Scrap **88 mm**, Reusable **0 mm**.
2. **Undo** → Reusable 891 mm, Cut loss 9 mm. **Redo** → Scrap 88 mm.
3. **Edit cut 800 mm** → Length 900 → **Buy 2 × 6,500 mm** (the pieces no longer share one bar). No Apply / Save button exists anywhere.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values (fake-server snapshot; live DB only on an isolated test database)
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

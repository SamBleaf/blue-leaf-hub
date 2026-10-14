---
sop_version: 1.0
last_reviewed: 2026-10-14
app_version: takeoff-r03 (TC-R04 build, commit 8f9190f)
screenshot_status: placeholders_only
owner: Admin / Director
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP: Continuous Flashing Runs and Splitting at the Limit

**Module:** Takeoffs (timber, cladding, aluminium and flashing from plans)  
**SOP ID:** 20-11  
**Status:** Draft  
**Priority:** High

> **Feature status (2026-10-14):** Takeoffs ship **switched off** behind the server flag `TAKEOFF_ENABLED` (SOP 20-01). A read-only check on 2026-10-14 found migration 206's tables present in production (`docs/takeoff/evidence/live-206-verification-2026-10-14.txt`). Continuous runs are part of the **TC-R04 build on branch `takeoff-r03`** and need **migration 207 (`supabase/migrations/207_takeoff_generic_methods.sql`), which is NOT applied in production** — it must not be applied until the Director approves the TC-R04 release. Without 207 a continuous run cannot be saved. Nothing in this SOP has been tested against the live app; Section 14 runs in UI Review Mode (mocked data).

> **Read this first:** a split is **your** decision to make a site joint. The app shows where the longest legal piece ends; it never decides a lap direction, a sealed joint or whether a joint is allowed by the project detail. The 9,000 mm maximum in the examples is the material's **order ceiling** rule (SOP 20-04), not a manufacturer limit.

---

## 1. Who uses this

- **Admin (Director)** and **Supervisor** — in the Hub.
- **Leading hand** — in the Worker app, on jobs they can see.
- View-only users (and an admin previewing a leading hand) can open the plan with **View plan**, select a run and read its pieces, but cannot draw, move points or splits; a tap shows "You can't change this takeoff."

---

## 2. When to use it

- To measure a flashing that turns corners on the plan (e.g. an apron around a chimney, a barge that steps) as **one ordered flashing** cut and folded on site.
- When a run is longer than the material's maximum orderable length and has to be split into pieces.
- To move a split earlier, onto a corner, or to an exact distance; to remove or recalculate a split.
- When the schedule shows **over ceiling**, "over the maximum — split it on the plan" or a split flagged after the run was moved.

---

## 3. What this does

The **Run** tool draws one continuous path: tap the start, tap each corner, then **double-tap the last point** (or press **Finish**). The app adds up the real length of every leg (never the straight line between the ends) and gives **one** order length for the whole path: measured length + the material's allowance (default **200 mm, once per ordered piece**) rounded **up** to the increment (default **100 mm**). Four 750 mm legs → 3,000 mm measured → **one 3,200 mm** flashing. Corners add no pieces and no allowances. If the order length would be over the material's **order ceiling** (default 9,000 mm), the part past the limit is drawn **red** with a marker where the longest legal piece ends (8,800 mm measured → 9,000 ordered). One tap on the red part makes **one** split exactly at that marker; the run stays whole on the plan and each resulting piece gets its own allowance. A run over the amber **handling length** (default 6,000 mm) is only flagged — it never has to be split.

---

## 4. Before you start

- The plan page is scaled and shows **Ready** (SOP 20-02). Counting doesn't need a scale; runs do.
- A flashing material exists and is chosen (**Material: <name>** on the plan) — SOP 20-04. Its rules (allowance, increment, handling length, order ceiling) come from **Details** on the material.
- You are on the **current** plan revision; edit access (SOP 20-01); migration 207 on the database.

---

## 5. Step-by-step process

### A. Draw a continuous run

1. Overview → **Measure**. The tool switch for a flashing shows **Run | Count | Select | Pan**; **Run** is selected. Check **Material: <name>**.
2. The panel says "Tap the start of a straight run. For a run with corners, tap each corner, then double-tap the last point (or press Finish). Hold for a magnifier."
3. Zoom in (pinch, or + on a computer) and tap the start. Press and hold to get the magnifier; the point goes where you lift.
4. Tap each corner. The panel shows live: "Measured 3,000 + allowance 200 → order 3,200 mm" and "4 legs — corners are cut/folded on site; they add no pieces or allowances." plus "Still drawing — tap the next corner, or double-tap the last point to finish. Not in the order until it's finished."
5. **Finish**: double-tap the **last point** (double-click on a computer), or tap **Finish**. A double-tap on a new spot adds that point once and finishes. Tapping the last point once only says "That's the last point — double-tap it (or press Finish) to finish, or zoom in for a short leg."
6. The panel shows "Finished — one run:" with the result and the three statuses. Tap the next start for another run. **Undo** reopens the run you just finished.
7. **Discard run** throws away the run you are drawing. **↶ / ↷** undo / redo every change (while drawing, Undo removes the latest corner).
8. Two fingers always pan / zoom and never add a point; a drag of more than a few pixels pans instead of placing.
9. Tapping back onto an earlier corner closes onto it exactly. An out-and-back path is measured both ways and flagged: "Part of this path retraces itself — both passes are measured and summed …".

> 💡 **Tip:** While you draw, the run is kept on this device (and from two points also on the takeoff, with **no** material yet) so a reload never loses it — but it is **not in any order until it is finished**. Leaving the screen with **Done** finishes a valid run.

[insert screenshot: Run tool — four-leg path, "Measured 3,000 + allowance 200 → order 3,200 mm", "4 legs — corners are cut/folded on site"]

### B. Long runs — amber handling vs red maximum

1. **Amber (advisory):** over the handling length the panel says e.g. "This run orders 7,000 mm — longer than the 6,000 mm handling length. Advisory only; no split is needed." The schedule calls it **long piece**. You can order it as one piece.
2. **Red (hard maximum):** over the order ceiling the overflow is drawn red and the panel says e.g. "This run orders 10,200 mm — over the 9,000 mm maximum. The red part is the overflow; tap it to split at the limit (8,800 mm along the run)." Ordering shows **draft — not ready to order** until it is split.
3. If the material has no maximum set: "This flashing has no maximum orderable length set up — keep drawing, but set it up before ordering."

### C. Split at the limit

1. While drawing, or on a finished run, **tap the red part once** (or tap **Split at limit (8,800 mm)** in the panel).
2. The split goes to the **legal marker**, not where your finger was: "Split at the limit (8,800 mm along the run). Pieces now 9,000 + 1,400 mm — each with its own allowance. Undo puts it back."
3. The run stays one line on the plan with a split handle at 8,800; the panel lists "Piece 1: 8,800 + 200 → 9,000 mm — long piece" and "Piece 2: 1,200 + 200 → 1,400 mm".
4. If another piece is still over the maximum it stays red — tap it again for the next split. **One tap = one split**; joins are never added silently.
5. **Undo** returns to the single flagged run.

### D. Move, add, remove or recalculate splits (Select)

1. Tap **Select**, then tap the run. The panel shows "Run — <material>", the pieces, statuses, **How this was worked out**, and a row per split: "Split 1 — 8,800 mm along the run".
2. Tap a split row to open it:
   - **Split 1 position (mm along the run)** — type a distance (e.g. 5,000 → pieces 5,200 + 5,200). A position that would make the piece before it too long is refused: "That makes the piece before the split longer than the maximum — the split can go up to 8,800 mm."
   - **Move to a corner** — e.g. "Corner 2 — 6,000 mm" → 6,200 + 4,200. Corners are never chosen automatically.
   - **Remove split 1** — the run goes back to one piece (red again if over the maximum).
3. Drag the round split handle along the run: earlier is allowed, past the limit is blocked, near a corner it snaps onto the corner.
4. **Add a split by distance…** adds one at a typed distance ("A split makes a site joint — each piece gets its own allowance.").
5. Moving a corner point can leave a split's cut location off the path. It is then flagged on the plan and in its row ("— its approved cut location is no longer on the path after a geometry edit. Choose its position again.") with **Recalculate** — it is never moved silently.
6. Drag a point to move it, tap **+** on a leg to add a point in the middle of that leg, **Remove point N** to delete the selected point (a run needs at least two), **Remove run** to remove the whole run.

### E. Unfinished runs and checking the schedule

1. "N unfinished run(s) is/are on this page — not in the order until finished." → **Show** selects it: "Unfinished run — not in the order until it's finished." with **Continue drawing**, **Finish as <material>** and **Remove**.
2. **Open schedule**: a continuous run gives **one row per resulting finished length**, never one per plan leg (e.g. 9,000 and 1,400 rows, or one 3,200 row). Expanding the row shows "Run R-xxxxxxxx: 10,000 mm tight along the path · 1 corner(s) at 6,000 mm — cut/folded on site, no extra pieces" and each piece ("Piece 1: 0 → 8,800 mm, tight 8,800 → order 9,000 mm"). There is **no** lap-split form for a continuous run — it is split on the plan. **Show on plan** opens the plan with the run selected and framed.
3. The site appendix of each export lists each run's reference, corners, splits and pieces (SOP 20-06).

---

## 6. What happens next

- Each finished run, split and point move autosaves (SOP 20-07). The server recalculates the path length from the plan points and the page scale, and the pieces from the material's rules — it never trusts lengths sent from the phone.
- The schedule, order and supplier PDF list the resulting finished lengths × quantity; a run still over the maximum, unfinished, on an unready scale or with a flagged split blocks the supplier PDF (a draft PDF is still possible).
- Nothing is ordered, sent or emailed.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Splitting at every corner | Thinking each leg is a piece | A corner is cut/folded on site — split only when the run is over the maximum, or by choice |
| Adding 200 mm to each leg | Habit from straight runs | The allowance is once per ordered piece |
| Splitting a run that is only amber | Amber looks like a warning | Amber is advisory; only red needs a split |
| Tapping where you "want" the split on the red line | Expecting the tap to be the cut | The red tap always uses the legal marker; then move it with the split row or handle |
| Leaving a run unfinished | Navigating away mid-drawing with one point | Finish (double-tap / **Finish**) — unfinished runs are in no order |
| Moving a corner after splitting and not reviewing | The split looks fine | Check for a flagged split and **Recalculate** |
| Using Run on a "Finished pieces" material | Wrong material | Use Count or **Add lengths** for finished pieces |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Scale this page before measuring runs." | Page not scaled | **Scale page** (SOP 20-02) or use Count |
| "That point is outside the scaled region." | Tap outside the chosen region | Measure inside the region |
| "That's the last point — double-tap it (or press Finish) to finish, or zoom in for a short leg." | Single tap on the last point | Double-tap it or press **Finish** |
| "Tap at least two points, then double-tap the last one (or press Finish)." | Finish with one point | Tap the next point first |
| Red overflow / "over the 9,000 mm maximum" | Order length past the ceiling | Tap the red part (or **Split at limit**) |
| "There's no legal split position for this piece — move an earlier split or resolve it manually." | Earlier split / no-joint zone leaves no legal place | Move the earlier split back, or resolve manually |
| "That makes the piece before the split longer than the maximum — the split can go up to 8,800 mm." | Split moved too far | Use a position up to the stated limit |
| "— its approved cut location is no longer on the path after a geometry edit …" + **Recalculate** | Corner moved after splitting | **Recalculate** (or re-type the position) |
| "That change would leave a split outside the run (or out of order) — move or remove the split first." | Point move would break a split | Move or remove the split first |
| "A run needs at least two points — remove the run instead." | Removing the second-last point | **Remove run** |
| "Part of this path retraces itself — both passes are measured and summed …" | Out-and-back path | Check it is intended; otherwise Undo and redraw |
| "This flashing has no maximum orderable length set up …" | Ceiling not set on the material | Set the order ceiling in **Details** (SOP 20-04) |
| "This material takes finished lengths only — use Count, or Add lengths on the takeoff page." | Run on a "Finished pieces" material | Use Count / Add lengths |
| "This device can't keep an unfinished run if the app reloads — finish it before leaving." | Device storage blocked | Finish the run before leaving |
| Schedule: "over the maximum — split it on the plan" | Piece still over the ceiling | Split it on the plan (Section 5C) |
| "Not saved: One or more values are not valid for this field." on a finished run | Migration 207 missing on that database | Apply 207 to that (non-production) database |

---

## 9. Related modules

- [20-03 Measure runs and count pieces → the Measure screen, Count and Add lengths](20-03_measure_runs_and_count.md)
- [20-04 Flashing profiles, materials and company standards → allowance, increment, handling length and order ceiling rules](20-04_profiles_materials_standards.md)
- [20-05 Length schedule and splitting → schedule rows for runs; lap splits for straight runs and entered lengths](20-05_length_schedule_and_split.md)
- [20-06 Export a supplier order and record it as placed → supplier PDF and site appendix](20-06_export_and_record_orders.md)
- [20-07 Saving, recovery and conflicts → autosave and device recovery of unfinished runs](20-07_saving_recovery_conflicts.md)

---

## 10. Screenshot placeholders

[insert screenshot: drawing a four-leg run — live result and "Still drawing …"]
[insert screenshot: overlength run — red overflow with the legal marker and the "over the 9,000 mm maximum" text]
[insert screenshot: after Split at limit — "Pieces now 9,000 + 1,400 mm", split handle on the run]
[insert screenshot: Select — split row open with position field, Move to a corner, Remove split]
[insert screenshot: flagged split after a corner drag — Recalculate]
[insert screenshot: schedule — run expanded with corners and pieces]

---

## 11. Automation notes

- **Drawing:** from the second point the run is saved as a `takeoff_measurements` row `kind` 'polyline' (plan points, `calibration_id`, `document_id`, `geometry.inputs.splitsMm` [] ) with **no** contribution, and kept in device storage (`blh-takeoff-measure-draft:…`) so a reload restores it. **Finish** adds the contribution (`role` 'primary', the active flashing material).
- **Split:** stored on the measurement as `inputs.splitsMm` (stations along the path in mm) plus `inputs.splitAnchors` (the plan location of each cut) so a later geometry edit can tell whether the approved cut location is still on the path.
- **Calculation** (`shared/takeoff/engine/flashingPath.js`, also run on the server for every save/export): tight length = sum of calibrated leg lengths; per piece order = ceil((tight + allowance) ÷ increment) × increment; capacity = floor(ceiling ÷ increment) × increment − allowance (8,800 for 9,000/100/200); the red overflow and legal marker come from that capacity; `splitAtLimit` adds exactly one split.
- **Gestures** (`gestures.js`): one recogniser for tap / double-tap (300 ms, 24 px) — a double-tap finish never adds a duplicate end point; the trailing tap of "tap, then double-tap" is swallowed; pinch, pan and cancelled touches add nothing.
- Old straight runs (`kind` 'run') still display, select and drag as before.
- **Schedule / order:** pieces become ordinary flashing lines (quantity × finished length); the export's site appendix records each run (ref `R-<first 8 of id>`, tight length, corners, splits, pieces).
- No email, notification or file is created.

---

## 12. Edge cases and limits

- One allowance per ordered piece (corners add none). Entered finished lengths and counts never get an allowance (SOP 20-03).
- A split location is a site joint; the app does not decide laps, sealing or joint direction and does not know no-joint zones unless a project detail is recorded on the run.
- Exactly retraced legs are kept and summed (never merged or deleted) and flagged.
- Undo/redo on the plan cover the current visit to the Measure screen (up to 100 steps).
- A run drawn on a page that is later re-scaled, or on a replaced plan, is flagged and blocks the supplier PDF (SOP 20-02).
- Frozen exports never change when a run is edited later.
- Double-tap timing can differ on some phones — **Finish** always works.

---

## 13. Owner of the process

Admin / Director  
Next review date: 2027-04-14

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] **UI Review Mode on your own server — never port 5180 and never production.** `VITE_UI_REVIEW_MODE=true npx vite --port <PORT> --strictPort` (or the agents' no-HMR config); Playwright with `PLAYWRIGHT_BROWSERS_PATH=0`, `UI_REVIEW_PORT=<PORT>`. Stop it afterwards.
- [ ] Phone viewport 390 × 844 with touch; a desktop run (1280 × 900) for the double-click check.
- [ ] Default job: `http://localhost:<PORT>/carpentry/cjb-1/takeoff?reviewRole=admin` → **Measure** (material **Apron flashing**, rules: allowance 200, increment 100, handling 6,000, ceiling 9,000; "4 run(s) on this page."). Mixed job: add `&takeoffSeed=mixed` — exact seeded runs on **Apron flashing**: `m-pl1` 6,000 + 4,000 = 10,000 mm with a split at 8,800, and `m-pl2` four 750 mm legs.
- [ ] Plan positions: PDF point for (x mm, y mm) = `{ x: 120 + x × 0.0283464567, y: 150 + y × 0.0283464567 }`; screen = `document.querySelector("[data-takeoff-viewport]").takeoffViewport.toScreen(pt)` + the viewport rect; `.takeoffViewport.zoomOn(pt, factor)` to zoom. Run elements expose `data-tight`, `data-order` (e.g. "9000+1400"), `data-pieces`, `data-splits`, `data-points`; the run being drawn is `[data-path-draft]`; red parts are `[data-overflow-run]`; the legal marker is `[data-legal-marker]` with `data-station`. Drawn taps land on whole pixels — allow ±40 mm on drawn lengths; seeded runs are exact.
- [ ] Records: `await (await fetch("/api/takeoff/workspaces/ws-1")).json()` and `window.__takeoffReviewState()` in the page console. Leave ~400 ms between separate taps so they aren't read as a double-tap.

### Test cases

**TC-01 — Happy path (one run with corners = one flashing)**
1. Default job → **Measure**. Zoom ×12 on (1750, 3750). Tap (1000, 4500), (1750, 4500), (1750, 3750), (2500, 3750), (2500, 3000).
2. Wait 400 ms, then double-tap (2500, 3000).
3. Expected result: while drawing — `[data-path-draft]` has 5 points, tight ≈ 3,000 (±30, the sum of legs — not the 2,121 chord), panel "Measured … + allowance 200 → order … mm" where order = ceil((tight + 200) ÷ 100) × 100 (3,200 for an exact 3,000), "4 legs — corners are cut/folded on site; they add no pieces or allowances."; after the double-tap — no draft, one finished run with **5** points and **1** piece, "Finished — one run:" with "Quantity:" statuses, chip **Saved**, "5 run(s) on this page.".
4. Mixed job exact check: `[data-measurement-id="m-pl2"]` has `data-tight` 3000, `data-order` 3200, 5 points.
5. Expected record: `__takeoffReviewState().measurements` + 1; new measurement `kind` "polyline" with 5 points and `inputs.splitsMm` []; one contribution `role` "primary" to `mat-apron`. Live DB: `takeoff_measurements.kind` 'polyline' (needs 207).
- [ ] Pass  [ ] Fail

**TC-02 — Empty / invalid input**
1. **Measure** → **Run**: tap one start point, then tap **Finish**.
2. Tap exactly on that start point again.
3. Overview → **Add flashing** → **Finished pieces only (no drawing)** → **Lengths** (or back to the plan with that material) → **Run** tap on the plan.
4. Mixed job → **Select** → tap `m-pl1` (e.g. at (3000, 7600)) → open **Split 1 — 8,800 mm along the run** → type 9500 in **Split 1 position (mm along the run)** (Enter); then type 0.
5. Expected result: step 1 — **Finish** is disabled with one point (nothing is created); step 2 — "That's the last point — double-tap it (or press Finish) to finish, or zoom in for a short leg." and no second point; step 3 — "This material takes finished lengths only — use Count, or Add lengths on the takeoff page."; step 4 — "That makes the piece before the split longer than the maximum — the split can go up to 8,800 mm." and the run stays `data-order` "9000+1400"; 0 → "Enter a number greater than 0.".
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission (double-tap finishes once; no phantom run)**
1. Default job → **Measure**. Zoom ×4 on (2000, 4500). Tap (1000, 4500), (2500, 4500).
2. At (2500, 3800) tap three times quickly (tap the end, then double-tap it).
3. Wait 500 ms, then tap (1000, 3500).
4. Expected result: after step 2 — no draft left, exactly one new finished run with **3** points (never a 4th duplicate point or a zero-length leg); `__takeoffReviewState().measurements` increased by exactly 1; step 3 — a fresh draft with 1 point (a new start still works).
5. Desktop (1280 × 900): click (1000, 5000), (4000, 5000), (4000, 6500), then double-click (4000, 6500) → one finished run with **3** points, no draft left; separately, click three points and double-click a **new** spot (6000, 6500) → one run with **4** points.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Ordinary worker: `/worker/takeoff/carpentry/cjb-1?takeoffWorker=ordinary`.
2. Optional read-only: add an init script that sets `capabilities.edit = false` on every JSON response, open the default Hub URL → **View plan** → tap the plan in **Run**; **Select** a run.
3. Expected result: step 1 — "You don't have access to this." / "Takeoffs are for leading hands and office staff."; step 2 — the button reads **View plan**, a tap shows "You can't change this takeoff." and nothing is placed; a selected run shows its pieces but no split controls, handles or **Remove run** action that changes anything (Remove disabled).
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (unfinished run is in no order; recovery)**
1. Default job → **Measure**. Zoom ×4 on (2000, 5000). Tap (1000, 5000), (2500, 5000), (2500, 5800). Do not finish.
2. Check the panel still says "4 run(s) on this page." (only finished runs are counted).
3. Wait 700 ms, reload the page; if offered tap **Restore**; **Measure**.
4. Tap **Finish**.
5. Expected result: step 2 — still "4 run(s) on this page." (the drawing is not a finished run); after reload the draft is back with **3** points and "Still drawing — tap the next corner …"; step 4 — "5 run(s) on this page." and no draft.
6. Expected record: after step 1 the fake server holds a `kind` "polyline" measurement with **no** contribution (not in the schedule); after step 4 a contribution `role` "primary" exists. No email/notification.
- [ ] Pass  [ ] Fail

**TC-06 — Red overflow, Split at limit, Undo**
1. Default job → **Measure**. Zoom ×3.4 on (3500, 5600). Tap (500, 7600), (6500, 7600), (6500, 3650) (≈ 9,950 tight).
2. Read the draft, then tap the red part about a third of the way along its longest leg.
3. **Undo**. Wait 400 ms, double-tap (6500, 3650) to finish it anyway, then tap the red part of the finished run.
4. Expected result: step 1 — 1 piece, one `[data-overflow-run]`, legal marker at station **8800**, panel "… over the 9,000 mm maximum. The red part is the overflow; tap it to split at the limit (8,800 mm along the run)."; step 2 — still 3 points (the red tap adds no vertex), 2 pieces, splits "8800", order "9000+1400", red gone, message "Split at the limit (8,800 mm along the run). Pieces now 9,000 + 1,400 mm — each with its own allowance. Undo puts it back."; step 3 — Undo returns the single red draft; finishing keeps it whole and flagged (Procurement "draft — not ready to order"); the red tap on the finished run splits it to "9000+1400" and selects it.
- [ ] Pass  [ ] Fail

**TC-07 — Amber handling length never forces a split**
1. Default job → **Measure**. Zoom ×1.6 on (3500, 4000). Tap (500, 4000), (7000, 4000).
2. Expected result: "… longer than the 6,000 mm handling length. Advisory only; no split is needed."; no red part; 1 piece; no **Split at limit** button.
- [ ] Pass  [ ] Fail

**TC-08 — Move, add, remove and recalculate splits (exact seeded run)**
1. Mixed job → **Measure** → **Select** → zoom ×1.8 on (4500, 6000) → tap (3000, 7600) (`m-pl1`).
2. Panel: "Measured 10,000 along the run → 2 pieces, each with its own 200 allowance:", "Piece 1: 8,800 + 200 → 9,000 mm — long piece", "Piece 2: 1,200 + 200 → 1,400 mm", "2 legs — corners are cut/folded on site …".
3. Open **Split 1 — 8,800 mm along the run** → position 5000 (Enter); then **Move to a corner** → "Corner 2 — 6,000 mm"; then **Remove split 1**; then tap the red part; then **Undo**.
4. **Add a split by distance…** → 4000 (after re-applying Split at limit).
5. Expected result: step 3 — `data-order` "5200+5200" → "6200+4200" → "10200" with red overflow and "This run orders 10,200 mm — over the 9,000 mm maximum …" → "9000+1400" → "10200" again; step 4 (from 9000+1400) — "Split added at 4,000 mm. Pieces now 4,200 + 5,000 + 1,400 mm …", splits "4000,8800".
6. Corner drag: with the run selected drag the handle for point 2 (corner) 40 px sideways → tight > 10,050, one split marker flagged and the row says "… its approved cut location is no longer on the path after a geometry edit. Choose its position again." → **Recalculate** → splits "8800", flag gone.
- [ ] Pass  [ ] Fail

**TC-09 — More than two pieces: one tap = one split**
1. Default job → **Measure**. Tap (0, 7000), (11000, 7000), (11000, −500) (≈ 18,500 tight).
2. Tap the red part; then zoom ×6 on the remaining red part and tap it.
3. Expected result: after the first tap — 2 pieces and **one red part still visible** (piece 2 still over 9,000); after the second — 3 pieces, no red, splits "8800,17600".
- [ ] Pass  [ ] Fail

**TC-10 — Gestures add no stray points**
1. **Measure** → **Run**: tap once in the middle (1 point). Then: drag one finger > 8 px; pinch with two fingers; start a touch and cancel it.
2. Expected result: still 1 point after all three; the next tap adds point 2.
- [ ] Pass  [ ] Fail

**TC-11 — Schedule shows one row per resulting length**
1. Mixed job → **Open schedule** → **Apron flashing**.
2. Expected result: rows "1 × 9,000 mm" (**long piece**), "1 × 1,400 mm", "1 × 3,200 mm"; no rows for 750, 6,200 or 4,200; expanding 9,000 shows "Run R-m-pl1: 10,000 mm tight along the path · 1 corner(s) at 6,000 mm — cut/folded on site, no extra pieces", "Piece 1: 0 → 8,800 mm, tight 8,800 → order 9,000 mm", "Piece 2: 8,800 → 10,000 mm, tight 1,200 → order 1,400 mm", and **no** "Split" button; expanding 3,200 shows "3,000 mm tight along the path · 3 corner(s) at 750, 1,500, 2,250 mm" with one piece; **Show on plan** on the 3,200 row opens the plan with `m-pl2` selected and framed.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values (fake-server snapshot; live DB only on an isolated test database)
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

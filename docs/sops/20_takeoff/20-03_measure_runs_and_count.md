---
sop_version: 2.2
last_reviewed: 2026-10-20
app_version: takeoff-r03 (TC-R04 build, commit 8f9190f)
screenshot_status: needs_replacement
owner: Admin / Director
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP: Measure Runs and Count Pieces

**Module:** Takeoffs (timber, cladding, aluminium and flashing from plans)  
**SOP ID:** 20-03  
**Status:** Draft  
**Priority:** High

> **Feature status (2026-10-14):** Takeoffs ship **switched off** behind the server flag `TAKEOFF_ENABLED` (SOP 20-01). A read-only check on 2026-10-14 found migration 206's tables present in production (`docs/takeoff/evidence/live-206-verification-2026-10-14.txt`). **v2.0 describes the TC-R04 build (branch `takeoff-r03`)**: a flashing **Run** is now one continuous path (tap each corner, double-tap to finish) — the old **Connected** tick-box and **End this line** are gone. Saving a continuous run needs **migration 207 (`supabase/migrations/207_takeoff_generic_methods.sql`), which is NOT applied in production** and must not be applied until the Director approves the TC-R04 release. Nothing in this SOP has been tested against the live app.

---

## 1. Who uses this

- **Admin (Director)** and **Supervisor** — in the Hub.
- **Leading hand** — in the Worker app, on jobs they can see.
- View-only users (and an admin previewing a leading hand) can open the plan with **View plan**, pan/zoom and use **Select** to read a run's result, but cannot add, move or remove anything.

---

## 2. When to use it

- After the plan page is scaled (SOP 20-02) and you have a flashing material to measure with (SOP 20-04).
- To measure flashing off the plan — a straight run, or one continuous run that turns corners (barge, apron, ridge, valley, etc.).
- To count pieces that are a known finished length (e.g. 12 × 2,400 mm cappings).
- To add lengths that aren't on the plan (manual lengths), or remove one you entered.
- To fix or remove a run or count you placed wrongly.
- Timber, cladding and aluminium use their own tools on the same screen: SOPs 20-08, 20-09 and 20-10.

---

## 3. What this does

**Run** draws one continuous flashing: tap the start, each corner, then double-tap the last point (or **Finish**). The app adds up the real length of every leg, adds the material's allowance **once per ordered piece** (default **200 mm**) and rounds **up** to the material's increment (default **100 mm**) — for example "Measured 4,312 + allowance 200 → order 4,600 mm", or four 750 mm legs → "Measured 3,000 + allowance 200 → order 3,200 mm". Corners are cut / folded on site and add no pieces or allowances. A run over the material's order ceiling is drawn red and can be split at the limit (SOP 20-11). **Count** and **Add lengths** are different: you type the **finished** order length and it is used exactly — no allowance, no rounding. Every run, count and manual length feeds the length schedule (SOP 20-05).

---

## 4. Before you start

- The plan page is scaled and shows **Ready** (runs on a page marked **Needs review** or **Not scaled** can't be ordered). Counting doesn't need a scale.
- The takeoff has at least one flashing. If not, **Measure** opens **Choose flashing** first (SOP 20-04).
- The plan is the **current** revision — measuring on a replaced plan is blocked.
- You have edit access (SOP 20-01).
- A data connection to open the plan (it isn't stored offline). Edits made during a short dropout are kept (SOP 20-07).
- The database has migration 207 (continuous runs are saved as a new measurement kind).

---

## 5. Step-by-step process

### A. Open the Measure screen

1. On the takeoff overview tap **Measure** (view-only users see **View plan**).
2. The plan fills the screen. The top bar shows the material name, "<plan> · page N · scaled / scale needs review / not scaled", the save chip, **↶** (Undo) and **↷** (Redo). **Done** (top-left) returns to the overview.
3. Under the top bar: the tool switch **Run | Count | Select | Pan**, a **Material: <name>** button and **Fit** (show the whole page).
4. Check the material is right. To change it tap **Material: <name>** → **Measure with…** → tap the material (or **Add flashing**). The list includes timber, cladding and aluminium materials — choosing one changes the tools (SOPs 20-08 to 20-10).
5. If the page has more than one scaled region, tap the one you are measuring under **Scaled region:**.

[insert screenshot: Measure screen — tool switch Run/Count/Select/Pan, Material button, Fit]

### B. Measure runs (Run)

1. Tap **Run**. The panel says "Tap the start of a straight run. For a run with corners, tap each corner, then double-tap the last point (or press Finish). Hold for a magnifier."
2. Pinch to zoom in and tap the **start**. Tap the **finish** for a straight run, or **each corner** in turn for a run with corners.
3. From the second point the panel shows the live result, e.g. "Measured 4,312 + allowance 200 → order 4,600 mm" (and "N legs — corners are cut/folded on site; they add no pieces or allowances." when it has corners), plus "Still drawing — tap the next corner, or double-tap the last point to finish. Not in the order until it's finished."
4. **Finish** the run: double-tap the last point (double-click on a computer) or tap **Finish**. "Finished — one run:" shows the result and its statuses. **Discard run** throws away the run you are drawing.
5. Each finished run is **one** flashing with **one** allowance, however many corners it has. Two runs that happen to be the same length are still two runs (they appear as "2 × 4,600" in the schedule, each with its own allowance).
6. Long runs: **long piece** (amber) means over the handling length (default 6,000 mm) — advisory only. Over the order ceiling (default 9,000 mm) the overflow is drawn **red** — tap it to split at the limit, or move the split — see **SOP 20-11**.
7. Leaving the screen (**Done**, another material or another tool) finishes a run that has at least two points.

> 💡 **Tip:** a single tap on the last point says "That's the last point — double-tap it (or press Finish) to finish, or zoom in for a short leg." — it never adds a duplicate point.

[insert screenshot: Run result — "Measured 4,312 + allowance 200 → order 4,600 mm"; a run with corners and "3 legs — corners are cut/folded on site"]

### C. Count pieces (Count)

1. Tap **Count**.
2. Type the finished length into **Finished length (no allowance added)** **first**, then press Enter / Done.
3. Tap each place on the plan where that piece goes. Each tap adds a numbered dot and the panel shows "Counted N × 2,400 mm". (Double-tap is off in Count — two quick taps are two marks.)
4. To count a different length, type the new length. **This starts a new count** — the dots you already placed keep their old length.
5. Tap **Finish count** when done with that length.

> 💡 **Tip:** Counted lengths are finished order lengths — the app never adds the 200 mm allowance or rounds them.

### D. Add lengths that aren't on the plan (manual)

1. Tap **Done** to go back to the overview.
2. On the material's row tap **Add lengths**.
3. Lengths already entered for that material are listed ("3 × 4,312 mm") with a **Remove** button each.
4. Type the **Finished length** (mm) and **Qty** (pcs), then tap **Add**. The length is used exactly — no allowance or rounding ("Entered lengths are used exactly — no allowance or rounding.").

### E. Select, adjust or remove

1. Tap **Select**, then tap a run line or a count dot.
2. A **continuous run** shows "Run — <material>", its pieces ("Measured … → order …", or one line per piece when split), the three statuses, **How this was worked out**, its splits, and **Add a split by distance…** (SOP 20-11). Drag a point to move it, tap **+** on a leg to add a point, **Remove point N** to delete the selected point, **Remove run** to remove it.
3. An older straight run shows **Run** with its explanation; a count shows **Count — N marks**. Drag a handle to move a point — a magnifier shows exactly where it sits. **Remove** removes the selected run, or the **whole** count group.
4. "N unfinished run(s) is/are on this page — not in the order until finished." → **Show** → **Continue drawing**, **Finish as <material>** or **Remove**.

### E2. Hide the takeoff lines, delete a run, read the details (Hub review, 19 Oct 2026)

1. **Takeoffs ▾** (top bar) opens a list of every takeoff item on this plan page (each material, with how many runs / counts it has), each with a tick box. Untick an item to hide its lines so the drawing is easier to read; tick it to bring them back. **Show all** / **Hide all** do every item at once; **Done** closes the list.
   - Nothing is deleted and the schedule doesn't change. While anything is hidden, the button reads e.g. "Takeoffs (1 hidden)" and a banner names what is hidden, with **Show all**.
   - A hidden line can't be selected by tapping where it is. The run you're drawing, the one you've selected and a "Show on plan" highlight always show.
   - Measuring something new with a hidden material shows that material again, so what you just measured never disappears.
   - The choice is remembered for this page on this device.
2. To delete a run: tap it, then **Delete run**. A banner offers **Undo**.
3. The technical labels (Quantity / Installation / Procurement) are under **Details** in the run panel. Real problems still show in plain English.

### F. Move around, undo and finish

1. **Pan** — every drag moves the plan; nothing is placed. In any tool, **two fingers always pan and zoom** and never place a point. A drag of more than a few pixels in Run/Count also pans instead of placing.
2. **Fit** shows the whole page. On a computer: scroll to pan, Ctrl/⌘ + scroll to zoom, **+ / − / 0** keys to zoom in / out / fit, arrow keys to pan.
3. **↶ / ↷** undo and redo changes made since you opened this Measure screen (up to 100 steps; while drawing, Undo removes the latest point; leaving the screen clears the undo list).
4. Tap **Done**. Everything has already been saved automatically — check the chip says **Saved** (SOP 20-07).

---

## 6. What happens next

- Each completed tap, finish, move or remove is saved automatically about half a second later; the server recalculates every length from the plan points and the scale (it never trusts lengths sent from the phone).
- A run that is still being drawn is kept on this device (and, from two points, on the takeoff with no material) so a reload doesn't lose it — but it is **not in the schedule or any order until it is finished**.
- New pieces appear in the **Length schedule** (SOP 20-05), grouped by material and finished length. A continuous run gives one row per resulting finished length, never one per plan leg.
- Pieces over the order ceiling, on a scale that isn't Ready, or on a replaced plan show "needs attention" and can't go on a supplier PDF until fixed.
- Nothing is ordered, sent or emailed.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Tapping only the two ends of a run that turns corners | Expecting the app to follow the line | Tap every corner — the length is the sum of the legs you tap |
| Drawing each leg as its own run | Habit from the old Connected mode | One continuous run per flashing; corners add no allowance |
| Leaving a run unfinished | Moving on without finishing | Double-tap the last point or press **Finish** |
| Typing the count length after tapping | Count needs the length first | Type **Finished length** first, then tap |
| Adding 200 mm to counted / manual lengths yourself | Habit from measured runs | Enter the finished length you want to order; no allowance is added |
| Measuring on the wrong material | The last material stays active | Check the **Material: <name>** button before tapping |
| Using **Run** with a "Finished pieces only" material | That material only takes finished lengths | Use **Count** or **Add lengths** for it |
| Expecting **Remove** to delete one count dot | Remove works on the whole count group | Use **↶** straight away, or drag the dot, or remove and re-count |
| Measuring on a page marked Needs review | The check failed or was skipped | Re-scale first (SOP 20-02) |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Scale this page before measuring runs." | Page not scaled | Tap **Scale page** on the banner (SOP 20-02), or use **Count** |
| "This page has no scale yet. You can still count pieces." | Page not scaled | As above |
| "The scale on this page failed its check — runs are shown but can't be ordered until it is re-scaled." / "…hasn't been checked…" | Calibration Needs review / Not checked | **Re-scale**, then on the overview tap **Review with new scale** (SOP 20-02 Section 5D) |
| Schedule says "This page has been re-scaled since this run was measured — review it with the new scale." | The page was re-scaled after the run was drawn | **Review with new scale** (SOP 20-02 Section 5D), or Select → **Remove run** and re-measure |
| "Choose which scaled region you are measuring in." | Page has several scaled regions | Tap the region under **Scaled region:** |
| "That point is outside the scaled region." | Tap or drag outside the chosen region | Measure inside the region, or scale the other region |
| "That's the last point — double-tap it (or press Finish) to finish, or zoom in for a short leg." | Single tap on the last point | Double-tap it, press **Finish**, or zoom in |
| "Tap at least two points, then double-tap the last one (or press Finish)." | Finish with one point | Tap the next point first |
| Red part on the run / "over the 9,000 mm maximum" | Order length past the ceiling | Split at the limit — SOP 20-11 |
| "Part of this path retraces itself — both passes are measured and summed …" | Out-and-back taps | Check it is intended; otherwise Undo and redraw |
| "Enter the finished length first." | Count tapped before typing a length | Type **Finished length** first |
| "Choose a material first." | No active material | **Material: …** → choose or **Add flashing** |
| "This plan has been replaced — measure on the current revision." (also "…count on the current revision.") | Measuring on a superseded plan | Choose the current revision in **Set up plans** |
| "You can't change this takeoff." | View-only access or preview | Ask an Admin, Supervisor or leading hand |
| "This material takes finished lengths only — use Count, or Add lengths on the takeoff page." | Run on a "Finished pieces" material | Use Count / Add lengths |
| "Enter a whole number of 1 or more." | Qty blank, 0 or a fraction | Type a whole number |
| "Enter a number greater than 0." / "Finished length must be a number greater than 0." | Length blank, 0 or negative | Type the length in mm |
| "Finished length looks too large (over 30 m)." | Typo — the server refused it, so nothing else will save until it is cleared | Clear the refused entry as in SOP 20-07 Section 5F, then re-enter in mm |
| "Quantity looks too large." | Qty over 10,000 (refused by the server) | As above |
| "A takeoff can hold at most 500 measurements." | Limit reached | Start a **New takeoff** for the rest of the job |
| "That scale belongs to a different plan page." / "That plan is not on this job." | Data from another page/job was sent (should not happen in normal use) | Close and reopen the takeoff; report it |
| "N unfinished run(s) … not in the order until finished." | A run was left mid-drawing | **Show** → **Continue drawing** / **Finish as …** / **Remove** |
| "Not saved: One or more values are not valid for this field." after finishing a run | Migration 207 missing on that database | Apply 207 to that (non-production) database |

---

## 9. Related modules

- [20-02 Set up plans and scale a page → you need a Ready scale before measuring runs](20-02_set_up_and_scale_plans.md)
- [20-04 Flashing profiles, materials and company standards → the allowance, rounding and ceiling rules come from the material](20-04_profiles_materials_standards.md)
- [20-11 Continuous flashing runs and splitting at the limit → red overflow, splits, moving splits](20-11_continuous_flashing_runs.md)
- [20-05 Length schedule and splitting → where your runs and counts end up](20-05_length_schedule_and_split.md)
- [20-07 Saving, recovery and conflicts → autosave and the save chip](20-07_saving_recovery_conflicts.md)
- [20-08 Timber](20-08_timber_takeoff.md) · [20-09 Cladding walls](20-09_cladding_walls_and_elevation.md) · [20-10 Aluminium](20-10_aluminium_cutting_sheet.md) → the other materials' tools on the same screen

---

## 10. Screenshot placeholders

[insert screenshot: Measure screen in Run mode with a finished three-leg run and its order length on the plan]
[insert screenshot: Run panel while drawing — "Measured … + allowance 200 → order … mm", "Still drawing …", Finish / Discard run]
[insert screenshot: Count mode — Finished length field, numbered dots, "Counted 4 × 2,400 mm", Finish count]
[insert screenshot: Select mode — a run selected with point handles, + markers and the run panel]
[insert screenshot: overview material row — Add lengths with the list of entered lengths and Remove]
[insert screenshot: banner "This page has no scale yet. You can still count pieces." with Scale page]

---

## 11. Automation notes

- **Autosave:** each completed tap/finish/move/remove is queued and committed ~500 ms later with `POST …/workspaces/:id/commit` (`expectedRevision` + one idempotency key per batch). See SOP 20-07.
- **Run (TC-R04):** one `takeoff_measurements` row `kind` 'polyline' — `document_id`, `page_index`, `calibration_id`, `geometry` { v 2, points [2..n PDF-space points], inputs { splitsMm [], splitAnchors? } }. It is written from the second point **without** a contribution (an unfinished run); **Finish** adds the `takeoff_contributions` row (`role` 'primary'). Length is computed by the server from the points and the calibration (migration 207 widens the kind and role checks).
- **Older straight runs** (`kind` 'run', exactly two points, `raw_length_mm` stored) still display, select, drag and calculate exactly as before.
- **Order length:** per ordered piece `finished = ceil((tight + allowance) / increment) × increment` with the material's rules (defaults 200 / 100). Examples: 4,312 → 4,600; 3,000 (four 750 legs) → 3,200; 5,800 → 6,000; 5,801 → 6,100; 8,800 → 9,000; 8,801 → 9,100 (over ceiling).
- **Count:** one `takeoff_measurements` row per count group — `kind` 'count', `finished_length_mm` = typed length, `geometry.points` = the dots, `calibration_id` NULL. Adding a dot updates the same row (`revision` + 1).
- **Manual:** `kind` 'manual', `finished_length_mm`, `quantity`, `document_id` / `calibration_id` / `geometry` all NULL. **Remove** on the list archives that measurement and its contribution.
- **Remove:** soft archive — `archived_at` is set on the measurement and its contribution; nothing is hard-deleted (a trigger blocks DELETE).
- **Device draft:** the run being drawn is also kept in this browser's storage (`blh-takeoff-measure-draft:<workspace>:<material>:<plan>:<page>`).
- Each successful commit increases `takeoff_workspaces.revision` by 1 and records `updated_by_type` / user or employee id.
- No email, notification or file is created.

---

## 12. Edge cases and limits

- Maximum 500 live measurements per takeoff and 1,000 points per measurement.
- Every point of a run must stay inside the chosen scaled region.
- Runs on a scale marked Needs review / Not checked, on a scale that has since been replaced by a re-scale, or on a replaced plan, are kept and shown but block order-ready export. Dragging a point keeps the run's original scale — use **Review with new scale** on the overview to move runs to a newer scale.
- Counting works on an unscaled page; counted and manual lengths never get allowance or rounding.
- Changing the count length affects new dots only; to change old dots, remove that count and re-count.
- Manual lengths can't be edited — **Remove** the entry from the **Add lengths** list and add it again.
- **Remove** in Select mode removes a whole count group, not one dot.
- Undo/redo only covers the current visit to the Measure screen (up to 100 steps).
- Two-finger gestures never place points, including when one finger lifts first; a double-tap never adds a duplicate end point.
- Double-tap timing can vary between phones — **Finish** always works.

---

## 13. Owner of the process

Admin / Director  
Next review date: 2027-04-14

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] **UI Review Mode** (no database) for TC-01 to TC-03, TC-06, TC-07, TC-08, TC-11, TC-12: your own server — **never port 5180 and never production** — `VITE_UI_REVIEW_MODE=true npx vite --port <PORT> --strictPort` (or the agents' no-HMR config); Playwright with `PLAYWRIGHT_BROWSERS_PATH=0`, `UI_REVIEW_PORT=<PORT>`. Open `http://localhost:<PORT>/carpentry/cjb-1/takeoff?reviewRole=admin` (synthetic job: **Apron flashing** and **Barge flashing**, four straight seeded runs, 3 × 4,312 manual, 2 × 2,400 count; page 1 scaled Ready). Phone 390 × 844 touch.
- [ ] Plan positions: PDF point for (x mm, y mm) = `{ x: 120 + x × 0.0283464567, y: 150 + y × 0.0283464567 }`; screen = `document.querySelector("[data-takeoff-viewport]").takeoffViewport.toScreen(pt)` + viewport rect; zoom with `.takeoffViewport.zoomOn(pt, factor)`. Drawn taps land on whole pixels (allow ±40 mm; ±30 when zoomed ×4 or more). Records: `await (await fetch("/api/takeoff/workspaces/ws-1")).json()` and `window.__takeoffReviewState()`.
- [ ] **Live stack** for the DB-only checks (TC-04, TC-05, TC-09, TC-10): local dev, isolated/test database **with migrations 206 and 207 applied**, `TAKEOFF_ENABLED=true`, a `BLH TEST` carpentry job with the synthetic known-scale PDF (1 PDF unit = 20 mm on page 1) scaled **Ready**, a flashing material with default rules and a "Finished pieces only" material; Admin login, a leading-hand token and an ordinary-worker token. Never production.

### Test cases

**TC-01 — Happy path (one straight run, UI Review)**
1. **Measure** → **Run**. Zoom ×4 on (2500, 4500). Tap (1000, 4500), wait 400 ms, double-tap (5312, 4500).
2. Expected result: while drawing "Measured … + allowance 200 → order … mm" with order = ceil((tight + 200) ÷ 100) × 100 (4,600 for 4,312 ±30); after the double-tap "Finished — one run:", the run drawn with its order length, chip **Saving…** then **Saved**, "5 run(s) on this page."; the schedule gains one piece of that length under **Apron flashing**.
3. Expected record: `__takeoffReviewState().measurements` + 1; new measurement `kind` "polyline" with 2 points; one contribution `role` "primary" to `mat-apron`. Live DB: `takeoff_measurements.kind` 'polyline', `takeoff_contributions.role` 'primary'.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. **Count** mode: tap the plan without typing a length.
2. Overview → **Add lengths**: leave Finished length blank; then type Qty `1.5`.
3. **Run**: tap one point, then look at **Finish**.
4. Expected result: step 1 "Enter the finished length first."; step 2 **Add** disabled while blank, Qty shows "Enter a whole number of 1 or more."; step 3 **Finish** is disabled with one point.
5. Expected DB: no new measurement rows (snapshot count unchanged).
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission (double-tap finishes once; same-length runs stay separate)**
1. **Run**: zoom ×4 on (2000, 4500); tap (1000, 4500), (2500, 4500); then tap (2500, 3800) three times quickly.
2. **Open schedule** → **Apron flashing**; expand the "2 × 4,600 mm" row (the two seeded 4,312 mm straight runs).
3. Expected result: step 1 — exactly one finished run with **3** points, no leftover draft, measurements + 1 (no phantom run); step 2 — the two separate runs are listed as **2 × 4,600 mm**, each explained "Measured 4,312 + allowance 200 → order 4,600 mm" (never merged into one longer piece, never one allowance for both).
4. Live DB: re-send a captured commit with the same `idempotencyKey` → `commit.replayed: true`, same revision, no extra rows.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role (live stack)**
1. Open the takeoff read-only (Admin preview of a leading hand) → **View plan** → tap in Run mode.
2. As an ordinary worker, `POST /api/worker/takeoff/workspaces/<id>/commit` with a run.
3. As the leading hand (own token), measure and finish one run.
4. Expected result: step 1 "You can't change this takeoff."; no point placed; step 2 HTTP 403 "Takeoffs are for leading hands and office staff."; step 3 works and saves.
5. Expected DB: no rows from steps 1–2; step 3 row has `created_by_type` 'employee', `created_by_employee_id` set, `created_by_user_id` NULL. (UI Review: `?takeoffWorker=ordinary` on `/worker/takeoff/carpentry/cjb-1` shows "You don't have access to this.")
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (server recalculates, live stack)**
1. Send a commit with a finished polyline whose points are 215.6 PDF units apart, with tampered `rawLengthMm: 1` and `finishedLengthMm: 99999` in the body.
2. Check the stored row and the response's `computed` block.
3. Expected result: the computed line is 1 × 4,600 (from the points + calibration, not the tampered numbers); workspace `revision` + 1; `updated_by_type` 'staff'. No email/notification.
- [ ] Pass  [ ] Fail

**TC-06 — Allowance once per piece, corners add none (UI Review)**
1. **Run**: zoom ×12 on (1750, 3750); tap (1000, 4500), (1750, 4500), (1750, 3750), (2500, 3750), wait 400 ms, double-tap (2500, 3000).
2. Separately draw a straight run ≈ 9,500 mm ((0, 6000) → (9500, 6000)) and finish it.
3. Expected result: step 1 — **one** run (5 points, 1 piece), tight ≈ 3,000 (±30), order = tight + 200 rounded up (3,200 for exactly 3,000), "4 legs — corners are cut/folded on site; they add no pieces or allowances."; step 2 — red overflow, legal marker at 8,800 and "… over the 9,000 mm maximum …" (handled in SOP 20-11). Exact references with `?takeoffSeed=mixed`: run `m-pl2` has `data-tight` 3000 and `data-order` 3200; run `m-pl1` (10,000 tight, split at 8,800) has `data-order` 9000+1400 — 8,800 orders exactly 9,000 (long piece, orderable).
- [ ] Pass  [ ] Fail

**TC-07 — Count length change keeps old marks**
1. **Count**: type 2400, tap 3 places. Type 1800, tap 2 places.
2. Expected result: "Counted 3 × 2,400 mm" then "Counted 2 × 1,800 mm"; the schedule shows "3 × 2,400"-style lines with "(finished length, no allowance)" (the seeded 2 × 2,400 count is a separate group on Barge flashing).
3. Expected record: two new `kind` "count" measurements — one with `finishedLengthMm` 2400 and 3 points, one with 1800 and 2 points; `calibrationId` null on both.
- [ ] Pass  [ ] Fail

**TC-08 — Manual finished lengths: add and remove (UI Review)**
1. Overview → **Barge flashing** → **Add lengths** → Finished length 4312, Qty 3 → **Add**.
2. In the list under **Add lengths**, tap **Remove** on that "3 × 4,312 mm" entry.
3. Expected result: step 1 — the list shows "3 × 4,312 mm" with **Remove**; the schedule's Barge group shows "3 × 4,312 mm" with "Entered 3 × 4,312 mm (finished length, no allowance)"; step 2 — the entry and its schedule line disappear.
4. Expected record: step 1 adds `kind` "manual" (`finishedLengthMm` 4312, `quantity` 3) with a contribution; step 2 archives both.
- [ ] Pass  [ ] Fail

**TC-09 — Region and replaced-plan blocks (live stack)**
1. Choose region **Detail A**; tap a start inside and a point outside.
2. Commit via API a run crossing the region edge.
3. Supersede the plan (SOP 20-02 TC-09), open the old plan, try Run and Count.
4. Expected result: step 1 "That point is outside the scaled region."; step 2 HTTP 400 "This run goes outside the scaled region. Measure inside the region, or scale the other region first." (or the path message "This path goes outside the scaled region."); step 3 banner "This plan has been replaced. Existing measurements stay here for review — measure on the current revision." and taps show "This plan has been replaced — measure on the current revision."; API for a new count → 400 "This plan has been replaced — count on the current revision."
- [ ] Pass  [ ] Fail

**TC-10 — Resource tampering (live stack)**
1. Commit a run on page 1 using page 2's calibration id.
2. Commit a run with `documentId` = another test job's plan.
3. Commit an upsert of a measurement id that belongs to another takeoff.
4. Expected result: step 1 HTTP 400 "That scale belongs to a different plan page."; step 2 HTTP 403 "That plan is not on this job."; step 3 rejected (HTTP 403 "That item isn't part of this job's takeoff.").
5. Expected DB: nothing written; `revision` unchanged.
- [ ] Pass  [ ] Fail

**TC-11 — Gestures never place stray points (UI Review)**
1. **Run**: tap once in the middle (1 point). Then drag one finger > 8 px; pinch with two fingers; start a touch and cancel it; switch to **Pan** and tap.
2. Expected result: still 1 point after each gesture; no runs created in Pan; back in **Run** the next tap adds point 2. Record the device used; iPhone evidence may be pending.
- [ ] Pass  [ ] Fail

**TC-12 — Select, move, remove and undo (UI Review)**
1. **Select** → tap the middle of the seeded 4,312 run at (3000, 2000) → "Measured 4,312 …"; drag its end handle 30 px; **↶**; **↷**; **Remove**; **↶**.
2. **Run**: tap two points, then tap **Done** (leave the screen without finishing); tap **Measure** again.
3. Expected result: step 1 — the length changes on release (no "Measured 4,312" any more); undo restores "Measured 4,312"; redo re-applies; Remove hides it and the schedule drops it; undo brings it back; step 2 — leaving finished the valid run: "5 run(s) on this page." and no draft.
4. Expected record: after Remove the measurement and contribution are archived (absent from the fake snapshot); after the final undo they are back; step 2 adds one `kind` "polyline" with a contribution.
- [ ] Pass  [ ] Fail

**TC-13 — Show / hide takeoff items one by one, and Delete run (HUB 011, UI Review)**
1. Default job → **Flashings** → **Measure** → **Takeoffs ▾**.
2. Expected: a list with "Apron flashing" and "Barge flashing", both ticked.
3. Untick **Barge flashing**. Expected: only the Barge lines disappear; the button reads "Takeoffs (1 hidden) ▾"; banner "1 of 2 takeoff items hidden on this page (Barge flashing) — nothing is deleted…". In **Select**, tapping where a Barge line was selects nothing.
4. Reload the page. Expected: still "Takeoffs (1 hidden) ▾".
5. **Hide all** → no lines and "All takeoffs are hidden on this page…"; **Show all** → every line back, and the Barge line can be tapped again.
6. Select a run → **Delete run**. Expected: it disappears, and a banner with **Undo** brings it back.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

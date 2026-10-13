---
sop_version: 1.0
last_reviewed: 2026-10-13
app_version: takeoff-r03
screenshot_status: placeholders_only
owner: Admin / Director
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP: Measure Runs and Count Pieces

**Module:** Takeoffs (flashing takeoff from plans)  
**SOP ID:** 20-03  
**Status:** Draft  
**Priority:** High

> **Feature status (2026-10-13):** Takeoffs ship **switched off** behind the server flag `TAKEOFF_ENABLED`, and **database migration 206 has not been applied in production**. Nothing in this SOP has been tested against the live app. See SOP 20-01 for switching it on.

---

## 1. Who uses this

- **Admin (Director)** and **Supervisor** — in the Hub.
- **Leading hand** — in the Worker app, on jobs they can see.
- View-only users (and an admin previewing a leading hand) can open the plan with **View plan**, pan/zoom and use **Select** to read a run's result, but cannot add, move or remove anything.

---

## 2. When to use it

- After the plan page is scaled (SOP 20-02) and you have a material to measure with (SOP 20-04).
- To measure straight runs of flashing off the plan (barge, apron, ridge, valley, etc.).
- To count pieces that are a known finished length (e.g. 12 × 2,400 mm cappings).
- To add lengths that aren't on the plan (manual lengths).
- To fix or remove a run or count you placed wrongly.

---

## 3. What this does

**Run** turns two taps on a scaled plan into one straight run. The app works out the real length, adds the material's allowance once (default **200 mm total per run**) and rounds **up** to the material's increment (default **100 mm**) to give the order length — for example "Measured 4,312 + allowance 200 → order 4,600 mm". **Count** and **Add lengths** are different: you type the **finished** order length and it is used exactly — no allowance, no rounding. Every run, count and manual length feeds the length schedule (SOP 20-05).

---

## 4. Before you start

- The plan page is scaled and shows **Ready** (runs on a page marked **Needs review** or **Not scaled** can't be ordered). Counting doesn't need a scale.
- The takeoff has at least one material. If not, **Measure** opens **Choose material** first (SOP 20-04).
- The plan is the **current** revision — measuring on a replaced plan is blocked.
- You have edit access (SOP 20-01).
- A data connection to open the plan (it isn't stored offline). Edits made during a short dropout are kept (SOP 20-07).

---

## 5. Step-by-step process

### A. Open the Measure screen

1. On the takeoff overview tap **Measure** (view-only users see **View plan**).
2. The plan fills the screen. The top bar shows the material name, "<plan> · page N · scaled / scale needs review / not scaled", the save chip, **↶** (Undo) and **↷** (Redo). **Done** (top-left) returns to the overview.
3. Under the top bar: the tool switch **Run | Count | Select | Pan**, a **Connected** tick-box (Run only), a **Material: <name>** button and **Fit** (show the whole page).
4. Check the material is right. To change it tap **Material: <name>** → **Measure with…** → tap the material (or **Add material**).
5. If the page has more than one scaled region, tap the one you are measuring under **Scaled region:**.

[insert screenshot: Measure screen — tool switch Run/Count/Select/Pan, Connected ticked, Material button, Fit]

### B. Measure straight runs (Run)

1. Tap **Run**.
2. Leave **Connected** ticked to follow a continuous line of flashing around corners. Untick it to draw separate, unconnected runs.
3. Pinch to zoom in and tap the **start** of the run, then tap the **finish**.
4. Read the result in the panel: "Measured 4,312 + allowance 200 → order 4,600 mm". A **long piece** label means the order length is over the handling flag (default 6,000 mm); **over order ceiling — split it** means it is over the order ceiling (default 9,000 mm) — see SOP 20-05.
5. With **Connected** on, the finish becomes the next start: keep tapping each corner. **Each corner ends one run and starts the next**, and every run gets its own allowance.
6. Tap **End this line** to stop the chain; your next tap starts a new line.
7. Two runs that happen to be the same length are still two separate runs (they appear as "2 × 4,600" in the schedule, each with its own allowance).

> 💡 **Tip:** If the finish is too close to the start you'll see "Tap the finish further from the start — zoom in for short runs." Zoom in and tap again.

[insert screenshot: Run result — "Measured 4,312 + allowance 200 → order 4,600 mm"]

### C. Count pieces (Count)

1. Tap **Count**.
2. Type the finished length into **Finished length (no allowance added)** **first**, then press Enter / Done.
3. Tap each place on the plan where that piece goes. Each tap adds a numbered dot and the panel shows "Counted N × 2,400 mm".
4. To count a different length, type the new length. **This starts a new count** — the dots you already placed keep their old length.
5. Tap **Finish count** when done with that length (a later tap with the same length starts a fresh count group).

> 💡 **Tip:** Counted lengths are finished order lengths — the app never adds the 200 mm allowance or rounds them.

### D. Add lengths that aren't on the plan (manual)

1. Tap **Done** to go back to the overview.
2. On the material's row tap **Add lengths**.
3. Type the **Finished length** (mm) and **Qty** (pcs), then tap **Add**. The length is used exactly — no allowance or rounding.
4. **Check before tapping Add** — a manual entry can't currently be edited or deleted on its own (see Section 12).

### E. Select, adjust or remove

1. Tap **Select**, then tap a run line or a count dot.
2. The panel shows **Run** with its explanation (e.g. "Measured 4,312 + allowance 200 → order 4,600 mm") or **Count — N marks**, plus any problem.
3. Drag a handle to move a point — a magnifier shows exactly where it sits. (Alt + arrow-key nudging works in the Scale screen but not yet on Measure handles — drag with the mouse instead.)
4. Tap **Remove** to remove the selected run, or the **whole** count group (all its dots).

### F. Move around, undo and finish

1. **Pan** — every drag moves the plan; nothing is placed. In any tool, **two fingers always pan and zoom** and never place a point. A drag of more than a few pixels in Run/Count also pans instead of placing.
2. **Fit** shows the whole page. On a computer: scroll to pan, Ctrl/⌘ + scroll to zoom, **+ / − / 0** keys to zoom in / out / fit, arrow keys to pan.
3. **↶ / ↷** undo and redo changes made since you opened this Measure screen (leaving the screen clears the undo list).
4. Tap **Done**. Everything has already been saved automatically — check the chip says **Saved** (SOP 20-07).

---

## 6. What happens next

- Each completed tap is saved automatically about half a second later; the server recalculates every length from the plan points and the scale (it never trusts lengths sent from the phone).
- New pieces appear in the **Length schedule** (SOP 20-05), grouped by material and finished length, and in the overview's piece count.
- Pieces over the order ceiling, on a scale that isn't Ready, or on a replaced plan show "needs attention" and can't go on a supplier PDF until fixed.
- Nothing is ordered, sent or emailed.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Drawing one long run around a corner with two taps | A run is always straight | Tap every corner with **Connected** on — each corner is its own run |
| Typing the count length after tapping | Count needs the length first | Type **Finished length** first, then tap |
| Adding 200 mm to counted / manual lengths yourself | Habit from measured runs | Enter the finished length you want to order; no allowance is added |
| Measuring on the wrong material | The last material stays active | Check the **Material: <name>** button before tapping |
| Using **Run** with a "Finished pieces only" material | That material only takes finished lengths | Use **Count** or **Add lengths** for it (runs on it are flagged invalid) |
| Expecting **Remove** to delete one count dot | Remove works on the whole count group | Use **↶** straight away, or drag the dot, or remove and re-count |
| Measuring on a page marked Needs review | The check failed or was skipped | Re-scale first (SOP 20-02) |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Scale this page before measuring runs." | Page not scaled | Tap **Scale page** on the banner (SOP 20-02), or use **Count** |
| "This page has no scale yet. You can still count pieces." | Page not scaled | As above |
| "The scale on this page failed its check — runs are shown but can't be ordered until it is re-scaled." / "…hasn't been checked…" | Calibration Needs review / Not checked | **Re-scale**, then on the overview tap **Review with new scale** to move the old runs onto the new scale (SOP 20-02 Section 5D) |
| Schedule says "This page has been re-scaled since this run was measured — review it with the new scale." | The page was re-scaled after the run was drawn | On the overview tap **Review with new scale** (SOP 20-02 Section 5D), or Select → **Remove** and re-measure |
| "Choose which scaled region you are measuring in." | Page has several scaled regions | Tap the region under **Scaled region:** |
| "That point is outside the scaled region." | Tap or drag outside the chosen region | Measure inside the region, or scale the other region |
| "This run goes outside the scaled region. Measure inside the region, or scale the other region first." | Server refused a run crossing the region edge | As above |
| "Tap the finish further from the start — zoom in for short runs." | Finish too close on screen | Zoom in and tap again |
| "Enter the finished length first." | Count tapped before typing a length | Type **Finished length** first |
| "Choose a material first." | No active material | **Material: …** → choose or **Add material** |
| "This plan has been replaced — measure on the current revision." (also "…count on the current revision.") | Measuring on a superseded plan | Choose the current revision in **Set up plans** |
| "You can't change this takeoff." | View-only access or preview | Ask an Admin, Supervisor or leading hand |
| "Enter a whole number of 1 or more." | Qty blank, 0 or a fraction | Type a whole number |
| "Enter a number greater than 0." / "Finished length must be a number greater than 0." | Length blank, 0 or negative | Type the length in mm |
| "Finished length looks too large (over 30 m)." | Typo — the screen accepted it but the server refused it, so nothing else will save until it is cleared | Clear the refused entry as in SOP 20-07 Section 5F, then re-enter in mm |
| "Quantity looks too large." | Qty over 10,000 (refused by the server) | As above |
| "A takeoff can hold at most 500 measurements." | Limit reached | Start a **New takeoff** for the rest of the job |
| "That scale belongs to a different plan page." / "That plan is not on this job." | Data from another page/job was sent (should not happen in normal use) | Close and reopen the takeoff; report it |
| Schedule says "This material only takes finished lengths — enter or count pieces instead of measuring runs." | A run was drawn on a "Finished pieces only" material | Select → Remove the run; use Count / Add lengths |

---

## 9. Related modules

- [20-02 Set up plans and scale a page → you need a Ready scale before measuring runs](20-02_set_up_and_scale_plans.md)
- [20-04 Flashing profiles, materials and company standards → the allowance and rounding rules come from the material](20-04_profiles_materials_standards.md)
- [20-05 Length schedule and splitting → where your runs and counts end up](20-05_length_schedule_and_split.md)
- [20-07 Saving, recovery and conflicts → autosave and the save chip](20-07_saving_recovery_conflicts.md)

---

## 10. Screenshot placeholders

[insert screenshot: Measure screen in Run mode with a connected line of three runs and their order lengths on the plan]
[insert screenshot: Run panel — "Measured … + allowance 200 → order … mm" with "long piece" label]
[insert screenshot: Count mode — Finished length field, numbered dots, "Counted 4 × 2,400 mm", Finish count]
[insert screenshot: Select mode — handle being dragged with the magnifier showing]
[insert screenshot: overview material row — Add lengths form with Finished length, Qty and Add]
[insert screenshot: banner "This page has no scale yet. You can still count pieces." with Scale page]

---

## 11. Automation notes

- **Autosave:** each completed tap/move/remove is queued and committed ~500 ms later with `POST …/workspaces/:id/commit` (`expectedRevision` + one idempotency key per batch). See SOP 20-07.
- **Run:** one `takeoff_measurements` row — `kind` 'run', `document_id`, `page_index`, `calibration_id`, `geometry` {points:[2 PDF-space points]}, `raw_length_mm` **computed by the server** from the points and the calibration, `finished_length_mm` NULL (the order length is calculated, not stored), `quantity` NULL. Plus one `takeoff_contributions` row linking it to the material (`role` 'primary').
- **Order length (measured run):** `finished = ceil((raw + allowance) / increment) × increment` with the material's rules (defaults 200 / 100). Examples: 4,312 → 4,600; 4,300 → 4,500; 5,800 → 6,000; 5,801 → 6,100; 8,800 → 9,000; 8,801 → 9,100 (over ceiling).
- **Count:** one `takeoff_measurements` row per count group — `kind` 'count', `finished_length_mm` = typed length, `geometry.points` = the dots (quantity = number of dots), `calibration_id` NULL. Adding a dot updates the same row (`revision` + 1).
- **Manual:** `kind` 'manual', `finished_length_mm`, `quantity`, `document_id` / `calibration_id` / `geometry` all NULL (a database check enforces "no fictional calibration").
- **Remove:** soft archive — `archived_at` is set on the measurement and its contribution; nothing is hard-deleted (a trigger blocks DELETE).
- Each successful commit increases `takeoff_workspaces.revision` by 1 and records `updated_by_type` / user or employee id.
- No email, notification or file is created.

---

## 12. Edge cases and limits

- Maximum 500 live measurements per takeoff and 1,000 points per measurement.
- A run is exactly two points and must stay inside the chosen scaled region.
- Runs on a scale marked Needs review / Not checked, on a scale that has since been replaced by a re-scale, or on a replaced plan, are kept and shown but block order-ready export. Dragging a run's end keeps its original scale — use **Review with new scale** on the overview to move runs to a newer scale.
- Counting works on an unscaled page; counted and manual lengths never get allowance or rounding.
- Changing the count length affects new dots only; to change old dots, remove that count and re-count.
- **Manual lengths can't be edited or removed individually** in this version (they have no plan position, so Select can't reach them, and there is no list to delete from). The only way to clear one is **Remove** on the whole material, which also clears its other measurements' assignments. Double-check before tapping **Add**.
- **Remove** in Select mode removes a whole count group, not one dot.
- Undo/redo only covers the current visit to the Measure screen (up to 100 steps).
- Measuring a **Run** on a "Finished pieces only" material is allowed by the screen but flagged invalid in the schedule.
- Two-finger gestures never place points, including when one finger lifts first.

---

## 13. Owner of the process

Admin / Director  
Next review date: 2027-04-13

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Local dev, isolated/test database **with migration 206 applied**, `TAKEOFF_ENABLED=true`.
- [ ] A `BLH TEST` carpentry job with the synthetic known-scale PDF (1 PDF unit = 20 mm on page 1) scaled **Ready** (SOP 20-02 TC-01), page 2 unscaled, and one region "Detail A" scaled on page 1.
- [ ] A flashing material with default rules (allowance 200, increment 100, handling 6,000, ceiling 9,000) and a "Finished pieces only" material (SOP 20-04).
- [ ] Logged in as Admin; devtools Network tab open. A leading-hand token and an ordinary-worker token for the role test.

### Test cases

**TC-01 — Happy path (one measured run)**
1. Measure → **Run**, **Connected** unticked. Tap two points 215.6 PDF units apart horizontally (= 4,312 mm).
2. Expected result: panel "Measured 4,312 + allowance 200 → order 4,600 mm"; the run is drawn with "4,600" on it; chip goes **Saving…** then **Saved**; schedule shows "1 × 4,600 mm".
3. Expected API: commit → `{ ok: true, commit: { revision: R+1, replayed: false }, computed: { scheduleLines: [{ finishedLengthMm: 4600, quantity: 1, problems: [] , … }], … } }`.
4. Expected DB record: `takeoff_measurements` — `kind` 'run', `raw_length_mm` ≈ 4312, `finished_length_mm` NULL, `quantity` NULL, `calibration_id` = page-1 calibration, `geometry` with 2 points, `created_by_type` 'staff'; `takeoff_contributions` — `measurement_id` = that run, `job_material_id` = the flashing, `role` 'primary', `split` NULL.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. **Count** mode: tap the plan without typing a length.
2. Overview → **Add lengths**: leave Finished length blank; then type Qty `1.5`.
3. Via API commit a manual measurement with `finishedLengthMm: 0`, then one with `quantity: 0`.
4. Expected result: step 1 "Enter the finished length first."; step 2 **Add** disabled while blank, Qty shows "Enter a whole number of 1 or more."; step 3 HTTP 400 "Finished length must be a number greater than 0." and "Quantity must be a whole number of 1 or more."
5. Expected DB: no new measurement rows.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission (A09)**
1. Capture the TC-01 commit request and re-send it unchanged (same `idempotencyKey`).
2. Draw a second, separate run of the same length.
3. Expected result: step 1 → `commit.replayed: true`, same revision, still one run row; step 2 → a second run row and contribution; schedule shows "2 × 4,600 mm" (each with its own allowance — never merged into one longer piece).
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Open the takeoff read-only (Admin preview of a leading hand) → **View plan** → tap in Run mode.
2. As an ordinary worker, `POST /api/worker/takeoff/workspaces/<id>/commit` with a run.
3. As the leading hand (own token), measure one run.
4. Expected result: step 1 "You can't change this takeoff."; no point placed; step 2 HTTP 403 "Takeoffs are for leading hands and office staff."; step 3 works and saves.
5. Expected DB: no rows from steps 1–2; step 3 row has `created_by_type` 'employee', `created_by_employee_id` set, `created_by_user_id` NULL.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (server recalculates, A24)**
1. Send a commit with a run whose points are 215.6 units apart but with tampered `rawLengthMm: 1` and `finishedLengthMm: 99999`.
2. Check the stored row and the response's `computed` block.
3. Expected result: `raw_length_mm` ≈ 4312 (server value), `finished_length_mm` NULL; computed line 1 × 4,600; workspace `revision` + 1; `updated_by_type` 'staff'. No email/notification.
- [ ] Pass  [ ] Fail

**TC-06 — Allowance once per run and rounding cases**
1. With **Connected** on, draw one connected line of three straight legs (four taps) measuring 4,300, 5,800 and 5,801 mm.
2. Draw separate runs of 8,800 and 8,801 mm.
3. Expected result: three run rows (one per straight leg); order lengths 4,500, 6,000 and 6,100 (6,100 shows **long piece**); 8,800 → 9,000 (**long piece**, still orderable); 8,801 → 9,100 shows **over order ceiling — split it** and "needs attention" in the schedule. The allowance appears once per run in each explanation (never per end, never per corner).
- [ ] Pass  [ ] Fail

**TC-07 — Count length change keeps old marks (A17)**
1. **Count**: type 2400, tap 3 places. Type 1800, tap 2 places.
2. Expected result: panel shows "Counted 3 × 2,400 mm" then "Counted 2 × 1,800 mm"; schedule shows "3 × 2,400" and "2 × 1,800" with "(finished length, no allowance)".
3. Expected DB: two `kind` 'count' rows — one with `finished_length_mm` 2400 and 3 points, one with 1800 and 2 points; `calibration_id` NULL on both.
- [ ] Pass  [ ] Fail

**TC-08 — Manual finished lengths (no allowance, no rounding)**
1. Overview → **Add lengths** → Finished length 4312, Qty 3 → **Add**.
2. Expected result: schedule "3 × 4,312 mm" with "Entered 3 × 4,312 mm (finished length, no allowance)"; that line contributes 12.936 LM.
3. Expected DB: `kind` 'manual', `finished_length_mm` 4312, `quantity` 3, `document_id`, `calibration_id` and `geometry` NULL.
- [ ] Pass  [ ] Fail

**TC-09 — Region and replaced-plan blocks**
1. Choose region **Detail A**; tap a start inside and a finish outside.
2. Commit via API a run crossing the region edge.
3. Supersede the plan (SOP 20-02 TC-09), open the old plan, try Run and Count.
4. Expected result: step 1 "That point is outside the scaled region."; step 2 HTTP 400 `OUTSIDE_REGION` "This run goes outside the scaled region. Measure inside the region, or scale the other region first."; step 3 banner "This plan has been replaced. Existing measurements stay here for review — measure on the current revision." and taps show "This plan has been replaced — measure on the current revision."; API for a new count → 400 "This plan has been replaced — count on the current revision."
- [ ] Pass  [ ] Fail

**TC-10 — Resource tampering (A06)**
1. Commit a run on page 1 using page 2's (or region's other page) calibration id.
2. Commit a run with `documentId` = the other test job's plan.
3. Commit an upsert of a measurement id that belongs to another takeoff.
4. Expected result: step 1 HTTP 400 "That scale belongs to a different plan page."; step 2 HTTP 403 "That plan is not on this job."; step 3 rejected (HTTP 403 "That item isn't part of this job's takeoff.").
5. Expected DB: nothing written; `revision` unchanged.
- [ ] Pass  [ ] Fail

**TC-11 — Gestures never place stray points**
1. In **Run** mode pinch-zoom with two fingers (lift one finger first, then the other); drag more than 8 px with one finger; switch to **Pan** and tap.
2. Expected result: no points or runs are created in any case (Playwright `npm run test:takeoff:ui` / real device). Record the device used; iPhone evidence may be pending.
- [ ] Pass  [ ] Fail

**TC-12 — Select, move, remove and undo**
1. **Select** the TC-01 run, drag one end 50 units further, release; then **↶**, then **↷**; then **Remove**; then **↶**.
2. Expected result: length updates on release; undo restores it; redo re-applies; Remove hides it and the schedule drops it; undo brings it back.
3. Expected DB: after Remove `archived_at` set on the measurement and its contribution; after the final undo `archived_at` back to NULL; `revision` increases with each saved step.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

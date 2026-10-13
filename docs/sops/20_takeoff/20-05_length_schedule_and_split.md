---
sop_version: 1.0
last_reviewed: 2026-10-13
app_version: takeoff-r03
screenshot_status: placeholders_only
owner: Admin / Director
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP: Length Schedule and Splitting Long Pieces

**Module:** Takeoffs (flashing takeoff from plans)  
**SOP ID:** 20-05  
**Status:** Draft  
**Priority:** High

> **Feature status (2026-10-13):** Takeoffs ship **switched off** behind the server flag `TAKEOFF_ENABLED`, and **database migration 206 has not been applied in production**. Nothing in this SOP has been tested against the live app. See SOP 20-01 for switching it on.

---

## 1. Who uses this

- **Admin (Director)** and **Supervisor** — in the Hub.
- **Leading hand** — in the Worker app.
- View-only users (and an admin previewing a leading hand) can open and read the schedule, but the **Split / Edit split / Remove split** buttons are hidden.

---

## 2. When to use it

- After measuring, to check the cut list (quantity × finished length) before ordering.
- A line is labelled **long piece**, **over ceiling** or **needs attention**.
- A measured run is longer than the supplier can make in one piece and must be split into shorter pieces with laps.
- A warning says placed orders no longer match the takeoff.

---

## 3. What this does

The length schedule lists every piece you need, grouped by material and profile, as **quantity × finished length** (for example "4 × 4,600 mm"). Different lengths are never lumped together as "linear metres" — the LM total is only a summary. Tapping a line shows exactly where each piece came from (e.g. "Measured 4,312 + allowance 200 → order 4,600 mm"). A long measured run can be **split** into pieces with a lap at each joint: the pieces must cover the run's finished length, the run's allowance is **not** added again, and the split replaces the original single piece.

---

## 4. Before you start

- Runs, counts or manual lengths exist on the takeoff (SOP 20-03).
- For splitting: know the lap the supplier / installation instructions require at each joint — **there is no default lap**.
- Know the material's limits (Rules): handling flag (default **above 6,000 mm**) and order ceiling (default **9,000 mm**).
- Edit access for splitting (SOP 20-01).

---

## 5. Step-by-step process

### A. Open and read the schedule

1. On the overview, the **Length schedule** section shows total pieces and LM. A warning "Some lengths need attention before they can be ordered." means at least one line has a problem.
2. Tap **Open schedule**. The **Length schedule** window opens (**Back** top-left, save chip top-right, "X LM total").
3. Lines are grouped under each material name. Each line shows:
   - **Qty ×** and the **finished length** in mm (longest first).
   - **long piece** (amber) — longer than the handling flag; kept whole, needs care handling/transport.
   - **over ceiling** (red) — longer than the order ceiling; **blocks ordering** until split or the rule is changed.
   - **needs attention** (red) — another problem (scale not checked, page re-scaled since the run was measured, plan replaced, profile/material incomplete, split out of date…).
   - On the right: "N ordered · M left" or "not ordered" — counted **only** from orders the Director has recorded as placed (exports don't count).
4. Tap a line to expand it. You'll see each problem in words and every source piece, e.g.:
   - "Measured 4,312 + allowance 200 → order 4,600 mm"
   - "Counted 3 × 2,400 mm (finished length, no allowance)"
   - "Entered 3 × 4,312 mm (finished length, no allowance)"
5. Each material group ends with "N pieces · X LM".

| Finished length (default rules) | Shows | Can it be ordered? |
|---|---|---|
| 6,000 mm | nothing | Yes |
| 6,001 mm | **long piece** | Yes — kept whole, flagged |
| 9,000 mm | **long piece** | Yes — kept whole, flagged |
| 9,001 mm | **over ceiling** | **No** — split it or (authorised) change the material rule |

[insert screenshot: Length schedule — material group with "1 × 7,200 mm long piece", "4 × 4,600 mm", expanded line explanation]

### B. Split a long measured run

1. Expand the line and find the measured run (its explanation starts "Measured …"). Tap **Split**.
2. The **Split this run** sheet says "This run needs X mm of coverage (its allowance is already included — pieces don't get another one). Enter each piece and the lap at each joint."
3. Type **Piece 1 length**, **Lap at joint 1** and **Piece 2 length** (all mm). Tap **Add piece** for a third piece (each extra piece adds another lap). **Remove piece** takes the last one off. Minimum 2, maximum 20 pieces.
4. Get the lap from the supplier or the product's installation instructions ("there is no default lap").
5. Read the result box:
   - Green: "Pieces 3,700 + 3,700 − laps 200 = coverage 7,200 mm — exact" (or "(200 mm over)").
   - Red: "… = coverage 7,000 mm. Pieces cover 7,000 mm but 7,200 mm is needed." or "A piece is longer than the 9,000 mm order ceiling."
6. Piece lengths are rounded **up** to the material's increment (e.g. 3,650 becomes 3,700) and coverage is recalculated.
7. Tap **Apply split** (only possible when the box is green). The run's single piece is replaced by the pieces in the schedule — never both.

> 💡 **Tip:** Coverage = total of the pieces − total of the laps. It must reach the run's **finished** length (which already includes the 200 mm allowance). Don't add another allowance to the pieces.

[insert screenshot: Split this run — two pieces, lap at joint 1, green coverage box, Apply split]

### C. Change or undo a split

1. Expand the line showing "Split of a 7,200 mm run: 3,700 + 3,700 (laps 200 mm)".
2. **Edit split** reopens the sheet with your pieces and laps; change them and **Apply split**.
3. **Remove split** puts the run back to one piece.

### D. When a split goes out of date

1. If the run is moved or the material rules change after splitting, the line shows "The run or rules changed after this split — review the split." and can't be ordered.
2. Tap **Edit split**, check the pieces against the new required length, and **Apply split** again (or **Remove split**).

### E. Lines that can't be split

1. **Split** is only offered for measured runs. A counted or manual length over the ceiling can't be split.
2. For a count: **Measure → Select** the count, **Remove** it and count again with shorter finished lengths.
3. For a manual length: there is currently no way to remove a single manual entry — only raise the order ceiling (authorised, if the supplier can really supply that length) or remove the whole material (SOP 20-04). Avoid entering manual lengths over the ceiling.

### F. "Placed orders no longer match" warning

1. If you see "Some placed orders no longer match the takeoff (a measurement or rule changed). They show as surplus — check them before ordering more.", a recorded order covers lengths that are no longer in the takeoff.
2. Check the measurements/rules that changed and talk to the Director before ordering more (SOP 20-06).

---

## 6. What happens next

- The schedule is what **New order** uses to pre-fill quantities (what is still needed = required − placed) (SOP 20-06).
- Any line with a problem (over ceiling, needs attention) blocks an order-ready supplier PDF until fixed; a draft PDF can still be exported.
- Applying or removing a split autosaves like any other edit (SOP 20-07). Nothing is ordered, sent or emailed.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Adding 200 mm to each split piece | Habit from measured runs | The run's allowance is already in the required length — pieces get none |
| Guessing the lap | No default is given | Use the supplier's / installation manual's lap |
| Reading the LM total as the order | LM is only a summary | Order by the quantity × length lines |
| Raising the order ceiling to avoid a split | Quicker than splitting | Only change the ceiling when the supplier confirms that length |
| Ignoring "needs attention" | It looks like a warning only | Those lines block the supplier PDF — fix them first |
| Splitting before the run is final | Moving the run later invalidates the split | Finish adjusting runs, then split |

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
| "The run or rules changed after this split — review the split." | Run moved or rules changed after splitting | **Edit split** → **Apply split** |
| "The split pieces do not cover the run." | Saved split no longer valid | **Edit split** or **Remove split** |
| "A piece is longer than the order ceiling — split it or change the material rule." | Line over the ceiling | Split the run (Section B) or, if authorised, change the rule |
| **Split** button missing | Line is a count or manual length (only measured runs can be split), or view-only access | See Section E; ask an editor |
| "No lengths yet — measure runs, count pieces or add manual lengths." | Nothing measured | SOP 20-03 |
| "N ordered · 0 left" but you still need more | A measurement was added after the order | Start a **New order** for the remaining pieces (SOP 20-06) |

---

## 9. Related modules

- [20-03 Measure runs and count pieces → the sources of every schedule line](20-03_measure_runs_and_count.md)
- [20-04 Flashing profiles, materials and company standards → handling flag and order ceiling rules](20-04_profiles_materials_standards.md)
- [20-06 Export a supplier order and record it as placed → ordering from the schedule](20-06_export_and_record_orders.md)

---

## 10. Screenshot placeholders

[insert screenshot: overview Length schedule section — pieces, LM, "Some lengths need attention…" warning, Open schedule, Review & export order]
[insert screenshot: Length schedule window — lines with long piece / over ceiling / needs attention chips and "4 ordered · 2 left"]
[insert screenshot: expanded line — measured explanation with Split button]
[insert screenshot: Split this run — red box "Pieces cover 7,000 mm but 7,200 mm is needed."]
[insert screenshot: split applied — "Split of a 7,200 mm run: 3,700 + 3,700 (laps 200 mm)" with Edit split and Remove split]
[insert screenshot: surplus warning banner on the schedule]

---

## 11. Automation notes

- The schedule is calculated (in the browser for display, and again on the server for every save/order — client totals are never trusted) by the shared module `shared/takeoff/schedule.js`.
- **Grouping:** pieces share a line only when material method, product, product code, finish, BMT, colour, colour code, profile shape (a profile, its reverse and its mirror image count as the same part; the coating on the other face does not) **and** finished length all match. Each line is a "bucket" (material spec + finished length) — the unit used for required / ordered / remaining.
- **Flags:** compared on the **finished** length: above the handling threshold → `handlingFlag` (long piece); above the order ceiling → `ceilingExceeded` (blocks order-ready export).
- **Split:** stored on the run's `takeoff_contributions` row as `split` = {pieces:[mm…], laps:[mm…], sourceFinishedMm, version}; `split_version` increases when the split changes. The server re-checks the split on save (coverage ≥ required finished length, no piece over the ceiling, laps valid) and refuses invalid splits with HTTP 400 `SPLIT_INVALID`. **Remove split** sets `split` to NULL.
- A split is tied to the exact finished length it was made for; if that changes, the split is marked stale (`split_stale`) and blocks ordering until reviewed.
- **Ordered / left:** from `takeoff_placement_allocations` of placements with `status` 'placed' only. Drafts and exports never count. Buckets that were ordered but are no longer required are flagged for reconciliation (the surplus warning).
- No email, notification or file is created.

---

## 12. Edge cases and limits

- Splits: 2–20 pieces; one lap per joint; laps must be 0 or more and shorter than both pieces they join.
- Only measured runs with a single piece can be split; counted and manual lengths cannot.
- Piece lengths are rounded up to the material increment before coverage is checked.
- The app never chooses a split for you (no "best split").
- Changing the material's rules or moving the run makes an existing split stale.
- Surplus inside a length that is still needed (ordered more than now required) is not called out separately on the schedule line — it shows as "N ordered · 0 left". Only lengths that disappeared entirely trigger the surplus warning.
- Total LM is rounded to 3 decimal places and is a summary only.

---

## 13. Owner of the process

Admin / Director  
Next review date: 2027-04-13

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Local dev, isolated/test database **with migration 206 applied**, `TAKEOFF_ENABLED=true`.
- [ ] A `BLH TEST` carpentry job with a takeoff, a **Ready** scaled plan (1 PDF unit = 20 mm) and a flashing material with default rules and a complete spec (colour set).
- [ ] A measured run of raw 7,000 mm (350 PDF units) → finished 7,200 mm.
- [ ] Logged in as Admin; devtools Network tab open; SQL access to the test database.

### Test cases

**TC-01 — Happy path (split a 7,200 mm run)**
1. **Open schedule** → expand "1 × 7,200 mm" (**long piece**) → **Split**.
2. Piece 1 = 3700, Lap at joint 1 = 200, Piece 2 = 3700 → **Apply split**.
3. Expected result: green box "Pieces 3,700 + 3,700 − laps 200 = coverage 7,200 mm — exact"; schedule now shows "2 × 3,700 mm" and **no** 7,200 line; expanded line reads "Split of a 7,200 mm run: 3,700 + 3,700 (laps 200 mm)".
4. Expected API: commit with `changes.contributions.upsert[0].split = { pieces: [3700, 3700], laps: [200], sourceFinishedMm: 7200, version: 1 }` → `{ ok: true, commit: { revision: R+1 }, computed: { scheduleLines: [{ finishedLengthMm: 3700, quantity: 2, … }] } }`.
5. Expected DB record: the run's `takeoff_contributions` row — `split` as above, `split_version` 1; `takeoff_measurements` row unchanged (`raw_length_mm` ≈ 7000).
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. Open **Split** and leave Lap at joint 1 blank; then type -10.
2. Via API commit a split with `pieces: [3700, 3700], laps: []`.
3. Expected result: step 1 — **Apply split** disabled while blank; -10 shows "Enter a number of 0 or more."; step 2 — HTTP 400 `SPLIT_INVALID` "Enter a lap for every joint between pieces."
4. Expected DB: `split` unchanged.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission (A09 / A16)**
1. Re-send the TC-01 commit request with the same `idempotencyKey`.
2. Apply the same split again from the UI (**Edit split** → **Apply split** without changes).
3. Expected result: step 1 → `commit.replayed: true`, same revision, no extra rows; step 2 → still exactly "2 × 3,700 mm" (never 2 × 3,700 **plus** 1 × 7,200). Note: each **Apply split** bumps the stored split `version`, so `split_version` increases on step 2 even with identical pieces — that is expected, not a duplicate.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Open the schedule as an Admin previewing a leading hand (read-only).
2. As an ordinary worker, commit a split via `POST /api/worker/takeoff/workspaces/<id>/commit`.
3. Expected result: step 1 — lines and explanations visible, **no** Split / Edit split / Remove split buttons; step 2 — HTTP 403 "Takeoffs are for leading hands and office staff."; preview API write → HTTP 403 "Read-only preview — you can't submit or complete work as a worker."
4. Expected DB: no change.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (server validates splits, A24)**
1. Via API commit an invalid split for the 7,200 run: `pieces: [3600, 3600], laps: [200]`.
2. Measure a run of raw 8,801 mm (finished 9,100, **over ceiling**) and via API commit a split on it with `pieces: [9100, 400], laps: [100], sourceFinishedMm: 9100`.
3. Expected result: step 1 → HTTP 400 `SPLIT_INVALID` "Pieces cover 7,000 mm but 7,200 mm is needed."; step 2 → HTTP 400 "A piece is longer than the 9,000 mm order ceiling."; no DB change; `revision` unchanged.
- [ ] Pass  [ ] Fail

**TC-06 — Remove split restores the original once (A16)**
1. After TC-01 tap **Remove split**.
2. Expected result: schedule shows "1 × 7,200 mm" (long piece) once — not 1 × 7,200 plus 2 × 3,700.
3. Expected DB: `split` NULL; `split_version` increased.
- [ ] Pass  [ ] Fail

**TC-07 — Handling flag and order ceiling thresholds**
1. **Add lengths** (manual) on the material: 6000 × 1, 6001 × 1, 9000 × 1, 9001 × 1.
2. Open the schedule and then Orders (SOP 20-06) with a supplier and delivery set.
3. Expected result: 6,000 — no label; 6,001 — **long piece**; 9,000 — **long piece**; 9,001 — **over ceiling**, expanded text "A piece is longer than the order ceiling — split it or change the material rule."; no **Split** offered on the manual line; order readiness lists that problem; **Export supplier PDF** disabled (draft still allowed).
- [ ] Pass  [ ] Fail

**TC-08 — Grouping never merges different lengths or specs**
1. Measure two runs that both finish at 4,600 mm, one finishing at 4,700 mm, and add the same runs to a second material that differs only in colour.
2. Expected result: under material 1: "2 × 4,600" and "1 × 4,700" (separate lines); material 2 is a separate group; each group footer shows its pieces and LM; the total LM equals Σ(length × qty)/1000 to 3 decimals.
- [ ] Pass  [ ] Fail

**TC-09 — Stale split blocks ordering**
1. After TC-01, go to Measure → **Select** the run and drag one end so the finished length becomes 7,300.
2. Expected result: line shows **needs attention** with "The run or rules changed after this split — review the split."; ordering blocked; **Edit split** → required now 7,300 → enter valid pieces → **Apply split** clears it.
- [ ] Pass  [ ] Fail

**TC-10 — Over-coverage and child rounding**
1. Split the 7,200 run as 3,650 + 3,800 with lap 200.
2. Expected result: Piece 1 rounds up to 3,700; box shows "Pieces 3,700 + 3,800 − laps 200 = coverage 7,300 mm (100 mm over)"; applied split stores `pieces: [3700, 3800]`.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

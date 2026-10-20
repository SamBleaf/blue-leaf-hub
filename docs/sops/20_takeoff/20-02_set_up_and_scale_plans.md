---
sop_version: 1.2
last_reviewed: 2026-10-21
app_version: takeoff-r03
screenshot_status: placeholders_only
owner: Admin / Director
test_status: untested  <!-- untested | passed | failed | partial -->
---

# SOP: Set Up Plans and Scale a Page

**Module:** Takeoffs (flashing takeoff from plans)  
**SOP ID:** 20-02  
**Status:** Draft  
**Priority:** High

> **Feature status (2026-10-13):** Takeoffs ship **switched off** behind the server flag `TAKEOFF_ENABLED`, and **database migration 206 has not been applied in production**. Nothing in this SOP has been tested against the live app. See SOP 20-01 for switching it on.

---

## 1. Who uses this

- **Admin (Director)** and **Supervisor** — in the Hub.
- **Leading hand** — in the Worker app, on jobs they can see.
- Anyone with view-only access (and an admin previewing a leading hand) can choose which page to **look at** and see each page's scale status, but cannot save a main page or a scale. The **Scale this page** button is hidden for them.
- Uploading a new plan revision (Section 5E) is a Hub task for Admin / Supervisor on the job's Plans card.

---

## 2. When to use it

- The first time you open a new takeoff — before you can measure any runs.
- The plan page you want to measure shows **Not scaled** or **Needs review**.
- One sheet holds several drawings at different scales (e.g. a floor plan at 1:100 and a detail at 1:20) — scale each drawing as a named region.
- A new plan revision has been issued and the takeoff shows **Needs review**.

---

## 3. What this does

You pick the plan and its main floor-plan page, then tell the app how big the drawing really is. You tap both ends of a long **horizontal** dimension printed on the plan and type its length, then do the same on a **vertical** dimension. The app checks the two directions agree (within 0.5%), then asks you to check a **third** printed dimension. A scale belongs to one page (or one named region) of one plan revision only — it is never copied to other pages or to a newer revision. The check confirms your taps and typed numbers; it does not prove the drawing itself is accurate.

---

## 4. Before you start

- The plan must be uploaded as a PDF on the job's **Plans** card (Hub). Workers can't upload plans.
- Have the plan open and find: one **long horizontal dimension**, one **long vertical dimension**, and a **third, different** dimension (ideally in another part of the drawing). Longer dimensions give a more accurate scale.
- You need edit access (Admin, Supervisor or leading hand — see SOP 20-01).
- You need a data connection the first time you open a plan on this phone. After that it is kept on the phone and reopens without downloading — also with no signal while the takeoff is open — until the plan is replaced or you sign out (HUB 021).

---

## 5. Step-by-step process

### A. Choose the plan and its main page

1. Open the takeoff (SOP 20-01).
2. In the **Plan** section tap **Set up plans**. The **Plan setup** window opens ("Choose the plan and its main floor-plan page").
3. In the **Plan** dropdown choose the plan. Plans that have been replaced show "(replaced)".
4. The first time on this phone it shows "Downloading plan — N%"; after that "Opening plan…" (no download). A replaced plan downloads once again. The page you were last on comes back on this phone.
5. Tap the page you will measure. For plans up to 24 pages you see small page pictures; for bigger sets type the number in **Page (1–N)**. Each page shows its status: **Not scaled**, **Ready** or **Needs review**; the current main page says "· primary".
6. Tap **Use page N as the main plan page**. You return to the overview, where the Plan line reads "<plan> · page N" with its status chip.

> 💡 **Tip:** The main page is only a bookmark for this takeoff — it does **not** give any other page a scale.

[insert screenshot: Plan setup window — plan dropdown, page thumbnails with status, "Use page 2 as the main plan page" button]

### B. Scale the whole page

1. In the **Plan** section tap **Scale this page**. The full-screen **Scale this page** window opens (tap **Cancel** at top-left to leave without saving).
2. If the drawing is sideways, tap **⟳ 90°** now — it locks once you place the first point.
3. In the **Set the scale** panel tap **Scale the whole page**.
4. **Horizontal dimension:** pinch to zoom right in on one end of a long horizontal dimension and tap exactly on its end mark. Then tap the other end — the second point stays exactly level with the first (a dashed guide line shows the level).
5. Type the dimension printed on the plan (in mm) into **Horizontal dimension** and press Enter / Done. Tap **Next**.
6. **Vertical dimension:** do the same on a long vertical dimension and type it into **Vertical dimension**. Tap **Next**.
7. **Compare directions:** read "Difference between the two scales: X% (limit 0.5%)".
   - If it says **Both directions agree — one scale will be used.**, tap **Next: check a third dimension**.
   - If it says the scales don't agree, tap **Re-tap both** and place the four points again more carefully. Only if you are sure the drawing really is stretched (e.g. a scanned plan stretched one way), tap **Drawing stretched: use separate X/Y scales**; it then shows "Using separate horizontal and vertical scales." and **Next: check a third dimension**.
8. **Independent check:** tap both ends of a **different** printed dimension, then type it into **Printed check dimension**. Read the result: "Expected X mm · measured Y mm · error Z%".
   - Within 0.5%: "Scale is ready." Tap **Save scale**.
   - Over 0.5%: the warning says the page will be marked **Needs review** and measured runs can't be ordered until it is re-scaled. Tap **Re-tap** to try again (recommended), or **Save scale** to keep it as Needs review for viewing only.
9. **Save without a check (Not checked — can't order measured runs)** is only for a quick look. Runs measured on an unchecked scale cannot go on a supplier order.
10. After **Save scale** the app goes straight to the Measure screen (SOP 20-03). If you came from **Scale page** in the Measure screen, you are back on the same page with the same tool (for example **Rectangle**). **Cancel** there also takes you back to measuring.

> 💡 **Tip:** To fine-tune a point, drag it — a magnifier shows exactly where it sits. On a keyboard: select the point, then use Alt + arrow keys.

[insert screenshot: Scale this page — horizontal points with dashed level guide and the Horizontal dimension field]
[insert screenshot: Compare directions — "Both directions agree — one scale will be used."]
[insert screenshot: Independent check — "Expected 5,000 mm · measured 5,004 mm · error 0.08%. Scale is ready."]

### C. Scale a named region (several drawings on one sheet)

1. Tap **Scale this page** → in **Set the scale** tap **Scale a region only (e.g. one floor plan on a sheet)**.
2. Tap one corner of the drawing you want, then the opposite corner. A dashed box shows the region.
3. Type a **Region name** (e.g. "Ground floor plan") and tap **Next: horizontal** (or **Redraw** to draw the box again).
4. Carry on from Section B step 4. Every point must be inside the box — otherwise you'll see "That point is outside the region you are scaling."
5. Repeat for each other drawing on the sheet with a different name. When you measure, pick the region under **Scaled region:** (SOP 20-03). Runs can't cross from one region into another.

### D. Re-scale a page

1. Tap **Scale this page** again (or **Re-scale** on the warning banner in the Measure screen) and repeat Section B.
2. A re-scale creates a **new** scale revision; the old one is kept, never edited.
3. Runs already measured keep the scale they were measured with. After a re-scale, every run on that page (or region) measured with the older scale is flagged "This page has been re-scaled since this run was measured — review it with the new scale." and can't be ordered until reviewed. The overview shows "N run(s) were measured before the page was re-scaled. They can't be ordered until you review them."
4. Tap **Review with new scale**. The **Review with new scale** window lists each affected run as "Order <old> mm → **<new> mm**" with "Measured <old> → <new> mm · page N · <region>". All runs are ticked; untick any you don't want to change.
5. Tap **Use the new scale for N run(s)** (or **Not now** to leave them flagged). Only the ticked runs switch to the new scale; frozen exports and placed orders don't change. A run shown as "invalid" under the new scale (e.g. it falls outside a re-drawn region) should be removed and re-measured instead.

### E. When a new plan revision replaces the old one

1. **Hub (Admin / Supervisor):** on the job's **Plans** card choose the new PDF, pick its type, type the **Revision (e.g. Rev C)**, and in the dropdown choose **Revision of: <old plan>**. Click **Upload plan**.
2. The old plan is marked replaced. Every takeoff that used it changes to **Needs review** (badge in the takeoff list and an amber banner on the overview: "A plan used by this takeoff was replaced or removed. Existing measurements are kept and flagged; scale and measure on the current plan, then mark it reviewed.").
3. Old measurements are kept and still shown on the old plan; their schedule lines say "The plan this was measured on has been replaced — review it against the new revision."
4. Tap **Set up plans**, choose the new revision, choose its page and tap **Use page N as the main plan page**. Then **Scale this page** — a new revision always needs its own scale; nothing is copied across.
5. Measure again on the new plan (SOP 20-03). To clear the old lines, open the old plan from **Set up plans** (it still opens for viewing), tap **View plan**/**Measure**, then **Select → Remove** each old run or count.
6. Tap **Mark reviewed** on the overview banner.
7. Exports already made and orders already placed are not changed.

> 💡 **Tip:** Removing a plan from the Plans card that a takeoff has used does not delete it — you'll see "This plan is used by a takeoff, so it was archived (hidden from the field) instead of deleted." and the takeoff goes to **Needs review**.

### F. Measure on another page (Page chip)

1. In the Measure screen, tap **Page 1 ▾** (it shows the page you are on). It shows only when the plan has more than one page, or there is more than one plan.
2. The page picker opens: "Choose a page — Measure on another page. The main plan page stays the same." The main page says "· main plan page" and the page you are on says "· measuring now". Each page shows **Not scaled**, **Ready** or **Needs review**.
3. Tap the page. You go straight back to measuring on it, with the same tool. That's two taps. Each page tile keeps its size while the pages draw, so a tap lands on the page you aimed at. For plans over 24 pages, tap the number box (it selects the number), type the page and tap **Go** on the keyboard, or **Measure on page N**.
4. The takeoff's main plan page doesn't change, and nothing is saved. A wall you were halfway through drawing waits on its own page and comes back when you return to it. To change the main page, use **Set up plans** (Section A).
5. **Back** returns to measuring on the page you were on, even if you looked at another plan in the **Plan** list.
6. A page with no scale says so. Tap **Scale page** and you come back to it when the scale is saved (Section B, step 10).

---

## 6. What happens next

- Saving a scale stores it against that plan, page (and region) and moves you to the Measure screen. The page chip changes to **Ready** (check passed) or **Needs review** (check failed or not done).
- Measured runs on a **Ready** page can go on a supplier order; runs on a Needs-review page are shown but blocked from order-ready export.
- Choosing a main page saves to the takeoff and autosaves like any other change (SOP 20-07).
- Uploading a revision flags affected takeoffs **Needs review** automatically; nobody is emailed.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Tapping near, not on, the dimension end marks | Zoomed out too far | Zoom right in before each tap; drag the point with the magnifier to correct |
| Using a short dimension | Small tap errors become big scale errors | Use the longest dimension you can find in each direction |
| Choosing "Drawing stretched" to get past a mismatch | The real cause is a mis-tapped point | Use **Re-tap both** first; separate scales are only for genuinely stretched drawings |
| Checking against the same dimension used for scaling | It can't catch a typing or tap error | Use a different dimension for the check |
| Expecting page 1's scale to work on page 2 | Each page / region / revision has its own scale | Scale every page you measure on |
| Re-scaling and expecting old runs to fix themselves | Runs keep the scale they were measured with | Use **Review with new scale** and check each before → after |
| Uploading a revision as a "New plan" | The old plan stays current and takeoffs aren't flagged | Choose **Revision of: <old plan>** when uploading |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Tap points further apart — zoom out or use a longer dimension." | The two taps are less than about 20 screen pixels apart | Use a longer dimension, or **zoom in** so the two ends are further apart on screen (zooming out makes it worse, despite the wording) |
| "That point is outside the region you are scaling." | Region scaling: tap landed outside the box | Tap inside the box, or **Redraw** the region bigger |
| "The horizontal and vertical scales don't agree…" | Over 0.5% difference — usually a mis-tap or mistyped number | **Re-tap both**; check the typed dimensions |
| "Horizontal and vertical scales differ by X%. Re-tap, or choose "Drawing stretched: use separate X/Y scales"." | Server refused a mismatched scale | As above |
| "The two calibration points are on top of each other — tap two points further apart." | Both points at the same spot | Re-tap |
| "That scale is outside the possible range — check the dimension you typed." | Typo (e.g. metres typed instead of mm) | Type the dimension in mm |
| "Enter a number of 0 or more." | Negative or non-numeric dimension | Type a positive number in mm |
| **Scale this page** is greyed out | The selected plan has been replaced, or no plan is chosen | Choose the current revision in **Set up plans** |
| **Scale this page** is missing | View-only access or preview | Ask an Admin, Supervisor or leading hand |
| "This plan has been replaced — scale the current revision instead." | Someone uploaded a revision while you were scaling | Choose the new revision and scale it |
| "Give the scaled region a name." | Region saved without a name | Type a region name |
| "That's the same dimension you scaled with — pick a different printed dimension so the check is independent." (**Save scale** greyed) | The check points sit on the horizontal or vertical dimension used for scaling | **Re-tap** the check on a different printed dimension |
| "Check against a DIFFERENT printed dimension — not the horizontal or vertical one you used to scale." | Server refused a check that re-used a scaling dimension (should be caught on screen first) | As above; if **Try again** keeps failing, clear the refused change as in SOP 20-07 Section 5F |
| "Only an issued plan can be replaced by a plan upload." | Plans card: tried to supersede a document that isn't a plan PDF on the Plans card | Choose a plan from the list |
| "This plan's file no longer matches the one that was scaled — re-upload the plan as a new revision." | The stored file behind a scaled plan changed | Upload it again as **Revision of: …** and scale the new revision |
| Old runs show "This page has been re-scaled since this run was measured — review it with the new scale." | The page was re-scaled after those runs were drawn | **Review with new scale** on the overview (Section 5D) |
| "Choose a current plan as the primary plan." | Tried to set a replaced plan as the main page | Choose the current revision |
| "This page couldn't be drawn." / "This page couldn't be opened." | The PDF page failed to render | Close and reopen; if it repeats, open in the device viewer and report the file |
| "Download cancelled." | You tapped **Cancel** while downloading | Tap **Try again** |
| "A plan can only replace a plan on the same job." | Plans card: chose a plan from another job/site to replace | Choose a plan on this job |
| "That plan has already been replaced — refresh and pick the current plan." | Someone else uploaded a revision first | Refresh the Plans card and pick the current plan |
| Page shows **Needs review** straight after saving | The check was over 0.5%, or you used **Save without a check** | Re-scale with a careful check |

---

## 9. Related modules

- [20-01 Takeoff overview and access → opening a takeoff](20-01_takeoff_overview.md)
- [20-03 Measure runs and count pieces → what you do after scaling](20-03_measure_runs_and_count.md)
- [20-05 Length schedule → where "needs attention" from scale problems shows](20-05_length_schedule_and_split.md)
- [20-06 Export a supplier order → why an unchecked scale blocks ordering](20-06_export_and_record_orders.md)
- [10-06 Worker PWA — plans on device → the Plans card and plan upload/supersede](../10_workforce/worker_pwa_updates.md)

---

## 10. Screenshot placeholders

[insert screenshot: overview Plan section — plan name, page, "Not scaled" chip, Set up plans / Scale this page / Measure]
[insert screenshot: Plan setup — thumbnails with Not scaled / Ready / Needs review]
[insert screenshot: Set the scale — "Scale the whole page" and "Scale a region only" buttons]
[insert screenshot: Region naming — "Region name" field with "Ground floor plan"]
[insert screenshot: Compare directions — scales don't agree, "Re-tap both" and "Drawing stretched: use separate X/Y scales"]
[insert screenshot: Independent check over 0.5% — Needs review warning]
[insert screenshot: overview with the amber "A plan used by this takeoff was replaced or removed" banner and Mark reviewed]
[insert screenshot: Plans card upload — "Revision of: <plan>" selected]

---

## 11. Automation notes

- **Main page:** saved through the normal takeoff commit as `takeoff_workspaces.primary_document_id` + `primary_page_index`; only a **current** plan is accepted. `takeoff_workspaces.revision` increases by 1.
- **Scale (calibration):** the app sends the tapped PDF-space points and typed mm; the **server recomputes** the scales from the points (client-sent scale values are ignored) and inserts one `takeoff_calibrations` row: `mode` 'uniform' (sx = sy = mean of the two measured scales) or 'separate'; `measured_sx`, `measured_sy`, `discrepancy`, `tolerance` 0.005; `status` 'ready' (check passed), 'needs_review' (check failed) or 'unverified' (no check); `verification` {expectedMm, observedMm, error, passed}; `region` / `region_label` (NULL = whole page); `calibration_revision` (next number for that plan + page + region name); `supersedes_calibration_id` for a re-scale; `content_sha256` copied from the plan.
- Calibration rows are **immutable** — a database trigger rejects any UPDATE or DELETE ("TAKEOFF_IMMUTABLE"). Re-scaling always inserts a new row; runs that point at an older revision for the same plan + page + region are then flagged `calibration_superseded` and blocked from ordering.
- The server refuses a check that re-uses the horizontal or vertical reference points (HTTP 400 `CHECK_NOT_INDEPENDENT`).
- A guard trigger on `job_documents` stops a plan that has a recorded `content_sha256` from having its stored file, hash, size, provider or job changed after upload. When the in-app viewer downloads a plan, the server also refuses to serve bytes that don't match the plan's hash or the hash recorded on its calibrations (HTTP 500 `INTEGRITY`).
- **Plan revision upload** (Plans card) runs `takeoff_plan_insert` in one transaction: inserts the new `job_documents` row (`status` 'current', `version` = old + 1, `supersedes_document_id`, `revision_label`, `content_sha256`, `byte_size`) and sets the old row `status` 'superseded'; every active takeoff whose main plan or live measurements use the old plan becomes `state` 'needs_review', `review_reason` 'plan_superseded'. On failure only the newly uploaded file is removed; the old plan stays current.
- **Removing a plan** used by any takeoff calls `takeoff_archive_if_referenced`: `status` 'superseded', `archived_at` / `archived_by` set, bytes kept; takeoffs go to `needs_review` with `review_reason` 'plan_removed'. Unused plans: the database row is deleted first, then the stored file.
- **Mark reviewed** sets `state` back to 'active' and clears `review_reason`.
- **Page chip** (HUB 023): the same `PlanSetup` picker with `purpose="measure"`. Choosing a page only changes the page on this device (the last page is remembered per phone, HUB 021); `primary_document_id` / `primary_page_index` are untouched and no commit is made. **Scale page** from Measure returns to Measure (`TakeoffApp` `scaleFrom`, `measureTool`).
- No email, notification or Dropbox file is created.

---

## 12. Edge cases and limits

- Agreement and check tolerance are both 0.5% of the scale.
- A scale is tied to one plan document + page + region name. Two regions on one page are separate; a run must stay entirely inside the region you choose.
- Points closer than about 20 screen pixels are refused (a tapping guard, not a measurement accuracy).
- Plans over 40 MB or 100 pages can't be scaled in the app (use the device viewer to read them).
- Rotating the view (**⟳ 90°**) is only possible before the first point is placed.
- A scale saved without a check, or with a failed check, lets you look and measure but blocks those runs from a supplier PDF.
- Choosing a replaced plan in **Set up plans** only changes the page you are looking at — it can't become the main page, and it can't be scaled or measured on.
- Runs keep the scale they were measured with. A re-scale flags them for review and blocks ordering until **Review with new scale** switches the ticked runs over (showing before → after) or they are removed and re-measured.
- The check must use a different dimension from the two used for scaling (checked on screen and again by the server).
- New plan revisions are never auto-scaled and measurements are never moved across automatically.

---

## 13. Owner of the process

Admin / Director  
Next review date: 2027-04-13

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Local dev against an isolated/test database **with migration 206 applied** (not production); `TAKEOFF_ENABLED=true`.
- [ ] A `BLH TEST` carpentry job with a synthetic known-dimension PDF on its Plans card: page 1 has a 10,000 mm horizontal dimension, an 8,000 mm vertical dimension and a 5,000 mm check dimension, plus a second drawing in a corner suitable for a region. Page 2 is a different drawing. (The calculation tests use fixtures in `src/ui-review/fixtures/takeoff/` — reuse one if suitable.)
- [ ] A second `BLH TEST` job with its own plan (for cross-job tests).
- [ ] Logged in as Admin; a takeoff started (SOP 20-01 TC-01). Browser devtools Network tab open.

### Test cases

**TC-01 — Happy path (choose main page, uniform scale with a passing check)**
1. **Set up plans** → choose the plan → page 1 → **Use page 1 as the main plan page**.
2. **Scale this page** → **Scale the whole page** → tap the 10,000 mm horizontal dimension, type 10000, **Next**; tap the 8,000 mm vertical dimension, type 8000, **Next**.
3. Confirm "Both directions agree — one scale will be used." → **Next: check a third dimension** → tap the 5,000 mm dimension, type 5000 → **Save scale**.
4. Expected result: check banner "… Scale is ready."; Measure screen opens; overview chip **Ready**; Plan setup page 1 shows **Ready**, page 2 **Not scaled**.
5. Expected API: `POST /api/takeoff/workspaces/<id>/commit` (body has `changes.workspace.primaryDocumentId` and `changes.calibrations.insert[0]` with points) → `{ ok: true, commit: { revision: R+1, replayed: false }, snapshot, computed, orderStatus }`.
6. Expected DB record: `takeoff_workspaces` `primary_document_id` = plan id, `primary_page_index` 0; `takeoff_calibrations` one row — `document_id` = plan, `page_index` 0, `mode` 'uniform', `sx` = `sy`, `discrepancy` ≤ 0.005, `tolerance` 0.005, `status` 'ready', `verification->>'passed'` = 'true', `region` NULL, `calibration_revision` 1, `created_by_type` 'staff'.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. In the Horizontal step leave the dimension blank; then type `-5`.
2. In a region scale leave **Region name** blank.
3. Via API, commit a calibration with a `region` but `regionLabel: ""`.
4. Expected result: step 1 — **Next** stays disabled while blank; `-5` shows "Enter a number of 0 or more."; step 2 — **Next: horizontal** stays disabled; step 3 — HTTP 400 "Give the scaled region a name."
5. Expected DB: no new `takeoff_calibrations` row.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission (A09)**
1. Re-send the exact TC-01 commit request (same `idempotencyKey`, same body).
2. Then scale page 1 again normally (new attempt).
3. Expected result: step 1 → `commit.replayed: true` with the same revision; still one calibration row. Step 2 → a **second** row with `calibration_revision` 2 and `supersedes_calibration_id` = the first row; the first row is unchanged.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Open the takeoff via Admin preview of a leading hand, and as an ordinary worker via API.
2. Expected result: preview shows no **Scale this page** button and **Use page…** does not save the main page; `POST /api/worker/takeoff/workspaces/<id>/commit` with a calibration → HTTP 403 ("Read-only preview — you can't submit or complete work as a worker." for preview; "Takeoffs are for leading hands and office staff." for an ordinary worker).
3. Expected DB: `takeoff_workspaces.revision` and calibration count unchanged.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (server authority + immutability, A24)**
1. Send a commit whose calibration has the correct points but tampered `sx: 1, sy: 1, status: "ready"` and no verification.
2. Run `UPDATE takeoff_calibrations SET sx = 1 WHERE id = '<TC-01 id>';` and `DELETE FROM takeoff_calibrations WHERE id = '<id>';` in SQL.
3. Expected result: step 1 row has server-computed `sx`/`sy` from the points and `status` 'unverified' (client values ignored); step 2 → both fail with `TAKEOFF_IMMUTABLE: takeoff_calibrations rows cannot be update` / `… delete`.
- [ ] Pass  [ ] Fail

**TC-06 — Axis agreement and separate scales (calculation tests)**
1. With a synthetic page where 1 PDF unit = 20 mm both ways, scale it; then measure a run with PDF delta dx 300, dy 400.
2. On a page stretched so horizontal = 20 mm/unit and vertical = 25 mm/unit, scale it: confirm the mismatch screen, then choose **Drawing stretched: use separate X/Y scales**; measure delta dx 300, dy 400.
3. Via API, commit the stretched calibration without `mode: "separate"`.
4. Expected result: step 1 — uniform scale 20; run raw length 10,000 mm. Step 2 — "Difference between the two scales: 22.22%" and **Re-tap both** / **Drawing stretched…** offered; after choosing separate, `mode` 'separate', `sx` 20, `sy` 25; run raw ≈ 11,661.9 mm (hypot 6,000, 10,000). Step 3 — HTTP 400 `AXIS_MISMATCH` "Horizontal and vertical scales differ by 22.22%. Re-tap, or choose "Drawing stretched: use separate X/Y scales"."
- [ ] Pass  [ ] Fail

**TC-07 — Third-dimension check failure → Needs review**
1. Scale a page, but in the check step type 5,100 for the 5,000 mm dimension (≈2% error). **Save scale**.
2. Scale another page using **Save without a check**.
3. Measure a run on each page; open the schedule and Orders.
4. Expected result: step 1 warning "This is outside 0.5% — the page will be marked Needs review…"; row `status` 'needs_review'; step 2 row `status` 'unverified'. Both pages' chips show **Needs review**; the Measure banner says the scale "failed its check" / "hasn't been checked"; the runs' schedule lines show "needs attention" with "The plan scale failed its check or has not been checked — recalibrate before ordering."; **Export supplier PDF** stays disabled for orders containing them.
- [ ] Pass  [ ] Fail

**TC-08 — No scale leak between pages or regions**
1. With only page 1 scaled, open Measure on page 2 in **Run** mode and tap.
2. On page 1 add a region scale "Detail A"; in Measure choose **Detail A** and tap a finish point outside the box; then send a commit with a run that crosses the region edge.
3. Expected result: step 1 — banner "This page has no scale yet. You can still count pieces." and tap message "Scale this page before measuring runs."; step 2 — UI "That point is outside the scaled region."; API HTTP 400 `OUTSIDE_REGION` "This run goes outside the scaled region. Measure inside the region, or scale the other region first."
4. Expected DB: no run rows from these attempts.
- [ ] Pass  [ ] Fail

**TC-09 — Changed plan (A15)**
1. Measure two runs on page 1. On the Plans card upload a new PDF as **Revision of: <plan>** with revision "Rev B".
2. Reopen the takeoff.
3. Expected result: takeoff list shows **Needs review**; overview banner appears; Plan line shows the old plan with **Replaced** and **Scale this page** greyed; old runs still drawn on the old plan with "This plan has been replaced. Existing measurements stay here for review — measure on the current revision."; schedule lines show the plan-replaced problem; the new plan shows **Not scaled**; a server commit adding a run or calibration on the old plan → 400 "This plan has been replaced — measure on the current revision." / "… scale the current revision instead."
4. Expected DB: old `job_documents.status` 'superseded'; new row `status` 'current', `version` old+1, `supersedes_document_id` = old id, `revision_label` 'Rev B', `content_sha256` + `byte_size` set; `takeoff_workspaces.state` 'needs_review', `review_reason` 'plan_superseded'; old measurements still `archived_at` NULL. After **Mark reviewed**: `state` 'active', `review_reason` NULL.
- [ ] Pass  [ ] Fail

**TC-10 — Supersession failure and cross-job supersession (A12 / A13)**
1. Upload a revision whose `supersedesDocumentId` is the other test job's plan (API: `POST /api/carpentry/jobs/<job A>/plans`).
2. Upload a revision superseding a plan that is already superseded.
3. In the isolated DB, force `takeoff_plan_insert` to fail (e.g. temporarily revoke EXECUTE from service_role) and upload a revision.
4. Expected result: step 1 → HTTP 400 "A plan can only replace a plan on the same job." with **no** new storage object and the target untouched; step 2 → HTTP 409 "That plan has already been replaced — refresh and pick the current plan."; step 3 → error returned, the old plan is still `status` 'current', no new current row exists, and the newly uploaded object was removed from `job-plans`.
- [ ] Pass  [ ] Fail

**TC-11 — Delete a measured plan (A14)**
1. On the Plans card click **Remove** on the plan used by the takeoff.
2. Click **Remove** on an unused plan.
3. Expected result: step 1 → `DELETE /api/job-plans/<id>` returns `{ ok: true, archived: true, message: "This plan is used by a takeoff, so it was archived (hidden from the field) instead of deleted." }`, shown on the card; step 2 → `{ ok: true, archived: false }`.
4. Expected DB / storage: step 1 row still exists with `status` 'superseded', `archived_at` and `archived_by` set; its object is **still** in `job-plans`; the takeoff `state` 'needs_review', `review_reason` 'plan_removed'. Step 2 row deleted and its object removed afterwards.
- [ ] Pass  [ ] Fail

**TC-12 — Re-scale review (before → after, selected runs only); check must be independent**
1. On a **Ready** page measure two runs (A and B). Then **Scale this page** again with slightly different taps (a passing re-scale, revision 2).
2. On the overview, open **Review with new scale**; untick run B; tap **Use the new scale for 1 run(s)**.
3. In the check step, place the check points exactly on the horizontal dimension's ends; then send (API) a calibration commit whose `verification` points equal the horizontal reference points.
4. Expected result: step 1 — overview banner "2 run(s) were measured before the page was re-scaled. They can't be ordered until you review them."; both runs show **needs attention** with "This page has been re-scaled since this run was measured — review it with the new scale." and block **Export supplier PDF**. Step 2 — the window lists both runs as "Order <old> mm → <new> mm"; after applying, run A is clear and run B is still flagged (banner now says 1 run). Step 3 — on screen: "That's the same dimension you scaled with — pick a different printed dimension so the check is independent." with **Save scale** disabled; API → HTTP 400 `CHECK_NOT_INDEPENDENT` "Check against a DIFFERENT printed dimension — not the horizontal or vertical one you used to scale."
5. Expected DB: two calibration rows (revision 1 and 2, both unchanged); run A's `calibration_id` = revision 2 and its `raw_length_mm` recomputed by the server; run B's `calibration_id` still revision 1; no calibration row from step 3.
- [ ] Pass  [ ] Fail

**TC-13 — Plan kept on this phone; last page remembered (HUB 021, UI Review)**
1. **Set up plans** → **Page 2** → **Use page 2 as the main plan page**, then reload. Expected: the overview still reads "· page 2" on this phone, with no second download.
2. Open **Measure** twice (re-entering the takeoff in between). Expected: the second open shows "Opening plan…", never "Downloading plan". Spec: e2e/ui-review/tc-plan-reuse.spec.js.
- [ ] Pass  [ ] Fail

**TC-14 — Page chip and Scale page from Measure (HUB 023, UI Review)**
1. `?takeoffSeed=mixed&takeoffElevation=1` → Timber and cladding → **Measure** → **Axon cladding** → **Page 1 ▾**. Expected: "Choose a page", page 1 "· main plan page · measuring now", page 3 **Ready**, the others **Not scaled**. **Back**: still page 1.
2. **Rectangle** → **Page 1 ▾** → **Page 3**. Expected: straight back to measuring on "page 3 · scaled" with Rectangle still chosen; `snapshot.workspace.primaryPageIndex` is still 0 and `__takeoffReviewState().commits` hasn't changed.
3. **Page 3 ▾** → **Page 4** (not scaled) → **Scale page** (in the Rectangle panel) → scale the whole page with a check → **Save scale**. Expected: back on "page 4 · scaled" with Rectangle chosen.
4. **Area** on page 3: tap three corners → **Page 3 ▾**. Expected: every page tile is 150 high and doesn't move as the pages draw. Tap **Page 1**: no commit, no wall. **Page 1 ▾** → **Page 3**: the three corners are back with Area chosen. **Page 3 ▾** → **Plan** → Rev B → **Back**. Expected: "Rev C · page 3 · scaled", the three corners still there. Spec: e2e/ui-review/tc-measure.spec.js "HUB 023".
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result

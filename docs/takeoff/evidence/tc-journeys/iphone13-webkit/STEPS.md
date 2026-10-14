# iphone13-webkit — TC-R04 real-stack journeys (isolated local sandbox)

Role: leading hand (Worker PWA route, worker token)  
Route: `<sandbox>/worker/takeoff/carpentry/5a4db0c5-0000-4000-8000-00000000a001`  
Browser engine: Playwright webkit 26.5 · iPhone 13 emulation with touch (not a physical device) · viewport {"width":390,"height":664}  
User agent: `Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1`  
Backend: scripts/takeoff/sandbox.mjs — real takeoff routes + Postgres (migrations 206 + 207) + pdfkit renderer; isolated DB `blh_takeoff_tc_evidence`.

## S0 — Start takeoff + plan setup + scale (12,000 / 8,000 / check 3,000) — **PASS**

1. `01-S0-job-takeoffs-empty.png` — Job takeoffs on the Worker PWA route — no takeoff yet (fresh sandbox)
2. `02-S0-takeoff-overview.png` — New takeoff: plan not scaled; Add flashing / timber / cladding / aluminium
3. `03-S0-calibrate-horizontal.png` — Scale: both ends of the printed 12,000 dimension tapped, 12000 typed
4. `04-S0-calibrate-ready.png` — Horizontal + vertical agree; independent 3,000 check → Scale is ready
5. Server calibration record: status ready

Observed (real server): `{"calibration":{"id":"00706eeb-3961-4a5d-8206-659312c389a9","documentId":"748f46d9-fed4-4307-9d86-7e474cc127d7","pageIndex":0,"pageMeta":{"rotate":0,"viewBox":[0,0,842,595],"userUnit":1},"region":null,"regionLabel":null,"calibrationRevision":1,"supersedesCalibrationId":null,"basisRotation":0,"mode":"uniform","sx":35.277777777777786,"sy":35.277777777777786,"measuredSx":35.277777777777786,"measuredSy":35.277777777777786,"discrepancy":0,"tolerance":0.005,"horizontal":{"p1":{"x":120.00000000000006,"y":109.99999999999999},"p2":{"x":460.1574803149606,"y":109.99999999999999},"knownMm":12000},"vertical":{"p1":{"x":79.99999999999994,"y":150.00000000000006},"p2":{"x":79.99999999999994,"y":376.7716535433071},"knownMm":8000},"verification":{"p1":{"x":119.99999999999999,"y":406.7716535433072},"p2":{"x":205.03937007874012,"y":406.7716535433071},"error":0,"passed":true,"expectedMm":3000,"observedMm":3000},"status":"ready","contentSha256":"d31b6ea9c0ff609a8f690fe019aee97427928c37d30c6d17258a4f14d3c012de","createdAt":"2026-10-14 19:46:37.020547+10:30"}}`

## J1 — Timber rafters: 4,500 projected @ 30° + 10,000 run → 18 × 5,400; true length → 18 × 4,800 — **PASS**

1. `05-J1-timber-setup.png` — Timber setup: rafters 90 × 45 MGP10 H3, 600 centres, measure projection, pitch 30°, end allowance 100 (auto-saved)
2. `06-J1-member-line.png` — Member line tapped on the plan: 4,500 mm projected → 5,196 mm true at 30°
3. `07-J1-distribution-ticks.png` — Distribution run 10,000 mm at 600 centres → 18 rafter ticks on the plan
4. `08-J1-schedule-18x5400.png` — Schedule (computed by the real server): 18 pieces 90 × 45 MGP10 H3 — 5,400 mm length
5. `09-J1-true-length.png` — Member length from = true length: 4,500 measured as a true length — pitch not applied
6. `10-J1-schedule-18x4800.png` — True length: 18 × 4,800 (4,500 + 100 allowance → 4,800 grid) — no pitch applied

Observed (real server): `{"projected":["18 piece · 90 × 45 MGP10 H3 — 5,400 mm length"],"trueLength":["18 piece · 90 × 45 MGP10 H3 — 4,800 mm length"],"pitchAfterSwitchBack":"30"}`

## J2 — Cladding: Axon 133 smooth, wall 4,800 × 2,700 + 900 × 900 window → 4 sheets, net 12.15 m²; 4,801 → 5 — **PASS**

1. `11-J2-cladding-setup.png` — Cladding setup: James Hardie Axon 133 smooth chosen (material "Axon 133 smooth", sheet_layout)
2. `12-J2-opening-width-not-focused.png` — After tapping the elevation the New opening sheet is open but Width is NOT focused (no keyboard) — tapping the field
3. `13-J2-wall-4800-4-sheets.png` — North wall 4,800 × 2,700 + W1 900 × 900 (sill 900, 150 from start) → 4 sheets, net 12.15 m² of 12.96 m²
4. `14-J2-wall-elevation.png` — Generated elevation (sheet cells + window), Cladding view
5. `15-J2-wall-4801-5-sheets.png` — Wall length 4,801 → 5 strips (1 cut: 1 mm wide) → 5 sheets

Observed (real server): `{"materialName":"Axon 133 smooth","methodKey":"sheet_layout","assemblyId":"axon-vertical","at4800":{"lines":["4 sheet · James Hardie Axon 133 smooth SKU 403932 — 2,750 × 1,200 mm"]},"at4801":["5 sheet · James Hardie Axon 133 smooth SKU 403932 — 2,750 × 1,200 mm"],"final":["4 sheet · James Hardie Axon 133 smooth SKU 403932 — 2,750 × 1,200 mm"]}`

## AL — Aluminium: kerf 3 confirmed; opening 600 × 2,400 → 2,500 / 2,500 / 600 on one 6,500 bar, 891 remainder — **PASS**

1. `16-AL-aluminium-setup.png` — Aluminium setup: saw kerf 3 mm entered and confirmed (6,500 bars, head not cut by the window preset)
2. `17-AL-aluminium-cutting-sheet.png` — Cutting sheet: Bar 1 = W01 left jamb 2,500 + right jamb 2,500 + bottom 600, 9 mm kerf loss, 891 mm reusable remainder

Observed (real server): `{"lines":["1 bar · equal-angle 50 × 50 × 3 — 6,500 mm length (no joins)"]}`

## FL — Flashing paths: four 750 legs → ONE 3,200; 10,000 path → red overflow → split at limit → 9,000 + 1,400 — **FAIL**

```
expect(locator).toHaveCount(expected) failed

Locator:  locator('[data-kind="polyline"][data-measurement-id][data-order="9000+1400"]')
Expected: 1
Received: 0
Timeout:  15000ms

Call log:
  - Expect "toHaveCount" with timeout 15000ms
  - waiting for locator('[data-kind="polyline"][data-measurement-id][data-order="9000+1400"]')
    34 × locator resolved to 0 elements
       - unexpected value "0"

```

1. `18-FL-flashing-profile.png` — New flashing drawn on the empty grid (2 legs), auto-saved
2. `19-FL-path-750x4-draft.png` — Four 750 legs drawn as one path: tight 2999.999999999998 → ONE allowance → order 3,200
3. `20-FL-path-750x4-finished.png` — Finished — one run, one piece 3,200 (corners are site cuts/folds)
4. `21-FL-path-10000-red.png` — 10,000 path (tight 10000.000000000004): red past the 9,000 maximum, legal split marker at 8,800
5. `22-FL-path-10000-split.png` — One tap on the red part → split at the limit (8,800 along the run) → 9,000 + 1,400
6. `23-FL-paths-finished-saved.png` — Both runs finished + saved; after the server round-trip the sheet reads: "Finished — one run: Measured 10,000 along the run → 2 pieces, each with its own 200 allowance: Piece 1: 8,800.02 + 200 → 9,100 mm — over the maximum Piece 2: 1,200 + 200 → 1,400 mm 2 legs — corners are cut/folded on site"
7. `24-FL-FAILED.png` — FAILED: expect(locator).toHaveCount(expected) failed

Observed (real server): `{"pathA":{"tight":2999.999999999998},"pathB":{"tight":10000.000000000004},"storedSplit":{"splitsMm":[8800],"splitAnchors":[{"x":431.811,"y":257.717,"stationMm":8800}]},"lines":["1 × 9100 (ceiling_exceeded,split_invalid)","1 × 3200","1 × 1400 (ceiling_exceeded,split_invalid)"],"sheetAfterSave":"Finished — one run: Measured 10,000 along the run → 2 pieces, each with its own 200 allowance: Piece 1: 8,800.02 + 200 → 9,100 mm — over the maximum Piece 2: 1,200 + 200 → 1,400 mm 2 legs — corners are cut/folded on site; they add no pieces or allowances. Piece 1 orders 9,100 mm — over the 9,000 mm maximum. The red part is the overflow; tap it to split at the limit (8,800 mm along the run). Quantity: calculated · Installation: not specified · Procurement: draft — not ready to order Tap the start of the next run. Undo reopens this one.","engineCrossCheck":{"storedAnchor":"1x1400(ceiling_exceeded,split_invalid) 1x3200 1x9100(ceiling_exceeded,split_invalid)","fullPrecisionAnchor":"1x1400 1x3200 1x9000","noAnchor":"1x1400 1x3200 1x9000"}}`

## J5 — Order: timber + Axon sheets + aluminium bars + flashing; delivery/pickup; NON-draft export; supplier PDF + site appendix read back — **FAIL**

```
Order not ready to export — Not ready to order yet: A piece is longer than the order ceiling — split it or change the material rule. The split pieces do not cover the run.
```

1. `25-J5-order-review.png` — New order: every line defaults to what is still needed; pick up (branch, ASAP), site contact + phone
2. `26-J5-order-not-ready.png` — Order NOT ready (Export supplier PDF disabled): Not ready to order yet: A piece is longer than the order ceiling — split it or change the material rule. The split pieces do not cover the run.
3. `27-J5-FAILED.png` — FAILED: Order not ready to export — Not ready to order yet: A piece is longer than the order ceiling — split it or change the material rule. The split pieces do not cover the run.

## J5d — DIAGNOSTIC (not J5): same order minus the blocked split-run flashing pieces → non-draft export + both PDFs read back — **PASS**

1. Set to 0 on this order (the run blocked by F1): 9,100 mm · longneeds attention Flashing 1 · COLORBOND · Monu | 1,400 mmneeds attention Flashing 1 · COLORBOND · Monument · 
2. `28-J5d-order-ready.png` — J5d: saved → Ready: 1 flashing pieces · 3.200 LM · 18 pieces · 4 sheets · 1 bar to Fielders (SANDBOX — not a real contact).
3. `29-J5d-order-exported.png` — J5d: Export 1 is frozen. Nothing has been sent. Open PDF Site appendix (cutting & setout) (not a draft) — nothing sent, nothing ordered
4. Downloaded via the app's buttons: GET /api/worker/takeoff/exports/<export>/pdf (142683 bytes) → J5d-supplier-order.pdf; GET /api/worker/takeoff/exports/<export>/appendix (3195 bytes) → J5d-site-appendix.pdf; text via pdftotext (-layout saved as .txt; -raw used for the checks)

Observed (real server): `{"removedFromOrder":["9,100 mm · longneeds attention Flashing 1 · COLORBOND · Monu","1,400 mmneeds attention Flashing 1 · COLORBOND · Monument · "],"ready":"Ready: 1 flashing pieces · 3.200 LM · 18 pieces · 4 sheets · 1 bar to Fielders (SANDBOX — not a real contact).","pdfChecksFailed":[]}`

## Findings

- **F5** (UX (phone), J2) src/components/takeoff/WallsScreen.jsx:672 — WebKit iPhone (touch): after tapping the elevation to place a new opening, the "New opening" sheet opens but the Width field is not left focused — the app focuses it on the tap (focusin at pointerup), then the tap's compatibility mousedown lands on the elevation drawing (SVG) and blurs it (focusout, relatedTarget null → body). No keyboard; the user has to tap Width first. Steps: J2 on the phone → North wall → Add opening → tap the elevation.
- **F1** (blocking, FL) Split at the limit is changed by the save. Steps: scale page 1 (S0); Add flashing → New flashing → Details → Lengths; Run tool: tap (5,000, 1,000) → (11,000, 1,000) → (11,000, 5,000) (= 10,000 mm); tap the red part → "Split at the limit (8,800 mm along the run). Pieces now 9,000 + 1,400 mm"; Finish → after "Saved" the sheet reads: "Finished — one run: Measured 10,000 along the run → 2 pieces, each with its own 200 allowance: Piece 1: 8,800.02 + 200 → 9,100 mm — over the maximum Piece 2: 1,200 + 200 …" and still says "tap it to split at the limit (8,800 mm along the run)" (src/components/takeoff/measure/PathPanel.jsx:60) although the run is already split there. The server now computes 1 × 9100 (ceiling_exceeded,split_invalid) / 1 × 3200 / 1 × 1400 (ceiling_exceeded,split_invalid), and the order is blocked ("A piece is longer than the order ceiling…", "The split pieces do not cover the run."). Cause: server/lib/takeoff/takeoffService.mjs:242 cleans inputs.splitAnchors x/y — PDF-point coordinates — with MM() (:204-208, Math.round(n * 1000) / 1000): stored [{"x":431.811,"y":257.717,"stationMm":8800}] vs the app's [{"stationMm":8800,"x":431.8110236220473,"y":257.7165354330708}]; shared/takeoff/engine/flashingPath.js:298 (checkSplits → locateOnPath) then rebuilds the station from the rounded anchor (8,800 → 8,800.02 → 9,000.02 → 9,100). Real-engine cross-check on the server's own snapshot: stored anchor → 1x1400(ceiling_exceeded,split_invalid) 1x3200 1x9100(ceiling_exceeded,split_invalid); full-precision anchor → 1x1400 1x3200 1x9000; no anchor → 1x1400 1x3200 1x9000. Rounding the other way would instead silently make piece 2 1,500 (any split at a whole-mm station is exposed).
- **F2** (minor (site appendix), J5d) Site appendix provenance is wrong for walls entered by numbers: server/lib/takeoff/takeoffPdf.mjs:214 hard-codes "· Derived from plan + entered heights" on every wall setout. The North wall was typed in (Walls → Wall by numbers); the wall editor labels it "Entered" and the schedule "Entered length and heights". Steps: J2 (wall by numbers) → Orders → export → Site appendix (cutting & setout).
- **F3** (minor (site appendix), J5d) Site appendix prints a literal "?" for "≥": "shortest listed length ? its cut …". The cladding explanation (shared/takeoff/engine/cladding.js:566) goes through winAnsi() (server/lib/takeoff/takeoffPdf.mjs:28-35), which maps only "→"; every other non-WinAnsi character becomes "?". Steps: J2 → Orders → export → Site appendix.
- **F4** (minor (site appendix), J5d) Site appendix timber cut list names the rafters out of station order and only the first 12: "Rafter @ 0, Rafter @ 10,000, Rafter @ 1,200, Rafter @ 1,800, Rafter @ 2,400, Rafter @ 3,000, Rafter @ 3,600, Rafter @ 4,200, Rafter @ 4,800, Rafter @ … +6 more" — so a site reader can't tell which stations the 6 unnamed ones are. Labels are collected in the allocator's cut order (shared/takeoff/engine/dispatch.js:369-380; equal lengths tie-break on cut-id text: byLengthDesc, shared/takeoff/engine/allocator.js:512) and truncated at 12 (server/lib/takeoff/takeoffPdf.mjs:208). Steps: J1 → Orders → export → Site appendix.

## Console errors

None.

Video of the whole run: `journeys.webm` · schedule: `schedule.json` · per order journey (J5, and J5d when J5 was blocked): `<J>-orders.json`, `<J>-supplier-order.pdf`, `<J>-site-appendix.pdf` (+ `.txt`, `<J>-pdf-checks.json`)

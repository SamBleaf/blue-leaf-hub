# desktop-chromium — TC-R04 real-stack journeys (isolated local sandbox)

Role: director (Hub route, admin)  
Route: `<sandbox>/carpentry/5a4db0c5-0000-4000-8000-00000000a001/takeoff?reviewRole=admin`  
Browser engine: Playwright chromium 149.0.7827.55 · viewport {"width":1440,"height":900}  
User agent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36`  
Backend: scripts/takeoff/sandbox.mjs — real takeoff routes + Postgres (migrations 206 + 207) + pdfkit renderer; isolated DB `blh_takeoff_tc_evidence`.

## S0 — Start takeoff + plan setup + scale (12,000 / 8,000 / check 3,000) — **PASS**

1. `01-S0-job-takeoffs-empty.png` — Job takeoff on the Hub route — choose Flashings or Timber and cladding (fresh sandbox)
2. `02-S0-takeoff-overview.png` — New takeoff, Timber and cladding section: plan not scaled; Add timber / cladding / aluminium (no flashing actions)
3. `03-S0-calibrate-horizontal.png` — Scale: both ends of the printed 12,000 dimension tapped, 12000 typed
4. `04-S0-calibrate-ready.png` — Horizontal + vertical agree; independent 3,000 check → Scale is ready
5. Server calibration record: status ready

Observed (real server): `{"calibration":{"id":"5f46c26e-c664-48d1-8b5f-0adb3264c0fe","documentId":"d6e03926-e41e-4578-bc62-f3260edac4a0","pageIndex":0,"pageMeta":{"rotate":0,"viewBox":[0,0,842,595],"userUnit":1},"region":null,"regionLabel":null,"calibrationRevision":1,"supersedesCalibrationId":null,"basisRotation":0,"mode":"uniform","sx":35.277777777777764,"sy":35.277777777777764,"measuredSx":35.27777777777777,"measuredSy":35.27777777777776,"discrepancy":4.0282737775375773e-16,"tolerance":0.005,"horizontal":{"p1":{"x":119.99999999999999,"y":110.00000000000003},"p2":{"x":460.1574803149607,"y":110.00000000000003},"knownMm":12000},"vertical":{"p1":{"x":80,"y":149.99999999999997},"p2":{"x":80,"y":376.7716535433072},"knownMm":8000},"verification":{"p1":{"x":120.00000000000009,"y":406.77165354330725},"p2":{"x":205.03937007874015,"y":406.77165354330714},"error":1.5158245029548805e-15,"passed":true,"expectedMm":3000,"observedMm":2999.9999999999955},"status":"ready","contentSha256":"d31b6ea9c0ff609a8f690fe019aee97427928c37d30c6d17258a4f14d3c012de","createdAt":"2026-10-21 03:20:27.987198+10:30"}}`

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
2. `12-J2-wall-4800-4-sheets.png` — North wall 4,800 × 2,700 + W1 900 × 900 (sill 900, 150 from start) → 4 sheets, net 12.15 m² of 12.96 m²
3. `13-J2-wall-elevation.png` — Generated elevation (sheet cells + window), Cladding view
4. `14-J2-wall-4801-5-sheets.png` — Wall length 4,801 → 5 strips (1 cut: 1 mm wide) → 5 sheets

Observed (real server): `{"materialName":"Axon 133 smooth","methodKey":"sheet_layout","assemblyId":"axon-vertical","at4800":{"lines":["4 sheet · James Hardie Axon 133 smooth SKU 403932 — 2,750 × 1,200 mm"]},"at4801":["5 sheet · James Hardie Axon 133 smooth SKU 403932 — 2,750 × 1,200 mm"],"final":["4 sheet · James Hardie Axon 133 smooth SKU 403932 — 2,750 × 1,200 mm"]}`

## AL — Aluminium: kerf 3 confirmed; opening 600 × 2,400 → 2,500 / 2,500 / 600 on one 6,500 bar, 891 remainder — **PASS**

1. `15-AL-aluminium-setup.png` — Aluminium setup: saw kerf 3 mm entered and confirmed (6,500 bars, head not cut by the window preset)
2. `16-AL-aluminium-cutting-sheet.png` — Cutting sheet: Bar 1 = W01 left jamb 2,500 + right jamb 2,500 + bottom 600, 9 mm kerf loss, 891 mm reusable remainder

Observed (real server): `{"lines":["1 bar · equal-angle 50 × 50 × 3 — 6,500 mm length (no joins)"]}`

## FL — Flashing paths (300 mm step): four 750 legs → ONE 3,300; 10,000 path → red overflow → split at limit → 9,000 + 1,500 → Split to handling length → 5,400 + 5,400 — **PASS**

1. `17-FL-flashing-profile.png` — New flashing drawn on the empty grid (2 legs), auto-saved
2. `18-FL-path-750x4-draft.png` — Four 750 legs drawn as one path: tight 2999.9999999999945 → ONE allowance → order 3,300 (300 mm step)
3. `19-FL-path-750x4-finished.png` — Finished — one run, one piece 3,300 (corners are site cuts/folds)
4. `20-FL-path-10000-red.png` — 10,000 path (tight 10000.000000000004): red past the 9,000 maximum, legal split marker at 8,800
5. `21-FL-path-10000-split.png` — One tap on the red part → split at the limit (8,800 along the run) → 9,000 + 1,500
6. `22-FL-path-10000-handling.png` — Split to handling length → 2 even pieces, 5,400 + 5,400 (each 5,000 tight + 200 allowance, rounded to 300)
7. `23-FL-paths-finished-saved.png` — Both runs finished + saved; after the server round-trip the sheet reads: "Finished — one run: Order 2 pieces: 5,400 + 5,400 mm (measured 10,000) Each piece worked out 2 legs — corners are cut/folded on site; they add no pieces or allowances. Details Tap the start of the next run. Undo reopens "

Observed (real server): `{"pathA":{"tight":2999.9999999999945},"pathB":{"tight":10000.000000000004},"storedSplit":{"splitsMm":[5000],"splitAnchors":[{"x":403.4645669291339,"y":178.34645669291325,"stationMm":5000}]},"lines":["2 × 5400","1 × 3300"],"sheetAfterSave":"Finished — one run: Order 2 pieces: 5,400 + 5,400 mm (measured 10,000) Each piece worked out 2 legs — corners are cut/folded on site; they add no pieces or allowances. Details Tap the start of the next run. Undo reopens this one."}`

## J5 — Orders (HUB 007): ONE timber-and-cladding order (timber + Axon sheets + aluminium bars, Timber / Cladding parts) and a SEPARATE flashings order; delivery/pickup; NON-draft exports; supplier PDFs + site appendices read back — **PASS**

1. `24-J5-order-review.png` — Timber and cladding order: Timber and Cladding parts, every line defaults to what is still needed; deliver (address, required-by date), site contact + phone
2. `25-J5-order-ready.png` — J5: saved → Ready: 18 pieces · 4 sheets · 1 bar to Fielders (SANDBOX — not a real contact).
3. `26-J5-order-exported.png` — J5: Export 1 is frozen. Nothing has been sent. Open PDF Site appendix (cutting & setout) (not a draft) — nothing sent, nothing ordered
4. Downloaded via the app's buttons: GET /api/takeoff/exports/<export>/pdf (141048 bytes) → J5-supplier-order.pdf; GET /api/takeoff/exports/<export>/appendix (3106 bytes) → J5-site-appendix.pdf; text via pdftotext (-layout saved as .txt; -raw used for the checks)
5. `27-J5-order-review-flashings.png` — Flashings order: flashing lengths only
6. `28-J5-order-ready.png` — J5F: saved → Ready: 3 pieces · 14.100 LM to Fielders (SANDBOX — not a real contact).
7. `29-J5-order-exported.png` — J5F: Export 1 is frozen. Nothing has been sent. Open PDF Site appendix (cutting & setout) (not a draft) — nothing sent, nothing ordered
8. Downloaded via the app's buttons: GET /api/takeoff/exports/<export>/pdf (140840 bytes) → J5F-supplier-order.pdf; GET /api/takeoff/exports/<export>/appendix (2366 bytes) → J5F-site-appendix.pdf; text via pdftotext (-layout saved as .txt; -raw used for the checks)

Observed (real server): `{"ready":"Ready: 18 pieces · 4 sheets · 1 bar to Fielders (SANDBOX — not a real contact).","flashingsReady":"Ready: 3 pieces · 14.100 LM to Fielders (SANDBOX — not a real contact).","pdfChecks":[]}`


## Console errors

None.

Video of the whole run: `journeys.webm` · schedule: `schedule.json` · per order journey (J5, and J5d when J5 was blocked): `<J>-orders.json`, `<J>-supplier-order.pdf`, `<J>-site-appendix.pdf` (+ `.txt`, `<J>-pdf-checks.json`)

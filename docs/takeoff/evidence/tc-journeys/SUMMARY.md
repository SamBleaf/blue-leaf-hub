# TC-R04 real-stack journeys — SUMMARY

Real app UI → isolated local sandbox (scripts/takeoff/sandbox.mjs: real takeoff server code, real Postgres with migrations 206 + 207, real pdfkit PDF renderer;
database `blh_takeoff_tc_evidence`, API 127.0.0.1:8798, web :5188, reset before each browser). Nothing mocked on the takeoff path.
Nothing sent to suppliers, nothing ordered, no production system touched. Spec: `e2e/ui-review/tc-journeys-sandbox.spec.js`, config: `playwright.tc-evidence.config.js`.

| Journey | desktop-chromium | iphone13-webkit |
|---|---|---|
| S0 — Start takeoff + plan setup + scale (12,000 / 8,000 / check 3,000) | PASS | PASS |
| J1 — Timber rafters: 4,500 projected @ 30° + 10,000 run → 18 × 5,400; true length → 18 × 4,800 | PASS | PASS |
| J2 — Cladding: Axon 133 smooth, wall 4,800 × 2,700 + 900 × 900 window → 4 sheets, net 12.15 m²; 4,801 → 5 | PASS | PASS |
| AL — Aluminium: kerf 3 confirmed; opening 600 × 2,400 → 2,500 / 2,500 / 600 on one 6,500 bar, 891 remainder | PASS | PASS |
| FL — Flashing paths: four 750 legs → ONE 3,200; 10,000 path → red overflow → split at limit → 9,000 + 1,400 | FAIL | FAIL |
| J5 — Order: timber + Axon sheets + aluminium bars + flashing; delivery/pickup; NON-draft export; supplier PDF + site appendix read back | FAIL | FAIL |
| J5d — DIAGNOSTIC (not J5): same order minus the blocked split-run flashing pieces → non-draft export + both PDFs read back | PASS | PASS |

J5d is a DIAGNOSTIC added only because J5 is blocked by F1: the same order with the split run's flashing pieces set to 0, so export + both PDFs
(quantities and units of timber, sheets, bars and the 3,200 flashing) are still proven on the real stack. It is not the J5 acceptance.

## Product defects found

### F1 — blocking — seen on desktop-chromium, iphone13-webkit

Split at the limit is changed by the save. Steps: scale page 1 (S0); Add flashing → New flashing → Details → Lengths; Run tool: tap (5,000, 1,000) → (11,000, 1,000) → (11,000, 5,000) (= 10,000 mm); tap the red part → "Split at the limit (8,800 mm along the run). Pieces now 9,000 + 1,400 mm"; Finish → after "Saved" the sheet reads: "Finished — one run: Measured 10,000 along the run → 2 pieces, each with its own 200 allowance: Piece 1: 8,800.02 + 200 → 9,100 mm — over the maximum Piece 2: 1,200 + 200 …" and still says "tap it to split at the limit (8,800 mm along the run)" (src/components/takeoff/measure/PathPanel.jsx:60) although the run is already split there. The server now computes 1 × 9100 (ceiling_exceeded,split_invalid) / 1 × 3200 / 1 × 1400 (ceiling_exceeded,split_invalid), and the order is blocked ("A piece is longer than the order ceiling…", "The split pieces do not cover the run."). Cause: server/lib/takeoff/takeoffService.mjs:242 cleans inputs.splitAnchors x/y — PDF-point coordinates — with MM() (:204-208, Math.round(n * 1000) / 1000): stored [{"x":431.811,"y":257.717,"stationMm":8800}] vs the app's [{"stationMm":8800,"x":431.8110236220473,"y":257.7165354330707}]; shared/takeoff/engine/flashingPath.js:298 (checkSplits → locateOnPath) then rebuilds the station from the rounded anchor (8,800 → 8,800.02 → 9,000.02 → 9,100). Real-engine cross-check on the server's own snapshot: stored anchor → 1x1400(ceiling_exceeded,split_invalid) 1x3200 1x9100(ceiling_exceeded,split_invalid); full-precision anchor → 1x1400 1x3200 1x9000; no anchor → 1x1400 1x3200 1x9000. Rounding the other way would instead silently make piece 2 1,500 (any split at a whole-mm station is exposed).

### F2 — minor (site appendix) — seen on desktop-chromium, iphone13-webkit

Site appendix provenance is wrong for walls entered by numbers: server/lib/takeoff/takeoffPdf.mjs:214 hard-codes "· Derived from plan + entered heights" on every wall setout. The North wall was typed in (Walls → Wall by numbers); the wall editor labels it "Entered" and the schedule "Entered length and heights". Steps: J2 (wall by numbers) → Orders → export → Site appendix (cutting & setout).

### F3 — minor (site appendix) — seen on desktop-chromium, iphone13-webkit

Site appendix prints a literal "?" for "≥": "shortest listed length ? its cut …". The cladding explanation (shared/takeoff/engine/cladding.js:566) goes through winAnsi() (server/lib/takeoff/takeoffPdf.mjs:28-35), which maps only "→"; every other non-WinAnsi character becomes "?". Steps: J2 → Orders → export → Site appendix.

### F4 — minor (site appendix) — seen on desktop-chromium, iphone13-webkit

Site appendix timber cut list names the rafters out of station order and only the first 12: "Rafter @ 0, Rafter @ 10,000, Rafter @ 1,200, Rafter @ 1,800, Rafter @ 2,400, Rafter @ 3,000, Rafter @ 3,600, Rafter @ 4,200, Rafter @ 4,800, Rafter @ … +6 more" — so a site reader can't tell which stations the 6 unnamed ones are. Labels are collected in the allocator's cut order (shared/takeoff/engine/dispatch.js:369-380; equal lengths tie-break on cut-id text: byLengthDesc, shared/takeoff/engine/allocator.js:512) and truncated at 12 (server/lib/takeoff/takeoffPdf.mjs:208). Steps: J1 → Orders → export → Site appendix.

### F5 — UX (phone) — seen on iphone13-webkit

src/components/takeoff/WallsScreen.jsx:672 — WebKit iPhone (touch): after tapping the elevation to place a new opening, the "New opening" sheet opens but the Width field is not left focused — the app focuses it on the tap (focusin at pointerup), then the tap's compatibility mousedown lands on the elevation drawing (SVG) and blurs it (focusout, relatedTarget null → body). No keyboard; the user has to tap Width first. Steps: J2 on the phone → North wall → Add opening → tap the elevation.

## desktop-chromium

director (Hub route, admin) · chromium 149.0.7827.55 · viewport {"width":1440,"height":900} · run 2026-10-14T09:16:21.562Z
User agent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36`

**FL FAIL**

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

**J5 FAIL**

```
Order not ready to export — Not ready to order yet: A piece is longer than the order ceiling — split it or change the material rule. The split pieces do not cover the run.
```

Console errors: none

Evidence: `desktop-chromium/STEPS.md`, screenshots `desktop-chromium/NN-<journey>-*.png`, `desktop-chromium/journeys.webm`, `desktop-chromium/schedule.json`, `desktop-chromium/results.json`; per order journey `desktop-chromium/<J5|J5d>-supplier-order.pdf`, `-site-appendix.pdf` (+ .txt), `-pdf-checks.json`, `-orders.json`

## iphone13-webkit

leading hand (Worker PWA route, worker token) · webkit 26.5 · viewport {"width":390,"height":664} · run 2026-10-14T09:17:39.635Z
User agent: `Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1`

**FL FAIL**

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

**J5 FAIL**

```
Order not ready to export — Not ready to order yet: A piece is longer than the order ceiling — split it or change the material rule. The split pieces do not cover the run.
```

Console errors: none

Evidence: `iphone13-webkit/STEPS.md`, screenshots `iphone13-webkit/NN-<journey>-*.png`, `iphone13-webkit/journeys.webm`, `iphone13-webkit/schedule.json`, `iphone13-webkit/results.json`; per order journey `iphone13-webkit/<J5|J5d>-supplier-order.pdf`, `-site-appendix.pdf` (+ .txt), `-pdf-checks.json`, `-orders.json`

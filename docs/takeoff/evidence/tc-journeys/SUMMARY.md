# TC-R04 real-stack journeys — SUMMARY

Real app UI → isolated local sandbox (scripts/takeoff/sandbox.mjs: real takeoff server code, real Postgres with migrations 206 + 207 + 208, real pdfkit PDF renderer;
database `blh_takeoff_tc_evidence`, API 127.0.0.1:8798, web :5188, reset before each browser). Nothing mocked on the takeoff path.
Nothing sent to suppliers, nothing ordered, no production system touched. Spec: `e2e/ui-review/tc-journeys-sandbox.spec.js`, config: `playwright.tc-evidence.config.js`.

| Journey | desktop-chromium | iphone13-webkit |
|---|---|---|
| S0 — Start takeoff + plan setup + scale (12,000 / 8,000 / check 3,000) | PASS | PASS |
| J1 — Timber rafters: 4,500 projected @ 30° + 10,000 run → 18 × 5,400; true length → 18 × 4,800 | PASS | PASS |
| J2 — Cladding: Axon 133 smooth, wall 4,800 × 2,700 + 900 × 900 window → 4 sheets, net 12.15 m²; 4,801 → 5 | PASS | PASS |
| AL — Aluminium: kerf 3 confirmed; opening 600 × 2,400 → 2,500 / 2,500 / 600 on one 6,500 bar, 891 remainder | PASS | PASS |
| FL — Flashing paths (300 mm step): four 750 legs → ONE 3,300; 10,000 path → red overflow → split at limit → 9,000 + 1,500 → Split to handling length → 5,400 + 5,400 | PASS | PASS |
| J5 — Orders (HUB 007): ONE timber-and-cladding order (timber + Axon sheets + aluminium bars, Timber / Cladding parts) and a SEPARATE flashings order; delivery/pickup; NON-draft exports; supplier PDFs + site appendices read back | PASS | PASS |

J5 (Hub review HUB 007) exports TWO supplier orders: one Timber and cladding order (Timber part, then Cladding) and a separate Flashings order.

## Product defects found

None.

## desktop-chromium

director (Hub route, admin) · chromium 149.0.7827.55 · viewport {"width":1440,"height":900} · run 2026-10-20T16:51:16.061Z
User agent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36`

Console errors: none

Evidence: `desktop-chromium/STEPS.md`, screenshots `desktop-chromium/NN-<journey>-*.png`, `desktop-chromium/journeys.webm`, `desktop-chromium/schedule.json`, `desktop-chromium/results.json`; per order journey `desktop-chromium/<J5|J5d>-supplier-order.pdf`, `-site-appendix.pdf` (+ .txt), `-pdf-checks.json`, `-orders.json`

## iphone13-webkit

leading hand (Worker PWA route, worker token) · webkit 26.5 · viewport {"width":390,"height":664} · run 2026-10-20T16:52:16.979Z
User agent: `Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1`

Console errors: none

Evidence: `iphone13-webkit/STEPS.md`, screenshots `iphone13-webkit/NN-<journey>-*.png`, `iphone13-webkit/journeys.webm`, `iphone13-webkit/schedule.json`, `iphone13-webkit/results.json`; per order journey `iphone13-webkit/<J5|J5d>-supplier-order.pdf`, `-site-appendix.pdf` (+ .txt), `-pdf-checks.json`, `-orders.json`

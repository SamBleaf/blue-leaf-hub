# iphone13-webkit — complete takeoff workflow (real local sandbox backend)

Browser engine: Playwright webkit 26.5 · mobile emulation with touch (not a physical device) · viewport {"width":390,"height":664}
User agent: `Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1`

1. `01-job-takeoffs-empty.png` — Job takeoffs — no takeoff yet
2. `02-takeoff-overview.png` — New takeoff: plan not scaled, no materials
3. `03-plan-setup.png` — Plan setup — page thumbnails, choose the primary floor-plan page
4. `04-calibrate-horizontal.png` — Horizontal: zoomed in on each end of the printed 12,000 dimension (second point locked horizontal)
5. `05-calibrate-agreement.png` — Horizontal and vertical scales agree within 0.5% → one uniform scale
6. `06-calibrate-check-ready.png` — Independent check on a third printed dimension → Ready
7. `07-choose-flashing.png` — Choose flashing — company standards, New flashing, pieces-only
8. `08-flashing-blank-grid.png` — New flashing opens on an EMPTY grid — header: Close · Undo · More only
9. `09-flashing-tapped-out.png` — Shape tapped out (each tap = one leg; no Done-drawing step)
10. `10-flashing-sizes.png` — Sizes typed straight onto the drawing — applied while typing, no Apply / Enter / Save
11. `11-flashing-crush-fold.png` — Endpoint → Crush fold (2 taps), shown at once; Flip fold is one tap
12. `12-flashing-details.png` — Flashing details — Solid/Perforated, finish, BMT (0.55 company default), colour; saves automatically
13. `13-measure-runs.png` — Measured runs 2 × 4,321 → 4,600 and 6,980 → 7,200 (long piece, kept whole + flagged)
14. `14-schedule.png` — Length schedule — the 7,200 is one piece with a handling flag and a Split action
15. `15-split.png` — Explicit split: 3,700 + 3,700 − 200 lap = 7,200 coverage (no second allowance)
16. `16-reload-restored.png` — After a reload the drawing comes back from the server exactly
17. `17-order-review.png` — Order review — supplier (Fielders default), delivery, lengths still needed, readiness
18. `18-order-exported.png` — Export frozen — nothing sent, nothing ordered
19. `19-order-history-worker.png` — Leading hand can export but cannot record a placed order (director only)

Video of the whole run: `workflow.webm`
Supplier PDF exported in this run: `supplier-order.pdf`

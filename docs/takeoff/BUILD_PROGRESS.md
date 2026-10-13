# Takeoff R03 — build progress

Resume file for interrupted/compacted runs. Contract = `docs/takeoff/R03/` (read in order 00→04).
Branch `takeoff-r03` (from `portal-v2` @ `022202a`, clean tree at start, 2026-10-13).

## Owner decisions (2026-10-13, in chat)
- Build takeoff IN THE HUB (supersedes MASTER_PLAN allocation to Bestimator/Buildxact) → ADR in `docs/takeoff/ADR-001-hub-takeoff.md`.
- All 5 proposed defaults in 00-START-HERE accepted as written.
- Feature branch in the main checkout (no worktree).

## Routine implementation decisions
- D1 Migration number **206** (`206_takeoff_foundation.sql`); 204/205 already on portal-v2. Not applied anywhere but the local isolated test DB.
- D2 Feature flag: server env `TAKEOFF_ENABLED=true` (default OFF). UI asks `/capabilities`; entry hidden when off. Rollback = unset flag.
- D3 Worker routes registered INSIDE `registerWorkforceRoutes` via `registerTakeoffWorkerRoutes(app, helpers)` so the existing
  workerAuth / workerVisibleJobs / workerMaySeeJob / workerChargeUpSiteParent are reused unchanged. Takeoff writes additionally
  reject `req.workerPreview` (no reorder-style exception).
- D4 Atomic mutations via plpgsql RPCs (SECURITY INVOKER, called by service role; EXECUTE revoked from PUBLIC/anon/authenticated).
  Server computes with `shared/takeoff` from the snapshot it read at revision R, commits with expectedRevision=R (CAS).
- D5 Isolated DB tests: throwaway local Postgres 17 cluster (`/opt/homebrew/bin/initdb`) with stub auth/storage/base tables.
- D6 Shared calc module `shared/takeoff/*.js` (pure ESM, no DB/auth/DOM).

## Gates (PASS / FAIL / BLOCKED / NOT RUN)
| # | Gate | Status | Evidence |
|---|---|---|---|
| 1 | Preflight: checkout, instructions, drift | PASS | HEAD=022202a, 0 commits since audit, clean tree; live schema probed read-only |
| 2 | Shared viewer/gesture in ui-review | PASS (Chromium) / BLOCKED (real iPhone) | takeoff-geometry (vs pdf.js PageViewport), takeoff-gestures, e2e/ui-review/takeoff.spec.js DPR 1/2/3 × 3 zooms |
| 3 | Schema + auth adapters + concurrency + recovery | PASS (isolated PG) / NOT RUN (prod) | takeoff-db 14, takeoff-api 29, takeoff-premigration 5, Playwright A18–A20 |
| 4 | Calibration, measure/count, profile, standards, rules, schedule, split | PASS | calc 57, profile-editor 38, Playwright journeys |
| 5 | Frozen export + placed-order record | PASS | takeoff-api A21–A27, takeoff-pdf A28, Playwright order journey |
| 6 | Later-material contracts, SOPs, handover | PASS | contracts PASS (calc); SOPs docs/sops/20_takeoff (7); docs/takeoff/HANDOVER.md |

## Log
- 2026-10-13 preflight done; handoff copied to docs/takeoff/R03.
- shared/takeoff/* written (units, geometry, calibration, flashing, profile, methods, schedule, history, catalogue).
- pdfjs-dist pinned 5.4.624 (legacy build used in node tests); pg 8.16.3 devDependency (isolated DB tests only).
- Migration 206 written (tables, triggers, RPCs: takeoff_commit/save_order/create_export/place_order/cancel_placement/
  plan_insert/archive_if_referenced/save_preset/next_order_ref). Bucket takeoff-exports (private).
- server/lib/takeoff/{takeoffErrors,takeoffAccess,takeoffService,takeoffExport,takeoffPdf,takeoffRoutes}.mjs.
  Staff routes in dev-api; worker routes registered inside registerWorkforceRoutes.
- workforceRoutes plan lifecycle: sha256/size on upload, atomic supersede RPC (+ safe pre-206 fallback), same-job
  validation before storage, list returns version/revisionLabel, delete archives referenced plans and deletes row
  BEFORE storage.
- Tests: takeoff-calc 57, takeoff-geometry 32, takeoff-api 29, takeoff-db 14, takeoff-pdf 4 — all PASS.
- Sample PDFs: docs/takeoff/evidence/sample-supplier-order-*.pdf (synthetic data).
- NEXT: client — takeoffApi adapters + recovery (IndexedDB), PdfViewport (pdf.js raster + vector layer + gestures),
  calibration sheet, measure, profile editor, materials/rules, schedule/split, review/export, order history;
  entry from JobPlansCard + PlansSheet; worker route under /worker; ui-review fixtures; manifest orientation.
- Client built: src/components/takeoff/* (TakeoffApp, PdfViewport, Calibration, Measure, ProfileEditor [agent], Material*, Schedule,
  Orders, PlanSetup, changeset/useTakeoffWorkspace/usePlanDocument), src/lib/takeoffApi.js + takeoffRecovery.js, routes in App.jsx,
  entries in JobPlansCard (+ charge-up modal) and worker PlansSheet; manifest portrait lock removed; AppShell edge-swipe suppressed.
- ui-review fixture (in-memory server using shared maths) + synthetic 12-page plan set (scripts/takeoff/make-review-fixtures.mjs).
- Playwright: 20 + 3 recovery tests PASS (npm run test:takeoff:ui). Evidence: docs/takeoff/evidence/ui/*.png.
- Build: PASS. main +8 kB vs baseline; takeoff chunks lazy (TakeoffApp 156 kB, pdf.js 500 kB, worker .mjs 1.1 MB not precached);
  fixture PDFs NOT emitted to dist (fixed: no ?url imports in fixtures).
- Live probe (read-only): 152/172 present; 206 absent (expected); suppliers.address MISSING (out-of-scope task chip raised).
- npm run test:takeoff runs 8 suites; CI .github/workflows/takeoff.yml (PG17 service container, no secrets).
- Adversarial review (independent agent): 17 findings, all fixed with regression tests (see HANDOVER §6b).
- SOP agent: 7 SOPs (20-01..20-07) + 17 spec gaps; gaps fixed except those listed in HANDOVER §7.
- LOCAL SANDBOX for the owner's drawings: `npm run takeoff:sandbox` (scripts/takeoff/sandbox.mjs) — persistent local PG
  `blh_takeoff_sandbox` + real routes on 127.0.0.1:8788 + Vite UI-review on :5181 with takeoff passthrough; watches
  ~/Takeoff-Sandbox/drawings. Full-stack smoke e2e/ui-review/takeoff-sandbox.spec.js PASS.
- Owner asked (2026-10-13) to test on a set of drawings first — sandbox handed over; waiting on that feedback. NOT committed.

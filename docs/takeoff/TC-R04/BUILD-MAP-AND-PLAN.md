# Timber + cladding (TC-R04): map and build plan

Spec pack: `docs/takeoff/TC-R04/` (00–13, `fixtures.json`, `catalogue-seed.json`). This builds on branch `takeoff-r03` at the point after the R04/R04b flashing corrections and the PWA scroll fix (`78a9e0f`). One takeoff app. Nothing parallel.

## Map: spec → current code

| Spec need | Today | Gap → plan |
|---|---|---|
| Generic dispatch, typed demands and stock outputs (06) | `schedule.js` assumes flashing: every contribution gets flashing rules and length-only pieces. `methods.js` has contract-only `repeated_members@1`, `sheet_wall@1` and `area_to_linear@1`. | New `shared/takeoff/engine/` modules return Demands. One allocator. `schedule.js` dispatches by method key and version to produce generic schedule lines (unit, stock dimensions, identity). Flashing is unchanged. |
| Timber T1–T7 | Only `memberCount` / `stockLength` helpers | New `engine/timber.js`: repeated positions with offsets and endpoints, projection vs true length, 1200/600 grid, stud wall with real stations and openings, plates, noggins, trim, manual/count, orderedStock. Optional sizing provider is null only. |
| Wall / elevation / openings (C0) | None | New `engine/wall.js`: rect, rake, gable and elevation polygons; opening union clipped to the wall; gross / opening / net areas. |
| Cladding C1–C6 + Rendex (12) | `sheet_wall@1` is a stub | New `engine/cladding.js`: `sheet_layout@2` (occupied cells, rakes, multi-course), `course_layout@1` (full-band openings, joints), `panel_grid@1`, `aac_panel_layout@1`, `area_to_linear@2`, Rendex family. |
| Supports, fixings, accessories (05) | None | New `engine/supports.js` + `engine/accessories.js`: support_grid with required stations, clipping, edge zones, fasteners (n=ceil(U/p)+1) and box rounding. Accessory routes: starters, corners, joints, membrane, tape, sealant volume, mesh. Child flashing demands keep their length kind. |
| Aluminium (11) | None | New `engine/allocator.js`: kerf, end-trim and final-end simulation; FFD then bounded branch-and-bound with lower bound and a proven flag; existing offcuts; reservations. Plus a three-edge window preset. |
| Continuous flashing runs (13) | Straight 2-point runs (connected mode = separate runs) | New `engine/flashingPath.js`: polyline arc length via the calibration, legal max capacity, red overflow, split at the legal marker or a chosen station. One-gesture double-tap recogniser in `gestures.js`. Old 2-point runs read as polylines. |
| Catalogue + provenance (06 / 09) | Company presets (flashing only) | `shared/takeoff/catalogue/seed.json` (research seed, review states). Product / ordering / installation records in preset content. Job copies via existing standards → job-copy mechanics. Rule rows stay "source-pending" unless reviewed. |
| DB | 206: measurement kinds run/count/manual; contribution role 'primary'; order lines length-only | **Migration 207 (additive):** new measurement kinds (polyline, wall, opening, distribution, member, area, offcut) with constraints, new contribution roles, order lines `unit` + `item` (length nullable), and `takeoff_save_order` writing them. |
| UI | Flashing only | Overview: Add flashing / Add timber / Add cladding / Add aluminium. Timber setup + member/distribution tools with ticks. Cladding setup → wall run + heights → generated elevation (Cladding / Supports / Accessories). Aluminium cutting sheet. Flashing polyline + red-line split. Generic schedule rows with source highlight. |
| Orders / PDF | Flashing groups | Generic purchase lines by unit (bars, sheets, boards, LM, boxes). Separate cutting/setout appendix (bars + cuts, sheet layout, timber cut list). |

## Build sequence

1. **Engine (parallel, pure, tested):**
   - (a) allocator + stock
   - (b) timber
   - (c) wall + cladding
   - (d) supports + accessories
   - (e) flashing paths + double-tap recogniser

   Each module is checked against `fixtures.json` and every computable acceptance case, then verified adversarially.
2. **Integration:**
   - registry v2, generic schedule lines and identity / staleness (F01-style rules for every family)
   - server validation, migration 207, DB and API tests
   - generic order lines and PDF with appendix
3. **UI:** entries, timber, cladding wall / elevation, aluminium cutting, flashing polyline, catalogue picker / editor (Product / Ordering / Installation tabs), schedule source highlight.
4. **Verification:** J1–J5 and UX / CAT / CAL / TIM / CL / BAT / BOM / ORD / SEC / REG gates on the real local stack (Chromium + WebKit iPhone emulation); adversarial review; fixes; review ZIP.

**Out of scope, per the spec:** automatic structural sizing, 3D / BIM, AI plan reading, cross-job inventory, and automatic installation rules for unreviewed rows. These are marked source-pending.

**Not authorised:** production migration 207 or a deploy of the timber/cladding build without the owner's go-ahead.

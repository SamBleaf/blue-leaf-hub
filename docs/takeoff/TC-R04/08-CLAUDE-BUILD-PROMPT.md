# Claude Code launch prompt — timber and cladding add-on

Implement this timber/cladding specification in the existing Blue Leaf Hub takeoff module. Read all numbered documents and both JSON files. Complete all unblocked work in one sustained build/test pass, respecting current repository instructions and preserving newer/uncommitted work.

First reconcile the current R04 flashing correction branch. Do not regress its instant editing, undo/recovery, scale/revision tracking or order-identity safeguards.

Use shared plans/calibration/recovery/job access/schedules/orders. Do not create a second takeoff application. Existing contract-only methods are a starting point, not finished implementations; schedule.js is still flashing-oriented in the reviewed R03 source. Add versioned generic dispatch and typed demand/stock outputs before exposing new methods.

Build:
- timber purpose setup; repeated member/distribution roles; projection vs true length; configurable centres/endpoints; manual sizing and the confirmed timber stock grid starting at 1200 mm in 600 mm increments;
- studs/openings/extras, plates/noggins, trim and batten stock;
- wall geometry from floor-plan runs plus entered heights and calibrated elevations, openings and simple rakes/gables;
- Axon sheet setout, Linea/Stria courses, Matrix joint grid, manufacturer-specific AAC panel quantities, timber LM and fixed-board methods;
- assembly-specific support layers and accessory quantities tied to the same wall;
- catalogue product/rule forms, job copies, source/version review, scalar overrides and provenance;
- accurate multi-unit supplier schedules and immutable exports.

Implement the exact algorithms, workflow decisions and boundaries in03–06. No arbitrary area/spacing proxy for an exact piece order. No double pitch, waste, opening deduction, flashing allowance or support count. Do not let ordinary shiplap inherit end-matched off-support joint permissions.

catalogue-seed.json is traceable research input. Product dimensions and installation verification are different. Retrieve complete current guides for active rule rows, compare headers/notes and add independent row fixtures before enabling automated fastening/support selection. Missing AAC guide rows remain source-pending with a usable project-reviewed manual layout path; no invented stock/spacing values. Do not label the catalogue globally verified.

Keep manual structural sizing fully usable. Reuse Bestimator lookup interfaces if available, but no unverified old table cells/default sizes or implicit structural approval. Span-table sizing remains an optional separately reviewed provider.

Run07 acceptance and fixtures; implement production regression tests, isolated DB/API tests, lint/build and real phone/desktop workflows. The bundled verifier validates arithmetic examples only, not the application. Fix observed failures. Finish other work if hardware/source access is unavailable and clearly identify NOT VERIFIED items.

No production deployment/migration, supplier messages or purchases are authorised.

Return one review ZIP: source/diff/commit, migrations, product and rule provenance, complete acceptance matrix, test logs including skips, synthetic supplier PDFs and cut lists, actual device evidence, and remaining unsupported rule combinations. Distinguish implementation completion from installation-rule review and site-ready acceptance.


R02 mandatory addition: implement11 aluminium opening profiles and stock/offcut allocation as core scope. Use the existing shared linear stock allocator. Include three-edge window presets, no-splice demands, cross-window pooling, kerf/end-condition simulation, labelled cutting sheets, honest optimisation status and planned-versus-actual offcut separation. Run all12 aluminium acceptance cases.

R03: apply12 and the revised owner settings. Prioritise Walsc AAC, add Rendex EPS as a distinct sheet-based cladding family, use supplier/product effective cover, and enforce the1200/600 timber stock grid. Do not inherit aluminium stock rules, AAC fixings or blanket cover deductions across these families.

R04: implement13 continuous flashing polylines and deliberate red-line splitting, including double-tap gesture arbitration, no per-corner quantity/allowance, calibrated arc lengths, handling-versus-hard limits, per-piece allowance and retained overflow. Run its12 acceptance cases. This pack revision is separate from the pre-existing flashing R04 corrections; retain both.

# Blue Leaf Hub — timber and cladding takeoff specification R04

Prepared 14 October 2026, Adelaide. Status: implementation specification and researched seed catalogue; not application code or a certification of installation design.

## Decision

Build timber and cladding as additional methods and assemblies in the existing takeoff workspace. Reuse plans, page calibration, recovery, job access, measurements, revision handling, schedules and frozen orders. Complete the R04 flashing correctness fixes first; retain its simple editing behaviour.

The working product must turn a small number of builder inputs into explainable order quantities. It must support adding new products through a controlled parameters form, without requiring an agent to invent a new formula every time.

## Scope delivered by this spec

- Timber: rafters, joists, studs, plates, noggins, battens, trim, individual members and manual/count entries.
- Cladding: Axon sheet setout; Linea and Stria courses/boards; Matrix expressed-joint grid; manufacturer-specific AAC panels; timber cover-to-linear and board layouts.
- Installation assemblies: direct fix, vertical supports, horizontal supports, drainage/counterbatten layers, trims, openings, joints, membrane and optional fixings/consumables.
- Phone-first measurement and wall/elevation editing; deterministic calculations, stock rounding, simple cut allocation, source traceability and procurement-ready schedules.
- Independent known-answer calculation fixtures and end-to-end acceptance criteria.

## Read order

1. 01 — what to learn from similar applications and research conclusions.
2. 02 — screens and user journeys.
3. 03 — timber calculations and limits of existing span-table assets.
4. 04 — cladding geometry, product rules and cutting.
5. 05 — battens, supports and accessory assemblies.
6. 06 — integration/data/API/version contract.
7. 07 — acceptance matrix; fixtures.json plus verify-fixtures.py.
8. 08 — complete Claude Code building prompt.
9. 09 — source register, scope and retrieval gaps.
10. 10 — defaults, remaining decisions and release boundaries.
11. catalogue-seed.json — traceable product dimensions and assembly candidates, deliberately not an import-ready fully verified installation catalogue.

## Product facts vs application decisions

Manufacturer facts live in source-linked catalogue records. Quantity algorithms, UX and workflow choices are proposed Blue Leaf design decisions. Supplier stock availability is a separate fact. A product being published does not prove Adelaide stock or full-pack-only purchasing.

The pack specifies all software behaviour needed to build the tools. It does NOT pretend to contain every verified fastening-table cell for every wind class, substrate and product. Missing numerical installation rules remain explicit; a reviewed job specification can supply them. Users can still measure and draft quantities. A system cannot be labelled installation-verified while such dependencies remain unresolved.

In particular, current full Hebel AAC guides exceeded the research service's retrieval limit; direct download was refused. Walsc's current guide viewer did not expose readable content, and older indexed PDF URLs redirected to its home page. Public product data was readable. Do not promote old/search-only AAC fixing rows into current automated defaults. See 09.

## Completion standard

An actual builder completes rafter and cladding takeoffs on an installed iPhone PWA and desktop, changes measurements, sees correct dependent quantities, reloads and produces a correct supplier schedule. Formula tests alone are insufficient. Keep high-risk sizing optional and separate from ordering.

This specification does not authorise live supplier messages, purchases, production migration or deployment.


## R02 addition

Read 11-ALUMINIUM-PROFILES-AND-CUTTING.md before implementation. Owner-required aluminium opening profiles and mandatory whole-job offcut allocation extend this pack. Where R01 called stock optimisation optional, it is mandatory for aluminium. Other requirements remain unchanged.

## R03 confirmed settings

Read12-OWNER-SETTINGS-AND-RENDEX.md. Walsc AAC and Rendex foam are prioritised. Timber cover is supplier/product configurable; timber stock starts at1200 mm in600 mm increments. These confirmed settings replace earlier supplier-list-first/fallback wording.

## R04 continuous flashing runs

Read13-FLASHING-CONTINUOUS-RUNS.md. Tap corners to form one run, double-tap to finish, and deliberately tap flagged overflow to split at the legal maximum. This addition extends the flashing tools alongside this timber/cladding build.

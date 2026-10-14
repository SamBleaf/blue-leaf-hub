# Acceptance and build verification

These are requirements for the future build. No application implementation or end-to-end execution is claimed by this pack. verify-fixtures.py checks the spec's arithmetic only; production methods must independently meet the fixtures.

## Product gates

| ID | Scenario | Expected evidence |
|---|---|---|
| UX01 | On phone, set rafter purpose/centres/pitch, measure member then run | Distinct line roles, visible ticks, correct stock list; no Apply/Enter requirement |
| UX02 | Draw cladding wall from plan + entered height; add window | Generated elevation explicitly labelled; correct sheet/course layout, opening and support view |
| UX03 | Change product/orientation | Correct cover and assembly selected; incompatible old parameters flagged, not retained silently |
| UX04 | Edit then undo; reload incomplete wall/member draft | Stable field/geometry, no lost work or stale debounce overwrite |
| UX05 | Large plan and 20 walls | Selected wall remains usable; no silent truncation; measured device timing recorded |
| CAT01 | Add a new product using an existing method | Works without code change; source, cover, supplier stock and assembly distinguished |
| CAT02 | Company template copied to two jobs | Edit one without changing the other or original |
| CAL01 | Separate X/Y scales, rotation, page/region change | Length/area correct; wrong region/page blocked; recalibration invalidates dependents |
| TIM01 | Repeated-member positions and pitch fixtures | Exact count; no double pitch; no automatic structural splice |
| TIM02 | Wall openings/king/jack/cripple members | Actual station clipping, explicit extra design detail and no naive count subtraction |
| TIM03 | Grade/treatment/section and supplier stock changes | No incompatible grouping; obsolete allocations stale |
| CL01 | Axon two adjacent short walls + small opening | Per-wall rounding; partly occupied sheet retained; no phantom reuse |
| CL02 | Axon taller than stock | Real second course/detail or blocked; never accept one-sheet count from a joint flag |
| CL03 | Linea/Stria cover and course variants | Effective cover used; factory-end/joint/support constraints respected |
| CL04 | Matrix boundary joint fixture | Correct panel grid and backing/support quantities |
| CL05 | AAC product change | No mixing brands or wall systems; missing fixing row explicit |
| CL06 | Timber random-length vs fixed-length supply | LM estimate distinct from actual stock list; ordinary vs end-matched joint rules retained |
| BAT01 | Opening and panel-joint supports | Actual clipped supports; shared physical members deduplicated only where appropriate |
| BAT02 | Edge-zone and support/fixing-row changes | Required station/fastener tuple updated together |
| BOM01 | Trim/membrane/sealant/mesh outputs | No double opening deduction, no omitted quantity treated as zero |
| BOM02 | Child flashing generated from opening | Exactly one demand; correct tight/finished semantics; no double +200 |
| ORD01 | Export then edit product/source/rule | Draft selections stale; old frozen PDF unchanged; no R04 wrong-colour-style mismatch |
| ORD02 | Shared stock cut allocations and order remainder | Conservation of required quantities; no double allocation, no over-order hidden in aggregate |
| SEC01 | Worker/admin/job switching and malicious payload | Same authorised calculation; cross-job refs rejected; drafts isolated |
| REG01 | Existing flashing workflows | R04 gates remain passing; no migration regression |

## Minimum release journeys

J1 Timber: 10,000 mm run at 600 centres; 4,500 mm projection at 30° plus 100 mm allowance; stock list including 5,400. Expected 18 members × 5,400 = 97,200 mm purchased before spares. Section manually specified and labelled accordingly. Change to true length and verify pitch is not applied.

J2 Cladding: wall 4,800 × 2,700; Axon effective cover 1,200, suitable sheet height, one 900 × 900 window fully inside one sheet cell. Default no reuse: four sheets still consumed. Show net area 12.15 m², support/opening detail and selected accessory scopes. Change width to 4,801: five sheets before spares. Reload, undo, order export and source highlight must agree.

J3 Board variants: 3,000 mm clad height on a rectangular wall. Smooth Stria 325 cover 300 gives ten conservative courses; Fine Texture published cover 295 gives eleven. Separate SKU, assembly and order identity; never reuse a single family-wide cover constant. Source catalogue values must be reviewed before production.

J4 Matrix: W=2,390, H=2,390, panels 1,190 square, gap10, no outer gaps: four full panels. Increase both extents to2,400: 3×3 occupied cells under that fixed grid; flag narrow cut strips for detail review, never silently count four.

J5 Mixed procurement: timber pieces, cladding sheets, proprietary battens, random-length LM, fixings boxes and flashing pieces on the same job. Different units remain intact. Export selected supplier subset; previously placed quantities reconcile without changing original order.

Record actual phone/desktop videos or screenshots, inputs, resulting layout/cut list, PDF and commit. Synthetic fixtures are not structural/installation approvals.

## Required automated checks

Unit: all arithmetic fixtures plus boundary/invalid-input tests.
Geometry: opening unions/clipping, rakes, empty/partial cells, support grids, kerf and preserved end conditions.
State: undo/recovery/race/conflict and catalogue version changes.
Server/database: authorisation, optimistic locking, frozen export identity, allocations/remainders, additive migration compatibility.
Visual: PDF columns, dimensions, quantities/units and long descriptions; no clipping.
Performance: benchmark measured real phone; set final limits from evidence.
Do not mark skipped tests PASS.

## Implementation sequence without repetitive approvals

1. Reconcile latest R04 and protect flashing behaviour.
2. Generic demands/orders and versioned method dispatch.
3. Timber repeated/manual/linear-stock paths.
4. Wall/elevation/opening geometry and Axon/board/Matrix layouts.
5. Assembly support/accessory derivation and AAC/timber product variants.
6. Catalogue editor, provenance, reviewed installation rows and source gaps.
7. Full phone-to-order verification and return one review ZIP.

Return source/diff, migrations, test logs, source-row validation results, acceptance matrix, sample orders/cut lists, actual device evidence and remaining unresolved rules. Do not claim site-ready for untested phone flows.


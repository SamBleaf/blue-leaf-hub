# R02 addition — aluminium profiles and shared offcut allocation

Owner requirement, 14 October 2026. This addition takes precedence over R01's optional cut-allocation wording for aluminium profiles: automatic allocation is REQUIRED when ordering this material. Reuse the generic linear stock allocator; do not build a separate measurement engine. Product/stock dimensions here are owner-supplied examples, not supplier catalogue verification.

## Product and opening preset

Add aluminium profiles to cladding accessories and allow standalone profile takeoff. Initial company preset: aluminium equal angle 50 × 50 × 3 mm, stock length 6500 mm, each required run must be one continuous piece. Save section shape/dimensions, alloy/temper when specified, finish/colour, stock SKU and supplier separately. Support later angle/channel/flat/custom profiles through the same parameters form.

Window preset: left jamb + right jamb + bottom; head excluded. Every piece has opening ID, wall ID, role and its own finished cut length. Include/exclude each edge explicitly. A different corner detail may need different allowances on each edge; do not inherit flashing +200 or timber 600 mm rounding.

The owner's example means a window 600 mm wide × 2400 mm high requires 2500, 2500 and 600 mm cuts. Store +100 mm TOTAL per jamb as the editable example allowance, not automatically +100 at each end. The division between top/bottom extensions remains a detail to confirm; permit a total allowance until known. Bottom allowance is zero in this example. Show nominal opening size and finished cuts separately. Do not silently make these allowances universal to all future installations.

Joint style (square/mitred/notched), reference convention (e.g. long point for mitres), end allowances, required factory ends, handedness and saw constraints must be explicit where relevant. Finished lengths must be known before optimisation. Initial automatic cutting supports square transverse cuts; mitred/notched ends need a verified cut envelope and saw-loss policy or a manually reviewed cutting plan. Never approve a square-cut packing result as a mitre cutting schedule without those details.

## Builder workflow

1. Select Aluminium → 50 × 50 × 3 angle; stock 6500 mm; no joins.
2. Select openings or enter width/height/count. Apply saved three-edge detail. Show editable finished lengths immediately.
3. Tool pools compatible required pieces from all selected walls/windows in this job, sorts and allocates automatically. One window is not one purchasing group.
4. Show “Buy N × 6500 mm”, total required length, cut loss, reusable remainder and scrap. Expand a bar to see ordered cuts and opening labels.
5. Change a window: quantities and draft cutting plan refresh automatically; undo restores the previous calculation. No Apply button. Frozen orders remain unchanged and show a reconciliation when revised.

Keep advanced fields under Cutting settings: kerf, end trims, minimum retained offcut, optimisation scope and existing offcuts. Missing saw allowance is visible: an estimate may use entered zero, but purchase-ready allocation requires explicit confirmation of the loss policy. Do not imply the illustrative 3 mm kerf is measured equipment data.

## Exact example

Using a confirmed 3 mm saw kerf, square cuts and no end trimming:

| Stock | Cut | Destination | Remaining usable length |
|---|---:|---|---:|
| A01: 6500 mm | 2500 mm + 3 mm kerf | W01 left jamb | 3997 mm |
| Same A01 | 2500 mm + 3 mm kerf | W01 right jamb | 1494 mm |
| Same A01 | 600 mm + 3 mm kerf | W01 bottom | 891 mm |

Buy ONE 6500 mm stock length. Before saw loss the remainder would be 900 mm. With this cutting policy it is 891 mm. This piece is available to another compatible cut in the same allocation run. An additional 800 mm square-cut part fits with one more 3 mm cut, leaving 88 mm. A 900 mm part does not fit.

Report the 891 mm as planned remainder until the bar is actually cut. Never create physical inventory just because an order or cutting plan was generated.

## Shared allocation contract

Input: individual demands with stable IDs and finished dimensions; stock options and quantities; compatible existing offcuts; kerf/end-trim/end-condition policy; mandatory no-splice flag; scope and source revisions. Expand repeated quantities to unique cut IDs for traceability, retaining grouped UI display.

Partition by physical compatibility: profile and thickness, material/alloy where specified, finish/colour, stock restrictions, usable end geometry and any job-specific prohibition on pooling. Never pool by the generic name “aluminium” alone. Rotating/reversing an angle or cut is allowed only where its geometry/finish/end constraints permit it.

Initial implementation: one selected stock length per product/order policy; optional multiple supplier lengths use the same solver with explicit cost/length objective. Default single-length objective is minimise new bars purchased, then avoid consuming more existing offcuts than needed, then favour fewer/larger reusable remainders with stable tie-breaks. Do not sacrifice a whole new bar merely to claim more offcut reuse. If future multiple stock lengths are enabled, optimise cost only when current prices exist; otherwise total purchased length then bar count. Display which objective was used.

Search existing compatible usable offcuts and new bars together. A longest-first best-fit packing is a feasible starting solution, not proof of minimum stock. Improve with a deterministic bounded branch-and-bound/bin-packing search and symmetry pruning. Store the feasible result, objective, lower bound, search budget and whether optimality was proven. A total-length lower bound alone can be weak because pieces cannot join. If the search budget is exhausted, show “best plan found — minimum not proven”; never claim guaranteed minimum. Run longer recalculation without blocking phone drawing. Never replace a better feasible incumbent with a worse result.

Every candidate must pass a cut-sequence simulation, including end trims, saw kerf, usable stock length, cut end types and indivisible demands. For each stock bar: original length = end-trim loss + finished pieces + cut loss + residual. Treat length accounting numerically, not rounded display values. Each demand is covered exactly once; residuals cannot be allocated twice.

Kerf convention: one separating cut per piece when a residual remains, as in the example. An exact-length final piece may use an already acceptable stock end without a further separating cut. End squaring, defective stock ends and special end conditions can change that; represent them explicitly. Do not blindly apply either n or n−1 kerfs in all situations. No extra saw cut may be assumed to happen outside usable stock.

A piece longer than every compatible usable stock length is unavailable, never split automatically. User must revise the detail or select a supplier-confirmed longer stock option. 6500 mm demand fits a perfect 6500 mm bar only when end-condition/trim policy permits; any required end trim can make it impossible.

Do not use ceil(total LM / 6.5) as the ordering algorithm. Example: three 3400 mm cuts total 10.2 m, but require THREE 6.5 m bars, because two cannot share a bar.

## Offcuts: planned versus physically available

Scope first release to this job; cross-job company inventory is optional future work.

- Planned residual: belongs to the draft cutting plan and may be reassigned during recalculation. It is not on-hand stock.
- Existing usable offcut: entered/measured actual length and profile/finish, location/label, quantity, revision and usable end conditions. May be used as an input stock piece.
- Reserved offcut: assigned once to a specific active cut plan; reservation changes are transactional and concurrency checked.
- Consumed offcut: recorded as used, not available for another plan.
- Actual new residual: created only after confirming the physical cut and actual measured remaining length. This action does not silently create new purchase quantities.

For minimal first release, physical cutting confirmation can be a simple optional “record remaining offcut” action with labelled length entry; a full warehouse module is not required. A retained-length threshold is a company/user setting, not an invented manufacturer rule. Short pieces below it are still reported as scrap; length never disappears from accounting.

## Export, data and change handling

Extend the existing Demand/StockAllocation model, retaining explicit cut order, opening/edge IDs, kerfs, residual length and usable-end flags. Add stock source kind new-purchase/existing-offcut and reservation ID where relevant. Existing offcut quantity reduces new purchasing, not required installed demand.

Supplier order: profile/spec/finish and count of full stock lengths. Site cutting sheet: bar ID, ordered cuts, window labels, residual and status. Never send the supplier each short cut as an additional full-length purchase. Export a cut-to-opening lookup; tapping a part highlights its window.

When demand changes, invalidate affected allocations and reservations, preserve frozen orders and actual consumed stock. Reconcile purchased/on-hand material before suggesting additional buying. Undo of a draft edit is not reversal of a physically confirmed cut. Server re-simulates allocations before freezing orders. Prevent cross-job/tenant offcut access and double reservations.

## Required acceptance cases

1. 2500+2500+600 with 6500 stock/3 kerf/no trims: one bar, three pieces, 9 cut loss, 891 remainder.
2. Add 800: still one bar, four pieces, 12 cut loss, 88 remainder. Add 900 instead: cannot put all pieces on one bar.
3. Three 3400 cuts: three bars despite LM lower bound of two.
4. A 600 cut can use a compatible existing 891 offcut, leaving 288 with 3 kerf; it cannot use a different finish or smaller section.
5. Cross-window pooling: 4000+2400+2500+2500+600 fits two bars with 3 kerf per extracted piece. Every piece retains its own window label.
6. 6501 single demand on 6500 stock: unavailable, no splice. Exact 6500 depends on end policy.
7. 2500+2500+1494 exactly fills 6500 with two 3 mm separating cuts if final stock end is acceptable; adding 3 mm for a nonexistent third cut must not reject it. With final-end trim required, re-evaluate and flag insufficiency.
8. Editing an opening refreshes cuts, stock count and residuals; undo restores deterministic results; reload preserves current allocations.
9. Reserved offcut cannot be used by a concurrent second plan; stale state rejected on server.
10. Allocation heuristic fallback is labelled honestly; test a case where greedy packing is worse than a feasible alternative. Result must never be worse than its initial feasible plan.
11. Conservation of length and exactly-once demand coverage on every bar; no negative residual or double-counted offcut.
12. Supplier PDF orders bars; site PDF lists cuts; both reconcile to the same frozen calculation revision.

## Priority

This is core cladding ordering behaviour, not a later optional optimisation. Implement with the timber/trim stock allocator so other compatible linear materials can benefit from the same capability. Keep material-specific joint/finish/kerf rules separate from the generic packing algorithm.

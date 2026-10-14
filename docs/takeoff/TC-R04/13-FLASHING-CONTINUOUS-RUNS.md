# R04 addition — continuous flashing runs and deliberate splitting

Owner requirement, 14 October 2026. This document extends the flashing takeoff tools and must be applied alongside the earlier flashing R04 review/fixes. The pack's R04 revision number is separate from the existing flashing review's revision number. Keep all timber/cladding and aluminium requirements.

## Intended result

One measured path can turn several corners and still represent ONE ordered flashing that the builder cuts/folds onsite. A plan vertex is a change in direction, not a separate ordered piece, supplier fold or flashing cross-section bend.

Example: five path points defining four straight legs of 750 mm give a tight run of 3000 mm. With the established +200 mm per finished measured run and upward100 mm rounding, order one3200 mm flashing. Do not add200 mm at each corner or round individual legs. The flashing cross-section/profile and face side remain separate from plan geometry.

## Drawing interaction

- Single tap: start or add a path vertex at the tapped plan position.
- Further single taps: add corners to the same path. Display cumulative tight length and resulting order length live.
- Double-tap on phone / double-click on desktop: add the final endpoint once and finish the path as one flashing, unless it already has explicit splits.
- Double-tapping the existing last point finishes without adding a duplicate or zero-length segment.
- A compact Finish action remains available for accessibility and unreliable double-tap situations; it is secondary to the gesture, not an extra required step.
- Undo removes the latest vertex while drawing; completed run edits/splits support undo. No Apply/Enter requirement.
- Two-finger pan/pinch moves the plan. Single-pointer drags above movement tolerance must not create vertices. Double-tap completion takes precedence over viewer double-tap zoom only while drawing a flashing.

Implement one pointer gesture recogniser, not independent click and dblclick handlers that commit duplicate endpoints. Proposed thresholds: double-tap interval300 ms, proximity24 CSS px; test on real iPhone and allow tuning in code. Recognise taps only after pointer-up with movement tolerance; suppress synthetic mouse duplicates. Coalesce a recognised double-tap into one endpoint transaction, preserving immediate single-tap feedback. Pinch, pointercancel and page navigation must not create phantom points.

A completed run is selectable as a whole; vertices remain draggable and insertable. Moving a corner updates total length and allocation. Show the profile separately in the order sheet. Optional plan thumbnail can annotate corners as site cuts/folds; never imply the supplier fabricates the plan's corner geometry from the straight profile order.

## Length and limits

For calibrated points P0…Pn, tight length = sum of real-world distances of consecutive points. Use each page/region's X/Y transformation before measuring; do not measure screen pixels or the endpoint chord. Preserve unrounded geometry.

For each explicit ordered piece:
orderLengthMm = ceil((tightPieceLengthMm + 200) / 100) ×100.

The200 mm is TOTAL per measured piece, not per endpoint. Existing finished-length/direct-entry inputs continue to bypass measured-run allowance as already specified. Automatic child flashings must retain their length-kind flag to avoid double allowance.

Maximum orderable length belongs to the selected flashing product/order policy. Keep the previously discussed6000 mm handling threshold distinct: amber advisory, not a hard split. Do not reuse6500 mm aluminium stock or timber1200/600 increments. If hard maximum is unknown, display that and require product setup before a procurement-ready order; drawing can continue.

With allowance A=200, increment R=100 and hard maximum M, greatest tight capacity is floor(M/R)×R−A. For an illustrative9000 mm hard maximum this is8800 mm;8800 orders9000,8801 orders9100 and exceeds the maximum. This example does not assert a universal9000 mm manufacturer limit.

Use numerical tolerance only for transformed-coordinate noise. Display rounding must not hide a real overrun. A nonpositive tight capacity is invalid product configuration.

## Red-line split interaction

Preserve the owner's earlier requirement: keep the path whole and flag it until the builder chooses to split.

While drawing or editing:
1. Valid portion has normal material colour. Once order length exceeds the hard maximum, draw the overflow portion red and mark the last legal break position along the path with a visible split handle. Amber handling-length guidance is separate.
2. Tapping the red overflow line activates a clear “Split at limit” action at that legal marker. In drawing mode this is one tap: perform the split, highlight the cut marker and show the resulting lengths immediately, with Undo. Do not create a new path vertex from this tap.
3. The exact tap location is NOT used if it would make the first piece overlength. The legal split handle shows the actual position before and after the action. The tap requests the displayed legal split, not a silent break at an arbitrary red point.
4. Split the ordered-piece allocation at the legal marker, retaining the entire original path and all corner vertices. One new piece ends there and the next begins there; the remaining path continues. Do not discard the already measured overflow.
5. Recompute remaining tight lengths with a fresh per-piece200 mm allowance and rounding. If another piece exceeds the hard limit, its overflow remains red and offers another split action. One tap performs one split; do not silently create several joins.
6. Allow the builder to move a split earlier along the path or to an existing corner. Moving beyond legal capacity is blocked or left unresolved visibly, never exported as valid. No automatic preference for corner joins.

This is an explicit split action, not automatic splitting whenever a corner is tapped. Short runs remain one piece. The user can double-tap to stop an overlength path and retain it as a draft requiring a split; invalid pieces cannot be exported as an order-ready selection.

The valid maximum marker can lie inside a straight segment. Locate it by cumulative calibrated arc length, interpolate within that segment and keep the plan point plus path station. Rebuild stations after geometry edits; if an existing split location becomes invalid, flag it and offer recalculation, not a silent change to an approved cut location.

A builder-selected earlier split can be set with the split handle; hit testing must distinguish handles, existing vertices and red-line action. Prioritise handle, then red-line action, then adding a new point. Use a minimum44 CSS px touch target around a split handle while retaining a precise model position.

## Joins and allowances

A split necessarily changes one continuous piece into multiple pieces and introduces a site joint. The visible split is the user's intentional decision. Do not infer a compliant lap direction, corner joint or sealed joint detail from length alone.

Retain the agreed +200 mm per resultant measured piece; it is not proof of any required lap. Store explicit overlap/return/end-detail inputs separately if provided, with a flag stating whether included in the200 mm or additional. Never silently add the same joint allowance twice. If a selected project detail prohibits a joint at the proposed station, move it earlier to a legal location or require manual resolution.

Example10000 mm tight path,9000 mm maximum: chosen legal split at8800 creates tight pieces8800 and1200, ordered lengths9000 and1400. A preferred manual split at5000 gives5200+5200. Both preserve10000 mm measured coverage; their extra material is clearly explained. If explicit additional joint material is needed, recalculate legal capacity accordingly before allocation.

## Data and exports

Use an ordered polyline measurement, not separate unrelated segment measurements. Store run ID, points, calibration/document revision, profile revision, face side, length kind, split stations/plan locations, source and per-piece allowances. Derive tight piece length by path intervals. Allocation IDs must remain linked to the parent run.

Keep plan corners and longitudinal split markers in separate arrays. Preserve existing straight-line measurements as two-point polylines through a backwards-compatible reader/migration. Do not rewrite old frozen orders.

Supplier schedule: one row/quantity for a short unsplit run, or resulting finished lengths for explicitly split pieces; never one quantity per plan segment. Site reference: parent run ID, plan thumbnail if available, cumulative corner stations and split locations. Do not label plan corner angles as supplier cross-section bends. Retain product/profile/colour/thickness procurement identity.

Changing geometry, allowance, calibration, profile maximum or split stations invalidates draft allocation and its order readiness. Server calculates path lengths and limits from source inputs. Preserve snapshot and show changes against placed orders. Persist an in-progress path for recovery without creating a final order line prematurely.

## Required acceptance

1. Four750 mm segments → tight3000, one ordered3200. Corners do not add quantities or allowances.
2. End double-tap produces one endpoint, no zero segment; double-tap last point finishes unchanged.
3. Pan/pinch/drag/pointercancel and synthetic mouse events create no unintended vertex.
4. Out-and-back or angled path uses sum of segments, not endpoint chord. Self-crossing does not silently merge lengths; warn on exact retracing without deleting user geometry.
5. Tight8800 with illustrative maximum9000 → valid9000;8801 → red overflow, order9100 invalid.
6. Tight10000 initially remains one flagged draft. Red-line tap splits at8800 →9000+1400; no geometry lost and undo restores the flagged unsplit draft.
7. A chosen earlier5000 split →5200+5200. Each piece has exactly one allowance.
8. More than two pieces needed → residual overflow remains visible after the first deliberate split; no hidden joins.
9. Existing handling threshold6000 gives amber advisory when exceeded; it does not force a split below the hard maximum.
10. Geometry/calibration edits recalculate and flag invalid split positions; frozen PDFs remain unchanged.
11. Both phone gestures and desktop input tested against real PDF viewer zoom/scroll behaviour; all touch targets remain usable at high zoom.
12. Direct finished-length entry and generated child flashings avoid duplicate allowance; server rejects an overlength procurement-ready export.

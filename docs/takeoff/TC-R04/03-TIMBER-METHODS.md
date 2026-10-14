# Timber calculation specification

These are proposed quantity algorithms, not structural design rules. Dimensions are millimetres, areas square metres at display boundaries and angles degrees. Preserve unrounded geometry; round only at specified purchase stages.

## T1 Repeated members

Inputs: purpose, member section/grade/treatment, distribution endpoints, centres c, start/end centreline offsets a/b, include-start/end flags, member length source, pitch, allowance, plies, stock policy.

Let D = measured distribution length and R = D-a-b. Reject R < 0. A zero-length usable interval is only allowed as an explicitly selected single member.

Default both ends included:
- positions are 0,c,2c,... strictly below R, plus R, then offset by a;
- count = ceil(R/c)+1 for R > 0;
- exact multiples include the end once, not twice;
- final bay may be shorter, never longer than c.
Apply endpoint exclusions AFTER generating positions. If ends represent wall faces rather than member centrelines, enter offsets; don't silently subtract half a section.

For equal spacing choose n=ceil(R/c) bays and positions i×R/n. This is an explicit alternative to fixed centres, not a hidden adjustment.

Disconnected distribution segments restart their own grid. Connected collinear segments may share a phase only when selected as one run; deduplicate a shared endpoint once. Never deduplicate two adjacent plies or separate framing planes just because positions coincide.

## T2 Member length

Projection measured in plan along the member's horizontal direction:
trueLength = projectedLength / cos(pitch).
A true-length measurement on a section/elevation is already sloped: do not apply pitch again. Roof run direction on the PDF is not pitch.

Default member line covers the entire intended projected member, including projected overhang. Alternatively accept clear span + individually labelled projected overhang/bearing additions, convert their sum to slope length, then add true-length trim allowance. Mutually exclusive input modes prevent double counting.

lengthNeeded = trueLength + explicit true-length end allowance.
requiredPieceCount = stationCount × plies.

No universal timber allowance is invented. Default allowance 0, visible and editable; company presets may set one. Do not import flashing +200/100 mm rules.

Supported first release: constant pitch and constant member lengths. Variable lengths: manually override selected stations or interpolate a simple straight rake with explicit two heights/lengths. Hip/valley/jack rafters require individual true/projection lengths or reviewed external cut list, not an area/spacing proxy.

## T3 Stock length

Owner-confirmed timber stock grid: 1200, 1800, 2400, 3000 mm and onward in 600 mm increments, common to all suppliers. For positive lengthNeeded, choose max(1200, ceil(lengthNeeded / 600) × 600), subject to the selected product's maximum and availability. Exact 4200 remains 4200; 4200.1 becomes 4800; 500 becomes 1200. Reject non-positive input.

A product-specific availability list may remove unavailable grid lengths; select the next available grid length or report unavailable. It must not introduce off-grid lengths or another minimum/increment silently. Maximum length remains explicit: the grid does not imply unlimited availability. This timber rule does not alter 6500 mm aluminium, flashing policies or manufactured cladding sizes. Existing offcuts can be shorter than 1200 mm because they are not new timber purchases.

No fitting stock → unavailable. Retain the need and flag it. Never clamp down or automatically splice a structural member. No arbitrary 6 m stock maximum is imposed on all timber; handling limits are product/job fields.

Default one stock piece per structural member, with offcut reported. Optional simple cut allocation can share one stock length among complete short members; it never joins pieces into a structural member.

## T4 Stud wall assembly

Height modes are exclusive:
- entered finished stud-cut length; or
- entered frame height minus explicit bottom/top plate thicknesses and other approved deductions.

Base stations use T1. Openings have x-left/right, sill/head levels, trim/jamb/lintel design selections.

Do NOT use “base count minus floor(openingWidth/centres)” to determine a framing order. Generate actual stations:
1. Full-height studs strictly within the opening interval are removed from full-height demand.
2. Add below-sill/above-head pieces only when those subregions exist and the selected framing detail requires them.
3. Kings/jacks/trimmers, lintels, sills and support studs come from a reviewed detail or explicit quantities.
4. Reconcile coincident ordinary and king studs as one role-bearing member only when the detail permits; extra plies remain separate.
5. Corners, T-junctions, brace panels, point loads and hold-down posts are explicit additions.

Before opening details are complete, label output “base studs only; opening framing incomplete”. Do not fill unknown lintel or jack sizes with stock defaults. Manual BOM items can close the quantity requirement without claiming design validation.

## T5 Plates, blocking and noggins

Plates: measure run × explicit layers; split only at permitted supports/joints selected from the framing detail. A continuous top plate cannot be ordered as aggregate LM with unnoticed joints. Preserve separate top/bottom layer tags.

Noggins: derive clear bay width from adjacent centreline stations minus half each bordering member width, then allowances if specified. Number of rows is entered or selected from a reviewed framing detail; never inferred from cladding support spacing alone. Remove bays through openings and add returns separately.

Battens: use support-grid method B1 in 05, not a duplicate framing algorithm. Roof battens take a roof-plane slope dimension as distribution axis. Rafter spacing supports the battens; batten row spacing comes from the chosen roof covering/design. Do not confuse the two.

Trim: measured path segments plus explicitly entered mitre/end allowances. Stock allocation can pack complete trim pieces; visible join policy controls whether a long segment may be joined. No structural span lookup applies.

## T6 Simple cut allocation

Optional for trim, noggins and ordinary stock boards. Default OFF for long structural members and AAC/panel sheets.

Deterministic first-fit-decreasing: sort demanded cut lengths descending, then stable source ID; assign to earliest compatible stock with capacity, otherwise open the shortest permitted stock that fits. Include trim at stock ends and kerf between pieces. Record every cut allocation and leftover length. Call result “suggested cut plan”, not mathematically optimal.

A piece of length l with n cuts must not be packed by a total-length inequality alone if kerf/end trims consume the remainder. Return explicit placements. Do not mix grade/species/treatment/section/moisture/finish or factory-end requirements. Sharing across walls is optional; across jobs is outside first release.

Order waste policy chooses either explicit spare pieces OR percentage spares applied to the stock result, not both unnoticed. Cutting loss is already in consumed stock. Percentage is a user/company assumption, never disguised as a manufacturer's instruction.

## T7 Manual/count

Count markers can share one length or have per-marker length overrides; expose the latter as small labelled groups. Entered cut length still undergoes stock selection for timber. This differs intentionally from finished custom-flashing order length.

Allow quantity and stock length direct entry when the user already has a supplier cut list. Label length kind = orderedStock, bypass slope/allowance/rounding, preserve attachment/source. Never mix orderedStock and tight measured inputs without visible provenance.

## Span-table assistance

The supplied audit reports reusable lookup/gating code in Bestimator but only limited older MGP10 N1/N2 lintel/stud/jamb datasets, omitted from the portable audit. Rafter T29 and batten T32 data were absent. It also records a suspect T48 value (9005) and no independent source-cell verification. This pack did not validate those cells.

Reuse the interface and scope checks where useful; do not copy old LM roof estimates, default member-size strings, 300 mm rounding lists or unverified span data into the new tool.

Implement a nullable sizing provider:
input = memberRole, spans, support/bearing arrangement, spacing, roof/floor load widths, dead/live/point loads, wind, timber product/grade, restraint and relevant service conditions.
output = manual | supportedSelection | outOfScope | missingInput, plus source/edition/table/row/column and limitations.

Quantity tools work with manually specified members. An attached engineer/manufacturer schedule can establish size provenance. Never call a manual selection structurally verified. Missing sizing input must not silently select the “most onerous” column. Procurement readiness and structural validation are distinct statuses.

Automatic table selection is a later enabled capability only after correct/licensed data, scope and independent fixtures are available. Official Hyne/Wesbeam tools illustrate why loads and application matter [S01/S02]. No table cells are reproduced in this pack.


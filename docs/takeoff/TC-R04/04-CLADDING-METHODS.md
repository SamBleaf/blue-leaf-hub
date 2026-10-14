# Cladding calculation specification

Manufacturer facts are in catalogue-seed.json and 09. This document specifies proposed geometry and purchasing behaviour. All products require a particular orientation and installation assembly.

## C0 Wall model

Wall surface = local 2D coordinates (x along wall, y height), gross polygon, opening polygons, datum, floor/zone identity and dimension provenance.

Input paths:
- floor-plan run + entered rectangular height;
- floor-plan run + start/end heights (straight rake);
- gable: eaves height and apex x/height;
- calibrated elevation polygon with rectangular/polygon openings;
- manual dimensions/area.

Area = polygon area minus UNION of openings clipped to wall. Overlapping openings aren't deducted twice. Opening touching a boundary is valid; zero-sized, self-intersecting or fully outside openings require correction. Exclude non-clad boundaries explicitly.

Store gross area, opening area, net finish area, layout cut area, stock area, spares and purchase quantity separately. Floor-plan perimeter alone cannot tell us wall height, gables, window heights or split cladding zones.

Plan-derived surface and elevation-derived surface can represent the same wall: link them, don't add them as separate quantities.

## C1 Vertical sheets (Axon)

Select an exact SKU/height and effective cover from product data. Keep the sheet shiplap handedness and groove datum through cuts and reuse.

For a blank wall within one sheet height, count is ceil(coveredWallWidth/effectiveCover). Choose the shortest permitted height that contains the required cut plus explicit allowances. Wall boundary is the cladding boundary, not automatically slab-to-ceiling height.

For rakes, each vertical strip needs its maximum top extent within that strip; selecting height from its centre could under-order.

For openings, intersect each sheet cell with wall-minus-openings. A partly occupied cell still consumes a sheet by default. An entirely empty cell consumes none. Do not subtract fractional sheet equivalents from an area ratio.

First release default: no automatic cross-wall sheet-offcut reuse. Show potential offcuts separately. User-confirmed rectangular offcuts can be allocated only if dimensions, grain/groove direction, factory lap edges and minimum-piece/support constraints fit. Cut edges do not magically become shiplap edges.

Too tall for chosen stock: propose another listed height or require an explicit horizontal joint row/detail. A non-null “joint allowed” flag is not sufficient: instantiate multiple courses with separate panels, joint accessories, support and clearances. Never report one sheet per width when height needs two.

Datum alignment across adjacent walls is optional, explicit and visual. Keep a half-sheet/cut start when selected; quantity can increase. Corners do not automatically share or mirror laps.

## C2 Horizontal courses (Linea, horizontal Stria, timber boards)

Use effective cover, not nominal width. Generic conservative first-pass course count is ceil(cladHeight/cover). Provide visible base/top cut extents and allow reviewed starter geometry to refine layout; do not credit a full nominal first-board height unless the assembly defines its bottom/top details.

At each course:
1. Intersect the entire course band with the clad polygon minus openings.
2. Project surviving material onto its length axis. Only an opening spanning the full course band removes a horizontal interval. A partial-height opening requires a notched board; it does not save the whole interval.
3. Produce required cut segments, then divide only at permitted joints/supports.
4. Allocate compatible stock boards, retaining factory ends and joint rules.

A basic conservative order can assign ceil(segmentLength/stockLength) per segment with no leftover sharing, but only after the method establishes that the necessary joints are permitted. If no legal joint position exists, report needs-layout rather than assuming an arbitrary break.

Default no cross-course reuse until a cut plan explicitly allocates it. Optional deterministic 1D allocator reduces stock and lists each cut. Preserve minimum lengths, stagger requirements, joint exclusion near openings and required support positions as assembly predicates.

## C3 Vertical boards (Stria, timber)

Rotate the calculation axes, but independently choose the vertical installation assembly. Number of vertical columns is ceil(cladWidth/cover); each column's maximum required length follows wall/rake. Openings are treated by the full column band, analogous to C2.

Select complete stock length when available. Taller walls require a reviewed butt/horizontal-junction arrangement. Never presume vertical board joints are interchangeable with horizontal joints.

Mixed board widths: catalogue stores ordered repeating sequence of profile IDs, not an average cover alone. Count sequence positions and cut the last. First release supports a repeated sequence along one wall; arbitrary designer patterns can use manually placed panels.

## C4 Matrix expressed-joint grid

Record physical panel width/height, joint gap g, grid origin and boundary gap convention independently.

For n full panels in one axis without outer gaps, extent = n*p + (n-1)*g. Minimum count to span W is ceil((W+g)/(p+g)); trim boundary panels to the actual extent. The outer wall edge does not automatically receive an extra joint.

Width 2,390 with 1,190 panels and 10 gap fits two; width 2,400 requires a third strip or a changed design/stock format. Do not count a 1,190 panel as covering 1,200 at every outer edge.

Panel orientation can change only where that system permits. Apply the same occupied-cell logic to openings. Explicit joints create backing-strip/sealant/support demands. Never infer that a small cut strip is installable simply because it fits geometrically; edge-fixing and minimum-piece predicates must pass or need review.

Save the selected grid pattern in the order appendix. A square-metre total cannot describe the required panel purchase or appearance.

## C5 AAC panels

Separate manufacturers and wall systems. Seed catalogue supports Hebel PowerPanel50, Hebel PowerPanelXL and Walsc External Wall System 50 dimensions; no interchangeable “AAC standard” recipe.

Basic vertical panel layout uses actual panel width, chosen length and approved adhesive/joint width. Adhesive thickness is a system parameter, not automatically a 10 mm movement gap. Control joints break panels/supports per system detail.

First-release purchase mode: conservative whole-panel cells, no automatic offcut reuse, no inferred panel lintels and no structural span assumptions. Window heads/sills, panel horizontal installation, minimum cut strips, reinforcement cutting and supported/suspended configurations must have the exact assembly detail or reviewed manual component quantities.

Keep panels, support rails, adhesives, mesh, control-joint materials, cut reinforcement treatment and coating as separate outputs. Coating area is net finish area, not ordered panel area.

AAC full fixing tables are a known research gap (09). Build the rule selector and manual-reviewed configuration path now; do not seed an invented 600/1200 spacing as universal. Unreviewed spacing blocks an installation-verified assembly, not measurement entry.

## C6 Timber area-to-LM

For random-length supply and a supported joint system:
baseLM = netCladArea / effectiveCoverMetres.
orderLM = ceilToSupplierIncrement(baseLM × (1+wastePct/100)).
Require a known cover and supplier ordering unit. Example 24 m² / 0.12 m = 200 LM; 10% allowance gives 220 LM. These are arithmetic fixtures, not a recommendation that every job uses 10%.

An area-only result is an estimate until joint/minimum-length/opening constraints and purchase assumptions are reviewed. If fixed lengths or no-joint lengths are needed, use C2/C3 and order stock pieces instead. Do not present area-derived LM as an exact board count.

Owner confirms initial effective-cover choices of 70/90/120/140 mm. Effective cover remains a required editable supplier/product setting, independent of nominal section width. Save company presets and job snapshots; never deduct a further overlap from a value already entered as effective cover. A new supplier/profile must retain its own value; changing it previews recalculated LM and marks affected drafts stale.

## Openings, returns and waste

Opening deduction policies: geometry-based layout (default), no deduction (explicit conservative estimate), or manual reviewed allowance. Store the choice. Do not deduct opening area twice in both layout and waste formulas.

Reveals/soffits are separate surfaces if clad. Window perimeter does not automatically equal cladding area. Add reveal depth and selected edges.

Breakage/spares are separate from cut losses. Display “layout stock 12 sheets + 1 spare = 13”, not one opaque waste number. Pack rounding occurs last and only if the supplier requires full packs. Published pallet count alone is not a purchasing constraint.

Never pool incompatible SKUs, groove patterns, thickness, finish, species, grade, profile, orientation/end condition or suppliers' purchase units.


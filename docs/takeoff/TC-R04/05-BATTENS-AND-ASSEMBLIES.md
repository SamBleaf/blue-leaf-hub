# Supports, battens and accessory assemblies

An assembly is a versioned set of compatible products and quantity rules linked to the SAME wall geometry. The user selects an assembly once, then receives its outputs. No automatic claim that the wall is code compliant.

## Product-specific installation findings

Concise manufacturer evidence summaries; exact guides and locations are in 09. These are deliberately scoped and do not replace the manuals.

| Product | Sourced system distinction | Required rule selectors |
|---|---|---|
| Axon [H02] | Vertical direct or cavity installation. Guide includes 70×19×3000 Hardie Cavity Batten and 70×35 timber options. Its support limits vary with wind; Table 1 lists 600 mm for N1–N4, 450 for N5, 300 for N6, with separate fastener/off-stud conditions. | Wind, substrate, direct/cavity, batten type, on/off-stud, fixing family, opening/joint detail. Do not use support spacing as batten-to-frame fixing pitch. |
| Linea [H04] | Direct/cavity options; cavity battens include Hardie Cavity Batten or minimum MGP10 70×35 timber. Tables 2–4 separate support spacing, batten span and fixing conditions. N1–N3/C1 support maximum is 600 mm; higher categories change edge zones/cavity eligibility. | Wind, edge zone, substrate, batten/span/fixing option, starter/corner choice. |
| Stria horizontal [H06] | Direct fix or vertical cavity battens, including 70×35 timber; tables distinguish 325 and 405 profiles and concealed/face fixing. Top/bottom courses have additional fixing requirements. | Width/finish, wind, edge zone, substrate, batten, fixing style and end-course rules. |
| Stria vertical [H07/H08] | Hardie Structural Batten forms the horizontal drained support. It is a distinct castellated 70×35×2700 H3 product, not ordinary timber interchangeably. Concealed N1/N2 table allows 600 mm studs and battens; face-fix tables differ. Small-wall and batten-joint conditions apply. | Width/finish, face/concealed, wind, substrate, batten jointing and narrow-wall conditions. |
| Matrix [H10] | Cavity battens required; 10 mm expressed joints and horizontal backing strips. Table 1 ties wind/fixing family to spacing. Non-brad N1–N3/C1: supports 600, batten fixings 300, panel fixings 200 mm, with off-stud provisos. | Wind, on/off-stud, fastener family, panel grid, edge details and horizontal joints. |
| AAC [A01–A05] | Brand/system-specific panels, rails and fixing assemblies. Public accessories/product pages are not complete fixing-table authority. | Manufacturer/system, thickness, orientation, supported/suspended storey, wind/edge zone, frame, rail code, connections and movement joints. Current exact rows pending review. |
| Pentarch timber [T01] | Horizontal cladding: vertical cavity battens; recommended 64×19 hardwood, minimum 45×19 support dimensions. Vertical: recommended 70×35 hardwood supports spanning at least three studs, sloped tops and approx. 5 mm packers. Ordinary butt joints need support/double battens. | Profile/species/grade, orientation, support/fastening detail, joint type, drainage route. |
| Trendplank [T02/T03] | End matching enables off-support joining for that product. Current guide calls for a continuous 20 mm air/drainage cavity; this is not the same recipe as every generic shiplap. | Exact profile/species/finish, matching ends, support detail, cavity continuity and minimum lengths. |

Do not turn this table into unrestricted automatic installation presets. Candidate conditions are evidence leads. Before enabling a numerical row, transcribe and review its complete headers, notes, fastener family and applicability as specified in 06/09.

## B1 Support geometry

Represent each layer independently:
- primary supports fixed to structural frame;
- secondary/counterbattens if the selected assembly requires them;
- panel-joint supports;
- opening perimeter supports;
- terminal/corner supports;
- optional existing supports marked not-to-purchase.

Each layer has orientation, section/product, max spacing, start/end centreline offsets, support-span limit, attachment targets, fixed required stations, joint policy, drainage breaks and source row.

For a blank rectangle:
vertical count = ceil((W-a-b)/spacing)+1, length each = H minus top/bottom cuts;
horizontal count = ceil((H-a-b)/spacing)+1, length each = W minus side cuts.
This is a quantity primitive only. Real offsets must come from the selected detail.

For required stations: start with wall ends, panel joints and other mandatory supports. For each consecutive required station interval insert enough intermediate stations that no gap exceeds the allowed maximum. Preserve selected fixed-centres phase when feasible; report incompatible constraints rather than snapping away a panel joint. Intersect lines with the wall polygon/openings to obtain actual pieces.

At rakes, clip to the wall polygon, so lengths vary. An opening can split a support into upper/lower pieces. Add jamb/head/sill members required by the detail, deduplicating only identical physical members in the same layer and scope.

Existing studs are supports, not automatically extra purchased battens. A cavity layer is separate even when coincident in plan. Two adjoining panels may share one support if width/fastener edge distances permit; otherwise require double/wider support.

## B2 Corners, edges and wind zones

Represent corner edge zones as wall intervals tagged with the applicable rule. A zone width belongs to a sourced rule, not a universal global constant.

Use zone-specific spacing in affected intervals and preserve a safe support at transitions. Return the actual stations, not just a weighted LM factor. Each row selects BOTH support pitch and fixing configuration; bracketed alternatives are indivisible combinations.

Window jambs are not automatically building corner zones. Separate opening perimeter detail from external-corner wind zone. Do not infer wind classification from suburb alone.

## B3 Rail/batten procurement

Clip and split required supports at approved joints, then allocate stock. If permitted stock is shorter than required run and no joint rule exists, show needs-joint-detail. Quantities cannot be reduced just by dividing summed LM by stock length.

Control/floor movement joints are tagged breaks; do not bridge them with continuous support where prohibited. For narrow strips/walls, minimum spans/attachment counts may govern despite small overall quantity.

Unknown AAC rail spacing: allow a reviewed designer/supplier rail layout or entered per-wall rail count/length. Label its authority; no invented automatic default.

## B4 Fasteners

Two independent demands:
1. support-to-frame intersections or along-support fixing pitch;
2. cladding-to-support intersections or panel-edge pitch.

Count by actual geometry and selected rule. For a line of usable fixing length U, endpoint-aware n=ceil(U/pitch)+1 when both endpoints must be fixed. Edge offsets, corner omissions, per-intersection multiplicity and extra terminal fixings come from the row. Do not apply this generic formula where the guide prescribes a special pattern.

Order boxes = ceil(total required fixings × (1+explicit spareRate) / boxSize). Aggregate compatible fixings across selected job scope before box rounding. Keep corrosion/material/length/head and substrate compatibility in purchase identity.

If fixing specification is incomplete, output “fixings not quantified — detail required”, not zero. Cladding-only order can proceed when explicitly chosen, with omitted scopes recorded.

## B5 Accessory quantities

| Component | Measurement basis | Ordering treatment |
|---|---|---|
| Starter/base trim | Selected wall base intervals, less doors where detail excludes them | Actual cut lengths and permitted overlaps; stock pieces |
| Cavity vents/closers | Assembly-selected base/top/opening edges | Keep ventilation and insect/ember specification; no generic perforation inference |
| Internal/external corner trims | Tagged corner heights, including chosen returns | Separate corner types; deduplicate shared corner IDs |
| Horizontal joint/backing strips | Actual layout joint segments | Gap/overlap/end-cut rule; stock lengths |
| Vertical joint trims | Chosen product-joint locations | Actual segments; not every groove |
| Head/sill/jamb flashing | Opening edges and explicit extensions/returns | Link reviewed flashing profile template; produce draft child flashing demand |
| Membrane | Wall coverage envelope plus laps/returns, chosen orientation | Roll layout or transparent gross-area estimate; opening deduction independent of cladding |
| Tape | Relevant membrane seams and opening perimeter/returns | Roll length plus explicit allowance |
| Sealant | Named bead routes × bead count × specified cross-section | Volume and cartridge yield, not arbitrary tubes per wall |
| AAC adhesive | Approved joint geometry or published consumption | Bags from reviewed yield; don't mix with movement-joint sealant |
| Mesh/render | Selected coating system: wall area and joint strips as applicable | Avoid counting full mesh and equivalent joint strips twice |
| Cut-end primer/protection | Product requirement plus reviewed yield/entered quantity | No invented precise usage where yield is unknown |

Sealant geometric check: V_ml = area_mm² × routeLength_mm / 1000. A round 6 mm bead over 10 m uses about 282.743 ml before wastage. Treat real extrusion/application yield as a separate factor. Primer/adhesive/coating rates remain source-dependent.

Membrane example logic: whole-wall cutout should not be assumed removed at windows because wrapping reveals needs material. Store its own opening and lap policy. Quantity-estimate mode may use gross area × allowance; exact roll mode uses course width, overlap and roll length, preserving cut loss.

## B6 Flashing integration and ownership

Creating accessory flashing produces a child demand with wall/opening source IDs, chosen profile revision and length kind. A head length already including returns/ends is finished/dimensioned; do not then add the flashing measured-run +200 again. If generated as a tight measured run, apply that rule exactly once and explain it.

Generated children are regenerated, not appended, when wall geometry changes. Manual overrides become reviewable differences. A manually measured equivalent can be linked/replaced by user choice; never silently double-count it.

The user chooses Include / By others / Exclude with reason for each accessory group. Unknown required quantity is unresolved, not excluded. Overall assembly readiness records missing and omitted groups.


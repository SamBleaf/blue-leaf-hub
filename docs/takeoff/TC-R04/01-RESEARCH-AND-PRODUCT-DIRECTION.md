# Research and product direction

Sources are identified in 09. These are documented feature comparisons, not hands-on competitive trials or user-review surveys. Limitations below are design risks inferred from the workflows, not claims that competitors lack undocumented features.

| Application/source | Useful documented capability | What Hub should take from it | What to avoid in this build |
|---|---|---|---|
| Buildxact recipes [APP01] | Grouped items driven by takeoff quantities, reusable recipe catalogues. | One wall can produce cladding, supports, trims and wrap through a named assembly. | Hiding a product-specific setout behind a single area multiplier. |
| STACK assemblies [APP02] | Items with coverage/custom formula variables, including waste, convert measurements into material quantities. | Explicit measurement units and inputs; reusable product rules. | User-maintained free-form formulas and unexplained rounding in the onsite flow. |
| Bluebeam measurements [APP03] | Separate X/Y scales, page/viewports, count, length, area and wall measurements. | Page/region-specific calibration and explicit measurement roles. | Reproducing a desktop toolbar with dozens of choices on a phone. |
| Mortlock manufacturer takeoff offer [T03] | Plans/specifications can drive a supplier BOQ. | Export an annotated takeoff with assumptions that suppliers can check. | Treating a supplier quote as proof of installed quantity or structural suitability. |

Flash.it remains the owner's interaction reference from the flashing phase. This research does not claim a fresh hands-on Flash.it evaluation.

## Main findings and resulting decisions

1. Product + orientation + installation system is the unit of reuse. Selecting vertical Stria must not inherit a horizontal cladding support recipe.
2. Gross area, net area, layout consumption and purchased stock are different quantities. Show them separately.
3. Openings remove surface area, but a small window does not necessarily save a whole sheet. Orders must follow a simple visible sheet/course layout.
4. Timber width and effective cover must be separate. The owner confirms 70/90/120/140 mm as initial effective-cover options. Save effective cover per supplier/product; these values are editable, not universal profile dimensions.
5. End matching matters. It can permit off-support joints for a specified product; ordinary cut/butt joints may not. Keep factory end condition on reusable offcuts.
6. Batten count depends on layout, edges, joints, openings, wind conditions and supports. Area divided by spacing is a rough estimate, not an installation-ready cut list.
7. Owner-confirmed timber ordering grid: 1200 mm minimum, then 600 mm increments for all suppliers. Product availability can restrict the grid but does not redefine it. Other material families keep their own stock policies.
8. Rafter true length and structural span are separate. Order length includes cuts/overhangs/allowances; structural selection has its own load and support inputs.
9. Current guides change. Freeze exact guide/rule versions on job copies and orders; offer reviewed updates instead of silently recalculating historical jobs.
10. The app must expose why it counted something. Tapping a schedule row highlights source walls/members and the calculation.

## Simplicity boundary

Build geometry first: straight runs, polygon areas, wall rectangles/rakes, rectangular openings, repeated members, regular panel/course grids, manual overrides with reasons.

Do not start with 3D BIM, AI plan interpretation, arbitrary curved surfaces, automatic structural engineering, global multi-job cut optimisation or a generic spreadsheet formula language. Complex shapes use explicit segments or entered quantities with provenance.

A small generic engine with product-specific data is enough. A universal area-factor engine is not.


# R03 — confirmed company settings and Rendex foam

These decisions supersede earlier R01 assumptions. No repeat owner confirmation is needed.

## Walsc and Rendex

Walsc is the preferred AAC brand. Retain existing Walsc50 quantity seeds, but require selection of actual system/thickness; brand preference alone does not approve a panel for every use. Keep other researched brands available as alternatives.

Add Rendex EPS foam cladding as a distinct family. Reuse wall/opening geometry and sheet_layout@2; do not reuse AAC support, cutting, jointing or consumable recipes. The official Rendex site identifies direct/cavity options and provides system and coating documents [F01/F02]. Product dimensions, selected support and fastening rows must be taken from the exact current system document or entered reviewed job detail. This revision does not invent sheet dimensions, fixing counts or coating yields.

Rendex product/assembly setup requires:
- exact product and sheet width/length/thickness;
- factory-coated versus applicator-coated system;
- permitted orientation and cut-edge/reuse conditions;
- direct/cavity route, support layers and selected installation conditions;
- joint/control-joint layout, base/starter and opening/return details;
- fixing/washer specification and quantity rule;
- selected wrap, joint foam, mesh, basecoat and finish scope with sourced yields.

Use existing occupied-sheet layout for conservative panel quantities. Cutting out a window does not automatically save an entire sheet. Reuse panel offcuts only with an explicit compatible two-dimensional allocation and permitted edge/joint details; aluminium's one-dimensional bar allocator cannot prove sheet reuse. Initial conservative sheet allocation is acceptable.

Accessories follow actual routes/surfaces: starters from relevant base runs; corner beads from tagged corners; joint treatments from panel joints; opening details from opening edges; mesh and coatings from their independently selected coverage policies. Distinguish existing factory coating from site-applied treatment to prevent double ordering. Unknown yields produce an unresolved row or reviewed manual quantity, never zero. Do not inherit AAC adhesive or rail quantities.

Automatic installation presets remain source-pending until exact guide rows are reviewed. Measuring, sheet quantities and reviewed manual accessory quantities remain usable. The catalogue UI must expose missing product parameters before calculating and missing installation parameters before claiming installation verification.

## Timber cover

Seed effective-cover choices70/90/120/140 mm. Save the selected value per supplier/product/profile; allow other positive values. Nominal width is a separate field. Calculations use effective cover directly, never subtract an overlap twice. A supplier change must load or require that supplier's product cover, not blindly retain another product's value. Job overrides are explicit snapshots.

Example:24 m² at120 mm cover gives200 LM; at90 mm gives266.666… LM before spares and ordering conversion. Supplier/product change recalculates and invalidates affected draft allocations. Previously frozen orders remain unchanged.

## Timber stock

For new timber purchases, allowed grid is1200 +600n mm for integer n≥0. A required single piece L>0 rounds to max(1200,ceil(L/600)×600), then respects available product maximum/any unavailable grid sizes. Availability restrictions may skip a size, not invent off-grid options. No join is introduced to overcome a maximum unless the item's own joint policy explicitly permits it.

Finished cut lengths do not change to the stock length. Example500 mm cut orders1200 mm if buying a new length; an existing compatible offcut can satisfy it without a new purchase. Aluminium retains6500 mm stock and manufactured cladding boards retain product sizes. Timber end allowances remain separate and are applied once before stock selection.

## Acceptance additions

- Need500 or1199 mm →1200 mm new stock;1200→1200;1200.1→1800;1800→1800;1800.1→2400.
- Need4801 with product maximum4800 → unavailable, no clamping or silent splice.
- Same timber settings at two suppliers yield the same1200/600 stock grid.
- Cover120→90 changes24 m² from200 LM to266.666… LM; no duplicate lap deduction.
- Rendex selection cannot inherit Walsc rails/adhesive or treat a panel offcut as a linear angle offcut.
- Factory-coated/applicator-coated recipes have independent scope; missing current guide values stay unresolved.
- Aluminium11 acceptance and all earlier regression checks remain required.

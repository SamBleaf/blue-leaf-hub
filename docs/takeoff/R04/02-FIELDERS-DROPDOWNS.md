# Fielders material research and dropdown contract

Checked14 October2026. Sources below are official Fielders pages. This is the relevant published range found for the flashing UI, NOT a claim of an exhaustive, current SA custom-folding stock matrix. The public pages mix product-specific and older specification tables; availability by branch/coil/colour must remain explicit.

## Dropdown layout

Use separate sections:
1. Construction: Solid / Perforated.
2. Material / finish: grouped painted and unpainted options below.
3. Thickness: mm BMT, dependent on selected product/finish and evidence; default0.55 for Blue Leaf's customary flashing, as instructed by Sam.
4. Colour: dependent on painted finish; hidden/not applicable for unpainted.
5. Perforation details: only when Perforated is selected; code/pattern, hole size, pitch and extent/legs. Advanced pattern controls can stay collapsed behind the chosen preset.

'Perforated' describes the sheet construction, not an alternative to COLORBOND or ZINCALUME. A perforated flashing still needs its base material, thickness and finish.

## Material/finish choices

Painted: COLORBOND standard; COLORBOND Matt; COLORBOND Metallic; COLORBOND Ultra; SUPERDURA Stainless (painted specialist product).
Unpainted: ZINCALUME; Galvanised; Heritage Galvanised.
Other/custom: manual specification with supplier confirmation, rather than inventing a Fielders aluminium/copper/bare-stainless flashing catalogue.

These families are documented across sourcesS1/S3/S4; documented FAMILY is distinct from a confirmed custom-flashing gauge/colour combination.

## Thickness evidence, strictly by scope

| Published product scope | Material | Published BMT | Treatment in catalogue |
|---|---|---|---|
| Cappings tableS1 | ZINCALUME |0.50mm| Documented capping option; custom folding availability unconfirmed |
| Cappings tableS1 | COLORBOND standard |0.50mm| Same limitation |
| Cappings tableS1 | COLORBOND Ultra |0.55mm| Same limitation |
| Cappings tableS1 | SUPERDURA Stainless |0.45mm| Same limitation |
| Cappings tableS1 | Heritage Galvanised |0.50mm| Same limitation |
|350mm roll-top ridge noteS1| ZINCALUME/COLORBOND |0.42mm G550| Specific ridge product, not a generic custom-flashing default |
|S-Rib perforatedS2| ZINCALUME or COLORBOND Surfmist |0.48mm| Corrugated product evidence ONLY; do not seed as a confirmed flat-folded flashing |
|Blue Leaf owner preference| COLORBOND flashing |0.55mm| Company default, retained; not mislabelled as sourced full Fielders matrix |

S1 gives SA-specific drawing dimensions and asks users to check state-specific details. Do not silently replace Sam's0.55 default with0.50 because a capping table lists it. Keep numerical values/evidence separate from availability.

For Matt/Metallic and general Galvanised custom folded/perforated work, this search did not establish a definitive full thickness list. Their thickness dropdown can offer the company selection and custom entry clearly labelled 'Confirm with supplier', while a supplier-maintained verified matrix is added later. Do not populate every finish with0.42/0.48/0.55/0.75 merely because those numbers occur elsewhere in roofing literature.

## Perforation evidence and limits

S2 describes perforated S-Rib:0.48 BMT, ZINCALUME or Surfmist COLORBOND,2.38mm holes at6.74mm pitch,11% open area, other combinations on request. This supports offering perforation as a configurable product attribute, but does not prove those settings are available for flat custom flashings. Do not set those numbers as universal flat-flashing defaults or claim a vent/fire rating.

For an order-ready perforated flashing require either a supplier-confirmed product code/preset, or sufficient explicit pattern and extent dimensions for a supplier to quote/confirm. A draft can say 'Perforation to be confirmed'; a fabrication-ready PDF must not simply say 'perforated' with no further definition. Any supplier confirmation can be entered manually; no automated contact required.

## Colours

S3 currently lists22 Classic colours, including Bluegum and excluding Mangrove from that published Classic list. Existing code instead suggests Mangrove and omits Bluegum. Retain legacy/custom selections without silently rewriting them; update selectable sourced palettes.

Classic: Surfmist, Shale Grey, Windspray, Basalt, Classic Cream, Manor Red, Woodland Grey, Monument, Jasper, Night Sky, Dover White, Southerly, Bluegum, Paperbark, Evening Haze, Dune, Gully, Wallaby, Pale Eucalypt, Cottage Green, Ironstone, Deep Ocean.
Matt: Surfmist, Dune, Shale Grey, Bluegum, Basalt, Monument.
Ultra: Surfmist, Shale Grey, Windspray, Dune, Wallaby, Woodland Grey, Monument.
Metallic: Galactic, Cosmic, Rhea, Astro, Aries, Celestian.

These are the published finish palettes, not proof each is supplied for every flashing/perforation. Swatches are indicative; no invented supplier colour codes.

## Data contract and migration compatibility

Recommended additions within validated spec JSON (rename to match conventions):
- construction: solid | perforated
- materialFamily / finishVariant with stable IDs plus display labels
- thicknessMm and thicknessBasis=BMT (or preserve current bmt consistently)
- colour applicability, colour identity/name/code
- perforation: supplierProductCode OR defined pattern/hole size/pitch, extent=all|selected_legs, selected leg IDs and optional explicit solid margins
- sourceRecord/version, evidenceScope and supplierAvailabilityStatus

Include all fabrication-relevant fields in materialSpecKey, preset/job copies, order snapshots and PDFs. A supplier code can stand in for a detailed perforation definition only when its meaning is recorded and immutable at export. New fields must survive cleanSpec; adding UI controls alone currently loses them.

Legacy missing construction means solid. Do not change old frozen exports or their hashes. Recompute drafts under an explicit new calculation/spec version and show stale orders when identities change. Missing new fields in historic records need backwards-compatible display.

## Official sources

S1 — Fielders Cappings, table RGA C AM001 and roll-top note:
https://specifying.fielders.com.au/roofing-walling/rainwater-goods-and-accessories/cappings/

S2 — Fielders S-Rib Corrugated Non-Cyclonic, Perforated Metal section:
https://specifying.fielders.com.au/roofing-walling/non-cyclonic/s-rib-corrugated-non-cyclonic/

S3 — Fielders current web finish/colour listing (Endurance page, Finishes & Colours):
https://fielders.com.au/brands/endurance

S4 — Fielders Roofing/Walling manual, Materials and Finishes:
https://specifying.fielders.com.au/roofing-walling/about/

S5 — Fielders Flashing Order Guide (dimensions, angles and colour side):
https://specifying.fielders.com.au/roofing-walling/design-data/flashing-order-guide/

## Remaining supplier data, not a blocker to the UI build

A current Fielders SA folded-flashing/flat-perforated order sheet would settle the exact product×finish×BMT×colour combinations and standard perforation codes. Do not claim research found this complete matrix. Finish the configurable dropdown implementation now, keeping uncertain combinations marked for confirmation.

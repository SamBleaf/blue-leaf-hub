# Screens and interaction contract

Reuse the Hub blue/white visual language and R04 auto-apply/undo behaviour. All valid ordinary edits apply immediately; invalid input remains a recoverable draft. A tap on Back navigates; a curved Undo arrow undoes. Do not reinstate Apply/Save for each parameter.

## 1. Job takeoff

Plans | Takeoff | Schedule remain shared across material types.

Within Takeoff show clear Add flashing, Add timber and Add cladding actions. The flashing screen keeps Add flashing, not generic Add material. Search/saved templates sit inside the relevant picker.

Material list: name, purpose/product, measured progress, order quantity and unresolved requirements. Filter layers by material, wall/elevation and floor; colour denotes measurement layer, not supplier finish.

## 2. Add timber

First choose purpose: Rafters / Joists / Studs / Plates / Noggins / Battens / Trim / Other member.

Compact setup card:
- Section and grade/treatment or choose saved stock item.
- Method appropriate to purpose.
- Centres when repeated.
- Length source: measure projection / measure true length / enter cut length.
- Pitch appears only for projected rafter lengths.
- Timber stock starts at 1200 mm and increases by 600 mm; show product maximum and any unavailable lengths.
- More: end offsets, trim allowance, endpoint inclusion, plies, supplier, source reference.

Rafter flow: set purpose/centres → measure one member across roof slope direction → enter pitch → draw distribution run → see tick marks and count → review lengths. The app labels the member line and distribution line distinctly; distribution is not roof perimeter.

Stud flow: trace wall → enter wall or stud-cut height → enter plate build-up if wall height → mark openings or add reviewed extras → inspect members. Do not describe base repeated studs as a complete framing package.

Tap a repeated-member tick to remove/duplicate or override that member's length. Overrides remain tied to source station and become stale if regeneration cannot preserve their identity safely.

## 3. Add cladding

Choose product/profile → orientation → installation assembly.

Setup sheet shows only:
- Product size/cover and chosen stock.
- Wall height or elevation measurement source.
- Direct fix/cavity assembly and support settings.
- Waste/spare policy.
- A compact “Needs…” row only for unresolved inputs.

Then measure the wall run on the floor plan. A small generated elevation opens automatically: horizontal wall length × entered heights. It is a setout aid, clearly labelled “Derived from plan + entered heights”, not a surveyed elevation.

Add opening by tapping its approximate wall position then entering width, height, sill height and horizontal offset. Drag adjusts visually; numeric values remain authoritative. Users can instead open a calibrated elevation page and trace wall polygon/openings there.

For a sloping top, enter start/end height. For a gable, enter eaves/apex or trace an elevation; no roof pitch inferred from a floor plan.

## 4. Layout review

Three contextual views: Cladding | Supports | Accessories. Only one shown at a time.

- Cladding: sheet boundaries/course lines, cut parts, openings, datum and remaining strips.
- Supports: rails/battens with stock lengths, required joint supports and opening returns.
- Accessories: selected boundaries, joints and trims.

Tap a panel/board to see stock selection and cut size. Move datum numerically or drag with snap. Default origin is the wall start/base; do not secretly centre or rebalance panels. Changing datum previews quantity change.

Openings retain their own border detail; selecting an opening exposes head/sill/jamb lengths and reviewed flashing template links.

For jobs measured only as total area: allow quick timber LM estimate. For panel/course-based products, clearly label it budget estimate and prompt for wall dimensions before generating an exact layout order.

## 5. Material/rule editor

Company catalogue: Add product → choose existing method → define dimensions/cover/stock → choose or duplicate assembly → source/review → save company version.

Builders can make job-only overrides. Publishing a company standard is explicit. No code or expression fields are shown. A genuinely new calculation method is a development extension, not something an admin can implement with an unvalidated formula.

Separate tabs for Product, Ordering and Installation only in the advanced catalogue editor. Routine users see the resulting concise preset.

## 6. Schedule and supplier order

Show needed pieces, selected stock, reusable offcuts actually allocated, added spares, total ordered and previously placed quantities. Group physically interchangeable products only.

Sheet order: SKU/dimensions × quantity, optional wall labels. Timber: species/grade/treatment/section/stock length × quantity. Random-length timber: total LM plus minimum-length/joint requirements; never claim known piece counts.

Review summary shows omitted/by-others accessory scopes. Supplier PDF remains concise; detailed cutting/setout schedule is a separate appendix. User can export both.

## Phone quality requirements

Minimum 44 CSS-pixel touch targets; endpoint loupe; no hover-only controls. Preserve zoom while editing. One-finger drawing plus established pan mode and two-finger pan/zoom must not conflict. Keyboard cannot cover active numeric field or result. New drafts recover before setup is complete. Autosave acknowledges server state accurately.

Large PDFs use existing page rendering and viewport transform. Do not render every elevation and every support for the entire job at once. Show selected wall only; compute in worker/chunks when needed and retain last valid result while recalculating.

## Example ordinary flows

Rafters: “90 × 45, manual size; 600 centres; 27°; measure member; measure run” → count and stock lengths.

Axon: choose profile/height and assembly; tap wall endpoints; add openings; view sheets; review order.

Timber cladding: select verified effective cover and end-joint system; trace walls and openings; get LM; include supports and trims from chosen assembly.

Repeat setup from last-used job template, but do not silently reuse wind class, heights or assembly approvals from another job.


# Short plates cut from full 6.0 m sticks (takeoff-calc@9)

Rule (Sam, 18 Nov 2026): "plates that are under 3 metres long get tallied up and then divided by 6 metres so we can ensure that we get all of the short plate lengths out of just full 6 metre sticks, with some waste."

## Rule
- Applies to the Walls item only: every top, bottom and second-top plate piece with a required length under 3,000 mm, after the plate join rule (a long wall is joined over studs first; LVL long plates are never pooled).
- Pooled across the whole Walls item (every wall), per plate product (section, grade, treatment, species, supplier).
- Packed into 6,000 mm sticks with the shared allocator `allocateLinear` (first-fit-decreasing, then branch-and-bound for fewer sticks), 5 mm saw cut per cut, pieces share sticks.
- Ordered as ONE line of plates at 6.0 (supplier order: "9/6" under T&B PLATES), with a stick-by-stick cut list (cuts, saw cuts, offcut left).
- Waste = the offcuts. No extra percentage by default. Walls card > More > "Spare plate sticks" (rules.shortPlateSparePct, 0 default, capped at 100) adds ceil(sticks x %) sticks, shown as spare.
- A plate of 3,000 mm or more keeps today's behaviour (its own grid length).
- Product longest length under 6,000 (or 6,000 marked not stocked): sticks are its longest available length under 6,000; the line says so.

## What changes
- engine/dispatch.js `purchaseLines`: short plates are removed from the normal allocation, copied with identity `shortPlates: true`, a fixed-stick policy (kerf 5, share pieces) and allocated as their own group; the result groups are merged. Own line, own cut list ("Short plates cut list (pooled into full sticks)", with `sticks`).
- supplierOrder.js is unchanged: it already groups lines by role and stock length.
- takeoffPdf.mjs: site appendix prints each stick. tools.js: Walls line says "12 short plates from 4 x 6.0 m sticks". FamilySetup.jsx: the More setting.
- CALCULATION_VERSION takeoff-calc@8 to @9.

## What was found (the old rule)
`allocateWithShortSharing` (dispatch.js) shares only MGP10 pieces under 1,200 mm (noggins, cripples, trimmers) into the leftovers of bought stud/plate lengths. Plates 1,200 mm and over were one stock length each (grid), never shared. Plate sticks are no longer an offer for those short pieces, because pooled sticks are not in the first allocation step. Studs, noggins, blocks and trimmers are unchanged and still draw leftovers from stud and over-3 m plate lengths.

## Worked example
Walls 2950, 2400, 1800, 1200, 900, 600 (each wall = bottom + top plate): 12 pieces, 19,700 mm + 12 x 5 = 60 mm saw cuts = 19,760 mm. 19,760 / 6,000 = 3.3, so 4 sticks (24,000 mm), offcut 24,000 - 19,760 = 4,240 mm. Before: 12 separate lengths (2 x 3000, 2400, 1800, 1200, 1200, 1200 = 21,600 mm of stock); now 4 x 6.0 (24,000 mm of stock, 4,240 mm of offcut, fewer pieces to handle).

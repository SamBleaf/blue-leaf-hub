# Floor P3 – Hebel PowerFloor and Scyon Secura accessory recipes

Planning only. No app code. Sources: CSR Hebel 75mm PowerFloor Design and Installation Guide (HELIT017) and James Hardie Scyon Secura Interior Flooring Installation Guide (June 2020).

Page refs are **PDF page numbers**. The printed number is PDF-2 for Hebel and PDF-1 for Scyon.
Confidence key: **S** = stated in guide, **D** = derived from a stated spacing (working shown), **A** = assumption, Sam/supplier to confirm.

## 1. Sam's rules vs the guides

| Rule | Verdict |
|---|---|
| Hebel panel 1800 x 600 (x 75) | **Confirmed**, 56 kg max per panel (Hebel p7). Only 75 mm is covered. |
| Hebel stagger 600-900 "by centres" | **Corrected.** The guide says min overlap of **one joist space and not less than 450 mm** (p7, p13, p19). So 450 at 450 centres and 600 at 600 centres; 900 is allowed but not required. A 600 stagger passes at both centres. Staggering is not needed where full-length panels avoid joints (p7). |
| Hebel end joints on a joist | **Confirmed.** Panels start and finish on a joist and are joined on a joist (p9). Butt joint = 2 x 5 mm beads, screws optional (p8, p19). End support is drawn as double joists (p20, p22). |
| Hebel cut limits (not in your rules) | Min cut width **270**; min cut length **2 x joist spacing**, so 900 at 450 centres and 1200 at 600 (p7). |
| Scyon 2700x600x19 at 450 | **Confirmed.** Also 900x1800x19 at 450 and 2400x600x22 at 600 (Scyon p2, Table 1 p3). |
| Scyon 22 mm at 450 | OK. Table 1 gives 600 as the *max*. Table 2 (commercial) covers 22 mm at 450 and 600 (p3). |
| Scyon "cut to 900/1800" | 900x1800 is a stock size (p2). 2700 = 900 + 1800 if cut. |
| Scyon joints >= 600 apart | **Not in the guide.** It says only "staggered" with short edges fully supported on joists (brick pattern, p3). The 600 is Sam's rule (A). It is safe because it exceeds one 450 bay. |
| Min support width | Both guides need **45 mm**. See the 35 mm chord section. |

### 35 mm truss chord
- **Scyon:** "Floor joist must be a nominal of 45mm wide" (p3). Exceptions are narrow timber I-joists min 40 mm and solid LVL min 42 mm. Table 3 shows "min 4mm" for timber joists, an apparent typo for 45. Nothing is allowed at 35.
- **Hebel:** joist/flange min width 45 mm (p8), shown as "45mm min" in Figs 3.3.1.3-6 (p20). Blocking is also min 45 (p9).
- **Consequence:** a 35 mm chord fails both guides as written. Neither guide offers a doubled-chord, packer or sistered alternative. One Hebel figure shows double joists at panel ends (p20). The guides do not say that a doubled 35 gives a valid "45". **Needs a written position from CSR Hebel / James Hardie technical, or truss manufacturer's top-chord detail.** The takeoff should flag any chord < 45 on a Hebel or Scyon floor.

## 2. Product rules

### Hebel PowerFloor 75 mm (p7-10, 13, 19-22)
- **Size:** 1800 x 600 x 75, tongue and groove on long edges. Joist centres 300/450/600 only (p8). Joists must be 600 max for the standard fixing layout (p19).
- **Direction:** panels span across joists, with joists under the 1800 length (Fig 3.3.1.1-2, p19). Stretcher bond (p13).
- **Fit:** 1800 = 3 x 600 = 4 x 450, so full panels land ends-on-joist at both centres.
- **Edge support:** panel edges at walls need blocking (p22). Max panel overhang is 10 mm (p22, p24). Notching is not permitted in panels < 400 wide (p26). Penetrations above 80 mm need blocking/trimming (p9, p26).
- **Control joints:** typically at max 6000 mm spacing, over lines of support, and at changes of joist direction. Joint is min 5 mm with backing rod and sealant (p9, p21).
- **Perimeter gap:** designer to specify (p10). Gaps at openings, penetrations and control joints are caulked with flexible polyurethane (p8).
- **Wet areas:** all wet areas need a waterproof membrane over the panel, nominated by the designer and installed to its maker's instructions (p9). Detail on p26.

### Scyon Secura Interior 19/22 mm (p2-4)
- **Sizes:** 600x2700x19 (450 max), 900x1800x19 (450 max), 600x2400x22 (600 max). Packs of 20 (p2).
- **Direction:** sheets run across joists, short edges fully supported on joists, staggered (p3). Tiled: label "This side DOWN for TILES" faces down. Vinyl: "UP for VINYL".
- **Short-end gap:** the guide says "may or may not need a gap", and that creep over many sheets may need extra joists (p3 Note 2). No dimension is given.
- **Wet area butts (tiled):** 2 mm gap filled and spread with James Hardie joint sealant (p3 Fig 6).
- **Perimeter:** about 3 mm from walls and projections (p4 Figs 8-9).
- **Control joints (tiled only):** needed where the long-sheet dimension is over **5.4 m**. For 22 mm, every 4.8 m is more practical. Use a 5 mm joint, 10 mm backing rod and flexible sealant (p4 Fig 10). Not needed under vinyl or carpet.
- **Wet areas:** read with James Hardie's Wet Area guide, AS 3740, AS 3958.1 and the NCC (p4). A warranted waterproofing system is by others (Ardex, Bostik, Crommelin, ParexDavco listed, p4). Tiles go on within 3 months. Do not sand; fill lips of 3 mm or less with Ardex Feather Finish (p4).

## 3. Recipe table

Net area is the traced area. Joist run = sum of joist lengths under the sheets. "Joist line" = one joist crossing the sheet.

### Hebel

| Item | Order unit | Driver | Formula | Pack / coverage | Src | Conf |
|---|---|---|---|---|---|---|
| Panel 1800x600x75 | EA | area incl. waste | ceil(TFA x 1.05 / 1.08), or from layout | 1.08 m2/panel | p36 | S |
| Screw 14-10x100 MP bugle type 17 (timber) | box | area | ceil(TFA x 8) at 450, x 6 at 600 | box 100 or 250 (guide gives both, mapping unclear) | p7-8, p36 | S |
| Screw 14-10x95 hex self-tap (steel <1.2 mm) | box | area | as above | as above | p8 | S |
| Hebel Adhesive (joints, screw heads) | 20 kg bag | area | TFA / 20 | 20 m2 per bag | p8, p36 | S |
| Fuller Max Bond (or equiv) construction adhesive | tube | area | **guide: TFA / 10.8**. Use bead length x ~19.6 mL/m for volume check | 10.8 m2/tube (guide); tube volume **not stated** | p8, p36 | S (flat) / D (bead check) |
| Polyurethane sealant | tube | by detail | per lm of control joint / penetration / wall gap | **not stated** | p8, p21 | A |
| Backing rod | lm | control-joint lm | = joint length | diameter not stated | p21-22 | A |
| Hebel Patch | 10 kg bag | repairs | allowance only | 10 kg bag | p8 | A |
| Anti-corrosion paint | tin | cut panels | per cut end | size/coverage not stated | p8, p34 | A |
| Waterproof membrane, flexible tile adhesive, sealer | by others | | | | p9, p29 | S (by others) |

Working for screws (the guide gives a flat 8 and 6 per m2):
- Rule: 2 screws per panel per joist, 100 mm min and 150 mm max from the panel edge, screws optional at butt joints (p19-20).
- At 450: a 1800 panel crosses 3 interior joists = 6 screws, or 10 with both butt rows. The guide's 8/m2 = 8.6 per panel sits between.
- At 600: 2 interior joists = 4, or 6 with butt rows. The guide's 6/m2 = 6.5 per panel.
- Use the guide's figures. They are on net TFA, not TAFA.

Working for construction adhesive (flag):
- A 5 mm bead is about 19.6 mm2, so about 19.6 mL per lm.
- At 600 centres: 1.67 lm/m2 x 19.6 = 33 mL/m2 x 10.8 = about 0.35 L per 10.8 m2.
- At 450 centres: 2.22 lm/m2 = 44 mL/m2, so the same tube covers about **8.1 m2** (10.8 x 450/600).
- The guide's single 10.8 factor likely assumes 600 centres. **Sam/supplier to confirm tube volume**, then the tool can use bead-length x volume. Until then, carry the 450 case at TFA / 8.1 (A).
- Plus 2 beads at each butt-joint joist.

### Scyon Secura

| Item | Order unit | Driver | Formula | Pack | Src | Conf |
|---|---|---|---|---|---|---|
| Sheet | EA | layout | per layout, 5% waste after offcut reuse | 20/pack | p2 | S |
| Fixing, No.8x40 CSK self-drilling screw (timber) | box | per joist line per sheet | 4 per joist line x joist lines under the sheet | box size **not stated** | p3 Table 3, Fig 3 | D |
| Alternative nails: 2.8x50 FC nail / 50 mm D-head / 50x2.87 DekFast ring shank | box | as above | same count | not stated | p3 | D |
| Construction adhesive (2 continuous beads, joists) | tube | joist run | 1 bead per joist line, 2 beads at a butt-joint joist (assumption on the single-bead case) | tube volume and bead size **not stated** | p3 Fig 2, Fig 6 | A |
| James Hardie Joint Sealant (wet butt joints, T&G fill, screw heads) | 300 mL cartridge or 600 mL sausage (20/box) | lm of joint + heads | lm of long (T&G) joint + lm of butt joint (2 mm gap = 38 mm2 x 19 mm thick) + heads | coverage **not stated** | p2, p3 Fig 6, p4 steps 5-7 | A |
| Backing rod 10 mm | lm | control-joint lm | tiled floors > 5.4 m only | | p2, p4 | S |
| Waterproofing, tile adhesive, Ardex Feather Finish, vinyl adhesive | by others | | | | p4 | S (by others) |

Working for fixings (Fig 3 p3: max 200 along joist, 25 min from T&G edge, 12 min from short edge, 50 min from corner):
- A 600-wide sheet has 25 mm to 575 mm along a joist, a span of 550 mm.
- ceil(550 / 200) = 3 intervals, so **4 screws per joist line** (about 183 mm apart).
- A 900-wide sheet has 850 mm span, 5 intervals, so 6 per joist line.
- 2700x600 at 450: 2700 / 450 = 6 bays, so 7 lines x 4 = **28 per sheet** (17.3/m2).
- 2400x600x22 at 600: 5 lines x 4 = **20 per sheet** (13.9/m2).
- 900x1800 at 450: 5 lines x 6 = 30 (18.5/m2).
- Short ends: each sheet gets its own row 12 mm from the end, so a butt joist carries two rows.
- Fixing the sheet through a 40 mm screw into the 45 mm minimum joist is as per Table 3. Fastener count at the joist line is a **minimum from the max spacing**. The guide gives no per-sheet count.

## 4. Worked example (6.0 x 4.2 m floor at 450 centres)

**Hebel main floor.** Assumed layout: truss lines along the 4.2 dimension, panels running along the 6.0 m. Area 25.2 m2.

- Joist lines at 450 over 6.0 m: 14 lines plus an end truss at 6000 so panels finish on a joist = 15 lines (guide says panels must start and finish on a joist, p9). Joist run 15 x 4.2 = 63 m.
- 7 panel rows (4.2 / 0.6). Row length 6000 = 3 x 1800 + 600.
- The 600 remainder is below the **900 min cut length** (p7). So each row is e.g. 900 + 1800 + 1800 + 1500, and the next row is the reverse (1500 + 1800 + 1800 + 900).
- Joint positions are 900, 2700, 4500 against 1500, 3300, 5100. Offsets are 600, which passes the guide's 450 minimum and Sam's 600 rule.
- The 900 halves come from cutting 1800s into 900 + 900 and are reused on other rows. 7 rows need 7 x 900 pieces = 3.5 panels, rounded up to 4.
- Panel count by layout = 14 full + 7 x 1500 pieces + 4 (for the 900s) = **25**. This matches the guide's area rule: 25.2 x 1.05 / 1.08 = 24.5, rounded up to 25.

| Item | Qty | Working |
|---|---|---|
| Hebel PowerFloor panel | **25** | as above |
| Screws 14-10x100 | **202** (1 x 250 box, or 3 x 100) | 25.2 x 8 |
| Hebel Adhesive | **2 bags** | 25.2 / 20 = 1.26 |
| Construction adhesive | **3 tubes by guide** (25.2 / 10.8 = 2.33). **4 if scaled for 450** (25.2 / 8.1 = 3.1) | tube volume unconfirmed. About 71 m of 5 mm bead = 1.4 L: 63 m joist run + 7 rows x 3 butt joists x 0.6 m = 12.6 m of second-bead length |
| Polyurethane sealant | by detail | no control joint at 6.0 m (max typically 6000, p9). Wall-edge gaps per designer. Sam to confirm |
| Backing rod | 0 lm | as above |
| Membrane / tile adhesive / sealer | by others | not in scope |

**Scyon wet area 2.4 x 1.8 m (4.32 m2), tiled, 450 centres.** Assumed joists along the 1.8 dimension, sheets running 2.4 m across them. Joist lines at 450 over 2.4 m: 7, with the last bay 150 so the end falls on a joist. Joist run 7 x 1.8 = 12.6 m. No control joint is needed (under 5.4 m).

- Rows: 1.8 / 0.6 = 3, an exact fit.
- **Option A (Sam's rule, 19 mm at 450):** 3 x 600x2700x19, each cut to 2400. The 300 offcuts are not reusable. **3 sheets**, 3 x 28 = 84 screws.
- **Option B (22 mm 2400x600):** exact fit, no cutting, 3 sheets. 22 mm is permitted at 450 (Tables 1-2). The floor is 3 mm thicker. Price difference to confirm.
- Waste: 3 x 0.3 x 0.6 = 0.54 m2 offcut in A. No waste in B.

| Item | Qty | Working |
|---|---|---|
| Scyon sheets | **3** (A: 19x2700 cut to 2400, or B: 22x2400) | 3 rows |
| Screws No.8x40 | **84** (+5% = 88) | 7 lines x 4 x 3 sheets. Box size not stated |
| Construction adhesive | **12.6 m of bead** (7 lines x 1.8 m) | 1 bead per joist line along the 1.8 m: 7 x 1.8 = 12.6 m. Tube volume not stated |
| Joint sealant | about **4.8 m** T&G joint (2 joints x 2.4 m) + 84 screw heads + any wall gap | no butt joints in the field. Cartridge coverage not stated |
| Backing rod | 0 | |
| Waterproofing, tile adhesive, Feather Finish | by others | warranted system from p4 list |

## 5. Needs Sam / supplier confirmation
1. **35 mm chord:** written position from CSR Hebel and James Hardie, or truss maker detail, for chords under 45 mm.
2. Fuller Max Bond (or equiv) **tube volume**, to replace the 10.8 m2 flat rate (and confirm whether the guide's rate assumes 600 centres).
3. Hebel screw **box size**, and which of 100 and 250 applies (guide table is ambiguous).
4. Scyon screw/nail **box sizes**; construction adhesive **tube size and bead size**.
5. James Hardie Joint Sealant **coverage per cartridge** (300 mL / 600 mL sausage), and whether to seal the 3 mm perimeter gap.
6. Hebel **perimeter gap** dimension and control-joint need (designer, p10). Polyurethane sealant brand and tube size. Backing rod diameter.
7. Scyon **joint stagger** minimum: guide gives none, so 600 stays Sam's rule.
8. Scyon **single-bead vs two-bead** adhesive at mid-floor joists: guide shows two only at butt joints.
9. Whether to default wet areas to 22x2400 (exact fit at 2.4 m) or 19 mm.
10. Hebel Patch and anti-corrosion paint: allowance only, no quantity basis in the guide.

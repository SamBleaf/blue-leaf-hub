// shared/takeoff — environment-neutral takeoff maths (client + server). See each module header.
export * from "./units.js";
export * from "./geometry.js";
export * from "./calibration.js";
export * from "./flashing.js";
export * from "./profile.js";
export * from "./methods.js";
export * from "./schedule.js";
export * from "./history.js";
export * from "./catalogue.js";
export * from "./sections.js";
export * from "./orderDraft.js";
// HUB 029: every order blocker as a one-tap fix row (fixesFor, isInstallationNote, the code-to-target table)
export * from "./fixes.js";
// HUB 029: a held item is never left off an order without a word
export * from "./leftOff.js";
export * from "./engine/contract.js";
export * from "./engine/families.js";
export { gableInputProblem } from "./engine/wall.js";
// HUB 028: which measurement kinds a generic material reads (the server refuses the rest; the review mock does too).
// HUB 029: an incomplete wall's wording, naming only its missing fields
export { methodReads, wallIncompleteText } from "./engine/dispatch.js";

/** Bumped when any calculation in this package changes behaviour; frozen into exports. */
export const CALCULATION_VERSION = "takeoff-calc@14"; // @14 (one release, 21 Nov 2026): Floor frame P5 (Pryda spec guide; Sam 21 Nov 2026): strongback rows over 6.0 m (was 6.5), truss depth 400 default with 140x35 strongbacks (Table 9), strongback joins lapped two truss spaces, perimeter stair beams LVL 400x45/400x63 (default 400x63), FLOOR FIXINGS (joist brackets FB94152, nails, strap braces), wet-area set-down note, long-span note, no-ceiling lateral ties; P5b (Sam, 21 Nov 2026, same release): stair beams sized Auto from the SmartLVL 13 single span floor bearer table (guide p13; 400x63, 2/400x45, 450x63, else Engineer; a size picked by hand wins), strap brace nails added to the 35 x 3.15 connector nails which are ordered in boxes of 9000 (assumed, confirm), lateral tie nails added to the 75 mm framing nails; hoop iron and bracing marks follow the frame length (Sam, 22 Nov 2026); and walls framed from centrelines (Sam, 21 Nov 2026): Snap to plan puts walls on their centrelines, so each frame end is set to the wall it meets (a butting wall stops at the near face, the corner-stud wall runs through to the outer face); studs, openings and junction studs are laid out from the frame start; @13: Floor frame phase 3 (Hebel PowerFloor main floor option, Scyon Secura wet-area sheets, FLOORING ACCESSORIES order lines incl. construction adhesive on Structaflor tongues, butt joints and trusses, control-joint length rule; Sam, 19 Nov 2026); @12: Floor frame sheets, phase 2 (a floor with an outline now orders Structaflor sheets: layout, 5% waste after offcut reuse, FLOORING heading; wet areas are taken off the main floor m²; Sam, 18 Nov 2026); @11: Loads above (Sam, 18 Nov 2026): Floor + roof / Engineer per Walls item, and an MGP10 item whose lintel no pine size spans (or whose wind class is outside the pine table) now falls back to the SmartLVL 13 table instead of "engineer"; @10: Floor frame (floor_framing@1: trusses, strongbacks, beams, trimmers; Sam, 18 Nov 2026; one bump after main landed @9); @9 (release 18 Nov, one bump for both): an unfinished opening framing detail (any shape, e.g. members: [] with no reference) no longer switches the automatic framing off; only a COMPLETE detail wins (Sam, 18 Nov 2026); also short top and bottom plates (under 3,000 mm) pooled across the Walls item and cut from full 6,000 mm sticks, 5 mm saw cut each, spare sticks % under More (Sam, 18 Nov 2026); @8: wall junctions (T junction studs + junction blocks, direction-based corner second stud, two-leg walls one continuous wall; Sam, 18 Nov 2026); @7: Add bracing (ply brace sheets by wall height, hoop iron cross braces, tensioners; hoop iron now 30 m rolls, one BRACING line; Sam, 18 Nov 2026); @6: hoop iron per wall (2 straps of 0.7 m per 1,200 mm, Sam 18 Nov 2026), short MGP10 pieces cut from the product's own stud/plate lengths, MGP10 with no longest length uses 6,000; MGP10 buys 1,200 then 300 mm steps to 3,000 and 600 mm steps above 3 m, short pieces cut from longer lengths (Sam, 18 Nov 2026), order lines carry the member roles the supplier take-off groups by; @5: per-wall stud centres, full-height openings, cavity sliders, automatic opening framing (HUB 031, Sam 17 Nov 2026); @4: all timber bought in 300 mm steps from 1,200 (Sam, 25 Oct 2026; HUB 028); @3: TC-R04 generic methods (timber, cladding, supports, accessories, aluminium bars, continuous flashing paths); @2: spec v2 identity, split provenance, manual/count splits

export * from "./supplierOrder.js";
export * from "./hoopIron.js";
export * from "./bracing.js";

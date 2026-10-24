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
export * from "./engine/contract.js";
export * from "./engine/families.js";
export { gableInputProblem } from "./engine/wall.js";
// HUB 028: which measurement kinds a generic material reads (the server refuses the rest; the review mock does too)
export { methodReads } from "./engine/dispatch.js";

/** Bumped when any calculation in this package changes behaviour; frozen into exports. */
export const CALCULATION_VERSION = "takeoff-calc@4"; // @4: all timber bought in 300 mm steps from 1,200 (Sam, 25 Oct 2026; HUB 028); @3: TC-R04 generic methods (timber, cladding, supports, accessories, aluminium bars, continuous flashing paths); @2: spec v2 identity, split provenance, manual/count splits

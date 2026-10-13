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

/** Bumped when any calculation in this package changes behaviour; frozen into exports. */
export const CALCULATION_VERSION = "takeoff-calc@1";

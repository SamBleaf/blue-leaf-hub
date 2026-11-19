// =============================================================================
// shared/takeoff/engine/floor/accessories.js — Floor frame Phase 3: flooring accessories (Sam, 19 Nov 2026).
// Recipes: docs/takeoff/FLOOR_P3_ACCESSORY_RECIPES.md (guide-sourced) with Sam's answers applied. PURE.
// Every pack size / coverage the guides and Sam did not state is a named constant here, marked "assumed — confirm".
// =============================================================================

/** Hebel guide (p7-8, p36): bugle screws per m² of floor by joist centres. */
export const HEBEL_SCREWS_PER_M2 = Object.freeze({ at450: 8, at600: 6 });
/** Screws are bought in boxes of 500 (Sam). */
export const HEBEL_SCREW_BOX = 500;
/** Hebel guide (p8, p36): one 20 kg bag of Hebel Adhesive per 20 m². */
export const HEBEL_ADHESIVE_M2_PER_BAG = 20;
/** Max Bond construction adhesive: 900 g cartridge (Sam). Density and bead size are ASSUMED — CONFIRM: 1.4 g/mL, a 6 mm round bead. */
export const ADHESIVE_CARTRIDGE_G = 900;
export const ADHESIVE_DENSITY_G_PER_ML = 1.4;   // assumed — confirm
export const ADHESIVE_BEAD_DIAMETER_MM = 6;     // assumed — confirm
export const ADHESIVE_LM_PER_CARTRIDGE = ((ADHESIVE_CARTRIDGE_G / ADHESIVE_DENSITY_G_PER_ML) * 1000) / (Math.PI * (ADHESIVE_BEAD_DIAMETER_MM / 2) ** 2) / 1000;
/** Soudal SMX50 stick & seal: about 480 mL sausage (Sam). The bead cross-section is ASSUMED — CONFIRM: 20 mm² (about a 5 mm bead). */
export const SEALANT_SAUSAGE_ML = 480;
export const SEALANT_BEAD_MM2 = 20;             // assumed — confirm
export const SEALANT_LM_PER_SAUSAGE = (SEALANT_SAUSAGE_ML * 1000) / SEALANT_BEAD_MM2 / 1000;
/** Scyon nails: stainless steel first-fix, 50 mm default, 75 mm under More (Sam). Sam, 19 Nov 2026: boxes of 3000. */
export const NAIL_BOX = 3000;
export const NAIL_DEFAULT_MM = 50;
export const NAIL_OPTION_MM = 75;
export const BACKING_ROD_MM = 10;

export const ACC_NAMES = Object.freeze({
  screws: "HEBEL BUGLE SCREWS 14-10x100 (box of 500)",
  hebelAdhesive: "HEBEL ADHESIVE 20 kg bag",
  maxBond: "MAX BOND CONSTRUCTION ADHESIVE 900 g cartridge",
  nails: (mm) => `STAINLESS STEEL FIRST-FIX NAILS ${mm} mm (box of 3000)`,
  sealant: "SOUDAL SMX50 STICK & SEAL 480 mL sausage",
  paint: "ANTI-CORROSIVE PAINT (Hebel)",
  rod: `BACKING ROD ${BACKING_ROD_MM} mm`,
});

const m = (v) => (Math.round(v * 10) / 10).toFixed(1);

/**
 * @param {{ main: object|null, wets: object[], rules?: object, centresMm: number }} input  main = the main-floor sheet layout (structaflor | hebel), wets = the Scyon wet-area layouts
 * @returns {Array<{ key, product, unit: "EA"|"lm", quantity: number, note: string }>}
 */
export function floorAccessories({ main, wets = [], rules = {}, centresMm }) {
  const out = [];
  const push = (key, product, unit, quantity, note) => { if (quantity > 0) out.push({ key, product, unit, quantity, note }); };
  const hebel = main?.product === "hebel";
  let beadLm = 0, beadParts = [], rodLm = 0;
  if (hebel) {
    const rate = Number(centresMm) <= 450 ? HEBEL_SCREWS_PER_M2.at450 : HEBEL_SCREWS_PER_M2.at600;
    const screws = Math.ceil(main.laidM2 * rate - 1e-9);
    push("screws", ACC_NAMES.screws, "EA", Math.ceil(screws / HEBEL_SCREW_BOX - 1e-9), `${screws} screws: ${rate} per m² at ${centresMm} centres over ${main.laidM2} m²`);
    push("hebelAdhesive", ACC_NAMES.hebelAdhesive, "EA", Math.ceil(main.laidM2 / HEBEL_ADHESIVE_M2_PER_BAG - 1e-9), `1 bag per ${HEBEL_ADHESIVE_M2_PER_BAG} m² (${main.laidM2} m²)`);
    push("paint", ACC_NAMES.paint, "EA", 1, "1 per job with Hebel");
    beadLm += main.basis.beadLm; beadParts.push(`Hebel ${m(main.basis.beadLm)} lm under the panels`);
    rodLm += main.basis.controlJointLm;
  } else if (main) {
    // Sam, 19 Nov 2026: Structaflor tongues and butt joints are glued with the same construction adhesive (it stops creaking and water coming through)
    const lm = main.basis.beadLm + main.basis.tongueLm + main.basis.buttLm;
    beadLm += lm; beadParts.push(`Structaflor ${m(main.basis.beadLm)} lm under the sheets + ${m(main.basis.tongueLm)} lm tongues + ${m(main.basis.buttLm)} lm butt joints`);
  }
  if (wets.length) {
    const nailMm = Number(rules.nailMm) === NAIL_OPTION_MM ? NAIL_OPTION_MM : NAIL_DEFAULT_MM;
    const nails = wets.reduce((t, w) => t + w.basis.fixings, 0);
    const wb = wets.reduce((t, w) => t + w.basis.beadLm, 0);
    const seal = wets.reduce((t, w) => t + w.basis.tongueLm + w.basis.buttLm, 0);
    push("nails", ACC_NAMES.nails(nailMm), "EA", Math.ceil(nails / NAIL_BOX - 1e-9), `${nails} nails: 4 per truss line across each 600 sheet (200 max apart, 25 from the edges), boxes of ${NAIL_BOX}`);
    beadLm += wb; beadParts.push(`Scyon ${m(wb)} lm under the sheets`);
    push("sealant", ACC_NAMES.sealant, "EA", Math.ceil(seal / SEALANT_LM_PER_SAUSAGE - 1e-9), `${m(seal)} lm of tongue and butt joints (Scyon wet areas) at ${m(SEALANT_LM_PER_SAUSAGE)} lm per sausage (assumed ${Math.round(SEALANT_BEAD_MM2)} mm² bead, confirm)`);
    rodLm += wets.reduce((t, w) => t + w.basis.controlJointLm, 0);
  }
  if (beadLm > 0) push("maxBond", ACC_NAMES.maxBond, "EA", Math.ceil(beadLm / ADHESIVE_LM_PER_CARTRIDGE - 1e-9), `${m(beadLm)} lm of bead (${beadParts.join("; ")}) at ${m(ADHESIVE_LM_PER_CARTRIDGE)} lm per cartridge (assumed ${ADHESIVE_DENSITY_G_PER_ML} g/mL, ${ADHESIVE_BEAD_DIAMETER_MM} mm bead: confirm)`);
  if (rodLm > 0) push("rod", ACC_NAMES.rod, "lm", Math.ceil(rodLm - 1e-9), `${m(rodLm)} lm of control joint. Check the joint positions`);
  return out;
}

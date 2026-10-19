// =============================================================================
// Takeoff sections (Hub review HUB 002 / HUB 007). A job has ONE takeoff with two sections that are measured and
// ordered separately: Flashings (to the flashing supplier) and Timber and cladding (one shared supplier order with
// Timber and Cladding parts). Aluminium profiles and the battens / accessories that go with cladding sit under Cladding.
// =============================================================================

export const SECTIONS = Object.freeze({ FLASHINGS: "flashings", TIMBER_CLADDING: "timber_cladding" });
export const SECTION_VALUES = Object.freeze(Object.values(SECTIONS));
export const SECTION_LABEL = Object.freeze({ flashings: "Flashings", timber_cladding: "Timber and cladding" });
export const GROUP_LABEL = Object.freeze({ flashings: "Flashings", timber: "Timber", cladding: "Cladding" });

/** "flashings" | "timber" | "cladding" — a material with no family (or family "flashing") is a flashing. */
export function materialGroup(material) {
  const f = material?.spec?.family;
  if (!f || f === "flashing") return "flashings";
  return f === "timber" ? "timber" : "cladding";
}

/** The section a material is measured and ordered in. */
export function materialSection(material) {
  return materialGroup(material) === "flashings" ? SECTIONS.FLASHINGS : SECTIONS.TIMBER_CLADDING;
}

/** The section of a schedule / order line — from its material; without one, a generic (TC) line is timber and cladding. */
export function lineSection(line, materialsById) {
  const id = line?.jobMaterialId || line?.jobMaterialIds?.[0];
  const m = id ? materialsById?.get?.(id) : null;
  if (m) return materialSection(m);
  return line?.generic || line?.item ? SECTIONS.TIMBER_CLADDING : SECTIONS.FLASHINGS;
}

const norm = (s) => String(s || "").toLowerCase().replace(/\b(pty|ltd|limited|the|trade|branch)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
/**
 * HUB 007: an accessory (fixings, sealant…) that names its own supplier is ordered from THAT supplier. Returns the
 * accessory's supplier name when it differs from the order's supplier (names compared loosely: "Fielders" matches
 * "Fielders (Wingfield branch)"), else null. No supplier on either side = no conflict.
 */
export function accessorySupplierConflict(material, orderSupplierName) {
  if (material?.spec?.family !== "accessory") return null;
  const own = norm(material.spec.supplierName);
  const ord = norm(orderSupplierName);
  if (!own || !ord) return null;
  return ord.includes(own) || own.includes(ord) ? null : String(material.spec.supplierName).trim();
}

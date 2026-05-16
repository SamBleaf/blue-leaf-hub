/** Map RFQ Engine extraction shape → jobs table fields (shared client/server logic mirror). */

function parseStoreysInt(v) {
  if (v == null || v === "") return null;
  const n = parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} extraction — coerceExtraction output
 * @returns {object} flat patch for public.jobs (omit id)
 */
export function buildJobFieldsFromExtraction(extraction) {
  const ex = extraction && typeof extraction === "object" ? extraction : {};
  const fullJson = { ...ex };
  return {
    address: String(ex.project_address || "").trim() || "Address pending",
    project_type: String(ex.project_type || "unknown").trim() || "unknown",
    building_type: String(ex.building_type || ex.project_type || "").trim() || "",
    client_name: String(ex.client_name || "").trim(),
    architect_name: String(ex.architect_name || "").trim(),
    arch_ref: String(ex.arch_ref || "").trim(),
    eng_ref: String(ex.eng_ref || "").trim(),
    spec_ref: String(ex.spec_ref || "TENDER").trim() || "TENDER",
    floor_area_m2: ex.floor_area_m2 != null && ex.floor_area_m2 !== "" ? Number(ex.floor_area_m2) : null,
    slab_area_m2: ex.slab_area_m2 != null && ex.slab_area_m2 !== "" ? Number(ex.slab_area_m2) : null,
    roof_area_m2: ex.roof_area_m2 != null && ex.roof_area_m2 !== "" ? Number(ex.roof_area_m2) : null,
    storeys: parseStoreysInt(ex.storeys),
    extracted_data: fullJson
  };
}

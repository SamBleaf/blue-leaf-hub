/** RFQ Stage 1 document type (Dropbox subfolder + UI dropdown). */
export const RFQ_DOC_TYPES = [
  { id: "architectural", label: "Architectural" },
  { id: "engineering", label: "Engineering" },
  { id: "energy_report", label: "Energy Report" },
  { id: "interiors_selections", label: "Interiors & Selections" },
  { id: "survey", label: "Survey" },
  { id: "timber_framing", label: "Timber Framing" },
  { id: "internal", label: "Internal" },
  { id: "other", label: "Other" }
];

const DEFAULT_ID = "other";

/**
 * Case-insensitive filename keyword routing (aligned with Dropbox tender routing).
 * @param {string} fileName
 * @returns {string} one of RFQ_DOC_TYPES ids
 */
export function autoDetectDocTypeFromFileName(fileName) {
  const n = String(fileName || "").toLowerCase();
  if (/(energy|nathers|nat\s*hers|\bhers\b|thermal)/i.test(n)) return "energy_report";
  if (/(engineering|structural|\beng\b|footing|slab)/i.test(n)) return "engineering";
  if (/(interior|selection|cabinet|joinery|\bfinish)/i.test(n)) return "interiors_selections";
  if (/(survey|contour|feature)/i.test(n)) return "survey";
  if (/(timber|framing|\bframe\b)/i.test(n)) return "timber_framing";
  if (/(architectural|\barch\b|floor\s*plan|elevation|section|facade|\bda\b|\bba\b)/i.test(n)) return "architectural";
  return DEFAULT_ID;
}

export function docTypeLabel(id) {
  return RFQ_DOC_TYPES.find((t) => t.id === id)?.label || "Other";
}

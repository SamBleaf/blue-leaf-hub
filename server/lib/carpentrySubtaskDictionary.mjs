// =============================================================================
// Carpentry sub-task dictionary (Phase 3: earned-value spine)
// The canonical sub-task catalogue — the business's cost-driver taxonomy, kept
// deliberately small so the PWA timesheet stays usable. Estimate leaf line items are
// matched into these sub-tasks by keyword; anything unmatched rolls up to the parent
// category (canonical_key = null). The mapping is only a SUGGESTION — a human confirms
// it at import (Canonical Data Law: the mapping drives pricing → money-tier fact), and
// new sub-tasks can be added per job in the confirm UI.
//
// Starting catalogue (Sam, from J1171):
//   Labour   first_fix_framing → wall / roof / window install / floor framing
//            cladding          → battening / wrapping / prep / cladding install / soffit linings
//            second_fix        → doors / skirts-trim / brios (conditional)
//   Material framing supply    → wall frames / floor frames / roof frame  (mirror the labour splits)
//            everything else   → category level (no sub-tasks)
// =============================================================================

const CATALOGUE = {
  // Labour — keyed by the 8 workforce task categories (budget.workforce_task_category).
  labour: {
    first_fix_framing: [
      { key: "wall_framing",        label: "Wall framing",        keywords: ["wall fram", "wall frame", "stud", "nogg", "nog", "wall"] },
      { key: "roof_framing",        label: "Roof framing",        keywords: ["roof", "truss", "rafter", "bracing", "outrigger", "purlin"] },
      { key: "window_installation", label: "Window installation", keywords: ["window", "door frame", "opening"] },
      { key: "floor_framing",       label: "Floor framing",       keywords: ["floor", "bearer", "joist", "subfloor", "sub-floor", "sub floor"] },
    ],
    cladding: [
      { key: "battening",             label: "Battening",             keywords: ["batten", "top hat", "furring"] },
      { key: "wrapping",              label: "Wrapping",              keywords: ["wrap", "sarking", "membrane", "sisalation", "breather"] },
      { key: "prep",                  label: "Prep",                  keywords: ["prep", "set out", "set-out", "setout", "measure"] },
      { key: "cladding_installation", label: "Cladding installation", keywords: ["cladding", "weatherboard", "weathertex", "scyon", "axon", "linea"] },
      { key: "soffit_linings",        label: "Soffit linings",        keywords: ["soffit", "eave", "lining"] },
    ],
    second_fix: [
      { key: "doors",       label: "Doors",         keywords: ["door", "hang", "hanging"] },
      { key: "skirts_trim", label: "Skirts / trim", keywords: ["skirt", "architrave", "trim", "moulding", "mould", "cornice"] },
      { key: "brios",       label: "Brios",         keywords: ["brio", "cavity slid", "cavity slider", "sliding door gear"] },
    ],
  },
  // Material — keyed by a material group derived from the category name (only framing
  // supply is split; other supply categories stay at category level).
  material: {
    framing_supply: [
      { key: "wall_frames",  label: "Wall frames",  keywords: ["wall", "stud", "nog"] },
      { key: "floor_frames", label: "Floor frames", keywords: ["floor", "bearer", "joist", "subfloor"] },
      { key: "roof_frame",   label: "Roof frame",   keywords: ["roof", "truss", "rafter"] },
    ],
  },
};

const norm = (s) => String(s || "").toLowerCase();

// Material category name → material group. Only "first fix supply" / "framing supply"
// gets sub-tasks; everything else returns null (category level).
function materialGroup(categoryName) {
  const n = norm(categoryName);
  if (!/suppl/.test(n)) return null;
  if (/first\s*fix/.test(n) || /fram/.test(n)) return "framing_supply";
  return null;
}

// Candidate sub-tasks for a given parent (used by the confirm UI's "add sub-task" picker).
export function catalogueFor({ parentTaskCategory, categoryName, costType }) {
  if (costType === "labour" && parentTaskCategory) return CATALOGUE.labour[parentTaskCategory] || [];
  if (costType === "material") { const g = materialGroup(categoryName); return g ? CATALOGUE.material[g] : []; }
  return [];
}

// Suggest a canonical sub-task for one estimate leaf. Returns null (→ unmapped, rolls to
// parent) when nothing matches. Never auto-confirms — the caller stamps status 'suggested'.
export function mapLineItem({ parentTaskCategory, categoryName, costType, description }) {
  const desc = norm(description);
  if (!desc) return null;
  const candidates = catalogueFor({ parentTaskCategory, categoryName, costType });
  if (!candidates.length) return null;
  // Longest matching keyword wins (most specific); ties keep the first.
  let best = null, bestScore = 0;
  for (const st of candidates) {
    for (const kw of st.keywords) {
      if (desc.includes(kw) && kw.length > bestScore) { best = st; bestScore = kw.length; }
    }
  }
  if (!best) return null;
  const confidence = Math.min(0.95, 0.6 + bestScore / 40); // informational only — human still confirms
  return { canonicalKey: best.key, label: best.label, confidence: Math.round(confidence * 1000) / 1000 };
}

export { CATALOGUE };

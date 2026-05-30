// WHS Risk Engine — derives every output chain from questionnaire answers.
// Encodes docs/whs/template-pack/config/whs_outputs_matrix.md (the master rulebook).
// One trigger fires: SWMS -> permit -> inspection -> register -> toolbox -> board warning -> training.
// Pure: deriveOutputs(answers) -> derived object. No DB, no side effects.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const yes = (v) => v === true || v === "yes" || v === "true";

// Each rule: when(answers) -> bool, plus the output chain. `hrcw` marks a
// High-Risk Construction Work trigger (drives high_risk_activities + mandatory SWMS).
const RULES = [
  { id: "heights", hrcw: "Work at heights over 2m", when: (a) => yes(a.m5_work_at_heights),
    swms: "Working at Heights", permit: "Height work permit (per policy)", inspection: "Fall protection / harness check",
    register: "Risk Register", toolbox: "Falls", board: "Fall risk — protection required", training: "Heights awareness" },
  { id: "roof", hrcw: "Roof work", when: (a) => yes(a.m5_roof_work),
    swms: "Roof Work", inspection: "Roof access / edge check", register: "Risk Register",
    toolbox: "Roof safety", board: "Roof work in progress", training: "Roof work competency" },
  { id: "scaffold", hrcw: "Scaffold", when: (a) => yes(a.m5_scaffold),
    swms: "Scaffold Use", inspection: "Scaffold handover + periodic check", register: "Scaffold Register",
    toolbox: "Scaffold use", board: "Do not alter scaffold", training: "Scaffolder ticket (if required)" },
  { id: "excavation", hrcw: "Excavation / trenching", when: (a) => yes(a.m5_excavation),
    swms: "Excavation", permit: "Excavation permit (where required)", inspection: "Daily excavation inspection",
    register: "Risk Register", toolbox: "Excavation", board: "Open excavation", training: "Excavation awareness" },
  { id: "deep_excavation", hrcw: "Deep / high-risk excavation",
    when: (a) => yes(a.m5_excavation) && (num(a.m6_max_depth) > 1.5 || yes(a.m6_near_services) || yes(a.m6_near_structure)),
    swms: "Excavation (+ shoring controls)", permit: "Excavation Permit + DBYD evidence", inspection: "Daily and after rain",
    register: "Inspection Register", toolbox: "Trench safety", board: "Deep excavation — no unauthorised entry", training: "Trench / shoring competency" },
  { id: "demolition", hrcw: "Demolition", when: (a) => yes(a.m5_demolition),
    swms: "Demolition", permit: "Demolition notification (where applicable)", inspection: "Pre-demolition hazard check",
    register: "Risk Register", toolbox: "Demolition", board: "Demolition zone", training: "Demolition awareness" },
  { id: "structural", hrcw: "Structural alteration / temporary support", when: (a) => yes(a.m5_structural_alteration),
    swms: "Structural Carpentry", inspection: "Temporary support check", register: "Risk Register",
    toolbox: "Structural work", board: "Temporary supports in place", training: "Competent person" },
  { id: "crane", hrcw: "Crane lifts", when: (a) => yes(a.m5_crane),
    swms: "Crane / Lifting", permit: "Lift plan / permit (where required)", inspection: "Pre-lift check",
    register: "Plant Register", toolbox: "Crane lift", board: "Lifting exclusion zone", training: "Crane operator / dogger / rigger" },
  { id: "mobile_plant", hrcw: "Mobile plant", when: (a) => yes(a.m5_telehandler) || yes(a.m5_mobile_plant),
    swms: "Mobile Plant", inspection: "Daily pre-start", register: "Plant Register",
    toolbox: "Mobile plant", board: "Plant exclusion zone", training: "Operator competency" },
  { id: "hot_works", hrcw: "Hot works", when: (a) => yes(a.m5_hot_works),
    swms: "Hot Works", permit: "Hot Work Permit", inspection: "Fire watch and post-work check",
    register: "Risk Register", toolbox: "Hot works", board: "Hot works — fire watch active", training: "Hot work awareness" },
  { id: "silica", hrcw: "Silica-generating work", when: (a) => yes(a.m5_silica),
    swms: "Silica / RCS", inspection: "Dust control / RPE check", register: "Health Monitoring flag",
    toolbox: "Silica dust", board: "RPE required", training: "Silica awareness" },
  { id: "chemicals", hrcw: "Hazardous chemicals", when: (a) => yes(a.m5_hazardous_chemicals),
    swms: "Hazardous Chemicals", inspection: "SDS / storage check", register: "SDS Register",
    toolbox: "Chemical handling", board: "Hazardous chemicals stored here", training: "Chemical handling" },
  { id: "confined_space", hrcw: "Confined space", when: (a) => yes(a.m5_confined_space),
    swms: "Confined Space", permit: "Confined Space Entry Permit", inspection: "Atmospheric test + standby",
    register: "Risk Register", toolbox: "Confined space", board: "Permit only", training: "Confined-space competency" },
  { id: "formwork", hrcw: "Suspended slab / formwork", when: (a) => yes(a.m5_suspended_slab),
    swms: "Formwork / Falsework", inspection: "Pre-pour formwork inspection", register: "Risk Register",
    toolbox: "Formwork", board: "Loaded formwork — keep clear", training: "Formwork competency" },
  { id: "electrical", hrcw: "Energised electrical work", when: (a) => yes(a.m5_energised_electrical),
    swms: "Electrical Work", permit: "Isolation permit", inspection: "Test-for-dead / isolation check",
    register: "Risk Register", toolbox: "Electrical safety", board: "Live electrical work", training: "Licensed electrician" },
  { id: "asbestos", hrcw: "Asbestos risk", when: (a) => yes(a.m5_asbestos) || yes(a.m0_pre_1990),
    swms: "Asbestos", permit: "Removal control plan (where required)", inspection: "Clearance inspection",
    register: "Asbestos Register", toolbox: "Asbestos awareness", board: "Do not disturb", training: "Licensed removalist (where required)" },
  // Site hazards (Module 4) — controls, not HRCW
  { id: "public", when: (a) => yes(a.m4_public_access) || yes(a.m4_public_interface) || yes(a.m4_adjacent_road),
    swms: "Traffic / Public Protection", permit: "Council / road permit (where required)", inspection: "Barricade / signage check",
    register: "Controls Register", toolbox: "Public protection", board: "No public entry", training: "Traffic control (if required)" },
  { id: "powerlines", when: (a) => yes(a.m4_overhead_powerlines),
    swms: "Powerline Controls", permit: "Authority clearance (if required)", inspection: "Clearance check",
    register: "Controls Register", toolbox: "Powerline safety", board: "Overhead powerlines", training: "Spotter / plant competency" },
  { id: "services", when: (a) => yes(a.m4_underground_services),
    swms: "Service Location Controls", permit: "DBYD evidence", inspection: "Service location verification",
    register: "Controls Register", toolbox: "Service strike prevention", board: "Locate before dig", training: "Excavation awareness" },
];

// Module 4 answer key -> hazard label (for the site_hazards list).
const HAZARD_LABELS = {
  m4_overhead_powerlines: "Overhead powerlines",
  m4_underground_services: "Underground services",
  m4_adjacent_road: "Adjacent road",
  m4_public_access: "Public / pedestrian access",
  m4_public_interface: "Public interface (school / shop)",
  m4_existing_structures: "Existing structures",
  m4_retaining_walls: "Retaining walls",
  m4_steep_terrain: "Steep terrain",
  m4_bushfire: "Bushfire risk",
  m4_flood: "Flood risk",
  m4_trees: "Tree hazards",
};

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

/**
 * Derive every WHS output set from questionnaire answers.
 * @param {object} answers - flat answer map (keys from whsQuestionnaire.mjs)
 * @returns derived outputs (all arrays)
 */
export function deriveOutputs(answers = {}) {
  const fired = RULES.filter((r) => {
    try { return r.when(answers); } catch { return false; }
  });

  return {
    high_risk_activities: uniq(fired.map((r) => r.hrcw)),
    applicable_swms: uniq(fired.map((r) => r.swms)),
    applicable_permits: uniq(fired.map((r) => r.permit)),
    required_inspections: uniq(fired.map((r) => r.inspection)),
    required_registers: uniq(fired.map((r) => r.register)),
    required_toolbox_talks: uniq(fired.map((r) => r.toolbox)),
    site_board_warnings: uniq(fired.map((r) => r.board)),
    training_requirements: uniq(fired.map((r) => r.training)),
    site_hazards: uniq(Object.keys(HAZARD_LABELS).filter((k) => yes(answers[k])).map((k) => HAZARD_LABELS[k])),
  };
}

export const DERIVED_KEYS = [
  "high_risk_activities", "applicable_swms", "applicable_permits", "required_inspections",
  "required_registers", "required_toolbox_talks", "site_board_warnings", "training_requirements", "site_hazards",
];

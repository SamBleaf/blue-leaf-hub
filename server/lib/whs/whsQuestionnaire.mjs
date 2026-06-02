// WHS Operations-Start Questionnaire — config (data, not code logic).
// Source: docs/whs/template-pack/02_questionnaire_map.md
//
// Modules 0–10. Conditional modules use `appliesWhen.anyOf` (the frontend shows
// the module only if any listed answer key is truthy). Question keys are the
// single naming authority shared with whsRiskRules.mjs + whsMergeFields.mjs.
//
// Promoted keys (see PROMOTED_FIELDS) are named identically to their
// whs_site_profiles column so the save route can copy them straight across.

export const PROMOTED_FIELDS = [
  // Module 2 — site setup
  "site_access_location", "worker_parking_location", "visitor_parking_location",
  "delivery_area", "skip_location", "amenities_location", "toilet_location",
  "lunch_area", "site_fenced", "temporary_fencing_required", "first_aid_location",
  "fire_extinguisher_location", "spill_kit_location", "assembly_point",
  "site_qr_induction_url",
  // Module 3 — emergency
  "evacuation_signal", "emergency_vehicle_access", "nearest_hospital",
  "nearest_hospital_address", "nearest_medical_centre", "nearest_medical_centre_address",
  "first_aiders", "emergency_contacts",
  // Site rules (Module 2/site)
  "site_rules",
];

const YESNO = "yesno";
const TEXT = "text";
const SELECT = "select";
const MULTI = "multiselect";
const LIST = "list";

export const WHS_QUESTIONNAIRE = [
  {
    id: "m0",
    title: "Construction Method",
    note: "Auto-derived from job, estimate and project metrics — confirm only. Pre-selects high-risk work in Module 5.",
    autoDerived: true,
    questions: [
      { key: "m0_project_type", label: "Project type", type: SELECT, options: ["new_home", "addition", "renovation"] },
      { key: "m0_storeys", label: "Storeys", type: SELECT, options: ["single", "double", "triple"] },
      { key: "m0_frame_type", label: "Frame type", type: SELECT, options: ["timber", "steel", "mixed"] },
      { key: "m0_roof_type", label: "Roof type", type: SELECT, options: ["trusses", "conventional", "flat", "pitched"] },
      { key: "m0_retaining_walls", label: "Retaining walls?", type: YESNO },
      { key: "m0_basement", label: "Basement?", type: YESNO },
      { key: "m0_suspended_slab", label: "Suspended slab?", type: YESNO },
      { key: "m0_structural_steel", label: "Structural steel?", type: YESNO },
      { key: "m0_demolition_scope", label: "Demolition scope?", type: YESNO },
      { key: "m0_masonry_cutting", label: "Masonry / concrete cutting?", type: YESNO },
      { key: "m0_steep_site", label: "Steep site?", type: YESNO },
      { key: "m0_bushfire_zone", label: "BAL / bushfire zone?", type: YESNO },
      { key: "m0_pre_1990", label: "Pre-1990 renovation (asbestos risk)?", type: YESNO },
    ],
  },
  {
    id: "m1",
    title: "Project Verification",
    note: "Confirm imported project data. Prefilled from the job — change only if wrong.",
    questions: [
      { key: "site_supervisor_name", label: "Site supervisor name", type: TEXT },
      { key: "site_supervisor_phone", label: "Site supervisor phone", type: TEXT },
      { key: "m1_confirmed", label: "Project details confirmed correct", type: YESNO },
    ],
  },
  {
    id: "m2",
    title: "Site Setup",
    questions: [
      { key: "site_fenced", label: "Is the site fenced?", type: YESNO },
      { key: "temporary_fencing_required", label: "Temporary fencing required?", type: YESNO },
      { key: "site_access_location", label: "Main access point", type: TEXT },
      { key: "worker_parking_location", label: "Worker parking", type: TEXT },
      { key: "visitor_parking_location", label: "Visitor parking", type: TEXT },
      { key: "delivery_area", label: "Delivery / unloading zone", type: TEXT },
      { key: "skip_location", label: "Skip / waste location", type: TEXT },
      { key: "amenities_location", label: "Amenities location", type: TEXT },
      { key: "toilet_location", label: "Toilet location", type: TEXT },
      { key: "lunch_area", label: "Lunch area", type: TEXT },
      { key: "first_aid_location", label: "First aid kit location", type: TEXT },
      { key: "fire_extinguisher_location", label: "Fire extinguisher location", type: TEXT },
      { key: "spill_kit_location", label: "Spill kit location", type: TEXT },
      { key: "assembly_point", label: "Emergency assembly point", type: TEXT },
      { key: "site_qr_induction_url", label: "Site induction QR URL", type: TEXT },
      { key: "site_rules", label: "Site rules", type: LIST },
    ],
  },
  {
    id: "m3",
    title: "Emergency Planning",
    questions: [
      { key: "first_aiders", label: "First aiders", type: LIST },
      { key: "emergency_contacts", label: "Emergency contacts", type: LIST },
      { key: "emergency_vehicle_access", label: "Emergency vehicle access", type: TEXT },
      { key: "nearest_hospital", label: "Nearest hospital", type: TEXT },
      { key: "nearest_hospital_address", label: "Nearest hospital address", type: TEXT },
      { key: "nearest_medical_centre", label: "Nearest medical centre", type: TEXT },
      { key: "nearest_medical_centre_address", label: "Medical centre address", type: TEXT },
      { key: "evacuation_signal", label: "Evacuation signal", type: TEXT },
    ],
  },
  {
    id: "m4",
    title: "Site Hazards",
    questions: [
      { key: "m4_overhead_powerlines", label: "Overhead powerlines?", type: YESNO },
      { key: "m4_underground_services", label: "Underground services?", type: YESNO },
      { key: "m4_adjacent_road", label: "Adjacent road?", type: YESNO },
      { key: "m4_public_access", label: "Public / pedestrian access?", type: YESNO },
      { key: "m4_public_interface", label: "School / shop / public interface nearby?", type: YESNO },
      { key: "m4_existing_structures", label: "Existing structures?", type: YESNO },
      { key: "m4_retaining_walls", label: "Retaining walls?", type: YESNO },
      { key: "m4_steep_terrain", label: "Steep terrain?", type: YESNO },
      { key: "m4_bushfire", label: "Bushfire risk?", type: YESNO },
      { key: "m4_flood", label: "Flood risk?", type: YESNO },
      { key: "m4_trees", label: "Tree hazards?", type: YESNO },
    ],
  },
  {
    id: "m5",
    title: "High Risk Construction Work",
    note: "Confirm which high-risk construction work applies. Each yes generates its SWMS, permits, inspections and toolbox talks. (HRCW per WHS Regulations — SWMS required before work starts.)",
    questions: [
      { key: "m5_work_at_heights", label: "Work at heights over 2m", type: YESNO, codeRef: "Managing the Risk of Falls COP (clause TBC)" },
      { key: "m5_roof_work", label: "Roof work", type: YESNO },
      { key: "m5_scaffold", label: "Scaffold", type: YESNO },
      { key: "m5_excavation", label: "Excavation or trenching", type: YESNO, codeRef: "Excavation Work COP (clause TBC)" },
      { key: "m5_demolition", label: "Demolition", type: YESNO, codeRef: "Demolition Work COP (clause TBC)" },
      { key: "m5_structural_alteration", label: "Structural alteration / temporary support", type: YESNO },
      { key: "m5_crane", label: "Crane lifts", type: YESNO },
      { key: "m5_telehandler", label: "Telehandler", type: YESNO },
      { key: "m5_mobile_plant", label: "Mobile plant", type: YESNO },
      { key: "m5_hot_works", label: "Hot works", type: YESNO },
      { key: "m5_silica", label: "Silica-generating work", type: YESNO, codeRef: "Crystalline Silica COP (clause TBC)" },
      { key: "m5_hazardous_chemicals", label: "Hazardous chemicals", type: YESNO },
      { key: "m5_confined_space", label: "Confined spaces", type: YESNO, codeRef: "Confined Spaces COP (clause TBC)" },
      { key: "m5_asbestos", label: "Asbestos risk", type: YESNO, codeRef: "Asbestos COP (clause TBC)" },
      { key: "m5_energised_electrical", label: "Energised electrical work", type: YESNO },
      { key: "m5_suspended_slab", label: "Suspended slab / formwork", type: YESNO },
    ],
  },
  {
    id: "m6",
    title: "Excavation Assessment",
    appliesWhen: { anyOf: ["m5_excavation"] },
    questions: [
      { key: "m6_max_depth", label: "Maximum depth (m)", type: "number" },
      { key: "m6_near_services", label: "Excavation near services?", type: YESNO },
      { key: "m6_dbyd_done", label: "DBYD completed?", type: YESNO },
      { key: "m6_services_marked", label: "Services located and marked?", type: YESNO },
      { key: "m6_near_structure", label: "Near an existing structure?", type: YESNO },
      { key: "m6_shoring", label: "Benching / shoring required?", type: YESNO },
      { key: "m6_exclusion_zone", label: "Exclusion zone required?", type: YESNO },
    ],
  },
  {
    id: "m7",
    title: "Falls and Height Assessment",
    appliesWhen: { anyOf: ["m5_work_at_heights", "m5_roof_work", "m5_scaffold"] },
    questions: [
      { key: "m7_max_height", label: "Maximum working height (m)", type: "number" },
      { key: "m7_scaffold_required", label: "Scaffold required?", type: YESNO },
      { key: "m7_edge_protection", label: "Edge protection required?", type: YESNO },
      { key: "m7_ewp", label: "EWP required?", type: YESNO },
      { key: "m7_rescue_plan", label: "Rescue plan required?", type: YESNO },
      { key: "m7_high_wind", label: "High wind exposure?", type: YESNO },
    ],
  },
  {
    id: "m8",
    title: "Silica Assessment",
    appliesWhen: { anyOf: ["m5_silica"] },
    questions: [
      { key: "m8_concrete_cutting", label: "Concrete cutting?", type: YESNO },
      { key: "m8_masonry_grinding", label: "Masonry grinding?", type: YESNO },
      { key: "m8_wet_cutting", label: "Wet cutting available?", type: YESNO },
      { key: "m8_on_tool_extraction", label: "On-tool extraction available?", type: YESNO },
      { key: "m8_rpe", label: "RPE required?", type: YESNO },
    ],
  },
  {
    id: "m9",
    title: "Plant and Equipment",
    appliesWhen: { anyOf: ["m5_crane", "m5_telehandler", "m5_mobile_plant"] },
    questions: [
      { key: "m9_excavator", label: "Excavator?", type: YESNO },
      { key: "m9_telehandler", label: "Telehandler?", type: YESNO },
      { key: "m9_crane", label: "Crane?", type: YESNO },
      { key: "m9_ewp", label: "EWP?", type: YESNO },
      { key: "m9_operator_ticket", label: "Operator ticket required?", type: YESNO },
      { key: "m9_spotter", label: "Spotter required?", type: YESNO },
    ],
  },
  {
    id: "m10",
    title: "Subcontractor Management",
    questions: [
      { key: "m10_labour_hire", label: "Labour hire used?", type: YESNO },
      { key: "m10_electrical_contractor", label: "Electrical contractor?", type: YESNO },
      { key: "m10_roofing_contractor", label: "Roofing contractor?", type: YESNO },
      { key: "m10_scaffold_contractor", label: "Scaffold contractor?", type: YESNO },
      { key: "m10_swms_before_access", label: "SWMS required before site access?", type: YESNO },
    ],
  },
];

// Flat list of every question key (for validation / prefill).
export const ALL_QUESTION_KEYS = WHS_QUESTIONNAIRE.flatMap((m) => m.questions.map((q) => q.key));

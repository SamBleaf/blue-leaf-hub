// WHS merge-field resolver — builds the {{field}} context for a document.
// Pulls Level 1 from project/job (never re-asked), site/emergency from the
// profile, and the derived lists from the risk engine. One field defined once.

const COMPANY = {
  company_name: process.env.COMPANY_NAME?.trim() || "Blue Leaf Building",
  company_abn: process.env.COMPANY_ABN?.trim() || "",
  company_building_licence: process.env.COMPANY_BUILDING_LICENCE?.trim() || "",
  company_address: process.env.COMPANY_ADDRESS?.trim() || "",
  company_phone: process.env.COMPANY_PHONE?.trim() || "",
  company_email: process.env.COMPANY_EMAIL?.trim() || "info@blueleafbuilding.com.au",
  company_logo_url: process.env.COMPANY_LOGO_URL?.trim() || "",
};

const MANDATORY_PPE = ["Hard hat", "Hi-vis clothing", "Safety boots", "Eye protection", "Gloves as required"];

// Merge fields the WHS Management Plan genuinely needs populated.
export const REQUIRED_FIELDS = [
  "company_name", "project_name", "project_address", "client_name", "project_type",
  "principal_contractor", "site_supervisor_name",
  "first_aid_location", "assembly_point", "fire_extinguisher_location",
  "nearest_hospital", "emergency_contacts",
  "high_risk_activities", "applicable_swms", "site_hazards", "site_rules",
];

const str = (v) => (v == null ? "" : String(v));

// Format a list into display strings. Accepts plain text lines (from the UI)
// or objects (from structured imports).
function fmtFirstAiders(list) {
  if (!Array.isArray(list)) return [];
  return list.map((a) => (typeof a === "string" ? a : [a.name, a.phone].filter(Boolean).join(" — "))).filter(Boolean);
}
function fmtContacts(list) {
  if (!Array.isArray(list)) return [];
  return list.map((c) => (typeof c === "string" ? c : [c.role, c.name, c.phone].filter(Boolean).join(" — "))).filter(Boolean);
}
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/**
 * Build the merge context for a project's WHS document.
 * @param {{ project?, job?, profile?, documentMeta? }} sources
 * @returns flat map of merge-field key -> string | string[]
 */
export function buildMergeContext({ project = {}, job = {}, profile = {}, documentMeta = {} } = {}) {
  const supervisor = profile.site_supervisor_name || project.supervisor || "";
  const ctx = {
    ...COMPANY,

    // ── Level 1 (read from project/job — never re-asked) ──
    project_id: str(project.id || job.id),
    project_number: str(project.project_number || job.job_number || ""),
    project_name: str(project.name || project.address || job.address),
    project_address: str(project.address || job.address),
    project_suburb: str(project.suburb || job.address_suburb || ""),
    project_state: str(project.state || job.address_state || "SA"),
    project_postcode: str(project.postcode || job.address_postcode || ""),
    client_name: str(project.client_name || project.portal_client_name || job.client_name),
    project_type: str(job.project_type || project.project_type || ""),
    project_description: str(project.project_description || ""),
    estimated_start_date: str(project.commencement_date || project.tentative_start_date || ""),
    estimated_completion_date: str(project.completion_date_est || ""),
    contract_value: str(job.contract_value ?? project.contract_value ?? ""),

    // ── Duty holders ──
    principal_contractor: str(profile.principal_contractor || COMPANY.company_name),
    pcbu_name: str(profile.pcbu_name || COMPANY.company_name),
    site_supervisor_name: str(supervisor),
    site_supervisor_phone: str(profile.site_supervisor_phone || ""),
    site_supervisor_email: str(profile.site_supervisor_email || ""),

    // ── Site setup (profile) ──
    site_access_location: str(profile.site_access_location),
    worker_parking_location: str(profile.worker_parking_location),
    visitor_parking_location: str(profile.visitor_parking_location),
    delivery_area: str(profile.delivery_area),
    skip_location: str(profile.skip_location),
    amenities_location: str(profile.amenities_location),
    toilet_location: str(profile.toilet_location),
    lunch_area: str(profile.lunch_area),
    site_fenced: profile.site_fenced == null ? "" : profile.site_fenced ? "Yes" : "No",
    temporary_fencing_required: profile.temporary_fencing_required == null ? "" : profile.temporary_fencing_required ? "Yes" : "No",
    site_map_url: str(profile.site_map_url),
    site_qr_induction_url: str(profile.site_qr_induction_url),

    // ── Emergency (profile) ──
    first_aid_location: str(profile.first_aid_location),
    fire_extinguisher_location: str(profile.fire_extinguisher_location),
    spill_kit_location: str(profile.spill_kit_location),
    assembly_point: str(profile.assembly_point),
    evacuation_signal: str(profile.evacuation_signal),
    emergency_vehicle_access: str(profile.emergency_vehicle_access),
    nearest_hospital: str(profile.nearest_hospital),
    nearest_hospital_address: str(profile.nearest_hospital_address),
    nearest_hospital_phone: str(profile.nearest_hospital_phone),
    nearest_medical_centre: str(profile.nearest_medical_centre),
    nearest_medical_centre_address: str(profile.nearest_medical_centre_address),
    first_aiders: fmtFirstAiders(profile.first_aiders),
    emergency_contacts: fmtContacts(profile.emergency_contacts),

    // ── Risk + controls (derived by the engine, stored on the profile) ──
    high_risk_activities: asList(profile.high_risk_activities),
    applicable_swms: asList(profile.applicable_swms),
    applicable_permits: asList(profile.applicable_permits),
    required_inspections: asList(profile.required_inspections),
    required_registers: asList(profile.required_registers),
    site_hazards: asList(profile.site_hazards),
    site_rules: asList(profile.site_rules),
    public_interface_controls: str(profile.public_interface_controls || ""),
    mandatory_ppe: MANDATORY_PPE,
    task_specific_ppe: asList(profile.task_specific_ppe),

    // ── Document control ──
    document_title: str(documentMeta.document_title || ""),
    document_key: str(documentMeta.document_key || ""),
    template_version: str(documentMeta.template_version || "1.0"),
    document_version: str(documentMeta.document_version || "1"),
    issue_date: str(documentMeta.issue_date || new Date().toISOString().slice(0, 10)),
    review_date: str(documentMeta.review_date || ""),
    approved_by: str(documentMeta.approved_by || ""),
    approval_date: str(documentMeta.approval_date || ""),
    digital_signature: str(documentMeta.digital_signature || ""),
    generated_from_profile_version: str(documentMeta.profile_version || profile.version || "1"),
  };
  return ctx;
}

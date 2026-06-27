// HUB-QA-ROLE-PREVIEW — data + logic for the Role Preview Console (read-only, not real auth).
// The matrix is driven by the REAL roles.js `can.*` functions for staff/DB roles, so it
// stays accurate if the authorization rules change. Non-DB personas show documented notes.
import { can } from "./roles.js";

// The 9 personas Sam wants to preview — flagged by whether they have a real auth path today.
// `dbRole` is the user_profiles.role the live `can.*` matrix applies to (null = not a staff role).
export const PERSONAS = [
  { key: "admin",        label: "Admin / Director",          tier: "real",    dbRole: "admin",      auth: "Staff JWT (Supabase)",      identity: "user_profiles.role = 'admin'",                        note: "Full access — all modules, finance, costs, user management." },
  { key: "supervisor",   label: "Supervisor",                tier: "real",    dbRole: "supervisor", auth: "Staff JWT + role guard",    identity: "user_profiles.role = 'supervisor'",                   note: "Field/build scope — ops, schedule, WHS, workforce, carpentry. No finance, sales, marketing or $ figures." },
  { key: "employee",     label: "Employee / office",         tier: "real",    dbRole: "employee",   auth: "Staff JWT",                 identity: "user_profiles.role = 'employee'",                     note: "Site access — diary, WHS, schedule view." },
  { key: "leading_hand", label: "Leading hand",              tier: "partial", dbRole: "employee",   auth: "Employee + flag",           identity: "employees.is_leading_hand = true",                    note: "Authenticates as a worker/employee; the flag widens QC (supervisor-audience) task visibility and lets them complete QC tasks." },
  { key: "worker",       label: "Worker (site PWA)",         tier: "real",    dbRole: null,         auth: "Magic-link token",          identity: "employees.worker_token",                              note: "Worker PWA only (/api/worker/*). Not a staff/DB role — the console replays visibility, it never uses the token." },
  { key: "client",       label: "Client — primary/secondary", tier: "real",   dbRole: "client",     auth: "Portal v2 JWT",             identity: "project_client_users.role IN ('primary','secondary')", note: "Client portal, project-scoped. Can approve variations/selections and sign documents." },
  { key: "client_rep",   label: "Client representative",     tier: "real",    dbRole: "client",     auth: "Portal v2 JWT",             identity: "project_client_users.role IN ('architect','accountant')", note: "Portal view-only advisor. Cannot approve or sign." },
  { key: "subcontractor",label: "Subcontractor",             tier: "data",    dbRole: null,         auth: "— no login yet",            identity: "subcontractors (data only)",                          note: "No auth path yet — managed as data via procurement. Cannot be truly previewed until it has a real login." },
  { key: "supplier",     label: "Supplier",                  tier: "data",    dbRole: null,         auth: "— no login yet",            identity: "suppliers (data only)",                               note: "No auth path yet — RFQ/procurement data only." },
];

// Modules → the REAL can.* gate that drives their nav visibility.
export const MODULES = [
  { label: "Home",          gate: "accessHome" },
  { label: "Sales",         gate: "accessSales" },
  { label: "Tendering",     gate: "accessTender" },
  { label: "Operations",    gate: "accessOperations" },
  { label: "Carpentry",     gate: "accessCarpentry" },
  { label: "Workforce",     gate: "accessWorkforce" },
  { label: "Finance",       gate: "accessFinance" },
  { label: "Marketing",     gate: "accessMarketing" },
  { label: "WHS",           gate: "accessWHS" },
  { label: "Site diary",    gate: "accessSiteDiary" },
  { label: "Portal admin",  gate: "accessPortalAdmin" },
  { label: "Client portal", gate: "accessClientPortal" },
];

// Representative actions → the REAL can.* gate.
export const CAPABILITIES = [
  { label: "Create / edit schedule tasks",          gate: "editSchedule" },
  { label: "Approve timesheets (books Buildxact)",  gate: "approveTimesheets" },
  { label: "View cost / margin / $ figures",        gate: "viewCostData" },
  { label: "Manage users",                          gate: "manageUsers" },
  { label: "Invite users",                          gate: "inviteUsers" },
  { label: "Configure client portal (admin)",       gate: "accessPortalAdmin" },
];

// Route gating NOT captured by can.* — documented from the cross-Hub inventory (some flagged for audit).
export const CURATED_ROUTES = [
  { label: "Workforce — allocations / Planner",         allow: ["admin", "supervisor"],            note: "requireRole(admin, supervisor)" },
  { label: "Procurement — issue / draft PO",            allow: ["admin"],                          note: "PO issue/draft admin-only; other procurement admin+supervisor" },
  { label: "Operations — write (commencement, etc.)",   allow: ["admin", "supervisor", "employee"], note: "⚠ requireAuth only — writes not role-gated (audit candidate)" },
  { label: "WHS — compliance / incidents",              allow: ["admin", "supervisor", "employee"], note: "⚠ requireAuth only — no role tiers (audit candidate)" },
];

// Run the live can.* gate for a persona's DB role. Returns null for non-DB personas (n/a).
export function gateFor(persona, gateName) {
  if (!persona?.dbRole) return null;
  return !!can[gateName]?.(persona.dbRole);
}

/**
 * UI Review — canonical route inventory (review-only).
 * Single source of truth for the screenshot spec AND docs/ui-review/UI_ROUTE_INVENTORY.md.
 * Each entry: { name, area, role, path, state }. Role drives ?reviewRole=.
 */

export const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 },
];

export const ROUTES = [
  // ── Review-mode landing ─────────────────────────────────────────────────────
  { name: "ui-review-index",        area: "Review",           role: "director",   path: "/ui-review",                         state: "Review-mode index — links to every route" },

  // ── Sales redesign mock-up (Pass 2/3 design direction — review-only) ─────────
  { name: "sales-redesign-mockup-pipeline", area: "Sales redesign", role: "admin", path: "/ui-review/sales-redesign-mockup",          state: "Pipeline redesign — KPI strip, filters, kanban/grouped-list" },
  { name: "sales-redesign-mockup-lead",     area: "Sales redesign", role: "admin", path: "/ui-review/sales-redesign-mockup/lead",     state: "Lead detail redesign — command-centre / tabs + sticky action" },
  { name: "sales-redesign-mockup-won",      area: "Sales redesign", role: "admin", path: "/ui-review/sales-redesign-mockup/lead-won", state: "Lead detail redesign — WON special case" },

  // ── Admin / Director ────────────────────────────────────────────────────────
  { name: "admin-dashboard",        area: "Dashboard",        role: "director",   path: "/home",                              state: "Director home — KPIs, active jobs, pipeline" },
  { name: "sales-pipeline",         area: "Sales",            role: "admin",      path: "/sales",                             state: "Kanban with a lead in every APB stage" },
  { name: "sales-action-queue",     area: "Sales",            role: "admin",      path: "/sales?view=actions",                state: "Action queue — ranked needs-action working view" },
  { name: "lead-enquiry",           area: "Sales",            role: "admin",      path: "/sales/lead-1",                      state: "Lead detail @ enquiry" },
  { name: "lead-qualify",           area: "Sales",            role: "admin",      path: "/sales/lead-2",                      state: "Lead detail @ qualify" },
  { name: "lead-discovery",         area: "Sales",            role: "admin",      path: "/sales/lead-3",                      state: "Lead detail @ discovery" },
  { name: "lead-winning-offer",     area: "Sales",            role: "admin",      path: "/sales/lead-4",                      state: "Lead detail @ winning_offer" },
  { name: "lead-fee-proposal",      area: "Sales",            role: "admin",      path: "/sales/lead-5",                      state: "Lead detail @ fee_proposal" },
  { name: "lead-accepted",          area: "Sales",            role: "admin",      path: "/sales/lead-6",                      state: "Lead detail @ accepted" },
  { name: "lead-tender",            area: "Sales",            role: "admin",      path: "/sales/lead-7",                      state: "Lead detail @ tender" },
  { name: "lead-won",               area: "Sales",            role: "admin",      path: "/sales/lead-8",                      state: "Lead detail @ won" },
  { name: "tender-board",           area: "Tender/RFQ",       role: "admin",      path: "/tender-manager/board",              state: "Tender board — jobs out to tender" },
  { name: "tender-detail",          area: "Tender/RFQ",       role: "admin",      path: "/tender-manager/board/job-1003",     state: "Tender detail — RFQ rows + quotes" },
  { name: "rfq-package-list",       area: "Tender/RFQ",       role: "admin",      path: "/tender-manager/rfq-packages",       state: "RFQ package list" },
  { name: "rfq-package-detail",     area: "Tender/RFQ",       role: "admin",      path: "/tender-manager/rfq-packages/pkg-1", state: "RFQ package detail — trades + recipients" },
  { name: "subcontractors",         area: "Tender/RFQ",       role: "admin",      path: "/tender-manager/subcontractors",     state: "Subcontractor directory" },
  { name: "cost-intelligence",      area: "Tender/RFQ",       role: "admin",      path: "/tender-manager/cost-intelligence",  state: "Cost intelligence by trade" },
  { name: "fee-proposals",          area: "Tender/RFQ",       role: "admin",      path: "/tender-manager/fee-proposal",       state: "Fee proposal list" },
  { name: "operations-list",        area: "Operations",       role: "admin",      path: "/operations",                        state: "Operations project list" },
  { name: "operations-project",     area: "Operations",       role: "admin",      path: "/operations/proj-1",                 state: "Project command centre" },
  { name: "schedule-manager",       area: "Schedule",         role: "admin",      path: "/operations/proj-1/schedule",        state: "Schedule (Gantt) with baseline" },
  { name: "procurement",            area: "Procurement",      role: "admin",      path: "/operations/procurement",            state: "Purchase orders" },
  { name: "finance-manager",        area: "Finance",          role: "admin",      path: "/finance",                           state: "Finance manager" },
  { name: "finance-command-centre", area: "Finance",          role: "admin",      path: "/finance/jobs/job-1001",             state: "Job command centre (finance)" },
  { name: "workforce",              area: "Workforce",        role: "admin",      path: "/workforce",                         state: "Approvals / team / history" },

  // ── Supervisor / Field ──────────────────────────────────────────────────────
  { name: "supervisor-home",        area: "Field",            role: "supervisor", path: "/supervisor",                        state: "Supervisor home" },
  { name: "field-home",             area: "Field",            role: "supervisor", path: "/field",                             state: "Field app home" },
  { name: "field-jobs",             area: "Field",            role: "supervisor", path: "/field/jobs",                        state: "Field — jobs" },
  { name: "field-tasks",            area: "Field",            role: "supervisor", path: "/field/tasks",                       state: "Field — tasks" },
  { name: "field-whs",              area: "Field",            role: "supervisor", path: "/field/whs",                         state: "Field — WHS" },
  { name: "field-diary",            area: "Field",            role: "supervisor", path: "/field/diary",                       state: "Field — diary" },

  // ── Worker timesheet PWA (public magic-link app) ────────────────────────────
  { name: "worker-home",            area: "Worker app",       role: "employee",   path: "/worker",                            state: "Worker home — today + week + tasks" },
  { name: "worker-log-hours",       area: "Worker app",       role: "employee",   path: "/worker/timesheet/log",              state: "Log hours" },
  { name: "worker-tasks",           area: "Worker app",       role: "employee",   path: "/worker/tasks",                      state: "Site tasks" },
  { name: "worker-week",            area: "Worker app",       role: "employee",   path: "/worker/week",                       state: "My timesheets calendar" },

  // ── Client Portal v2 ────────────────────────────────────────────────────────
  { name: "portal-home",            area: "Client Portal v2", role: "client",     path: "/client-portal",                     state: "Portal home" },
  { name: "portal-actions",         area: "Client Portal v2", role: "client",     path: "/client-portal/actions",             state: "Actions / decisions" },
  { name: "portal-journey",         area: "Client Portal v2", role: "client",     path: "/client-portal/journey",             state: "Build journey / milestones" },
  { name: "portal-selections",      area: "Client Portal v2", role: "client",     path: "/client-portal/selections",          state: "Selections" },
  { name: "portal-documents",       area: "Client Portal v2", role: "client",     path: "/client-portal/documents",           state: "Documents" },
  { name: "portal-messages",        area: "Client Portal v2", role: "client",     path: "/client-portal/messages",            state: "Messages" },
];

// Canonical DB roles. Import these constants instead of hardcoding strings.
export const ROLE_ADMIN = "admin";        // Director / Admin — full access
export const ROLE_SUPERVISOR = "supervisor"; // scoped field role (build/site)
export const ROLE_EMPLOYEE = "employee";  // site-only
export const ROLE_CLIENT = "client";      // client portal only
export const ROLES = [ROLE_ADMIN, ROLE_SUPERVISOR, ROLE_EMPLOYEE, ROLE_CLIENT];

export const ROLE_LABELS = {
  admin: "Director",
  supervisor: "Supervisor",
  employee: "Employee",
  client: "Client"
};

export const ROLE_DESCRIPTIONS = {
  admin: "Full access — all modules, finance, costs, user management",
  supervisor: "Field/build — operations, schedule, site tasks, WHS, workforce, carpentry (no finance, sales, marketing or cost figures)",
  employee: "Site access — site diary, WHS, schedule view only",
  client: "Client portal access only — linked to their project portal"
};

// Supervisor is a scoped FIELD role: it does Operations, Schedule, Site Diary, WHS,
// Workforce and Carpentry — but NOT Sales, Tendering, Finance, Marketing, cost/margin
// figures, portal admin or user management (those are Director/Admin only).
export const can = {
  accessHome: (r) => ["admin", "supervisor", "employee"].includes(r),
  accessSales: (r) => r === "admin",
  accessTender: (r) => r === "admin",
  accessFinance: (r) => r === "admin",
  accessMarketing: (r) => r === "admin",
  accessOperations: (r) => ["admin", "supervisor", "employee"].includes(r),
  accessCarpentry: (r) => ["admin", "supervisor"].includes(r),
  editSchedule: (r) => ["admin", "supervisor"].includes(r),
  accessSiteDiary: (r) => ["admin", "supervisor", "employee"].includes(r),
  accessWHS: (r) => ["admin", "supervisor", "employee"].includes(r),
  accessWorkforce: (r) => ["admin", "supervisor"].includes(r),
  accessPortalAdmin: (r) => r === "admin",
  // Cost/margin/$ figures (carpentry budgets, AI cost intelligence) — Director only.
  // Supervisors get a cost-stripped view (build days/scope, not dollars).
  viewCostData: (r) => r === "admin",
  manageUsers: (r) => r === "admin",
  inviteUsers: (r) => r === "admin",
  accessClientPortal: (r) => r === "client"
};

export function getDefaultRoute(role) {
  switch (role) {
    case "admin":
    case "supervisor":
      return "/home";
    case "employee":
      return "/operations";
    case "client":
      return "/my-portal";
    default:
      return "/home";
  }
}

export function getRoleBadgeStyle(role) {
  switch (role) {
    case "admin":
      return "bg-purple-100 text-purple-800";
    case "supervisor":
      return "bg-blue-100 text-blue-700";
    case "employee":
      return "bg-emerald-100 text-emerald-700";
    case "client":
      return "bg-orange-100 text-orange-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

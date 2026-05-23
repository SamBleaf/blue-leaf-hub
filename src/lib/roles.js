export const ROLES = ["admin", "supervisor", "employee", "client"];

export const ROLE_LABELS = {
  admin: "Admin",
  supervisor: "Supervisor",
  employee: "Employee",
  client: "Client"
};

export const ROLE_DESCRIPTIONS = {
  admin: "Full access — user management, all modules, portal admin",
  supervisor: "Full operations — schedule, sales, tender, finance view, portal admin",
  employee: "Site access — site diary, WHS, schedule view only",
  client: "Client portal access only — linked to their project portal"
};

export const can = {
  accessHome: (r) => ["admin", "supervisor", "employee"].includes(r),
  accessSales: (r) => ["admin", "supervisor"].includes(r),
  accessTender: (r) => ["admin", "supervisor"].includes(r),
  accessFinance: (r) => ["admin", "supervisor"].includes(r),
  accessOperations: (r) => ["admin", "supervisor", "employee"].includes(r),
  editSchedule: (r) => ["admin", "supervisor"].includes(r),
  accessSiteDiary: (r) => ["admin", "supervisor", "employee"].includes(r),
  accessWHS: (r) => ["admin", "supervisor", "employee"].includes(r),
  accessPortalAdmin: (r) => ["admin", "supervisor"].includes(r),
  accessMarketing: (r) => ["admin", "supervisor"].includes(r),
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

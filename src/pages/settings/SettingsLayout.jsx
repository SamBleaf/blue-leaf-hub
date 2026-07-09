import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../lib/useAuth.js";

// ── Rail groups + items ────────────────────────────────────────────────────────
// `roles` gates visibility of an item. Omit to show to every role that can reach
// /settings at all (currently admin, plus admin+supervisor for Workforce rules).
const GROUPS = [
  {
    label: "General",
    items: [
      { to: "/settings/general", label: "Company", roles: ["admin"] },
      { to: "/settings/purchase-orders", label: "Purchase orders", roles: ["admin"] },
      { to: "/settings/email-signature", label: "Email signature", roles: ["admin"] },
      { to: "/settings/notifications", label: "Notifications", roles: ["admin"] },
    ],
  },
  {
    label: "Team & access",
    items: [
      { to: "/settings/users", label: "Users", roles: ["admin"] },
      { to: "/settings/employees", label: "Employees", roles: ["admin"] },
      { to: "/settings/workforce-rules", label: "Workforce rules", roles: ["admin", "supervisor"] },
    ],
  },
  {
    label: "Integrations",
    items: [
      { to: "/settings/mail", label: "Mail", roles: ["admin"] },
      { to: "/settings/dropbox", label: "Dropbox", roles: ["admin"] },
      { to: "/settings/buildexact", label: "Buildexact", roles: ["admin"] },
      { to: "/settings/google", label: "Google", roles: ["admin"] },
      { to: "/settings/meta", label: "Meta", roles: ["admin"] },
      { to: "/settings/resend", label: "Resend", roles: ["admin"] },
      { to: "/settings/xero", label: "Xero", roles: ["admin"] },
    ],
  },
  {
    label: "Modules & templates",
    items: [
      { to: "/settings/templates", label: "Templates", roles: ["admin"] },
      { to: "/settings/cost-model", label: "Tender & cost model", roles: ["admin"] },
      { to: "/settings/marketing", label: "Marketing", roles: ["admin"] },
      { to: "/settings/field-app", label: "Field app", roles: ["admin", "supervisor"] },
    ],
  },
  {
    label: "Usage & data",
    items: [
      { to: "/settings/ai-usage", label: "AI usage & cost", roles: ["admin"] },
      { to: "/settings/data-cleanup", label: "Data cleanup", roles: ["admin"] },
      { to: "/settings/role-preview", label: "Role preview", roles: ["admin"] },
    ],
  },
  {
    label: "Account",
    items: [{ to: "/settings/profile", label: "My profile", roles: ["admin", "supervisor"] }],
  },
];

export default function SettingsLayout() {
  const { role } = useAuth();

  const visibleGroups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
      {/* ── Category rail ──────────────────────────────────────────────────── */}
      <nav
        aria-label="Settings categories"
        className="shrink-0 md:sticky md:top-6 md:w-[230px]"
      >
        <p className="hidden px-1 pb-3 text-lg font-semibold text-primary tracking-tight md:block">Settings</p>

        {/* Mobile: horizontal-scrolling row of grouped chips. Desktop: stacked list. */}
        <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:overflow-visible md:px-0 md:pb-0">
          <div className="flex min-w-max gap-4 md:min-w-0 md:flex-col md:gap-5">
            {visibleGroups.map((group) => (
              <div key={group.label} className="md:w-full">
                <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted md:px-2">
                  {group.label}
                </p>
                <div className="flex gap-1 md:flex-col md:gap-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `relative whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                          isActive
                            ? "bg-primary/10 text-primary md:pl-4"
                            : "text-ink hover:bg-page"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute left-0 top-1/2 hidden h-5 w-1 -translate-y-1/2 rounded-r bg-primary md:block" />
                          )}
                          {item.label}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </nav>

      {/* ── Content pane ───────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/useAuth.js";
import { SETTINGS_NAV } from "./settingsNav.js";

export default function SettingsLayout() {
  const { role } = useAuth();
  const location = useLocation();

  // Smooth-scroll to the sub-section anchor whenever the hash changes (rail click)
  // or when landing directly on a URL that already has a hash.
  useEffect(() => {
    const hash = location.hash?.slice(1);
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.pathname, location.hash]);

  // Role-filter each category's subs, then drop categories left with none visible.
  const visibleCategories = SETTINGS_NAV.map((cat) => ({
    ...cat,
    subs: cat.subs.filter((sub) => !sub.roles || sub.roles.includes(role)),
  })).filter((cat) => cat.subs.length > 0);

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
            {visibleCategories.map((cat) => (
              <div key={cat.cat} className="md:w-full">
                <NavLink
                  to={`/settings/${cat.cat}`}
                  className={({ isActive }) =>
                    `block px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition ${
                      isActive ? "text-primary" : "text-muted hover:text-ink"
                    }`
                  }
                >
                  {cat.label}
                </NavLink>
                <div className="flex gap-1 md:flex-col md:gap-0.5">
                  {cat.subs.map((sub) => {
                    // NavLink's own isActive only compares pathname, so every sub in the
                    // open category would light up at once (they all share one route now).
                    // Compare the hash explicitly instead — active means "this anchor is
                    // the current scroll target," not "this category is open."
                    const isActive =
                      location.pathname === `/settings/${cat.cat}` && location.hash === `#${sub.id}`;
                    return (
                      <NavLink
                        key={sub.id}
                        to={`/settings/${cat.cat}#${sub.id}`}
                        className={`relative whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                          isActive ? "bg-primary/10 text-primary md:pl-4" : "text-ink hover:bg-page"
                        }`}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 hidden h-5 w-1 -translate-y-1/2 rounded-r bg-primary md:block" />
                        )}
                        {sub.label}
                      </NavLink>
                    );
                  })}
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

import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import BlueprintAgent from "../blueprint/components/BlueprintAgent";
import { useAuth } from "../lib/useAuth.js";
import { useBlueprintContext } from "../lib/BlueprintContext.jsx";

const TENDER_MODULES = [
  { to: "/tender-manager/home", label: "Home", end: true },
  { to: "/tender-manager/rfq-engine", label: "RFQ Engine" },
  { to: "/tender-manager/subcontractors", label: "Subcontractors" },
  { to: "/tender-manager/quote-tracker", label: "Quote Tracker" },
  { to: "/tender-manager/board", label: "Tender Manager" },
  { to: "/tender-manager/cost-intelligence", label: "Cost Intelligence" }
];

const OPS_MODULES = [
  { to: "/operations", label: "Projects", end: true }
];

const DEPARTMENTS = [
  {
    id: "tender",
    label: "Tender Manager",
    tabShort: "Tender",
    icon: "📋",
    comingSoon: false,
    modules: TENDER_MODULES
  },
  {
    id: "operations_manager",
    label: "Operations Manager",
    tabShort: "Ops",
    icon: "⚙️",
    comingSoon: false,
    modules: OPS_MODULES
  },
  {
    id: "finance_manager",
    label: "Finance Manager",
    tabShort: "Finance",
    icon: "💼",
    comingSoon: true,
    modules: []
  },
  {
    id: "sales_marketing",
    label: "Sales & Marketing",
    tabShort: "Sales",
    icon: "📣",
    comingSoon: true,
    modules: []
  },
  {
    id: "client_portal",
    label: "Client Portal",
    tabShort: "Client",
    icon: "👤",
    comingSoon: true,
    modules: []
  }
];

function ComingSoonBadge() {
  return (
    <span className="ml-auto shrink-0 rounded border border-warning/50 bg-warning/15 px-2 py-0.5 text-[9px] font-bold uppercase leading-tight tracking-wide text-amber-900">
      Coming soon
    </span>
  );
}

export default function AppShell() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [expandedDesktop, setExpandedDesktop] = useState("tender");
  const [mobileDrawer, setMobileDrawer] = useState(null);
  const [unmatchedQuoteCount, setUnmatchedQuoteCount] = useState(0);
  const { screenContext } = useBlueprintContext() || {};

  const activeDeptId = useMemo(() => {
    if (location.pathname.startsWith("/tender-manager")) return "tender";
    if (location.pathname.startsWith("/operations")) return "operations_manager";
    return null;
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname.startsWith("/tender-manager")) {
      setExpandedDesktop("tender");
    }
    if (location.pathname.startsWith("/operations")) {
      setExpandedDesktop("operations_manager");
    }
  }, [location.pathname]);

  useEffect(() => {
    let stop = false;
    async function refreshUnmatchedCount() {
      try {
        const res = await fetch("/api/quote-tracker/unmatched");
        const j = await res.json().catch(() => null);
        if (stop) return;
        if (!res.ok || !j?.ok || !Array.isArray(j.items)) {
          setUnmatchedQuoteCount(0);
          return;
        }
        setUnmatchedQuoteCount(j.items.length);
      } catch {
        if (!stop) setUnmatchedQuoteCount(0);
      }
    }
    refreshUnmatchedCount();
    const id = setInterval(refreshUnmatchedCount, 60_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  const closeMobile = () => setMobileDrawer(null);

  return (
    <div className="min-h-screen pb-24 md:pb-10 md:pl-72">
      {/* Desktop sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-72 md:flex-col md:border-r md:border-hairline md:bg-surface">
        <div className="border-b border-hairline px-5 py-5">
          <div className="text-lg font-semibold text-primary tracking-tight">Blue Leaf Hub</div>
          <div className="mt-1 text-xs text-muted">Blue Leaf Building · Adelaide</div>
          {user?.email ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
              <span className="truncate text-[11px] text-muted">{user.email}</span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="shrink-0 text-[11px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
              >
                Log out
              </button>
            </div>
          ) : null}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4 text-sm">
          {DEPARTMENTS.map((dept) => {
            const deptActive = activeDeptId === dept.id;

            if (dept.comingSoon) {
              return (
                <div
                  key={dept.id}
                  title={`${dept.label} — coming soon`}
                  className="mb-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-muted opacity-80"
                >
                  <span className="text-base leading-none opacity-70" aria-hidden>
                    {dept.icon}
                  </span>
                  <span className="min-w-0 flex-1 font-semibold leading-snug">{dept.label}</span>
                  <ComingSoonBadge />
                </div>
              );
            }

            return (
              <div key={dept.id} className="mb-2">
                <button
                  type="button"
                  onClick={() => setExpandedDesktop(dept.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left font-semibold transition ${
                    deptActive
                      ? "bg-primary text-white shadow-sm"
                      : "text-ink hover:bg-page"
                  }`}
                >
                  <span className="text-base leading-none" aria-hidden>
                    {dept.icon}
                  </span>
                  <span className="min-w-0 flex-1 leading-snug">{dept.label}</span>
                </button>
                {expandedDesktop === dept.id && dept.modules?.length ? (
                  <div className="mt-1 space-y-0.5 border-l-2 border-hairline pl-3 ml-3">
                    {dept.modules.map((m) => (
                      <NavLink
                        key={m.to}
                        to={m.to}
                        end={m.end}
                        className={({ isActive }) =>
                          `block rounded-md px-3 py-2 text-[13px] font-medium transition focus-ring ${
                            isActive
                              ? "bg-accent/15 text-accent ring-1 ring-accent/30"
                              : "text-ink hover:bg-page"
                          }`
                        }
                      >
                        <span className="inline-flex items-center gap-2">
                          <span>{m.label}</span>
                          {m.to === "/tender-manager/quote-tracker" && unmatchedQuoteCount > 0 ? (
                            <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold text-white">
                              {unmatchedQuoteCount}
                            </span>
                          ) : null}
                        </span>
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-hairline px-3 py-2">
          <NavLink
            to="/tender-manager/settings"
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition focus-ring ${
                isActive ? "bg-accent/15 text-accent ring-1 ring-accent/30" : "text-ink hover:bg-page"
              }`
            }
          >
            <span aria-hidden>⚙️</span>
            Settings
          </NavLink>
        </div>

        <div className="border-t border-hairline px-4 py-3 text-[11px] text-muted">
          PWA install available on supported browsers.
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-20 border-b border-hairline bg-surface/95 backdrop-blur md:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <div className="text-base font-semibold text-primary">Blue Leaf Hub</div>
            <div className="text-[11px] text-muted">Blue Leaf Building</div>
          </div>
          {user?.email ? (
            <div className="flex max-w-[55%] flex-col items-end gap-0.5 text-right">
              <span className="truncate text-[10px] text-muted">{user.email}</span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="text-[10px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
              >
                Log out
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 md:py-10">
        <Outlet />
      </main>

      {/* Mobile: section strip + drawer */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-hairline bg-surface md:hidden">
        <div className="flex justify-around px-1 py-2">
          {DEPARTMENTS.map((dept) => {
            const active =
              (dept.id === "tender" && location.pathname.startsWith("/tender-manager")) ||
              (dept.id === "operations_manager" && location.pathname.startsWith("/operations"));
            return (
              <button
                key={dept.id}
                type="button"
                disabled={dept.comingSoon}
                onClick={() => {
                  if (dept.comingSoon) return;
                  setMobileDrawer(dept.id);
                }}
                className={`flex min-w-[56px] flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-semibold ${
                  dept.comingSoon ? "cursor-not-allowed text-muted opacity-50" : "text-ink"
                } ${active ? "text-primary" : ""}`}
              >
                <span
                  title={dept.label}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-lg ${
                    active ? "bg-primary text-white" : dept.comingSoon ? "bg-page" : "bg-page"
                  }`}
                >
                  {dept.icon}
                </span>
                <span className="max-w-[68px] truncate text-center leading-tight">{dept.tabShort}</span>
                {dept.comingSoon ? (
                  <span className="max-w-[68px] truncate text-center text-[8px] font-semibold uppercase leading-tight text-warning">
                    Soon
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileDrawer === "tender" && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 md:hidden"
          role="presentation"
          onClick={closeMobile}
        >
          <div
            className="max-h-[70vh] overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-bold text-primary">Tender Manager</span>
              <button type="button" className="rounded-lg px-2 py-1 text-muted" onClick={closeMobile}>
                Close
              </button>
            </div>
            <div className="space-y-1">
              {TENDER_MODULES.map((m) => (
                <NavLink
                  key={m.to}
                  to={m.to}
                  end={m.end}
                  onClick={closeMobile}
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-3 text-sm font-semibold ${
                      isActive ? "bg-accent/15 text-accent" : "text-ink hover:bg-page"
                    }`
                  }
                >
                  <span className="inline-flex items-center gap-2">
                    <span>{m.label}</span>
                    {m.to === "/tender-manager/quote-tracker" && unmatchedQuoteCount > 0 ? (
                      <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold text-white">
                        {unmatchedQuoteCount}
                      </span>
                    ) : null}
                  </span>
                </NavLink>
              ))}
              <NavLink
                to="/tender-manager/settings"
                onClick={closeMobile}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-3 text-sm font-semibold ${
                    isActive ? "bg-accent/15 text-accent" : "text-ink hover:bg-page"
                  }`
                }
              >
                ⚙️ Settings
              </NavLink>
            </div>
          </div>
        </div>
      )}

      <BlueprintAgent
        mode="widget"
        jobContext={screenContext}
        hubContext={{ page: location.pathname, department: activeDeptId, ...screenContext }}
      />

      {mobileDrawer === "operations_manager" && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 md:hidden"
          role="presentation"
          onClick={closeMobile}
        >
          <div
            className="max-h-[70vh] overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-bold text-primary">Operations Manager</span>
              <button type="button" className="rounded-lg px-2 py-1 text-muted" onClick={closeMobile}>
                Close
              </button>
            </div>
            <div className="space-y-1">
              {OPS_MODULES.map((m) => (
                <NavLink
                  key={m.to}
                  to={m.to}
                  end={m.end}
                  onClick={closeMobile}
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-3 text-sm font-semibold ${
                      isActive ? "bg-accent/15 text-accent" : "text-ink hover:bg-page"
                    }`
                  }
                >
                  {m.label}
                </NavLink>
              ))}
              <NavLink
                to="/tender-manager/settings"
                onClick={closeMobile}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-3 text-sm font-semibold ${
                    isActive ? "bg-accent/15 text-accent" : "text-ink hover:bg-page"
                  }`
                }
              >
                ⚙️ Settings
              </NavLink>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

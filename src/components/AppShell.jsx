import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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
    modules: TENDER_MODULES,
    defaultTo: "/tender-manager/home"
  },
  {
    id: "operations_manager",
    label: "Operations Manager",
    tabShort: "Ops",
    icon: "⚙️",
    comingSoon: false,
    modules: OPS_MODULES,
    defaultTo: "/operations"
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

function HamburgerIcon({ open }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      {open ? (
        <>
          <path d="M18 6 6 18" />
          <path d="M6 6l12 12" />
        </>
      ) : (
        <>
          <path d="M3 12h18" />
          <path d="M3 6h18" />
          <path d="M3 18h18" />
        </>
      )}
    </svg>
  );
}

export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [expandedDesktop, setExpandedDesktop] = useState("tender");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unmatchedQuoteCount, setUnmatchedQuoteCount] = useState(0);
  const { screenContext } = useBlueprintContext() || {};

  // Touch swipe state
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  const activeDeptId = useMemo(() => {
    if (location.pathname.startsWith("/tender-manager")) return "tender";
    if (location.pathname.startsWith("/operations")) return "operations_manager";
    return null;
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname.startsWith("/tender-manager")) setExpandedDesktop("tender");
    if (location.pathname.startsWith("/operations")) setExpandedDesktop("operations_manager");
  }, [location.pathname]);

  // Close sidebar on navigation
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  useEffect(() => {
    let stop = false;
    async function refreshUnmatchedCount() {
      try {
        const res = await fetch("/api/quote-tracker/unmatched");
        const j = await res.json().catch(() => null);
        if (stop) return;
        if (!res.ok || !j?.ok || !Array.isArray(j.items)) { setUnmatchedQuoteCount(0); return; }
        setUnmatchedQuoteCount(j.items.length);
      } catch { if (!stop) setUnmatchedQuoteCount(0); }
    }
    refreshUnmatchedCount();
    const id = setInterval(refreshUnmatchedCount, 60_000);
    return () => { stop = true; clearInterval(id); };
  }, []);

  // Swipe-to-open from left edge, swipe-to-close
  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    // Only trigger for mostly-horizontal swipes
    if (dy > 60) { touchStartX.current = null; return; }
    if (!sidebarOpen && touchStartX.current < 24 && dx > 50) setSidebarOpen(true);
    if (sidebarOpen && dx < -50) setSidebarOpen(false);
    touchStartX.current = null;
  }

  const activeDept = DEPARTMENTS.find((d) => d.id === activeDeptId);

  return (
    <div
      className="min-h-screen pb-24 md:pb-10 md:pl-72"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Desktop sidebar ──────────────────────────────────────── */}
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
                <div key={dept.id} title={`${dept.label} — coming soon`}
                  className="mb-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-muted opacity-80">
                  <span className="text-base leading-none opacity-70" aria-hidden>{dept.icon}</span>
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
                    deptActive ? "bg-primary text-white shadow-sm" : "text-ink hover:bg-page"
                  }`}
                >
                  <span className="text-base leading-none" aria-hidden>{dept.icon}</span>
                  <span className="min-w-0 flex-1 leading-snug">{dept.label}</span>
                </button>
                {expandedDesktop === dept.id && dept.modules?.length ? (
                  <div className="mt-1 space-y-0.5 border-l-2 border-hairline pl-3 ml-3">
                    {dept.modules.map((m) => (
                      <NavLink key={m.to} to={m.to} end={m.end}
                        className={({ isActive }) =>
                          `block rounded-md px-3 py-2 text-[13px] font-medium transition focus-ring ${
                            isActive ? "bg-accent/15 text-accent ring-1 ring-accent/30" : "text-ink hover:bg-page"
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
          <NavLink to="/tender-manager/settings"
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition focus-ring ${
                isActive ? "bg-accent/15 text-accent ring-1 ring-accent/30" : "text-ink hover:bg-page"
              }`
            }
          >
            <span aria-hidden>⚙️</span> Settings
          </NavLink>
        </div>
        <div className="border-t border-hairline px-4 py-3 text-[11px] text-muted">
          PWA install available on supported browsers.
        </div>
      </aside>

      {/* ── Mobile header ────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-hairline bg-surface/95 backdrop-blur md:hidden">
        <div className="flex items-center gap-3 px-3 py-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-page"
            aria-label="Open menu"
          >
            <HamburgerIcon open={sidebarOpen} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-primary leading-tight">Blue Leaf Hub</div>
            {activeDept && (
              <div className="text-[11px] text-muted leading-tight truncate">{activeDept.label}</div>
            )}
          </div>
          {user?.email ? (
            <button
              type="button"
              onClick={() => void signOut()}
              className="shrink-0 text-[11px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Log out
            </button>
          ) : null}
        </div>
      </header>

      {/* ── Mobile swipeable sidebar overlay ─────────────────────── */}
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 md:hidden ${
          sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden
      />

      {/* Sidebar panel */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-surface shadow-2xl transition-transform duration-300 md:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Sidebar header */}
        <div className="border-b border-hairline px-5 py-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold text-primary tracking-tight">Blue Leaf Hub</div>
              <div className="text-xs text-muted">Blue Leaf Building · Adelaide</div>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-page"
            >
              <HamburgerIcon open={true} />
            </button>
          </div>
          {user?.email && (
            <div className="mt-3 border-t border-hairline pt-3 text-[11px] text-muted truncate">
              {user.email}
            </div>
          )}
        </div>

        {/* Sidebar nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-4 text-sm">
          {DEPARTMENTS.map((dept) => {
            const deptActive = activeDeptId === dept.id;
            if (dept.comingSoon) {
              return (
                <div key={dept.id}
                  className="mb-1 flex items-center gap-2 rounded-lg px-3 py-3 text-muted opacity-60">
                  <span className="text-lg leading-none" aria-hidden>{dept.icon}</span>
                  <span className="min-w-0 flex-1 font-semibold">{dept.label}</span>
                  <ComingSoonBadge />
                </div>
              );
            }
            return (
              <div key={dept.id} className="mb-2">
                <button
                  type="button"
                  onClick={() => {
                    if (dept.modules.length === 1) {
                      navigate(dept.modules[0].to);
                    } else {
                      navigate(dept.defaultTo);
                    }
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-semibold transition ${
                    deptActive ? "bg-primary text-white shadow-sm" : "text-ink hover:bg-page"
                  }`}
                >
                  <span className="text-lg leading-none" aria-hidden>{dept.icon}</span>
                  <span className="min-w-0 flex-1">{dept.label}</span>
                </button>
                {deptActive && dept.modules.length > 1 && (
                  <div className="mt-1 space-y-0.5 border-l-2 border-hairline ml-4 pl-3">
                    {dept.modules.map((m) => (
                      <NavLink key={m.to} to={m.to} end={m.end}
                        className={({ isActive }) =>
                          `block rounded-md px-3 py-3 text-[14px] font-medium transition ${
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
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-hairline px-3 py-3">
          <NavLink to="/tender-manager/settings" onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition ${
                isActive ? "bg-accent/15 text-accent" : "text-ink hover:bg-page"
              }`
            }
          >
            <span aria-hidden>⚙️</span> Settings
          </NavLink>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────── */}
      <main className="mx-auto max-w-6xl px-4 py-6 md:py-10">
        <Outlet />
      </main>

      {/* ── Mobile bottom nav ────────────────────────────────────── */}
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
                  setSidebarOpen(true);
                  if (!active) navigate(dept.defaultTo);
                }}
                className={`flex min-w-[56px] flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-semibold transition ${
                  dept.comingSoon
                    ? "cursor-not-allowed text-muted opacity-40"
                    : active
                    ? "text-primary"
                    : "text-ink"
                }`}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-full text-lg ${
                  active ? "bg-primary/10" : "bg-page"
                }`}>
                  {dept.icon}
                </span>
                <span className="max-w-[68px] truncate text-center leading-tight">{dept.tabShort}</span>
                {dept.comingSoon && (
                  <span className="text-[8px] font-semibold uppercase text-warning leading-tight">Soon</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <BlueprintAgent
        mode="widget"
        jobContext={screenContext}
        hubContext={{ page: location.pathname, department: activeDeptId, ...screenContext }}
      />
    </div>
  );
}

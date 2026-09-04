import { useCallback, useMemo, useState } from "react";
import { NavLink, Navigate, Outlet } from "react-router-dom";
import BrandLoading from "../../components/brand/BrandLoading.jsx";
import PortalSidebarBrand from "../../components/brand/PortalSidebarBrand.jsx";
import LeafWatermark from "../../components/brand/LeafWatermark.jsx";
import { useAuth } from "../../lib/useAuth.js";
import { PROJECT_STATUSES } from "../../lib/constants.js";
import { useClientPortalProject } from "../../lib/clientPortalApi.js";
import { ClientPortalContext } from "./clientPortalContext.js";
import NotificationBell from "./NotificationBell.jsx";

const BASE = "/client-portal";

// ── Nav icons (stroked, matches AppShell / PortalApp icon style) ──────────────
function NavIcon({ d }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  home: "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3m10-11v10a1 1 0 01-1 1h-3m-4 0h4",
  actions: "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11",
  journey: "M4 6h16M4 12h16M4 18h10",
  selections:
    "M11 4a1 1 0 011-1h0a1 1 0 011 1v2.5M5 12l7-7 7 7M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7M9 21v-6h6v6",
  documents: "M4 4a2 2 0 012-2h7l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4zM13 2v5h5",
  messages: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  team: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-2a4 4 0 10-4-4 4 4 0 004 4zm7-4a3 3 0 11-3-3 3 3 0 013 3z",
  myhome:
    "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h12a1 1 0 001-1V10M9 21v-6a1 1 0 011-1h4a1 1 0 011 1v6",
};

// ── Nav definitions (build phase vs. post-completion) ─────────────────────────
const BUILD_NAV = [
  { to: "", label: "Home", short: "Home", icon: ICONS.home, end: true },
  { to: "actions", label: "My Actions", short: "Actions", icon: ICONS.actions },
  { to: "journey", label: "Project Journey", short: "Journey", icon: ICONS.journey },
  { to: "design-team", label: "Design Team", short: "Team", icon: ICONS.team },
  { to: "selections", label: "Selections", short: "Select", icon: ICONS.selections },
  { to: "documents", label: "Documents", short: "Docs", icon: ICONS.documents },
  { to: "messages", label: "Messages", short: "Messages", icon: ICONS.messages },
];

const COMPLETION_NAV = [
  { to: "", label: "Home", short: "Home", icon: ICONS.home, end: true },
  { to: "actions", label: "My Actions", short: "Actions", icon: ICONS.actions },
  { to: "my-home", label: "My Home", short: "My Home", icon: ICONS.myhome },
  { to: "documents", label: "Documents", short: "Docs", icon: ICONS.documents },
  { to: "messages", label: "Messages", short: "Messages", icon: ICONS.messages },
];

const PORTAL_CHROME = "#006c9b";

export default function ClientPortalLayout() {
  const { user, profile, role, loading: authLoading, signOut } = useAuth();
  const email = profile?.email || user?.email;

  const [nonce, setNonce] = useState(0);
  const refreshSession = useCallback(() => setNonce((n) => n + 1), []);
  const { loading, projectId, session, error } = useClientPortalProject(email, nonce);

  const buildPhase = session?.buildPhase ?? null;
  const isCompletion = buildPhase === PROJECT_STATUSES.PRACTICAL_COMPLETION;
  const nav = isCompletion ? COMPLETION_NAV : BUILD_NAV;

  const ctx = useMemo(
    () => ({
      projectId,
      session,
      buildPhase,
      clientName: session?.clientName ?? null,
      address: session?.address ?? null,
      refreshSession,
    }),
    [projectId, session, buildPhase, refreshSession]
  );

  // ── Auth guard: only logged-in clients ──────────────────────────────────────
  if (authLoading) return <BrandLoading message="Loading…" className="min-h-screen" />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && role !== "client") return <Navigate to="/" replace />;

  if (loading) {
    return <BrandLoading message="Preparing your home journey…" className="min-h-screen bg-[#F6F4F0]" />;
  }

  if (error || !projectId) {
    return (
      <div className="min-h-screen bg-[#F6F4F0] font-sans flex flex-col items-center justify-center px-4 text-center">
        <PortalSidebarBrand address={null} />
        <h1 className="mt-6 text-xl font-bold text-ink">No project linked yet</h1>
        <p className="mt-2 max-w-sm text-sm text-muted leading-relaxed">
          {error || "We couldn't find an active project for your account. Contact Blue Leaf Building if you expected access."}
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-6 text-sm font-semibold text-primary hover:underline"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <ClientPortalContext.Provider value={ctx}>
      <div className="min-h-screen bg-[#F6F4F0] font-sans md:flex">
        {/* ── Desktop left nav ─────────────────────────────────────────── */}
        <aside
          className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 text-white"
          style={{ backgroundColor: PORTAL_CHROME }}
        >
          <div className="flex items-start justify-between gap-2 border-b border-white/10 p-5">
            <PortalSidebarBrand address={ctx.address} />
            <NotificationBell projectId={projectId} />
          </div>
          <nav className="flex-1 space-y-0.5 py-4">
            {nav.map((item) => (
              <NavLink
                key={item.to || "home"}
                to={item.to ? `${BASE}/${item.to}` : BASE}
                end={item.end}
                className={({ isActive }) =>
                  `mx-2 flex items-center gap-3 rounded-lg px-4 py-2.5 text-[13px] font-medium transition ${
                    isActive ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                <NavIcon d={item.icon} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          {email ? (
            <div className="border-t border-white/10 px-5 py-4">
              <p className="truncate text-[11px] text-white/40">{email}</p>
              <button
                type="button"
                onClick={() => void signOut()}
                className="mt-1 text-[11px] font-semibold text-white/50 transition hover:text-white"
              >
                Log out
              </button>
            </div>
          ) : null}
        </aside>

        {/* ── Mobile header ────────────────────────────────────────────── */}
        <header
          className="sticky top-0 z-30 text-white shadow-sm md:hidden"
          style={{ backgroundColor: PORTAL_CHROME }}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <PortalSidebarBrand address={ctx.address} />
            <div className="flex shrink-0 items-center gap-4">
              <NotificationBell projectId={projectId} />
              <button
                type="button"
                onClick={() => void signOut()}
                className="text-[11px] font-semibold text-white/60 transition hover:text-white"
              >
                Log out
              </button>
            </div>
          </div>
        </header>

        {/* ── Main content ─────────────────────────────────────────────── */}
        <main className="relative flex-1 md:ml-60 min-h-screen bg-[#F6F4F0] overflow-hidden">
          <LeafWatermark position="bottom-right" />
          <div className="relative z-10 mx-auto max-w-2xl px-4 py-6 pb-24 md:py-8 md:pb-12">
            <Outlet />
          </div>
        </main>

        {/* ── Mobile bottom nav ────────────────────────────────────────── */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-hairline bg-surface md:hidden">
          {nav.map((item) => (
            <NavLink
              key={item.to || "home"}
              to={item.to ? `${BASE}/${item.to}` : BASE}
              end={item.end}
              className={({ isActive }) =>
                `flex min-w-[52px] flex-col items-center gap-0.5 px-2 py-2 text-[10px] font-semibold transition ${
                  isActive ? "text-primary" : "text-muted"
                }`
              }
            >
              <NavIcon d={item.icon} />
              <span className="leading-tight">{item.short}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </ClientPortalContext.Provider>
  );
}

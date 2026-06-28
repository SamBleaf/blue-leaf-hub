import { authFetch } from "../lib/authFetch.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useMatch, useNavigate } from "react-router-dom";
import BlueprintAgent from "../blueprint/components/BlueprintAgent";
import BrandLogo from "./brand/BrandLogo.jsx";
import { useAuth } from "../lib/useAuth.js";
import { useBlueprintContext } from "../lib/BlueprintContext.jsx";
import { can } from "../lib/roles.js";
import { useProject } from "../lib/ProjectContext.jsx";
import ProjectBar from "./ProjectBar.jsx";

// ── SVG icon set ────────────────────────────────────────────────────────────
const ICONS = {
  home: (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  tender: (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  ),
  operations: (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  finance: (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  ),
  sales: (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  ),
  client: (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  marketing: (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
    </svg>
  ),
  workforce: (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  settings: (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  carpentry: (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 12l-8.5 8.5a2.121 2.121 0 01-3-3L12 9" />
      <path d="M17.64 15L22 10.36 19.64 8l-3.64 3.64" />
      <path d="M16 7l-1.5-1.5 2-2L18 5l.5-1.5L21 2l1 1-1.5 2.5L19 6l-2 2z" />
    </svg>
  ),
  review: (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  ),
  chevronLeft: (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
  chevronRight: (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  ),
  hamburger: (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M3 12h18M3 6h18M3 18h18" />
    </svg>
  ),
  close: (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
};

const TENDER_MODULES = [
  { to: "/tender-manager/rfq-engine",        label: "RFQ Engine" },
  { to: "/tender-manager/rfq-packages",      label: "Quote Tracker" },
  { to: "/tender-manager/subcontractors",    label: "Subcontractors" },
  { to: "/tender-manager/board",             label: "Tender Board" },
  { to: "/tender-manager/cost-intelligence", label: "Cost Intelligence" },
];

const MARKETING_MODULES = [
  { to: "/marketing",          label: "Command Centre", end: true },
  { to: "/marketing/planner",  label: "Weekly Planner" },
  { to: "/marketing/studio",   label: "Content Studio" },
  { to: "/marketing/approval", label: "Approval Queue" },
  { to: "/marketing/calendar", label: "Calendar" },
  { to: "/marketing/vault",    label: "Media Vault" },
  { to: "/marketing/evergreen",label: "Evergreen" },
  { to: "/marketing/library",  label: "Library" },
  { to: "/marketing/campaigns",label: "Campaigns" },
  { to: "/marketing/media",    label: "Media" },
  { to: "/marketing/lists",    label: "Lists" },
];

const WORKFORCE_MODULES = [
  { to: "/workforce",      label: "Timesheets", end: true },
  { to: "/workforce/team", label: "Team" },
];

const BASE_DEPARTMENTS = [
  { id: "sales_marketing",    label: "Sales",      tabShort: "Sales",      icon: "sales",      comingSoon: false, modules: [{ to: "/sales", label: "Pipeline" }, { to: "/sales/dashboard", label: "Relationships" }, { to: "/sales/contacts", label: "Contacts" }, { to: "/sales/reference-projects", label: "Reference Projects" }], defaultTo: "/sales" },
  { id: "tender",             label: "Tendering",  tabShort: "Tender",     icon: "tender",     comingSoon: false, modules: TENDER_MODULES,    defaultTo: "/tender-manager/rfq-engine" },
  { id: "operations_manager", label: "Operations", tabShort: "Ops",        icon: "operations", comingSoon: false, modules: null /* computed */ },
  { id: "workforce_manager",  label: "Workforce",  tabShort: "Workforce",  icon: "workforce",  comingSoon: false, modules: WORKFORCE_MODULES,  defaultTo: "/workforce" },
  { id: "finance_manager",    label: "Financials", tabShort: "Finance",    icon: "finance",    comingSoon: false, modules: null /* computed */, defaultTo: "/finance" },
  { id: "marketing_agent",    label: "Marketing",  tabShort: "Marketing",  icon: "marketing",  comingSoon: false, modules: MARKETING_MODULES, defaultTo: "/marketing" },
  { id: "client_portal",      label: "Clients",    tabShort: "Clients",    icon: "client",     comingSoon: false, modules: [], defaultTo: "/portal-admin" },
  { id: "carpentry",          label: "Carpentry",  tabShort: "Carp",       icon: "carpentry",  comingSoon: false, modules: [{ to: "/carpentry", label: "Jobs", end: true }], defaultTo: "/carpentry" },
];

const SIDEBAR_EXPANDED_W = 256;
const SIDEBAR_COLLAPSED_W = 64;

const QUICK_ADD_ITEMS = [
  { label: "Site Task",  icon: "✅", path: (pid) => pid ? `/operations/${pid}?panel=site-tasks` : "/operations" },
  { label: "Site note",  icon: "📋", path: (pid) => pid ? `/operations/${pid}/diary` : "/operations" },
  { label: "RFQ",        icon: "📄", path: () => "/tender-manager/rfq-engine" },
  { label: "PO",         icon: "📦", path: (pid) => pid ? `/operations/${pid}` : "/operations" },
  { label: "WHS report", icon: "🦺", path: (pid) => pid ? `/operations/${pid}/whs` : "/operations" },
];

export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, role } = useAuth();
  const { screenContext } = useBlueprintContext() || {};
  const { project } = useProject();

  const opsModules = useMemo(() => {
    if (project) {
      return [
        { to: `/operations/${project.id}`,          label: "Overview",   end: true },
        { to: `/operations/${project.id}/schedule`, label: "Schedule" },
        { to: `/operations/${project.id}/diary`,    label: "Site Diary" },
        { to: `/operations/${project.id}/whs`,      label: "WHS" },
        { to: "/operations/procurement",            label: "Procurement" },
      ];
    }
    return [
      { to: "/operations", label: "Projects", end: true },
      { to: "/operations/procurement", label: "Procurement" },
    ];
  }, [project]);

  const financeModules = useMemo(() => [
    { to: "/finance",           label: "Inbox",      end: true },
    { to: "/finance/approvals", label: "Approvals"             },
    { to: project?.job_id ? `/finance/jobs/${project.job_id}` : "/finance/jobs", label: "Job Dashboard" },
  ], [project]);

  const DEPARTMENTS = useMemo(() =>
    BASE_DEPARTMENTS.map((dept) => {
      if (dept.id === "operations_manager") {
        return {
          ...dept,
          modules: opsModules,
          defaultTo: project ? `/operations/${project.id}` : "/operations",
        };
      }
      if (dept.id === "finance_manager") {
        return {
          ...dept,
          modules: financeModules,
        };
      }
      return dept;
    }),
  [opsModules, financeModules, project]);

  const visibleDepts = useMemo(
    () =>
      DEPARTMENTS.filter((dept) => {
        if (dept.id === "sales_marketing") return can.accessSales(role);
        if (dept.id === "tender") return can.accessTender(role);
        if (dept.id === "operations_manager") return can.accessOperations(role);
        if (dept.id === "workforce_manager") return can.accessWorkforce(role);
        if (dept.id === "finance_manager") return can.accessFinance(role);
        if (dept.id === "marketing_agent") return can.accessMarketing(role);
        if (dept.id === "client_portal") return can.accessPortalAdmin(role);
        if (dept.id === "carpentry") return can.accessCarpentry(role);
        return true;
      }),
    [DEPARTMENTS, role]
  );

  const visibleQuickAdd = useMemo(
    () =>
      QUICK_ADD_ITEMS.filter((item) => {
        if (item.label === "RFQ" || item.label === "PO") return can.accessTender(role);
        if (item.label === "Site Task") return can.editSchedule(role); // creating site tasks is admin/supervisor
        return true;
      }),
    [role]
  );

  const [minimized, setMinimized] = useState(() => {
    try { return localStorage.getItem("sidebar_minimized") === "true"; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unmatchedQuoteCount, setUnmatchedQuoteCount] = useState(0);
  const [unmatchedDocCount, setUnmatchedDocCount] = useState(0);
  const [pendingFactCount, setPendingFactCount] = useState(0);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // Touch swipe refs
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  const activeDeptId = useMemo(() => {
    if (location.pathname.startsWith("/tender-manager")) return "tender";
    if (location.pathname.startsWith("/operations")) return "operations_manager";
    if (location.pathname.startsWith("/workforce")) return "workforce_manager";
    if (location.pathname.startsWith("/sales")) return "sales_marketing";
    if (location.pathname.startsWith("/marketing")) return "marketing_agent";
    if (location.pathname.startsWith("/finance")) return "finance_manager";
    if (location.pathname.startsWith("/portal-admin")) return "client_portal";
    return null;
  }, [location.pathname]);

  const activeDept = DEPARTMENTS.find((d) => d.id === activeDeptId);

  // Pass 3A Polish: on a lead-detail page the page shows its own sticky primary action
  // (and an in-page Blueprint Insight panel). Collapse the global FABs there on
  // mobile/tablet so they don't collide/compete with the sticky bar. Desktop (lg+)
  // has no sticky bar, so the FABs stay. Signalled via the existing screenContext.
  const leadDetailActionMode = screenContext?.page === "lead_detail";

  const projectMatch = useMatch("/operations/:projectId/*");
  const activeProjectId = projectMatch?.params?.projectId || null;

  // Close quick-add on navigation
  useEffect(() => { setQuickAddOpen(false); }, [location.pathname]);

  // Close mobile sidebar on navigation
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    try { localStorage.setItem("sidebar_minimized", minimized); } catch { /* ignore */ }
  }, [minimized]);

  useEffect(() => {
    let stop = false;
    async function refresh() {
      try {
        const res = await authFetch("/api/quote-tracker/unmatched");
        const j = await res.json().catch(() => null);
        if (stop || !res.ok || !j?.ok || !Array.isArray(j.items)) { setUnmatchedQuoteCount(0); return; }
        setUnmatchedQuoteCount(j.items.length);
      } catch { if (!stop) setUnmatchedQuoteCount(0); }
    }
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => { stop = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    // Finance is Director-only (the API now 403s non-admins) — only the badge owner polls it.
    if (!can.accessFinance(role)) { setUnmatchedDocCount(0); return; }
    let stop = false;
    async function refresh() {
      try {
        const res = await authFetch("/api/finance/documents/unmatched-count");
        const j = await res.json().catch(() => null);
        if (stop || !res.ok || !j?.ok) { setUnmatchedDocCount(0); return; }
        setUnmatchedDocCount(j.count ?? 0);
      } catch { if (!stop) setUnmatchedDocCount(0); }
    }
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [role]);

  useEffect(() => {
    let stop = false;
    async function refresh() {
      try {
        const res = await authFetch("/api/facts/pending");
        const j = await res.json().catch(() => null);
        if (stop || !res.ok || !j?.ok || !Array.isArray(j.pending)) { setPendingFactCount(0); return; }
        setPendingFactCount(j.pending.length);
      } catch { if (!stop) setPendingFactCount(0); }
    }
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => { stop = true; clearInterval(id); };
  }, []);

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }
  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (dy > 60) { touchStartX.current = null; return; }
    if (!mobileOpen && touchStartX.current < 24 && dx > 50) setMobileOpen(true);
    if (mobileOpen && dx < -50) setMobileOpen(false);
    touchStartX.current = null;
  }

  const sidebarW = minimized ? SIDEBAR_COLLAPSED_W : SIDEBAR_EXPANDED_W;

  // ── Sidebar inner content (shared between desktop + mobile overlay) ────────
  function SidebarContent({ isMobileOverlay = false }) {
    const showFull = isMobileOverlay || !minimized;

    return (
      <div className="flex h-full flex-col bg-[#1B2A3B]">
        {/* Header */}
        <div className={`flex items-center border-b border-white/10 ${showFull ? "justify-between px-4 py-4" : "justify-center px-0 py-4"}`}>
          {showFull ? (
            <BrandLogo variant="primary-white" size="sidebar" alt="Blue Leaf Hub" />
          ) : (
            <BrandLogo variant="icon-white" className="h-8 w-auto" alt="" />
          )}
          {isMobileOverlay ? (
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition"
            >
              {ICONS.close}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMinimized((m) => !m)}
              title={minimized ? "Expand sidebar" : "Collapse sidebar"}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition ${minimized ? "mx-auto" : ""}`}
            >
              {minimized ? ICONS.chevronRight : ICONS.chevronLeft}
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3">
          {can.accessHome(role) ? (
            <NavLink
              to="/home"
              title={!showFull ? "Home" : undefined}
              className={({ isActive }) =>
                `group relative flex w-full items-center transition ${
                  showFull ? "gap-3 px-3 py-2.5" : "justify-center px-0 py-3"
                } ${isActive ? "text-white" : "text-white/60 hover:text-white"}`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r bg-accent" />}
                  <span className={`shrink-0 flex h-9 w-9 items-center justify-center rounded-lg transition ${isActive ? "bg-white/15 text-white" : "group-hover:bg-white/10 text-white/70"}`}>
                    {ICONS.home}
                  </span>
                  {showFull && <span className="text-[13px] font-semibold">Home</span>}
                </>
              )}
            </NavLink>
          ) : null}

          {can.accessHome(role) ? (
            <NavLink
              to="/confirm-queue"
              title={!showFull ? "Confirm Queue" : undefined}
              className={({ isActive }) =>
                `group relative flex w-full items-center transition ${
                  showFull ? "gap-3 px-3 py-2.5" : "justify-center px-0 py-3"
                } ${isActive ? "text-white" : "text-white/60 hover:text-white"}`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r bg-accent" />}
                  <span className={`relative shrink-0 flex h-9 w-9 items-center justify-center rounded-lg transition ${isActive ? "bg-white/15 text-white" : "group-hover:bg-white/10 text-white/70"}`}>
                    {ICONS.review}
                    {!showFull && pendingFactCount > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />
                    )}
                  </span>
                  {showFull && <span className="flex-1 text-[13px] font-semibold">Confirm Queue</span>}
                  {showFull && pendingFactCount > 0 && (
                    <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                      {pendingFactCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ) : null}

          {visibleDepts.length > 0 ? <div className="mx-3 my-2 border-t border-white/10" /> : null}

          {visibleDepts.map((dept) => {
            const deptActive = activeDeptId === dept.id;
            const hasSubModules = dept.modules.length > 1;

            return (
              <div key={dept.id}>
                <button
                  type="button"
                  disabled={dept.comingSoon}
                  title={!showFull ? dept.label : undefined}
                  onClick={() => {
                    if (dept.comingSoon) return;
                    if (dept.defaultTo) navigate(dept.defaultTo);
                  }}
                  className={`group relative flex w-full items-center transition ${
                    showFull ? "gap-3 px-3 py-2.5 mx-0" : "justify-center px-0 py-3"
                  } ${
                    dept.comingSoon
                      ? "cursor-not-allowed opacity-40"
                      : deptActive
                      ? "text-white"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  {/* Active indicator bar */}
                  {deptActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r bg-accent" />
                  )}

                  <span className={`shrink-0 flex h-9 w-9 items-center justify-center rounded-lg transition ${
                    deptActive ? "bg-white/15 text-white" : dept.comingSoon ? "text-white/40" : "text-white/70 group-hover:bg-white/10 group-hover:text-white"
                  }`}>
                    {ICONS[dept.icon]}
                  </span>

                  {showFull && (
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-[13px] font-semibold leading-tight truncate">{dept.label}</span>
                      {dept.comingSoon && (
                        <span className="block text-[10px] text-warning/80 font-semibold uppercase tracking-wide leading-tight">Coming soon</span>
                      )}
                    </span>
                  )}
                </button>

                {/* Sub-modules */}
                {showFull && deptActive && hasSubModules && (
                  <div className="mb-1 ml-12 mr-2 space-y-0.5">
                    {dept.modules.map((m) => (
                      <NavLink
                        key={m.to}
                        to={m.to}
                        end={m.end}
                        className={({ isActive }) =>
                          `flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium transition ${
                            isActive
                              ? "bg-white/10 text-white"
                              : "text-white/50 hover:bg-white/5 hover:text-white/80"
                          }`
                        }
                      >
                        <span className="flex-1 truncate">{m.label}</span>
                        {m.to === "/tender-manager/rfq-packages" && unmatchedQuoteCount > 0 && (
                          <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                            {unmatchedQuoteCount}
                          </span>
                        )}
                        {m.to === "/finance" && unmatchedDocCount > 0 && (
                          <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                            {unmatchedDocCount}
                          </span>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer: settings + user */}
        <div className="border-t border-white/10 py-2">
          {role === "admin" ? (
            <NavLink
              to="/settings/users"
              title={!showFull ? "Users" : undefined}
              className={({ isActive }) =>
                `group flex items-center transition ${showFull ? "gap-3 px-3 py-2.5" : "justify-center px-0 py-3"} ${
                  isActive ? "text-white" : "text-white/50 hover:text-white"
                }`
              }
            >
              <span className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg group-hover:bg-white/10">
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                </svg>
              </span>
              {showFull && <span className="text-[13px] font-semibold">Users</span>}
            </NavLink>
          ) : null}
          {role === "admin" ? (
            <NavLink
              to="/documents-templates"
              title={!showFull ? "Templates" : undefined}
              className={({ isActive }) =>
                `group flex items-center transition ${showFull ? "gap-3 px-3 py-2.5" : "justify-center px-0 py-3"} ${
                  isActive ? "text-white" : "text-white/50 hover:text-white"
                }`
              }
            >
              <span className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg group-hover:bg-white/10">
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <path d="M14 2v6h6M9 13h6M9 17h6" />
                </svg>
              </span>
              {showFull && <span className="text-[13px] font-semibold">Templates</span>}
            </NavLink>
          ) : null}
          {role === "admin" ? (
            <NavLink
              to="/field"
              title={!showFull ? "Field app" : undefined}
              className={({ isActive }) =>
                `group flex items-center transition ${showFull ? "gap-3 px-3 py-2.5" : "justify-center px-0 py-3"} ${
                  isActive ? "text-white" : "text-white/50 hover:text-white"
                }`
              }
            >
              <span className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg group-hover:bg-white/10">
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 18h.01M8 21h8a1 1 0 001-1V4a1 1 0 00-1-1H8a1 1 0 00-1 1v16a1 1 0 001 1z" />
                </svg>
              </span>
              {showFull && <span className="text-[13px] font-semibold">Field app</span>}
            </NavLink>
          ) : null}
          <NavLink
            to="/tender-manager/settings"
            title={!showFull ? "Settings" : undefined}
            className={({ isActive }) =>
              `group flex items-center transition ${showFull ? "gap-3 px-3 py-2.5" : "justify-center px-0 py-3"} ${
                isActive ? "text-white" : "text-white/50 hover:text-white"
              }`
            }
          >
            <span className={`shrink-0 flex h-9 w-9 items-center justify-center rounded-lg transition group-hover:bg-white/10`}>
              {ICONS.settings}
            </span>
            {showFull && <span className="text-[13px] font-semibold">Settings</span>}
          </NavLink>

          {showFull && user?.email && (
            <div className="px-4 pt-2 pb-1">
              <div className="text-[11px] text-white/40 truncate">{user.email}</div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="mt-0.5 text-[11px] font-semibold text-white/40 hover:text-white/80 transition"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-page md:pl-[var(--blh-sidebar-w)]"
      style={{ "--blh-sidebar-w": `${sidebarW}px` }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Desktop sidebar (always visible, collapsible) ───────────── */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden md:block overflow-hidden transition-all duration-200"
        style={{ width: `${sidebarW}px` }}
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile: overlay backdrop ──────────────────────────────────── */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 md:hidden ${
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setMobileOpen(false)}
        aria-hidden
      />

      {/* ── Mobile: sliding sidebar overlay ──────────────────────────── */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-300 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent isMobileOverlay />
      </div>

      {/* ── Mobile header ─────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 border-b border-hairline bg-surface/95 backdrop-blur md:hidden"
      >
        <div className="flex items-center gap-3 px-3 py-3">
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-page"
            aria-label="Open menu"
          >
            {ICONS.hamburger}
          </button>
          <div className="flex-1 min-w-0">
            {activeDept && (
              <div className="text-[11px] text-muted leading-tight truncate">{activeDept.label}</div>
            )}
          </div>
          {user?.email && (
            <button
              type="button"
              onClick={() => void signOut()}
              className="shrink-0 text-[11px] font-semibold text-muted hover:text-ink"
            >
              Log out
            </button>
          )}
        </div>
      </header>

      {/* ── Project context bar (all departments) ── */}
      <ProjectBar />

      {/* ── Main content ──────────────────────────────────────────────── */}
      <main className="mx-auto max-w-6xl px-4 py-6 md:py-10 pb-24 md:pb-10">
        <Outlet />
      </main>

      {/* ── Quick Add FAB ─────────────────────────────────────────────── */}
      <div className={`fixed bottom-20 right-4 z-50 md:bottom-6 md:right-6 ${leadDetailActionMode ? "hidden lg:block" : ""}`}>
        {quickAddOpen ? (
          <>
            <div className="fixed inset-0 z-[-1]" onClick={() => setQuickAddOpen(false)} />
            <div className="absolute bottom-14 right-0 w-44 rounded-lg border border-hairline bg-surface shadow-xl overflow-hidden">
              {visibleQuickAdd.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => { navigate(item.path(project?.id || activeProjectId)); setQuickAddOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-ink hover:bg-page transition"
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => setQuickAddOpen((v) => !v)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition text-xl font-light"
          aria-label="Quick add"
        >
          {quickAddOpen ? "×" : "+"}
        </button>
      </div>

      {/* ── Mobile bottom nav ─────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-hairline bg-surface md:hidden">
        <div className="flex justify-around px-1 py-2">
          {visibleDepts.filter(d => d.id !== "client_portal").map((dept) => {
            const active =
              (dept.id === "sales_marketing" && location.pathname.startsWith("/sales")) ||
              (dept.id === "tender" && location.pathname.startsWith("/tender-manager")) ||
              (dept.id === "operations_manager" && location.pathname.startsWith("/operations")) ||
              (dept.id === "finance_manager" && location.pathname.startsWith("/finance")) ||
              (dept.id === "marketing_agent" && location.pathname.startsWith("/marketing"));
            return (
              <button
                key={dept.id}
                type="button"
                disabled={dept.comingSoon}
                onClick={() => {
                  if (dept.comingSoon) return;
                  if (dept.defaultTo) navigate(dept.defaultTo);
                }}
                className={`flex min-w-[52px] flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition ${
                  dept.comingSoon ? "cursor-not-allowed opacity-40 text-muted" : active ? "text-primary" : "text-ink"
                }`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? "bg-primary/10 text-primary" : "text-muted"}`}>
                  {ICONS[dept.icon]}
                </span>
                <span className="leading-tight truncate max-w-[60px] text-center">{dept.tabShort}</span>
                {dept.comingSoon && (
                  <span className="text-[8px] font-bold uppercase text-warning leading-none">Soon</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className={leadDetailActionMode ? "hidden lg:contents" : "contents"}>
        <BlueprintAgent
          mode="widget"
          jobContext={screenContext}
          hubContext={{ page: location.pathname, department: activeDeptId, ...screenContext }}
        />
      </div>
    </div>
  );
}

import React, { Suspense, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useParams } from "react-router-dom";
import { verifyPortal, getPortalHome } from "../../lib/portalApi.js";
import { PORTAL_CHROME } from "../../lib/portalUtils.js";
import { PortalContext } from "./portalContext.js";
import PortalPageSkeleton from "../../components/portal/PortalPageSkeleton.jsx";
import BrandLoading from "../../components/brand/BrandLoading.jsx";
import LeafWatermark from "../../components/brand/LeafWatermark.jsx";
import PortalSidebarBrand from "../../components/brand/PortalSidebarBrand.jsx";

const PortalHome = React.lazy(() => import("./PortalHome.jsx"));
const PortalTimeline = React.lazy(() => import("./PortalTimeline.jsx"));
const PortalLiveSite = React.lazy(() => import("./PortalLiveSite.jsx"));
const PortalDecisions = React.lazy(() => import("./PortalDecisions.jsx"));
const PortalBudget = React.lazy(() => import("./PortalBudget.jsx"));
const PortalJournal = React.lazy(() => import("./PortalJournal.jsx"));
const PortalMyHome = React.lazy(() => import("./PortalMyHome.jsx"));
const PortalConversations = React.lazy(() => import("./PortalConversations.jsx"));

const NAV = [
  { to: "home", label: "Home", icon: "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3m10-11v10a1 1 0 01-1 1h-3m-4 0h4" },
  { to: "timeline", label: "Timeline", icon: "M4 6h16M4 12h16M4 18h10" },
  { to: "live", label: "Live Site", icon: "M3 7h3l2-3h8l2 3h3v12H3V7z" },
  { to: "decisions", label: "Decisions", icon: "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" },
  { to: "budget", label: "Your Investment", icon: "M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" },
  { to: "journal", label: "Journal", icon: "M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" },
  { to: "myhome", label: "Your Home", icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4v-2.586l.586-.586" },
  { to: "conversations", label: "Conversations", icon: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" }
];

function NavIcon({ d }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function SidebarNav({ token, pendingCount }) {
  const base = `/portal/${token}`;
  return (
    <nav className="flex-1 py-4 space-y-0.5">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={`${base}/${item.to}`}
          className={({ isActive }) =>
            `relative flex items-center gap-3 px-4 py-2.5 rounded-lg mx-2 text-[13px] font-medium ${
              isActive ? "bg-white/10 text-white" : "text-white/60 hover:text-white hover:bg-white/5"
            }`
          }
        >
          <NavIcon d={item.icon} />
          {item.label}
          {item.to === "decisions" && pendingCount > 0 && (
            <span className="absolute -top-1 right-2 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export default function PortalApp() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await verifyPortal(token);
        if (cancelled) return;
        setProject({
          projectId: p.projectId,
          clientName: p.clientName,
          address: p.address,
          completionDateEst: p.completionDateEst
        });
        setNotFound(false);
        const home = await getPortalHome(token);
        if (!cancelled) setPendingCount(home.pendingDecisions?.length || 0);
      } catch (e) {
        if (!cancelled && e.status === 404) setNotFound(true);
        else if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return <BrandLoading message="Preparing your project portal…" className="bg-[#F6F4F0]" />;
  }

  if (notFound || !project) {
    return (
      <div className="relative min-h-screen bg-[#F6F4F0] flex flex-col items-center justify-center px-4 text-center overflow-hidden">
        <div className="relative z-10 flex flex-col items-center">
          <PortalSidebarBrand address={null} />
          <h1 className="text-2xl font-bold text-ink mb-2">Portal not found</h1>
          <p className="text-muted text-base max-w-sm">
            This link may have expired or the portal isn&apos;t active yet. Contact your builder for a
            new link.
          </p>
        </div>
      </div>
    );
  }

  const ctx = { project, token };
  const base = `/portal/${token}`;
  const mobileMain = [
    { to: "home", label: "Home" },
    { to: "timeline", label: "Timeline" },
    { to: "live", label: "Live" },
    { to: "decisions", label: "Decisions" }
  ].map((item) => ({
    ...item,
    icon: NAV.find((n) => n.to === item.to)?.icon
  }));
  const mobileMore = NAV.filter((n) => !mobileMain.find((m) => m.to === n.to));

  return (
    <PortalContext.Provider value={ctx}>
      <div className="min-h-screen bg-[#F6F4F0] md:flex">
        <aside
          className="hidden md:flex md:flex-col md:w-56 md:fixed md:inset-y-0 text-white"
          style={{ backgroundColor: PORTAL_CHROME.base }}
        >
          <div className="p-5 border-b border-white/10">
            <PortalSidebarBrand address={project.address} />
          </div>
          <SidebarNav token={token} pendingCount={pendingCount} />
        </aside>

        <header
          className="md:hidden sticky top-0 z-30 text-white shadow-sm"
          style={{ backgroundColor: PORTAL_CHROME.base }}
        >
          <div className="border-b border-white/10 px-4 py-3">
            <PortalSidebarBrand address={project.address} />
          </div>
        </header>

        <main className="relative flex-1 md:ml-56 min-h-screen bg-[#F6F4F0] overflow-hidden">
          <LeafWatermark position="bottom-right" />
          <div className="relative z-10">
          <Suspense fallback={<PortalPageSkeleton />}>
            <Routes>
              <Route index element={<Navigate to="home" replace />} />
              <Route path="home" element={<PortalHome />} />
              <Route path="timeline" element={<PortalTimeline />} />
              <Route path="live" element={<PortalLiveSite />} />
              <Route path="decisions" element={<PortalDecisions />} />
              <Route path="budget" element={<PortalBudget />} />
              <Route path="journal" element={<PortalJournal />} />
              <Route path="myhome" element={<PortalMyHome />} />
              <Route path="conversations" element={<PortalConversations />} />
            </Routes>
          </Suspense>
          </div>
        </main>

        <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-hairline z-40 md:hidden flex justify-around">
          {mobileMain.map((item) => (
            <NavLink
              key={item.to}
              to={`${base}/${item.to}`}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-0.5 text-[10px] font-semibold py-2 px-3 ${
                  isActive ? "text-primary" : "text-muted"
                }`
              }
            >
              {item.icon ? <NavIcon d={item.icon} /> : null}
              {item.label}
              {item.to === "decisions" && pendingCount > 0 ? (
                <span className="absolute top-0.5 right-1 text-[8px] bg-red-500 text-white rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              ) : null}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-0.5 text-[10px] font-semibold py-2 px-3 text-muted"
          >
            More
          </button>
        </nav>

        {moreOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 bg-black/40 z-30 md:hidden"
              aria-label="Close menu"
              onClick={() => setMoreOpen(false)}
            />
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-2xl p-4 pb-8 md:hidden">
              <p className="text-sm font-bold text-ink mb-3">More</p>
              <div className="grid grid-cols-2 gap-2">
                {mobileMore.map((item) => (
                  <NavLink
                    key={item.to}
                    to={`${base}/${item.to}`}
                    onClick={() => setMoreOpen(false)}
                    className="rounded-lg border border-hairline px-4 py-3 text-sm font-medium text-ink"
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </PortalContext.Provider>
  );
}

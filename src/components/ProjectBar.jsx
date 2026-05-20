import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useProject } from "../lib/ProjectContext.jsx";

// Department-contextual quick links
function quickLinks(project, pathname) {
  if (!project) return [];
  const id = project.id;
  const jobId = project.job_id;

  if (pathname.startsWith("/operations")) {
    return [
      { label: "Overview",   to: `/operations/${id}` },
      { label: "Schedule",   to: `/operations/${id}/schedule` },
      { label: "Diary",      to: `/operations/${id}/diary` },
      { label: "WHS",        to: `/operations/${id}/whs` },
    ];
  }
  if (pathname.startsWith("/tender-manager")) {
    return [
      { label: "Quotes",     to: "/tender-manager/rfq-packages" },
      { label: "RFQ Engine", to: "/tender-manager/rfq-engine" },
      ...(jobId ? [{ label: "Board", to: `/tender-manager/board/${jobId}` }] : [{ label: "Board", to: "/tender-manager/board" }]),
    ];
  }
  if (pathname.startsWith("/finance")) {
    return [
      { label: "Inbox",    to: "/finance" },
      { label: "Job View", to: "/finance/jobs" },
    ];
  }
  return [];
}

export default function ProjectBar() {
  const { project, selectProject, clearProject, allProjects } = useProject();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropRef = useRef(null);
  const inputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  // Close dropdown on navigation
  useEffect(() => { setOpen(false); setSearch(""); }, [location.pathname]);

  const filtered = search.trim()
    ? allProjects.filter((p) => p.address.toLowerCase().includes(search.toLowerCase()))
    : allProjects;

  const links = quickLinks(project, location.pathname);

  function pick(p) {
    selectProject(p);
    setOpen(false);
    setSearch("");
    // Navigate to the project's overview page when selected from a non-project route
    if (location.pathname.startsWith("/operations") && !location.pathname.includes(p.id)) {
      navigate(`/operations/${p.id}`);
    }
  }

  if (allProjects.length === 0) return null;

  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-hairline bg-surface/95 backdrop-blur-sm px-4 md:px-6 py-2 min-h-[40px]">
      {/* Project picker */}
      <div className="relative" ref={dropRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-hairline bg-page px-3 py-1.5 text-sm font-semibold text-ink hover:border-primary/40 hover:bg-primary/5 transition max-w-[220px] md:max-w-xs"
        >
          <span className="shrink-0 text-primary">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </span>
          <span className="truncate">
            {project ? project.address : <span className="text-muted font-normal">Select project…</span>}
          </span>
          <svg className="shrink-0 text-muted" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 w-72 rounded-xl border border-hairline bg-surface shadow-xl overflow-hidden z-50">
            <div className="p-2 border-b border-hairline">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search projects…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-hairline bg-page px-3 py-1.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <ul className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted">No projects found</li>
              )}
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => pick(p)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-page ${project?.id === p.id ? "bg-primary/5 font-semibold text-primary" : "text-ink"}`}
                  >
                    {project?.id === p.id && (
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                    <span className={`truncate ${project?.id === p.id ? "" : "ml-[20px]"}`}>{p.address}</span>
                  </button>
                </li>
              ))}
            </ul>
            {project && (
              <div className="border-t border-hairline p-1">
                <button
                  type="button"
                  onClick={() => { clearProject(); setOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted hover:bg-danger/5 hover:text-danger transition"
                >
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                  Clear — show all projects
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Contextual quick links */}
      {links.length > 0 && (
        <nav className="hidden md:flex items-center gap-0.5 ml-1">
          {links.map((link) => {
            const active = location.pathname === link.to || location.pathname.startsWith(link.to + "/");
            return (
              <button
                key={link.to}
                type="button"
                onClick={() => navigate(link.to)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  active ? "bg-primary/10 text-primary" : "text-muted hover:text-ink hover:bg-page"
                }`}
              >
                {link.label}
              </button>
            );
          })}
        </nav>
      )}

      {/* Clear button (desktop, far right) — only when no quick links shown to avoid clutter */}
      {project && links.length === 0 && (
        <button
          type="button"
          onClick={clearProject}
          title="Clear project context"
          className="ml-auto text-muted hover:text-danger transition"
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

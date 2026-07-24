import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useProject } from "../lib/ProjectContext.jsx";

const HomeIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const ChevronIcon = () => (
  <svg className="shrink-0 text-muted" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const CheckIcon = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const XIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

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
      ...(jobId ? [{ label: "Financials", to: `/finance/jobs/${jobId}` }] : []),
    ];
  }
  if (pathname.startsWith("/tender-manager")) {
    return [
      ...(jobId ? [{ label: "Tender", to: `/tender-manager/board/${jobId}` }] : [{ label: "Tenders", to: "/tender-manager/board" }]),
      { label: "New tender", to: "/tender-manager/rfq-engine" },
    ];
  }
  if (pathname.startsWith("/finance")) {
    return [
      { label: "Inbox",      to: "/finance" },
      { label: "Approvals",  to: "/finance/approvals" },
      ...(jobId ? [{ label: "Job Dashboard", to: `/finance/jobs/${jobId}` }] : [{ label: "All Jobs", to: "/finance/jobs" }]),
    ];
  }
  return [];
}

// Shared project list content used in both dropdown and bottom sheet
function ProjectList({ filtered, project, onPick, onClear, search, setSearch, inputRef }) {
  return (
    <>
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
      <ul className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted">No projects found</li>
        )}
        {filtered.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p)}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-page ${project?.id === p.id ? "bg-primary/5 font-semibold text-primary" : "text-ink"}`}
            >
              {project?.id === p.id ? <CheckIcon /> : <span className="w-3" />}
              <span className="truncate">{p.address}</span>
            </button>
          </li>
        ))}
      </ul>
      {project && (
        <div className="border-t border-hairline p-1">
          <button
            type="button"
            onClick={onClear}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted hover:bg-danger/5 hover:text-danger transition"
          >
            <XIcon />
            Clear — show all projects
          </button>
        </div>
      )}
    </>
  );
}

export default function ProjectBar() {
  const { project, selectProject, clearProject, allProjects } = useProject();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropRef = useRef(null);
  const inputRef = useRef(null);
  const sheetInputRef = useRef(null);

  // Close desktop dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search when picker opens
  useEffect(() => {
    if (!open) return;
    const ref = window.innerWidth >= 768 ? inputRef : sheetInputRef;
    if (ref.current) ref.current.focus();
  }, [open]);

  // Close on navigation
  useEffect(() => { setOpen(false); setSearch(""); }, [location.pathname]);

  // Prevent body scroll when bottom sheet is open on mobile
  useEffect(() => {
    if (open && window.innerWidth < 768) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  const filtered = search.trim()
    ? allProjects.filter((p) => p.address.toLowerCase().includes(search.toLowerCase()))
    : allProjects;

  const links = quickLinks(project, location.pathname);

  function pick(p) {
    selectProject(p);
    setOpen(false);
    setSearch("");
    if (location.pathname.startsWith("/operations") && !location.pathname.includes(p.id)) {
      navigate(`/operations/${p.id}`);
    }
  }

  function handleClear() {
    clearProject();
    setOpen(false);
  }

  if (allProjects.length === 0) return null;

  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-hairline bg-surface/95 backdrop-blur-sm px-4 md:px-6 py-2 min-h-[40px]">
      {/* Trigger button */}
      <div className="relative" ref={dropRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-hairline bg-page px-3 py-1.5 text-sm font-semibold text-ink hover:border-primary/40 hover:bg-primary/5 transition max-w-[200px] md:max-w-xs"
        >
          <span className="shrink-0 text-primary"><HomeIcon /></span>
          <span className="truncate">
            {project ? project.address : <span className="text-muted font-normal">Select project…</span>}
          </span>
          <ChevronIcon />
        </button>

        {/* Desktop dropdown */}
        {open && (
          <div className="hidden md:flex flex-col absolute left-0 top-full mt-1 w-72 max-h-80 rounded-xl border border-hairline bg-surface shadow-xl overflow-hidden z-50">
            <ProjectList
              filtered={filtered}
              project={project}
              onPick={pick}
              onClear={handleClear}
              search={search}
              setSearch={setSearch}
              inputRef={inputRef}
            />
          </div>
        )}
      </div>

      {/* Mobile bottom sheet */}
      {open && (
        <div className="md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Sheet */}
          <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t border-hairline bg-surface shadow-2xl max-h-[75vh]">
            {/* Handle + title */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-hairline">
              <div className="mx-auto mb-2 absolute top-2 left-1/2 -translate-x-1/2 h-1 w-10 rounded-full bg-hairline" />
              <span className="text-sm font-bold text-ink mt-1">Select project</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-page text-muted hover:text-ink"
              >
                <XIcon size={14} />
              </button>
            </div>
            <div className="flex flex-col overflow-hidden flex-1">
              <ProjectList
                filtered={filtered}
                project={project}
                onPick={pick}
                onClear={handleClear}
                search={search}
                setSearch={setSearch}
                inputRef={sheetInputRef}
              />
            </div>
          </div>
        </div>
      )}

      {/* Contextual quick links (desktop only) */}
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

      {/* Clear button (far right) — only when no quick links to avoid clutter */}
      {project && links.length === 0 && (
        <button
          type="button"
          onClick={clearProject}
          title="Clear project context"
          className="ml-auto text-muted hover:text-danger transition"
        >
          <XIcon size={14} />
        </button>
      )}
    </div>
  );
}

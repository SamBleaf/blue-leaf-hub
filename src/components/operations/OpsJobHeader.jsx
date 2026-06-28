// Operations job command-centre header (presentational). Compact: back link, address,
// phase/progress/ETA, progress bar. `children` = right-side actions (primary + secondary links).
import { Link } from "react-router-dom";
import StatusBadge from "../ui/StatusBadge.jsx";

export default function OpsJobHeader({ project, summary, children }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline pb-4 pt-1">
      <div className="min-w-0">
        <Link to="/operations" className="text-xs font-semibold text-muted hover:text-primary focus-ring">← Projects</Link>
        <h1 className="page-title mt-1 truncate">{project.address}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {summary.currentPhase ? <StatusBadge variant="stage">{summary.currentPhase}</StatusBadge> : null}
          {summary.pct > 0 ? <span className="text-xs text-muted">{summary.pct}% complete</span> : null}
          {summary.projected ? <span className="text-xs text-muted">· ETA {summary.projected}</span> : null}
          {project.tentative_start_date && !summary.total ? <span className="text-xs text-muted">Tentative start {project.tentative_start_date}</span> : null}
        </div>
        {summary.pct > 0 ? (
          <div className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-hairline">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${summary.pct}%` }} />
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </header>
  );
}

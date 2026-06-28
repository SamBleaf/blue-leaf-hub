// Operations project card (presentational) — board view. Whole card links to the project hub.
import { Link } from "react-router-dom";
import StatusBadge from "../ui/StatusBadge.jsx";
import { PROJECT_COLORS, healthMeta, fmtDate } from "../../lib/operationsDashboard.js";

export default function OpsProjectCard({ project, colorIdx = 0 }) {
  const s = project.schedule || {};
  const color = PROJECT_COLORS[colorIdx % PROJECT_COLORS.length];
  const h = healthMeta(s.health);
  const won = project.jobs?.won_at ? fmtDate(project.jobs.won_at) : "—";

  return (
    <Link
      to={`/operations/${project.id}`}
      className="block rounded-card border border-hairline bg-surface p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md focus-ring"
      style={{ borderTopColor: color, borderTopWidth: 3 }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold leading-snug text-primary">{project.address}</h3>
        <StatusBadge variant={h.variant} dot>{h.label}</StatusBadge>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>{s.done || 0}/{s.total || 0} tasks done</span>
          <span className="font-semibold text-ink">{s.overall || 0}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-hairline">
          <div className="h-full rounded transition-all" style={{ width: `${s.overall || 0}%`, backgroundColor: color }} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {s.overdue > 0 && <StatusBadge variant="danger">{s.overdue} overdue</StatusBadge>}
        <span className="text-muted">👷 {s.activeTrades?.length || 0} trades</span>
        {project.buildexact_job_id
          ? <StatusBadge variant="success">BX linked</StatusBadge>
          : <StatusBadge variant="warning">BX pending</StatusBadge>}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
        <span className="min-w-0 truncate">
          {s.nextMilestone ? <>Next: <strong className="text-ink">{s.nextMilestone.name}</strong></> : "No upcoming milestone"}
        </span>
        <span className="shrink-0">Won {won}</span>
      </div>
    </Link>
  );
}

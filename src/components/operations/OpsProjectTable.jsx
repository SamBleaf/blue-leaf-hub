// Operations project table (presentational) — list view (desktop). Responsive: callers render
// OpsProjectCard below lg so this never becomes a squeezed mobile table.
import { Link } from "react-router-dom";
import StatusBadge from "../ui/StatusBadge.jsx";
import { PROJECT_COLORS, healthMeta, fmtDate } from "../../lib/operationsDashboard.js";

function Row({ project, colorIdx }) {
  const s = project.schedule || {};
  const color = PROJECT_COLORS[colorIdx % PROJECT_COLORS.length];
  const h = healthMeta(s.health);
  const won = project.jobs?.won_at ? fmtDate(project.jobs.won_at) : "—";
  return (
    <tr className="border-b border-hairline hover:bg-page">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: color }} />
          <Link to={`/operations/${project.id}`} className="text-sm font-semibold text-primary hover:underline focus-ring">{project.address}</Link>
        </div>
      </td>
      <td className="px-3 py-2.5"><StatusBadge variant={h.variant} dot>{h.label}</StatusBadge></td>
      <td className="px-3 py-2.5 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded bg-hairline">
            <div className="h-full rounded" style={{ width: `${s.overall || 0}%`, backgroundColor: color }} />
          </div>
          <span className="text-xs text-muted">{s.overall || 0}%</span>
        </div>
      </td>
      <td className="max-w-[160px] truncate px-3 py-2.5 text-xs text-muted">
        {s.nextMilestone ? <span className="font-medium text-ink">{s.nextMilestone.name}</span> : <span className="text-muted">—</span>}
      </td>
      <td className="px-3 py-2.5 text-xs">
        {s.overdue > 0 ? <span className="font-semibold text-danger">{s.overdue}</span> : <span className="text-green-600">—</span>}
      </td>
      <td className="px-3 py-2.5 text-xs text-muted">{s.activeTrades?.length || 0}</td>
      <td className="px-3 py-2.5 text-xs text-muted">{won}</td>
      <td className="px-3 py-2.5 text-xs">
        {project.buildexact_job_id ? <span className="font-semibold text-accent">Linked</span> : <span className="text-warning">Pending</span>}
      </td>
    </tr>
  );
}

export default function OpsProjectTable({ projects = [] }) {
  return (
    <div className="overflow-x-auto rounded-card border border-hairline bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="section-label border-b border-hairline bg-page">
          <tr>
            {["Address", "Health", "Progress", "Next Milestone", "Risk", "Trades", "Won", "BX"].map((hd) => (
              <th key={hd} className="px-3 py-2.5">{hd}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((p, i) => <Row key={p.id} project={p} colorIdx={i} />)}
        </tbody>
      </table>
    </div>
  );
}

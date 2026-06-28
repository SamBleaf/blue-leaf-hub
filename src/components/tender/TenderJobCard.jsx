// Tender job card (presentational) — coverage, missing/chase signals, ⋯ archive/delete menu.
// All actions via callbacks; data/handlers stay in the page.
import StatusBadge from "../ui/StatusBadge.jsx";
import { rfqStats, STATUS_META, fmtDate } from "../../lib/tenderDashboard.js";

export default function TenderJobCard({ job, onOpen, menuOpen, onToggleMenu, onArchive, onDelete }) {
  const s = rfqStats(job);
  const meta = STATUS_META[job.status] || STATUS_META.tendering;
  const firstSent = (job.rfqs || []).map((r) => r.sent_at).filter(Boolean).sort()[0];
  return (
    <div className="relative rounded-card border border-hairline bg-surface shadow-sm transition hover:border-primary/40 hover:shadow-md">
      <div className="flex w-full items-stretch">
        <button type="button" onClick={() => onOpen(job.id)} className="min-w-0 flex-1 p-4 text-left focus-ring">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold text-primary">{job.address || "—"}</h3>
            <StatusBadge variant={meta.variant} dot>{meta.label}</StatusBadge>
          </div>
          {s.total > 0 ? (
            <>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-page"><div className="h-full rounded-full bg-primary" style={{ width: `${s.coverage}%` }} /></div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted">{s.coverage}% quote coverage · {s.total} trades</span>
                {s.chase > 0 && <StatusBadge variant="danger">{s.chase} chase due</StatusBadge>}
                {s.missing - s.chase > 0 && <StatusBadge variant="warning">{s.missing - s.chase} outstanding</StatusBadge>}
                {s.ready && <StatusBadge variant="success">Ready to award</StatusBadge>}
              </div>
            </>
          ) : <p className="mt-2 text-xs text-muted">No RFQs yet</p>}
          <p className="mt-1.5 text-[11px] text-muted">RFQs sent {fmtDate(firstSent)}</p>
        </button>
        <div className="flex shrink-0 flex-col border-l border-hairline bg-page/30">
          <button type="button" title="Job actions" className="px-3 py-5 text-lg leading-none text-muted hover:text-ink"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleMenu(job.id); }}>⋯</button>
        </div>
      </div>
      {menuOpen ? (
        <div className="absolute right-2 top-12 z-30 min-w-[11rem] rounded-lg border border-hairline bg-surface py-1 text-sm shadow-lg">
          {job.status !== "archived" ? (
            <button type="button" className="block w-full px-3 py-2 text-left hover:bg-page"
              onClick={() => { onToggleMenu(null); if (window.confirm("Archive this tender? It becomes read-only.")) onArchive(job.id); }}>Archive</button>
          ) : null}
          <button type="button" className="block w-full px-3 py-2 text-left font-semibold text-danger hover:bg-danger/10"
            onClick={() => { onToggleMenu(null); onDelete({ id: job.id, address: job.address || "—" }); }}>Delete job</button>
        </div>
      ) : null}
    </div>
  );
}

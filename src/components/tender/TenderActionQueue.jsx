// Tender/RFQ Action Queue (presentational) — ranked missing quotes / chases due / ready to award.
import { Link } from "react-router-dom";
import SectionCard from "../ui/SectionCard.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import { ACTION_ICON } from "../../lib/tenderDashboard.js";

export default function TenderActionQueue({ actions = [], title = "Needs action now", desc = "Missing quotes · chases due · ready to award" }) {
  return (
    <SectionCard title={title} desc={desc}>
      {actions.length ? (
        <div className="space-y-2">
          {actions.map((a) => (
            <div key={a.id} className="flex items-start gap-3 rounded-lg border border-hairline bg-surface p-3">
              <span className="mt-0.5 text-lg leading-none">{ACTION_ICON[a.kind] || "•"}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-ink">{a.title}</span><StatusBadge variant={a.tone}>{a.badge}</StatusBadge></div>
                <div className="mt-0.5 truncate text-xs text-muted">{a.detail}</div>
              </div>
              {a.jobId && <Link to={`/tender-manager/board/${a.jobId}`} className="shrink-0 self-center rounded-lg border border-hairline px-2.5 py-1 text-[11px] font-semibold text-primary focus-ring">Open →</Link>}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState compact title="Nothing needs action" hint="No outstanding quotes, chases, or awards across active tenders." />
      )}
    </SectionCard>
  );
}

/**
 * SalesMobileLeadList — tablet + mobile (< lg) pipeline view (Pass 2 redesign).
 * A grouped lead list (stage chips + grouped sections), NOT a squeezed kanban.
 * Off-pipeline Nurture/Lost render as collapsible groups at the end.
 */
import { useState } from "react";
import StatusBadge from "../ui/StatusBadge.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import SalesLeadCard from "./SalesLeadCard.jsx";

function OffGroup({ label, leads, onMoveStage, onQuickNote, onOpen }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-sm font-semibold text-muted">
        <span className={`text-[10px] transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        {label}
        <StatusBadge variant="neutral">{leads.length}</StatusBadge>
      </button>
      {open && <div className="mt-2 space-y-2">{leads.map((l) => <SalesLeadCard key={l.id} lead={l} onMoveStage={onMoveStage} onQuickNote={onQuickNote} onClick={() => onOpen(l.id)} />)}</div>}
    </div>
  );
}

export default function SalesMobileLeadList({
  className = "", stages, leadsByStage, loading,
  nurtureLeads = [], lostLeads = [], onMoveStage, onQuickNote, onOpen,
}) {
  const activeStages = stages.filter((s) => (leadsByStage[s.id] || []).length);
  const offGroups = [
    { label: "Nurture", leads: nurtureLeads },
    { label: "Lost", leads: lostLeads },
  ].filter((g) => g.leads.length);

  return (
    <div className={className}>
      {/* stage chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-2">
        {stages.map((s) => (
          <span key={s.id} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-hairline bg-surface px-2.5 py-1 text-xs font-semibold text-muted">
            {s.label}
            <span className="rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500">{(leadsByStage[s.id] || []).length}</span>
          </span>
        ))}
      </div>

      {loading ? (
        <div className="mt-3 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-surface" />)}</div>
      ) : !activeStages.length && !offGroups.length ? (
        <EmptyState title="No leads match" hint="Try a different filter, or add a lead." />
      ) : (
        <div className="mt-2 space-y-4">
          {activeStages.map((s) => (
            <div key={s.id}>
              <div className="mb-1.5 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-ink">{s.label}</h2>
                <StatusBadge variant="stage">{(leadsByStage[s.id] || []).length}</StatusBadge>
              </div>
              <div className="space-y-2">
                {(leadsByStage[s.id] || []).map((l) => (
                  <SalesLeadCard key={l.id} lead={l} onMoveStage={onMoveStage} onQuickNote={onQuickNote} onClick={() => onOpen(l.id)} />
                ))}
              </div>
            </div>
          ))}
          {offGroups.length > 0 && (
            <div className="space-y-3 border-t border-hairline pt-3">
              {offGroups.map((g) => (
                <OffGroup key={g.label} label={g.label} leads={g.leads} onMoveStage={onMoveStage} onQuickNote={onQuickNote} onOpen={onOpen} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

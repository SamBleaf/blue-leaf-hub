/**
 * SalesKanbanBoard — desktop (lg+) pipeline board (Pass 2 redesign).
 * All 8 stage columns + an off-pipeline Nurture/Lost dock (minimised, expandable).
 * Horizontal scroll with a right-edge fade affordance.
 */
import { useState } from "react";
import SalesKanbanColumn from "./SalesKanbanColumn.jsx";
import SalesLeadCard from "./SalesLeadCard.jsx";

function DockGroup({ label, leads, open, onToggle, onMoveStage, onQuickNote, onOpen }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left">
        <span className="text-xs font-semibold text-ink">{label}</span>
        <span className="flex items-center gap-1.5">
          <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600">{leads.length}</span>
          <span className={`text-[10px] text-muted transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        </span>
      </button>
      {open && leads.length > 0 && (
        <div className="max-h-[52vh] space-y-2 overflow-y-auto border-t border-hairline p-2">
          {leads.map((l) => (
            <SalesLeadCard key={l.id} lead={l} onMoveStage={onMoveStage} onQuickNote={onQuickNote} onClick={() => onOpen(l.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SalesKanbanBoard({
  className = "", stages, leadsByStage, loading,
  nurtureLeads = [], lostLeads = [], onMoveStage, onQuickNote, onOpen,
}) {
  const [openGroup, setOpenGroup] = useState(null); // 'nurture' | 'lost' | null
  const hasDock = nurtureLeads.length > 0 || lostLeads.length > 0;

  return (
    <div className={className}>
      <div className="relative">
        <div className="flex items-start gap-3 overflow-x-auto pb-3">
          {stages.map((s) => (
            <SalesKanbanColumn
              key={s.id}
              stage={s}
              leads={leadsByStage[s.id] || []}
              loading={loading}
              onMoveStage={onMoveStage}
              onQuickNote={onQuickNote}
              onOpen={onOpen}
            />
          ))}

          {hasDock && (
            <div className="flex w-[168px] shrink-0 flex-col gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Off-pipeline</div>
              {nurtureLeads.length > 0 && (
                <DockGroup label="Nurture" leads={nurtureLeads} open={openGroup === "nurture"} onToggle={() => setOpenGroup((g) => (g === "nurture" ? null : "nurture"))} onMoveStage={onMoveStage} onQuickNote={onQuickNote} onOpen={onOpen} />
              )}
              {lostLeads.length > 0 && (
                <DockGroup label="Lost" leads={lostLeads} open={openGroup === "lost"} onToggle={() => setOpenGroup((g) => (g === "lost" ? null : "lost"))} onMoveStage={onMoveStage} onQuickNote={onQuickNote} onOpen={onOpen} />
              )}
            </div>
          )}
        </div>
        {/* right-edge scroll affordance */}
        <div className="pointer-events-none absolute bottom-3 right-0 top-0 w-10 bg-gradient-to-l from-page to-transparent" />
      </div>
    </div>
  );
}

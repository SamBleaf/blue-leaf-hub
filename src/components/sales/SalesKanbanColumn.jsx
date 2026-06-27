/**
 * SalesKanbanColumn — one pipeline stage column (Pass 2 redesign).
 * Tighter than the old w-64; header (stage + count) stays visible while the body
 * scrolls internally for long columns; clear empty state.
 */
import EmptyState from "../ui/EmptyState.jsx";
import SalesLeadCard from "./SalesLeadCard.jsx";

export default function SalesKanbanColumn({ stage, leads = [], loading, onMoveStage, onQuickNote, onOpen }) {
  return (
    <div className="flex w-[244px] shrink-0 flex-col rounded-card border border-hairline bg-page/50">
      <div className={`flex items-center gap-2 rounded-t-card px-3 py-2 ${stage.color}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${stage.dot}`} />
        <span className="flex-1 text-xs font-semibold uppercase tracking-wide">{stage.label}</span>
        <span className="rounded-full bg-black/10 px-1.5 text-[10px] font-bold">{leads.length}</span>
      </div>
      <div className="flex max-h-[64vh] flex-col gap-2 overflow-y-auto p-2">
        {loading && leads.length === 0 ? (
          <div className="h-16 animate-pulse rounded-lg bg-surface" />
        ) : leads.length === 0 ? (
          <EmptyState compact title="No leads" />
        ) : (
          leads.map((l) => (
            <SalesLeadCard key={l.id} lead={l} onMoveStage={onMoveStage} onQuickNote={onQuickNote} onClick={() => onOpen(l.id)} />
          ))
        )}
      </div>
    </div>
  );
}

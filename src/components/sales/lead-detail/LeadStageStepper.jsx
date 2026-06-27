/**
 * LeadStageStepper — Pass 3A lighter stage progression. Pure/presentational.
 * Desktop: single no-scroll row (current = filled, past = accent tint, future = muted).
 * Mobile: compact "Stage n/N — Name". Architect-tender shows the fast-track chip.
 */
export default function LeadStageStepper({ stageOrder, stages, current, isArchTender }) {
  if (isArchTender) {
    return (
      <div className="inline-block rounded-lg border border-primary/30 bg-primary/[0.04] px-3 py-1.5 text-xs font-semibold text-primary">
        Architect Tender — fast-tracked
      </div>
    );
  }
  const idx = stageOrder.indexOf(current);
  const label = (id) => stages.find((s) => s.id === id)?.label || id;
  return (
    <>
      <div className="hidden flex-wrap items-center gap-1 lg:flex">
        {stageOrder.map((sid, i) => {
          const isCurrent = sid === current;
          const isPast = idx >= 0 && i < idx;
          return (
            <div key={sid} className="flex items-center">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${isCurrent ? "bg-primary text-white" : isPast ? "bg-accent/10 text-accent" : "bg-page text-muted/60"}`}>
                {label(sid)}
              </span>
              {i < stageOrder.length - 1 && <span className="mx-0.5 text-[10px] text-muted/40">›</span>}
            </div>
          );
        })}
      </div>
      <div className="lg:hidden">
        {idx >= 0 && <span className="text-xs font-semibold text-muted">Stage {idx + 1}/{stageOrder.length} — </span>}
        <span className="text-xs font-bold text-primary">{label(current)}</span>
      </div>
    </>
  );
}

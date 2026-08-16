/**
 * LeadStageStepper — Pass 3A lighter stage progression.
 * Desktop: single no-scroll row (current = filled, past = accent tint, future = muted).
 * Mobile: compact "Stage n/N — Name". Architect-tender shows the fast-track chip.
 *
 * Test/dev harness: when `onJump` is provided (admins), chips become clickable — a TEST lead can
 * jump to ANY stage (both directions) to review it; a real lead can only jump BACKWARD (corrective).
 * Forward progress on a real lead still goes through the gated "Move to …" button.
 */
export default function LeadStageStepper({ stageOrder, stages, current, isArchTender, onJump, isTest = false, canManage = false }) {
  if (isArchTender) {
    return (
      <div className="inline-block rounded-lg border border-primary/30 bg-primary/[0.04] px-3 py-1.5 text-xs font-semibold text-primary">
        Architect Tender — fast-tracked
      </div>
    );
  }
  const idx = stageOrder.indexOf(current);
  const label = (id) => stages.find((s) => s.id === id)?.label || id;
  const canClick = (i, sid) => !!(canManage && onJump && sid !== current && (isTest || i < idx));

  return (
    <>
      <div className="hidden flex-wrap items-center gap-1 lg:flex">
        {isTest && <span className="mr-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">TEST</span>}
        {stageOrder.map((sid, i) => {
          const isCurrent = sid === current;
          const isPast = idx >= 0 && i < idx;
          const clickable = canClick(i, sid);
          return (
            <div key={sid} className="flex items-center">
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onJump(sid)}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium cursor-pointer hover:ring-1 hover:ring-primary/40 ${isPast ? "bg-accent/10 text-accent" : "bg-page text-muted/60"}`}
                >
                  {label(sid)}
                </button>
              ) : (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${isCurrent ? "bg-primary text-white" : isPast ? "bg-accent/10 text-accent" : "bg-page text-muted/60"}`}>
                  {label(sid)}
                </span>
              )}
              {i < stageOrder.length - 1 && <span className="mx-0.5 text-[10px] text-muted/40">›</span>}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 lg:hidden">
        {isTest && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">TEST</span>}
        {isTest && canManage && onJump ? (
          <select
            value={current}
            onChange={(e) => onJump(e.target.value)}
            className="rounded-lg border border-hairline bg-page px-2 py-1 text-xs font-semibold text-primary"
          >
            {stageOrder.map((sid) => <option key={sid} value={sid}>{label(sid)}</option>)}
          </select>
        ) : (
          <>
            {idx >= 0 && <span className="text-xs font-semibold text-muted">Stage {idx + 1}/{stageOrder.length} — </span>}
            <span className="text-xs font-bold text-primary">{label(current)}</span>
          </>
        )}
      </div>
    </>
  );
}

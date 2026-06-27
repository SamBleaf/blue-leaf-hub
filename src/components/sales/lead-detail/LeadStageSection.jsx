/**
 * LeadStageSection — Pass 4A collapsed prior-stage summary (accordion).
 * Presentational: a <details> with a one-line summary header; the full, UNCHANGED
 * stage block lives inside (collapsed by default). Lets prior stages stay editable
 * on demand without dominating the current-stage workspace. No logic/handlers here.
 */
export default function LeadStageSection({ title, summary, defaultOpen = false, children }) {
  return (
    <details open={defaultOpen} className="group rounded-card border border-hairline bg-surface">
      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 rounded-card px-4 py-2.5 hover:bg-page">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="flex items-center gap-2">
          {summary && <span className="truncate text-xs text-muted">{summary}</span>}
          <span className="text-[10px] text-muted transition-transform group-open:rotate-90">▶</span>
        </span>
      </summary>
      <div className="border-t border-hairline p-4">{children}</div>
    </details>
  );
}

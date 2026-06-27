/**
 * LeadAccordion — Pass S1 lightweight collapsible sub-section for use INSIDE an
 * existing card (e.g. the PTSA workspace). Presentational only: a <details> with a
 * title + optional one-line summary. Lighter than LeadStageSection (no nested card).
 */
export default function LeadAccordion({ title, summary, defaultOpen = false, children, className = "" }) {
  return (
    <details open={defaultOpen} className={`group border-t border-hairline ${className}`}>
      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 py-2.5">
        <span className="text-xs font-semibold text-ink">{title}</span>
        <span className="flex items-center gap-2">
          {summary && <span className="truncate text-xs text-muted">{summary}</span>}
          <span className="text-[10px] text-muted transition-transform group-open:rotate-90">▶</span>
        </span>
      </summary>
      <div className="pb-3">{children}</div>
    </details>
  );
}

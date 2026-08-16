/**
 * SalesPipelineHeader — compact pipeline header (Pass 2 redesign).
 * Title + subtitle + the existing kanban/list/scorecard view toggle + Add Lead /
 * Architect Tender actions. Behaviour unchanged — handlers are passed in.
 */
import { formatValue } from "../../lib/salesPipeline.js";

const VIEW_ICONS = {
  board: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  ),
  actions: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8.5 1L3 9h4l-.5 6L12 7H8l.5-6z" />
    </svg>
  ),
  list: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="2" width="14" height="2" rx="1" /><rect x="1" y="7" width="14" height="2" rx="1" /><rect x="1" y="12" width="14" height="2" rx="1" />
    </svg>
  ),
  scorecard: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="9" width="3" height="6" rx="1" /><rect x="6" y="6" width="3" height="9" rx="1" /><rect x="11" y="2" width="3" height="13" rx="1" />
    </svg>
  ),
};
const VIEWS = [
  { id: "board", title: "Board (kanban)" },
  { id: "actions", title: "Action queue" },
  { id: "list", title: "List view" },
  { id: "scorecard", title: "APB Scorecard" },
];

export default function SalesPipelineHeader({ activeCount, totalValue, wonCount, view, onView, onAddLead, onArchTender, onTestLead }) {
  const valueLabel = formatValue(totalValue);
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="page-title">Sales Pipeline</h1>
        <p className="mt-0.5 text-sm text-muted">
          {activeCount} active lead{activeCount !== 1 ? "s" : ""}
          {valueLabel && <span> · {valueLabel} pipeline value</span>}
          {wonCount > 0 && <span> · {wonCount} won</span>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-hairline bg-page">
          {VIEWS.map((v, i) => (
            <button
              key={v.id}
              onClick={() => onView(v.id)}
              title={v.title}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${i > 0 ? "border-l border-hairline" : ""} ${view === v.id ? "bg-primary text-white" : "text-muted hover:bg-surface hover:text-ink"}`}
            >
              {VIEW_ICONS[v.id]}
            </button>
          ))}
        </div>
        {onTestLead && (
          <button
            onClick={onTestLead}
            title="Create a throwaway test lead you can bounce across every stage"
            className="flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-700 shadow-sm transition-colors hover:bg-amber-500 hover:text-white hover:border-amber-500"
          >
            <span className="text-lg leading-none">+</span> Test lead
          </button>
        )}
        <button
          onClick={onArchTender}
          className="flex items-center gap-1.5 rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary hover:text-white"
        >
          <span className="text-lg leading-none">+</span> Architect Tender
        </button>
        <button
          onClick={onAddLead}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
        >
          <span className="text-lg leading-none">+</span> Add Lead
        </button>
      </div>
    </div>
  );
}

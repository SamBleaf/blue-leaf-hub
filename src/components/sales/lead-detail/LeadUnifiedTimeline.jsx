/**
 * LeadUnifiedTimeline — Batch 1B. One stream across activities, notes, conversations,
 * CRM interactions and email opens/clicks, sourced from GET /api/sales/leads/:id/timeline
 * (the v_lead_timeline view). Presentational: takes the already-fetched `timeline` array
 * (camelCase). Falls back to the legacy activities-only timeline if the view is missing
 * (migration 128 not applied) so the page never regresses.
 */
import LeadActivityTimeline from "./LeadActivityTimeline.jsx";

const KIND_ICONS = {
  activity: "📝", note: "🗒️", conversation: "💬", interaction: "🤝",
  email_open: "📧", email_click: "🔗",
};
const KIND_LABELS = {
  activity: "Activity", note: "Note", conversation: "Conversation",
  interaction: "CRM", email_open: "Email opened", email_click: "Link clicked",
};

function relativeTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function LeadUnifiedTimeline({ timeline, activities = [], viewMissing = false }) {
  // Degrade to the legacy activities-only view when the unified view isn't available yet.
  if (viewMissing || timeline == null) return <LeadActivityTimeline activities={activities} />;

  return (
    <div className="space-y-3">
      <h3 className="section-label">Timeline</h3>
      {timeline.length === 0 ? (
        <p className="text-sm italic text-muted">No history yet.</p>
      ) : (
        timeline.map((ev) => {
          const label = KIND_LABELS[ev.kind] || ev.kind;
          const sub = ev.subType && ev.kind !== "email_open" && ev.kind !== "email_click"
            ? String(ev.subType).replace(/_/g, " ") : null;
          return (
            <div key={`${ev.kind}-${ev.refId}`} className="flex gap-3">
              <div className="flex h-7 w-7 flex-shrink-0 select-none items-center justify-center rounded-full border border-hairline bg-page text-sm">
                {KIND_ICONS[ev.kind] || "•"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-ink">
                    {label}{sub && <span className="capitalize text-muted"> · {sub}</span>}
                  </span>
                  <span className="flex-shrink-0 text-xs text-muted">{relativeTime(ev.occurredAt)}</span>
                </div>
                <p className="mt-0.5 text-sm text-ink">{ev.summary}</p>
                {ev.detail && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{ev.detail}</p>}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

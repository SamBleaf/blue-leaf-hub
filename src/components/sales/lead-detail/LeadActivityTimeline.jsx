/**
 * LeadActivityTimeline — Pass 3A activity timeline. Pure/presentational (from the
 * activities prop). JSX + icons relocated verbatim from LeadDetail (no logic change).
 */
const ACTIVITY_ICONS = {
  call: "📞", email: "✉️", meeting: "🤝", note: "📝", stage_change: "→", blueprint_prompt: "🤖",
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

export default function LeadActivityTimeline({ activities = [] }) {
  return (
    <div className="space-y-3">
      <h3 className="section-label">Activity Timeline</h3>
      {activities.length === 0 ? (
        <p className="text-sm italic text-muted">No activities yet.</p>
      ) : (
        activities.map((act) => (
          <div key={act.id} className="flex gap-3">
            <div className="flex h-7 w-7 flex-shrink-0 select-none items-center justify-center rounded-full border border-hairline bg-page text-sm">
              {ACTIVITY_ICONS[act.activity_type] || "📝"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium capitalize text-ink">{(act.activity_type || "").replace("_", " ")}</span>
                <span className="flex-shrink-0 text-xs text-muted">{relativeTime(act.created_at)}</span>
              </div>
              <p className="mt-0.5 text-sm text-ink">{act.summary}</p>
              {act.next_action && (
                <p className="mt-1 text-xs text-primary">
                  ↪ {act.next_action}
                  {act.next_action_date && ` · ${new Date(act.next_action_date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`}
                </p>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

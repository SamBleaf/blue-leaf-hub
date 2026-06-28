import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { apiFetch, apiPost } from "../../lib/apiFetch.js";

// Marketing Calendar (Batch 2) — week view of scheduled content + campaign slots.
// Manual "Mark as posted" logging only — NO external publishing / auto-posting.

function ymd(d) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}
function mondayOf(base) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
const CHANNEL_TO_PLATFORM = { instagram: "instagram", facebook: "facebook", linkedin: "linkedin" };

const DEMO = {
  scheduledContent: [
    { id: "demo-1", channel: "instagram", title: "Why we protect homes before cladding", status: "approved", scheduledAt: ymd(new Date()) },
  ],
  slots: [],
  demo: true,
};

export default function MarketingCalendar() {
  const [weekStart, setWeekStart] = useState(() => ymd(mondayOf(new Date())));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);
  const [error, setError] = useState(null);
  const [postedIds, setPostedIds] = useState({});

  const load = useCallback(async (start) => {
    setLoading(true);
    setError(null);
    const end = ymd(new Date(new Date(`${start}T12:00:00`).getTime() + 6 * 86400000));
    const { ok, data: d, error: e } = await apiFetch(`/api/marketing/calendar?from=${start}&to=${end}`);
    if (ok && d) {
      setData(d);
      setUsingDemo(false);
    } else {
      setData(DEMO);
      setUsingDemo(true);
      if (!ok) setError(e || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(weekStart);
  }, [weekStart, load]);

  function shiftWeek(delta) {
    const d = new Date(`${weekStart}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setWeekStart(ymd(mondayOf(d)));
  }

  async function markPosted(item) {
    if (usingDemo) return;
    const platform = CHANNEL_TO_PLATFORM[item.channel] || "instagram";
    const { ok } = await apiPost("/api/marketing/publish-log", { contentItemId: item.id, platform });
    if (ok) setPostedIds((p) => ({ ...p, [item.id]: true }));
    else setError("Could not log the post.");
  }

  const content = data?.scheduledContent || [];

  return (
    <div className="space-y-5 pb-24">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Marketing</p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">Calendar</h1>
        <p className="mt-1 text-sm text-muted">Scheduled content for the week. Log posts manually — nothing is published from here.</p>
      </header>

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => shiftWeek(-7)} className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm font-semibold text-ink hover:bg-page">← Prev</button>
        <span className="text-sm font-medium text-ink">Week of {weekStart}</span>
        <button type="button" onClick={() => shiftWeek(7)} className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm font-semibold text-ink hover:bg-page">Next →</button>
        <Link to="/marketing/approval" className="ml-auto text-xs font-semibold text-primary underline">Approval Queue</Link>
      </div>

      {usingDemo && <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-ink">Showing demo data — calendar needs staging + migration 122.</div>}
      {error && <div className="rounded-lg border border-hairline bg-page px-3 py-2 text-xs text-muted">{error}</div>}

      {loading && <div className="rounded-card border border-hairline bg-surface p-6 text-sm text-muted">Loading…</div>}

      {!loading && content.length === 0 && (
        <div className="rounded-card border border-hairline bg-page p-6 text-sm text-muted">
          No scheduled content this week. Approve a package and schedule it here.
        </div>
      )}

      {!loading && content.length > 0 && (
        <div className="space-y-2">
          {content.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-card border border-hairline bg-surface p-3">
              <span className="w-28 text-sm font-semibold text-ink">{(item.scheduledAt || "").slice(0, 10)}</span>
              <span className="rounded-full bg-page px-2 py-0.5 text-[11px] font-medium capitalize text-muted">{item.channel}</span>
              <span className="flex-1 truncate text-sm text-ink">{item.title || "Untitled"}</span>
              <span className="rounded-full bg-page px-2 py-0.5 text-[11px] font-medium text-muted">{item.status}</span>
              {postedIds[item.id] ? (
                <span className="text-xs font-medium text-accent">Logged</span>
              ) : (
                <button type="button" onClick={() => markPosted(item)} className="rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5">
                  Mark as posted
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

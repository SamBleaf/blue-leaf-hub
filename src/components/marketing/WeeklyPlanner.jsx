import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../lib/apiFetch.js";
import CampaignTemplatePicker from "./CampaignTemplatePicker.jsx";

// Weekly Planner (Run A / Batch 2) — plan a week from a campaign template; empty slots
// deep-link into the Content Studio carrying campaign_id + week_start.

function ymd(d) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}
function mondayOf(base) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d;
}
function shiftWeek(weekStartStr, deltaDays) {
  const d = new Date(`${weekStartStr}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return ymd(mondayOf(d));
}

export default function WeeklyPlanner() {
  const [weekStart, setWeekStart] = useState(() => ymd(mondayOf(new Date())));
  const [planner, setPlanner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const load = useCallback(async (week) => {
    setLoading(true);
    setError(null);
    const { ok, data, error: e } = await apiFetch(`/api/marketing/planner?week=${week}`);
    if (ok) setPlanner(data);
    else setError(e || "Couldn't load the planner for this week.");
    setLoading(false);
  }, []);

  useEffect(() => {
    load(weekStart);
  }, [weekStart, load]);

  const slots = planner?.slots || [];

  return (
    <div className="space-y-6 pb-24">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Marketing</p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">Weekly Planner</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Plan the week from a campaign template, then fill each slot from real project media.
        </p>
      </header>

      {/* Week navigation */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setWeekStart((w) => shiftWeek(w, -7))}
          className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm font-semibold text-ink hover:bg-page"
        >
          ← Prev
        </button>
        <span className="text-sm font-medium text-ink">
          Week of {planner?.weekStart || weekStart}
        </span>
        <button
          type="button"
          onClick={() => setWeekStart((w) => shiftWeek(w, 7))}
          className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm font-semibold text-ink hover:bg-page"
        >
          Next →
        </button>
        <button
          type="button"
          onClick={() => setShowTemplates((s) => !s)}
          className="ml-auto rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary/90"
        >
          {showTemplates ? "Hide templates" : "Start from a template"}
        </button>
      </div>

      {showTemplates && (
        <CampaignTemplatePicker
          onCreated={() => {
            setShowTemplates(false);
            load(weekStart);
          }}
        />
      )}

      {loading && (
        <div className="rounded-card border border-hairline bg-surface p-6 text-sm text-muted">Loading week…</div>
      )}

      {error && !loading && (
        <div className="rounded-card border border-warning/40 bg-warning/10 p-6 text-sm text-ink">
          <p className="font-semibold">Could not load the planner.</p>
          <p className="mt-1 text-muted">{error}</p>
          <button
            type="button"
            onClick={() => load(weekStart)}
            className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && slots.length === 0 && (
        <div className="rounded-card border border-hairline bg-page p-6 text-sm text-muted">
          <p className="font-semibold text-ink">No slots planned for this week yet.</p>
          <p className="mt-1">Pick a campaign template above to lay out the week, then fill each slot from media.</p>
        </div>
      )}

      {!loading && !error && slots.length > 0 && (
        <div className="space-y-2">
          {slots.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-3 rounded-card border border-hairline bg-surface p-3"
            >
              <span className="w-24 text-sm font-semibold text-ink">{s.slotDate}</span>
              <span className="text-xs text-muted">{s.dayOfWeek}</span>
              {s.channel && (
                <span className="rounded-full bg-page px-2 py-0.5 text-[11px] font-medium text-muted">
                  {s.channel}
                </span>
              )}
              {s.campaignName && <span className="text-xs text-muted">{s.campaignName}</span>}
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  s.status === "empty" ? "bg-warning/15 text-ink" : "bg-accent/10 text-accent"
                }`}
              >
                {s.status}
              </span>
              {s.status === "empty" && (
                <Link
                  to={`/marketing/studio?campaign_id=${s.campaignId || ""}&week_start=${weekStart}`}
                  className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
                >
                  Create from media →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

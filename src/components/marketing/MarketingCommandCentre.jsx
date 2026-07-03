import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../lib/apiFetch.js";
import MarketingReadinessPanel from "./MarketingReadinessPanel.jsx";

// The marketing loop, in order — the spine every screen plugs into.
const WORKFLOW = [
  { to: "/marketing/planner", label: "Plan" },
  { to: "/marketing/studio", label: "Create from media" },
  { to: "/marketing/approval", label: "Review & approve" },
  { to: "/marketing/calendar", label: "Schedule" },
  { to: "/marketing/calendar", label: "Post & log" },
  { to: "/marketing/intelligence", label: "Measure" },
  { to: "/marketing/evergreen", label: "Reuse" },
  { to: "/marketing/library",  label: "Asset Library" },
];

// Marketing Command Centre (Run A) — Josh's weekly home screen.
// Reads GET /api/marketing/command-centre and surfaces "what needs action this week".
export default function MarketingCommandCentre() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { ok, data, error: e } = await apiFetch("/api/marketing/command-centre");
    if (ok && data?.snapshot) setSnapshot(data.snapshot);
    else setError(e || "Could not load this week's snapshot.");
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tiles = snapshot
    ? [
        { label: "Need review", value: snapshot.needsReview, hint: "AI drafts waiting on you" },
        { label: "Need a photo", value: snapshot.needsPhoto, hint: "Social posts with no media yet" },
        { label: "Open slots this week", value: snapshot.slotsEmptyThisWeek, hint: "Planned but unfilled" },
        { label: "Published this month", value: snapshot.publishedThisMonth, hint: "Posts logged" },
        { label: "New media this week", value: snapshot.newMediaThisWeek, hint: "Photos & video uploaded" },
      ]
    : [];

  return (
    <div className="space-y-6 pb-24">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Marketing</p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">Command Centre</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Your week at a glance — what needs review, what is missing a photo, and what is planned.
          {snapshot ? ` Week of ${snapshot.weekStart}.` : ""}
        </p>
      </header>

      {/* Primary actions */}
      <div className="flex flex-wrap gap-3">
        <Link
          to="/marketing/studio"
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90"
        >
          Create from media →
        </Link>
        <Link
          to="/marketing/planner"
          className="rounded-lg border border-hairline bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-page"
        >
          Plan this week
        </Link>
        <Link
          to="/marketing/media"
          className="rounded-lg border border-hairline bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-page"
        >
          Upload media
        </Link>
      </div>

      {/* The marketing loop — orient Josh on where each step lives */}
      <nav aria-label="Marketing workflow" className="rounded-card border border-hairline bg-surface p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">The weekly loop</p>
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
          {WORKFLOW.map((step, i) => (
            <li key={`${step.label}-${i}`} className="flex items-center">
              <Link
                to={step.to}
                className="rounded-lg px-2 py-1 font-medium text-ink transition hover:bg-page hover:text-primary"
              >
                <span className="mr-1.5 text-xs font-bold text-accent">{i + 1}</span>
                {step.label}
              </Link>
              {i < WORKFLOW.length - 1 && <span aria-hidden className="px-0.5 text-muted">→</span>}
            </li>
          ))}
        </ol>
      </nav>

      {/* Snapshot */}
      {loading && (
        <div className="rounded-card border border-hairline bg-surface p-6 text-sm text-muted">
          Loading this week…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-card border border-warning/40 bg-warning/10 p-6 text-sm text-ink">
          <p className="font-semibold">Could not load the snapshot.</p>
          <p className="mt-1 text-muted">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      )}

      {snapshot && !loading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-card border border-hairline bg-surface p-4">
              <p className="text-3xl font-semibold tracking-tight text-primary">{t.value}</p>
              <p className="mt-1 text-sm font-medium text-ink">{t.label}</p>
              <p className="mt-0.5 text-xs text-muted">{t.hint}</p>
            </div>
          ))}
        </div>
      )}

      {/* Empty-state teach the loop */}
      {snapshot && !loading &&
        snapshot.needsReview === 0 &&
        snapshot.slotsEmptyThisWeek === 0 &&
        snapshot.newMediaThisWeek === 0 && (
          <div className="rounded-card border border-hairline bg-page p-6 text-sm text-muted">
            <p className="font-semibold text-ink">Plan your first week</p>
            <p className="mt-1">
              Upload site photos → Generate the week → Review → Schedule → Log what you post. Start with{" "}
              <Link to="/marketing/planner" className="font-semibold text-primary underline">
                Weekly Planner
              </Link>
              .
            </p>
          </div>
        )}

      {/* Module readiness — collapsed status board for the build/verification state */}
      <MarketingReadinessPanel />
    </div>
  );
}

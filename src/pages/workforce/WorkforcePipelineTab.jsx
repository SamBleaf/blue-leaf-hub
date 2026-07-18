// =============================================================================
// WorkforcePipelineTab — forward-looking capacity + scheduling decision tool.
// Shows upcoming carpentry jobs (committed vs forecast vs actual vs break-even),
// crew demand vs capacity, and margin-risk flags. Presentation only — all maths
// come from the deterministic backend (/api/workforce/pipeline) and the pure
// pipelineTimeline geometry. Deferred/optional capability lives in
// docs/plans/WORKFORCE_PIPELINE_FUTURE_TODO.md.
// =============================================================================
import { useState, useEffect, useMemo, useCallback } from "react";
import { apiFetch } from "../../lib/apiFetch.js";
import { horizonWindow, shiftAnchor, todayYmd } from "../../lib/pipelineTimeline.js";
import { resolveJobColor, jobKey } from "../../lib/plannerColors.js";
import PipelineTimeline from "../../components/workforce/pipeline/PipelineTimeline.jsx";
import PipelineCalendar from "../../components/workforce/pipeline/PipelineCalendar.jsx";

const HORIZONS = ["week", "month", "quarter", "year"];

export default function WorkforcePipelineTab() {
  const [view, setView] = useState("calendar");       // calendar (primary) | timeline
  const [horizon, setHorizon] = useState("month");
  const [anchor, setAnchor] = useState(() => todayYmd());
  const [kind, setKind] = useState("all");            // all | carpentry
  const [riskOnly, setRiskOnly] = useState(false);
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Calendar mode fetches a wide (year) window so it can navigate months without refetching
  // (stage blocks come back for all active jobs regardless); timeline mode uses the chosen horizon.
  const win = useMemo(() => horizonWindow(anchor, view === "calendar" ? "year" : horizon), [anchor, horizon, view]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ from: win.from, to: win.to, horizon }).toString();
    const { ok, data, error: err } = await apiFetch(`/api/workforce/pipeline?${qs}`);
    if (!ok) { setError(err || "Could not load the pipeline"); setBoard(null); }
    else setBoard(data);
    setLoading(false);
  }, [win.from, win.to, horizon]);

  useEffect(() => { load(); }, [load]);

  const jobs = useMemo(() => {
    let rows = board?.jobs || [];
    if (riskOnly) rows = rows.filter((j) => j.breakEven?.marginRisk);
    return rows;
  }, [board, riskOnly]);

  const construction = useMemo(
    () => (kind === "carpentry" || riskOnly ? [] : (board?.construction || [])),
    [board, kind, riskOnly],
  );

  const riskCount = (board?.jobs || []).filter((j) => j.breakEven?.marginRisk).length;
  const lowConfCount = (board?.jobs || []).filter((j) => ["Low", "Insufficient"].includes(j.forecast?.confidence)).length;
  const totals = board?.capacityTotals;

  return (
    <div className="space-y-4" data-testid="wf-pipeline">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          {/* View mode — Calendar (primary) vs Timeline */}
          <div className="inline-flex rounded-lg border border-hairline overflow-hidden">
            {["calendar", "timeline"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-sm font-medium capitalize transition ${view === v ? "bg-primary text-white" : "bg-surface text-muted hover:text-ink"}`}
              >
                {v}
              </button>
            ))}
          </div>

          {view === "timeline" && (
            <div className="inline-flex rounded-lg border border-hairline overflow-hidden">
              {HORIZONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHorizon(h)}
                  className={`px-2.5 py-1.5 text-sm font-medium capitalize transition ${horizon === h ? "bg-primary text-white" : "bg-surface text-muted hover:text-ink"}`}
                >
                  {h}
                </button>
              ))}
            </div>
          )}
        </div>

        {view === "timeline" && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setAnchor((a) => shiftAnchor(a, horizon, -1))} className="px-2.5 py-1.5 text-sm rounded-lg border border-hairline text-muted hover:text-ink" aria-label="Previous period">←</button>
            <button type="button" onClick={() => setAnchor(todayYmd())} className="px-3 py-1.5 text-sm rounded-lg border border-hairline text-muted hover:text-ink">Today</button>
            <button type="button" onClick={() => setAnchor((a) => shiftAnchor(a, horizon, 1))} className="px-2.5 py-1.5 text-sm rounded-lg border border-hairline text-muted hover:text-ink" aria-label="Next period">→</button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="text-sm rounded-lg border border-hairline bg-surface px-2 py-1.5 text-ink"
            aria-label="Filter by work type"
          >
            <option value="all">Carpentry + context</option>
            <option value="carpentry">Carpentry only</option>
          </select>
          <label className="inline-flex items-center gap-1.5 text-sm text-muted cursor-pointer">
            <input type="checkbox" checked={riskOnly} onChange={(e) => setRiskOnly(e.target.checked)} className="rounded" />
            Margin risk only {riskCount > 0 && <span className="text-warning font-semibold">({riskCount})</span>}
          </label>
        </div>
      </div>

      {/* Meta / degradation notices */}
      {board?.meta && !loading && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>{win.from} → {win.to}</span>
          {totals?.utilisationPct != null && (
            <span className={totals.overbookedPeriods > 0 ? "text-red-600 font-medium" : ""}>
              {totals.utilisationPct}% crew utilisation{totals.overbookedPeriods > 0 ? ` · ${totals.overbookedPeriods} period${totals.overbookedPeriods === 1 ? "" : "s"} overbooked` : ""}
            </span>
          )}
          {!board.meta.costModelSynced && <span className="text-warning">⚠ Cost model not synced — break-even markers unavailable</span>}
          {board.meta.historicalJobsSampled === 0 && <span>No completed-job history yet — forecasts lean on budget + break-even (Low confidence)</span>}
          {lowConfCount > 0 && board.meta.historicalJobsSampled > 0 && <span>{lowConfCount} job{lowConfCount === 1 ? "" : "s"} at Low/Insufficient confidence</span>}
        </div>
      )}

      {loading && <div className="py-16 text-center text-muted text-sm">Loading pipeline…</div>}

      {error && !loading && (
        <div className="py-16 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button type="button" onClick={load} className="mt-2 text-sm text-primary hover:underline">Retry</button>
        </div>
      )}

      {!loading && !error && board && jobs.length === 0 && construction.length === 0 && (
        <div className="py-16 text-center text-muted text-sm">
          No {riskOnly ? "margin-risk jobs" : "scheduled work"} to show.
          {riskOnly && " Clear the filter to see all work."}
        </div>
      )}

      {view === "calendar" && board?.meta && !board.meta.hasStageSchedule && jobs.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          No stage schedules yet — apply <span className="font-mono">migration 144</span>, then open each job&rsquo;s Schedule tab (or hit Re-auto-layout) to lay out its stages. They&rsquo;ll appear here.
        </div>
      )}

      {!loading && !error && board && (jobs.length > 0 || construction.length > 0) && (
        <>
          {view === "calendar" ? (
            <>
              <JobsLegend jobs={jobs} />
              <PipelineCalendar jobs={jobs} anchor={anchor} onOpenStage={() => {}} />
            </>
          ) : (
            <PipelineTimeline
              jobs={jobs}
              construction={construction}
              capacity={board.capacity || []}
              from={win.from}
              to={win.to}
              horizon={horizon}
            />
          )}
          <Legend costModelSynced={board.meta?.costModelSynced} calendar={view === "calendar"} />
        </>
      )}
    </div>
  );
}

// Colour key for the jobs on the calendar — colour dot per job (matches the Planner palette).
function JobsLegend({ jobs }) {
  const orderedKeys = jobs.map((j) => jobKey("carpentry", j.id));
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] px-1">
      {jobs.map((j) => {
        const c = resolveJobColor(jobKey("carpentry", j.id), orderedKeys);
        return (
          <span key={j.id} className="inline-flex items-center gap-1.5 text-muted">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: c.dot }} />
            {j.label}
            {j.breakEven?.marginRisk && <span className="text-red-600" title="Margin risk">⚠</span>}
          </span>
        );
      })}
    </div>
  );
}

// Inline legend — explains the four schedule measures + capacity colours. Kept in the tab
// (not a separate component) so the whole reading key lives with the board it explains.
function Legend({ costModelSynced, calendar }) {
  if (calendar) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted px-1">
        <LegendItem swatch={<span className="inline-block w-5 h-2.5 rounded bg-slate-500" />} label="Stage block (planned)" />
        <LegendItem swatch={<span className="inline-block w-5 h-2.5 rounded bg-slate-500 opacity-50" />} label="Complete (faded)" />
        <LegendItem swatch={<span className="inline-block w-5 h-2.5 rounded border border-red-600" />} label="Margin risk" />
        <LegendItem swatch={<span>🔒</span>} label="Locked (pinned)" />
        <span className="text-muted/70">Colour = job (see legend above). Edit dates in the job&rsquo;s Schedule tab.</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted px-1">
      <LegendItem swatch={<span className="inline-block w-5 h-2.5 rounded bg-slate-500 opacity-90" />} label="Committed (real schedule)" />
      <LegendItem swatch={<span className="inline-block w-5 h-2.5 rounded border-[1.5px] border-dashed border-slate-500" />} label="Expected (forecast)" />
      <LegendItem swatch={<span className="inline-block w-5 h-2.5 rounded bg-slate-800" />} label="Actual progress" />
      {costModelSynced && <LegendItem swatch={<span className="inline-block w-0.5 h-3.5 bg-amber-600" />} label="Break-even deadline" />}
      {costModelSynced && <LegendItem swatch={<span className="inline-block w-0.5 h-3.5 bg-red-600" />} label="Break-even overrun" />}
      <span className="w-px h-3.5 bg-hairline mx-1" />
      <LegendItem swatch={<span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#1D9E75" }} />} label="Committed crew-days" />
      <LegendItem swatch={<span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#8fd3bd" }} />} label="Forecast crew-days" />
      <LegendItem swatch={<span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#dc2626" }} />} label="Overbooked" />
    </div>
  );
}
function LegendItem({ swatch, label }) {
  return <span className="inline-flex items-center gap-1.5">{swatch}{label}</span>;
}

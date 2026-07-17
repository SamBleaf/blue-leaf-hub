// JobRow — one carpentry job on the Pipeline timeline. Renders the four schedule
// measures without conflating them: SOLID = committed schedule (start_date→end_date),
// DASHED = forecast (expected duration), inner FILL = actual progress from timesheets,
// vertical MARKER = the break-even deadline (red when the forecast overruns it).
import { barGeometry, leftPct } from "../../../lib/pipelineTimeline.js";

const fmtDate = (ymd) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—");
const CONF_STYLE = {
  High: "bg-green-100 text-green-800", Medium: "bg-amber-100 text-amber-800",
  Low: "bg-slate-100 text-slate-600", Insufficient: "bg-slate-100 text-slate-400",
};

export default function JobRow({ job, from, to, palette, expanded, onToggle }) {
  const committed = barGeometry(job.approvedWindow?.start, job.approvedWindow?.end, from, to);
  const forecast = barGeometry(job.forecast?.expectedStart, job.forecast?.expectedCompletion, from, to);
  const pct = job.actual?.percentComplete ?? job.forecast?.percentComplete ?? null;
  const beDate = job.breakEven?.deadlineDate;
  const beLeft = beDate ? leftPct(beDate, from, to) : null;
  const beInView = beDate && beDate >= from && beDate <= to;
  const marginRisk = job.breakEven?.marginRisk;

  return (
    <div className="border-b border-hairline last:border-0">
      <div className="flex items-stretch hover:bg-page/60 cursor-pointer" style={{ minHeight: 58 }} onClick={onToggle} data-testid="pipeline-job-row">
        {/* Label column */}
        <div className="w-44 sm:w-56 shrink-0 px-3 py-2 border-r border-hairline">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: palette.dot }} />
            <span className="text-sm font-medium text-ink truncate" title={job.label}>{job.label}</span>
          </div>
          <div className="mt-1 flex items-center gap-1 flex-wrap">
            {job.projectType && <span className="text-[10px] uppercase tracking-wide text-muted">{job.projectType}</span>}
            {job.forecast?.confidence && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${CONF_STYLE[job.forecast.confidence] || CONF_STYLE.Low}`}>
                {job.forecast.confidence}
              </span>
            )}
            {marginRisk && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium" title="Forecast exceeds the break-even labour allowance">⚠ margin</span>
            )}
          </div>
        </div>

        {/* Bar area */}
        <div className="relative flex-1 min-w-0">
          {/* Forecast (dashed) — the expected duration */}
          {forecast && (
            <div
              className="absolute rounded"
              style={{ left: `${forecast.leftPct}%`, width: `${forecast.widthPct}%`, top: 34, height: 12, background: palette.bg, border: `1.5px dashed ${palette.dot}` }}
              title={`Forecast: ${fmtDate(job.forecast.expectedStart)} – ${fmtDate(job.forecast.expectedCompletion)} · ${job.forecast.expectedCalendarDays}d`}
            />
          )}
          {/* Committed (solid) — the real schedule; inner fill = actual progress */}
          {committed && (
            <div
              className="absolute rounded overflow-hidden"
              style={{ left: `${committed.leftPct}%`, width: `${committed.widthPct}%`, top: 12, height: 14, background: palette.dot, opacity: 0.9 }}
              title={`Scheduled: ${fmtDate(job.approvedWindow.start)} – ${fmtDate(job.approvedWindow.end)}`}
            >
              {pct != null && pct > 0 && (
                <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: palette.text }} title={`${pct}% complete (actual)`} />
              )}
            </div>
          )}
          {/* When nothing is scheduled yet, still show progress on the forecast bar */}
          {!committed && forecast && pct != null && pct > 0 && (
            <div className="absolute rounded-l" style={{ left: `${forecast.leftPct}%`, width: `${forecast.widthPct * Math.min(100, pct) / 100}%`, top: 34, height: 12, background: palette.text, opacity: 0.85 }} />
          )}
          {/* Break-even deadline marker */}
          {beInView && (
            <div className="absolute top-1 bottom-1 flex flex-col items-center" style={{ left: `${beLeft}%`, transform: "translateX(-50%)" }} title={`Break-even by ${fmtDate(beDate)} (${job.breakEven.allowanceDays}d allowance)`}>
              <div className="w-0.5 h-full" style={{ background: marginRisk ? "#dc2626" : "#d97706" }} />
            </div>
          )}
        </div>
      </div>

      {expanded && <JobDetail job={job} from={from} to={to} palette={palette} />}
    </div>
  );
}

function JobDetail({ job, from, to, palette }) {
  const stages = job.stages || [];
  return (
    <div className="flex bg-page/40 text-xs">
      <div className="w-44 sm:w-56 shrink-0 px-3 py-3 border-r border-hairline space-y-1">
        <FourValues job={job} />
      </div>
      <div className="flex-1 min-w-0 py-2">
        {stages.length === 0 && <p className="px-3 py-2 text-muted italic">No stage detail yet — forecast is budget-derived.</p>}
        {stages.map((s) => {
          const geo = s.first ? barGeometry(s.first, s.last || s.first, from, to) : null;
          return (
            <div key={s.stage} className="relative flex items-center" style={{ height: 22 }}>
              <span className="absolute left-3 text-[11px] text-muted truncate" style={{ maxWidth: 120 }}>{s.label || s.stage}</span>
              {geo && (
                <div className="absolute rounded-sm" style={{ left: `${geo.leftPct}%`, width: `${geo.widthPct}%`, height: 8, background: palette.dot, opacity: 0.55 }}
                  title={`${s.label}: ${s.actualHours}h actual${s.forecastHours != null ? ` · ${s.forecastHours}h forecast` : ""}`} />
              )}
            </div>
          );
        })}
        <p className="px-3 pt-1 text-[11px] text-muted">{job.forecast?.explanation}</p>
      </div>
    </div>
  );
}

// The four schedule measures, side by side, never conflated.
function FourValues({ job }) {
  const f = job.forecast || {}, be = job.breakEven || {}, a = job.actual || {};
  const Row = ({ label, value, tone }) => (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <span className={`text-[11px] font-medium ${tone || "text-ink"}`}>{value}</span>
    </div>
  );
  return (
    <>
      <Row label="Committed" value={job.approvedWindow?.start ? `${daysOf(job.approvedWindow)}d sched.` : "—"} />
      <Row label="Expected" value={f.expectedCalendarDays != null ? `${f.expectedCalendarDays}d` : "—"} />
      <Row label="Break-even" value={be.allowanceDays != null ? `${be.allowanceDays}d` : "—"} tone={be.marginRisk ? "text-red-600" : "text-ink"} />
      <Row label="Actual" value={a.consumedCrewDays != null ? `${a.consumedCrewDays}cd${a.percentComplete != null ? ` · ${a.percentComplete}%` : ""}` : "—"} />
    </>
  );
}
function daysOf(w) {
  if (!w?.start || !w?.end) return "?";
  return Math.max(1, Math.round((new Date(`${w.end}T12:00:00`) - new Date(`${w.start}T12:00:00`)) / 86400000) + 1);
}

// PipelineTimeline — the custom date-scaled grid (see pipelineTimeline.js for the
// library decision). Draws the axis + a continuous today line + gridlines behind all
// rows, then a JobRow per carpentry job, a lighter construction-context lane, and the
// aligned CapacityBand. All positions are % of the [from,to] window (responsive).
import { useState } from "react";
import { axisTicks, leftPct, barGeometry, todayYmd } from "../../../lib/pipelineTimeline.js";
import { resolveJobColor, jobKey } from "../../../lib/plannerColors.js";
import JobRow from "./JobRow.jsx";
import CapacityBand from "./CapacityBand.jsx";

const LABEL = "w-44 sm:w-56";

export default function PipelineTimeline({ jobs, construction, capacity, from, to, horizon }) {
  const [expandedId, setExpandedId] = useState(null);
  const ticks = axisTicks(from, to, horizon);
  const today = todayYmd();
  const todayLeft = today >= from && today <= to ? leftPct(today, from, to) : null;
  const orderedKeys = jobs.map((j) => jobKey("carpentry", j.id));

  return (
    <div className="rounded-card border border-hairline bg-surface overflow-hidden">
      {/* Axis header */}
      <div className="flex items-stretch border-b border-hairline bg-page/50">
        <div className={`${LABEL} shrink-0 px-3 py-2`}>
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">Job</span>
        </div>
        <div className="relative flex-1 min-w-0 h-8">
          {ticks.map((t) => (
            <span key={t.key} className={`absolute top-2 pl-1 text-[10px] ${t.major ? "text-ink font-semibold" : "text-muted"}`} style={{ left: `${t.leftPct}%` }}>{t.label}</span>
          ))}
          {todayLeft != null && (
            <span className="absolute top-1 text-[9px] text-primary font-semibold" style={{ left: `${todayLeft}%`, transform: "translateX(-50%)" }}>today</span>
          )}
        </div>
      </div>

      {/* Rows, with a gridline/today overlay aligned to the bar area (after the label column) */}
      <div className="relative">
        <div className="absolute inset-0 flex pointer-events-none">
          <div className={`${LABEL} shrink-0`} />
          <div className="relative flex-1 min-w-0">
            {ticks.map((t) => (
              <div key={t.key} className="absolute top-0 bottom-0 border-l border-hairline/50" style={{ left: `${t.leftPct}%` }} />
            ))}
            {todayLeft != null && <div className="absolute top-0 bottom-0 border-l-2 border-primary/60" style={{ left: `${todayLeft}%` }} />}
          </div>
        </div>

        {jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            from={from}
            to={to}
            palette={resolveJobColor(jobKey("carpentry", job.id), orderedKeys)}
            expanded={expandedId === job.id}
            onToggle={() => setExpandedId(expandedId === job.id ? null : job.id)}
          />
        ))}

        {construction?.length > 0 && (
          <div className="border-t border-hairline">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted bg-page/30">Construction context (internal labour only)</div>
            {construction.map((c) => (
              <ConstructionRow key={c.id} row={c} from={from} to={to} labelClass={LABEL} />
            ))}
          </div>
        )}
      </div>

      <div className="px-2 pb-2">
        <CapacityBand periods={capacity} from={from} to={to} labelWidthClass={LABEL} />
      </div>
    </div>
  );
}

function ConstructionRow({ row, from, to, labelClass }) {
  const start = row.allocationSpan?.start, end = row.allocationSpan?.end;
  const geo = start ? barGeometry(start, end, from, to) : null;
  return (
    <div className="flex items-stretch border-b border-hairline last:border-0 relative" style={{ minHeight: 34 }}>
      <div className={`${labelClass} shrink-0 px-3 py-1.5 border-r border-hairline`}>
        <span className="text-xs text-muted truncate block" title={row.label}>{row.label}</span>
      </div>
      <div className="relative flex-1 min-w-0">
        {geo && (
          <div className="absolute rounded" style={{ left: `${geo.leftPct}%`, width: `${geo.widthPct}%`, top: 12, height: 8, background: "#cbd5e1" }}
            title={`Internal labour booked ${start} – ${end}`} />
        )}
      </div>
    </div>
  );
}

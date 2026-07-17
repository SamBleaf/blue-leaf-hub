// CapacityBand — supply vs demand under the timeline. Per period: a stacked bar of
// committed + forecast crew-days against the available ceiling, with spare (green) or
// overbooked (red) called out. Aligned to the same date window as the timeline.
import { barGeometry } from "../../../lib/pipelineTimeline.js";

const fmtPeriod = (ymd, type) => {
  const d = new Date(`${ymd}T12:00:00`);
  if (type === "week") return `wk ${d.getDate()}/${d.getMonth() + 1}`;
  return d.toLocaleDateString("en-AU", { month: "short" });
};

export default function CapacityBand({ periods, from, to, labelWidthClass = "w-44 sm:w-56" }) {
  if (!periods?.length) return null;
  return (
    <div className="mt-2 border-t border-hairline pt-2">
      <div className="flex items-stretch" style={{ minHeight: 72 }}>
        <div className={`${labelWidthClass} shrink-0 px-3 py-2 border-r border-hairline`}>
          <p className="text-xs font-semibold text-ink">Crew capacity</p>
          <p className="text-[10px] text-muted mt-0.5">committed + forecast vs available</p>
        </div>
        <div className="relative flex-1 min-w-0">
          {periods.map((p) => {
            const geo = barGeometry(p.periodStart, periodEnd(p, periods, to), from, to);
            if (!geo) return null;
            const avail = p.availableCrewDays || 0;
            const demand = p.demandCrewDays || 0;
            const denom = Math.max(avail, demand, 1);
            const committedH = (p.committedCrewDays / denom) * 100;
            const forecastH = (p.forecastCrewDays / denom) * 100;
            const availLine = (avail / denom) * 100;
            const over = p.overbookedCrewDays > 0;
            return (
              <div key={p.periodStart} className="absolute bottom-4 flex flex-col justify-end items-stretch" style={{ left: `${geo.leftPct}%`, width: `${geo.widthPct}%`, height: 52, paddingInline: 2 }}
                title={`${fmtPeriod(p.periodStart, p.periodType)} — available ${avail}, committed ${p.committedCrewDays}, forecast ${p.forecastCrewDays}${over ? `, OVER by ${p.overbookedCrewDays}` : `, spare ${p.spareCrewDays}`}`}>
                {/* available ceiling line */}
                <div className="absolute left-0 right-0 border-t border-dashed border-slate-400" style={{ bottom: `${Math.min(100, availLine)}%` }} />
                {/* demand stack */}
                <div className="flex flex-col-reverse w-full rounded-t overflow-hidden" style={{ height: `${Math.min(100, committedH + forecastH)}%` }}>
                  <div style={{ height: `${committedH}%`, background: over ? "#dc2626" : "#1D9E75" }} />
                  <div style={{ height: `${forecastH}%`, background: over ? "#f87171" : "#8fd3bd" }} />
                </div>
                <span className={`absolute -bottom-4 left-0 right-0 text-center text-[9px] ${over ? "text-red-600 font-semibold" : "text-muted"}`}>
                  {over ? `−${p.overbookedCrewDays}` : `+${p.spareCrewDays}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// A period's end = the day before the next period starts (or the window end for the last).
function periodEnd(p, periods, to) {
  const idx = periods.indexOf(p);
  const next = periods[idx + 1];
  if (!next) return to;
  const d = new Date(`${next.periodStart}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

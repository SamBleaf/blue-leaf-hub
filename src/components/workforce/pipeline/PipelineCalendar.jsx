// =============================================================================
// PipelineCalendar — month grid of carpentry STAGE blocks (Phase 2a, read-only).
// Each job's stages (first fix, cladding, second fix…) render as contiguous bars
// across the days they span, colour-coded by a jobs legend. Adopts the orphaned
// ScheduleCalendar's 6-week grid; adds contiguous per-week bar rendering + lanes.
// Phase 2b adds drag + ripple + write-back over the same blocks.
// =============================================================================
import { useMemo, useState } from "react";
import { resolveJobColor, jobKey } from "../../../lib/plannerColors.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LANE_H = 20;

function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function parse(s) { const [y, m, dd] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, dd || 1, 12); }
function dayDiff(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }

// Flatten jobs → stage blocks with a resolved colour. Only stages with a planned start.
function toBlocks(jobs) {
  const orderedKeys = jobs.map((j) => jobKey("carpentry", j.id));
  const blocks = [];
  for (const job of jobs) {
    const palette = resolveJobColor(jobKey("carpentry", job.id), orderedKeys);
    for (const s of job.stages || []) {
      if (!s.plannedStart) continue;
      blocks.push({
        id: s.rowId || `${job.id}:${s.stage}`,
        jobId: job.id, jobLabel: job.label, palette,
        stageKey: s.stage, stageLabel: s.label,
        start: s.plannedStart, end: s.plannedEnd || s.plannedStart,
        status: s.scheduleStatus, locked: s.locked,
        marginRisk: job.breakEven?.marginRisk,
      });
    }
  }
  return blocks;
}

// Greedy lane packing for the blocks intersecting one week [wStart..wEnd] (Sun..Sat).
function layoutWeek(blocks, wStart, wEnd) {
  const segs = blocks
    .filter((b) => b.start <= wEnd && b.end >= wStart)
    .map((b) => ({ block: b, c0: Math.max(0, dayDiff(wStart, b.start)), c1: Math.min(6, dayDiff(wStart, b.end)) }))
    .sort((a, b) => a.c0 - b.c0 || a.c1 - b.c1);
  const lanes = [];
  for (const seg of segs) {
    let lane = lanes.findIndex((L) => L.every((x) => seg.c0 > x.c1 || seg.c1 < x.c0));
    if (lane === -1) { lane = lanes.length; lanes.push([]); }
    lanes[lane].push(seg);
    seg.lane = lane;
  }
  return { segs, laneCount: Math.max(1, lanes.length) };
}

export default function PipelineCalendar({ jobs = [], anchor, onOpenStage }) {
  const [cursor, setCursor] = useState(() => monthStart(anchor ? parse(anchor) : new Date()));
  const blocks = useMemo(() => toBlocks(jobs), [jobs]);

  const weeks = useMemo(() => {
    const first = monthStart(cursor);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());       // back to the Sunday
    return Array.from({ length: 6 }, (_, w) => {
      const wStartD = new Date(start); wStartD.setDate(start.getDate() + w * 7);
      const wEndD = new Date(wStartD); wEndD.setDate(wStartD.getDate() + 6);
      const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(wStartD); d.setDate(wStartD.getDate() + i); return d; });
      return { wStart: ymd(wStartD), wEnd: ymd(wEndD), days };
    });
  }, [cursor]);

  const todayY = ymd(new Date());
  const monthIdx = cursor.getMonth();

  return (
    <div className="rounded-card border border-hairline bg-surface p-3">
      {/* Month nav */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), monthIdx - 1, 1))} className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-muted hover:text-ink">←</button>
        <h2 className="text-base font-semibold text-primary">{cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}</h2>
        <div className="flex gap-1">
          <button type="button" onClick={() => setCursor(monthStart(new Date()))} className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-muted hover:text-ink">Today</button>
          <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), monthIdx + 1, 1))} className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-muted hover:text-ink">→</button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((d) => <div key={d} className="py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{d}</div>)}
      </div>

      <div className="rounded-lg border border-hairline overflow-hidden">
        {weeks.map((wk) => {
          const { segs, laneCount } = layoutWeek(blocks, wk.wStart, wk.wEnd);
          const barsH = laneCount * LANE_H + 4;
          return (
            <div key={wk.wStart} className="relative border-b border-hairline last:border-0">
              {/* day-cell backgrounds + numbers */}
              <div className="grid grid-cols-7">
                {wk.days.map((d) => {
                  const dY = ymd(d); const muted = d.getMonth() !== monthIdx;
                  return (
                    <div key={dY} className={`min-h-[92px] border-r border-hairline last:border-0 p-1 ${muted ? "bg-page/40" : "bg-surface"}`}>
                      <span className={`text-[11px] font-semibold ${dY === todayY ? "text-white bg-warning rounded px-1" : muted ? "text-muted" : "text-ink"}`}>{d.getDate()}</span>
                    </div>
                  );
                })}
              </div>
              {/* stage bars overlaid across the week */}
              <div className="absolute left-0 right-0" style={{ top: 20, height: barsH, pointerEvents: "none" }}>
                {segs.map(({ block, c0, c1, lane }) => (
                  <button
                    key={block.id}
                    type="button"
                    onClick={() => onOpenStage?.(block)}
                    className="absolute truncate rounded text-[10px] font-medium text-white text-left px-1.5"
                    style={{
                      left: `calc(${(c0 / 7) * 100}% + 2px)`,
                      width: `calc(${((c1 - c0 + 1) / 7) * 100}% - 4px)`,
                      top: lane * LANE_H, height: LANE_H - 3,
                      lineHeight: `${LANE_H - 3}px`,
                      background: block.palette.dot,
                      opacity: block.status === "complete" ? 0.55 : 0.95,
                      border: block.marginRisk ? "1px solid #dc2626" : "none",
                      pointerEvents: "auto",
                    }}
                    title={`${block.jobLabel} — ${block.stageLabel}\n${block.start} → ${block.end}${block.locked ? " (locked)" : ""}`}
                  >
                    {block.locked ? "🔒 " : ""}{block.stageLabel}
                  </button>
                ))}
              </div>
              {/* spacer so the row grows to fit its lanes */}
              <div style={{ height: barsH }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

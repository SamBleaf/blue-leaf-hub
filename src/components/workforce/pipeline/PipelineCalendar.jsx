// =============================================================================
// PipelineCalendar — interactive month/year calendar of carpentry STAGE blocks.
// Year view (default): 12 mini-months, whole-year overview. Month view: a 6-week
// day grid with DRAGGABLE stage blocks (grab a block → floating ghost snaps to a day
// → drop reschedules it; dependents ripple). Click a block → open its editor.
// Colour = job (plannerColors). Locked blocks don't drag. Phase 2b.
// =============================================================================
import { useMemo, useRef, useState, useEffect } from "react";
import { resolveJobColor, jobKey } from "../../../lib/plannerColors.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LANE_H = 20;

const pad = (n) => String(n).padStart(2, "0");
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parse(s) { const [y, m, dd] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, dd || 1, 12); }
function dayDiff(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }

function toBlocks(jobs) {
  const orderedKeys = jobs.map((j) => jobKey("carpentry", j.id));
  const blocks = [];
  for (const job of jobs) {
    const palette = job.colour || resolveJobColor(jobKey("carpentry", job.id), orderedKeys);
    for (const s of job.stages || []) {
      if (!s.plannedStart || !s.rowId) continue;
      blocks.push({
        id: s.rowId, jobId: job.id, jobLabel: job.label, palette,
        stageKey: s.stage, stageLabel: s.label,
        start: s.plannedStart, end: s.plannedEnd || s.plannedStart,
        status: s.scheduleStatus, locked: s.locked, marginRisk: job.breakEven?.marginRisk,
        workforceTaskCategory: s.workforceTaskCategory, labourSell: s.labourSell, dependsOn: s.dependsOn,
        actualStart: s.actualStart, actualEnd: s.actualEnd, actualHours: s.actualHours,
      });
    }
  }
  return blocks;
}

function layoutWeek(blocks, wStart, wEnd) {
  const segs = blocks
    .filter((b) => b.start <= wEnd && b.end >= wStart)
    .map((b) => ({ block: b, c0: Math.max(0, dayDiff(wStart, b.start)), c1: Math.min(6, dayDiff(wStart, b.end)) }))
    .sort((a, b) => a.c0 - b.c0 || a.c1 - b.c1);
  const lanes = [];
  for (const seg of segs) {
    let lane = lanes.findIndex((L) => L.every((x) => seg.c0 > x.c1 || seg.c1 < x.c0));
    if (lane === -1) { lane = lanes.length; lanes.push([]); }
    lanes[lane].push(seg); seg.lane = lane;
  }
  return { segs, laneCount: Math.max(1, lanes.length) };
}

export default function PipelineCalendar({ jobs = [], scale = "year", anchor, onMoveStage, onOpenStage, onZoomMonth }) {
  const [cursor, setCursor] = useState(() => { const d = anchor ? parse(anchor) : new Date(); return new Date(d.getFullYear(), scale === "year" ? 0 : d.getMonth(), 1); });
  useEffect(() => { setCursor((c) => new Date(c.getFullYear(), scale === "year" ? 0 : c.getMonth(), 1)); }, [scale]);
  const blocks = useMemo(() => toBlocks(jobs), [jobs]);
  const todayY = ymd(new Date());

  // Instant hover tooltip (no native-title delay), shared by both views.
  const [hover, setHover] = useState(null);
  const showTip = (block, e) => setHover({ block, x: e.clientX, y: e.clientY });
  const hideTip = () => setHover(null);

  return (
    <>
      {scale === "year" ? (
        <YearView year={cursor.getFullYear()} blocks={blocks} todayY={todayY}
          onPrev={() => setCursor(new Date(cursor.getFullYear() - 1, 0, 1))}
          onNext={() => setCursor(new Date(cursor.getFullYear() + 1, 0, 1))}
          onToday={() => setCursor(new Date(new Date().getFullYear(), 0, 1))}
          onOpenStage={onOpenStage} showTip={showTip} hideTip={hideTip}
          onZoomMonth={(mi) => onZoomMonth?.(`${cursor.getFullYear()}-${pad(mi + 1)}-01`)} />
      ) : (
        <MonthView cursor={cursor} setCursor={setCursor} blocks={blocks} todayY={todayY}
          onMoveStage={onMoveStage} onOpenStage={onOpenStage} showTip={showTip} hideTip={hideTip} />
      )}
      {hover && <CalendarTooltip hover={hover} />}
    </>
  );
}

// Instant, rich hover card — fixed near the cursor, no native-title delay.
function CalendarTooltip({ hover }) {
  const b = hover.block;
  const flip = hover.x > (typeof window !== "undefined" ? window.innerWidth - 240 : 9999);
  return (
    <div className="fixed z-50 pointer-events-none rounded-lg bg-slate-900 text-white shadow-xl px-3 py-2 text-[11px] leading-snug max-w-[240px]"
      style={{ left: flip ? hover.x - 232 : hover.x + 14, top: hover.y + 14 }}>
      <div className="font-semibold">{b.stageLabel}</div>
      <div className="text-slate-300">{b.jobLabel}</div>
      <div className="mt-1">Planned: {b.start} → {b.end}</div>
      {b.actualStart && <div className="text-emerald-300">Actual: {b.actualStart} → {b.actualEnd || "in progress"}{b.actualHours ? ` (${b.actualHours}h)` : ""}</div>}
      {b.labourSell ? <div className="text-slate-300">Labour ${Math.round(b.labourSell).toLocaleString()}</div> : null}
      {b.locked && <div className="text-amber-300">🔒 locked</div>}
    </div>
  );
}

// ── Year view — 12 mini-months, whole-year overview ──────────────────────────
function YearView({ year, blocks, todayY, onPrev, onNext, onToday, onOpenStage, onZoomMonth, showTip, hideTip }) {
  return (
    <div className="rounded-card border border-hairline bg-surface p-3">
      <div className="flex items-center justify-between gap-3 mb-3">
        <button type="button" onClick={onPrev} className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-muted hover:text-ink">←</button>
        <h2 className="text-base font-semibold text-primary">{year}</h2>
        <div className="flex gap-1">
          <button type="button" onClick={onToday} className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-muted hover:text-ink">Today</button>
          <button type="button" onClick={onNext} className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-muted hover:text-ink">→</button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {MONTHS.map((mName, mi) => (
          <MiniMonth key={mi} year={year} month={mi} mName={mName} blocks={blocks} todayY={todayY}
            onOpenStage={onOpenStage} onZoom={() => onZoomMonth?.(mi)} showTip={showTip} hideTip={hideTip} />
        ))}
      </div>
    </div>
  );
}

function MiniMonth({ year, month, mName, blocks, todayY, onOpenStage, onZoom, showTip, hideTip }) {
  const first = new Date(year, month, 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const monthBlocks = blocks.filter((b) => b.start <= `${year}-${pad(month + 1)}-31` && b.end >= `${year}-${pad(month + 1)}-01`);
  return (
    <div className="rounded-lg border border-hairline overflow-hidden">
      <button type="button" onClick={onZoom} className="w-full flex items-center justify-between px-2 py-1 bg-page/60 hover:bg-page text-left">
        <span className="text-xs font-semibold text-ink">{mName}</span>
        {monthBlocks.length > 0 && <span className="text-[10px] text-muted">{monthBlocks.length}</span>}
      </button>
      <div className="grid grid-cols-7 text-center">
        {days.map((d, i) => {
          const dY = ymd(d); const inMonth = d.getMonth() === month;
          const dayBlocks = inMonth ? blocks.filter((b) => b.start <= dY && b.end >= dY) : [];
          return (
            <div key={i} className={`min-h-[26px] p-0.5 ${inMonth ? "" : "opacity-30"}`}>
              <div className={`text-[9px] leading-none ${dY === todayY ? "text-white bg-warning rounded-full w-3.5 h-3.5 flex items-center justify-center mx-auto" : "text-muted"}`}>{d.getDate()}</div>
              <div className="flex flex-col gap-px mt-px">
                {dayBlocks.slice(0, 3).map((b) => (
                  <button key={b.id} type="button" onClick={() => onOpenStage?.(b)}
                    onMouseEnter={(e) => showTip?.(b, e)} onMouseLeave={hideTip}
                    className="h-1 rounded-full" style={{ background: b.palette.dot, opacity: b.status === "complete" ? 0.5 : 1 }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Month view — draggable stage blocks ──────────────────────────────────────
function MonthView({ cursor, setCursor, blocks, todayY, onMoveStage, onOpenStage, showTip, hideTip }) {
  const gridRef = useRef(null);
  const dragRef = useRef(null);
  const [ghost, setGhost] = useState(null);
  const monthIdx = cursor.getMonth();

  const weeks = useMemo(() => {
    const first = new Date(cursor.getFullYear(), monthIdx, 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    return Array.from({ length: 6 }, (_, w) => {
      const wS = new Date(start); wS.setDate(start.getDate() + w * 7);
      const wE = new Date(wS); wE.setDate(wS.getDate() + 6);
      const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(wS); d.setDate(wS.getDate() + i); return d; });
      return { wStart: ymd(wS), wEnd: ymd(wE), days };
    });
  }, [cursor, monthIdx]);

  function onPointerDown(e, block) {
    if (block.locked) { onOpenStage?.(block); return; }
    e.preventDefault();
    hideTip?.();
    const cells = [...(gridRef.current?.querySelectorAll("[data-day]") || [])].map((el) => {
      const r = el.getBoundingClientRect(); return { ymd: el.dataset.day, l: r.left, r: r.right, t: r.top, b: r.bottom };
    });
    const grabYmd = hitDayIn(cells, e.clientX, e.clientY) || block.start;
    dragRef.current = { block, cells, grabYmd, delta: 0 };
    setGhost({ label: block.stageLabel, date: block.start, x: e.clientX, y: e.clientY, moved: false });
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }
  function onPointerMove(e) {
    const d = dragRef.current; if (!d) return;
    const cur = hitDayIn(d.cells, e.clientX, e.clientY);
    const delta = cur ? dayDiff(d.grabYmd, cur) : d.delta;
    d.delta = delta;
    setGhost({ label: d.block.stageLabel, date: addDays(d.block.start, delta), x: e.clientX, y: e.clientY, moved: delta !== 0 });
  }
  function onPointerUp() {
    window.removeEventListener("pointermove", onPointerMove);
    const d = dragRef.current; dragRef.current = null;
    setGhost(null);
    if (!d) return;
    if (d.delta && d.delta !== 0) onMoveStage?.(d.block, addDays(d.block.start, d.delta));
    else onOpenStage?.(d.block);
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-3 relative" ref={gridRef}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), monthIdx - 1, 1))} className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-muted hover:text-ink">←</button>
        <h2 className="text-base font-semibold text-primary">{cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}</h2>
        <div className="flex gap-1">
          <button type="button" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-muted hover:text-ink">Today</button>
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
              <div className="grid grid-cols-7">
                {wk.days.map((d) => {
                  const dY = ymd(d); const muted = d.getMonth() !== monthIdx;
                  return (
                    <div key={dY} data-day={dY} className={`min-h-[92px] border-r border-hairline last:border-0 p-1 ${muted ? "bg-page/40" : "bg-surface"}`}>
                      <span className={`text-[11px] font-semibold ${dY === todayY ? "text-white bg-warning rounded px-1" : muted ? "text-muted" : "text-ink"}`}>{d.getDate()}</span>
                    </div>
                  );
                })}
              </div>
              <div className="absolute left-0 right-0" style={{ top: 20, height: barsH, pointerEvents: "none" }}>
                {segs.map(({ block, c0, c1, lane }) => (
                  <div
                    key={block.id}
                    onPointerDown={(e) => onPointerDown(e, block)}
                    onMouseEnter={(e) => { if (!dragRef.current) showTip?.(block, e); }}
                    onMouseLeave={hideTip}
                    className={`absolute truncate rounded text-[10px] font-medium text-white text-left px-1.5 select-none ${block.locked ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"} ${ghost?.moved && dragRef.current?.block?.id === block.id ? "opacity-30" : ""}`}
                    style={{
                      left: `calc(${(c0 / 7) * 100}% + 2px)`, width: `calc(${((c1 - c0 + 1) / 7) * 100}% - 4px)`,
                      top: lane * LANE_H, height: LANE_H - 3, lineHeight: `${LANE_H - 3}px`,
                      background: block.palette.dot, opacity: block.status === "complete" ? 0.55 : 0.95,
                      border: block.marginRisk ? "1px solid #dc2626" : "none", pointerEvents: "auto", touchAction: "none",
                    }}
                  >
                    {block.locked ? "🔒 " : ""}{block.actualStart ? "● " : ""}{block.stageLabel}
                  </div>
                ))}
              </div>
              <div style={{ height: barsH }} />
            </div>
          );
        })}
      </div>

      {ghost && (
        <div className="fixed z-50 pointer-events-none rounded px-2 py-1 text-[11px] font-semibold text-white shadow-lg"
          style={{ left: ghost.x + 12, top: ghost.y + 12, background: "#0f172a" }}>
          {ghost.label}{ghost.moved ? ` → ${new Date(`${ghost.date}T12:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : ""}
        </div>
      )}
    </div>
  );
}

function hitDayIn(cells, x, y) {
  const c = cells.find((r) => x >= r.l && x <= r.r && y >= r.t && y <= r.b);
  return c?.ymd || null;
}

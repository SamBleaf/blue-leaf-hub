// =============================================================================
// WallElevation — the generated elevation of ONE wall (TC-R04 02 §3–4, 04 C0–C6, 05 B1/B5).
//
// Wall-local millimetres (x along the wall from its start, y up from its base) scaled to fit the phone width.
// The screen hands in the wall polygon, its openings and ONE view's elements (cells / boards / panels as
// rects, supports / studs / joints / edges as lines). This component only draws and hit-tests:
//   * tap (one finger, < 8 px movement)  → onTap({ xMm, yMm, hit })   hit = { kind: "opening"|"item", id } | null
//   * drag the SELECTED opening           → onDragOpening(id, { xMm, sillMm } | null, commit) — snapped to 10 mm,
//                                           kept on the wall; a second finger cancels (two fingers never edit).
// Only the selected opening captures touch (touch-action: none); everywhere else a one-finger swipe scrolls the
// page and two fingers zoom, so drawing/selecting and navigating never conflict.
// Zoom: when the fitted drawing makes cells / courses smaller than a finger (< 44 px), − / + buttons enlarge the
// drawing INSIDE its own scroll box (one finger pans it; the page never scrolls sideways). Taps, Previous/Next
// and the selected opening's drag work the same at every zoom; a NEW selection is brought into view (the user's
// own panning is never undone by an unrelated re-render).
// Openings: the part on the wall is drawn white (deducted once, as a union); any part past the wall edge is
// red-hatched (not deducted), and an opening wholly outside the wall is outlined red (opening.issue).
// =============================================================================
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

const SNAP_MM = 10;
const TAP_SLOP_PX = 8;
const DRAG_START_PX = 3;
const LINE_HIT_PX = 18;
const PAD = { l: 14, r: 14, t: 22, b: 30 };
const ZOOMS = [1, 2, 4, 8, 16];
const TARGET_PX = 44;

const snap = (v) => Math.round(v / SNAP_MM) * SNAP_MM;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const fmt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-AU") : "—");

/** Fill / stroke per element state (Hub blue for material in use; hatched grey = consumes nothing). */
const RECT_STYLE = {
  occupied: { fill: "#dbeafe", stroke: "#006c9b" },
  cut: { fill: "#fef3c7", stroke: "#b45309" },
  narrow: { fill: "#fecaca", stroke: "#b91c1c" },
  blocked: { fill: "#fca5a5", stroke: "#991b1b" },
  area: { fill: "#e0f2fe", stroke: "#0369a1" },
};
const LINE_STYLE = {
  support: { stroke: "#0f766e", width: 3 },
  existing: { stroke: "#64748b", width: 2, dash: "6 4" },
  full: { stroke: "#92400e", width: 3 },
  removed: { stroke: "#94a3b8", width: 2, dash: "4 4" },
  joint: { stroke: "#7c3aed", width: 2.5 },
  edge: { stroke: "#ea580c", width: 3 },
  end: { stroke: "#0369a1", width: 3 },
};

function distToSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
}

/** Height labels: the top of each wall end, plus a higher peak between them (gable / traced outline). */
function heightMarks(polygon, bb) {
  const near = (a, b) => Math.abs(a - b) < 0.5;
  const topAt = (x) => Math.max(...polygon.filter((p) => near(p.x, x)).map((p) => p.y));
  const left = { x: bb.x0, y: topAt(bb.x0) }, right = { x: bb.x1, y: topAt(bb.x1) };
  const peak = polygon.reduce((m, p) => (p.y > m.y ? p : m), polygon[0]);
  const out = [left, right];
  if (peak.y > Math.max(left.y, right.y) + 0.5) out.push(peak);
  return out;
}

export default function WallElevation({
  polygon, openings = [], items = [], guides = [], selectedId = null, selectedOpeningId = null, placing = false, draft = null,
  editable = false, maxHeightPx = 320, onTap, onDragOpening, ariaLabel = "Wall elevation",
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const wrapRef = useRef(null);
  const boxRef = useRef(null);
  const svgRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const zoomFrom = useRef(null);
  const pointers = useRef(new Set());
  const tapRef = useRef(null);
  const dragRef = useRef(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frame = useMemo(() => {
    if (!polygon?.length || !width) return null;
    const bb = bboxOf(polygon);
    // the drawing also shows any opening that sticks out past the wall (the engine clips it for areas)
    const ext = bboxOf([...polygon, ...openings.flatMap((o) => [{ x: o.xMm, y: o.sillMm }, { x: o.xMm + o.widthMm, y: o.sillMm + o.heightMm }])
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))]);
    const ew = Math.max(ext.x1 - ext.x0, 1), eh = Math.max(ext.y1 - ext.y0, 1);
    const availW = Math.max(width - PAD.l - PAD.r, 40), availH = Math.max(maxHeightPx - PAD.t - PAD.b, 60);
    const fit = Math.min(availW / ew, availH / eh);
    const s = fit * zoom;
    const svgW = zoom > 1 ? Math.max(width, Math.ceil(ew * s + PAD.l + PAD.r)) : width;
    const offX = zoom > 1 ? PAD.l : PAD.l + (availW - ew * s) / 2;
    const X = (x) => offX + (x - ext.x0) * s;
    const Y = (y) => PAD.t + (ext.y1 - y) * s;
    return { bb, ext, s, fit, X, Y, width: svgW, height: Math.ceil(eh * s + PAD.t + PAD.b), toMm: (px, py) => ({ x: ext.x0 + (px - offX) / s, y: ext.y1 - (py - PAD.t) / s }) };
  }, [polygon, openings, width, maxHeightPx, zoom]);

  // smallest tappable element at the FITTED scale → whether zoom is worth offering
  const smallestPx = useMemo(() => {
    if (!frame) return Infinity;
    let min = Infinity;
    for (const it of items) {
      if (it.kind !== "rect" || it.hit === false || !it.rect) continue;
      const w = Math.abs(it.rect.x1 - it.rect.x0), h = Math.abs(it.rect.y1 - it.rect.y0);
      if (Number.isFinite(w) && Number.isFinite(h)) min = Math.min(min, w * frame.fit, h * frame.fit);
    }
    for (const o of openings) if (o.widthMm > 0 && o.heightMm > 0) min = Math.min(min, o.widthMm * frame.fit, o.heightMm * frame.fit);
    return min;
  }, [frame, items, openings]);
  const maxZoom = ZOOMS.find((z) => smallestPx * z >= TARGET_PX) || ZOOMS[ZOOMS.length - 1];
  const zoomable = smallestPx < TARGET_PX;
  // a wall / view change that no longer needs zoom drops back to the fitted drawing
  useLayoutEffect(() => { if (!zoomable && zoom !== 1) setZoom(1); }, [zoomable, zoom]);

  function changeZoom(next) {
    const box = boxRef.current;
    if (box) zoomFrom.current = { z: zoom, cx: box.scrollLeft + box.clientWidth / 2, cy: box.scrollTop + box.clientHeight / 2 };
    setZoom(next);
  }
  // keep the centre of the view where it was when zooming
  useLayoutEffect(() => {
    const box = boxRef.current, from = zoomFrom.current;
    zoomFrom.current = null;
    if (!box || !from || from.z === zoom) return;
    const k = zoom / from.z;
    box.scrollLeft = Math.max(0, from.cx * k - box.clientWidth / 2);
    box.scrollTop = Math.max(0, from.cy * k - box.clientHeight / 2);
  }, [zoom]);

  const rectPx = (r) => {
    const x0 = frame.X(Math.min(r.x0, r.x1)), x1 = frame.X(Math.max(r.x0, r.x1));
    const y0 = frame.Y(Math.max(r.y0, r.y1)), y1 = frame.Y(Math.min(r.y0, r.y1));
    return { x: x0, y: y0, w: Math.max(x1 - x0, 0.5), h: Math.max(y1 - y0, 0.5) };
  };
  const openingRect = (o) => rectPx({ x0: o.xMm, y0: o.sillMm, x1: o.xMm + o.widthMm, y1: o.sillMm + o.heightMm });

  function local(e) {
    const r = svgRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Priority: a line right under the finger (opening edges, joints) → an opening → the cell under the finger → a line nearby. */
  function hitTest(p) {
    let line = null;
    for (const it of items) {
      if (it.kind !== "line" || it.hit === false) continue;
      const d = distToSeg(p, { x: frame.X(it.a.x), y: frame.Y(it.a.y) }, { x: frame.X(it.b.x), y: frame.Y(it.b.y) });
      if (d <= LINE_HIT_PX && (!line || d < line.d)) line = { id: it.id, d };
    }
    if (line && line.d <= 8) return { kind: "item", id: line.id };
    if (!placing) {
      let best = null;
      for (const o of openings) {
        const r = openingRect(o);
        if (p.x >= r.x - 6 && p.x <= r.x + r.w + 6 && p.y >= r.y - 6 && p.y <= r.y + r.h + 6 && (!best || r.w * r.h < best.area)) best = { kind: "opening", id: o.id, area: r.w * r.h };
      }
      if (best) return { kind: best.kind, id: best.id };
    }
    let rect = null;
    for (const it of items) {
      if (it.kind !== "rect" || it.hit === false) continue;
      const r = rectPx(it.rect);
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h && (!rect || r.w * r.h < rect.area)) rect = { id: it.id, area: r.w * r.h };
    }
    if (rect) return { kind: "item", id: rect.id };
    return line ? { kind: "item", id: line.id } : null;
  }

  function cancelDrag() {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.moved) onDragOpening?.(d.id, null, false);
  }

  function onPointerDown(e) {
    if (!frame) return;
    pointers.current.add(e.pointerId);
    if (pointers.current.size > 1) { cancelDrag(); tapRef.current = null; return; } // a second finger navigates, never edits
    const p = local(e);
    const sel = editable && !placing && selectedOpeningId ? openings.find((o) => o.id === selectedOpeningId) : null;
    if (sel) {
      const r = openingRect(sel);
      if (p.x >= r.x - 8 && p.x <= r.x + r.w + 8 && p.y >= r.y - 8 && p.y <= r.y + r.h + 8) {
        dragRef.current = { id: sel.id, pointerId: e.pointerId, sx: p.x, sy: p.y, x0: sel.xMm, sill0: sel.sillMm, w: sel.widthMm, h: sel.heightMm, moved: false, pos: null };
        try { svgRef.current.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
        e.preventDefault();
        return;
      }
    }
    tapRef.current = { pointerId: e.pointerId, x: p.x, y: p.y };
  }

  function onPointerMove(e) {
    const d = dragRef.current;
    const p = frame && svgRef.current ? local(e) : null;
    if (!p) return;
    if (d && e.pointerId === d.pointerId) {
      const dist = Math.hypot(p.x - d.sx, p.y - d.sy);
      if (!d.moved && dist < DRAG_START_PX) return;
      d.moved = true;
      const bb = frame.bb;
      const pos = {
        xMm: clamp(snap(d.x0 + (p.x - d.sx) / frame.s), Math.max(0, bb.x0), bb.x1 - d.w),
        sillMm: clamp(snap(d.sill0 - (p.y - d.sy) / frame.s), Math.max(0, bb.y0), bb.y1 - d.h),
      };
      if (!d.pos || d.pos.xMm !== pos.xMm || d.pos.sillMm !== pos.sillMm) { d.pos = pos; onDragOpening?.(d.id, pos, false); }
      return;
    }
    const t = tapRef.current;
    if (t && t.pointerId === e.pointerId && Math.hypot(p.x - t.x, p.y - t.y) > TAP_SLOP_PX) tapRef.current = null;
  }

  function onPointerUp(e) {
    pointers.current.delete(e.pointerId);
    const d = dragRef.current;
    if (d && e.pointerId === d.pointerId) {
      dragRef.current = null;
      try { svgRef.current.releasePointerCapture(e.pointerId); } catch { /* released */ }
      if (d.moved && d.pos) { onDragOpening?.(d.id, d.pos, true); return; }
      if (d.moved) return;
    }
    const t = tapRef.current;
    tapRef.current = null;
    if (!frame || (t && t.pointerId !== e.pointerId) || (!t && !d)) return;
    const p = local(e);
    const mm = frame.toMm(p.x, p.y);
    onTap?.({ xMm: mm.x, yMm: mm.y, hit: hitTest(p) });
  }

  function onPointerCancel(e) {
    pointers.current.delete(e.pointerId);
    tapRef.current = null;
    cancelDrag();
  }

  // While the selected opening is being dragged, stop the browser turning the same finger into a page scroll.
  // touch-action on an SVG child is not honoured by every mobile browser, so this is done with a non-passive
  // listener (pointerdown runs first and arms dragRef). A second finger is never prevented: it pans / zooms.
  const hasFrame = !!frame;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const hold = (e) => { if (dragRef.current && e.touches.length === 1 && e.cancelable) e.preventDefault(); };
    svg.addEventListener("touchstart", hold, { passive: false });
    svg.addEventListener("touchmove", hold, { passive: false });
    return () => { svg.removeEventListener("touchstart", hold); svg.removeEventListener("touchmove", hold); };
  }, [hasFrame]);

  const selItem = items.find((it) => it.id === selectedId) || null;
  // zoomed in: bring a NEW selection (Previous / Next, list taps, zoom change) into the scroll box — once, so the
  // user's own panning isn't snapped back by unrelated re-renders (autosave status, recalculation)
  const shownSel = useRef(null);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const key = `${selectedId}|${selectedOpeningId}|${zoom}`;
    if (shownSel.current === key) return;
    if (!box || zoom === 1 || !frame) { shownSel.current = zoom === 1 ? key : null; return; }
    shownSel.current = key;
    let r = null;
    const o = selectedOpeningId ? openings.find((x) => x.id === selectedOpeningId) : null;
    if (o) r = { x0: o.xMm, y0: o.sillMm, x1: o.xMm + o.widthMm, y1: o.sillMm + o.heightMm };
    else if (selItem?.kind === "rect") r = selItem.rect;
    else if (selItem?.kind === "line") r = { x0: selItem.a.x, y0: selItem.a.y, x1: selItem.b.x, y1: selItem.b.y };
    if (!r) return;
    const px0 = frame.X(Math.min(r.x0, r.x1)), px1 = frame.X(Math.max(r.x0, r.x1));
    const py0 = frame.Y(Math.max(r.y0, r.y1)), py1 = frame.Y(Math.min(r.y0, r.y1));
    if (px0 < box.scrollLeft || px1 > box.scrollLeft + box.clientWidth) box.scrollLeft = Math.max(0, (px0 + px1) / 2 - box.clientWidth / 2);
    if (py0 < box.scrollTop || py1 > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(0, (py0 + py1) / 2 - box.clientHeight / 2);
  }, [selectedId, selectedOpeningId, zoom, frame, openings, selItem]);

  if (!polygon?.length) return null;
  const F = frame;
  const clipId = `${uid}-clip`, hatchId = `${uid}-hatch`, offId = `${uid}-off`;
  const polyPts = F ? polygon.map((p) => `${F.X(p.x)},${F.Y(p.y)}`).join(" ") : "";
  const lineEl = (it) => {
    const st = LINE_STYLE[it.state] || LINE_STYLE.support;
    return (
      <g key={it.id} data-el-id={it.id} data-el-kind="line" data-el-state={it.state}>
        <line x1={F.X(it.a.x)} y1={F.Y(it.a.y)} x2={F.X(it.b.x)} y2={F.Y(it.b.y)} stroke={st.stroke} strokeWidth={st.width} strokeDasharray={st.dash}
          strokeLinecap="round" clipPath={it.clip ? `url(#${clipId})` : undefined} />
      </g>
    );
  };
  const zIdx = ZOOMS.indexOf(zoom);

  return (
    <div ref={wrapRef} className="w-full" style={{ minHeight: F ? undefined : 120 }}>
      {F && (
        <div ref={boxRef} data-elevation-box="" style={zoom > 1 ? { overflow: "auto", maxHeight: maxHeightPx } : undefined}>
        <svg ref={svgRef} width={F.width} height={F.height} viewBox={`0 0 ${F.width} ${F.height}`} role="img" aria-label={ariaLabel}
          data-wall-elevation="" data-placing={placing ? "true" : "false"} data-zoom={zoom}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
          style={{ display: "block", touchAction: zoom > 1 ? "pan-x pan-y pinch-zoom" : "pan-y pinch-zoom", cursor: placing ? "crosshair" : "default", userSelect: "none", WebkitUserSelect: "none" }}>
          <defs>
            <clipPath id={clipId}><polygon points={polyPts} /></clipPath>
            <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="#cbd5e1" strokeWidth="2" />
            </pattern>
            <pattern id={offId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="#f87171" strokeWidth="2" />
            </pattern>
          </defs>
          <polygon points={polyPts} fill="#f8fafc" />
          {items.filter((it) => it.kind === "rect").map((it) => {
            const r = rectPx(it.rect);
            if (it.state === "empty") {
              return (
                <g key={it.id} data-el-id={it.id} data-el-kind="rect" data-el-state="empty">
                  <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={`url(#${hatchId})`} stroke="#94a3b8" strokeDasharray="4 3" strokeWidth="1" />
                </g>
              );
            }
            const st = RECT_STYLE[it.state] || RECT_STYLE.occupied;
            return (
              <g key={it.id} data-el-id={it.id} data-el-kind="rect" data-el-state={it.state}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={st.fill} clipPath={`url(#${clipId})`} />
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={st.stroke} strokeWidth="1" strokeOpacity="0.8" />
                {it.mark && r.w >= 16 && r.h >= 16 && (
                  <text x={r.x + r.w / 2} y={r.y + Math.min(r.h / 2, 18) + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={st.stroke}>{it.mark}</text>
                )}
              </g>
            );
          })}
          {guides.filter((g) => Number.isFinite(g.at)).map((g, i) => {
            const a = g.axis === "x" ? { x: F.X(g.at), y: F.Y(F.ext.y0) } : { x: F.X(F.ext.x0), y: F.Y(g.at) };
            const b = g.axis === "x" ? { x: F.X(g.at), y: F.Y(F.ext.y1) } : { x: F.X(F.ext.x1), y: F.Y(g.at) };
            return (
              <g key={`g${i}`} data-guide={g.label || "guide"}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0f172a" strokeWidth="1" strokeDasharray="2 3" />
                {g.label && (g.axis === "x"
                  ? <text x={a.x + 4} y={a.y - 5} fontSize="10" fill="#0f172a">{g.label}</text>
                  : <text x={b.x - 4} y={b.y - 4} textAnchor="end" fontSize="10" fill="#0f172a">{g.label}</text>)}
              </g>
            );
          })}
          {/* wall outline under the line elements, so edges / studs / joints on the boundary stay visible */}
          <polygon points={polyPts} fill="none" stroke="#0f172a" strokeWidth="2" strokeLinejoin="round" />
          {items.filter((it) => it.kind === "line" && !it.over).map(lineEl)}
          {/* fills first (only the part ON the wall is deducted: on-wall part white — overlaps read as one union —
              off-wall part red-hatched), then every outline + label on top so overlapping openings stay readable */}
          <g data-opening-fills="">
            {openings.map((o) => {
              const r = openingRect(o);
              return (
                <g key={o.id}>
                  {o.issue && <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={`url(#${offId})`} data-off-wall={o.id} />}
                  <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={o.type === "door" ? "#f1f5f9" : "#ffffff"} clipPath={`url(#${clipId})`} />
                </g>
              );
            })}
          </g>
          {openings.map((o) => {
            const r = openingRect(o);
            const sel = o.id === selectedOpeningId;
            const issue = o.issue || null; // "clipped" (partly past the wall edge) | "outside" (wholly off the wall)
            return (
              <g key={o.id} data-opening-id={o.id} data-x-mm={o.xMm} data-sill-mm={o.sillMm} data-issue={issue || ""}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={sel ? "#f59e0b" : issue ? "#dc2626" : "#334155"} strokeWidth={sel ? 3 : issue ? 2 : 1.5}
                  strokeDasharray={issue && !sel ? "5 3" : undefined} />
                {o.label && r.w >= 22 && r.h >= 14 && <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="#0f172a">{o.label}</text>}
                {sel && editable && !placing && (
                  // the selected opening is the ONLY element that captures one-finger touch (for dragging)
                  <rect x={r.x - 6} y={r.y - 6} width={r.w + 12} height={r.h + 12} fill="transparent" stroke="#f59e0b" strokeDasharray="3 3" strokeWidth="1" style={{ touchAction: "none", cursor: "move" }} data-drag-handle="" />
                )}
              </g>
            );
          })}
          {/* lines that lie ON an opening's edges (the battens round a window or door) go over its fill and outline */}
          {items.filter((it) => it.kind === "line" && it.over).map(lineEl)}
          {draft && Number.isFinite(draft.tapX) && (() => {
            if (draft.widthMm > 0 && draft.heightMm > 0 && Number.isFinite(draft.xMm) && Number.isFinite(draft.sillMm)) {
              const r = openingRect({ xMm: draft.xMm, sillMm: draft.sillMm, widthMm: draft.widthMm, heightMm: draft.heightMm });
              return <rect data-draft-opening="" x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke="#006c9b" strokeWidth="2" strokeDasharray="5 3" />;
            }
            const cx = F.X(draft.tapX), cy = F.Y(draft.tapY);
            return (
              <g data-draft-opening="">
                <circle cx={cx} cy={cy} r="8" fill="none" stroke="#006c9b" strokeWidth="2" />
                <line x1={cx - 12} y1={cy} x2={cx + 12} y2={cy} stroke="#006c9b" strokeWidth="1.5" />
                <line x1={cx} y1={cy - 12} x2={cx} y2={cy + 12} stroke="#006c9b" strokeWidth="1.5" />
              </g>
            );
          })()}
          {selItem && (selItem.kind === "rect" ? (() => { const r = rectPx(selItem.rect); return <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke="#f59e0b" strokeWidth="3" data-selected-el={selItem.id} />; })()
            : <line x1={F.X(selItem.a.x)} y1={F.Y(selItem.a.y)} x2={F.X(selItem.b.x)} y2={F.Y(selItem.b.y)} stroke="#f59e0b" strokeWidth="6" strokeOpacity="0.85" strokeLinecap="round" data-selected-el={selItem.id} />)}
          {/* dimensions: length under the base, heights at the wall ends (and a higher peak) */}
          <line x1={F.X(F.bb.x0)} y1={F.Y(F.ext.y0) + 10} x2={F.X(F.bb.x1)} y2={F.Y(F.ext.y0) + 10} stroke="#64748b" strokeWidth="1" />
          <text x={(F.X(F.bb.x0) + F.X(F.bb.x1)) / 2} y={F.Y(F.ext.y0) + 23} textAnchor="middle" fontSize="11" fill="#475569" data-dim="length">{fmt(F.bb.x1 - F.bb.x0)} mm</text>
          {heightMarks(polygon, F.bb).map((m, i) => (
            <text key={i} x={clamp(F.X(m.x), 18, F.width - 18)} y={F.Y(m.y) - 6} textAnchor={i === 0 ? "start" : i === 1 ? "end" : "middle"} fontSize="10" fill="#475569" data-dim="height">{fmt(m.y - F.bb.y0)}</text>
          ))}
        </svg>
        </div>
      )}
      {F && zoomable && (
        <div className="mt-1 flex items-center justify-end gap-1" data-elevation-zoom="">
          <span className="mr-auto text-[11px] text-muted">{zoom > 1 ? `Zoom ${zoom}× — one finger moves the drawing` : "Small pieces — zoom in to tap them"}</span>
          <button type="button" aria-label="Zoom out drawing" disabled={zIdx <= 0} onClick={() => changeZoom(ZOOMS[Math.max(0, zIdx - 1)])}
            className="min-h-[44px] min-w-[44px] rounded-lg border border-hairline bg-white text-lg font-semibold text-ink disabled:opacity-40">−</button>
          <button type="button" aria-label="Zoom in drawing" disabled={zoom >= maxZoom} onClick={() => changeZoom(ZOOMS[Math.min(ZOOMS.length - 1, zIdx + 1)])}
            className="min-h-[44px] min-w-[44px] rounded-lg border border-hairline bg-white text-lg font-semibold text-ink disabled:opacity-40">+</button>
        </div>
      )}
    </div>
  );
}

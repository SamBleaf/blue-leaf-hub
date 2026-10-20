// =============================================================================
// measure/Overlays.jsx — SVG layers MeasureScreen draws over the plan (screen px, inside PdfViewport's overlay).
//   FlashingPathShape  a continuous flashing run (13): material colour, RED overflow beyond the legal maximum, the
//                      legal split marker, explicit split bars, one order-length label per ordered piece.
//   PolylineShape      walls, timber/aluminium runs and unfinished drawings.
//   TimberLineShape    member line / distribution run with member ticks + count (03 T1).
//   OpeningMark        a window or door in a traced wall (HUB 022 step 2), with its label (W1, D1 …).
// Nothing here is interactive except through MeasureScreen's tap hit-testing and PointHandlesLayer handles.
// data-* attributes describe what is drawn for automated UI checks (no user data beyond what is shown).
// =============================================================================
import { fmtMm } from "../format.js";
import { COLORS } from "./tools.js";
import { labelBox, safePointAt, screenDirectionAt } from "./geometry.js";

const ptsAttr = (pts) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

export function Label({ x, y, text, color, size = 12 }) {
  return <text x={x} y={y} textAnchor="middle" fontSize={size} fontWeight="700" fill={color} stroke="#fff" strokeWidth="3" paintOrder="stroke">{text}</text>;
}

/** A short bar across the path at a screen point (split cut / legal limit). */
function CrossBar({ at, dir, half = 11, color, width = 3 }) {
  const n = { x: -dir.y, y: dir.x };
  return <line x1={at.x - n.x * half} y1={at.y - n.y * half} x2={at.x + n.x * half} y2={at.y + n.y * half} stroke={color} strokeWidth={width} strokeLinecap="round" />;
}

/**
 * @param {{ measurementId?:string|null, points:Array, path:object|null, cal:object|null, toScreen:Function, selected?:boolean,
 *   unfinished?:boolean, draft?:boolean, activeSplit?:number|null, splitHighlight?:number|null }} p
 */
export function FlashingPathShape({ measurementId = null, points, path, cal, toScreen, selected = false, unfinished = false, draft = false, activeSplit = null }) {
  const pts = points.map(toScreen);
  const layout = path?.layout || null;
  const pieces = path?.pieces || [];
  const base = unfinished ? COLORS.draft : COLORS.flashing;
  const dirAt = (s) => (cal ? screenDirectionAt(points, cal, s, toScreen) : { x: 1, y: 0 });
  const labels = cal && points.length >= 2 ? pieces.map((pc) => {
    const q = safePointAt(points, cal, (pc.fromMm + pc.toMm) / 2);
    if (!q) return null;
    const s = toScreen(q), d = dirAt((pc.fromMm + pc.toMm) / 2);
    const off = { x: d.y * 14, y: -d.x * 14 }; // beside the line, not on it
    const color = pc.overMax ? COLORS.overflow : pc.handlingFlag ? COLORS.handling : base;
    return <Label key={`l${pc.index}`} x={s.x + off.x} y={s.y + off.y + 4} color={color}
      text={`${pieces.length > 1 ? `${pc.index + 1}: ` : ""}${fmtMm(pc.orderMm)}${unfinished && !draft && pieces.length === 1 ? " (unfinished)" : ""}`} />;
  }) : null;
  return (
    <g data-measurement-id={measurementId || undefined} data-path-draft={draft ? "" : undefined} data-kind="polyline" data-points={points.length}
      data-pieces={pieces.length} data-order={pieces.map((pc) => pc.orderMm).join("+")} data-tight={path ? String(path.tightTotalMm) : ""}
      data-unfinished={unfinished ? "" : undefined} data-splits={(path?.splitsMm || []).map((s) => Math.round(s * 10) / 10).join(",")}>
      {selected && pts.length >= 2 && <polyline points={ptsAttr(pts)} fill="none" stroke={COLORS.halo} strokeWidth={11} strokeOpacity={0.7} strokeLinecap="round" strokeLinejoin="round" />}
      {pts.length >= 2 && <polyline points={ptsAttr(pts)} fill="none" stroke={base} strokeWidth={selected ? 4 : 3} strokeDasharray={unfinished ? "9 6" : undefined} strokeLinecap="round" strokeLinejoin="round" />}
      {(layout?.overflowRuns || []).map((r) => (
        <polyline key={`o${r.pieceIndex}`} data-overflow-run="" data-piece={r.pieceIndex} points={ptsAttr(r.points.map(toScreen))} fill="none"
          stroke={COLORS.overflow} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {pts.map((q, i) => <circle key={`v${i}`} cx={q.x} cy={q.y} r={i === 0 || i === pts.length - 1 ? 4.5 : 3.5} fill="#fff" stroke={base} strokeWidth={2} />)}
      {(layout?.legalMarkers || []).map((lm) => {
        const s = toScreen(lm);
        return (
          <g key={`m${lm.pieceIndex}`} data-legal-marker="" data-station={Math.round(lm.stationMm * 10) / 10}>
            <CrossBar at={s} dir={dirAt(lm.stationMm)} color={COLORS.overflow} half={13} width={3} />
            <circle cx={s.x} cy={s.y} r={6} fill="#fff" stroke={COLORS.overflow} strokeWidth={2.5} />
          </g>
        );
      })}
      {(layout?.splits || []).map((sp, i) => {
        if (sp.x == null || sp.y == null) return null;
        const s = toScreen(sp);
        const bad = path?.splits?.[i] && path.splits[i].ok === false;
        const color = bad ? COLORS.overflow : COLORS.split;
        return (
          <g key={`s${i}`} data-split-marker="" data-station={Math.round(sp.stationMm * 10) / 10} data-invalid={bad ? "" : undefined}>
            {activeSplit === i && <circle cx={s.x} cy={s.y} r={14} fill={COLORS.selected} fillOpacity={0.35} />}
            <CrossBar at={s} dir={dirAt(sp.stationMm)} color="#fff" half={13} width={6} />
            <CrossBar at={s} dir={dirAt(sp.stationMm)} color={color} half={12} width={3} />
          </g>
        );
      })}
      {labels}
    </g>
  );
}

/** Wall run / timber or aluminium run / unfinished drawing. */
export function PolylineShape({ measurementId = null, kind, points, toScreen, color, label, selected = false, dashed = false, draft = false }) {
  const pts = points.map(toScreen);
  const mid = pts.length >= 2 ? (() => {
    // label at the middle of the longest leg (readable at any zoom)
    let best = 0, k = 0;
    for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); if (L > best) { best = L; k = i; } }
    return { x: (pts[k].x + pts[k - 1].x) / 2, y: (pts[k].y + pts[k - 1].y) / 2 };
  })() : pts[0];
  return (
    <g data-measurement-id={measurementId || undefined} data-path-draft={draft ? "" : undefined} data-kind={kind} data-points={points.length}>
      {selected && pts.length >= 2 && <polyline points={ptsAttr(pts)} fill="none" stroke={COLORS.halo} strokeWidth={11} strokeOpacity={0.7} strokeLinecap="round" strokeLinejoin="round" />}
      {pts.length >= 2 && <polyline points={ptsAttr(pts)} fill="none" stroke={color} strokeWidth={selected ? 4 : 3} strokeDasharray={dashed ? "9 6" : undefined} strokeLinecap="round" strokeLinejoin="round" />}
      {pts.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={i === 0 || i === pts.length - 1 ? 4.5 : 3.5} fill="#fff" stroke={color} strokeWidth={2} />)}
      {label && mid && <Label x={mid.x} y={mid.y - 9} text={label} color={color} />}
    </g>
  );
}

const overlaps = (a, b, pad = 2) => !!a && !!b && a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;

/**
 * A window or door in a traced wall (HUB 022 step 2): a thick band over the part of the wall it takes, with its label
 * beside the wall. a / b are screen points; drawn for display only (changes are made on the wall's elevation).
 * `avoid` is the screen box of the wall's own name: the label moves along the band (or past its far end) to keep
 * clear of it, which matters on up-and-down walls where the name sits across the wall line.
 */
export function OpeningMark({ id, wallId, type, label, a, b, xMm, widthMm, sillMm, heightMm, avoid = null }) {
  const color = type === "door" ? COLORS.door : COLORS.window;
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  const n = { x: -d.y, y: d.x };
  // the label goes below the wall (right of it when the wall runs up the page): the wall's own name sits above it
  const side = n.y > 0.01 || (n.y >= -0.01 && n.x > 0) ? 1 : -1;
  let pos = null;
  if (label) {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const c = avoid ? { x: (avoid.x0 + avoid.x1) / 2, y: (avoid.y0 + avoid.y1) / 2 } : mid;
    // the band's end further from the wall's name, then a little past it
    const far = Math.hypot(a.x - c.x, a.y - c.y) > Math.hypot(b.x - c.x, b.y - c.y) ? { p: a, s: -1 } : { p: b, s: 1 };
    const along = [mid, far.p, { x: far.p.x + d.x * far.s * 16, y: far.p.y + d.y * far.s * 16 }, { x: far.p.x + d.x * far.s * 30, y: far.p.y + d.y * far.s * 30 }];
    const at = (q, sd) => ({ x: q.x + n.x * 16 * sd, y: q.y + n.y * 16 * sd + 4 });
    const tries = along.flatMap((q) => [at(q, side), at(q, -side)]);
    pos = tries.find((q) => !overlaps(labelBox(q.x, q.y, label, 11), avoid)) || tries[0];
  }
  return (
    <g data-plan-opening={id} data-wall-id={wallId} data-type={type} data-label={label || ""} data-x-mm={xMm} data-width-mm={widthMm} data-sill-mm={sillMm} data-height-mm={heightMm}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" strokeWidth={10} strokeLinecap="butt" />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={6} strokeLinecap="butt" strokeOpacity={type === "door" ? 1 : 0.85} />
      <CrossBar at={a} dir={d} color={color} half={8} width={2.5} />
      <CrossBar at={b} dir={d} color={color} half={8} width={2.5} />
      {pos && <g data-opening-label=""><Label x={pos.x} y={pos.y} text={label} color={color} size={11} /></g>}
    </g>
  );
}

/**
 * Member line or distribution run. ticks: [{ stationId, screen, dir, removed, duplicates, overridden, preview }].
 */
export function TimberLineShape({ measurementId, kind, points, toScreen, label, selected = false, ticks = [], selTick = null }) {
  const color = kind === "member" ? COLORS.member : COLORS.distribution;
  const pts = points.map(toScreen);
  const a = pts[0], b = pts[pts.length - 1];
  return (
    <g data-measurement-id={measurementId} data-kind={kind} data-points={points.length} data-ticks={ticks.filter((t) => !t.preview).length}>
      {selected && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={COLORS.halo} strokeWidth={11} strokeOpacity={0.7} strokeLinecap="round" />}
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={selected ? 4 : 3} strokeLinecap="round" strokeDasharray={kind === "member" ? "2 5" : undefined} />
      {kind === "member" && <>
        <circle cx={a.x} cy={a.y} r={5} fill={color} /><circle cx={b.x} cy={b.y} r={5} fill={color} />
      </>}
      {ticks.map((t) => {
        const n = { x: -t.dir.y, y: t.dir.x };
        const half = 11, sel = selTick === t.stationId;
        const c = t.removed ? COLORS.removed : sel ? COLORS.selected : color;
        return (
          <g key={t.stationId} data-tick={t.preview ? undefined : ""} data-tick-preview={t.preview ? "" : undefined} data-station-id={t.stationId}
            data-removed={t.removed ? "" : undefined} data-duplicates={t.duplicates || 0} data-overridden={t.overridden ? "" : undefined}>
            <line x1={t.screen.x - n.x * half} y1={t.screen.y - n.y * half} x2={t.screen.x + n.x * half} y2={t.screen.y + n.y * half}
              stroke={c} strokeWidth={sel ? 4 : 2.5} strokeDasharray={t.preview || t.removed ? "3 3" : undefined} strokeLinecap="round" />
            {t.duplicates > 0 && <line x1={t.screen.x - n.x * half + t.dir.x * 4} y1={t.screen.y - n.y * half + t.dir.y * 4} x2={t.screen.x + n.x * half + t.dir.x * 4} y2={t.screen.y + n.y * half + t.dir.y * 4} stroke={c} strokeWidth={2.5} />}
            {t.overridden && <circle cx={t.screen.x + n.x * (half + 4)} cy={t.screen.y + n.y * (half + 4)} r={3} fill={COLORS.handling} />}
          </g>
        );
      })}
      {label && <Label x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 16} text={label} color={color} />}
    </g>
  );
}

// =============================================================================
// measure/FloorLayer.jsx — the Floor frame drawn on the plan (Phase 1: a simple overlay, not the full layout drawing).
// Reads the engine's layout (plan-frame millimetres) and draws it back onto the page: truss lines, ring beams, end strongbacks (dashed),
// mid-span strongbacks, stair trimmers, and a letter on every truss-end edge so the beams list matches the plan.
// =============================================================================
import { mmToPoint } from "../../../../shared/takeoff/engine/floor/geometry.js";
import { COLORS } from "./tools.js";

const Dot = ({ x, y, n }) => (
  <g data-floor-edge-number={n}>
    <circle cx={x} cy={y} r={10} fill="#fff" stroke={COLORS.floorBeam} strokeWidth={2} />
    <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={COLORS.floorBeam}>{n}</text>
  </g>
);

export function FloorLayer({ layout, cal, toScreen }) {
  if (!layout || !cal || !layout.origin) return null;
  const P = (q) => toScreen(mmToPoint(cal, layout.origin, q));
  const seg = (a, b, props) => { const s = P(a), e = P(b); return <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} strokeLinecap="round" {...props} />; };
  return (
    <g data-floor-layer="" pointerEvents="none">
      <defs>
        <pattern id="floor-wet-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke={COLORS.floorWet} strokeWidth="1.5" strokeOpacity="0.7" />
        </pattern>
      </defs>
      {/* Phase 2: sheet rows and joints as a light overlay (the full drawing and PDF are phase 4) */}
      {(layout.sheets?.pieces || []).map((p, i) => <polygon key={`s${i}`} data-floor-sheet="" points={p.corners.map((c) => { const q = P(c); return `${q.x},${q.y}`; }).join(" ")} fill="none" stroke={COLORS.floorSheet} strokeWidth={0.75} strokeOpacity={0.8} />)}
      {(layout.wetSheets || []).flatMap((ws) => ws.pieces).map((p, i) => <polygon key={`ws${i}`} data-floor-sheet="" points={p.corners.map((c) => { const q = P(c); return `${q.x},${q.y}`; }).join(" ")} fill="none" stroke={COLORS.floorWet} strokeWidth={0.75} strokeOpacity={0.9} />)}
      {(layout.wets || []).map((w) => <polygon key={w.id} data-floor-wet-hatch={w.id} points={w.points.map((c) => { const q = P(c); return `${q.x},${q.y}`; }).join(" ")} fill="url(#floor-wet-hatch)" stroke={COLORS.floorWet} strokeWidth={1.5} />)}
      {(layout.controlJoints || []).map((c, i) => <g key={`cj${i}`} data-floor-control-joint="">{seg(c.a, c.b, { stroke: COLORS.floorVoid, strokeWidth: 3, strokeDasharray: "2 4" })}</g>)}
      {layout.trusses.map((t, i) => <g key={`t${i}`} data-floor-truss="">{seg(t.a, t.b, { stroke: t.interrupted ? COLORS.floorTrussCut : COLORS.floorTruss, strokeWidth: 1.25, strokeOpacity: 0.9 })}</g>)}
      {layout.endStrongbacks.map((s) => <g key={s.edgeId} data-floor-end-strongback={s.edgeId}>{seg(s.a, s.b, { stroke: COLORS.floorStrongback, strokeWidth: 3, strokeDasharray: "8 5" })}</g>)}
      {layout.midRows.flatMap((row, ri) => row.runs.map((run, k) => {
        const pts = run.points.map(P);
        return <polyline key={`m${ri}-${k}`} data-floor-mid-strongback="" points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={COLORS.floorStrongback} strokeWidth={3.5} strokeLinejoin="round" />;
      }))}
      {layout.trimmers.map((t, i) => <g key={`r${i}`} data-floor-trimmer={t.kind}>{seg(t.a, t.b, { stroke: COLORS.floorTrimmer, strokeWidth: 4 })}</g>)}
      {layout.beams.map((b) => <g key={b.edgeId} data-floor-beam={b.edgeId}>{seg(b.a, b.b, { stroke: COLORS.floorBeam, strokeWidth: 6, strokeOpacity: 0.85 })}</g>)}
      {layout.edges.filter((e) => e.kind === "end" || e.beam).map((e) => {
        const m = P({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 });
        return <Dot key={e.id} x={m.x} y={m.y} n={e.label} />;
      })}
    </g>
  );
}

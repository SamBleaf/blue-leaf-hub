// =============================================================================
// measure/FloorLayoutView.jsx — Floor frame Phase 4: the scaled layout drawing, full screen, opened by the one "Layout" button.
// Draws the shared drawing model (shared/takeoff/engine/floor/drawing.js, the same one the PDF uses). The drawing fits the screen; on a phone it is
// wider than the screen and scrolls sideways (pinch to zoom). The legend and summary are plain text under it so they stay readable at 390 px.
// =============================================================================
import { useMemo } from "react";
import { floorDrawing } from "../../../../shared/takeoff/engine/floor/drawing.js";

const Swatch = ({ s }) => {
  if (s.kind === "fill") return <span className="inline-block h-3 w-5 rounded-sm border border-slate-400" style={{ background: s.color }} />;
  if (s.kind === "box") return <span className="inline-block h-3 w-5 rounded-sm border border-dashed" style={{ borderColor: s.color }} />;
  if (s.kind === "hatch") return <span className="inline-block h-3 w-5 rounded-sm border" style={{ borderColor: s.color, background: `repeating-linear-gradient(45deg, ${s.color} 0 1px, transparent 1px 4px)` }} />;
  return <span className="inline-block w-5" style={{ borderTop: `${s.w || 2}px ${s.dash ? "dashed" : "solid"} ${s.color}` }} />;
};

export function FloorDrawingSvg({ model }) {
  return (
    <svg viewBox={`0 0 ${model.width} ${model.height}`} className="mx-auto block h-auto w-full bg-white" style={{ maxHeight: "calc(100dvh - 9rem)" }} role="img" aria-label="Floor layout" data-floor-layout-drawing="">
      {model.items.map((it, i) => {
        const d = it.data ? { "data-fl": it.data } : {};
        if (it.t === "poly") return <polygon key={i} {...d} points={it.pts.map((p) => `${p.x},${p.y}`).join(" ")} fill={it.fill || "none"} stroke={it.stroke || "none"} strokeWidth={it.sw || 0} strokeDasharray={it.dash ? it.dash.join(" ") : undefined} />;
        if (it.t === "line") return <line key={i} {...d} x1={it.a.x} y1={it.a.y} x2={it.b.x} y2={it.b.y} stroke={it.stroke} strokeWidth={it.sw} strokeDasharray={it.dash ? it.dash.join(" ") : undefined} strokeOpacity={it.opacity} />;
        return <text key={i} {...d} x={it.x} y={it.y} fontSize={it.size} textAnchor={it.anchor} fill={it.fill} fontWeight={it.bold ? 700 : undefined} stroke={it.bg ? "#fff" : undefined} strokeWidth={it.bg ? it.size * 0.3 : undefined} paintOrder={it.bg ? "stroke" : undefined}>{it.s}</text>;
      })}
    </svg>
  );
}

export default function FloorLayoutView({ layout, name, onClose }) {
  const model = useMemo(() => floorDrawing(layout, { name }), [layout, name]);
  if (!model) return null;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-surface" role="dialog" aria-label="Floor layout" data-floor-layout="">
      <div className="flex min-h-[48px] items-center gap-2 border-b border-hairline px-3">
        <p className="min-w-0 flex-1 truncate font-semibold text-ink">{name || "Floor frame"} · Layout</p>
        <button type="button" onClick={onClose} className="min-h-[44px] rounded-lg bg-primary px-4 text-sm font-semibold text-white focus-ring" data-floor-layout-close="">Close</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="min-w-[640px] md:min-w-0"><FloorDrawingSvg model={model} /></div>
        <ul className="mt-3 space-y-1 text-sm text-ink" data-floor-layout-summary="">{model.summary.map((s) => <li key={s}>{s}</li>)}</ul>
        <ul className="mt-3 grid gap-1 text-xs text-muted sm:grid-cols-2" data-floor-layout-legend="">
          {model.legend.map((l) => <li key={l.key} className="flex items-center gap-2" data-legend={l.key}><Swatch s={l} /><span>{l.label}</span></li>)}
        </ul>
        <p className="mt-3 text-[11px] text-muted">The truss supplier designs the layout. Drawn from the plan for ordering and checking.</p>
      </div>
    </div>
  );
}

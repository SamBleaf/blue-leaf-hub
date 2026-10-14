// =============================================================================
// PointHandles — draggable endpoint handles with an offset magnifier (loupe) so the finger
// never hides the point being placed. Desktop: select a handle, then Alt+Arrow nudges it by
// 1 screen px (Shift = 10 px) — never while a text / number field has the keyboard.
// Used by calibration and measurement on top of PdfViewport.
// Handles carry data-takeoff-handle so the viewport's gesture tracker leaves them alone.
// =============================================================================
import { useEffect, useRef, useState } from "react";

const LOUPE = 112;
const DRAG_SLOP_PX = 3;

/**
 * Each handle's touch target is a 44 CSS px circle (data-handle-id = its id). variant "split" draws a split handle
 * (a diamond on the run) instead of a point — used for continuous-flashing split stations (TC-R04 13), whose
 * constrain() keeps the handle on the run.
 * @param {{ points: Array<{id:string, p:{x:number,y:number}, color?:string, label?:string, variant?:"point"|"split"}>,
 *           toScreen: Function, viewportRef: React.RefObject, onMove:(id, pdfPoint)=>void,
 *           onCommit:(id, pdfPoint)=>void, selectedId?:string, onSelect?:(id)=>void,
 *           constrain?:(id, pdfPoint)=>pdfPoint, onCancel?:(id)=>void }} props
 */
export function PointHandlesLayer({ points, toScreen, viewportRef, onMove, onCommit, selectedId, onSelect, constrain, onCancel }) {
  const [drag, setDrag] = useState(null); // { id, screen }
  const loupeRef = useRef(null);

  // loupe paint
  useEffect(() => {
    if (!drag || !loupeRef.current) return;
    const ctx = loupeRef.current.getContext("2d");
    viewportRef.current?.drawLoupe(ctx, drag.screen, LOUPE, 3);
    ctx.strokeStyle = "#dc2626"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(LOUPE / 2, 0); ctx.lineTo(LOUPE / 2, LOUPE); ctx.moveTo(0, LOUPE / 2); ctx.lineTo(LOUPE, LOUPE / 2); ctx.stroke();
  }, [drag, viewportRef]);

  // keyboard nudge for the selected handle
  useEffect(() => {
    if (!selectedId) return undefined;
    const onKey = (e) => {
      if (!e.altKey || !e.key.startsWith("Arrow")) return; // Alt+Arrow nudges; plain arrows pan the plan
      // typing in a field (Option+Arrow moves the caret by word / line on a Mac) never moves the selected point
      if (e.defaultPrevented || e.target?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
      const pt = points.find((x) => x.id === selectedId);
      if (!pt) return;
      const d = e.shiftKey ? 10 : 1;
      const s = toScreen(pt.p);
      const ns = { x: s.x + (e.key === "ArrowRight" ? d : e.key === "ArrowLeft" ? -d : 0), y: s.y + (e.key === "ArrowDown" ? d : e.key === "ArrowUp" ? -d : 0) };
      let np = viewportRef.current.toPdf(ns);
      if (constrain) np = constrain(selectedId, np);
      onCommit(selectedId, np);
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, points, toScreen, viewportRef, onCommit, constrain]);

  return (
    <>
      {points.map((pt) => {
        const s = toScreen(pt.p);
        const sel = pt.id === selectedId;
        return (
          <g key={pt.id}>
            {pt.variant === "split"
              ? <rect x={s.x - (sel ? 8 : 6.5)} y={s.y - (sel ? 8 : 6.5)} width={sel ? 16 : 13} height={sel ? 16 : 13} transform={`rotate(45 ${s.x} ${s.y})`}
                  fill={sel ? "#f59e0b" : "#fff"} stroke={pt.color || "#0f172a"} strokeWidth={2.5} />
              : <circle cx={s.x} cy={s.y} r={sel ? 7 : 5} fill="#fff" stroke={pt.color || "#006c9b"} strokeWidth={sel ? 3 : 2} />}
            <circle
              data-takeoff-handle="" data-handle-id={pt.id}
              cx={s.x} cy={s.y} r={22} fill="transparent" style={{ pointerEvents: "auto", cursor: "move", touchAction: "none" }}
              aria-label={pt.label || "Point handle"}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                onSelect?.(pt.id);
                const r = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                const at = { x: e.clientX - r.left, y: e.clientY - r.top };
                // keep the grab offset: the point moves WITH the finger, it never jumps to it
                setDrag({ id: pt.id, grab: { x: s.x - at.x, y: s.y - at.y }, start: at, screen: s, moved: false });
              }}
              onPointerMove={(e) => {
                if (!drag || drag.id !== pt.id) return;
                const r = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                const at = { x: e.clientX - r.left, y: e.clientY - r.top };
                if (!drag.moved && Math.hypot(at.x - drag.start.x, at.y - drag.start.y) < DRAG_SLOP_PX) return;
                let p = viewportRef.current.toPdf({ x: at.x + drag.grab.x, y: at.y + drag.grab.y });
                if (constrain) p = constrain(pt.id, p);
                setDrag((d) => ({ ...d, screen: toScreen(p), moved: true, p }));
                onMove?.(pt.id, p);
              }}
              onPointerUp={() => {
                if (drag?.id === pt.id && drag.moved && drag.p) onCommit(pt.id, drag.p); // a touch without a drag changes nothing
                setDrag(null);
              }}
              onPointerCancel={() => { setDrag(null); onCancel?.(pt.id); }}
            />
          </g>
        );
      })}
      {drag?.moved && (
        <foreignObject x={Math.max(4, drag.screen.x - LOUPE / 2)} y={Math.max(4, drag.screen.y - LOUPE - 48)} width={LOUPE} height={LOUPE}>
          <canvas ref={loupeRef} width={LOUPE} height={LOUPE} style={{ borderRadius: LOUPE / 2, border: "2px solid #006c9b", background: "#fff" }} />
        </foreignObject>
      )}
    </>
  );
}

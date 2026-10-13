// =============================================================================
// ProfileEditor — focused workspace for drawing and editing a flashing cross-section profile
// (R03 §6). Phone: full screen — top bar (Cancel · title · Undo/Redo · Save), the drawing,
// and a bottom sheet for the selected leg / corner / end. ≥1024px (lg): the same drawing with
// a right-hand property panel.
//
// The profile is the canonical shared/takeoff/profile.js model. Every edit is one pure
// command pushed to a bounded undo history (shared/takeoff/history.js); a command that throws
// TakeoffValidationError shows its plain-English message inline and never enters history.
// The drawing is pure SVG laid out in screen px by profileEditorModel.js (leg labels on the
// non-coated side, angles outside each fold, leader lines when crowded). Pointer input goes
// through the shared gesture tracker: tap selects (or places a sketch point), drag pans, two
// fingers pinch-zoom; Ctrl/⌘+scroll zooms on desktop.
//
// `value` is read on mount — remount (key) to load a different profile. onSave receives the
// normalised profile; the parent persists it. readOnly = pan/zoom only.
// `startBlank` (a NEW flashing): opens on an empty grid with nothing drawn — tap the shape out point
// by point (FlashIt-style), then refine exact sizes, angles, hems and the coated face.
// =============================================================================
import { forwardRef, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  normaliseProfile, starterProfile, setSegmentLength, setIncludedAngle, setBendDirection, addSegment,
  removeLastSegment, setTreatment, rotateProfile, mirrorProfile, flipCoatedFace, reverseProfile,
  profileProblems, indicativeGirthMm, includedAngle, bendDirection, formatMm, MAX_PROFILE_SEGMENTS,
  TakeoffValidationError, createHistory, pushHistory, undo, redo, canUndo, canRedo,
} from "../../../shared/takeoff/index.js";
import { createGestureTracker } from "./gestures.js";
import {
  layoutProfile, hitTest, fitView, fitProfileView, zoomAt, panBy, screenToMm, snapToGrid, profileBoundsMm, gridLines,
  sketchLegs, sketchToProfile, parseNumberInput, formatAngle, treatmentText, SKETCH_GRID_MM,
} from "./profileEditorModel.js";

const NEW_LEG_MM = 50;
const FIT_INSET = { top: 48 }; // keep the fitted drawing clear of the Fit / zoom buttons
const SNAP_ANGLES = [45, 90, 135, 180];

function loadInitial(value) {
  if (!value) return { profile: starterProfile(), error: null };
  try {
    return { profile: normaliseProfile(value), error: null };
  } catch (e) {
    return { profile: starterProfile(), error: `The saved profile couldn’t be read (${e.message})` };
  }
}
const sameSel = (a, b) => !!a && !!b && a.kind === b.kind && a.id === b.id && a.index === b.index && a.which === b.which;
const sameProfile = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pts = (list) => list.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

export default function ProfileEditor({ value, title, readOnly = false, startBlank = false, onSave, onCancel }) {
  const [init] = useState(() => loadInitial(value));
  // Blank start: no shape exists until the first sketch is finished (Save stays off until then).
  const [blank, setBlank] = useState(() => !!startBlank && !readOnly);
  const [hist, setHist] = useState(() => createHistory(init.profile));
  const profile = hist.present;
  const [selection, setSelection] = useState(null);
  const [error, setError] = useState(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [nav, setNav] = useState({ auto: true, view: null }); // auto = follow zoom-to-fit
  const [sketch, setSketch] = useState(null);                 // { points: [{x,y}] in mm }
  const [addTurn, setAddTurn] = useState("left");
  const drawRef = useRef(null);
  const handlers = useRef({});

  const heading = title || "Flashing profile";
  const broken = readOnly && !!init.error; // never show a stand-in shape as if it were the saved one
  const editable = !readOnly && !sketch;

  // ── derived geometry (memoised) ────────────────────────────────────────────
  const problems = useMemo(() => profileProblems(profile), [profile]);
  const girth = useMemo(() => indicativeGirthMm(profile), [profile]);
  const fitted = useMemo(() => fitProfileView(profile, size, FIT_INSET), [profile, size]);
  const view = (nav.auto && !sketch) || !nav.view ? fitted : nav.view;
  const sketchProfile = useMemo(() => {
    if (!sketch || !sketchLegs(sketch.points).lengths.length) return null;
    return sketchToProfile(sketch.points, { coatedFace: profile.coatedFace });
  }, [sketch, profile.coatedFace]);
  const shown = broken ? null : sketch ? sketchProfile : profile;
  const layout = useMemo(() => (shown && size.w > 0 ? layoutProfile(shown, view.scale) : null), [shown, view.scale, size.w]);
  const grid = useMemo(() => (sketch && size.w > 0 ? gridLines(view, size) : null), [sketch, view, size]);
  const anchor = sketch?.points.length ? sketch.points[0] : { x: 0, y: 0 };
  const origin = { x: view.tx + anchor.x * view.scale, y: view.ty - anchor.y * view.scale };

  const sel = useMemo(() => {
    if (!editable || !selection) return null;
    if (selection.kind === "leg") return profile.segments.some((g) => g.id === selection.id) ? selection : null;
    if (selection.kind === "corner") return selection.index < profile.bends.length ? selection : null;
    return selection;
  }, [editable, selection, profile]);

  // Start · L1 · B1 · L2 · … · Ln · End — Previous/Next walk the profile in traversal order
  const sequence = useMemo(() => {
    const out = [{ kind: "end", which: "start" }];
    profile.segments.forEach((s, i) => {
      out.push({ kind: "leg", id: s.id });
      if (i < profile.bends.length) out.push({ kind: "corner", index: i });
    });
    out.push({ kind: "end", which: "end" });
    return out;
  }, [profile]);
  const seqAt = sel ? sequence.findIndex((x) => sameSel(x, sel)) : -1;

  // ── commands ───────────────────────────────────────────────────────────────
  function select(next) {
    setSelection(next);
    setError(null);
  }
  /** Run one pure command → ONE history entry. Validation errors show inline; no-ops are skipped. */
  function run(cmd, { refit = false, clearSelection = false } = {}) {
    let next;
    try {
      next = cmd(profile);
    } catch (e) {
      setError(e instanceof TakeoffValidationError ? e.message : "That change couldn’t be applied.");
      return false;
    }
    setError(null);
    if (!sameProfile(next, profile)) setHist((h) => pushHistory(h, next));
    if (refit) setNav({ auto: true, view: null });
    if (clearSelection) setSelection(null);
    return true;
  }
  function doUndo() { setHist((h) => undo(h)); setError(null); }
  function doRedo() { setHist((h) => redo(h)); setError(null); }

  function applyLength(segId, draft) {
    const n = parseNumberInput(draft);
    if (!Number.isFinite(n)) { setError("Enter the leg length in mm, for example 100."); return; }
    run((p) => setSegmentLength(p, segId, n));
  }
  function applyAngle(index, draft, direction) {
    const n = typeof draft === "number" ? draft : parseNumberInput(draft);
    if (!Number.isFinite(n)) { setError("Enter the included angle in degrees, for example 90."); return; }
    run((p) => setIncludedAngle(p, index, n, direction));
  }
  function applyTreatment(which, { type, width, side }) {
    if (type === "none") { run((p) => setTreatment(p, which, { type: "none" })); return; }
    const w = parseNumberInput(width);
    if (!Number.isFinite(w)) { setError(`Enter the ${type === "closed_hem" ? "hem" : "return"} width in mm, for example 10.`); return; }
    run((p) => setTreatment(p, which, { type, widthMm: w, side }));
  }
  const tools = {
    add: () => run((p) => addSegment(p, { lengthMm: NEW_LEG_MM, turnDeg: addTurn === "left" ? 90 : -90 }), { refit: true }),
    remove: () => run(removeLastSegment, { refit: true }),
    rotate: () => run((p) => rotateProfile(p, 90), { refit: true }),
    mirror: () => run(mirrorProfile, { refit: true }),
    flip: () => run(flipCoatedFace),
    reverse: () => run(reverseProfile, { refit: true, clearSelection: true }),
  };

  // ── sketch mode ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (blank && !sketch && size.w > 0) startSketch();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- open the empty grid once, as soon as it has a size
  }, [blank, size.w]);
  function startSketch() {
    select(null);
    const s = Math.min(6, Math.max(0.5, Math.min(size.w, size.h) / 300));
    setNav({ auto: false, view: { scale: s, tx: size.w * 0.3, ty: size.h * 0.6 } });
    setSketch({ points: [] });
  }
  function addSketchPoint(pt) {
    const mm = snapToGrid(screenToMm(view, pt), SKETCH_GRID_MM);
    const prev = sketch.points;
    if (prev.length) {
      const legs = sketchLegs(prev).lengths.length;
      if (legs >= MAX_PROFILE_SEGMENTS) { setError(`A profile can have at most ${MAX_PROFILE_SEGMENTS} legs.`); return; }
      if (sketchLegs([...prev, mm]).lengths.length === legs) {
        setError("That point doesn’t add a leg — tap further from the last point, and not straight back along it.");
        return;
      }
    }
    setSketch({ points: [...prev, mm] });
    setError(null);
  }
  function undoSketchPoint() {
    setSketch((sk) => (sk ? { points: sk.points.slice(0, -1) } : sk));
    setError(null);
  }
  function cancelSketch() {
    if (blank) { setSketch((sk) => (sk ? { points: [] } : sk)); setError(null); return; } // blank: Clear, stay on the grid
    setSketch(null);
    setNav({ auto: true, view: null });
    setError(null);
  }
  function finishSketch() {
    let next;
    try {
      next = sketchToProfile(sketch.points, { coatedFace: profile.coatedFace });
    } catch (e) {
      setError(e instanceof TakeoffValidationError ? e.message : "That sketch couldn’t be converted.");
      return;
    }
    if (blank) {
      // first shape of a new flashing: it IS the starting point (undo never returns to a stand-in shape)
      setHist(createHistory(next));
      setBlank(false);
      setSketch(null);
      setNav({ auto: true, view: null });
      setError(null);
      return;
    }
    setHist((h) => pushHistory(h, next));
    cancelSketch();
  }

  // ── viewport ───────────────────────────────────────────────────────────────
  function navigate(fn) {
    setNav((n) => ({ auto: false, view: fn(!n.auto && n.view ? n.view : view) }));
  }
  function fit() {
    if (!sketch) { setNav({ auto: true, view: null }); return; }
    if (!sketchProfile) return;
    const b = profileBoundsMm(sketchProfile);
    setNav({ auto: false, view: fitView({ minX: b.minX + anchor.x, maxX: b.maxX + anchor.x, minY: b.minY + anchor.y, maxY: b.maxY + anchor.y }, size, FIT_INSET) });
  }
  const zoomCentre = (f) => navigate((v) => zoomAt(v, f, { x: size.w / 2, y: size.h / 2 }));

  function handleTap(pt) {
    if (sketch) { addSketchPoint(pt); return; }
    if (!editable || !layout) return;
    select(hitTest(layout, { x: pt.x - origin.x, y: pt.y - origin.y }));
  }
  function handleWheel(ev) {
    const r = drawRef.current.getBoundingClientRect();
    if (ev.ctrlKey || ev.metaKey) navigate((v) => zoomAt(v, Math.exp(-ev.deltaY * 0.01), { x: ev.clientX - r.left, y: ev.clientY - r.top }));
    else navigate((v) => panBy(v, -ev.deltaX, -ev.deltaY));
  }
  function handleKey(ev) {
    if (ev.key === "Escape") {
      if (sel) { ev.preventDefault(); select(null); }
      return;
    }
    if (readOnly || !(ev.metaKey || ev.ctrlKey) || ev.altKey) return;
    const t = ev.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return; // native text undo
    const k = ev.key.toLowerCase();
    if (k === "z" && !ev.shiftKey) {
      ev.preventDefault();
      if (sketch) undoSketchPoint(); else doUndo();
    } else if ((k === "z" && ev.shiftKey) || (k === "y" && ev.ctrlKey && !ev.metaKey)) {
      ev.preventDefault();
      if (!sketch) doRedo();
    }
  }
  function onDrawingKey(e) {
    const d = e.shiftKey ? 120 : 40;
    const pan = { ArrowLeft: [d, 0], ArrowRight: [-d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] }[e.key];
    if (e.key === "+" || e.key === "=") zoomCentre(1.25);
    else if (e.key === "-") zoomCentre(0.8);
    else if (e.key === "0") fit();
    else if (pan) navigate((v) => panBy(v, pan[0], pan[1]));
    else return;
    e.preventDefault();
  }

  // the tracker + listeners attach once and always call the latest handlers
  useLayoutEffect(() => {
    handlers.current = {
      tap: handleTap,
      pan: (dx, dy) => navigate((v) => panBy(v, dx, dy)),
      pinch: (f, c, dx, dy) => navigate((v) => panBy(zoomAt(v, f, c), dx, dy)),
      wheel: handleWheel,
      key: handleKey,
    };
  });
  useEffect(() => {
    const el = drawRef.current;
    if (!el) return undefined;
    const tracker = createGestureTracker({
      mode: () => "tap",
      onTap: (pt) => handlers.current.tap(pt),
      onPan: (dx, dy) => handlers.current.pan(dx, dy),
      onPinch: (f, c, dx, dy) => handlers.current.pinch(f, c, dx, dy),
    });
    const detach = tracker.attach(el);
    const onWheel = (ev) => { ev.preventDefault(); handlers.current.wheel(ev); };
    const onKey = (ev) => handlers.current.key(ev);
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      detach();
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  // drawing size: measured before first paint, then tracked
  useLayoutEffect(() => {
    const el = drawRef.current;
    if (!el) return undefined;
    const measure = (w, h) => setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    const r = el.getBoundingClientRect();
    measure(Math.round(r.width), Math.round(r.height));
    const ro = new ResizeObserver(([entry]) => measure(Math.round(entry.contentRect.width), Math.round(entry.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // lock page scroll under the focused workspace
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── top bar actions ────────────────────────────────────────────────────────
  function cancel() {
    const dirty = (!blank && hist.present !== init.profile) || (sketch?.points.length ?? 0) > 0;
    if (!readOnly && dirty && !window.confirm("Discard your changes to this profile?")) return;
    onCancel?.();
  }
  function save() {
    if (sketch || blank) return;
    try {
      onSave?.(normaliseProfile(profile));
    } catch (e) {
      setError(e instanceof TakeoffValidationError ? e.message : "This profile couldn’t be saved.");
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────
  const n = profile.segments.length;
  const s = view.scale;
  const step = (dir) => { const next = sequence[seqAt + dir]; if (next) select(next); };
  const header = (titleText, subtitle) => (
    <SheetHeader
      title={titleText} subtitle={subtitle} onClose={() => select(null)}
      onPrev={seqAt > 0 ? () => step(-1) : null} onNext={seqAt >= 0 && seqAt < sequence.length - 1 ? () => step(1) : null}
    />
  );

  let editor = null;
  if (sel?.kind === "leg") {
    const i = profile.segments.findIndex((g) => g.id === sel.id);
    const seg = profile.segments[i];
    editor = (
      <LegEditor key={`leg:${seg.id}`} lengthMm={seg.lengthMm} error={error} onApply={(d) => applyLength(seg.id, d)}
        header={header(`Leg L${i + 1}`, "Finished face size of this leg")} />
    );
  } else if (sel?.kind === "corner") {
    editor = (
      <CornerEditor key={`corner:${sel.index}`} turnDeg={profile.bends[sel.index].turnDeg} error={error}
        onApply={(d, dir) => applyAngle(sel.index, d, dir)}
        onDirection={(dir) => run((p) => setBendDirection(p, sel.index, dir))}
        header={header(`Corner B${sel.index + 1}`, `Between L${sel.index + 1} and L${sel.index + 2}`)} />
    );
  } else if (sel?.kind === "end") {
    const t = profile[sel.which];
    editor = (
      <EndEditor key={`end:${sel.which}`} treatment={t} legCount={n} coatedFace={profile.coatedFace} error={error}
        onApply={(draft) => applyTreatment(sel.which, draft)}
        header={header(sel.which === "start" ? "Start treatment" : "End treatment", sel.which === "start" ? "Before L1" : `After L${n}`)} />
    );
  }

  let panel;
  if (broken) {
    panel = <p className="text-sm text-muted">Nothing to show — ask whoever saved this profile to open and re-save it.</p>;
  } else if (readOnly) {
    panel = <DimensionChips profile={profile} />;
  } else if (sketch) {
    const legs = sketchProfile ? sketchProfile.segments.length : 0;
    panel = (
      <div>
        <h2 className="text-base font-bold text-ink">{blank ? "Draw the flashing" : "Draw shape"}</h2>
        <p className="mt-1 text-sm text-muted">
          Tap points on the grid (10 mm squares) along the flashing&apos;s cross-section. Each tap after the first adds a leg —
          lengths round to 5 mm and angles snap to 15°. Then tap any leg or corner to type the exact size, and add hems at the ends.
        </p>
        <p className="mt-2 text-sm font-semibold text-ink" aria-live="polite">
          {!sketch.points.length ? "Tap where the profile starts." : !legs ? "Tap the end of the first leg." : `${legs} leg${legs === 1 ? "" : "s"} drawn`}
        </p>
        <ErrorText error={error} />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Btn onClick={undoSketchPoint} disabled={!sketch.points.length}>Undo point</Btn>
          <Btn onClick={cancelSketch} disabled={blank && !sketch.points.length}>{blank ? "Clear" : "Cancel sketch"}</Btn>
          <Btn kind="primary" onClick={finishSketch} disabled={!legs}>{blank ? "Done drawing" : "Done sketching"}</Btn>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Drag to move around, pinch to zoom.{blank ? "" : " Done sketching replaces the current shape — you can undo it."}
        </p>
      </div>
    );
  } else {
    panel = (
      <>
        {editor}
        <div className={editor ? "hidden lg:mt-5 lg:block lg:border-t lg:border-hairline lg:pt-4" : ""}>
          <p className="text-sm text-muted">Tap a leg, corner or end on the drawing to edit it.</p>
          <DimensionChips profile={profile} onSelect={select} selected={sel} />
          <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Shape</h3>
          <div className="flex gap-2">
            <div role="group" aria-label="Turn for the new leg" className="grid shrink-0 grid-cols-2 gap-1">
              <Toggle pressed={addTurn === "left"} onClick={() => setAddTurn("left")}>Turn left</Toggle>
              <Toggle pressed={addTurn === "right"} onClick={() => setAddTurn("right")}>Turn right</Toggle>
            </div>
            <Btn kind="primary" className="flex-1" onClick={tools.add} disabled={n >= MAX_PROFILE_SEGMENTS}
              aria-label={`Add a ${NEW_LEG_MM} mm leg at the end, turning ${addTurn} 90°`}>Add leg</Btn>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Btn onClick={tools.remove} disabled={n <= 1} aria-label={`Remove the last leg (L${n})`}>Remove last leg</Btn>
            <Btn onClick={tools.rotate} aria-label="Rotate the drawing 90° — orientation only, the part is unchanged">Rotate 90°</Btn>
            <Btn onClick={tools.mirror} aria-label="Mirror — flip the shape and its coating together">Mirror</Btn>
            <Btn onClick={tools.flip} aria-label="Flip coated face — keep the shape, coat the other face">Flip coated face</Btn>
            <Btn onClick={tools.reverse} aria-label="Reverse direction — number the legs from the other end; same part">Reverse direction</Btn>
            <Btn onClick={startSketch} aria-label="Draw a new shape by tapping points on a grid">Draw shape</Btn>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted">
            <span className="font-semibold text-ink">Mirror</span> flips the whole shape and its coating together.{" "}
            <span className="font-semibold text-ink">Flip coated face</span> keeps the shape and moves the coating to the other face.
          </p>
          {!editor && <ErrorText error={error} />}
        </div>
      </>
    );
  }

  const drawingLabel = broken
    ? "Profile drawing unavailable"
    : blank
    ? "Empty grid for drawing a new flashing. Tap points to draw its cross-section; drag to pan, pinch or Ctrl+scroll to zoom."
    : `Profile drawing, ${n} leg${n === 1 ? "" : "s"}. Drag to pan, pinch or Ctrl+scroll to zoom${editable ? "; tap a leg, corner or end to edit it" : ""}.`;

  return (
    <div data-takeoff-focus="" className="fixed inset-0 z-[70] flex flex-col bg-page" role="dialog" aria-modal="true" aria-label={heading}>
      <header className="flex shrink-0 items-center gap-1 border-b border-hairline bg-white px-2" style={{ paddingTop: "env(safe-area-inset-top)", minHeight: 52 }}>
        <button type="button" onClick={cancel} className="min-h-[44px] min-w-[44px] rounded-lg px-2 text-sm font-medium text-primary hover:bg-primary/5">
          {readOnly ? "Close" : "Cancel"}
        </button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{heading}</h1>
        {!readOnly && (
          <>
            <IconBtn label="Undo" onClick={doUndo} disabled={!canUndo(hist) || !!sketch}><UndoIcon /></IconBtn>
            <IconBtn label="Redo" onClick={doRedo} disabled={!canRedo(hist) || !!sketch}><UndoIcon flip /></IconBtn>
            <button type="button" onClick={save} disabled={!!sketch || blank}
              aria-label={problems.length ? "Save profile (it has problems that block ordering)" : "Save profile"}
              className="min-h-[44px] shrink-0 rounded-lg bg-primary px-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-40">
              {problems.length ? "Save (has problems)" : "Save"}
            </button>
          </>
        )}
      </header>

      {(init.error || (problems.length > 0 && !sketch && !blank)) && (
        <div className="shrink-0 space-y-2 px-3 pt-2">
          {init.error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {init.error}{readOnly ? "." : " — starting from a blank starter shape instead."}
            </div>
          )}
          {problems.length > 0 && !sketch && !broken && (
            <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span className="font-semibold">Check this profile: </span>{problems.join(" ")}
              {!readOnly && " You can still save it, but it can’t go on an order until it’s fixed."}
            </div>
          )}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-[180px] flex-1 flex-col overflow-hidden bg-white lg:m-3 lg:rounded-card lg:border lg:border-hairline">
          <div className="relative min-h-0 flex-1">
            <div
              ref={drawRef}
              data-takeoff-viewport=""
              tabIndex={0}
              role="application"
              aria-label={drawingLabel}
              onKeyDown={onDrawingKey}
              className="absolute inset-0 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              style={{ touchAction: "none", cursor: sketch ? "crosshair" : "default" }}
            >
              {size.w > 0 && (
                <svg width={size.w} height={size.h} className="block" aria-hidden="true">
                  {grid && (
                    <g>
                      {grid.v.map((l) => <line key={`v${l.at}`} x1={l.at} x2={l.at} y1={0} y2={size.h} strokeWidth={l.major ? 1.25 : 1} className={l.major ? "stroke-slate-400/80" : "stroke-slate-300"} />)}
                      {grid.h.map((l) => <line key={`h${l.at}`} y1={l.at} y2={l.at} x1={0} x2={size.w} strokeWidth={l.major ? 1.25 : 1} className={l.major ? "stroke-slate-400/80" : "stroke-slate-300"} />)}
                    </g>
                  )}
                  {layout && <ProfileDrawing layout={layout} origin={origin} sel={sel} sketching={!!sketch} />}
                  {sketch?.points.map((p, i) => (
                    <circle key={`${i}:${p.x},${p.y}`} cx={view.tx + p.x * s} cy={view.ty - p.y * s} r={i === 0 ? 5 : 3.5}
                      className={i === 0 ? "fill-primary" : "fill-slate-400"} />
                  ))}
                </svg>
              )}
            </div>
            <div className="absolute right-2 top-2 flex gap-1">
              <OverlayBtn label="Zoom to fit" onClick={fit}>Fit</OverlayBtn>
              <OverlayBtn label="Zoom in" onClick={() => zoomCentre(1.25)}>+</OverlayBtn>
              <OverlayBtn label="Zoom out" onClick={() => zoomCentre(0.8)}>−</OverlayBtn>
            </div>
          </div>
          {!broken && (
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline px-3 py-1.5 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <svg width="26" height="10" aria-hidden="true">
                  <line x1="1" y1="2.5" x2="25" y2="2.5" strokeWidth="3" strokeLinecap="round" className="stroke-primary" />
                  <line x1="1" y1="7.5" x2="25" y2="7.5" strokeWidth="2" strokeLinecap="round" className="stroke-ink" />
                </svg>
                <span>
                  <span className="font-semibold text-ink">Coated face</span> — {profile.coatedFace} side{(blank ? sketchProfile?.segments.length : (sketchProfile?.segments.length || n)) ? ` travelling L1 → L${sketchProfile?.segments.length || n}` : " (flip it after drawing)"}
                </span>
              </span>
              <span>Dimensions in mm</span>
              {sketch
                ? <span>Sketch preview — lengths to 5 mm, angles to 15°</span>
                : <span>Indicative girth {formatMm(girth)} mm (no bend deduction)</span>}
            </div>
          )}
        </div>

        <aside
          aria-label={editor ? "Edit selection" : "Profile tools"}
          className="z-10 max-h-[50vh] shrink-0 overflow-y-auto overscroll-contain rounded-t-2xl border-t border-hairline bg-white px-4 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] lg:max-h-none lg:w-[380px] lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {panel}
        </aside>
      </div>
    </div>
  );
}

// ── drawing ───────────────────────────────────────────────────────────────────

function ProfileDrawing({ layout, origin, sel, sketching }) {
  const isLeg = (l) => sel?.kind === "leg" && sel.id === l.id;
  const isCorner = (c) => sel?.kind === "corner" && sel.index === c.index;
  const isEnd = (e) => sel?.kind === "end" && sel.which === e.which;
  const labels = [
    ...layout.legs.map((l) => ({ key: `l${l.index}`, label: l.label, selected: isLeg(l), tone: "ink" })),
    ...layout.corners.map((c) => ({ key: `c${c.index}`, label: c.label, selected: isCorner(c), tone: "muted" })),
    ...layout.ends.filter((e) => e.glyph).map((e) => ({ key: `e${e.which}`, label: e.glyph.label, selected: isEnd(e), tone: "muted" })),
  ];
  return (
    <g transform={`translate(${origin.x.toFixed(1)} ${origin.y.toFixed(1)})`}>
      {layout.legs.filter(isLeg).map((l) => (
        <line key="sel" x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} strokeWidth={16} strokeLinecap="round" className="stroke-primary/20" />
      ))}
      {[...layout.corners.filter(isCorner).map((c) => c.v), ...layout.ends.filter(isEnd).map((e) => e.p)].map((p) => (
        <circle key="selpt" cx={p.x} cy={p.y} r={12} strokeWidth={1.5} className="fill-primary/15 stroke-primary" />
      ))}
      <polyline points={pts(layout.coated)} fill="none" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" className="stroke-primary" />
      <polyline points={pts(layout.pts)} fill="none" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round"
        className={sketching ? "stroke-ink/80" : "stroke-ink"} />
      {layout.ends.map((e) => e.glyph && (
        <path key={`g${e.which}`} d={e.glyph.path} fill="none" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" className="stroke-ink" />
      ))}
      {layout.corners.map((c) => <circle key={`cv${c.index}`} cx={c.v.x} cy={c.v.y} r={3} strokeWidth={1.25} className="fill-white stroke-ink" />)}
      {layout.ends.map((e) => <circle key={`ev${e.which}`} cx={e.p.x} cy={e.p.y} r={3.5} strokeWidth={1.25} className="fill-white stroke-slate-400" />)}
      {labels.map(({ key, label }) => label.leader && (
        <g key={`ld${key}`}>
          <line x1={label.leader.from.x} y1={label.leader.from.y} x2={label.leader.to.x} y2={label.leader.to.y} strokeWidth={1} strokeDasharray="3 2" className="stroke-slate-400" />
          <circle cx={label.leader.from.x} cy={label.leader.from.y} r={1.75} className="fill-slate-400" />
        </g>
      ))}
      {labels.map(({ key, label, selected, tone }) => (
        <g key={key}>
          <rect x={label.box.x} y={label.box.y} width={label.box.w} height={label.box.h} rx={5} strokeWidth={1}
            className={selected ? "fill-primary stroke-primary" : "fill-white stroke-hairline"} />
          <text x={label.box.x + label.box.w / 2} y={label.box.y + label.box.h / 2} textAnchor="middle" dominantBaseline="central"
            className={`text-[12px] ${tone === "ink" ? "font-bold" : "font-semibold"} ${selected ? "fill-white" : tone === "ink" ? "fill-ink" : "fill-slate-600"}`}>
            {label.text}
          </text>
        </g>
      ))}
    </g>
  );
}

// ── panel pieces ──────────────────────────────────────────────────────────────

function DimensionChips({ profile, onSelect, selected }) {
  const n = profile.segments.length;
  const items = [
    ...profile.segments.map((s, i) => ({ sel: { kind: "leg", id: s.id }, text: `L${i + 1} ${formatMm(s.lengthMm)} mm`, aria: `Leg L${i + 1}, ${formatMm(s.lengthMm)} mm` })),
    ...profile.bends.map((b, i) => {
      const dir = bendDirection(b.turnDeg);
      const text = `B${i + 1} ${formatAngle(includedAngle(b.turnDeg))}° ${dir === "straight" ? "straight" : dir}`;
      return { sel: { kind: "corner", index: i }, text, aria: `Corner B${i + 1}, ${text.slice(3)}` };
    }),
    { sel: { kind: "end", which: "start" }, text: `Start: ${treatmentText(profile.start)}`, aria: `Start treatment: ${treatmentText(profile.start)}` },
    { sel: { kind: "end", which: "end" }, text: `End: ${treatmentText(profile.end)}`, aria: `End treatment (after L${n}): ${treatmentText(profile.end)}` },
  ];
  const chip = "inline-flex min-h-[44px] items-center rounded-lg border px-3 text-sm";
  return (
    <div>
      <h3 className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Dimensions</h3>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (onSelect ? (
          <button key={it.text + JSON.stringify(it.sel)} type="button" onClick={() => onSelect(it.sel)} aria-label={`Edit ${it.aria}`}
            className={`${chip} ${sameSel(it.sel, selected) ? "border-primary bg-primary/10 text-primary" : "border-hairline bg-white text-ink hover:bg-page"}`}>
            {it.text}
          </button>
        ) : (
          <span key={it.text + JSON.stringify(it.sel)} className={`${chip} border-hairline bg-page text-ink`}>{it.text}</span>
        )))}
      </div>
    </div>
  );
}

function LegEditor({ lengthMm, error, onApply, header }) {
  const id = useId();
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(() => String(lengthMm));
  useEffect(() => { setDraft(String(lengthMm)); }, [lengthMm]); // undo/redo/apply refresh the field
  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); inputRef.current?.select(); }, []);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onApply(draft); }} noValidate>
      {header}
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">Length (mm)</label>
      <div className="flex gap-2">
        <UnitInput ref={inputRef} id={id} unit="mm" value={draft} onChange={setDraft} invalid={!!error} describedBy={error ? `${id}-err` : undefined} />
        <Btn kind="primary" type="submit" className="px-5">Apply</Btn>
      </div>
      <ErrorText id={`${id}-err`} error={error} />
      <p className="mt-2 text-[11px] text-muted">Other legs and angles stay the same — the rest of the shape moves.</p>
    </form>
  );
}

function CornerEditor({ turnDeg, error, onApply, onDirection, header }) {
  const id = useId();
  const inputRef = useRef(null);
  const included = includedAngle(turnDeg);
  const current = bendDirection(turnDeg);
  const [draft, setDraft] = useState(() => formatAngle(included));
  const [dir, setDir] = useState(current === "right" ? "right" : "left");
  useEffect(() => { setDraft(formatAngle(included)); }, [included]);
  useEffect(() => { if (current !== "straight") setDir(current); }, [current]);
  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); inputRef.current?.select(); }, []);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onApply(draft, dir); }} noValidate>
      {header}
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">Included angle (°)</label>
      <div className="flex gap-2">
        <UnitInput ref={inputRef} id={id} unit="°" value={draft} onChange={setDraft} invalid={!!error} describedBy={error ? `${id}-err` : undefined} />
        <Btn kind="primary" type="submit" className="px-5">Apply</Btn>
      </div>
      <div role="group" aria-label="Quick angles" className="mt-2 grid grid-cols-4 gap-2">
        {SNAP_ANGLES.map((a) => (
          <Toggle key={a} pressed={included === a} onClick={() => onApply(a, dir)} aria-label={a === 180 ? "180° — straight" : `${a}°`}>
            {a === 180 ? "180° flat" : `${a}°`}
          </Toggle>
        ))}
      </div>
      <p id={`${id}-dir`} className="mb-1 mt-3 text-xs font-medium text-muted">Bend direction (travelling from L1)</p>
      <div role="group" aria-labelledby={`${id}-dir`} className="grid grid-cols-2 gap-2">
        <Toggle pressed={dir === "left"} onClick={() => { setDir("left"); onDirection("left"); }}>Left</Toggle>
        <Toggle pressed={dir === "right"} onClick={() => { setDir("right"); onDirection("right"); }}>Right</Toggle>
      </div>
      {current === "straight" && <p className="mt-1 text-[11px] text-muted">Straight now — the direction is used when you change the angle.</p>}
      <ErrorText id={`${id}-err`} error={error} />
      <p className="mt-2 text-[11px] leading-snug text-muted">
        Included angle is measured inside the fold: 90° is a square fold, 180° is straight. It is not the roof pitch. Leg lengths stay the same.
      </p>
    </form>
  );
}

const TREATMENTS = [["none", "None"], ["open_return", "Open return"], ["closed_hem", "Closed hem"]];

function EndEditor({ treatment, legCount, coatedFace, error, onApply, header }) {
  const id = useId();
  const typeRef = useRef(null);
  const [type, setType] = useState(treatment.type);
  const [width, setWidth] = useState(() => (treatment.type === "none" ? "10" : String(treatment.widthMm)));
  const [side, setSide] = useState(treatment.side || "left");
  useEffect(() => {
    setType(treatment.type);
    if (treatment.type !== "none") { setWidth(String(treatment.widthMm)); setSide(treatment.side); }
  }, [treatment.type, treatment.widthMm, treatment.side]);
  useEffect(() => { typeRef.current?.focus({ preventScroll: true }); }, []);
  const noun = type === "closed_hem" ? "hem" : "return";
  return (
    <form onSubmit={(e) => { e.preventDefault(); onApply({ type, width, side }); }} noValidate>
      {header}
      <p id={`${id}-type`} className="mb-1 text-xs font-medium text-muted">Treatment</p>
      <div role="group" aria-labelledby={`${id}-type`} className="grid grid-cols-3 gap-2">
        {TREATMENTS.map(([v, l]) => (
          <Toggle key={v} ref={v === treatment.type ? typeRef : undefined} pressed={type === v} onClick={() => setType(v)}>{l}</Toggle>
        ))}
      </div>
      {type !== "none" && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">{noun === "hem" ? "Hem" : "Return"} width (mm)</label>
            <UnitInput id={id} unit="mm" value={width} onChange={setWidth} invalid={!!error} describedBy={error ? `${id}-err` : undefined} />
          </div>
          <div>
            <p id={`${id}-side`} className="mb-1 text-xs font-medium text-muted">Folds to the</p>
            <div role="group" aria-labelledby={`${id}-side`} className="grid grid-cols-2 gap-2">
              <Toggle pressed={side === "left"} onClick={() => setSide("left")}>Left</Toggle>
              <Toggle pressed={side === "right"} onClick={() => setSide("right")}>Right</Toggle>
            </div>
          </div>
          <p className="text-[11px] text-muted sm:col-span-2 lg:col-span-1">
            {side === "left" ? "Left" : "Right"} when travelling L1 → L{legCount} — folds onto the {side === coatedFace ? "coated" : "uncoated"} face.
          </p>
        </div>
      )}
      <Btn kind="primary" type="submit" className="mt-3 w-full">Apply</Btn>
      <ErrorText id={`${id}-err`} error={error} />
      <p className="mt-2 text-[11px] text-muted">A closed hem is drawn as a symbol, not a leg, and is counted once in the girth.</p>
    </form>
  );
}

function SheetHeader({ title, subtitle, onPrev, onNext, onClose }) {
  return (
    <div className="mb-3 flex items-start gap-1">
      <div className="min-w-0 flex-1 pt-1.5">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      <IconBtn label="Previous item" onClick={onPrev || undefined} disabled={!onPrev}>‹</IconBtn>
      <IconBtn label="Next item" onClick={onNext || undefined} disabled={!onNext}>›</IconBtn>
      <IconBtn label="Close editor" onClick={onClose}>✕</IconBtn>
    </div>
  );
}

// ── primitives (match src/components/takeoff/ui.jsx styling) ──────────────────

const UnitInput = forwardRef(function UnitInput({ id, unit, value, onChange, invalid, describedBy }, ref) {
  return (
    <div className="flex min-w-0 flex-1 items-stretch rounded-lg border border-hairline bg-white focus-within:ring-2 focus-within:ring-primary">
      <input
        ref={ref} id={id} type="text" inputMode="decimal" enterKeyHint="done" autoComplete="off" spellCheck={false}
        value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} aria-describedby={describedBy}
        className="min-h-[44px] w-full min-w-0 rounded-l-lg border-0 px-3 text-base text-ink focus:ring-0"
      />
      <span aria-hidden="true" className="flex items-center rounded-r-lg bg-page px-3 text-sm text-muted">{unit}</span>
    </div>
  );
});

function ErrorText({ id, error }) {
  return error ? <p id={id} role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null;
}

function Btn({ kind = "secondary", className = "", type = "button", ...rest }) {
  const cls = kind === "primary"
    ? "bg-primary text-white hover:bg-primary/90 disabled:opacity-40"
    : "border border-hairline bg-white text-ink hover:bg-page disabled:opacity-40";
  return <button type={type} {...rest} className={`min-h-[44px] rounded-lg px-3 text-sm font-medium leading-tight ${cls} ${className}`} />;
}

const Toggle = forwardRef(function Toggle({ pressed, className = "", ...rest }, ref) {
  return (
    <button ref={ref} type="button" aria-pressed={pressed} {...rest}
      className={`min-h-[44px] rounded-lg border px-3 text-sm font-medium leading-tight ${pressed ? "border-primary bg-primary/10 text-primary" : "border-hairline bg-white text-ink hover:bg-page"} ${className}`} />
  );
});

function IconBtn({ label, children, className = "", ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest}
      className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-lg leading-none text-ink hover:bg-page disabled:opacity-30 ${className}`}>
      {children}
    </button>
  );
}

function OverlayBtn({ label, children, onClick }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className="min-h-[44px] min-w-[44px] rounded-lg border border-hairline bg-white/95 px-2 text-sm font-semibold text-ink shadow-sm hover:bg-page">
      {children}
    </button>
  );
}

function UndoIcon({ flip = false }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

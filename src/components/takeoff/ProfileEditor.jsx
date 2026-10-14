// =============================================================================
// ProfileEditor — draw and edit a flashing cross-section on the canvas (R03 §6, revised by R04 01-INTERACTION).
//
// Everyday path: tap points to draw → tap a size label to type it → tap an end → Crush fold → Details / Lengths.
// * The canvas is the editor. Header: Close · name · save status · Undo · More. Nothing selected = at most five
//   general actions (Close, Undo, More, Details, Lengths). Rare transforms (Redo, Rotate, Mirror, Reverse,
//   Flip painted face, Remove last leg, Clear, Fit, dimension list) live under More.
// * Edits AUTO-APPLY — no Apply / Enter / intermediate Save. A typing session on one field is ONE undo step
//   (100 → 1 → 15 → 150 undoes straight back to 100); a toggle or a new point is one step. Partial / invalid
//   text stays a draft (never 0 / NaN), the last valid shape is kept, and the draft survives a reload.
// * Job copies autosave: every valid shape goes to onChange (≈400 ms debounce, and on blur / selection change /
//   close) → the takeoff's normal save + device recovery. The whole drawing session (unfinished points, typed
//   drafts, undo history) is also kept per actor + job + flashing on this device, so a reload / PWA kill
//   restores the same drawing. "Saved" only ever comes from the server (syncStatus).
// * Company standards: same editing, but publishing is the explicit "Save new revision" (it affects other jobs).
// * Mount with a STABLE key (the flashing id) — server acknowledgements never remount it, so focus, keyboard,
//   viewport and history survive saves.
// =============================================================================
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  normaliseProfile, setSegmentLength, setIncludedAngle, setBendDirection, removeLastSegment, setTreatment,
  rotateProfile, mirrorProfile, flipCoatedFace, reverseProfile, profileProblems, indicativeGirthMm, includedAngle,
  bendDirection, formatMm, TakeoffValidationError, createHistory, pushHistory, undo, redo, canUndo, canRedo,
} from "../../../shared/takeoff/index.js";
import { createGestureTracker } from "./gestures.js";
import {
  layoutProfile, hitTest, fitProfileView, zoomAt, panBy, screenToMm, snapToGrid, gridLines,
  sketchToProfile, parseNumberInput, formatAngle, treatmentText, appendLegToward, previewLeg, SKETCH_GRID_MM,
} from "./profileEditorModel.js";
import { loadEditorDraft, saveEditorDraft, clearEditorDraft } from "../../lib/takeoffRecovery.js";
import { SaveChip } from "./ui.jsx";
import { acquireScrollLock } from "./focusMode.js";

const FIT_INSET = { top: 16 };
const AUTOSAVE_MS = 400;
const PREFS_KEY = "blhub_takeoff_editor_prefs";
const readPrefs = () => { try { return { crushWidth: 10, crushSide: null, returnWidth: 10, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") }; } catch { return { crushWidth: 10, crushSide: null, returnWidth: 10 }; } };
const writePrefs = (p) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode */ } };

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const selKey = (s) => (!s ? "" : s.kind === "leg" ? `leg:${s.id}` : s.kind === "corner" ? `corner:${s.index}` : `end:${s.which}`);
const pts = (list) => list.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

function initialEntry(value) {
  if (!value) return { entry: { profile: null, anchor: null, first: null }, error: null };
  try { return { entry: { profile: normaliseProfile(value), anchor: { x: 0, y: 0 }, first: null }, error: null }; }
  catch (e) { return { entry: { profile: null, anchor: null, first: null }, error: `The saved profile couldn’t be read (${e.message}).` }; }
}

/** iOS/Android keyboards cover a fixed layout: follow the VISUAL viewport so the sheet stays above it. */
function useVisualViewport() {
  const [vv, setVv] = useState(null);
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return undefined;
    const on = () => setVv({ h: v.height, top: v.offsetTop });
    on();
    v.addEventListener("resize", on); v.addEventListener("scroll", on);
    return () => { v.removeEventListener("resize", on); v.removeEventListener("scroll", on); };
  }, []);
  return vv;
}

export default function ProfileEditor({
  value, title, readOnly = false, mode = "job", draftScope = null, syncStatus = null, painted = true,
  onChange, onSave, onClose, onDetails, onLengths, onCancel,
}) {
  const close = onClose || onCancel;
  const [init] = useState(() => initialEntry(value));
  const [hist, setHist] = useState(() => createHistory(init.entry, 60));
  const entry = hist.present;
  const profile = entry.profile;
  const [sel, setSel] = useState(null);
  const [drafts, setDrafts] = useState({});          // fieldKey → raw text that isn't a valid value yet
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);       // { text, action? }
  const [menu, setMenu] = useState(false);
  const [list, setList] = useState(false);          // accessible dimension list (More)
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(null);
  const [hover, setHover] = useState(null);         // snapped mm point under the pointer (drawing preview)
  const [loaded, setLoaded] = useState(!draftScope); // don't overwrite a stored draft before reading it
  const [prefs, setPrefs] = useState(readPrefs);
  const [fieldReset, setFieldReset] = useState(0);
  const [selVia, setSelVia] = useState(null); // "label" when a size label was tapped (focus its field) // remounts the open field so it shows the restored value
  const drawRef = useRef(null);
  const handlers = useRef({});
  const session = useRef(null);                     // the field currently being typed into (coalesces undo)
  const latest = useRef({});
  const lastSent = useRef(init.entry.profile);
  const vv = useVisualViewport();
  const job = mode === "job";
  const editable = !readOnly;

  // ── derived ────────────────────────────────────────────────────────────────
  const problems = useMemo(() => (profile ? profileProblems(profile) : []), [profile]);
  const girth = useMemo(() => (profile ? indicativeGirthMm(profile) : 0), [profile]);
  const anchor = useMemo(() => entry.anchor || { x: 0, y: 0 }, [entry.anchor]);
  const v = view || { scale: 1, tx: 0, ty: 0 };
  const layout = useMemo(() => (profile && size.w > 0 ? layoutProfile(profile, v.scale) : null), [profile, v.scale, size.w]);
  const grid = useMemo(() => (editable && size.w > 0 && view ? gridLines(view, size) : null), [editable, view, size]);
  const origin = { x: v.tx + anchor.x * v.scale, y: v.ty - anchor.y * v.scale };
  const n = profile?.segments.length || 0;
  const invalidCount = Object.keys(drafts).length;
  latest.current = { entry, drafts, hist, profile, sel };

  const fitAll = useCallback((p = profile, a = anchor) => {
    if (!p || size.w <= 0) return null;
    // label-aware fit (dimension boxes, crush labels), then shift for where the drawing's start sits
    const f = fitProfileView(p, size, FIT_INSET);
    return { ...f, tx: f.tx - a.x * f.scale, ty: f.ty + a.y * f.scale };
  }, [profile, anchor, size]);

  // first view once the canvas has a size: fit an existing shape, or an empty 10 mm grid for a new one.
  // After that the view only changes when the user pans / zooms / asks to fit — never on a keystroke.
  const lastW = useRef(0);
  useEffect(() => {
    if (!view || !lastW.current) { lastW.current = size.w; return; }
    if (Math.abs(size.w - lastW.current) > 60 && profile) { const f = fitAll(); if (f) setView(f); } // rotated / resized
    lastW.current = size.w;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only on width changes
  }, [size.w]);
  useEffect(() => {
    if (view || size.w <= 0) return;
    setView(profile ? fitAll() : { scale: Math.min(6, Math.max(0.5, Math.min(size.w, size.h) / 300)), tx: size.w * 0.3, ty: size.h * 0.6 });
  }, [view, size, profile, fitAll]);

  // ── restore an unfinished drawing session from this device (F02) ───────────
  useEffect(() => {
    if (!draftScope) return undefined;
    let stop = false;
    loadEditorDraft(draftScope.actorKey, draftScope.workspaceId, draftScope.materialId).then(({ record }) => {
      if (stop) return;
      const d = record?.draft;
      if (d?.hist?.present) {
        const serverNow = init.entry.profile;
        const restore = () => {
          setHist({ ...createHistory(d.hist.present, 60), past: d.hist.past || [], future: d.hist.future || [] });
          setDrafts(d.drafts || {});
          if (d.view) setView(d.view);
        };
        if (sameJson(d.hist.present.profile, serverNow)) restore(); // same shape — just bring back the history/drafts
        else if (sameJson(d.base ?? null, serverNow ?? null) || !serverNow) {
          restore();
          setNotice({ text: "Restored your unfinished drawing from this device.", action: { label: "Discard it", fn: discardDraft } });
        } else {
          setNotice({ text: "This flashing was changed elsewhere after your unsaved drawing on this device.", action: { label: "Use my drawing", fn: () => { restore(); setNotice(null); } }, dismissLabel: "Keep the saved one" });
        }
      }
      setLoaded(true);
    });
    return () => { stop = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, []);

  function discardDraft() {
    if (draftScope) clearEditorDraft(draftScope.actorKey, draftScope.workspaceId, draftScope.materialId);
    setHist(createHistory(init.entry, 60)); setDrafts({}); setNotice(null); session.current = null;
  }

  // every change is written to the device draft at once (not debounced) — includes unfinished points
  useEffect(() => {
    if (!draftScope || !loaded || readOnly) return;
    const empty = !entry.profile && !entry.first && !hist.past.length && !invalidCount;
    if (empty) { clearEditorDraft(draftScope.actorKey, draftScope.workspaceId, draftScope.materialId); return; }
    saveEditorDraft({ ...draftScope, draft: { v: 1, base: lastSent.current ?? null, hist: { present: hist.present, past: hist.past.slice(-30), future: hist.future.slice(0, 30) }, drafts, view } });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- view is saved opportunistically with the next edit
  }, [hist, drafts, loaded]);

  // ── autosave (job copies) ──────────────────────────────────────────────────
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const flush = useCallback(() => {
    if (!job || !onChangeRef.current || readOnly) return;
    const p = latest.current.profile;
    if (sameJson(p ?? null, lastSent.current ?? null)) return;
    if (!p) { lastSent.current = null; onChangeRef.current(null); return; } // cleared / undone to blank: the job copy follows
    try { const clean = normaliseProfile(p); lastSent.current = clean; onChangeRef.current(clean); } catch { /* invalid shapes never leave the editor */ }
  }, [job, readOnly]);
  useEffect(() => {
    if (!job) return undefined;
    const t = setTimeout(flush, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [job, profile, flush]);
  useEffect(() => () => flush(), [flush]); // leaving flushes

  // ── commands ───────────────────────────────────────────────────────────────
  /** One logical edit. `sessionKey` coalesces repeated valid values typed into the same field. */
  function commit(nextEntry, sessionKey = null) {
    if (sameJson(nextEntry, latest.current.entry)) return;
    const coalesce = sessionKey && session.current === sessionKey;
    setHist((h) => (coalesce ? { ...h, present: nextEntry, future: [] } : pushHistory(h, nextEntry)));
    session.current = sessionKey;
    latest.current.entry = nextEntry;
    latest.current.profile = nextEntry.profile;
  }
  function run(fn, { sessionKey = null, quiet = false } = {}) {
    const cur = latest.current.entry;
    if (!cur.profile) return false;
    try {
      const next = fn(cur.profile);
      commit({ ...cur, profile: next }, sessionKey);
      if (!quiet) setError(null);
      return true;
    } catch (e) {
      if (!quiet) setError(e instanceof TakeoffValidationError ? e.message : "That change couldn’t be applied.");
      return false;
    }
  }
  function endSession() { session.current = null; }
  function doUndo() {
    const key = sel ? (sel.kind === "end" ? `end:${sel.which}:w` : selKey(sel)) : null;
    if (key && drafts[key] != null && session.current !== key) {
      // the open field only holds text that never applied: undo just that text, not someone else's leg (R04b R19)
      setDraft(key, null); setFieldReset((n) => n + 1); setError(null); return;
    }
    endSession();
    setHist((h) => undo(h));
    setDrafts({}); setFieldReset((n) => n + 1); setError(null);
  }
  function doRedo() { endSession(); setHist((h) => redo(h)); setDrafts({}); setError(null); }
  function select(next) {
    endSession();
    flush();
    setSel(next ? { kind: next.kind, id: next.id, index: next.index, which: next.which } : null);
    setSelVia(next?.via || null);
    setError(null);
    setMenu(false);
  }
  const setDraft = (key, raw) => setDrafts((d) => {
    if (raw == null) { if (!(key in d)) return d; const x = { ...d }; delete x[key]; return x; }
    return d[key] === raw ? d : { ...d, [key]: raw };
  });
  function savePrefs(patch) { const next = { ...prefs, ...patch }; setPrefs(next); writePrefs(next); }

  // ── canvas input ───────────────────────────────────────────────────────────
  function canvasHit(pt) {
    if (!layout) return null;
    const q = { x: pt.x - origin.x, y: pt.y - origin.y };
    // a tap ON a size label always means that size (labels sit near corners/ends on a small screen)
    const inBox = (bx, pad = 6) => bx && q.x >= bx.x - pad && q.x <= bx.x + bx.w + pad && q.y >= bx.y - pad && q.y <= bx.y + bx.h + pad;
    for (const l of layout.legs) if (inBox(l.label.box)) return { kind: "leg", id: l.id };
    for (const c of layout.corners) if (inBox(c.label.box)) return { kind: "corner", index: c.index };
    for (const e of layout.ends) if (e.glyph && inBox(e.glyph.label.box)) return { kind: "end", which: e.which, via: "label" };
    const h = hitTest(layout, q, 26);
    if (h?.kind === "end") {
      // a plain end only claims taps right on its handle — just beyond it you can still draw a short return
      const e = layout.ends.find((x) => x.which === h.which);
      if (!e.glyph && Math.hypot(q.x - e.p.x, q.y - e.p.y) > 16) return null;
    }
    return h;
  }
  function addPoint(pt) {
    const mm = snapToGrid(screenToMm(v, pt), SKETCH_GRID_MM);
    const cur = latest.current.entry;
    if (!cur.profile && !cur.first) { commit({ profile: null, anchor: null, first: mm }); setError(null); return; }
    if (!cur.profile) {
      try {
        const p = sketchToProfile([cur.first, mm], { coatedFace: "left" });
        commit({ profile: p, anchor: cur.first, first: null }); setError(null);
      } catch (e) { setError(e instanceof TakeoffValidationError ? e.message : "Tap further from the first point."); }
      return;
    }
    const hadEnd = cur.profile.end.type !== "none";
    if (run((p) => appendLegToward(p, cur.anchor || { x: 0, y: 0 }, mm)) && hadEnd) {
      setNotice({ text: `The ${cur.profile.end.type === "closed_hem" ? "crush fold" : "return"} moved to the new end of L${cur.profile.segments.length + 1}. Tap that end to change it.` });
    }
  }
  function handleTap(pt) {
    if (readOnly) return;
    setHover(null);
    const hit = canvasHit(pt);
    if (hit) { select(hit); return; }
    if (sel || menu) { select(null); return; }  // first tap off the shape closes the sheet
    addPoint(pt);
  }
  function navigate(fn) { setView((cur) => fn(cur || v)); }
  const zoomCentre = (f) => navigate((x) => zoomAt(x, f, { x: size.w / 2, y: size.h / 2 }));
  function fit() { const f = fitAll(); if (f) setView(f); setMenu(false); }
  const refitSoon = () => setTimeout(() => { const p = latest.current.profile; const f = p ? fitAll(p, latest.current.entry.anchor || { x: 0, y: 0 }) : null; if (f) setView(f); }, 0);

  // keep the selected item clear of the sheet / keyboard (once per selection or resize, never per keystroke)
  useEffect(() => {
    if (!sel || !layout || !view) return;
    let p = null;
    if (sel.kind === "leg") { const l = layout.legs.find((x) => x.id === sel.id); if (l) p = { x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 }; }
    if (sel.kind === "corner") p = layout.corners.find((c) => c.index === sel.index)?.v;
    if (sel.kind === "end") p = layout.ends.find((e) => e.which === sel.which)?.p;
    if (!p) return;
    const sx = origin.x + p.x, sy = origin.y + p.y, m = 40;
    const dx = sx < m ? m - sx : sx > size.w - m ? size.w - m - sx : 0;
    const dy = sy < m ? m - sy : sy > size.h - m ? size.h - m - sy : 0;
    if (dx || dy) setView((cur) => panBy(cur, dx, dy));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately only on selection / canvas size changes
  }, [selKey(sel), size.h, size.w]);

  function handleKey(ev) {
    if (ev.key === "Escape") { if (menu) setMenu(false); else if (sel) select(null); return; }
    if (readOnly || !(ev.metaKey || ev.ctrlKey) || ev.altKey) return;
    const k = ev.key.toLowerCase();
    if (k === "z" && !ev.shiftKey) { ev.preventDefault(); doUndo(); }
    else if ((k === "z" && ev.shiftKey) || (k === "y" && ev.ctrlKey && !ev.metaKey)) { ev.preventDefault(); doRedo(); }
  }
  function onDrawingKey(e) {
    const d = e.shiftKey ? 120 : 40;
    const pan = { ArrowLeft: [d, 0], ArrowRight: [-d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] }[e.key];
    if (e.key === "+" || e.key === "=") zoomCentre(1.25);
    else if (e.key === "-") zoomCentre(0.8);
    else if (e.key === "0") fit();
    else if (pan) navigate((x) => panBy(x, pan[0], pan[1]));
    else return;
    e.preventDefault();
  }
  useLayoutEffect(() => {
    handlers.current = {
      tap: handleTap,
      pan: (dx, dy) => { setHover(null); navigate((x) => panBy(x, dx, dy)); },
      pinch: (f, c, dx, dy) => { setHover(null); navigate((x) => panBy(zoomAt(x, f, c), dx, dy)); },
      wheel: (ev) => {
        const r = drawRef.current.getBoundingClientRect();
        if (ev.ctrlKey || ev.metaKey) navigate((x) => zoomAt(x, Math.exp(-ev.deltaY * 0.01), { x: ev.clientX - r.left, y: ev.clientY - r.top }));
        else navigate((x) => panBy(x, -ev.deltaX, -ev.deltaY));
      },
      key: handleKey,
      hover: (pt) => {
        // live preview of the next point/leg — shown with a readout ABOVE the finger, not under it
        if (readOnly || sel || menu || !pt || (pt && canvasHit(pt))) { setHover(null); return; }
        setHover({ screen: pt, mm: snapToGrid(screenToMm(v, pt), SKETCH_GRID_MM) });
      },
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
    const local = (ev) => { const r = el.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
    let down = null, touches = 0;
    const onDown = (ev) => { touches += 1; down = local(ev); handlers.current.hover(touches === 1 ? down : null); };
    const onMove = (ev) => {
      const p = local(ev);
      if (ev.pointerType === "mouse" && !ev.buttons) { handlers.current.hover(p); return; }
      if (!down || touches !== 1) return;
      if (Math.hypot(p.x - down.x, p.y - down.y) > 8) { handlers.current.hover(null); down = null; return; } // it's a pan
      handlers.current.hover(p);
    };
    const onUp = () => { touches = Math.max(0, touches - 1); down = null; };
    const onLeave = () => handlers.current.hover(null);
    const onWheel = (ev) => { ev.preventDefault(); handlers.current.wheel(ev); };
    const onKey = (ev) => handlers.current.key(ev);
    el.addEventListener("pointerdown", onDown); el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp); el.addEventListener("pointercancel", onUp); el.addEventListener("pointerleave", onLeave);
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      detach();
      el.removeEventListener("pointerdown", onDown); el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp); el.removeEventListener("pointercancel", onUp); el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  useLayoutEffect(() => {
    const el = drawRef.current;
    if (!el) return undefined;
    const measure = (w, h) => setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    const r = el.getBoundingClientRect();
    measure(Math.round(r.width), Math.round(r.height));
    const ro = new ResizeObserver(([e]) => measure(Math.round(e.contentRect.width), Math.round(e.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    return acquireScrollLock(); // shared, reference-counted (see focusMode.js)
  }, []);

  // ── leave / publish ────────────────────────────────────────────────────────
  function leave() {
    endSession();
    if (!job && editable && hist.past.length && !window.confirm("Leave without publishing these changes to the company standard? (Your drawing stays on this device.)")) return;
    flush();
    // a job copy that reached the takeoff and has no unfinished field drafts doesn't need the device draft
    if (draftScope && job && profile && !invalidCount) clearEditorDraft(draftScope.actorKey, draftScope.workspaceId, draftScope.materialId);
    if (draftScope && !profile && !entry.first) clearEditorDraft(draftScope.actorKey, draftScope.workspaceId, draftScope.materialId);
    close?.();
  }
  function goto(fn) { endSession(); flush(); fn?.(); }
  function publish() {
    try { onSave?.(normaliseProfile(profile)); if (draftScope) clearEditorDraft(draftScope.actorKey, draftScope.workspaceId, draftScope.materialId); }
    catch (e) { setError(e instanceof TakeoffValidationError ? e.message : "This profile couldn’t be saved."); }
  }

  // ── render ─────────────────────────────────────────────────────────────────
  const unsent = job && !sameJson(profile ?? null, lastSent.current ?? null);
  const status = !job ? null : invalidCount || (!profile && entry.first) ? "local" : !profile && !lastSent.current ? null : unsent ? "unsynced" : syncStatus || "unsynced";
  const preview = hover && !sel ? previewLeg(profile, anchor, entry.first, hover.mm) : null;
  const s = v.scale;
  const toScreen = (mm) => ({ x: v.tx + mm.x * s, y: v.ty - mm.y * s });
  const hint = readOnly ? null : !profile && !entry.first ? "Tap where the flashing starts." : !profile ? "Tap the end of the first leg." : "Tap to draw the next leg · tap a size to change it · tap an end for a crush fold";
  const faceWord = painted ? "Painted face" : "Reference side";

  let sheet = null;
  if (sel?.kind === "leg" && profile) {
    const i = profile.segments.findIndex((g) => g.id === sel.id);
    const seg = profile.segments[i];
    if (seg) {
      const key = `leg:${seg.id}`;
      sheet = (
        <Sheet title={`Leg L${i + 1}`} onDone={() => select(null)} onPrev={i > 0 ? () => select({ kind: "leg", id: profile.segments[i - 1].id }) : null}
          onNext={i < n - 1 ? () => select({ kind: "leg", id: profile.segments[i + 1].id }) : null}>
          <LiveNumber key={`${key}:${fieldReset}`} label={`L${i + 1} length`} unit="mm" value={seg.lengthMm} draft={drafts[key]} autoFocus
            onDraft={(raw) => setDraft(key, raw)} onBlur={endSession}
            onValid={(num) => run((p) => setSegmentLength(p, seg.id, num), { sessionKey: key, quiet: true })}
            validate={(num) => { if (num < 5) return "Legs are at least 5 mm."; try { setSegmentLength(profile, seg.id, num); return null; } catch (e) { return e.message; } }} />
          <button type="button" onClick={() => { endSession(); run(flipCoatedFace); }} className="mt-2 min-h-[44px] w-full rounded-lg border border-hairline text-sm text-ink">
            {faceWord}: {profile.coatedFace} side ⇄ swap
          </button>
        </Sheet>
      );
    }
  } else if (sel?.kind === "corner" && profile && sel.index < profile.bends.length) {
    const b = profile.bends[sel.index];
    const key = `corner:${sel.index}`;
    const dir = bendDirection(b.turnDeg);
    sheet = (
      <Sheet title={`Corner B${sel.index + 1}`} onDone={() => select(null)} onPrev={sel.index > 0 ? () => select({ kind: "corner", index: sel.index - 1 }) : null}
        onNext={sel.index < profile.bends.length - 1 ? () => select({ kind: "corner", index: sel.index + 1 }) : null}>
        <LiveNumber key={`${key}:${fieldReset}`} label="Included angle" unit="°" value={includedAngle(b.turnDeg)} draft={drafts[key]} autoFocus
          onDraft={(raw) => setDraft(key, raw)} onBlur={endSession}
          onValid={(num) => run((p) => setIncludedAngle(p, sel.index, num, dir === "straight" ? "left" : dir), { sessionKey: key, quiet: true })}
          validate={(num) => { try { setIncludedAngle(profile, sel.index, num, dir === "straight" ? "left" : dir); return null; } catch (e) { return e.message; } }} />
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {[45, 90, 135].map((a) => <Chip key={a} on={Math.abs(includedAngle(b.turnDeg) - a) < 1e-6} onClick={() => { endSession(); run((p) => setIncludedAngle(p, sel.index, a, dir === "straight" ? "left" : dir)); }}>{a}°</Chip>)}
          <Chip on={dir === "left"} onClick={() => { endSession(); run((p) => setBendDirection(p, sel.index, "left")); }} label="Fold left">↶ L</Chip>
          <Chip on={dir === "right"} onClick={() => { endSession(); run((p) => setBendDirection(p, sel.index, "right")); }} label="Fold right">R ↷</Chip>
        </div>
      </Sheet>
    );
  } else if (sel?.kind === "end" && profile) {
    const t = profile[sel.which];
    const key = `end:${sel.which}:w`;
    const side = (t.type !== "none" && t.side) || prefs.crushSide || (profile.coatedFace === "left" ? "right" : "left");
    const set = (type) => {
      endSession();
      if (type === "none") { run((p) => setTreatment(p, sel.which, { type: "none" })); return; }
      const w = type === "closed_hem" ? prefs.crushWidth : prefs.returnWidth;
      run((p) => setTreatment(p, sel.which, { type, widthMm: w, side }));
      savePrefs({ crushSide: side });
    };
    sheet = (
      <Sheet title={sel.which === "start" ? "Start of L1" : `End of L${n}`} onDone={() => select(null)}
        onPrev={sel.which === "end" ? () => select({ kind: "end", which: "start" }) : null} onNext={sel.which === "start" ? () => select({ kind: "end", which: "end" }) : null}>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="End">
          <EndChoice on={t.type === "none"} onClick={() => set("none")} label="Plain end" icon="plain" />
          <EndChoice on={t.type === "closed_hem"} onClick={() => set("closed_hem")} label="Crush fold" icon="crush" />
          <EndChoice on={t.type === "open_return"} onClick={() => set("open_return")} label="Open return" icon="return" />
        </div>
        {t.type !== "none" && (
          <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-2">
            <LiveNumber key={`${key}:${t.type}:${fieldReset}`} autoFocus={selVia === "label"} label={t.type === "closed_hem" ? "Crush width" : "Return width"} unit="mm" value={t.widthMm} draft={drafts[key]}
              onDraft={(raw) => setDraft(key, raw)} onBlur={endSession}
              onValid={(num) => { if (run((p) => setTreatment(p, sel.which, { ...p[sel.which], widthMm: num }), { sessionKey: key, quiet: true })) savePrefs(t.type === "closed_hem" ? { crushWidth: num } : { returnWidth: num }); }}
              validate={(num) => { if (num < 3) return "At least 3 mm."; try { setTreatment(profile, sel.which, { ...t, widthMm: num }); return null; } catch (e) { return e.message; } }} />
            <button type="button" onClick={() => { endSession(); const ns = t.side === "left" ? "right" : "left"; run((p) => setTreatment(p, sel.which, { ...p[sel.which], side: ns })); savePrefs({ crushSide: ns }); }}
              className="min-h-[44px] rounded-lg border border-hairline px-3 text-sm font-medium text-ink" aria-label={`Flip fold — folds ${t.side} now`}>
              <FoldIcon side={t.side} /> Flip fold
            </button>
          </div>
        )}
        {t.type !== "none" && <p className="mt-1 text-[11px] text-muted">Folds to the {t.side}. Width counts once in the girth.</p>}
      </Sheet>
    );
  }

  const menuItems = [
    ["Redo", doRedo, !canRedo(hist)],
    ["Fit to screen", fit, !profile],
    ["Zoom in", () => zoomCentre(1.25), false],
    ["Zoom out", () => zoomCentre(0.8), false],
    ["Rotate 90°", () => { if (run((p) => rotateProfile(p, 90))) refitSoon(); }, !profile],
    ["Mirror (shape + paint together)", () => { if (run(mirrorProfile)) refitSoon(); }, !profile],
    [`Swap ${faceWord.toLowerCase()}`, () => run(flipCoatedFace), !profile],
    ["Reverse direction (number from the other end)", () => { if (run(reverseProfile)) refitSoon(); setSel(null); }, !profile],
    ["Remove last leg", () => run(removeLastSegment), n <= 1],
    ["Clear drawing", () => { if (window.confirm("Clear the drawing? You can undo this.")) { commit({ profile: null, anchor: null, first: null }); setSel(null); setView(null); } }, !profile && !entry.first],
    [list ? "Hide dimension list" : "Show dimension list", () => setList((x) => !x), !profile],
  ];

  const rootStyle = vv ? { top: vv.top, height: vv.h, bottom: "auto" } : undefined;
  return (
    <div data-takeoff-focus="" className="fixed inset-0 z-[70] flex flex-col bg-page" style={rootStyle} role="dialog" aria-modal="true" aria-label={title || "Flashing"}>
      <header className="flex shrink-0 items-center gap-1 border-b border-hairline bg-white px-2" style={{ paddingTop: "env(safe-area-inset-top)", minHeight: 52 }}>
        <button type="button" onClick={leave} className="min-h-[44px] min-w-[44px] rounded-lg px-2 text-sm font-medium text-primary hover:bg-primary/5">Close</button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-ink">{title || "Flashing"}</h1>
          {status && <SaveChip status={status} />}
        </div>
        {editable && (
          <>
            <IconBtn label="Undo" onClick={doUndo} disabled={!canUndo(hist)}><UndoIcon /></IconBtn>
            <IconBtn label="More" onClick={() => { endSession(); setMenu((m) => !m); setSel(null); }} pressed={menu}><span aria-hidden="true" className="text-lg leading-none">⋯</span></IconBtn>
          </>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row landscape:flex-row">
        <div className="relative min-h-[120px] flex-1 overflow-hidden bg-white lg:m-3 lg:rounded-card lg:border lg:border-hairline">
      {(init.error || notice || syncStatus === "rejected" || (problems.length > 0 && !sel)) && (
        <div className="pointer-events-none absolute inset-x-2 top-2 z-[5] space-y-1.5 [&>*]:pointer-events-auto">
          {init.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{init.error}</div>}
          {notice && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm text-sky-900">
              <span className="flex-1">{notice.text}</span>
              {notice.action && <button type="button" className="min-h-[44px] rounded-md px-2 font-semibold underline" onClick={() => { notice.action.fn(); }}>{notice.action.label}</button>}
              <button type="button" className="min-h-[44px] rounded-md px-2" onClick={() => setNotice(null)}>{notice.dismissLabel || "OK"}</button>
            </div>
          )}
          {syncStatus === "rejected" && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700">A change couldn&apos;t be saved — it&apos;s kept on this device. Close to see why and try again.</div>}
          {problems.length > 0 && !sel && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">{problems.join(" ")}</div>}
        </div>
      )}

          <div ref={drawRef} data-takeoff-viewport="" tabIndex={0} role="application" onKeyDown={onDrawingKey}
            aria-label={profile ? `Flashing drawing, ${n} leg${n === 1 ? "" : "s"}. Tap a size or an end to edit it; tap empty space to draw the next leg.` : "Empty 10 mm grid. Tap points to draw the flashing."}
            className="absolute inset-0 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            style={{ touchAction: "none", cursor: editable ? "crosshair" : "default" }}>
            {size.w > 0 && (
              <svg width={size.w} height={size.h} className="block" aria-hidden="true">
                {grid && (
                  <g>
                    {grid.v.map((l) => <line key={`v${l.at}`} x1={l.at} x2={l.at} y1={0} y2={size.h} strokeWidth={l.major ? 1.25 : 1} className={l.major ? "stroke-slate-300" : "stroke-slate-200"} />)}
                    {grid.h.map((l) => <line key={`h${l.at}`} y1={l.at} y2={l.at} x1={0} x2={size.w} strokeWidth={l.major ? 1.25 : 1} className={l.major ? "stroke-slate-300" : "stroke-slate-200"} />)}
                  </g>
                )}
                {layout && <ProfileDrawing layout={layout} origin={origin} sel={sel} painted={painted} />}
                {entry.first && (() => { const p = toScreen(entry.first); return <circle cx={p.x} cy={p.y} r={6} className="fill-primary" />; })()}
                {preview && (() => {
                  const a = toScreen(preview.from), b = toScreen(preview.to);
                  return (
                    <g>
                      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={2} strokeDasharray="6 4" className="stroke-primary" />
                      <circle cx={b.x} cy={b.y} r={5} className="fill-white stroke-primary" strokeWidth={2} />
                    </g>
                  );
                })()}
                {hover && !preview && (() => { const p = toScreen(hover.mm); return <g><line x1={p.x - 10} x2={p.x + 10} y1={p.y} y2={p.y} className="stroke-primary" /><line y1={p.y - 10} y2={p.y + 10} x1={p.x} x2={p.x} className="stroke-primary" /></g>; })()}
              </svg>
            )}
          </div>
          {preview && (
            <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-ink/85 px-3 py-1 text-sm font-semibold text-white" aria-hidden="true">
              {formatMm(preview.lengthMm)} mm{preview.includedDeg != null ? ` · ${formatAngle(preview.includedDeg)}°` : ""}
            </div>
          )}
          {menu && (
            <div className="absolute right-2 top-2 z-10 w-64 overflow-hidden rounded-lg border border-hairline bg-white shadow-lg" role="menu" aria-label="More">
              {menuItems.map(([label, fn, disabled]) => (
                <button key={label} type="button" role="menuitem" disabled={disabled} onClick={() => { fn(); if (label !== "Zoom in" && label !== "Zoom out") setMenu(false); }}
                  className="block min-h-[44px] w-full border-b border-hairline px-3 text-left text-sm text-ink last:border-0 hover:bg-page disabled:text-muted disabled:opacity-50">{label}</button>
              ))}
            </div>
          )}
        </div>

        <aside className="z-10 max-h-[55%] shrink-0 overflow-y-auto overscroll-contain border-t border-hairline bg-white px-3 pt-2 lg:max-h-none lg:w-[360px] lg:border-l lg:border-t-0 landscape:max-h-none landscape:w-[min(340px,45vw)] landscape:border-l landscape:border-t-0"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }} aria-label={sel ? "Edit selection" : "Flashing"}>
          {error && <p role="alert" className="mb-1 text-xs text-red-700">{error}</p>}
          {profile && <p className="mb-1 text-[11px] text-muted">{faceWord}: {profile.coatedFace} side · mm · indicative girth {formatMm(girth)} mm</p>}
          {sheet || (
            <>
              {hint && <p className="text-xs text-muted" aria-live="polite">{hint}</p>}
              {invalidCount > 0 && <p className="mt-1 text-xs text-amber-800">{invalidCount} size{invalidCount === 1 ? " isn’t" : "s aren’t"} valid yet — kept on this device until fixed.</p>}
              {(list || readOnly) && profile && <DimensionList profile={profile} onSelect={editable ? select : null} />}
              {editable && (job ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => goto(onDetails)} disabled={!profile || !onDetails} className="min-h-[48px] rounded-lg border border-primary text-sm font-semibold text-primary disabled:opacity-40">Details</button>
                  <button type="button" onClick={() => goto(onLengths)} disabled={!profile || !onLengths} className="min-h-[48px] rounded-lg bg-primary text-sm font-semibold text-white disabled:opacity-40">Lengths</button>
                </div>
              ) : (
                <button type="button" onClick={publish} disabled={!profile} className="mt-2 min-h-[48px] w-full rounded-lg bg-primary text-sm font-semibold text-white disabled:opacity-40">Save new revision of the standard</button>
              ))}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

// ── drawing ───────────────────────────────────────────────────────────────────
function ProfileDrawing({ layout, origin, sel, painted }) {
  const isLeg = (l) => sel?.kind === "leg" && sel.id === l.id;
  const isCorner = (c) => sel?.kind === "corner" && sel.index === c.index;
  const isEnd = (e) => sel?.kind === "end" && sel.which === e.which;
  const labels = [
    ...layout.legs.map((l) => ({ key: `l${l.index}`, label: l.label, selected: isLeg(l), tone: "ink" })),
    ...layout.corners.map((c) => ({ key: `c${c.index}`, label: c.label, selected: isCorner(c), tone: "muted" })),
    ...layout.ends.filter((e) => e.glyph).map((e) => ({ key: `e${e.which}`, label: { ...e.glyph.label, text: e.glyph.label.text.replace(/^Hem/, "Crush") }, selected: isEnd(e), tone: "muted" })),
  ];
  const band = painted ? "stroke-primary" : "stroke-slate-400";
  return (
    <g transform={`translate(${origin.x.toFixed(1)} ${origin.y.toFixed(1)})`}>
      {layout.legs.filter(isLeg).map((l) => <line key="sel" x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} strokeWidth={16} strokeLinecap="round" className="stroke-primary/20" />)}
      {layout.corners.filter(isCorner).map((c) => <circle key="selpt" cx={c.v.x} cy={c.v.y} r={12} strokeWidth={1.5} className="fill-primary/15 stroke-primary" />)}
      {layout.ends.filter(isEnd).map((e) => (e.glyph
        ? <path key="selend" d={e.glyph.path} fill="none" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" className="stroke-primary/20" />
        : <circle key="selend" cx={e.p.x} cy={e.p.y} r={14} strokeWidth={1.5} className="fill-primary/15 stroke-primary" />))}
      <polyline points={pts(layout.coated)} fill="none" strokeWidth={painted ? 3 : 1.5} strokeDasharray={painted ? undefined : "4 3"} strokeLinejoin="round" strokeLinecap="round" className={band} />
      <polyline points={pts(layout.pts)} fill="none" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" className="stroke-ink" />
      {layout.ends.map((e) => e.glyph && (
        <g key={`g${e.which}`}>
          {painted && <polyline points={pts(e.glyph.band)} fill="none" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="stroke-primary" />}
          <path d={e.glyph.path} fill="none" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" className="stroke-ink" />
        </g>
      ))}
      {layout.corners.map((c) => <circle key={`cv${c.index}`} cx={c.v.x} cy={c.v.y} r={3} strokeWidth={1.25} className="fill-white stroke-ink" />)}
      {/* big, visible end handles: tap → Plain / Crush fold / Open return */}
      {layout.ends.map((e) => (e.glyph
        ? <circle key={`ev${e.which}`} data-end-handle={e.which} cx={e.p.x} cy={e.p.y} r={4} className="fill-primary/40" />
        : <circle key={`ev${e.which}`} data-end-handle={e.which} cx={e.p.x} cy={e.p.y} r={7} strokeWidth={2} className="fill-white stroke-primary" />))}
      {labels.map(({ key, label }) => label.leader && (
        <g key={`ld${key}`}>
          <line x1={label.leader.from.x} y1={label.leader.from.y} x2={label.leader.to.x} y2={label.leader.to.y} strokeWidth={1} strokeDasharray="3 2" className="stroke-slate-400" />
          <circle cx={label.leader.from.x} cy={label.leader.from.y} r={1.75} className="fill-slate-400" />
        </g>
      ))}
      {labels.map(({ key, label, selected, tone }) => (
        <g key={key}>
          <rect x={label.box.x} y={label.box.y} width={label.box.w} height={label.box.h} rx={5} strokeWidth={1} className={selected ? "fill-primary stroke-primary" : "fill-white stroke-hairline"} />
          <text x={label.box.x + label.box.w / 2} y={label.box.y + label.box.h / 2} textAnchor="middle" dominantBaseline="central"
            className={`text-[12px] ${tone === "ink" ? "font-bold" : "font-semibold"} ${selected ? "fill-white" : tone === "ink" ? "fill-ink" : "fill-slate-600"}`}>{label.text}</text>
        </g>
      ))}
    </g>
  );
}

// ── pieces ────────────────────────────────────────────────────────────────────

/**
 * A number that applies while you type. Valid values call onValid (the editor coalesces them into one undo
 * step for the field); partial / invalid text stays as a draft with an inline note — never 0 or NaN.
 * When `value` changes from OUTSIDE (Undo / Redo), the text follows it.
 */
function LiveNumber({ label, unit, value, draft, onValid, onDraft, onBlur, validate, autoFocus = false }) {
  const id = useId();
  const fmt = (x) => (x == null ? "" : String(Math.round(x * 100) / 100));
  const [text, setText] = useState(draft ?? fmt(value));
  const emitted = useRef(value);
  const [err, setErr] = useState(draft != null ? "Not a valid size yet." : null);
  useEffect(() => {
    if (value !== emitted.current) { emitted.current = value; setText(fmt(value)); setErr(null); onDraft(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- follow outside changes only
  }, [value]);
  function change(raw) {
    setText(raw);
    const num = parseNumberInput(raw);
    const problem = !Number.isFinite(num) ? "Type a number." : num <= 0 ? "Must be more than 0." : validate?.(num);
    if (problem) { setErr(problem); onDraft(raw); return; }
    setErr(null); onDraft(null);
    emitted.current = num;
    onValid(num);
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <div className={`flex items-stretch rounded-lg border bg-white focus-within:ring-2 focus-within:ring-primary ${err ? "border-amber-400" : "border-hairline"}`}>
        <input id={id} autoFocus={autoFocus} inputMode="decimal" enterKeyHint="done" value={text} onChange={(e) => change(e.target.value)}
          onBlur={onBlur} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          onFocus={(e) => { const el = e.currentTarget; el.select(); setTimeout(() => el.scrollIntoView?.({ block: "center", behavior: "smooth" }), 350); }}
          aria-invalid={!!err} aria-describedby={err ? `${id}-e` : undefined}
          className="min-h-[48px] w-full min-w-0 rounded-l-lg border-0 px-3 text-lg font-semibold text-ink focus:ring-0" />
        <span className="flex items-center rounded-r-lg bg-page px-3 text-sm text-muted">{unit}</span>
      </div>
      {err && <p id={`${id}-e`} className="mt-1 text-xs text-amber-800">{err} The drawing keeps the last valid size.</p>}
    </div>
  );
}

function Sheet({ title, children, onDone, onPrev, onNext }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1">
        <h2 className="flex-1 text-sm font-semibold text-ink">{title}</h2>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onPrev || undefined} disabled={!onPrev} aria-label="Previous" className="min-h-[44px] min-w-[44px] rounded-lg text-lg text-ink disabled:opacity-30">‹</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onNext || undefined} disabled={!onNext} aria-label="Next" className="min-h-[44px] min-w-[44px] rounded-lg text-lg text-ink disabled:opacity-30">›</button>
        <button type="button" onClick={onDone} className="min-h-[44px] rounded-lg px-3 text-sm font-semibold text-primary">Done</button>
      </div>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children, label }) {
  return <button type="button" aria-pressed={on} aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick} className={`min-h-[44px] rounded-lg border text-sm font-medium ${on ? "border-primary bg-primary text-white" : "border-hairline text-ink"}`}>{children}</button>;
}

function EndChoice({ on, onClick, label, icon }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-lg border text-xs font-semibold ${on ? "border-primary bg-primary/10 text-primary" : "border-hairline text-ink"}`}>
      <svg width="44" height="22" viewBox="0 0 44 22" aria-hidden="true" className="stroke-current" fill="none" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
        {icon === "plain" && <path d="M4 16 H40" />}
        {icon === "crush" && <path d="M4 16 H36 A3 3 0 0 0 36 10 H22" />}
        {icon === "return" && <path d="M4 16 H36 V6" />}
      </svg>
      {label}
    </button>
  );
}

function FoldIcon({ side }) {
  return <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" className="mr-1 inline stroke-current" fill="none" strokeWidth="2"><path d={side === "left" ? "M2 10 H14 A2.5 2.5 0 0 0 14 5 H8" : "M2 2 H14 A2.5 2.5 0 0 1 14 7 H8"} /></svg>;
}

function DimensionList({ profile, onSelect }) {
  const items = [
    ...profile.segments.map((s, i) => ({ sel: { kind: "leg", id: s.id }, text: `L${i + 1} ${formatMm(s.lengthMm)} mm` })),
    ...profile.bends.map((b, i) => ({ sel: { kind: "corner", index: i }, text: `B${i + 1} ${formatAngle(includedAngle(b.turnDeg))}° ${bendDirection(b.turnDeg)}` })),
    { sel: { kind: "end", which: "start" }, text: `Start: ${treatmentText(profile.start).replace(/closed hem/i, "crush fold")}` },
    { sel: { kind: "end", which: "end" }, text: `End: ${treatmentText(profile.end).replace(/closed hem/i, "crush fold")}` },
  ];
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Dimensions">
      {items.map((it) => (
        <li key={it.text + selKey(it.sel)}>
          {onSelect ? <button type="button" onClick={() => onSelect(it.sel)} className="min-h-[44px] rounded-lg border border-hairline px-2 text-sm text-ink">{it.text}</button>
            : <span className="inline-flex min-h-[40px] items-center rounded-lg border border-hairline bg-page px-2 text-sm text-ink">{it.text}</span>}
        </li>
      ))}
    </ul>
  );
}

function IconBtn({ label, children, pressed, ...rest }) {
  return (
    <button type="button" aria-label={label} aria-pressed={pressed} onMouseDown={(e) => e.preventDefault()} {...rest}
      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-ink hover:bg-page disabled:opacity-30">{children}</button>
  );
}

function UndoIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>;
}

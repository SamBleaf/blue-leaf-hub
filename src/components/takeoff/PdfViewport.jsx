// =============================================================================
// PdfViewport — the ONE plan viewer used by takeoff (Hub + Worker, phone + desktop).
//
// * pdf.js (pinned pdfjs-dist, legacy build for older iOS Safari) is imported lazily when a
//   takeoff opens; its worker is bundled locally via Vite `?url` — no CDN.
// * Raster layer: two canvases the size of the VIEWPORT (× devicePixelRatio, capped), never the
//   page — a 12× zoom on A1 renders only what is on screen. Rendering goes to the back canvas
//   and swaps when complete; stale render tasks are cancelled.
// * During pan/pinch the last bitmap is CSS-transformed immediately; a sharp re-render happens
//   ~180 ms after the gesture settles (no rasterising on every frame).
// * Vector layer: an SVG overlay drawn by the parent in screen px via the `overlay(view)`
//   render prop. Geometry is stored in unrotated PDF user space; conversions use
//   shared/takeoff/geometry.js, which matches pdf.js's PageViewport exactly (tested).
// * Gestures: shared gestures.js — tap places (tap mode), drag pans, two fingers pinch.
//   touch-action:none applies to this element only; data-takeoff-viewport tells the AppShell
//   edge-swipe to ignore touches that start here. onDoubleTap is opt-in per mode: pass it only
//   while a double-tap means something (finishing a continuous run) — otherwise it is undefined
//   and every tap is a plain tap.
// * focus ({ key, points }): when given, the view frames those PDF points once per key (schedule "Show on plan")
//   instead of the whole page — and re-frames them after a resize until the user moves the plan themselves.
// =============================================================================
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { applyMatrix, invertMatrix, totalRotation, viewportTransform } from "../../../shared/takeoff/index.js";
import { clamp, createGestureTracker } from "./gestures.js";
import { MAX_BACKING_PIXELS, SETTLE_MS, ZOOM_MAX_FACTOR, ZOOM_MIN_FACTOR, pageMetaOf } from "./pdfDocument.js";

const LOUPE_PX = 132;
const LOUPE_ZOOM = 3;

const stats = { renders: 0, cancels: 0, lastRenderMs: 0, canvases: 0, maxBackingPixels: 0 };
if (typeof window !== "undefined") window.__takeoffViewerStats = stats;

const PdfViewport = forwardRef(function PdfViewport(
  { doc, pageIndex, displayRotation = 0, mode = "tap", onTap, onDoubleTap, overlay, onViewChange, onPageMeta, focus = null, className = "", ariaLabel = "Plan" },
  ref,
) {
  const wrapRef = useRef(null);
  const frontRef = useRef(null);
  const backRef = useRef(null);
  const pageRef = useRef(null);
  const metaRef = useRef(null);
  const viewRef = useRef({ scale: 1, panX: 0, panY: 0 });
  const renderedRef = useRef(null);  // view the front canvas was rendered at
  const renderTaskRef = useRef(null);
  const settleRef = useRef(null);
  const fitRef = useRef(1);
  const modeRef = useRef(mode);
  const onTapRef = useRef(onTap);
  const onPageMetaRef = useRef(onPageMeta);
  onPageMetaRef.current = onPageMeta;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(viewRef.current);
  // R04 F08: press-and-hold magnifier — the point under the finger shown 3× above it with a crosshair
  const [loupe, setLoupe] = useState(null);
  const loupeRef = useRef(null);
  const [pageMeta, setPageMeta] = useState(null);
  const [pageError, setPageError] = useState(null);
  const [rendering, setRendering] = useState(false);

  modeRef.current = mode;
  onTapRef.current = onTap;
  const onDoubleTapRef = useRef(onDoubleTap);
  onDoubleTapRef.current = onDoubleTap;
  const rotation = pageMeta ? totalRotation(pageMeta, displayRotation) : 0;
  const rotationRef = useRef(rotation);
  rotationRef.current = rotation;

  // ── transforms ──────────────────────────────────────────────────────────────
  const matrixFor = useCallback((v) => viewportTransform(metaRef.current, { scale: v.scale, rotation: rotationRef.current, offsetX: v.panX, offsetY: v.panY }).matrix, []);
  const toScreen = useCallback((p, v = viewRef.current) => applyMatrix(matrixFor(v), p), [matrixFor]);
  const toPdf = useCallback((p, v = viewRef.current) => applyMatrix(invertMatrix(matrixFor(v)), p), [matrixFor]);

  // ── raster ──────────────────────────────────────────────────────────────────
  const applyCssTransform = useCallback(() => {
    const r = renderedRef.current, v = viewRef.current, c = frontRef.current;
    if (!c) return;
    if (!r) { c.style.transform = "none"; return; }
    const k = v.scale / r.scale;
    c.style.transform = `translate(${v.panX - k * r.panX}px, ${v.panY - k * r.panY}px) scale(${k})`;
  }, []);

  const render = useCallback(async () => {
    const page = pageRef.current, back = backRef.current, wrap = wrapRef.current;
    if (!page || !back || !wrap || !size.w || !size.h) return;
    if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); stats.cancels++; } catch { /* already done */ } }
    const v = { ...viewRef.current };
    const dprWanted = window.devicePixelRatio || 1;
    const dpr = Math.min(dprWanted, Math.sqrt(MAX_BACKING_PIXELS / (size.w * size.h)));
    const bw = Math.floor(size.w * dpr), bh = Math.floor(size.h * dpr);
    back.width = bw; back.height = bh;
    stats.maxBackingPixels = Math.max(stats.maxBackingPixels, bw * bh);
    const ctx = back.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, bw, bh);
    const viewport = page.getViewport({ scale: v.scale, rotation: rotationRef.current, offsetX: v.panX, offsetY: v.panY });
    const t0 = performance.now();
    const task = page.render({ canvasContext: ctx, viewport, transform: [dpr, 0, 0, dpr, 0, 0], background: "#ffffff" });
    renderTaskRef.current = task;
    setRendering(true);
    try {
      await task.promise;
    } catch (e) {
      if (e?.name !== "RenderingCancelledException") setPageError("This page couldn't be drawn.");
      return;
    } finally {
      if (renderTaskRef.current === task) { renderTaskRef.current = null; setRendering(false); }
    }
    stats.renders++; stats.lastRenderMs = Math.round(performance.now() - t0);
    // swap buffers
    const front = frontRef.current;
    frontRef.current = back; backRef.current = front;
    back.style.visibility = "visible"; back.style.zIndex = "1";
    front.style.visibility = "hidden"; front.style.zIndex = "0";
    renderedRef.current = v;
    applyCssTransform();
  }, [size.w, size.h, applyCssTransform]);

  const scheduleRender = useCallback((delay = SETTLE_MS) => {
    clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => { render(); }, delay);
  }, [render]);

  const commitView = useCallback((v, { rerender = true } = {}) => {
    viewRef.current = v;
    setView(v);
    applyCssTransform();
    onViewChange?.(v);
    if (rerender) scheduleRender();
  }, [applyCssTransform, onViewChange, scheduleRender]);

  // ── fit / zoom ──────────────────────────────────────────────────────────────
  const fit = useCallback(() => {
    const meta = metaRef.current;
    if (!meta || !size.w || !size.h) return;
    const base = viewportTransform(meta, { scale: 1, rotation: rotationRef.current });
    const s = Math.min(size.w / base.width, size.h / base.height) * 0.96;
    fitRef.current = s;
    commitView({ scale: s, panX: (size.w - base.width * s) / 2, panY: (size.h - base.height * s) / 2 });
  }, [size.w, size.h, commitView]);

  /** Frame a set of PDF points (padded, never past ZOOM_MAX_FACTOR or beyond `maxFactor` × fit for a single point). */
  const fitTo = useCallback((points, { padPx = 56, maxFactor = 6 } = {}) => {
    const meta = metaRef.current;
    const pts = (points || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!meta || !size.w || !size.h || !pts.length) return false;
    const base = viewportTransform(meta, { scale: 1, rotation: rotationRef.current });
    const qs = pts.map((p) => applyMatrix(base.matrix, p)); // page px at scale 1 (screen = scale × q + pan)
    const xs = qs.map((q) => q.x), ys = qs.map((q) => q.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = Math.min(padPx, size.w / 4, size.h / 4);
    const want = Math.min((size.w - 2 * pad) / Math.max(x1 - x0, 1e-9), (size.h - 2 * pad) / Math.max(y1 - y0, 1e-9));
    const fitS = fitRef.current;
    const s = clamp(want, fitS * ZOOM_MIN_FACTOR, fitS * Math.min(maxFactor, ZOOM_MAX_FACTOR));
    commitView({ scale: s, panX: size.w / 2 - s * (x0 + x1) / 2, panY: size.h / 2 - s * (y0 + y1) / 2 });
    return true;
  }, [size.w, size.h, commitView]);

  const zoomAt = useCallback((factor, center) => {
    const v = viewRef.current;
    const s = clamp(v.scale * factor, fitRef.current * ZOOM_MIN_FACTOR, fitRef.current * ZOOM_MAX_FACTOR);
    const k = s / v.scale;
    commitView({ scale: s, panX: center.x - (center.x - v.panX) * k, panY: center.y - (center.y - v.panY) * k });
  }, [commitView]);

  // ── page load ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let stop = false;
    setPageError(null);
    if (!doc) return undefined;
    (async () => {
      try {
        const page = await doc.getPage(pageIndex + 1);
        if (stop) { page.cleanup(); return; }
        if (pageRef.current && pageRef.current !== page) pageRef.current.cleanup();
        pageRef.current = page;
        metaRef.current = pageMetaOf(page);
        setPageMeta(metaRef.current);
        onPageMetaRef.current?.(metaRef.current);
        renderedRef.current = null;
      } catch {
        if (!stop) setPageError("This page couldn't be opened.");
      }
    })();
    return () => { stop = true; };
  }, [doc, pageIndex]);

  // Fit once per page/rotation. A later resize (rotation of the phone, the keyboard opening)
  // keeps the user's zoom and only re-renders the bitmap for the new size.
  // A focus (points to frame) applies once per focus key after that fit, and again after a resize for as long as the
  // user hasn't moved the plan (the sheet settling must not leave the framed measurements half hidden).
  const fittedKey = useRef(null);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const focusDone = useRef(null);   // { key, w, h } last applied
  const userMoved = useRef(false);  // any pan / pinch / wheel / key / zoom by the user since the last automatic framing
  const focusKey = focus?.points?.length ? `${focus.key}` : null;
  useLayoutEffect(() => {
    if (!pageMeta || !size.w || !size.h) return;
    const key = `${pageIndex}|${rotation}|${pageMeta.viewBox.join(",")}`;
    let framed = false;
    if (fittedKey.current !== key) { fittedKey.current = key; fit(); framed = true; focusDone.current = null; }
    const fd = focusDone.current;
    if (focusKey && (fd?.key !== focusKey || (!userMoved.current && (fd.w !== size.w || fd.h !== size.h)))) {
      if (fitTo(focusRef.current.points)) {
        focusDone.current = { key: focusKey, w: size.w, h: size.h };
        userMoved.current = false;
        framed = true;
      }
    }
    if (!framed) scheduleRender(0);
  }, [pageMeta, pageIndex, rotation, size.w, size.h, fit, fitTo, scheduleRender, focusKey]);

  // container size
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // gestures + wheel + keyboard. ONE tracker for the viewer's lifetime: it reads the current transforms through a
  // ref, so a resize (the sheet growing, the keyboard, rotation) never re-creates it mid-gesture — that would drop a
  // half-finished double-tap or pinch (TC-R04 13).
  const fnRef = useRef(null);
  fnRef.current = { toPdf, commitView, scheduleRender, zoomAt };
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const fn = () => fnRef.current;
    const tracker = createGestureTracker({
      mode: () => modeRef.current,
      onTap: (pt) => { if (metaRef.current) onTapRef.current?.(fn().toPdf(pt), pt); },
      onPan: (dx, dy) => { userMoved.current = true; const v = viewRef.current; fn().commitView({ ...v, panX: v.panX + dx, panY: v.panY + dy }, { rerender: false }); },
      onPinch: (f, c, dx, dy) => {
        userMoved.current = true;
        const v = viewRef.current;
        const s = clamp(v.scale * f, fitRef.current * ZOOM_MIN_FACTOR, fitRef.current * ZOOM_MAX_FACTOR);
        const k = s / v.scale;
        fn().commitView({ scale: s, panX: c.x - (c.x - v.panX) * k + dx, panY: c.y - (c.y - v.panY) * k + dy }, { rerender: false });
      },
      onGestureEnd: () => fn().scheduleRender(),
      shouldIgnore: (ev) => !!ev.target?.closest?.("[data-takeoff-handle]"),
      onPrecise: (phase, pt) => setLoupe(phase === "start" || phase === "move" ? pt : null),
      // TC-R04 13: double-tap is recognised ONLY while the parent passes onDoubleTap for the current mode (e.g. while
      // drawing a continuous flashing run). The tracker reads this getter at every tap, so without the prop two quick
      // taps stay two taps (Count never loses a mark) and no synthetic-mouse filtering applies.
      get onDoubleTap() {
        if (!onDoubleTapRef.current || modeRef.current === "pan") return undefined;
        return (pt) => { if (metaRef.current) onDoubleTapRef.current?.(fn().toPdf(pt), pt); };
      },
    });
    const detach = tracker.attach(el);
    const wheel = (e) => {
      e.preventDefault();
      userMoved.current = true;
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) fn().zoomAt(Math.exp(-e.deltaY * 0.01), { x: e.clientX - r.left, y: e.clientY - r.top });
      else { const v = viewRef.current; fn().commitView({ ...v, panX: v.panX - e.deltaX, panY: v.panY - e.deltaY }); }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => { detach(); el.removeEventListener("wheel", wheel); };
  }, []);

  // cleanup render resources on unmount
  useEffect(() => () => {
    clearTimeout(settleRef.current);
    try { renderTaskRef.current?.cancel(); } catch { /* ignore */ }
    pageRef.current?.cleanup();
    for (const c of [frontRef.current, backRef.current]) if (c) { c.width = 0; c.height = 0; }
    stats.canvases = 0;
  }, []);
  useEffect(() => { stats.canvases = 2; }, []);

  // Expose read-only transform helpers on the element for automated geometry tests (no data).
  useEffect(() => {
    const el = wrapRef.current;
    if (el) el.takeoffViewport = {
      toScreen: (p) => toScreen(p), toPdf: (p) => toPdf(p), view: () => ({ ...viewRef.current }), rotation: () => rotationRef.current,
      /** Zoom by `factor` on PDF point `p` (as a pinch there would), then centre it. */
      zoomOn: (p, factor) => {
        userMoved.current = true;
        zoomAt(factor, toScreen(p));
        const sc = toScreen(p), v = viewRef.current;
        commitView({ ...v, panX: v.panX + size.w / 2 - sc.x, panY: v.panY + size.h / 2 - sc.y });
      },
    };
  }, [toScreen, toPdf, zoomAt, commitView, size.w, size.h]);

  useImperativeHandle(ref, () => ({
    fit: () => { userMoved.current = true; fit(); }, zoomBy: (f) => { userMoved.current = true; zoomAt(f, { x: size.w / 2, y: size.h / 2 }); },
    /** Frame these PDF points (e.g. "Show them again" after panning away). */
    fitTo: (points, opts) => { const ok = fitTo(points, opts); if (ok) userMoved.current = true; return ok; },
    getView: () => viewRef.current, toScreen, toPdf, pageMeta: () => metaRef.current, rotation: () => rotationRef.current,
    centerOn: (p) => { userMoved.current = true; const s = toScreen(p); const v = viewRef.current; commitView({ ...v, panX: v.panX + size.w / 2 - s.x, panY: v.panY + size.h / 2 - s.y }); },
    /** Draw a magnified sample of the CURRENT bitmap around a screen point (loupe). */
    drawLoupe(ctx, screenPt, outSize, zoom = 2.5) {
      const c = frontRef.current, r = renderedRef.current, v = viewRef.current;
      if (!c || !r) return;
      const k = v.scale / r.scale;
      const bx = (screenPt.x - (v.panX - k * r.panX)) / k, by = (screenPt.y - (v.panY - k * r.panY)) / k; // css px in rendered bitmap
      const dpr = c.width / (size.w || 1);
      const half = outSize / (2 * zoom * k);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, outSize, outSize);
      ctx.drawImage(c, (bx - half) * dpr, (by - half) * dpr, 2 * half * dpr, 2 * half * dpr, 0, 0, outSize, outSize);
    },
  }), [fit, fitTo, zoomAt, size.w, size.h, toScreen, toPdf, commitView]);

  const onKey = (e) => {
    const v = viewRef.current;
    if (["+", "=", "-", "0"].includes(e.key) || (e.key.startsWith("Arrow") && !e.altKey)) userMoved.current = true;
    if (e.key === "+" || e.key === "=") { zoomAt(1.25, { x: size.w / 2, y: size.h / 2 }); e.preventDefault(); }
    else if (e.key === "-") { zoomAt(0.8, { x: size.w / 2, y: size.h / 2 }); e.preventDefault(); }
    else if (e.key === "0") { fit(); e.preventDefault(); }
    else if (e.key.startsWith("Arrow") && !e.altKey) {
      const d = e.shiftKey ? 120 : 40;
      const dx = e.key === "ArrowLeft" ? d : e.key === "ArrowRight" ? -d : 0;
      const dy = e.key === "ArrowUp" ? d : e.key === "ArrowDown" ? -d : 0;
      if (dx || dy) { commitView({ ...v, panX: v.panX + dx, panY: v.panY + dy }); e.preventDefault(); }
    }
  };

  useLayoutEffect(() => {
    const lc = loupeRef.current, c = frontRef.current, wrap = wrapRef.current;
    if (!loupe || !lc || !c || !wrap || !c.width) return;
    const cr = c.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    if (!cr.width) return;
    const dpr = window.devicePixelRatio || 1;
    lc.width = LOUPE_PX * dpr; lc.height = LOUPE_PX * dpr;
    const ctx = lc.getContext("2d");
    const kx = c.width / cr.width, ky = c.height / cr.height;
    const px = (wr.left + loupe.x - cr.left) * kx, py = (wr.top + loupe.y - cr.top) * ky;
    const sw = (LOUPE_PX / LOUPE_ZOOM) * kx, sh = (LOUPE_PX / LOUPE_ZOOM) * ky;
    ctx.fillStyle = "#e2e8f0"; ctx.fillRect(0, 0, lc.width, lc.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, px - sw / 2, py - sh / 2, sw, sh, 0, 0, lc.width, lc.height);
    const m = lc.width / 2;
    ctx.strokeStyle = "#006c9b"; ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.moveTo(m, 6 * dpr); ctx.lineTo(m, m - 6 * dpr); ctx.moveTo(m, m + 6 * dpr); ctx.lineTo(m, lc.height - 6 * dpr);
    ctx.moveTo(6 * dpr, m); ctx.lineTo(m - 6 * dpr, m); ctx.moveTo(m + 6 * dpr, m); ctx.lineTo(lc.width - 6 * dpr, m); ctx.stroke();
    if (typeof window !== "undefined") window.__takeoffViewerStats = { ...(window.__takeoffViewerStats || {}), loupeShown: (window.__takeoffViewerStats?.loupeShown || 0) + 1 };
  }, [loupe]);
  const loupePos = loupe ? { left: clamp(loupe.x - LOUPE_PX / 2, 4, Math.max(4, size.w - LOUPE_PX - 4)), top: loupe.y - LOUPE_PX - 56 < 4 ? loupe.y + 56 : loupe.y - LOUPE_PX - 56 } : null;

  return (
    <div
      ref={wrapRef}
      data-takeoff-viewport=""
      tabIndex={0}
      role="application"
      aria-label={ariaLabel}
      onKeyDown={onKey}
      className={`relative overflow-hidden bg-slate-200 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
      style={{ touchAction: "none", cursor: mode === "pan" ? "grab" : "crosshair" }}
    >
      <canvas ref={frontRef} className="absolute left-0 top-0 origin-top-left" style={{ width: size.w, height: size.h, zIndex: 1 }} />
      <canvas ref={backRef} className="absolute left-0 top-0 origin-top-left" style={{ width: size.w, height: size.h, visibility: "hidden", zIndex: 0 }} />
      {pageMeta && size.w > 0 && (
        <svg className="absolute inset-0 z-[2] pointer-events-none" width={size.w} height={size.h} aria-hidden="true">
          {overlay?.({ view, toScreen: (p) => toScreen(p, view), toPdf: (p) => toPdf(p, view), size, rotation })}
        </svg>
      )}
      {loupe && (
        <canvas ref={loupeRef} data-takeoff-loupe="" aria-hidden="true" className="pointer-events-none absolute z-[4] rounded-full border-2 border-primary shadow-lg"
          style={{ width: LOUPE_PX, height: LOUPE_PX, left: loupePos.left, top: loupePos.top }} />
      )}
      {(rendering && !renderedRef.current) && <div className="absolute inset-0 z-[3] flex items-center justify-center text-sm text-muted">Drawing page…</div>}
      {pageError && <div role="alert" className="absolute inset-x-4 top-4 z-[3] rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{pageError}</div>}
    </div>
  );
});

export default PdfViewport;

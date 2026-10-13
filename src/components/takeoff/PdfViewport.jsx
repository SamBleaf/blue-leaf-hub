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
//   edge-swipe to ignore touches that start here.
// =============================================================================
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { applyMatrix, invertMatrix, totalRotation, viewportTransform } from "../../../shared/takeoff/index.js";
import { clamp, createGestureTracker } from "./gestures.js";
import { MAX_BACKING_PIXELS, SETTLE_MS, ZOOM_MAX_FACTOR, ZOOM_MIN_FACTOR, pageMetaOf } from "./pdfDocument.js";

const stats = { renders: 0, cancels: 0, lastRenderMs: 0, canvases: 0, maxBackingPixels: 0 };
if (typeof window !== "undefined") window.__takeoffViewerStats = stats;

const PdfViewport = forwardRef(function PdfViewport(
  { doc, pageIndex, displayRotation = 0, mode = "tap", onTap, overlay, onViewChange, onPageMeta, className = "", ariaLabel = "Plan" },
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
  const [pageMeta, setPageMeta] = useState(null);
  const [pageError, setPageError] = useState(null);
  const [rendering, setRendering] = useState(false);

  modeRef.current = mode;
  onTapRef.current = onTap;
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
  const fittedKey = useRef(null);
  useLayoutEffect(() => {
    if (!pageMeta || !size.w || !size.h) return;
    const key = `${pageIndex}|${rotation}|${pageMeta.viewBox.join(",")}`;
    if (fittedKey.current !== key) { fittedKey.current = key; fit(); }
    else scheduleRender(0);
  }, [pageMeta, pageIndex, rotation, size.w, size.h, fit, scheduleRender]);

  // container size
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // gestures + wheel + keyboard
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const tracker = createGestureTracker({
      mode: () => modeRef.current,
      onTap: (pt) => { if (metaRef.current) onTapRef.current?.(toPdf(pt), pt); },
      onPan: (dx, dy) => { const v = viewRef.current; commitView({ ...v, panX: v.panX + dx, panY: v.panY + dy }, { rerender: false }); },
      onPinch: (f, c, dx, dy) => {
        const v = viewRef.current;
        const s = clamp(v.scale * f, fitRef.current * ZOOM_MIN_FACTOR, fitRef.current * ZOOM_MAX_FACTOR);
        const k = s / v.scale;
        commitView({ scale: s, panX: c.x - (c.x - v.panX) * k + dx, panY: c.y - (c.y - v.panY) * k + dy }, { rerender: false });
      },
      onGestureEnd: () => scheduleRender(),
      shouldIgnore: (ev) => !!ev.target?.closest?.("[data-takeoff-handle]"),
    });
    const detach = tracker.attach(el);
    const wheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), { x: e.clientX - r.left, y: e.clientY - r.top });
      else { const v = viewRef.current; commitView({ ...v, panX: v.panX - e.deltaX, panY: v.panY - e.deltaY }); }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => { detach(); el.removeEventListener("wheel", wheel); };
  }, [toPdf, commitView, scheduleRender, zoomAt]);

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
    if (el) el.takeoffViewport = { toScreen: (p) => toScreen(p), toPdf: (p) => toPdf(p), view: () => ({ ...viewRef.current }), rotation: () => rotationRef.current };
  }, [toScreen, toPdf]);

  useImperativeHandle(ref, () => ({
    fit, zoomBy: (f) => zoomAt(f, { x: size.w / 2, y: size.h / 2 }),
    getView: () => viewRef.current, toScreen, toPdf, pageMeta: () => metaRef.current, rotation: () => rotationRef.current,
    centerOn: (p) => { const s = toScreen(p); const v = viewRef.current; commitView({ ...v, panX: v.panX + size.w / 2 - s.x, panY: v.panY + size.h / 2 - s.y }); },
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
  }), [fit, zoomAt, size.w, size.h, toScreen, toPdf, commitView]);

  const onKey = (e) => {
    const v = viewRef.current;
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
      {(rendering && !renderedRef.current) && <div className="absolute inset-0 z-[3] flex items-center justify-center text-sm text-muted">Drawing page…</div>}
      {pageError && <div role="alert" className="absolute inset-x-4 top-4 z-[3] rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{pageError}</div>}
    </div>
  );
});

export default PdfViewport;

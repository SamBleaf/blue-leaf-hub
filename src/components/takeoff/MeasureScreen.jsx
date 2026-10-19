// =============================================================================
// MeasureScreen — full-screen plan with the measuring tools for the chosen material (R03 §3, §5; TC-R04 02, 13).
//   Run (flashing)  ONE continuous run (13): tap the start and each corner; live tight length + order length per
//                   piece; double-tap (or the compact Finish) finishes without a duplicate endpoint. Corners are
//                   site cuts/folds — one allowance per ordered piece. Over the hard maximum the overflow is drawn
//                   RED with the legal split marker; tapping the red part performs ONE "Split at limit" at that
//                   marker (never at the tap point), undoable. The amber handling length is advisory only. A tap that
//                   trails a double-tap finish (tap the end, then double-tap it) is swallowed — never a phantom start.
//                   While drawing, the run is kept on this device (and, from two points, as a measurement with NO
//                   material assignment) so it survives a reload without creating an order line; finishing assigns
//                   it (primary). Leaving the screen finishes a valid run.
//   Run (timber/aluminium)  the same multi-point drawing, but a plan corner is a JOINT: finishing makes one straight
//                   polyline (primary) per leg (near-collinear taps merge) — never one member bent round a corner.
//   Member / Distribution (repeated timber, 03 T1)  the member line across the slope and the run the members are
//                   spaced along; ticks at every member station with the count; the sheet reads count → stock
//                   lengths → what each needs (engine allocation); tap a tick (Select) to remove, duplicate or
//                   override its length; the run panel shows the last gap and flags one thinner than the member.
//   Wall           tap along the wall run on the floor plan → one wall measurement (role "wall") per straight leg,
//                  named "Wall N", N+1 … → the first one's elevation (a corner is never unfolded into one flat wall).
//   Count          enter the FINISHED length first, then tap each occurrence (unchanged; no double-tap here).
//   Select         tap anything to adjust it (drag handles + magnifier). A finished run: drag/insert/remove
//                  points, move splits along the run / to a corner / by station; splits a geometry edit made
//                  invalid are flagged with Recalculate — never moved silently.
//   Pan            every drag navigates; nothing is placed.
// highlightIds (schedule "Show on plan"): those measurements open selected + highlighted and the plan frames them;
// any that live on another page / plan (or have no plan position) are named in the sheet instead.
// The plan keeps its zoom per plan page (PdfViewport viewKey): another material, a wall elevation and back re-open
// at the same spot — only the first open (or Fit) fits the page. Two fingers always navigate. Points must stay inside the scaled region. Measuring is blocked on a replaced plan
// (existing measurements stay visible for review). Every valid edit applies at once; Undo/Redo cover all of them.
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pointsWithinCalibration, latestPageCalibrations as pageCalibrations, CALIBRATION_STATUS, PROBLEM_TEXT } from "../../../shared/takeoff/index.js";
import { addSplit, appendVertex, computeFlashingPath, finishPath, moveSplit, moveSplitToCorner, resolvePathTap, splitAtLimit } from "../../../shared/takeoff/engine/flashingPath.js";
import { repeatedPositions } from "../../../shared/takeoff/engine/timber.js";
import { newId } from "../../lib/takeoffApi.js";
import PdfViewport from "./PdfViewport.jsx";
import { DOUBLE_TAP_MS, DOUBLE_TAP_SLOP_PX } from "./gestures.js";
import { PointHandlesLayer } from "./PointHandles.jsx";
import { partial } from "./changeset.js";
import { Banner, Btn, FocusedWindow, NumberField, SaveChip, Sheet } from "./ui.jsx";
import { fmtMm, fmtRaw } from "./format.js";
import { COLORS, LINE_TOOLS, PATH_TOOLS, distributionInputs, draftKey, familyOf, isFlashingMaterial, loadDraft, materialRecord, memberNoun, memberThicknessMm, nextWallInputs, saveDraft, stockForStation, toolsFor, withOverride } from "./measure/tools.js";
import { HIT_PX, anchorsFor, distToPolyline, legMidpoints, pathLengthMm, safePointAt, screenDirectionAt, splitsInsideRun, stationNear, straightLegs } from "./measure/geometry.js";
import { FlashingPathShape, PolylineShape, TimberLineShape } from "./measure/Overlays.jsx";
import { PathExplain, PathResult, SplitList, StatusRow } from "./measure/PathPanel.jsx";
import { DistributionPanel, MemberPanel, TickPanel, TimberResult } from "./measure/TimberPanel.jsx";
import { keepFieldInView, useKeyboardInset } from "./measure/useKeyboardInset.js";


const UNASSIGNED = "__unassigned";   // show / hide list: lines with no material
const HIDE_ALL = "__all";            // the earlier single "Hide lines" switch, still honoured when stored
const SHEET_TITLE = { run: "Measure runs", count: "Count pieces", wall: "Trace walls", member: "Member line", distribution: "Distribution run", pan: "Move around" };
const PATH_EXPLAINED = new Set(["ceiling_exceeded", "ceiling_unknown", "split_invalid", "path_in_progress"]);
const flashRulesOf = (m) => (isFlashingMaterial(m) ? m.rules : {});
/** Where highlighted measurements that aren't on this page are ("Ground floor page 2", "entered lengths" …). */
function describeElsewhere(ms, documents) {
  const where = (m) => {
    if (m.documentId && m.points?.length) return `${(documents || []).find((d) => d.id === m.documentId)?.title || "another plan"} page ${(m.pageIndex ?? 0) + 1}`;
    return m.kind === "manual" ? "entered lengths" : m.kind === "opening" ? "an opening on a wall" : m.kind === "wall" ? "a wall entered by size" : "no plan position";
  };
  return [...new Set(ms.map(where))].join(", ");
}
const sameList = (a, b) => (a || []).length === (b || []).length && (a || []).every((x, i) => Math.abs(x - b[i]) < 1e-6);
/** One tap burst: a double-tap window plus the trailing tap's own press (gestures.js DOUBLE_TAP_MS = 300). */
const BURST_MS = DOUBLE_TAP_MS + 150;

export default function MeasureScreen({ ws, doc, document: planDoc, pageIndex, displayRotation, materialId, onChangeMaterial, onScale, onClose, onOpenWall, highlightIds = null }) {
  const vpRef = useRef(null);
  const view = ws.view;
  const material = view.materials.find((m) => m.id === materialId) || null;
  const flashing = isFlashingMaterial(material);
  const tools = useMemo(() => toolsFor(material), [material]);
  const wsId = view.workspace?.id || null;
  const canEdit = !!ws.capabilities?.edit;

  // ── unfinished drawing (kept on this device; restored after a reload) ───────────────────────────────────────
  const dKey = draftKey({ workspaceId: wsId, materialId: material?.id, documentId: planDoc?.id, pageIndex });
  const restore = (key) => {
    const d = loadDraft(key);
    if (!d) return null;
    if (!d.measurementId) return d;
    if (view.contributions.some((c) => c.measurementId === d.measurementId && !c.archived)) return null; // finished meanwhile
    const m = view.measurements.find((x) => x.id === d.measurementId && !x.archived);
    return m ? { ...d, points: m.points, splitsMm: m.inputs?.splitsMm || d.splitsMm } : { ...d, measurementId: null };
  };
  const [draftState, setDraftState] = useState(() => ({ key: dKey, draft: restore(dKey) }));
  if (draftState.key !== dKey) setDraftState({ key: dKey, draft: restore(dKey) });
  const draft = draftState.key === dKey ? draftState.draft : null;
  // handlers read the drawing through this ref: a fast double-tap must see the point its first tap just added
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [draftStored, setDraftStored] = useState(true);
  useEffect(() => { if (dKey) setDraftStored(saveDraft(dKey, draftRef.current)); }, [dKey]);

  // schedule "Show on plan": the measurements to highlight (cleared by the next tap on the plan / tool change)
  const hlKey = (highlightIds || []).join(",");
  const onThisPage = (id) => view.measurements.some((m) => m.id === id && !m.archived && m.documentId === planDoc?.id && m.pageIndex === pageIndex && m.points?.length);
  const [hl, setHl] = useState(() => ({ key: hlKey, ids: hlKey ? highlightIds : [] }));
  const [modeSel, setModeSel] = useState(() => (hlKey ? "select" : draftState.draft?.tool || null));
  const mode = tools.some((t) => t.k === modeSel) ? modeSel : tools[0].k;
  const [countLen, setCountLen] = useState(null);
  const [activeCount, setActiveCount] = useState(null); // measurement id
  const [selected, setSelected] = useState(() => (highlightIds || []).find(onThisPage) || null);
  // HUB 011 (+ 20 Oct follow-up): show / hide the saved takeoff items on this plan page ONE BY ONE — display only,
  // nothing is deleted. `hidden` holds material ids (UNASSIGNED = lines with no material), remembered per page.
  const overlayKey = wsId && planDoc ? `takeoff-overlays:${wsId}|${planDoc.id}|${pageIndex}` : null;
  const [hidden, setHiddenState] = useState(() => {
    try {
      const raw = overlayKey ? localStorage.getItem(overlayKey) : null;
      if (raw === "off") return new Set([HIDE_ALL]);   // the earlier single switch: "off" = everything hidden
      const v = raw && raw !== "on" ? JSON.parse(raw) : null;
      return new Set(Array.isArray(v?.hidden) ? v.hidden.filter((x) => typeof x === "string") : []);
    } catch { return new Set(); }
  });
  const setHidden = (fn) => setHiddenState((cur) => {
    const next = typeof fn === "function" ? fn(cur) : fn;
    try { if (overlayKey) localStorage.setItem(overlayKey, JSON.stringify({ hidden: [...next] })); } catch { /* storage blocked: session only */ }
    return next;
  });
  const [layersOpen, setLayersOpen] = useState(false);
  const [deletedNotice, setDeletedNotice] = useState(null); // "Run deleted — Undo" right after a delete
  if (hl.key !== hlKey) { // a new "Show on plan" while this screen is open
    setHl({ key: hlKey, ids: hlKey ? highlightIds : [] });
    if (hlKey) { setModeSel("select"); setSelected(highlightIds.find(onThisPage) || null); }
  }
  const [handleSel, setHandleSel] = useState(null);
  const [selTick, setSelTick] = useState(null);        // station id of a member tick
  const [activeSplit, setActiveSplit] = useState(null);
  const [dragPreview, setDragPreview] = useState(null); // { measurementId, index, p } | { split, which, stationMm }
  const [msg, setMsg] = useState(null);                // { tone, text }
  const [lastDone, setLastDone] = useState(null);      // { id } of the run just finished
  const [hist, setHist] = useState({ past: [], future: [] });
  const kbInset = useKeyboardInset();
  const warn = (text) => setMsg({ tone: "warn", text });

  const stale = planDoc && planDoc.status !== "current";
  const cals = useMemo(() => pageCalibrations(view.calibrations, planDoc?.id, pageIndex), [view.calibrations, planDoc?.id, pageIndex]);
  const [regionKey, setRegionKey] = useState(null);
  const cal = cals.find((c) => (c.regionLabel || "") === (regionKey ?? (cals.length === 1 ? cals[0].regionLabel || "" : ""))) || (cals.length === 1 ? cals[0] : null);
  const needsRegionChoice = cals.length > 1 && regionKey == null;
  const canMeasure = !stale && !!material && canEdit;

  const pageMeasurements = useMemo(() => view.measurements.filter((m) => m.documentId === planDoc?.id && m.pageIndex === pageIndex && !m.archived), [view.measurements, planDoc?.id, pageIndex]);
  const contribsOf = useMemo(() => {
    const map = new Map();
    for (const c of view.contributions) if (!c.archived) map.set(c.measurementId, [...(map.get(c.measurementId) || []), c]);
    return map;
  }, [view.contributions]);
  const materialsById = useMemo(() => new Map(view.materials.map((m) => [m.id, m])), [view.materials]);
  const calsById = useMemo(() => new Map(view.calibrations.map((c) => [c.id, c])), [view.calibrations]);
  const computedBy = useMemo(() => new Map((ws.computed?.contributions || []).map((c) => [c.measurementId, c])), [ws.computed]);
  const matOf = useCallback((m) => materialsById.get(contribsOf.get(m.id)?.[0]?.jobMaterialId) || null, [materialsById, contribsOf]);
  const pointsOf = useCallback((m) => (dragPreview?.measurementId === m.id ? m.points.map((q, i) => (i === dragPreview.index ? dragPreview.p : q)) : m.points), [dragPreview]);

  // ── continuous flashing paths on this page (engine, same inputs as the schedule) ────────────────────────────
  const flashRules = useMemo(() => (flashing ? material.rules : {}), [flashing, material?.rules]);
  const flashPaths = useMemo(() => {
    const out = new Map();
    for (const m of pageMeasurements) {
      if (m.kind !== "polyline") continue;
      const cs = contribsOf.get(m.id) || [];
      const mat = cs.length ? materialsById.get(cs[0].jobMaterialId) : null;
      if (cs.length && !isFlashingMaterial(mat)) continue;
      const c = calsById.get(m.calibrationId);
      if (!c) continue;
      let splitsMm = m.inputs?.splitsMm || [];
      if (dragPreview?.split != null && dragPreview.which === "sel" && m.id === selected) splitsMm = splitsMm.map((s, i) => (i === dragPreview.split ? dragPreview.stationMm : s));
      const pts = dragPreview?.measurementId === m.id ? m.points.map((q, i) => (i === dragPreview.index ? dragPreview.p : q)) : m.points;
      try {
        out.set(m.id, computeFlashingPath({ points: pts, calibration: c, splitsMm, splitAnchors: m.inputs?.splitAnchors || undefined,
          rules: mat ? flashRulesOf(mat) : flashRules, runId: m.id, materialId: mat?.id || null, complete: cs.length > 0 }));
      } catch { /* malformed geometry: drawn plain */ }
    }
    return out;
  }, [pageMeasurements, contribsOf, materialsById, calsById, dragPreview, selected, flashRules]);

  const draftIsFlash = flashing && draft?.tool === "run";
  const draftPath = useMemo(() => {
    if (!draftIsFlash || !cal || !draft || draft.points.length < 2) return null;
    let splitsMm = draft.splitsMm || [];
    if (dragPreview?.split != null && dragPreview.which === "draft") splitsMm = splitsMm.map((s, i) => (i === dragPreview.split ? dragPreview.stationMm : s));
    try {
      return computeFlashingPath({ points: draft.points, calibration: cal, splitsMm, rules: flashRules, runId: draft.measurementId, materialId: material?.id || null, complete: false });
    } catch { return null; }
  }, [draftIsFlash, cal, draft, dragPreview, flashRules, material?.id]);

  // ── repeated timber: member ticks per distribution run (engine stations; a spacing-only preview until the
  //    member length is known — never an order quantity) ───────────────────────────────────────────────────────
  const ticksBy = useMemo(() => {
    const out = new Map();
    for (const m of pageMeasurements) {
      if (m.kind !== "distribution") continue;
      const mat = matOf(m);
      const c = calsById.get(m.calibrationId);
      const res = mat ? ws.computed?.materialResults?.[mat.id] : null;
      let ticks = (res?.layouts || []).flatMap((l) => (l?.kind === "repeated" ? l.ticks || [] : [])).filter((t) => t.segmentId === m.id).map((t) => ({ ...t, preview: false }));
      if (!ticks.length && c && mat) {
        try {
          const inp = m.inputs || {}, r = mat.rules || {};
          ticks = repeatedPositions({ runMm: pathLengthMm(m.points, c), centresMm: r.centresMm ?? 600, startOffsetMm: inp.startOffsetMm ?? r.startOffsetMm ?? 0, endOffsetMm: inp.endOffsetMm ?? r.endOffsetMm ?? 0,
            includeStart: inp.includeStart ?? (r.includeStart !== false), includeEnd: inp.includeEnd ?? (r.includeEnd !== false), spacing: r.spacing === "equal" ? "equal" : "fixed" })
            .map((x) => ({ stationId: `${m.id}:@${Math.round(x * 1e6) / 1e6}`, positionMm: x, preview: true }));
        } catch { ticks = []; }
      }
      out.set(m.id, { mat, cal: c, ticks, stale: (res?.problems || []).filter((p) => p.code === "override_stale").length });
    }
    return out;
  }, [pageMeasurements, matOf, calsById, ws.computed]);

  // ── undo / redo: each op = workspace change-sets and/or the drawing draft before → after ─────────────────────
  const histRef = useRef({ past: [], future: [] });
  const sync = () => setHist({ ...histRef.current });
  const applyDraft = (d) => {
    draftRef.current = d;
    setDraftState((s) => ({ ...s, draft: d }));
    setDraftStored(saveDraft(dKey, d)); // at once: leaving the screen right after must not keep a stale drawing
    if (d?.tool && tools.some((t) => t.k === d.tool)) setModeSel(d.tool);
  };
  function record(op) {
    if (op.redo) ws.edit(op.redo);
    if (op.draftAfter !== undefined) applyDraft(op.draftAfter);
    histRef.current = { past: [...histRef.current.past, op].slice(-100), future: [] };
    sync();
  }
  function undo() {
    const h = histRef.current;
    if (!h.past.length) return;
    const op = h.past[h.past.length - 1];
    if (op.undo) ws.edit(op.undo);
    if (op.draftBefore !== undefined) applyDraft(op.draftBefore);
    histRef.current = { past: h.past.slice(0, -1), future: [op, ...h.future] };
    setDragPreview(null); setMsg(null);
    sync();
  }
  function redo() {
    const h = histRef.current;
    if (!h.future.length) return;
    const [op, ...rest] = h.future;
    if (op.redo) ws.edit(op.redo);
    if (op.draftAfter !== undefined) applyDraft(op.draftAfter);
    histRef.current = { past: [...h.past, op], future: rest };
    setDragPreview(null); setMsg(null);
    sync();
  }

  const toScreen = (p) => vpRef.current.toScreen(p);
  const measNow = (id) => view.measurements.find((x) => x.id === id && !x.archived) || null;

  function guardDraw(p) {
    if (!canMeasure) return stale ? "This plan has been replaced — measure on the current revision." : !material ? "Choose a material first." : "You can't change this takeoff.";
    if (!cal) return mode === "run" ? "Scale this page before measuring runs." : "Scale this page before measuring.";
    if (needsRegionChoice) return "Choose which scaled region you are measuring in.";
    if (p && !pointsWithinCalibration(cal, [p])) return "That point is outside the scaled region.";
    return null;
  }
  const polylineRecord = (id, points, splitsMm) => ({
    id, kind: "polyline", documentId: planDoc.id, pageIndex, calibrationId: cal.id, points,
    inputs: { splitsMm: splitsMm || [], ...(splitsMm?.length ? { splitAnchors: anchorsFor(points, cal, splitsMm) } : {}) },
  });

  // ── drawing: runs / walls (multi-point), member + distribution lines (two points) ───────────────────────────
  /** The workspace record of the drawing as it was (for undo) — from the drawing itself, never a stale view. */
  const draftRecordUndo = (d) => (d?.measurementId && d.points.length >= 2
    ? partial({ measurements: [polylineRecord(d.measurementId, d.points, d.splitsMm)] }) : null);
  const draftIsFlashTool = () => flashing && mode === "run";
  function addVertexOp(d, points) {
    const base = d || { tool: mode, points: [], splitsMm: [], measurementId: null };
    const next = { ...base, tool: mode, points };
    if (draftIsFlashTool() && points.length >= 2) {
      // from two points the run is a measurement with no material assignment: it survives reloads/devices but is
      // in no order until it is finished
      const mid = base.measurementId || newId();
      record({ redo: partial({ measurements: [polylineRecord(mid, points, base.splitsMm)] }), undo: draftRecordUndo(base) || partial({ archive: { measurements: [mid] } }),
        draftBefore: d ?? null, draftAfter: { ...next, measurementId: mid } });
    } else record({ draftBefore: d ?? null, draftAfter: next });
    setLastDone(null);
  }

  function completedOverflowHit(sp) {
    for (const m of pageMeasurements) {
      const p = flashPaths.get(m.id);
      if (!p?.layout?.overflowRuns?.length || matOf(m)?.id !== material?.id) continue;
      const hit = resolvePathTap(sp, { overflowRuns: p.layout.overflowRuns.map((r) => ({ pieceIndex: r.pieceIndex, points: r.points.map(toScreen) })) });
      if (hit.action === "split-at-limit") return { m, pieceIndex: hit.pieceIndex };
    }
    return null;
  }

  function pathTap(p, sp) {
    if (mode === "run" && material?.methodKey === "finished_piece_count") { warn("This material takes finished lengths only — use Count, or Add lengths on the takeoff page."); return; }
    const pre = guardDraw(null);
    if (pre) { warn(pre); return; }
    const cur = draftRef.current;
    const d = cur?.tool === mode ? cur : null;
    const isFlash = draftIsFlashTool();
    let at = p;
    if (d?.points.length) {
      // hit priority (13): split handle → the LAST point (double-tap finishes there) → red overflow ("Split at limit")
      // → an earlier corner (close exactly onto it) → new point. Earlier corners rank BELOW the red line: corners
      // inside the overflow would otherwise turn a split tap into a retrace leg back to that corner.
      const L = isFlash && draftPath?.layout ? draftPath.layout : null;
      const n = d.points.length;
      const hit = resolvePathTap(sp, {
        splitHandles: L ? L.splits.map((s, i) => (s.x != null ? { ...toScreen(s), index: i } : null)).filter(Boolean) : [],
        vertices: [{ ...toScreen(d.points[n - 1]), index: n - 1 }],
        overflowRuns: L ? L.overflowRuns.map((r) => ({ pieceIndex: r.pieceIndex, points: r.points.map(toScreen) })) : [],
      });
      if (hit.action === "split-handle") { setActiveSplit(hit.index); return; }
      if (hit.action === "vertex") { setMsg({ tone: "info", text: "That's the last point — double-tap it (or press Finish) to finish, or zoom in for a short leg." }); return; }
      if (hit.action === "split-at-limit") { lastSplitTap.current = performance.now(); doSplitAtLimit("draft", hit.pieceIndex); return; }
      const corner = resolvePathTap(sp, { vertices: d.points.slice(0, -1).map((q, i) => ({ ...toScreen(q), index: i })) });
      if (corner.action === "vertex") at = d.points[corner.index]; // close exactly onto an earlier corner
    } else if (isFlash) {
      const hit = completedOverflowHit(sp); // a finished run's red part: one tap splits it at the legal limit
      if (hit) { lastSplitTap.current = performance.now(); doSplitAtLimit({ measurement: hit.m }, hit.pieceIndex); return; }
    }
    const err = guardDraw(at);
    if (err) { warn(err); return; }
    let res;
    try { res = appendVertex(d?.points || [], at, cal); } catch (e) { warn(e.message); return; }
    if (!res.added) return;
    setMsg(null);
    addVertexOp(d, res.points);
  }

  function lineTap(p, sp) {
    const err = guardDraw(p);
    if (err) { warn(err); return; }
    const cur = draftRef.current;
    const d = cur?.tool === mode ? cur : null;
    if (!d?.points.length) { record({ draftBefore: d ?? null, draftAfter: { tool: mode, points: [p], splitsMm: [], measurementId: null } }); setMsg(null); return; }
    const start = d.points[0];
    const s0 = toScreen(start);
    if (Math.hypot(sp.x - s0.x, sp.y - s0.y) < 20) { warn("Tap the other end further away — zoom in for short lines."); return; }
    const mid = newId(), cid = newId();
    const inputs = mode === "member" ? { mode: material.rules?.lengthSource === "true" ? "true" : "projected" } : distributionInputs(material.rules);
    const meas = { id: mid, kind: mode, documentId: planDoc.id, pageIndex, calibrationId: cal.id, points: [start, p], inputs };
    const con = { id: cid, measurementId: mid, jobMaterialId: material.id, role: mode };
    // one member line per material: a new one replaces the old (Undo puts it back)
    const old = mode === "member" ? view.contributions.filter((c) => !c.archived && c.jobMaterialId === material.id && c.role === "member") : [];
    const oldMeas = old.map((c) => measNow(c.measurementId)).filter(Boolean);
    const onlyHere = oldMeas.filter((m) => (contribsOf.get(m.id) || []).every((c) => old.includes(c)));
    record({
      redo: partial({ measurements: [meas], contributions: [con], archive: { contributions: old.map((c) => c.id), measurements: onlyHere.map((m) => m.id) } }),
      undo: partial({ measurements: onlyHere, contributions: old, archive: { measurements: [mid], contributions: [cid] } }),
      draftBefore: d, draftAfter: null,
    });
    setMsg(old.length ? { tone: "info", text: "The new member line replaces the previous one (Undo brings it back)." } : null);
  }

  /** Finish the drawing (double-tap / Finish / leaving the screen): a flashing run as ONE measurement; walls and
   *  timber/aluminium runs as one measurement per straight leg. */
  function finishDraft({ navigate = true } = {}) {
    const d = draftRef.current;
    if (!d || !PATH_TOOLS.has(d.tool)) return false;
    const pre = guardDraw(null);
    if (pre) { warn(pre); return false; }
    let r;
    try { r = finishPath(d.points, cal); } catch (e) { warn(e.message); return false; }
    if (!r.finished) { warn("Tap at least two points, then double-tap the last one (or press Finish)."); return false; }
    if (!(flashing && d.tool === "run")) {
      // walls / timber / aluminium: a plan corner is a JOINT, not a fold — every straight leg is its own wall or
      // piece (a 4 × 3 m trim path is four 3 m pieces, never one 12 m member; an L-shaped wall run is two
      // elevations, never one flat one wrapped round the corner). One change, one Undo.
      const legs = straightLegs(r.points);
      const meas = [], cons = [];
      let known = view.measurements;
      for (const [a, b] of legs) {
        const mid = newId();
        if (d.tool === "wall") {
          const inputs = nextWallInputs(known);
          known = [...known, { kind: "wall", inputs }];
          meas.push({ id: mid, kind: "wall", documentId: planDoc.id, pageIndex, calibrationId: cal.id, points: [a, b], inputs });
        } else meas.push(polylineRecord(mid, [a, b], []));
        cons.push({ id: newId(), measurementId: mid, jobMaterialId: material.id, role: d.tool === "wall" ? "wall" : "primary" });
      }
      record({ redo: partial({ measurements: meas, contributions: cons }),
        undo: partial({ archive: { measurements: meas.map((m) => m.id), contributions: cons.map((c) => c.id) } }), draftBefore: d, draftAfter: null });
      setLastDone({ id: meas[0].id });
      const what = d.tool === "wall" ? "walls" : "straight pieces";
      setMsg(legs.length > 1 ? { tone: "ok", text: `${legs.length} ${what} added — each corner is a joint, so every straight leg is its own ${d.tool === "wall" ? "wall" : "piece"}. Undo removes them all.` } : null);
      if (d.tool === "wall" && navigate) onOpenWall?.(meas[0].id);
      return true;
    }
    const mid = d.measurementId || newId(), cid = newId();
    const prev = draftRecordUndo(d);
    record({
      redo: partial({ measurements: [polylineRecord(mid, r.points, d.splitsMm)], contributions: [{ id: cid, measurementId: mid, jobMaterialId: material.id, role: "primary" }] }),
      undo: prev ? partial({ measurements: Object.values(prev.measurements.upsert), archive: { contributions: [cid] } }) : partial({ archive: { measurements: [mid], contributions: [cid] } }),
      draftBefore: d, draftAfter: null,
    });
    setMsg(null); setLastDone({ id: mid }); setActiveSplit(null);
    return true;
  }

  function discardDraft() {
    const d = draftRef.current;
    if (!d) return;
    const prev = draftRecordUndo(d);
    record({ redo: prev ? partial({ archive: { measurements: [d.measurementId] } }) : null, undo: prev, draftBefore: d, draftAfter: null });
    setMsg(null);
  }

  /** Leaving (Done / another material / another drawing tool): a valid run is finished, a lone start point dropped. */
  function settleDraft({ navigate }) {
    const d = draftRef.current;
    if (!d) return false;
    if (PATH_TOOLS.has(d.tool) && d.points.length >= 2 && canMeasure && cal) return finishDraft({ navigate });
    return false;
  }

  function switchMode(k) {
    setMsg(null); setActiveSplit(null); setSelTick(null); setHandleSel(null); setDragPreview(null);
    if (hl.ids.length && k !== "select") setHl((h) => ({ ...h, ids: [] }));
    const d = draftRef.current;
    if (d && d.tool !== k && (PATH_TOOLS.has(k) || LINE_TOOLS.has(k))) {
      if (!settleDraft({ navigate: false })) record({ draftBefore: d, draftAfter: null });
    }
    setModeSel(k);
  }

  // ── splits on a run (the drawing or a finished measurement) ────────────────────────────────────────────────
  /** which: "draft" | "sel" | { measurement } */
  function splitTarget(which) {
    if (which === "draft") {
      const d = draftRef.current;
      if (!d || !draftPath) return null;
      return {
        path: draftPath, points: d.points, cal,
        apply: (next) => {
          const nd = { ...d, splitsMm: next };
          const prev = draftRecordUndo(d);
          record(prev ? { redo: partial({ measurements: [polylineRecord(d.measurementId, d.points, next)] }), undo: prev, draftBefore: d, draftAfter: nd }
            : { draftBefore: d, draftAfter: nd });
        },
      };
    }
    const m = which === "sel" ? measNow(selected) : which.measurement;
    const path = m ? flashPaths.get(m.id) : null;
    const c = m ? calsById.get(m.calibrationId) : null;
    if (!m || !path || !c) return null;
    return {
      path, points: m.points, cal: c,
      apply: (next) => record({ redo: partial({ measurements: [{ ...m, inputs: { ...(m.inputs || {}), splitsMm: next, splitAnchors: anchorsFor(m.points, c, next) } }] }), undo: partial({ measurements: [m] }) }),
    };
  }
  const piecesText = (t, next) => {
    try {
      const p = computeFlashingPath({ points: t.points, calibration: t.cal, splitsMm: next, rules: t.path.config.rules, complete: true });
      return p.pieces.map((pc) => fmtMm(pc.orderMm)).join(" + ");
    } catch { return ""; }
  };
  function applySplits(which, t, next, text) {
    t.apply(next);
    const added = next.find((s) => !t.path.splitsMm.some((o) => Math.abs(o - s) < 1e-6));
    setActiveSplit(added != null ? next.indexOf(added) : null);
    setMsg({ tone: "ok", text: `${text} Pieces now ${piecesText(t, next)} mm — each with its own allowance. Undo puts it back.` });
  }
  function doSplitAtLimit(which, pieceIndex) {
    const t = splitTarget(which);
    if (!t) return;
    if (!canEdit) { warn("You can't change this takeoff."); return; }
    const next = splitAtLimit(t.path, pieceIndex);
    if (sameList(next, t.path.splitsMm)) { warn("There's no legal split position for this piece — move an earlier split or resolve it manually."); return; }
    const at = next.find((s) => !t.path.splitsMm.some((o) => Math.abs(o - s) < 1e-6));
    if (which !== "draft" && which !== "sel") { setModeSel("select"); setSelected(which.measurement.id); }
    applySplits(which, t, next, `Split at the limit (${fmtRaw(at)} mm along the run).`);
  }
  /** HUB 005: all pieces at once — the fewest even pieces within the handling length; one Undo puts the run back. */
  function doSplitToHandling(which, res) {
    const t = splitTarget(which);
    if (!t) return;
    if (!canEdit) { warn("You can't change this takeoff."); return; }
    if (!res?.changed) { if (res?.problems?.[0]) warn(res.problems[0].message); return; }
    t.apply(res.splitsMm);
    setActiveSplit(null);
    setMsg({ tone: "ok", text: `Split into ${res.pieces} pieces: ${piecesText(t, res.splitsMm)} mm — each with its own allowance, all within the ${fmtMm(res.limitMm)} mm handling length. Undo puts the run back.` });
  }
  function splitMove(which, i, stationMm, cornerIndex = null) {
    const t = splitTarget(which);
    if (!t) return;
    const res = cornerIndex != null ? moveSplitToCorner(t.path, i, cornerIndex) : moveSplit(t.path, i, stationMm);
    if (res.problems.length) { warn(res.problems[0].message); return; }
    applySplits(which, t, res.splitsMm, `Split ${i + 1} moved to ${fmtRaw(res.splitsMm[i])} mm.`);
    setActiveSplit(i);
  }
  function splitAdd(which, stationMm) {
    const t = splitTarget(which);
    if (!t) return;
    const res = addSplit(t.path, stationMm);
    if (res.problems.length) { warn(res.problems[0].message); return; }
    applySplits(which, t, res.splitsMm, `Split added at ${fmtRaw(stationMm)} mm.`);
  }
  function splitRemove(which, i) {
    const t = splitTarget(which);
    if (!t) return;
    t.apply(t.path.splitsMm.filter((_, k) => k !== i));
    setActiveSplit(null);
    setMsg({ tone: "ok", text: `Split ${i + 1} removed. Undo puts it back.` });
  }
  function splitRecalc(which, i) {
    const t = splitTarget(which);
    if (!t) return;
    const rec = t.path.splits[i];
    if (!rec) return;
    if (rec.suggestedMm != null) {
      const res = moveSplit(t.path, i, rec.suggestedMm);
      const next = res.problems.length ? t.path.splitsMm.map((s, k) => (k === i ? rec.suggestedMm : s)) : res.splitsMm;
      applySplits(which, t, next, `Split ${i + 1} recalculated to ${fmtRaw(rec.suggestedMm)} mm.`);
      return;
    }
    if (rec.code === "split_moved" && rec.givenMm > 0 && rec.givenMm < t.path.tightTotalMm) {
      // re-approve the cut at the same distance along the CHANGED run (the builder chose this explicitly)
      applySplits(which, t, t.path.splitsMm.map((s, k) => (k === i ? rec.givenMm : s)), `Split ${i + 1} re-set at ${fmtRaw(rec.givenMm)} mm along the changed run.`);
      return;
    }
    splitRemove(which, i);
  }

  // ── geometry edits on a finished run / line / wall ──────────────────────────────────────────────────────────
  /** New points for a polyline: splits that kept their cut location get their rebuilt station; splits whose location
   *  is no longer on the run keep their approved location and stay flagged (13) — never silently moved. */
  function geometryEdit(m, points) {
    const c = calsById.get(m.calibrationId);
    const given = m.inputs?.splitsMm || [];
    if (!given.length || !c) return { next: { ...m, points } };
    const mat = matOf(m);
    const anchors = m.inputs?.splitAnchors?.length ? m.inputs.splitAnchors : anchorsFor(m.points, c, given);
    let res;
    try { res = computeFlashingPath({ points, calibration: c, splitsMm: given, splitAnchors: anchors, rules: flashRulesOf(mat), complete: true }); } catch (e) { return { error: e.message }; }
    const kept = (rec) => rec.code !== "split_moved" && rec.code !== "split_unverifiable" && rec.point;
    const stations = res.splits.map((rec, i) => (kept(rec) ? rec.stationMm : given[i]));
    if (!splitsInsideRun(stations, res.tightTotalMm)) return { error: "That change would leave a split outside the run (or out of order) — move or remove the split first." };
    const nextAnchors = res.splits.map((rec, i) => (kept(rec) ? { stationMm: stations[i], x: rec.point.x, y: rec.point.y } : anchors.find((a) => Math.abs(a.stationMm - given[i]) < 1e-6) || null)).filter(Boolean);
    return { next: { ...m, points, inputs: { ...m.inputs, splitsMm: stations, splitAnchors: nextAnchors } } };
  }

  function moveEndpoint(handleId, p, commit) {
    const [mid, idx] = handleId.split(":");
    const m = measNow(mid);
    if (!m) return;
    if (m.calibrationId && m.kind !== "count") {
      const c = calsById.get(m.calibrationId);
      if (c && !pointsWithinCalibration(c, [p])) { warn("That point is outside the scaled region."); return; }
    }
    if (!commit) { setDragPreview({ measurementId: mid, index: Number(idx), p }); return; }
    setDragPreview(null);
    const pts = m.points.map((q, i) => (i === Number(idx) ? p : q));
    const r = m.kind === "polyline" ? geometryEdit(m, pts) : { next: { ...m, points: pts } };
    if (r.error) { warn(r.error); return; }
    record({ redo: partial({ measurements: [r.next] }), undo: partial({ measurements: [m] }) });
  }
  function insertPoint(m, k, p) {
    const r = geometryEdit(m, [...m.points.slice(0, k), p, ...m.points.slice(k)]);
    if (r.error) { warn(r.error); return; }
    record({ redo: partial({ measurements: [r.next] }), undo: partial({ measurements: [m] }) });
    setHandleSel(`${m.id}:${k}`);
    setMsg({ tone: "info", text: "Point added in the middle of that leg — drag it into place." });
  }
  function removePoint(m, idx) {
    if (m.points.length <= 2) { warn("A run needs at least two points — remove the run instead."); return; }
    const r = geometryEdit(m, m.points.filter((_, i) => i !== idx));
    if (r.error) { warn(r.error); return; }
    record({ redo: partial({ measurements: [r.next] }), undo: partial({ measurements: [m] }) });
    setHandleSel(null);
  }

  function removeSelected() {
    const m = measNow(selected);
    if (!m) return;
    const cs = contribsOf.get(m.id) || [];
    const kids = m.kind === "wall" ? view.measurements.filter((x) => x.kind === "opening" && x.parentId === m.id && !x.archived) : [];
    const kidCs = kids.flatMap((k) => contribsOf.get(k.id) || []);
    const d = draftRef.current;
    record({
      redo: partial({ archive: { measurements: [m.id, ...kids.map((k) => k.id)], contributions: [...cs, ...kidCs].map((c) => c.id) } }),
      undo: partial({ measurements: [m, ...kids], contributions: [...cs, ...kidCs] }),
      ...(d?.measurementId === m.id ? { draftBefore: d, draftAfter: null } : {}),
    });
    setSelected(null); setSelTick(null); setHandleSel(null);
    setDeletedNotice(m.kind === "wall" ? "Wall deleted." : m.kind === "count" ? "Count deleted." : "Run deleted.");
  }

  function continueDrawing(m) {
    record({ draftBefore: draftRef.current ?? null, draftAfter: { tool: "run", points: m.points, splitsMm: m.inputs?.splitsMm || [], measurementId: m.id } });
    setSelected(null); setModeSel("run");
  }
  function finishOrphan(m) {
    const cid = newId();
    const d = draftRef.current;
    record({ redo: partial({ contributions: [{ id: cid, measurementId: m.id, jobMaterialId: material.id, role: "primary" }] }), undo: partial({ archive: { contributions: [cid] } }),
      ...(d?.measurementId === m.id ? { draftBefore: d, draftAfter: null } : {}) });
  }

  // ── timber: member overrides, distribution inputs, pitch ────────────────────────────────────────────────────
  function setDistInputs(m, patch) {
    record({ redo: partial({ measurements: [{ ...m, inputs: { ...(m.inputs || {}), ...patch } }] }), undo: partial({ measurements: [m] }) });
  }
  const overridePatch = (m, station, patch) => setDistInputs(m, { overrides: withOverride(m.inputs?.overrides, station, patch) });
  function setRule(mat, patch) {
    if (!mat) return;
    const next = materialRecord({ ...mat, rules: { ...(mat.rules || {}), ...patch } });
    record({ redo: partial({ materials: [next] }), undo: partial({ materials: [materialRecord(mat)] }) });
  }
  const setPitch = (deg) => setRule(material, { pitchDeg: deg });

  // ── taps ────────────────────────────────────────────────────────────────────────────────────────────────────
  function tickAt(sp) {
    let best = null, bestD = HIT_PX + 0.001;
    for (const [mid, info] of ticksBy) {
      const m = measNow(mid);
      if (!m || !info.cal) continue;
      for (const t of info.ticks) {
        if (t.preview) continue;
        const q = safePointAt(m.points, info.cal, t.positionMm);
        if (!q) continue;
        const s = toScreen(q), d = Math.hypot(s.x - sp.x, s.y - sp.y);
        if (d < bestD) { bestD = d; best = { measurementId: mid, stationId: t.stationId, d }; }
      }
    }
    return best;
  }

  function selectTap(sp) {
    const s = measNow(selected);
    if (s && s.kind === "polyline" && canEdit && (contribsOf.get(s.id) || []).length) {
      // priority (13): split handles (DOM handles above) → red overflow ("Split at limit") → "+" insert a point
      const path = flashPaths.get(s.id);
      if (path?.layout?.overflowRuns?.length) {
        const hit = resolvePathTap(sp, { overflowRuns: path.layout.overflowRuns.map((r) => ({ pieceIndex: r.pieceIndex, points: r.points.map(toScreen) })) });
        if (hit.action === "split-at-limit") { doSplitAtLimit("sel", hit.pieceIndex); return; }
      }
      // "+" inserts a corner — flashing only (a timber / aluminium run is one straight piece: a corner is a joint)
      const hitMid = path ? insertMarkers(s, toScreen).find((mm) => Math.hypot(mm.screen.x - sp.x, mm.screen.y - sp.y) <= HIT_PX) : null;
      if (hitMid) { insertPoint(s, hitMid.k + 1, hitMid.pdf); return; }
    }
    const t = tickAt(sp);
    let best = null, bestD = HIT_PX;
    for (const m of pageMeasurements) {
      if (!isShown(m)) continue;   // a hidden item can't be picked up by tapping where it is
      const pts = (m.points || []).map(toScreen);
      if (!pts.length) continue;
      const d = m.kind === "count" ? Math.min(...pts.map((q) => Math.hypot(q.x - sp.x, q.y - sp.y))) : distToPolyline(sp, pts);
      if (d < bestD) { bestD = d; best = m.id; }
    }
    // a member tick wins over its own run line, and over another line only when it is at least as close
    if (t && (best === t.measurementId || !best || t.d <= bestD)) { setSelected(t.measurementId); setSelTick(t.stationId); setHandleSel(null); setActiveSplit(null); return; }
    setSelected(best); setSelTick(null); setHandleSel(null); setActiveSplit(null);
  }
  /** "+" markers of a finished run — never on its red overflow (the red tap means "Split at limit"). */
  function insertMarkers(m, toScr) {
    const reds = (flashPaths.get(m.id)?.layout?.overflowRuns || []).map((r) => r.points.map(toScr));
    return legMidpoints(m.points, toScr).filter((mm) => reds.every((pts) => distToPolyline(mm.screen, pts) > HIT_PX));
  }

  function countTap(p) {
    if (!countLen) { warn("Enter the finished length first."); return; }
    const existing = activeCount && measNow(activeCount);
    if (existing && existing.finishedLengthMm === countLen) {
      const next = { ...existing, points: [...existing.points, p] };
      record({ redo: partial({ measurements: [next] }), undo: partial({ measurements: [existing] }) });
    } else {
      const mid = newId(), cid = newId();
      const meas = { id: mid, kind: "count", documentId: planDoc.id, pageIndex, calibrationId: null, points: [p], finishedLengthMm: countLen };
      record({ redo: partial({ measurements: [meas], contributions: [{ id: cid, measurementId: mid, jobMaterialId: material.id }] }), undo: partial({ archive: { measurements: [mid], contributions: [cid] } }) });
      setActiveCount(mid);
    }
  }

  function onTap(p, sp) {
    // the tap that trails a double-tap finish (tap the end, then double-tap it = three taps) is part of the same
    // gesture burst — it must not start a phantom new run at the finished end (13: no phantom points)
    const lf = lastFinishTap.current;
    lastFinishTap.current = null;
    if (lf && performance.now() - lf.t < BURST_MS && Math.hypot(lf.sp.x - sp.x, lf.sp.y - sp.y) <= DOUBLE_TAP_SLOP_PX + 2 && (PATH_TOOLS.has(mode) || LINE_TOOLS.has(mode))) return;
    setMsg(null);
    if (hl.ids.length) setHl((h) => ({ ...h, ids: [] }));
    if (mode === "select") { selectTap(sp); return; }
    if (PATH_TOOLS.has(mode)) { pathTap(p, sp); return; }
    if (LINE_TOOLS.has(mode)) { lineTap(p, sp); return; }
    if (!canMeasure) { warn(stale ? "This plan has been replaced — measure on the current revision." : !material ? "Choose a material first." : "You can't change this takeoff."); return; }
    if (mode === "count") countTap(p);
  }
  // one recogniser: the first tap of a double-tap already placed (or hit) the endpoint, so finishing adds nothing.
  // Guards: a pair whose first tap was a "Split at limit" does nothing more (one tap = one split), and a pair that is
  // NOT on the run's end (the plan moved between the taps) is just a tap.
  const lastSplitTap = useRef(0);
  const lastFinishTap = useRef(null); // { t, sp } of the double-tap that just finished a drawing
  const onDoubleTap = (p, sp) => {
    const d = draftRef.current;
    if (d?.tool !== mode) return;
    if (performance.now() - lastSplitTap.current < BURST_MS) return; // within one double-tap window (300 ms + the tap)
    const last = d.points[d.points.length - 1];
    const ls = last ? toScreen(last) : null;
    if (!ls || Math.hypot(ls.x - sp.x, ls.y - sp.y) > HIT_PX + 2) { onTap(p, sp); return; }
    if (finishDraft()) lastFinishTap.current = { t: performance.now(), sp };
  };

  // ── derived view state ──────────────────────────────────────────────────────────────────────────────────────
  const sel = measNow(selected);
  const selCs = sel ? contribsOf.get(sel.id) || [] : [];
  const selUnfinished = sel?.kind === "polyline" && !selCs.length;
  const selPath = sel?.kind === "polyline" && !selUnfinished ? flashPaths.get(sel.id) || null : null;
  const selComputed = sel ? computedBy.get(sel.id) : null;
  const selMat = sel ? matOf(sel) : null;
  const handlePts = sel && mode === "select" && canEdit && !selUnfinished && sel.points
    ? pointsOf(sel).map((p, i) => ({ id: `${sel.id}:${i}`, p, label: `${sel.kind === "count" ? "Count mark" : "Point"} ${i + 1}` })) : [];
  const splitHandlesFor = (path) => (path?.layout?.splits || []).map((s, i) => (s.x != null ? { id: `split:${i}`, p: { x: s.x, y: s.y }, variant: "split", label: `Split ${i + 1} handle` } : null)).filter(Boolean);
  const selSplitHandles = mode === "select" && canEdit && selPath ? splitHandlesFor(selPath) : [];
  const draftSplitHandles = mode === "run" && canEdit && draftPath ? splitHandlesFor(draftPath) : [];
  const orphans = pageMeasurements.filter((m) => m.kind === "polyline" && !(contribsOf.get(m.id) || []).length && m.id !== draft?.measurementId);
  const runCount = pageMeasurements.filter((m) => (m.kind === "run" || m.kind === "polyline") && (contribsOf.get(m.id) || []).length).length;
  const noun = memberNoun(material);
  const results = material && familyOf(material) ? ws.computed?.materialResults?.[material.id] || null : null;
  const blocking = (results?.problems || []).filter((p) => p.blocking !== false);
  const draftLen = draft && cal && draft.points.length >= 2 ? pathLengthMm(draft.points, cal) : null;
  const draftLegs = draft && !draftIsFlash ? straightLegs(draft.points).length : 0; // walls / timber / aluminium pieces
  const drawTool = PATH_TOOLS.has(mode) || LINE_TOOLS.has(mode);
  const hlSet = useMemo(() => new Set(hl.ids), [hl.ids]);
  // the takeoff items on this page (one per material, in the job's material order) for the show / hide list
  const layerItems = useMemo(() => {
    const counts = new Map();
    let unassigned = 0;
    for (const m of pageMeasurements) {
      const cs = contribsOf.get(m.id) || [];
      if (!cs.length) { if (m.id !== draft?.measurementId) unassigned += 1; continue; }
      for (const id of new Set(cs.map((c) => c.jobMaterialId))) counts.set(id, (counts.get(id) || 0) + 1);
    }
    const items = view.materials.filter((x) => counts.has(x.id)).map((x) => ({ id: x.id, name: x.name, count: counts.get(x.id) }));
    if (unassigned) items.push({ id: UNASSIGNED, name: "Lines with no material", count: unassigned });
    return items;
  }, [pageMeasurements, contribsOf, view.materials, draft?.measurementId]);
  const hiddenHere = layerItems.filter((it) => hidden.has(HIDE_ALL) || hidden.has(it.id));
  const isHiddenItem = (id) => hidden.has(HIDE_ALL) || hidden.has(id);
  /** On the plan? The run being drawn, the selected one and "Show on plan" highlights always are. */
  const isShown = (m) => {
    if (m.id === selected || hlSet.has(m.id) || m.id === draft?.measurementId) return true;
    const cs = contribsOf.get(m.id) || [];
    if (!cs.length) return !isHiddenItem(UNASSIGNED);
    return cs.some((c) => !isHiddenItem(c.jobMaterialId));
  };
  const toggleItem = (id) => setHidden((cur) => {
    // leaving "everything hidden" for a per-item list: every item on this page starts hidden, then this one flips
    const n = cur.has(HIDE_ALL) ? new Set(layerItems.map((it) => it.id)) : new Set(cur);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  // a NEW item measured with a hidden material shows that material again — what you just measured never disappears
  const activeHere = pageMeasurements.filter((m) => (contribsOf.get(m.id) || []).some((c) => c.jobMaterialId === material?.id)).length;
  const prevActive = useRef({ id: material?.id, n: activeHere });
  useEffect(() => {
    const was = prevActive.current;
    prevActive.current = { id: material?.id, n: activeHere };
    if (!material?.id || was.id !== material.id || activeHere <= was.n || !isHiddenItem(material.id)) return;
    setHidden((cur) => { const n = cur.has(HIDE_ALL) ? new Set(layerItems.map((it) => it.id)) : new Set(cur); n.delete(material.id); n.delete(HIDE_ALL); return n; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHere, material?.id]);
  const showAll = () => setHidden(new Set());
  const hideAll = () => setHidden(new Set(layerItems.map((it) => it.id)));
  const hlHere = pageMeasurements.filter((m) => hlSet.has(m.id) && m.points?.length);
  const hlElsewhere = hl.ids.map((id) => view.measurements.find((m) => m.id === id && !m.archived)).filter((m) => m && !hlHere.includes(m));
  const hlPoints = useMemo(() => pageMeasurements.filter((m) => hl.ids.includes(m.id)).flatMap((m) => m.points || []), [pageMeasurements, hl.ids]);
  // frame what the schedule asked for, once per request (the key changes with every new "Show on plan")
  const focus = useMemo(() => (hlPoints.length ? { key: hl.key, points: hlPoints } : null), [hl.key, hlPoints]);

  // split handle drag: constrained onto the run, snapping to a corner within 14 px
  const splitConstrain = (points, c) => (id, p) => {
    const sn = stationNear(points, c, p);
    if (!sn) return p;
    const s = vpRef.current.toScreen(sn.point);
    const corner = points.slice(1, -1).find((q) => { const v = vpRef.current.toScreen(q); return Math.hypot(v.x - s.x, v.y - s.y) < 14; });
    return corner || sn.point;
  };
  const splitCommit = (which, points, c) => (id, p) => {
    setDragPreview(null);
    const i = Number(id.split(":")[1]);
    const v = points.findIndex((q, k) => k > 0 && k < points.length - 1 && q.x === p.x && q.y === p.y);
    if (v > 0) { splitMove(which, i, null, v); return; }
    const sn = stationNear(points, c, p);
    if (sn) splitMove(which, i, sn.stationMm);
  };
  const splitPreview = (which, points, c) => (id, p) => {
    const sn = stationNear(points, c, p);
    if (sn) setDragPreview({ split: Number(id.split(":")[1]), which, stationMm: sn.stationMm });
  };

  const close = () => { settleDraft({ navigate: true }); onClose?.(); };
  const changeMaterial = () => { settleDraft({ navigate: false }); onChangeMaterial?.(); };

  // ── render ──────────────────────────────────────────────────────────────────────────────────────────────────
  const renderMeasurement = (m, toScr) => {
    if (m.id === draft?.measurementId) return null; // drawn as the drawing below
    const pts = pointsOf(m) || [];
    const isSel = m.id === selected || hlSet.has(m.id); // highlighted from the schedule: same halo as a selection
    const c = computedBy.get(m.id);
    const cs = contribsOf.get(m.id) || [];
    if (m.kind === "run" && pts.length === 2) {
      const s = pts.map(toScr);
      const problem = c?.problems?.length;
      const color = isSel ? COLORS.selected : problem ? COLORS.overflow : COLORS.flashing;
      const mx = (s[0].x + s[1].x) / 2, my = (s[0].y + s[1].y) / 2;
      const label = c?.pieces?.[0] ? fmtMm(c.result?.finishedLengthMm) : "";
      return (
        <g key={m.id} data-measurement-id={m.id} data-kind="run">
          <line x1={s[0].x} y1={s[0].y} x2={s[1].x} y2={s[1].y} stroke={color} strokeWidth={isSel ? 4 : 3} strokeLinecap="round" />
          {label && <text x={mx} y={my - 6} textAnchor="middle" fontSize="12" fontWeight="700" fill={color} stroke="#fff" strokeWidth="3" paintOrder="stroke">{label}</text>}
        </g>
      );
    }
    if (m.kind === "polyline") {
      const mat = cs.length ? materialsById.get(cs[0].jobMaterialId) : null;
      if (!cs.length || isFlashingMaterial(mat)) {
        return <FlashingPathShape key={m.id} measurementId={m.id} points={pts} path={flashPaths.get(m.id) || null} cal={calsById.get(m.calibrationId) || null} toScreen={toScr}
          selected={isSel} unfinished={!cs.length} activeSplit={isSel ? activeSplit : null} />;
      }
      const len = pathLengthMm(pts, calsById.get(m.calibrationId));
      return <PolylineShape key={m.id} measurementId={m.id} kind="polyline" points={pts} toScreen={toScr} color={COLORS.trim} selected={isSel} label={len ? `${fmtMm(Math.round(len))}` : ""} />;
    }
    if (m.kind === "wall" && pts.length >= 2) {
      const len = pathLengthMm(pts, calsById.get(m.calibrationId));
      return <PolylineShape key={m.id} measurementId={m.id} kind="wall" points={pts} toScreen={toScr} color={COLORS.wall} selected={isSel}
        label={`${m.inputs?.name || "Wall"}${len ? ` · ${fmtMm(Math.round(len))}` : ""}`} />;
    }
    if ((m.kind === "member" || m.kind === "distribution") && pts.length === 2) {
      const info = ticksBy.get(m.id);
      const c2 = calsById.get(m.calibrationId);
      const ticks = (info?.ticks || []).map((t) => {
        const q = c2 ? safePointAt(pts, c2, t.positionMm) : null;
        return q ? { ...t, screen: toScr(q), dir: screenDirectionAt(pts, c2, t.positionMm, toScr), overridden: !!t.lengthOverridden } : null;
      }).filter(Boolean);
      const live = ticks.filter((t) => !t.preview && !t.removed);
      const n = live.length + live.reduce((a, t) => a + (t.duplicates || 0), 0);
      const len = pathLengthMm(pts, c2);
      const tmat = info?.mat || matOf(m);
      const label = m.kind === "member" ? `Member ${len ? fmtMm(Math.round(len)) : ""}`
        : ticks.length && !ticks[0].preview ? `${n} ${memberNoun(tmat, n)}` : ticks.length ? `${ticks.length} ${memberNoun(tmat, ticks.length)} (preview)` : "Distribution";
      return <TimberLineShape key={m.id} measurementId={m.id} kind={m.kind} points={pts} toScreen={toScr} label={label} selected={isSel} ticks={ticks} selTick={isSel ? selTick : null} />;
    }
    const color = isSel ? COLORS.selected : c?.problems?.length ? COLORS.overflow : COLORS.count;
    return (
      <g key={m.id} data-measurement-id={m.id} data-kind={m.kind}>
        {pts.map((q, i) => { const s = toScr(q); return (
          <g key={i}>
            <circle cx={s.x} cy={s.y} r={9} fill={color} fillOpacity={0.9} />
            <text x={s.x} y={s.y + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{i + 1}</text>
          </g>
        ); })}
      </g>
    );
  };

  const renderDraft = (toScr) => {
    if (!draft || !draft.points.length) return null;
    const color = draft.tool === "wall" ? COLORS.wall : draft.tool === "member" ? COLORS.member : draft.tool === "distribution" ? COLORS.distribution : COLORS.flashing;
    if (draft.points.length === 1) {
      const s = toScr(draft.points[0]);
      return <circle data-path-draft="" data-points={1} cx={s.x} cy={s.y} r={7} fill="#fff" stroke={color} strokeWidth={3} />;
    }
    if (draftIsFlash) {
      return <FlashingPathShape measurementId={draft.measurementId} points={draft.points} path={draftPath} cal={cal} toScreen={toScr} unfinished draft activeSplit={activeSplit} />;
    }
    const len = cal ? pathLengthMm(draft.points, cal) : null;
    return <PolylineShape kind={draft.tool === "wall" ? "wall" : "polyline"} points={draft.points} toScreen={toScr} color={color} dashed draft label={len ? fmtMm(Math.round(len)) : ""} />;
  };

  const statusLine = results && <StatusRow status={results.status} />;
  // repeated members: what the engine made of the member + distribution lines — count → stock → each needs (02 §2)
  const timberResult = <TimberResult result={results} nounOf={(n) => memberNoun(material, n)} />;
  const problemList = (list) => list.length > 0 && (
    <ul className="space-y-0.5 text-xs text-amber-800" data-material-problems="">{list.slice(0, 3).map((p, i) => <li key={i}>{p.message}</li>)}</ul>
  );
  const problemLines = problemList(blocking);
  /** The engine's statuses + blocking problems for the SELECTED timber line's material (Select mode). */
  const selResult = selMat && familyOf(selMat) ? ws.computed?.materialResults?.[selMat.id] || null : null;
  const selBlocking = (selResult?.problems || []).filter((p) => p.blocking !== false);
  const selStatus = selResult && <><StatusRow status={selResult.status} />{problemList(selBlocking)}</>;

  // the keyboard's height below the window: FocusedWindow's root is a column in every orientation, so the plan and
  // the sheet / side panel shrink above the keyboard in portrait AND landscape — the active field is never under it
  const kbSpacer = kbInset > 0 ? <div aria-hidden="true" data-keyboard-spacer="" style={{ height: kbInset, flexShrink: 0 }} /> : null;

  return (
    <FocusedWindow
      title={material ? material.name : "Measure"}
      subtitle={`${planDoc?.title || "Plan"} · page ${pageIndex + 1}${cal ? ` · ${cal.status === CALIBRATION_STATUS.READY ? "scaled" : "scale needs review"}` : " · not scaled"}`}
      onClose={close} closeLabel="Done"
      footer={kbSpacer}
      actions={<>
        <SaveChip status={ws.status} />
        <Btn kind="ghost" className="min-w-[44px] px-2" onClick={undo} disabled={!hist.past.length} aria-label="Undo">↶</Btn>
        <Btn kind="ghost" className="min-w-[44px] px-2" onClick={redo} disabled={!hist.future.length} aria-label="Redo">↷</Btn>
      </>}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1 border-b border-hairline bg-white px-2 py-1">
          <div role="radiogroup" aria-label="Tool" className="flex max-w-full flex-wrap rounded-lg border border-hairline p-0.5">
            {tools.map((t) => (
              <button key={t.k} type="button" role="radio" aria-checked={mode === t.k} onClick={() => switchMode(t.k)}
                className={`min-h-[44px] min-w-[52px] rounded-md px-2 text-sm font-medium ${mode === t.k ? "bg-primary text-white" : "text-ink"}`}>{t.label}</button>
            ))}
          </div>
          <button type="button" onClick={changeMaterial} className="ml-auto min-h-[44px] min-w-0 max-w-[45%] truncate rounded-lg border border-hairline px-2 text-xs text-ink">{material ? `Material: ${material.name}` : "Choose material"}</button>
          <Btn kind="ghost" className="min-w-[44px]" onClick={() => setLayersOpen((v) => !v)} aria-expanded={layersOpen} aria-haspopup="true"
            aria-label="Show or hide takeoffs on the plan" data-layers-button="">Takeoffs{hiddenHere.length ? ` (${hiddenHere.length} hidden)` : ""} ▾</Btn>
          <Btn kind="ghost" className="min-w-[44px]" onClick={() => vpRef.current?.fit()} aria-label="Fit page">Fit</Btn>
        </div>
        {layersOpen && (
          <div className="absolute right-2 top-[52px] z-30 w-[min(20rem,calc(100%-1rem))] rounded-card border border-hairline bg-white shadow-lg" role="dialog" aria-label="Takeoffs on this plan" data-layers=""
            onKeyDown={(e) => { if (e.key === "Escape") setLayersOpen(false); }}>
            <div className="flex items-center gap-1 border-b border-hairline px-3 py-1">
              <p className="flex-1 text-sm font-semibold text-ink">Show on this plan</p>
              <Btn kind="ghost" onClick={showAll} disabled={!hiddenHere.length}>Show all</Btn>
              <Btn kind="ghost" onClick={hideAll} disabled={!layerItems.length || hiddenHere.length === layerItems.length}>Hide all</Btn>
            </div>
            {!layerItems.length ? <p className="px-3 py-3 text-sm text-muted">Nothing measured on this page yet.</p> : (
              <ul className="max-h-[50vh] overflow-y-auto py-1">
                {layerItems.map((it) => (
                  <li key={it.id}>
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 text-sm text-ink" data-layer-item={it.id}>
                      <input type="checkbox" className="h-5 w-5 rounded text-primary" checked={!isHiddenItem(it.id)} onChange={() => toggleItem(it.id)} />
                      <span className="min-w-0 flex-1 truncate">{it.name}</span>
                      <span className="text-[11px] text-muted">{it.count}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-hairline px-3 py-1 text-right"><Btn onClick={() => setLayersOpen(false)}>Done</Btn></div>
          </div>
        )}
        {hiddenHere.length > 0 && <div className="px-2 pt-2"><Banner tone="info" action={<Btn onClick={showAll}>Show all</Btn>}>
          {hiddenHere.length === layerItems.length ? "All takeoffs are hidden on this page" : `${hiddenHere.length} of ${layerItems.length} takeoff items hidden on this page (${hiddenHere.map((it) => it.name).join(", ")})`} — nothing is deleted, the schedule is unchanged.
        </Banner></div>}
        {deletedNotice && <div className="px-2 pt-2"><Banner tone="info" action={<div className="flex gap-1"><Btn onClick={() => { undo(); setDeletedNotice(null); }}>Undo</Btn><Btn kind="ghost" onClick={() => setDeletedNotice(null)}>OK</Btn></div>}>{deletedNotice}</Banner></div>}
        {stale && <div className="px-2 pt-2"><Banner tone="warn">This plan has been replaced. Existing measurements stay here for review — measure on the current revision.</Banner></div>}
        {!cal && !stale && drawTool && <div className="px-2 pt-2"><Banner tone="info" action={onScale && <Btn kind="primary" onClick={onScale}>Scale page</Btn>}>This page has no scale yet. {flashing ? "You can still count pieces." : "Scale it before measuring."}</Banner></div>}
        {cal && cal.status !== CALIBRATION_STATUS.READY && <div className="px-2 pt-2"><Banner tone="warn" action={onScale && <Btn onClick={onScale}>Re-scale</Btn>}>The scale on this page {cal.status === "needs_review" ? "failed its check" : "hasn't been checked"} — runs are shown but can&apos;t be ordered until it is re-scaled.</Banner></div>}
        {orphans.length > 0 && mode !== "select" && (
          <div className="px-2 pt-2"><Banner tone="warn" action={<Btn onClick={() => { setModeSel("select"); setSelected(orphans[0].id); }}>Show</Btn>}>
            {orphans.length} unfinished run{orphans.length === 1 ? " is" : "s are"} on this page — not in the order until finished.</Banner></div>
        )}
        {cals.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 px-2 pt-2 text-xs">
            <span className="text-muted">Scaled region:</span>
            {cals.map((c) => (
              <button key={c.id} type="button" onClick={() => setRegionKey(c.regionLabel || "")} aria-pressed={(c.regionLabel || "") === regionKey}
                className={`min-h-[44px] rounded-full border px-3 ${(c.regionLabel || "") === regionKey ? "border-primary bg-primary/10 text-primary" : "border-hairline"}`}>{c.regionLabel || "Whole page"}</button>
            ))}
          </div>
        )}
        <PdfViewport
          ref={vpRef} doc={doc} pageIndex={pageIndex} displayRotation={displayRotation}
          mode={mode === "pan" ? "pan" : "tap"} onTap={mode === "pan" ? undefined : onTap}
          onDoubleTap={PATH_TOOLS.has(mode) && canMeasure ? onDoubleTap : undefined}
          focus={focus}
          viewKey={planDoc ? `${wsId}|${planDoc.id}|${pageIndex}` : null}
          className="min-h-0 flex-1"
          ariaLabel="Plan — tap to measure"
          overlay={({ toScreen: toScr }) => (
            <>
              {cal?.region && (() => { const a = toScr({ x: cal.region.x0, y: cal.region.y0 }), b = toScr({ x: cal.region.x1, y: cal.region.y1 }); return <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} fill="none" stroke="#006c9b" strokeDasharray="4 4" />; })()}
              {pageMeasurements.filter(isShown).map((m) => {
                // the chosen material's layer in full colour; other materials stay visible for context, dimmed
                const cs = contribsOf.get(m.id) || [];
                const other = material && cs.length > 0 && !cs.some((c) => c.jobMaterialId === material.id) && m.id !== selected && !hlSet.has(m.id);
                const el = renderMeasurement(m, toScr);
                if (el && hlSet.has(m.id)) return <g key={m.id} data-highlighted="">{el}</g>;
                return el && other ? <g key={m.id} opacity={0.45} data-other-layer="">{el}</g> : el;
              })}
              {renderDraft(toScr)}
              {mode === "select" && canEdit && selPath && insertMarkers(sel, toScr).map((mm) => (
                <g key={`ins${mm.k}`} data-insert-marker={mm.k}>
                  <circle cx={mm.screen.x} cy={mm.screen.y} r={11} fill="#fff" stroke={COLORS.flashing} strokeWidth={2} />
                  <text x={mm.screen.x} y={mm.screen.y + 5} textAnchor="middle" fontSize="16" fontWeight="700" fill={COLORS.flashing}>+</text>
                </g>
              ))}
              {handlePts.length > 0 && (
                <PointHandlesLayer points={handlePts} toScreen={toScr} viewportRef={vpRef} selectedId={handleSel} onSelect={setHandleSel}
                  onMove={(id, p) => moveEndpoint(id, p, false)} onCommit={(id, p) => moveEndpoint(id, p, true)} onCancel={() => setDragPreview(null)} />
              )}
              {selSplitHandles.length > 0 && (
                <PointHandlesLayer points={selSplitHandles} toScreen={toScr} viewportRef={vpRef} selectedId={activeSplit != null ? `split:${activeSplit}` : null}
                  onSelect={(id) => setActiveSplit(Number(id.split(":")[1]))} constrain={splitConstrain(sel.points, calsById.get(sel.calibrationId))}
                  onMove={splitPreview("sel", sel.points, calsById.get(sel.calibrationId))} onCommit={splitCommit("sel", sel.points, calsById.get(sel.calibrationId))} onCancel={() => setDragPreview(null)} />
              )}
              {draftSplitHandles.length > 0 && (
                <PointHandlesLayer points={draftSplitHandles} toScreen={toScr} viewportRef={vpRef} selectedId={activeSplit != null ? `split:${activeSplit}` : null}
                  onSelect={(id) => setActiveSplit(Number(id.split(":")[1]))} constrain={splitConstrain(draft.points, cal)}
                  onMove={splitPreview("draft", draft.points, cal)} onCommit={splitCommit("draft", draft.points, cal)} onCancel={() => setDragPreview(null)} />
              )}
            </>
          )}
        />
      </div>
      {/* phone portrait: the plan keeps most of the screen; the sheet scrolls (desktop/landscape: side panel) */}
      <Sheet title={mode === "select" ? (sel ? "Selected" : "Select") : SHEET_TITLE[mode] || "Measure"} initialFocus={false} className="portrait:max-lg:!max-h-[42vh]">
        <div onFocusCapture={keepFieldInView} className="space-y-2">
          {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
          {hl.ids.length > 0 && (
            <div data-highlight-note="">
              <Banner tone="info" action={hlHere.length > 0 ? <Btn onClick={() => vpRef.current?.fitTo(hlPoints)}>Show again</Btn> : null}>
                {hlHere.length > 0 ? `From the schedule: ${hlHere.length === 1 ? "this measurement is" : `these ${hlHere.length} measurements are`} highlighted on the plan.` : "From the schedule:"}
                {hlElsewhere.length > 0 && ` ${hlElsewhere.length} ${hlHere.length ? "more " : ""}${hlElsewhere.length === 1 ? "isn't" : "aren't"} on this page: ${describeElsewhere(hlElsewhere, view.documents)}.`}
              </Banner>
            </div>
          )}

          {mode === "run" && flashing && (
            <div className="space-y-2 text-sm">
              {!draft?.points.length && !lastDone && <p className="text-muted">Tap the start of a straight run. For a run with corners, tap each corner, then double-tap the last point (or press Finish). Hold for a magnifier.</p>}
              {draft?.points.length === 1 && <p className="text-muted">Tap the finish of this run. Tap each corner on the way; double-tap the last point to finish.</p>}
              {draft?.points.length >= 2 && <>
                <PathResult path={draftPath} />
                <p className="text-[11px] text-muted">Still drawing — tap the next corner, or double-tap the last point to finish. Not in the order until it&apos;s finished.</p>
              </>}
              {draft?.points.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Btn onClick={() => finishDraft()} disabled={draft.points.length < 2}>Finish</Btn>
                  <Btn kind="ghost" onClick={discardDraft}>Discard run</Btn>
                </div>
              )}
              {draftPath && (draftPath.splits.length > 0 || draftPath.overflow || draftPath.pieces?.some((pc) => pc.handlingFlag)) && (
                <SplitList path={draftPath} canEdit={canEdit} activeSplit={activeSplit} onActivate={setActiveSplit}
                  onMove={(i, mm) => splitMove("draft", i, mm)} onCorner={(i, v) => splitMove("draft", i, null, v)} onRemove={(i) => splitRemove("draft", i)}
                  onRecalc={(i) => splitRecalc("draft", i)} onAdd={(mm) => splitAdd("draft", mm)} onSplitAtLimit={() => doSplitAtLimit("draft", draftPath.overflow?.pieceIndex)}
                  onSplitToHandling={(res) => doSplitToHandling("draft", res)} />
              )}
              {!draft && lastDone && (() => {
                const p = flashPaths.get(lastDone.id);
                return p ? <div className="space-y-1" data-finished-run=""><p className="font-medium text-ink">Finished — one run:</p><PathResult path={p} /><StatusRow status={p.status} />
                  <p className="text-[11px] text-muted">Tap the start of the next run. Undo reopens this one.</p></div> : null;
              })()}
              {draft && !draftStored && <p className="text-[11px] text-amber-800">This device can&apos;t keep an unfinished run if the app reloads — finish it before leaving.</p>}
              <p className="text-[11px] text-muted">{runCount} run(s) on this page.</p>
            </div>
          )}

          {mode === "run" && !flashing && (
            <div className="space-y-2 text-sm">
              <p className="text-muted">{draft?.points.length ? `Run ${draftLen != null ? `${fmtRaw(draftLen)} mm` : "—"} · tap each corner, double-tap the last point (or Finish).` : "Tap the start of the run, then each corner; double-tap the last point (or press Finish)."}</p>
              <p className="text-[11px] text-muted">Each straight leg is its own piece — a corner is a joint, not a bend.{draftLegs > 1 ? ` This run makes ${draftLegs} pieces.` : ""}</p>
              {draft?.points.length > 0 && <div className="flex flex-wrap gap-2"><Btn onClick={() => finishDraft()} disabled={draft.points.length < 2}>Finish</Btn><Btn kind="ghost" onClick={discardDraft}>Discard</Btn></div>}
              {statusLine}{problemLines}
            </div>
          )}

          {mode === "wall" && (() => {
            const wi = nextWallInputs(view.measurements);
            return (
              <div className="space-y-2 text-sm">
                <p className="text-muted">{draft?.points.length
                  ? `${wi.name}${draftLegs > 1 ? ` + ${draftLegs - 1} more` : ""}: ${draftLen != null ? `${fmtRaw(draftLen)} mm along the plan` : "tap the next point"} · tap each corner, then double-tap the last point (or Finish) — its elevation opens next.`
                  : "Tap the start of the wall run on the floor plan, then each corner. Double-tap the last point (or press Finish) and its elevation opens next."}</p>
                <p className="text-[11px] text-muted">Each straight leg becomes its own wall (a corner is never wrapped into one flat elevation).</p>
                <p className="text-[11px] text-muted">{wi.heightMm ? `Height ${fmtMm(wi.heightMm)} mm (last used here) — change it on the elevation.` : "You'll enter the height on the elevation (derived from plan + entered heights)."}</p>
                {draft?.points.length > 0 && <div className="flex flex-wrap gap-2"><Btn onClick={() => finishDraft()} disabled={draft.points.length < 2}>Finish</Btn><Btn kind="ghost" onClick={discardDraft}>Discard</Btn></div>}
                <p className="text-[11px] text-muted">{pageMeasurements.filter((m) => m.kind === "wall").length} wall(s) on this page.</p>
                {statusLine}{problemLines}
              </div>
            );
          })()}

          {mode === "member" && (() => {
            const own = view.contributions.find((c) => !c.archived && c.jobMaterialId === material?.id && c.role === "member");
            const mm = own ? measNow(own.measurementId) : null;
            const len = mm ? pathLengthMm(mm.points, calsById.get(mm.calibrationId)) : null;
            const src = material?.rules?.lengthSource || "projected";
            return (
              <div className="space-y-2 text-sm">
                <p className="text-muted">{draft?.points.length ? "Tap the other end of the member line." : src === "true"
                  ? `Tap both ends of ONE ${memberNoun(material, 1)} measured at its true (sloped) length — e.g. on a section.`
                  : material?.spec?.purpose === "rafters"
                    ? `Tap both ends of ONE ${memberNoun(material, 1)} across the roof slope, measured in plan (projected) — include the overhang.`
                    : `Tap both ends of ONE ${memberNoun(material, 1)}, measured in plan (projected).`}</p>
                <MemberPanel lengthMm={len} lengthSource={src} pitchDeg={material?.rules?.pitchDeg} purpose={material?.spec?.purpose} canEdit={canEdit} onPitch={setPitch} />
                {timberResult}
                {statusLine}{problemLines}
              </div>
            );
          })()}

          {mode === "distribution" && (
            <div className="space-y-2 text-sm">
              <p className="text-muted">{draft?.points.length ? "Tap the end of the distribution run." : `Tap the start of the distribution run — the line the ${noun} are spaced along (not the roof perimeter).`}</p>
              {timberResult}
              <p className="text-[11px] text-muted">Ticks show each {memberNoun(material, 1)}. Switch to Select and tap a tick to remove, duplicate or change one.</p>
              {statusLine}{problemLines}
            </div>
          )}

          {mode === "count" && (
            <div className="space-y-2">
              {/* flashing: a finished length (no allowance); timber: a cut length that is then put on the stock grid (03 T7) */}
              <NumberField label={flashing ? "Finished length (no allowance added)" : "Cut length of each piece"} value={countLen} onCommit={(n) => { setCountLen(n); setActiveCount(null); }}
                help={flashing ? "Changing the length starts a new count — earlier marks keep their length."
                  : "Each tap is one piece; it is ordered on the next stock length. Changing the length starts a new count — earlier marks keep theirs."} />
              {activeCount && (() => { const m = measNow(activeCount); return m ? <p className="text-sm">Counted <b>{m.points.length}</b> × {fmtMm(m.finishedLengthMm)} mm</p> : null; })()}
              {activeCount && <Btn onClick={() => setActiveCount(null)}>Finish count</Btn>}
            </div>
          )}

          {mode === "select" && !sel && <p className="text-sm text-muted">Tap a run, line, wall or count mark to select it.{ticksBy.size ? " Tap a tick to change one member." : ""}</p>}

          {mode === "select" && sel && selUnfinished && (
            <div className="space-y-2 text-sm">
              <p className="font-medium text-ink">Unfinished run — not in the order until it&apos;s finished.</p>
              {flashPaths.get(sel.id) && <PathResult path={flashPaths.get(sel.id)} />}
              {canEdit && (flashing ? (
                <div className="flex flex-wrap gap-2">
                  <Btn kind="primary" onClick={() => continueDrawing(sel)}>Continue drawing</Btn>
                  <Btn onClick={() => finishOrphan(sel)}>Finish as {material.name}</Btn>
                </div>
              ) : <p className="text-[11px] text-muted">Choose a flashing to continue or finish it.</p>)}
              <Btn kind="danger" onClick={removeSelected} disabled={!canEdit}>Remove</Btn>
            </div>
          )}

          {mode === "select" && sel && sel.kind === "polyline" && selPath && (
            <div className="space-y-2 text-sm" data-selected-run="">
              <p className="font-medium text-ink">Run{selMat ? ` — ${selMat.name}` : ""}</p>
              <PathResult path={selPath} />
              <StatusRow status={selPath.status} />
              <PathExplain path={selPath} />
              {(() => {
                // overlength / split problems are explained above, piece by piece — list only the rest (scale, plan …)
                const rest = (selComputed?.problems || []).filter((p) => !PATH_EXPLAINED.has(p));
                return rest.length > 0 && <Banner tone="warn">{rest.map((p) => PROBLEM_TEXT[p] || p.replace(/_/g, " ")).join(" ")}</Banner>;
              })()}
              <SplitList path={selPath} canEdit={canEdit} activeSplit={activeSplit} onActivate={setActiveSplit}
                onMove={(i, mm) => splitMove("sel", i, mm)} onCorner={(i, v) => splitMove("sel", i, null, v)} onRemove={(i) => splitRemove("sel", i)}
                onRecalc={(i) => splitRecalc("sel", i)} onAdd={(mm) => splitAdd("sel", mm)} onSplitAtLimit={() => doSplitAtLimit("sel", selPath.overflow?.pieceIndex)}
                onSplitToHandling={(res) => doSplitToHandling("sel", res)} />
              {canEdit && handleSel?.startsWith(`${sel.id}:`) && (
                <Btn onClick={() => removePoint(sel, Number(handleSel.split(":")[1]))} disabled={sel.points.length <= 2}>Remove point {Number(handleSel.split(":")[1]) + 1}</Btn>
              )}
              <p className="text-[11px] text-muted">Drag a point or split handle to adjust; tap + on a leg to add a point.</p>
              <Btn kind="danger" onClick={removeSelected} disabled={!canEdit}>Delete run</Btn>
            </div>
          )}

          {mode === "select" && sel && sel.kind === "polyline" && !selPath && !selUnfinished && (
            <div className="space-y-2 text-sm">
              <p className="font-medium text-ink">Run{selMat ? ` — ${selMat.name}` : ""} · {fmtRaw(pathLengthMm(sel.points, calsById.get(sel.calibrationId)))} mm</p>
              <p className="text-[11px] text-muted">Drag an end to adjust. A straight piece — a corner is a joint, so trace the next leg as its own run.</p>
              <Btn kind="danger" onClick={removeSelected} disabled={!canEdit}>Remove</Btn>
            </div>
          )}

          {mode === "select" && sel && (sel.kind === "run" || sel.kind === "count") && (
            <div className="space-y-2 text-sm">
              <p className="font-medium text-ink">{sel.kind === "run" ? "Run" : `Count — ${sel.points?.length || 0} marks`}</p>
              {selComputed?.explanation && <p className="text-muted">{selComputed.explanation}</p>}
              {selComputed?.problems?.length > 0 && <Banner tone="warn">{selComputed.problems.join(", ").replace(/_/g, " ")}</Banner>}
              <p className="text-[11px] text-muted">Drag a handle to adjust; the magnifier shows the exact spot.</p>
              <Btn kind="danger" onClick={removeSelected} disabled={!canEdit}>Remove</Btn>
            </div>
          )}

          {mode === "select" && sel?.kind === "wall" && (
            <div className="space-y-2 text-sm">
              <p className="font-medium text-ink">{sel.inputs?.name || "Wall"} — {fmtRaw(pathLengthMm(sel.points, calsById.get(sel.calibrationId)))} mm along the plan</p>
              <p className="text-[11px] text-muted">{sel.inputs?.heightMm ? `Height ${fmtMm(sel.inputs.heightMm)} mm.` : "No height yet."} The elevation is derived from plan + entered heights.</p>
              <div className="flex flex-wrap gap-2">
                {onOpenWall && <Btn kind="primary" onClick={() => onOpenWall(sel.id)}>Open elevation</Btn>}
                <Btn kind="danger" onClick={removeSelected} disabled={!canEdit}>Remove wall</Btn>
              </div>
            </div>
          )}

          {mode === "select" && sel?.kind === "member" && (
            <div className="space-y-2 text-sm">
              <p className="font-medium text-ink">Member line</p>
              <MemberPanel lengthMm={pathLengthMm(sel.points, calsById.get(sel.calibrationId))} lengthSource={selMat?.rules?.lengthSource || "projected"} pitchDeg={selMat?.rules?.pitchDeg} purpose={selMat?.spec?.purpose}
                canEdit={canEdit && selMat?.id === material?.id} onPitch={setPitch} />
              {selStatus}
              <Btn kind="danger" onClick={removeSelected} disabled={!canEdit}>Remove</Btn>
            </div>
          )}

          {mode === "select" && sel?.kind === "distribution" && (() => {
            const info = ticksBy.get(sel.id);
            const tick = selTick ? info?.ticks.find((t) => t.stationId === selTick && !t.preview) : null;
            const tnoun = memberNoun(info?.mat || selMat, 1);
            const live = (info?.ticks || []).filter((t) => !t.preview && !t.removed);
            const count = live.length ? live.length + live.reduce((a, t) => a + (t.duplicates || 0), 0) : null;
            const tm = info?.mat || selMat;
            if (tick) {
              const ov = (sel.inputs?.overrides || []).find((o) => o.station === tick.stationId) || null;
              return (
                <TickPanel tick={tick} override={ov} noun={tnoun} canEdit={canEdit} stock={stockForStation(selResult, tick.stationId)}
                  onRun={() => setSelTick(null)} runLabel={`Whole run${count != null ? ` — ${count} ${memberNoun(tm, count)}` : ""}: spacing, ends, offsets`}
                  onRemove={() => overridePatch(sel, tick.stationId, { removed: true })}
                  onRestore={() => overridePatch(sel, tick.stationId, { removed: false })}
                  onDuplicate={() => overridePatch(sel, tick.stationId, { duplicate: (ov?.duplicate || 0) + 1 })}
                  onRemoveCopy={() => overridePatch(sel, tick.stationId, { duplicate: Math.max(0, (ov?.duplicate || 0) - 1) })}
                  onLength={(n) => overridePatch(sel, tick.stationId, { lengthMm: n })}
                  onClearLength={() => overridePatch(sel, tick.stationId, { lengthMm: null })} />
              );
            }
            return (
              <div className="space-y-2">
                <DistributionPanel lengthMm={pathLengthMm(sel.points, calsById.get(sel.calibrationId))} count={count} noun={memberNoun(tm)} centresMm={tm?.rules?.centresMm ?? 600}
                  inputs={sel.inputs} spacing={tm?.rules?.spacing} canEdit={canEdit} staleCount={info?.stale || 0} onInputs={(patch) => setDistInputs(sel, patch)}
                  onSpacing={tm ? (v) => setRule(tm, { spacing: v }) : null}
                  onClearStale={() => setDistInputs(sel, { overrides: (sel.inputs?.overrides || []).filter((o) => info.ticks.some((t) => t.stationId === o.station)) })}
                  emptyNote={selBlocking.length ? "No members counted — see why below." : null} ticks={info?.ticks || []} thicknessMm={memberThicknessMm(tm)} />
                {selStatus}
                <Btn kind="danger" onClick={removeSelected} disabled={!canEdit}>Remove</Btn>
              </div>
            );
          })()}

          {mode === "pan" && <p className="text-sm text-muted">Drag to move around; pinch or use +/− to zoom. Nothing is placed in Pan.{draft?.points.length ? " Your unfinished drawing is kept — switch back to continue." : ""}</p>}
          {ws.saveError && <Banner tone={ws.status === "unsynced" ? "warn" : "error"}
            action={ws.rejected ? <div className="flex gap-1"><Btn onClick={ws.retryRejected}>Try again</Btn><Btn kind="ghost" onClick={ws.discardRejected}>Discard</Btn></div> : null}>{ws.rejected ? `Not saved: ${ws.saveError}` : ws.saveError}</Banner>}
        </div>
      </Sheet>
    </FocusedWindow>
  );
}

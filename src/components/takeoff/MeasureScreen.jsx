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
//   Line (cladding-type walls, HUB 022)  the panel shows the material and an editable Wall height together (it starts
//                  at the last height used). Tap the start and each corner, then Finish or double-tap the last point.
//                  The height in force at each tap belongs to the walls drawn after it: changing it mid-run never
//                  changes earlier points or walls, and a straight wall splits where the height changes. Every new wall
//                  gets that height and the material in ONE save, with a runId + seq (tap order). Finish stays on the
//                  plan and shows one run card ("Run 1 · 4 walls · 2,700") while that finish is the last step; its Undo
//                  takes the whole run off in one step (↶ puts it back). While tracing, the material name is a label.
//   + Window / + Door (HUB 022 step 2, in the Line panel and on the run card)  set the size in the panel (a window:
//                  Height + Sill, starting at the last window; a door: Height only, it sits on the floor), then tap the
//                  two ends of the opening on the plan. The taps snap to the nearest traced wall of THIS material and
//                  become an opening in that wall, saved exactly as the elevation saves one (W1, D1 …; offset from the
//                  wall start and width in real mm to the nearest 10). Taps past a wall end or round a corner are cut
//                  back to the wall; more than a finger's slip cut off (or a window taller than its wall) is noted on
//                  the opening's card until the next one. A tap on no traced wall saves nothing. Stays on for the
//                  next one; ↶ and the card's Undo take the last one off (a first end tapped comes off first).
//                  Openings are drawn on the plan; changes to one are made on the wall's elevation.
//   Rectangle / Area (HUB 023, beside Line)  draw a wall straight onto a scaled elevation: Rectangle takes two opposite
//                  corners (four square corners); Area takes each corner, then Finish, a double-tap on the last corner
//                  or a tap on the first. Both save ONE outline wall (inputs.kind "polygon") on the material in use,
//                  so the engine lays real sheets over it (sizes, laps, offcuts). The panel reads the m² as you go.
//                  Outlines are drawn closed; Select picks one by any side (the closing side too) and drags its
//                  corners, one at a time; its openings stay where they are on the page. On an outline,
//                  + Window / + Door take two opposite corners of the opening (no sizes to type; a door sits on the
//                  floor). On a page with no scale they ask for one first, then come back here.
//   Review walls (wall-by-wall step 5, on the run card, the Line / Rectangle / Area panels and the window and door
//                  panel once this material has walls)  opens its first wall in run order; each wall page steps
//                  wall to wall from there, and the last one goes on to the order. Select → Open elevation opens a
//                  wall's page with the same wall-to-wall buttons (under the wall's own cladding: TakeoffApp).
//   Page           the chip (when there is another page or plan) opens the page picker; choosing a page comes straight
//                  back here. The takeoff's main plan page stays as it is, nothing is saved, and an unfinished drawing
//                  waits on its own page (kept on this device) until you come back to it.
//   Wall (timber studs / plates / noggins)  tap along the wall run on the floor plan → one wall measurement (role
//                  "wall") per straight leg, named "Wall N", N+1 … → the first one's elevation (a corner is never
//                  unfolded into one flat wall).
//   Count          enter the FINISHED length first, then tap each occurrence (unchanged; no double-tap here).
//   Select         tap anything to adjust it (drag handles + magnifier). A finished run: drag/insert/remove
//                  points, move splits along the run / to a corner / by station; splits a geometry edit made
//                  invalid are flagged with Recalculate — never moved silently. A wall: a Height box that changes
//                  that wall only; dragging a corner shared with another wall moves both (one Undo).
//   Pan            every drag navigates; nothing is placed.
// highlightIds (schedule "Show on plan"): those measurements open selected + highlighted and the plan frames them;
// any that live on another page / plan (or have no plan position) are named in the sheet instead.
// The plan keeps its zoom per plan page (PdfViewport viewKey): another material, a wall elevation and back re-open
// at the same spot — only the first open (or Fit) fits the page. Two fingers always navigate. Points must stay inside the scaled region. Measuring is blocked on a replaced plan
// (existing measurements stay visible for review). Every valid edit applies at once; Undo/Redo cover all of them.
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pointsWithinCalibration, latestPageCalibrations as pageCalibrations, CALIBRATION_STATUS, PROBLEM_TEXT, WALL_FRAMING_RULES } from "../../../shared/takeoff/index.js";
import { addSplit, appendVertex, computeFlashingPath, finishPath, moveSplit, moveSplitToCorner, resolvePathTap, splitAtLimit } from "../../../shared/takeoff/engine/flashingPath.js";
import { repeatedPositions } from "../../../shared/takeoff/engine/timber.js";
import { newId, orderedId } from "../../lib/takeoffApi.js";
import PdfViewport from "./PdfViewport.jsx";
import { DOUBLE_TAP_MS, DOUBLE_TAP_SLOP_PX } from "./gestures.js";
import { PointHandlesLayer } from "./PointHandles.jsx";
import { partial } from "./changeset.js";
import { Banner, Btn, FocusedWindow, NumberField, SaveChip, Sheet } from "./ui.jsx";
import { fmtM2, fmtMm, fmtRaw } from "./format.js";
import { COLORS, LINE_TOOLS, OPENING_TOOLS, PATH_TOOLS, SHAPE_TOOLS, distributionInputs, draftKey, familyOf, isFlashingMaterial, isOutline, isWallsItem, lastOpeningSizes, lastWallHeight, lineStartHeight, lineWallInputs, loadDraft, materialRecord, memberNoun, memberThicknessMm, nextOpeningLabel, nextWallInputs, openingRecord, outlineWallInputs, runIdOf, runLabel, saveDraft, sheetSummaryText, stockForStation, toolsFor, upgradeDraft, wallFramingText, wallFramingTotals, wallPartsToFix, wallRuns, wallsNotCounted, wallSheetIssue, wallSheetSummary, wallTagOn, withOverride } from "./measure/tools.js";
import { HIT_PX, OPENING_SLOP_MIN_MM, OPENING_SLOP_PX, anchorsFor, closedRing, distToPolyline, keepOpeningsInPlace, labelBox, legMidpoints, nearestWall, openingAboveWall, openingOnWall, openingOutsideOutline, outlineAreaM2, outlineAt, outlineFrame, outlineOpening, outlineProblem, pathLengthMm, planOpening, rectCorners, runLegs, safePointAt, screenDirectionAt, sharedCorners, snapToMmGrid, splitsInsideRun, stationNear, straightLegs } from "./measure/geometry.js";
import { FlashingPathShape, OpeningMark, OutlineOpeningMark, PolylineShape, TimberLineShape } from "./measure/Overlays.jsx";
import { PathExplain, PathResult, SplitList, StatusRow } from "./measure/PathPanel.jsx";
import { DistributionPanel, MemberPanel, TickPanel, TimberResult } from "./measure/TimberPanel.jsx";
import { keepFieldInView, useKeyboardInset } from "./measure/useKeyboardInset.js";


const UNASSIGNED = "__unassigned";   // show / hide list: lines with no material
const HIDE_ALL = "__all";            // the earlier single "Hide lines" switch, still honoured when stored
const finiteMm = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
const SHEET_TITLE = { run: "Measure runs", count: "Count pieces", wall: "Trace walls", line: "Line", rect: "Rectangle", area: "Area", member: "Member line", distribution: "Distribution run", pan: "Move around" };
/** An outline needs this many corners at most (the server keeps 200 points per wall). */
const MAX_OUTLINE_POINTS = 200;
const MAX_WALL_MM = 100000;
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
/** "W1", "W1 and D1", "W1, W2 and D1". */
const listNames = (names) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

export default function MeasureScreen({ ws, doc, document: planDoc, pageIndex, displayRotation, materialId, onChangeMaterial, onScale, onPage, onClose, onOpenWall, onReviewWalls = null, onDetails = null, highlightIds = null, initialTool = null }) {
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
    // a cladding drawing kept by an older build (Wall tool) carries on as a Line run (HUB 022)
    const d = upgradeDraft(loadDraft(key), tools.map((t) => t.k), lastWallHeight(view.measurements));
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

  // Line (HUB 022): the Wall height in force — starts at the unfinished run's height, else the last wall's. Handlers
  // read it through a ref so a tap straight after typing (the field commits on blur) uses the new height.
  // (undefined = the drawing says nothing; null = the box was cleared on purpose, and stays empty after a reload)
  // HUB 028: a Walls item starts at the last height of its OWN walls (the stud cut length), empty the first time
  const draftHeight = (d) => (d?.tool !== "line" ? undefined : d.heightMm !== undefined ? d.heightMm : d.heights?.length ? d.heights[d.heights.length - 1] : undefined);
  const startHeight = (d) => { const h = draftHeight(d); return h !== undefined ? h : lineStartHeight(view.measurements, view.contributions, material); };
  const [lineH, setLineHState] = useState(() => startHeight(draft));
  const lineHRef = useRef(lineH);
  // … and switching to (or from) a Walls item here starts the box again that way, once its own drawing is read
  const [lineFor, setLineFor] = useState(() => ({ id: material?.id ?? null, walls: isWallsItem(material) }));
  if (lineFor.id !== (material?.id ?? null) && draftState.key === dKey) {
    setLineFor({ id: material?.id ?? null, walls: isWallsItem(material) });
    if (lineFor.walls || isWallsItem(material)) { const h = startHeight(draft); lineHRef.current = h; setLineHState(h); }
  }
  function setLineH(n) {
    lineHRef.current = n;
    setLineHState(n);
    const d = draftRef.current;
    if (d?.tool === "line") { // kept with the unfinished run on this device (not an edit: nothing to undo)
      const nd = { ...d, heightMm: n };
      draftRef.current = nd;
      setDraftState((st) => ({ ...st, draft: nd }));
      setDraftStored(saveDraft(dKey, nd));
    }
  }

  // schedule "Show on plan": the measurements to highlight (cleared by the next tap on the plan / tool change)
  const hlKey = (highlightIds || []).join(",");
  const onThisPage = (id) => view.measurements.some((m) => m.id === id && !m.archived && m.documentId === planDoc?.id && m.pageIndex === pageIndex && m.points?.length);
  const [hl, setHl] = useState(() => ({ key: hlKey, ids: hlKey ? highlightIds : [] }));
  // back from scaling the page or choosing another one, the tool in use carries on (HUB 023) — unless a drawing
  // kept on this page belongs to another tool
  const [modeSel, setModeSel] = useState(() => (hlKey ? "select" : draftState.draft?.points?.length ? draftState.draft.tool : initialTool || draftState.draft?.tool || null));
  const mode = tools.some((t) => t.k === modeSel) ? modeSel : tools[0].k;
  const [countLen, setCountLenState] = useState(null);
  const [activeCount, setActiveCountState] = useState(null); // measurement id
  // Count reads these through a ref: a length typed and not yet confirmed is committed by the next plan tap (onTap
  // blurs the field first), and that same tap must count at the new length
  const countRef = useRef({ len: null, active: null });
  const setCountLen = (n) => { countRef.current = { ...countRef.current, len: n }; setCountLenState(n); };
  const setActiveCount = (id) => { countRef.current = { ...countRef.current, active: id }; setActiveCountState(id); };
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

  // + Window / + Door (HUB 022 step 2): which opening is being placed (on THIS material's walls, in Line only), the
  // sizes in its boxes (they start at the last window / door in the takeoff, then keep what was typed here) and the
  // first end tapped. Handlers read sizes + first end through refs: a tap straight after typing commits the field first.
  const [openMode, setOpenMode] = useState(null);            // { matId, kind: "window" | "door" }
  const openKind = OPENING_TOOLS.has(mode) && canEdit && openMode && openMode.matId === material?.id ? openMode.kind : null;
  const [openSizes, setOpenSizesState] = useState(null);     // { window: { heightMm, sillMm }, door: { heightMm } }
  const openSizesRef = useRef(null);
  const sizesNow = () => openSizesRef.current || lastOpeningSizes(view.measurements);
  function setOpenSize(kind, patch) {
    const cur = sizesNow();
    const next = { ...cur, [kind]: { ...cur[kind], ...patch } };
    openSizesRef.current = next;
    setOpenSizesState(next);
  }
  const [openStartState, setOpenStartState] = useState(null); // { matId, kind, p, at, wallId }
  const openStartRef = useRef(null);
  const setOpenStart = (v) => { openStartRef.current = v; setOpenStartState(v); };
  const pendingStart = () => { const s = openStartRef.current; return s && openKind && s.kind === openKind && s.matId === material?.id ? s : null; };
  const openStart = openStartState && openKind && openStartState.kind === openKind && openStartState.matId === material?.id ? openStartState : null;
  const [lastOpening, setLastOpening] = useState(null);       // { id, op, note } of the opening just placed (note: what was cut)

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
  const pointsOf = useCallback((m) => {
    if (!dragPreview?.measurementId) return m.points;
    // a dragged corner moves every wall that shares it (HUB 022)
    const at = dragPreview.measurementId === m.id ? dragPreview.index : dragPreview.linked?.find((l) => l.id === m.id)?.index;
    return at == null ? m.points : m.points.map((q, i) => (i === at ? dragPreview.p : q));
  }, [dragPreview]);

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
    // a drawing coming back (Undo of a Finish, Redo of a corner) ends + Window / + Door: its Finish / Discard show again
    if (d?.points?.length) { setOpenMode(null); setOpenStart(null); }
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
    // the first end of a window or door comes off before any saved change (nothing was saved for it)
    if (pendingStart()) { setOpenStart(null); setMsg(null); return; }
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
    // Undo restores the drawing exactly as it was, even one of another tool that this tap replaces
    const before = draftRef.current ?? null;
    const base = d || { tool: mode, points: [], splitsMm: [], measurementId: null };
    const next = { ...base, tool: mode, points };
    if (mode === "line") {
      // the height in force at THIS tap belongs to the new point — earlier points keep theirs (HUB 022)
      const hs = (base.heights || []).slice(0, base.points.length);
      while (hs.length < base.points.length) hs.push(null);
      next.heights = [...hs, ...points.slice(base.points.length).map(() => lineHRef.current ?? null)];
      next.heightMm = lineHRef.current ?? null;
    }
    if (draftIsFlashTool() && points.length >= 2) {
      // from two points the run is a measurement with no material assignment: it survives reloads/devices but is
      // in no order until it is finished
      const mid = base.measurementId || newId();
      record({ redo: partial({ measurements: [polylineRecord(mid, points, base.splitsMm)] }), undo: draftRecordUndo(base) || partial({ archive: { measurements: [mid] } }),
        draftBefore: before, draftAfter: { ...next, measurementId: mid } });
    } else record({ draftBefore: before, draftAfter: next });
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

  // ── Rectangle and Area on an elevation (HUB 023) ────────────────────────────────────────────────────────────
  /** A corner on the nearest 10 mm (so a wall tapped at 3,000.3 is 3,000), unless that would leave the scaled region. */
  const cornerAt = (p, c = cal) => { const q = snapToMmGrid(c, p); return c && pointsWithinCalibration(c, [q]) ? q : p; };
  /** Save ONE outline wall on the material in use (one Undo; the drawing comes back with it). */
  function saveOutline(points, d) {
    const prob = outlineProblem(points, cal);
    if (prob) {
      warn(prob === "wall_self_intersecting" ? "The outline crosses itself. Tap the corners in order round the wall (Undo takes the last one off)."
        : "That outline has no area. Tap the corners round the wall.");
      return false;
    }
    const mid = orderedId(), cid = newId();   // walls saved together come back in the order drawn (step 5)
    const meas = { id: mid, kind: "wall", documentId: planDoc.id, pageIndex, calibrationId: cal.id, points, inputs: outlineWallInputs(view.measurements) };
    const op = { redo: partial({ measurements: [meas], contributions: [{ id: cid, measurementId: mid, jobMaterialId: material.id, role: "wall" }] }),
      undo: partial({ archive: { measurements: [mid], contributions: [cid] } }), draftBefore: d, draftAfter: null };
    record(op);
    // the shape card (and its Undo) belongs to THIS step, like the run card
    setLastDone({ id: mid, outline: true, op });
    setMsg(null);
    return true;
  }
  /** Rectangle / Area on a page with no scale: the panel says so with Scale page beside it (no third copy per tap). */
  const shapeNeedsScale = () => !cal && !stale && canMeasure;
  /** Rectangle: one corner, then the opposite corner (which saves it). */
  function rectTap(tap, sp) {
    if (shapeNeedsScale()) return;
    const err = guardDraw(tap);
    if (err) { warn(err); return; }
    const p = cornerAt(tap);
    const cur = draftRef.current;
    const d = cur?.tool === "rect" && cur.points.length ? cur : null;
    if (!d) { record({ draftBefore: cur ?? null, draftAfter: { tool: "rect", points: [p], splitsMm: [], measurementId: null } }); setMsg(null); setLastDone(null); return; }
    const corners = rectCorners(d.points[0], p);
    const s = corners.map(toScreen);
    if (Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y) < 20 || Math.hypot(s[2].x - s[1].x, s[2].y - s[1].y) < 20) {
      warn("Tap the opposite corner further away. Zoom in for a small wall.");
      return;
    }
    // a double-tap on the opposite corner (the Line / Area habit): its second tap must not start a new Rectangle there
    if (saveOutline(corners, d)) lastFinishTap.current = { t: performance.now(), sp };
  }
  /** Area: each corner in turn; a tap on the first corner (from the third) closes it and saves. */
  function areaTap(tap, sp) {
    if (shapeNeedsScale()) return;
    const err = guardDraw(tap);
    if (err) { warn(err); return; }
    const p = cornerAt(tap);
    const cur = draftRef.current;
    const d = cur?.tool === "area" ? cur : null;
    const pts = d?.points || [];
    if (pts.length) {
      const near = (q) => { const v = toScreen(q); return Math.hypot(v.x - sp.x, v.y - sp.y) <= HIT_PX; };
      if (pts.length >= 3 && near(pts[0])) { if (finishDraft()) lastFinishTap.current = { t: performance.now(), sp }; return; }
      if (pts.length === 2 && near(pts[0])) { warn("An area needs at least three corners. Tap the next corner."); return; }
      if (near(pts[pts.length - 1])) { setMsg({ tone: "info", text: "That's the last corner. Double-tap it, or press Finish. Zoom in for a short side." }); return; }
    }
    if (pts.length >= MAX_OUTLINE_POINTS) { warn(`An outline can have ${MAX_OUTLINE_POINTS} corners at most. Press Finish, then draw the rest as another wall.`); return; }
    let res;
    try { res = appendVertex(pts, p, cal); } catch (e) { warn(e.message); return; }
    if (!res.added) return;
    setMsg(null);
    record({ draftBefore: cur ?? null, draftAfter: { tool: "area", points: res.points, splitsMm: [], measurementId: null } });
    setLastDone(null);
  }

  /** Finish the drawing (double-tap / Finish / leaving the screen): a flashing run as ONE measurement; walls and
   *  timber/aluminium runs as one measurement per straight leg. */
  function finishDraft({ navigate = true } = {}) {
    const d = draftRef.current;
    if (d?.tool === "area") {
      // HUB 023: the corners so far make the outline (the closing side goes back to the first corner)
      const pre = guardDraw(null);
      if (pre) { warn(pre); return false; }
      let r;
      try { r = finishPath(d.points, cal); } catch (e) { warn(e.message); return false; }
      if (r.points.length < 3) { warn("Tap at least three corners, then press Finish (or double-tap the last one)."); return false; }
      return saveOutline(r.points, d);
    }
    if (!d || !PATH_TOOLS.has(d.tool)) return false;
    const pre = guardDraw(null);
    if (pre) { warn(pre); return false; }
    let r;
    try { r = finishPath(d.points, cal); } catch (e) { warn(e.message); return false; }
    if (!r.finished) { warn("Tap at least two points, then double-tap the last one (or press Finish)."); return false; }
    if (d.tool === "line") {
      // HUB 022: one wall per straight leg, each with the height in force when it was traced, the material, its run
      // and its place in the run — all in ONE save (one Undo). Stays on the plan: the run card says what was made.
      const legs = runLegs(r.points, (d.heights || []).slice(0, r.points.length));
      const runId = orderedId();   // time-ordered: runs saved together stay Run 1, Run 2 … (step 5)
      const meas = [], cons = [];
      let known = view.measurements;
      legs.forEach((leg, i) => {
        const mid = orderedId();
        const inputs = lineWallInputs(known, { heightMm: leg.heightMm, runId, seq: i + 1 });
        known = [...known, { kind: "wall", inputs }];
        meas.push({ id: mid, kind: "wall", documentId: planDoc.id, pageIndex, calibrationId: cal.id, points: [leg.a, leg.b], inputs });
        cons.push({ id: newId(), measurementId: mid, jobMaterialId: material.id, role: "wall" });
      });
      const op = { redo: partial({ measurements: meas, contributions: cons }),
        undo: partial({ archive: { measurements: meas.map((m) => m.id), contributions: cons.map((c) => c.id) } }), draftBefore: d, draftAfter: null };
      record(op);
      // the run card (and its Undo) belongs to THIS step: it shows only while finishing the run is the last change
      setLastDone({ id: meas[0].id, runId, op });
      setMsg(null);
      return true;
    }
    if (!(flashing && d.tool === "run")) {
      // walls / timber / aluminium: a plan corner is a JOINT, not a fold — every straight leg is its own wall or
      // piece (a 4 × 3 m trim path is four 3 m pieces, never one 12 m member; an L-shaped wall run is two
      // elevations, never one flat one wrapped round the corner). One change, one Undo.
      const legs = straightLegs(r.points);
      const meas = [], cons = [];
      let known = view.measurements;
      for (const [a, b] of legs) {
        const mid = orderedId();
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

  /** The run card's Undo: takes the whole run off in one step (no drawing left behind); Undo (↶) puts it back. */
  function undoRun(run) {
    const op = lastDone?.op;
    const h = histRef.current;
    if (!op || h.past[h.past.length - 1] !== op) return;
    record({ redo: op.undo, undo: op.redo });
    setLastDone(null);
    setMsg({ tone: "ok", text: `Run ${run.n} taken off (${run.walls.length} wall${run.walls.length === 1 ? "" : "s"}). Undo puts it back.` });
  }

  /** The shape card's Undo: takes the wall off in one step (no drawing left behind); Undo (↶) puts it back. */
  function undoShape(m) {
    const op = lastDone?.op;
    const h = histRef.current;
    if (!op || h.past[h.past.length - 1] !== op) return;
    record({ redo: op.undo, undo: op.redo });
    setLastDone(null);
    setMsg({ tone: "ok", text: `${m.inputs?.name || "Wall"} taken off. Undo puts it back.` });
  }

  // ── + Window / + Door on the plan (HUB 022 step 2) ──────────────────────────────────────────────────────────
  const openingsByWall = useMemo(() => {
    const map = new Map();
    for (const m of view.measurements) if (m.kind === "opening" && m.parentId && !m.archived) map.set(m.parentId, [...(map.get(m.parentId) || []), m]);
    return map;
  }, [view.measurements]);
  const wallName = (id) => measNow(id)?.inputs?.name || "the wall";
  /** The straight walls traced for THIS material on this page, with their own scale (`shown`: on the plan now). */
  function materialWalls() {
    return pageMeasurements.filter((m) => m.kind === "wall" && m.points?.length === 2 && m.inputs?.kind !== "polygon"
      && (contribsOf.get(m.id) || []).some((c) => c.jobMaterialId === material?.id))
      .map((m) => ({ id: m.id, points: m.points, cal: calsById.get(m.calibrationId) || null, shown: isShown(m) })).filter((w) => w.cal);
  }
  /** The outline walls (Rectangle / Area, HUB 023) of THIS material on this page, with their own scale. */
  function materialOutlines() {
    return pageMeasurements.filter((m) => isOutline(m) && (contribsOf.get(m.id) || []).some((c) => c.jobMaterialId === material?.id))
      .map((m) => ({ id: m.id, points: m.points, cal: calsById.get(m.calibrationId) || null, shown: isShown(m) })).filter((w) => w.cal);
  }
  const tracedFirst = () => `Trace the ${material.name} walls first, then add their windows and doors.`;
  const wallsHidden = () => `Your ${material.name} walls are hidden on this plan. Tap Show all, then add the windows and doors.`;
  const pxPerUnit = () => { const a = toScreen({ x: 0, y: 0 }), b = toScreen({ x: 1, y: 0 }); return Math.hypot(b.x - a.x, b.y - a.y) || 1; };
  function guardOpening() {
    if (!canMeasure) return stale ? "This plan has been replaced. Add openings on the current revision." : !material ? "Choose a material first." : "You can't change this takeoff.";
    // each traced wall carries its own scale, so any scaled region on the page will do (no region needs choosing)
    if (!cals.length) return "Scale this page before adding windows and doors.";
    return null;
  }
  function startOpening(kind) {
    setMsg(null);
    const pre = guardOpening();
    if (pre) { warn(pre); return; }
    const all = [...materialWalls(), ...materialOutlines()];
    if (!all.length) { warn(tracedFirst()); return; }
    if (!all.some((w) => w.shown)) { warn(wallsHidden()); return; }
    if (!openSizesRef.current) { openSizesRef.current = lastOpeningSizes(view.measurements); setOpenSizesState(openSizesRef.current); }
    setOpenMode({ matId: material.id, kind });
    setOpenStart(null);
  }
  function stopOpening() { setOpenMode(null); setOpenStart(null); setMsg(null); }
  /** A tap while placing a window or door: the first end, then the other end (which saves the opening). */
  function openingTap(p, sp) {
    const kind = openKind;
    const pre = guardOpening();
    if (pre) { warn(pre); return; }
    const size = sizesNow()[kind] || {};
    const what = kind === "door" ? "door" : "window";
    const all = materialWalls();
    const walls = all.filter((w) => w.shown);
    const outlines = materialOutlines(), outShown = outlines.filter((w) => w.shown);
    if (!all.length && !outlines.length) { warn(tracedFirst()); return; }
    if (!walls.length && !outShown.length) { warn(wallsHidden()); return; }
    // HUB 023: on an outline wall, two opposite corners of the opening (its size comes from the taps)
    const st0 = pendingStart();
    const onOutline = st0 ? (st0.outline ? outlines.find((w) => w.id === st0.wallId) : null) : outlineAt(outShown, p, sp, toScreen);
    if (onOutline || st0?.outline) { outlineOpeningTap(kind, p, sp, st0, onOutline); return; }
    if (!walls.length) { warn(`Tap one corner of the ${what} on a ${material.name} wall you drew, then the opposite corner.`); return; }
    if (!(size.heightMm > 0)) { warn(`Type the ${what} height first.`); return; }
    if (kind === "window" && !(size.sillMm >= 0)) { warn("Type the sill height first."); return; }
    const opts = { pxPerUnit: pxPerUnit() };
    // a tap on one of this material's walls that is hidden on the plan: say so, rather than "no wall here"
    const offWall = () => (nearestWall(all.filter((w) => !w.shown), p, opts) ? `That wall is hidden on this plan. Tap Show all to add windows and doors to it.`
      : `No ${material.name} wall here. Tap on a wall you traced.`);
    const st = pendingStart();
    if (!st) {
      const n = nearestWall(walls, p, opts);
      if (!n) { warn(offWall()); return; }
      const w = walls.find((x) => x.id === n.wall.id);
      const at = safePointAt(w.points, w.cal, n.station.stationMm) || p;   // shown on the wall line
      setOpenStart({ matId: material.id, kind, p, at, wallId: w.id });
      setMsg(null);
      return;
    }
    const s0 = toScreen(st.p);
    if (Math.hypot(sp.x - s0.x, sp.y - s0.y) < 20) { warn("Tap the other end further away. Zoom in for a narrow opening."); return; }
    const r = planOpening(walls, st.p, p, opts);
    if (!r.ok) {
      // the first end stays: tap the other end again (or Undo to start over)
      warn(r.reason === "different_walls" ? `Both ends go on the same wall. Tap the other end on ${wallName(r.wallId)}.`
        : r.reason === "across_join" ? `${wallName(r.wallId)} ends here and ${wallName(r.otherWallId)} carries on. Tap the part on each wall separately.`
          : r.reason === "off_wall" ? `That's past the end of ${wallName(r.wallId)}. Tap both ends on the wall.`
            : r.reason === "other_end_off_wall" && nearestWall(all.filter((w) => !w.shown), p, opts) ? "That wall is hidden on this plan. Tap the other end on the same wall."
              : "Tap the other end on the wall too.");
      return;
    }
    const wall = measNow(r.wallId);
    const label = nextOpeningLabel((openingsByWall.get(wall.id) || []).map((o) => o.inputs?.label), kind);
    const inputs = { xMm: r.xMm, sillMm: kind === "door" ? 0 : size.sillMm, widthMm: r.widthMm, heightMm: size.heightMm, label, type: kind };
    const rec = openingRecord(newId(), wall.id, inputs);
    const op = { redo: partial({ measurements: [rec] }), undo: partial({ archive: { measurements: [rec.id] } }) };
    record(op);
    setOpenStart(null);
    lastFinishTap.current = { t: performance.now(), sp };   // a double-tap on the other end starts no next one
    // what was cut, kept on the opening's card until the next one is placed (the next tap must not wipe it)
    const name = wallName(wall.id), tapped = fmtMm(r.tappedWidthMm);
    const notes = [];
    if (r.clipped === "corner") notes.push(`${label} went round the corner, so it's on ${name} only (you tapped ${tapped}). Undo, or change it on ${name}'s elevation.`);
    if (r.clipped === "end") notes.push(`${label} ran past the end of ${name}, so it's cut back to the wall (you tapped ${tapped}). Undo, or change it on ${name}'s elevation.`);
    if (r.clipped === "join") {
      const next = measNow(r.nextWallId);
      const hChange = finiteMm(wall.inputs?.heightMm) && finiteMm(next?.inputs?.heightMm) && wall.inputs.heightMm !== next.inputs.heightMm;
      notes.push(`${label} runs on into ${wallName(r.nextWallId)}${hChange ? " (the wall height changes there)" : ""}, so it's on ${name} only (you tapped ${tapped}). Tap the rest on ${wallName(r.nextWallId)}, or Undo.`);
    }
    if (openingAboveWall(wall.inputs, pathLengthMm(wall.points, calsById.get(wall.calibrationId)), inputs)) {
      const h = (wall.inputs?.kind || "rect") === "rect" && finiteMm(wall.inputs?.heightMm) ? ` (${fmtMm(wall.inputs.heightMm)} high)` : "";
      notes.push(`${label} is taller than ${name}${h}, so only the part on the wall comes off. Check the height and sill, or Undo.`);
    }
    setLastOpening({ id: rec.id, op, note: notes.join(" ") || null });
  }

  /** + Window / + Door on an outline (HUB 023): one corner of the opening, then the opposite corner (which saves it). */
  function outlineOpeningTap(kind, p, sp, st, w) {
    if (!st) {
      setOpenStart({ matId: material.id, kind, p, at: p, wallId: w.id, outline: true });
      setMsg(null);
      return;
    }
    const wall = measNow(st.wallId);
    if (!w || !wall) { setOpenStart(null); warn("That wall has gone. Tap one corner of the opening on a wall."); return; }
    const s0 = toScreen(st.p);
    if (Math.hypot(sp.x - s0.x, sp.y - s0.y) < 20) { warn("Tap the opposite corner further away. Zoom in for a small opening."); return; }
    // the opposite corner goes on the same wall too (inside it, or a finger's slip past its edge)
    if (!outlineAt([w], p, sp, toScreen)) { warn(`Tap the opposite corner on ${wallName(wall.id)} too.`); return; }
    const frame = outlineFrame(wall.points, w.cal);
    const a = toScreen(frame.toPdf({ x: 0, y: 0 })), b = toScreen(frame.toPdf({ x: 1000, y: 0 }));
    const pxPerMm = Math.hypot(b.x - a.x, b.y - a.y) / 1000;
    const slopMm = pxPerMm > 0 ? Math.max(OPENING_SLOP_MIN_MM, OPENING_SLOP_PX / pxPerMm) : OPENING_SLOP_MIN_MM;
    const r = outlineOpening(frame, st.p, p, kind, { slopMm });
    if (!r.ok) { warn("Tap the opposite corner further away. Zoom in for a small opening."); return; }
    const label = nextOpeningLabel((openingsByWall.get(wall.id) || []).map((o) => o.inputs?.label), kind);
    const inputs = { xMm: r.xMm, sillMm: r.sillMm, widthMm: r.widthMm, heightMm: r.heightMm, label, type: kind };
    const rec = openingRecord(newId(), wall.id, inputs);
    const op = { redo: partial({ measurements: [rec] }), undo: partial({ archive: { measurements: [rec.id] } }) };
    record(op);
    setOpenStart(null);
    lastFinishTap.current = { t: performance.now(), sp };   // a double-tap on the second corner starts no next one
    const name = wallName(wall.id);
    const notes = [];
    if (r.clipped) notes.push(`${label} ran past the edge of ${name}, so it's cut back to the wall (you tapped ${fmtMm(r.tappedWidthMm)} × ${fmtMm(r.tappedHeightMm)}). Undo, or change it on ${name}'s elevation.`);
    else if (openingOutsideOutline(frame.polygon, inputs)) notes.push(`${label} goes outside ${name}'s outline, so only the part on the wall comes off. Undo, or change it on ${name}'s elevation.`);
    setLastOpening({ id: rec.id, op, note: notes.join(" ") || null });
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
    if (d.tool === "area" && d.points.length >= 3 && canMeasure && cal) return finishDraft({ navigate });
    return false;
  }

  function switchMode(k) {
    setMsg(null); setActiveSplit(null); setSelTick(null); setHandleSel(null); setDragPreview(null);
    setOpenMode(null); setOpenStart(null);   // any tool (Line too) ends placing windows and doors
    if (hl.ids.length && k !== "select") setHl((h) => ({ ...h, ids: [] }));
    const d = draftRef.current;
    if (d && d.tool !== k && (PATH_TOOLS.has(k) || LINE_TOOLS.has(k) || SHAPE_TOOLS.has(k))) {
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

  /**
   * HUB 023: a corner of an outline wall (Rectangle or Area alike: only that corner moves). The wall's windows and
   * doors stay where they are on the page (they are measured again from the new corners), all in one Undo. A move
   * that would leave one off the wall isn't made.
   */
  function moveOutlineCorner(m, i, drag, commit) {
    const c = calsById.get(m.calibrationId);
    const p = cornerAt(drag, c);   // on the nearest 10 mm, like the corners it was drawn with
    const pts = m.points.map((q, k) => (k === i ? p : q));
    if (c && !pointsWithinCalibration(c, pts)) { warn("That point is outside the scaled region."); return; }
    if (!commit) { setDragPreview({ measurementId: m.id, index: i, p, linked: [] }); return; }
    setDragPreview(null);
    const prob = outlineProblem(pts, c);
    if (prob) { warn(prob === "wall_self_intersecting" ? "That would make the outline cross itself. Drag the corner somewhere else." : "That would leave the wall with no area."); return; }
    const kids = openingsByWall.get(m.id) || [];
    const kept = keepOpeningsInPlace(m.points, pts, c, kids);
    if (kept.lost.length) { warn(`That would leave ${listNames(kept.lost)} off the wall. Move ${kept.lost.length === 1 ? "it" : "them"} on the elevation first.`); return; }
    const moved = kept.openings.filter((o) => { const b = kids.find((k) => k.id === o.id); return JSON.stringify(b?.inputs) !== JSON.stringify(o.inputs); });
    const before = kids.filter((k) => moved.some((o) => o.id === k.id));
    record({ redo: partial({ measurements: [{ ...m, points: pts }, ...moved] }), undo: partial({ measurements: [m, ...before] }) });
    // what the move did to its openings, in plain words (cut back, now partly off the outline, a door that grew)
    const notes = [];
    const one = (list, a, b) => (list.length === 1 ? a : b);
    if (kept.cut.length) notes.push(`${listNames(kept.cut)} now ${one(kept.cut, "runs", "run")} past the edge of the wall, so ${one(kept.cut, "it's", "they're")} cut back to fit.`);
    if (kept.outside.length) notes.push(`${listNames(kept.outside)} now ${one(kept.outside, "goes", "go")} outside the wall's outline, so only the part on the wall comes off.`);
    for (const d of kept.resized) notes.push(`${d.name} is now ${fmtMm(d.heightMm)} high, so it still reaches the floor.`);
    const touched = [...new Set([...kept.cut, ...kept.outside, ...kept.resized.map((d) => d.name)])];
    if (notes.length) setMsg({ tone: "info", text: `${notes.join(" ")} Undo puts the corner and ${listNames(touched)} back.` });
  }

  function moveEndpoint(handleId, p, commit) {
    const [mid, idx] = handleId.split(":");
    const m = measNow(mid);
    if (!m) return;
    if (isOutline(m)) { moveOutlineCorner(m, Number(idx), p, commit); return; }
    // HUB 022: a corner shared by walls traced together moves on every one of them
    const linked = sharedCorners(pageMeasurements, m, Number(idx)).filter((l) => measNow(l.id));
    for (const x of [m, ...linked.map((l) => measNow(l.id))]) {
      if (!x.calibrationId || x.kind === "count") continue;
      const c = calsById.get(x.calibrationId);
      if (c && !pointsWithinCalibration(c, [p])) { warn("That point is outside the scaled region."); return; }
    }
    if (!commit) { setDragPreview({ measurementId: mid, index: Number(idx), p, linked }); return; }
    setDragPreview(null);
    const pts = m.points.map((q, i) => (i === Number(idx) ? p : q));
    const r = m.kind === "polyline" ? geometryEdit(m, pts) : { next: { ...m, points: pts } };
    if (r.error) { warn(r.error); return; }
    const others = linked.map((l) => { const o = measNow(l.id); return { before: o, next: { ...o, points: o.points.map((q, i) => (i === l.index ? p : q)) } }; });
    // one edit for every wall at that corner, so one Undo puts the corner back
    record({ redo: partial({ measurements: [r.next, ...others.map((o) => o.next)] }), undo: partial({ measurements: [m, ...others.map((o) => o.before)] }) });
    if (others.length) setMsg({ tone: "ok", text: `Corner moved on ${others.length + 1} walls. Undo puts it back.` });
  }
  /** Select → Height on a wall: that wall only (HUB 022). */
  function setWallHeight(m, n) {
    record({ redo: partial({ measurements: [{ ...m, inputs: { ...(m.inputs || {}), heightMm: n } }] }), undo: partial({ measurements: [m] }) });
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
      // an outline wall (HUB 023) is closed: its closing side picks it too
      const pts = (isOutline(m) ? closedRing(m.points) : m.points || []).map(toScreen);
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
    const { len: countLen, active: activeCount } = countRef.current;
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
    // a number still being typed (Line's Wall height, Select's Wall height, a count length …) counts from this tap:
    // the plan's pointerdown never takes focus, so leave the field here and it commits to what it belongs to before
    // the tap changes the selection or the drawing (and the keyboard drops)
    if (document.activeElement?.tagName === "INPUT") document.activeElement.blur();
    // the tap that trails a double-tap finish (tap the end, then double-tap it = three taps) is part of the same
    // gesture burst — it must not start a phantom new run at the finished end (13: no phantom points)
    const lf = lastFinishTap.current;
    lastFinishTap.current = null;
    if (lf && performance.now() - lf.t < BURST_MS && Math.hypot(lf.sp.x - sp.x, lf.sp.y - sp.y) <= DOUBLE_TAP_SLOP_PX + 2 && (PATH_TOOLS.has(mode) || LINE_TOOLS.has(mode) || SHAPE_TOOLS.has(mode))) return;
    setMsg(null);
    if (hl.ids.length) setHl((h) => ({ ...h, ids: [] }));
    if (mode === "select") { selectTap(sp); return; }
    if (openKind) { openingTap(p, sp); return; }
    if (PATH_TOOLS.has(mode)) { pathTap(p, sp); return; }
    if (LINE_TOOLS.has(mode)) { lineTap(p, sp); return; }
    if (mode === "rect") { rectTap(p, sp); return; }
    if (mode === "area") { areaTap(p, sp); return; }
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
    ? pointsOf(sel).map((p, i) => ({ id: `${sel.id}:${i}`, p, label: `${sel.kind === "count" ? "Count mark" : isOutline(sel) ? "Corner" : "Point"} ${i + 1}` })) : [];
  const splitHandlesFor = (path) => (path?.layout?.splits || []).map((s, i) => (s.x != null ? { id: `split:${i}`, p: { x: s.x, y: s.y }, variant: "split", label: `Split ${i + 1} handle` } : null)).filter(Boolean);
  const selSplitHandles = mode === "select" && canEdit && selPath ? splitHandlesFor(selPath) : [];
  const draftSplitHandles = mode === "run" && canEdit && draftPath ? splitHandlesFor(draftPath) : [];
  const orphans = pageMeasurements.filter((m) => m.kind === "polyline" && !(contribsOf.get(m.id) || []).length && m.id !== draft?.measurementId);
  const runCount = pageMeasurements.filter((m) => (m.kind === "run" || m.kind === "polyline") && (contribsOf.get(m.id) || []).length).length;
  const noun = memberNoun(material);
  const results = material && familyOf(material) ? ws.computed?.materialResults?.[material.id] || null : null;
  // HUB 028 Walls: the parts' needs are counted on the Line panel ("Details: n to fix ›") and listed on the Walls card
  const wallsItem = isWallsItem(material);
  const blocking = (results?.problems || []).filter((p) => p.blocking !== false && !(wallsItem && p.code === "material_incomplete" && p.part));
  // a wall the calculation blocked is named on the line ("· Wall 1 not counted"), its reason straight under it
  const wallsText = wallsItem ? wallFramingText(wallFramingTotals(results), material.name, wallsNotCounted(results, view.measurements, view.contributions, material.id)) : "";
  const wallsToFix = wallsItem ? wallPartsToFix(results) : 0;
  const draftLen = draft && cal && draft.points.length >= 2 ? pathLengthMm(draft.points, cal) : null;
  const draftLegs = draft && !draftIsFlash ? (draft.tool === "line" ? runLegs(draft.points, draft.heights) : straightLegs(draft.points)).length : 0; // walls / timber / aluminium pieces
  const runs = useMemo(() => wallRuns(view.measurements), [view.measurements]);
  const drawTool = PATH_TOOLS.has(mode) || LINE_TOOLS.has(mode) || SHAPE_TOOLS.has(mode);
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
  const changeMaterial = () => { settleDraft({ navigate: false }); setOpenMode(null); setOpenStart(null); onChangeMaterial?.(); };
  // wall-by-wall step 5: once this material has walls, Review walls opens its first wall in run order (wall to wall from there)
  const reviewable = !!onReviewWalls && !!material && view.measurements.some((m) => m.kind === "wall" && !m.archived && (contribsOf.get(m.id) || []).some((c) => c.jobMaterialId === material.id));
  const reviewNow = () => { settleDraft({ navigate: false }); setOpenMode(null); setOpenStart(null); onReviewWalls?.(); };
  const reviewButton = reviewable ? <Btn kind="primary" onClick={reviewNow} data-review-walls="">Review walls</Btn> : null;
  // HUB 028: Details › opens the Walls item's card (its parts); Close comes back here
  const openDetails = () => { settleDraft({ navigate: false }); setOpenMode(null); setOpenStart(null); onDetails?.(material); };
  // HUB 023: another page to measure on (the takeoff's main plan page stays); this tool carries on there
  // An unfinished drawing waits on its own page (it is kept on this device) and comes back with it; only a device
  // that can't keep it finishes it first, as leaving does, so nothing tapped is lost.
  const changePage = () => { if (!draftStored) settleDraft({ navigate: false }); setOpenMode(null); setOpenStart(null); onPage?.(mode); };
  const scalePage = () => onScale?.(mode);

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
    if (isOutline(m)) {
      // HUB 023: an outline wall, closed, with its area; its windows and doors where they are on the elevation
      const wc = calsById.get(m.calibrationId);
      const area = outlineAreaM2(pts, wc);
      const shape = <PolylineShape key={m.id} measurementId={m.id} kind="wall" points={pts} toScreen={toScr} color={COLORS.wall} selected={isSel} closed areaM2={area}
        label={`${m.inputs?.name || "Wall"}${area != null ? ` · ${fmtM2(area)} m²` : ""}`} />;
      const ops = openingsByWall.get(m.id) || [];
      // drawn from the SAVED corners: while a corner is dragged they stay put (as they do once it is saved)
      const frame = ops.length && wc ? outlineFrame(m.points, wc) : null;
      if (!frame) return shape;
      return (
        <g key={m.id}>
          {shape}
          {ops.map((o) => {
            const x = o.inputs || {};
            if (![x.xMm, x.sillMm, x.widthMm, x.heightMm].every(Number.isFinite)) return null;
            const corners = [[x.xMm, x.sillMm], [x.xMm + x.widthMm, x.sillMm], [x.xMm + x.widthMm, x.sillMm + x.heightMm], [x.xMm, x.sillMm + x.heightMm]]
              .map(([lx, ly]) => toScr(frame.toPdf({ x: lx, y: ly })));
            return <OutlineOpeningMark key={o.id} id={o.id} wallId={m.id} type={x.type || "window"} label={x.label} corners={corners} xMm={x.xMm} widthMm={x.widthMm} sillMm={x.sillMm} heightMm={x.heightMm} />;
          })}
        </g>
      );
    }
    if (m.kind === "wall" && pts.length >= 2) {
      const wc = calsById.get(m.calibrationId);
      const len = pathLengthMm(pts, wc);
      const wallLabel = `${m.inputs?.name || "Wall"}${len ? ` · ${fmtMm(Math.round(len))}` : ""}`;
      const shape = <PolylineShape key={m.id} measurementId={m.id} kind="wall" points={pts} toScreen={toScr} color={COLORS.wall} selected={isSel} label={wallLabel} />;
      // its windows and doors (HUB 022 step 2), where they are along the wall from its start, labelled clear of its name
      const ops = pts.length === 2 && m.inputs?.kind !== "polygon" ? openingsByWall.get(m.id) || [] : [];
      if (!ops.length || !wc) return shape;
      const e0 = toScr(pts[0]), e1 = toScr(pts[1]);
      const nameBox = labelBox((e0.x + e1.x) / 2, (e0.y + e1.y) / 2 - 9, wallLabel, 12);
      return (
        <g key={m.id}>
          {shape}
          {ops.map((o) => {
            const x = o.inputs || {};
            const on = openingOnWall(pts, wc, x.xMm, x.widthMm);
            return on ? <OpeningMark key={o.id} id={o.id} wallId={m.id} type={x.type || "window"} label={x.label} a={toScr(on.a)} b={toScr(on.b)}
              xMm={x.xMm} widthMm={x.widthMm} sillMm={x.sillMm} heightMm={x.heightMm} avoid={nameBox} /> : null;
          })}
        </g>
      );
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
    const color = draft.tool === "wall" || draft.tool === "line" || SHAPE_TOOLS.has(draft.tool) ? COLORS.wall : draft.tool === "member" ? COLORS.member : draft.tool === "distribution" ? COLORS.distribution : COLORS.flashing;
    if (draft.points.length === 1) {
      const s = toScr(draft.points[0]);
      return <circle data-path-draft="" data-points={1} cx={s.x} cy={s.y} r={7} fill="#fff" stroke={color} strokeWidth={3} />;
    }
    if (draftIsFlash) {
      return <FlashingPathShape measurementId={draft.measurementId} points={draft.points} path={draftPath} cal={cal} toScreen={toScr} unfinished draft activeSplit={activeSplit} />;
    }
    if (draft.tool === "area") {
      // HUB 023: the outline so far, with its closing side shown faintly and the area it would have
      const area = draft.points.length >= 3 ? outlineAreaM2(draft.points, cal) : null;
      return <PolylineShape kind="wall" points={draft.points} toScreen={toScr} color={COLORS.wall} dashed draft closing areaM2={area} label={area != null ? `${fmtM2(area)} m²` : ""} />;
    }
    const len = cal ? pathLengthMm(draft.points, cal) : null;
    return <PolylineShape kind={draft.tool === "wall" || draft.tool === "line" ? "wall" : "polyline"} points={draft.points} toScreen={toScr} color={color} dashed draft label={len ? fmtMm(Math.round(len)) : ""} />;
  };

  // HUB 028: on a Walls item "Details ›" opens its card, so the status fold is "Status" there
  const statusLine = results && <StatusRow status={results.status} label={wallsItem ? "Status" : undefined} />;
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
        <Btn kind="ghost" className="min-w-[44px] px-2" onClick={undo} disabled={!hist.past.length && !openStart} aria-label="Undo">↶</Btn>
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
          {/* one group that wraps as a whole: on a phone it is the second row, and the material name shortens
              (it is in the title too) rather than pushing Page / Takeoffs / Fit onto a third row */}
          <div className="ml-auto flex min-w-0 max-w-full items-center gap-1" data-toolbar-row="">
            <button type="button" onClick={changeMaterial} className="min-h-[44px] min-w-0 max-w-[24rem] truncate rounded-lg border border-hairline px-2 text-xs text-ink">{material ? `Material: ${material.name}` : "Choose material"}</button>
            {onPage && <Btn kind="ghost" className="min-w-[44px] shrink-0" onClick={changePage} aria-label={`Page ${pageIndex + 1}: measure on another page`} data-page-chip="">Page {pageIndex + 1} ▾</Btn>}
            <Btn kind="ghost" className="min-w-[44px] shrink-0" onClick={() => setLayersOpen((v) => !v)} aria-expanded={layersOpen} aria-haspopup="true"
              aria-label="Show or hide takeoffs on the plan" data-layers-button="">Takeoffs{hiddenHere.length ? ` (${hiddenHere.length} hidden)` : ""} ▾</Btn>
            <Btn kind="ghost" className="min-w-[44px] shrink-0" onClick={() => vpRef.current?.fit()} aria-label="Fit page">Fit</Btn>
          </div>
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
        {!cal && !stale && drawTool && !SHAPE_TOOLS.has(mode) && <div className="px-2 pt-2"><Banner tone="info" action={onScale && <Btn kind="primary" onClick={scalePage}>Scale page</Btn>}>This page has no scale yet. {flashing ? "You can still count pieces." : "Scale it before measuring."}</Banner></div>}
        {cal && cal.status !== CALIBRATION_STATUS.READY && <div className="px-2 pt-2"><Banner tone="warn" action={onScale && <Btn onClick={scalePage}>Re-scale</Btn>}>The scale on this page {cal.status === "needs_review" ? "failed its check" : "hasn't been checked"} — runs are shown but can&apos;t be ordered until it is re-scaled.</Banner></div>}
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
          onDoubleTap={(PATH_TOOLS.has(mode) || mode === "area") && canMeasure && !openKind ? onDoubleTap : undefined}
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
              {openStart && (() => { const s = toScr(openStart.at); const color = openStart.kind === "door" ? COLORS.door : COLORS.window; return (
                <circle data-opening-start={openStart.wallId} cx={s.x} cy={s.y} r={7} fill="#fff" stroke={color} strokeWidth={3} />
              ); })()}
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
      <Sheet title={mode === "select" ? (sel ? "Selected" : "Select") : openKind ? `${openKind === "door" ? "Door" : "Window"} · ${material?.name || ""}` : SHEET_TITLE[mode] || "Measure"} initialFocus={false} className="portrait:max-lg:!max-h-[42vh]">
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

          {OPENING_TOOLS.has(mode) && openKind && (() => {
            // HUB 022 step 2: + Window / + Door — the size here, then the two ends on the plan. HUB 023: on a wall drawn
            // with Rectangle / Area, two opposite corners of the opening instead (no sizes to type)
            const win = openKind === "window";
            const what = win ? "window" : "door";
            const s = (openSizes || sizesNow())[openKind] || {};
            const lo = lastOpening && hist.past[hist.past.length - 1] === lastOpening.op ? measNow(lastOpening.id) : null;
            const lx = lo?.inputs || {};
            const loOutline = lo ? isOutline(measNow(lo.parentId)) : false;
            const straight = materialWalls().some((w) => w.shown), drawn = materialOutlines().some((w) => w.shown);
            const noHeight = !(s.heightMm > 0), noSill = win && !(s.sillMm >= 0);
            const needSize = straight && (noHeight || noSill);
            const hint = openStart ? (openStart.outline ? "Now tap the opposite corner." : "Now tap the other end.")
              : !straight ? `Tap one corner of the ${what} on the wall, then the opposite corner.`
                : needSize ? (win ? `Type the ${noHeight && noSill ? "height and sill" : noHeight ? "height" : "sill height"}, then tap one end of the window.` : "Type the door height, then tap one end.")
                  : lo && (lx.type || "window") === openKind ? `Tap both ends of the next ${what}.` : `Tap one end of the ${what} on a wall, then the other end.`;
            return (
              <div className="space-y-2 text-sm" data-opening-panel={openKind}>
                {straight && (
                  <div className="grid grid-cols-2 gap-2">
                    <div data-opening-height=""><NumberField label="Height" value={s.heightMm ?? null} min={1} max={MAX_WALL_MM} optional onCommit={(n) => setOpenSize(openKind, { heightMm: n })} /></div>
                    {win && <div data-opening-sill=""><NumberField label="Sill height" value={s.sillMm ?? null} min={0} max={MAX_WALL_MM} optional onCommit={(n) => setOpenSize("window", { sillMm: n })} /></div>}
                  </div>
                )}
                <p className={needSize ? "text-amber-800" : "text-muted"} data-opening-hint="">{hint}</p>
                {straight && drawn && !openStart && <p className="text-[11px] text-muted" data-opening-outline-hint="">On a wall you drew on an elevation, tap two opposite corners instead. Nothing to type.</p>}
                {!win && <p className="text-[11px] text-muted">A door sits on the floor.</p>}
                {lo && (
                  <div className="space-y-1 rounded-lg border border-hairline bg-page px-3 py-1" data-last-opening={lo.id}>
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate"><b className="text-ink" data-last-opening-label="">{lx.label} in {wallName(lo.parentId)}</b>
                        <span className="text-muted" data-last-opening-size="">{loOutline ? ` · ${fmtMm(lx.widthMm)} × ${fmtMm(lx.heightMm)}${(lx.type || "window") === "window" ? `, sill ${fmtMm(lx.sillMm)}` : ""}` : ` · ${fmtMm(lx.widthMm)} wide`}</span></p>
                      {/* the same as ↶: a first end tapped comes off first, then this opening */}
                      <Btn onClick={undo} aria-label={openStart ? "Undo this end" : `Undo ${lx.label}`}>Undo</Btn>
                    </div>
                    {lastOpening.note && <p className="text-[11px] text-amber-800" data-last-opening-note="">{lastOpening.note}</p>}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Btn onClick={stopOpening}>{mode === "line" ? "Trace more walls" : "Draw more walls"}</Btn>
                  <Btn kind="ghost" onClick={() => startOpening(win ? "door" : "window")}>{win ? "+ Door" : "+ Window"}</Btn>
                  {reviewButton}
                </div>
              </div>
            );
          })()}

          {mode === "line" && !openKind && (() => {
            // HUB 022: the material and the Wall height together; the height in force applies to the walls traced next
            const run = !draft && lastDone?.runId && hist.past[hist.past.length - 1] === lastDone.op ? runs.get(lastDone.runId) : null;
            const drawing = draft?.points.length > 0;
            // HUB 022 step 2: windows and doors go into the walls once they are traced (on the run card right after a run)
            // wall-by-wall step 5: Review walls beside them once this cladding has walls (the walls are done)
            const openingButtons = !drawing && (canEdit || reviewButton) && (
              <div className="flex flex-wrap gap-2" data-opening-buttons={canEdit ? "" : undefined}>
                {canEdit && <Btn onClick={() => startOpening("window")}>+ Window</Btn>}
                {canEdit && <Btn onClick={() => startOpening("door")}>+ Door</Btn>}
                {reviewButton}
              </div>
            );
            return (
              <div className="space-y-2 text-sm" data-line-panel="">
                <div className="flex items-end gap-3">
                  {/* the material is one per run: while tracing it is plain text, so a thumb reaching for the height
                      never finishes the run by mistake (change it with "Material: …" above) */}
                  {drawing ? (
                    <p className="flex min-h-[44px] min-w-0 flex-1 items-center text-sm font-semibold text-ink" data-line-material-text="">
                      <span className="truncate" data-line-material="">{material?.name}</span></p>
                  ) : (
                    <button type="button" onClick={changeMaterial} aria-label={`${material?.name || ""}: change material`} data-line-material-button=""
                      className="flex min-h-[44px] min-w-0 flex-1 items-center gap-1 rounded-full bg-page px-3 text-left text-sm font-semibold text-primary">
                      <span className="truncate" data-line-material="">{material?.name}</span><span aria-hidden="true">›</span></button>
                  )}
                  <div className="w-40 shrink-0" data-line-height="">
                    <NumberField label="Wall height" value={lineH} min={1} max={MAX_WALL_MM} optional onCommit={setLineH} />
                  </div>
                </div>
                {/* HUB 028 Walls: Stud centres and Double top plate apply to every wall of the item (one change, one Undo).
                    They only change the line after Finish, so they hide while tracing, like the line (Finish stays in view) */}
                {wallsItem && canEdit && !drawing && (
                  <div className="flex items-center gap-3" data-walls-rules="">
                    <div className="min-w-0 flex-1" data-stud-centres="">
                      <NumberField inline label="Stud centres" value={material.rules?.centresMm ?? WALL_FRAMING_RULES.centresMm} min={1} max={MAX_WALL_MM} onCommit={(n) => setRule(material, { centresMm: n })} />
                    </div>
                    <label className="flex min-h-[44px] w-40 shrink-0 items-center gap-2 text-sm font-medium text-ink" data-double-top-plate="">
                      <input type="checkbox" className="h-5 w-5 rounded text-primary" checked={material.rules?.doubleTopPlate === true}
                        onChange={(e) => setRule(material, { doubleTopPlate: e.target.checked })} />
                      Double top plate
                    </label>
                  </div>
                )}
                {/* the Walls line only changes after Finish, so it hides while tracing (Finish stays in view); the parts'
                    needs show on the Walls card, here only how many */}
                {wallsItem && !drawing && (wallsText || onDetails) && (
                  <div className="flex items-center gap-2" data-walls-summary="">
                    <p className="min-w-0 flex-1 text-[12px] leading-snug text-ink" data-walls-line="">{wallsText}</p>
                    {onDetails && <button type="button" onClick={openDetails} data-walls-details=""
                      className="flex min-h-[44px] shrink-0 items-center rounded-full px-2 text-sm font-semibold text-primary">{wallsToFix ? `Details: ${wallsToFix} to fix ›` : "Details ›"}</button>}
                  </div>
                )}
                {/* why a wall isn't counted ("Wall 1: Openings W1 and W2 overlap …"), in view under the line */}
                {wallsItem && !drawing && problemLines}
                {!drawing && !run && <p className="text-muted">Tap the start of the wall, then each corner. Double-tap the last point, or press Finish. To go right round, double-tap the start.</p>}
                {draft?.points.length === 1 && <p className="text-muted">Tap the next corner.</p>}
                {draft?.points.length >= 2 && <p className="text-muted" data-line-progress="">{draftLegs} wall{draftLegs === 1 ? "" : "s"} · {draftLen != null ? `${fmtRaw(draftLen)} mm` : "—"}. Tap the next corner, or double-tap the last point to finish.</p>}
                {drawing && <p className="text-[11px] text-muted">A new height only changes the walls you trace after it.{draft.points.length >= 3 ? " To go right round, double-tap the start." : ""}</p>}
                {lineH == null && <p className="text-[11px] text-amber-800">No height yet. Type it first, or each wall will need one.</p>}
                {drawing && <div className="flex flex-wrap gap-2"><Btn onClick={() => finishDraft()} disabled={draft.points.length < 2}>Finish</Btn><Btn kind="ghost" onClick={discardDraft}>Discard</Btn></div>}
                {run ? (
                  <div className="space-y-1 rounded-lg border border-hairline bg-page px-3 py-1" data-run-card={run.id}>
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1"><b className="text-ink" data-run-label="">{runLabel(run)}</b><span className="block text-[11px] text-muted">Tap the start of the next run, or add the windows and doors.</span></p>
                      <Btn onClick={() => undoRun(run)} aria-label="Undo this run">Undo</Btn>
                    </div>
                    {openingButtons}
                  </div>
                ) : openingButtons}
                {draft && !draftStored && <p className="text-[11px] text-amber-800">This device can&apos;t keep an unfinished run if the app reloads. Finish it before leaving.</p>}
                <p className="text-[11px] text-muted">{pageMeasurements.filter((m) => m.kind === "wall").length} wall(s) on this page.</p>
                {/* a Walls item's problems sit under its line (above), except while tracing */}
                {statusLine}{!(wallsItem && !drawing) && problemLines}
              </div>
            );
          })()}

          {SHAPE_TOOLS.has(mode) && !openKind && (() => {
            // HUB 023: Rectangle / Area straight onto a scaled elevation — one outline wall on this material
            const rect = mode === "rect";
            const drawing = draft?.tool === mode && draft.points.length > 0;
            const shape = !draft && lastDone?.outline && hist.past[hist.past.length - 1] === lastDone.op ? measNow(lastDone.id) : null;
            const n = drawing ? draft.points.length : 0;
            const live = !rect && n >= 3 && cal ? outlineAreaM2(draft.points, cal) : null;
            // + Window / + Door only once there is a wall of this material here to put them in
            const canOpen = canEdit && cal && (materialOutlines().length > 0 || materialWalls().length > 0);
            const openingButtons = !drawing && (canOpen || reviewButton) && (
              <div className="flex flex-wrap gap-2" data-opening-buttons={canOpen ? "" : undefined}>
                {canOpen && <Btn onClick={() => startOpening("window")}>+ Window</Btn>}
                {canOpen && <Btn onClick={() => startOpening("door")}>+ Door</Btn>}
                {reviewButton}
              </div>
            );
            const shapeInfo = shape ? (() => {
              const sc = calsById.get(shape.calibrationId);
              const f = outlineFrame(shape.points, sc);
              const area = outlineAreaM2(shape.points, sc);
              return { area, size: f ? `${fmtMm(Math.round(f.widthMm))} wide × ${fmtMm(Math.round(f.heightMm))} high` : "", sheets: sheetSummaryText(wallSheetSummary(results, shape.id)),
                issue: wallSheetIssue(results, shape.id, wallTagOn(view.measurements, view.contributions, material?.id, shape.id)) };
            })() : null;
            return (
              <div className="space-y-2 text-sm" data-shape-panel={mode}>
                {drawing ? (
                  <p className="flex min-h-[44px] min-w-0 items-center text-sm font-semibold text-ink"><span className="truncate" data-line-material="">{material?.name}</span></p>
                ) : (
                  <button type="button" onClick={changeMaterial} aria-label={`${material?.name || ""}: change material`} data-line-material-button=""
                    className="flex min-h-[44px] w-full min-w-0 items-center gap-1 rounded-full bg-page px-3 text-left text-sm font-semibold text-primary">
                    <span className="truncate" data-line-material="">{material?.name}</span><span aria-hidden="true">›</span></button>
                )}
                {!cal && !stale ? (
                  <div className="space-y-2" data-shape-needs-scale="">
                    <p className="text-amber-800" data-shape-hint="">This page has no scale yet. Scale it, then you come straight back here to draw.</p>
                    {onScale && <Btn kind="primary" onClick={scalePage}>Scale page</Btn>}
                  </div>
                )
                  : <p className="text-muted" data-shape-hint="">{rect
                    ? (drawing ? "Now tap the opposite corner." : "Tap one corner of the wall, then the opposite corner.")
                    : !drawing ? "Tap each corner of the wall in turn. Double-tap the last one, or press Finish."
                      : n < 3 ? "Tap the next corner." : "Tap the next corner. Double-tap the last one, press Finish, or tap the first corner."}</p>}
                {!rect && n >= 3 && <p className="font-semibold text-ink" data-area-progress="">{n} corners · {live != null ? `${fmtM2(live)} m²` : "—"}</p>}
                {drawing && (
                  <div className="flex flex-wrap gap-2">
                    {!rect && <Btn onClick={() => finishDraft()} disabled={n < 3}>Finish</Btn>}
                    <Btn kind="ghost" onClick={discardDraft}>Discard</Btn>
                  </div>
                )}
                {shape ? (
                  <div className="space-y-1 rounded-lg border border-hairline bg-page px-3 py-1" data-shape-card={shape.id}>
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1"><b className="text-ink" data-shape-label="">{shape.inputs?.name || "Wall"} · {shapeInfo.area != null ? `${fmtM2(shapeInfo.area)} m²` : "—"}</b>
                        <span className="block text-[11px] text-muted" data-shape-size="">{shapeInfo.size}</span>
                        {shapeInfo.sheets && <span className="block text-[11px] text-ink" data-shape-sheets="">{shapeInfo.sheets}</span>}
                        {!shapeInfo.sheets && shapeInfo.issue && <span className="block text-[11px] font-medium text-amber-800" data-shape-issue="">{shapeInfo.issue}</span>}</p>
                      <Btn onClick={() => undoShape(shape)} aria-label="Undo this wall">Undo</Btn>
                    </div>
                    {shapeInfo.issue && onOpenWall && <Btn kind="primary" onClick={() => onOpenWall(shape.id)}>Open elevation</Btn>}
                    {openingButtons}
                  </div>
                ) : openingButtons}
                {draft && !draftStored && <p className="text-[11px] text-amber-800">This device can&apos;t keep an unfinished drawing if the app reloads. Finish it before leaving.</p>}
                <p className="text-[11px] text-muted">{pageMeasurements.filter((m) => m.kind === "wall").length} wall(s) on this page. Select drags a corner.</p>
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

          {mode === "select" && sel && isOutline(sel) && (() => {
            // HUB 023: an outline wall (Rectangle / Area): its area as its corners are dragged, and its sheets
            const sc = calsById.get(sel.calibrationId);
            const pts = pointsOf(sel);
            const f = outlineFrame(pts, sc);
            const area = outlineAreaM2(pts, sc);
            const ops = openingsByWall.get(sel.id) || [];
            const selRes = selMat ? ws.computed?.materialResults?.[selMat.id] : null;
            const sheets = sheetSummaryText(wallSheetSummary(selRes, sel.id));
            const issue = wallSheetIssue(selRes, sel.id, wallTagOn(view.measurements, view.contributions, selMat?.id, sel.id));
            return (
              <div className="space-y-2 text-sm" data-selected-outline="">
                <p className="font-medium text-ink"><span data-outline-name="">{sel.inputs?.name || "Wall"}</span> · <span data-outline-area="">{area != null ? `${fmtM2(area)} m²` : "—"}</span>{selMat ? ` · ${selMat.name}` : ""}</p>
                {f && <p className="text-[11px] text-muted" data-outline-size="">{fmtMm(Math.round(f.widthMm))} wide × {fmtMm(Math.round(f.heightMm))} high · {pts.length} corners</p>}
                {sheets && <p className="text-[11px] text-ink" data-outline-sheets="">{sheets}</p>}
                {!sheets && issue && <p className="text-[11px] font-medium text-amber-800" data-outline-issue="">{issue}</p>}
                {ops.length > 0 && <p className="text-[11px] text-muted" data-wall-openings="">{ops.map((o) => o.inputs?.label || "Opening").join(", ")} in this wall. They stay put when a corner moves. Change {ops.length === 1 ? "it" : "them"} on the elevation.</p>}
                {canEdit && <p className="text-[11px] text-muted">Drag a corner to change the wall. The sheets update straight away.</p>}
                {selStatus}
                <div className="flex flex-wrap gap-2">
                  {onOpenWall && <Btn kind="primary" onClick={() => onOpenWall(sel.id)}>Open elevation</Btn>}
                  <Btn kind="danger" onClick={removeSelected} disabled={!canEdit}>Remove wall</Btn>
                </div>
              </div>
            );
          })()}

          {mode === "select" && sel?.kind === "wall" && !isOutline(sel) && (() => {
            const run = runs.get(runIdOf(sel));
            const rect = (sel.inputs?.kind || "rect") === "rect";
            const ops = openingsByWall.get(sel.id) || [];
            return (
            <div className="space-y-2 text-sm" data-selected-wall="">
              <p className="font-medium text-ink">{sel.inputs?.name || "Wall"} — {fmtRaw(pathLengthMm(sel.points, calsById.get(sel.calibrationId)))} mm along the plan</p>
              {run && run.walls.length > 1 && <p className="text-[11px] text-muted">{runLabel(run)} · wall {run.walls.findIndex((w) => w.id === sel.id) + 1} of {run.walls.length}</p>}
              {ops.length > 0 && <p className="text-[11px] text-muted" data-wall-openings="">{ops.map((o) => o.inputs?.label || "Opening").join(", ")} in this wall. Change {ops.length === 1 ? "it" : "them"} on the elevation.</p>}
              {/* HUB 022: the height of THIS wall only — the rest of its run keeps theirs */}
              {rect && canEdit ? (
                <div className="w-48" data-wall-height=""><NumberField key={sel.id} label="Wall height" value={sel.inputs?.heightMm ?? null} min={1} max={MAX_WALL_MM} onCommit={(n) => setWallHeight(sel, n)} help="This wall only." /></div>
              ) : (
                <p className="text-[11px] text-muted">{rect ? (sel.inputs?.heightMm ? `Height ${fmtMm(sel.inputs.heightMm)} mm.` : "No height yet.") : "Change this wall's heights on its elevation."} The elevation is derived from plan + entered heights.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {onOpenWall && <Btn kind="primary" onClick={() => onOpenWall(sel.id)}>Open elevation</Btn>}
                <Btn kind="danger" onClick={removeSelected} disabled={!canEdit}>Remove wall</Btn>
              </div>
            </div>
            );
          })()}

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

// =============================================================================
// WallsScreen — walls + openings + generated elevation for wall-based materials (TC-R04 02 §3–4, 04 C0–C6,
// 05 B1/B5, 03 T4).
//   List    the walls this material uses, which materials use each, the material's three statuses and problems,
//           "Wall by numbers" / "Trace on plan". A run traced with Line (HUB 022) is ONE compact item that opens into
//           its walls in tap order; walls on other materials fold under "Other walls". Use / Remove are inside each
//           wall (Materials on this wall), not on the rows.
//   Editor  numeric wall fields (authoritative, auto-applied), openings (tap the elevation then type sizes;
//           drag the selected opening — snaps to 10 mm, the numbers follow), the generated elevation of THIS
//           wall only with ONE view at a time: Cladding | Supports | Accessories. Tap a cell / board / line
//           for its stock selection and cut size. Gross / openings / net m², per-wall quantities and blocking
//           problems shown in place. Nothing claims installation verification the engine didn't give.
//           Setout datum is per WALL (rules.datumByWall); "every wall" is an explicit choice with a job-wide preview.
//           Sheet joint rows: height + gap + detail or a draft (rules.jointRowsDraft) — the Setup card's rule.
//           Stud walls: each opening's framing detail (opening.inputs.detail) is entered in its sheet (a Walls item's too,
//           HUB 028). A Walls item's wall page leads with this wall's framing line and its own notes (an LVL long
//           plate, the lintels note for its openings); studs beside an opening are drawn like the other full studs; its
//           parts' needs are one banner with one Setup; an opening with no detail reads "… aren't counted", never
//           "base studs only" or "opening framing incomplete".
//   Review  (wall-by-wall step 5) Review walls opens the material's first wall in run order; every wall page has
//           ‹ Previous wall / Next wall › at the bottom (n of N) and, on the last wall, Review order ›. Tapping a
//           sheet, batten or joint shows its details (no stepping through parts any more). Each wall page leads with
//           its cladding quantities in one short line. Status chips, provenance and notes (the drawing's explanations
//           too) fold under More on the wall screens and rows; anything that blocks the order stays out with its fix,
//           including a problem with the material itself (missing product sizes …) with its Setup button. The
//           buttons step aside while an opening's or a joint row's sheet is open.
// Every valid edit applies at once (ws.edit) and is undoable; invalid input stays in its field as a draft.
//
// Props contract (fixed):
//   ws          useTakeoffWorkspace() result (view, computed, edit, capabilities, status)
//   materialId  the job material being set up (cladding / batten / accessory / timber studs, plates, noggins, Walls)
//   wallId      wall measurement open in the editor (null = list)
//   onOpenWall(id|null), onTrace() (open the plan to trace a wall; null when no plan), onSetup(material), onClose(),
//   onReviewOrder() (the last wall's Review order ›: the Timber and cladding order), orderReady (false = nothing to
//   order yet: Review order › is greyed, as the overview's Review & export order)
// =============================================================================
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { BLUE_LEAF_SHEET_JOINT, describeFamilySpec, pointToMm, polylineLengthMm } from "../../../shared/takeoff/index.js";
import { buildWall, wallAreas } from "../../../shared/takeoff/engine/wall.js";
import { FOLLOWER_TEXT, followerRule } from "../../../shared/takeoff/engine/followers.js";
import { normaliseFamilySpec } from "../../../shared/takeoff/engine/families.js";
import { newId, orderedId } from "../../lib/takeoffApi.js";
import { partial } from "./changeset.js";
import { Banner, Btn, FocusedWindow, NumberField, SaveChip, Sheet, TextField } from "./ui.jsx";
import { fmtMm } from "./format.js";
import WallElevation from "./WallElevation.jsx";
import { isWallsItem, nextOpeningLabel, openingRecord, reviewWalls, runIdOf, runLabel, toolsFor, wallCladdingText, wallCladdingTotals, wallFramingNotes, wallFramingText, wallFramingTotals, wallListItems,
  wallPartsNeedText, wallRuns } from "./measure/tools.js";

const MAX_MM = 100000;
const SNAP_MM = 10;
const CLADDING_METHODS = new Set(["sheet_layout", "course_layout", "panel_grid", "aac_panel_layout", "area_to_linear"]);
const SHAPES = [["rect", "Rectangle"], ["rake", "Sloping top"], ["gable", "Gable"]];
const SHAPE_LABEL = { rect: "Rectangle", rake: "Sloping top", gable: "Gable", polygon: "Traced outline" };
const VIEWS = [["cladding", "Cladding"], ["supports", "Supports"], ["accessories", "Accessories"]];
const OPENING_TYPES = [["window", "Window"], ["door", "Door"], ["other", "Other"]];
const END_LABEL = { cut: "cut end", joint: "joint", "joint-factory": "joint (factory end)" };

const STATUS_TEXT = {
  quantity: { incomplete: ["Incomplete", "warn"], estimate: ["Estimate only", "info"], calculated: ["Calculated", "ok"], reviewed: ["Reviewed", "ok"], nothing: ["Nothing measured yet", "muted"] },
  installation: {
    unspecified: ["Not specified", "muted"], "source-pending": ["Source pending — not verified", "warn"], "supported-by-selected-rule": ["Reviewed rule selected", "ok"],
    "project-detail-supplied": ["Project detail supplied", "ok"], "out-of-scope": ["Out of scope", "muted"],
  },
  procurement: { draft: ["Draft — not ready to order", "warn"], "missing-product": ["Product details missing", "warn"], "unavailable-stock": ["Stock doesn't fit", "error"], stale: ["Out of date", "warn"], ready: ["Ready to order", "ok"] },
};
const TONE = { ok: "bg-emerald-50 text-emerald-800 border-emerald-200", warn: "bg-amber-50 text-amber-900 border-amber-200", error: "bg-red-50 text-red-700 border-red-200", info: "bg-sky-50 text-sky-800 border-sky-200", muted: "bg-slate-50 text-slate-700 border-slate-200" };

const ROLE_LABEL = {
  sheet: "Sheets", panel: "Panels", "aac-panel": "AAC panels", "course-board": "Course boards", "vertical-board": "Vertical boards", "board-lm": "Random-length boards",
  support: "Supports", stud: "Studs", king: "King studs", jack: "Jack studs", trimmer: "Trimmers", lintel: "Lintels", "sill trimmer": "Sill trimmers",
  "head trimmer": "Head trimmers", cripple: "Cripple studs", sill: "Sills", "below-sill": "Below-sill pieces", "above-head": "Above-head pieces", "bottom-plate": "Bottom plate", "top-plate": "Top plate", "top-2-plate": "Second top plate", noggin: "Noggins",
  "horizontal-joint": "Horizontal joint strips", "vertical-joint": "Vertical joint strips", rail: "Rails", "control-joint": "Control joints",
  batten: "Battens", "h-flashing": "H-flashing", "foam-tape": "Foam tape",
  coating: "Coating (net finish area)", basecoat: "Basecoat (net finish area)", "finish-coat": "Finish coat (net finish area)", "fixing-support-to-frame": "Support fixings",
};
const roleLabel = (r) => ROLE_LABEL[r] || (r ? `${r.charAt(0).toUpperCase()}${r.slice(1).replace(/-/g, " ")}` : "Items");
const UNIT_WORD = { sheet: ["sheet", "sheets"], piece: ["piece", "pieces"], bar: ["bar", "bars"], box: ["box", "boxes"], bag: ["bag", "bags"], roll: ["roll", "rolls"], pack: ["pack", "packs"], cartridge: ["cartridge", "cartridges"] };

/** Plain English for the measurement-level (scale / plan) problem codes a traced wall can carry. */
const MEAS_PROBLEM = {
  calibration_missing: "The plan scale this wall was traced on is missing — retrace it.",
  outside_region: "The traced wall goes outside the scaled region of the plan.",
  calibration_superseded: "The plan page was re-scaled after this wall was traced — check the length.",
  calibration_not_ready: "The plan scale hasn't passed its check, so the traced length can't be ordered yet.",
  plan_superseded: "The plan was replaced — retrace this wall on the current revision.",
  measurement_invalid: "The traced wall isn't valid — retrace it.",
};

// ── small helpers ──────────────────────────────────────────────────────────────────────────────────────────
/** Materials that go on the cladding's walls (no walls of their own): their list points to Other walls first. */
const FOLLOWERS = new Set(["batten", "accessory"]);
/** Cladding-type walls are traced with Line (height first, HUB 022); timber walls keep the Wall tool. */
const usesLine = (material) => !!material && toolsFor(material).some((t) => t.k === "line");
const snap = (v) => Math.round(v / SNAP_MM) * SNAP_MM;
const fmtM2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : "—");
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString("en-AU")} ${n === 1 ? one : many}`;
const isTraced = (m) => Array.isArray(m?.points) && m.points.length >= 2;
const wallName = (m) => m?.inputs?.name || m?.label || "Wall";
const mRec = (m) => ({ id: m.id, kind: m.kind, documentId: m.documentId ?? null, pageIndex: m.pageIndex ?? null, calibrationId: m.calibrationId ?? null,
  points: m.points ?? null, parentId: m.parentId ?? null, label: m.label ?? null, inputs: m.inputs ? { ...m.inputs } : null });
const cRec = (c) => ({ id: c.id, measurementId: c.measurementId, jobMaterialId: c.jobMaterialId, role: c.role || "primary" });
const matRec = (m) => ({ id: m.id, name: m.name, methodKey: m.methodKey, methodVersion: m.methodVersion || 1, spec: m.spec, rules: m.rules || {}, profile: m.profile || null,
  fromPresetId: m.fromPresetId || null, fromPresetRevision: m.fromPresetRevision || null });
const dedupe = (list) => { const seen = new Set(); return list.filter((p) => (seen.has(p.message) ? false : (seen.add(p.message), true))); };

/** Opening geometry problems: blocking ones are listed with the wall's problems AND next to the opening. */
const OPENING_GEOMETRY = new Set(["opening_invalid", "opening_duplicate", "opening_outside_wall", "opening_clipped"]);
/** Engine text names openings by id — show the opening's label instead. */
function readableTextFor(view) {
  const labels = view.measurements.filter((m) => m.kind === "opening" && m.inputs?.label).map((m) => [m.id, m.inputs.label]);
  return (text) => {
    let s = String(text ?? "");
    for (const [id, label] of labels) if (s.includes(id)) s = s.split(id).join(label);
    return s;
  };
}
function readableFor(view) {
  const text = readableTextFor(view);
  return (p) => {
    const message = text(p.message);
    return message === p.message ? p : { ...p, message };
  };
}

function scrollParent(el) {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

const isField = (el) => !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

/** Scroll the focused field of `root` (+ its message line, + its group's live result when both fit) above the keyboard. */
function revealFocused(root) {
  const el = document.activeElement;
  if (!root || !isField(el) || !root.contains(el)) return;
  const vv = window.visualViewport;
  const sc = scrollParent(el);
  const top = Math.max(vv ? vv.offsetTop : 0, sc ? sc.getBoundingClientRect().top : 0), bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const f = el.getBoundingClientRect();
  let r = { top: f.top, bottom: f.bottom + 40 }; // the field + its message line
  const res = el.closest("[data-keyboard-group]")?.querySelector("[data-keyboard-result]")?.getBoundingClientRect();
  if (res && res.height) {
    const u = { top: Math.min(f.top, res.top), bottom: Math.max(f.bottom + 8, res.bottom + 8) };
    if (u.bottom - u.top <= bottom - top - 16) r = u;
  }
  const below = r.bottom + 8 - bottom, above = top + 8 - r.top;
  const delta = below > 0 ? below : above > 0 ? -above : 0;
  if (sc && delta) sc.scrollTop += delta;
}

/**
 * Keep the focused numeric field (and its message line) above the on-screen keyboard: while a field inside this
 * container has focus, add the keyboard's height as scroll room and scroll the field up into the visual viewport.
 * A field inside [data-keyboard-group] also keeps that group's [data-keyboard-result] line in view when both fit,
 * so the live result of what is being typed is never under the keyboard either.
 * The scroll runs in a layout effect AFTER the keyboard room is rendered (PH-09): a requestAnimationFrame straight
 * after setPad ran before React rendered the room on WebKit, so the scroll was clamped and the field stayed covered.
 */
function KeyboardSafe({ className, children }) {
  const ref = useRef(null);
  const [pad, setPad] = useState(0);
  const [revealTick, setRevealTick] = useState(0);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    let t = null;
    const reveal = () => {
      const el = document.activeElement;
      const vv = window.visualViewport;
      if (!isField(el) || !root.contains(el)) { setPad(0); return; }
      setPad(vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0);
      setRevealTick((n) => n + 1); // → the layout effect below, once the room is in the DOM
    };
    const soon = () => { clearTimeout(t); t = setTimeout(reveal, 120); };
    const off = () => { clearTimeout(t); t = setTimeout(() => { if (!root.contains(document.activeElement)) setPad(0); }, 150); };
    root.addEventListener("focusin", soon);
    root.addEventListener("focusout", off);
    window.visualViewport?.addEventListener("resize", soon);
    return () => { clearTimeout(t); root.removeEventListener("focusin", soon); root.removeEventListener("focusout", off); window.visualViewport?.removeEventListener("resize", soon); };
  }, []);
  useLayoutEffect(() => {
    if (!revealTick) return undefined;
    revealFocused(ref.current);
    // and once more after paint, for a browser that settles the layout late (a no-op when already in view)
    const raf = requestAnimationFrame(() => revealFocused(ref.current));
    return () => cancelAnimationFrame(raf);
  }, [revealTick]);
  return <div ref={ref} className={className}>{children}{pad > 0 && <div aria-hidden="true" style={{ height: pad }} />}</div>;
}

/** Which heights a wall still needs (the engine reports the same as wall_incomplete). */
function missingHeights(inp = {}) {
  const k = inp.kind || "rect";
  if (k === "rect") return inp.heightMm ? [] : ["heightMm"];
  if (k === "rake") return ["startHeightMm", "endHeightMm"].filter((f) => !inp[f]);
  if (k === "gable") return ["eavesHeightMm", "apexHeightMm", "apexXMm"].filter((f) => inp[f] == null || inp[f] === "");
  return [];
}

/** Where the elevation came from, said the same way as the schedule and the order appendix (02 §3, UX02) — a traced
 *  outline is never called "derived from plan", and nothing here is a surveyed elevation. */
const isTracedOutline = (m) => isTraced(m) && m?.inputs?.kind === "polygon";
const provenanceText = (m) => (isTracedOutline(m) ? "Traced elevation outline" : isTraced(m) ? "Derived from plan + entered heights" : "Entered");

function tracedLengthMm(m, calibrations) {
  if (!isTraced(m)) return null;
  const cal = calibrations.find((c) => c.id === m.calibrationId);
  // a traced OUTLINE's length is its width along the wall, never the length of the line around it
  if (cal && isTracedOutline(m) && m.points.length >= 3) { const xs = m.points.map((p) => pointToMm(cal, m.points[0], p).x); return Math.max(...xs) - Math.min(...xs); }
  if (cal) return polylineLengthMm(cal, m.points);
  return m.inputs?.widthMm ?? null;
}

/** The wall polygon in local mm: the engine's own (from any layout of this wall), else built the same way. */
function wallGeometry(m, calibrations, layouts) {
  const fromLayout = layouts.find((l) => Array.isArray(l?.wall?.polygon) && l.wall.polygon.length >= 3)?.wall;
  if (fromLayout) return { polygon: fromLayout.polygon, message: null };
  const inp = m.inputs || {};
  let widthMm = inp.widthMm, points = inp.polygon;
  if (isTraced(m)) {
    const cal = calibrations.find((c) => c.id === m.calibrationId);
    if (cal && inp.kind === "polygon" && m.points.length >= 3) {
      const q = m.points.map((p) => pointToMm(cal, m.points[0], p));
      const minX = Math.min(...q.map((p) => p.x)), maxY = Math.max(...q.map((p) => p.y));
      points = q.map((p) => ({ x: p.x - minX, y: maxY - p.y }));
    } else if (cal) widthMm = polylineLengthMm(cal, m.points);
  }
  const built = buildWall({ kind: inp.kind || "rect", widthMm, heightMm: inp.heightMm, startHeightMm: inp.startHeightMm, endHeightMm: inp.endHeightMm,
    eavesHeightMm: inp.eavesHeightMm, apexXMm: inp.apexXMm, apexHeightMm: inp.apexHeightMm, points });
  return built.polygon ? { polygon: built.polygon, message: null } : { polygon: null, message: built.problems?.[0]?.message || null };
}

function areasFor(polygon, openings) {
  if (!polygon) return null;
  const w = buildWall({ kind: "polygon", points: polygon });
  if (!w.polygon) return null;
  return wallAreas(w, openings.map((o) => ({ id: o.id, xMm: o.xMm, sillMm: o.sillMm, widthMm: o.widthMm, heightMm: o.heightMm })));
}

/** The walls a material uses (each contribution once, as dispatch.js sees them). */
function materialWalls(view, materialId) {
  return view.contributions.filter((c) => c.jobMaterialId === materialId && !c.archived)
    .map((c) => view.measurements.find((m) => m.id === c.measurementId)).filter((m) => m?.kind === "wall" && !m.archived);
}

/** The readable per-material wall tag the engine names cells/demands/problems with (dispatch.js wallTags). */
function wallTag(view, materialId, wall) {
  const names = materialWalls(view, materialId).map(wallName);
  const n = wallName(wall);
  return names.filter((x) => x === n).length > 1 ? `${n} (${String(wall.id).slice(0, 4)})` : n;
}

function demandsForWall(result, wallId, tag, { ownerOnly = false } = {}) {
  const onWall = (r) => r && (r.measurementId === wallId || r.wallId === wallId || (tag && r.wallId === tag));
  // HUB 016b: a sheet shared across walls names every wall it serves; for counting, it belongs to the wall it is
  // ordered on (its first piece), so the walls add up to the order
  return (result?.demands || []).filter((d) => (ownerOnly && (d.unit === "sheet" || d.kind === "sheet") ? onWall(d.sourceRefs?.[0]) : (d.sourceRefs || []).some(onWall)));
}

/** A wall's bounding box in local mm (null until its size is complete). */
function wallBox(view, wall) {
  const g = wallGeometry(wall, view.calibrations, []);
  if (!g.polygon) return null;
  const xs = g.polygon.map((p) => p.x), ys = g.polygon.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/**
 * Joint rows are a MATERIAL rule (dispatch passes rules.jointRows to every wall). A row that isn't strictly inside a
 * wall leaves that wall without a sheet layout, and the engine's message names no wall — work out which walls.
 * @param {object} rows candidate { atMm: number[], gapMm } (default: the material's own)
 */
function jointRowMisfits(view, material, rows = material?.rules?.jointRows) {
  if (!material || material.methodKey !== "sheet_layout" || !rows || !Array.isArray(rows.atMm) || !rows.atMm.length || !Number.isFinite(rows.gapMm)) return [];
  const lo = Math.min(...rows.atMm), hi = Math.max(...rows.atMm) + rows.gapMm;
  const horizontal = material.spec?.orientation === "horizontal";
  const out = [];
  for (const w of materialWalls(view, material.id)) {
    const b = wallBox(view, w);
    if (!b) continue;
    const [a, z] = horizontal ? [b.x0, b.x1] : [b.y0, b.y1];
    if (!(lo > a + 0.001 && hi < z - 0.001)) out.push({ wall: w, extentMm: z - a });
  }
  return out;
}
const jointRowText = (rows) => `${rows.atMm.map((x) => fmtMm(x)).join(", ")} mm`;
function misfitProblem(material, misfit) {
  return {
    code: "joint_rows_invalid", blocking: true, refs: [{ wallId: misfit.wall.id }],
    message: `${wallName(misfit.wall)}: the joint row at ${jointRowText(material.rules.jointRows)} is set for every wall using ${material.name}, and it isn't inside this wall (${fmtMm(Math.round(misfit.extentMm))} mm${material.spec?.orientation === "horizontal" ? " long" : " high"}) — so this wall has no sheet layout. ${material.spec?.orientation === "horizontal" ? "Move the joint row, or put the longer walls" : "Lower the joint row, or put the taller walls"} on their own material.`,
  };
}

/**
 * Assign one material's problems to its walls: by ref (wall id / tag / measurement id), else by the wall tag that
 * PREFIXES the message — the longest one wins, so "North" never takes "North wall: …". Joint-row problems (no wall
 * named) go to the walls the row doesn't fit. Returns { byWall: Map(wallId → problems), general: problems }.
 */
function attributeProblems(view, material, result) {
  const walls = material ? materialWalls(view, material.id) : [];
  const byWall = new Map(walls.map((w) => [w.id, []]));
  const general = [];
  const keys = walls.map((w) => ({ w, keys: [...new Set([wallTag(view, material.id, w), wallName(w)])] }));
  const misfits = material ? jointRowMisfits(view, material) : [];
  const parentOf = new Map(view.measurements.filter((m) => m.kind === "opening").map((m) => [m.id, m.parentId]));
  for (const p of result?.problems || []) {
    if (p.code === "joint_rows_invalid" && misfits.length) {
      for (const m of misfits) byWall.get(m.wall.id)?.push(misfitProblem(material, m));
      continue;
    }
    // an opening's problem belongs to the wall that owns the opening
    const refHits = keys.filter(({ w, keys: ks }) => (p.refs || []).some((r) => r && (r.wallId === w.id || r.measurementId === w.id || ks.includes(r.wallId)
      || (r.openingId && parentOf.get(r.openingId) === w.id))));
    if (refHits.length) { for (const { w } of refHits) byWall.get(w.id).push(p); continue; }
    const msg = typeof p.message === "string" ? p.message : "";
    let best = 0, hits = [];
    for (const { w, keys: ks } of keys) {
      for (const k of ks) {
        if (!k || !(msg.startsWith(`${k}:`) || msg.startsWith(`${k} `))) continue;
        if (k.length > best) { best = k.length; hits = [w]; } else if (k.length === best && !hits.includes(w)) hits.push(w);
      }
    }
    if (hits.length) for (const w of hits) byWall.get(w.id).push(p);
    else general.push(p);
  }
  for (const [k, v] of byWall) byWall.set(k, dedupe(v));
  return { byWall, general: dedupe(general) };
}

/** demandId → the stock piece it is cut from (the ONE allocator's plan). */
function allocationMap(result) {
  const map = new Map();
  for (const g of result?.allocation?.groups || []) {
    for (const b of g.bars || []) for (const c of b.cuts || []) if (!map.has(c.demandId)) map.set(c.demandId, { stockLengthMm: b.stockLengthMm, source: b.source, offcutLabel: b.offcutLabel || null });
    for (const u of g.unavailable || []) map.set(u.demandId, { unavailable: true, message: u.message || u.reason });
  }
  return map;
}

/** Per-wall quantities for one material: layout stock grouped by what is bought (before spares). */
function wallQuantities(result, wallId, tag) {
  const alloc = allocationMap(result);
  const groups = new Map();
  for (const d of demandsForWall(result, wallId, tag, { ownerOnly: true })) {
    let key, text;
    const id = d.identity || {};
    if (d.follower === "tape") {
      // foam tape is measured here in metres — the rolls are rounded once for the whole job on the schedule
      key = "tape";
      text = roleLabel(d.role);
    } else if (d.unit === "sheet" || d.kind === "sheet") {
      key = `sheet|${d.role}|${id.sku}|${id.stockLengthMm}|${id.stockWidthMm}`;
      const what = [id.name, id.sku ? `SKU ${id.sku}` : null].filter(Boolean).join(" ");
      text = `${roleLabel(d.role)} — ${what ? `${what} ` : ""}${id.stockLengthMm ? `${fmtMm(id.stockLengthMm)}${id.stockWidthMm ? ` × ${fmtMm(id.stockWidthMm)}` : ""} mm` : ""}`.trim();
    } else if (d.kind === "linear" && d.unit !== "lm") {
      const a = alloc.get(d.id);
      const stock = a?.unavailable ? null : a?.stockLengthMm ?? id.stockLengthMm ?? (d.stockPolicy?.kind === "fixed" ? d.stockPolicy.lengthMm : null) ?? null;
      key = `piece|${d.role}|${stock}|${a?.unavailable ? "x" : ""}`;
      text = `${roleLabel(d.role)} — ${a?.unavailable ? "no stock length fits" : stock ? `cut from ${fmtMm(stock)} mm lengths` : "stock not chosen yet"}`;
    } else {
      key = `${d.unit}|${d.role}`;
      text = roleLabel(d.role);
    }
    const g = groups.get(key) || { key, text, unit: d.follower === "tape" ? "tape" : d.unit === "sheet" || d.kind === "sheet" ? "sheet" : d.kind === "linear" && d.unit !== "lm" ? "piece" : d.unit, qty: 0, lenMm: 0, follower: d.follower || null };
    g.qty += d.follower === "tape" ? 0 : d.quantity || 0;
    if (d.follower === "tape") g.lenMm += d.tapeMm || 0;
    else if (d.kind === "linear" && Number.isFinite(d.lengthMm)) g.lenMm += d.lengthMm * (d.quantity || 1);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    let qtyText;
    if (g.unit === "tape") qtyText = `${(g.lenMm / 1000).toFixed(1)} m`;
    else if (g.unit === "lm") qtyText = `${g.qty.toFixed(1)} LM (estimate)`;
    else if (g.unit === "m2") qtyText = `${fmtM2(g.qty)} m²`;
    else if (g.unit === "ml") qtyText = `${Math.round(g.qty).toLocaleString("en-AU")} ml`;
    else if (UNIT_WORD[g.unit]) qtyText = plural(Math.round(g.qty), ...UNIT_WORD[g.unit]);
    else qtyText = `${Math.round(g.qty).toLocaleString("en-AU")}`;
    if (g.unit === "piece" && g.lenMm) qtyText += ` · ${(g.lenMm / 1000).toFixed(2)} m installed`;
    return { key: g.key, text: g.text, qtyText, unit: g.unit, qty: g.qty, follower: g.follower };
  }).concat((() => {
    // HUB 016b: pieces on this wall cut from a sheet or offcut counted on another wall
    const lay = (result?.layouts || []).find((l) => l?.wallMeasurementId === wallId || l?.wallId === wallId);
    const n = lay?.cutPlan?.fromOtherWalls || 0;
    return n ? [{ key: "borrowed", text: "Cut from other walls' sheets or offcuts", qtyText: `${plural(n, "piece")} from other walls`, unit: "borrowed", qty: n }] : [];
  })());
}

/** Compact per-unit totals for a wall row / result line ("4 sheets", "11 pieces", "22.0 LM (estimate)"). */
function qtyChips(rows) {
  const by = new Map();
  for (const r of rows) {
    if (r.follower === "battens") { by.set("battens", (by.get("battens") || 0) + r.qty); continue; }
    if (r.follower) continue;   // foam tape and H-flashing are listed on the wall page, not in the short totals
    if (r.unit === "sheet" || r.unit === "piece" || r.unit === "lm" || r.unit === "borrowed") by.set(r.unit, (by.get(r.unit) || 0) + r.qty);
  }
  return [...by.entries()].map(([u, q]) => (u === "lm" ? `${q.toFixed(1)} LM (estimate)` : u === "borrowed" ? `${plural(q, "piece")} from other walls` : u === "battens" ? `${plural(Math.round(q), "batten piece")}`
    : plural(Math.round(q), ...UNIT_WORD[u])));
}

// ── elevation elements per view ─────────────────────────────────────────────────────────────────────────────

function jointLine(j, seg, k, prefix) {
  const at = j.atMm + (j.gapMm || 0) / 2;
  const horiz = j.orientation === "horizontal";
  return {
    id: `${prefix}j-${j.orientation}-${j.index}-${k}`, kind: "line", state: "joint",
    a: horiz ? { x: seg.startMm, y: at } : { x: at, y: seg.startMm }, b: horiz ? { x: seg.endMm, y: at } : { x: at, y: seg.endMm },
    info: { title: `${horiz ? "Horizontal" : "Vertical"} joint ${j.index + 1}${j.source === "auto" ? " (added automatically)" : ""}`, rows: [["Length", `${fmtMm(seg.endMm - seg.startMm)} mm`], ["Joint gap", `${fmtMm(j.gapMm)} mm`], ...(j.detailRef ? [["Detail", j.detailRef]] : [])],
      note: "Joint strips / backing come from the selected joint accessory." },
  };
}

/** Does this layout hold anything to draw (an engine-blocked wall still gets its outline-only layout)? */
function layoutHasParts(layout, method) {
  if (!layout) return false;
  if (method === "area_to_linear") return true;
  if (method === "course_layout") return (layout.courses || []).length > 0;
  if (method === "aac_panel_layout") return (layout.columns || []).length > 0;
  return (layout.cells || []).length > 0;
}

function claddingElements(entry, bbox, wallProblems) {
  const { layout, result } = entry;
  const method = result?.methodKey || entry.material.methodKey;
  const items = [], guides = [], notes = [];
  let sheetInfo = null;
  if (!layout) return { items, guides, notes, sheetInfo };
  const demandOf = (() => {
    const map = new Map();
    // a shared sheet (HUB 016) lists every cell cut from it
    // (HUB 016b: a sheet shared across walls also names other walls' cells — only this wall's own count here)
    for (const d of demandsForWall(result, entry.wallId, entry.tag)) for (const r of d.sourceRefs || []) { const c = r?.cell; if (c && !map.has(c) && (r.wallId === entry.tag || r.wallId === entry.wallId || r.measurementId === entry.wallId)) map.set(c, d); }
    return (id) => map.get(id) || null;
  })();
  const narrowRefs = wallProblems.filter((p) => p.code === "narrow_strip").flatMap((p) => p.refs || []);
  if (method === "sheet_layout") {
    const cols = new Map((layout.columns || []).map((c) => [c.index, c]));
    // strips are numbered by position from the wall start (a part strip before the datum is strip 1)
    const stripNo = new Map((layout.columns || []).map((c, i) => [c.index, i + 1]));
    const strip = (c) => stripNo.get(c?.col) ?? (c?.col ?? 0) + 1;
    const multi = (layout.courses || []).length > 1;
    const tallest = Math.max(0, ...(layout.stockLengthsMm || []));
    const cellById = new Map((layout.cells || []).map((c) => [c.id, c]));
    const cellName = (id) => { const c = cellById.get(id); return c ? `strip ${strip(c)}${multi ? ` course ${c.row + 1}` : ""}` : "another strip"; };
    for (const c of layout.cells || []) {
      const name = `Strip ${strip(c)}${multi ? `, course ${c.row + 1}` : ""}`;
      if (!c.occupied) { items.push({ id: c.id, kind: "rect", rect: c.rect, state: "empty", info: { title: name, rows: [["Sheet", "None — no cladding in this cell"]], note: "Empty cells use no sheet." } }); continue; }
      const col = cols.get(c.col);
      const sheetW = demandOf(c.id)?.identity?.stockWidthMm ?? null;
      const tooTall = c.stockLengthMm == null;
      items.push({
        id: c.id, kind: "rect", rect: c.rect, state: tooTall ? "blocked" : col?.kind === "cut" ? "cut" : "occupied", mark: tooTall ? "!" : null,
        info: {
          title: name, tone: tooTall ? "error" : null, action: tooTall ? "jointRow" : null,
          rows: [
            ["Stock", tooTall ? `None fits — needs ${fmtMm(c.requiredLengthMm)} mm; ${layout.orientation === "horizontal" ? "longest" : "tallest"} listed is ${fmtMm(tallest)} mm` : `${c.sku ? `SKU ${c.sku} · ` : ""}${fmtMm(c.stockLengthMm)}${sheetW ? ` × ${fmtMm(sheetW)}` : ""} mm sheet`],
            ["Cut size", `${fmtMm(c.cutWidthMm)} × ${fmtMm(c.cutLengthMm)} mm`],
            ...(c.sheetId && !tooTall ? [["From", (() => {
              // HUB 016 / 016b: which stock sheet (and, across walls, which wall it is counted on) this piece is cut from
              const sheet = `${c.sheetId.replace("S", "Sheet ")}${c.sheetWall ? `, counted on ${c.sheetWall}` : ""}`;
              const others = [...(c.sharedWith || []).map(cellName), ...(c.sharedWithOther || [])];
              if (c.source === "offcut") return `The offcut of ${c.fromPiece || cellName(c.sharedWith?.[0])} (${sheet})`;
              return others.length ? `${sheet} — shared with ${others.join(", ")}` : `${sheet} (its own)`;
            })()]] : []),
            ...(layout.heightAllowanceMm ? [["Needed", `${fmtMm(c.requiredLengthMm)} mm incl. ${fmtMm(layout.heightAllowanceMm)} allowance`]] : []),
          ],
          note: tooTall ? (layout.orientation === "horizontal" ? "Longer than the longest listed sheet — add a joint row with its detail, or choose a longer listed sheet." : "Taller than the tallest listed sheet — add a joint row with its detail, or choose a taller listed sheet.") : col?.kind === "cut" ? `Cut strip: ${fmtMm(col.widthMm)} mm of the ${fmtMm(layout.coverMm)} mm cover.` : null,
        },
      });
    }
    for (const j of layout.joints || []) j.segments.forEach((s, k) => items.push(jointLine(j, s, k, "")));
    guides.push({ axis: layout.orientation === "horizontal" ? "y" : "x", at: layout.datumMm, label: "datum" });
    // C0/C1: strips, cut strips, layout-cut vs stock area; HUB 016: pieces share stock sheets (cutPlan), offcuts left over
    const cutCols = (layout.columns || []).filter((c) => c.kind !== "full");
    const pieces = (layout.cells || []).filter((c) => c.occupied && c.stockLengthMm != null).length;
    const sheets = layout.cutPlan ? layout.cutPlan.sheets.length : pieces;   // HUB 016: sheets are shared — the planned stock sheets
    if ((layout.cells || []).length) {
      sheetInfo = {
        strips: (layout.columns || []).length, cutWidths: cutCols.map((c) => c.widthMm), courses: (layout.courses || []).length, sheets, pieces,
        kerfMm: layout.cutPlan?.kerfMm ?? null, shared: !!layout.cutPlan,
        refused: (layout.cutPlan?.rejected || []).map((x) => `${cellName(x.cellId)} can't use the offcut from ${x.fromCellId ? cellName(x.fromCellId) : x.fromName} — that offcut has the other long factory edge (tongue / groove)`),
        acrossWalls: layout.cutPlan?.scope === "walls" ? { walls: layout.cutPlan.walls || [], totalSheets: layout.cutPlan.totalSheets, totalPieces: layout.cutPlan.totalPieces,
          fromOtherWalls: layout.cutPlan.fromOtherWalls || 0, usedSheets: layout.cutPlan.usedSheets } : null,
        stripOf: (c) => strip(c),
        empty: (layout.cells || []).filter((c) => !c.occupied).length, layoutCutM2: layout.areas?.layoutCutM2, stockM2: layout.areas?.stockM2,
        offcuts: (layout.potentialOffcuts || []).map((o) => ({ ...o, cell: (layout.cells || []).find((c) => c.id === o.cellId) })),
      };
    }
  } else if (method === "course_layout") {
    for (const c of layout.courses || []) {
      const horiz = c.axis === "y";
      const what = horiz ? "Course" : "Board column";
      const rectOf = (a, b) => (horiz ? { x0: a, x1: b, y0: c.bandStartMm, y1: c.bandEndMm } : { x0: c.bandStartMm, x1: c.bandEndMm, y0: a, y1: b });
      if (c.empty) { items.push({ id: `k${c.index}`, kind: "rect", rect: rectOf(horiz ? bbox.x0 : bbox.y0, horiz ? bbox.x1 : bbox.y1), state: "empty", info: { title: `${what} ${c.index + 1}`, rows: [["Boards", "None — no cladding in this band"]] } }); continue; }
      const ripped = (c.baseCutMm || 0) + (c.topCutMm || 0);
      c.segments.forEach((s, si) => {
        if (!s.pieces.length) {
          items.push({ id: `k${c.index}s${si}`, kind: "rect", rect: rectOf(s.startMm, s.endMm), state: "blocked", mark: "!",
            info: { title: `${what} ${c.index + 1}`, tone: "error", rows: [["Run", `${fmtMm(s.lengthMm)} mm`]], note: "Longer than the longest listed board and no permitted joint position — needs layout." } });
          return;
        }
        s.pieces.forEach((p, pi) => items.push({
          id: p.id, kind: "rect", rect: rectOf(p.startMm, p.endMm), state: ripped > 0 ? "cut" : "occupied",
          info: {
            title: `${what} ${c.index + 1}, piece ${pi + 1}`,
            rows: [["Stock", `${p.sku ? `SKU ${p.sku} · ` : ""}${fmtMm(p.stockLengthMm)} mm board`], ["Cut size", `${fmtMm(p.lengthMm)} mm long × ${fmtMm(c.coverMm - ripped)} mm${ripped ? " (ripped)" : " cover"}`],
              ["Ends", `${END_LABEL[p.startEnd] || p.startEnd} / ${END_LABEL[p.endEnd] || p.endEnd}`]],
            note: c.notchOpeningIds?.length ? "Notched around an opening that doesn't span the full course." : null,
          },
        }));
      });
    }
    guides.push({ axis: layout.orientation === "horizontal" ? "y" : "x", at: layout.datumMm, label: "datum" });
  } else if (method === "panel_grid") {
    const g = layout.grid || {};
    for (const c of layout.cells || []) {
      const name = `Panel column ${c.col + 1}, row ${c.row + 1}`;
      if (!c.occupied) { items.push({ id: c.id, kind: "rect", rect: c.rect, state: "empty", info: { title: name, rows: [["Panel", "None — no cladding in this cell"]] } }); continue; }
      const narrow = narrowRefs.some((r) => (r.axis === "width" && r.band === c.col) || (r.axis === "height" && r.band === c.row));
      const cut = c.colKind !== "full" || c.rowKind !== "full";
      items.push({
        id: c.id, kind: "rect", rect: c.rect, state: narrow ? "narrow" : cut ? "cut" : "occupied",
        info: { title: name, rows: [["Stock", `${g.sku ? `SKU ${g.sku} · ` : ""}${fmtMm(g.panelWidthMm)} × ${fmtMm(g.panelHeightMm)} mm panel`], ["Cut size", `${fmtMm(c.cutWidthMm)} × ${fmtMm(c.cutHeightMm)} mm`]],
          note: narrow ? "Narrow strip — needs the system's minimum-piece / edge-fixing review." : cut ? "Cut panel — needs the minimum-piece / edge-fixing check." : null, tone: narrow ? "warn" : null },
      });
    }
    for (const j of layout.joints || []) j.segments.forEach((s, k) => items.push(jointLine(j, s, k, "")));
  } else if (method === "aac_panel_layout") {
    for (const col of layout.columns || []) {
      const narrow = narrowRefs.some((r) => r.axis === "width" && r.band === col.index);
      if (!col.panels.length) { items.push({ id: `s${col.segment}c${col.index}`, kind: "rect", rect: { x0: col.zoneStartMm, x1: col.zoneEndMm, y0: bbox.y0, y1: bbox.y1 }, state: "empty", info: { title: `Panel column ${col.index + 1}`, rows: [["Panel", "None — no wall in this column"]] } }); continue; }
      for (const p of col.panels) {
        const tooTall = p.stockLengthMm == null;
        items.push({
          id: p.id, kind: "rect", rect: { x0: col.zoneStartMm, x1: col.zoneEndMm, y0: p.startMm, y1: p.endMm }, state: tooTall ? "blocked" : narrow ? "narrow" : col.kind !== "full" ? "cut" : "occupied", mark: tooTall ? "!" : null,
          info: { title: `Panel column ${col.index + 1}`, tone: tooTall ? "error" : null,
            rows: [["Stock", tooTall ? "None fits — longer than the longest listed panel" : `${p.sku ? `SKU ${p.sku} · ` : ""}${fmtMm(layout.panelWidthMm)} × ${fmtMm(p.stockLengthMm)} mm panel`], ["Cut size", `${fmtMm(p.cutWidthMm)} × ${fmtMm(p.lengthMm)} mm`]],
            note: tooTall ? "Stacking needs the system's exact horizontal-joint detail." : narrow ? "Narrow strip — review the system detail." : null },
        });
      }
    }
    for (const [i, cj] of (layout.controlJoints || []).entries()) items.push({ id: `cj${i}`, kind: "line", state: "joint", a: { x: cj.atMm, y: bbox.y0 }, b: { x: cj.atMm, y: bbox.y1 }, clip: true, info: { title: `Control joint ${i + 1}`, rows: [["Position", `${fmtMm(cj.atMm)} mm from the start`], ["Width", `${fmtMm(cj.widthMm)} mm`]] } });
  } else if (method === "area_to_linear") {
    notes.push(`Area estimate (random lengths): ${Number.isFinite(layout.orderLm) ? `${layout.orderLm.toFixed(1)} LM to order` : Number.isFinite(layout.withSpareLm) ? `${layout.withSpareLm.toFixed(1)} LM before the supplier increment` : "LM not calculated yet"} — no board layout is drawn. Use fixed lengths for a board-by-board layout.`);
  }
  return { items, guides, notes, sheetInfo };
}

/** Lowest / highest y of the wall outline on the vertical line x (for members that run base → top). */
function spanAtX(polygon, x) {
  const ys = [];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    if (x < Math.min(a.x, b.x) - 0.5 || x > Math.max(a.x, b.x) + 0.5) return;
    if (Math.abs(b.x - a.x) < 0.5) ys.push(a.y, b.y);
    else ys.push(a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x));
  });
  return ys.length ? { lo: Math.min(...ys), hi: Math.max(...ys) } : null;
}

function supportElements(entries, bbox, polygon) {
  const items = [], notes = [], about = [];
  for (const e of entries) {
    const l = e.layout;
    if (!l) continue;
    const prefix = `${String(e.material.id).slice(0, 6)}-`;
    const alloc = allocationMap(e.result);
    if (Array.isArray(l.lines) && (e.result?.methodKey === "support_grid" || l.method?.startsWith?.("support_grid"))) {
      l.lines.forEach((ln, i) => {
        if (ln.atMm == null) return;
        const vert = ln.orientation === "vertical";
        const a = alloc.get(ln.demandId);
        items.push({
          id: `${prefix}s${i}`, kind: "line", state: ln.existing ? "existing" : "support",
          a: vert ? { x: ln.atMm, y: ln.fromMm } : { x: ln.fromMm, y: ln.atMm }, b: vert ? { x: ln.atMm, y: ln.toMm } : { x: ln.toMm, y: ln.atMm },
          info: {
            title: `${e.material.name}: ${e.readable ? e.readable(ln.label) : ln.label}`,
            rows: [["Length", `${fmtMm(ln.lengthMm)} mm`], ["Stock", ln.existing ? "Existing support — not purchased" : a?.unavailable ? `No stock fits — ${a.message}` : a?.stockLengthMm ? `Cut from a ${fmtMm(a.stockLengthMm)} mm length${a.source === "offcut" ? ` (offcut ${a.offcutLabel || ""})` : ""}` : "Stock length not chosen yet"],
              ...(Number.isFinite(ln.fixings) ? [["Fixings", String(ln.fixings)]] : [])],
          },
        });
      });
      if (!l.lines.length) notes.push(`${e.material.name}: no support pieces on this wall yet — see the problems above.`);
    } else if (l.kind === "studWall") {
      const studDemands = new Map(demandsForWall(e.result, e.wallId, e.tag).filter((d) => d.role === "stud").map((d) => [d.sourceRefs?.[0]?.station, d]));
      for (const t of l.ticks || []) {
        const d = studDemands.get(t.positionMm);
        const a = d ? alloc.get(d.id) : null;
        const opening = t.openingId ? e.openingLabel(t.openingId) : null;
        // HUB 028: a stud beside an opening (tick state "side") is a full stud, drawn and counted like the others
        const beside = (t.besideOpeningIds || []).map((id) => e.openingLabel(id));
        const span = spanAtX(polygon, t.positionMm) || { lo: bbox.y0, hi: bbox.y1 };
        items.push({
          id: `${prefix}${t.stationId}`, kind: "line", state: t.state === "removed" ? "removed" : "full",
          a: { x: t.positionMm, y: span.lo }, b: { x: t.positionMm, y: span.hi },
          info: {
            title: `Stud @ ${fmtMm(t.positionMm)} mm${beside.length ? ` (beside ${beside.join(", ")})` : ""}`,
            rows: t.state === "removed" ? [["Status", `Removed — inside ${opening || "an opening"}`]]
              : [["Cut length", `${fmtMm(d?.lengthMm ?? l.studLengthMm)} mm`], ["Stock", a?.unavailable ? `No stock fits — ${a.message}` : a?.stockLengthMm ? `${fmtMm(a.stockLengthMm)} mm length` : "—"], ...(l.plies > 1 ? [["Plies", String(l.plies)]] : [])],
            note: t.state === "removed" ? "Kings, jacks, trimmers and lintels come from the opening's framing detail — never guessed." : null,
          },
        });
      }
      // the count stays by the drawing; what the studs cover ("base studs only …") is a note, under More. A Walls
      // item (HUB 028) never says "opening framing incomplete": its one plain lintels note, on the wall's line, says it
      notes.push(`${e.material.name}: ${plural((l.ticks || []).filter((t) => t.state !== "removed").length, "stud")} at ${fmtMm(l.studLengthMm)} mm.`);
      if (l.scope && l.method !== "wall_framing@1") about.push(`${e.material.name}: ${l.scope}.`);
    } else if (l.kind === "plates") {
      notes.push(`${e.material.name}: ${(l.layers || []).map((x) => `${x.tag} plate ${x.piecesMm.map((p) => fmtMm(p)).join(" + ")} mm`).join("; ")}.`);
    } else if (Array.isArray(l.bays)) {
      notes.push(`${e.material.name}: noggins — see the schedule for each bay's cut length.`);
    }
  }
  return { items, notes, about };
}

/**
 * Wall-by-wall step 4: the battens a cladding works out by itself on this wall (engine/followers.js), for the Supports
 * tab — one line per batten piece, plus one plain note per cladding (or why there are none here).
 */
function followerElements(claddingEntries) {
  const items = [], notes = [], about = [];
  for (const e of claddingEntries) {
    const f = e.layout?.followers;
    if (!f) continue;
    const prefix = `${String(e.material.id).slice(0, 6)}-`;
    const alloc = allocationMap(e.result);
    const b = f.battens;
    if (b.state === "auto") {
      b.lines.forEach((ln, i) => {
        const a = alloc.get(ln.demandId);
        items.push({
          id: `${prefix}fb${i}`, kind: "line", state: "support", auto: true, a: ln.a, b: ln.b, over: ["jamb", "head", "sill"].includes(ln.kind),
          info: {
            title: `Batten — ${ln.label.replace(/^.*? batten — /, "")}`,
            rows: [["Length", `${fmtMm(Math.round(ln.lengthMm))} mm`], ["Stock", a?.stockLengthMm ? `Cut from a ${fmtMm(a.stockLengthMm)} mm ${FOLLOWER_TEXT.battens}` : FOLLOWER_TEXT.battens]],
            note: "Worked out from the cladding. Fixings to the studs are not counted.",
          },
        });
      });
      // wall-by-wall step 5: the explanations fold under More (the wall's short line at the top has the batten count)
      about.push(`Battens worked out from ${e.material.name}: ${plural(b.lines.length, "piece")}, ${(b.totalMm / 1000).toFixed(2)} m on this wall. Nothing to set up. Fixings to the studs are not counted.`);
    } else if (b.state === "hand-made") about.push(`The battens on this wall come from ${(b.by || []).join(", ")} (set up by hand), so ${e.material.name} doesn't add its own here. To use the automatic battens instead, remove ${(b.by || []).join(", ")} from this wall in Materials on this wall.`);
    else if (b.state === "direct") notes.push(`${e.material.name} is direct fixed, so it has no battens.`);
  }
  return { items, notes, about };
}

function accessoryElements(polygon, openings, claddingEntries) {
  const items = [], totals = [];
  const y0 = Math.min(...polygon.map((p) => p.y));
  const xs = polygon.map((p) => p.x), minX = Math.min(...xs), maxX = Math.max(...xs);
  // base (starter / base trim): bottom edges, less door openings that sit on the base
  let base = [];
  polygon.forEach((a, i) => { const b = polygon[(i + 1) % polygon.length]; if (Math.abs(a.y - y0) < 0.5 && Math.abs(b.y - y0) < 0.5 && Math.abs(a.x - b.x) > 0.5) base.push([Math.min(a.x, b.x), Math.max(a.x, b.x)]); });
  for (const o of openings) if (o.sillMm <= y0 + 0.5) base = base.flatMap(([s, e]) => [[s, Math.min(e, o.xMm)], [Math.max(s, o.xMm + o.widthMm), e]].filter(([p, q]) => q - p > 0.5));
  base.forEach(([s, e], i) => items.push({ id: `base${i}`, kind: "line", state: "edge", a: { x: s, y: y0 }, b: { x: e, y: y0 }, info: { title: "Wall base", rows: [["Length", `${fmtMm(e - s)} mm`]], note: "Starter / base trim route (doors on the base are left out)." } }));
  totals.push(["Base (less doors)", base.reduce((t, [s, e]) => t + (e - s), 0)]);
  // wall ends (corner / end trims)
  for (const [x, label] of [[minX, "Wall start"], [maxX, "Wall end"]]) {
    const ys = polygon.filter((p) => Math.abs(p.x - x) < 0.5).map((p) => p.y);
    if (ys.length < 2) continue;
    const top = Math.max(...ys), bot = Math.min(...ys);
    items.push({ id: `end-${label}`, kind: "line", state: "end", a: { x, y: bot }, b: { x, y: top }, info: { title: label, rows: [["Height", `${fmtMm(top - bot)} mm`]], note: "Corner or end trim route — corner type is chosen with the accessory, not inferred." } });
  }
  // opening edges (head / sill / jambs)
  let perimeter = 0;
  for (const o of openings) {
    const x1 = o.xMm + o.widthMm, y1 = o.sillMm + o.heightMm, name = o.label || "Opening";
    const edges = [["head", "Head", { x: o.xMm, y: y1 }, { x: x1, y: y1 }, o.widthMm], ["sill", "Sill", { x: o.xMm, y: o.sillMm }, { x: x1, y: o.sillMm }, o.widthMm],
      ["jamb-left", "Left jamb", { x: o.xMm, y: o.sillMm }, { x: o.xMm, y: y1 }, o.heightMm], ["jamb-right", "Right jamb", { x: x1, y: o.sillMm }, { x: x1, y: y1 }, o.heightMm]];
    for (const [k, label, a, b, len] of edges) {
      if (k === "sill" && o.sillMm <= y0 + 0.5) continue; // a door has no sill edge on the base
      perimeter += len;
      items.push({ id: `${o.id}:${k}`, kind: "line", state: "edge", a, b, info: { title: `${name} ${label.toLowerCase()}`, rows: [["Length", `${fmtMm(len)} mm`]], note: "Edge length only — head/sill/jamb flashings and trims link to the opening's reviewed detail." } });
    }
  }
  totals.push(["Opening edges", perimeter]);
  // joints from the cladding layouts on this wall
  let jointLen = 0;
  for (const e of claddingEntries) {
    const l = e.layout;
    if (!l) continue;
    const prefix = `${String(e.material.id).slice(0, 6)}-`;
    for (const j of l.joints || []) j.segments.forEach((s, k) => { jointLen += s.endMm - s.startMm; items.push(jointLine(j, s, k, prefix)); });
    for (const c of l.courses || []) {
      if (!c.segments) continue;
      const horiz = c.axis === "y";
      for (const s of c.segments) for (const p of s.pieces || []) {
        if (!String(p.endEnd).startsWith("joint")) continue;
        jointLen += c.bandEndMm - c.bandStartMm;
        items.push({ id: `${prefix}${p.id}-joint`, kind: "line", state: "joint", a: horiz ? { x: p.endMm, y: c.bandStartMm } : { x: c.bandStartMm, y: p.endMm }, b: horiz ? { x: p.endMm, y: c.bandEndMm } : { x: c.bandEndMm, y: p.endMm },
          info: { title: `Board joint — course ${c.index + 1}`, rows: [["Position", `${fmtMm(p.endMm)} mm`], ["Type", END_LABEL[p.endEnd] || p.endEnd]] } });
      }
    }
    for (const [i, cj] of (l.controlJoints || []).entries()) { jointLen += polygon.length ? Math.max(...polygon.map((p) => p.y)) - y0 : 0; items.push({ id: `${prefix}cj${i}`, kind: "line", state: "joint", clip: true, a: { x: cj.atMm, y: y0 }, b: { x: cj.atMm, y: Math.max(...polygon.map((p) => p.y)) }, info: { title: `Control joint ${i + 1}`, rows: [["Width", `${fmtMm(cj.widthMm)} mm`]] } }); }
  }
  totals.push(["Joints", jointLen]);
  return { items, totals };
}

const LEGEND = {
  cladding: [["occupied", "In use", "bg-blue-100 border-[#006c9b]"], ["cut", "Cut strip", "bg-amber-100 border-amber-700"], ["narrow", "Narrow — review", "bg-red-200 border-red-700"],
    ["blocked", "No stock fits", "bg-red-300 border-red-800"], ["empty", "Empty — none used", "bg-white border-slate-400 border-dashed"], ["joint", "Joint", "bg-violet-600 border-violet-600"]],
  supports: [["support", "Support", "bg-teal-700 border-teal-700"], ["existing", "Existing (not bought)", "bg-slate-400 border-slate-500 border-dashed"], ["full", "Stud", "bg-amber-800 border-amber-800"], ["removed", "Removed stud", "bg-slate-300 border-slate-400 border-dashed"]],
  accessories: [["edge", "Base / opening edge", "bg-orange-600 border-orange-600"], ["end", "Wall end", "bg-sky-700 border-sky-700"], ["joint", "Joint", "bg-violet-600 border-violet-600"]],
};

// ── small UI pieces ─────────────────────────────────────────────────────────────────────────────────────────

function Chips({ label, value, options, onChange, disabled }) {
  return (
    <fieldset>
      {label && <legend className="mb-1 text-xs font-medium text-muted">{label}</legend>}
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" aria-pressed={value === v} disabled={disabled} onClick={() => onChange(v)}
            className={`min-h-[44px] rounded-lg border px-3 text-sm disabled:opacity-50 ${value === v ? "border-primary bg-primary/10 font-semibold text-primary" : "border-hairline bg-white text-ink"}`}>{text}</button>
        ))}
      </div>
    </fieldset>
  );
}

/** Text that commits on blur / Enter (one undoable edit, not one per keystroke). */
function CommitText({ label, value, onCommit, maxLength = 60, disabled }) {
  const [text, setText] = useState(value || "");
  useEffect(() => { setText(value || ""); }, [value]);
  const commit = () => { const v = text.trim().slice(0, maxLength); if (v !== (value || "")) onCommit(v); };
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <input value={text} maxLength={maxLength} disabled={disabled} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        className="min-h-[44px] w-full rounded-lg border border-hairline px-3 text-base text-ink focus-ring disabled:bg-page" />
    </label>
  );
}

function StatusChip({ group, value }) {
  const [text, tone] = STATUS_TEXT[group]?.[value] || [value || "—", "muted"];
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE[tone]}`} data-status={group} data-value={value || ""}>{text}</span>;
}

/**
 * Wall-by-wall step 5 (Sam's answer 3): the status chips and notes on the wall screens fold away under More. They
 * still show on the schedule and the order; anything that blocks the order stays out here with its fix.
 */
function More({ children, className = "", ...rest }) {
  const [open, setOpen] = useState(false);
  return (
    <details className={`rounded-lg border border-hairline bg-white ${className}`} open={open} onToggle={(e) => setOpen(e.currentTarget.open)} {...rest}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        <span className="flex-1">More</span><span aria-hidden="true" className="text-muted">{open ? "▾" : "▸"}</span></summary>
      <div className="space-y-2 px-3 pb-3">{children}</div>
    </details>
  );
}

function StatusSummary({ view, material, result, computedError, canEdit, onSetup, readable }) {
  const [all, setAll] = useState(false);
  // joint-row problems name the walls the row doesn't fit (the engine's own message names none)
  const { byWall, general } = attributeProblems(view, material, result);
  const problems = [...general, ...[...byWall.values()].flat()].map(readable);
  const blocking = dedupe(problems.filter((p) => p.blocking !== false));
  const notes = dedupe(problems.filter((p) => p.blocking === false));
  const shown = all ? blocking : blocking.slice(0, 4);
  const st = { ...(result?.status || {}) };
  // a material with no wall yet is "nothing measured", never "Calculated"
  if (!materialWalls(view, material.id).length && (st.quantity === "calculated" || st.quantity === "incomplete")) st.quantity = "nothing";
  return (
    <section aria-label="Material status" className="space-y-2 rounded-card border border-hairline bg-white p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-ink">{material.name}</h2>
          <p className="text-[11px] text-muted">{describeFamilySpec(material.spec).line}</p>
        </div>
        {canEdit && onSetup && <Btn onClick={() => onSetup(material)}>Setup</Btn>}
      </div>
      {computedError && <Banner tone="error">The calculation stopped: {computedError}</Banner>}
      {blocking.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" data-problems="blocking">
          <p className="font-semibold">Needs attention before ordering</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{shown.map((p) => <li key={p.message}>{p.message}</li>)}</ul>
          {blocking.length > 4 && <Btn kind="ghost" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${blocking.length}`}</Btn>}
        </div>
      )}
      {/* wall-by-wall step 5: the statuses and notes fold away (they stay on the schedule and the order) */}
      <More data-status-more="">
        <dl className="grid grid-cols-[6.5rem_1fr] items-center gap-x-2 gap-y-1 text-xs">
          <dt className="text-muted">Quantity</dt><dd><StatusChip group="quantity" value={st.quantity} /></dd>
          <dt className="text-muted">Installation</dt><dd><StatusChip group="installation" value={st.installation} /></dd>
          <dt className="text-muted">Ordering</dt><dd><StatusChip group="procurement" value={st.procurement} /></dd>
        </dl>
        {st.installation !== "supported-by-selected-rule" && st.installation !== "project-detail-supplied" && (
          <p className="text-[11px] text-muted">The app has not verified installation (supports, fixings, wind zones). Quantities are for ordering only.</p>
        )}
        {notes.length > 0 && (
          <div className="text-sm text-amber-900" data-notes="">
            <p className="text-xs font-semibold">{plural(notes.length, "note")} (not blocking)</p>
            <ul className="list-disc space-y-0.5 pl-4">{notes.map((p) => <li key={p.message}>{p.message}</li>)}</ul>
          </div>
        )}
      </More>
    </section>
  );
}

function OpeningForm({ value, onField, canEdit, focusToken }) {
  const ref = useRef(null);
  // after a TAP on the elevation, iOS fires compatibility mouse events that would steal focus straight back to the
  // drawing — focus Width once they have passed, so the keyboard opens on the field
  useEffect(() => {
    if (!focusToken) return undefined;
    const t = setTimeout(() => ref.current?.querySelector('[data-field="widthMm"] input')?.focus({ preventScroll: false }), 350);
    return () => clearTimeout(t);
  }, [focusToken]);
  if (!canEdit) {
    return <p className="text-sm text-ink">{value.label || "Opening"} · {value.type} · {fmtMm(value.widthMm)} × {fmtMm(value.heightMm)} mm · sill {fmtMm(value.sillMm)} · from start {fmtMm(value.xMm)}</p>;
  }
  // compact: the elevation stays visible above this sheet while the opening is dragged
  return (
    <div ref={ref} className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div data-field="widthMm"><NumberField label="Width" value={value.widthMm} min={1} max={MAX_MM} onCommit={(n) => onField("widthMm", n)} /></div>
        <div data-field="heightMm"><NumberField label="Height" value={value.heightMm} min={1} max={MAX_MM} onCommit={(n) => onField("heightMm", n)} /></div>
        <div data-field="sillMm"><NumberField label="Sill height" value={value.sillMm} min={0} max={MAX_MM} onCommit={(n) => onField("sillMm", n)} /></div>
        <div data-field="xMm"><NumberField label="Offset from wall start" value={value.xMm} min={0} max={MAX_MM} onCommit={(n) => onField("xMm", n)} /></div>
      </div>
      <p className="text-[11px] text-muted">Sill is up from the wall base; offset is to the opening&apos;s left edge.</p>
      <div className="grid grid-cols-[5.5rem_1fr] items-end gap-2">
        <CommitText label="Label" value={value.label} maxLength={40} onCommit={(v) => onField("label", v)} />
        <Chips label="Type" value={value.type} options={OPENING_TYPES} onChange={(v) => onField("type", v)} />
      </div>
    </div>
  );
}

// ── opening framing detail (03 T4 / TIM02): kings, jacks, trimmers, lintel, sill come ONLY from here ──────────
const DETAIL_SOURCES = [["reviewed-detail", "Reviewed detail"], ["explicit", "Explicit quantities"]];
const MEMBER_ROLES = [["king", "King stud"], ["jack", "Jack stud"], ["trimmer", "Trimmer"], ["lintel", "Lintel"], ["sill trimmer", "Sill trimmer"], ["head trimmer", "Head trimmer"], ["cripple", "Cripple stud"], ["sill", "Sill"]];
const MEMBER_BASIS = [["stud", "Stud length"], ["openingWidth", "Opening width"], ["headLevel", "Head level"], ["sillLevel", "Sill level"], ["fixed", "Enter a length"]];
const REGION_CHOICES = [[true, "Pieces required"], [false, "None"]];

/** Stored opening.inputs.detail → the editor's state (member rows keep their stored ids). */
function framingFromStored(d) {
  const region = (r) => (r && typeof r.required === "boolean" ? { req: r.required, ded: r.required ? r.deductionMm ?? null : null } : { req: null, ded: null });
  return {
    source: d?.source || null, ref: d?.ref || "", below: region(d?.belowSill), above: region(d?.aboveHead),
    members: (Array.isArray(d?.members) ? d.members : []).map((m) => ({ id: m.id, role: m.role || "", quantity: m.quantity ?? null,
      basis: m.lengthMm != null ? "fixed" : m.lengthFrom || "", lengthMm: m.lengthMm ?? null, addMm: m.addMm ?? 0 })),
    none: Array.isArray(d?.members) && d.members.length === 0,
  };
}

/** What a member row still lacks (empty = complete). `refs` = the lengths it can follow (null when unknown). */
function memberMissing(m, refs) {
  const out = [];
  if (!m.role) out.push("what it is");
  if (!(Number.isInteger(m.quantity) && m.quantity >= 1 && m.quantity <= 50)) out.push("a quantity");
  if (!m.basis || (m.basis === "fixed" && !(m.lengthMm >= 1))) out.push("its length");
  else if (m.basis !== "fixed" && refs?.[m.basis] != null && refs[m.basis] + (m.addMm || 0) <= 0) out.push("a length above 0 (check the adjustment)");
  return out;
}

/** The editor state → what is stored: only answered parts, only complete members (the engine reports the rest). */
function framingToStored(s, refs) {
  if (!s.source) return null;
  const region = (r) => (r.req === false ? { required: false } : r.req === true && Number.isFinite(r.ded) ? { required: true, deductionMm: r.ded } : undefined);
  const out = { source: s.source };
  if (s.ref.trim()) out.ref = s.ref.trim().slice(0, 120);
  const b = region(s.below), a = region(s.above);
  if (b) out.belowSill = b;
  if (a) out.aboveHead = a;
  const done = s.members.filter((m) => !memberMissing(m, refs).length);
  if (done.length || s.none) {
    out.members = done.map((m) => ({ id: m.id, role: m.role, quantity: m.quantity,
      ...(m.basis === "fixed" ? { lengthMm: m.lengthMm } : { lengthFrom: m.basis, addMm: m.addMm || 0 }), sameAsStud: true }));
  }
  return out;
}

const ENGINE_MEMBER = /\bm(\d+) (length|product)/g;
/**
 * An opening's framing detail on a stud wall: the source (reviewed detail + reference, or explicit quantities),
 * whether below-sill / above-head pieces are required (with the detail's deduction), and the kings, jacks,
 * trimmers, lintel and sill as explicit members. Every complete answer applies at once (undoable); an unfinished
 * member row stays here as a draft and is never counted. The engine's own verdict is shown — quantities only,
 * never a design check.
 */
function FramingDetail({ opening, stud, canEdit, onSave }) {
  const uid = useId();
  const stored = opening.rec.inputs?.detail || null;
  const fr = stud?.layout?.openings?.find((x) => x.id === opening.id) || null; // the engine's framing state
  const studLen = stud?.layout?.studLengthMm ?? null;
  const sillH = fr ? fr.sillMm : opening.sillMm;
  const headH = fr ? fr.headMm : (opening.sillMm || 0) + (opening.heightMm || 0);
  const refs = { stud: studLen, openingWidth: opening.widthMm ?? null, headLevel: headH ?? null, sillLevel: sillH ?? null };
  const askBelow = !(sillH <= 0);
  const askAbove = studLen == null || studLen - headH > 0;
  const storedNorm = JSON.stringify(framingToStored(framingFromStored(stored), refs));
  const storedRef = useRef(stored);
  storedRef.current = stored;
  const [s, setS] = useState(() => framingFromStored(stored));
  // undo / redo / another device changed what is stored → show it (a save round-trip that stores the same keeps drafts)
  useEffect(() => {
    setS((cur) => (JSON.stringify(framingToStored(cur, refs)) === storedNorm ? cur : framingFromStored(storedRef.current)));
  }, [storedNorm]); // eslint-disable-line react-hooks/exhaustive-deps -- refs are folded into storedNorm
  const change = (fn) => {
    const next = fn(s);
    setS(next);
    const d = framingToStored(next, refs);
    if (JSON.stringify(d) !== storedNorm) onSave(d);
  };
  const setMember = (id, patch) => change((x) => ({ ...x, members: x.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  const addMember = () => change((x) => {
    let n = x.members.length + 1;
    const ids = new Set(x.members.map((m) => m.id));
    while (ids.has(`m${n}`)) n++;
    return { ...x, none: false, members: [...x.members, { id: `m${n}`, role: "", quantity: null, basis: "", lengthMm: null, addMm: 0 }] };
  });
  const memberNo = new Map(s.members.map((m, i) => [m.id, i + 1]));
  const engineText = (t) => String(t).replace(ENGINE_MEMBER, (all, n, what) => (memberNo.has(`m${n}`) ? `member ${memberNo.get(`m${n}`)} ${what}` : all));

  // HUB 028: on a Walls item an opening with no detail is not a fault, just not counted (Sam: Walls says so in one
  // plain line); a detail started but not finished still says what it needs
  const walls = (stud?.result?.methodKey || stud?.material?.methodKey) === "wall_framing";
  const name = opening.label || fr?.label || "this opening";
  const onlyDetail = (fr?.missing || []).length === 1 && fr.missing[0] === "its framing detail";
  const status = !stud ? null : !fr ? <p className="text-xs text-muted" data-framing-state="none">The studs aren&apos;t calculated on this wall yet — finish the wall first.</p>
    : fr.complete ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900" data-framing-state="complete">Framing entered — counted as quantities only, not checked as a design.</p>
      : walls && onlyDetail ? <p className="rounded-lg bg-page px-3 py-2 text-xs text-ink" data-framing-state="not-counted">Lintels, jacks and trimmers at {name} aren&apos;t counted.</p>
        : walls ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-framing-state="incomplete">Lintels, jacks and trimmers at {name} aren&apos;t counted until the detail is complete. It still needs {(fr.missing || []).map(engineText).join("; ")}.</p>
          : <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-framing-state="incomplete">Base studs only until the detail is complete — still needs {(fr.missing || []).map(engineText).join("; ")}.</p>;

  if (!canEdit) {
    return (
      <section aria-label="Framing detail" className="space-y-1 rounded-lg border border-hairline p-2" data-framing-detail="">
        <h4 className="text-xs font-semibold text-ink">Framing detail{stud ? ` — ${stud.material.name}` : ""}</h4>
        {status}
        {stored?.source && <p className="text-xs text-ink">{stored.source === "reviewed-detail" ? `Reviewed detail ${stored.ref || ""}` : "Explicit quantities"} · {plural((stored.members || []).length, "member")}</p>}
      </section>
    );
  }
  const regionField = (key, legend, label) => {
    const r = s[key];
    return (
      <div className="space-y-1">
        <Chips label={legend} value={r.req} options={REGION_CHOICES} onChange={(v) => change((x) => ({ ...x, [key]: { req: v, ded: v ? x[key].ded : null } }))} />
        {r.req === true && (
          <NumberField label={label} value={r.ded} min={0} max={MAX_MM} onCommit={(n) => change((x) => ({ ...x, [key]: { ...x[key], ded: n } }))}
            help="From the detail (e.g. the sill trimmer or lintel depth) — never defaulted." />
        )}
      </div>
    );
  };
  return (
    <section aria-label="Framing detail" className="space-y-2 rounded-lg border border-hairline p-2" data-framing-detail="">
      <h4 className="text-xs font-semibold text-ink">Framing detail{stud ? ` — ${stud.material.name}` : ""}</h4>
      <p className="text-[11px] text-muted">Kings, jacks, trimmers, lintel and sill are never guessed — they come only from this detail.</p>
      {status}
      <Chips label="Framing comes from" value={s.source} options={DETAIL_SOURCES} onChange={(v) => change((x) => ({ ...x, source: v }))} />
      {s.source && (
        <>
          <CommitText label={s.source === "reviewed-detail" ? "Detail reference (needed)" : "Reference (optional)"} value={s.ref} maxLength={120} onCommit={(v) => change((x) => ({ ...x, ref: v }))} />
          {askBelow && regionField("below", "Below the sill", "Below-sill deduction")}
          {askAbove && regionField("above", "Above the head", "Above-head deduction")}
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-medium text-muted">Kings, jacks, trimmers, lintel, sill</legend>
            {s.members.map((m, i) => {
              const miss = memberMissing(m, refs);
              return (
                <div key={m.id} className="space-y-2 rounded-lg border border-hairline p-2" data-member-row={m.id}>
                  <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`${uid}-${m.id}-role`} className="mb-1 block text-xs font-medium text-muted">Member</label>
                      <select id={`${uid}-${m.id}-role`} value={m.role} onChange={(e) => setMember(m.id, { role: e.target.value })}
                        className="min-h-[44px] w-full rounded-lg border border-hairline bg-white px-2 text-base text-ink focus-ring">
                        <option value="">Choose…</option>
                        {MEMBER_ROLES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                      </select>
                    </div>
                    <Btn kind="ghost" className="min-w-[44px]" aria-label={`Remove member ${i + 1}`} onClick={() => change((x) => ({ ...x, members: x.members.filter((y) => y.id !== m.id) }))}>✕</Btn>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <NumberField label="Quantity" unit="pcs" integer value={m.quantity} min={1} max={50} onCommit={(n) => setMember(m.id, { quantity: n })} />
                    <div>
                      <label htmlFor={`${uid}-${m.id}-basis`} className="mb-1 block text-xs font-medium text-muted">Length from</label>
                      <select id={`${uid}-${m.id}-basis`} value={m.basis} onChange={(e) => setMember(m.id, { basis: e.target.value })}
                        className="min-h-[44px] w-full rounded-lg border border-hairline bg-white px-2 text-base text-ink focus-ring">
                        <option value="">Choose…</option>
                        {MEMBER_BASIS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  {m.basis === "fixed" && <NumberField label="Cut length" value={m.lengthMm} min={1} max={MAX_MM} onCommit={(n) => setMember(m.id, { lengthMm: n })} />}
                  {m.basis && m.basis !== "fixed" && (
                    <NumberField label="Adjust" value={m.addMm ?? 0} min={-5000} max={5000} onCommit={(n) => setMember(m.id, { addMm: n })}
                      help={`Added to the ${MEMBER_BASIS.find(([v]) => v === m.basis)?.[1].toLowerCase()}${refs[m.basis] != null ? ` (${fmtMm(refs[m.basis])} mm)` : ""} — 0 for exactly that length.`} />
                  )}
                  <p className={`text-[11px] ${miss.length ? "text-amber-800" : "text-muted"}`} data-member-state={miss.length ? "draft" : "applied"}>
                    {miss.length ? `Draft — not counted until it has ${miss.join(", ")}.` : `Counted: ${m.quantity} × ${MEMBER_ROLES.find(([v]) => v === m.role)?.[1].toLowerCase() || m.role}, same section as the studs.`}
                  </p>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <Btn onClick={addMember}>Add a member</Btn>
              {!s.members.length && (
                <Btn aria-pressed={s.none} className={s.none ? "border-primary text-primary" : ""} onClick={() => change((x) => ({ ...x, none: !x.none }))}>
                  {s.none ? "✓ The detail has no extra members" : "The detail has no extra members"}
                </Btn>
              )}
            </div>
          </fieldset>
          {stored && <Btn kind="ghost" onClick={() => { setS(framingFromStored(null)); onSave(null); }}>Clear the framing detail</Btn>}
        </>
      )}
    </section>
  );
}

// wall-by-wall step 5: ‹ Previous / Next › now go wall to wall (the wall page's footer); tap a sheet, batten or joint
// for its details
function ElementSheet({ item, onClose, onAction, canEdit, footerBelow = false }) {
  const info = item.info || {};
  return (
    <Sheet title={info.title || "Selected"} onClose={onClose} initialFocus={false} safeBottom={!footerBelow}>
      <dl className="space-y-1 text-sm" data-element-info={item.id}>
        {(info.rows || []).map(([k, v]) => (
          <div key={k} className="flex gap-2"><dt className="w-24 shrink-0 text-muted">{k}</dt><dd className="min-w-0 flex-1 font-medium text-ink">{v}</dd></div>
        ))}
      </dl>
      {info.note && <p className={`mt-2 text-xs ${info.tone === "error" ? "text-red-700" : info.tone === "warn" ? "text-amber-800" : "text-muted"}`}>{info.note}</p>}
      {info.action === "jointRow" && canEdit && <Btn kind="primary" className="mt-2" onClick={() => onAction("jointRow")}>Add a joint row</Btn>}
    </Sheet>
  );
}

/** What a joint row entry still lacks before it can be a layout (the Setup card's rule: positions + gap + detail). */
function jointRowMissing(row, horizontal) {
  return [!(row?.atMm?.length > 0) && `the joint ${horizontal ? "position" : "height"}`, !Number.isFinite(row?.gapMm) && "the joint gap",
    !String(row?.detailRef || "").trim() && "the detail reference"].filter(Boolean);
}

/**
 * The material's joint row, edited from the wall (04 C2). Same completeness rule as Setup → Horizontal joint rows
 * (FamilySetup JointRowsField): only height + gap + detail reference together become rules.jointRows; anything less
 * is kept as rules.jointRowsDraft (the engine never reads it), so it survives closing the sheet or a reload.
 */
function JointRowSheet({ view, material, suggestionMm, onApply, onDraft, onRemove, onClose }) {
  const jr = material.rules?.jointRows || null;
  const draft = material.rules?.jointRowsDraft || null;
  const src = draft || jr;
  const rest = src?.atMm?.slice(1) || []; // further rows set in Setup are kept as they are
  const suggested = Number.isFinite(suggestionMm) ? Math.floor(suggestionMm / SNAP_MM) * SNAP_MM : null;
  const [atMm, setAt] = useState(src?.atMm?.[0] ?? suggested);
  const [gapMm, setGap] = useState(src?.gapMm ?? null);
  const [ref, setRef] = useState(src?.detailRef || "");
  // undo / redo / the Setup card change the stored rule: show what is stored now
  const srcKey = JSON.stringify(src || null);
  useEffect(() => {
    const x = JSON.parse(srcKey);
    setAt(x?.atMm?.[0] ?? suggested);
    setGap(x?.gapMm ?? null);
    setRef(x?.detailRef || "");
  }, [srcKey]); // eslint-disable-line react-hooks/exhaustive-deps -- the suggestion only fills an empty entry
  // the row applies to EVERY wall using this material: name the ones it would not fit inside
  const misfits = atMm > 0 ? jointRowMisfits(view, material, { atMm: [atMm, ...rest], gapMm: Number.isFinite(gapMm) ? gapMm : 0 }) : [];
  const horizontal = material.spec?.orientation === "horizontal";
  const apply = (patch) => {
    const v = { atMm, gapMm, ref, ...patch };
    if (patch.atMm !== undefined) setAt(patch.atMm);
    if (patch.gapMm !== undefined) setGap(patch.gapMm);
    if (patch.ref !== undefined) setRef(patch.ref);
    const row = { atMm: v.atMm > 0 ? [v.atMm, ...rest] : [], ...(Number.isFinite(v.gapMm) && v.gapMm >= 0 ? { gapMm: v.gapMm } : {}), ...(String(v.ref || "").trim() ? { detailRef: String(v.ref).trim().slice(0, 60) } : {}) };
    if (!jointRowMissing(row, horizontal).length) onApply(row);
    else onDraft(row.atMm.length || row.gapMm != null || row.detailRef ? row : null);
  };
  const missing = draft ? jointRowMissing(draft, horizontal) : [];
  // horizontal sheets run along the wall, so their joint row is a VERTICAL joint measured from the wall start
  return (
    <Sheet title="Joint row" onClose={onClose} initialFocus={false}>
      <KeyboardSafe className="space-y-2"><div className="space-y-2" data-joint-row-form="">
        <p className="text-xs text-muted">A second course of sheets needs an explicit {horizontal ? "vertical" : "horizontal"} joint and its detail. It applies to every wall using <b>{material.name}</b>, measured {horizontal ? "along from each wall's start" : "up from each wall's base"}.</p>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={horizontal ? "Joint position" : "Joint height"} value={atMm} min={1} max={MAX_MM} onCommit={(n) => apply({ atMm: n })} help={horizontal ? "From the wall start" : "From the wall base"} />
          <NumberField label="Joint gap" value={gapMm} min={0} max={50} onCommit={(n) => apply({ gapMm: n })} help="From the selected detail — never defaulted" />
        </div>
        <CommitText label="Detail reference (drawing / guide)" value={ref} onCommit={(v) => apply({ ref: v })} />
        {draft ? (
          <p className="text-xs text-amber-800" data-joint-row-draft="">Kept as a draft until the joint {horizontal ? "position" : "height"}, gap and detail are all entered — a &quot;joint allowed&quot; flag alone is never a layout. Still needed: {missing.join(", ")}.{jr ? " The joint row applied before stays in use until then." : ""}</p>
        ) : jr ? <p className="text-xs text-muted">Applied: each band is its own course of sheets with its own cut.</p>
          : <p className="text-xs text-amber-800">Enter the joint gap and the detail reference from the joint detail — the row applies once the height, gap and detail are all entered.</p>}
        {misfits.length > 0 && (
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900" data-joint-row-misfit="">
            {misfits.map((m) => `${wallName(m.wall)} (${fmtMm(Math.round(m.extentMm))} mm)`).join(", ")} {misfits.length === 1 ? "is" : "are"} not {horizontal ? "long" : "tall"} enough for a joint at {fmtMm(atMm)} mm — the joint row doesn&apos;t apply there, so {misfits.length === 1 ? "it keeps" : "they keep"} a single course of sheets.
          </p>
        )}
        {(jr || draft) && <Btn kind="danger" onClick={onRemove}>{jr ? "Remove joint row" : "Remove draft joint row"}</Btn>}
      </div></KeyboardSafe>
    </Sheet>
  );
}

/**
 * New wall by numbers. The wall is added (auto-apply, nothing to confirm) as soon as its length is entered AND the
 * entry is finished: Enter in a field, a shape tapped after the length (that shape is used), or focus leaving the
 * sheet. Moving from the length to the name or a shape of THIS sheet is part of the same entry (PH-14) — it never
 * adds a Rectangle and loses the tap. Closing the sheet (✕) cancels.
 */
function NewWallSheet({ defaultName, onCreate, onClose }) {
  const [name, setName] = useState(defaultName);
  const [kind, setKind] = useState("rect");
  const rootRef = useRef(null);
  const lengthRef = useRef(null);  // the entered (valid) length, not yet a wall
  const enterRef = useRef(false);  // the length commit came from Enter (not a blur)
  const timer = useRef(null);
  const latest = useRef({ name, kind });
  latest.current = { name, kind };
  useEffect(() => () => clearTimeout(timer.current), []);
  const create = (patch = {}) => {
    clearTimeout(timer.current);
    if (!lengthRef.current) return false;
    const v = { ...latest.current, ...patch };
    const widthMm = lengthRef.current;
    lengthRef.current = null;
    onCreate({ name: (v.name || "").trim().slice(0, 60) || defaultName, kind: v.kind, widthMm });
    return true;
  };
  // a blur: wait for the tap that caused it — a shape or the name in this sheet continues the entry
  const createWhenLeft = () => {
    clearTimeout(timer.current);
    if (!lengthRef.current) return;
    if (document.visibilityState === "hidden") { create(); return; } // app switch / phone locked: keep what was typed
    timer.current = setTimeout(() => { if (!rootRef.current?.contains(document.activeElement)) create(); }, 400);
  };
  return (
    <Sheet title="Wall by numbers" onClose={onClose} initialFocus={false}>
      <KeyboardSafe className="space-y-2">
        <div ref={rootRef} className="space-y-2"
          onKeyDownCapture={(e) => { if (e.key === "Enter") enterRef.current = true; }}
          onKeyDown={(e) => {
            enterRef.current = false;
            if (e.key !== "Enter" || !e.target.closest?.("[data-new-wall-name]")) return;
            e.preventDefault();
            if (!create()) rootRef.current?.querySelector("[data-new-wall-length] input")?.focus();
          }}
          onBlur={(e) => { if (!rootRef.current?.contains(e.relatedTarget)) createWhenLeft(); }}>
          <div data-new-wall-name=""><TextField label="Wall name" value={name} onChange={setName} /></div>
          <Chips label="Shape" value={kind} options={SHAPES} onChange={(k) => { setKind(k); create({ kind: k }); }} />
          <div data-new-wall-length="">
            <NumberField label="Wall length" autoFocus value={null} min={1} max={MAX_MM}
              onCommit={(n) => { lengthRef.current = n; if (enterRef.current) create(); else createWhenLeft(); }}
              help="Horizontal length along the wall. Heights come next — the elevation appears once they're entered." />
          </div>
        </div>
      </KeyboardSafe>
    </Sheet>
  );
}

/** Numeric wall fields — authoritative; incoherent combinations stay in the field as a draft with a message. */
function WallFields({ wall, canEdit, lengthMm, onPatch, onTrace, autoFocusFirst, focusField = null }) {
  const inp = wall.inputs || {};
  const kind = inp.kind || "rect";
  const traced = isTraced(wall);
  const [errs, setErrs] = useState({});
  const W = traced ? lengthMm : inp.widthMm;
  const check = (next, field) => {
    const width = field === "widthMm" ? next.widthMm : W;
    if (kind === "gable") {
      if (next.apexXMm != null && width && (next.apexXMm <= 0 || next.apexXMm >= width)) return [field === "widthMm" ? "widthMm" : "apexXMm", `The apex must sit between the two wall ends (more than 0 and less than ${fmtMm(width)} mm).`];
      if (next.apexHeightMm != null && next.eavesHeightMm != null && next.apexHeightMm <= next.eavesHeightMm) return [field, "The apex must be higher than the eaves."];
    }
    return null;
  };
  const commit = (field, n) => {
    const next = { ...inp, [field]: n };
    const bad = check(next, field);
    if (bad) { setErrs({ [bad[0]]: bad[1] }); return; }
    setErrs({});
    onPatch({ [field]: n });
  };
  const setShape = (k) => {
    if (k === kind) return;
    const h = inp.heightMm ?? (Math.max(inp.startHeightMm || 0, inp.endHeightMm || 0) || inp.eavesHeightMm || null);
    const patch = { kind: k };
    if (k === "rect" && inp.heightMm == null && h) patch.heightMm = h;
    if (k === "rake") { if (inp.startHeightMm == null && h) patch.startHeightMm = h; if (inp.endHeightMm == null && h) patch.endHeightMm = h; }
    if (k === "gable" && inp.eavesHeightMm == null && h) patch.eavesHeightMm = h;
    setErrs({});
    onPatch(patch);
  };
  const missing = missingHeights(inp);
  // HUB 029: the field a fix row asked for wins; otherwise the first missing height
  const af = (f) => (focusField ? focusField === f : autoFocusFirst && missing[0] === f);
  const nf = (field, label, help) => (
    <div data-field={field}>
      <NumberField label={label} value={inp[field] ?? null} min={field === "apexXMm" ? 0 : 1} max={MAX_MM} autoFocus={af(field)} onCommit={(n) => commit(field, n)} error={errs[field]} help={help} />
    </div>
  );
  if (!canEdit) {
    return <p className="text-sm text-ink" data-wall-summary="">{SHAPE_LABEL[kind]} · {fmtMm(W)} mm long · {heightsText(inp) || "heights not entered"}</p>;
  }
  return (
    <div className="space-y-2">
      <CommitText label="Wall name" value={wallName(wall)} onCommit={(v) => onPatch({ name: v || null })} />
      {kind === "polygon" ? <p className="text-sm text-ink">Shape: <b>traced outline</b> — heights come from the traced elevation.</p> : <Chips label="Shape" value={kind} options={SHAPES} onChange={setShape} />}
      {traced ? (
        <div className="rounded-lg border border-hairline bg-page px-3 py-2 text-sm" data-field="widthMm">
          <span className="block text-xs font-medium text-muted">{isTracedOutline(wall) ? "Outline width (traced)" : "Wall length (traced)"}</span>
          <span className="font-semibold text-ink" data-traced-length="">{fmtMm(Math.round((lengthMm || 0) * 10) / 10)} mm</span>
          <span className="block text-[11px] text-muted">Measured on the plan — retrace the wall to change it.{onTrace ? "" : " (No plan on this takeoff.)"}</span>
        </div>
      ) : (
        <div data-field="widthMm"><NumberField label="Wall length" value={inp.widthMm ?? null} min={1} max={MAX_MM} autoFocus={focusField === "widthMm"} onCommit={(n) => commit("widthMm", n)} error={errs.widthMm} /></div>
      )}
      {kind === "rect" && nf("heightMm", "Wall height", "Cladding boundary height — not automatically slab-to-ceiling")}
      {kind === "rake" && <div className="grid grid-cols-2 gap-2">{nf("startHeightMm", "Height at start")}{nf("endHeightMm", "Height at end")}</div>}
      {kind === "gable" && (
        <div className="grid grid-cols-2 gap-2">
          {nf("eavesHeightMm", "Eaves height")}
          {nf("apexHeightMm", "Apex height")}
          <div className="col-span-2">{nf("apexXMm", "Apex position from start", "Entered — roof pitch is never inferred from the plan")}
            {W > 0 && <Btn kind="ghost" onClick={() => commit("apexXMm", Math.round(W / 2))}>Centre ({fmtMm(Math.round(W / 2))})</Btn>}
          </div>
        </div>
      )}
    </div>
  );
}

function heightsText(inp = {}) {
  const k = inp.kind || "rect";
  if (k === "rect") return inp.heightMm ? `${fmtMm(inp.heightMm)} high` : null;
  if (k === "rake") return inp.startHeightMm && inp.endHeightMm ? `${fmtMm(inp.startHeightMm)} → ${fmtMm(inp.endHeightMm)} high` : null;
  if (k === "gable") return inp.eavesHeightMm && inp.apexHeightMm ? `eaves ${fmtMm(inp.eavesHeightMm)} · apex ${fmtMm(inp.apexHeightMm)}` : null;
  return "traced outline";
}

// ── the screen ──────────────────────────────────────────────────────────────────────────────────────────────

export default function WallsScreen({ ws, materialId, wallId, wallTab = null, onOpenWall, onTrace, onSetup, onClose, onReviewOrder = null, orderReady = true,
  // HUB 029: a fix row opens this wall at the field it needs (`focusField`); `backLabel` names the way back ("Done")
  focusField = null, backLabel = null }) {
  const view = ws.view;
  const canEdit = !!ws.capabilities?.edit;
  const material = view.materials.find((m) => m.id === materialId) || null;
  const results = ws.computed?.materialResults || {};
  const result = material ? results[material.id] || null : null;
  const histRef = useRef({ past: [], future: [] });
  const [hist, setHist] = useState({ past: 0, future: 0 });
  const [notice, setNotice] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draftReset, setDraftReset] = useState(0); // bumped by Undo to drop invalid field drafts (fields remount)
  const rootRef = useRef(null);
  const clearDraftRef = useRef(null);              // the editor's "cancel the unfinished new opening" (true when it did)

  const walls = view.measurements.filter((m) => m.kind === "wall" && !m.archived);
  const wall = wallId ? walls.find((w) => w.id === wallId) || null : null;
  useEffect(() => { if (wallId && !wall) onOpenWall?.(null); }, [wallId, wall, onOpenWall]);
  // HUB 022: which runs are opened out in the list (the run of a wall you come back from stays open)
  const [openRuns, setOpenRuns] = useState(() => new Set([runIdOf(wall)].filter(Boolean)));
  const toggleRun = (id) => setOpenRuns((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // "Other walls": open by itself while this material has no walls of its own (battens, accessories … are put on the
  // cladding's walls from there); once opened, or a wall in it is opened, it stays open for this visit
  const [othersOpen, setOthersOpen] = useState(null);
  // wall-by-wall step 5: the wall rows' chips fold under More (Heights needed / Needs attention stay out)
  const [rowMore, setRowMore] = useState(false);
  // stepping wall to wall keeps the view you are on (Cladding / Supports / Accessories) — for the wall stepped TO only,
  // so a wall opened any other way (the list, Wall by numbers) starts on its own view
  const tabRef = useRef(null);
  const [stepTab, setStepTab] = useState(null);   // { id, tab }
  const openFromList = (id) => { setStepTab(null); onOpenWall?.(id); };
  // an opening's or a joint row's sheet is open: the wall-to-wall buttons step aside so the drawing keeps its room
  const [editingSheet, setEditingSheet] = useState(false);

  // A typed number counts once the page is hidden (app switch, reload, the phone locking): blur the field so it
  // commits — and is written to device recovery — instead of being lost. Invalid text stays as it is.
  useEffect(() => {
    const commitTyped = () => {
      const el = document.activeElement;
      if (el && rootRef.current?.contains(el) && el.tagName === "INPUT") el.blur();
    };
    const vis = () => { if (document.visibilityState === "hidden") commitTyped(); };
    document.addEventListener("visibilitychange", vis, true);
    window.addEventListener("pagehide", commitTyped, true);
    return () => { document.removeEventListener("visibilitychange", vis, true); window.removeEventListener("pagehide", commitTyped, true); };
  }, []);

  // session undo/redo — each op stores the partial change-set to re-apply and to revert (as MeasureScreen)
  const sync = () => setHist({ past: histRef.current.past.length, future: histRef.current.future.length });
  function record(op) {
    ws.edit(op.redo);
    histRef.current = { past: [...histRef.current.past, op].slice(-100), future: [] };
    sync();
  }
  function undo() {
    // An invalid field draft, or an unfinished new opening, is what Undo clears first — never an earlier edit.
    if (rootRef.current?.querySelector('input[aria-invalid="true"]')) { setDraftReset((n) => n + 1); return; }
    if (clearDraftRef.current?.()) return;
    const h = histRef.current;
    if (!h.past.length) return;
    const op = h.past[h.past.length - 1];
    ws.edit(op.undo);
    histRef.current = { past: h.past.slice(0, -1), future: [op, ...h.future] };
    setNotice(null);
    sync();
  }
  function redo() {
    const h = histRef.current;
    if (!h.future.length) return;
    const [op, ...rest] = h.future;
    ws.edit(op.redo);
    histRef.current = { past: [...h.past, op], future: rest };
    sync();
  }

  const openingsOf = (wid) => view.measurements.filter((m) => m.kind === "opening" && m.parentId === wid && !m.archived);
  // HUB 017: a field's save builds on the wall's LATEST inputs, so two quick entries (e.g. Centre tapped while the apex
  // field is still focused) never overwrite each other
  const latestView = useRef(view);
  latestView.current = view;
  const act = {
    createWall({ name, kind, widthMm }) {
      const id = orderedId(), cid = newId();   // walls saved together come back in the order made (step 5)
      const meas = { id, kind: "wall", documentId: null, pageIndex: null, calibrationId: null, points: null, parentId: null, label: null, inputs: { kind, widthMm, name } };
      const con = material ? [{ id: cid, measurementId: id, jobMaterialId: material.id, role: "wall" }] : [];
      record({ redo: partial({ measurements: [meas], contributions: con }), undo: partial({ archive: { measurements: [id], contributions: con.map((c) => c.id) } }) });
      setAdding(false);
      setNotice(null);
      setStepTab(null);
      onOpenWall?.(id);
    },
    updateWall(w, patch) {
      const latest = latestView.current.measurements.find((m) => m.id === w.id) || w;
      const before = mRec(latest);
      record({ redo: partial({ measurements: [{ ...before, inputs: { ...(latest.inputs || {}), ...patch } }] }), undo: partial({ measurements: [before] }) });
    },
    removeWall(w) {
      const ops = openingsOf(w.id);
      const ids = new Set([w.id, ...ops.map((o) => o.id)]);
      const cons = view.contributions.filter((c) => ids.has(c.measurementId) && !c.archived);
      // the wall goes for EVERY material using it (or its openings) — say which others lost it
      const others = [...new Set(cons.map((c) => c.jobMaterialId))].filter((id) => id !== material?.id).map((id) => view.materials.find((m) => m.id === id)?.name).filter(Boolean);
      record({ redo: partial({ archive: { measurements: [...ids], contributions: cons.map((c) => c.id) } }), undo: partial({ measurements: [mRec(w), ...ops.map(mRec)], contributions: cons.map(cRec) }) });
      setNotice(`Removed ${wallName(w)}${ops.length ? ` and its ${plural(ops.length, "opening")}` : ""}.${others.length ? ` Also gone from ${others.join(", ")}.` : ""}`);
      onOpenWall?.(null);
    },
    setAttached(w, on) {
      if (!material) return;
      if (on) {
        const con = { id: newId(), measurementId: w.id, jobMaterialId: material.id, role: "wall" };
        record({ redo: partial({ contributions: [con] }), undo: partial({ archive: { contributions: [con.id] } }) });
      } else {
        const cons = view.contributions.filter((c) => c.measurementId === w.id && c.jobMaterialId === material.id && !c.archived);
        record({ redo: partial({ archive: { contributions: cons.map((c) => c.id) } }), undo: partial({ contributions: cons.map(cRec) }) });
      }
    },
    createOpening(w, inputs) {
      const id = newId();
      const meas = openingRecord(id, w.id, inputs);   // the same record as an opening drawn on the plan
      record({ redo: partial({ measurements: [meas] }), undo: partial({ archive: { measurements: [id] } }) });
      return id;
    },
    updateOpening(o, patch) {
      const before = mRec(o);
      record({ redo: partial({ measurements: [{ ...before, inputs: { ...(o.inputs || {}), ...patch } }] }), undo: partial({ measurements: [before] }) });
    },
    removeOpening(o) {
      const cons = view.contributions.filter((c) => c.measurementId === o.id && !c.archived);
      record({ redo: partial({ archive: { measurements: [o.id], contributions: cons.map((c) => c.id) } }), undo: partial({ measurements: [mRec(o)], contributions: cons.map(cRec) }) });
    },
    /** @param {string[]} drop rule keys to remove  @param {string[]} settled "check these" flags (rules.carried) this edit answers */
    updateRules(patch, drop = [], settled = []) {
      if (!material) return;
      const before = matRec(material);
      const rules = { ...(material.rules || {}), ...patch };
      for (const k of drop) delete rules[k];
      if (settled.length && rules.carried) {
        const carried = { ...rules.carried };
        for (const k of settled) delete carried[k];
        if (Object.keys(carried).length) rules.carried = carried; else delete rules.carried;
      }
      record({ redo: partial({ materials: [{ ...before, rules }] }), undo: partial({ materials: [before] }) });
    },
  };

  const headerActions = (
    <>
      <SaveChip status={ws.status} />
      <Btn kind="ghost" className="min-w-[44px]" onClick={undo} disabled={!hist.past} aria-label="Undo">↶</Btn>
      <Btn kind="ghost" className="min-w-[44px]" onClick={redo} disabled={!hist.future} aria-label="Redo">↷</Btn>
    </>
  );
  const saveBanner = ws.saveError ? (
    <Banner tone={ws.status === "unsynced" ? "warn" : "error"} action={ws.rejected ? <div className="flex gap-1"><Btn onClick={ws.retryRejected}>Try again</Btn><Btn kind="ghost" onClick={ws.discardRejected}>Discard</Btn></div> : null}>
      {ws.rejected ? `Not saved: ${ws.saveError}` : ws.saveError}
    </Banner>
  ) : null;

  // wall-by-wall step 5: the walls of this material in review order (runs by number, walls in tap order, then the rest)
  const order = material ? reviewWalls(view.measurements, view.contributions, material.id) : [];
  if (wall) {
    const at = order.findIndex((w) => w.id === wall.id);
    const go = (w) => { if (!w) return; setStepTab({ id: w.id, tab: tabRef.current }); onOpenWall?.(w.id); };
    const last = at === order.length - 1;
    // ‹ Previous wall / Next wall › at the bottom of every wall in the order; the last wall goes on to the order (only
    // once there is something to order, as the overview's Review & export order). A wall this material doesn't use
    // (opened from Other walls) has none until you tap Use here; they step aside while an opening or joint row is edited.
    const nav = at >= 0 && !editingSheet ? (
      <nav aria-label="Wall to wall" data-wall-nav="" className="flex shrink-0 items-center gap-2 border-t border-hairline bg-white px-2 pt-1"
        style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}>
        <Btn onClick={() => go(order[at - 1])} disabled={at === 0}>‹ Previous wall</Btn>
        <span className="min-w-0 flex-1 text-center text-xs text-muted">
          <span className="block" data-wall-nav-count="">{at + 1} of {order.length}</span>
          {last && onReviewOrder && !orderReady && <span className="block text-[11px] font-medium text-amber-800" data-wall-nav-note="">Nothing to order yet</span>}
        </span>
        {!last
          ? <Btn kind="primary" onClick={() => go(order[at + 1])}>Next wall ›</Btn>
          : onReviewOrder && <Btn kind="primary" onClick={onReviewOrder} disabled={!orderReady}>Review order ›</Btn>}
      </nav>
    ) : null;
    return (
      <FocusedWindow title={wallName(wall)} subtitle={`${material?.name || "Walls"} · ${provenanceText(wall)}`} onClose={() => { setStepTab(null); onOpenWall?.(null); }} closeLabel={backLabel || "‹ Walls"} actions={headerActions} footer={nav}>
        <div ref={rootRef} className="contents">
          <WallEditor key={wall.id} ws={ws} view={view} wall={wall} material={material} results={results} canEdit={canEdit} act={act} onTrace={onTrace} onSetup={onSetup} saveBanner={saveBanner}
            initialTab={wallTab || (stepTab?.id === wall.id ? stepTab.tab : null)} footerBelow={at >= 0} onEditingSheet={setEditingSheet}
            tabRef={tabRef} draftReset={draftReset} clearDraftRef={clearDraftRef} focusField={focusField} />
        </div>
      </FocusedWindow>
    );
  }

  const nextName = (() => { let n = walls.length + 1; const names = new Set(walls.map(wallName)); while (names.has(`Wall ${n}`)) n++; return `Wall ${n}`; })();
  const attribution = material ? attributeProblems(view, material, result) : null;
  // HUB 022: this material's walls first (runs as one item each); walls on other materials fold away
  const usedBy = (w) => [...new Set(view.contributions.filter((c) => c.measurementId === w.id && !c.archived).map((c) => c.jobMaterialId))].map((id) => view.materials.find((m) => m.id === id)).filter(Boolean);
  const mine = material ? walls.filter((w) => usedBy(w).some((m) => m.id === material.id)) : walls;
  const others = material ? walls.filter((w) => !usedBy(w).some((m) => m.id === material.id)) : [];
  const runs = wallRuns(view.measurements);
  const othersShown = othersOpen ?? !mine.length;
  const rowInfo = (w) => {
    const inp = w.inputs || {};
    const users = usedBy(w);
    const attached = !!material && users.some((m) => m.id === material.id);
    const needsHeights = missingHeights(inp).length > 0;
    return { inp, users, attached, needsHeights, blocked: attached && !needsHeights && (attribution?.byWall.get(w.id) || []).some((p) => p.blocking !== false) };
  };
  const wallRow = (w) => {
    const { inp, users, attached, needsHeights, blocked } = rowInfo(w);
    const k = inp.kind || "rect";
    const len = isTraced(w) ? tracedLengthMm(w, view.calibrations) : inp.widthMm;
    const hText = heightsText(inp);
    const nOpen = openingsOf(w.id).length;
    const tag = attached ? wallTag(view, material.id, w) : null;
    const q = attached ? qtyChips(wallQuantities(result, w.id, tag)) : [];
    return (
      <li key={w.id} className="py-2" data-wall-row={w.id}>
        <button type="button" onClick={() => { if (material && !attached) setOthersOpen(true); openFromList(w.id); }}
          className="flex min-h-[48px] w-full items-center gap-2 rounded-lg px-1 text-left hover:bg-page" aria-label={`Open ${wallName(w)}`}>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{wallName(w)}</span>
            <span className="block text-[11px] text-muted">{SHAPE_LABEL[k]} · {fmtMm(Math.round((len || 0) * 10) / 10)} mm long{hText ? ` · ${hText}` : ""}{nOpen ? ` · ${plural(nOpen, "opening")}` : ""}</span>
            <span className={`flex flex-wrap gap-1 ${needsHeights || blocked || rowMore ? "mt-1" : ""}`}>
              {/* what blocks the order stays out; the rest folds under the list's More (wall-by-wall step 5) */}
              {needsHeights && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Heights needed</span>}
              {blocked && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700" data-wall-blocked="">Needs attention</span>}
              <span className={rowMore ? "contents" : "hidden"} data-row-more="">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">{isTracedOutline(w) ? "Traced elevation" : isTraced(w) ? "From plan" : "Entered"}</span>
                {users.map((m) => <span key={m.id} className={`rounded-full px-2 py-0.5 text-[11px] ${material && m.id === material.id ? "bg-primary/10 font-semibold text-primary" : "bg-page text-muted"}`}>{m.name}</span>)}
                {q.map((t) => <span key={t} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">{t}</span>)}
              </span>
            </span>
          </span>
          <span aria-hidden="true" className="text-muted">›</span>
        </button>
      </li>
    );
  };
  const listItems = (list) => wallListItems(list, runs).map((it) => {
    if (it.wall) return wallRow(it.wall);
    const open = openRuns.has(it.run.id);
    const info = it.walls.map(rowInfo);
    const total = it.walls.reduce((a, w) => a + (tracedLengthMm(w, view.calibrations) || 0), 0);
    const label = runLabel(it.run, it.walls);
    return (
      <li key={it.run.id} className="py-2" data-wall-run={it.run.id}>
        <button type="button" onClick={() => toggleRun(it.run.id)} aria-expanded={open}
          className="flex min-h-[48px] w-full items-center gap-2 rounded-lg px-1 text-left hover:bg-page">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink" data-run-label="">{label}</span>
            <span className="block text-[11px] text-muted">{fmtMm(Math.round(total * 10) / 10)} mm long · From plan</span>
            {(info.some((x) => x.needsHeights) || info.some((x) => x.blocked)) && (
              <span className="mt-1 flex flex-wrap gap-1">
                {info.some((x) => x.needsHeights) && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Heights needed</span>}
                {info.some((x) => x.blocked) && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700" data-run-blocked="">Needs attention</span>}
              </span>
            )}
          </span>
          <span aria-hidden="true" className="text-muted">{open ? "▾" : "▸"}</span>
        </button>
        {open && <ul className="ml-2 divide-y divide-hairline border-l border-hairline pl-2" data-run-walls="">{it.walls.map(wallRow)}</ul>}
      </li>
    );
  });
  return (
    <FocusedWindow title={material?.name || "Walls"} subtitle="Walls" onClose={onClose} closeLabel="Back" actions={headerActions}>
      <div ref={rootRef} className="contents">
      <KeyboardSafe className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-3 p-3">
          {!material && <Banner tone="warn">This material is no longer in the takeoff. Go back and choose one.</Banner>}
          {material && <StatusSummary view={view} material={material} result={result} computedError={ws.computed?.error} canEdit={canEdit} onSetup={onSetup} readable={readableFor(view)} />}
          {notice && <Banner tone="info" action={hist.past ? <Btn onClick={undo}>Undo</Btn> : null}>{notice}</Banner>}
          <section aria-label="Walls" className="space-y-2 rounded-card border border-hairline bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="flex-1 text-sm font-semibold text-ink">Walls <span className="font-normal text-muted">({mine.length})</span></h2>
              {walls.length > 0 && <Btn kind="ghost" aria-expanded={rowMore} onClick={() => setRowMore((v) => !v)} data-rows-more="">More <span aria-hidden="true">{rowMore ? "▾" : "▸"}</span></Btn>}
              {/* wall-by-wall step 5: review every wall of this material in run order, then the order */}
              {order.length > 0 && <Btn onClick={() => openFromList(order[0].id)} data-review-walls="">Review walls</Btn>}
            </div>
            {canEdit && material && (
              <div className="grid grid-cols-2 gap-2">
                <Btn kind="primary" onClick={() => { setNotice(null); setAdding(true); }}>Wall by numbers</Btn>
                {onTrace ? <Btn onClick={onTrace}>Trace on plan</Btn> : <span />}
              </div>
            )}
            {!mine.length && <p className="text-sm text-muted">{walls.length && material
              ? FOLLOWERS.has(material.spec?.family)
                ? `No walls use ${material.name} yet. Open a wall under Other walls and tap Use here.`
                // HUB 028: a Walls item reads a wall's height as the stud length, so it doesn't send you to another
                // material's walls (a cladding height, or a wall another Walls item already frames)
                : isWallsItem(material) ? `No walls use ${material.name} yet. Trace or add one.`
                : `No walls use ${material.name} yet. Trace or add one, or open a wall under Other walls.`
              : usesLine(material)
                ? "No walls yet. Trace on plan: type the wall height, then tap each corner. Or add one by numbers (length and heights)."
                : "No walls yet. Add one by numbers (length and heights), or trace its run on the plan and enter the heights."}</p>}
            <ul className="divide-y divide-hairline">{listItems(mine)}</ul>
            {others.length > 0 && (
              <details className="rounded-lg border border-hairline" data-other-walls="" open={othersShown} onToggle={(e) => setOthersOpen(e.currentTarget.open)}>
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-2 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
                  <span className="flex-1">Other walls ({others.length})</span><span aria-hidden="true" className="text-muted">{othersShown ? "▾" : "▸"}</span></summary>
                <p className="px-2 text-[11px] text-muted">Walls on other materials. Open one to use {material?.name || "this material"} on it.</p>
                <ul className="divide-y divide-hairline px-1">{listItems(others)}</ul>
              </details>
            )}
          </section>
          {saveBanner}
        </div>
      </KeyboardSafe>
      {adding && canEdit && <NewWallSheet key={draftReset} defaultName={nextName} onCreate={act.createWall} onClose={() => setAdding(false)} />}
      </div>
    </FocusedWindow>
  );
}

// ── wall editor ─────────────────────────────────────────────────────────────────────────────────────────────

const ACCESSORY_SCOPE_LABEL = { starter: "Starter / base trim", corners: "Corner trims", joints: "Joint / backing strips", openings: "Opening head / sill / jamb", membrane: "Membrane / wrap",
  tape: "Tape", sealant: "Sealant", fixings: "Fixings", mesh: "Mesh / render" };
const SCOPE_TEXT = { include: "Include", "by-others": "By others", exclude: "Exclude", unresolved: "Not decided" };
const GROUP_STATE_TEXT = { calculated: "calculated", manual: "entered", estimate: "estimate", unresolved: "not resolved", omitted: "not ordered" };

/** The setout fields this method takes (sheet strips from the wall start; courses / boards from 0 or below). */
function setoutFor(material) {
  if (!material) return null;
  const horizontal = material.spec?.orientation === "horizontal";
  if (material.methodKey === "sheet_layout") {
    return { unit: "sheet", what: "Sheets", min: 0, label: horizontal ? "Setout starts at (up from the wall base)" : "Setout starts at (from the wall start)",
      help: "This wall only — other walls keep their own setout. Default is the wall start; panels are never re-centred automatically." };
  }
  if (material.methodKey === "course_layout") {
    return { unit: "piece", what: horizontal ? "Course boards" : "Boards", min: -MAX_MM, max: 0, label: horizontal ? "First course starts at (from the wall base)" : "First board starts at (from the wall start)",
      help: "This wall only. 0 = the wall base/start; a negative value starts with a cut first course. Never re-centred automatically." };
  }
  return null;
}

function WallEditor({ ws, view, wall, material, results, canEdit, act, onTrace, onSetup = null, saveBanner, draftReset, clearDraftRef, initialTab = null, tabRef = null,
  footerBelow = false, onEditingSheet = null, focusField = null }) {
  const fam = material?.spec?.family;
  const [tab, setTab] = useState(initialTab || (fam === "batten" || fam === "timber" ? "supports" : fam === "accessory" ? "accessories" : "cladding"));
  useEffect(() => { if (tabRef) tabRef.current = tab; }, [tab, tabRef]);
  const [pick, setPick] = useState(null);
  const [sel, setSel] = useState(null);           // { kind: "opening"|"newOpening"|"item"|"jointRow", id? }
  const [placing, setPlacing] = useState(false);
  const [draft, setDraft] = useState(null);       // new opening before it is valid
  const [drag, setDrag] = useState(null);         // { id, xMm, sillMm } live preview while dragging
  const [focusToken, setFocusToken] = useState(0);
  const [datumChange, setDatumChange] = useState(null); // { before, datumMm, key } — shown only while still true
  const [alignChange, setAlignChange] = useState(null); // the same for "Use this setout on every wall" (job-wide)
  const [autoFocusFirst] = useState(() => canEdit && missingHeights(wall.inputs || {}).length > 0);
  const elevRef = useRef(null);
  const drawingRef = useRef(null);
  const showDrawing = () => setTimeout(() => { try { (drawingRef.current || elevRef.current)?.scrollIntoView({ block: "start" }); } catch { /* old browser */ } }, 0);

  const inputs = wall.inputs || {};
  const traced = isTraced(wall);
  const lengthMm = traced ? tracedLengthMm(wall, view.calibrations) : inputs.widthMm;
  const openingsRaw = view.measurements.filter((m) => m.kind === "opening" && m.parentId === wall.id && !m.archived);
  const openings = openingsRaw.map((o) => {
    const x = o.inputs || {};
    const d = drag && drag.id === o.id ? drag : null;
    return { id: o.id, xMm: d ? d.xMm : x.xMm, sillMm: d ? d.sillMm : x.sillMm, widthMm: x.widthMm, heightMm: x.heightMm, label: x.label || "", type: x.type || "window", rec: o };
  });
  const contribs = view.contributions.filter((c) => c.measurementId === wall.id && !c.archived);
  const onWall = [...new Set(contribs.map((c) => c.jobMaterialId))].map((id) => view.materials.find((m) => m.id === id)).filter(Boolean);
  const attached = !!material && onWall.some((m) => m.id === material.id);
  const openingLabel = (id) => openings.find((o) => o.id === id)?.label || "an opening";
  const readableText = readableTextFor(view);
  const entries = onWall.map((m) => {
    const r = results[m.id] || null;
    return { material: m, result: r, layout: r?.layouts?.find((l) => l.wallId === wall.id) || null, tag: wallTag(view, m.id, wall), wallId: wall.id, openingLabel, readable: readableText };
  }).sort((a, b) => (a.material.id === material?.id ? -1 : b.material.id === material?.id ? 1 : 0));
  const geom = wallGeometry(wall, view.calibrations, entries.map((e) => e.layout).filter(Boolean));
  const polygon = geom.polygon;
  const bbox = polygon ? { x0: Math.min(...polygon.map((p) => p.x)), x1: Math.max(...polygon.map((p) => p.x)), y0: Math.min(...polygon.map((p) => p.y)), y1: Math.max(...polygon.map((p) => p.y)) } : null;
  const areas = areasFor(polygon, openings);
  // C0 display: which openings stick out past the wall (only the on-wall part is deducted) or miss it entirely
  const openingIssue = (id) => {
    const p = (areas?.problems || []).find((x) => (x.refs || []).some((r) => r.openingId === id));
    return !p ? null : p.code === "opening_outside_wall" ? "outside" : p.code === "opening_clipped" ? "clipped" : "invalid";
  };
  const drawnOpenings = openings.map((o) => ({ ...o, issue: openingIssue(o.id) === "invalid" ? null : openingIssue(o.id) }));

  const attributed = new Map(entries.map((e) => [e.material.id, attributeProblems(view, e.material, e.result)]));
  const wallProblemsByMat = new Map(entries.map((e) => [e.material.id, attributed.get(e.material.id).byWall.get(wall.id) || []]));
  const cladEntries = entries.filter((e) => CLADDING_METHODS.has(e.result?.methodKey || e.material.methodKey));
  const framingEntries = entries.filter((e) => isWallsItem(e.material)); // HUB 028 Walls items on this wall
  const shownClad = cladEntries.find((e) => e.material.id === pick) || cladEntries[0] || null;
  const autoJointsHere = (shownClad?.layout?.joints || []).filter((j) => j.source === "auto");
  const accessoryEntries = entries.filter((e) => e.material.spec?.family === "accessory");
  // a stud wall frames each opening from its framing detail (03 T4) — edited in the opening's sheet (a Walls item's
  // studs too, HUB 028: wall_framing lays its studs out the same way)
  const studEntry = entries.find((e) => ["wall_frame", "wall_framing"].includes(e.result?.methodKey || e.material.methodKey)) || null;

  // elements of the ONE view shown
  // (notes = counts shown by the drawing; about = the explanations, folded under More — wall-by-wall step 5)
  let elements = { items: [], guides: [], notes: [], about: [], totals: null, sheetInfo: null };
  if (polygon && tab === "cladding" && shownClad) elements = { about: [], ...claddingElements(shownClad, bbox, wallProblemsByMat.get(shownClad.material.id) || []), totals: null };
  if (polygon && tab === "supports") {
    const s = supportElements(entries.filter((e) => !CLADDING_METHODS.has(e.result?.methodKey || e.material.methodKey) && e.material.spec?.family !== "accessory"), bbox, polygon);
    const f = followerElements(cladEntries);
    elements = { items: [...f.items, ...s.items], guides: [], notes: [...f.notes, ...s.notes], about: [...f.about, ...s.about], totals: null };
  }
  if (polygon && tab === "accessories") { const a = accessoryElements(polygon, openings, cladEntries); elements = { items: a.items, guides: [], notes: [], about: [], totals: a.totals }; }
  const hitItems = elements.items.filter((it) => it.hit !== false);
  const selItem = sel?.kind === "item" ? hitItems.find((it) => it.id === sel.id) || null : null;
  const selOpening = sel?.kind === "opening" ? openings.find((o) => o.id === sel.id) || null : null;
  // the automatic battens read "Batten" in the legend (a support layer set up by hand stays "Support")
  const legend = (LEGEND[tab] || []).filter(([state]) => elements.items.some((it) => it.state === state))
    .map(([state, text, cls]) => [state, state === "support" && elements.items.filter((it) => it.state === "support").every((it) => it.auto) ? "Batten" : text, cls]);
  // the Supports tab with no battens: say why, in the cladding's own terms (only Axon, Linea / Stria and timber cladding
  // work out their own battens; direct-fixed cladding has none; anything else needs a Support battens material)
  const supportsEmpty = (() => {
    const rules = cladEntries.map((e) => { let n = null; try { n = normaliseFamilySpec(e.material.spec); } catch { /* a malformed spec has no rule */ } return { e, n, rule: n ? followerRule({ ...e.material, rules: { ...(e.material.rules || {}), route: undefined } }, n) : null }; });
    const auto = rules.find((x) => x.rule && x.rule.battens && x.e.material.rules?.route !== "direct");
    if (auto) return `No battens on this wall yet. ${auto.e.material.name} works out its own battens once its sheets or boards are laid out on this wall.`;
    const direct = rules.find((x) => x.rule && x.e.material.rules?.route === "direct");
    if (direct) return `${direct.e.material.name} is direct fixed, so it has no battens.`;
    return `No support layer on this wall. Battens and rails are their own material — add one and attach it to this wall.${cladEntries.length ? " Support spacing for the cladding stays source-pending until a reviewed rule or project detail is recorded — it is not calculated here." : ""}`;
  })();

  // problems shown in place: everything blocking on this wall (incl. openings off the wall); a clipped opening is a
  // note on its own row only
  const measProblems = [...new Set((ws.computed?.contributions || []).filter((c) => c.measurementId === wall.id).flatMap((c) => c.problems || []))].map((code) => MEAS_PROBLEM[code]).filter(Boolean);
  const readable = readableFor(view);
  const inPlace = entries.flatMap((e) => (wallProblemsByMat.get(e.material.id) || []).filter((p) => p.code !== "opening_clipped")
    .map((p) => ({ ...readable(p), materialName: OPENING_GEOMETRY.has(p.code) ? null : e.material.name, materialId: e.material.id })));
  // wall-by-wall step 5: a problem with the material itself (no wall named: missing product sizes, an unfinished setup)
  // blocks the order for every wall, so it shows here too, with the material's Setup — the review never walks past it
  // HUB 028: a Walls item's parts' needs are ONE banner ("Walls: 3 parts need setup (studs, plates and noggins).",
  // the parts "Details: n to fix" counts) with one Setup; the needs themselves are on the Walls card
  const materialBlocking = entries.flatMap((e) => {
    const general = (attributed.get(e.material.id)?.general || []).filter((p) => p.blocking !== false);
    const walls = isWallsItem(e.material);
    const partNeed = walls ? wallPartsNeedText(e.result) : "";
    return [...(partNeed ? [{ code: "material_incomplete", message: partNeed, blocking: true }] : []),
      ...general.filter((p) => !(walls && p.code === "material_incomplete" && p.part)).map(readable)]
      .map((p) => ({ ...p, materialName: e.material.name, materialId: e.material.id, material: e.material, general: true }));
  });
  const seenMat = new Set();
  const blockingHere = [...dedupe(inPlace.filter((p) => p.blocking !== false)),
    ...materialBlocking.filter((p) => { const key = `${p.materialId}|${p.message}`; return seenMat.has(key) ? false : (seenMat.add(key), true); })];
  const notesHere = dedupe(inPlace.filter((p) => p.blocking === false
    // a Walls item's lintels note names every wall's openings: this wall's own version leads the page (framingLines)
    && !(p.code === "opening_framing_not_counted" && framingEntries.some((e) => e.material.id === p.materialId))));
  const blockingFor = (id) => blockingHere.some((p) => p.materialId === id);
  const openingProblem = (id) => {
    const k = openingIssue(id);
    return !k ? null : k === "outside" ? "Outside the wall — move it onto the wall." : k === "clipped" ? "Extends past the wall edge — only the part on the wall is deducted." : "Needs a width, height, sill and offset.";
  };
  const tooTall = blockingHere.find((p) => p.code === "sheet_too_tall" && p.materialId === material?.id);

  // setout datum (sheets / courses) — per WALL (rules.datumByWall[wallId], else the material default rules.datumMm;
  // F14): changing it here moves this wall only, and its quantity change on THIS wall is shown only while it is
  // still the reason. Moving every wall is the explicit "Use this setout on every wall" with a job-wide preview.
  const setout = setoutFor(material);
  const defaultDatum = material?.rules?.datumMm ?? 0;
  const datumOf = (w) => material?.rules?.datumByWall?.[w.id] ?? defaultDatum;
  const datumHere = datumOf(wall);
  const materialWallsHere = material ? materialWalls(view, material.id) : [];
  const sharedWallsOf = (m) => materialWalls(view, m.id).length;   // HUB 016b: the share-across-walls switch shows for 2+ walls
  const datumOthers = setout && attached ? materialWallsHere.filter((w) => w.id !== wall.id && datumOf(w) !== datumHere).map((w) => ({ wall: w, datumMm: datumOf(w) })) : [];
  const setoutQty = (() => {
    if (!material || !setout) return null;
    return demandsForWall(results[material.id], wall.id, wallTag(view, material.id, wall), { ownerOnly: true }).filter((d) => d.unit === setout.unit && !d.follower).reduce((t, d) => t + (d.quantity || 0), 0);
  })();
  const materialQty = material && setout ? (results[material.id]?.demands || []).filter((d) => d.unit === setout.unit && !d.follower).reduce((t, d) => t + (d.quantity || 0), 0) : null;
  const changeKeyFor = (rules) => {
    const r = { ...(rules || {}) };
    if (r.datumByWall) { r.datumByWall = { ...r.datumByWall }; delete r.datumByWall[wall.id]; if (!Object.keys(r.datumByWall).length) delete r.datumByWall; }
    return JSON.stringify([inputs, openingsRaw.map((o) => o.inputs), r, material?.spec]);
  };
  const changeKey = changeKeyFor(material?.rules);
  const datumShown = datumChange && datumHere === datumChange.datumMm && datumChange.key === changeKey ? datumChange : null;
  const allKeyFor = (rules) => {
    const r = { ...(rules || {}) };
    delete r.datumMm; delete r.datumByWall;
    return JSON.stringify([materialWallsHere.map((w) => [w.id, w.inputs, view.measurements.filter((m) => m.kind === "opening" && m.parentId === w.id && !m.archived).map((o) => o.inputs)]), r, material?.spec]);
  };
  const alignShown = alignChange && defaultDatum === alignChange.datumMm && !material?.rules?.datumByWall && alignChange.key === allKeyFor(material?.rules) ? alignChange : null;
  function alignAll() {
    setDatumChange(null);
    setAlignChange({ before: materialQty, datumMm: datumHere, key: allKeyFor(material.rules) });
    act.updateRules({ datumMm: datumHere }, ["datumByWall"]);
  }

  // live result next to the wall fields (the elevation can be scrolled out of view while typing)
  const mine = material ? entries.find((e) => e.material.id === material.id) : null;
  const mineQty = mine ? qtyChips(wallQuantities(mine.result, wall.id, mine.tag)) : [];
  // a Walls item (HUB 028) reads its own framing line here ("13 studs at 2,700 · bottom plate 6.00 m · …"), never its
  // studs, plates and noggins added up as "pieces"
  const mineFraming = mine && isWallsItem(mine.material) ? wallFramingText(wallFramingTotals(mine.result, wall.id)) : null;
  const resultLine = areas ? `Net ${fmtM2(areas.netM2)} m² of ${fmtM2(areas.grossM2)} m²${mine ? ` · ${mine.material.name}: ${mineFraming
    || (blockingFor(mine.material.id) ? "needs attention (see problems)" : mineQty.length ? mineQty.join(", ") : "nothing calculated yet")}` : ""}` : null;
  // wall-by-wall step 5: one short line per cladding on this wall (its sheets, battens, foam tape and H-flashing)
  const wallLines = cladEntries.map((e) => {
    const text = wallCladdingText(wallCladdingTotals(e.result, wall.id, e.tag));
    return { id: e.material.id, name: e.material.name, text: text || (blockingFor(e.material.id) ? "needs attention, see below" : "nothing worked out yet") };
  });
  // HUB 028: each Walls item on this wall leads with this wall's framing line ("13 studs at 2,700 · bottom plate 6.00 m ·
  // top plate 6.00 m · 9 noggins (1 row)") and its own notes: a long LVL plate ("Plates: 90 × 45 LVL (over 6.0 m)")
  // and the lintels note for this wall's openings
  const framingLines = framingEntries.map((e) => {
    const text = wallFramingText(wallFramingTotals(e.result, wall.id));
    return { id: e.material.id, name: e.material.name, text: text || (blockingFor(e.material.id) ? "needs attention, see below" : "nothing worked out yet"),
      notes: wallFramingNotes(e.result, wall.id, e.material.spec) };
  });

  // ── handlers ──
  // W1, D1 … per wall — the same rule as + Window / + Door on the plan (HUB 022 step 2)
  const nextLabel = (type) => nextOpeningLabel(openings.map((o) => o.label), type);
  // a tapped position centres the opening there, kept on the wall when it fits; typed numbers always win
  const draftValues = (d) => {
    if (!d) return null;
    const w = d.widthMm ?? null, h = d.heightMm ?? null;
    const fit = (v, lo, hi, size) => (bbox && size > 0 && hi - lo >= size ? Math.min(Math.max(v, lo), hi - size) : Math.max(lo ?? 0, v));
    const xMm = d.xMm ?? (Number.isFinite(d.tapX) ? fit(snap(d.tapX - (w || 0) / 2), Math.max(0, bbox?.x0 ?? 0), bbox?.x1, w) : null);
    const sillMm = d.sillMm ?? (d.type === "door" ? 0 : Number.isFinite(d.tapY) ? fit(snap(d.tapY - (h || 0) / 2), Math.max(0, bbox?.y0 ?? 0), bbox?.y1, h) : null);
    return { label: d.label, type: d.type, widthMm: w, heightMm: h, xMm, sillMm };
  };
  function startAddOpening() {
    setDraft({ label: nextLabel("window"), labelAuto: true, type: "window" });
    setSel({ kind: "newOpening" });
    if (polygon) { setPlacing(true); showDrawing(); } else setFocusToken((n) => n + 1);
  }
  function cancelAdd() { setDraft(null); setPlacing(false); setSel(null); }
  // Undo clears an unfinished new opening first (WallsScreen asks through this ref)
  useEffect(() => {
    clearDraftRef.current = () => { if (draft || placing || sel?.kind === "newOpening") { cancelAdd(); return true; } return false; };
  });
  useEffect(() => () => { clearDraftRef.current = null; }, [clearDraftRef]);
  function onDraftField(field, v) {
    const next = { ...draft, [field]: v };
    if (field === "label") next.labelAuto = false;
    if (field === "type" && draft.labelAuto) next.label = nextLabel(v);
    const val = draftValues(next);
    if (val.widthMm >= 1 && val.heightMm >= 1 && Number.isFinite(val.xMm) && val.xMm >= 0 && Number.isFinite(val.sillMm) && val.sillMm >= 0) {
      const id = act.createOpening(wall, { xMm: val.xMm, sillMm: val.sillMm, widthMm: val.widthMm, heightMm: val.heightMm, label: val.label || null, type: val.type || "window" });
      setDraft(null); setPlacing(false); setSel({ kind: "opening", id });
      return;
    }
    setDraft(next);
  }
  function onOpeningField(o, field, v) {
    const cur = o.rec.inputs || {};
    if (cur[field] === v || (field === "label" && (cur.label || "") === v)) return;
    act.updateOpening(o.rec, { [field]: field === "label" ? v || null : v });
  }
  function onTap({ xMm, yMm, hit }) {
    if (placing) {
      setDraft((d) => ({ ...(d || { label: nextLabel("window"), labelAuto: true, type: "window" }), tapX: snap(xMm), tapY: snap(yMm) }));
      setSel({ kind: "newOpening" });
      setFocusToken((n) => n + 1);
      return;
    }
    if (hit?.kind === "opening") setSel({ kind: "opening", id: hit.id });
    else if (hit?.kind === "item") setSel({ kind: "item", id: hit.id });
    else setSel(null);
  }
  function onDragOpening(id, pos, commit) {
    if (!pos) { setDrag(null); return; }
    if (!commit) { setDrag({ id, ...pos }); return; }
    setDrag(null);
    const o = openingsRaw.find((x) => x.id === id);
    if (o && (o.inputs?.xMm !== pos.xMm || o.inputs?.sillMm !== pos.sillMm)) act.updateOpening(o, { xMm: pos.xMm, sillMm: pos.sillMm });
  }
  const selectOpening = (id) => { setPlacing(false); setDraft(null); setSel({ kind: "opening", id }); showDrawing(); };

  const sheetOpen = !!sel;
  // an opening's or a joint row's sheet (tall, with the keypad) takes the wall-to-wall buttons' room while it is open
  const editingSheet = (sel?.kind === "opening" && !!selOpening) || sel?.kind === "newOpening" || (sel?.kind === "jointRow" && !!material);
  useEffect(() => { onEditingSheet?.(editingSheet); }, [editingSheet, onEditingSheet]);
  useEffect(() => () => onEditingSheet?.(false), [onEditingSheet]);
  const maxH = Math.round(Math.min((typeof window !== "undefined" ? window.innerHeight : 800) * (sheetOpen ? 0.3 : 0.42), 380));
  const dv = sel?.kind === "newOpening" ? draftValues(draft) : null;
  const shownDraft = dv && draft ? { ...dv, tapX: draft.tapX, tapY: draft.tapY } : null;
  const shownLayoutEmpty = !!shownClad && !layoutHasParts(shownClad.layout, shownClad.result?.methodKey || shownClad.material.methodKey);
  const si = elements.sheetInfo;
  // wall-by-wall step 5 (Sam's answer 3): the drawing's explanations fold under More with the chips and notes; the
  // counts, the share switch and the offcut list stay by the drawing
  const aboutDrawing = [
    ...(si ? [
      <p key="cut">A cut strip still uses a whole sheet.</p>,
      Number.isFinite(si.layoutCutM2) && <p key="m2">Layout cut {fmtM2(si.layoutCutM2)} m² · sheet stock {fmtM2(si.stockM2)} m² (spares are added in the schedule).</p>,
      si.acrossWalls ? (
        <p key="shared" data-sheet-shared="walls">Sheets and offcuts are shared across {(() => {
          // a wall of this cladding whose quantity is blocked isn't in the shared plan until it is fixed
          const all = shownClad?.material ? sharedWallsOf(shownClad.material) : si.acrossWalls.walls.length;
          return all > si.acrossWalls.walls.length ? `${si.acrossWalls.walls.length} of the ${all} walls` : `all ${si.acrossWalls.walls.length} walls`;
        })()} of {shownClad?.material?.name || "this cladding"}: {plural(si.acrossWalls.totalPieces, "piece")} from {plural(si.acrossWalls.totalSheets, "sheet")} in all, cut across their length only (the long factory edges stay), allowing {fmtMm(si.kerfMm)} mm per saw cut.{si.acrossWalls.fromOtherWalls ? ` ${plural(si.acrossWalls.fromOtherWalls, "piece")} on this wall come${si.acrossWalls.fromOtherWalls === 1 ? "s" : ""} from another wall's sheet or offcut — tap a piece to see which.` : ""}</p>
      ) : si.shared && si.pieces > si.sheets && <p key="shared" data-sheet-shared="">{si.pieces} pieces cut from {plural(si.sheets, "sheet")}: sheets are shared across the wall, cut across their length only (the long factory edges stay), allowing {fmtMm(si.kerfMm)} mm per saw cut.</p>,
    ] : []),
    ...(elements.about || []).map((n) => <p key={n} data-elevation-about="">{n}</p>),
    polygon && tab === "accessories" && elements.totals && <p key="routes">Route lengths only. Accessory quantities come from the accessory material and its reviewed details.</p>,
    ...(tab === "accessories" ? accessoryEntries.map((e) => (
      <p key={`scope-${e.material.id}`} data-accessory-about={e.material.id}>{e.material.name}: {Array.isArray(e.layout?.groups) ? "each group follows this wall's own routes." : "no accessory routes are calculated for this material yet. Quantities come from a reviewed detail."} “Not decided” is not the same as excluded.</p>
    )) : []),
  ].filter(Boolean);

  const dims = (
    // one DOM position (no remount → focus/keyboard kept); shown first until the elevation can be generated
    <section aria-label="Wall dimensions" data-keyboard-group="" className={`space-y-2 rounded-card border border-hairline bg-white p-3 ${polygon ? "" : "order-first"}`}>
      <h3 className="text-sm font-semibold text-ink">Wall</h3>
      <WallFields key={draftReset} wall={wall} canEdit={canEdit} lengthMm={lengthMm} onPatch={(p) => act.updateWall(wall, p)} onTrace={onTrace} autoFocusFirst={autoFocusFirst} focusField={canEdit ? focusField : null} />
      {resultLine && <p className="rounded-lg bg-page px-3 py-2 text-xs font-medium text-ink" data-wall-result="" data-keyboard-result="" aria-live="polite">{resultLine}</p>}
    </section>
  );

  return (
    <>
      <KeyboardSafe className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-3">
          {/* a wall opened from "Other walls": putting this material on it is the next step, so it is at the top
              (Materials on this wall, below, keeps the full Use / ✓ Uses / Remove wall) */}
          {canEdit && material && !attached && (
            <div data-use-here=""><Banner tone="info" action={<Btn kind="primary" onClick={() => act.setAttached(wall, true)} aria-label={`Use ${material.name} on this wall`}>Use here</Btn>}>
              {material.name} isn&apos;t on this wall yet.
              {/* HUB 028: a Walls item takes the wall's height as the stud length (a cladding's 2,745 buys longer studs) */}
              {isWallsItem(material) && Number(inputs.heightMm) > 0 && <> Its height, {fmtMm(Number(inputs.heightMm))}, would be the stud length.</>}</Banner></div>
          )}
          {/* wall-by-wall step 5: this wall's cladding quantities from the layout (sheets, battens, tape, H-flashing) in
              one short line, before spares — the same numbers the order adds up */}
          {(wallLines.length > 0 || framingLines.length > 0) && (
            <div className="space-y-0.5 rounded-card border border-hairline bg-white px-3 py-2 text-sm" data-wall-lines="">
              {framingLines.map((l) => (
                <div key={l.id} data-wall-line={l.id} data-wall-framing="">
                  <p><b className="text-ink">{l.name}:</b> <span className="text-ink" data-wall-line-text="">{l.text}</span></p>
                  {l.notes.length > 0 && <ul className="mt-0.5 space-y-0.5 text-xs text-muted" data-wall-line-notes="">{l.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
                </div>
              ))}
              {wallLines.map((l) => <p key={l.id} data-wall-line={l.id}><b className="text-ink">{l.name}:</b> <span className="text-ink" data-wall-line-text="">{l.text}</span></p>)}
            </div>
          )}
          {measProblems.map((t) => <Banner key={t} tone="warn">{t}</Banner>)}
          <section ref={elevRef} aria-label="Elevation" className="space-y-2 rounded-card border border-hairline bg-white p-3">
            <div role="radiogroup" aria-label="Elevation view" className="flex rounded-lg border border-hairline p-0.5">
              {VIEWS.map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={tab === k} onClick={() => { setTab(k); if (sel?.kind === "item") setSel(null); }}
                  className={`min-h-[44px] flex-1 rounded-md px-2 text-sm font-medium ${tab === k ? "bg-primary text-white" : "text-ink"}`}>{label}</button>
              ))}
            </div>
            {tab === "cladding" && cladEntries.length > 1 && (
              <Chips label="Show" value={shownClad?.material.id} options={cladEntries.map((e) => [e.material.id, e.material.name])} onChange={(id) => { setPick(id); setSel(null); }} />
            )}
            {placing && (
              <Banner tone="info" action={<Btn onClick={cancelAdd}>Cancel</Btn>}>Tap the elevation where the opening is — or type its numbers below.</Banner>
            )}
            {polygon ? (
              <div ref={drawingRef} className="scroll-mt-1">
              <WallElevation polygon={polygon} openings={drawnOpenings} items={elements.items} guides={elements.guides} selectedId={selItem?.id || null}
                selectedOpeningId={selOpening?.id || null} placing={placing} draft={shownDraft} editable={canEdit} maxHeightPx={maxH}
                onTap={onTap} onDragOpening={onDragOpening}
                ariaLabel={`${wallName(wall)} elevation, ${tab} view — ${openings.length} opening(s). Tap an element for details.`} />
              </div>
            ) : (
              <p className="rounded-lg bg-page px-3 py-6 text-center text-sm text-muted" data-elevation-pending="">{geom.message && (lengthMm || inputs.kind === "polygon") ? `${geom.message} ` : ""}Enter the wall {lengthMm ? "heights" : "length and heights"} to generate the elevation.</p>
            )}
            {polygon && legend.length > 0 && (
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted" aria-label="Legend">
                {legend.map(([state, text, cls]) => <li key={state} className="flex items-center gap-1"><span className={`inline-block h-3 w-3 rounded-sm border ${cls}`} />{text}</li>)}
              </ul>
            )}
            {polygon && drawnOpenings.some((o) => o.issue) && (
              <p className="flex items-center gap-1 text-[11px] text-muted" data-off-wall-legend=""><span className="inline-block h-3 w-3 rounded-sm border border-dashed border-red-600 bg-red-100" />Past the wall edge — not deducted</p>
            )}
            {polygon && tab === "cladding" && !shownClad && <p className="text-sm text-muted">No cladding material on this wall. Attach a cladding to see its sheets, courses or panels.</p>}
            {polygon && tab === "cladding" && shownClad && shownLayoutEmpty && (
              <p className="text-sm text-red-700" data-layout-empty="">{shownClad.material.name}: no layout on this wall — {blockingFor(shownClad.material.id) ? "fix the problems below first." : "check the wall size."}</p>
            )}
            {si && (
              <div className="space-y-1 text-xs text-ink" data-sheet-summary="">
                <p>{plural(si.strips, "strip")}{si.cutWidths.length ? ` (${si.cutWidths.length} cut: ${si.cutWidths.map((w) => `${fmtMm(Math.round(w * 10) / 10)} mm`).join(", ")} wide)` : ""} × {plural(si.courses, "course")} → {si.acrossWalls
                  ? <><b>{plural(si.pieces, "piece")}</b> from {plural(si.acrossWalls.usedSheets ?? si.sheets, "sheet")}, {plural(si.sheets, "sheet")} counted on this wall</>
                  : <b>{plural(si.sheets, "sheet")}</b>}{si.empty ? ` · ${plural(si.empty, "empty cell")} use none` : ""}.</p>
                {si.shared && canEdit && shownClad?.material && shownClad.material.id === material?.id && material.methodKey === "sheet_layout" && sharedWallsOf(material) > 1 && (() => {
                  // HUB 016b: one switch per cladding — keep offcuts for the other walls, or plan each wall on its own (walls clad separately)
                  const on = material.rules?.shareSheetsAcrossWalls !== false;
                  return (
                    <div className="flex flex-wrap items-center gap-2" data-share-walls={on ? "on" : "off"}>
                      <p className="min-w-0 flex-1 text-muted">{!on ? "Each wall is planned on its own: offcuts are not used on other walls."
                        : si.acrossWalls ? "Offcuts are kept for the other walls. Plan each wall on its own if they are clad on different days."
                        : (results[material.id]?.layouts || []).some((l) => l?.cutPlan?.scope === "walls") ? "This wall isn't in the shared plan until its problems are fixed."
                        : "Offcuts are shared across walls when that saves sheets; here each wall's own plan is already the best."}</p>
                      <Btn kind="ghost" onClick={() => act.updateRules(on ? { shareSheetsAcrossWalls: false } : {}, on ? [] : ["shareSheetsAcrossWalls"])}>{on ? "Plan each wall on its own" : "Share offcuts across walls"}</Btn>
                    </div>
                  );
                })()}
                {(si.offcuts.length > 0 || si.refused.length > 0) && (
                  <details className="rounded-lg border border-hairline px-3" data-offcuts="">
                    <summary className="min-h-[44px] cursor-pointer py-3 text-xs">{si.shared ? `${plural(si.offcuts.length, "offcut")} left over` : `${plural(si.offcuts.length, "potential offcut")} — listed only, never reused automatically`}</summary>
                    <ul className="list-disc space-y-0.5 pb-2 pl-4 text-muted">
                      {si.offcuts.map((o, i) => <li key={`${o.cellId}-${i}`}>{o.sheetId ? `${o.sheetId.replace("S", "Sheet ")} (strip ${si.stripOf(o.cell)}${si.courses > 1 ? `, course ${(o.cell?.row ?? 0) + 1}` : ""})` : `Strip ${si.stripOf(o.cell)}${si.courses > 1 ? `, course ${(o.cell?.row ?? 0) + 1}` : ""}`}: {fmtMm(Math.round(o.widthMm))} × {fmtMm(Math.round(o.lengthMm))} mm</li>)}
                      {si.refused.map((r) => <li key={r} data-offcut-refused="">{r}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}
            {polygon && tab === "supports" && !elements.items.length && !elements.notes.length && (
              <p className="text-sm text-muted" data-supports-empty="">{supportsEmpty}</p>
            )}
            {elements.notes.map((n) => <p key={n} className="text-xs text-ink" data-elevation-note="">{n}</p>)}
            {polygon && tab === "accessories" && elements.totals && (
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 text-xs" aria-label="Accessory routes">
                {elements.totals.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="text-right font-semibold text-ink">{fmtMm(Math.round(v))} mm</dd></div>)}
              </dl>
            )}
            {tab === "accessories" && accessoryEntries.map((e) => {
              const scope = e.material.rules?.scope || {};
              const groups = Array.isArray(e.layout?.groups) ? e.layout.groups : null;
              return (
                <div key={e.material.id} className="space-y-1 rounded-lg border border-hairline p-2" data-accessory-scopes={e.material.id}>
                  <p className="text-xs font-semibold text-ink">{e.material.name} — selected scope</p>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
                    {groups ? groups.map((g) => (
                      <div key={g.id} className="contents"><dt className="text-muted">{g.id}</dt><dd className="text-right font-medium text-ink">{SCOPE_TEXT[g.scope] || g.scope}{g.scope === "include" ? ` · ${GROUP_STATE_TEXT[g.state] || g.state}` : g.reason ? ` · ${g.reason}` : ""}</dd></div>
                    )) : Object.keys(ACCESSORY_SCOPE_LABEL).map((k) => (
                      <div key={k} className="contents"><dt className="text-muted">{ACCESSORY_SCOPE_LABEL[k]}</dt><dd className="text-right font-medium text-ink" data-scope={k}>{SCOPE_TEXT[scope[k] || "unresolved"]}</dd></div>
                    ))}
                  </dl>
                </div>
              );
            })}
            {areas && (
              <dl className="grid grid-cols-3 gap-2 rounded-lg bg-page p-2 text-center" aria-label="Areas">
                <div><dt className="text-[11px] text-muted">Gross</dt><dd className="text-sm font-semibold text-ink" data-area="gross">{fmtM2(areas.grossM2)} m²</dd></div>
                <div><dt className="text-[11px] text-muted">Openings</dt><dd className="text-sm font-semibold text-ink" data-area="openings">{fmtM2(areas.openingM2)} m²</dd></div>
                <div><dt className="text-[11px] text-muted">Net</dt><dd className="text-sm font-semibold text-ink" data-area="net">{fmtM2(areas.netM2)} m²</dd></div>
              </dl>
            )}
          </section>

          {blockingHere.length > 0 && (
            <section aria-label="Problems on this wall" className="space-y-2" data-wall-problems="">
              {blockingHere.map((p) => (
                <Banner key={`${p.materialId}|${p.message}`} tone="error" action={p.general ? (canEdit && onSetup ? <Btn onClick={() => onSetup(p.material)} aria-label={`Set up ${p.materialName}`}>Setup</Btn> : null)
                  : p.code === "sheet_too_tall" && canEdit && p.materialId === material?.id ? (
                  <div className="flex flex-wrap gap-1">
                    {/* HUB 015: one tap — Blue Leaf's joint; the engine then places the joints wherever a wall is taller than the sheet */}
                    <Btn kind="primary" onClick={() => act.updateRules({ jointRows: { atMm: [], ...BLUE_LEAF_SHEET_JOINT } }, ["jointRowsDraft"], ["jointRows"])}>Use a {BLUE_LEAF_SHEET_JOINT.gapMm} mm joint with an {BLUE_LEAF_SHEET_JOINT.detailRef}</Btn>
                    <Btn onClick={() => setSel({ kind: "jointRow" })}>Other joint…</Btn>
                  </div>)
                  : p.code === "joint_rows_invalid" && canEdit && p.materialId === material?.id ? <Btn onClick={() => setSel({ kind: "jointRow" })}>Edit joint row</Btn> : null}>
                  {(p.general || onWall.length > 1) && p.materialName ? <b>{p.materialName}: </b> : null}{p.message}
                </Banner>
              ))}
            </section>
          )}

          {tab === "cladding" && shownClad && shownClad.material.id === material?.id && setout && canEdit && (
            <section aria-label={material.methodKey === "sheet_layout" ? "Sheet setout" : "Course setout"} className="space-y-2 rounded-card border border-hairline bg-white p-3">
              <h3 className="text-sm font-semibold text-ink">{material.methodKey === "sheet_layout" ? "Sheet setout" : "Course setout"}</h3>
              <NumberField key={draftReset} label={setout.label} value={datumHere} min={setout.min} max={setout.max ?? MAX_MM}
                onCommit={(n) => {
                  setDatumChange({ before: setoutQty, beforeAll: materialQty, datumMm: n, key: changeKeyFor(material.rules) });
                  setAlignChange(null);
                  // THIS wall only (rules.datumByWall); the same value as the material default needs no own entry
                  const byWall = { ...(material.rules?.datumByWall || {}) };
                  if (n === defaultDatum) delete byWall[wall.id]; else byWall[wall.id] = n;
                  if (Object.keys(byWall).length) act.updateRules({ datumByWall: byWall }); else act.updateRules({}, ["datumByWall"]);
                }}
                help={setout.help} />
              {datumShown && <p className="text-xs text-ink" data-datum-change="">{setout.what} on this wall: {datumShown.before} → <b>{setoutQty}</b>
                {/* HUB 016b: with sheets shared across walls, a setout change can save or add a sheet on another wall */}
                {material.methodKey === "sheet_layout" && material.rules?.shareSheetsAcrossWalls !== false && materialWallsHere.length > 1 && Number.isFinite(datumShown.beforeAll)
                  ? <> · all walls of {material.name}: {datumShown.beforeAll} → <b>{materialQty}</b></> : null}</p>}
              {datumOthers.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] text-muted" data-datum-others="">Other walls using {material.name}: {datumOthers.map((o) => `${wallName(o.wall)} starts at ${fmtMm(o.datumMm)} mm`).join(" · ")}.</p>
                  <Btn onClick={alignAll}>Use this setout on every wall using {material.name}</Btn>
                </div>
              )}
              {alignShown && <p className="text-xs text-ink" data-datum-all-change="">{setout.what} on all {materialWallsHere.length} walls using {material.name}: {alignShown.before} → <b>{materialQty}</b></p>}
              {material.methodKey === "sheet_layout" && autoJointsHere.length > 0 && (
                <p className="text-xs text-ink" data-auto-joint="">Joint added automatically at {autoJointsHere.map((j) => fmtMm(j.atMm)).join(" and ")} mm — {fmtMm(autoJointsHere[0].gapMm)} mm gap{autoJointsHere[0].detailRef ? `, ${autoJointsHere[0].detailRef}` : ""}. To put it somewhere else, set its height in Edit joint row.</p>
              )}
              {material.methodKey === "sheet_layout" && (material.rules?.jointRows ? (!material.rules.jointRows.atMm?.length ? (
                <p className="text-xs text-ink" data-joint-rule="">Joints: {fmtMm(material.rules.jointRows.gapMm)} mm gap{material.rules.jointRows.detailRef ? `, ${material.rules.jointRows.detailRef}` : ""}, placed automatically wherever a wall is taller than the sheet. <Btn kind="ghost" onClick={() => setSel({ kind: "jointRow" })}>Edit joint row</Btn></p>
              ) :
                <p className="text-xs text-ink">Joint row at {material.rules.jointRows.atMm.map((x) => fmtMm(x)).join(", ")} mm (gap {fmtMm(material.rules.jointRows.gapMm)} mm{material.rules.jointRows.detailRef ? `, ${material.rules.jointRows.detailRef}` : ""}) <Btn kind="ghost" aria-label="Edit joint row" onClick={() => setSel({ kind: "jointRow" })}>Edit</Btn></p>
              ) : material.rules?.jointRowsDraft ? null : <Btn onClick={() => setSel({ kind: "jointRow" })}>Add a joint row</Btn>)}
              {material.methodKey === "sheet_layout" && material.rules?.jointRowsDraft && (
                <p className="text-xs text-amber-800" data-joint-row-draft="">Unfinished joint row — not applied (still needs {jointRowMissing(material.rules.jointRowsDraft, material.spec?.orientation === "horizontal").join(", ")}). <Btn kind="ghost" aria-label="Edit joint row" onClick={() => setSel({ kind: "jointRow" })}>Edit</Btn></p>
              )}
            </section>
          )}

          {entries.length > 0 && (
            <section aria-label="Quantities on this wall" className="space-y-2 rounded-card border border-hairline bg-white p-3">
              <h3 className="text-sm font-semibold text-ink">On this wall</h3>
              {entries.map((e) => {
                const rows = wallQuantities(e.result, wall.id, e.tag);
                return (
                  <div key={e.material.id} data-wall-qty={e.material.id} className="space-y-1">
                    <p className="text-xs font-semibold text-ink">{e.material.name}</p>
                    {rows.length ? (
                      <ul className="text-sm">{rows.map((r) => <li key={r.key} className="flex gap-2"><span className="min-w-0 flex-1 text-muted">{r.text}</span><b className="shrink-0 text-ink" data-qty-unit={r.unit}>{r.qtyText}</b></li>)}</ul>
                    ) : <p className="text-sm text-muted">{blockingFor(e.material.id) ? "No quantities until the problems above are fixed." : "Nothing calculated for this wall yet."}</p>}
                  </div>
                );
              })}
            </section>
          )}

          {dims}

          <section aria-label="Openings" className="space-y-2 rounded-card border border-hairline bg-white p-3">
            <div className="flex items-center gap-2">
              <h3 className="flex-1 text-sm font-semibold text-ink">Openings <span className="font-normal text-muted">({openings.length})</span></h3>
              {canEdit && <Btn kind="primary" onClick={startAddOpening} disabled={placing}>Add opening</Btn>}
            </div>
            {!openings.length && <p className="text-sm text-muted">No openings. Windows and doors are deducted from the cladding by layout, never twice.</p>}
            <ul className="divide-y divide-hairline">
              {openings.map((o) => {
                const prob = openingProblem(o.id);
                return (
                  <li key={o.id} data-opening-row={o.id}>
                    <button type="button" onClick={() => selectOpening(o.id)} aria-pressed={selOpening?.id === o.id}
                      className={`flex min-h-[48px] w-full items-center gap-2 px-1 text-left text-sm ${selOpening?.id === o.id ? "bg-amber-50" : ""}`}>
                      <span className="w-10 shrink-0 font-semibold text-ink">{o.label || "—"}</span>
                      <span className="min-w-0 flex-1 text-muted">{o.type === "door" ? "Door" : o.type === "other" ? "Other" : "Window"} · {fmtMm(o.widthMm)} × {fmtMm(o.heightMm)} · sill {fmtMm(o.sillMm)} · from start {fmtMm(o.xMm)}
                        {prob && <span className="block text-xs font-semibold text-red-700">{prob}</span>}</span>
                      <span aria-hidden="true" className="text-muted">›</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-label="Materials on this wall" className="space-y-2 rounded-card border border-hairline bg-white p-3">
            <h3 className="text-sm font-semibold text-ink">Materials on this wall</h3>
            {!onWall.length && <p className="text-sm text-muted">No material uses this wall yet.</p>}
            <ul className="space-y-1 text-sm">{onWall.map((m) => <li key={m.id} className="text-ink">{m.name} <span className="text-[11px] text-muted">· {describeFamilySpec(m.spec).line}</span></li>)}</ul>
            {canEdit && material && (
              <div className="flex flex-wrap gap-2">
                <Btn aria-pressed={attached} onClick={() => act.setAttached(wall, !attached)} className={attached ? "border-primary text-primary" : ""}>{attached ? `✓ Uses ${material.name}` : `Use ${material.name} here`}</Btn>
                <Btn kind="danger" onClick={() => act.removeWall(wall)}>Remove wall</Btn>
              </div>
            )}
          </section>

          {/* wall-by-wall step 5: where the wall came from, the statuses and the notes fold away here (they stay on
              the schedule and the order); anything that blocks the order is shown above with its fix */}
          <More aria-label="More about this wall" data-wall-more="">
            <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700" data-provenance="">{provenanceText(wall)}</span>
              <span>Setout aid — not a surveyed elevation.</span>
            </p>
            {aboutDrawing.length > 0 && <div className="space-y-1 text-xs text-muted" data-wall-about="">{aboutDrawing}</div>}
            {entries.filter((e) => e.result?.status).map((e) => (
              <div key={e.material.id} className="space-y-1" data-wall-status={e.material.id}>
                <p className="text-xs font-semibold text-ink">{e.material.name}</p>
                <p className="flex flex-wrap gap-1" aria-label={`${e.material.name} statuses`}>
                  <StatusChip group="quantity" value={e.result.status.quantity} />
                  <StatusChip group="installation" value={e.result.status.installation} />
                  <StatusChip group="procurement" value={e.result.status.procurement} />
                </p>
              </div>
            ))}
            {notesHere.length > 0 && (
              <div className="text-sm text-amber-900" data-wall-notes="">
                <p className="text-xs font-semibold">{plural(notesHere.length, "note")} for this wall (not blocking)</p>
                <ul className="list-disc space-y-0.5 pl-4">{notesHere.map((p) => <li key={p.message}>{p.message}</li>)}</ul>
              </div>
            )}
            {entries.length > 0 && <p className="text-[11px] text-muted">The quantities on this wall are layout quantities before spares and pack rounding. The schedule adds those.</p>}
          </More>
          {saveBanner}
        </div>
      </KeyboardSafe>

      {(sel?.kind === "opening" && selOpening) || sel?.kind === "newOpening" ? (
        <Sheet key="opening-sheet" title={sel.kind === "newOpening" ? "New opening" : `Opening ${selOpening.label || ""}`.trim()} onClose={() => (sel.kind === "newOpening" ? cancelAdd() : setSel(null))} initialFocus={false}>
          <KeyboardSafe>
          <OpeningForm key={`opening-form-${draftReset}`} canEdit={canEdit} focusToken={focusToken}
            value={sel.kind === "newOpening" ? dv : { label: selOpening.label, type: selOpening.type, widthMm: selOpening.widthMm, heightMm: selOpening.heightMm, sillMm: selOpening.sillMm, xMm: selOpening.xMm }}
            onField={(f, v) => (sel.kind === "newOpening" ? onDraftField(f, v) : onOpeningField(selOpening, f, v))} />
          {sel.kind === "newOpening" ? (
            <p className="mt-2 text-xs text-muted" data-opening-hint="">{placing && !Number.isFinite(draft?.tapX) ? "Tap its approximate position on the elevation, then enter the width and height." : "Enter the width and height — the opening is added as soon as its numbers are complete."}</p>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-ink" data-opening-edges="">Edges: head {fmtMm(selOpening.widthMm)} · sill {selOpening.sillMm > 0 ? fmtMm(selOpening.widthMm) : "none (on the base)"} · jambs 2 × {fmtMm(selOpening.heightMm)} mm · head at {fmtMm((selOpening.sillMm || 0) + (selOpening.heightMm || 0))} mm</p>
              <p className="text-[11px] text-muted">Head / sill / jamb flashings: no reviewed flashing template is linked here yet — the lengths above are the opening&apos;s edges only.</p>
              {openingProblem(selOpening.id) && <p className="text-xs font-semibold text-red-700">{openingProblem(selOpening.id)}</p>}
              {canEdit && <p className="text-[11px] text-muted">Drag the highlighted opening on the drawing to move it (snaps to 10 mm) — the typed numbers are what count.</p>}
              {studEntry && <FramingDetail key={`framing-${selOpening.id}-${draftReset}`} opening={selOpening} stud={studEntry} canEdit={canEdit} onSave={(d) => act.updateOpening(selOpening.rec, { detail: d })} />}
              {canEdit && <Btn kind="danger" onClick={() => { act.removeOpening(selOpening.rec); setSel(null); }}>Remove opening</Btn>}
            </div>
          )}
          </KeyboardSafe>
        </Sheet>
      ) : null}
      {selItem && <ElementSheet item={selItem} onClose={() => setSel(null)} onAction={(a) => a === "jointRow" && setSel({ kind: "jointRow" })} canEdit={canEdit} footerBelow={footerBelow} />}
      {sel?.kind === "jointRow" && material && (
        <JointRowSheet key={`joint-row-${draftReset}`} view={view} material={material} suggestionMm={tooTall?.suggestedJointAtMm} onClose={() => setSel(null)}
          onApply={(jr) => act.updateRules({ jointRows: jr }, ["jointRowsDraft"], ["jointRows"])}
          onDraft={(d) => { if (JSON.stringify(d) === JSON.stringify(material.rules?.jointRowsDraft ?? null)) return; if (d) act.updateRules({ jointRowsDraft: d }); else act.updateRules({}, ["jointRowsDraft"]); }}
          onRemove={() => { act.updateRules({}, ["jointRows", "jointRowsDraft"], ["jointRows", "jointRowsDraft"]); setSel(null); }} />
      )}
    </>
  );
}

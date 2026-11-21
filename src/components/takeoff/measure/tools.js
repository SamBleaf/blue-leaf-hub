// =============================================================================
// measure/tools.js — which measuring tools a material gets, layer colours, the on-device drawing draft and small
// record helpers for MeasureScreen (TC-R04 02 §2–3, 03 T1, 13). Pure + localStorage only (always try/catch).
//
//   flashing           Run (continuous path, 13) · Count · Select · Pan
//   timber repeated    Member · Distribution · Select · Pan            (rafters / joists / battens; no Member when
//                      the cut length is entered)
//   timber Walls       Line · Select · Pan                             (HUB 028 wall_framing: one trace → studs, plates and
//                      noggins together; no Rectangle or Area, an outline has no single wall length)
//   timber Floor frame Rectangle · Outline · Pan                       (Sam, 18 Nov 2026 floor_framing: the floor outline and its openings are traced AREAS)
//   timber studs       Wall · Select · Pan                             (wall_frame)
//   timber plates      Wall · Run · Count · Select · Pan               (linear_stock)
//   timber noggins     Wall · Count · Select · Pan
//   timber trim/other  Run · Count · Select · Pan
//   aluminium          Run · Select · Pan
//   wall families      Line · Rectangle · Area · Select · Pan          (cladding, aac, foam, timber-cladding, batten, accessory)
//                      HUB 022: Line traces a whole run with the Wall height in force at each tap; timber walls keep Wall
//                      HUB 022 step 2: + Window / + Door in the Line panel put openings into the traced walls
//                      HUB 023: Rectangle (two opposite corners) and Area (each corner, then Finish) draw a wall straight
//                      onto a scaled elevation, saved as a traced outline wall (inputs.kind "polygon")
//                      Wall-by-wall step 5: reviewWalls (the order Review walls steps through) + each wall's cladding
//                      quantities in one short line (wallCladdingTotals / wallCladdingText)
//                      HUB 028: a Walls item's framing in one short line (wallFramingTotals / wallFramingText), naming
//                      any wall the calculation blocked (wallsNotCounted); a wall page's own notes (wallFramingNotes:
//                      its LVL plates and its openings' lintels note), the long plates' "over 6.0 m" and the parts
//                      that still need setup in one wall-page line (wallPartsNeedText)
// =============================================================================
import { ceilToIncrement } from "../../../../shared/takeoff/units.js";
import { FLOOR_PURPOSE, CAVITY_SLIDER_EXTRA_MM, WALLS_PURPOSE, WALL_FRAMING_RULES, WET_WALL_CENTRES_MM, cavityOpeningWidth, WALL_PARTS, WALL_PART_LABELS, longPlateStockLengths, wallPinePlateMaxMm , wallHasDoubleTop } from "../../../../shared/takeoff/engine/families.js";

/** Layer colours on the plan (measurement layer, not supplier finish — 02 §1). */
export const COLORS = Object.freeze({
  flashing: "#006c9b", overflow: "#dc2626", handling: "#b45309", draft: "#64748b", count: "#16a34a", selected: "#f59e0b",
  halo: "#7dd3fc", wall: "#9a3412", member: "#7c3aed", distribution: "#0d9488", trim: "#006c9b", split: "#0f172a", removed: "#94a3b8",
  window: "#0284c7", door: "#4f46e5",
  // HUB 031: a wet-area wall (its own stud centres), cyan-700 (5.4:1 on white); its label also says "ctrs", so colour is never the only cue
  wetWall: "#0e7490",
  // Floor frame (Sam, 18 Nov 2026): outline, openings, trusses, beams, strongbacks, trimmers (colour is never the only cue: edges are numbered, labels say what each is)
  floor: "#0f766e", floorVoid: "#b91c1c", floorWet: "#0891b2", floorSheet: "#94a3b8", floorTruss: "#64748b", floorTrussCut: "#475569", floorBeam: "#0f172a", floorStrongback: "#ea580c", floorTrimmer: "#2563eb",
});

const WALL_FAMILIES = new Set(["cladding", "aac", "foam", "timber-cladding", "batten", "accessory"]);

/** TC-R04 family of a job material (null = flashing). */
export const familyOf = (m) => (m?.spec?.family && m.spec.family !== "flashing" ? m.spec.family : null);
export const isFlashingMaterial = (m) => !!m && !familyOf(m);
/** Floor frame (Sam, 18 Nov 2026): one timber item framing a traced floor outline (trusses, strongbacks, beams, trimmers together). */
export const isFloorItem = (m) => m?.methodKey === "floor_framing" || (m?.spec?.family === "timber" && m?.spec?.purpose === FLOOR_PURPOSE);
/** Sam, 18 Nov 2026: redrawing the floor outline clears the beam marks (beams belong to the old edges; never silently re-mapped onto new ones). Returns a NEW material; the old one is what Undo restores. */
export function withoutFloorBeams(material) {
  const rules = { ...(material?.rules || {}) };
  delete rules.beams;
  return { ...material, rules };
}
/** HUB 028: a Walls item (one timber item framing its traced walls: studs, plates and noggins together). */
export const isWallsItem = (m) => m?.methodKey === "wall_framing" || (m?.spec?.family === "timber" && m?.spec?.purpose === WALLS_PURPOSE);
/** Materials measured as walls (+ openings) rather than plan lines — same rule as TakeoffApp. */
export const usesWalls = (m) => WALL_FAMILIES.has(m?.spec?.family) || (m?.spec?.family === "timber" && ["studs", "plates", "noggins", WALLS_PURPOSE].includes(m?.spec?.purpose));

const T = {
  run: { k: "run", label: "Run" }, count: { k: "count", label: "Count" }, select: { k: "select", label: "Select" }, pan: { k: "pan", label: "Pan" },
  wall: { k: "wall", label: "Wall" }, member: { k: "member", label: "Member" }, distribution: { k: "distribution", label: "Distribution" },
  line: { k: "line", label: "Line" }, rect: { k: "rect", label: "Rectangle" }, area: { k: "area", label: "Area" },
};

/** The tool row for a material (first = default). */
export function toolsFor(material) {
  if (!material) return [T.select, T.pan];
  const fam = familyOf(material);
  if (!fam) return [T.run, T.count, T.select, T.pan];
  if (fam === "timber") {
    const p = material.spec?.purpose;
    // an entered cut length needs no member line (03 T2) — only the distribution run is measured
    if (material.methodKey === "repeated_members") return material.rules?.lengthSource === "entered" ? [T.distribution, T.select, T.pan] : [T.member, T.distribution, T.select, T.pan];
    // HUB 028 Walls: trace the run with Line (the Wall height in force at each tap); straight walls only
    if (isWallsItem(material)) return [T.line, T.select, T.pan];
    // Floor frame: Rectangle (two corners) or Outline (each corner, then Finish) for the floor and its openings; no Select in Phase 1
    if (isFloorItem(material)) return [T.rect, { k: "area", label: "Outline" }, T.pan];
    if (p === "studs" || material.methodKey === "wall_frame") return [T.wall, T.select, T.pan];
    if (p === "plates") return [T.wall, T.run, T.count, T.select, T.pan];
    if (p === "noggins") return [T.wall, T.count, T.select, T.pan];
    return [T.run, T.count, T.select, T.pan];
  }
  if (fam === "aluminium") return [T.run, T.select, T.pan];
  if (usesWalls(material)) return [T.line, T.rect, T.area, T.select, T.pan];
  return [T.select, T.pan];
}

/** Multi-point tools: tap each corner, double-tap (or Finish) to finish. */
export const PATH_TOOLS = new Set(["run", "wall", "line"]);
/** Two-point line tools: the second tap finishes the line. */
export const LINE_TOOLS = new Set(["member", "distribution"]);
/** HUB 023 shapes on an elevation: Rectangle (the second corner finishes it) and Area (each corner, then Finish). */
export const SHAPE_TOOLS = new Set(["rect", "area"]);
/** The tools whose panel has + Window / + Door (the walls they make take openings). */
export const OPENING_TOOLS = new Set(["line", "rect", "area"]);

/** Plain-English name of a timber purpose's members, for counts ("11 rafters"). */
export function memberNoun(material, n = 2) {
  const p = material?.spec?.purpose;
  const one = p === "rafters" ? "rafter" : p === "joists" ? "joist" : p === "battens" ? "batten" : p === "studs" ? "stud" : "member";
  return n === 1 ? one : `${one}s`;
}

// ── on-device drawing draft (recovers an unfinished path after a reload; never an order line) ────────────────

const DRAFT_PREFIX = "blh-takeoff-measure-draft";
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const heightOrNull = (v) => (finite(v) && v > 0 ? v : null);

export const draftKey = ({ workspaceId, materialId, documentId, pageIndex }) =>
  (workspaceId && materialId && documentId != null ? `${DRAFT_PREFIX}:${workspaceId}:${materialId}:${documentId}:${pageIndex}` : null);

/** A stored draft, or null when absent / unreadable / storage blocked. */
export function loadDraft(key) {
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d.tool !== "string" || !Array.isArray(d.points) || !d.points.every((p) => p && finite(p.x) && finite(p.y))) return null;
    return {
      tool: d.tool, points: d.points.map((p) => ({ x: p.x, y: p.y })),
      splitsMm: Array.isArray(d.splitsMm) ? d.splitsMm.filter(finite) : [],
      measurementId: typeof d.measurementId === "string" ? d.measurementId : null,
      // Line (HUB 022): the wall height in force at each tap, one per point, and the height in the box now
      ...(Array.isArray(d.heights) ? { heights: d.points.map((_, i) => heightOrNull(d.heights[i])) } : {}),
      ...(d.heightMm !== undefined ? { heightMm: heightOrNull(d.heightMm) } : {}),
    };
  } catch {
    return null;
  }
}

/** Store (or clear, for an empty draft). Returns false when this device can't keep it. */
export function saveDraft(key, d) {
  if (!key) return false;
  try {
    if (!d || !d.points?.length) window.localStorage.removeItem(key);
    else {
      window.localStorage.setItem(key, JSON.stringify({ tool: d.tool, points: d.points, splitsMm: d.splitsMm || [], measurementId: d.measurementId || null,
        ...(Array.isArray(d.heights) ? { heights: d.heights } : {}), ...(d.heightMm !== undefined ? { heightMm: d.heightMm } : {}), savedAt: Date.now() }));
    }
    return true;
  } catch {
    return false;
  }
}

// ── display ───────────────────────────────────────────────────────────────────

/**
 * A tight length shown with just enough decimals that "tight + allowance → order" still explains the rounding — display
 * rounding never hides a real overrun (13: 8,800.04 + 200 → 9,100, never "8,800 + 200 → 9,100").
 */
export function explainableMm(tightMm, { allowanceMm = 0, extraMm = 0, incrementMm = 1, orderMm = null, lengthKind = "tight" } = {}) {
  const show = (v, d) => v.toLocaleString("en-AU", { maximumFractionDigits: d });
  if (lengthKind !== "tight" || orderMm == null || !(incrementMm > 0)) return show(Math.round(tightMm * 10) / 10, 1);
  for (let d = 1; d <= 6; d++) {
    const v = Number(tightMm.toFixed(d));
    if (ceilToIncrement(v + extraMm + allowanceMm, incrementMm) === orderMm) return show(v, d); // the engine's own rounding
  }
  return show(tightMm, 6);
}
// ── record helpers ───────────────────────────────────────────────────────────

/**
 * Inputs for a NEW traced wall: rectangular, "Wall N" (unique), and the height last used in this workspace when
 * there is one (02 §3 — never inferred from another job). Heights may be left out while drafting.
 */
export function nextWallInputs(measurements) {
  const walls = (measurements || []).filter((m) => m.kind === "wall" && !m.archived);
  const height = lastWallHeight(walls);
  const names = new Set(walls.map((w) => String(w.inputs?.name || "").trim().toLowerCase()));
  let n = walls.length + 1;
  while (names.has(`wall ${n}`)) n++;
  return { kind: "rect", ...(height ? { heightMm: height } : {}), name: `Wall ${n}` };
}

/**
 * The height of the last wall in this takeoff (rectangular walls), or null. Walls of one traced run are saved together
 * and come back in no set order, so inside a run the last wall is the one tapped last (highest seq).
 */
export function lastWallHeight(measurements) {
  let last = null;
  for (const w of measurements || []) {
    if (w.kind !== "wall" || w.archived || !(finite(w.inputs?.heightMm) && w.inputs.heightMm > 0)) continue;
    if (last && runIdOf(w) && runIdOf(w) === runIdOf(last) && (w.inputs.seq ?? 0) < (last.inputs.seq ?? 0)) continue;
    last = w;
  }
  return last ? last.inputs.heightMm : null;
}

/**
 * Where the Line panel's Wall height starts for a material. A Walls item (HUB 028): the last height of ITS OWN walls,
 * empty the first time, because the height there is the stud cut length and a cladding height must never carry over.
 * Every other material keeps the HUB 022 start: the last wall height anywhere in this takeoff.
 */
export function lineStartHeight(measurements, contributions, material) {
  if (!isWallsItem(material)) return lastWallHeight(measurements);
  const mine = new Set((contributions || []).filter((c) => !c.archived && c.jobMaterialId === material.id).map((c) => c.measurementId));
  return lastWallHeight((measurements || []).filter((m) => mine.has(m.id)));
}

// ── traced runs (HUB 022) ─────────────────────────────────────────────────────────────────────────────────────

/** The run a traced wall belongs to (inputs.runId), or null for a wall that stands on its own (older walls too). */
export const runIdOf = (m) => (typeof m?.inputs?.runId === "string" && m.inputs.runId ? m.inputs.runId : null);

/** Inputs for one wall of a Line run: rectangular, "Wall N", the height in force when it was traced, its run and place. */
export function lineWallInputs(measurements, { heightMm, runId, seq }) {
  const { name } = nextWallInputs(measurements);
  return { kind: "rect", ...(heightOrNull(heightMm) ? { heightMm } : {}), name, runId, seq };
}

// ── Rectangle and Area on an elevation (HUB 023) ─────────────────────────────────────────────────────────────

/** A traced elevation outline (Rectangle / Area, or an older traced outline): a wall whose corners are its outline. */
export const isOutline = (m) => m?.kind === "wall" && m.inputs?.kind === "polygon" && Array.isArray(m.points) && m.points.length >= 3;

/**
 * Inputs for a NEW outline wall drawn with Rectangle or Area: a traced outline ("Wall N", unique), nothing else. Its
 * sizes come from its corners on the scaled page (the engine lays the cladding out over that outline), never a height.
 */
export function outlineWallInputs(measurements) {
  return { kind: "polygon", name: nextWallInputs(measurements).name };
}

/**
 * The sheets the engine laid out for ONE wall of a sheet material: grouped by size, in the order they first appear
 * ([{ qty, lengthMm, widthMm }]), counting each sheet on the wall it is ordered on (HUB 016b), plus the pieces cut
 * from other walls' sheets or offcuts. Null when the material has no sheets on that wall.
 */
export function wallSheetSummary(result, wallId) {
  const groups = new Map();
  for (const d of result?.demands || []) {
    if (!(d.unit === "sheet" || d.kind === "sheet") || d.sourceRefs?.[0]?.measurementId !== wallId) continue;
    const L = d.identity?.stockLengthMm ?? null, W = d.identity?.stockWidthMm ?? null;
    const key = `${L}|${W}`;
    const g = groups.get(key) || { qty: 0, lengthMm: L, widthMm: W };
    g.qty += d.quantity || 0;
    groups.set(key, g);
  }
  const lay = (result?.layouts || []).find((l) => l?.wallMeasurementId === wallId);
  const borrowed = lay?.cutPlan?.fromOtherWalls || 0;
  return groups.size || borrowed ? { sheets: [...groups.values()], borrowed } : null;
}

/** "4 sheets 3,000 × 1,200" (+ "1 sheet 2,750 × 1,200" …, "+ 2 pieces from other walls"). */
export function sheetSummaryText(s) {
  if (!s) return "";
  const n = (v) => v.toLocaleString("en-AU", { maximumFractionDigits: 0 });
  const parts = s.sheets.map((g) => `${n(g.qty)} sheet${g.qty === 1 ? "" : "s"}${g.lengthMm ? ` ${n(g.lengthMm)}${g.widthMm ? ` × ${n(g.widthMm)}` : ""}` : ""}`);
  if (s.borrowed) parts.push(`${n(s.borrowed)} piece${s.borrowed === 1 ? "" : "s"} from other walls`);
  return parts.join(" + ");
}

/**
 * The engine's readable name for a wall on one material (dispatch.js wallTags): its name, plus a short id when two of
 * that material's walls share the name. Problems and demands name the wall by it.
 */
export function wallTagOn(measurements, contributions, materialId, wallId) {
  const live = (measurements || []).filter((m) => !m.archived);
  const walls = (contributions || []).filter((c) => !c.archived && c.jobMaterialId === materialId)
    .map((c) => live.find((m) => m.id === c.measurementId)).filter((m) => m?.kind === "wall");
  const nameOf = (m) => m.inputs?.name || m.label || "Wall";
  const w = walls.find((m) => m.id === wallId);
  if (!w) return null;
  return walls.filter((m) => nameOf(m) === nameOf(w)).length > 1 ? `${nameOf(w)} (${String(w.id).slice(0, 4)})` : nameOf(w);
}

/**
 * Why a wall has NO sheets, in a few plain words, from the engine's blocking problems on it — null when it has
 * sheets or nothing blocks it (HUB 023: a Rectangle taller than the longest sheet must not look finished).
 */
export function wallSheetIssue(result, wallId, tag) {
  if (wallSheetSummary(result, wallId)) return null;
  const onWall = (r) => r && (r.measurementId === wallId || r.wallId === wallId || (tag && r.wallId === tag));
  const mine = (result?.problems || []).filter((p) => p.blocking !== false && (p.refs || []).some(onWall));
  if (!mine.length) return null;
  const tall = mine.find((p) => p.code === "sheet_too_tall");
  if (tall) {
    const L = Math.max(...(tall.listedLengthsMm || []).filter((v) => Number.isFinite(v)));
    return `Taller than the longest sheet${Number.isFinite(L) ? ` (${L.toLocaleString("en-AU")})` : ""}. Add a joint row on the elevation.`;
  }
  return "No sheets on this wall yet. Open the elevation to see why.";
}

/**
 * Every traced run in the takeoff: runId → { id, n, walls } with its walls in tap order (seq). Runs are numbered
 * "Run 1, Run 2 …" in takeoff order (a run's walls share one save time, so they arrive together).
 */
export function wallRuns(measurements) {
  const runs = new Map();
  for (const m of measurements || []) {
    if (m.kind !== "wall" || m.archived) continue;
    const id = runIdOf(m);
    if (!id) continue;
    if (!runs.has(id)) runs.set(id, { id, n: runs.size + 1, walls: [] });
    runs.get(id).walls.push(m);
  }
  for (const r of runs.values()) r.walls.sort((a, b) => (a.inputs.seq ?? 0) - (b.inputs.seq ?? 0));
  return runs;
}

/** The highest point of a wall's cladding (rectangle height, sloping-top high end, gable apex), or null. */
export function wallTopMm(inp = {}) {
  const k = inp?.kind || "rect";
  const v = k === "rect" ? inp.heightMm : k === "rake" ? Math.max(inp.startHeightMm || 0, inp.endHeightMm || 0) : k === "gable" ? inp.apexHeightMm : null;
  return heightOrNull(v);
}

/**
 * "Run 1 · 4 walls · 2,700" (heights in tap order, "2,700 / 3,600" when they change; "no height yet" when none;
 * "· 1 needs a height" when only some walls have one, so a missing height is never hidden behind the others).
 */
export function runLabel(run, walls = run.walls) {
  const hs = [];
  let missing = 0;
  for (const w of walls) {
    const h = wallTopMm(w.inputs);
    if (!h) { if ((w.inputs?.kind || "rect") !== "polygon") missing += 1; continue; }
    if (!hs.includes(h)) hs.push(h);
  }
  const fmt = (v) => v.toLocaleString("en-AU", { maximumFractionDigits: 2 });
  const need = hs.length && missing ? ` · ${missing} need${missing === 1 ? "s" : ""} a height` : "";
  return `Run ${run.n} · ${walls.length} wall${walls.length === 1 ? "" : "s"} · ${hs.length ? hs.map(fmt).join(" / ") : "no height yet"}${need}`;
}

/**
 * A drawing kept on this device by an older build: one started with the Wall tool on a material that now traces with
 * Line (HUB 022) carries on as a Line run instead of being dropped by the next tap. Every tap so far gets the height
 * the Wall tool would have given it (the last wall height), so finishing makes a run that stays on the plan.
 * @param {string[]} toolKeys the material's tools now (toolsFor(material).map(t => t.k))
 */
export function upgradeDraft(d, toolKeys, heightMm) {
  if (!d || d.tool !== "wall" || toolKeys.includes("wall") || !toolKeys.includes("line")) return d;
  const h = heightOrNull(heightMm);
  return { ...d, tool: "line", heights: d.points.map(() => h), heightMm: h };
}

/**
 * The wall list's items, in takeoff order: a traced run of two or more of these walls is ONE item (its walls in tap
 * order); every other wall is its own item. @returns {Array<{ run, walls } | { wall }>}
 */
export function wallListItems(walls, runs) {
  const here = new Set((walls || []).map((w) => w.id));
  const out = [], done = new Set();
  for (const w of walls || []) {
    const run = runs?.get(runIdOf(w));
    const ws = run ? run.walls.filter((x) => here.has(x.id)) : [];
    if (ws.length < 2) { out.push({ wall: w }); continue; }
    if (done.has(run.id)) continue;
    done.add(run.id);
    out.push({ run, walls: ws });
  }
  return out;
}

// ── review at the end (wall-by-wall step 5) ───────────────────────────────────────────────────────────────────

/**
 * The walls of ONE material in the order they are reviewed (Sam, 21 Oct 2026: "review all walls at the end"): its
 * traced runs by run number, each run's walls in tap order (seq), then its other walls in takeoff order. The wall
 * pages' ‹ Previous wall / Next wall › step through exactly this list; archived walls and walls that only other
 * materials use are left out. @returns {object[]} wall measurements
 */
export function reviewWalls(measurements, contributions, materialId) {
  if (!materialId) return [];
  const on = new Set((contributions || []).filter((c) => !c.archived && c.jobMaterialId === materialId).map((c) => c.measurementId));
  const mine = (measurements || []).filter((m) => m.kind === "wall" && !m.archived && on.has(m.id));
  const runs = [...wallRuns(measurements).values()].sort((a, b) => a.n - b.n);
  const inRuns = runs.flatMap((r) => r.walls.filter((w) => on.has(w.id)));
  const seen = new Set(inRuns.map((w) => w.id));
  return [...inRuns, ...mine.filter((w) => !seen.has(w.id))];
}

const CLADDING_ROLE = { sheet: "sheets", panel: "panels", "aac-panel": "panels", "course-board": "boards", "vertical-board": "boards", "board-lm": "lm" };

/**
 * One wall's cladding quantities from the layout, before spares (wall-by-wall step 5): sheets (each counted on the wall
 * it is ordered on, HUB 016b), panels, boards or random-length LM, the pieces cut from other walls' sheets or offcuts,
 * and the cladding's own battens, foam tape and H-flashing (step 4). Added up over a material's walls these are the
 * order's quantities before spares; the tape is rounded into rolls, and the battens and H-flashing into whole lengths,
 * once for the job. Null when nothing is laid out on the wall.
 * @param {string|null} tag the engine's name for the wall on this material (wallTagOn)
 */
export function wallCladdingTotals(result, wallId, tag = null) {
  const onWall = (r) => !!r && (r.measurementId === wallId || r.wallId === wallId || (!!tag && r.wallId === tag));
  const t = { sheets: 0, panels: 0, boards: 0, lm: 0, borrowed: 0, battens: 0, battenMm: 0, tapeMm: 0, hFlashingMm: 0 };
  let any = false;
  for (const d of result?.demands || []) {
    const refs = d.sourceRefs || [];
    const sheet = d.unit === "sheet" || d.kind === "sheet";
    // a sheet shared across walls names every wall it serves: it counts on the wall it is ordered on (its first piece)
    if (!(sheet && !d.follower ? onWall(refs[0]) : refs.some(onWall))) continue;
    const q = d.quantity || 0;
    if (d.follower === "battens") { t.battens += q; t.battenMm += (d.lengthMm || 0) * q; any = true; }
    else if (d.follower === "tape") { t.tapeMm += d.tapeMm || 0; any = true; }
    else if (d.follower === "hflashing") { t.hFlashingMm += (d.lengthMm || 0) * q; any = true; }
    else if (CLADDING_ROLE[d.role]) { t[CLADDING_ROLE[d.role]] += q; any = true; }
  }
  const lay = (result?.layouts || []).find((l) => l?.wallMeasurementId === wallId || l?.wallId === wallId);
  t.borrowed = lay?.cutPlan?.fromOtherWalls || 0;
  return any || t.borrowed ? t : null;
}

/** "5 sheets · 18 batten pieces · 8.1 m foam tape · 2.95 m H-flashing" — one short line (wall-by-wall step 5). */
export function wallCladdingText(t) {
  if (!t) return "";
  const n = (v) => Math.round(v).toLocaleString("en-AU");
  const count = (v, one, many) => `${n(v)} ${Math.round(v) === 1 ? one : many}`;
  const m = (mm, d = 1) => `${(mm / 1000).toFixed(d)} m`;   // as each wall's own list: tape to 0.1 m, H-flashing to 0.01 m
  const parts = [];
  if (t.sheets) parts.push(count(t.sheets, "sheet", "sheets"));
  if (t.panels) parts.push(count(t.panels, "panel", "panels"));
  if (t.boards) parts.push(count(t.boards, "board", "boards"));
  if (t.lm) parts.push(`${t.lm.toFixed(1)} LM (estimate)`);
  if (t.borrowed) parts.push(`${count(t.borrowed, "piece", "pieces")} from other walls`);
  if (t.battens) parts.push(count(t.battens, "batten piece", "batten pieces"));
  if (t.tapeMm) parts.push(`${m(t.tapeMm)} foam tape`);
  if (t.hFlashingMm) parts.push(`${m(t.hFlashingMm, 2)} H-flashing`);
  return parts.join(" · ");
}

// ── Walls (HUB 028): a Walls item's framing in one short line ─────────────────────────────────────────────────

/**
 * A Walls item's framing as the engine laid it out (each wall's layout.totals, wall_framing@1), for one wall
 * (`wallId`) or for every wall of the item. A blocked wall has no layout, so it adds nothing; the item's lines carry
 * the block. Null when no wall is worked out. Plates are the fitted lengths (long LVL plates included).
 * @returns {{ walls:number, studs:number, studsByHeight:Array<[number, number]>, bottomPlateMm:number, topPlateMm:number,
 *   secondTopPlateMm:number|null, noggins:number, rows:number[] } | null}
 */
export function wallFramingTotals(result, wallId = null) {
  const lays = (result?.layouts || []).filter((l) => l?.method === "wall_framing@1" && l.totals && (wallId == null || l.wallMeasurementId === wallId));
  if (!lays.length) return null;
  const rules = { openings: 0, lintels: 0, lintelsToSize: 0, noFit: 0 };
  const t = { walls: lays.length, studs: 0, studsByHeight: [], bottomPlateMm: 0, topPlateMm: 0, secondTopPlateMm: null, noggins: 0, rows: [] };
  const byH = new Map();
  // HUB 031: the walls with a centres setting of their own (wet areas at 450): { 450: 3 }. Only for the whole item.
  const own = {};
  if (wallId == null) for (const l of lays) if (l.centresFrom === "wall" && l.centresMm > 0) own[l.centresMm] = (own[l.centresMm] || 0) + 1;
  if (Object.keys(own).length) t.ownCentres = own;
  for (const { totals: x } of lays) {
    t.studs += x.studs || 0;
    if (x.junctionStuds) t.junctionStuds = (t.junctionStuds || 0) + x.junctionStuds;
    if (x.junctionBlocks) t.junctionBlocks = (t.junctionBlocks || 0) + x.junctionBlocks;
    if (x.studs) byH.set(x.studLengthMm, (byH.get(x.studLengthMm) || 0) + x.studs);
    t.bottomPlateMm += x.bottomPlateMm || 0;
    t.topPlateMm += x.topPlateMm || 0;
    if (x.secondTopPlateMm != null) t.secondTopPlateMm = (t.secondTopPlateMm || 0) + x.secondTopPlateMm;
    t.noggins += x.noggins || 0;
    if (x.openingRules) for (const k of Object.keys(rules)) rules[k] += x.openingRules[k] || 0;
    if (Number.isFinite(x.nogginRows) && !t.rows.includes(x.nogginRows)) t.rows.push(x.nogginRows);
  }
  if (rules.openings) t.openingRules = rules;
  t.studsByHeight = [...byH].sort((a, b) => a[0] - b[0]);
  t.rows.sort((a, b) => a - b);
  // Sam, 18 Nov 2026: the short plates (under 3 m) pooled into full sticks, from the item's allocation (whole item only)
  if (wallId == null) {
    const pools = (result?.allocation?.groups || []).filter((g) => g.identity?.shortPlates);
    const pieces = pools.reduce((a, g) => a + g.totals.allocatedCuts, 0);
    if (pieces) t.shortPlates = { pieces, sticks: pools.reduce((a, g) => a + g.barCount, 0), stickMm: pools[0].bars[0]?.stockLengthMm ?? null, spare: result?.shortPlatePool?.spare || 0 };
  }
  return t;
}

/**
 * The walls of a Walls item that its Walls line leaves out (HUB 028): the calculation blocked them (sloped or outline,
 * no Wall height, overlapping openings …), so they have no layout. Named as the engine names them ("Wall 1"), in name
 * order; the reason is on the item's blocking problems. Empty when every wall is worked out.
 */
export function wallsNotCounted(result, measurements, contributions, materialId) {
  if (!result || !materialId) return [];
  const done = new Set((result.layouts || []).filter((l) => l?.method === "wall_framing@1" && l.totals).map((l) => l.wallMeasurementId));
  const live = new Set((measurements || []).filter((m) => !m.archived && m.kind === "wall").map((m) => m.id));
  const ids = [...new Set((contributions || []).filter((c) => !c.archived && c.jobMaterialId === materialId && live.has(c.measurementId)).map((c) => c.measurementId))];
  return ids.filter((id) => !done.has(id)).map((id) => wallTagOn(measurements, contributions, materialId, id))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

/**
 * "Walls: 21 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 13 noggins (1 row)" (HUB 028). Mixed heights
 * read "21 studs (13 at 2,700, 8 at 3,000)", lowest first; Double top plate on every wall reads "top plate 2 × 10.00 m", on some walls "top plate 10.00 m + second 4.00 m" (only the walls that have it count); rows read
 * "(1 row)", "(2 rows)" or "(1–2 rows)". `label` (the item's or the wall's name) leads it; without one it starts at
 * the studs. `notCounted` (wallsNotCounted) ends it with "· Wall 1 not counted", so a blocked wall is never a quiet
 * gap in the totals ("Walls: Wall 1 not counted" when no wall is worked out). Empty for no totals and nothing left out.
 */
export function wallFramingText(t, label = null, notCounted = []) {
  const out = (notCounted || []).length ? `${notCounted.length < 2 ? notCounted[0] : `${notCounted.slice(0, -1).join(", ")} and ${notCounted[notCounted.length - 1]}`} not counted` : "";
  if (!t) return out ? (label ? `${label}: ${out}` : out) : "";
  const n = (v) => Math.round(v).toLocaleString("en-AU");
  const m = (mm) => `${(mm / 1000).toFixed(2)} m`;
  const hs = t.studsByHeight || [];
  const studs = `${n(t.studs)} stud${t.studs === 1 ? "" : "s"}${hs.length === 1 ? ` at ${n(hs[0][0])}` : hs.length > 1 ? ` (${hs.map(([h, q]) => `${n(q)} at ${n(h)}`).join(", ")})` : ""}`;
  // wall junctions: the studs added either side of a wall butting into another, said apart from the counted studs
  const jn = ((t.junctionStuds || 0) > 0 ? ` + ${n(t.junctionStuds)} junction stud${t.junctionStuds === 1 ? "" : "s"}` : "")
    + ((t.junctionBlocks || 0) > 0 ? ` + ${n(t.junctionBlocks)} junction block${t.junctionBlocks === 1 ? "" : "s"}` : "");
  const two = t.secondTopPlateMm;
  const top = two == null ? m(t.topPlateMm) : Math.abs(two - t.topPlateMm) < 0.5 ? `2 × ${m(t.topPlateMm)}` : `${m(t.topPlateMm)} + second ${m(two)}`;
  const rows = t.rows || [];
  const rowText = !rows.length ? "" : rows.length === 1 ? ` (${rows[0]} row${rows[0] === 1 ? "" : "s"})` : ` (${rows[0]}–${rows[rows.length - 1]} rows)`;
  // HUB 031: "· 3 walls at 450" only when some wall has its own centres; otherwise the line reads exactly as before
  const ownEntries = Object.entries(t.ownCentres || {}).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const own = ownEntries.length ? [ownEntries.map(([c, q], i) => `${i ? "" : `${n(q)} wall${q === 1 ? "" : "s"} at `}${i ? `${n(q)} at ` : ""}${n(c)}`).join(", ")] : [];
  // HUB 031: the lintels the opening rules sized, and the ones still to size ("· 2 lintels, 1 to size")
  const r = t.openingRules;
  const heads = r && (r.lintels || r.lintelsToSize) ? [[r.lintels ? `${n(r.lintels)} lintel${r.lintels === 1 ? "" : "s"}` : null, r.lintelsToSize ? `${n(r.lintelsToSize)} to size` : null, r.noFit ? `${n(r.noFit)} won't fit` : null].filter(Boolean).join(", ")] : [];
  const sp = t.shortPlates ? [`${n(t.shortPlates.pieces)} short plate${t.shortPlates.pieces === 1 ? "" : "s"} from ${n(t.shortPlates.sticks)} × ${(t.shortPlates.stickMm / 1000).toFixed(1)} m stick${t.shortPlates.sticks === 1 ? "" : "s"}${t.shortPlates.spare ? ` + ${n(t.shortPlates.spare)} spare` : ""}`] : [];
  const body = [studs + jn, `bottom plate ${m(t.bottomPlateMm)}`, `top plate ${top}`, ...sp, `${n(t.noggins)} noggin${t.noggins === 1 ? "" : "s"}${rowText}`, ...heads, ...own, ...(out ? [out] : [])].join(" · ");
  return label ? `${label}: ${body}` : body;
}

/**
 * How many of a Walls item's parts still need something before ordering (a section, grade or treatment), from the
 * engine's needs (each names its part: "Plates: enter the treatment …"). The Line panel says "Details: n to fix ›".
 */
export function wallPartsToFix(result) {
  return new Set((result?.problems || []).filter((p) => p.code === "material_incomplete" && p.part).map((p) => p.part)).size;
}

/**
 * A wall page's one line for a Walls item's parts that still need setup (HUB 028), the same parts the Line panel's
 * "Details: n to fix ›" counts: "3 parts need setup (studs, plates and noggins)." Their needs themselves are on the
 * Walls card (its Setup). "" when no part needs anything.
 */
export function wallPartsNeedText(result) {
  const need = new Set((result?.problems || []).filter((p) => p.code === "material_incomplete" && p.part).map((p) => p.part));
  const names = WALL_PARTS.filter((k) => need.has(k)).map((k) => WALL_PART_LABELS[k].toLowerCase());
  if (!names.length) return "";
  const list = names.length < 2 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.length} part${names.length === 1 ? " needs" : "s need"} setup (${list}).`;
}

/**
 * The length above which a Walls item's plate is one long (LVL) plate (HUB 028 round 3): the longest pine plate it
 * buys, i.e. the longest timber-grid length (1,200, then 300 mm steps) within the plates' longest length, less the
 * lengths marked not stocked. Null when no plate can be a long plate, as the calculation decides (computePlates): the
 * plates have no longest length (or no stock length within it), or the Long plates' own longest length isn't past it.
 */
export function wallLongPlateOverMm(spec) {
  const pine = wallPinePlateMaxMm(spec?.components?.plates);
  if (pine == null) return null;
  const long = longPlateStockLengths(spec?.components?.longPlates, pine);
  return long.length && long[long.length - 1] > pine ? pine : null;
}

/** "over 6.0 m" (wallLongPlateOverMm), or "" when no plate can be a long plate. */
export function wallLongPlateOverText(spec) {
  const mm = wallLongPlateOverMm(spec);
  return mm == null ? "" : `over ${(mm / 1000).toFixed(1)} m`;
}

/** A Walls part as it reads on a wall page: "90 × 45 LVL", "90 × 45 MGP10 H2" (grade, species, treatment; each once). */
export function wallPartText(part) {
  const p = part || {};
  const sec = p.section?.depthMm && p.section?.widthMm ? `${p.section.depthMm} × ${p.section.widthMm}` : "section?";
  const seen = new Set();
  const words = [p.grade, p.species, p.treatment].map((x) => (x == null ? "" : String(x).trim())).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
  return [sec, ...words].join(" ");
}

/** "Wall 2 butts in at 3,200: studs at 3,132.5 and 3,267.5" / "…: not counted (removed)" / merged / in an opening. */
export function junctionText(j) {
  const n = (v) => Math.round(v * 10) / 10 === Math.round(v) ? Math.round(v).toLocaleString("en-AU") : (Math.round(v * 10) / 10).toLocaleString("en-AU");
  const head = `${j.buttingLabel} butts in at ${n(j.stationMm)}`;
  if (j.off) return `${head}: junction studs removed by hand.`;
  const blk = j.blocks?.counted ? ` ${n(j.blocks.count)} blocks (${n(j.blocks.pairs)} pairs of ${n(j.blocks.lengthMm)} mm) go between the studs.` : "";
  const bits = j.studs.map((s) => (s.state === "added" ? `stud at ${n(s.positionMm)}` : s.state === "merged" ? `${n(s.positionMm)} served by the stud at ${n(s.mergedWithMm)}` : s.state === "inOpening" ? `${n(s.positionMm)} falls in an opening, not counted` : `${n(s.positionMm)} is past the wall's end, not counted`));
  return `${head}: ${bits.join("; ")}.${blk}`;
}

/** A corner on this wall (owner rule B): who takes the second stud, and why. "Wall 1 corner: Wall 2 takes the second stud (it starts here)." */
export function cornerText(c, thisLabel = "This wall") {
  const n = (v) => (Math.round(v * 10) / 10).toLocaleString("en-AU");
  if (c.multi) return `${c.otherLabel} all end at one point with ${thisLabel}: no corner stud is added there. Check it on the plan.`;
  const why = c.swapped ? "swapped by hand" : c.why === "starts" ? "that wall starts at the corner" : "the longer wall";
  if (!c.hasStud) return `Corner with ${c.otherLabel}: ${c.otherLabel} takes the second corner stud (${why}).`;
  const where = c.state === "merged" ? `served by the stud at ${n(c.mergedWithMm)}` : c.state === "added" ? `second stud at ${n(c.positionMm)}` : c.state === "inOpening" ? "falls in an opening, not counted" : "is past the wall's end, not counted";
  return `Corner with ${c.otherLabel}: ${thisLabel} takes the second corner stud (${why}): ${where}.`;
}

/**
 * A wall page's own notes for a Walls item (HUB 028), under its Walls line: "Plates: 90 × 45 LVL (over 6.0 m)" when a
 * plate on this wall is a long (LVL) plate (Sam's round 3), and "Lintels, jacks and trimmers at D1 aren't counted."
 * for this wall's own openings with no framing detail (the item's note names every wall's).
 */
export function wallFramingNotes(result, wallId, spec) {
  const out = [];
  const lay = (result?.layouts || []).find((l) => l?.method === "wall_framing@1" && l.totals && l.wallMeasurementId === wallId);
  if (lay?.centresFrom === "wall") out.push(`Studs at ${Math.round(lay.centresMm).toLocaleString("en-AU")} centres on this wall (its own setting).`);
  if (lay && lay.totals.longPlateMm > 0) {
    const over = wallLongPlateOverText(spec);
    out.push(`Plates: ${wallPartText(spec?.components?.longPlates)}${over ? ` (${over})` : ""}`);
  }
  // wall junctions and corners: each has its own line on the wall page (Remove / Count, Swap), not repeated here
  // HUB 031: each ruled opening's framing in one plain line ("W1: kings 1, jacks 1 each side · lintel 190 x 45 · sill trimmer 1")
  for (const o of lay?.openings || []) if (o.rule) out.push(openingRuleText(o));
  const names = [...new Set((result?.problems || []).filter((p) => p.code === "opening_framing_not_counted")
    .flatMap((p) => (p.refs || []).filter((r) => r?.measurementId === wallId).map((r) => r.openingLabel || r.openingId)).filter(Boolean))];
  if (names.length) out.push(`Lintels, jacks and trimmers at ${names.join(", ")} aren't counted.`);
  return out;
}

// ── wet-area walls: a wall's own stud centres (HUB 031, Sam 17 Nov 2026) ─────────────────────────────────────

/** The Walls item's own stud centres (what a wall without its own setting uses). */
export const itemCentresMm = (material) => (Number(material?.rules?.centresMm) > 0 ? Number(material.rules.centresMm) : WALL_FRAMING_RULES.centresMm);
/** This wall's own centres (null = the item's). */
export const wallOwnCentresMm = (wall) => (Number(wall?.inputs?.studCentresMm) > 0 ? Number(wall.inputs.studCentresMm) : null);
/**
 * A wall's inputs with the wet-area setting flipped: off → 450; on (any own centres) → the key is DELETED, so
 * switching 450 on and off leaves the inputs exactly as they were (never null, never the item's number written in).
 */
export function toggleWetWall(inputs) {
  const { studCentresMm: own, ...rest } = inputs || {};
  delete rest.studCentresFrom;
  return Number(own) > 0 ? rest : { ...rest, studCentresMm: WET_WALL_CENTRES_MM };
}
/** Set a wall's own centres to `mm`, or back to the item's (null). Same rule: clearing deletes the key. */
export function withWallCentres(inputs, mm) {
  const rest = { ...(inputs || {}) };
  delete rest.studCentresMm;
  return Number(mm) > 0 ? { ...rest, studCentresMm: Number(mm) } : rest;
}
/** The traced walls of one material with their own centres: [{ id, name, centresMm }], in name order. */
export function wetWallsOf(measurements, contributions, materialId) {
  const mine = new Set((contributions || []).filter((c) => !c.archived && c.jobMaterialId === materialId).map((c) => c.measurementId));
  return (measurements || []).filter((m) => !m.archived && m.kind === "wall" && mine.has(m.id) && wallOwnCentresMm(m))
    .map((m) => ({ id: m.id, name: m.inputs?.name || "Wall", centresMm: wallOwnCentresMm(m) }))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
}

/**
 * Sam, 21 Nov 2026: centres typed or chosen BY HAND on a wall. The wet areas' mark ("wet") comes off, so re-applying the wet areas never
 * overrides it without asking. Back to the item's centres deletes the key, except on a wall the wet areas had set: there the hand choice
 * is kept as its own value (so the next "Set wet-area walls to 450" asks first).
 */
export function withHandCentres(inputs, mm, itemMm) {
  const rest = { ...(inputs || {}) };
  const from = rest.studCentresFrom;
  delete rest.studCentresMm; delete rest.studCentresFrom;
  if (!(Number(mm) > 0)) return rest;
  if (Number(mm) === Number(itemMm) && from !== "wet") return rest;
  return { ...rest, studCentresMm: Number(mm) };
}
const sameCentres = (a, b) => (a?.studCentresMm ?? null) === (b?.studCentresMm ?? null) && (a?.studCentresFrom ?? null) === (b?.studCentresFrom ?? null);

// ── several walls at once (Select: tap walls to add them; Sam, 21 Nov 2026) ──────────────────────────────────

/** A tap on a wall in Select while walls are selected: { selected, multi } after it (2+ = multi; back to one = a single selection). */
export function bulkSelectTap({ selected, multi }, id) {
  const cur = multi?.length ? multi : selected ? [selected] : [];
  if (cur.length === 1 && cur[0] === id) return { selected: id, multi: [] };
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  return next.length >= 2 ? { selected: null, multi: next } : { selected: next[0] ?? null, multi: [] };
}
/** Stud centres on every selected wall, by hand: only the walls that change, as { before, next }. */
export function bulkCentresChanges(walls, material, mm) {
  const item = itemCentresMm(material);
  return (walls || []).map((w) => ({ before: w, next: { ...w, inputs: withHandCentres(w.inputs, mm, item) } })).filter((c) => !sameCentres(c.before.inputs, c.next.inputs));
}
/** Double top plate on or off on every selected wall: only the walls that change. */
export function bulkDoubleTopChanges(walls, material, on) {
  return (walls || []).filter((w) => wallDoubleTopOn(w, material) !== on).map((w) => ({ before: w, next: { ...w, inputs: withWallDoubleTop(w.inputs, on, material) } }));
}

// ── Double top plate per wall (Sam, 18 Nov 2026) ────────────────────────────────────────────────────────────
// A wall's own setting is `inputs.doubleTopPlate` (true / false). No key = it follows the Walls item's Double top plate. Setting a wall to
// what the item already says DELETES the key, so toggling on and off leaves the inputs exactly as they were (as with the wall's centres).

/** This wall's own Double top plate: true, false, or null (follows the item). */
export const wallOwnDoubleTop = (wall) => (wall?.inputs?.doubleTopPlate === true ? true : wall?.inputs?.doubleTopPlate === false ? false : null);
/** Does this wall carry a second top plate (its own setting, else the item's)? */
export const wallDoubleTopOn = (wall, material) => wallHasDoubleTop(wallOwnDoubleTop(wall), material?.rules);
/** A wall's inputs with Double top plate set to `on`: the same as the item's = no key of its own. */
export function withWallDoubleTop(inputs, on, material) {
  const rest = { ...(inputs || {}) };
  delete rest.doubleTopPlate;
  return on === (material?.rules?.doubleTopPlate === true) ? rest : { ...rest, doubleTopPlate: on === true };
}
/** One tap on the chip of ONE wall: flips what the wall shows now. */
export const toggleWallDoubleTop = (wall, material) => withWallDoubleTop(wall?.inputs, !wallDoubleTopOn(wall, material), material);
/** The traced walls of one material: { total, on, off, state: "on" | "off" | "mixed" | "none", own } (own = walls with a setting of their own). */
export function doubleTopState(measurements, contributions, material) {
  const mine = new Set((contributions || []).filter((c) => !c.archived && c.jobMaterialId === material?.id).map((c) => c.measurementId));
  const walls = (measurements || []).filter((m) => !m.archived && m.kind === "wall" && mine.has(m.id) && !isOutline(m));
  const on = walls.filter((w) => wallDoubleTopOn(w, material)).length;
  const own = walls.filter((w) => wallOwnDoubleTop(w) !== null).length;
  return { total: walls.length, on, off: walls.length - on, own, state: !walls.length ? "none" : on === walls.length ? "on" : on === 0 ? "off" : "mixed", walls };
}
/**
 * A tap on the chip for several walls at once: mixed or off → all on; all on → all off. Returns only the walls that change, as
 * { before, next } pairs (one Undo puts every one back).
 */
export function setAllDoubleTop(measurements, contributions, material) {
  const s = doubleTopState(measurements, contributions, material);
  const to = s.state !== "on";
  return s.walls.filter((w) => wallDoubleTopOn(w, material) !== to).map((w) => ({ before: w, next: { ...w, inputs: withWallDoubleTop(w.inputs, to, material) } }));
}
/** The Walls item's Double top plate changed: "Apply to every wall? Yes" clears every wall's own setting (returns those walls as { before, next }). */
export function clearDoubleTopOverrides(measurements, contributions, material) {
  return doubleTopState(measurements, contributions, material).walls.filter((w) => wallOwnDoubleTop(w) !== null)
    .map((w) => { const rest = { ...(w.inputs || {}) }; delete rest.doubleTopPlate; return { before: w, next: { ...w, inputs: rest } }; });
}

// ── openings (HUB 022 step 2: + Window / + Door on the plan; the same record as the wall's elevation makes) ──────

/** One ruled opening's framing in plain words, for the wall page and the opening sheet. */
export function openingRuleText(o) {
  const r = o.rule;
  if (!r) return "";
  const n = (v) => Math.round(v).toLocaleString("en-AU");
  const parts = [];
  const kj = (side) => `${r.kings[side]} king${r.kings[side] === 1 ? "" : "s"}${r.jacks[side] ? ` + ${r.jacks[side]} jack${r.jacks[side] === 1 ? "" : "s"}` : ""}`;
  parts.push(r.kings.left === r.kings.right && r.jacks.left === r.jacks.right ? `${kj("left")} each side` : `left ${kj("left")}, right ${kj("right")}`);
  const l = r.lintel;
  if (l.status === "sized" || l.status === "typed") parts.push(`lintel ${l.plies > 1 ? `${l.plies}/` : ""}${String(l.section).replace("x", " × ")}${l.grade ? ` ${l.grade}` : ""}${l.status === "typed" ? (l.perEngineer ? " (per engineer)" : " (typed)") : ""}${l.note ? ` — ${l.note}` : ""}${l.noFit ? ` — won't fit (${n(l.noFit.freeMm)} free)` : ""}`);
  else if (l.status === "unsized" || l.status === "engineer") parts.push(`lintel not sized (${l.reason})`);
  if (r.trimmers.head) parts.push(`head trimmer × ${r.trimmers.head}`);
  if (r.trimmers.sill) parts.push(`sill trimmer × ${r.trimmers.sill}`);
  return `${o.label || o.id}: ${parts.join(" · ")}.`;
}

/** The next free label for an opening on ONE wall: W1, W2 … for windows, D1 … for doors, O1 … for others. */
export function nextOpeningLabel(labels, type) {
  const p = type === "door" ? "D" : type === "other" ? "O" : "W";
  const used = new Set(labels || []);
  let n = 1;
  while (used.has(`${p}${n}`)) n++;
  return `${p}${n}`;
}

/**
 * An opening in a wall, exactly as the wall's elevation saves one: entered numbers only (offset from the wall start,
 * sill, width, height, label, type), no plan points and no fields of its own, so the server takes it unchanged.
 */
export function openingRecord(id, wallId, inputs) {
  return { id, kind: "opening", parentId: wallId, documentId: null, pageIndex: null, calibrationId: null, points: null, label: null, inputs };
}

/**
 * The sizes the + Window and + Door boxes start at: the last window's height and sill and the last door's height in
 * a WALL of this takeoff (null when there is none yet). A door always sits on the floor, so it has no sill. Openings
 * with no wall (aluminium windows by size, sill 0 as a placeholder) never set them.
 */
export function lastOpeningSizes(measurements) {
  let win = { heightMm: null, sillMm: null }, door = { heightMm: null }, leafMm = null;
  const walls = new Set((measurements || []).filter((m) => m.kind === "wall").map((m) => m.id));
  for (const m of measurements || []) {
    if (m.kind !== "opening" || m.archived || !walls.has(m.parentId)) continue;
    const x = m.inputs || {};
    // HUB 031: the last cavity slider's door width is remembered for the next one
    if (x.type === "door" && finite(x.cavityLeafMm) && x.cavityLeafMm > 0) leafMm = x.cavityLeafMm;
    if (!(finite(x.heightMm) && x.heightMm > 0)) continue;
    // a full-height opening follows its wall: its height must never become the next ordinary door's or window's
    if (x.fullHeight === true) continue;
    if (x.type === "door") door = { heightMm: x.heightMm };
    else if ((x.type || "window") === "window") win = { heightMm: x.heightMm, sillMm: finite(x.sillMm) && x.sillMm >= 0 ? x.sillMm : null };
  }
  return { window: win, door: leafMm != null ? { ...door, leafMm } : door };
}

/**
 * A full-height opening's stored height, kept as a snapshot of wall height − sill (the engine works it out afresh from
 * the wall's height every time, so a wall's later height edit can never leave it short). Null when the wall has no
 * usable height or the sill is at or above the top.
 */
export function fullHeightMm(wallInputs, sillMm) {
  const H = Number(wallInputs?.heightMm), s = Number(sillMm) || 0;
  return (wallInputs?.kind || "rect") === "rect" && H > 0 && s >= 0 && s < H ? H - s : null;
}
/**
 * The full-height openings of a wall whose stored height must change in the SAME edit as the wall's height (so Undo
 * puts both back): [{ before, next }].
 */
export function fullHeightFollowers(openings, nextWallInputs) {
  const out = [];
  for (const o of openings || []) {
    if (o.archived || o.inputs?.fullHeight !== true) continue;
    const h = fullHeightMm(nextWallInputs, o.inputs?.sillMm);
    if (h != null && h !== o.inputs.heightMm) out.push({ before: o, next: { ...o, inputs: { ...o.inputs, heightMm: h } } });
  }
  return out;
}
// ── Cavity slider on a door already drawn (Sam, 18 Nov 2026) ────────────────────────────────────────────────────
// The door is what is drawn or typed; the leaf stays exactly where it is. Turning Cavity slider on keeps the door width and
// grows the opening to 2 × door + 20 towards the pocket side; "left" is the wall start. cavityLeafMm + cavityPocket are the
// stored truth (the door's own width and the side), so the door's position is always read back the same way:
//   pocket right: door = [x, x + leaf]            pocket left: door = [x + leaf + 20, x + W]
const EXTRA = CAVITY_SLIDER_EXTRA_MM;
/** Where the door leaf stands in a stored slider: { leaf, pocket, doorX } (doorX = its left edge). null when not a slider. */
export function cavityDoor(inputs) {
  const leaf = Number(inputs?.cavityLeafMm);
  if (!(leaf > 0)) return null;
  const pocket = inputs.cavityPocket === "left" ? "left" : "right";
  return { leaf, pocket, doorX: pocket === "right" ? inputs.xMm : inputs.xMm + leaf + EXTRA };
}
/** The opening [x0, x1] a door of `leaf` at `doorX` has for `pocket`. */
function cavitySpan(leaf, doorX, pocket) {
  return { x0: pocket === "right" ? doorX : doorX - (leaf + EXTRA), W: cavityOpeningWidth(leaf) };
}
/** The slider's stored inputs for a door at doorX. */
function cavityInputs(inputs, leaf, doorX, pocket) {
  const { x0, W } = cavitySpan(leaf, doorX, pocket);
  return { ...inputs, xMm: x0, widthMm: W, cavityLeafMm: leaf, cavityPocket: pocket };
}
/** A plain-words warning when the slider's opening runs past a wall end or into another opening (never a refusal). */
export function cavityWarning(inputs, wallLenMm, others = []) {
  if (!(Number(inputs?.cavityLeafMm) > 0)) return null;
  const x0 = inputs.xMm, x1 = inputs.xMm + inputs.widthMm, W = inputs.widthMm;
  const fmt = (n) => Number(n).toLocaleString("en-AU");
  if (x0 < -1e-6) return `The pocket runs ${fmt(Math.round(-x0))} past the start of the wall. Try the other side, or move the door.`;
  if (wallLenMm > 0 && x1 > wallLenMm + 1e-6) return `The pocket runs ${fmt(Math.round(x1 - wallLenMm))} past the end of the wall. Try the other side, or move the door.`;
  const hit = others.find((o) => x0 < o.x1 - 1e-6 && x1 > o.x0 + 1e-6);
  if (hit) return `A ${fmt(W)} opening runs into ${hit.label || "another opening"}. Try the other side, or move the door.`;
  return null;
}
/** The side a new pocket goes: where it fits inside the wall and clear of other openings; both fit (or neither) → right. */
export function cavityDefaultSide(inputs, wallLenMm, others = []) {
  const w = Number(inputs?.widthMm);
  const fits = (side) => cavityWarning(cavityInputs({ ...inputs }, w, inputs.xMm, side), wallLenMm, others) == null;
  return fits("right") || !fits("left") ? "right" : "left";
}
/**
 * Cavity slider ON for a drawn door: the door width is the opening it had; the door stays put; the opening grows to
 * 2 × door + 20 towards `side` (default: cavityDefaultSide). Returns { inputs, warning }, or { error } with no door width.
 */
export function cavityConvert(inputs, side, wallLenMm, others = []) {
  const w = Number(inputs?.widthMm);
  if (!(w > 0)) return { error: "Enter the door width first." };
  if (w < 300 || w > 1500) return { error: "Door width must be between 300 and 1,500 mm. Change the width first." };
  const pocket = side === "left" || side === "right" ? side : cavityDefaultSide(inputs, wallLenMm, others);
  const next = cavityInputs(inputs, w, inputs.xMm, pocket);
  return { inputs: next, warning: cavityWarning(next, wallLenMm, others) };
}
/** Move the pocket to the other side: the door stays put. */
export function cavitySetSide(inputs, side, wallLenMm, others = []) {
  const d = cavityDoor(inputs);
  if (!d || (side !== "left" && side !== "right")) return { error: "This isn't a cavity slider." };
  const next = cavityInputs(inputs, d.leaf, d.doorX, side);
  return { inputs: next, warning: cavityWarning(next, wallLenMm, others) };
}
/** Change the door width: the jamb edge (away from the pocket) stays fixed; the pocket grows or shrinks. */
export function cavitySetLeaf(inputs, leaf, wallLenMm, others = []) {
  const d = cavityDoor(inputs);
  if (!d || !(Number(leaf) > 0)) return { error: "Enter the door width first." };
  const L = Number(leaf);
  // right: the left (jamb) edge x stays; left: the right edge x + W stays, so the door's right edge is fixed
  const doorX = d.pocket === "right" ? d.doorX : (inputs.xMm + inputs.widthMm) - L;
  const next = cavityInputs(inputs, L, doorX, d.pocket);
  return { inputs: next, warning: cavityWarning(next, wallLenMm, others) };
}
/** Cavity slider OFF: the opening returns to the door's own width at the door's position. */
export function cavityOff(inputs) {
  const d = cavityDoor(inputs);
  if (!d) return inputs;
  const next = { ...inputs, xMm: d.doorX, widthMm: d.leaf };
  delete next.cavityLeafMm; delete next.cavityPocket;
  return next;
}

/**
 * Change ONE member's override on a distribution run (03 T1): { removed } | { lengthMm } | { duplicate }.
 * Removing clears its length/duplicates (the engine rejects a removed member that is also re-lengthed).
 * Empty overrides are dropped. Returns a new list.
 */
export function withOverride(list, station, patch) {
  const cur = (list || []).find((o) => o.station === station) || { station };
  let next = { ...cur, ...patch };
  if (patch.removed) next = { station, removed: true };
  if (!next.removed) delete next.removed;
  if (!(finite(next.lengthMm) && next.lengthMm > 0)) delete next.lengthMm;
  if (!(Number.isInteger(next.duplicate) && next.duplicate > 0)) delete next.duplicate;
  const rest = (list || []).filter((o) => o.station !== station);
  return Object.keys(next).length > 1 ? [...rest, next] : rest;
}

/** Distribution inputs at creation: the material's current spacing rules, no member changes yet. */
export function distributionInputs(rules) {
  const r = rules || {};
  return {
    startOffsetMm: finite(r.startOffsetMm) ? r.startOffsetMm : 0, endOffsetMm: finite(r.endOffsetMm) ? r.endOffsetMm : 0,
    includeStart: r.includeStart !== false, includeEnd: r.includeEnd !== false, spacing: r.spacing === "equal" ? "equal" : "fixed", overrides: [],
  };
}

/** The job-material record shape the takeoff upserts (same as TakeoffApp matRec). */
export const materialRecord = (m) => ({ id: m.id, name: m.name, methodKey: m.methodKey, methodVersion: m.methodVersion || 1, spec: m.spec, rules: m.rules || {},
  profile: m.profile || null, fromPresetId: m.fromPresetId || null, fromPresetRevision: m.fromPresetRevision || null });

// ── repeated timber review (TC-R04 02 §2, 03 T1): read straight from the engine result, never recalculated ──────

/** The thickness a member takes up along its run (the smaller section dimension), or null when no section is set. */
export function memberThicknessMm(material) {
  const s = material?.spec?.section;
  const d = Number(s?.depthMm), w = Number(s?.widthMm);
  return d > 0 && w > 0 ? Math.min(d, w) : null;
}

/** Stock the engine allocated one member station from: { stockMm } | { offcut: label } | null (not allocated). */
export function stockForStation(result, stationId) {
  const tag = `:${stationId}:`;
  for (const g of result?.allocation?.groups || []) {
    for (const b of g.bars || []) {
      if (!(b.cuts || []).some((c) => String(c.demandId || "").includes(tag))) continue;
      return b.source === "new" ? { stockMm: b.stockLengthMm } : { offcut: b.offcutLabel || "an offcut" };
    }
  }
  return null;
}

/**
 * Members, stock and needed lengths of a repeated-member material from the engine result (no blocking problem only —
 * otherwise the problems say what is missing and nothing here could be ordered).
 * @returns {{ members:number, stock:Array<[number, number]>, fromOffcuts:number, needs:number[] } | null}
 */
export function timberOrderSummary(result) {
  if (!result?.allocation || (result.problems || []).some((p) => p.blocking !== false)) return null;
  const live = (result.layouts || []).flatMap((l) => (l?.kind === "repeated" ? l.ticks || [] : [])).filter((t) => !t.removed);
  if (!live.length) return null;
  const members = live.length + live.reduce((a, t) => a + (t.duplicates || 0), 0);
  const byLen = new Map();
  let fromOffcuts = 0;
  for (const g of result.allocation.groups || []) {
    for (const b of g.bars || []) {
      if (b.source === "new") byLen.set(b.stockLengthMm, (byLen.get(b.stockLengthMm) || 0) + 1);
      else fromOffcuts += 1;
    }
  }
  const needs = [...new Set(live.map((t) => Math.round(t.lengthNeededMm * 100) / 100))].sort((a, b) => a - b);
  return { members, stock: [...byLen].sort((a, b) => a[0] - b[0]), fromOffcuts, needs };
}

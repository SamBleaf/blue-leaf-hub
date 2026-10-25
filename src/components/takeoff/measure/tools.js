// =============================================================================
// measure/tools.js — which measuring tools a material gets, layer colours, the on-device drawing draft and small
// record helpers for MeasureScreen (TC-R04 02 §2–3, 03 T1, 13). Pure + localStorage only (always try/catch).
//
//   flashing           Run (continuous path, 13) · Count · Select · Pan
//   timber repeated    Member · Distribution · Select · Pan            (rafters / joists / battens; no Member when
//                      the cut length is entered)
//   timber Walls       Line · Select · Pan                             (HUB 028 wall_framing: one trace → studs, plates and
//                      noggins together; no Rectangle or Area, an outline has no single wall length)
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
import { TIMBER_GRID, WALLS_PURPOSE, WALL_PARTS, WALL_PART_LABELS, longPlateStockLengths } from "../../../../shared/takeoff/engine/families.js";

/** Layer colours on the plan (measurement layer, not supplier finish — 02 §1). */
export const COLORS = Object.freeze({
  flashing: "#006c9b", overflow: "#dc2626", handling: "#b45309", draft: "#64748b", count: "#16a34a", selected: "#f59e0b",
  halo: "#7dd3fc", wall: "#9a3412", member: "#7c3aed", distribution: "#0d9488", trim: "#006c9b", split: "#0f172a", removed: "#94a3b8",
  window: "#0284c7", door: "#4f46e5",
});

const WALL_FAMILIES = new Set(["cladding", "aac", "foam", "timber-cladding", "batten", "accessory"]);

/** TC-R04 family of a job material (null = flashing). */
export const familyOf = (m) => (m?.spec?.family && m.spec.family !== "flashing" ? m.spec.family : null);
export const isFlashingMaterial = (m) => !!m && !familyOf(m);
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
  const t = { walls: lays.length, studs: 0, studsByHeight: [], bottomPlateMm: 0, topPlateMm: 0, secondTopPlateMm: null, noggins: 0, rows: [] };
  const byH = new Map();
  for (const { totals: x } of lays) {
    t.studs += x.studs || 0;
    if (x.studs) byH.set(x.studLengthMm, (byH.get(x.studLengthMm) || 0) + x.studs);
    t.bottomPlateMm += x.bottomPlateMm || 0;
    t.topPlateMm += x.topPlateMm || 0;
    if (x.secondTopPlateMm != null) t.secondTopPlateMm = (t.secondTopPlateMm || 0) + x.secondTopPlateMm;
    t.noggins += x.noggins || 0;
    if (Number.isFinite(x.nogginRows) && !t.rows.includes(x.nogginRows)) t.rows.push(x.nogginRows);
  }
  t.studsByHeight = [...byH].sort((a, b) => a[0] - b[0]);
  t.rows.sort((a, b) => a - b);
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
 * read "21 studs (13 at 2,700, 8 at 3,000)", lowest first; Double top plate reads "top plate 2 × 10.00 m"; rows read
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
  const two = t.secondTopPlateMm;
  const top = two == null ? m(t.topPlateMm) : Math.abs(two - t.topPlateMm) < 0.5 ? `2 × ${m(t.topPlateMm)}` : `${m(t.topPlateMm)} + ${m(two)}`;
  const rows = t.rows || [];
  const rowText = !rows.length ? "" : rows.length === 1 ? ` (${rows[0]} row${rows[0] === 1 ? "" : "s"})` : ` (${rows[0]}–${rows[rows.length - 1]} rows)`;
  const body = [studs, `bottom plate ${m(t.bottomPlateMm)}`, `top plate ${top}`, `${n(t.noggins)} noggin${t.noggins === 1 ? "" : "s"}${rowText}`, ...(out ? [out] : [])].join(" · ");
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
  const s = spec?.components?.plates?.stock || {};
  const max = Number(s.maxMm);
  if (s.maxMm == null || s.maxMm === "" || !(max >= TIMBER_GRID.minMm)) return null;
  const off = new Set((Array.isArray(s.unavailableMm) ? s.unavailableMm : []).map(Number));
  let pine = null;
  for (let l = TIMBER_GRID.minMm + Math.floor((max - TIMBER_GRID.minMm) / TIMBER_GRID.incrementMm) * TIMBER_GRID.incrementMm; l >= TIMBER_GRID.minMm; l -= TIMBER_GRID.incrementMm) {
    if (!off.has(l)) { pine = l; break; }
  }
  if (pine == null) return null;
  const long = longPlateStockLengths(spec?.components?.longPlates);
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

/**
 * A wall page's own notes for a Walls item (HUB 028), under its Walls line: "Plates: 90 × 45 LVL (over 6.0 m)" when a
 * plate on this wall is a long (LVL) plate (Sam's round 3), and "Lintels, jacks and trimmers at D1 aren't counted."
 * for this wall's own openings with no framing detail (the item's note names every wall's).
 */
export function wallFramingNotes(result, wallId, spec) {
  const out = [];
  const lay = (result?.layouts || []).find((l) => l?.method === "wall_framing@1" && l.totals && l.wallMeasurementId === wallId);
  if (lay && lay.totals.longPlateMm > 0) {
    const over = wallLongPlateOverText(spec);
    out.push(`Plates: ${wallPartText(spec?.components?.longPlates)}${over ? ` (${over})` : ""}`);
  }
  const names = [...new Set((result?.problems || []).filter((p) => p.code === "opening_framing_not_counted")
    .flatMap((p) => (p.refs || []).filter((r) => r?.measurementId === wallId).map((r) => r.openingLabel || r.openingId)).filter(Boolean))];
  if (names.length) out.push(`Lintels, jacks and trimmers at ${names.join(", ")} aren't counted.`);
  return out;
}

// ── openings (HUB 022 step 2: + Window / + Door on the plan; the same record as the wall's elevation makes) ──────

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
  let win = { heightMm: null, sillMm: null }, door = { heightMm: null };
  const walls = new Set((measurements || []).filter((m) => m.kind === "wall").map((m) => m.id));
  for (const m of measurements || []) {
    if (m.kind !== "opening" || m.archived || !walls.has(m.parentId)) continue;
    const x = m.inputs || {};
    if (!(finite(x.heightMm) && x.heightMm > 0)) continue;
    if (x.type === "door") door = { heightMm: x.heightMm };
    else if ((x.type || "window") === "window") win = { heightMm: x.heightMm, sillMm: finite(x.sillMm) && x.sillMm >= 0 ? x.sillMm : null };
  }
  return { window: win, door };
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

// =============================================================================
// shared/takeoff/bracing.js — wall bracing marks ("Add bracing" in Walls; Sam, 18 Nov 2026).
//
// A mark is kept on its wall (wall input `bracing`, a list), so it moves, undoes and is removed with that wall's own edits:
//   { id, type: "ply",   xMm }            one 1,200 mm wide sheet starting xMm along the wall; its length follows the wall height
//   { id, type: "cross", xMm, spanMm }    a hoop iron cross brace over spanMm of wall (default 2,700), two diagonals
// Ply sheets: the SMALLEST stocked sheet length that covers the wall height (BRACE OS H2 6 x 1200 x 2745 or 3050, seeds, flagged to confirm).
// Cross braces: each diagonal = sqrt(span² + height²); a cross = 2 diagonals; tensioners = 2 per cross (one per diagonal). The hoop iron
// is added to the walls' own hoop iron straps as ONE line in rolls (shared/takeoff/hoopIron.js). Temporary bracing and screws are never
// calculated: they are added by hand. Pure: no DB, no DOM, no clock.
//
// Reference (to confirm, not verified against the standard text here): AS 1684.2 Section 8 covers wall bracing, including metal strap
// (tension) bracing fixed across the studs and tensioned. The geometry above is the quantity; the bracing DESIGN (how many, where, what
// angle) stays with the engineer / the bracing plan. Sam's rule of thumb (2.7 span x 1.6 x 2) is a round-up of the same geometry.
// =============================================================================

export const BRACING_RULE = Object.freeze({
  plyWidthMm: 1200, crossSpanDefaultMm: 2700, crossSpanMinMm: 600, tensionersPerCross: 2, diagonalsPerCross: 2, maxMarksPerWall: 60,
  source: "OWNER-2026-11-18 (geometry; AS 1684.2 Section 8 for the type of bracing — confirm against the bracing plan)",
});

/** The stocked ply brace sheets, as the supplier prints them. Seeds: flagged to confirm with the supplier. */
export const PLY_BRACE_PRODUCTS = Object.freeze([
  Object.freeze({ id: "ply-brace-os-h2-6x1200x2745", name: "BRACE OS H2 6X1200X2745MM", lengthMm: 2745, defaultToConfirm: true }),
  Object.freeze({ id: "ply-brace-os-h2-6x1200x3050", name: "BRACE OS H2 6X1200X3050MM", lengthMm: 3050, defaultToConfirm: true }),
]);
export const TENSIONER_PRODUCT = Object.freeze({ id: "tensioner-set-hex-head", name: "TENSIONER SET HEX HEAD (PCE)" });

/** The tallest height a straight, raked, gabled or outlined wall reaches (mm), or null when it has none yet. */
export function bracingHeightMm(wall) {
  const n = (v) => (Number(v) > 0 ? Number(v) : 0);
  const w = wall || {};
  const kind = w.kind || "rect";
  const h = kind === "rect" ? n(w.heightMm) : kind === "rake" ? Math.max(n(w.startHeightMm), n(w.endHeightMm)) : kind === "gable" ? Math.max(n(w.eavesHeightMm), n(w.apexHeightMm))
    : Array.isArray(w.points || w.polygon) && (w.points || w.polygon).length >= 3 ? (() => { const ys = (w.points || w.polygon).map((p) => Number(p.y)).filter(Number.isFinite); return ys.length ? Math.max(...ys) - Math.min(...ys) : 0; })() : 0;
  return h > 0 ? h : null;
}

/** The smallest stocked ply brace sheet that covers this wall height, or null when none is long enough (or there is no height). */
export const plyBraceFor = (heightMm) => (Number(heightMm) > 0 ? PLY_BRACE_PRODUCTS.find((p) => p.lengthMm >= Number(heightMm) - 1e-9) || null : null);

/**
 * Hoop iron for one cross brace: two diagonals, each sqrt(span² + height²). Metres to 3 dp, plus the angle of a diagonal from the
 * horizontal (so the screen can say when it is very steep or flat).
 */
export function crossBraceHoop(spanMm, heightMm) {
  const s = Number(spanMm), h = Number(heightMm);
  if (!(s > 0) || !(h > 0)) return null;
  const diagonalMm = Math.sqrt(s * s + h * h);
  return { diagonalMm: Number(diagonalMm.toFixed(1)), metres: Number(((BRACING_RULE.diagonalsPerCross * diagonalMm) / 1000).toFixed(3)),
    angleDeg: Number(((Math.atan2(h, s) * 180) / Math.PI).toFixed(1)), tensioners: BRACING_RULE.tensionersPerCross };
}

/** The marks on a wall's inputs (always an array). */
export const bracingOf = (inputs) => (Array.isArray(inputs?.bracing) ? inputs.bracing : []);

const snap10 = (v) => Math.round(v / 10) * 10;
let seq = 0;
const newMarkId = () => `br-${Date.now().toString(36)}-${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Add a mark at the tapped place. Returns the wall's new inputs, or a plain-words refusal. A ply sheet is centred on the tap and
 * kept inside the wall; it cannot overlap another sheet. A cross brace is centred on the tap over `spanMm` and kept inside the wall.
 * @returns {{ ok:true, inputs:object, mark:object } | { ok:false, error:string }}
 */
export function addBracingMark(inputs, { type, atMm, lengthMm, spanMm = BRACING_RULE.crossSpanDefaultMm, id = newMarkId() }) {
  const L = Number(lengthMm);
  const marks = bracingOf(inputs);
  if (!(L > 0)) return { ok: false, error: "Set the wall's length first." };
  if (marks.length >= BRACING_RULE.maxMarksPerWall) return { ok: false, error: `A wall can have at most ${BRACING_RULE.maxMarksPerWall} bracing marks.` };
  let mark;
  if (type === "ply") {
    const W = BRACING_RULE.plyWidthMm;
    if (L < W) return { ok: false, error: `This wall is ${Math.round(L)} mm long, shorter than a ${W} mm brace sheet.` };
    const xMm = snap10(Math.min(Math.max(Number(atMm) - W / 2, 0), L - W));
    const clash = marks.find((m) => m.type === "ply" && xMm < m.xMm + W && m.xMm < xMm + W);
    if (clash) return { ok: false, error: "That sheet would overlap another brace sheet. Tap further along the wall." };
    mark = { id, type: "ply", xMm };
  } else if (type === "cross") {
    const S = Number(spanMm);
    if (!(S >= BRACING_RULE.crossSpanMinMm)) return { ok: false, error: `A cross brace spans at least ${BRACING_RULE.crossSpanMinMm} mm.` };
    if (S > L) return { ok: false, error: `This wall is ${Math.round(L)} mm long, shorter than a ${Math.round(S)} mm cross brace.` };
    mark = { id, type: "cross", xMm: snap10(Math.min(Math.max(Number(atMm) - S / 2, 0), L - S)), spanMm: Math.round(S) };
  } else return { ok: false, error: "Choose a ply sheet or a cross brace." };
  return { ok: true, mark, inputs: { ...(inputs || {}), bracing: [...marks, mark] } };
}

/** The wall's inputs without one mark. When none are left the key is DELETED, so removing the last leaves the inputs as they were. */
export function removeBracingMark(inputs, id) {
  const rest = bracingOf(inputs).filter((m) => m.id !== id);
  const out = { ...(inputs || {}) };
  if (rest.length) out.bracing = rest; else delete out.bracing;
  return out;
}

/** Plain words for one mark (the wall page and the plan). */
export function bracingMarkText(m, heightMm = null) {
  const n = (v) => Math.round(v).toLocaleString("en-AU");
  if (m.type === "ply") { const p = plyBraceFor(heightMm); return `Ply sheet at ${n(m.xMm)} mm${p ? ` · ${p.lengthMm.toLocaleString("en-AU")} long` : ""}`; }
  const h = crossBraceHoop(m.spanMm, heightMm);
  return `Cross brace at ${n(m.xMm)} mm, spans ${n(m.spanMm)} mm${h ? ` · ${h.metres.toFixed(2)} m hoop iron, ${h.tensioners} tensioners` : ""}`;
}

/** Re-check marks sent by a client (the server runs this too). Unknown fields are dropped; a bad mark is refused in plain words. */
export function cleanBracing(list) {
  if (list == null) return { ok: true, marks: [] };
  if (!Array.isArray(list)) return { ok: false, error: "The bracing marks are invalid." };
  if (list.length > BRACING_RULE.maxMarksPerWall) return { ok: false, error: `A wall can have at most ${BRACING_RULE.maxMarksPerWall} bracing marks.` };
  const ids = new Set();
  const marks = [];
  for (const m of list) {
    if (!m || typeof m !== "object") return { ok: false, error: "A bracing mark is invalid." };
    const id = String(m.id ?? "").replace(/[^\w.-]/g, "").slice(0, 60);
    if (!id || ids.has(id)) return { ok: false, error: "A bracing mark has no id, or two share one." };
    ids.add(id);
    const xMm = Number(m.xMm);
    if (!(xMm >= 0 && xMm <= 200000)) return { ok: false, error: "A bracing mark is outside the wall." };
    if (m.type === "ply") marks.push({ id, type: "ply", xMm: Math.round(xMm) });
    else if (m.type === "cross") {
      const spanMm = Number(m.spanMm);
      if (!(spanMm >= BRACING_RULE.crossSpanMinMm && spanMm <= 100000)) return { ok: false, error: `A cross brace spans at least ${BRACING_RULE.crossSpanMinMm} mm.` };
      marks.push({ id, type: "cross", xMm: Math.round(xMm), spanMm: Math.round(spanMm) });
    } else return { ok: false, error: "A bracing mark is neither a ply sheet nor a cross brace." };
  }
  return { ok: true, marks };
}

/**
 * What a wall's marks buy: ply sheets (one product, by wall height), hoop iron metres for the cross braces, tensioners.
 * Anything that cannot be counted (no height, or no stocked sheet that long) is said in `notes` and left out, never guessed.
 * @param {{ bracing?:Array, lengthMm?:number }} wallInputs
 * @param {number|null} heightMm
 * @returns {{ ply: {product:object, count:number}|null, cross: {count:number, metres:number, tensioners:number, minAngleDeg:number, maxAngleDeg:number}|null, notes:string[] }}
 */
export function bracingForWall(marks, heightMm, wallLengthMm = null) {
  const notes = [];
  const plies = (marks || []).filter((m) => m.type === "ply");
  const crosses = (marks || []).filter((m) => m.type === "cross");
  let ply = null, cross = null;
  if (plies.length) {
    const p = plyBraceFor(heightMm);
    if (!(Number(heightMm) > 0)) notes.push(`${plies.length} brace sheet${plies.length === 1 ? "" : "s"} not counted: set the wall height first.`);
    else if (!p) notes.push(`${plies.length} brace sheet${plies.length === 1 ? "" : "s"} not counted: the wall is ${Math.round(heightMm).toLocaleString("en-AU")} mm high and no stocked sheet is that long (${PLY_BRACE_PRODUCTS.map((x) => x.lengthMm.toLocaleString("en-AU")).join(" or ")}). Add the sheets by hand.`);
    else ply = { product: p, count: plies.length };
  }
  if (crosses.length) {
    if (!(Number(heightMm) > 0)) notes.push(`${crosses.length} cross brace${crosses.length === 1 ? "" : "s"} not counted: set the wall height first.`);
    else {
      let metres = 0, minA = Infinity, maxA = 0;
      for (const c of crosses) { const h = crossBraceHoop(c.spanMm, heightMm); metres += h.metres; minA = Math.min(minA, h.angleDeg); maxA = Math.max(maxA, h.angleDeg); }
      cross = { count: crosses.length, metres: Number(metres.toFixed(3)), tensioners: crosses.length * BRACING_RULE.tensionersPerCross, minAngleDeg: minA, maxAngleDeg: maxA };
      if (minA < 30 || maxA > 60) notes.push(`A cross brace here runs at ${minA === maxA ? `${minA}` : `${minA} to ${maxA}`} degrees. Check it against the bracing plan (cross braces are normally 30 to 60 degrees).`);
    }
  }
  if (wallLengthMm != null && Number(wallLengthMm) > 0) {
    const out = (marks || []).filter((m) => m.xMm + (m.type === "ply" ? BRACING_RULE.plyWidthMm : Number(m.spanMm)) > Number(wallLengthMm) + 1);
    if (out.length) notes.push(`${out.length} bracing mark${out.length === 1 ? " runs" : "s run"} past the end of the wall (the wall was shortened). Remove or re-place ${out.length === 1 ? "it" : "them"}.`);
  }
  return { ply, cross, notes };
}

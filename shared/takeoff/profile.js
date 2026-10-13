// =============================================================================
// shared/takeoff/profile.js — canonical 2D flashing cross-section profile.
//
// Stored as DIMENSIONS + TOPOLOGY; coordinates are always derived. Dimensions are finished
// cross-section face dimensions entered by the builder (not order length).
//
//   segments[i].lengthMm     leg length (mm, > 0)
//   bends[i].turnDeg         signed turn between segment i and i+1 (+ = left/CCW, − = right/CW).
//                            UI shows includedAngle = 180 − |turn| and a bend direction.
//                            Straight continuation = turn 0 (included 180°); square fold = ±90.
//   start / end              treatment: none | open_return | closed_hem, widthMm, side left|right
//                            (relative to traversal). A closed hem is a symbol, never a segment.
//   coatedFace               left | right of traversal (the COLORBOND/painted face).
//   initialDirectionDeg      drawing orientation only — never part of the part's identity.
//
// Operations keep the physical meaning straight:
//   setSegmentLength — other legs + angles unchanged, downstream vertices move.
//   setIncludedAngle — leg lengths unchanged.
//   rotate           — orientation only.
//   mirror           — geometry AND coating together (coated side flips relative to traversal).
//   flipCoatedFace   — the physical coating choice only.
//   reverse          — same physical part, opposite traversal: coated side + hem sides swap.
// =============================================================================
import { TakeoffValidationError, isFiniteNumber, stableStringify } from "./units.js";

export const PROFILE_SCHEMA_VERSION = 1;
export const MAX_PROFILE_SEGMENTS = 100;
export const MAX_LEG_MM = 5000;
export const MAX_TREATMENT_MM = 200;
export const TREATMENT_TYPES = Object.freeze(["none", "open_return", "closed_hem"]);
const SIDES = ["left", "right"];

const flip = (s) => (s === "left" ? "right" : "left");
const deg2rad = (d) => (d * Math.PI) / 180;
const normDeg = (d) => ((d % 360) + 360) % 360;
let _seq = 0;
const newSegId = () => `s${Date.now().toString(36)}${(_seq++).toString(36)}`;

function cleanTreatment(t) {
  const type = t?.type || "none";
  if (type === "none") return { type: "none", widthMm: 0, side: "left" };
  return { type, widthMm: t.widthMm, side: t.side || "left" };
}

/** A blank 3-leg starter profile (a simple apron-style shape). */
export function starterProfile() {
  return normaliseProfile({
    initialDirectionDeg: 0,
    segments: [{ id: "s1", lengthMm: 100 }, { id: "s2", lengthMm: 150 }, { id: "s3", lengthMm: 50 }],
    bends: [{ turnDeg: 90 }, { turnDeg: -90 }],
    start: { type: "none" }, end: { type: "closed_hem", widthMm: 10, side: "right" },
    coatedFace: "left",
  });
}

/** Validate + canonicalise. Throws TakeoffValidationError with a plain-English message. */
export function normaliseProfile(p) {
  if (!p || typeof p !== "object") throw new TakeoffValidationError("Profile is missing.");
  const segments = Array.isArray(p.segments) ? p.segments : [];
  if (segments.length < 1) throw new TakeoffValidationError("A profile needs at least one leg.");
  if (segments.length > MAX_PROFILE_SEGMENTS) throw new TakeoffValidationError(`A profile can have at most ${MAX_PROFILE_SEGMENTS} legs.`);
  const ids = new Set();
  const segs = segments.map((s, i) => {
    if (!isFiniteNumber(s?.lengthMm) || s.lengthMm <= 0) throw new TakeoffValidationError(`Leg ${i + 1} needs a length greater than 0 mm.`);
    if (s.lengthMm > MAX_LEG_MM) throw new TakeoffValidationError(`Leg ${i + 1} is longer than ${MAX_LEG_MM} mm — check the number.`);
    const id = typeof s.id === "string" && s.id && !ids.has(s.id) ? s.id : newSegId();
    ids.add(id);
    return { id, lengthMm: s.lengthMm };
  });
  const bendsIn = Array.isArray(p.bends) ? p.bends : [];
  if (bendsIn.length !== segs.length - 1) throw new TakeoffValidationError("Every corner between legs needs a bend angle.");
  const bends = bendsIn.map((b, i) => {
    if (!isFiniteNumber(b?.turnDeg) || Math.abs(b.turnDeg) >= 180) {
      throw new TakeoffValidationError(`Corner ${i + 1} needs an included angle between 0° and 180°.`);
    }
    return { turnDeg: b.turnDeg };
  });
  const start = cleanTreatment(p.start);
  const end = cleanTreatment(p.end);
  for (const [label, t] of [["Start", start], ["End", end]]) {
    if (!TREATMENT_TYPES.includes(t.type)) throw new TakeoffValidationError(`${label} treatment is not recognised.`);
    if (t.type !== "none") {
      if (!isFiniteNumber(t.widthMm) || t.widthMm <= 0 || t.widthMm > MAX_TREATMENT_MM) {
        throw new TakeoffValidationError(`${label} ${t.type === "closed_hem" ? "hem" : "return"} needs a width between 1 and ${MAX_TREATMENT_MM} mm.`);
      }
      if (!SIDES.includes(t.side)) throw new TakeoffValidationError(`${label} treatment needs a side.`);
    }
  }
  if (!SIDES.includes(p.coatedFace)) throw new TakeoffValidationError("Choose which face is coated.");
  const dir = isFiniteNumber(p.initialDirectionDeg) ? normDeg(p.initialDirectionDeg) : 0;
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    units: "mm",
    initialDirectionDeg: dir,
    segments: segs,
    bends,
    start,
    end,
    coatedFace: p.coatedFace,
  };
}

/** Included angle (deg) shown to the user for a signed turn. */
export function includedAngle(turnDeg) {
  return 180 - Math.abs(turnDeg);
}
export function bendDirection(turnDeg) {
  return turnDeg > 0 ? "left" : turnDeg < 0 ? "right" : "straight";
}

/** Derived vertex coordinates (mm, y up) and per-segment headings. */
export function profileVertices(profile) {
  const p = profile;
  const pts = [{ x: 0, y: 0 }];
  const headings = [];
  let heading = p.initialDirectionDeg;
  for (let i = 0; i < p.segments.length; i++) {
    headings.push(heading);
    const a = deg2rad(heading);
    const prev = pts[pts.length - 1];
    pts.push({ x: prev.x + p.segments[i].lengthMm * Math.cos(a), y: prev.y + p.segments[i].lengthMm * Math.sin(a) });
    if (i < p.bends.length) heading = normDeg(heading + p.bends[i].turnDeg);
  }
  return { points: pts, headings };
}

/** Unit normal on a side of a heading. */
function sideNormal(headingDeg, side) {
  const a = deg2rad(headingDeg);
  return side === "left" ? { x: -Math.sin(a), y: Math.cos(a) } : { x: Math.sin(a), y: -Math.cos(a) };
}

/**
 * Coated-face highlight: each segment offset by `offsetMm` toward the coated side. Used both
 * for rendering (UI + PDF) and for orientation-invariant tests.
 */
export function coatedOffsetSegments(profile, offsetMm = 3) {
  const { points, headings } = profileVertices(profile);
  return headings.map((h, i) => {
    const n = sideNormal(h, profile.coatedFace);
    return {
      a: { x: points[i].x + n.x * offsetMm, y: points[i].y + n.y * offsetMm },
      b: { x: points[i + 1].x + n.x * offsetMm, y: points[i + 1].y + n.y * offsetMm },
    };
  });
}

/** End-treatment symbol geometry (for drawing): anchor point, direction and side normal. */
export function treatmentGlyphs(profile) {
  const { points, headings } = profileVertices(profile);
  const out = [];
  if (profile.start.type !== "none") {
    const h = normDeg(headings[0] + 180); // pointing outward from the start
    out.push({ at: "start", ...profile.start, point: points[0], headingDeg: h, normal: sideNormal(headings[0], profile.start.side) });
  }
  if (profile.end.type !== "none") {
    const last = headings[headings.length - 1];
    out.push({ at: "end", ...profile.end, point: points[points.length - 1], headingDeg: last, normal: sideNormal(last, profile.end.side) });
  }
  return out;
}

/**
 * How to DRAW an end treatment (editor + PDF), in mm space (y up) at a given scale (px per mm).
 *   closed_hem   the sheet folds 180° back on itself: a rounded fold just beyond the end, then the hem
 *                runs back alongside the leg for its width. A crushed hem has no real gap — the gap
 *                here is visual only, wide enough to show the coated band inside the fold when the hem
 *                folds onto the coated face.
 *   open_return  a 90° return of its width on the fold side.
 * Lengths are true scale, but never drawn shorter than `minPx` (so a 10 mm hem stays visible).
 * `band` is the coated-face highlight continuing around the treatment on the correct face: the
 * coating stays on the same face of the sheet, which is the coated side of the profile's traversal
 * (reversed for a START treatment, which is traced outward from L1).
 */
export function treatmentDrawing(profile, glyph, scale, { coatOffsetPx = 4.5, minPx = 14, maxPx = 160 } = {}) {
  const mmPerPx = 1 / scale;
  const h = deg2rad(glyph.headingDeg);
  const v = { x: Math.cos(h), y: Math.sin(h) };   // outward along the leg
  const u = glyph.normal;                          // toward the fold side
  const len = Math.min(Math.max(glyph.widthMm, minPx * mmPerPx), maxPx * mmPerPx);
  const at = glyph.point;
  const coatedSide = glyph.at === "end" ? profile.coatedFace : flip(profile.coatedFace);
  const foldOntoCoated = glyph.side === profile.coatedFace;
  let points;
  if (glyph.type === "closed_hem") {
    const gap = (foldOntoCoated ? 3.4 : 2.2) * coatOffsetPx * mmPerPx;
    const r = gap / 2, c = { x: at.x + u.x * r, y: at.y + u.y * r };
    points = [];
    for (let i = 0; i <= 12; i++) {
      const t = (Math.PI * i) / 12;
      points.push({ x: c.x - u.x * r * Math.cos(t) + v.x * r * Math.sin(t), y: c.y - u.y * r * Math.cos(t) + v.y * r * Math.sin(t) });
    }
    const back = points[points.length - 1];
    points.push({ x: back.x - v.x * len, y: back.y - v.y * len });
  } else {
    points = [{ ...at }, { x: at.x + u.x * len, y: at.y + u.y * len }];
  }
  // offset the traced sheet toward the coated side of its own direction of travel
  const off = coatOffsetPx * mmPerPx;
  const sideN = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    return coatedSide === "left" ? { x: -dy / l, y: dx / l } : { x: dy / l, y: -dx / l };
  };
  const band = points.map((p, i) => {
    const n1 = i > 0 ? sideN(points[i - 1], p) : null, n2 = i < points.length - 1 ? sideN(p, points[i + 1]) : null;
    const nx = (n1?.x || 0) + (n2?.x || 0), ny = (n1?.y || 0) + (n2?.y || 0), l = Math.hypot(nx, ny) || 1;
    return { x: p.x + (nx / l) * off, y: p.y + (ny / l) * off };
  });
  return { type: glyph.type, at: glyph.at, points, band, drawnLengthMm: len, trueScale: len === glyph.widthMm, foldOntoCoated };
}

// ── Editing commands (pure: return a NEW normalised profile) ─────────────────

export function setSegmentLength(profile, segId, lengthMm) {
  return normaliseProfile({ ...profile, segments: profile.segments.map((s) => (s.id === segId ? { ...s, lengthMm } : s)) });
}

/** Set the included angle at corner `index`, keeping its bend direction (default left). */
export function setIncludedAngle(profile, index, includedDeg, direction) {
  if (!isFiniteNumber(includedDeg) || includedDeg <= 0 || includedDeg > 180) {
    throw new TakeoffValidationError("Included angle must be more than 0° and at most 180°.");
  }
  const cur = profile.bends[index];
  if (!cur) throw new TakeoffValidationError("That corner does not exist.");
  const dir = direction || (cur.turnDeg < 0 ? "right" : "left");
  const mag = 180 - includedDeg;
  const turnDeg = mag === 0 ? 0 : dir === "right" ? -mag : mag;
  return normaliseProfile({ ...profile, bends: profile.bends.map((b, i) => (i === index ? { turnDeg } : b)) });
}

export function setBendDirection(profile, index, direction) {
  const cur = profile.bends[index];
  if (!cur) throw new TakeoffValidationError("That corner does not exist.");
  return setIncludedAngle(profile, index, includedAngle(cur.turnDeg), direction);
}

/** Append a leg at the end with a bend before it. */
export function addSegment(profile, { lengthMm = 50, turnDeg = 90 } = {}) {
  return normaliseProfile({
    ...profile,
    segments: [...profile.segments, { id: newSegId(), lengthMm }],
    bends: [...profile.bends, { turnDeg }],
  });
}

/** Remove the last leg (and its bend). */
export function removeLastSegment(profile) {
  if (profile.segments.length <= 1) throw new TakeoffValidationError("A profile needs at least one leg.");
  return normaliseProfile({ ...profile, segments: profile.segments.slice(0, -1), bends: profile.bends.slice(0, -1) });
}

export function setTreatment(profile, which, treatment) {
  if (which !== "start" && which !== "end") throw new TakeoffValidationError("Choose start or end.");
  return normaliseProfile({ ...profile, [which]: treatment });
}

export function rotateProfile(profile, deg) {
  return normaliseProfile({ ...profile, initialDirectionDeg: profile.initialDirectionDeg + deg });
}

/** Reflect across the vertical axis — coating travels with the geometry. */
export function mirrorProfile(profile) {
  return normaliseProfile({
    ...profile,
    initialDirectionDeg: 180 - profile.initialDirectionDeg,
    bends: profile.bends.map((b) => ({ turnDeg: b.turnDeg === 0 ? 0 : -b.turnDeg })),
    start: { ...profile.start, side: flip(profile.start.side) },
    end: { ...profile.end, side: flip(profile.end.side) },
    coatedFace: flip(profile.coatedFace),
  });
}

/** Change which physical face is coated. */
export function flipCoatedFace(profile) {
  return normaliseProfile({ ...profile, coatedFace: flip(profile.coatedFace) });
}

/** Same physical part, traversed from the other end. */
export function reverseProfile(profile) {
  const totalTurn = profile.bends.reduce((a, b) => a + b.turnDeg, 0);
  const finalHeading = profile.initialDirectionDeg + totalTurn;
  return normaliseProfile({
    ...profile,
    initialDirectionDeg: finalHeading + 180,
    segments: profile.segments.slice().reverse(),
    bends: profile.bends.slice().reverse().map((b) => ({ turnDeg: b.turnDeg === 0 ? 0 : -b.turnDeg })),
    start: profile.end.type === "none" ? { type: "none" } : { ...profile.end, side: flip(profile.end.side) },
    end: profile.start.type === "none" ? { type: "none" } : { ...profile.start, side: flip(profile.start.side) },
    coatedFace: flip(profile.coatedFace),
  });
}

// ── Checks + identity ─────────────────────────────────────────────────────────

/** Distance from point p to segment ab. */
function distPointSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Do two NON-adjacent legs cross or touch (including a leg passing through another leg's
 * corner, and collinear overlap)? Tolerance 0.01 mm.
 */
function segIntersect(p1, p2, p3, p4) {
  const tol = 0.01;
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) > 1e-12) {
    const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
    const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
    if (t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9) return true;
  }
  // touching at an end point / collinear overlap
  return distPointSeg(p1, p3, p4) < tol || distPointSeg(p2, p3, p4) < tol || distPointSeg(p3, p1, p2) < tol || distPointSeg(p4, p1, p2) < tol;
}

/** Order-readiness problems for a profile ([] = OK). */
export function profileProblems(profile) {
  let p;
  try { p = normaliseProfile(profile); } catch (e) { return [e.message]; }
  const { points } = profileVertices(p);
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = i + 2; j < points.length - 1; j++) {
      if (segIntersect(points[i], points[i + 1], points[j], points[j + 1])) {
        return [`Legs ${i + 1} and ${j + 1} cross or touch — check the lengths and angles.`];
      }
    }
  }
  return [];
}

/**
 * Indicative developed girth: Σ legs + each end treatment width once. NOT a press-brake
 * blank size (no bend deductions) — supplier fabrication instructions take precedence.
 */
export function indicativeGirthMm(profile) {
  const p = normaliseProfile(profile);
  return p.segments.reduce((a, s) => a + s.lengthMm, 0) + (p.start.type !== "none" ? p.start.widthMm : 0) + (p.end.type !== "none" ? p.end.widthMm : 0);
}

const r2 = (n) => Math.round(n * 100) / 100;      // 0.01 mm
const r6 = (n) => Math.round(n * 1e6) / 1e6;      // float noise on angles

function shapeKey(p) {
  return stableStringify({
    v: PROFILE_SCHEMA_VERSION,
    legs: p.segments.map((s) => r2(s.lengthMm)),
    turns: p.bends.map((b) => r6(b.turnDeg) || 0),
    start: p.start.type === "none" ? "none" : [p.start.type, r2(p.start.widthMm), p.start.side],
    end: p.end.type === "none" ? "none" : [p.end.type, r2(p.end.widthMm), p.end.side],
    coated: p.coatedFace,
  });
}

/**
 * Physical identity of a profile for schedule grouping. A straight extruded flashing is the same
 * part when drawn in reverse traversal OR mirrored (turned end-for-end the cross-section mirrors
 * and the coating stays on the same physical face), so the key is the minimum over
 * {p, reverse(p), mirror(p), mirror(reverse(p))}. Orientation never counts. Equal girth with a
 * different shape is NEVER the same key.
 */
export function profileGeometryKey(profile) {
  const p = normaliseProfile(profile);
  const variants = [p, reverseProfile(p), mirrorProfile(p), mirrorProfile(reverseProfile(p))].map(shapeKey);
  return variants.sort()[0];
}

/** Human-readable dimension list for PDFs / review. */
export function profileDimensionList(profile) {
  const p = normaliseProfile(profile);
  const legs = p.segments.map((s, i) => ({ label: `L${i + 1}`, lengthMm: s.lengthMm }));
  const bends = p.bends.map((b, i) => ({ label: `B${i + 1}`, includedDeg: includedAngle(b.turnDeg), direction: bendDirection(b.turnDeg) }));
  return { legs, bends, start: p.start, end: p.end, coatedFace: p.coatedFace, girthMm: indicativeGirthMm(p) };
}

// =============================================================================
// shared/takeoff/engine/timber.js — timber quantity methods (TC-R04 03 T1–T7; 02 §2; 07 TIM01–03, J1).
//
//  T1 repeatedPositions  R = D − a − b (R < 0 rejected; R = 0 only as an explicit single member).
//                        fixed: 0, c, 2c … strictly below R, plus R, then + a → ceil(R/c) + 1 (an exact
//                        multiple ends once; the final bay is shorter, never longer). equal: n = ceil(R/c)
//                        bays at i·R/n. Endpoint exclusions apply AFTER generation. Each disconnected run
//                        restarts its own grid; connected parts selected as one run share one grid.
//  T2 memberLength       projected ÷ cos(pitch) | true / entered (already sloped — never pitched again) |
//                        clear span + labelled overhangs (exclusive mode). ONE explicit allowance, default 0.
//  T3 stock              NOT selected here. Linear demands carry the owner grid (1200 + 300n, product max and
//                        unavailable lengths, plus any entered kerf / end trim) for engine/allocator.js;
//                        structural members are noSplice. Any other stock setting is rejected, never ignored.
//  T4 computeStudWall    real stations; full studs strictly inside an opening are removed; opening framing
//                        comes only from an explicit detail, else "base studs only; opening framing incomplete".
//  T5 computePlates / computeNoggins / computeTrim.
//  T7 computeManualTimber (count, cut, individual member e.g. hip by true/projected length, orderedStock bypass).
//
// HUB 028 Walls options (each OFF unless asked for, so every existing result is unchanged): identity `component`
// (studs / plates / noggins buy apart); computeStudWall openingSideStuds (Sam: a stud each side of every opening;
// default, needs Sam: face on the opening edge, studs closer than one stud thickness are one: end, then side, then
// centre) and clipOpeningLevels (default, needs Sam); computePlates per-layer gapsMm (unused by Walls since Sam's
// round 2 buys the bottom plate full length) and joinOverStuds (Sam's join rule, splitPlateAtStuds); computeNoggins
// rowsSource "owner-rule" (Sam: wallNogginRows, 1 row at 2,700 or under, 2 over) and skipClosedBays (default, needs
// Sam); `label` names the part in its identity problem ("Studs: …").
//
// Every compute* returns a contract MethodResult; invalid input becomes a blocking "invalid_input" problem.
// Sizes are manual (or from an attached project schedule) and are never reported as structurally verified.
// =============================================================================
import { TakeoffValidationError, formatMm, isFiniteNumber } from "../units.js";
import { EPS_MM, LENGTH_KINDS, demandId, emptyResult, identityKey, problem } from "./contract.js";
import { permittedStockLengths } from "./stock.js";
import { TIMBER_GRID } from "./families.js";

/** 06 internal geometric precision for station generation (never used for quantities or stock rounding). */
const GEOM_TOL_MM = 0.001;

/** Owner timber stock grid for every supplier: 1,200 mm then 300 mm steps (Sam, 25 Oct 2026; 600 mm steps before).
 *  Not configurable. The same object as engine/families.js TIMBER_GRID, its one definition. */
export const TIMBER_STOCK_GRID = TIMBER_GRID;
/** "1,200 mm then 300 mm steps" — how the grid reads in a message. */
const GRID_TEXT = `${formatMm(TIMBER_GRID.minMm, 0)} mm then ${formatMm(TIMBER_GRID.incrementMm, 0)} mm steps`;

/** Proposed safeguard (06): generated members per wall or item. Excess is rejected, never truncated. */
export const MAX_GENERATED_PER_WALL = 5000;

/** Purposes computeRepeatedMembers accepts. Battens use the support grid (05 B1). */
export const REPEATED_PURPOSES = Object.freeze(["rafter", "joist", "stud", "member"]);

/** T2 length sources (mutually exclusive). */
export const MEMBER_LENGTH_MODES = Object.freeze(["projected", "true", "entered", "clearSpan"]);

/** Output label until every opening on a wall has an explicit framing detail (T4). */
export const OPENING_FRAMING_INCOMPLETE = "base studs only; opening framing incomplete";

const SHARED_STOCK_BY_DEFAULT = new Set(["noggin", "trim"]); // T6: optional cut sharing; OFF for structural members
const DETAIL_SOURCES = ["reviewed-detail", "explicit"];
// Optional procurement-identity fields (06, T6): kept only when given, so incompatible stock is never pooled.
// `component` (HUB 028 Walls: studs / plates / noggins) keeps each part its own allocator group and order line,
// even when two parts are the same product, as `follower` keeps automatic battens apart.
const OPTIONAL_IDENTITY = ["supplier", "manufacturer", "sku", "moisture", "endCondition", "finish", "profile", "component"];
// Stock settings timber accepts: the fixed grid, its product restrictions and the allocator's cutting-loss fields.
const STOCK_KEYS = new Set(["kind", "minMm", "incrementMm", "maxMm", "unavailableMm", "sharePieces", "kerfMm", "kerfConfirmed",
  "endTrimMm", "finalEndAcceptable", "minRetainedOffcutMm"]);
const CUTTING_LENGTHS = [["kerfMm", "Saw kerf"], ["endTrimMm", "End trim"], ["minRetainedOffcutMm", "Keep offcuts from"]];
const CUTTING_FLAGS = [["kerfConfirmed", "Kerf confirmed"], ["finalEndAcceptable", "Final stock end acceptable"]];
const ROW_SOURCES = ["entered", "reviewed-detail", "owner-rule"];

/** Sam's noggin rows (HUB 028, 24 and 25 Oct 2026): over this wall height, 2 rows; at it or under, 1 row. */
export const NOGGIN_TWO_ROWS_OVER_MM = 2700;
/** The owner-rule references the rows are recorded with (both are Sam's rules, never "entered" or inferred). */
export const NOGGIN_ROW_RULES = Object.freeze({ one: "HUB 028: 2,700 mm or under = 1 row", two: "HUB 028: over 2,700 mm = 2 rows" });

const fmt = (mm) => formatMm(mm);
const fail = (message, field) => { throw new TakeoffValidationError(message, field); };
const text = (v) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const posKey = (x) => `@${Math.round(x * 1e6) / 1e6}`; // station identity; stations are always > EPS_MM apart
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function num(v, label, { min = 0, above = false, def, integer = false } = {}) {
  if (v === undefined || v === null) {
    if (def !== undefined) return def;
    fail(`${label} is required.`, label);
  }
  if (!isFiniteNumber(v)) fail(`${label} must be a number.`, label);
  if (above ? v <= min : v < min) fail(`${label} must be ${above ? "more than" : "at least"} ${fmt(min)}.`, label);
  if (integer && !Number.isInteger(v)) fail(`${label} must be a whole number.`, label);
  return v;
}

function flag(v, label, def) {
  if (v === undefined || v === null) return def;
  if (typeof v !== "boolean") fail(`${label} must be true or false.`, label);
  return v;
}

function list(v, label) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) fail(`${label} must be a list.`, label);
  return v;
}

function uniqueId(raw, seen, what) {
  const id = text(raw) || fail(`Each ${what} needs an id.`, what);
  if (seen.has(id)) fail(`${cap(what)} ${id} is listed twice.`, what);
  seen.add(id);
  return id;
}

// ── T1 repeated positions ────────────────────────────────────────────────────

function layoutRun({ runMm, centresMm, startOffsetMm, endOffsetMm, includeStart, includeEnd, spacing = "fixed", singleMember }) {
  const D = num(runMm, "Distribution run");
  const a = num(startOffsetMm, "Start offset", { def: 0 });
  const b = num(endOffsetMm, "End offset", { def: 0 });
  const keepStart = flag(includeStart, "Include start", true);
  const keepEnd = flag(includeEnd, "Include end", true);
  let R = D - a - b;
  if (R < -EPS_MM) fail(`The start and end offsets (${fmt(a + b)} mm) are longer than the run (${fmt(D)} mm).`, "offsets");
  if (R <= EPS_MM) R = 0;
  const base = { runMm: D, startOffsetMm: a, endOffsetMm: b, usableMm: R };
  if (flag(singleMember, "Single member", false)) {
    if (R > 0) fail("A single member needs the offsets to meet (zero usable run) — use centres for a longer run.", "singleMember");
    if (!keepStart || !keepEnd) fail("A single member cannot exclude its own end.", "singleMember");
    return { ...base, bays: 0, finalBayMm: 0, positions: [a], excluded: [] };
  }
  if (R === 0) fail("The usable run is zero — choose “single member” to place one member there.", "singleMember");
  const c = num(centresMm, "Centres", { min: EPS_MM, above: true });
  if (spacing !== "fixed" && spacing !== "equal") fail('Spacing must be "fixed" or "equal".', "spacing");
  // stations use the 06 GEOMETRIC precision (0.001 mm): a traced run 0.000006 mm past a multiple of the centres is
  // transformed-coordinate noise, not an extra bay — a REAL overrun (≥ 0.001 mm) still gets its shorter final bay
  const bays = Math.ceil((R - GEOM_TOL_MM) / c);
  if (bays + 1 > MAX_GENERATED_PER_WALL) fail(`That run makes ${bays + 1} members — split it (limit ${MAX_GENERATED_PER_WALL}).`, "segments");
  const raw = [];
  if (spacing === "equal") for (let i = 0; i <= bays; i++) raw.push(i === bays ? R : (i * R) / bays);
  else {
    for (let i = 0; i * c < R - GEOM_TOL_MM; i++) raw.push(i * c);
    raw.push(R);
  }
  return {
    ...base,
    bays,
    finalBayMm: raw[raw.length - 1] - raw[raw.length - 2],
    positions: raw.map((p) => p + a).slice(keepStart ? 0 : 1, keepEnd ? undefined : -1),
    excluded: [...(keepStart ? [] : ["start"]), ...(keepEnd ? [] : ["end"])],
  };
}

/**
 * T1 member centreline positions along one distribution run, measured from the run's start (offset included).
 * fixed (default): 0, c, 2c … strictly below R, plus R — count ceil(R/c) + 1, exact multiples end once.
 * equal: ceil(R/c) equal bays. includeStart/includeEnd drop end members AFTER generation (never regrid).
 * Offsets are centreline offsets — wall faces need explicit offsets; half a section is never subtracted.
 * @param {{ runMm:number, centresMm?:number, startOffsetMm?:number, endOffsetMm?:number, includeStart?:boolean,
 *   includeEnd?:boolean, spacing?:"fixed"|"equal", singleMember?:boolean }} opts
 * @returns {number[]} positions in mm (throws TakeoffValidationError, e.g. when R < 0)
 */
export function repeatedPositions(opts = {}) {
  return layoutRun(opts).positions;
}

// ── T2 member length ─────────────────────────────────────────────────────────

/**
 * T2 required length of one member. projected: plan length ÷ cos(pitch). true/entered: already the sloped
 * length — pitch is never applied. clearSpan: (clear span + labelled projected overhang/bearing additions)
 * ÷ cos(pitch). Then + ONE explicit true-length allowance (default 0; no flashing +200/100 rules).
 * @param {{ mode:"projected"|"true"|"entered"|"clearSpan", lengthMm:number, pitchDeg?:number,
 *   overhangsMm?:Array<{label:string, mm:number}>, allowanceMm?:number }} input
 * @returns {{ trueLengthMm:number, lengthNeededMm:number, explain:string[] }}
 */
export function memberLength({ mode, lengthMm, pitchDeg, overhangsMm, allowanceMm } = {}) {
  if (!MEMBER_LENGTH_MODES.includes(mode)) fail(`Member length source must be one of: ${MEMBER_LENGTH_MODES.join(", ")}.`, "mode");
  const L = num(lengthMm, mode === "clearSpan" ? "Clear span" : "Member length", { above: true });
  const allowance = num(allowanceMm, "End allowance", { def: 0 });
  const overhangs = list(overhangsMm, "Overhangs");
  if (mode !== "clearSpan" && overhangs.length) {
    fail("Overhang/bearing additions only go with a clear span — a projected or true member line already includes them.", "overhangsMm");
  }
  const explain = [];
  let trueLengthMm;
  if (mode === "projected" || mode === "clearSpan") {
    const pitch = num(pitchDeg, "Pitch");
    if (pitch >= 90) fail("Pitch must be less than 90°.", "Pitch");
    let projected = L;
    if (mode === "clearSpan") {
      const parts = overhangs.map((o, i) => {
        const label = text(o?.label) || fail(`Overhang/bearing addition ${i + 1} needs a label.`, "overhangsMm");
        return { label, mm: num(o.mm, `${label} length`) };
      });
      projected = L + parts.reduce((t, p) => t + p.mm, 0);
      explain.push(parts.length
        ? `Clear span ${fmt(L)} + ${parts.map((p) => `${p.label} ${fmt(p.mm)}`).join(" + ")} = ${fmt(projected)} mm projected`
        : `Clear span ${fmt(L)} mm projected (no additions)`);
    }
    trueLengthMm = projected / Math.cos((pitch * Math.PI) / 180);
    explain.push(`${fmt(projected)} mm projected ÷ cos ${pitch}° = ${fmt(trueLengthMm)} mm true length`);
  } else {
    trueLengthMm = L;
    explain.push(mode === "true"
      ? `${fmt(L)} mm measured true length — already sloped, pitch not applied`
      : `${fmt(L)} mm entered cut length — pitch not applied`);
  }
  const lengthNeededMm = trueLengthMm + allowance;
  explain.push(allowance
    ? `+ ${fmt(allowance)} mm end allowance (once) = ${fmt(lengthNeededMm)} mm needed`
    : `No end allowance (0) — ${fmt(lengthNeededMm)} mm needed`);
  return { trueLengthMm, lengthNeededMm, explain };
}

// ── Identity, stock policy, sizing ───────────────────────────────────────────

function normaliseSection(raw) {
  const t = text(raw);
  const m = /^(\d+(?:\.\d+)?)\s*[x×X*]\s*(\d+(?:\.\d+)?)$/.exec(t);
  return m ? `${Number(m[1])}x${Number(m[2])}` : t || null;
}

/**
 * Procurement identity for timber: { family:"timber", section, grade, treatment, species, supplier?, manufacturer?,
 * sku?, moisture?, endCondition?, finish?, profile? }. Any of these changing changes identity (and identityKey),
 * so the allocator never pools e.g. green with kiln-dried or end-matched with plain-ended stock (T6, TIM03).
 * @param {{ section?:string, grade?:string, treatment?:string, species?:string, supplier?:string, manufacturer?:string,
 *   sku?:string, moisture?:string, endCondition?:string, finish?:string, profile?:string }} [product]
 */
export function timberIdentity(product = {}) {
  const p = product && typeof product === "object" ? product : {};
  const id = {
    family: "timber",
    section: normaliseSection(p.section),
    grade: text(p.grade).toUpperCase() || null,
    treatment: text(p.treatment).toUpperCase() || null,
    species: text(p.species) || null,
  };
  for (const k of OPTIONAL_IDENTITY) if (text(p[k])) id[k] = text(p[k]);
  return Object.freeze(id);
}

const onGrid = (l) => {
  const steps = (l - TIMBER_STOCK_GRID.minMm) / TIMBER_STOCK_GRID.incrementMm;
  return steps >= 0 && Math.abs(steps - Math.round(steps)) < 1e-9;
};

/**
 * T3 stock policy for new timber (allocated by engine/allocator.js, not here). The 1200/300 grid is fixed;
 * a product may only restrict it (maxMm, unavailable grid lengths). maxMm stays null when unknown — no
 * implied 6 m or unlimited maximum. sharePieces false = one stock length per member (structural default).
 * The allocator's cutting-loss fields (kerfMm, endTrimMm, minRetainedOffcutMm ≥ 0; kerfConfirmed,
 * finalEndAcceptable) pass through when given. Any other setting (a list, a fixed length …) is rejected,
 * never silently ignored.
 * @param {{ maxMm?:number|null, unavailableMm?:number[], sharePieces?:boolean, kerfMm?:number, endTrimMm?:number,
 *   minRetainedOffcutMm?:number, kerfConfirmed?:boolean, finalEndAcceptable?:boolean }} [opts]
 * @returns {Readonly<import("./contract.js").StockPolicy>}
 */
export function timberStockPolicy(opts = {}) {
  if (!opts || typeof opts !== "object" || Array.isArray(opts)) fail("Stock settings are invalid.", "stock");
  const unknown = Object.keys(opts).filter((k) => !STOCK_KEYS.has(k) && opts[k] !== undefined);
  if (unknown.length) fail(`Timber stock has no “${unknown.join("”, “")}” setting — it is ${GRID_TEXT}, restricted only by the product maximum and unavailable lengths.`, "stock");
  const { kind, minMm, incrementMm, unavailableMm } = opts;
  if ((kind !== undefined && kind !== TIMBER_STOCK_GRID.kind) || (minMm !== undefined && minMm !== TIMBER_STOCK_GRID.minMm)
    || (incrementMm !== undefined && incrementMm !== TIMBER_STOCK_GRID.incrementMm)) {
    fail(`Timber stock is ${GRID_TEXT} for every supplier — restrict it with the product maximum or unavailable lengths instead.`, "stock");
  }
  const maxMm = opts.maxMm ?? null;
  if (maxMm !== null) num(maxMm, "Longest stock", { min: TIMBER_STOCK_GRID.minMm });
  const unavailable = [...new Set(list(unavailableMm, "Unavailable lengths").map((l) => {
    num(l, "Unavailable length", { min: TIMBER_STOCK_GRID.minMm });
    if (!onGrid(l)) fail(`${fmt(l)} mm is not a timber stock length (${GRID_TEXT}).`, "unavailableMm");
    return l;
  }))].sort((x, y) => x - y);
  const cutting = {};
  for (const [k, label] of CUTTING_LENGTHS) if (opts[k] !== undefined && opts[k] !== null) cutting[k] = num(opts[k], label);
  for (const [k, label] of CUTTING_FLAGS) if (opts[k] !== undefined && opts[k] !== null) cutting[k] = flag(opts[k], label);
  return Object.freeze({ ...TIMBER_STOCK_GRID, maxMm, unavailableMm: Object.freeze(unavailable), ...cutting, sharePieces: flag(opts.sharePieces, "Cut allocation", false) });
}

/**
 * Nullable sizing provider (03 span-table assistance) — null only: no span data ships. A manual section is
 * outcome "manual" with installation "unspecified" (never structurally verified); an attached project
 * schedule (sizing.source "projectSchedule" + ref) gives "project-detail-supplied". No section → missingInput
 * (nothing is ever auto-selected, least of all a "most onerous" column).
 * @param {{ section:string|null, sizing?:{ source?:"manual"|"projectSchedule", ref?:string } }} request
 * @returns {{ outcome:"manual"|"missingInput", installation:string, explain:string[] }}
 */
export function resolveSizing({ section, sizing } = {}) {
  const source = sizing?.source ?? "manual";
  if (source !== "manual" && source !== "projectSchedule") fail('Size source must be "manual" or "projectSchedule".', "sizing.source");
  if (!section) return { outcome: "missingInput", installation: "unspecified", explain: ["No section selected — nothing is sized automatically"] };
  if (source === "projectSchedule") {
    const ref = text(sizing.ref) || fail("Name the attached engineer/manufacturer schedule that sets this size.", "sizing.ref");
    return { outcome: "manual", installation: "project-detail-supplied", explain: [`Section ${section} from attached project schedule ${ref} (size provenance only — not checked by this tool)`] };
  }
  return { outcome: "manual", installation: "unspecified", explain: [`Section ${section} manually specified — not structurally verified`] };
}

// ── Shared result plumbing ───────────────────────────────────────────────────

function checkIdentity(ctx, identity, role, what) {
  const missing = (role === "trim" ? ["section"] : ["section", "grade", "treatment"]).filter((k) => !identity[k]);
  if (missing.length) ctx.problems.push(problem("timber_identity_incomplete", `${what}: choose the ${missing.join(", ")} before ordering.`, { refs: [{ missing }] }));
}

function setup(input, role) {
  if (!input || typeof input !== "object") fail("Timber input is missing.");
  const materialId = text(input.materialId) || fail("Choose the job material first.", "materialId");
  if (input.stock !== undefined && (typeof input.stock !== "object" || input.stock === null)) fail("Stock settings are invalid.", "stock");
  const identity = timberIdentity(input.identity);
  const sizing = resolveSizing({ section: identity.section, sizing: input.sizing });
  const share = [input.cutAllocation, input.stock?.sharePieces].filter((v) => v !== undefined && v !== null);
  if (share.length === 2 && share[0] !== share[1]) fail("Cut allocation is set two different ways — choose one.", "cutAllocation");
  const stockPolicy = timberStockPolicy({ ...(input.stock || {}), sharePieces: flag(share[0], "Cut allocation", SHARED_STOCK_BY_DEFAULT.has(role)) });
  const ctx = { materialId, identity, stockPolicy, installation: sizing.installation, problems: [], explain: [...sizing.explain] };
  // HUB 028: a Walls part names itself in its identity problem ("Studs: …"); everything else keeps the plain
  // "Timber" wording. The stock note is never labelled, so the same note from every part shows once.
  checkIdentity(ctx, identity, role, text(input.label) || "Timber");
  if (stockPolicy.maxMm === null) {
    ctx.problems.push(problem("stock_max_unset", "The longest available stock isn't set for this product — confirm it before ordering.", { blocking: false }));
  }
  ctx.explain.push(`Stock: ${GRID_TEXT}${stockPolicy.maxMm === null ? ", longest not set" : `, longest ${fmt(stockPolicy.maxMm)} mm`}`
    + `${stockPolicy.unavailableMm.length ? `, unavailable ${stockPolicy.unavailableMm.map(fmt).join("/")} mm` : ""}`
    + `${stockPolicy.kerfMm !== undefined ? `, kerf ${fmt(stockPolicy.kerfMm)} mm${stockPolicy.kerfConfirmed ? "" : " (unconfirmed)"}` : ""}`
    + `${stockPolicy.endTrimMm !== undefined ? `, end trim ${fmt(stockPolicy.endTrimMm)} mm` : ""}; `
    + `${stockPolicy.sharePieces ? "complete pieces may share a stock length (suggested cut plan)" : "one stock length per member"}`);
  return ctx;
}

function piece(ctx, { id, role, lengthMm, quantity = 1, label, sourceRefs, provenance = "calculated", identity = ctx.identity,
  materialId = ctx.materialId, stockPolicy = ctx.stockPolicy, noSplice = true, lengthKind = LENGTH_KINDS.CUT }) {
  return {
    id, materialId, role, kind: "linear", unit: "piece", lengthMm, quantity, lengthKind, identity,
    ...(stockPolicy ? { stockPolicy } : {}), noSplice, label, sourceRefs, provenance,
  };
}

/** Reject a generation BEFORE it runs when it would exceed the 06 safeguard (never truncate, never hang). */
function budget(count) {
  if (count > MAX_GENERATED_PER_WALL) fail(`That makes ${count} member pieces — split it (limit ${MAX_GENERATED_PER_WALL}).`, "segments");
}

function result(ctx, demands, layout, quantityComplete) {
  budget(demands.length);
  const ids = new Set();
  for (const d of demands) {
    if (ids.has(d.id)) fail(`Two members resolve to the same id ${d.id} — rename one so each is ordered exactly once.`, "id");
    ids.add(d.id);
  }
  const missingProduct = ctx.problems.some((p) => p.code === "timber_identity_incomplete");
  return {
    demands,
    layout,
    problems: ctx.problems,
    status: { quantity: quantityComplete ? "calculated" : "incomplete", installation: ctx.installation, procurement: missingProduct ? "missing-product" : "draft" },
    explain: ctx.explain,
  };
}

function guarded(fn) {
  try {
    return fn();
  } catch (e) {
    if (!(e instanceof TakeoffValidationError)) throw e;
    const r = emptyResult();
    r.problems.push(problem("invalid_input", e.message, e.field ? { refs: [{ field: e.field }] } : {}));
    r.explain.push(e.message);
    return r;
  }
}

/** An explicitly specified member (opening detail or wall addition) → { demand, … } or { missing }. */
function explicitMember(ctx, m, { owner, lengths, allowanceMm, idParts, sourceRef }) {
  if (!m || typeof m !== "object") fail(`${owner}: a member entry is invalid.`, "members");
  const id = text(m.id) || fail(`${owner}: each member needs an id.`, "members");
  const role = text(m.role) || fail(`${owner} ${id}: say what the member is (king, jack, lintel …).`, "members");
  const quantity = num(m.quantity, `${owner} ${id} quantity`, { min: 1, integer: true });
  if (m.lengthMm !== undefined && m.lengthFrom !== undefined) fail(`${owner} ${id}: give a length or what it follows, not both.`, "members");
  let baseMm;
  if (m.lengthMm !== undefined) baseMm = num(m.lengthMm, `${owner} ${id} length`, { above: true });
  else if (m.lengthFrom !== undefined) {
    if (!Object.hasOwn(lengths, m.lengthFrom)) fail(`${owner} ${id}: length can follow ${Object.keys(lengths).join(", ")}.`, "members");
    baseMm = lengths[m.lengthFrom] + num(m.addMm, `${owner} ${id} adjustment`, { min: -Infinity, def: 0 });
    if (baseMm <= EPS_MM) fail(`${owner} ${id}: the adjusted length is not positive.`, "members");
  } else return { missing: `${id} length` };
  let identity;
  if (m.sameAsStud === true) {
    if (m.identity) fail(`${owner} ${id}: choose “same as studs” or a product, not both.`, "members");
    identity = ctx.identity;
  } else if (m.identity && typeof m.identity === "object") {
    identity = timberIdentity(m.identity);
    checkIdentity(ctx, identity, role, `${owner} ${id}`);
  } else return { missing: `${id} product (section, grade, treatment)` };
  if (m.stock !== undefined && (typeof m.stock !== "object" || m.stock === null)) fail(`${owner} ${id}: stock settings are invalid.`, "members");
  const stockPolicy = !m.stock && identityKey(identity) === identityKey(ctx.identity) ? ctx.stockPolicy
    : timberStockPolicy({ sharePieces: false, ...(m.stock || {}) });
  if (stockPolicy !== ctx.stockPolicy && stockPolicy.maxMm === null) {
    ctx.problems.push(problem("stock_max_unset", `${owner} ${id}: the longest available stock isn't set for this product — confirm it before ordering.`, { blocking: false }));
  }
  const materialId = text(m.materialId) || ctx.materialId;
  const label = `${owner} ${text(m.label) || role} × ${quantity} @ ${fmt(baseMm + allowanceMm)} mm`;
  return {
    role, quantity, identity, baseMm, atMm: m.atMm,
    demand: piece(ctx, {
      id: demandId(materialId, role, ...idParts, id), role, quantity, lengthMm: baseMm + allowanceMm, label, identity,
      materialId, stockPolicy, provenance: "manual", sourceRefs: [{ ...sourceRef, role }],
    }),
  };
}

// ── T1 + T2 repeated members ─────────────────────────────────────────────────

function runSegments(input) {
  const raw = input.segments;
  if (!Array.isArray(raw) || !raw.length) fail("Measure the distribution run first.", "segments");
  const seen = new Set();
  const measured = new Set();
  const once = (measurementId) => {
    if (measured.has(measurementId)) fail(`Measurement ${measurementId} feeds two distribution runs — its members would be counted twice (use plies for doubled members).`, "segments");
    measured.add(measurementId);
    return measurementId;
  };
  return raw.map((s, i) => {
    if (!s || typeof s !== "object") fail(`Distribution run ${i + 1} is invalid.`, "segments");
    const id = uniqueId(s.id ?? s.measurementId, seen, "distribution run");
    let parts;
    if (s.parts !== undefined) {
      if (s.runMm !== undefined) fail(`Run ${id}: give its connected parts or one length, not both.`, "segments");
      if (!Array.isArray(s.parts) || s.parts.length < 2) fail(`Run ${id}: a joined run needs two or more connected parts.`, "segments");
      parts = s.parts.map((p, j) => ({
        measurementId: once(text(p?.measurementId) || fail(`Run ${id} part ${j + 1} needs its measurement.`, "segments")),
        runMm: num(p.runMm, `Run ${id} part ${j + 1}`, { above: true }),
      }));
    } else parts = [{ measurementId: once(text(s.measurementId) || id), runMm: num(s.runMm, `Run ${id} length`) }];
    const pick = (k) => (s[k] !== undefined ? s[k] : input[k]);
    return {
      id, parts, runMm: parts.reduce((t, p) => t + p.runMm, 0),
      ends: { startOffsetMm: pick("startOffsetMm"), endOffsetMm: pick("endOffsetMm"), includeStart: pick("includeStart"), includeEnd: pick("includeEnd") },
    };
  });
}

/** Source ref for a station: the part (measurement) it falls on, with the station measured along that part. */
function stationRef(seg, x) {
  let start = 0;
  let i = 0;
  while (i < seg.parts.length - 1 && x > start + seg.parts[i].runMm + EPS_MM) start += seg.parts[i++].runMm;
  return { measurementId: seg.parts[i].measurementId, role: "distribution", station: x - start };
}

function overrideMap(raw) {
  const map = new Map();
  if (raw === undefined || raw === null) return map;
  if (typeof raw !== "object" || Array.isArray(raw)) fail("Member changes must be keyed by station id.", "overrides");
  for (const [id, o] of Object.entries(raw)) {
    if (!o || typeof o !== "object") fail(`Change at ${id} is invalid.`, "overrides");
    const remove = flag(o.remove, "Remove", false);
    const duplicate = num(o.duplicate, "Duplicate", { min: 1, integer: true, def: 0 });
    if (o.member !== undefined && (!o.member || typeof o.member !== "object")) fail(`Change at ${id}: the member length is invalid.`, "overrides");
    if (remove && (duplicate || o.member)) fail(`Change at ${id}: a removed member can't also be duplicated or re-lengthed.`, "overrides");
    map.set(id, { remove, duplicate, member: o.member ?? null });
  }
  return map;
}

function overriddenMember(member, patch) {
  const merged = { ...member, ...patch };
  delete merged.rake;
  if (merged.mode !== "clearSpan") delete merged.overhangsMm;
  return merged;
}

/**
 * T1 + T2: members at centres along one or more distribution runs → one Demand per station × ply
 * (role = purpose). Overrides are keyed by station id ("<runId>:@<mm>"): { remove } | { duplicate:n } |
 * { member:{…length fields} }; an override whose station no longer exists is reported stale, never re-pinned.
 * member.rake { startLengthMm, endLengthMm } interpolates a straight rake from run start to run end (one run).
 * @param {{ materialId:string, purpose:"rafter"|"joist"|"stud"|"member", identity:object,
 *   segments:Array<{ id?:string, measurementId?:string, runMm?:number, parts?:Array<{measurementId:string, runMm:number}>,
 *     startOffsetMm?:number, endOffsetMm?:number, includeStart?:boolean, includeEnd?:boolean }>,
 *   centresMm:number, spacing?:"fixed"|"equal", startOffsetMm?:number, endOffsetMm?:number, includeStart?:boolean,
 *   includeEnd?:boolean, singleMember?:boolean, plies?:number,
 *   member:{ measurementId?:string, mode:string, lengthMm?:number, pitchDeg?:number, overhangsMm?:object[],
 *     allowanceMm?:number, rake?:{ startLengthMm:number, endLengthMm:number } },
 *   overrides?:Object<string, object>, stock?:{ maxMm?:number, unavailableMm?:number[] }, cutAllocation?:boolean,
 *   sizing?:{ source:"manual"|"projectSchedule", ref?:string } }} input
 * @returns {object} MethodResult (layout.ticks = stations)
 */
export function computeRepeatedMembers(input) {
  return guarded(() => {
    const purpose = text(input?.purpose);
    if (purpose === "batten") fail("Battens use the support grid (support_grid@1), not repeated framing members.", "purpose");
    if (["hip", "valley", "jack"].includes(purpose)) fail("Hip, valley and jack rafters need individual true or projected lengths — add each as a manual member line.", "purpose");
    if (!REPEATED_PURPOSES.includes(purpose)) fail(`Choose what the members are: ${REPEATED_PURPOSES.join(", ")}.`, "purpose");
    const ctx = setup(input, purpose);
    const plies = num(input.plies, "Plies", { min: 1, def: 1, integer: true });
    const member = input.member;
    if (!member || typeof member !== "object") fail("Set how the member length is measured.", "member");
    const segments = runSegments(input);
    let rake = null;
    if (member.rake !== undefined) {
      if (member.lengthMm !== undefined) fail("Give one member length or a rake (two lengths), not both.", "member");
      if (segments.length !== 1) fail("A raked length interpolates along one distribution run.", "member");
      rake = {
        startLengthMm: num(member.rake?.startLengthMm, "Rake start length", { above: true }),
        endLengthMm: num(member.rake?.endLengthMm, "Rake end length", { above: true }),
      };
    }
    const base = rake ? null : memberLength(member);
    ctx.explain.push(...(base ? base.explain
      : [`Raked lengths: ${fmt(rake.startLengthMm)} mm at the run start → ${fmt(rake.endLengthMm)} mm at the run end, interpolated at each member`]));
    const overrides = overrideMap(input.overrides);
    const memberRef = text(member.measurementId) ? [{ measurementId: text(member.measurementId), role: "member" }] : [];
    const spacing = input.spacing ?? "fixed";
    const demands = [];
    const ticks = [];
    const runs = [];
    const stationIds = new Set();
    for (const seg of segments) {
      const run = layoutRun({ runMm: seg.runMm, centresMm: input.centresMm, spacing, singleMember: input.singleMember, ...seg.ends });
      const { positions, ...summary } = run;
      runs.push({ id: seg.id, measurementIds: seg.parts.map((p) => p.measurementId), ...summary });
      if (seg.parts.length > 1) ctx.explain.push(`Run ${seg.id} joins ${seg.parts.map((p) => p.measurementId).join(" + ")} as one run (shared end counted once)`);
      ctx.explain.push(`Run ${seg.id}: ${fmt(run.runMm)} − ${fmt(run.startOffsetMm)} − ${fmt(run.endOffsetMm)} = ${fmt(run.usableMm)} mm usable → `
        + (run.bays === 0 ? "single member"
          : spacing === "equal" ? `${run.bays} equal bays of ${fmt(run.usableMm / run.bays)} mm (≤ ${fmt(input.centresMm)})`
            : `${run.bays + 1} members at ${fmt(input.centresMm)} mm centres, final bay ${fmt(run.finalBayMm)} mm`)
        + (run.excluded.length ? `; ${run.excluded.join(" and ")} member excluded → ${positions.length}` : ""));
      // a final bay of a few mm is almost always the run end tapped just past a multiple of the centres — the extra
      // member is real by the rule (T1), so it's kept, but it is named so the run end can be checked
      if (spacing === "fixed" && run.bays > 0 && run.finalBayMm < Math.min(50, input.centresMm / 4)) {
        ctx.problems.push(problem("final_bay_tiny", `Run ${seg.id}: the last two members are only ${fmt(run.finalBayMm)} mm apart — check where the run ends (or exclude the end member).`, { blocking: false, refs: [{ measurementId: seg.parts[0]?.measurementId }] }));
      }
      for (const x of positions) {
        const stationId = demandId(seg.id, posKey(x));
        stationIds.add(stationId);
        const ov = overrides.get(stationId);
        let len = base ?? memberLength({
          ...overriddenMember(member, {}),
          lengthMm: rake.startLengthMm + (rake.endLengthMm - rake.startLengthMm) * (seg.runMm > 0 ? x / seg.runMm : 0),
        });
        if (ov?.member) {
          len = memberLength(overriddenMember(member, ov.member));
          ctx.explain.push(`${cap(purpose)} @ ${fmt(x)}: length changed — ${len.explain.join("; ")}`);
        }
        const copies = ov?.remove ? 0 : 1 + (ov?.duplicate ?? 0);
        budget(demands.length + copies * plies);
        const sourceRefs = [stationRef(seg, x), ...memberRef];
        for (let d = 0; d < copies; d++) {
          for (let k = 1; k <= plies; k++) {
            demands.push(piece(ctx, {
              id: demandId(ctx.materialId, purpose, stationId, d ? `d${d}` : null, `p${k}`),
              role: purpose,
              lengthMm: len.lengthNeededMm,
              label: `${cap(purpose)}${segments.length > 1 ? ` ${seg.id}` : ""} @ ${fmt(x)}${d ? ` (copy ${d})` : ""}${plies > 1 ? ` ply ${k}` : ""}`,
              sourceRefs: sourceRefs.map((r) => ({ ...r })),
              provenance: ov?.member || d ? "manual" : "calculated",
            }));
          }
        }
        ticks.push({
          stationId, segmentId: seg.id, positionMm: x, removed: Boolean(ov?.remove), duplicates: ov?.duplicate ?? 0,
          lengthOverridden: Boolean(ov?.member), trueLengthMm: len.trueLengthMm, lengthNeededMm: len.lengthNeededMm, pieces: copies * plies,
        });
      }
    }
    const stale = [...overrides.keys()].filter((id) => !stationIds.has(id));
    for (const id of stale) {
      ctx.problems.push(problem("override_stale", `The change at ${id} no longer matches a member (the run or spacing changed) — review it.`, { refs: [{ stationId: id }] }));
    }
    const removed = ticks.filter((t) => t.removed).length;
    ctx.explain.push(`${ticks.length} stations × ${plies} ${plies === 1 ? "ply" : "plies"}${removed ? `, ${removed} removed` : ""}`
      + `${ticks.some((t) => t.duplicates) ? `, ${ticks.reduce((t, s) => t + s.duplicates, 0)} duplicated` : ""} = ${demands.length} pieces`);
    if (purpose === "stud") ctx.explain.push("Base repeated studs only — use the stud wall for openings, corners and junctions");
    return result(ctx, demands, { kind: "repeated", purpose, spacing, centresMm: input.centresMm, plies, runs, ticks }, stale.length === 0);
  });
}

// ── T4 stud wall ─────────────────────────────────────────────────────────────

function studHeight(h) {
  if (!h || typeof h !== "object") fail("Enter the stud cut length, or the frame height with its plate thicknesses.", "height");
  if (h.mode === "studCut") {
    if (["frameHeightMm", "bottomPlateMm", "topPlateMm", "deductions"].some((k) => h[k] !== undefined)) {
      fail("Height modes are exclusive: an entered stud cut length takes no frame height or plate deductions.", "height");
    }
    const L = num(h.studLengthMm, "Stud cut length", { above: true });
    return { studLengthMm: L, explain: `Stud cut length ${fmt(L)} mm (entered)` };
  }
  if (h.mode === "frameHeight") {
    if (h.studLengthMm !== undefined) fail("Height modes are exclusive: frame height mode derives the stud length.", "height");
    const H = num(h.frameHeightMm, "Frame height", { above: true });
    const bottom = num(h.bottomPlateMm, "Bottom plate thickness");
    const top = num(h.topPlateMm, "Top plate thickness");
    const other = list(h.deductions, "Deductions").map((d, i) => {
      const label = text(d?.label) || fail(`Deduction ${i + 1} needs a label.`, "height");
      return { label, mm: num(d.mm, `${label} deduction`) };
    });
    const L = H - bottom - top - other.reduce((t, d) => t + d.mm, 0);
    if (L <= EPS_MM) fail("The plate thicknesses and deductions leave no stud length.", "height");
    return {
      studLengthMm: L, bottomPlateMm: bottom,
      explain: `Frame ${fmt(H)} − bottom plates ${fmt(bottom)} − top plates ${fmt(top)}${other.map((d) => ` − ${d.label} ${fmt(d.mm)}`).join("")} = ${fmt(L)} mm stud cut length`,
    };
  }
  return fail('Height mode must be "studCut" or "frameHeight".', "height.mode");
}

function wallOpenings(raw, wallLengthMm, studLengthMm, datumMm, clip = null) {
  const seen = new Set();
  const out = list(raw, "Openings").map((o, i) => {
    if (!o || typeof o !== "object") fail(`Opening ${i + 1} is invalid.`, "openings");
    const id = uniqueId(o.id, seen, "opening");
    const xLeftMm = num(o.xLeftMm, `${id} left edge`);
    const xRightMm = num(o.xRightMm, `${id} right edge`);
    if (xRightMm <= xLeftMm + EPS_MM || xRightMm > wallLengthMm + EPS_MM) fail(`${id} must lie within the wall, right edge after left edge.`, "openings");
    const sillMm = Math.max(0, num(o.sillMm, `${id} sill level`) - datumMm);
    let headMm = num(o.headMm, `${id} head level`, { above: true }) - datumMm;
    // HUB 028 clipOpeningLevels [Default, needs Sam]: sill and head are clipped into the stud height with a note
    // instead of blocking. A head above the studs is taken to the top of the studs. An opening wholly above the
    // studs (sill at or above them) has no height left in the stud frame, so it doesn't change this wall's framing.
    if (clip && headMm > sillMm + EPS_MM && headMm > studLengthMm + EPS_MM) {
      const ref = { blocking: false, refs: [{ wallId: clip.wallId, openingId: id }] };
      if (sillMm >= studLengthMm - EPS_MM) {
        clip.ctx.problems.push(problem("opening_clipped", `${id} is above the top of the ${fmt(studLengthMm)} mm studs (sill ${fmt(sillMm)} mm), so it doesn't change this wall's framing. Check the wall height or the opening.`, ref));
        return { id, xLeftMm, xRightMm, sillMm: studLengthMm, headMm: studLengthMm, detail: o.detail ?? null, aboveStuds: true };
      }
      clip.ctx.problems.push(problem("opening_clipped", `${id}: its head (${fmt(headMm)} mm) is above the ${fmt(studLengthMm)} mm studs, so it is taken to the top of the studs.`, ref));
      headMm = studLengthMm;
    }
    if (headMm <= sillMm + EPS_MM || headMm > studLengthMm + EPS_MM) fail(`${id}: sill and head must sit within the stud height, sill below head.`, "openings");
    return { id, xLeftMm, xRightMm, sillMm, headMm, detail: o.detail ?? null };
  });
  // only openings in the stud frame can clash (an opening wholly above the studs is never framed)
  const byX = out.filter((o) => !o.aboveStuds).sort((a, b) => a.xLeftMm - b.xLeftMm);
  for (let i = 1; i < byX.length; i++) {
    if (byX[i].xLeftMm < byX[i - 1].xRightMm - EPS_MM) {
      fail(`Openings ${byX[i - 1].id} and ${byX[i].id} overlap along the wall — frame them as one opening or with explicit members.`, "openings");
    }
  }
  return out;
}

function openingFraming(ctx, o, removed, kept, w) {
  const d = o.detail;
  const missing = [];
  const out = { demands: [], explain: [], missing };
  const regions = [["belowSill", "below-sill", o.sillMm], ["aboveHead", "above-head", w.studLengthMm - o.headMm]];
  if (!d || typeof d !== "object") missing.push("its framing detail");
  else {
    if (!DETAIL_SOURCES.includes(d.source)) missing.push("the detail source (reviewed detail or explicit quantities)");
    else if (d.source === "reviewed-detail" && !text(d.ref)) missing.push("the reviewed detail's reference");
    for (const [key, name, height] of regions) {
      if (height <= EPS_MM) continue;
      if (typeof d[key]?.required !== "boolean") missing.push(`whether ${name} pieces are required`);
      else if (d[key].required && !isFiniteNumber(d[key].deductionMm)) missing.push(`the ${name} deduction`);
    }
    if (!Array.isArray(d.members)) missing.push("its kings, jacks, trimmers, lintel and sill (or an explicit empty list)");
  }
  const members = [];
  if (!missing.length) {
    const lengths = { stud: w.studLengthMm, openingWidth: o.xRightMm - o.xLeftMm, headLevel: o.headMm, sillLevel: o.sillMm };
    const memberIds = new Set();
    for (const m of d.members) {
      uniqueId(m?.id, memberIds, `${o.id} member`);
      const r = explicitMember(ctx, m, { owner: o.id, lengths, allowanceMm: w.allowanceMm, idParts: [w.wallId, o.id], sourceRef: { ...w.ref, openingId: o.id } });
      if (r.missing) missing.push(r.missing);
      else members.push(r);
    }
  }
  if (missing.length) return out;
  out.explain.push(`${o.id}: framing from ${d.source === "reviewed-detail" ? `reviewed detail ${text(d.ref)}` : `explicit quantities${text(d.ref) ? ` (${text(d.ref)})` : ""}`} — quantities only, not a design check`);
  for (const [key, role, height] of regions) {
    if (height <= EPS_MM || !d[key].required) continue;
    const deduction = num(d[key].deductionMm, `${o.id} ${role} deduction`);
    const len = height - deduction;
    if (len <= EPS_MM) {
      out.explain.push(`${o.id}: the ${role} region (${fmt(height)} mm) is used up by the ${fmt(deduction)} mm detail deduction — no ${role} pieces`);
      continue;
    }
    budget(out.demands.length + removed.length * w.plies);
    for (const s of removed) {
      for (let k = 1; k <= w.plies; k++) {
        out.demands.push(piece(ctx, {
          id: demandId(ctx.materialId, role, w.wallId, o.id, posKey(s.x), `p${k}`), role, lengthMm: len + w.allowanceMm,
          label: `${o.id} ${role} @ ${fmt(s.x)}${w.plies > 1 ? ` ply ${k}` : ""}`, sourceRefs: [{ ...w.ref, openingId: o.id, station: s.x, role }],
        }));
      }
    }
    out.explain.push(`${o.id}: ${removed.length} ${role} station(s) × ${w.plies} at ${fmt(height)} − ${fmt(deduction)} = ${fmt(len)} mm`);
  }
  const reconcile = flag(d.reconcileCoincident, `${o.id} reconcile coincident studs`, false);
  for (const r of members) {
    if (reconcile && r.role === "king" && r.atMm !== undefined) {
      const positions = list(r.atMm, `${o.id} king positions`).map((p) => num(p, `${o.id} king position`));
      if (identityKey(r.identity) !== identityKey(ctx.identity) || Math.abs(r.baseMm - w.studLengthMm) > EPS_MM) {
        out.explain.push(`${o.id}: kings differ from the common studs (product or length) — not reconciled`);
      } else {
        for (const p of positions.slice(0, r.quantity)) {
          const s = kept.find((k) => Math.abs(k.x - p) <= EPS_MM && !w.reconciled.has(k.stationId));
          if (!s) continue;
          w.reconciled.set(s.stationId, r.demand.id);
          r.demand.sourceRefs.push({ ...w.ref, station: s.x, role: "stud" });
          r.demand.label += ` (also the common stud @ ${fmt(s.x)})`;
        }
      }
    }
    out.demands.push(r.demand);
  }
  return out;
}

function sideStudWidth(raw) {
  if (raw === undefined || raw === null || raw === false) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) fail("Side studs need the stud thickness along the wall.", "openingSideStuds");
  return num(raw.studWidthMm, "Stud thickness along the wall", { above: true });
}

const STUD_RANK = { end: 0, side: 1, centre: 2 };
const STUD_NAME = { end: "end stud", side: "side stud", centre: "stud" };

/**
 * HUB 028 side studs and merge. [Sam, 24 Oct 2026] A full stud each side of every opening, added to the kept T1
 * stations. [Default, needs Sam] for the rest:
 *  - its face sits on the opening edge (centre at xLeft − w/2 and xRight + w/2), never outside the wall;
 *  - two openings closer than half a stud thickness share one stud, centred in the gap between them (a stud
 *    there would otherwise sit inside the other opening);
 *  - studs whose centres are closer than one stud thickness are one stud: an end stud beats a side stud, a side
 *    stud beats a centre stud (equal kinds: the first along the wall). Studs that touch, or sit further apart,
 *    are all kept. So openings under 2 stud thicknesses apart get 1 stud between them, and from 2 up get 2.
 * Returns the counted stations along the wall.
 */
function framedStations(ctx, stations, run, openings, w, wallId) {
  const L = run.runMm;
  const last = stations.length - 1;
  const cands = [];
  stations.forEach((s, i) => {
    if (s.opening) return;
    const end = (i === 0 && !run.excluded.includes("start")) || (i === last && !run.excluded.includes("end"));
    cands.push({ x: s.x, kind: end ? "end" : "centre", beside: [] });
  });
  const byX = [...openings].sort((a, b) => a.xLeftMm - b.xLeftMm); // never overlapping (wallOpenings)
  byX.forEach((o, i) => {
    const prev = byX[i - 1];
    const next = byX[i + 1];
    const left = prev && o.xLeftMm - w / 2 < prev.xRightMm - EPS_MM ? { x: (prev.xRightMm + o.xLeftMm) / 2, shared: true } : { x: o.xLeftMm - w / 2 };
    const right = next && o.xRightMm + w / 2 > next.xLeftMm + EPS_MM ? { x: (o.xRightMm + next.xLeftMm) / 2, shared: true } : { x: o.xRightMm + w / 2 };
    if (right.shared) ctx.explain.push(`${o.id} and ${next.id} are ${fmt(next.xLeftMm - o.xRightMm)} mm apart, so they share one stud at ${fmt(right.x)}`);
    for (const s of [left, right]) cands.push({ x: Math.min(L, Math.max(0, s.x)), kind: "side", beside: [o.id], shared: !!s.shared });
  });
  const accepted = [];
  for (const c of [...cands].sort((a, b) => STUD_RANK[a.kind] - STUD_RANK[b.kind] || a.x - b.x)) {
    let near = null;
    for (const a of accepted) if (Math.abs(a.x - c.x) < w - EPS_MM && (!near || Math.abs(a.x - c.x) < Math.abs(near.x - c.x))) near = a;
    if (!near) { accepted.push({ ...c, beside: [...c.beside], merged: [] }); continue; }
    near.merged.push(c.x);
    for (const id of c.beside) if (!near.beside.includes(id)) near.beside.push(id);
    // a shared stud between two openings is already explained above
    if (c.shared && near.shared && Math.abs(near.x - c.x) <= EPS_MM) continue;
    ctx.explain.push(`The ${STUD_NAME[c.kind]} at ${fmt(c.x)} and the ${STUD_NAME[near.kind]} at ${fmt(near.x)} are ${fmt(Math.abs(near.x - c.x))} mm apart`
      + ` (closer than ${fmt(w)} mm), so they are one stud at ${fmt(near.x)}`);
  }
  return accepted.sort((a, b) => a.x - b.x).map((a) => ({ x: a.x, stationId: demandId(wallId, posKey(a.x)), opening: null, kind: a.kind, beside: a.beside, merged: a.merged }));
}

/**
 * T4 stud wall: base stations by T1 along the wall; full-height studs strictly inside an opening
 * (xLeft < x < xRight) are removed — never "base count − floor(width/centres)". Below-sill / above-head
 * pieces are added at those stations only when the subregion exists AND opening.detail requires them;
 * kings/jacks/trimmers/lintels/sills come only from detail.members (explicit product + length). Until every
 * opening's detail is complete the output is "base studs only; opening framing incomplete".
 * Opening levels are measured from the stud base (top of bottom plate) unless levelsFrom = "frameBase".
 * @param {{ materialId:string, wallId:string, measurementId?:string, identity:object, wallLengthMm:number,
 *   centresMm:number, spacing?:"fixed"|"equal", startOffsetMm?:number, endOffsetMm?:number, includeStart?:boolean,
 *   includeEnd?:boolean, plies?:number, allowanceMm?:number, levelsFrom?:"studBase"|"frameBase",
 *   height:{ mode:"studCut", studLengthMm:number } | { mode:"frameHeight", frameHeightMm:number, bottomPlateMm:number,
 *     topPlateMm:number, deductions?:Array<{label:string, mm:number}> },
 *   openings?:Array<{ id:string, xLeftMm:number, xRightMm:number, sillMm:number, headMm:number, detail?:{
 *     source:"reviewed-detail"|"explicit", ref?:string, belowSill?:{required:boolean, deductionMm?:number},
 *     aboveHead?:{required:boolean, deductionMm?:number}, reconcileCoincident?:boolean,
 *     members:Array<{ id:string, role:string, quantity:number, lengthMm?:number,
 *       lengthFrom?:"stud"|"openingWidth"|"headLevel"|"sillLevel", addMm?:number, sameAsStud?:boolean,
 *       identity?:object, materialId?:string, stock?:object, atMm?:number[] }> } }>,
 *   extras?:Array<{ id:string, role:string, quantity:number, lengthMm?:number, lengthFrom?:"stud", sameAsStud?:boolean,
 *     identity?:object }>, stock?:object, cutAllocation?:boolean, sizing?:object,
 *   openingSideStuds?:{ studWidthMm:number }, clipOpeningLevels?:boolean, label?:string }} input
 *   HUB 028 options (off unless given): openingSideStuds adds a stud each side of every opening and merges studs
 *   closer than studWidthMm (ticks state "side"; labels "Stud @ 977.5 (beside D1)", never a king);
 *   clipOpeningLevels clips sill and head into the stud height with a non-blocking "opening_clipped" note: a head
 *   above the studs is taken to the top of the studs, and an opening wholly above them frames nothing in this wall
 *   (layout.openingsAboveStuds lists it; it is not in layout.openings).
 * @returns {object} MethodResult (layout.ticks = stations, layout.openings = per-opening framing state)
 */
export function computeStudWall(input) {
  return guarded(() => {
    const ctx = setup(input, "stud");
    const wallId = text(input.wallId) || fail("Trace the wall first.", "wallId");
    const plies = num(input.plies, "Plies", { min: 1, def: 1, integer: true });
    const allowanceMm = num(input.allowanceMm, "End allowance", { def: 0 });
    const sideW = sideStudWidth(input.openingSideStuds);
    const clip = flag(input.clipOpeningLevels, "Clip opening levels", false);
    const height = studHeight(input.height);
    ctx.explain.push(height.explain);
    let datumMm = 0;
    if (input.levelsFrom === "frameBase") {
      if (height.bottomPlateMm === undefined) fail("Opening levels from the frame base need frame-height mode (with its bottom plate).", "levelsFrom");
      datumMm = height.bottomPlateMm;
    } else if (input.levelsFrom !== undefined && input.levelsFrom !== "studBase") fail('Opening levels are from "studBase" or "frameBase".', "levelsFrom");
    const run = layoutRun({
      runMm: num(input.wallLengthMm, "Wall length", { above: true }), centresMm: input.centresMm, spacing: input.spacing ?? "fixed",
      startOffsetMm: input.startOffsetMm, endOffsetMm: input.endOffsetMm, includeStart: input.includeStart, includeEnd: input.includeEnd,
    });
    const listed = wallOpenings(input.openings, run.runMm, height.studLengthMm, datumMm, clip ? { ctx, wallId } : null);
    const openings = listed.filter((o) => !o.aboveStuds);
    const aboveStuds = listed.filter((o) => o.aboveStuds);
    const ref = { wallId, ...(text(input.measurementId) ? { measurementId: text(input.measurementId) } : {}) };
    const stations = run.positions.map((x) => ({
      x, stationId: demandId(wallId, posKey(x)), opening: openings.find((o) => x > o.xLeftMm + EPS_MM && x < o.xRightMm - EPS_MM) ?? null,
    }));
    const kept = sideW === null ? stations.filter((s) => !s.opening) : framedStations(ctx, stations, run, openings, sideW, wallId);
    const w = { wallId, ref, plies, allowanceMm, studLengthMm: height.studLengthMm, reconciled: new Map() };
    const framing = [];
    const openingLayout = [];
    for (const o of aboveStuds) ctx.explain.push(`${o.id}: above the ${fmt(height.studLengthMm)} mm studs, so no studs are removed for it`);
    for (const o of openings) {
      const removed = stations.filter((s) => s.opening === o);
      const f = openingFraming(ctx, o, removed, kept, w);
      framing.push(...f.demands);
      ctx.explain.push(`${o.id}: ${removed.length} full-height stud(s) strictly inside ${fmt(o.xLeftMm)}–${fmt(o.xRightMm)} removed`, ...f.explain);
      if (f.missing.length) {
        ctx.problems.push(problem("opening_framing_incomplete", `${o.id}: ${OPENING_FRAMING_INCOMPLETE} — needs ${f.missing.join("; ")}.`, { refs: [{ wallId, openingId: o.id }] }));
      }
      openingLayout.push({
        id: o.id, xLeftMm: o.xLeftMm, xRightMm: o.xRightMm, sillMm: o.sillMm, headMm: o.headMm,
        removedStationIds: removed.map((s) => s.stationId), complete: !f.missing.length, missing: f.missing,
        detail: o.detail && typeof o.detail === "object" ? { source: o.detail.source ?? null, ref: text(o.detail.ref) || null } : null,
      });
    }
    budget(kept.length * plies);
    const demands = [];
    for (const s of kept) {
      for (let k = 1; k <= plies; k++) {
        if (k === 1 && w.reconciled.has(s.stationId)) continue;
        demands.push(piece(ctx, {
          id: demandId(ctx.materialId, "stud", s.stationId, `p${k}`), role: "stud", lengthMm: height.studLengthMm + allowanceMm,
          label: `Stud @ ${fmt(s.x)}${s.beside?.length ? ` (beside ${s.beside.join(", ")})` : ""}${plies > 1 ? ` ply ${k}` : ""}`,
          sourceRefs: [{ ...ref, station: s.x, role: "stud" }],
        }));
      }
    }
    demands.push(...framing);
    let additionsComplete = true;
    const extras = list(input.extras, "Wall additions");
    const extraIds = new Set();
    for (const e of extras) {
      uniqueId(e?.id, extraIds, "wall addition");
      const r = explicitMember(ctx, e, { owner: wallId, lengths: { stud: height.studLengthMm }, allowanceMm, idParts: [wallId], sourceRef: ref });
      if (r.missing) {
        additionsComplete = false;
        ctx.problems.push(problem("member_incomplete", `${wallId}: the addition needs ${r.missing}.`, { refs: [{ wallId, memberId: text(e.id) }] }));
      } else demands.push(r.demand);
    }
    const openingsComplete = openingLayout.every((o) => o.complete);
    const sideCount = sideW === null ? 0 : kept.filter((s) => s.kind === "side").length;
    ctx.explain.push(`${kept.length} ${sideW === null ? "common " : ""}stud station(s) × ${plies}${allowanceMm ? ` at ${fmt(height.studLengthMm)} + ${fmt(allowanceMm)} allowance` : ""}`
      + `${sideW === null ? "" : `, ${sideCount} of them beside openings (face on the opening edge)`}`
      + `${w.reconciled.size ? `; ${w.reconciled.size} serve as kings (detail permits)` : ""}`,
    `Corners, T-junctions, brace panels, point loads and hold-downs are explicit additions only (${extras.length} entered)`);
    const scope = openingsComplete ? (openings.length ? "studs with explicit opening framing" : "base studs") : OPENING_FRAMING_INCOMPLETE;
    if (!openingsComplete) ctx.explain.push(cap(OPENING_FRAMING_INCOMPLETE));
    const ticks = sideW === null
      ? stations.map((s) => ({
        stationId: s.stationId, positionMm: s.x, state: s.opening ? "removed" : "full", openingId: s.opening?.id ?? null,
        reconciledWith: w.reconciled.get(s.stationId) ?? null,
      }))
      // HUB 028: the counted studs (end and centre "full", "side") and the stations removed inside openings, along
      // the wall; a stud merged into its neighbour is not a tick of its own (its position is in mergedMm)
      : [...kept.map((s) => ({
        stationId: s.stationId, positionMm: s.x, state: s.kind === "side" ? "side" : "full", openingId: null,
        reconciledWith: w.reconciled.get(s.stationId) ?? null, besideOpeningIds: s.beside, mergedMm: s.merged,
      })), ...stations.filter((s) => s.opening).map((s) => ({
        stationId: s.stationId, positionMm: s.x, state: "removed", openingId: s.opening.id, reconciledWith: null,
      }))].sort((a, b) => a.positionMm - b.positionMm);
    return result(ctx, demands, {
      kind: "studWall", wallId, wallLengthMm: run.runMm, studLengthMm: height.studLengthMm, plies, scope,
      ...(sideW === null ? {} : { studWidthMm: sideW }),
      ticks,
      openings: openingLayout,
      // HUB 028 clipOpeningLevels: openings wholly above the studs, which frame nothing here (only when there are some)
      ...(aboveStuds.length ? { openingsAboveStuds: aboveStuds.map((o) => ({ id: o.id, xLeftMm: o.xLeftMm, xRightMm: o.xRightMm })) } : {}),
    }, openingsComplete && additionsComplete);
  });
}

// ── T5 plates, noggins, trim ─────────────────────────────────────────────────

/**
 * Sam's plate join rule (HUB 028, 25 Oct 2026). A plate piece longer than the longest length is cut at the furthest
 * stud centre that leaves the piece no longer than it, and again until every piece fits; each piece is then bought as
 * one stock length (no plate offcut sharing). If no stud centre falls inside the allowed span, one plain blocking
 * problem names the wall and the stretch with no stud (and there are no pieces). Pure.
 * [Default, needs Sam] Top and bottom joins are not staggered (Sam didn't say).
 * Example: a 9,000 plate at 600 centres with a 6,000 longest length → 6,000 + 3,000, joined over the stud at 6,000.
 * @param {{ fromMm:number, toMm:number, studCentresMm:number[], maxMm:number, wallLabel?:string, plateName?:string }} opts
 *   plateName names the layer in the problem ("top plate"); without it, "plate".
 * @returns {{ pieces:Array<{ fromMm:number, toMm:number, lengthMm:number }>, joinsMm:number[], problem:null }
 *   | { pieces:null, joinsMm:null, problem:object }} (throws TakeoffValidationError on invalid input)
 */
export function splitPlateAtStuds({ fromMm, toMm, studCentresMm, maxMm, wallLabel, plateName } = {}) {
  const a = num(fromMm, "Plate start");
  const b = num(toMm, "Plate end");
  if (b <= a + EPS_MM) fail("The plate must end after it starts.", "plate");
  const max = num(maxMm, "Longest length", { above: true });
  const studs = list(studCentresMm, "Stud centres").map((x, i) => num(x, `Stud centre ${i + 1}`)).sort((x, y) => x - y);
  const pieces = [];
  const joinsMm = [];
  let start = a;
  while (b - start > max + EPS_MM) {
    let at = null;
    for (const x of studs) if (x > start + EPS_MM && x - start <= max + EPS_MM) at = x; // sorted: the last in range is the furthest
    if (at === null) {
      // the stretch with no stud under it runs from here to the next stud (or the plate end)
      const to = Math.min(b, studs.find((x) => x > start + EPS_MM) ?? b);
      return {
        pieces: null, joinsMm: null,
        problem: problem("plate_too_long", `${text(wallLabel) || "This wall"}: the ${text(plateName) || "plate"} has no stud to join over from ${fmt(start)} to ${fmt(to)} mm.`
          + ` That is ${fmt(to - start)} mm, longer than the ${fmt(max)} mm longest length. Set a longer longest length for the plates.`,
        { refs: [{ fromMm: a, toMm: b, noStudFromMm: start, noStudToMm: to }] }),
      };
    }
    pieces.push({ fromMm: start, toMm: at, lengthMm: at - start });
    joinsMm.push(at);
    start = at;
  }
  pieces.push({ fromMm: start, toMm: b, lengthMm: b - start });
  return { pieces, joinsMm, problem: null };
}

function plateGaps(raw, tag, runMm) {
  return list(raw, `${cap(tag)} plate gaps`).map((g, i) => {
    if (!g || typeof g !== "object") fail(`${cap(tag)} plate gap ${i + 1} is invalid.`, "layers");
    const id = text(g.id) || null;
    const name = id || `${cap(tag)} plate gap ${i + 1}`;
    const fromMm = num(g.fromMm, `${name} start`);
    const toMm = num(g.toMm, `${name} end`);
    if (toMm <= fromMm + EPS_MM || toMm > runMm + EPS_MM) fail(`${name} must lie within the plate run, its end after its start.`, "layers");
    return { id, fromMm, toMm: Math.min(runMm, toMm) };
  }).sort((x, y) => x.fromMm - y.fromMm);
}

/** [from, to] less every gap; pieces of zero length or less are dropped. Gaps are sorted by start. */
function lessGaps([a, b], gaps) {
  const out = [];
  let cur = a;
  for (const g of gaps) {
    if (g.toMm <= cur + EPS_MM || g.fromMm >= b - EPS_MM) continue;
    if (g.fromMm - cur > EPS_MM) out.push([cur, g.fromMm]);
    cur = Math.max(cur, g.toMm);
  }
  if (b - cur > EPS_MM) out.push([cur, b]);
  return out;
}

const PLATE_NAMES = { bottom: "bottom plate", top: "top plate", "top-2": "second top plate" };

function joinOption(raw) {
  if (raw === undefined || raw === null || raw === false) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) fail("Plate joins over studs need the stud centres.", "joinOverStuds");
  return { studCentresMm: list(raw.studCentresMm, "Stud centres").map((x, i) => num(x, `Stud centre ${i + 1}`)), wallLabel: text(raw.wallLabel) };
}

/**
 * T5 plates: wall run × explicit layers. A layer is ONE continuous piece unless joints selected from the
 * framing detail (jointDetailRef) split it; never aggregate LM. Roles keep the layer tag ("<tag>-plate").
 * HUB 028 options (off unless given): a layer's gapsMm (spans to leave out) are cut out of it, dropping pieces of
 * zero length or less (a full-width gap leaves no piece and no error). Walls doesn't use gapsMm: Sam's round 2
 * (25 Oct 2026) buys the bottom plate full length and the crew cuts the doorway out. A piece the gaps leave is kept
 * however short. joinOverStuds applies Sam's join rule (splitPlateAtStuds) to every piece longer than the longest
 * stock length (product maximum, less unavailable lengths and the allowance). A piece no stud lets it join gives one
 * blocking "plate_too_long" for the wall.
 * @param {{ materialId:string, wallId:string, measurementId?:string, identity:object, runMm:number,
 *   layers:Array<{ tag:string, jointsMm?:number[], gapsMm?:Array<{ id?:string, fromMm:number, toMm:number }> }>,
 *   jointDetailRef?:string, allowanceMm?:number, joinOverStuds?:{ studCentresMm:number[], wallLabel?:string },
 *   label?:string, stock?:object, cutAllocation?:boolean, sizing?:object }} input
 * @returns {object} MethodResult
 */
export function computePlates(input) {
  return guarded(() => {
    const ctx = setup(input, "plate");
    const wallId = text(input.wallId) || fail("Trace the wall first.", "wallId");
    const runMm = num(input.runMm, "Plate run", { above: true });
    const allowanceMm = num(input.allowanceMm, "End allowance", { def: 0 });
    const layers = list(input.layers, "Plate layers");
    if (!layers.length) fail("Add the plate layers (for example one bottom and two top).", "layers");
    const jointRef = text(input.jointDetailRef);
    const join = joinOption(input.joinOverStuds);
    const permitted = join && ctx.stockPolicy.maxMm !== null ? permittedStockLengths(ctx.stockPolicy) : null;
    const longestMm = permitted?.length ? permitted[permitted.length - 1] : null; // nothing to split against without one
    let blocked = null;
    const ref = { wallId, ...(text(input.measurementId) ? { measurementId: text(input.measurementId) } : {}) };
    const tags = new Set();
    const demands = [];
    const layout = [];
    for (const l of layers) {
      const tag = uniqueId(l?.tag, tags, "plate layer");
      const joints = list(l.jointsMm, `${tag} joints`).map((j) => num(j, `${tag} joint`));
      if (joints.length && !jointRef) fail("Plate joints must come from the framing detail — name it.", "jointDetailRef");
      const cuts = [0, ...joints, runMm];
      for (let k = 1; k < cuts.length; k++) if (cuts[k] <= cuts[k - 1] + EPS_MM) fail(`${tag} plate joints must be in order and inside the run.`, "layers");
      const role = `${tag}-plate`;
      const hasGaps = l.gapsMm !== undefined && l.gapsMm !== null;
      const gaps = hasGaps ? plateGaps(l.gapsMm, tag, runMm) : [];
      let spans = [];
      for (let k = 0; k < cuts.length - 1; k++) spans.push([cuts[k], cuts[k + 1]]);
      if (gaps.length) spans = spans.flatMap((s) => lessGaps(s, gaps));
      const studJoins = [];
      let dropped = 0;
      if (longestMm !== null) {
        const limit = longestMm - allowanceMm;
        spans = spans.flatMap(([a, b]) => {
          if (b - a <= limit + EPS_MM) return [[a, b]];
          const plateName = PLATE_NAMES[tag] ?? `${tag} plate`;
          const r = limit > EPS_MM ? splitPlateAtStuds({ fromMm: a, toMm: b, studCentresMm: join.studCentresMm, maxMm: limit, wallLabel: join.wallLabel || wallId, plateName })
            : { problem: problem("plate_too_long", `${join.wallLabel || wallId}: the end allowance leaves no ${plateName} within the longest length. Lower the end allowance.`) };
          if (r.problem) {
            // one blocking problem per wall, however many pieces can't be joined; the piece itself isn't ordered
            if (!blocked) blocked = { ...r.problem, refs: [{ wallId, layer: tag, fromMm: a, toMm: b, ...(r.problem.refs?.[0] ?? {}) }] };
            dropped++;
            return [];
          }
          studJoins.push(...r.joinsMm);
          return r.pieces.map((p) => [p.fromMm, p.toMm]);
        });
      }
      const pieces = [];
      for (const [a, b] of spans) {
        pieces.push(b - a);
        demands.push(piece(ctx, {
          id: demandId(ctx.materialId, role, wallId, posKey(a)), role, lengthMm: b - a + allowanceMm,
          label: `${cap(tag)} plate ${fmt(a)}–${fmt(b)}`, sourceRefs: [{ ...ref, role: tag }],
        }));
      }
      layout.push({
        tag, jointsMm: joints, piecesMm: pieces,
        ...(hasGaps ? { gapsMm: gaps.map((g) => ({ ...(g.id ? { id: g.id } : {}), fromMm: g.fromMm, toMm: g.toMm })) } : {}),
        ...(join ? { joinsOverStudsMm: studJoins } : {}),
      });
      if (!gaps.length && !studJoins.length && !dropped) {
        ctx.explain.push(joints.length
          ? `${cap(tag)} plate: split at ${joints.map(fmt).join(", ")} mm per ${jointRef} → ${pieces.map(fmt).join(" + ")} mm`
          : `${cap(tag)} plate: one continuous ${fmt(runMm)} mm piece (no joints selected from the framing detail)`);
      } else {
        const steps = [
          ...(joints.length ? [`split at ${joints.map(fmt).join(", ")} mm per ${jointRef}`] : []),
          ...(gaps.length ? [`less ${gaps.map((g) => `${g.id ? `${g.id} ` : ""}${fmt(g.fromMm)}–${fmt(g.toMm)}`).join(", ")}`] : []),
          ...(studJoins.length ? [`joined over the stud${studJoins.length > 1 ? "s" : ""} at ${studJoins.map(fmt).join(", ")} mm (longest length ${fmt(longestMm)} mm)`] : []),
          ...(dropped ? [`${dropped} piece${dropped > 1 ? "s" : ""} longer than ${fmt(longestMm)} mm with no stud to join over, not ordered`] : []),
        ];
        ctx.explain.push(`${cap(tag)} plate: ${fmt(runMm)} mm ${steps.join("; ")} → ${pieces.length ? `${pieces.map(fmt).join(" + ")} mm` : "no plate"}`);
      }
    }
    if (blocked) ctx.problems.push(blocked);
    return result(ctx, demands, { kind: "plates", wallId, runMm, layers: layout }, !blocked);
  });
}

/**
 * Sam's noggin rows for one wall (HUB 028): 1 row at 2,700 mm or under, 2 rows over 2,700 mm (the test is the wall's
 * own height − 2,700 > 0, so exactly 2,700 is not over). Both are owner rules, recorded with their reference.
 * @param {number} heightMm  the wall's own height
 * @returns {{ rows:1|2, rowsSource:"owner-rule", rowsRuleRef:string }} (throws TakeoffValidationError without a height)
 */
export function wallNogginRows(heightMm) {
  const h = num(heightMm, "Wall height", { above: true });
  const over = h - NOGGIN_TWO_ROWS_OVER_MM > EPS_MM;
  return { rows: over ? 2 : 1, rowsSource: "owner-rule", rowsRuleRef: over ? NOGGIN_ROW_RULES.two : NOGGIN_ROW_RULES.one };
}

/**
 * T5 noggins: clear bay = (next station − station) − half of each bordering member width, + allowance.
 * Rows are entered, from a reviewed detail or (HUB 028) an owner rule with its reference — never inferred
 * (missing rows → incomplete, no pieces). Bays crossing an opening are removed; returns are explicit additions.
 * skipClosedBays (HUB 028 [Default, needs Sam], off unless given): a bay between touching studs gets no noggin
 * instead of an error, and fewer than two stations (a wall shorter than one stud) give no bays instead of an error.
 * @param {{ materialId:string, wallId:string, identity:object, stations:Array<{ positionMm:number, widthMm:number }>,
 *   rows?:number, rowsSource?:"entered"|"reviewed-detail"|"owner-rule", rowsDetailRef?:string, rowsRuleRef?:string,
 *   openings?:Array<{ id:string, xLeftMm:number, xRightMm:number }>, skipClosedBays?:boolean, label?:string,
 *   returns?:Array<{ id:string, quantity:number, lengthMm:number }>, allowanceMm?:number, stock?:object,
 *   cutAllocation?:boolean, sizing?:object }} input
 * @returns {object} MethodResult (layout.bays)
 */
export function computeNoggins(input) {
  return guarded(() => {
    const ctx = setup(input, "noggin");
    const wallId = text(input.wallId) || fail("Trace the wall first.", "wallId");
    const allowanceMm = num(input.allowanceMm, "End allowance", { def: 0 });
    const skipClosed = flag(input.skipClosedBays, "Skip closed bays", false);
    const stations = list(input.stations, "Framing stations").map((s, i) => ({
      x: num(s?.positionMm, `Station ${i + 1} position`), w: num(s?.widthMm, `Station ${i + 1} member width`, { above: true }),
    })).sort((a, b) => a.x - b.x);
    // skipClosedBays: a wall the stud merge leaves with one stud (shorter than a stud thickness) has no bay, not an error
    if (stations.length < 2 && !skipClosed) fail("Noggins need at least two framing stations.", "stations");
    const seen = new Set();
    const openings = list(input.openings, "Openings").map((o) => {
      const id = uniqueId(o?.id, seen, "opening");
      const xLeftMm = num(o.xLeftMm, `${id} left edge`);
      const xRightMm = num(o.xRightMm, `${id} right edge`);
      if (xRightMm <= xLeftMm + EPS_MM) fail(`${id}: right edge must be after the left edge.`, "openings");
      return { id, xLeftMm, xRightMm };
    });
    let rows = 0;
    if (input.rows === undefined || input.rows === null) {
      ctx.problems.push(problem("noggin_rows_missing", "Enter the number of noggin rows or select it from a reviewed framing detail — it is never inferred from cladding support spacing."));
    } else {
      rows = num(input.rows, "Noggin rows", { min: 1, integer: true });
      if (!ROW_SOURCES.includes(input.rowsSource)) fail("Say where the row count comes from: entered or a reviewed framing detail.", "rowsSource");
      if (input.rowsSource === "reviewed-detail" && !text(input.rowsDetailRef)) fail("Name the reviewed framing detail the noggin rows come from.", "rowsDetailRef");
      if (input.rowsSource === "owner-rule" && !text(input.rowsRuleRef)) fail("Name the owner rule the noggin rows come from.", "rowsRuleRef");
    }
    const demands = [];
    const bays = [];
    let closed = 0;
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i];
      const b = stations[i + 1];
      const left = a.x + a.w / 2;
      const right = b.x - b.w / 2;
      const bayId = demandId(wallId, `${posKey(a.x)}-${posKey(b.x)}`);
      if (right - left <= EPS_MM) {
        if (!skipClosed) fail(`Stations at ${fmt(a.x)} and ${fmt(b.x)} leave no clear bay.`, "stations");
        closed++;
        bays.push({ bayId, fromMm: a.x, toMm: b.x, clearMm: right - left, openingId: null, closed: true });
        continue;
      }
      const through = openings.find((o) => Math.min(right, o.xRightMm) - Math.max(left, o.xLeftMm) > EPS_MM) ?? null;
      bays.push({ bayId, fromMm: a.x, toMm: b.x, clearMm: right - left, openingId: through?.id ?? null });
      if (through || !rows) continue;
      demands.push(piece(ctx, {
        id: demandId(ctx.materialId, "noggin", bayId), role: "noggin", quantity: rows, lengthMm: right - left + allowanceMm,
        label: `Noggin ${fmt(a.x)}–${fmt(b.x)} × ${rows}`, sourceRefs: [{ wallId, role: "noggin", cell: bayId }],
      }));
    }
    const returnIds = new Set();
    for (const r of list(input.returns, "Returns")) {
      const id = uniqueId(r?.id, returnIds, "return");
      const quantity = num(r.quantity, `${id} quantity`, { min: 1, integer: true });
      const lengthMm = num(r.lengthMm, `${id} length`, { above: true });
      demands.push(piece(ctx, {
        id: demandId(ctx.materialId, "noggin-return", wallId, id), role: "noggin-return", quantity, lengthMm: lengthMm + allowanceMm,
        label: `Noggin return ${id} × ${quantity}`, sourceRefs: [{ wallId, role: "noggin-return", cell: id }], provenance: "manual",
      }));
    }
    const removed = bays.filter((b) => b.openingId).length;
    const ruled = rows > 0 && input.rowsSource === "owner-rule";
    if (stations.length < 2) ctx.explain.push(`${stations.length} framing station${stations.length === 1 ? "" : "s"}, so no bays and no noggins`);
    ctx.explain.push(`${bays.length} bays (clear = centres − half of each bordering member)${removed ? `, ${removed} through openings removed` : ""}`
      + `${closed ? `, ${closed} closed (touching studs, no noggin)` : ""}`
      + (rows ? ` × ${rows} row(s) (${input.rowsSource === "entered" ? "entered" : ruled ? `owner rule: ${text(input.rowsRuleRef)}` : `reviewed detail ${text(input.rowsDetailRef)}`})` : " — rows not set"));
    return result(ctx, demands, { kind: "noggins", wallId, rows, ...(ruled ? { rowsSource: "owner-rule", rowsRuleRef: text(input.rowsRuleRef) } : {}), bays }, rows > 0);
  });
}

/**
 * T5 trim: one piece per measured path segment + its explicit mitre/end allowances. joinsAllowed (visible
 * join policy, default false) decides whether the allocator may join a long segment (noSplice = !joinsAllowed).
 * @param {{ materialId:string, identity:object, segments:Array<{ id:string, measurementId?:string, lengthMm:number,
 *   startAllowanceMm?:number, endAllowanceMm?:number }>, joinsAllowed?:boolean, stock?:object, cutAllocation?:boolean }} input
 * @returns {object} MethodResult
 */
export function computeTrim(input) {
  return guarded(() => {
    const ctx = setup(input, "trim");
    const joins = flag(input.joinsAllowed, "Visible joins allowed", false);
    const segments = list(input.segments, "Trim segments");
    if (!segments.length) fail("Measure the trim path first.", "segments");
    const seen = new Set();
    const demands = segments.map((s) => {
      const id = uniqueId(s?.id, seen, "trim segment");
      const L = num(s.lengthMm, `${id} length`, { above: true });
      const a = num(s.startAllowanceMm, `${id} start allowance`, { def: 0 });
      const b = num(s.endAllowanceMm, `${id} end allowance`, { def: 0 });
      return piece(ctx, {
        id: demandId(ctx.materialId, "trim", id), role: "trim", lengthMm: L + a + b, noSplice: !joins,
        label: `Trim ${id}: ${fmt(L)}${a ? ` + ${fmt(a)} start` : ""}${b ? ` + ${fmt(b)} end` : ""} mm`,
        sourceRefs: [{ measurementId: text(s.measurementId) || id, role: "trimPath" }],
      });
    });
    ctx.explain.push(joins ? "Visible joins allowed (noSplice off) — join positions are not chosen here; a segment longer than the stock stays one demand until joined"
      : "No visible joins — each segment is one continuous piece");
    return result(ctx, demands, { kind: "trim", joinsAllowed: joins }, true);
  });
}

// ── T7 manual / count ────────────────────────────────────────────────────────

/**
 * T7 manual timber. Entries: count { markers:[{id, lengthMm?}], lengthMm? } (shared length; per-marker
 * overrides become small labelled groups), cut { quantity, lengthMm } and member { quantity, member } — an
 * individual member (hip, valley, jack …) by its own true or projected length via memberLength (T2; the
 * material's allowance applies once, so member.allowanceMm is refused) — all cut lengths (+ allowance, then
 * stock selection); orderedStock { quantity, stockLengthMm, source } — the user's supplier cut list:
 * lengthKind orderedStock, no stock policy, no slope/allowance/rounding. Each line names its length kind.
 * @param {{ materialId:string, role?:string, identity:object, allowanceMm?:number, stock?:object,
 *   cutAllocation?:boolean, sizing?:object, entries:Array<{ id:string, kind:"count"|"cut"|"member"|"orderedStock",
 *   measurementId?:string, quantity?:number, lengthMm?:number, stockLengthMm?:number, source?:string,
 *   member?:{ mode:string, lengthMm:number, pitchDeg?:number, overhangsMm?:object[] },
 *   markers?:Array<{ id:string, lengthMm?:number }> }> }} input
 * @returns {object} MethodResult
 */
export function computeManualTimber(input) {
  return guarded(() => {
    const role = text(input?.role) || "member";
    const ctx = setup(input, role);
    const allowanceMm = num(input.allowanceMm, "End allowance", { def: 0 });
    const entries = list(input.entries, "Entries");
    if (!entries.length) fail("Add a count, cut length, member or ordered stock line.", "entries");
    const seen = new Set();
    const demands = [];
    const kinds = new Set();
    const cutLabel = (L) => `${fmt(L)}${allowanceMm ? ` + ${fmt(allowanceMm)} allowance` : ""} mm cut length → stock selected`;
    for (const e of entries) {
      const id = uniqueId(e?.id, seen, "entry");
      const measurementId = text(e.measurementId) || id;
      kinds.add(e.kind === "orderedStock" ? "orderedStock" : "cut");
      if (e.kind === "orderedStock") {
        if (e.allowanceMm !== undefined || e.pitchDeg !== undefined || e.member !== undefined) fail(`${id}: ordered stock bypasses slope and allowance — remove them.`, "entries");
        if (e.lengthMm !== undefined) fail(`${id}: ordered stock takes the supplier's stock length only — enter a measured length as a cut line.`, "entries");
        const quantity = num(e.quantity, `${id} quantity`, { min: 1, integer: true });
        const L = num(e.stockLengthMm, `${id} stock length`, { above: true });
        const source = text(e.source) || fail(`${id}: say which supplier cut list or attachment these stock lengths come from.`, "source");
        demands.push(piece(ctx, {
          id: demandId(ctx.materialId, role, id), role, quantity, lengthMm: L, lengthKind: LENGTH_KINDS.ORDERED_STOCK, stockPolicy: null,
          provenance: "manual", label: `Ordered stock ${quantity} × ${fmt(L)} mm (from ${source}) — no slope, allowance or rounding`,
          sourceRefs: [{ measurementId, role: "orderedStock", source }],
        }));
      } else if (e.kind === "cut") {
        const quantity = num(e.quantity, `${id} quantity`, { min: 1, integer: true });
        const L = num(e.lengthMm, `${id} cut length`, { above: true });
        demands.push(piece(ctx, {
          id: demandId(ctx.materialId, role, id), role, quantity, lengthMm: L + allowanceMm, provenance: "manual",
          label: `Cut ${quantity} × ${cutLabel(L)}`, sourceRefs: [{ measurementId, role: "manual" }],
        }));
      } else if (e.kind === "member") {
        const quantity = num(e.quantity, `${id} quantity`, { min: 1, integer: true });
        if (!e.member || typeof e.member !== "object") fail(`${id}: set how the member length is measured.`, "entries");
        if (e.member.allowanceMm !== undefined) fail(`${id}: the end allowance is set once for this timber, not per member.`, "entries");
        const len = memberLength({ ...e.member, allowanceMm });
        demands.push(piece(ctx, {
          id: demandId(ctx.materialId, role, id), role, quantity, lengthMm: len.lengthNeededMm, provenance: "manual",
          label: `Member ${id} × ${quantity}: ${len.explain.join("; ")}`, sourceRefs: [{ measurementId, role: "member" }],
        }));
      } else if (e.kind === "count") {
        const shared = e.lengthMm === undefined ? null : num(e.lengthMm, `${id} length`, { above: true });
        const markers = list(e.markers, `${id} markers`);
        if (!markers.length) fail(`${id}: place at least one count marker.`, "markers");
        const groups = new Map();
        const markerIds = new Set();
        for (const m of markers) {
          const mid = uniqueId(m?.id, markerIds, "count marker");
          const own = m.lengthMm !== undefined;
          const L = own ? num(m.lengthMm, `${id} marker ${mid} length`, { above: true })
            : shared ?? fail(`${id} marker ${mid} has no length — enter a shared length or its own.`, "markers");
          const key = `L${Math.round(L * 1000) / 1000}`;
          if (!groups.has(key)) groups.set(key, { L, markers: [], own: false });
          const g = groups.get(key);
          g.markers.push(mid);
          g.own = g.own || own;
        }
        for (const [key, g] of groups) {
          demands.push(piece(ctx, {
            id: demandId(ctx.materialId, role, id, key), role, quantity: g.markers.length, lengthMm: g.L + allowanceMm,
            label: `Count ${id}${g.own ? " (marker length)" : ""}: ${g.markers.length} × ${cutLabel(g.L)}`,
            sourceRefs: g.markers.map((cell) => ({ measurementId, role: "count", cell })),
          }));
        }
      } else fail(`${id}: the kind must be count, cut, member or orderedStock.`, "entries");
    }
    if (kinds.size > 1) {
      ctx.explain.push("Mixed lines: ordered-stock lines are bought exactly as entered (no slope, allowance or rounding); cut lines go through stock selection — each line is labelled with its length kind");
    }
    return result(ctx, demands, { kind: "manual", role }, true);
  });
}

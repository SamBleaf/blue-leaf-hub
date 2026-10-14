// =============================================================================
// shared/takeoff/engine/allocator.js — the ONE shared linear stock / cutting allocator (TC-R04 11, 03 §T3 + §T6).
//
// Demands (engine/contract.js) → unique cut ids → groups → bars of new stock or existing offcuts.
//   Partition  identityKey(identity) + unit + the normalised StockPolicy. Never by a generic name: a different
//              finish / section / grade is a different group; an existing offcut only serves its own identity.
//   Cut model  simulateBar(): optional leading end trim, then ONE separating saw cut (kerf) per piece while
//              material remains. An exact final piece may use the bar's far end without a cut only when
//              finalEndAcceptable. Every kerf lies inside usable stock (a partial kerf does not fit).
//              Per bar: stock = end-trim loss + Σ pieces + kerf loss + residual (unrounded).
//   Modes      one-per-piece (sharePieces !== true — the structural default, T3): every cut gets its own
//              piece, an existing offcut or the smallest permitted new length that passes simulation.
//              shared (sharePieces === true — REQUIRED for aluminium, opt-in for T6 trim/noggins/boards).
//   Objective  lexicographic: new purchased length → new bars → existing offcuts used → remainders
//              (planned residuals + unused offcuts) largest-first, larger better. With one stock length
//              this is 11's "minimise new bars, then offcuts consumed, then fewer/larger remainders".
//   Search     first-fit-decreasing (T6) gives the initial feasible plan; a deterministic node-bounded
//              branch-and-bound (identical-piece + equivalent-bar symmetry pruning, length, large-piece and
//              offcut-matching lower bounds, limited-discrepancy passes before the exhaustive one) only
//              REPLACES it with a strictly better plan. Phase 1 seeks less new stock; phase 2 spends the
//              remaining budget on offcuts used + remainders. `proven` = minimum new stock proven (lower
//              bound met or phase 1 exhausted); `searchComplete` = whole objective proven.
//   Scope      square transverse cuts only; mitred / notched ends need a verified cut envelope or a
//              reviewed manual plan (11) and must not be sent here as square pieces.
//   Never      splits / splices a piece (even with noSplice false: a too-long piece is "needs-joint-detail"
//              until the method supplies joint positions, 05), clamps a length, turns a planned residual into
//              inventory, uses an offcut twice, or mutates its inputs. Reservations / consumption are the
//              server's job.
//
// Search feasibility uses fitsLoad(), the closed form of simulateBar for a bar's load: n pieces of total
// length Σ fit capacity C iff Σ + n·kerf ≤ C, or (final end acceptable) Σ + (n−1)·kerf = C — independent
// of cut order, but NOT monotone in C (a shared bar with several permitted lengths is feasible when ANY of
// them holds the load: shrinkLen). Every emitted bar is re-simulated with simulateBar. Inputs: groups are
// identity + unit + policy; demands need a finished (cut / finished / orderedStock) length — a tight length
// still owes its allowance and is rejected. Pure, deterministic for any input order; browser + Node.
// =============================================================================
import { EPS_MM, LENGTH_KINDS, ceilTol, demandId, identityKey, problem } from "./contract.js";
import { isFiniteNumber } from "../units.js";
import { MAX_LENGTH_MM, permittedStockLengths, selectStock, stockLengthsFrom, stockPolicyProblem } from "./stock.js";

/** Default branch-and-bound node budget per group (deterministic; callers may raise it off the UI thread). */
export const DEFAULT_NODE_BUDGET = 50000;
/** 06 proposed per-job safeguard: more expanded cuts than this are rejected, never truncated. */
export const MAX_CUTS = 50000;
/** Groups with more placeable pieces than this keep the first-fit-decreasing plan (recursion depth guard). */
export const MAX_SEARCH_PIECES = 2000;

const NEW = "new";
const OFFCUT = "offcut";
const ORDERED_STOCK = "orderedStock";
const ONE_PER_PIECE = "one-per-piece";
const SHARED_SINGLE = "shared-single";
const SHARED_MULTI = "shared-multi";
const DISCREPANCY_SCHEDULE = Object.freeze([0, 1, 2, 3, Infinity]);

const positive = (v) => isFiniteNumber(v) && v > 0 && v < MAX_LENGTH_MM;
const nonNegative = (v) => isFiniteNumber(v) && v >= 0 && v < MAX_LENGTH_MM;
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
/** A procurement identity must name SOMETHING: an empty / non-object identity cannot prove compatibility. */
const validIdentity = (v) => isPlainObject(v) && Object.keys(v).length > 0;
/** Allocation needs finished lengths (11). TIGHT lengths still owe their allowance — never packed raw. */
const ALLOCATABLE_LENGTH_KINDS = new Set([undefined, null, LENGTH_KINDS.CUT, LENGTH_KINDS.FINISHED, LENGTH_KINDS.ORDERED_STOCK]);
const snap = (x) => (Math.abs(x) <= EPS_MM ? 0 : x);
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** n pieces totalling `sum` fit usable capacity `cap` (see header). */
function fitsLoad(cap, fea, n, sum, k) {
  return sum + n * k <= cap + EPS_MM || (fea && n > 0 && Math.abs(sum + (n - 1) * k - cap) <= EPS_MM);
}

/** Residual of a feasible load; an exact final-end fit leaves nothing. */
function residualOf(cap, fea, n, sum, k) {
  const r = cap - sum - n * k;
  return r >= -EPS_MM ? Math.max(0, snap(r)) : 0;
}

/**
 * Cut-sequence simulation of ONE stock piece, cuts taken in the given order (11 kerf convention).
 * A piece fits when piece + kerf ≤ remaining; with finalEndAcceptable an exact final piece uses the far
 * stock end with no separating cut. A kerf never falls outside usable stock (end trim is consumed first).
 * @param {number} stockMm  piece length (new bar or existing offcut)
 * @param {number[]} cuts   finished piece lengths, in cutting order
 * @param {{ kerfMm?: number, endTrimMm?: number, finalEndAcceptable?: boolean }} [opts]  defaults 0 / 0 / false;
 *   finalEndAcceptable must be a boolean or unset (a string such as "false" is invalid input, never truthy)
 * @returns {{ fits: boolean, residualMm: number|null, kerfLossMm: number, trimLossMm: number,
 *   sequence: Array<{ index: number, lengthMm: number, startMm: number, endMm: number, kerfMm: number, usesFinalEnd: boolean }>,
 *   reason: string, failedIndex?: number }}  residualMm is null when the sequence does not fit
 */
export function simulateBar(stockMm, cuts, opts) {
  const { kerfMm = 0, endTrimMm = 0 } = opts ?? {};
  const finalEndAcceptable = opts?.finalEndAcceptable ?? false; // unset → the conservative "needs a cut"
  const fail = (reason, extra) => ({ fits: false, residualMm: null, kerfLossMm: 0, trimLossMm: 0, sequence: [], reason, ...extra });
  if (!positive(stockMm) || !Array.isArray(cuts) || !cuts.every(positive) || !nonNegative(kerfMm) || !nonNegative(endTrimMm)
    || typeof finalEndAcceptable !== "boolean") return fail("invalid-input");
  let remaining = snap(stockMm - endTrimMm);
  if (remaining < 0) return fail("trim-exceeds-stock");
  let pos = endTrimMm;
  let kerfLoss = 0;
  const sequence = [];
  for (let i = 0; i < cuts.length; i++) {
    const len = cuts[i];
    if (finalEndAcceptable && Math.abs(len - remaining) <= EPS_MM) {
      sequence.push({ index: i, lengthMm: len, startMm: pos, endMm: pos + len, kerfMm: 0, usesFinalEnd: true });
      pos += len;
      remaining = snap(remaining - len);
    } else if (len + kerfMm <= remaining + EPS_MM) {
      sequence.push({ index: i, lengthMm: len, startMm: pos, endMm: pos + len, kerfMm, usesFinalEnd: false });
      pos += len + kerfMm;
      kerfLoss += kerfMm;
      remaining = snap(remaining - len - kerfMm);
    } else {
      return { fits: false, residualMm: null, kerfLossMm: kerfLoss, trimLossMm: endTrimMm, sequence, reason: "does-not-fit", failedIndex: i };
    }
  }
  return { fits: true, residualMm: remaining, kerfLossMm: kerfLoss, trimLossMm: endTrimMm, sequence, reason: "fits" };
}

// ── input preparation ─────────────────────────────────────────────────────────

const uniqSorted = (arr) => [...new Set(arr)].sort((a, b) => a - b);

/** Canonical policy: grouping key + the values the allocator applies (unset kerf stays null = unconfirmed 0). */
function normalisePolicy(p) {
  const stock = p.kind === "grid" ? { kind: "grid", minMm: p.minMm, incrementMm: p.incrementMm, maxMm: p.maxMm ?? null, unavailableMm: uniqSorted(p.unavailableMm || []) }
    : p.kind === "list" ? { kind: "list", lengthsMm: uniqSorted(p.lengthsMm) } : { kind: "fixed", lengthMm: p.lengthMm };
  return { ...stock, kerfMm: p.kerfMm ?? null, kerfConfirmed: p.kerfConfirmed === true, endTrimMm: p.endTrimMm ?? 0,
    finalEndAcceptable: p.finalEndAcceptable === true, minRetainedOffcutMm: p.minRetainedOffcutMm ?? null, sharePieces: p.sharePieces === true };
}

/** Validate demands, expand quantities to unique cut ids, bucket by identity + unit + policy. */
function prepareDemands(demands) {
  const rejected = [];
  const accepted = [];
  const list = Array.isArray(demands) ? demands : [];
  const idOf = (d) => (d && typeof d === "object" && d.id !== undefined && d.id !== null && d.id !== "" ? String(d.id) : null);
  const idCount = list.reduce((map, d) => { const id = idOf(d); return id === null ? map : map.set(id, (map.get(id) || 0) + 1); }, new Map());
  list.forEach((d, index) => {
    const id = idOf(d);
    const reject = (reason, message) => rejected.push({ demandId: id, index, reason, message });
    if (!d || typeof d !== "object") return reject("invalid-demand", "Not a demand object.");
    if (id === null) return reject("missing-id", "A demand needs a stable id.");
    // every copy is rejected: keeping "the first" would make the result depend on input order
    if (idCount.get(id) > 1) return reject("duplicate-id", `Demand id ${id} appears ${idCount.get(id)} times — each demand must be covered exactly once, so none of them is allocated.`);
    if (d.kind !== undefined && d.kind !== "linear") return reject("not-linear", `Only linear demands are cut-allocated (got ${d.kind}).`);
    if (d.lengthKind === LENGTH_KINDS.TIGHT) return reject("not-finished-length", "A tight (measured) length still needs its allowance — allocation needs the finished cut length.");
    if (!ALLOCATABLE_LENGTH_KINDS.has(d.lengthKind)) return reject("invalid-length-kind", `Unknown length kind ${d.lengthKind}.`);
    if (!positive(d.lengthMm)) return reject("invalid-length", "The required length must be a number greater than 0 (and shorter than 1,000 km).");
    if (!Number.isInteger(d.quantity) || d.quantity < 0) return reject("invalid-quantity", "Quantity must be a whole number of 0 or more.");
    if (!validIdentity(d.identity)) return reject("missing-identity", "No procurement identity — compatible stock cannot be known, so it is never pooled.");
    const ordered = d.lengthKind === ORDERED_STOCK;
    const bad = stockPolicyProblem(d.stockPolicy);
    if (bad && !ordered) return reject(bad.code, bad.message);
    accepted.push({ d, id, ordered, policy: bad ? null : normalisePolicy(d.stockPolicy) });
  });
  const total = accepted.reduce((a, x) => a + x.d.quantity, 0);
  if (total > MAX_CUTS) {
    for (const x of accepted) rejected.push({ demandId: x.id, index: null, reason: "limit-exceeded", message: `${total} pieces exceeds the ${MAX_CUTS}-piece limit — split the takeoff.` });
    return { groups: [], rejected, total };
  }
  const groups = new Map();
  for (const { d, id, ordered, policy } of accepted) {
    if (!d.quantity) continue; // nothing to cover
    const iKey = identityKey(d.identity);
    const unit = d.unit ?? null; // the purchase unit is part of purchase identity (contract): never pooled across units
    const key = `${iKey}\u0001${identityKey(unit)}\u0001${identityKey(policy)}`;
    if (!groups.has(key)) groups.set(key, { key, identityKey: iKey, identity: d.identity, unit, policy, cuts: [] });
    const g = groups.get(key);
    for (let q = 1; q <= d.quantity; q++) {
      g.cuts.push({ demandId: id, cutId: demandId(id, q), lengthMm: d.lengthMm, label: d.label ?? id, ordered, joinsAllowed: d.noSplice === false });
    }
  }
  return { groups: [...groups.values()].sort((a, b) => byText(a.key, b.key)), rejected, total };
}

/**
 * Validate existing offcuts and expand quantities; sorted by length then id (smallest first = best fit).
 * Order-independent: the same record listed twice counts once; two DIFFERENT records sharing an id, or whose
 * expanded ids collide ("X" × 2 → X:1, X:2 vs a record "X:1"), are all ignored — never guessed, never double counted.
 */
function prepareOffcuts(offcuts, problems) {
  const valid = [];
  const ignore = (id, why, index) => problems.push(problem("allocation_offcut_invalid", `Existing offcut ${id ?? `#${index + 1}`} ignored: ${why}`, { blocking: false, refs: [{ offcutId: id }] }));
  const unset = (v) => v === undefined || v === null;
  (Array.isArray(offcuts) ? offcuts : []).forEach((o, index) => {
    const id = isPlainObject(o) && o.id !== undefined && o.id !== null && o.id !== "" ? String(o.id) : null;
    if (id === null) return ignore(null, "it needs an id.", index);
    if (!positive(o.lengthMm)) return ignore(id, "its measured length must be greater than 0.");
    if (!validIdentity(o.identity)) return ignore(id, "its profile/finish identity is missing.");
    const quantity = o.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1) return ignore(id, "quantity must be a whole number of 1 or more.");
    if (!(unset(o.endTrimMm) || nonNegative(o.endTrimMm)) || !(unset(o.finalEndAcceptable) || typeof o.finalEndAcceptable === "boolean")) return ignore(id, "its end conditions are invalid.");
    const rec = { id, quantity, lengthMm: o.lengthMm, identityKey: identityKey(o.identity), label: o.label ?? null,
      endTrimMm: o.endTrimMm ?? undefined, finalEndAcceptable: o.finalEndAcceptable ?? undefined };
    valid.push({ ...rec, sig: identityKey(rec) });
  });
  const byId = new Map();
  for (const r of valid) byId.set(r.id, [...(byId.get(r.id) || []), r]);
  const records = [];
  for (const [id, copies] of [...byId].sort((a, b) => byText(a[0], b[0]))) {
    if (copies.some((c) => c.sig !== copies[0].sig)) ignore(id, `${copies.length} different offcuts share this id — none is used.`);
    else {
      if (copies.length > 1) ignore(id, `listed ${copies.length} times — counted once; an offcut is never counted twice.`);
      records.push(copies[0]);
    }
  }
  const expand = (r) => Array.from({ length: r.quantity }, (_, q) => (r.quantity === 1 ? r.id : demandId(r.id, q + 1)));
  const owners = new Map();
  for (const r of records) for (const oid of expand(r)) owners.set(oid, [...(owners.get(oid) || []), r.id]);
  const clash = new Set([...owners.values()].filter((ids) => ids.length > 1).flat());
  const out = [];
  for (const r of records) {
    if (clash.has(r.id)) { ignore(r.id, "its piece ids collide with another offcut's — rename one; neither is used."); continue; }
    if (out.length + r.quantity > MAX_CUTS) { ignore(r.id, `more than ${MAX_CUTS} offcut pieces.`); continue; }
    for (const offcutId of expand(r)) {
      out.push({ offcutId, sourceId: r.id, lengthMm: r.lengthMm, identityKey: r.identityKey, label: r.label ?? offcutId,
        endTrimMm: r.endTrimMm, finalEndAcceptable: r.finalEndAcceptable });
    }
  }
  return out.sort((a, b) => a.lengthMm - b.lengthMm || byText(a.offcutId, b.offcutId));
}

// ── the packing model ─────────────────────────────────────────────────────────

/** Smallest permitted new stock that one piece passes simulation in (one-per-piece mode). */
function smallestFittingStock(L, pol, k, t, fea) {
  for (const s of stockLengthsFrom(L, pol)) {
    if (fitsLoad(s - t, fea, 1, L, k)) return s;
    if (s > L + t + k + EPS_MM) return null; // unreachable for valid input: such a length always fits
  }
  return null;
}

/** First index of ascending P with P[x] ≥ v − EPS_MM (P.length when none). */
function lowerIndex(P, v) {
  let lo = 0, hi = P.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (P[mid] >= v - EPS_MM) hi = mid; else lo = mid + 1; }
  return lo;
}

/**
 * Smallest permitted length (ascending m.P) in which a shared bar's load fits, or null. Fitting is NOT monotone
 * in length: with an acceptable final end a load can fill a shorter length exactly yet need one more kerf than a
 * slightly longer one offers, so "fits the longest" is not the feasibility test — this is.
 */
function shrinkLen(m, n, sum) {
  const { P, t, fea, k } = m;
  const loose = lowerIndex(P, sum + n * k + t); // every s from here fits with a separating cut per piece
  let best = loose < P.length ? P[loose] : null;
  if (fea && n > 0) {
    const target = sum + (n - 1) * k + t;
    const x = lowerIndex(P, target);
    if (x < P.length && P[x] <= target + EPS_MM && (best === null || P[x] < best)) best = P[x];
  }
  return best;
}

/** Objective of a plan: { len, nb, oc, rem } (see header). */
function objectiveOf(m, bins) {
  let len = 0, nb = 0, oc = 0;
  const rem = [];
  const used = new Set();
  for (const b of bins) {
    if (b.kind === NEW) { len += b.len; nb++; rem.push(residualOf(b.len - m.t, m.fea, b.n, b.sum, m.k)); }
    else { const o = m.offcuts[b.off]; oc++; used.add(b.off); rem.push(residualOf(o.cap, o.fea, b.n, b.sum, m.k)); }
  }
  m.offcuts.forEach((o, j) => { if (!used.has(j)) rem.push(o.lengthMm); });
  rem.sort((a, b) => b - a);
  return { len, nb, oc, rem };
}

/** Lexicographic prefix (len, nb, oc) comparison; <0 means a is better. */
function cmpPrefix(a, b) {
  if (a.len < b.len - EPS_MM) return -1;
  if (a.len > b.len + EPS_MM) return 1;
  if (a.nb !== b.nb) return a.nb < b.nb ? -1 : 1;
  if (a.oc !== b.oc) return a.oc < b.oc ? -1 : 1;
  return 0;
}

/** Full objective comparison; remainders compared largest-first, larger better. */
function cmpObjective(a, b) {
  const c = cmpPrefix(a, b);
  if (c) return c;
  for (let i = 0; i < Math.max(a.rem.length, b.rem.length); i++) {
    const x = a.rem[i] ?? 0, y = b.rem[i] ?? 0;
    if (x > y + EPS_MM) return -1;
    if (x < y - EPS_MM) return 1;
  }
  return 0;
}

/**
 * T6 first-fit-decreasing: pieces longest first; each goes to the earliest stock with capacity — existing
 * offcuts (shortest first), then new bars in opening order — otherwise opens the shortest permitted new
 * stock that fits it.
 */
function firstFitDecreasing(m) {
  const bins = [];
  const offBin = m.offcuts.map(() => -1);
  const unavailable = [];
  const add = (b, i) => { b.n++; b.sum += m.items[i].lengthMm; b.items.push(i); };
  for (let i = 0; i < m.items.length; i++) {
    const L = m.items[i].lengthMm;
    let target = null;
    for (let j = 0; j < m.offcuts.length && !target; j++) {
      const o = m.offcuts[j];
      const b = offBin[j] < 0 ? null : bins[offBin[j]];
      if (!b && fitsLoad(o.cap, o.fea, 1, L, m.k)) { offBin[j] = bins.length; target = { kind: OFFCUT, off: j, len: o.lengthMm, n: 0, sum: 0, items: [] }; bins.push(target); }
      else if (b && b.n < m.maxPieces && fitsLoad(o.cap, o.fea, b.n + 1, b.sum + L, m.k)) target = b;
    }
    // one-per-piece: an opened bar is already full, so only shared modes scan them (keeps 50,000 cuts linear)
    for (let b = 0; m.maxPieces > 1 && b < bins.length && !target; b++) {
      const bin = bins[b];
      if (bin.kind === NEW && bin.n < m.maxPieces && fitsLoad(bin.len - m.t, m.fea, bin.n + 1, bin.sum + L, m.k)) target = bin;
    }
    if (!target && m.newCost[i] !== null) { target = { kind: NEW, off: -1, len: m.newCost[i], n: 0, sum: 0, items: [] }; bins.push(target); }
    if (target) add(target, i);
    else unavailable.push(i);
  }
  return { bins, unavailable };
}

/** Deterministic bounded branch-and-bound over the model; never returns a plan worse than `initial`. */
function branchAndBound(m, initial, budget) {
  const { items, k, t, fea, offcuts, newCost, mode } = m;
  const n = items.length;
  const len = items.map((it) => it.lengthMm);
  const w = len.map((L) => L + k);
  const suffixW = new Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffixW[i] = suffixW[i + 1] + w[i];
  const newCap = mode === SHARED_SINGLE ? (m.S === null ? null : m.S - t) : mode === SHARED_MULTI ? m.P[m.P.length - 1] - t : null;
  const newWcap = newCap === null ? 0 : newCap + (fea ? k : 0);
  // pieces that can never share a new bar with each other (sorted longest first ⇒ a prefix)
  let bigCount = 0;
  if (mode === SHARED_SINGLE) while (bigCount < n && w[bigCount] > (newWcap + EPS_MM) / 2) bigCount++;
  const newResidualUB = newCap !== null ? newCap : newCost.reduce((a, c) => (c === null ? a : Math.max(a, c - t)), 0);

  const bins = [];
  const offUsed = offcuts.map(() => false);
  const binOf = new Array(n).fill(0);
  let nb = 0, oc = 0, newLen = 0, nodes = 0, exhausted = false, stockOnly = true, limited = false;
  let best = { plan: initial, obj: objectiveOf(m, initial.bins) };

  const wMin = () => w[n - 1];
  /** Can piece length L join open bin `bin`? (shared-multi new bars: some permitted length must hold the load) */
  const canAdd = (bin, L) => bin.n < bin.max && (bin.kind === NEW && mode === SHARED_MULTI
    ? shrinkLen(m, bin.n + 1, bin.sum + L) !== null : fitsLoad(bin.cap, bin.fea, bin.n + 1, bin.sum + L, k));
  // one-per-piece bound: each unused offcut holds at most one piece; `reach` is the longest single piece it could
  // hold (relaxed: the exact final-end fit counts as reachable), so the offcut sets of shorter pieces are nested
  const reach = offcuts.map((o) => (o.fea ? o.cap : o.cap - k));
  const reachOrder = offcuts.map((_, j) => j).sort((a, b) => reach[b] - reach[a] || a - b);
  const costValues = uniqSorted(newCost.map((c) => c ?? 0)); // an unbuyable piece counts 0 (a valid relaxation)
  const costIndex = new Map(costValues.map((v, x) => [v, x]));
  const costSlot = newCost.map((c) => costIndex.get(c ?? 0));
  const costCount = new Array(costValues.length).fill(0);
  function singleExtraBars(i) {
    let absorb = 0, absorbBig = 0;
    const minBigW = bigCount > i ? w[bigCount - 1] : Infinity;
    const take = (free) => {
      if (free < wMin() - EPS_MM) return;
      absorb += free;
      if (minBigW !== Infinity) absorbBig += Math.floor((free + EPS_MM) / minBigW);
    };
    for (const b of bins) if (b.n < b.max) take(b.cap + (b.fea ? k : 0) - (b.sum + b.n * k));
    offcuts.forEach((o, j) => { if (!offUsed[j]) take(o.wcap); });
    const extra = suffixW[i] - absorb;
    let bars = extra > EPS_MM ? (newWcap > EPS_MM ? ceilTol(extra / newWcap) : Infinity) : 0;
    if (bigCount > i) bars = Math.max(bars, bigCount - i - absorbBig);
    return bars;
  }
  /**
   * One-per-piece lower bound for pieces i… in O(n + offcuts): pieces no unused offcut can reach must be bought;
   * of the rest at most `matched` (maximum matching, longest first — exact for nested sets) avoid new stock,
   * so at least flex − matched are bought, costing at least the cheapest that many.
   */
  function perItemExtra(i) {
    let bars = 0, length = 0, avail = 0, matched = 0, flex = 0, p = 0;
    costCount.fill(0);
    for (let r = i; r < n; r++) { // pieces are sorted longest first, so `avail` only grows
      while (p < reachOrder.length && reach[reachOrder[p]] >= len[r] - EPS_MM) { if (!offUsed[reachOrder[p]]) avail++; p++; }
      if (avail === 0) { bars++; length += newCost[r] ?? Infinity; continue; }
      flex++;
      costCount[costSlot[r]]++;
      if (avail > matched) matched++;
    }
    let buy = flex - matched;
    bars += buy;
    for (let x = 0; x < costValues.length && buy > 0; x++) { const take = Math.min(buy, costCount[x]); length += take * costValues[x]; buy -= take; }
    return { bars, len: length };
  }
  function fitsExisting(i) {
    for (const b of bins) if (canAdd(b, len[i])) return true;
    return offcuts.some((o, j) => !offUsed[j] && fitsLoad(o.cap, o.fea, 1, len[i], k));
  }
  function lowerBound(i) {
    if (mode === SHARED_SINGLE) { const bars = singleExtraBars(i); return { len: newLen + (bars === 0 ? 0 : m.S === null ? Infinity : bars * m.S), nb: nb + bars, oc }; }
    if (mode === SHARED_MULTI) return fitsExisting(i) ? { len: newLen, nb, oc } : { len: newLen + (newCost[i] ?? Infinity), nb: nb + 1, oc };
    const e = perItemExtra(i);
    return { len: newLen + e.len, nb: nb + e.bars, oc };
  }
  function remainderUpperBound() {
    let ub = 0;
    for (const b of bins) ub = Math.max(ub, residualOf(b.cap, b.fea, b.n, b.sum, k));
    offcuts.forEach((o, j) => { if (!offUsed[j]) ub = Math.max(ub, o.lengthMm); });
    if (nb < best.obj.nb) ub = Math.max(ub, newResidualUB);
    return ub;
  }
  function place(i, b) {
    const bin = bins[b];
    const prev = bin.len;
    bin.n++; bin.sum += len[i]; bin.items.push(i); binOf[i] = b;
    if (bin.kind === NEW && mode === SHARED_MULTI) { bin.len = shrinkLen(m, bin.n, bin.sum); newLen += bin.len - prev; }
    return prev;
  }
  function unplace(i, b, prev) {
    const bin = bins[b];
    bin.n--; bin.sum -= len[i]; bin.items.pop();
    if (bin.kind === NEW && mode === SHARED_MULTI) { newLen += prev - bin.len; bin.len = prev; }
  }
  function openBin(bin) { bins.push(bin); if (bin.kind === NEW) { nb++; newLen += bin.len; } else { oc++; offUsed[bin.off] = true; } }
  function closeBin() { const bin = bins.pop(); if (bin.kind === NEW) { nb--; newLen -= bin.len; } else { oc--; offUsed[bin.off] = false; } }
  function tryBin(i, b, d) { const prev = place(i, b); dfs(i + 1, d); unplace(i, b, prev); }

  // d = discrepancies left: the first (heuristic) branch is free, every later branch costs one
  function dfs(i, d) {
    if (exhausted) return;
    if (nodes >= budget) { exhausted = true; return; }
    nodes++;
    if (i === n) {
      const obj = objectiveOf(m, bins);
      if (cmpObjective(obj, best.obj) < 0) best = { plan: { bins: bins.map((b) => ({ kind: b.kind, off: b.off, len: b.len, n: b.n, sum: b.sum, items: [...b.items] })) }, obj };
      return;
    }
    const lb = lowerBound(i);
    if (stockOnly) { // phase 1: only a strictly smaller purchase (length, then bars) is worth exploring
      if (cmpPrefix({ ...lb, oc: 0 }, { ...best.obj, oc: 0 }) >= 0) return;
    } else {
      const c = cmpPrefix(lb, best.obj);
      if (c > 0 || (c === 0 && remainderUpperBound() < (best.obj.rem[0] ?? 0) - EPS_MM)) return;
    }
    const L = len[i];
    let taken = 0;
    const allowed = () => { if (taken > 0 && d <= 0) { limited = true; return false; } return true; };
    const next = () => (taken++ ? d - 1 : d);
    // identical pieces are interchangeable: place them in non-decreasing bar order
    const minBin = i > 0 && L === len[i - 1] ? binOf[i - 1] : 0;
    const seen = new Set();
    for (let b = minBin; b < bins.length; b++) {
      const bin = bins[b];
      if (!canAdd(bin, L)) continue;
      const sig = `${bin.cls}|${bin.n}|${bin.sum}`; // equivalent bars: try only the first
      if (seen.has(sig)) continue;
      seen.add(sig);
      if (!allowed()) return;
      tryBin(i, b, next());
      if (exhausted) return;
    }
    const seenClass = new Set();
    for (let j = 0; j < offcuts.length; j++) {
      const o = offcuts[j];
      if (offUsed[j] || seenClass.has(o.cls)) continue;
      seenClass.add(o.cls); // identical unused offcuts: try only the first
      if (!fitsLoad(o.cap, o.fea, 1, L, k)) continue;
      if (!allowed()) return;
      openBin({ kind: OFFCUT, off: j, cap: o.cap, fea: o.fea, max: m.maxPieces, n: 0, sum: 0, len: o.lengthMm, cls: `o${o.cls}`, items: [] });
      tryBin(i, bins.length - 1, next());
      closeBin();
      if (exhausted) return;
    }
    if (newCost[i] !== null && allowed()) {
      const perItem = mode === ONE_PER_PIECE;
      const stock = perItem ? newCost[i] : mode === SHARED_SINGLE ? m.S : 0; // shared-multi: length set by shrinkLen
      openBin({ kind: NEW, off: -1, cap: perItem ? newCost[i] - t : newCap, fea, max: m.maxPieces, n: 0, sum: 0, len: stock, cls: perItem ? `n${bins.length}` : "n", items: [] });
      tryBin(i, bins.length - 1, next());
      closeBin();
    }
  }
  /** Limited-discrepancy passes (find improvements early), then an unlimited pass; true when exhaustive. */
  function search() {
    for (const d of DISCREPANCY_SCHEDULE) {
      limited = false;
      dfs(0, d);
      if (exhausted) return false;
      if (!limited) return true;
    }
    return false;
  }

  // root lower bound on the primary objective (before any placement)
  let rootLen, rootBars;
  if (mode === SHARED_SINGLE) { rootBars = n ? singleExtraBars(0) : 0; rootLen = rootBars === 0 ? 0 : rootBars * m.S; }
  else if (mode === SHARED_MULTI) {
    const offW = offcuts.reduce((a, o) => a + (n && o.wcap >= wMin() - EPS_MM ? o.wcap : 0), 0);
    const forcedCost = len.reduce((a, L, i) => (offcuts.some((o) => fitsLoad(o.cap, o.fea, 1, L, k)) ? a : Math.max(a, newCost[i])), 0);
    const wNew = suffixW[0] - offW;
    const byWeight = wNew > EPS_MM ? wNew - n * Math.max(0, (fea ? k : 0) - t) : 0;
    rootLen = Math.max(byWeight, forcedCost);
    rootBars = rootLen > EPS_MM ? 1 : 0;
  } else { const e = n ? perItemExtra(0) : { bars: 0, len: 0 }; rootBars = e.bars; rootLen = e.len; }

  // phase 1 proves the minimum purchase; phase 2 spends the rest of the budget on offcuts used + remainders
  const searched = n > 0 && n <= MAX_SEARCH_PIECES;
  const stockComplete = n === 0 || (searched && search());
  stockOnly = false;
  const complete = n === 0 || (stockComplete && searched && search());
  return { best, rootLen, rootBars, nodes, stockComplete, complete, skipped: n > MAX_SEARCH_PIECES };
}

// ── one group ─────────────────────────────────────────────────────────────────

const byLengthDesc = (a, b) => b.lengthMm - a.lengthMm || byText(a.cutId, b.cutId);

function hashKey(str) { // FNV-1a 32-bit, for short stable group ids
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

function allocateGroup(g, groupId, pool, nodeBudget) {
  const pol = g.policy;
  const problems = [];
  const unavailable = [];
  const explain = [];
  const orderedCuts = g.cuts.filter((c) => c.ordered).sort(byLengthDesc);
  const items0 = g.cuts.filter((c) => !c.ordered).sort(byLengthDesc);
  const k = pol ? pol.kerfMm ?? 0 : 0;
  const t = pol ? pol.endTrimMm : 0;
  const fea = pol ? pol.finalEndAcceptable : false;

  let mode = ONE_PER_PIECE, S = null, P = null;
  const permitted = pol ? permittedStockLengths(pol) : [];
  if (pol && pol.sharePieces) {
    if (permitted === null) problems.push(problem("allocation_share_needs_max", "Pieces are not shared: this stock grid has no longest available length. Set the product maximum to allow a cut plan.", { blocking: false }));
    else if (permitted.length > 1) { mode = SHARED_MULTI; P = permitted; }
    else { mode = SHARED_SINGLE; S = permitted[0] ?? null; }
  }
  const singleLength = mode === SHARED_SINGLE || (mode === ONE_PER_PIECE && permitted !== null && permitted.length === 1);
  const offered = pool.filter((o) => o.identityKey === g.identityKey);
  const offcuts = offered.map((o) => {
    const trim = o.endTrimMm ?? t, ofea = o.finalEndAcceptable ?? fea, cap = o.lengthMm - trim;
    return { ...o, trim, cap, fea: ofea, wcap: cap + (ofea ? k : 0), cls: `${o.lengthMm}|${trim}|${ofea}` };
  });
  const costFor = (L) => (mode === SHARED_SINGLE ? (S !== null && fitsLoad(S - t, fea, 1, L, k) ? S : null)
    : mode === SHARED_MULTI ? shrinkLen({ P, t, fea, k }, 1, L) : smallestFittingStock(L, pol, k, t, fea));

  const base = { k, t, fea, mode, S, P, offcuts, maxPieces: mode === ONE_PER_PIECE ? 1 : Infinity };
  const m0 = { ...base, items: items0, newCost: items0.map((c) => costFor(c.lengthMm)) };
  const first = firstFitDecreasing(m0);
  const unplaced = new Set(first.unavailable);
  const why = (c) => {
    if (offcuts.some((o) => fitsLoad(o.cap, o.fea, 1, c.lengthMm, k))) {
      return ["offcuts-exhausted", `${c.lengthMm} mm cannot be cut from new stock, and the existing offcuts that could hold it are used by longer pieces.`];
    }
    if (c.joinsAllowed) { // 05: a permitted joint still needs a joint rule / positions from the method — never joined here
      return ["needs-joint-detail", `${c.lengthMm} mm is longer than the usable stock. Joins are allowed, but no joint rule or positions are set — the allocator never joins pieces.`];
    }
    const sel = selectStock(c.lengthMm, pol);
    if (sel.stockMm !== null) {
      return ["end-policy", `${c.lengthMm} mm does not fit the ${sel.stockMm} mm stock once end trim, saw kerf and the end condition are applied — not split; change the end policy or choose a longer stock.`];
    }
    return [sel.reason === "no-available-length" ? "no-available-length" : "exceeds-stock",
      `${c.lengthMm} mm cannot be cut from any compatible stock (${sel.message}) — never split; revise the detail or choose a supplier-confirmed longer stock.`];
  };
  for (const i of first.unavailable) {
    const c = items0[i];
    const [reason, message] = why(c);
    unavailable.push({ demandId: c.demandId, cutId: c.cutId, lengthMm: c.lengthMm, reason, message });
  }
  const items = items0.filter((_, i) => !unplaced.has(i));
  const m = { ...base, items, newCost: items.map((c) => costFor(c.lengthMm)) };
  const initial = firstFitDecreasing(m);
  const search = branchAndBound(m, initial, nodeBudget);
  const { plan, obj } = search.best;
  const initialObj = objectiveOf(m, initial.bins);

  // emit bars: offcut bars (shortest offcut first), then new bars in opening order; cuts longest first
  const refsOf = (list) => list.map((c) => ({ demandId: c.demandId, cutId: c.cutId }));
  const bars = [];
  const binOrder = [...plan.bins.filter((b) => b.kind === OFFCUT).sort((a, b) => a.off - b.off), ...plan.bins.filter((b) => b.kind === NEW)];
  let seq = 0;
  const pushBar = (source, offcut, stockLengthMm, cuts, opts, orderedStock = false) => {
    const sim = simulateBar(stockLengthMm, cuts.map((c) => c.lengthMm), opts);
    if (!sim.fits) problems.push(problem("allocation_internal", `Cut plan failed re-simulation on a ${stockLengthMm} mm piece — not order-ready.`, { refs: refsOf(cuts) }));
    const residual = sim.fits ? sim.residualMm : 0;
    const threshold = pol ? pol.minRetainedOffcutMm : null;
    bars.push({
      id: source === OFFCUT ? demandId(groupId, "offcut", offcut.offcutId) : demandId(groupId, "bar", String(++seq).padStart(2, "0")),
      source, offcutId: offcut ? offcut.offcutId : null, offcutLabel: offcut ? offcut.label : null, stockLengthMm,
      cuts: cuts.map((c, x) => ({ demandId: c.demandId, cutId: c.cutId, lengthMm: c.lengthMm, label: c.label,
        startMm: sim.sequence[x]?.startMm ?? null, endMm: sim.sequence[x]?.endMm ?? null, kerfAfterMm: sim.sequence[x]?.kerfMm ?? null, usesFinalEnd: sim.sequence[x]?.usesFinalEnd ?? false })),
      // the end condition this bar was simulated under (11: usable-end flags; lets the server re-simulate)
      endCondition: { kerfMm: opts.kerfMm, endTrimMm: opts.endTrimMm, finalEndAcceptable: opts.finalEndAcceptable },
      kerfLossMm: sim.kerfLossMm, trimLossMm: sim.trimLossMm, residualMm: residual,
      residualUsable: threshold === null ? null : residual > EPS_MM && residual >= threshold - EPS_MM,
      residualStatus: "planned", // a planned remainder is not on-hand stock until the cut is confirmed
      ordered: orderedStock,
    });
  };
  for (const b of binOrder) {
    const cuts = [...b.items].sort((x, y) => x - y).map((i) => items[i]);
    if (b.kind === OFFCUT) { const o = offcuts[b.off]; pushBar(OFFCUT, o, o.lengthMm, cuts, { kerfMm: k, endTrimMm: o.trim, finalEndAcceptable: o.fea }); }
    else pushBar(NEW, null, b.len, cuts, { kerfMm: k, endTrimMm: t, finalEndAcceptable: fea });
  }
  // orderedStock: the user already knows the stock length to buy — bypasses selection, packing and kerf
  for (const c of orderedCuts) pushBar(NEW, null, c.lengthMm, [c], { kerfMm: 0, endTrimMm: 0, finalEndAcceptable: true }, true);
  const usedOffcutIds = new Set(bars.filter((b) => b.source === OFFCUT).map((b) => b.offcutId));
  for (const o of offered) if (usedOffcutIds.has(o.offcutId)) pool.splice(pool.indexOf(o), 1);

  const orderedLen = orderedCuts.reduce((a, c) => a + c.lengthMm, 0);
  const newBars = bars.filter((b) => b.source === NEW);
  const purchasedLengthMm = newBars.reduce((a, b) => a + b.stockLengthMm, 0);
  const proven = search.stockComplete || (singleLength ? obj.nb <= search.rootBars : obj.len <= search.rootLen + EPS_MM);
  const objectiveKind = singleLength ? "min-new-bars" : "min-purchased-length";
  const purchase = [...newBars.reduce((map, b) => map.set(b.stockLengthMm, (map.get(b.stockLengthMm) || 0) + 1), new Map())]
    .sort((a, b) => b[0] - a[0]).map(([stockLengthMm, quantity]) => ({ stockLengthMm, quantity }));

  // problems + status
  if (unavailable.length) {
    problems.push(problem("allocation_unavailable", `${plural(unavailable.length, "piece")} cannot be cut from any compatible stock — no splice; `
      + "revise the detail or choose a supplier-confirmed longer stock.", { refs: refsOf(unavailable) }));
  }
  const lossMatters = items.length > 0 && (mode !== ONE_PER_PIECE || offcuts.length > 0 || k > 0 || t > 0);
  // 11: an estimate may use an ENTERED zero; purchase-ready needs a kerf value AND explicit confirmation
  const lossUnconfirmed = lossMatters && pol && (!pol.kerfConfirmed || pol.kerfMm === null);
  if (lossUnconfirmed) {
    problems.push(problem("allocation_loss_unconfirmed", `${pol.kerfMm === null ? "No saw kerf entered — this estimate uses 0 mm. Enter the kerf (0 if none)"
      : `Saw kerf ${pol.kerfMm} mm is not confirmed — an estimate only. Confirm the cutting-loss policy`} before ordering.`, { blocking: false }));
  }
  if (mode === ONE_PER_PIECE && pol) {
    const stepped = items.filter((c, i) => m.newCost[i] !== null && m.newCost[i] !== selectStock(c.lengthMm, pol).stockMm);
    if (stepped.length) {
      problems.push(problem("allocation_stock_stepped", `${plural(stepped.length, "piece")} needed the next stock length because end trim / saw kerf `
        + "did not fit in the grid length.", { blocking: false, refs: refsOf(stepped) }));
    }
  }
  if (!proven) problems.push(problem("allocation_not_proven", "Best plan found — minimum not proven.", { blocking: false }));

  // T6: a shared plan is always a "suggested cut plan"; 11: say honestly whether the minimum was proven
  const planLabel = mode === ONE_PER_PIECE ? "One stock piece per member" : proven ? "Suggested cut plan — minimum stock proven" : "Suggested cut plan — best plan found, minimum not proven";
  const objectiveText = singleLength ? "Minimise new bars, then existing offcuts used, then favour fewer/larger remainders."
    : "Minimise total purchased length, then bar count, then existing offcuts used, then favour fewer/larger remainders (no current prices).";
  const buy = purchase.map((p) => `${p.quantity} × ${p.stockLengthMm} mm`).join(", ") || "nothing new";
  explain.push(`Buy ${buy}${usedOffcutIds.size ? `; use ${plural(usedOffcutIds.size, "existing offcut")}` : ""}.`, `Objective: ${objectiveText}`);
  if (mode !== ONE_PER_PIECE) {
    const skipped = search.skipped ? `; search skipped above ${MAX_SEARCH_PIECES} pieces` : "";
    explain.push(`First-fit-decreasing start: ${plural(initialObj.nb + orderedCuts.length, "new bar")}; `
      + `branch-and-bound result: ${plural(obj.nb + orderedCuts.length, "new bar")} (${search.nodes} of ${nodeBudget} nodes${skipped}).`);
  }
  explain.push(proven ? "Minimum new stock proven for this objective." : "Best plan found — minimum not proven.");

  const sum = (f) => bars.reduce((a, b) => a + f(b), 0);
  const remainderMm = sum((b) => b.residualMm);
  const threshold = pol ? pol.minRetainedOffcutMm : null;
  return {
    id: groupId, identityKey: g.identityKey, identity: g.identity, unit: g.unit, policy: pol, mode,
    bars, unavailable, purchase,
    objective: { kind: objectiveKind, text: objectiveText, purchasedLengthMm, newBars: newBars.length, offcutsUsed: usedOffcutIds.size, remaindersMm: obj.rem },
    initialBarCount: initialObj.nb + orderedCuts.length, initialPurchasedLengthMm: initialObj.len + orderedLen,
    barCount: newBars.length,
    lowerBound: singleLength ? search.rootBars + orderedCuts.length : search.rootLen + orderedLen,
    lowerBoundUnit: singleLength ? "bars" : "mm",
    proven, searchComplete: search.complete, searchNodes: search.nodes, nodeBudget, planLabel,
    // never "ready" while any blocking problem stands (e.g. a bar that failed re-simulation)
    procurement: unavailable.length ? "unavailable-stock" : lossUnconfirmed || problems.some((p) => p.blocking) ? "draft" : "ready",
    problems, explain,
    totals: {
      cuts: g.cuts.length, allocatedCuts: g.cuts.length - unavailable.length, unavailableCuts: unavailable.length,
      requiredLengthMm: sum((b) => b.cuts.reduce((a, c) => a + c.lengthMm, 0)), purchasedLengthMm, offcutLengthUsedMm: sum((b) => (b.source === OFFCUT ? b.stockLengthMm : 0)),
      cutLossMm: sum((b) => b.kerfLossMm), trimLossMm: sum((b) => b.trimLossMm), remainderMm,
      reusableRemainderMm: threshold === null ? null : sum((b) => (b.residualUsable ? b.residualMm : 0)),
      scrapMm: threshold === null ? null : sum((b) => (b.residualUsable ? 0 : b.residualMm)),
    },
  };
}

/**
 * Allocate linear demands to stock (11 shared allocation contract). Quantities expand to unique cut ids
 * (`<demandId>:<n>`); groups are identity + unit + policy; existing offcuts serve only their own identity and are
 * offered to groups in key order, each used at most once. Deterministic for the same inputs in any order: a
 * duplicated demand id rejects every copy; conflicting offcut records sharing an id are all ignored.
 * @param {Array<object>} demands  contract Demands: { id, lengthMm, quantity, identity, stockPolicy, unit?, label?,
 *   lengthKind? (cut | finished | orderedStock; tight is rejected), noSplice? }
 * @param {{ existingOffcuts?: Array<{ id: string, lengthMm: number, identity: object, label?: string, quantity?: number,
 *   endTrimMm?: number, finalEndAcceptable?: boolean }>, nodeBudget?: number }} [opts]
 * @returns {{ groups: Array<object>, rejected: Array<{ demandId: string|null, index: number|null, reason: string, message: string }>,
 *   unusedOffcuts: Array<{ offcutId: string, lengthMm: number, label: string }>, problems: object[], totals: object }}
 *   Each group: { id, identityKey, identity, unit, policy, mode, bars[{ id, source "new"|"offcut", offcutId, offcutLabel,
 *   stockLengthMm, cuts[{ demandId, cutId, lengthMm, label, startMm, endMm, kerfAfterMm, usesFinalEnd }],
 *   endCondition{ kerfMm, endTrimMm, finalEndAcceptable }, kerfLossMm,
 *   trimLossMm, residualMm, residualUsable (null = no keep-from threshold), residualStatus "planned", ordered }],
 *   unavailable[{ demandId, cutId, lengthMm, reason, message }], purchase[{ stockLengthMm, quantity }],
 *   objective, initialBarCount, barCount, lowerBound, lowerBoundUnit, proven, searchComplete, searchNodes,
 *   nodeBudget, planLabel, procurement, problems, explain, totals }. barCount counts NEW stock only.
 */
export function allocateLinear(demands, opts) {
  const { existingOffcuts = [], nodeBudget = DEFAULT_NODE_BUDGET } = opts ?? {};
  const problems = [];
  const budget = Number.isInteger(nodeBudget) && nodeBudget >= 0 ? nodeBudget : DEFAULT_NODE_BUDGET;
  const { groups, rejected, total } = prepareDemands(demands);
  if (rejected.length) problems.push(problem("allocation_demand_rejected", `${plural(rejected.length, "demand")} could not be allocated — see the rejected list.`, { refs: rejected.map((r) => ({ demandId: r.demandId })) }));
  const pool = prepareOffcuts(existingOffcuts, problems);
  const identityCounts = groups.reduce((map, g) => map.set(g.identityKey, (map.get(g.identityKey) || 0) + 1), new Map());
  if ([...identityCounts.values()].some((c) => c > 1)) problems.push(problem("allocation_identity_split", "The same material appears with different units, stock or cutting settings — those pieces are allocated separately.", { blocking: false }));
  const usedIds = new Set();
  const out = groups.map((g) => {
    let id = `grp-${hashKey(g.key)}`;
    for (let n = 2; usedIds.has(id); n++) id = `grp-${hashKey(g.key)}-${n}`;
    usedIds.add(id);
    return allocateGroup(g, id, pool, budget);
  });
  const add = (f) => out.reduce((a, g) => a + f(g), 0);
  return {
    groups: out,
    rejected,
    unusedOffcuts: pool.map((o) => ({ offcutId: o.offcutId, lengthMm: o.lengthMm, label: o.label })),
    problems,
    totals: { groups: out.length, cuts: total, allocatedCuts: add((g) => g.totals.allocatedCuts), unavailableCuts: add((g) => g.totals.unavailableCuts),
      rejectedDemands: rejected.length, newBars: add((g) => g.barCount), offcutsUsed: add((g) => g.objective.offcutsUsed) },
  };
}

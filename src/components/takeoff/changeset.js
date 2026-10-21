// =============================================================================
// changeset.js — pure helpers for the client's pending takeoff edits.
//
// A change-set mirrors the server commit payload but keeps upserts keyed by id so later edits
// replace earlier ones. Applying it to the last server snapshot gives the optimistic view the
// UI shows (and computes with shared/takeoff) until the server confirms.
// =============================================================================

const KINDS = ["materials", "measurements", "contributions"];

export function emptyChanges() {
  return { workspace: null, calibrations: { insert: [] }, materials: { upsert: {}, archive: [] }, measurements: { upsert: {}, archive: [] }, contributions: { upsert: {}, archive: [] } };
}

export function isEmpty(ch) {
  if (!ch) return true;
  if (ch.workspace && Object.keys(ch.workspace).length) return false;
  if (ch.calibrations.insert.length) return false;
  return KINDS.every((k) => !Object.keys(ch[k].upsert).length && !ch[k].archive.length);
}

/** b on top of a (b wins). Neither input is mutated. */
export function mergeChanges(a, b) {
  if (!a) return b; if (!b) return a;
  const out = emptyChanges();
  out.workspace = a.workspace || b.workspace ? { ...(a.workspace || {}), ...(b.workspace || {}) } : null;
  const calIds = new Set();
  for (const c of [...a.calibrations.insert, ...b.calibrations.insert]) if (!calIds.has(c.id)) { calIds.add(c.id); out.calibrations.insert.push(c); }
  for (const k of KINDS) {
    out[k].upsert = { ...a[k].upsert, ...b[k].upsert };
    const archived = new Set([...a[k].archive, ...b[k].archive]);
    // an upsert in b after an archive in a revives the record
    for (const id of Object.keys(b[k].upsert)) if (!b[k].archive.includes(id)) archived.delete(id);
    out[k].archive = [...archived];
  }
  return out;
}

/** Serialise for POST /commit. */
export function toPayload(ch) {
  const p = { calibrations: { insert: ch.calibrations.insert.map(({ preview, ...rest }) => { void preview; return rest; }) } };
  if (ch.workspace && Object.keys(ch.workspace).length) p.workspace = ch.workspace;
  for (const k of KINDS) p[k] = { upsert: Object.values(ch[k].upsert), archive: ch[k].archive };
  return p;
}

/** Revive a serialised change-set (recovery record / payload) into keyed form. */
export function fromPayload(p) {
  const ch = emptyChanges();
  if (!p) return ch;
  ch.workspace = p.workspace || null;
  ch.calibrations.insert = p.calibrations?.insert || [];
  for (const k of KINDS) {
    const up = p[k]?.upsert;
    ch[k].upsert = Array.isArray(up) ? Object.fromEntries(up.map((r) => [r.id, r])) : { ...(up || {}) };
    ch[k].archive = [...(p[k]?.archive || [])];
  }
  return ch;
}

/** Optimistic view: snapshot with the change-set applied. */
export function applyChanges(snapshot, ch) {
  if (!snapshot) return null;
  if (!ch || isEmpty(ch)) return snapshot;
  const apply = (list, part, map = (r) => r) => {
    const archived = new Set(part.archive);
    const byId = new Map(list.map((r) => [r.id, r]));
    for (const [id, rec] of Object.entries(part.upsert)) byId.set(id, { ...(byId.get(id) || {}), ...map(rec) });
    return [...byId.values()].filter((r) => !archived.has(r.id));
  };
  const calibrations = [...snapshot.calibrations, ...ch.calibrations.insert.filter((c) => !snapshot.calibrations.some((s) => s.id === c.id)).map((c) => ({ ...c, ...(c.preview || {}), pending: true }))];
  return {
    ...snapshot,
    workspace: ch.workspace ? { ...snapshot.workspace, ...ch.workspace } : snapshot.workspace,
    calibrations,
    materials: apply(snapshot.materials, ch.materials, (r) => ({ ...r, pending: true })),
    measurements: apply(snapshot.measurements, ch.measurements, (r) => ({ ...r, pending: true })),
    contributions: apply(snapshot.contributions, ch.contributions, (r) => ({ ...r, pending: true })),
  };
}

/** Plain-English summary for conflict / recovery sheets. */
export function describeChanges(ch) {
  if (!ch) return [];
  const out = [];
  const n = (k) => Object.keys(ch[k].upsert).length;
  if (ch.calibrations.insert.length) out.push(`${ch.calibrations.insert.length} plan scale(s)`);
  if (n("measurements")) out.push(`${n("measurements")} measurement(s) added or changed`);
  if (ch.measurements.archive.length) out.push(`${ch.measurements.archive.length} measurement(s) removed`);
  if (n("materials")) out.push(`${n("materials")} material(s) added or changed`);
  if (ch.materials.archive.length) out.push(`${ch.materials.archive.length} material(s) removed`);
  if (n("contributions") || ch.contributions.archive.length) out.push("assignments / splits changed");
  if (ch.workspace) out.push("takeoff details changed");
  return out;
}

/**
 * Build a partial change-set from plain lists:
 *   partial({ measurements: [rec], contributions: [rec], materials: [rec], calibrations: [rec],
 *             archive: { measurements: [id], ... }, workspace: {...} })
 */
export function partial({ measurements = [], contributions = [], materials = [], calibrations = [], archive = {}, workspace = null } = {}) {
  const ch = emptyChanges();
  ch.workspace = workspace;
  ch.calibrations.insert = calibrations;
  for (const [k, list] of [["measurements", measurements], ["contributions", contributions], ["materials", materials]]) {
    for (const r of list) ch[k].upsert[r.id] = r;
    ch[k].archive = [...(archive[k] || [])];
  }
  return ch;
}

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** 3-way per field: keep what THIS user changed since `base`, take everything else from `latest` (R04b R14). */
export function rebaseRecord(mine, base, latest) {
  if (!base || !latest) return mine;
  const out = { ...latest };
  for (const k of Object.keys(mine)) {
    if (k === "spec" || k === "rules") {
      const m = mine[k] || {}, b = base[k] || {}, l = latest[k] || {};
      const merged = { ...l };
      for (const f of new Set([...Object.keys(m), ...Object.keys(b)])) if (!sameJson(m[f], b[f])) merged[f] = m[f];
      out[k] = merged;
    } else if (!sameJson(mine[k], base[k])) out[k] = mine[k];
  }
  return out;
}

const pairOf = (c) => `${c?.measurementId}|${c?.jobMaterialId}`;
/**
 * HUB 025: keep "stop using an assignment" and "use the same item for the same material again" out of ONE save.
 * The server's takeoff_commit adds assignments BEFORE it archives, so a new assignment for a (measurement, material)
 * pair that is still live on the server meets the old one on the one-live-assignment-per-pair rule and the whole save
 * is refused (untick then tick an opening, Remove then tick, two quick Undos).
 *   (a) an assignment both upserted and archived in the batch ends archived either way: the upsert is dropped;
 *   (b) an upsert whose pair is still held on the server by a DIFFERENT live assignment that this batch archives goes
 *       to `later` (the next save, once the archive has landed).
 * A real duplicate (the holder is not archived, or two new ids on one pair) is left alone for the server to refuse.
 * No id is rewritten, so undo / redo keep working. `now` is the same object when nothing needs to move.
 */
export function deferPairCollisions(ch, serverContributions = []) {
  const later = emptyChanges();
  if (!ch) return { now: ch, later };
  const part = ch.contributions;
  const archived = new Set(part.archive);
  const ids = Object.keys(part.upsert);
  const both = ids.filter((id) => archived.has(id));
  const holders = new Map(); // pair → live server ids on it
  for (const c of serverContributions || []) {
    if (c.archived || c.archivedAt) continue;
    holders.set(pairOf(c), [...(holders.get(pairOf(c)) || []), c.id]);
  }
  const deferred = ids.filter((id) => {
    if (archived.has(id)) return false;
    const held = (holders.get(pairOf(part.upsert[id])) || []).filter((h) => h !== id);
    return held.length > 0 && held.every((h) => archived.has(h));
  });
  if (!both.length && !deferred.length) return { now: ch, later };
  const upsert = { ...part.upsert };
  for (const id of [...both, ...deferred]) delete upsert[id];
  for (const id of deferred) later.contributions.upsert[id] = part.upsert[id];
  return { now: { ...ch, contributions: { upsert, archive: [...part.archive] } }, later };
}

/**
 * HUB 025: is a failed save "someone else saved this takeoff first"? Every CONFLICT code is: CONFLICT, and
 * CONFLICT_RETRY ("The takeoff changed while loading — reload.", when another device's saves keep landing while the
 * server reads this one). So is a 409 with no code (an older server). Any other 409 (DUPLICATE_ASSIGNMENT, IMMUTABLE …)
 * is a refusal of THIS change, never a conflict.
 */
export function isSaveConflict(r) {
  if (!r || r.ok) return false;
  return /^CONFLICT/.test(String(r.code || "")) || (r.status === 409 && !r.code);
}

/**
 * HUB 025: name the edits that aren't saved yet ("Window angle 50 × 50 × 3 setup", "which openings Window angle
 * 50 × 50 × 3 uses (W2)"), so a conflict says WHICH edit needs a choice. Names come from the screen's view, then the
 * last saved snapshot (`base`); with nothing to name it falls back to describeChanges' counts.
 */
export function nameChanges(ch, view, base) {
  if (!ch || isEmpty(ch)) return [];
  const find = (k, id) => (view?.[k] || []).find((r) => r.id === id) || (base?.[k] || []).find((r) => r.id === id) || null;
  const matName = (id) => (ch.materials.upsert[id] || find("materials", id))?.name || null;
  const measName = (m) => {
    const l = m?.inputs?.label || m?.inputs?.name || m?.label;
    if (l) return String(l);
    if (m?.kind === "manual" && Number.isFinite(m.finishedLengthMm)) return `a ${m.finishedLengthMm.toLocaleString("en-AU")} mm cut`;
    if (!m) return null;
    return { wall: "a wall", opening: "an opening", run: "a run", polyline: "a run", count: "a count", offcut: "an offcut" }[m.kind] || "a measurement";
  };
  const out = [];
  if (ch.calibrations.insert.length) out.push(`${ch.calibrations.insert.length} plan scale(s)`);
  for (const [id, m] of Object.entries(ch.materials.upsert)) out.push(`${m.name || matName(id) || "a material"} setup`);
  for (const id of ch.materials.archive) out.push(`${matName(id) || "a material"} removed`);
  const touched = new Set([...Object.keys(ch.measurements.upsert), ...ch.measurements.archive]);
  const contribs = [...Object.values(ch.contributions.upsert), ...ch.contributions.archive.map((id) => find("contributions", id) || { id })];
  for (const [id, m] of Object.entries(ch.measurements.upsert)) {
    const known = (base?.measurements || []).some((x) => x.id === id);
    const mat = known ? null : matName(contribs.find((c) => c.measurementId === id)?.jobMaterialId);
    out.push(`${measName({ ...(find("measurements", id) || {}), ...m })} ${known ? "changed" : `added${mat ? ` to ${mat}` : ""}`}`);
  }
  for (const id of ch.measurements.archive) out.push(`${measName(find("measurements", id)) || "a measurement"} removed`);
  // assignments whose measurement isn't named above: per material, which openings it uses
  const byMat = new Map();
  for (const c of contribs) {
    if (!c.jobMaterialId || touched.has(c.measurementId)) continue;
    const g = byMat.get(c.jobMaterialId) || { opening: false, labels: new Set() };
    if (c.role === "opening") g.opening = true;
    const l = measName(find("measurements", c.measurementId));
    if (l) g.labels.add(l);
    byMat.set(c.jobMaterialId, g);
  }
  for (const [mid, g] of byMat) {
    const name = matName(mid) || "a material";
    const labels = g.labels.size ? ` (${[...g.labels].join(", ")})` : "";
    out.push(g.opening ? `which openings ${name} uses${labels}` : `what ${name} is measured from${labels}`);
  }
  if (ch.workspace && Object.keys(ch.workspace).length) out.push("takeoff details changed");
  if (!out.length) return describeChanges(ch);
  return out.length > 6 ? [...out.slice(0, 5), `and ${out.length - 5} more`] : out;
}

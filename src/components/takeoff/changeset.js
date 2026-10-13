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

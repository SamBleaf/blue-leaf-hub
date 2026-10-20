// =============================================================================
// takeoffPlanCache.js — plans already opened on this device (Hub review HUB 021).
//
// A plan's bytes are kept in this device's IndexedDB, keyed by the document and its stored content hash, so
// reopening an unchanged plan needs no download (and works with no signal while the takeoff is loaded). A copy
// is used only after an authorised workspace snapshot lists that document with the SAME hash and size — a new
// revision or a replaced file misses and downloads again. Separate database from the change-set recovery
// (blh-takeoff-recovery) so neither is ever versioned for the other. Cleared on sign-out; unused copies go
// after 30 days; at most 250 MiB / 12 plans, least recently used first. Every failure just means "no copy".
// =============================================================================

const DB_NAME = "blh-takeoff-plans";
const VERSION = 1;
export const PLAN_CACHE_LIMITS = Object.freeze({ maxBytes: 250 * 1024 * 1024, maxEntries: 12, ttlMs: 30 * 24 * 3600 * 1000 });

let factory = typeof indexedDB !== "undefined" ? indexedDB : null;
let dbPromise = null;
/** Test hook: swap the IndexedDB factory (null = unavailable). */
export function _setIndexedDbFactory(f) { factory = f; dbPromise = null; }

function idb() {
  if (!factory) return Promise.reject(new Error("unavailable"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      let req;
      try { req = factory.open(DB_NAME, VERSION); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        // meta and bytes apart: eviction reads every meta row, never every plan's bytes
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "docId" });
        if (!db.objectStoreNames.contains("bytes")) db.createObjectStore("bytes", { keyPath: "docId" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("open failed"));
      req.onblocked = () => reject(new Error("blocked"));
    }).catch((e) => { dbPromise = null; throw e; });
  }
  return dbPromise;
}
const reqP = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
function tx(stores, mode, fn) {
  return idb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let out;
    Promise.resolve(fn(t)).then((v) => { out = v; }, reject);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error || new Error("transaction failed"));
    t.onabort = () => reject(t.error || new Error("transaction aborted"));
  }));
}

/** A stored copy is this exact plan: same document, same stored hash (a hash is required), same size when known. */
export function planCacheHit(meta, doc) {
  if (!meta || !doc?.id || meta.docId !== doc.id) return false;
  if (typeof doc.contentSha256 !== "string" || !doc.contentSha256 || meta.sha256 !== doc.contentSha256) return false;
  if (Number.isFinite(doc.byteSize) && doc.byteSize > 0 && meta.byteSize !== doc.byteSize) return false;
  return true;
}

/**
 * Which stored plans to drop so `incoming` ({docId, byteSize}) fits: unused for ttlMs first, then least recently
 * used, never the plan being written. Returns { drop: [docId], fits }.
 */
export function planEvictions(metas, incoming, { maxBytes, maxEntries, ttlMs, now } = { ...PLAN_CACHE_LIMITS, now: Date.now() }) {
  if (!incoming || incoming.byteSize > maxBytes) return { drop: [], fits: false };
  const others = (metas || []).filter((m) => m.docId !== incoming.docId);
  const drop = others.filter((m) => now - (m.lastUsedAt || m.savedAt || 0) > ttlMs).map((m) => m.docId);
  const keep = others.filter((m) => !drop.includes(m.docId)).sort((a, b) => (a.lastUsedAt || 0) - (b.lastUsedAt || 0));
  let bytes = keep.reduce((n, m) => n + (m.byteSize || 0), 0);
  while (keep.length && (bytes + incoming.byteSize > maxBytes || keep.length + 1 > maxEntries)) {
    const m = keep.shift();
    drop.push(m.docId); bytes -= m.byteSize || 0;
  }
  return { drop, fits: true };
}

/** The stored bytes for this plan, or null (miss, wrong version, or storage unavailable). */
export async function getCachedPlan(doc) {
  try {
    const meta = await tx(["meta"], "readonly", (t) => reqP(t.objectStore("meta").get(doc?.id)));
    if (!planCacheHit(meta, doc)) return null;
    const row = await tx(["bytes"], "readonly", (t) => reqP(t.objectStore("bytes").get(doc.id)));
    if (!row?.buf || row.buf.byteLength !== meta.byteSize) return null;
    tx(["meta"], "readwrite", (t) => t.objectStore("meta").put({ ...meta, lastUsedAt: Date.now() })).catch(() => {});
    return new Uint8Array(row.buf);
  } catch { return null; }
}

/** Keep a downloaded plan on this device. `sha` = the stored hash (snapshot, cross-checked with the server's header). */
export async function putCachedPlan(doc, bytes, sha) {
  if (!doc?.id || !sha || !bytes?.byteLength) return false;
  const entry = { docId: doc.id, sha256: sha, byteSize: bytes.byteLength, savedAt: Date.now(), lastUsedAt: Date.now() };
  const write = async () => {
    const metas = await tx(["meta"], "readonly", (t) => reqP(t.objectStore("meta").getAll()));
    const { drop, fits } = planEvictions(metas, entry, { ...PLAN_CACHE_LIMITS, now: Date.now() });
    if (!fits) return false;
    // an ArrayBuffer, not a Blob (older iOS Safari IndexedDB Blob bugs)
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    await tx(["meta", "bytes"], "readwrite", (t) => {
      for (const id of drop) { t.objectStore("meta").delete(id); t.objectStore("bytes").delete(id); }
      t.objectStore("bytes").put({ docId: doc.id, buf });
      t.objectStore("meta").put(entry);
    });
    return true;
  };
  try { return await write(); } catch (e) {
    const quota = e?.name === "QuotaExceededError" || /quota/i.test(String(e?.message || ""));
    if (!quota) return false;
    try { await clearPlanCache(); return await write(); } catch { return false; } // full: drop the other copies and try once more
  }
}

export async function dropCachedPlan(docId) {
  try { await tx(["meta", "bytes"], "readwrite", (t) => { t.objectStore("meta").delete(docId); t.objectStore("bytes").delete(docId); }); } catch { /* nothing stored */ }
}

/** Sign-out: no plan copies stay on a shared phone. */
export async function clearPlanCache() {
  try { await tx(["meta", "bytes"], "readwrite", (t) => { t.objectStore("meta").clear(); t.objectStore("bytes").clear(); }); } catch { /* nothing stored */ }
}

// =============================================================================
// takeoffRecovery.js — device-local recovery of UNSAVED takeoff edits (R03 §11).
//
// This is recovery, not offline sync. A record holds the pending change-set that has not yet
// been committed, keyed by authenticated actor + workspace, together with the server revision
// it was based on. It never stores tokens or signed URLs. Records expire after 7 days and are
// cleared for an actor on explicit logout. If IndexedDB is unavailable or full, callers get
// { ok:false, reason } and keep edits in memory with a visible "Recovery unavailable" state.
// =============================================================================

const DB_NAME = "blh-takeoff-recovery";
const STORE = "drafts";
const VERSION = 1;
export const RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let dbPromise = null;
let factory = null; // test hook

/** Tests may inject a fake indexedDB factory. */
export function _setIndexedDbFactory(f) { factory = f; dbPromise = null; }

function idb() {
  const f = factory || (typeof indexedDB !== "undefined" ? indexedDB : null);
  if (!f) return Promise.reject(new Error("unavailable"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      let req;
      try { req = f.open(DB_NAME, VERSION); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: "key" });
          s.createIndex("actorKey", "actorKey");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("open failed"));
      req.onblocked = () => reject(new Error("blocked"));
    }).catch((e) => { dbPromise = null; throw e; });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return idb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let out;
    Promise.resolve(fn(store)).then((v) => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error || new Error("transaction failed"));
    t.onabort = () => reject(t.error || new Error("transaction aborted"));
  }));
}

const reqP = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export const recoveryKey = (actorKey, workspaceId) => `${actorKey}|${workspaceId}`;

/** True when the change-set has nothing in it. */
export function isEmptyChanges(ch) {
  if (!ch) return true;
  const n = (x) => (x ? (x.upsert?.length || 0) + (x.archive?.length || 0) + (x.insert?.length || 0) : 0);
  return !ch.workspace && !n(ch.calibrations) && !n(ch.materials) && !n(ch.measurements) && !n(ch.contributions);
}

/**
 * Save (or clear, when empty) the pending change-set.
 * @returns {Promise<{ok:true}|{ok:false, reason:string}>}
 */
export async function saveRecovery({ actorKey, workspaceId, baseRevision, changes, label }) {
  if (!actorKey || !workspaceId) return { ok: false, reason: "no-identity" };
  try {
    const key = recoveryKey(actorKey, workspaceId);
    if (isEmptyChanges(changes)) { await tx("readwrite", (s) => s.delete(key)); return { ok: true }; }
    // Structured clone of plain data only — never tokens/URLs (callers pass the change-set).
    const record = { key, actorKey, workspaceId, baseRevision, changes: JSON.parse(JSON.stringify(changes)), label: label || null, savedAt: Date.now() };
    await tx("readwrite", (s) => s.put(record));
    return { ok: true };
  } catch (e) {
    const quota = e?.name === "QuotaExceededError" || /quota/i.test(String(e?.message || ""));
    return { ok: false, reason: quota ? "quota" : "unavailable" };
  }
}

/** Load a recovery record (expired ones are removed and ignored). */
export async function loadRecovery(actorKey, workspaceId) {
  try {
    const key = recoveryKey(actorKey, workspaceId);
    const rec = await tx("readonly", (s) => reqP(s.get(key)));
    if (!rec) return { ok: true, record: null };
    if (Date.now() - rec.savedAt > RECOVERY_TTL_MS) {
      await tx("readwrite", (s) => s.delete(key));
      return { ok: true, record: null };
    }
    return { ok: true, record: rec };
  } catch {
    return { ok: false, reason: "unavailable", record: null };
  }
}

export async function clearRecovery(actorKey, workspaceId) {
  try { await tx("readwrite", (s) => s.delete(recoveryKey(actorKey, workspaceId))); return { ok: true }; }
  catch { return { ok: false }; }
}

/** Explicit logout: drop every record for that actor (and anything expired). */
export async function clearActorRecovery(actorKey) {
  try {
    await tx("readwrite", async (s) => {
      const all = await reqP(s.getAll());
      for (const r of all) if (r.actorKey === actorKey || Date.now() - r.savedAt > RECOVERY_TTL_MS) s.delete(r.key);
    });
    return { ok: true };
  } catch { return { ok: false }; }
}

/** Remember the last actor on this device so logout can clear their drafts. */
const LAST_ACTOR = "blhub_takeoff_actor";
export function rememberActor(actorKey) { try { localStorage.setItem(LAST_ACTOR, actorKey); } catch { /* ignore */ } }
export async function clearRememberedActorRecovery() {
  let a = null;
  try { a = localStorage.getItem(LAST_ACTOR); localStorage.removeItem(LAST_ACTOR); } catch { /* ignore */ }
  if (a) await clearActorRecovery(a);
}

// ── Profile-editor drafts (R04 F02) ───────────────────────────────────────────
// The whole drawing session — unfinished sketch points, last valid profile, typed field drafts that
// aren't valid yet, and a bounded undo history — kept per (actor, workspace, flashing). Same store and
// same actor scoping as the change-set recovery, so logout clears these too. Local only: "On this device".
const editorKey = (actorKey, workspaceId, materialId) => `editor|${actorKey}|${workspaceId}|${materialId}`;

export async function saveEditorDraft({ actorKey, workspaceId, materialId, draft }) {
  if (!actorKey || !workspaceId || !materialId) return { ok: false, reason: "no-identity" };
  try {
    const record = { key: editorKey(actorKey, workspaceId, materialId), kind: "editor", actorKey, workspaceId, materialId, draft: JSON.parse(JSON.stringify(draft)), savedAt: Date.now() };
    await tx("readwrite", (s) => s.put(record));
    return { ok: true };
  } catch (e) {
    const quota = e?.name === "QuotaExceededError" || /quota/i.test(String(e?.message || ""));
    return { ok: false, reason: quota ? "quota" : "unavailable" };
  }
}

export async function loadEditorDraft(actorKey, workspaceId, materialId) {
  try {
    const key = editorKey(actorKey, workspaceId, materialId);
    const rec = await tx("readonly", (s) => reqP(s.get(key)));
    if (!rec || Date.now() - rec.savedAt > RECOVERY_TTL_MS) return { ok: true, record: null };
    return { ok: true, record: rec };
  } catch { return { ok: false, record: null }; }
}

/** Unfinished drawings for one actor + workspace (to offer "Continue drawing" after a reload). */
export async function listEditorDrafts(actorKey, workspaceId) {
  try {
    const all = await tx("readonly", (s) => reqP(s.getAll()));
    return all.filter((r) => r.kind === "editor" && r.actorKey === actorKey && r.workspaceId === workspaceId && Date.now() - r.savedAt <= RECOVERY_TTL_MS);
  } catch { return []; }
}

export async function clearEditorDraft(actorKey, workspaceId, materialId) {
  try { await tx("readwrite", (s) => s.delete(editorKey(actorKey, workspaceId, materialId))); return { ok: true }; }
  catch { return { ok: false }; }
}

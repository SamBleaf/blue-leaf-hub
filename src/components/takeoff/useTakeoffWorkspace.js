// =============================================================================
// useTakeoffWorkspace — load, edit, autosave and recover one takeoff workspace.
//
// Server data is authoritative. Local edits accumulate in a change-set that is shown
// optimistically (and computed with shared/takeoff), then committed ~500 ms after the last
// completed edit with the revision it was based on (CAS) and a per-batch idempotency key.
//   Saving… / Saved / Not synced / Conflict — never a "Saved" before the server confirms.
//   A revision conflict (409 CONFLICT) keeps every local edit and asks the user (reload vs. apply mine) — never
//   auto-overwrites. Any other refusal is parked with its reason; later edits keep saving (HUB 025).
//   Network loss keeps edits visible and retries when back online.
// Every completed edit is also written to the device recovery store immediately (not debounced)
// so a reload, crash or service-worker update cannot lose it.
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeWorkspace } from "../../../shared/takeoff/index.js";
import { newId } from "../../lib/takeoffApi.js";
import { clearRecovery, loadRecovery, rememberActor, saveRecovery } from "../../lib/takeoffRecovery.js";
import { applyChanges, deferPairCollisions, emptyChanges, fromPayload, isEmpty, isSaveConflict, mergeChanges, rebaseRecord, toPayload } from "./changeset.js";

export const SAVE_DEBOUNCE_MS = 500;

/** Everything not yet confirmed by the server: held + in-flight + queued (later wins). */
function allPending(cur, queue) {
  // refused (4xx) changes stay in device recovery until the user retries or discards them (R04b R5)
  const parked = mergeChanges(cur.rejected?.changes || null, mergeChanges(cur.held?.changes || null, cur.inflight?.changes || null));
  return mergeChanges(parked || emptyChanges(), queue);
}



export function useTakeoffWorkspace(api, workspaceId) {
  const [server, setServer] = useState(null);      // { snapshot, orderStatus, capabilities, jobLabel }
  const [loadState, setLoadState] = useState({ loading: true, error: null, code: null });
  const [queue, setQueue] = useState(emptyChanges); // edits not yet sent
  const [inflight, setInflight] = useState(null);  // { changes, key, baseRevision }
  // A batch whose send failed without a server verdict (network/5xx). It is resent UNCHANGED —
  // same idempotency key, same base revision — so a commit whose response was lost replays
  // instead of looking like someone else's save. Newer edits wait in the queue behind it.
  const [held, setHeld] = useState(null);
  // A batch the server REFUSED (4xx with a reason). It is taken out of the pending view so later
  // edits keep saving; the user sees why and can discard it.
  const [rejected, setRejected] = useState(null); // { changes, error }
  const [status, setStatus] = useState("saved");    // saved | saving | unsynced | conflict | error
  const [saveError, setSaveError] = useState(null);
  const [recovery, setRecovery] = useState({ available: true, offer: null });
  const [recoveryChecked, setRecoveryChecked] = useState(false); // device recovery looked at (offer shown or none)
  const timer = useRef(null);
  const latest = useRef({});

  const actorKey = server?.capabilities?.actorKey || null;
  const baseRevision = server?.snapshot?.workspace?.revision ?? null;
  // Ref mirror of the latest state for async callbacks (updated on render AND synchronously on edit).
  latest.current = { ...latest.current, queue, inflight, held, server, actorKey, baseRevision, status };

  const load = useCallback(async () => {
    setLoadState({ loading: true, error: null, code: null });
    const r = await api.workspace(workspaceId);
    if (!r.ok) { setLoadState({ loading: false, error: r.error, code: r.code || (r.status === 403 ? "FORBIDDEN" : null) }); return null; }
    const next = { snapshot: r.data.snapshot, orderStatus: r.data.orderStatus, capabilities: r.data.capabilities, jobLabel: r.data.jobLabel, jobAddress: r.data.jobAddress || null };
    setServer(next);
    setLoadState({ loading: false, error: null, code: null });
    return next;
  }, [api, workspaceId]);

  // Initial load, THEN (authenticated + permitted) offer recovery.
  useEffect(() => {
    let stop = false;
    (async () => {
      const s = await load();
      if (stop) return;
      if (!s?.capabilities?.actorKey) { setRecoveryChecked(true); return; }
      rememberActor(s.capabilities.actorKey);
      const rec = await loadRecovery(s.capabilities.actorKey, workspaceId);
      if (stop) return;
      if (!rec.ok) { setRecovery({ available: false, offer: null }); setRecoveryChecked(true); return; }
      if (rec.record) {
        setRecovery({ available: true, offer: { ...rec.record, sameBase: rec.record.baseRevision === s.snapshot.workspace.revision } });
      }
      setRecoveryChecked(true);
    })();
    return () => { stop = true; };
  }, [load, workspaceId]);

  const pending = useMemo(() => mergeChanges(mergeChanges(held?.changes || null, inflight?.changes || null) || emptyChanges(), queue), [held, inflight, queue]);
  const view = useMemo(() => applyChanges(server?.snapshot, pending), [server, pending]);
  const computed = useMemo(() => {
    if (!view) return null;
    try { return computeWorkspace(view); } catch (e) { return { error: e.message, scheduleLines: [], contributions: [] }; }
  }, [view]);
  const dirty = !isEmpty(pending);

  const persistRecovery = useCallback(async (changes) => {
    const { actorKey: a, baseRevision: b } = latest.current;
    if (!a) return;
    const res = await saveRecovery({ actorKey: a, workspaceId, baseRevision: b, changes: toPayload(changes) });
    setRecovery((r) => ({ ...r, available: res.ok }));
  }, [workspaceId]);

  /** Apply one completed edit (a partial change-set). */
  const edit = useCallback((partial) => {
    // Use the ref so several edits in one tick chain correctly; recovery is written immediately.
    const next = mergeChanges(latest.current.queue, partial);
    latest.current.queue = next;
    setQueue(next);
    persistRecovery(allPending(latest.current, next));
    setStatus((st) => (st === "conflict" ? st : "unsynced"));
  }, [persistRecovery]);

  // ── commit loop ─────────────────────────────────────────────────────────────
  const send = useCallback(async (batch) => {
    const r = await api.commit(workspaceId, { expectedRevision: batch.baseRevision, idempotencyKey: batch.key, changes: toPayload(batch.changes) });
    if (r.ok) {
      setServer((s) => ({ ...s, snapshot: r.data.snapshot, orderStatus: r.data.orderStatus }));
      latest.current.inflight = null;
      setInflight(null);
      setSaveError(null);
      const rest = latest.current.queue;
      if (isEmpty(rest)) {
        // "Saved" only when nothing is parked as refused; refused changes keep their device copy
        setStatus(latest.current.rejected ? "rejected" : "saved");
        if (latest.current.actorKey && !latest.current.rejected) clearRecovery(latest.current.actorKey, workspaceId);
        else if (latest.current.rejected) persistRecovery(allPending(latest.current, rest));
      } else {
        setStatus("unsynced");
      }
      return;
    }
    latest.current.inflight = null;
    setInflight(null);
    // HUB 025: only a real "someone else saved first" is a Conflict (CONFLICT or CONFLICT_RETRY, see isSaveConflict).
    // Any other 409 (DUPLICATE_ASSIGNMENT, IMMUTABLE …) is a refusal of THIS change: it is parked below with its plain
    // reason and later edits keep saving.
    if (isSaveConflict(r)) {
      // A real verdict: fold the batch back in front of newer edits (nothing is lost) and ask the user.
      latest.current.queue = mergeChanges(batch.changes, latest.current.queue);
      setQueue(latest.current.queue);
      setStatus("conflict"); setSaveError(r.error); return;
    }
    if (r.status >= 400 && r.status < 500) {
      // A definite refusal (expired sign-in, permission, invalid value): park it — MERGED with anything
      // refused before, kept in device recovery — and keep later edits flowing. Never shown as Saved.
      const prev = latest.current.rejected;
      const parked = { changes: mergeChanges(prev?.changes || null, batch.changes), error: r.status === 401 ? "Your sign-in has expired — sign in again, then choose Try again." : r.error || "That change couldn't be saved." };
      latest.current.rejected = parked;
      setRejected(parked);
      persistRecovery(allPending(latest.current, latest.current.queue));
      setStatus(isEmpty(latest.current.queue) ? "rejected" : "unsynced");
      setSaveError(parked.error);
      return;
    }
    // No verdict (network / server error): hold the batch to resend unchanged.
    latest.current.held = batch;
    setHeld(batch);
    if (r.network || !r.status) { setStatus("unsynced"); setSaveError("No connection — your changes are kept on this device and will save when you're back online."); return; }
    setStatus("error");
    setSaveError(r.error || "Couldn't save.");
  }, [api, workspaceId, persistRecovery]);

  const flush = useCallback(async () => {
    const { queue: q, inflight: inf, held: h, server: srv, status: st } = latest.current;
    if (inf || !srv || st === "conflict") return;
    if (!srv.capabilities?.edit) { setStatus("error"); setSaveError("You can view this takeoff but not change it."); return; }
    let batch;
    if (h) {
      batch = h; // resend the held batch exactly as it was
      latest.current.held = null;
      setHeld(null);
    } else {
      if (isEmpty(q)) return;
      // HUB 025: an assignment that re-uses a pair this batch frees waits for the next save (after the archive lands)
      const { now, later } = deferPairCollisions(q, srv.snapshot.contributions);
      batch = { changes: now, key: `c-${newId()}`, baseRevision: srv.snapshot.workspace.revision };
      latest.current.queue = later;
      setQueue(latest.current.queue);
    }
    latest.current.inflight = batch;
    setInflight(batch);
    setStatus("saving");
    await send(batch);
  }, [send]);

  // debounce after each completed edit
  useEffect(() => {
    if ((isEmpty(queue) && !held) || inflight || status === "conflict" || status === "error") return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { flush(); }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [queue, held, inflight, status, flush]);

  // retry when the network comes back
  useEffect(() => {
    const online = () => { if (latest.current.status === "unsynced") flush(); };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [flush]);

  // recovery on hide / page exit (mobile: no beforeunload-only reliance)
  useEffect(() => {
    const save = () => { const all = allPending(latest.current, latest.current.queue); if (!isEmpty(all)) persistRecovery(all); };
    const vis = () => { if (document.visibilityState === "hidden") save(); };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("pagehide", save);
    return () => { document.removeEventListener("visibilitychange", vis); window.removeEventListener("pagehide", save); };
  }, [persistRecovery]);

  /** User chose: discard local edits and take the server version (local copy kept in recovery). */
  const reloadFromServer = useCallback(async () => {
    const all = allPending(latest.current, latest.current.queue);
    if (!isEmpty(all)) await persistRecovery(all);
    latest.current.held = null; setHeld(null);
    latest.current.queue = emptyChanges();
    setQueue(emptyChanges());
    setStatus("saved"); setSaveError(null);
    await load();
  }, [load, persistRecovery]);

  /** User chose: re-apply my edits on top of the latest server version — field by field, so a colleague's
   *  change to a field I didn't touch survives (R04b R14). */
  const applyMineOnLatest = useCallback(async () => {
    const before = latest.current.server?.snapshot;
    const fresh = await load();
    if (!fresh) return;
    const q = latest.current.queue;
    const latestMats = new Map((fresh.snapshot?.materials || []).map((m) => [m.id, m]));
    const baseMats = new Map((before?.materials || []).map((m) => [m.id, m]));
    const upsert = {};
    for (const [id, rec] of Object.entries(q.materials.upsert)) upsert[id] = rebaseRecord(rec, baseMats.get(id), latestMats.get(id));
    const next = { ...q, materials: { ...q.materials, upsert } };
    latest.current.queue = next;
    setQueue(next);
    setStatus("unsynced"); setSaveError(null);
  }, [load]);

  /** Restore a recovery record into the queue (user action). */
  const restoreRecovery = useCallback(async () => {
    const offer = recovery.offer;
    if (!offer) return;
    setQueue((q) => mergeChanges(fromPayload(offer.changes), q));
    setRecovery((r) => ({ ...r, offer: null }));
    setStatus(offer.sameBase ? "unsynced" : "conflict");
    if (!offer.sameBase) setSaveError("These recovered changes were made on an older version. Review, then choose how to apply them.");
  }, [recovery.offer]);

  const discardRecovery = useCallback(async () => {
    if (latest.current.actorKey) await clearRecovery(latest.current.actorKey, workspaceId);
    setRecovery((r) => ({ ...r, offer: null }));
  }, [workspaceId]);

  const retry = useCallback(() => { setStatus("unsynced"); setSaveError(null); }, []); // the held batch is resent first
  const discardRejected = useCallback(() => {
    latest.current.rejected = null; setRejected(null);
    setStatus((st) => (st === "rejected" ? "saved" : st)); setSaveError(null);
    persistRecovery(allPending(latest.current, latest.current.queue));
  }, [persistRecovery]);
  /** Put refused changes back in the queue (e.g. after signing in again or fixing the cause). */
  const retryRejected = useCallback(() => {
    const parked = latest.current.rejected;
    if (!parked) return;
    latest.current.rejected = null; setRejected(null);
    latest.current.queue = mergeChanges(parked.changes, latest.current.queue);
    setQueue(latest.current.queue);
    setStatus("unsynced"); setSaveError(null);
  }, []);
  const refreshServer = load;
  // placed/cancelled orders change "already ordered" without a workspace commit — refresh just that, quietly
  const refreshOrderStatus = useCallback(async () => {
    const r = await api.workspace(workspaceId);
    if (r.ok) setServer((s) => (s ? { ...s, orderStatus: r.data.orderStatus } : s));
  }, [api, workspaceId]);

  return {
    loadState, server, view, computed, pending, dirty, status, saveError, recovery, recoveryChecked, rejected, discardRejected, retryRejected,
    capabilities: server?.capabilities || null,
    edit, flush, retry, reloadFromServer, applyMineOnLatest, restoreRecovery, discardRecovery, refreshServer, refreshOrderStatus,
  };
}

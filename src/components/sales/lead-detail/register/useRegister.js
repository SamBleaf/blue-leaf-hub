/**
 * useRegister — the Master Register client store (R03).
 *
 * Talks ONLY to /api/register/leads/:leadId — the server decides whether the brief lives on the lead
 * scratchpad or on the canonical project records (registerStore.mjs). Staff never press a sync button:
 *   • edits are local first, then auto-saved (debounced) as a minimal batch of changed items + meta;
 *   • every item carries the `sync` block it was loaded with (row + version), so the server rejects a
 *     write against a stale version and NOTHING in that batch is written;
 *   • on a conflict we reload and do a THREE-WAY merge per item (base = last server copy, mine = local,
 *     theirs = fresh server): fields only I changed are re-applied on top of theirs and re-saved; fields
 *     both sides changed keep the server value and raise a notice; guard refusals (issued to the portal,
 *     approved under contract, missing evidence) revert that item with the reason;
 *   • an edit made while a save is in flight is never marked saved (per-item edit sequence).
 * A failed save never shows the browser's own error text: offline reads "Not saved — retrying" (saveFailure).
 * The brief's own details (rooms, floors, work words) report their own save state (metaState), and saveAt is the time
 * of the last save that reached the server this visit, so the room bar can read "Saved 9:41 pm".
 * The words boxes save on every keystroke: an edit that steps an approved record back keeps the approved copy for the
 * visit, and typing the approved words back puts the approval and its evidence back (registerMerge.approvalRestore).
 * undeleteItem (Undo after a delete) puts the very record back under its own id (registerMerge.planUndelete), in its old
 * place even when several deletes are undone in any order (registerMerge.deletedPlaces).
 * The lead page holds two copies of the register (desktop and phone layouts). A read waits for any save of the same lead
 * on its way from either copy (savesSettled), so the copy coming into view never shows the brief without the last edits.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, apiPut, apiPost } from "../../../../lib/apiFetch.js";
import { makeItem, genId, emptyMeta, itemKindLabel, itemTitle, seedMatchesItem } from "../../../../lib/register.js";
// The three-way merge lives in registerMerge.js (shared with the recovery of unsaved edits, and unit-tested there).
import { same, mergeItem, mergeMeta, registerDraftOf, draftIsEmpty, planRegisterRestore, saveFailure, metaSaveState, SAVE_RETRY_WORDS, approvalStep, planUndelete, metaAfterSave, deletedPlaces } from "../../../../lib/registerMerge.js";
import { saveRegisterDraft, loadRegisterDraft, clearRegisterDraft, rememberActor } from "../../../../lib/takeoffRecovery.js";

const AUTOSAVE_MS = 1200;
const SAVE_WAIT_MS = 8000;       // how long a read waits for a save on its way before reading anyway
const PLACES_KEPT = 100;         // deleted records whose old place is remembered for Undo (the oldest is let go)

/**
 * Saves on their way, per lead, from any copy of the register on this page (round 3, S1). The lead page renders the
 * register twice (the desktop layout and the CSS-hidden phone layout). When the window crosses the breakpoint (an iPad
 * turned round), the copy going out of sight saves what it holds while the copy coming into view reads the brief. That
 * read waits for the save, so it never shows the brief without the last edits, nor offers them back as unsaved.
 */
const savesOnTheWay = new Map();   // leadId → Set of promises, each settled when that save (and its merge) is done

/** Counts a save of this lead as on its way until `promise` settles. Exported for tests. */
export function trackSave(leadId, promise) {
  let set = savesOnTheWay.get(leadId);
  if (!set) savesOnTheWay.set(leadId, (set = new Set()));
  set.add(promise);
  const done = () => { set.delete(promise); if (!set.size && savesOnTheWay.get(leadId) === set) savesOnTheWay.delete(leadId); };
  promise.then(done, done);
  return promise;
}

/**
 * Waits until no save of this lead is on its way (one that starts meanwhile is waited for too), or waitMs passes.
 * It first lets the rest of this render's effects run, so a copy going out of sight in the same commit has started its
 * save. Returns true when settled, false when it stopped waiting.
 */
export async function savesSettled(leadId, waitMs = SAVE_WAIT_MS) {
  await new Promise((r) => setTimeout(r, 0));
  const until = Date.now() + waitMs;
  for (;;) {
    const set = savesOnTheWay.get(leadId);
    if (!set?.size) return true;
    const left = until - Date.now();
    if (left <= 0) return false;
    let t;
    const late = await Promise.race([Promise.allSettled([...set]).then(() => false), new Promise((r) => { t = setTimeout(() => r(true), left); })]);
    clearTimeout(t);
    if (late) return false;
  }
}

/**
 * Watches whether an element is shown (it has a box: it isn't inside a display:none layout). Checked now, then whenever
 * the window changes size (the body's size changes) or the element's own size does. Returns the stop function.
 * Exported for tests: RO and body stand in for ResizeObserver and document.body.
 */
export function watchShown(el, onChange, RO = typeof ResizeObserver === "function" ? ResizeObserver : null, body = typeof document === "undefined" ? null : document.body) {
  if (!el) return () => {};
  const check = () => onChange(el.getClientRects().length > 0);
  check();
  const ro = RO ? new RO(check) : null;
  if (body) ro?.observe(body);
  ro?.observe(el);
  return () => ro?.disconnect();
}

/**
 * [ref, shown] for a screen that must work only while it is on screen (the lead page renders its panels twice: the
 * desktop layout and a CSS-hidden phone layout). ref is a callback ref, so when the screen swaps its root element (a
 * placeholder while loading, then the full screen) the new element is the one watched (R1). holder, if given, is a ref
 * object kept pointing at the same element.
 */
export function useShown(holder = null) {
  const [el, setEl] = useState(null);
  const [shown, setShown] = useState(false);
  const ref = useCallback((node) => {
    if (holder) holder.current = node;
    if (node) setEl(node);
  }, [holder]);
  useEffect(() => watchShown(el, setShown), [el]);
  return [ref, shown];
}

const GUARD_REASONS = {
  issued_locked: "is on the client portal — withdraw it before deleting or re-classifying",
  post_contract_locked: "is approved under the signed contract — change it through a variation",
  baseline_locked: "is part of the signed contract baseline — change it through a variation",
  approved_locked: "is client-approved and can't be withdrawn",
  evidence_required: "needs approval evidence before it can be marked client-approved",
  technical_evidence_required: "needs a technical reference before it can be marked verified",
  not_in_review: "has no client choice waiting for review",
  reapproval_required: "changed after client approval — it needs the client's re-confirmation",
  item_mismatch: "doesn't match the record it was opened from — reload and try again",
};

export function useRegister(leadId, { enabled = true, actorKey = null } = {}) {
  const [status, setStatus] = useState({ loading: true, error: null });
  const [info, setInfo] = useState({ mode: null, projectId: null, isPreconstruction: true, promotion: null, pendingPromotion: false, schemaReady: true });
  const [reg, setReg] = useState(null);
  const [save, setSave] = useState({ state: "idle", at: null, message: null });
  const [saveAt, setSaveAt] = useState(null);   // the last save that reached the server (kept while later edits are pending)
  const [notices, setNotices] = useState([]);
  // Unsaved edits from an earlier visit on this device, offered back (never applied by themselves).
  const [recovery, setRecovery] = useState(null);
  const recoveryRef = useRef(null);

  const regRef = useRef(null);
  const baseRef = useRef({ meta: null, items: new Map() });
  const dirty = useRef(new Map());          // id → edit sequence
  const deleted = useRef(new Map());        // id → item (as last loaded)
  const refused = useRef(new Map());        // id → "rejected" | "conflict", until that item is edited again
  const approvedCopy = useRef(new Map());   // id → { item, notice }: what the client approved, for a record an edit stepped back (B3)
  const deletesSent = useRef(new Set());    // ids whose delete is in the save on its way now
  const deletedAt = useRef(new Map());      // id → the ids that were before a deleted record (deletedPlaces), so Undo puts it back there
  const loadedFor = useRef(null);           // the lead the register on screen belongs to
  const onScreen = useRef(enabled);         // this copy is on screen (the enabled flag, as the last effect saw it)
  const metaSeq = useRef(0);
  const metaSent = useRef(0);
  const metaSaved = useRef(0);
  const seq = useRef(0);
  const saving = useRef(false);
  const pending = useRef(false);
  const timer = useRef(null);
  const mounted = useRef(true);

  const adopt = useCallback((payload) => {
    const r = payload.register;
    const meta = emptyMeta(r.meta);
    const items = (r.items || []).map((i) => makeItem(i));
    baseRef.current = { meta, items: new Map(items.map((i) => [i.id, i])) };
    // A save's answer carries only the register and its mode: the project and its stage stay as the last load said.
    setInfo((prev) => ({ mode: payload.mode,
      projectId: "projectId" in payload ? payload.projectId ?? null : payload.mode === prev.mode ? prev.projectId : null,
      isPreconstruction: "isPreconstruction" in payload ? payload.isPreconstruction !== false : payload.mode === prev.mode ? prev.isPreconstruction : true,
      promotion: payload.promotion || null, pendingPromotion: !!payload.pendingPromotion, schemaReady: payload.schemaReady !== false }));
    return { meta, items };
  }, []);

  // Keep what's unsaved on this device as it's typed (Tab 26 R05 retest): a reload, a closed tab or an iPad
  // dropping the page can't lose it. An offer not yet answered is kept alongside until Restore or Discard.
  const persistDraft = useCallback(() => {
    if (!actorKey) return;
    const now = registerDraftOf({ reg: regRef.current, baseMeta: baseRef.current.meta, baseItems: baseRef.current.items,
      dirtyIds: dirty.current.keys(), metaDirty: metaSeq.current !== metaSaved.current });
    const offered = recoveryRef.current?.draft;
    // Restore replays the earlier draft first, then this visit's edits on top (planRegisterRestore).
    const draft = offered ? (draftIsEmpty(now) ? offered : { ...now, earlier: offered }) : now;
    saveRegisterDraft({ actorKey, leadId, draft });
  }, [actorKey, leadId]);

  const load = useCallback(async () => {
    setStatus((s) => ({ ...s, loading: true }));
    // A save of this lead on its way (the other copy, out of sight now, sending what it held) lands first (S1).
    await savesSettled(leadId);
    if (!mounted.current) return null;
    const r = await apiFetch(`/api/register/leads/${leadId}`);
    if (!mounted.current) return null;
    if (!r.ok) {
      const disabled = r.code === "REGISTER_DISABLED"; // feature switch off for this lead — not an error
      // Offline, or a gateway page instead of the Hub's answer: plain words, never the browser's own error text.
      const plain = r.network || !r.body?.error ? "Couldn't load the brief. Check the connection, then reload the page." : r.error;
      setStatus({ loading: false, error: disabled ? null : plain, disabled });
      return null;
    }
    const next = adopt(r.data);
    dirty.current.clear(); deleted.current.clear(); refused.current.clear(); metaSaved.current = metaSeq.current;
    loadedFor.current = leadId;
    regRef.current = next; setReg(next);
    setStatus({ loading: false, error: null });
    setSave({ state: "idle", at: null, message: null });
    if (actorKey) {
      rememberActor(actorKey);   // so signing out clears this device's drafts
      const { record } = await loadRegisterDraft(actorKey, leadId);
      if (mounted.current && record && !draftIsEmpty(record.draft)) {
        const plan = planRegisterRestore(record.draft, next, itemTitle);
        if (plan.nothingToRestore && !plan.removed.length) { clearRegisterDraft(actorKey, leadId); recoveryRef.current = null; setRecovery(null); }
        else {
          recoveryRef.current = record;
          setRecovery({ savedAt: record.savedAt, count: plan.touchedIds.length + (plan.metaTouched ? 1 : 0), conflicts: plan.conflicts.length, removed: plan.removed.length });
        }
      }
    }
    return r.data;
  }, [leadId, adopt, actorKey]);

  // Load only when the register is actually on screen (the lead page renders its panels in both the desktop
  // and the CSS-hidden mobile layout — the hidden copy must not hold a second, stale register). A copy that goes out of
  // sight (the window crossed the layout's breakpoint) saves what it still holds instead of dropping it, and when it is
  // shown again it reads the brief afresh, unless it still has its own edits to save. Its old copy isn't left on screen
  // meanwhile (it shows "Loading the brief…"): edited there, the fresh read would drop those edits (S1).
  useEffect(() => {
    mounted.current = true;
    const cameBack = enabled && !onScreen.current;
    onScreen.current = enabled;
    const own = regRef.current && loadedFor.current === leadId;
    const unsaved = own && (dirty.current.size || deleted.current.size || metaSeq.current !== metaSaved.current);
    if (unsaved) flushRef.current();
    else if (enabled) {
      if (cameBack && own) { regRef.current = null; loadedFor.current = null; setReg(null); }
      load();
    }
    return () => { mounted.current = false; clearTimeout(timer.current); };
  }, [load, enabled, leadId]);

  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    setSave((s) => ({ ...s, state: "dirty" }));
    timer.current = setTimeout(() => { flushRef.current(); }, AUTOSAVE_MS);
  }, []);

  // ── mutations (local first) ───────────────────────────────────────────────────────────────────
  const commit = useCallback((next, touchedIds = [], metaTouched = false) => {
    outcome.current = null;   // a fresh user edit starts a new save cycle — drop any latched rejection/conflict badge
    regRef.current = next; setReg(next);
    for (const id of touchedIds) { dirty.current.set(id, ++seq.current); refused.current.delete(id); }
    if (metaTouched) metaSeq.current += 1;
    persistDraft();
    schedule();
  }, [schedule, persistDraft]);

  const updateItem = useCallback((id, partial) => {
    const cur = regRef.current; if (!cur) return;
    const item = cur.items.find((i) => i.id === id);
    const kept = approvedCopy.current.get(id) || null;
    // An approval covers a specific product, answer or (for a requirement, scope or action) its words: changing it
    // returns the item to Proposed until the client re-confirms (the server refuses to keep "client-approved" on it
    // without new evidence). The words boxes save on every keystroke, so the approved copy is kept for this visit and
    // typing the approved words back puts the approval and its evidence back, and takes the notice away (approvalStep).
    const step = approvalStep(item, partial, kept?.item || null);
    if (step.stepped) {
      const notice = `“${item.description || (item.answer && itemTitle(item)) || itemKindLabel(item.itemKind)}” changed after client approval — it's back to Proposed until the client re-confirms.`;
      approvedCopy.current.set(id, { item: step.keep, notice });
      setNotices((n) => [notice, ...n].slice(0, 6));
    } else if (step.keep === null) {
      approvedCopy.current.delete(id);
      if (step.restored) setNotices((n) => { const k = n.indexOf(kept.notice); return k < 0 ? n : n.filter((_, j) => j !== k); });
    }
    commit({ ...cur, items: cur.items.map((i) => (i.id === id ? makeItem({ ...i, ...step.partial, sync: i.sync }) : i)) }, [id]);
  }, [commit]);
  const addItem = useCallback((item) => {
    const cur = regRef.current; if (!cur) return null;
    const it = makeItem(item);
    commit({ ...cur, items: [...cur.items, it] }, [it.id]);
    return it;
  }, [commit]);
  const upsertItem = useCallback((seed, partial) => {
    const cur = regRef.current; if (!cur) return;
    const held = seed.id ? cur.items.find((i) => i.id === seed.id) : null;
    if (held && seedMatchesItem(held, seed)) return updateItem(seed.id, partial);   // the same record, answered twice before the screen caught up
    addItem({ ...seed, ...partial, ...(held ? { id: genId() } : {}) });              // an id taken by another room or question is never written through
  }, [addItem, updateItem]);
  // Where each record about to go was in the list, counting the records deleted earlier and not put back yet in their
  // old places, so Undo puts them back in their old order whatever order the Undos come in (S3).
  const rememberPlaces = useCallback((items, ids) => {
    const ghosts = [...deletedAt.current].map(([id, before]) => ({ id, before }));
    for (const [id, before] of deletedPlaces(items, ids, ghosts)) { deletedAt.current.delete(id); deletedAt.current.set(id, before); }
    while (deletedAt.current.size > PLACES_KEPT) deletedAt.current.delete(deletedAt.current.keys().next().value);
  }, []);
  const deleteItem = useCallback((id) => {
    const cur = regRef.current; if (!cur) return;
    const there = cur.items.some((i) => i.id === id);
    if (there) rememberPlaces(cur.items, [id]);
    if (there && baseRef.current.items.has(id)) deleted.current.set(id, baseRef.current.items.get(id));
    dirty.current.delete(id);
    commit({ ...cur, items: cur.items.filter((i) => i.id !== id) }, []);
  }, [commit, rememberPlaces]);
  /**
   * Undo of a delete: the exact record comes back (same id, same sync, same content), where it was in the list. A delete
   * not yet saved is simply dropped, so the next save neither deletes nor duplicates it; one already saved puts the
   * record back as new under its own id. Returns the record as it is back on screen, or null when it was already there.
   */
  const undeleteItem = useCallback((item) => {
    const cur = regRef.current; if (!cur || !item?.id) return null;
    const plan = planUndelete(item, { current: cur, pending: deleted.current.get(item.id) || null, flying: deletesSent.current.has(item.id),
      before: deletedAt.current.get(item.id) ?? null });
    if (!plan) return null;
    deleted.current.delete(item.id);
    deletedAt.current.delete(item.id);
    commit({ ...cur, items: plan.items }, plan.dirty ? [item.id] : []);
    return plan.item;
  }, [commit]);
  const replaceItems = useCallback((fn) => {         // bulk (e.g. apply default to rooms / delete room)
    const cur = regRef.current; if (!cur) return;
    const next = fn(cur);
    const before = new Map(cur.items.map((i) => [i.id, i]));
    const touched = next.items.filter((i) => !before.has(i.id) || !same(before.get(i.id), i)).map((i) => i.id);
    const kept = new Set(next.items.map((n) => n.id));
    const gone = cur.items.filter((i) => !kept.has(i.id));
    if (gone.length) rememberPlaces(cur.items, gone.map((i) => i.id));
    for (const i of gone) if (baseRef.current.items.has(i.id)) deleted.current.set(i.id, baseRef.current.items.get(i.id));
    commit(next, touched, !same(cur.meta, next.meta));
  }, [commit, rememberPlaces]);
  const mutateMeta = useCallback((partial) => {
    const cur = regRef.current; if (!cur) return;
    commit({ ...cur, meta: emptyMeta({ ...cur.meta, ...partial }) }, [], true);
  }, [commit]);

  // ── save ──────────────────────────────────────────────────────────────────────────────────────
  // A latched {state,message} for a guard REJECTION / version CONFLICT that happened in a batch which ALSO
  // had valid items still to save. The valid items are re-flushed, but their green "Saved" must not repaint
  // over the rejection/conflict — flush() restores this latched badge instead. Cleared on the next user edit.
  const outcome = useRef(null);
  const flushRef = useRef(async () => {});
  const flush = useCallback(async ({ keepalive = false } = {}) => {
    clearTimeout(timer.current);
    const cur = regRef.current;
    if (!cur) return true;
    const metaDirty = metaSeq.current !== metaSaved.current;
    if (!dirty.current.size && !deleted.current.size && !metaDirty) { setSave((s) => (s.state === "dirty" ? { ...s, state: "saved" } : s)); return true; }
    if (saving.current) { pending.current = true; return false; }
    saving.current = true;
    // Counted as on its way (savesOnTheWay) until it, and any merge it needs, is done: a read of this lead by the other
    // copy waits for it (S1).
    let landed;
    trackSave(leadId, new Promise((r) => { landed = r; }));
    try {
      // A retry after an offline failure keeps saying "Not saved — retrying" until it gets through (no Saving… flicker).
      setSave((s) => (s.state === "error" && s.message === SAVE_RETRY_WORDS ? s : { ...s, state: "saving" }));

      const sentSeq = new Map(dirty.current);
      const changes = [...sentSeq.keys()].map((id) => cur.items.find((i) => i.id === id)).filter(Boolean);
      const deletes = [...deleted.current.values()].map((i) => ({ id: i.id, sync: i.sync }));
      deletesSent.current = new Set(deletes.map((d) => d.id));
      metaSent.current = metaSeq.current;
      const body = { changes, deletes };
      if (metaDirty) body.meta = { ...cur.meta, rev: baseRef.current.meta?.rev ?? cur.meta.rev };

      // keepalive lets the browser finish the save as the page goes, but refuses bodies over 64 KB — so only small ones.
      const r = await apiPut(`/api/register/leads/${leadId}`, body, keepalive && JSON.stringify(body).length < 60000 ? { keepalive: true } : undefined);
      saving.current = false;
      deletesSent.current = new Set();
      if (!mounted.current) return false;

      if (r.ok) {
        const at = new Date();
        setSaveAt(at);
        const before = baseRef.current.meta;
        const server = adopt(r.data);
        const metaChangedInFlight = metaSeq.current !== metaSent.current;
        // The answer must stand for the meta just saved, at its new rev, or the next save sends the old rev (R18). Under
        // edits made while it travelled it never carries another screen's newer rev: the next save then meets "changed
        // elsewhere" and merges, instead of writing this room list over theirs (S2; registerMerge.metaAfterSave).
        server.meta = metaAfterSave(body.meta || null, server.meta, { changedSince: metaChangedInFlight, before });
        baseRef.current.meta = server.meta;
        const local = regRef.current;
        const items = server.items.map((s) => {
          const mine = local.items.find((i) => i.id === s.id);
          if (mine && dirty.current.get(s.id) !== sentSeq.get(s.id) && dirty.current.has(s.id)) return makeItem({ ...mine, sync: s.sync });
          dirty.current.delete(s.id);
          return s;
        });
        // items created locally during the flight (not yet on the server) stay as they are. One whose delete this save
        // carried but which Undo put back meanwhile is gone from the server now: it is saved again as new, same id.
        const removedNow = new Set(deletes.map((d) => d.id));
        for (const i of local.items) if (!items.some((x) => x.id === i.id) && dirty.current.has(i.id) && !sentSeq.has(i.id)) items.push(removedNow.has(i.id) ? makeItem({ ...i, sync: null }) : i);
        for (const d of deletes) deleted.current.delete(d.id);
        // A sent id that neither the server nor this screen holds any more is finished with. Left here it repeats an empty save forever.
        for (const id of sentSeq.keys()) if (!items.some((x) => x.id === id)) dirty.current.delete(id);
        metaSaved.current = metaSent.current;
        const meta = metaChangedInFlight ? emptyMeta({ ...local.meta, rev: server.meta.rev }) : server.meta;
        const next = { meta, items };
        regRef.current = next; setReg(next);
        persistDraft();   // clears the device copy once everything is saved; otherwise keeps what's left
        const stillDirty = dirty.current.size || deleted.current.size || metaChangedInFlight;
        if (stillDirty) {
          setSave({ state: "dirty", at: null, message: null });
          pending.current = false;
          // A copy out of sight sends what's left now rather than after the autosave pause: started before this save
          // counts as landed, so the copy on screen reading the brief waits for it too (S1).
          if (onScreen.current) schedule(); else flushRef.current();
        } else if (outcome.current) {
          // the valid items saved, but a guard rejection / version conflict in this cycle must stay visible
          setSave({ state: outcome.current.state, at: null, message: outcome.current.message });
          outcome.current = null;
          if (pending.current) { pending.current = false; schedule(); }
        } else {
          setSave({ state: "saved", at, message: null });
          if (pending.current) { pending.current = false; schedule(); }
        }
        return true;
      }

      if (r.status === 409) {
        await resolveConflicts(r.body?.conflicts || [], r.body?.code, r.error);
        return false;
      }
      const failed = saveFailure(r);
      setSave({ state: "error", at: null, message: failed.message });
      if (!failed.retry) return false;
      timer.current = setTimeout(() => { flushRef.current(); }, 5000);   // offline, or a gateway page: retry
      return false;
    } finally { landed(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, adopt, schedule, persistDraft]);
  flushRef.current = flush;

  // Fully persist before a document action (preview / issue / pack). Awaits any in-flight autosave, then
  // flushes remaining edits; returns true ONLY when everything is saved clean. A guard rejection, version
  // conflict or save error returns false so the caller does not proceed on stale/unsaved data (R04 review §1).
  const flushAll = useCallback(async () => {
    for (let i = 0; i < 100; i++) {
      const ok = await flush();
      const clean = !dirty.current.size && !deleted.current.size && metaSeq.current === metaSaved.current;
      if (ok && clean) return true;
      if (!ok && !saving.current) return false;          // real conflict/error, not merely an in-flight save
      await new Promise((r) => setTimeout(r, 80));         // a save is in flight (or still dirty) — wait, retry
    }
    return false;
  }, [flush]);

  async function resolveConflicts(conflicts, code, message) {
    const fresh = await apiFetch(`/api/register/leads/${leadId}`);
    if (!fresh.ok || !mounted.current) { setSave({ state: "error", at: null, message: message || "Conflict — reload the page." }); return; }
    const baseItems = baseRef.current.items;
    const baseMeta = baseRef.current.meta;
    const server = adopt(fresh.data);
    const local = regRef.current;
    const byReason = new Map(conflicts.map((c) => [c.itemId, c.reason]));
    const out = [];
    const notes = [];
    let guardRejected = false, versionConflict = false;
    const theirs = new Map(server.items.map((i) => [i.id, i]));
    for (const t of server.items) {
      const mine = local.items.find((i) => i.id === t.id);
      if (!dirty.current.has(t.id) || !mine) { out.push(t); continue; }
      const reason = byReason.get(t.id);
      if (reason && GUARD_REASONS[reason]) {
        out.push(t); dirty.current.delete(t.id); guardRejected = true; refused.current.set(t.id, "rejected");
        notes.push(`“${itemTitle(mine)}” ${GUARD_REASONS[reason]}.`);
        continue;
      }
      const { item, conflicts: fields } = mergeItem(baseItems.get(t.id), mine, t);
      out.push(item);
      if (fields.length) { versionConflict = true; refused.current.set(t.id, "conflict"); notes.push(`“${itemTitle(mine)}” was also changed elsewhere (${fields.join(", ")}) — the latest value is shown.`); }
    }
    for (const mine of local.items) {
      if (theirs.has(mine.id)) continue;
      if (dirty.current.has(mine.id) && !baseItems.has(mine.id)) { out.push(makeItem({ ...mine, sync: null })); continue; } // my new item
      if (dirty.current.has(mine.id)) { dirty.current.delete(mine.id); notes.push(`“${itemTitle(mine)}” was removed elsewhere.`); }
    }
    for (const [id] of deleted.current) if (!theirs.has(id)) deleted.current.delete(id);
    for (const [id] of deleted.current) { const t = theirs.get(id); if (t) deleted.current.set(id, t); }
    // restore items whose delete was refused by a guard
    for (const c of conflicts) {
      if (GUARD_REASONS[c.reason] && deleted.current.has(c.itemId)) {
        const it = deleted.current.get(c.itemId);
        deleted.current.delete(c.itemId); guardRejected = true;
        notes.push(`“${it ? itemTitle(it) : "Item"}” was not removed — it ${GUARD_REASONS[c.reason]}.`);
      }
    }
    const meta = metaSeq.current !== metaSaved.current && baseMeta
      ? mergeMeta(baseMeta, local.meta, server.meta, (keys) => { versionConflict = true; notes.push(`The pricing guide was also changed elsewhere (${keys.join(", ")}). The latest value is shown.`); })
      : server.meta;
    const next = { meta, items: out.filter(Boolean) };
    regRef.current = next; setReg(next);
    persistDraft();   // a refused change is never kept for later
    if (code === "MODE_CHANGED") notes.unshift("This brief has moved onto the project record — your unsaved changes were kept and saved there.");
    if (notes.length) setNotices((n) => [...notes, ...n].slice(0, 6));
    const anything = dirty.current.size || deleted.current.size || metaSeq.current !== metaSaved.current;
    // A guard refused a change (baseline / post-contract / issued / approval evidence) or an item changed
    // elsewhere. Surface a distinct Rejected/Conflict state — never a misleading green "Saved" over it.
    const pendingOutcome = guardRejected
      ? { state: "rejected", message: notes[0] || "A change was rejected and not saved." }
      : versionConflict
      ? { state: "conflict", message: notes[0] || "An item changed elsewhere — the latest value is shown." }
      : null;
    if (anything) {
      // Valid items in the same batch still need saving. Latch the rejection/conflict so the re-flush's
      // success restores this truthful badge instead of painting green — and show it now rather than "dirty".
      outcome.current = pendingOutcome;
      setSave(pendingOutcome
        ? { state: pendingOutcome.state, at: null, message: pendingOutcome.message }
        : { state: "dirty", at: null, message: null });
      if (onScreen.current) timer.current = setTimeout(() => { flushRef.current(); }, 50);
      else flushRef.current();   // out of sight: at once, so it is still counted as on its way (S1)
    } else if (pendingOutcome) {
      setSave({ state: pendingOutcome.state, at: null, message: pendingOutcome.message });
    } else {
      const at = new Date();
      setSaveAt(at);
      setSave({ state: "saved", at, message: null });
    }
  }

  // Warn before leaving with unsaved work; flush when the tab is hidden or the page goes. The page-exit save asks the
  // browser to finish it (keepalive) — best effort; the device draft above is what makes it safe.
  useEffect(() => {
    const onBefore = (e) => { if (dirty.current.size || deleted.current.size || saving.current || metaSeq.current !== metaSaved.current) { e.preventDefault(); e.returnValue = ""; } };
    const onHide = () => { if (document.visibilityState === "hidden") flushRef.current(); };
    const onPageHide = () => flushRef.current({ keepalive: true });
    window.addEventListener("beforeunload", onBefore);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => { window.removeEventListener("beforeunload", onBefore); document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", onPageHide); };
  }, []);

  // Restore / Discard the offered draft. Restore merges it onto what's on screen now and saves it the normal way,
  // so the server's version checks and guards still decide; anything changed elsewhere keeps the latest value.
  const restoreDraft = useCallback(() => {
    const record = recoveryRef.current;
    recoveryRef.current = null; setRecovery(null);
    if (!record || !regRef.current) return;
    const plan = planRegisterRestore(record.draft, regRef.current, itemTitle);
    const notes = [...plan.conflicts, ...plan.removed.map((t) => `“${t}” was removed elsewhere, so it wasn't restored.`)];
    if (notes.length) setNotices((n) => [...notes, ...n].slice(0, 6));
    if (plan.nothingToRestore) { persistDraft(); return; }
    commit(plan.reg, plan.touchedIds, plan.metaTouched);
  }, [commit, persistDraft]);
  const discardDraft = useCallback(() => {
    recoveryRef.current = null; setRecovery(null);
    persistDraft();
  }, [persistDraft]);

  // Portal actions (issue / withdraw / return) — explicit, never autosaved.
  const portal = useCallback(async (action, items, note) => {
    await flushRef.current();
    const r = await apiPost(`/api/register/leads/${leadId}/portal/${action}`, { items: items.map((i) => ({ id: i.id, sync: i.sync })), note });
    if (!r.ok) {
      if (r.status === 409) setNotices((n) => [r.error, ...n].slice(0, 6));
      return { ok: false, error: r.error };
    }
    const next = adopt(r.data);
    dirty.current.clear(); deleted.current.clear(); metaSaved.current = metaSeq.current;
    regRef.current = next; setReg(next);
    persistDraft();
    return { ok: true, held: r.data?.held || [] };
  }, [leadId, adopt, persistDraft]);

  /** How one item's own save went. A refusal on another item says nothing about this one. */
  const saveStateOf = (id) => refused.current.get(id) || (dirty.current.has(id) ? (save.state === "error" ? "error" : "dirty") : "saved");
  /** How the brief's own details (rooms, floors, work words, drawings) are saving: 'dirty' | 'saving' | 'error' | 'saved'. */
  const metaState = metaSaveState({ seq: metaSeq.current, sent: metaSent.current, saved: metaSaved.current, saving: saving.current, state: save.state });

  return {
    loading: status.loading, error: status.error, disabled: !!status.disabled, reg, info, save, saveAt, metaState, notices, saveStateOf,
    recovery, restoreDraft, discardDraft,
    dismissNotice: (i) => setNotices((n) => n.filter((_, j) => j !== i)),
    reload: load, flush, flushAll, updateItem, addItem, upsertItem, deleteItem, undeleteItem, replaceItems, mutateMeta, portal,
  };
}

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
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, apiPut, apiPost } from "../../../../lib/apiFetch.js";
import { makeItem, emptyMeta } from "../../../../lib/register.js";

const AUTOSAVE_MS = 1200;
const ITEM_FIELDS = Object.keys(makeItem({})).filter((k) => !["id", "kind", "sync", "createdAt", "updatedAt"].includes(k));
const META_FIELDS = ["planRev", "occupancy", "renovationOverlay", "scopeAreas", "lastRoomId", "lastStep"];
const ROOM_FIELDS = ["level", "name", "roomType", "scope", "order", "sheet"];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const PRODUCT_FIELDS = ["product", "model", "manufacturer", "colour", "supplier"];

const GUARD_REASONS = {
  issued_locked: "is on the client portal — withdraw it before deleting or re-classifying",
  post_contract_locked: "is approved under the signed contract — change it through a variation",
  baseline_locked: "is part of the signed contract baseline — change it through a variation",
  approved_locked: "is client-approved and can't be withdrawn",
  evidence_required: "needs approval evidence before it can be marked client-approved",
  technical_evidence_required: "needs a technical reference before it can be marked verified",
  not_in_review: "has no client choice waiting for review",
  reapproval_required: "changed after client approval — it needs the client's re-confirmation",
};

/** Three-way merge of one item. Returns { item, conflicts: [field] }. */
function mergeItem(base, mine, theirs) {
  if (!theirs) return { item: null, conflicts: [] };
  if (!base) return { item: makeItem({ ...theirs, ...pickChanged(makeItem({}), mine), sync: theirs.sync }), conflicts: [] };
  const out = { ...theirs };
  const conflicts = [];
  for (const f of ITEM_FIELDS) {
    if (same(mine[f], base[f])) continue;                 // I didn't touch it → keep theirs
    if (same(theirs[f], base[f]) || same(theirs[f], mine[f])) out[f] = mine[f];
    else conflicts.push(f);                               // both changed → theirs wins, tell the user
  }
  return { item: makeItem({ ...out, sync: theirs.sync }), conflicts };
}
function pickChanged(blank, mine) {
  const out = {};
  for (const f of ITEM_FIELDS) if (!same(mine[f], blank[f])) out[f] = mine[f];
  return out;
}
function mergeMeta(base, mine, theirs) {
  const out = { ...theirs };
  for (const f of META_FIELDS) if (!same(mine[f], base[f]) && (same(theirs[f], base[f]))) out[f] = mine[f];
  const baseRooms = new Map((base.rooms || []).map((r) => [r.id, r]));
  const theirRooms = new Map((theirs.rooms || []).map((r) => [r.id, r]));
  const rooms = [];
  for (const r of mine.rooms || []) {
    const b = baseRooms.get(r.id), t = theirRooms.get(r.id);
    if (!b) { rooms.push(r); continue; }                  // added by me
    if (!t) continue;                                     // deleted elsewhere
    const m = { ...t };
    for (const f of ROOM_FIELDS) if (!same(r[f], b[f]) && same(t[f], b[f])) m[f] = r[f];
    rooms.push(m);
  }
  for (const t of theirs.rooms || []) {                   // added elsewhere, or I never had it
    if (!rooms.some((r) => r.id === t.id) && !(baseRooms.has(t.id) && !(mine.rooms || []).some((r) => r.id === t.id))) rooms.push(t);
  }
  out.rooms = rooms.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return emptyMeta({ ...out, rev: theirs.rev });
}

export function useRegister(leadId, { enabled = true } = {}) {
  const [status, setStatus] = useState({ loading: true, error: null });
  const [info, setInfo] = useState({ mode: null, projectId: null, isPreconstruction: true, promotion: null, pendingPromotion: false, schemaReady: true });
  const [reg, setReg] = useState(null);
  const [save, setSave] = useState({ state: "idle", at: null, message: null });
  const [notices, setNotices] = useState([]);

  const regRef = useRef(null);
  const baseRef = useRef({ meta: null, items: new Map() });
  const dirty = useRef(new Map());          // id → edit sequence
  const deleted = useRef(new Map());        // id → item (as last loaded)
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
    setInfo({ mode: payload.mode, projectId: payload.projectId ?? null, isPreconstruction: payload.isPreconstruction !== false,
      promotion: payload.promotion || null, pendingPromotion: !!payload.pendingPromotion, schemaReady: payload.schemaReady !== false });
    return { meta, items };
  }, []);

  const load = useCallback(async () => {
    setStatus((s) => ({ ...s, loading: true }));
    const r = await apiFetch(`/api/register/leads/${leadId}`);
    if (!mounted.current) return null;
    if (!r.ok) {
      const disabled = r.code === "REGISTER_DISABLED"; // feature switch off for this lead — not an error
      setStatus({ loading: false, error: disabled ? null : r.error, disabled });
      return null;
    }
    const next = adopt(r.data);
    dirty.current.clear(); deleted.current.clear(); metaSaved.current = metaSeq.current;
    regRef.current = next; setReg(next);
    setStatus({ loading: false, error: null });
    setSave({ state: "idle", at: null, message: null });
    return r.data;
  }, [leadId, adopt]);

  // Load only when the register is actually on screen (the lead page renders its panels in both the desktop
  // and the CSS-hidden mobile layout — the hidden copy must not hold a second, stale register).
  useEffect(() => { mounted.current = true; if (enabled) load(); return () => { mounted.current = false; clearTimeout(timer.current); }; }, [load, enabled]);

  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    setSave((s) => ({ ...s, state: "dirty" }));
    timer.current = setTimeout(() => { flushRef.current(); }, AUTOSAVE_MS);
  }, []);

  // ── mutations (local first) ───────────────────────────────────────────────────────────────────
  const commit = useCallback((next, touchedIds = [], metaTouched = false) => {
    outcome.current = null;   // a fresh user edit starts a new save cycle — drop any latched rejection/conflict badge
    regRef.current = next; setReg(next);
    for (const id of touchedIds) dirty.current.set(id, ++seq.current);
    if (metaTouched) metaSeq.current += 1;
    schedule();
  }, [schedule]);

  const updateItem = useCallback((id, partial) => {
    const cur = regRef.current; if (!cur) return;
    const item = cur.items.find((i) => i.id === id);
    let next = partial;
    // An approval covers a specific product: changing it returns the item to Proposed until the client
    // re-confirms (the server refuses to keep "client-approved" on a changed product without new evidence).
    if (item && item.itemKind === "selection" && item.certainty === "client_approved" && !("certainty" in partial)
        && PRODUCT_FIELDS.some((f) => f in partial && !same(partial[f], item[f]))) {
      next = { ...partial, certainty: "proposed", evidence: null };
      setNotices((n) => [`“${item.description || "Selection"}” changed after client approval — it's back to Proposed until the client re-confirms.`, ...n].slice(0, 6));
    }
    commit({ ...cur, items: cur.items.map((i) => (i.id === id ? makeItem({ ...i, ...next, sync: i.sync }) : i)) }, [id]);
  }, [commit]);
  const addItem = useCallback((item) => {
    const cur = regRef.current; if (!cur) return null;
    const it = makeItem(item);
    commit({ ...cur, items: [...cur.items, it] }, [it.id]);
    return it;
  }, [commit]);
  const upsertItem = useCallback((seed, partial) => {
    const cur = regRef.current; if (!cur) return;
    if (cur.items.some((i) => i.id === seed.id)) return updateItem(seed.id, partial);
    addItem({ ...seed, ...partial });
  }, [addItem, updateItem]);
  const deleteItem = useCallback((id) => {
    const cur = regRef.current; if (!cur) return;
    const it = cur.items.find((i) => i.id === id);
    if (it && baseRef.current.items.has(id)) deleted.current.set(id, baseRef.current.items.get(id));
    dirty.current.delete(id);
    commit({ ...cur, items: cur.items.filter((i) => i.id !== id) }, []);
  }, [commit]);
  const replaceItems = useCallback((fn) => {         // bulk (e.g. apply default to rooms / delete room)
    const cur = regRef.current; if (!cur) return;
    const next = fn(cur);
    const before = new Map(cur.items.map((i) => [i.id, i]));
    const touched = next.items.filter((i) => !before.has(i.id) || !same(before.get(i.id), i)).map((i) => i.id);
    for (const i of cur.items) if (!next.items.some((n) => n.id === i.id) && baseRef.current.items.has(i.id)) deleted.current.set(i.id, baseRef.current.items.get(i.id));
    commit(next, touched, !same(cur.meta, next.meta));
  }, [commit]);
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
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const cur = regRef.current;
    if (!cur) return true;
    const metaDirty = metaSeq.current !== metaSaved.current;
    if (!dirty.current.size && !deleted.current.size && !metaDirty) { setSave((s) => (s.state === "dirty" ? { ...s, state: "saved" } : s)); return true; }
    if (saving.current) { pending.current = true; return false; }
    saving.current = true;
    setSave((s) => ({ ...s, state: "saving" }));

    const sentSeq = new Map(dirty.current);
    const changes = [...sentSeq.keys()].map((id) => cur.items.find((i) => i.id === id)).filter(Boolean);
    const deletes = [...deleted.current.values()].map((i) => ({ id: i.id, sync: i.sync }));
    metaSent.current = metaSeq.current;
    const body = { changes, deletes };
    if (metaDirty) body.meta = { ...cur.meta, rev: baseRef.current.meta?.rev ?? cur.meta.rev };

    const r = await apiPut(`/api/register/leads/${leadId}`, body);
    saving.current = false;
    if (!mounted.current) return false;

    if (r.ok) {
      const server = adopt(r.data);
      const local = regRef.current;
      const items = server.items.map((s) => {
        const mine = local.items.find((i) => i.id === s.id);
        if (mine && dirty.current.get(s.id) !== sentSeq.get(s.id) && dirty.current.has(s.id)) return makeItem({ ...mine, sync: s.sync });
        dirty.current.delete(s.id);
        return s;
      });
      // items created locally during the flight (not yet on the server) stay as they are
      for (const i of local.items) if (!items.some((x) => x.id === i.id) && dirty.current.has(i.id) && !sentSeq.has(i.id)) items.push(i);
      for (const d of deletes) deleted.current.delete(d.id);
      const metaChangedInFlight = metaSeq.current !== metaSent.current;
      metaSaved.current = metaSent.current;
      const meta = metaChangedInFlight ? emptyMeta({ ...local.meta, rev: server.meta.rev }) : server.meta;
      const next = { meta, items };
      regRef.current = next; setReg(next);
      const stillDirty = dirty.current.size || deleted.current.size || metaChangedInFlight;
      if (stillDirty) {
        setSave({ state: "dirty", at: null, message: null });
        pending.current = false; schedule();
      } else if (outcome.current) {
        // the valid items saved, but a guard rejection / version conflict in this cycle must stay visible
        setSave({ state: outcome.current.state, at: null, message: outcome.current.message });
        outcome.current = null;
        if (pending.current) { pending.current = false; schedule(); }
      } else {
        setSave({ state: "saved", at: new Date(), message: null });
        if (pending.current) { pending.current = false; schedule(); }
      }
      return true;
    }

    if (r.status === 409) {
      await resolveConflicts(r.body?.conflicts || [], r.body?.code, r.error);
      return false;
    }
    setSave({ state: "error", at: null, message: r.error || "Could not save — will retry." });
    if (!r.network) return false;
    timer.current = setTimeout(() => { flushRef.current(); }, 5000);   // offline / network: retry
    return false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, adopt, schedule]);
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
        out.push(t); dirty.current.delete(t.id); guardRejected = true;
        notes.push(`“${mine.description || "Item"}” ${GUARD_REASONS[reason]}.`);
        continue;
      }
      const { item, conflicts: fields } = mergeItem(baseItems.get(t.id), mine, t);
      out.push(item);
      if (fields.length) { versionConflict = true; notes.push(`“${mine.description || "Item"}” was also changed elsewhere (${fields.join(", ")}) — the latest value is shown.`); }
    }
    for (const mine of local.items) {
      if (theirs.has(mine.id)) continue;
      if (dirty.current.has(mine.id) && !baseItems.has(mine.id)) { out.push(makeItem({ ...mine, sync: null })); continue; } // my new item
      if (dirty.current.has(mine.id)) { dirty.current.delete(mine.id); notes.push(`“${mine.description || "Item"}” was removed elsewhere.`); }
    }
    for (const [id] of deleted.current) if (!theirs.has(id)) deleted.current.delete(id);
    for (const [id] of deleted.current) { const t = theirs.get(id); if (t) deleted.current.set(id, t); }
    // restore items whose delete was refused by a guard
    for (const c of conflicts) {
      if (GUARD_REASONS[c.reason] && deleted.current.has(c.itemId)) {
        const it = deleted.current.get(c.itemId);
        deleted.current.delete(c.itemId); guardRejected = true;
        notes.push(`“${it?.description || "Item"}” was not removed — it ${GUARD_REASONS[c.reason]}.`);
      }
    }
    const meta = metaSeq.current !== metaSaved.current && baseMeta ? mergeMeta(baseMeta, local.meta, server.meta) : server.meta;
    const next = { meta, items: out.filter(Boolean) };
    regRef.current = next; setReg(next);
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
      timer.current = setTimeout(() => { flushRef.current(); }, 50);
    } else if (pendingOutcome) {
      setSave({ state: pendingOutcome.state, at: null, message: pendingOutcome.message });
    } else {
      setSave({ state: "saved", at: new Date(), message: null });
    }
  }

  // Warn before leaving with unsaved work; flush when the tab is hidden.
  useEffect(() => {
    const onBefore = (e) => { if (dirty.current.size || deleted.current.size || saving.current || metaSeq.current !== metaSaved.current) { e.preventDefault(); e.returnValue = ""; } };
    const onHide = () => { if (document.visibilityState === "hidden") flushRef.current(); };
    window.addEventListener("beforeunload", onBefore);
    document.addEventListener("visibilitychange", onHide);
    return () => { window.removeEventListener("beforeunload", onBefore); document.removeEventListener("visibilitychange", onHide); };
  }, []);

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
    return { ok: true, held: r.data?.held || [] };
  }, [leadId, adopt]);

  return {
    loading: status.loading, error: status.error, disabled: !!status.disabled, reg, info, save, notices,
    dismissNotice: (i) => setNotices((n) => n.filter((_, j) => j !== i)),
    reload: load, flush, flushAll, updateItem, addItem, upsertItem, deleteItem, replaceItems, mutateMeta, portal,
  };
}

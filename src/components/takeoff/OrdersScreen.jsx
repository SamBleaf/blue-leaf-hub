// =============================================================================
// OrdersScreen — Review/export + Order history (R03 §12, TC-R04 02 §6 / 07 ORD01 ORD02 J5).
// * One supplier per order. Lines default to what is still needed (required − placed).
// * Flashing lines are length × pieces; TC-R04 lines (timber, sheets, bars, LM, boxes …) are chosen the same way
//   with a unit-aware stepper. Totals are shown PER UNIT — sheets, bars, LM and boxes are never added together.
// * A saved line whose material/identity changed is stale (orderLineState — flashing and generic alike) and blocks
//   the supplier PDF until it is updated or removed explicitly.
// * Each export has its supplier PDF plus a separate "Site appendix (cutting & setout)" from the same frozen snapshot.
// * Draft PDF (watermarked) any time; supplier PDF only when every readiness check passes.
//   Exporting freezes a snapshot. It sends NOTHING and orders NOTHING.
// * "Record order placed" (directors only) ties the exact exported PDF to a supplier
//   reference/date. Placed orders are locked; extra quantities = a new order; a cancellation
//   is recorded explicitly with a reason. Required / ordered / remaining come from placed
//   records only.
// =============================================================================
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { newId } from "../../lib/takeoffApi.js";
import { ITEM_STALE_TEXT, PROBLEM_TEXT, describeFamilySpec, describeSpec, orderLineState, reconcileStaleLine } from "../../../shared/takeoff/index.js";
import { AsyncState, Banner, Btn, NumberField, TextField } from "./ui.jsx";
import { AccessoryScopeReview, StatusChips } from "./ScheduleScreen.jsx";
import { fmtLm, fmtMm } from "./format.js";
import { keepFieldInView, useKeyboardInset } from "./measure/useKeyboardInset.js";

// [singular, plural] — what a quantity is counted in (never "mm length" for sheets, boxes or LM)
const UNIT_WORDS = { piece: ["piece", "pieces"], sheet: ["sheet", "sheets"], bar: ["bar", "bars"], lm: ["LM", "LM"], m2: ["m²", "m²"], box: ["box", "boxes"], bag: ["bag", "bags"],
  roll: ["roll", "rolls"], pack: ["pack", "packs"], cartridge: ["cartridge", "cartridges"], ml: ["mL", "mL"] };
const unitWord = (u, n) => { const w = UNIT_WORDS[u] || [u || "item", u || "items"]; return n === 1 ? w[0] : w[1]; };
const qtyText = (n, u) => `${Number(n).toLocaleString("en-AU")} ${unitWord(u, n)}`;
/** Units always listed in the same order (pieces, sheets, bars, LM …) wherever totals appear. */
const byUnitOrder = ([a], [b]) => { const i = (u) => { const k = Object.keys(UNIT_WORDS).indexOf(u); return k < 0 ? 99 : k; }; return i(a) - i(b) || (a < b ? -1 : 1); };
/** A schedule line or saved order line that is NOT a flashing length (TC-R04 purchase line). */
const isGenericLine = (l) => !!(l?.generic || l?.item);
// stale-line wording for purchase lines (PROBLEM_TEXT talks about flashing "lengths")
const GENERIC_STALE = ITEM_STALE_TEXT;
const STALE_CODES = Object.keys(GENERIC_STALE);

/**
 * A stale purchase line whose length / stock changed (e.g. a new pitch moved the rafters from 5,400 to 6,600 stock)
 * gets no same-length suggestion from orderLineState. When its material now buys exactly ONE line in the same unit,
 * offer that line — explicitly ("Update to what's needed now") — instead of leaving only "Remove line".
 */
function withGenericSuggestion(state, computed) {
  const l = state.line;
  if (!state.stale || state.suggestion || !isGenericLine(l) || !l.jobMaterialId || state.problem === "line_stale_quantity") return state;
  const same = (computed?.scheduleLines || []).filter((x) => x.generic && x.bucketKey !== l.bucketKey && x.jobMaterialIds.includes(l.jobMaterialId) && (x.unit || "piece") === (l.unit || "piece"));
  return same.length === 1 ? { ...state, suggestion: same[0] } : state;
}

// unsaved order-form changes are kept on THIS device (a reload or a dropped PWA never loses typed quantities);
// restored only onto the same saved revision of the same order, and cleared once saved or undone
const draftKey = (orderId) => `takeoff-order-draft:${orderId}`;
function readOrderDraft(order) {
  try {
    const raw = window.localStorage.getItem(draftKey(order.id));
    if (!raw) return null;
    const d = JSON.parse(raw);
    // pure (a state initialiser runs twice in development): the out-of-date draft is cleared by DraftOrder's save effect
    return d?.revision === order.revision && d.qty && typeof d.qty === "object" ? { draft: d, stale: false } : { draft: null, stale: true };
  } catch { return null; }
}
function writeOrderDraft(orderId, d) {
  try { if (d) window.localStorage.setItem(draftKey(orderId), JSON.stringify(d)); else window.localStorage.removeItem(draftKey(orderId)); } catch { /* storage unavailable: in-memory only */ }
}

/** Plain message for a dropped connection instead of the browser's "Failed to fetch". */
const friendly = (r) => (r?.network || /Failed to fetch|Load failed|NetworkError/i.test(r?.error || "") ? "No connection — try again when you're back online. Nothing was sent." : r?.error);

const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

async function openPdf(api, exportId, setMsg, kind = "pdf") {
  const win = window.open("about:blank", "_blank"); // before the await so popup blockers allow it
  const r = kind === "appendix" ? await api.exportAppendix(exportId) : await api.exportPdf(exportId);
  if (!r.ok) { win?.close(); setMsg(friendly(r) || (kind === "appendix" ? "Couldn't open the site appendix." : "Couldn't open the PDF.")); return; }
  const url = URL.createObjectURL(new Blob([r.bytes], { type: "application/pdf" }));
  if (win) win.location.href = url; else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function OrdersScreen({ api, ws, jobAddress, onBack, deviceDrafts = [] }) {
  const wsId = ws.view?.workspace?.id;
  const [data, setData] = useState(null);
  const [suppliers, setSuppliers] = useState(null);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    const [o, s] = await Promise.all([api.orders(wsId), api.suppliers()]);
    if (!o.ok) { setError(o.error); return; }
    setData(o.data);
    if (s.ok) setSuppliers(s.data);
  }, [api, wsId]);
  // the server's schedule is re-read whenever a newer workspace revision is saved (an edit that was still saving when
  // this screen opened must not leave the order form on the old lines)
  const savedRevision = ws.server?.snapshot?.workspace?.revision;
  useEffect(() => { load(); }, [load, savedRevision]);

  const caps = ws.capabilities || {};
  const kbInset = useKeyboardInset(); // room to scroll the last quantity above an on-screen keyboard
  const status = useMemo(() => new Map((data?.orderStatus || []).map((x) => [x.bucketKey, x])), [data]);
  const drafts = (data?.orders || []).filter((o) => o.status === "draft");
  const active = drafts.find((o) => o.id === activeId) || drafts[0] || null;

  async function newOrder() {
    setBusy(true); setMsg(null);
    const r = await api.createOrder(wsId, { id: newId(), supplierId: suppliers?.defaultSupplierId || null, delivery: { method: "delivery", address: jobAddress || "", addressSource: jobAddress ? "job" : null } });
    if (!r.ok) { setMsg(friendly(r)); setBusy(false); return; }
    // still needed = required − placed − already on another exported (sent-able) order (R04b R8)
    const lines = (data?.scheduleLines || []).map((l) => { const st = status.get(l.bucketKey); return { bucketKey: l.bucketKey, quantity: Math.max(0, (st?.remaining ?? l.quantity) - (st?.onExportedOrders || 0)) }; }).filter((l) => l.quantity > 0);
    if (lines.length) {
      const s = await api.saveOrder(r.data.order.id, { expectedRevision: r.data.order.revision, lines });
      if (!s.ok) setMsg(s.error);
    }
    setActiveId(r.data.order.id);
    await load();
    setBusy(false);
  }

  return (
    <div className="space-y-4" onFocus={keepFieldInView}>
      <div className="flex items-center gap-2">
        {onBack && <Btn kind="ghost" onClick={onBack}>‹ Back</Btn>}
        <h2 className="flex-1 text-base font-semibold text-ink">Orders</h2>
        {caps.export && <Btn kind="primary" onClick={newOrder} disabled={busy || !data || ws.dirty}>New order</Btn>}
      </div>
      <Banner tone="info">Exporting makes a PDF for you to send — it doesn&apos;t send or place anything. Send it to the supplier yourself, then record it as placed.</Banner>
      {ws.dirty && <Banner tone="warn">Saving your latest takeoff changes… orders use the saved version.</Banner>}
      {msg && <Banner tone="error">{msg}</Banner>}
      <AsyncState loading={!data && !error} error={error} onRetry={load}>
        {active && (
          <DraftOrder key={`${active.id}:${active.revision}`} api={api} order={active} data={data} status={status} suppliers={suppliers} ws={ws}
            onChanged={load} setMsg={setMsg} drafts={drafts} onPick={setActiveId} deviceDrafts={deviceDrafts} />
        )}
        <OrderHistory api={api} orders={data?.orders || []} caps={caps} onChanged={async () => { await load(); await ws.refreshOrderStatus?.(); }} setMsg={setMsg} />
      </AsyncState>
      {kbInset > 0 && <div aria-hidden="true" data-keyboard-spacer="" style={{ height: kbInset }} />}
    </div>
  );
}

function DraftOrder({ api, order, data, status, suppliers, ws, onChanged, setMsg, drafts, onPick, deviceDrafts = [] }) {
  const [extra, setExtra] = useState(false); // explicit "order more than is still needed" (spares)
  // unsaved changes typed on this device before a reload (same order, same saved revision only)
  const [restored, setRestored] = useState(() => readOrderDraft(order));
  const saved = useMemo(() => ({ supplierId: order.supplierId || "", delivery: order.delivery || {}, notes: order.notes || "",
    qty: Object.fromEntries(order.lines.map((l) => [l.bucketKey, l.quantity])), chosen: Object.fromEntries(order.lines.map((l) => [l.bucketKey, l.jobMaterialId])) }), [order]);
  const start = restored?.draft || saved;
  const [supplierId, setSupplierId] = useState(start.supplierId ?? saved.supplierId);
  const [delivery, setDelivery] = useState(start.delivery || saved.delivery);
  const [notes, setNotes] = useState(start.notes ?? saved.notes);
  // a restored quantity only for a line that is still on the order or in the takeoff (never a vanished bucket)
  const [qty, setQty] = useState(() => (start === saved ? saved.qty : Object.fromEntries(Object.entries(start.qty || {})
    .filter(([k, n]) => Number.isInteger(n) && n >= 0 && (k in saved.qty || (data.scheduleLines || []).some((l) => l.bucketKey === k))))));
  // the material each saved line was chosen for (kept on save; a changed material = stale, never relinked silently)
  const [chosen, setChosen] = useState(start.chosen || saved.chosen);
  // lines the user explicitly UPDATED: re-taken from the current schedule on save (a kept line is never relinked silently)
  const [refresh, setRefresh] = useState(() => new Set());
  const discardRestored = () => {
    setSupplierId(saved.supplierId); setDelivery(saved.delivery); setNotes(saved.notes); setQty(saved.qty); setChosen(saved.chosen);
    writeOrderDraft(order.id, null); setRestored(null);
  };
  const mats = useMemo(() => new Map((ws.view?.materials || []).map((m) => [m.id, m])), [ws.view]);
  const lineStates = useMemo(() => (ws.computed ? order.lines.map((l) => withGenericSuggestion({ line: l, ...orderLineState(l, ws.computed, mats) }, ws.computed)) : []), [order.lines, ws.computed, mats]);
  const staleLines = lineStates.filter((x) => x.stale && (qty[x.line.bucketKey] ?? 0) > 0);
  const labelFor = (sl) => {
    const m = sl.jobMaterialIds.map((id) => mats.get(id)).find(Boolean);
    if (!m) return "";
    if (isGenericLine(sl)) return `${m.name} · ${describeFamilySpec(m.spec).line}`;
    let spec = ""; try { spec = describeSpec(m.spec, m.profile).line; } catch { /* legacy */ }
    return `${m.name} · ${spec}`;
  };
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exportRes, setExportRes] = useState(null);
  // a quantity typed but not valid stays a draft in its field (never committed) — while one is showing, Save and
  // Export are blocked: the order would otherwise go out with the old number while the screen shows another
  const formRef = useRef(null);
  const [invalidFields, setInvalidFields] = useState(0);
  useEffect(() => {
    const el = formRef.current;
    if (!el || typeof MutationObserver === "undefined") return undefined;
    const count = () => setInvalidFields(el.querySelectorAll('input[aria-invalid="true"]').length);
    count();
    const mo = new MutationObserver(count);
    mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-invalid"] });
    return () => mo.disconnect();
  }, []);
  const lines = useMemo(() => data.scheduleLines || [], [data.scheduleLines]);
  const flashLines = lines.filter((l) => !isGenericLine(l));
  // TC-R04 lines grouped per material (the material's statuses travel with them)
  const genericGroups = useMemo(() => {
    const g = new Map();
    for (const l of lines) {
      if (!isGenericLine(l)) continue;
      const id = l.jobMaterialIds[0];
      if (!g.has(id)) g.set(id, { id, mat: mats.get(id) || null, lines: [] });
      g.get(id).lines.push(l);
    }
    // the job's material order — the same order as the schedule and the "still needed" review
    const seq = (ws.view?.materials || []).map((m) => m.id);
    const rank = (id) => { const i = seq.indexOf(id); return i < 0 ? 1e9 : i; };
    return [...g.values()].sort((a, b) => rank(a.id) - rank(b.id));
  }, [lines, mats, ws.view]);
  // what is on this order, per unit — flashing pieces/LM and every other unit kept apart
  const orderTotals = useMemo(() => {
    const info = new Map(lines.map((l) => [l.bucketKey, l]));
    for (const l of order.lines) if (!info.has(l.bucketKey)) info.set(l.bucketKey, l);
    let pieces = 0, mm = 0;
    const byUnit = new Map();
    for (const [k, n] of Object.entries(qty)) {
      const l = info.get(k);
      if (!l || !(n > 0)) continue;
      if (isGenericLine(l)) byUnit.set(l.unit || "piece", (byUnit.get(l.unit || "piece") || 0) + n);
      else { pieces += n; mm += (l.finishedLengthMm || 0) * n; }
    }
    const parts = [];
    if (pieces) parts.push(`${pieces} flashing ${pieces === 1 ? "piece" : "pieces"} (${fmtLm(mm / 1000)} LM)`);
    for (const [u, n] of [...byUnit].sort(byUnitOrder)) parts.push(qtyText(n, u));
    return parts;
  }, [qty, lines, order.lines]);
  // review summary (02 §6, J5 subset): what the takeoff still needs that this order leaves off, and materials with
  // nothing orderable yet — so a subset export never hides an omitted scope
  const omitted = useMemo(() => {
    const out = [];
    const byMat = new Map();
    // once THIS order has a supplier export, its own saved lines are part of "on exported orders" — don't count them twice
    const exportedHere = (order.exports || []).some((e) => !e.isDraft);
    for (const l of lines) {
      const st = status.get(l.bucketKey);
      const own = exportedHere ? order.lines.find((x) => x.bucketKey === l.bucketKey)?.quantity || 0 : 0;
      const left = Math.max(0, (st?.remaining ?? l.quantity) - Math.max(0, (st?.onExportedOrders || 0) - own));
      const off = left - (qty[l.bucketKey] ?? 0);
      if (off <= 0) continue;
      const id = l.jobMaterialIds[0];
      const e = byMat.get(id) || { flashing: !isGenericLine(l), units: new Map(), pieces: 0 };
      if (isGenericLine(l)) e.units.set(l.unit || "piece", (e.units.get(l.unit || "piece") || 0) + off);
      else e.pieces += off;
      byMat.set(id, e);
    }
    const rank = (id) => { const i = (ws.view?.materials || []).findIndex((m) => m.id === id); return i < 0 ? 1e9 : i; };
    for (const [id, e] of [...byMat].sort((a, b) => rank(a[0]) - rank(b[0]))) {   // the job's material order
      const parts = e.flashing ? [`${e.pieces} ${e.pieces === 1 ? "piece" : "pieces"}`] : [...e.units].sort(byUnitOrder).map(([u, n]) => qtyText(n, u));
      out.push({ key: id, text: `${mats.get(id)?.name || "A material"} — ${parts.join(" · ")}` });
    }
    const results = ws.computed?.materialResults || {};
    for (const m of ws.view?.materials || []) {
      const r = results[m.id];
      if (!r || lines.some((l) => l.jobMaterialIds.includes(m.id))) continue;
      const need = (r.problems || []).find((p) => p.blocking !== false);
      out.push({ key: `none-${m.id}`, text: `${m.name} — nothing to order yet${need ? ` (${need.message})` : ""}` });
    }
    for (const m of ws.view?.materials || []) {
      if (results[m.id]?.status?.installation === "out-of-scope") out.push({ key: `oos-${m.id}`, text: `${m.name} — by others / out of scope` });
    }
    return out;
  }, [lines, status, qty, mats, ws.computed, ws.view, order.exports, order.lines]);
  // the server words a stale line as a flashing "length"; for timber / sheets / bars say what it is
  const previewProblems = (preview?.problems || []).map((p) => {
    const code = STALE_CODES.find((c) => PROBLEM_TEXT[c] === p);
    const same = code ? staleLines.filter((x) => x.problem === code) : [];
    return same.length && same.every((x) => isGenericLine(x.line)) ? GENERIC_STALE[code] : p;
  });
  const invalidDrafts = (deviceDrafts || []).filter((x) => x.invalid > 0);
  const surplusAsked = !!preview?.problems?.some((p) => /already on/.test(p));
  const d = (k) => (v) => setDelivery((x) => ({ ...x, [k]: v, ...(k === "address" ? { addressSource: "entered" } : {}) }));

  const loadPreview = useCallback(async () => {
    const r = await api.previewOrder(order.id);
    if (r.ok) setPreview(r.data.preview);
  }, [api, order.id]);
  // re-check readiness whenever a newer workspace revision is saved (an edit still saving when this opened)
  const wsRevision = ws.server?.snapshot?.workspace?.revision;
  useEffect(() => { loadPreview(); }, [loadPreview, wsRevision]);

  async function save() {
    setBusy(true); setMsg(null);
    const body = { expectedRevision: order.revision, supplierId: supplierId || null, delivery, notes,
      lines: Object.entries(qty).filter(([, n]) => n > 0).map(([bucketKey, quantity]) => ({ bucketKey, quantity, jobMaterialId: chosen[bucketKey] || undefined, ...(refresh.has(bucketKey) ? { refresh: true } : {}) })) };
    const r = await api.saveOrder(order.id, body);
    if (!r.ok) setMsg(r.status === 409 ? "Someone else changed this order — it has been reloaded." : r.error);
    else { writeOrderDraft(order.id, null); setRefresh(new Set()); } // saved: nothing left to recover on this device
    await onChanged();
    setBusy(false);
  }

  async function exportPdf(isDraft) {
    setBusy(true); setMsg(null); setExportRes(null);
    const r = await api.exportOrder(order.id, { isDraft, idempotencyKey: `x-${newId()}`, expectedOrderRevision: order.revision, expectedWorkspaceRevision: ws.server?.snapshot?.workspace?.revision, acknowledgeSurplus: !isDraft && extra });
    if (r.ok) setExportRes({ ok: true, ...r.data.export });
    else setExportRes({ ok: false, error: friendly(r), code: r.code });
    await onChanged();
    setBusy(false);
  }

  const dirtyForm = refresh.size > 0 || supplierId !== (order.supplierId || "") || JSON.stringify(delivery) !== JSON.stringify(order.delivery || {}) || notes !== (order.notes || "")
    || Object.keys({ ...qty, ...Object.fromEntries(order.lines.map((l) => [l.bucketKey, 1])) }).some((k) => (qty[k] || 0) !== (order.lines.find((x) => x.bucketKey === k)?.quantity || 0)
      || (chosen[k] || null) !== (order.lines.find((x) => x.bucketKey === k)?.jobMaterialId || null));
  // keep unsaved changes on this device until they are saved (or undone back to the saved order)
  useEffect(() => {
    writeOrderDraft(order.id, dirtyForm ? { revision: order.revision, supplierId, delivery, notes, qty, chosen } : null);
  }, [dirtyForm, supplierId, delivery, notes, qty, chosen, order.id, order.revision]);

  // explicit reconcile of a stale line: switch it to what its material supplies now, or drop it
  // keeps EVERY piece the line covered (R04b R2): what other materials still supply stays on the old length
  // (now attributed to one of them), only the rest moves — and it's ADDED to anything already on the target
  const updateLine = (x) => {
    const r = reconcileStaleLine(qty, chosen, x);
    setQty(r.qty); setChosen(r.chosen);
    if (x.suggestion) setRefresh((s) => new Set(s).add(x.suggestion.bucketKey));
    setMsg(r.kept && !isGenericLine(x.line) ? `Kept ${r.kept} × ${fmtMm(x.line.finishedLengthMm)} mm for the other flashing in that colour and moved ${r.moved} to the new colour — check, then save.` : null);
  };
  const removeLine = (x) => { setQty((q) => ({ ...q, [x.line.bucketKey]: 0 })); setChosen((c) => { const n = { ...c }; delete n[x.line.bucketKey]; return n; }); };

  return (
    <section ref={formRef} className="space-y-3 rounded-card border border-hairline bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-sm font-semibold text-ink">Draft {order.orderRef}</h3>
        {drafts.length > 1 && (
          <select aria-label="Choose draft order" value={order.id} onChange={(e) => onPick(e.target.value)} className="min-h-[44px] rounded-lg border border-hairline text-sm">
            {drafts.map((o) => <option key={o.id} value={o.id}>{o.orderRef}</option>)}
          </select>
        )}
      </div>
      {restored?.draft && (
        <Banner tone="warn" action={<Btn kind="secondary" onClick={discardRestored}>Discard</Btn>}>
          <span data-testid="order-draft-restored">Restored changes you hadn&apos;t saved on this device. Save order details to keep them.</span>
        </Banner>
      )}
      {restored?.stale && (
        <Banner tone="warn"><span data-testid="order-draft-dropped">Changes you hadn&apos;t saved on this device were for an older version of this order, so they weren&apos;t restored.</span></Banner>
      )}
      <div>
        <label htmlFor="ord-supplier" className="mb-1 block text-xs font-medium text-muted">Supplier</label>
        <select id="ord-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="min-h-[44px] w-full rounded-lg border border-hairline text-base">
          <option value="">Choose a supplier…</option>
          {(suppliers?.suppliers || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {!suppliers?.suppliers?.length && <p className="mt-1 text-[11px] text-muted">No suppliers on file — add one in Operations › Procurement › Suppliers.</p>}
      </div>
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-muted">Delivery or pickup</legend>
        <div className="flex gap-2">
          {["delivery", "pickup"].map((m) => (
            <label key={m} className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border text-sm ${delivery.method === m ? "border-primary bg-primary/5 text-primary" : "border-hairline"}`}>
              <input type="radio" name={`method-${order.id}`} className="sr-only" checked={delivery.method === m} onChange={() => d("method")(m)} />{m === "delivery" ? "Deliver" : "Pick up"}
            </label>
          ))}
        </div>
      </fieldset>
      {delivery.method === "delivery" && <TextField label={`Delivery address${delivery.addressSource === "job" ? " (from the job)" : ""}`} value={delivery.address} onChange={d("address")} />}
      {delivery.method === "pickup" && <TextField label="Pickup branch" value={delivery.pickupBranch} onChange={d("pickupBranch")} />}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`req-${order.id}`} className="mb-1 block text-xs font-medium text-muted">Required by</label>
          <input id={`req-${order.id}`} type="date" value={delivery.requiredDate || ""} disabled={!!delivery.asap} onChange={(e) => d("requiredDate")(e.target.value || null)} className="min-h-[44px] w-full rounded-lg border border-hairline px-2 text-base disabled:opacity-50" />
          <label className="mt-1 flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 rounded text-primary" checked={!!delivery.asap} onChange={(e) => setDelivery((x) => ({ ...x, asap: e.target.checked, requiredDate: e.target.checked ? null : x.requiredDate }))} />As soon as possible</label>
        </div>
        <TextField label="Site contact" value={delivery.contactName} onChange={d("contactName")} />
        <TextField label="Contact phone" value={delivery.contactPhone} onChange={d("contactPhone")} />
        <TextField label="Notes for supplier" value={notes} onChange={setNotes} />
      </div>
      <div>
        {staleLines.length > 0 && (
          <div className="mb-2 space-y-2" data-testid="stale-lines">
            {staleLines.map((x) => (
              <Banner key={x.line.bucketKey} tone="warn">
                <p className="font-medium">{isGenericLine(x.line)
                  ? `${x.line.item?.description || "A material line"} — ${qtyText(qty[x.line.bucketKey], x.line.unit)}`
                  : `${fmtMm(x.line.finishedLengthMm)} mm × ${qty[x.line.bucketKey]}`} — needs updating</p>
                <p className="text-xs">{(isGenericLine(x.line) && GENERIC_STALE[x.problem]) || PROBLEM_TEXT[x.problem]}{x.current ? ` It is still listed as: ${labelFor(x.current)}.` : ""}</p>
                {x.suggestion && (isGenericLine(x.suggestion)
                  ? <p className="text-xs">The takeoff now needs: {qtyText(x.suggestion.quantity, x.suggestion.unit)} — {x.suggestion.item?.description || unitWord(x.suggestion.unit, 2)} ({mats.get(x.suggestion.jobMaterialIds[0])?.name || "this material"}).</p>
                  : <p className="text-xs">Its material is now: {labelFor(x.suggestion)}.</p>)}
                <div className="mt-1 flex flex-wrap gap-2">
                  {x.suggestion && <Btn kind="secondary" onClick={() => updateLine(x)}>{isGenericLine(x.line) ? "Update to what's needed now" : "Update to current material"}</Btn>}
                  {x.problem === "line_stale_quantity" && <Btn kind="secondary" onClick={() => setQty((q) => ({ ...q, [x.line.bucketKey]: x.current.quantity }))}>Set to {isGenericLine(x.line) ? qtyText(x.current.quantity, x.line.unit) : x.current.quantity}</Btn>}
                  <Btn kind="secondary" onClick={() => removeLine(x)}>Remove line</Btn>
                </div>
              </Banner>
            ))}
          </div>
        )}
        {flashLines.length > 0 && <p className="mb-1 text-xs font-medium text-muted">Lengths on this order</p>}
        {flashLines.length > 0 && <ul className="divide-y divide-hairline rounded-lg border border-hairline">
          {flashLines.map((l) => {
            const st = status.get(l.bucketKey);
            return (
              <li key={l.bucketKey} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm">
                <span className="flex-1">{fmtMm(l.finishedLengthMm)} mm{l.handlingFlag ? " · long" : ""}{l.problems.length ? <span className="ml-1 text-[11px] text-red-700">needs attention</span> : null}
                  <span className="block text-[11px] text-ink">{labelFor(l)}</span>
                  <span className="block text-[11px] text-muted">need {st?.required ?? l.quantity} · ordered {st?.ordered ?? 0} · left {st?.remaining ?? l.quantity}</span></span>
                <div className="w-28"><NumberField label="Qty" unit="pcs" integer min={0} value={qty[l.bucketKey] ?? 0} onCommit={(n) => setQty((q) => ({ ...q, [l.bucketKey]: n }))} /></div>
              </li>
            );
          })}
        </ul>}
        {genericGroups.length > 0 && <p className="mb-1 mt-3 text-xs font-medium text-muted">Materials on this order</p>}
        <div className="space-y-2">
          {genericGroups.map((g) => (
            <div key={g.id} className="rounded-lg border border-hairline" data-order-group={g.id}>
              <div className="space-y-1 border-b border-hairline px-2 py-1.5">
                <p className="text-sm font-medium text-ink">{g.mat?.name || "Material"}<span className="block text-[11px] font-normal text-muted">{g.mat ? describeFamilySpec(g.mat.spec).line : ""}</span></p>
                <StatusChips status={ws.computed?.materialResults?.[g.id]?.status} lines={g.lines} />
              </div>
              <ul className="divide-y divide-hairline">
                {g.lines.map((l) => {
                  const st = status.get(l.bucketKey);
                  const n = qty[l.bucketKey] ?? 0;
                  const need = st?.required ?? l.quantity;
                  return (
                    <li key={l.bucketKey} className="space-y-1.5 px-2 py-2 text-sm" data-order-line={l.bucketKey} data-unit={l.unit}>
                      <p className="break-words text-ink">{l.item?.description || unitWord(l.unit, 2)}
                        {l.unit === "lm" && <span className="ml-1 inline-block rounded bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-800">estimate — not a piece count</span>}
                        {l.problems.length > 0 && <span className="ml-1 inline-block rounded bg-red-50 px-1.5 text-[11px] font-semibold text-red-700">needs attention</span>}
                        <span className="block text-[11px] text-muted">need {qtyText(need, l.unit)} · ordered {qtyText(st?.ordered ?? 0, l.unit)} · left {st?.remaining ?? l.quantity}</span>
                      </p>
                      {/* a line can't order more than the takeoff needs (the supplier export refuses it) — no hidden over-order */}
                      <QtyStepper label="Order quantity" hint={l.item?.description} unit={l.unit} value={n} max={Math.max(need, n)}
                        overMessage={`The takeoff needs ${qtyText(need, l.unit)} — an order line can't be more than that.`} onChange={(v) => setQty((q) => ({ ...q, [l.bucketKey]: v }))} />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        {orderTotals.length > 0 && <p className="mt-2 text-xs text-ink" data-testid="order-totals"><span className="font-medium">On this order:</span> {orderTotals.join(" · ")}</p>}
      </div>
      {invalidFields > 0 && (
        <Banner tone="error">A quantity above isn&apos;t a valid number, so it hasn&apos;t been used — fix it (or tap − / +) before saving or exporting.</Banner>
      )}
      {omitted.length > 0 && (
        <div className="rounded-lg border border-hairline bg-page px-3 py-2 text-xs text-ink" data-testid="not-on-order">
          <p className="font-medium">Still needed but not on this order:</p>
          <ul className="ml-4 list-disc">{omitted.map((x) => <li key={x.key}>{x.text}</li>)}</ul>
        </div>
      )}
      {/* 02 §6: accessory groups by others, excluded or not decided are named in the review — never silently zero */}
      <AccessoryScopeReview materials={ws.view?.materials} results={ws.computed?.materialResults} />
      {dirtyForm && <Btn kind="primary" className="w-full" onClick={save} disabled={busy || invalidFields > 0}>Save order details</Btn>}
      {invalidDrafts.length > 0 && (
        <Banner tone="warn">{invalidDrafts.map((x) => x.name).join(", ")}: a size typed on this device isn&apos;t valid yet, so the drawing on this order may be out of date. Open the flashing and fix it before sending.</Banner>
      )}
      {surplusAsked && (
        <label className="flex min-h-[44px] items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 text-sm text-amber-900">
          <input type="checkbox" className="h-5 w-5 rounded text-primary" checked={extra} onChange={(e) => setExtra(e.target.checked)} />
          Order these extra pieces anyway (spares) — I know some are already ordered
        </label>
      )}
      {preview && !dirtyForm && (preview.problems.length
        ? <Banner tone="warn"><p className="font-medium">Not ready to order yet:</p><ul className="ml-4 list-disc text-xs">{[...new Set(previewProblems)].map((p) => <li key={p}>{p}</li>)}</ul></Banner>
        : <Banner tone="ok">Ready: {readyText(preview.snapshot.totals)} to {preview.snapshot.supplier?.name}.</Banner>)}
      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => exportPdf(true)} disabled={busy || dirtyForm || ws.dirty || invalidFields > 0}>Export draft PDF</Btn>
        <Btn kind="primary" onClick={() => exportPdf(false)} disabled={busy || dirtyForm || ws.dirty || invalidFields > 0 || !preview || preview.problems.some((p) => !(extra && /already on/.test(p))) || invalidDrafts.length > 0 || staleLines.length > 0}>Export supplier PDF</Btn>
      </div>
      {exportRes && (exportRes.ok
        ? <Banner tone="ok" action={<div className="flex flex-wrap gap-2"><Btn onClick={() => openPdf(api, exportRes.exportId, setMsg)}>Open PDF</Btn>
          {api.exportAppendix && <Btn onClick={() => openPdf(api, exportRes.exportId, setMsg, "appendix")}>Site appendix (cutting &amp; setout)</Btn>}</div>}>Export {exportRes.exportNo}{exportRes.isDraft ? " (draft)" : ""} is frozen. Nothing has been sent.</Banner>
        : <Banner tone="error">{exportRes.error}</Banner>)}
    </section>
  );
}

function OrderHistory({ api, orders, caps, onChanged, setMsg }) {
  const [placing, setPlacing] = useState(null); // order id
  const [form, setForm] = useState({ exportId: "", placedOn: todayYmd(), supplierReference: "", acknowledgeSurplus: false, needsAck: null });
  const [cancelFor, setCancelFor] = useState(null);
  const [reason, setReason] = useState("");
  const placeKey = useRef(null); // one idempotency key per "record placed" attempt, reused on retry
  const history = orders.filter((o) => o.exports.length || o.placements.length);
  if (!history.length) return null;

  async function place(order) {
    setMsg(null);
    const r = await api.placeOrder(order.id, { exportId: form.exportId, placedOn: form.placedOn, supplierReference: form.supplierReference, acknowledgeSurplus: form.acknowledgeSurplus, idempotencyKey: placeKey.current });
    if (!r.ok) {
      if (r.code === "SURPLUS") { setForm((f) => ({ ...f, needsAck: r.error })); return; }
      setMsg(friendly(r)); return;
    }
    setPlacing(null); setForm({ exportId: "", placedOn: todayYmd(), supplierReference: "", acknowledgeSurplus: false, needsAck: null });
    await onChanged();
  }
  async function cancel(placementId) {
    const r = await api.cancelPlacement(placementId, reason);
    if (!r.ok) { setMsg(friendly(r)); return; }
    setCancelFor(null); setReason(""); await onChanged();
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-ink">Order history</h3>
      {history.map((o) => {
        const ready = o.exports.filter((e) => !e.isDraft && e.artifactStatus === "ready");
        const placedNow = o.placements.find((p) => p.status === "placed");
        return (
          <div key={o.id} className="space-y-2 rounded-card border border-hairline bg-white p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex-1 font-medium text-ink">{o.orderRef}</p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${o.status === "placed" ? "bg-emerald-50 text-emerald-700" : o.status === "cancelled" ? "bg-slate-100 text-muted" : "bg-sky-50 text-sky-700"}`}>
                {o.status === "placed" ? "Placed externally" : o.status === "cancelled" ? "Cancelled" : "Draft"}
              </span>
            </div>
            <ul className="space-y-1">
              {o.exports.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="flex-1">Export {e.exportNo}{e.isDraft ? " (draft)" : ""} · {new Date(e.createdAt).toLocaleString("en-AU")} · {e.artifactStatus === "ready" ? "PDF ready" : e.artifactStatus === "failed" ? "PDF failed" : "PDF pending"}</span>
                  {e.artifactStatus === "ready" && <Btn kind="ghost" onClick={() => openPdf(api, e.id, setMsg)}>Open</Btn>}
                  {api.exportAppendix && <Btn kind="ghost" onClick={() => openPdf(api, e.id, setMsg, "appendix")}>Site appendix (cutting &amp; setout)</Btn>}
                  {e.artifactStatus !== "ready" && caps.export && <Btn kind="ghost" onClick={async () => { const r = await api.retryExport(e.id); if (!r.ok) setMsg(r.error); await onChanged(); }}>Retry PDF</Btn>}
                </li>
              ))}
            </ul>
            {o.placements.map((p) => (
              <p key={p.id} className="text-xs text-muted">
                {p.status === "placed" ? "Placed" : "Cancelled"} {p.placedOn}{p.supplierReference ? ` · ref ${p.supplierReference}` : ""} (export {o.exports.find((e) => e.id === p.exportId)?.exportNo})
                {p.status === "cancelled" ? ` — ${p.cancelReason}` : ""}{p.surplusAcknowledged ? " · includes confirmed surplus" : ""}
              </p>
            ))}
            {caps.placeOrders && api.placeOrder && o.status === "draft" && ready.length > 0 && (placing === o.id ? (
              <div className="space-y-2 rounded-lg bg-page p-2">
                <label className="block text-xs font-medium text-muted" htmlFor={`exp-${o.id}`}>Which PDF did you send?</label>
                <select id={`exp-${o.id}`} value={form.exportId} onChange={(e) => setForm((f) => ({ ...f, exportId: e.target.value }))} className="min-h-[44px] w-full rounded-lg border border-hairline text-base">
                  <option value="">Choose export…</option>
                  {ready.map((e) => <option key={e.id} value={e.id}>Export {e.exportNo}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <div><label htmlFor={`pd-${o.id}`} className="mb-1 block text-xs font-medium text-muted">Date placed</label>
                    <input id={`pd-${o.id}`} type="date" value={form.placedOn} onChange={(e) => setForm((f) => ({ ...f, placedOn: e.target.value }))} className="min-h-[44px] w-full rounded-lg border border-hairline px-2" /></div>
                  <TextField label="Supplier reference" value={form.supplierReference} onChange={(v) => setForm((f) => ({ ...f, supplierReference: v }))} />
                </div>
                {form.needsAck && (
                  <label className="flex min-h-[44px] items-start gap-2 text-xs text-amber-900">
                    <input type="checkbox" className="mt-1 h-5 w-5 rounded" checked={form.acknowledgeSurplus} onChange={(e) => setForm((f) => ({ ...f, acknowledgeSurplus: e.target.checked }))} />
                    {form.needsAck} Tick to record it anyway.
                  </label>
                )}
                <div className="flex gap-2"><Btn onClick={() => setPlacing(null)}>Cancel</Btn><Btn kind="primary" className="flex-1" disabled={!form.exportId || !form.placedOn} onClick={() => place(o)}>Record order placed</Btn></div>
              </div>
            ) : <Btn onClick={() => { placeKey.current = `p-${newId()}`; setPlacing(o.id); }}>Record order placed…</Btn>)}
            {caps.placeOrders && api.cancelPlacement && placedNow && (cancelFor === placedNow.id ? (
              <div className="space-y-2 rounded-lg bg-page p-2">
                <TextField label="Reason for cancelling" value={reason} onChange={setReason} />
                <div className="flex gap-2"><Btn onClick={() => setCancelFor(null)}>Back</Btn><Btn kind="danger" className="flex-1" disabled={!reason.trim()} onClick={() => cancel(placedNow.id)}>Record cancellation</Btn></div>
              </div>
            ) : <Btn kind="danger" onClick={() => setCancelFor(placedNow.id)}>Record a cancellation…</Btn>)}
            {o.status === "placed" && <p className="text-[11px] text-muted">Placed orders are locked. For more pieces, start a new order.</p>}
          </div>
        );
      })}
    </section>
  );
}

/** "15 pieces · 38.123 LM" for flashing-only orders (as before); every other unit listed on its own. */
function readyText(t) {
  const parts = [];
  const others = Object.entries(t?.byUnit || {}).filter(([, n]) => n > 0).sort(byUnitOrder);
  if (t?.pieces) parts.push(`${t.pieces} ${others.length ? "flashing pieces" : "pieces"} · ${fmtLm(t.totalLm)} LM`);
  for (const [u, n] of others) parts.push(qtyText(n, u));
  return parts.join(" · ") || "nothing selected";
}

/**
 * Whole-number quantity with − / + (44 px targets) and the unit beside it. Typing is a draft until it is a valid
 * whole number (shown inline, never committed); the focused field scrolls clear of the on-screen keyboard.
 */
function QtyStepper({ label, hint, unit, value, onChange, min = 0, max = 10000, overMessage }) {
  const id = useId();
  const [text, setText] = useState(String(value ?? 0));
  const [err, setErr] = useState(null);
  useEffect(() => { setText(String(value ?? 0)); setErr(null); }, [value]);
  const commit = () => {
    const n = Number(text.replace(/,/g, "").trim());
    if (text.trim() === "" || !Number.isInteger(n) || n < min) { setErr(`Enter a whole number of ${unitWord(unit, 2)} (${min} or more).`); return; }
    if (n > max) { setErr(overMessage || `That's more than ${max.toLocaleString("en-AU")} ${unitWord(unit, 2)} — check the number.`); return; }
    setErr(null);
    if (n !== value) onChange(n);
  };
  const step = (d) => onChange(Math.min(max, Math.max(min, (value ?? 0) + d)));
  const btn = "flex min-h-[44px] min-w-[44px] items-center justify-center border border-hairline bg-white text-lg font-semibold text-ink disabled:opacity-40";
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">{label}{hint && <span className="sr-only"> for {hint}</span>} ({unitWord(unit, 2)})</label>
      <div className="flex items-stretch">
        <button type="button" className={`${btn} rounded-l-lg`} aria-label={`Fewer ${unitWord(unit, 2)}${hint ? ` of ${hint}` : ""}`} disabled={(value ?? 0) <= min} onClick={() => step(-1)}>−</button>
        <input id={id} inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          onFocus={(e) => { const el = e.currentTarget; setTimeout(() => el.scrollIntoView?.({ block: "center", behavior: "smooth" }), 300); }}
          aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined}
          className="min-h-[44px] w-16 min-w-0 border-x-0 border-y border-hairline px-1 text-center text-base text-ink focus:ring-2 focus:ring-primary" />
        <span className="flex items-center border-y border-hairline bg-page px-2 text-sm text-muted">{unitWord(unit, 2)}</span>
        <button type="button" className={`${btn} rounded-r-lg`} aria-label={`More ${unitWord(unit, 2)}${hint ? ` of ${hint}` : ""}`} disabled={(value ?? 0) >= max} onClick={() => step(1)}>+</button>
      </div>
      {err && <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-red-700">{err}</p>}
    </div>
  );
}

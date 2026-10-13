// =============================================================================
// OrdersScreen — Review/export + Order history (R03 §12).
// * One supplier per order. Lines default to what is still needed (required − placed).
// * Draft PDF (watermarked) any time; supplier PDF only when every readiness check passes.
//   Exporting freezes a snapshot. It sends NOTHING and orders NOTHING.
// * "Record order placed" (directors only) ties the exact exported PDF to a supplier
//   reference/date. Placed orders are locked; extra quantities = a new order; a cancellation
//   is recorded explicitly with a reason. Required / ordered / remaining come from placed
//   records only.
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { newId } from "../../lib/takeoffApi.js";
import { PROBLEM_TEXT, describeSpec, orderLineState } from "../../../shared/takeoff/index.js";
import { AsyncState, Banner, Btn, NumberField, TextField } from "./ui.jsx";
import { fmtLm, fmtMm } from "./format.js";

/** Plain message for a dropped connection instead of the browser's "Failed to fetch". */
const friendly = (r) => (r?.network || /Failed to fetch|Load failed|NetworkError/i.test(r?.error || "") ? "No connection — try again when you're back online. Nothing was sent." : r?.error);

const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

async function openPdf(api, exportId, setMsg) {
  const win = window.open("about:blank", "_blank"); // before the await so popup blockers allow it
  const r = await api.exportPdf(exportId);
  if (!r.ok) { win?.close(); setMsg(friendly(r) || "Couldn't open the PDF."); return; }
  const url = URL.createObjectURL(new Blob([r.bytes], { type: "application/pdf" }));
  if (win) win.location.href = url; else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function OrdersScreen({ api, ws, jobAddress, onBack }) {
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
  useEffect(() => { load(); }, [load]);

  const caps = ws.capabilities || {};
  const status = useMemo(() => new Map((data?.orderStatus || []).map((x) => [x.bucketKey, x])), [data]);
  const drafts = (data?.orders || []).filter((o) => o.status === "draft");
  const active = drafts.find((o) => o.id === activeId) || drafts[0] || null;

  async function newOrder() {
    setBusy(true); setMsg(null);
    const r = await api.createOrder(wsId, { id: newId(), supplierId: suppliers?.defaultSupplierId || null, delivery: { method: "delivery", address: jobAddress || "", addressSource: jobAddress ? "job" : null } });
    if (!r.ok) { setMsg(friendly(r)); setBusy(false); return; }
    const lines = (data?.scheduleLines || []).map((l) => ({ bucketKey: l.bucketKey, quantity: status.get(l.bucketKey)?.remaining ?? l.quantity })).filter((l) => l.quantity > 0);
    if (lines.length) {
      const s = await api.saveOrder(r.data.order.id, { expectedRevision: r.data.order.revision, lines });
      if (!s.ok) setMsg(s.error);
    }
    setActiveId(r.data.order.id);
    await load();
    setBusy(false);
  }

  return (
    <div className="space-y-4">
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
            onChanged={load} setMsg={setMsg} drafts={drafts} onPick={setActiveId} />
        )}
        <OrderHistory api={api} orders={data?.orders || []} caps={caps} onChanged={load} setMsg={setMsg} />
      </AsyncState>
    </div>
  );
}

function DraftOrder({ api, order, data, status, suppliers, ws, onChanged, setMsg, drafts, onPick }) {
  const [supplierId, setSupplierId] = useState(order.supplierId || "");
  const [delivery, setDelivery] = useState(order.delivery || {});
  const [notes, setNotes] = useState(order.notes || "");
  const [qty, setQty] = useState(() => Object.fromEntries(order.lines.map((l) => [l.bucketKey, l.quantity])));
  // the material each saved line was chosen for (kept on save; a changed material = stale, never relinked silently)
  const [chosen, setChosen] = useState(() => Object.fromEntries(order.lines.map((l) => [l.bucketKey, l.jobMaterialId])));
  const mats = useMemo(() => new Map((ws.view?.materials || []).map((m) => [m.id, m])), [ws.view]);
  const lineStates = useMemo(() => (ws.computed ? order.lines.map((l) => ({ line: l, ...orderLineState(l, ws.computed, mats) })) : []), [order.lines, ws.computed, mats]);
  const staleLines = lineStates.filter((x) => x.stale && (qty[x.line.bucketKey] ?? 0) > 0);
  const labelFor = (sl) => {
    const m = sl.jobMaterialIds.map((id) => mats.get(id)).find(Boolean);
    return m ? `${m.name} · ${describeSpec(m.spec, m.profile).line}` : "";
  };
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exportRes, setExportRes] = useState(null);
  const lines = data.scheduleLines || [];
  const d = (k) => (v) => setDelivery((x) => ({ ...x, [k]: v, ...(k === "address" ? { addressSource: "entered" } : {}) }));

  const loadPreview = useCallback(async () => {
    const r = await api.previewOrder(order.id);
    if (r.ok) setPreview(r.data.preview);
  }, [api, order.id]);
  useEffect(() => { loadPreview(); }, [loadPreview]);

  async function save() {
    setBusy(true); setMsg(null);
    const body = { expectedRevision: order.revision, supplierId: supplierId || null, delivery, notes,
      lines: Object.entries(qty).filter(([, n]) => n > 0).map(([bucketKey, quantity]) => ({ bucketKey, quantity, jobMaterialId: chosen[bucketKey] || undefined })) };
    const r = await api.saveOrder(order.id, body);
    if (!r.ok) setMsg(r.status === 409 ? "Someone else changed this order — it has been reloaded." : r.error);
    await onChanged();
    setBusy(false);
  }

  async function exportPdf(isDraft) {
    setBusy(true); setMsg(null); setExportRes(null);
    const r = await api.exportOrder(order.id, { isDraft, idempotencyKey: `x-${newId()}`, expectedOrderRevision: order.revision, expectedWorkspaceRevision: ws.server?.snapshot?.workspace?.revision });
    if (r.ok) setExportRes({ ok: true, ...r.data.export });
    else setExportRes({ ok: false, error: friendly(r), code: r.code });
    await onChanged();
    setBusy(false);
  }

  const dirtyForm = supplierId !== (order.supplierId || "") || JSON.stringify(delivery) !== JSON.stringify(order.delivery || {}) || notes !== (order.notes || "")
    || Object.keys({ ...qty, ...Object.fromEntries(order.lines.map((l) => [l.bucketKey, 1])) }).some((k) => (qty[k] || 0) !== (order.lines.find((x) => x.bucketKey === k)?.quantity || 0)
      || (chosen[k] || null) !== (order.lines.find((x) => x.bucketKey === k)?.jobMaterialId || null));

  // explicit reconcile of a stale line: switch it to what its material supplies now, or drop it
  const updateLine = (x) => {
    const to = x.suggestion;
    setQty((q) => { const n = { ...q }; const was = n[x.line.bucketKey] || 0; delete n[x.line.bucketKey]; n[to.bucketKey] = Math.min(Math.max(was, 1), to.quantity); return n; });
    setChosen((c) => { const n = { ...c }; delete n[x.line.bucketKey]; n[to.bucketKey] = x.line.jobMaterialId; return n; });
  };
  const removeLine = (x) => { setQty((q) => ({ ...q, [x.line.bucketKey]: 0 })); setChosen((c) => { const n = { ...c }; delete n[x.line.bucketKey]; return n; }); };

  return (
    <section className="space-y-3 rounded-card border border-hairline bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-sm font-semibold text-ink">Draft {order.orderRef}</h3>
        {drafts.length > 1 && (
          <select aria-label="Choose draft order" value={order.id} onChange={(e) => onPick(e.target.value)} className="min-h-[44px] rounded-lg border border-hairline text-sm">
            {drafts.map((o) => <option key={o.id} value={o.id}>{o.orderRef}</option>)}
          </select>
        )}
      </div>
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
          <label htmlFor={`req-${order.id}`} className="mb-1 block text-xs font-medium text-muted">Required by (optional)</label>
          <input id={`req-${order.id}`} type="date" value={delivery.requiredDate || ""} onChange={(e) => d("requiredDate")(e.target.value || null)} className="min-h-[44px] w-full rounded-lg border border-hairline px-2 text-base" />
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
                <p className="font-medium">{fmtMm(x.line.finishedLengthMm)} mm × {qty[x.line.bucketKey]} — needs updating</p>
                <p className="text-xs">{PROBLEM_TEXT[x.problem]}{x.current ? ` It is still listed as: ${labelFor(x.current)}.` : ""}</p>
                {x.suggestion && <p className="text-xs">Its material is now: {labelFor(x.suggestion)}.</p>}
                <div className="mt-1 flex flex-wrap gap-2">
                  {x.suggestion && <Btn kind="secondary" onClick={() => updateLine(x)}>Update to current material</Btn>}
                  {x.problem === "line_stale_quantity" && <Btn kind="secondary" onClick={() => setQty((q) => ({ ...q, [x.line.bucketKey]: x.current.quantity }))}>Set to {x.current.quantity}</Btn>}
                  <Btn kind="secondary" onClick={() => removeLine(x)}>Remove line</Btn>
                </div>
              </Banner>
            ))}
          </div>
        )}
        <p className="mb-1 text-xs font-medium text-muted">Lengths on this order</p>
        <ul className="divide-y divide-hairline rounded-lg border border-hairline">
          {lines.map((l) => {
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
        </ul>
      </div>
      {dirtyForm && <Btn kind="primary" className="w-full" onClick={save} disabled={busy}>Save order details</Btn>}
      {preview && !dirtyForm && (preview.problems.length
        ? <Banner tone="warn"><p className="font-medium">Not ready to order yet:</p><ul className="ml-4 list-disc text-xs">{preview.problems.map((p) => <li key={p}>{p}</li>)}</ul></Banner>
        : <Banner tone="ok">Ready: {preview.snapshot.totals.pieces} pieces · {fmtLm(preview.snapshot.totals.totalLm)} LM to {preview.snapshot.supplier?.name}.</Banner>)}
      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => exportPdf(true)} disabled={busy || dirtyForm || ws.dirty}>Export draft PDF</Btn>
        <Btn kind="primary" onClick={() => exportPdf(false)} disabled={busy || dirtyForm || ws.dirty || !preview || preview.problems.length > 0}>Export supplier PDF</Btn>
      </div>
      {exportRes && (exportRes.ok
        ? <Banner tone="ok" action={<Btn onClick={() => openPdf(api, exportRes.exportId, setMsg)}>Open PDF</Btn>}>Export {exportRes.exportNo}{exportRes.isDraft ? " (draft)" : ""} is frozen. Nothing has been sent.</Banner>
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

// Procurement Intelligence (BQ-10) — P2/P3 UI: Calendar, Board, Suppliers,
// Long-Lead tabs + the AI-draft modal. Imported by src/pages/Procurement.jsx.
//
// CLAUDE.md Law: apiFetch/apiPost/apiPatch only; camelCase from API; tokens not hex.
import { useEffect, useMemo, useState, useCallback } from "react";
import { apiFetch, apiPost, apiPatch } from "../../lib/apiFetch.js";
import {
  PROCUREMENT_STATUS_LABELS, PROCUREMENT_RISK_LABELS,
} from "../../lib/constants.js";

// ── shared helpers ────────────────────────────────────────────────────────────
const RISK_PILL = {
  on_track: "bg-success/10 text-success", watch: "bg-warning/10 text-warning",
  at_risk: "bg-orange-100 text-orange-700", critical: "bg-red-100 text-red-700",
  blocked: "bg-purple-100 text-purple-700",
};
export function RiskPill({ risk }) {
  if (!risk) return null;
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${RISK_PILL[risk] || "bg-slate-100 text-slate-600"}`}>{PROCUREMENT_RISK_LABELS[risk] || risk}</span>;
}
const fdate = (d) => (d ? new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "2-digit" }) : "—");

function JobPicker({ jobOptions, value, onChange }) {
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-hairline px-3 py-2 text-sm bg-surface focus-ring">
      <option value="">Select a job…</option>
      {jobOptions.map((j) => <option key={j.jobId} value={j.jobId}>{j.address}</option>)}
    </select>
  );
}

// ── AI draft modal (subject/body + copy) — used for supplier email + reminder ──
export function AiDraftModal({ title, draft, onClose }) {
  if (!draft) return null;
  const copy = () => navigator.clipboard?.writeText(`${draft.subject ? `Subject: ${draft.subject}\n\n` : ""}${draft.body || ""}`);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-surface rounded-card border border-hairline max-w-2xl w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-ink">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink text-lg leading-none">✕</button>
        </div>
        <p className="text-xs text-warning mb-3">Draft only — review and send it yourself. The Hub never auto-sends or auto-orders.</p>
        {draft.to && <p className="text-xs text-muted mb-1">To: {draft.to}</p>}
        {draft.subject && <p className="text-sm font-semibold text-ink mb-2">Subject: {draft.subject}</p>}
        <pre className="whitespace-pre-wrap text-sm text-ink bg-page rounded-lg p-3 border border-hairline max-h-[50vh] overflow-y-auto">{draft.body}</pre>
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={copy} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white">Copy</button>
          <button type="button" onClick={onClose} className="rounded-lg border border-hairline px-3 py-1.5 text-sm font-semibold text-ink">Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Calendar tab — per-job timeline of order-by + delivery events ─────────────
export function CalendarTab({ jobOptions, selectedJobId, setSelectedJobId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!selectedJobId) { setItems([]); return; }
    setLoading(true);
    apiFetch(`/api/procurement/jobs/${selectedJobId}/items`).then(({ ok, data }) => { setItems(ok ? data.items || [] : []); setLoading(false); });
  }, [selectedJobId]);

  const events = useMemo(() => {
    const ev = [];
    for (const it of items) {
      if (it.orderByDate) ev.push({ date: it.orderByDate, kind: "order", item: it });
      const del = it.expectedDeliveryDate || it.deliveredAt;
      if (del) ev.push({ date: del, kind: "delivery", item: it });
    }
    return ev.sort((a, b) => a.date.localeCompare(b.date));
  }, [items]);

  const weeks = useMemo(() => {
    const map = new Map();
    for (const e of events) {
      const d = new Date(e.date); const day = (d.getDay() + 6) % 7; // Monday=0
      const monday = new Date(d); monday.setDate(d.getDate() - day);
      const key = monday.toISOString().slice(0, 10);
      (map.get(key) || map.set(key, []).get(key)).push(e);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [events]);

  return (
    <div>
      <div className="mb-4"><JobPicker jobOptions={jobOptions} value={selectedJobId} onChange={setSelectedJobId} /></div>
      {!selectedJobId && <div className="rounded-card border border-hairline bg-surface p-10 text-center text-sm text-muted">Select a job to see its order-by and delivery timeline.</div>}
      {selectedJobId && loading && <div className="text-sm text-muted py-10 text-center">Loading…</div>}
      {selectedJobId && !loading && !events.length && <div className="rounded-card border border-hairline bg-surface p-10 text-center text-sm text-muted">No dated items yet — set on-site dates or generate the plan.</div>}
      {weeks.map(([week, evs]) => (
        <div key={week} className="mb-4">
          <div className="text-xs font-bold text-muted mb-1">Week of {fdate(week)}</div>
          <div className="rounded-card border border-hairline bg-surface divide-y divide-hairline">
            {evs.map((e, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${e.kind === "order" ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"}`}>{e.kind === "order" ? "ORDER BY" : "DELIVERY"}</span>
                  <span className="font-medium text-ink truncate">{e.item.itemName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted">{fdate(e.date)}</span>
                  <RiskPill risk={e.item.riskStatus} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Board tab — Kanban-by-lane for a job (move via status dropdown) ───────────
const LANES = [
  { key: "to_start", label: "To start", statuses: ["not_started", "scope_required"] },
  { key: "quoting", label: "Quoting", statuses: ["quote_requested", "quote_received"] },
  { key: "blocked", label: "Blocked", statuses: ["waiting_on_selection", "waiting_on_clarification"] },
  { key: "approve", label: "Approve", statuses: ["ready_for_approval", "approved"] },
  { key: "ordered", label: "Ordered", statuses: ["po_drafted", "po_sent", "order_confirmed", "delivery_booked"] },
  { key: "done", label: "Delivered", statuses: ["delivered", "closed"] },
];
const STATUS_TO_LANE = {};
for (const l of LANES) for (const s of l.statuses) STATUS_TO_LANE[s] = l.key;

export function BoardTab({ jobOptions, selectedJobId, setSelectedJobId, canEdit }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(() => {
    if (!selectedJobId) { setItems([]); return; }
    setLoading(true);
    apiFetch(`/api/procurement/jobs/${selectedJobId}/items`).then(({ ok, data }) => { setItems(ok ? data.items || [] : []); setLoading(false); });
  }, [selectedJobId]);
  useEffect(() => { load(); }, [load]);

  const move = async (id, status) => {
    const { ok, data, error } = await apiPatch(`/api/procurement/items/${id}`, { status });
    if (ok && data.item) setItems((arr) => arr.map((r) => (r.id === id ? data.item : r)));
    else window.alert(error || "Couldn't update the status — please retry.");
  };
  const byLane = useMemo(() => {
    const m = Object.fromEntries(LANES.map((l) => [l.key, []]));
    for (const it of items) (m[STATUS_TO_LANE[it.status] || "to_start"] ||= []).push(it);
    return m;
  }, [items]);

  return (
    <div>
      <div className="mb-4"><JobPicker jobOptions={jobOptions} value={selectedJobId} onChange={setSelectedJobId} /></div>
      {!selectedJobId && <div className="rounded-card border border-hairline bg-surface p-10 text-center text-sm text-muted">Select a job to see the procurement board.</div>}
      {selectedJobId && loading && <div className="text-sm text-muted py-10 text-center">Loading…</div>}
      {selectedJobId && !loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {LANES.map((lane) => (
            <div key={lane.key} className="rounded-card border border-hairline bg-page/50">
              <div className="px-3 py-2 border-b border-hairline flex items-center justify-between">
                <span className="text-xs font-bold text-ink">{lane.label}</span>
                <span className="text-[11px] text-muted">{byLane[lane.key]?.length || 0}</span>
              </div>
              <div className="p-2 space-y-2 min-h-[60px]">
                {(byLane[lane.key] || []).map((it) => (
                  <div key={it.id} className="rounded-lg border border-hairline bg-surface p-2">
                    <div className="text-xs font-medium text-ink mb-1">{it.itemName}</div>
                    <div className="flex items-center justify-between gap-1">
                      <RiskPill risk={it.riskStatus} />
                      {it.orderByDate && <span className="text-[10px] text-muted">{fdate(it.orderByDate)}</span>}
                    </div>
                    {canEdit && (
                      <select value={it.status} onChange={(e) => move(it.id, e.target.value)} className="mt-1 w-full rounded border border-hairline px-1 py-0.5 text-[11px] bg-surface">
                        {Object.entries(PROCUREMENT_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Long-Lead tab — cross-job long-lead criticals ─────────────────────────────
export function LongLeadTab({ onOpenItem }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { apiFetch("/api/procurement/long-lead").then(({ ok, data }) => { setItems(ok ? data.items || [] : []); setLoading(false); }); }, []);
  if (loading) return <div className="text-sm text-muted py-10 text-center">Loading…</div>;
  if (!items.length) return <div className="rounded-card border border-hairline bg-surface p-10 text-center text-sm text-muted">No long-lead items in flight.</div>;
  return (
    <div className="rounded-card border border-hairline bg-surface divide-y divide-hairline">
      {items.map((it) => (
        <div key={it.id} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-page cursor-pointer" onClick={() => onOpenItem && onOpenItem(it.jobId)}>
          <div className="min-w-0">
            <div className="text-sm font-medium text-ink truncate">{it.itemName}</div>
            <div className="text-xs text-muted truncate">{it.jobAddress || "—"} · lead {it.leadTimeDays ?? "?"}d</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {it.orderByDate && <span className={`text-xs ${it.daysUntilOrderBy < 0 ? "text-red-600 font-semibold" : "text-muted"}`}>order by {fdate(it.orderByDate)}</span>}
            <RiskPill risk={it.riskStatus} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Suppliers tab — management + performance (learning) ───────────────────────
const BLANK_SUPPLIER = { name: "", contactName: "", email: "", phone: "", accountTerms: "", usualLeadTimeDays: "", isPreferred: false, usualProducts: "" };
export function SuppliersTab({ canEdit }) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // null | {…} (add/edit)
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => { apiFetch("/api/procurement/suppliers").then(({ ok, data }) => { setSuppliers(ok ? data.suppliers || [] : []); setLoading(false); }); }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const body = { ...form, usualLeadTimeDays: form.usualLeadTimeDays === "" ? null : Number(form.usualLeadTimeDays) };
    const res = form.id ? await apiPatch(`/api/procurement/suppliers/${form.id}`, body) : await apiPost("/api/procurement/suppliers", body);
    setSaving(false);
    if (res.ok) { setForm(null); load(); } else window.alert(res.error || "Save failed");
  };
  const refreshPerf = async (id) => {
    const { ok, error } = await apiPost(`/api/procurement/suppliers/${id}/refresh-performance`, {});
    if (ok) load(); else window.alert(error || "Couldn't refresh performance.");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-muted">{suppliers.length} suppliers</span>
        {canEdit && <button type="button" onClick={() => setForm({ ...BLANK_SUPPLIER })} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">+ Add supplier</button>}
      </div>

      {loading ? <div className="text-sm text-muted py-10 text-center">Loading…</div> : suppliers.length === 0 ? (
        <div className="rounded-card border border-hairline bg-surface p-10 text-center text-sm text-muted">No suppliers yet — add your material vendors (Bone Timber, window/truss/steel suppliers…).</div>
      ) : (
        <div className="rounded-card border border-hairline bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-hairline text-left text-xs font-semibold text-muted">
              <th className="px-3 py-2">Supplier</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">Lead (d)</th>
              <th className="px-3 py-2">On-time</th><th className="px-3 py-2">Lead var</th><th className="px-3 py-2">Learned</th><th className="px-3 py-2">Orders</th>{canEdit && <th></th>}
            </tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-b border-hairline last:border-0">
                  <td className="px-3 py-2"><span className="font-medium text-ink">{s.name}</span>{s.isPreferred && <span className="ml-1 rounded bg-accent/10 px-1 text-[10px] font-bold text-accent">PREF</span>}</td>
                  <td className="px-3 py-2 text-xs text-muted">{s.contactName || "—"}{s.email ? ` · ${s.email}` : ""}</td>
                  <td className="px-3 py-2 text-xs">{s.usualLeadTimeDays ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{s.onTimeRate != null ? `${s.onTimeRate}%` : "—"}</td>
                  <td className="px-3 py-2 text-xs">{s.avgLeadVarianceDays != null ? `${s.avgLeadVarianceDays > 0 ? "+" : ""}${s.avgLeadVarianceDays}d` : "—"}</td>
                  <td className="px-3 py-2 text-xs">{s.learnedLeadTimeDays ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{s.completedOrders || 0}</td>
                  {canEdit && <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button type="button" onClick={() => refreshPerf(s.id)} className="text-xs text-muted hover:text-primary mr-2" title="Recompute performance from delivery history">↻</button>
                    <button type="button" onClick={() => setForm({ id: s.id, name: s.name, contactName: s.contactName || "", email: s.email || "", phone: s.phone || "", accountTerms: s.accountTerms || "", usualLeadTimeDays: s.usualLeadTimeDays ?? "", isPreferred: !!s.isPreferred, usualProducts: s.usualProducts || "" })} className="text-xs text-primary">Edit</button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setForm(null)}>
          <div className="bg-surface rounded-card border border-hairline max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-ink mb-3">{form.id ? "Edit supplier" : "Add supplier"}</h3>
            <div className="space-y-2">
              {[["name", "Name *"], ["contactName", "Contact person"], ["email", "Email"], ["phone", "Phone"], ["accountTerms", "Account terms"], ["usualProducts", "Usual products"]].map(([k, label]) => (
                <input key={k} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} placeholder={label} className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-surface" />
              ))}
              <input type="number" value={form.usualLeadTimeDays} onChange={(e) => setForm((f) => ({ ...f, usualLeadTimeDays: e.target.value }))} placeholder="Usual lead time (days)" className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-surface" />
              <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={form.isPreferred} onChange={(e) => setForm((f) => ({ ...f, isPreferred: e.target.checked }))} /> Preferred supplier</label>
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={save} disabled={!form.name || saving} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
              <button type="button" onClick={() => setForm(null)} className="rounded-lg border border-hairline px-3 py-1.5 text-sm font-semibold text-ink">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

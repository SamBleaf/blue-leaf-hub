// Procurement Intelligence (BQ-10) — Command Centre + Register + Selections.
// Route: /operations/procurement (Operations module).
//
// CLAUDE.md Law: apiFetch/apiPost/apiPatch/apiDelete only (never authFetch);
// camelCase from the API; status enums + labels from constants.js; tokens not hex.
import { useEffect, useMemo, useState, useCallback } from "react";
import { apiFetch, apiPost, apiPatch, apiDelete } from "../lib/apiFetch.js";
import { useAuth } from "../lib/useAuth.js";
import { useProject } from "../lib/ProjectContext.jsx";
import {
  PROCUREMENT_STATUS, PROCUREMENT_STATUS_LABELS, PROCUREMENT_RISK_LABELS,
  SUPPLY_TYPE, SUPPLY_TYPE_LABELS,
} from "../lib/constants.js";

// ── small presentational helpers ─────────────────────────────────────────────
const RISK_PILL = {
  on_track: "bg-success/10 text-success",
  watch:    "bg-warning/10 text-warning",
  at_risk:  "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
  blocked:  "bg-purple-100 text-purple-700",
};
const SOURCE_PILL = {
  template:              "bg-slate-100 text-slate-600",
  estimate:             "bg-primary/10 text-primary",
  "template+estimate":  "bg-primary/10 text-primary",
  schedule:             "bg-accent/10 text-accent",
  rfq:                  "bg-indigo-100 text-indigo-700",
  project_intelligence: "bg-indigo-100 text-indigo-700",
  manual:               "bg-slate-100 text-slate-500",
};
const SOURCE_LABEL = {
  template: "Template", estimate: "Estimate", "template+estimate": "Tmpl+Est",
  schedule: "Schedule", rfq: "RFQ", project_intelligence: "Intel", manual: "Manual",
};

function RiskPill({ risk }) {
  if (!risk) return null;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${RISK_PILL[risk] || "bg-slate-100 text-slate-600"}`}>
      {PROCUREMENT_RISK_LABELS[risk] || risk}
    </span>
  );
}
function SourceBadge({ source }) {
  if (!source) return null;
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${SOURCE_PILL[source] || "bg-slate-100 text-slate-500"}`}>
      {SOURCE_LABEL[source] || source}
    </span>
  );
}
const fmtMoney = (n) => (n == null || n === "" ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "2-digit" }) : "—");
const daysLabel = (n) => (n == null ? "" : n < 0 ? `${Math.abs(n)}d overdue` : `${n}d`);

const STATUS_OPTIONS = Object.values(PROCUREMENT_STATUS);
const SUPPLY_OPTIONS = Object.values(SUPPLY_TYPE);

// ── page ──────────────────────────────────────────────────────────────────────
export default function Procurement() {
  const { role } = useAuth();
  const { project, allProjects } = useProject();
  const isAdmin = role === "admin";
  const canEdit = role === "admin" || role === "supervisor";
  const [tab, setTab] = useState("command");

  // jobs available for the register (projects that have a linked job)
  const jobOptions = useMemo(
    () => (allProjects || [])
      .map((p) => ({ jobId: p.jobId || p.job_id, address: p.address }))
      .filter((p) => p.jobId),
    [allProjects]
  );
  const currentJobId = project?.jobId || project?.job_id || null;
  const [selectedJobId, setSelectedJobId] = useState(currentJobId);
  useEffect(() => { if (currentJobId) setSelectedJobId(currentJobId); }, [currentJobId]);

  const openInRegister = useCallback((jobId) => { setSelectedJobId(jobId); setTab("register"); }, []);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-ink">Procurement</h1>
      </div>
      <p className="text-sm text-muted mb-5">No surprises — order-by dates, selection blockers and long-lead risks across every job.</p>

      <div className="flex gap-1 border-b border-hairline mb-6">
        {[
          { id: "command", label: "Command Centre" },
          { id: "register", label: "Register" },
          { id: "selections", label: "Selections" },
        ].map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition -mb-px ${
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "command" && <CommandCentre onOpenItem={openInRegister} />}
      {tab === "register" && (
        <Register
          jobOptions={jobOptions} selectedJobId={selectedJobId} setSelectedJobId={setSelectedJobId}
          isAdmin={isAdmin} canEdit={canEdit}
        />
      )}
      {tab === "selections" && <Selections jobOptions={jobOptions} onOpenItem={openInRegister} />}
    </div>
  );
}

// ── Command Centre ──────────────────────────────────────────────────────────
const CC_SECTIONS = [
  { key: "overdue",           title: "Order-by overdue",      tone: "critical" },
  { key: "dueSoon",           title: "Order-by due (≤21 days)", tone: "watch" },
  { key: "selectionBlockers", title: "Selection blockers",    tone: "blocked" },
  { key: "awaitingQuotes",    title: "Awaiting quotes",       tone: "watch" },
  { key: "deliveryRisks",     title: "Delivery risks",        tone: "at_risk" },
  { key: "longLeadCriticals", title: "Long-lead criticals",   tone: "critical" },
  { key: "needsDate",         title: "Needs a date",          tone: "info" },
];

function CommandCentre({ onOpenItem }) {
  const [buckets, setBuckets] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      const { ok, data, error } = await apiFetch("/api/procurement/command-centre");
      if (!live) return;
      if (ok) setBuckets(data.buckets); else setErr(error || "Failed to load");
      setLoading(false);
    })();
    return () => { live = false; };
  }, []);

  if (loading) return <div className="text-sm text-muted py-10 text-center">Loading…</div>;
  if (err) return <div className="rounded-card border border-red-200 bg-red-50 text-red-700 text-sm p-4">{err}</div>;

  const total = CC_SECTIONS.reduce((a, s) => a + (buckets?.[s.key]?.length || 0), 0);
  if (!total) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-10 text-center">
        <div className="text-lg font-semibold text-ink mb-1">Nothing at risk this week</div>
        <div className="text-sm text-muted">Generate a plan on a locked job, or check back as order-by dates approach.</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {CC_SECTIONS.map((s) => {
        const rows = buckets?.[s.key] || [];
        if (!rows.length) return null;
        return (
          <div key={s.key} className="rounded-card border border-hairline bg-surface overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-hairline">
              <h3 className="text-sm font-bold text-ink">{s.title}</h3>
              <span className="text-xs font-semibold text-muted">{rows.length}</span>
            </div>
            <ul className="divide-y divide-hairline">
              {rows.slice(0, 12).map((it) => (
                <li key={it.id} className="px-4 py-2.5 hover:bg-page cursor-pointer" onClick={() => onOpenItem(it.jobId)}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink truncate">{it.itemName}</div>
                      <div className="text-xs text-muted truncate">{it.jobAddress || "—"}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {it.orderByDate && (
                        <span className={`text-xs font-medium ${it.daysUntilOrderBy < 0 ? "text-red-600" : "text-muted"}`}>
                          {fmtDate(it.orderByDate)} · {daysLabel(it.daysUntilOrderBy)}
                        </span>
                      )}
                      <RiskPill risk={it.riskStatus} />
                    </div>
                  </div>
                </li>
              ))}
              {rows.length > 12 && <li className="px-4 py-2 text-xs text-muted">+{rows.length - 12} more…</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ── Register ──────────────────────────────────────────────────────────────────
function Register({ jobOptions, selectedJobId, setSelectedJobId, isAdmin, canEdit }) {
  const [items, setItems] = useState([]);
  const [committed, setCommitted] = useState(0);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const load = useCallback(async (jobId) => {
    if (!jobId) { setItems([]); return; }
    setLoading(true); setErr(null);
    const { ok, data, error } = await apiFetch(`/api/procurement/jobs/${jobId}/items`);
    if (ok) { setItems(data.items || []); setCommitted(data.committed || 0); }
    else setErr(error || "Failed to load register");
    setLoading(false);
  }, []);

  useEffect(() => { load(selectedJobId); }, [selectedJobId, load]);
  useEffect(() => {
    (async () => { const { ok, data } = await apiFetch("/api/procurement/suppliers"); if (ok) setSuppliers(data.suppliers || []); })();
  }, []);

  const patchItem = async (id, patch) => {
    const { ok, data } = await apiPatch(`/api/procurement/items/${id}`, patch);
    if (ok && data.item) setItems((arr) => arr.map((r) => (r.id === id ? data.item : r)));
  };
  const removeItem = async (id) => {
    if (!window.confirm("Remove this item from the register? (Regenerate won't bring it back.)")) return;
    const { ok } = await apiDelete(`/api/procurement/items/${id}`);
    if (ok) setItems((arr) => arr.filter((r) => r.id !== id));
  };
  const regenerate = async () => {
    setBusy(true);
    const { ok, error } = await apiPost(`/api/procurement/jobs/${selectedJobId}/generate`, {});
    setBusy(false); setConfirmRegen(false);
    if (ok) load(selectedJobId); else window.alert(error || "Generation failed");
  };
  const addItem = async () => {
    const name = window.prompt("Item name?");
    if (!name) return;
    const { ok, data, error } = await apiPost("/api/procurement/items", { jobId: selectedJobId, itemName: name });
    if (ok && data.item) setItems((arr) => [data.item, ...arr]); else window.alert(error || "Add failed");
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={selectedJobId || ""} onChange={(e) => setSelectedJobId(e.target.value)}
          className="rounded-lg border border-hairline px-3 py-2 text-sm bg-surface focus-ring">
          <option value="">Select a job…</option>
          {jobOptions.map((j) => <option key={j.jobId} value={j.jobId}>{j.address}</option>)}
        </select>
        {selectedJobId && (
          <>
            <span className="text-sm text-muted">{items.length} items{isAdmin && committed ? ` · committed ${fmtMoney(committed)}` : ""}</span>
            <div className="ml-auto flex gap-2">
              {canEdit && <button type="button" onClick={addItem} className="rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink hover:bg-page">+ Add item</button>}
              {canEdit && <button type="button" onClick={() => setConfirmRegen(true)} disabled={busy} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{busy ? "Generating…" : "Regenerate"}</button>}
            </div>
          </>
        )}
      </div>

      {confirmRegen && (
        <div className="rounded-card border border-warning/40 bg-warning/5 p-4 mb-4 text-sm">
          <p className="text-ink font-medium mb-2">Regenerate the register from the template + estimate?</p>
          <p className="text-muted mb-3">Your manual edits are preserved (items you changed or removed stay as-is). New template/estimate items are added and dates refreshed.</p>
          <div className="flex gap-2">
            <button type="button" onClick={regenerate} disabled={busy} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Yes, regenerate</button>
            <button type="button" onClick={() => setConfirmRegen(false)} className="rounded-lg border border-hairline px-3 py-1.5 text-sm font-semibold text-ink">Cancel</button>
          </div>
        </div>
      )}

      {!selectedJobId && <div className="rounded-card border border-hairline bg-surface p-10 text-center text-sm text-muted">Select a job to view its procurement register.</div>}
      {selectedJobId && loading && <div className="text-sm text-muted py-10 text-center">Loading…</div>}
      {selectedJobId && err && <div className="rounded-card border border-red-200 bg-red-50 text-red-700 text-sm p-4">{err}</div>}
      {selectedJobId && !loading && !err && items.length === 0 && (
        <div className="rounded-card border border-hairline bg-surface p-10 text-center">
          <div className="text-base font-semibold text-ink mb-1">No procurement items yet</div>
          <div className="text-sm text-muted mb-3">Generate the plan from the master template (and Buildxact estimate, if linked).</div>
          {canEdit && <button type="button" onClick={() => setConfirmRegen(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Generate procurement plan</button>}
        </div>
      )}

      {selectedJobId && !loading && items.length > 0 && (
        <div className="rounded-card border border-hairline bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs font-semibold text-muted">
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Supply</th>
                <th className="px-3 py-2">On-site</th>
                <th className="px-3 py-2">Lead (d)</th>
                <th className="px-3 py-2">Order by</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Risk</th>
                {isAdmin && <th className="px-3 py-2 text-right">Allowance</th>}
                {isAdmin && <th className="px-3 py-2 text-right">Approved</th>}
                {canEdit && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-hairline last:border-0 hover:bg-page/50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-ink">{it.itemName}</span>
                      <SourceBadge source={it.source} />
                      {it.matchExisting && <span className="rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700" title="Match existing — discontinued-product risk">MATCH</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <select value={it.supplyType} onChange={(e) => patchItem(it.id, { supply_type: e.target.value })}
                        className="rounded border border-hairline px-1 py-0.5 text-xs bg-surface">
                        {SUPPLY_OPTIONS.map((s) => <option key={s} value={s}>{SUPPLY_TYPE_LABELS[s]}</option>)}
                      </select>
                    ) : <span className="text-xs text-muted">{SUPPLY_TYPE_LABELS[it.supplyType]}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <input type="date" defaultValue={it.requiredOnSiteDate || ""} onBlur={(e) => e.target.value !== (it.requiredOnSiteDate || "") && patchItem(it.id, { required_on_site_date: e.target.value || null })}
                        className="rounded border border-hairline px-1 py-0.5 text-xs bg-surface w-[120px]" />
                    ) : <span className="text-xs">{fmtDate(it.requiredOnSiteDate)}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <input type="number" defaultValue={it.leadTimeDays ?? ""} onBlur={(e) => String(e.target.value) !== String(it.leadTimeDays ?? "") && patchItem(it.id, { lead_time_days: e.target.value })}
                        className="rounded border border-hairline px-1 py-0.5 text-xs bg-surface w-[60px]" />
                    ) : <span className="text-xs">{it.leadTimeDays ?? "—"}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs font-medium ${!it.orderByDate ? "text-muted" : ""}`} title="Computed: on-site − lead − approval − review">
                      {it.orderByDate ? fmtDate(it.orderByDate) : "needs date"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <select value={it.supplierId || ""} onChange={(e) => patchItem(it.id, { supplier_id: e.target.value || null })}
                        className="rounded border border-hairline px-1 py-0.5 text-xs bg-surface max-w-[130px]">
                        <option value="">—</option>
                        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    ) : <span className="text-xs text-muted">{suppliers.find((s) => s.id === it.supplierId)?.name || "—"}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <select value={it.status} onChange={(e) => patchItem(it.id, { status: e.target.value })}
                        className="rounded border border-hairline px-1 py-0.5 text-xs bg-surface">
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{PROCUREMENT_STATUS_LABELS[s]}</option>)}
                      </select>
                    ) : <span className="text-xs">{PROCUREMENT_STATUS_LABELS[it.status]}</span>}
                  </td>
                  <td className="px-3 py-2"><RiskPill risk={it.riskStatus} /></td>
                  {isAdmin && (
                    <td className="px-3 py-2 text-right">
                      <input type="number" defaultValue={it.costAllowance ?? ""} onBlur={(e) => String(e.target.value) !== String(it.costAllowance ?? "") && patchItem(it.id, { cost_allowance: e.target.value })}
                        className="rounded border border-hairline px-1 py-0.5 text-xs bg-surface w-[90px] text-right" />
                    </td>
                  )}
                  {isAdmin && (
                    <td className="px-3 py-2 text-right">
                      <input type="number" defaultValue={it.approvedAmount ?? ""} onBlur={(e) => String(e.target.value) !== String(it.approvedAmount ?? "") && patchItem(it.id, { approved_amount: e.target.value })}
                        className="rounded border border-hairline px-1 py-0.5 text-xs bg-surface w-[90px] text-right" />
                    </td>
                  )}
                  {canEdit && (
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => removeItem(it.id)} className="text-xs text-muted hover:text-red-600" title="Remove from register">✕</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Selections (blockers) ─────────────────────────────────────────────────────
function Selections({ jobOptions, onOpenItem }) {
  const [jobId, setJobId] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const url = jobId ? `/api/procurement/selections/blockers?jobId=${jobId}` : "/api/procurement/selections/blockers";
    const { ok, data } = await apiFetch(url);
    setRows(ok ? data.blockers || [] : []);
    setLoading(false);
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  const confirmSelection = async (id) => {
    await apiPatch(`/api/procurement/items/${id}`, { selection_status: "confirmed" });
    load();
  };
  const draftReminder = (it) => {
    // Drafts only — sending is explicit/manual via the client portal or email (never auto-send).
    window.alert(`Reminder draft for "${it.itemName}":\n\nThis selection is needed by ${fmtDate(it.orderByDate)} to keep the order on schedule. Please confirm your choice.\n\n(Send this via the client portal or your email — the Hub does not auto-send.)`);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="rounded-lg border border-hairline px-3 py-2 text-sm bg-surface focus-ring">
          <option value="">All jobs</option>
          {jobOptions.map((j) => <option key={j.jobId} value={j.jobId}>{j.address}</option>)}
        </select>
        <span className="text-sm text-muted">{rows.length} selection{rows.length === 1 ? "" : "s"} pending</span>
      </div>

      {loading && <div className="text-sm text-muted py-10 text-center">Loading…</div>}
      {!loading && rows.length === 0 && (
        <div className="rounded-card border border-hairline bg-surface p-10 text-center">
          <div className="text-base font-semibold text-ink mb-1">All selections confirmed</div>
          <div className="text-sm text-muted">No client or architect decisions are holding up an order.</div>
        </div>
      )}
      {!loading && rows.length > 0 && (
        <div className="rounded-card border border-hairline bg-surface divide-y divide-hairline">
          {rows.map((it) => (
            <div key={it.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink truncate">{it.itemName}</span>
                  <RiskPill risk={it.riskStatus} />
                </div>
                <div className="text-xs text-muted">
                  {it.decision ? `Decision: ${it.decision.title} (${it.decision.status})` : "No portal decision linked"}
                  {it.orderByDate ? ` · order by ${fmtDate(it.orderByDate)} (${daysLabel(it.daysUntilOrderBy)})` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={() => draftReminder(it)} className="rounded-lg border border-hairline px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-page">Draft reminder</button>
                <button type="button" onClick={() => confirmSelection(it.id)} className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90">Mark confirmed</button>
                <button type="button" onClick={() => onOpenItem(it.jobId)} className="text-xs text-primary font-semibold">Open →</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

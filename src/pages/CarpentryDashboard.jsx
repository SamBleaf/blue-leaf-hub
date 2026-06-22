import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, apiPost } from "../lib/apiFetch.js";
import {
  CARPENTRY_JOB_STATUSES,
  CARPENTRY_JOB_STATUS_LABELS,
  CARPENTRY_PROJECT_TYPES,
  CARPENTRY_PROJECT_TYPE_LABELS,
} from "../lib/constants.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n) {
  if (n == null) return "—";
  return `${Number(n).toFixed(1)}%`;
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_BADGE = {
  active:       "bg-emerald-100 text-emerald-800",
  on_hold:      "bg-amber-100   text-amber-800",
  defects:      "bg-orange-100  text-orange-800",
  complete:     "bg-blue-100    text-blue-800",
  cancelled:    "bg-gray-100    text-gray-500",
};

// ── New Job Modal ─────────────────────────────────────────────────────────────

function NewJobModal({ onClose, onCreated }) {
  const [, setStep]                 = useState("form"); // "form" | "bxLookup" | "confirm"
  const [bxJobId, setBxJobId]       = useState("");
  const [bxLoading, setBxLoading]   = useState(false);
  const [xlsxBusy, setXlsxBusy]     = useState(false);
  const [bxError, setBxError]       = useState(null);
  const [estimateCategories, setEstimateCategories] = useState([]);
  const [debugJson, setDebugJson]   = useState("");
  const [debugBusy, setDebugBusy]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState(null);

  const [form, setForm] = useState({
    clientName:    "",
    clientContact: "",
    clientPhone:   "",
    clientEmail:   "",
    address:       "",
    description:   "",
    projectType:   CARPENTRY_PROJECT_TYPES.FULL_PACKAGE,
    quotedValue:   "",
    quotedCost:    "",
    startDate:     "",
    endDate:       "",
    storeyCount:   "1",
    floorAreaM2:   "",
    notes:         "",
    buildexactJobId: "",
    buildexactEstimateId: "",
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // TEMP: dump the raw Buildxact estimate JSON so the category/line-item field shapes
  // can be mapped and the Fetch grouping fixed. Remove once Fetch works directly.
  async function handleDebugDump() {
    const ref = bxJobId.trim();
    if (!ref) { setDebugJson("Enter a job number above first."); return; }
    setDebugBusy(true);
    setDebugJson("");
    const { ok, data, error } = await apiFetch(`/api/carpentry/buildexact/debug?job=${encodeURIComponent(ref)}`);
    setDebugBusy(false);
    setDebugJson(ok ? JSON.stringify(data, null, 2) : `Error: ${error || "debug failed"}`);
  }

  async function handleBxFetch() {
    if (!bxJobId.trim()) return;
    setBxLoading(true);
    setBxError(null);
    const { ok: ok_, data, error } = await apiPost("/api/carpentry/buildexact/fetch", {
      buildexactJobId: bxJobId.trim(),
    });
    setBxLoading(false);
    if (!ok_) {
      setBxError(error || "Could not fetch from Buildexact.");
      return;
    }
    const p = data?.prefill || {};
    // Financials always come from the Estimate Items XLSX (Step 2) — the API estimate
    // is cost-only / often ungrouped, so we do NOT seed the budget from the fetch.
    setForm((f) => ({
      ...f,
      buildexactJobId: p.buildexactJobId || bxJobId.trim(),
      clientName:    p.clientName    || f.clientName,
      clientContact: p.clientContact || f.clientContact,
      clientPhone:   p.clientPhone   || f.clientPhone,
      clientEmail:   p.clientEmail   || f.clientEmail,
      address:       p.address       || f.address,
      description:   p.description   || f.description,
      quotedValue:   p.quotedValue != null ? String(p.quotedValue) : f.quotedValue,
    }));
    setStep("form");
  }

  async function handleXlsxFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setXlsxBusy(true);
    setBxError(null);
    try {
      const dataBase64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onerror = () => reject(new Error("read failed"));
        r.onload = () => resolve(String(r.result).replace(/^data:.*;base64,/, ""));
        r.readAsDataURL(file);
      });
      const { ok: ok_, data, error } = await apiPost("/api/carpentry/estimate/parse-xlsx", { dataBase64, filename: file.name });
      if (!ok_) { setBxError(error || "Could not read the estimate file."); return; }
      const p = data?.prefill || {};
      setEstimateCategories(Array.isArray(data?.prefill?.categories) ? data.prefill.categories : []);
      const storey = /triple/i.test(p.buildingType) ? "3" : /double/i.test(p.buildingType) ? "2" : null;
      setForm((f) => ({
        ...f,
        clientName:  p.clientName  || f.clientName,
        address:     p.address     || f.address,
        description: p.description || f.description,
        quotedValue: p.quotedValue != null ? String(p.quotedValue) : f.quotedValue,
        storeyCount: storey || f.storeyCount,
      }));
    } catch {
      setBxError("Could not read that file — make sure it is the Buildexact estimate XLSX.");
    } finally {
      setXlsxBusy(false);
    }
  }

  async function handleSave() {
    setSaveError(null);
    if (!form.clientName.trim()) { setSaveError("Client name is required."); return; }
    if (!form.address.trim())    { setSaveError("Address is required."); return; }

    setSaving(true);
    const { ok: ok_, data, error } = await apiPost("/api/carpentry/jobs", {
      ...form,
      quotedValue:  form.quotedValue  ? Number(form.quotedValue)  : undefined,
      quotedCost:   form.quotedCost   ? Number(form.quotedCost)   : undefined,
      storeyCount:  form.storeyCount  ? Number(form.storeyCount)  : 1,
      floorAreaM2:  form.floorAreaM2  ? Number(form.floorAreaM2)  : undefined,
      startDate:    form.startDate    || undefined,
      endDate:      form.endDate      || undefined,
    });
    if (!ok_) { setSaving(false); setSaveError(error || "Failed to create job."); return; }
    // Seed budget lines from the imported estimate categories (labour vs material)
    if (estimateCategories.length && data?.job?.id) {
      await apiPost(`/api/carpentry/jobs/${data.job.id}/budget/seed`, { categories: estimateCategories });
    }
    setSaving(false);
    onCreated(data.job);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-hairline">
          <h2 className="text-lg font-semibold text-ink">New Carpentry Job</h2>
          <button onClick={onClose} className="text-muted hover:text-ink transition-colors text-xl leading-none">&times;</button>
        </div>

        {/* Buildexact import — use BOTH: Fetch fills the details, the Estimate Items XLSX gives the budget */}
        <div className="px-5 pt-4 pb-3 bg-slate-50 border-b border-hairline">
          {/* Step 1 — details from the Buildexact API */}
          <p className="text-xs text-muted mb-2 font-medium">STEP 1 — FETCH DETAILS FROM BUILDEXACT (job no. → client, contact, address)</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={bxJobId}
              onChange={(e) => setBxJobId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleBxFetch()}
              placeholder="Enter Buildexact Job ID / number…"
              className="flex-1 border border-hairline rounded-lg px-3 py-2 text-sm focus-ring"
            />
            <button
              onClick={handleBxFetch}
              disabled={!bxJobId.trim() || bxLoading}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              {bxLoading ? "Fetching…" : "Fetch"}
            </button>
          </div>
          {form.buildexactJobId && (
            <p className="text-xs text-emerald-700 mt-1">✓ Details imported — client &amp; site fields pre-filled below.</p>
          )}

          {/* Step 2 — financials from the Estimate Items XLSX (always the source of truth for $) */}
          <div className="mt-3 pt-3 border-t border-hairline/60">
            <p className="text-xs text-muted mb-2 font-medium">STEP 2 — UPLOAD THE ESTIMATE ITEMS XLSX (budget &amp; financials)</p>
            <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-primary text-primary text-sm font-medium cursor-pointer hover:bg-primary/5 transition-colors ${xlsxBusy ? "opacity-40 pointer-events-none" : ""}`}>
              {xlsxBusy ? "Reading…" : estimateCategories.length ? "Replace estimate XLSX" : "Choose estimate items XLSX"}
              <input type="file" accept=".xlsx,.xls" onChange={handleXlsxFile} className="hidden" />
            </label>
            {estimateCategories.length > 0 && (
              <p className="text-xs text-emerald-700 mt-1">
                ✓ Budget loaded — {estimateCategories.length} categories, sell {fmt$(estimateCategories.reduce((s, c) => s + Number(c.sellExGst ?? c.subtotalExGst ?? 0), 0))} ex-GST
              </p>
            )}
            <p className="text-[11px] text-muted mt-1">Use the <strong>Estimate Items</strong> export (not Categories &amp; Items) — it carries the marked-up sell price per category.</p>
          </div>
          {bxError && <p className="text-xs text-red-600 mt-1">{bxError}</p>}
          {/* TEMP diagnostic — dumps the raw Buildxact estimate JSON to map field shapes. Remove once Fetch grouping is fixed. */}
          <button
            type="button"
            onClick={handleDebugDump}
            disabled={debugBusy}
            className="text-[11px] text-muted/70 underline mt-2 disabled:opacity-40"
          >
            {debugBusy ? "Loading raw estimate…" : "Debug: show raw estimate JSON"}
          </button>
          {debugJson && (
            <textarea
              readOnly
              value={debugJson}
              onFocus={(e) => e.target.select()}
              className="w-full h-40 mt-1 border border-hairline rounded-lg px-2 py-1.5 text-[10px] font-mono bg-gray-50"
            />
          )}
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Row: Client name + contact */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Client (builder) <span className="text-red-500">*</span></label>
              <input
                value={form.clientName}
                onChange={(e) => set("clientName", e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring"
                placeholder="ABC Constructions"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Contact person</label>
              <input
                value={form.clientContact}
                onChange={(e) => set("clientContact", e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring"
                placeholder="John Smith"
              />
            </div>
          </div>

          {/* Row: phone + email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Phone</label>
              <input
                value={form.clientPhone}
                onChange={(e) => set("clientPhone", e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring"
                placeholder="0400 000 000"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Email</label>
              <input
                type="email"
                value={form.clientEmail}
                onChange={(e) => set("clientEmail", e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring"
                placeholder="contact@builder.com.au"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Site address <span className="text-red-500">*</span></label>
            <input
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring"
              placeholder="123 Example St, Suburb SA 5000"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Description / scope</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring resize-none"
              placeholder="Brief scope notes e.g. 'Double storey frame + fit-off, raked ceilings…'"
            />
          </div>

          {/* Row: project type + storeys */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Project type</label>
              <select
                value={form.projectType}
                onChange={(e) => set("projectType", e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring bg-white"
              >
                {Object.entries(CARPENTRY_PROJECT_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Storeys</label>
              <input
                type="number"
                min={1}
                value={form.storeyCount}
                onChange={(e) => set("storeyCount", e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring"
              />
            </div>
          </div>

          {/* Row: quoted value + quoted cost */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Quoted value (ex GST)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.quotedValue}
                  onChange={(e) => set("quotedValue", e.target.value)}
                  className="w-full border border-hairline rounded-lg pl-7 pr-3 py-2 text-sm focus-ring"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Budgeted cost (ex GST)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.quotedCost}
                  onChange={(e) => set("quotedCost", e.target.value)}
                  className="w-full border border-hairline rounded-lg pl-7 pr-3 py-2 text-sm focus-ring"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Row: floor area */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Floor area (m²)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.floorAreaM2}
                onChange={(e) => set("floorAreaM2", e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring"
                placeholder="0.00"
              />
            </div>
            <div /> {/* spacer */}
          </div>

          {/* Row: dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Planned start</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Planned completion</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus-ring resize-none"
              placeholder="Any additional notes…"
            />
          </div>

          {saveError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {saveError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-hairline">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-hairline text-sm text-ink hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-40 transition-colors"
          >
            {saving ? "Creating…" : "Create Job"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stats Banner ──────────────────────────────────────────────────────────────

function StatsBanner({ jobs }) {
  // "live" = active or defects — both represent work currently in progress
  const live = jobs.filter((j) =>
    j.status === CARPENTRY_JOB_STATUSES.ACTIVE || j.status === CARPENTRY_JOB_STATUSES.DEFECTS
  );
  const totalQuoted = live.reduce((s, j) => s + (j.quotedValue || 0), 0);
  const withMargin = live.filter((j) => j.quotedMarginPct != null);
  const avgMargin = withMargin.length
    ? withMargin.reduce((s, j) => s + j.quotedMarginPct, 0) / withMargin.length
    : null;

  const stats = [
    { label: "Live Jobs",          value: live.length,        sub: "active + defects" },
    { label: "Total Quoted Value", value: fmt$(totalQuoted),  sub: "live jobs, ex GST" },
    { label: "Avg Budget Margin",  value: fmtPct(avgMargin),  sub: "across live jobs" },
    { label: "Total Jobs",         value: jobs.length,        sub: "all time" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {stats.map((s) => (
        <div key={s.label} className="bg-white rounded-card border border-hairline p-4">
          <p className="text-xs text-muted font-medium mb-1">{s.label}</p>
          <p className="text-2xl font-semibold text-ink">{s.value}</p>
          <p className="text-xs text-muted mt-0.5">{s.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CarpentryDashboard() {
  const navigate = useNavigate();
  const [jobs, setJobs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [showNew, setShowNew]   = useState(false);
  const [statusFilter, setStatusFilter] = useState("active");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
    const { ok: ok_, data, error: e } = await apiFetch(`/api/carpentry/jobs${params}`);
    setLoading(false);
    if (!ok_) { setError(e || "Could not load carpentry jobs."); return; }
    setJobs(data?.jobs || []);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  function handleCreated(job) {
    setShowNew(false);
    navigate(`/carpentry/${job.id}`);
  }

  const statusOpts = [
    { value: "active",    label: "Active" },
    { value: "on_hold",   label: "On Hold" },
    { value: "defects",   label: "Defects" },
    { value: "complete",  label: "Complete" },
    { value: "cancelled", label: "Cancelled" },
    { value: "all",       label: "All Jobs" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Carpentry Jobs</h1>
          <p className="text-sm text-muted mt-0.5">Track carpentry jobs, costs, and performance</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <span className="text-base leading-none">+</span> New Job
        </button>
      </div>

      {/* Stats */}
      {!loading && !error && <StatsBanner jobs={jobs} />}

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-muted font-medium mr-1">Status:</span>
        {statusOpts.map((o) => (
          <button
            key={o.value}
            onClick={() => setStatusFilter(o.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === o.value
                ? "bg-primary text-white"
                : "border border-hairline text-muted hover:text-ink hover:bg-slate-50"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Job list */}
      <div className="bg-white rounded-card border border-hairline overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-muted text-sm">Loading jobs…</div>
        ) : error ? (
          <div className="p-10 text-center text-red-600 text-sm">{error}</div>
        ) : jobs.length === 0 ? (
          <div className="p-10 text-center text-muted text-sm">
            {statusFilter === "active"
              ? 'No active carpentry jobs. Click "New Job" to create one.'
              : "No jobs match this filter."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline bg-slate-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Ref</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Client</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Address</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide text-right">Quoted</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide text-right">Margin</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Start</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">End</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    onClick={() => navigate(`/carpentry/${job.id}`)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-primary font-medium">{job.reference}</td>
                    <td className="px-4 py-3 font-medium text-ink max-w-[160px] truncate">{job.clientName}</td>
                    <td className="px-4 py-3 text-muted max-w-[200px] truncate">{job.address}</td>
                    <td className="px-4 py-3 text-muted">
                      {CARPENTRY_PROJECT_TYPE_LABELS[job.projectType] || job.projectType}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[job.status] || "bg-gray-100 text-gray-500"}`}>
                        {CARPENTRY_JOB_STATUS_LABELS[job.status] || job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt$(job.quotedValue)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{fmtPct(job.quotedMarginPct)}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{fmtDate(job.startDate)}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{fmtDate(job.endDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNew && (
        <NewJobModal onClose={() => setShowNew(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";
import {
  effectiveRatePerM2,
  formatAud,
  formatAudM2,
  normalizeTradeKey,
  quantitySummaryForRow,
  rowsToCsv,
  tradeChartColor,
  trendFromQuotes
} from "../lib/costIntelUtils.js";
import {
  fetchBuildxactTemplate,
  fetchJobEstimateBreakdown,
  syncJobEstimateFromBuildxact
} from "../lib/costIntelEstimateApi.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function MetricsForm({ metrics, onSave }) {
  const SLOPES = ["flat", "gentle", "moderate", "steep", "very_steep"];
  const [form, setForm] = useState(() => ({
    floor_area_m2: metrics?.floor_area_m2 ?? "",
    roof_area_m2:  metrics?.roof_area_m2  ?? "",
    wall_area_m2:  metrics?.wall_area_m2  ?? "",
    storeys:       metrics?.storeys       ?? "",
    wet_areas:     metrics?.wet_areas     ?? "",
    site_slope:    metrics?.site_slope    ?? "",
    wall_type:     metrics?.wall_type     ?? "",
    roof_type:     metrics?.roof_type     ?? "",
    bal_rating:    metrics?.bal_rating    ?? "",
    has_raked_ceilings:  metrics?.has_raked_ceilings  ?? false,
    has_skillion_roof:   metrics?.has_skillion_roof   ?? false,
    has_suspended_slab:  metrics?.has_suspended_slab  ?? false,
    has_retaining_walls: metrics?.has_retaining_walls ?? false,
    architectural_complexity_score: metrics?.architectural_complexity_score ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  const numField = (label, key) => (
    <div key={key}>
      <label className="text-xs font-bold text-ink mb-1 block">{label}</label>
      <input type="number" value={form[key]} onChange={e => set(key, e.target.value)}
        className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {numField("Floor area (m²)", "floor_area_m2")}
        {numField("Roof area (m²)", "roof_area_m2")}
        {numField("Wall area (m²)", "wall_area_m2")}
        {numField("Storeys", "storeys")}
        {numField("Wet areas (count)", "wet_areas")}
        <div>
          <label className="text-xs font-bold text-ink mb-1 block">Site slope</label>
          <select value={form.site_slope} onChange={e => set("site_slope", e.target.value)}
            className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-surface focus:outline-none">
            <option value="">— select —</option>
            {SLOPES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-ink mb-1 block">Wall type</label>
          <input value={form.wall_type} onChange={e => set("wall_type", e.target.value)}
            className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none" placeholder="e.g. brick veneer" />
        </div>
        <div>
          <label className="text-xs font-bold text-ink mb-1 block">Roof type</label>
          <input value={form.roof_type} onChange={e => set("roof_type", e.target.value)}
            className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none" placeholder="e.g. colorbond hip" />
        </div>
        <div>
          <label className="text-xs font-bold text-ink mb-1 block">BAL rating</label>
          <input value={form.bal_rating} onChange={e => set("bal_rating", e.target.value)}
            className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none" placeholder="e.g. BAL-12.5" />
        </div>
        <div>
          <label className="text-xs font-bold text-ink mb-1 block">Complexity (1–10)</label>
          <input type="number" min={1} max={10} value={form.architectural_complexity_score} onChange={e => set("architectural_complexity_score", e.target.value)}
            className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none" />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        {[
          ["has_raked_ceilings",  "Raked ceilings"],
          ["has_skillion_roof",   "Skillion roof"],
          ["has_suspended_slab",  "Suspended slab"],
          ["has_retaining_walls", "Retaining walls"],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
            <input type="checkbox" checked={!!form[key]} onChange={e => set(key, e.target.checked)}
              className="rounded border-hairline" />
            {label}
          </label>
        ))}
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
          {saving ? "Saving…" : "Save metrics"}
        </button>
      </div>
    </div>
  );
}

function IntelligenceTab() {
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [normCosts, setNormCosts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingMetrics, setEditingMetrics] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    fetch("/api/jobs").then(r => r.json()).then(j => { if (j.ok || Array.isArray(j.jobs)) setJobs(j.jobs || j || []); }).catch(() => {});
  }, []);

  const loadJobData = useCallback(async (jobId) => {
    if (!jobId) return;
    setLoading(true); setMetrics(null); setNormCosts(null); setExtractResult(null);
    const [mRes, ncRes] = await Promise.all([
      fetch(`/api/cost-intelligence/jobs/${jobId}/metrics`).then(r => r.json()).catch(() => null),
      fetch(`/api/cost-intelligence/jobs/${jobId}/normalized-costs`).then(r => r.json()).catch(() => null),
    ]);
    if (mRes?.ok) setMetrics(mRes.metrics);
    if (ncRes?.ok) setNormCosts(ncRes);
    setLoading(false);
  }, []);

  useEffect(() => { if (selectedJobId) loadJobData(selectedJobId); }, [selectedJobId, loadJobData]);

  async function syncMetrics() {
    if (!selectedJobId) return;
    setSyncing(true);
    const r = await fetch(`/api/cost-intelligence/jobs/${selectedJobId}/metrics/sync`, { method: "POST" });
    const j = await r.json();
    if (j.ok) setMetrics(j.metrics);
    setSyncing(false);
  }

  async function saveMetrics(form) {
    const r = await fetch(`/api/cost-intelligence/jobs/${selectedJobId}/metrics`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const j = await r.json();
    if (j.ok) { setMetrics(j.metrics); setEditingMetrics(false); }
  }

  async function handleExtract(e) {
    const file = e.target.files?.[0];
    if (!file || !selectedJobId) return;
    setExtracting(true); setExtractResult(null);
    const reader = new FileReader();
    reader.onload = async ev => {
      const b64 = ev.target.result.split(",")[1];
      const r = await fetch(`/api/cost-intelligence/jobs/${selectedJobId}/metrics/extract`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdf_base64: b64, filename: file.name }),
      });
      const j = await r.json();
      setExtracting(false);
      if (j.ok) { setMetrics(j.metrics); setExtractResult(j); }
      else setExtractResult({ error: j.error });
    };
    reader.readAsDataURL(file);
  }

  const fmt = n => n == null ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
  const fmtRate = n => n == null ? "—" : `$${Number(n).toFixed(0)}/m²`;
  const fmtPct = n => n == null ? "—" : `${n > 0 ? "+" : ""}${Number(n).toFixed(1)}%`;

  return (
    <div className="space-y-6">
      {/* Job selector */}
      <div className="flex items-center gap-3">
        <select value={selectedJobId} onChange={e => setSelectedJobId(e.target.value)}
          className="flex-1 max-w-sm rounded-lg border border-hairline px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="">Select a job…</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.address || j.id}</option>)}
        </select>
      </div>

      {!selectedJobId && (
        <div className="py-16 text-center text-muted text-sm">
          Select a job to view its project metrics and normalised cost rates.
        </div>
      )}

      {selectedJobId && loading && (
        <div className="py-12 text-center text-sm text-muted">Loading…</div>
      )}

      {selectedJobId && !loading && (
        <>
          {/* Project Metrics card */}
          <div className="rounded-card border border-hairline bg-surface p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-ink">Project Metrics</h2>
                {metrics?.extraction_source && (
                  <p className="text-xs text-muted mt-0.5">
                    Source: {metrics.extraction_source}
                    {metrics.extraction_confidence != null && ` · Confidence: ${metrics.extraction_confidence}%`}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={syncMetrics} disabled={syncing}
                  className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink disabled:opacity-40">
                  {syncing ? "Syncing…" : "↻ Sync from sources"}
                </button>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={extracting}
                  className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink disabled:opacity-40">
                  {extracting ? "Extracting…" : "⬆ Extract from plans PDF"}
                </button>
                <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleExtract} />
                <button type="button" onClick={() => setEditingMetrics(v => !v)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white">
                  {editingMetrics ? "Cancel" : "Edit"}
                </button>
              </div>
            </div>

            {extractResult?.error && (
              <p className="text-xs text-danger font-medium">Extraction failed: {extractResult.error}</p>
            )}
            {extractResult?.low_confidence_fields?.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span className="font-bold">Low-confidence fields not saved:</span>{" "}
                {extractResult.low_confidence_fields.map(f => `${f.field} (${f.confidence}%)`).join(", ")}
                {" — "}please enter these manually.
              </div>
            )}
            {extractResult?.ok && (
              <p className="text-xs text-green-700 font-medium">
                ✓ Extracted {Object.keys(extractResult.metrics || {}).length} fields — overall confidence {extractResult.overall_confidence}%
                {extractResult.notes && ` · ${extractResult.notes}`}
              </p>
            )}

            {!editingMetrics && (
              <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
                {[
                  ["Floor area", metrics?.floor_area_m2 != null ? `${metrics.floor_area_m2} m²` : "—"],
                  ["Roof area",  metrics?.roof_area_m2  != null ? `${metrics.roof_area_m2} m²` : "—"],
                  ["Wall area",  metrics?.wall_area_m2  != null ? `${metrics.wall_area_m2} m²` : "—"],
                  ["Storeys",    metrics?.storeys ?? "—"],
                  ["Wet areas",  metrics?.wet_areas ?? "—"],
                  ["Site slope", metrics?.site_slope?.replace("_", " ") || "—"],
                  ["Wall type",  metrics?.wall_type || "—"],
                  ["Roof type",  metrics?.roof_type || "—"],
                  ["BAL rating", metrics?.bal_rating || "—"],
                  ["Complexity score", metrics?.architectural_complexity_score ?? "—"],
                  ["Raked ceilings",  metrics?.has_raked_ceilings ? "Yes" : metrics?.has_raked_ceilings === false ? "No" : "—"],
                  ["Suspended slab",  metrics?.has_suspended_slab ? "Yes" : metrics?.has_suspended_slab === false ? "No" : "—"],
                  ["Retaining walls", metrics?.has_retaining_walls ? "Yes" : metrics?.has_retaining_walls === false ? "No" : "—"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span className="text-xs text-muted">{label}</span>
                    <div className="font-semibold text-ink">{value}</div>
                  </div>
                ))}
              </div>
            )}

            {editingMetrics && <MetricsForm metrics={metrics} onSave={saveMetrics} />}
          </div>

          {/* Normalized Costs table */}
          <div className="rounded-card border border-hairline bg-surface overflow-hidden">
            <div className="px-5 py-4 border-b border-hairline flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink">Normalised Cost Rates</h2>
              {!normCosts?.metrics?.floor_area_m2 && (
                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                  Add floor area above to enable $/m² rates
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-page">
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-muted">Trade</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-muted">Budget</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-muted">Actual</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-muted">Variation</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-muted">Final</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-muted">$/m² floor</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-muted">vs budget</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {(normCosts?.rows || [])
                    .filter(r => r.budget_amount || r.actual_amount || r.final_amount)
                    .map(r => {
                      const over = r.budget_vs_actual_pct;
                      return (
                        <tr key={r.trade_category_id} className="hover:bg-page/50">
                          <td className="px-4 py-2.5 font-medium text-ink">{r.trade_category_name}</td>
                          <td className="px-4 py-2.5 text-right text-muted">{fmt(r.budget_amount)}</td>
                          <td className="px-4 py-2.5 text-right text-muted">{fmt(r.actual_amount)}</td>
                          <td className="px-4 py-2.5 text-right text-muted">{fmt(r.variation_amount)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-ink">{fmt(r.final_amount || r.actual_amount || r.budget_amount)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs">{fmtRate(r.rate_per_m2_floor)}</td>
                          <td className={`px-4 py-2.5 text-right text-xs font-semibold ${over == null ? "text-muted" : over > 5 ? "text-red-700" : over > 0 ? "text-amber-700" : "text-green-700"}`}>
                            {fmtPct(over)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {(normCosts?.rows || []).filter(r => r.budget_amount || r.actual_amount).length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-muted">
                  No cost data yet. Seed the budget from Buildxact or approve invoices to populate.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function CostIntelligence() {
  const [activeTab, setActiveTab] = useState("benchmarks");
  const [rows, setRows] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [template, setTemplate] = useState(null);
  const [templateBusy, setTemplateBusy] = useState(true);
  const [estimateJobId, setEstimateJobId] = useState("");
  const [estimateData, setEstimateData] = useState(null);
  const [estimateBusy, setEstimateBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [estimateError, setEstimateError] = useState("");

  const [manual, setManual] = useState({
    job_id: "",
    project_type: "",
    floor_area_m2: "",
    storeys: "",
    roof_area_m2: "",
    wall_area_m2: "",
    tile_area_floor_m2: "",
    tile_area_wall_m2: "",
    solar_system_kw: "",
    wet_areas: "",
    notes: "",
    tradeRows: [{ trade: "", quote_amount: "" }]
  });

  const load = useCallback(async () => {
    if (!supabaseConfigured) return;
    const sb = getSupabase();
    const { data: ci, error: e1 } = await sb
      .from("cost_intelligence")
      .select("*, jobs(address, project_type, floor_area_m2)")
      .order("recorded_at", { ascending: false })
      .limit(500);
    if (e1) {
      setError(e1.message);
      return;
    }
    setRows(ci || []);
    const { data: j } = await sb.from("jobs").select("id, address, project_type, floor_area_m2").order("created_at", { ascending: false }).limit(200);
    setJobs(j || []);
    setError("");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setTemplateBusy(true);
      try {
        const json = await fetchBuildxactTemplate();
        if (!cancelled) setTemplate(json);
      } catch (e) {
        if (!cancelled) setTemplate({ categories: [], error: e.message });
      } finally {
        if (!cancelled) setTemplateBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadJobEstimate(jobId) {
    if (!jobId) {
      setEstimateData(null);
      return;
    }
    setEstimateBusy(true);
    setEstimateError("");
    try {
      const json = await fetchJobEstimateBreakdown(jobId);
      setEstimateData(json);
    } catch (e) {
      setEstimateData(null);
      setEstimateError(e.message);
    } finally {
      setEstimateBusy(false);
    }
  }

  async function handleSyncEstimate() {
    if (!estimateJobId) return;
    setSyncBusy(true);
    setEstimateError("");
    try {
      await syncJobEstimateFromBuildxact(estimateJobId);
      await loadJobEstimate(estimateJobId);
      await load();
    } catch (e) {
      setEstimateError(e.message);
    } finally {
      setSyncBusy(false);
    }
  }

  const byJob = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const id = r.job_id;
      if (!m.has(id)) m.set(id, []);
      m.get(id).push(r);
    }
    return m;
  }, [rows]);

  const summary = useMemo(() => {
    const jobIds = new Set(rows.map((r) => r.job_id).filter(Boolean));
    const trades = new Set(rows.map((r) => normalizeTradeKey(r.trade)).filter(Boolean));
    let recent = null;
    for (const r of rows) {
      if (!recent || String(r.recorded_at) > String(recent.recorded_at)) recent = r;
    }
    return {
      jobCount: jobIds.size,
      quoteCount: rows.length,
      tradeCount: trades.size,
      recent
    };
  }, [rows]);

  const tradeStats = useMemo(() => {
    const groups = new Map();
    for (const r of rows) {
      const key = normalizeTradeKey(r.trade) || "other";
      const rate = effectiveRatePerM2(r);
      if (!groups.has(key)) groups.set(key, { key, label: r.trade || key, rates: [], quotes: [] });
      const g = groups.get(key);
      if (rate != null) {
        g.rates.push(rate);
        g.quotes.push({ rate, recorded_at: r.recorded_at });
      }
    }
    const out = [];
    for (const g of groups.values()) {
      if (!g.rates.length) continue;
      const sorted = [...g.quotes].sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at)));
      const low = Math.min(...g.rates);
      const high = Math.max(...g.rates);
      const avg = g.rates.reduce((a, b) => a + b, 0) / g.rates.length;
      out.push({
        trade: g.label,
        key: g.key,
        n: g.rates.length,
        low,
        avg,
        high,
        trend: trendFromQuotes(sorted)
      });
    }
    out.sort((a, b) => a.trade.localeCompare(b.trade));
    return out;
  }, [rows]);

  const chartData = useMemo(
    () =>
      tradeStats.map((t) => ({
        trade: t.trade.length > 22 ? `${t.trade.slice(0, 20)}…` : t.trade,
        avg: Math.round(t.avg * 100) / 100,
        color: tradeChartColor(t.key)
      })),
    [tradeStats]
  );

  const jobHistoryRows = useMemo(() => {
    const list = [];
    for (const [jobId, listRows] of byJob.entries()) {
      const first = listRows[0];
      const addr = first?.jobs?.address || jobId;
      const ptype = first?.jobs?.project_type || first?.project_type || "";
      const dates = listRows.map((r) => r.recorded_at).filter(Boolean);
      const maxDate = dates.length ? dates.sort().reverse()[0] : "";
      const floor = num(first?.floor_area_m2) ?? num(first?.jobs?.floor_area_m2);
      let total = 0;
      for (const r of listRows) {
        const q = num(r.quote_amount);
        if (q) total += q;
      }
      const rate = floor && floor > 0 && total > 0 ? total / floor : null;
      list.push({
        jobId,
        address: addr,
        type: ptype,
        floor,
        trades: listRows.length,
        total,
        rate,
        recorded_at: maxDate,
        listRows
      });
    }
    list.sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)));
    return list;
  }, [byJob]);

  function exportCsv() {
    const blob = new Blob([rowsToCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cost-intelligence-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function saveManual() {
    if (!supabaseConfigured) return;
    const sb = getSupabase();
    const job_id = manual.job_id.trim();
    if (!job_id) {
      alert("Select a job (tender).");
      return;
    }
    const base = {
      project_type: manual.project_type.trim() || null,
      floor_area_m2: num(manual.floor_area_m2),
      storeys: num(manual.storeys) != null ? Math.round(num(manual.storeys)) : null,
      roof_area_m2: num(manual.roof_area_m2),
      wall_area_m2: num(manual.wall_area_m2),
      tile_area_floor_m2: num(manual.tile_area_floor_m2),
      tile_area_wall_m2: num(manual.tile_area_wall_m2),
      solar_system_kw: num(manual.solar_system_kw),
      wet_areas: num(manual.wet_areas) != null ? Math.round(num(manual.wet_areas)) : null,
      notes: manual.notes.trim() || null,
      source: "manual",
      recorded_at: new Date().toISOString().slice(0, 10)
    };
    for (const tr of manual.tradeRows) {
      const trade = tr.trade.trim();
      const quote_amount = num(tr.quote_amount);
      if (!trade || quote_amount == null || quote_amount <= 0) continue;
      const { error: insE } = await sb.from("cost_intelligence").insert({
        job_id,
        trade,
        quote_amount,
        ...base
      });
      if (insE) {
        alert(insE.message);
        return;
      }
    }
    setManualOpen(false);
    setManual({
      job_id: "",
      project_type: "",
      floor_area_m2: "",
      storeys: "",
      roof_area_m2: "",
      wall_area_m2: "",
      tile_area_floor_m2: "",
      tile_area_wall_m2: "",
      solar_system_kw: "",
      wet_areas: "",
      notes: "",
      tradeRows: [{ trade: "", quote_amount: "" }]
    });
    await load();
  }

  if (!supabaseConfigured) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-6 text-sm text-muted">
        Connect Supabase in <code className="text-xs">.env</code> to use Cost Intelligence.
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Module 5</p>
          <h1 className="text-3xl font-semibold text-primary tracking-tight">Cost Intelligence</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Buildxact estimate template (37 categories), per-job budget sync, quote benchmarks, and manual imports. RFQ Engine reads quote-capable trades from here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportCsv} className="rounded-lg border border-hairline bg-page px-4 py-2 text-sm font-semibold text-ink">
            Export CSV
          </button>
          <button type="button" onClick={() => setManualOpen(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">
            Manual entry
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-hairline mb-6">
        {[
          { id: "benchmarks",   label: "Benchmarks" },
          { id: "intelligence", label: "Intelligence" },
          { id: "trends",       label: "Trends" },
          { id: "pretender",    label: "Pre-Tender" },
        ].map(tab => (
          <button key={tab.id} type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition -mb-px ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "benchmarks" && (<>

      {error ? <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-2 text-sm text-danger">{error}</div> : null}

      <section className="rounded-card border border-primary/25 bg-primary/5 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary">Buildxact estimate template</h2>
        <p className="mt-1 text-xs text-muted">
          Canonical category list from <code className="text-[10px]">trade_categories</code> (migration 031), enriched with
          quote-line flags and RFQ trade mapping. This is the baseline for budgets, normalized costs, and RFQ packages.
        </p>
        {templateBusy ? (
          <p className="mt-4 text-sm text-muted">Loading template…</p>
        ) : template?.error ? (
          <p className="mt-4 text-sm text-danger">{template.error}</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
              <span>
                <strong className="text-ink">{template?.category_count ?? 0}</strong> categories
              </span>
              <span>
                <strong className="text-ink">{template?.quote_capable_count ?? 0}</strong> quote-capable → RFQ
              </span>
              <span>Source: {template?.source || "—"}</span>
            </div>
            <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-hairline bg-surface">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 bg-page">
                  <tr className="border-b border-hairline uppercase text-muted">
                    <th className="py-2 pl-3 pr-2">#</th>
                    <th className="py-2 pr-2">Category</th>
                    <th className="py-2 pr-2">Type</th>
                    <th className="py-2 pr-2">Quote?</th>
                    <th className="py-2 pr-3">RFQ trade</th>
                  </tr>
                </thead>
                <tbody>
                  {(template?.categories || []).map((c) => (
                    <tr key={c.id || c.name} className="border-b border-hairline/60">
                      <td className="py-1.5 pl-3 pr-2 text-muted">{c.sort_order}</td>
                      <td className="py-1.5 pr-2 font-medium text-ink">{c.name}</td>
                      <td className="py-1.5 pr-2 text-muted">{c.category_type}</td>
                      <td className="py-1.5 pr-2">{c.has_quote_line ? "Yes" : "—"}</td>
                      <td className="py-1.5 pr-3 text-muted">{c.rfq_trade_label || c.rfq_trade_id || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="mt-6 border-t border-hairline pt-4">
          <h3 className="text-sm font-semibold text-ink">Job estimate from Buildxact</h3>
          <p className="mt-1 text-xs text-muted">Select a job with a linked Buildxact ID to view or sync budget lines into Cost Intelligence.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-ink">
              Job
              <select
                className="mt-1 block min-w-[220px] rounded-lg border border-hairline bg-surface px-3 py-2 text-sm"
                value={estimateJobId}
                onChange={(e) => {
                  setEstimateJobId(e.target.value);
                  loadJobEstimate(e.target.value);
                }}
              >
                <option value="">Select job…</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.address || j.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!estimateJobId || syncBusy}
              onClick={handleSyncEstimate}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {syncBusy ? "Syncing…" : "Sync estimate → budgets"}
            </button>
          </div>
          {estimateError ? <p className="mt-2 text-sm text-danger">{estimateError}</p> : null}
          {estimateBusy ? <p className="mt-2 text-sm text-muted">Loading estimate…</p> : null}
          {estimateData?.parsed?.categories?.length ? (
            <div className="mt-4 overflow-x-auto rounded-lg border border-hairline bg-surface">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-hairline uppercase text-muted">
                    <th className="py-2 pl-3 pr-2">Buildxact category</th>
                    <th className="py-2 pr-2">Mapped to</th>
                    <th className="py-2 pr-2 text-right">Budget ex GST</th>
                    <th className="py-2 pr-3">RFQ</th>
                  </tr>
                </thead>
                <tbody>
                  {estimateData.parsed.categories
                    .filter((c) => c.amount_ex_gst > 0)
                    .map((c) => (
                      <tr key={c.buildxact_category_name} className="border-b border-hairline/50">
                        <td className="py-1.5 pl-3 pr-2 font-medium text-ink">{c.buildxact_category_name}</td>
                        <td className="py-1.5 pr-2 text-muted">{c.trade_category_name || "—"}</td>
                        <td className="py-1.5 pr-2 text-right">{formatAud(c.amount_ex_gst)}</td>
                        <td className="py-1.5 pr-3 text-muted">{c.rfq_trade_label || "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="border-t border-hairline px-3 py-2 text-xs text-muted">
                Total {formatAud(estimateData.parsed.total_ex_gst)} · Quote-capable{" "}
                {formatAud(estimateData.parsed.quote_capable_total)}
                {estimateData.summary?.unmatched_count > 0
                  ? ` · ${estimateData.summary.unmatched_count} unmatched categories`
                  : ""}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-card border border-hairline bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-muted">Jobs tracked</div>
          <div className="mt-1 text-2xl font-bold text-primary">{summary.jobCount}</div>
        </div>
        <div className="rounded-card border border-hairline bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-muted">Quote rows</div>
          <div className="mt-1 text-2xl font-bold text-primary">{summary.quoteCount}</div>
        </div>
        <div className="rounded-card border border-hairline bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-muted">Trades covered</div>
          <div className="mt-1 text-2xl font-bold text-primary">{summary.tradeCount}</div>
        </div>
        <div className="rounded-card border border-hairline bg-surface p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-muted">Most recent</div>
          <div className="mt-1 text-sm font-semibold text-ink">{summary.recent?.jobs?.address || "—"}</div>
          <div className="text-xs text-muted">{summary.recent?.recorded_at || ""}</div>
        </div>
      </div>

      <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary">Average $/m² by trade</h2>
        <p className="mt-1 text-xs text-muted">Rates use trade-specific quantities where recorded (roof m², tiling areas, solar kW, wet areas).</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase text-muted">
                <th className="py-2 pr-3">Trade</th>
                <th className="py-2 pr-3">Quotes</th>
                <th className="py-2 pr-3">Low</th>
                <th className="py-2 pr-3">Avg</th>
                <th className="py-2 pr-3">High</th>
                <th className="py-2">Trend</th>
              </tr>
            </thead>
            <tbody>
              {tradeStats.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-muted">
                    No rated quotes yet. Win a tender (with optional quantities) or add manual rows.
                  </td>
                </tr>
              ) : (
                tradeStats.map((t) => (
                  <tr key={t.key} className="border-b border-hairline/80">
                    <td className="py-2 pr-3 font-medium text-ink">{t.trade}</td>
                    <td className="py-2 pr-3">{t.n}</td>
                    <td className="py-2 pr-3">{formatAudM2(t.low)}</td>
                    <td className="py-2 pr-3 font-semibold text-accent">{formatAudM2(t.avg)}</td>
                    <td className="py-2 pr-3">{formatAudM2(t.high)}</td>
                    <td className="py-2">{t.trend}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {chartData.length > 0 ? (
        <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-primary">Avg $/m² (effective)</h2>
          <div className="mt-4 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={chartData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <XAxis type="number" tickFormatter={(v) => `$${v}`} stroke="#64748b" fontSize={11} />
                <YAxis type="category" dataKey="trade" width={100} tick={{ fontSize: 11 }} stroke="#64748b" />
                <Tooltip formatter={(v) => formatAud(v)} />
                <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                  {chartData.map((e, i) => (
                    <Cell key={i} fill={e.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}

      <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary">Job history</h2>
        <p className="text-xs text-muted">Click a row for trade breakdown and quantities.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase text-muted">
                <th className="w-8 py-2" />
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Address</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Floor m²</th>
                <th className="py-2 pr-3">Trades</th>
                <th className="py-2 pr-3">Total</th>
                <th className="py-2">$/m²</th>
              </tr>
            </thead>
            <tbody>
              {jobHistoryRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-muted">
                    No cost intelligence rows yet.
                  </td>
                </tr>
              ) : (
                jobHistoryRows.map((jr) => (
                  <Fragment key={jr.jobId}>
                    <tr
                      className="cursor-pointer border-b border-hairline/80 hover:bg-page"
                      onClick={() => setExpanded((e) => (e === jr.jobId ? null : jr.jobId))}
                    >
                      <td className="py-2 text-muted">{expanded === jr.jobId ? "▼" : "▶"}</td>
                      <td className="py-2 pr-3">{jr.recorded_at || "—"}</td>
                      <td className="py-2 pr-3 font-medium text-ink">{jr.address}</td>
                      <td className="py-2 pr-3">{jr.type || "—"}</td>
                      <td className="py-2 pr-3">{jr.floor != null ? jr.floor.toFixed(1) : "—"}</td>
                      <td className="py-2 pr-3">{jr.trades}</td>
                      <td className="py-2 pr-3">{formatAud(jr.total)}</td>
                      <td className="py-2">{jr.rate != null ? formatAudM2(jr.rate) : "—"}</td>
                    </tr>
                    {expanded === jr.jobId ? (
                      <tr className="border-b border-hairline bg-page/80">
                        <td colSpan={8} className="px-4 py-3 text-xs">
                          <div className="space-y-2">
                            {jr.listRows.map((r) => (
                              <div key={r.id} className="flex flex-wrap gap-x-4 gap-y-1 border-b border-hairline/50 pb-2 last:border-0">
                                <span className="font-semibold text-ink">{r.trade}</span>
                                <span className="text-muted">Source: {r.source || "—"}</span>
                                <span>{formatAud(r.quote_amount)}</span>
                                <span className="text-muted">{quantitySummaryForRow(r)}</span>
                                <span>Effective {formatAudM2(effectiveRatePerM2(r))}</span>
                                <span className="text-muted">Stored DB {formatAudM2(r.rate_per_m2)}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-center text-xs text-muted">
        Fee proposals:{" "}
        <Link to="/tender-manager/fee-proposal" className="font-semibold text-accent underline">
          Tender Manager → Fee Proposal
        </Link>
      </p>

      {manualOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && setManualOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-hairline bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-primary">Manual cost entry</h2>
            <p className="mt-1 text-xs text-muted">Creates rows in cost_intelligence with source = manual.</p>
            <label className="mt-4 block text-xs font-semibold text-ink">
              Job
              <select
                className="mt-1 w-full rounded-lg border border-hairline px-3 py-2 text-sm"
                value={manual.job_id}
                onChange={(e) => setManual((m) => ({ ...m, job_id: e.target.value }))}
              >
                <option value="">Select job…</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.address}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-ink">
                Project type
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={manual.project_type} onChange={(e) => setManual((m) => ({ ...m, project_type: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-ink">
                Floor m²
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={manual.floor_area_m2} onChange={(e) => setManual((m) => ({ ...m, floor_area_m2: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-ink">
                Storeys
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={manual.storeys} onChange={(e) => setManual((m) => ({ ...m, storeys: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-ink">
                Roof m²
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={manual.roof_area_m2} onChange={(e) => setManual((m) => ({ ...m, roof_area_m2: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-ink">
                Wall m²
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={manual.wall_area_m2} onChange={(e) => setManual((m) => ({ ...m, wall_area_m2: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-ink">
                Tile floor m²
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={manual.tile_area_floor_m2} onChange={(e) => setManual((m) => ({ ...m, tile_area_floor_m2: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-ink">
                Tile wall m²
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={manual.tile_area_wall_m2} onChange={(e) => setManual((m) => ({ ...m, tile_area_wall_m2: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-ink">
                Solar kW
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={manual.solar_system_kw} onChange={(e) => setManual((m) => ({ ...m, solar_system_kw: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-ink">
                Wet areas
                <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={manual.wet_areas} onChange={(e) => setManual((m) => ({ ...m, wet_areas: e.target.value }))} />
              </label>
            </div>
            <label className="mt-3 block text-xs font-semibold text-ink">
              Notes
              <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={manual.notes} onChange={(e) => setManual((m) => ({ ...m, notes: e.target.value }))} />
            </label>
            <div className="mt-4 space-y-2">
              <div className="text-xs font-bold uppercase text-muted">Trade rows</div>
              {manual.tradeRows.map((tr, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    placeholder="Trade"
                    className="flex-1 rounded border px-2 py-1 text-sm"
                    value={tr.trade}
                    onChange={(e) =>
                      setManual((m) => ({
                        ...m,
                        tradeRows: m.tradeRows.map((x, i) => (i === idx ? { ...x, trade: e.target.value } : x))
                      }))
                    }
                  />
                  <input
                    placeholder="Quote $"
                    type="number"
                    className="w-28 rounded border px-2 py-1 text-sm"
                    value={tr.quote_amount}
                    onChange={(e) =>
                      setManual((m) => ({
                        ...m,
                        tradeRows: m.tradeRows.map((x, i) => (i === idx ? { ...x, quote_amount: e.target.value } : x))
                      }))
                    }
                  />
                </div>
              ))}
              <button
                type="button"
                className="text-xs font-semibold text-accent underline"
                onClick={() => setManual((m) => ({ ...m, tradeRows: [...m.tradeRows, { trade: "", quote_amount: "" }] }))}
              >
                + Add trade row
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-4 py-2 text-sm text-muted" onClick={() => setManualOpen(false)}>
                Cancel
              </button>
              <button type="button" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white" onClick={saveManual}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      </>)}

      {activeTab === "intelligence" && (
        <IntelligenceTab />
      )}
      {activeTab === "trends" && (
        <div className="py-16 text-center text-muted text-sm">
          Trends analysis coming in the next phase. Once enough normalized cost data is collected, this tab will show rolling 3/6/12-month rate trends per trade.
        </div>
      )}
      {activeTab === "pretender" && (
        <div className="py-16 text-center text-muted text-sm">
          Pre-Tender estimator coming in the next phase. Once benchmarks are computed from completed projects, you will be able to generate trade-by-trade cost ranges before starting a Buildxact estimate.
        </div>
      )}
    </div>
  );
}

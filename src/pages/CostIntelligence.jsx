import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function CostIntelligence() {
  const [rows, setRows] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
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
          <p className="mt-1 max-w-2xl text-sm text-muted">Rolling quote analytics, $/m² by trade, and manual imports. Data feeds from won tenders and manual entry.</p>
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

      {error ? <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-2 text-sm text-danger">{error}</div> : null}

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
    </div>
  );
}

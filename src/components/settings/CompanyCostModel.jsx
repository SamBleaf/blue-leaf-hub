import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../../lib/authFetch.js";
import { getSupabase } from "../../lib/supabaseClient";

const fmt$ = (n) => (n == null || isNaN(n)) ? "—" : `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtHr = (n) => (n == null || isNaN(n)) ? "—" : `$${Number(n).toFixed(2)}`;
const fmtPct = (n) => (n == null || isNaN(n)) ? "—" : `${(Number(n) * 100).toFixed(0)}%`;
const ago = (iso) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return new Date(iso).toLocaleDateString("en-AU");
};

export default function CompanyCostModel() {
  const [isAdmin, setIsAdmin] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setIsAdmin(false); return; }
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setIsAdmin(false); return; }
      sb.from("user_profiles").select("role").eq("id", user.id).maybeSingle()
        .then(({ data: p }) => setIsAdmin(p?.role === "admin"));
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setMsg(null);
    try {
      const r = await authFetch("/api/cost-model");
      const j = await r.json();
      if (j.ok) setData(j);
      else setMsg(j.error || "Failed to load");
    } catch (e) { setMsg(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  async function syncNow() {
    setSyncing(true); setMsg(null);
    try {
      const r = await authFetch("/api/cost-model/sync", { method: "POST" });
      const j = await r.json();
      if (j.ok) {
        setMsg(`Synced ${j.synced?.employees ?? 0} staff + ${j.synced?.overheads ?? 0} overheads${j.unmatched?.length ? ` · unmatched: ${j.unmatched.join(", ")}` : ""}`);
        load();
      } else setMsg(j.error || "Sync failed");
    } catch (e) { setMsg(e.message); }
    finally { setSyncing(false); }
  }

  if (isAdmin === null || !isAdmin) return null;

  const model = data?.model;
  const rates = data?.rates || [];

  return (
    <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-primary">Company Cost Model</h2>
          <p className="mt-0.5 text-xs text-muted">
            Synced from your Google Sheet — overheads + fully‑loaded labour rates that drive the burn‑rate.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {model && (
            <span className={model.last_sync_status === "error" ? "text-danger" : "text-muted"}>
              {model.last_sync_status === "error" ? "⚠ last sync failed" : `synced ${ago(model.last_synced_at)}`}
            </span>
          )}
          <button
            type="button" onClick={syncNow} disabled={syncing || loading || !data?.configured}
            className="rounded border border-hairline bg-page px-3 py-1.5 text-xs font-semibold text-ink hover:bg-hairline disabled:opacity-40"
          >
            {syncing ? "Syncing…" : "⟳ Sync now"}
          </button>
        </div>
      </div>

      {msg && <p className="mt-3 text-xs text-muted">{msg}</p>}
      {data && !data.configured && (
        <p className="mt-3 text-xs text-danger">Not configured — set <code>GOOGLE_COST_MODEL_SHEET_ID</code> and the Google OAuth token in the server env.</p>
      )}
      {model?.sync_error && <p className="mt-2 text-xs text-danger">Sync error: {model.sync_error}</p>}

      {!model && data?.configured && (
        <p className="mt-4 text-xs text-muted">No data yet — apply migration 090, then hit “Sync now”.</p>
      )}

      {model && (
        <div className="mt-5 space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total overheads / yr", value: fmt$(model.overhead_total) },
              { label: "Overhead recovery", value: `${fmtHr(model.overhead_recovery_per_hour)}/hr` },
              { label: "Preferred margin", value: fmtPct(model.margin_pct) },
              { label: "Productive hrs/yr", value: `${Math.round((model.headcount || 0) * (model.working_weeks || 0) * (model.productive_hours_week || 0)).toLocaleString()}` },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-hairline bg-page px-4 py-3">
                <p className="text-xs text-muted">{label}</p>
                <p className="mt-0.5 text-lg font-semibold text-ink">{value}</p>
              </div>
            ))}
          </div>

          {/* Rates table */}
          {rates.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="pb-1 pr-4 font-semibold">Employee</th>
                    <th className="pb-1 pr-4 font-semibold text-right">True cost</th>
                    <th className="pb-1 pr-4 font-semibold text-right">+ Overhead</th>
                    <th className="pb-1 pr-4 font-semibold text-right">Break‑even</th>
                    <th className="pb-1 font-semibold text-right">Charge‑up</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {rates.map((e) => (
                    <tr key={e.id}>
                      <td className="py-1 pr-4 text-ink font-medium">
                        {e.employee_name}{!e.employee_id && <span className="ml-1 text-warning" title="no matching employee record">⚠</span>}
                      </td>
                      <td className="py-1 pr-4 text-right text-muted">{fmtHr(e.true_hourly)}</td>
                      <td className="py-1 pr-4 text-right text-muted">{fmtHr(e.overhead_hourly)}</td>
                      <td className="py-1 pr-4 text-right font-semibold text-ink">{fmtHr(e.break_even_hourly)}</td>
                      <td className="py-1 text-right text-accent font-semibold">{fmtHr(e.charge_up_hourly)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-muted">Break‑even = the cost to recover (used for actuals + the “before unprofitable” floor). Charge‑up = bill rate to hit margin.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

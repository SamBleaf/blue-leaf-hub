import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../../lib/authFetch.js";
import { getSupabase } from "../../lib/supabaseClient";

// Format USD with 2–4 decimal places depending on magnitude
function fmtCost(usd) {
  if (usd == null || isNaN(usd)) return "$0.00";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(6)}`;
}

function fmtTokens(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

// Shorten model names for display
function shortModel(model) {
  return (model || "unknown")
    .replace("claude-", "")
    .replace("-20251001", "")
    .replace("-20250514", "");
}

// Shorten module names for display
function shortModule(mod) {
  return (mod || "unknown")
    .replace("Routes", "")
    .replace("Routes", "");
}

export default function AICostWidget() {
  const [isDirector, setIsDirector] = useState(null); // null = loading
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check role — only directors see this widget
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setIsDirector(false); return; }
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setIsDirector(false); return; }
      sb.from("user_profiles").select("role").eq("id", user.id).maybeSingle().then(({ data: profile }) => {
        setIsDirector(profile?.role === "director");
      });
    });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/ai-costs/summary?month=${month}`);
      if (res.status === 403) { setIsDirector(false); return; }
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Failed to load AI costs");
      setData(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (isDirector) fetchData();
  }, [isDirector, fetchData]);

  if (isDirector === null) return null; // still checking role
  if (!isDirector) return null;         // not a director — hide entirely

  const prevMonth = () => {
    const [y, m] = month.split("-").map(Number);
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    setMonth(`${py}-${String(pm).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const [y, m] = month.split("-").map(Number);
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    const next = `${ny}-${String(nm).padStart(2, "0")}`;
    const current = new Date().toISOString().slice(0, 7);
    if (next > current) return; // can't go to the future
    setMonth(next);
  };

  const isCurrentMonth = month === new Date().toISOString().slice(0, 7);

  return (
    <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-primary">AI Usage &amp; Cost</h2>
          <p className="mt-0.5 text-xs text-muted">Director view — Anthropic API spend by module and model.</p>
        </div>
        {/* Month navigation */}
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={prevMonth}
            className="rounded border border-hairline bg-page px-2 py-1 text-xs font-semibold text-ink hover:bg-hairline"
          >
            ←
          </button>
          <span className="min-w-[5rem] text-center font-mono text-xs text-ink">{month}</span>
          <button
            type="button"
            onClick={nextMonth}
            disabled={isCurrentMonth}
            className="rounded border border-hairline bg-page px-2 py-1 text-xs font-semibold text-ink hover:bg-hairline disabled:opacity-40"
          >
            →
          </button>
        </div>
      </div>

      {loading && (
        <p className="mt-4 text-xs text-muted">Loading…</p>
      )}

      {error && (
        <p className="mt-4 text-xs text-danger">{error}</p>
      )}

      {data && !loading && (
        <div className="mt-5 space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total cost", value: fmtCost(data.total_cost_usd) },
              { label: "API calls",  value: data.total_calls?.toLocaleString() || "0" },
              { label: "Input tokens",  value: fmtTokens(data.total_input_tokens) },
              { label: "Output tokens", value: fmtTokens(data.total_output_tokens) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-hairline bg-page px-4 py-3">
                <p className="text-xs text-muted">{label}</p>
                <p className="mt-0.5 text-lg font-semibold text-ink">{value}</p>
              </div>
            ))}
          </div>

          {/* By module progress bars */}
          {data.by_module?.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">By module</p>
              <div className="space-y-2">
                {data.by_module.map((m) => {
                  const pct = data.total_cost_usd > 0
                    ? Math.max(2, (m.cost_usd / data.total_cost_usd) * 100)
                    : 0;
                  return (
                    <div key={m.module} className="flex items-center gap-3 text-xs">
                      <span className="w-32 truncate text-ink font-medium">{shortModule(m.module)}</span>
                      <div className="flex-1 rounded-full bg-page h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-14 text-right text-muted">{fmtCost(m.cost_usd)}</span>
                      <span className="w-12 text-right text-muted">{m.calls} calls</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* By model */}
          {data.by_model?.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">By model</p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted">
                      <th className="pb-1 pr-4 font-semibold">Model</th>
                      <th className="pb-1 pr-4 font-semibold text-right">Calls</th>
                      <th className="pb-1 pr-4 font-semibold text-right">Input</th>
                      <th className="pb-1 pr-4 font-semibold text-right">Output</th>
                      <th className="pb-1 font-semibold text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {data.by_model.map((m) => (
                      <tr key={m.model}>
                        <td className="py-1 pr-4 font-mono text-ink">{shortModel(m.model)}</td>
                        <td className="py-1 pr-4 text-right text-muted">{m.calls}</td>
                        <td className="py-1 pr-4 text-right text-muted">{fmtTokens(m.input_tokens)}</td>
                        <td className="py-1 pr-4 text-right text-muted">{fmtTokens(m.output_tokens)}</td>
                        <td className="py-1 text-right font-semibold text-ink">{fmtCost(m.cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.total_calls === 0 && (
            <p className="text-xs text-muted">No AI calls logged for {month}.</p>
          )}
        </div>
      )}
    </section>
  );
}

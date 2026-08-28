import { authFetch } from "../../lib/authFetch.js";
import { useEffect, useState } from "react";

const STAGE_LABELS = {
  enquiry: "Enquiry", qualify: "Qualify", discovery: "Discovery",
  winning_offer: "Concept", fee_proposal: "PTSA / Plans",
  consultants: "Consultants", tender: "Tender",
};

const STAGE_COLORS = {
  enquiry: "bg-slate-400", qualify: "bg-blue-500", discovery: "bg-violet-500",
  winning_offer: "bg-amber-500", fee_proposal: "bg-orange-500",
  consultants: "bg-indigo-500", tender: "bg-teal-500",
};

function fmt$(n) {
  if (!n) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

function fmtPct(n, decimals = 1) {
  return `${(n * 100).toFixed(decimals)}%`;
}

function BenchmarkPill({ value, min, max, label, higherBetter = true }) {
  let color, hint;
  if (max != null) {
    // Range benchmark (e.g. close rate: 25–33%)
    if (value >= min && value <= max) { color = "text-green-700 bg-green-50 border-green-200"; hint = "On target"; }
    else if (value < min) { color = "text-amber-700 bg-amber-50 border-amber-200"; hint = `Below APB min ${fmtPct(min)}`; }
    else { color = "text-blue-700 bg-blue-50 border-blue-200"; hint = "Above target"; }
  } else {
    // Single threshold
    if (higherBetter ? value >= min : value <= min) { color = "text-green-700 bg-green-50 border-green-200"; hint = "On target"; }
    else { color = "text-amber-700 bg-amber-50 border-amber-200"; hint = `Below APB min ${fmtPct(min)}`; }
  }
  return (
    <span title={hint} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${color}`}>
      {label}
    </span>
  );
}

function StatCard({ label, value, sub, benchmark }) {
  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="text-2xl font-bold text-ink mt-1">{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
      {benchmark && <div className="mt-2">{benchmark}</div>}
    </div>
  );
}

function PipelineFunnel({ pipeline, total }) {
  if (!pipeline?.length) return <p className="text-sm text-muted italic">No active leads.</p>;
  const maxCount = Math.max(...pipeline.map(p => p.count));
  return (
    <div className="space-y-2">
      {pipeline.map(p => (
        <div key={p.stage} className="flex items-center gap-3">
          <span className="w-28 text-xs text-muted truncate flex-shrink-0">{STAGE_LABELS[p.stage] || p.stage}</span>
          <div className="flex-1 h-6 bg-page rounded-full overflow-hidden border border-hairline">
            <div
              className={`h-full rounded-full flex items-center justify-end pr-2 transition-all ${STAGE_COLORS[p.stage] || "bg-slate-400"}`}
              style={{ width: `${maxCount > 0 ? (p.count / maxCount) * 100 : 0}%`, minWidth: p.count > 0 ? "2rem" : 0 }}
            >
              <span className="text-xs font-bold text-white">{p.count}</span>
            </div>
          </div>
          <span className="w-16 text-xs text-right text-muted flex-shrink-0">{fmt$(p.value)}</span>
          <span className="w-20 text-xs text-right text-primary flex-shrink-0">{fmt$(p.weighted)} wtd</span>
        </div>
      ))}
      <div className="flex items-center gap-3 border-t border-hairline pt-2 mt-1">
        <span className="w-28 text-xs font-semibold text-ink flex-shrink-0">Total</span>
        <div className="flex-1" />
        <span className="w-16 text-xs text-right font-semibold text-ink flex-shrink-0">{fmt$(total)}</span>
        <span className="w-20 text-xs text-right font-semibold text-primary flex-shrink-0" />
      </div>
    </div>
  );
}

function SourceTable({ sources }) {
  if (!sources?.length) return <p className="text-sm text-muted italic">No lead source data.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-hairline">
          <th className="text-left text-xs font-semibold text-muted py-1.5">Source</th>
          <th className="text-right text-xs font-semibold text-muted py-1.5">Leads</th>
          <th className="text-right text-xs font-semibold text-muted py-1.5">Pipeline value</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-hairline">
        {sources.map(s => (
          <tr key={s.source}>
            <td className="py-2 text-ink capitalize">{s.source.replace(/_/g, " ")}</td>
            <td className="py-2 text-right text-muted">{s.count}</td>
            <td className="py-2 text-right font-medium text-accent">{fmt$(s.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function KnowledgeUpdates({ updates }) {
  if (!updates?.length) return (
    <p className="text-xs text-muted italic">No new APB knowledge in the last 14 days. Chrome extension adds entries as you browse APB courses.</p>
  );
  return (
    <div className="space-y-3">
      {updates.map(u => (
        <div key={u.file} className="rounded-lg border border-hairline bg-page px-3 py-2.5">
          <p className="text-[10px] text-muted font-semibold uppercase tracking-wide mb-1">
            {new Date(u.modified).toLocaleDateString("en-AU", { day: "numeric", month: "short" })} · {u.file.replace(".md", "").replace(/_/g, " ")}
          </p>
          <div className="flex flex-wrap gap-1">
            {u.courses.slice(0, 5).map((c, i) => (
              <span key={i} className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5">
                {c.title}
              </span>
            ))}
            {u.courses.length > 5 && (
              <span className="text-xs text-muted">+{u.courses.length - 5} more</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SalesScorecard() {
  const [data, setData] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [sr, kr] = await Promise.all([
          authFetch("/api/sales/scorecard").then(r => r.json()),
          authFetch("/api/sales/knowledge-updates?days=14").then(r => r.json()),
        ]);
        if (sr.ok) setData(sr);
        if (kr.ok) setUpdates(kr.updates || []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="p-8 text-sm text-muted">Loading scorecard…</div>;
  if (!data) return <div className="p-8 text-sm text-red-600">Failed to load scorecard.</div>;

  const { pipeline, total_pipeline_value, weighted_pipeline_value, active_lead_count,
    won_last_12m, close_rate, fp_last_12m, fp_hit_rate, by_source,
    enquiries_last_12m, margin_health, apb_benchmarks } = data;

  const marginIssues = margin_health?.below_min_margin > 0;

  return (
    <div className="space-y-6 p-6">

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Weighted pipeline"
          value={fmt$(weighted_pipeline_value)}
          sub={`${fmt$(total_pipeline_value)} gross · ${active_lead_count} leads`}
        />
        <StatCard
          label="Close rate (12m)"
          value={fmtPct(close_rate)}
          sub={`${won_last_12m.count} won / ${enquiries_last_12m} enquiries`}
          benchmark={
            <BenchmarkPill
              value={close_rate}
              min={apb_benchmarks.close_rate_min}
              max={apb_benchmarks.close_rate_max}
              label={`APB target ${fmtPct(apb_benchmarks.close_rate_min, 0)}–${fmtPct(apb_benchmarks.close_rate_max, 0)}`}
            />
          }
        />
        <StatCard
          label="FP hit rate (12m)"
          value={fmtPct(fp_hit_rate)}
          sub={`${won_last_12m.count} won / ${fp_last_12m} fee proposals`}
          benchmark={
            <BenchmarkPill
              value={fp_hit_rate}
              min={apb_benchmarks.fp_hit_rate_min}
              label={`APB min ${fmtPct(apb_benchmarks.fp_hit_rate_min, 0)}`}
            />
          }
        />
        <StatCard
          label="Won (12m)"
          value={fmt$(won_last_12m.total_value)}
          sub={`${won_last_12m.count} project${won_last_12m.count !== 1 ? "s" : ""} · avg ${fmt$(won_last_12m.avg_value)}`}
        />
      </div>

      {/* Margin health warning */}
      {margin_health?.priced_count > 0 && marginIssues && (
        <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <span className="text-amber-500 text-lg flex-shrink-0">⚠</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {margin_health.below_min_margin} of {margin_health.priced_count} priced leads below APB minimum margin ({apb_benchmarks.min_margin_pct}%)
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Open each lead and update the Target Margin to at least {apb_benchmarks.min_margin_pct}%. Remember: margin % not markup — a 33% margin on $100k cost = $149k sell price.
            </p>
          </div>
        </div>
      )}

      {/* Pipeline funnel + Source breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-card border border-hairline bg-surface p-5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted mb-4">Pipeline by stage</p>
          <PipelineFunnel pipeline={pipeline} total={total_pipeline_value} />
          <p className="mt-3 text-xs text-muted">Weighted column applies APB stage probability (e.g. Enquiry 5%, Fee Proposal 60%)</p>
        </div>

        <div className="rounded-card border border-hairline bg-surface p-5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted mb-4">Pipeline by lead source</p>
          <SourceTable sources={by_source} />
        </div>
      </div>

      {/* APB benchmarks reference */}
      <div className="rounded-card border border-hairline bg-surface p-5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted mb-3">APB benchmarks</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted text-xs">Close rate</p>
            <p className="font-semibold text-ink">{fmtPct(apb_benchmarks.close_rate_min, 0)}–{fmtPct(apb_benchmarks.close_rate_max, 0)}</p>
          </div>
          <div>
            <p className="text-muted text-xs">FP hit rate</p>
            <p className="font-semibold text-ink">≥{fmtPct(apb_benchmarks.fp_hit_rate_min, 0)}</p>
          </div>
          <div>
            <p className="text-muted text-xs">Min gross margin</p>
            <p className="font-semibold text-ink">{apb_benchmarks.min_margin_pct}%</p>
          </div>
          <div>
            <p className="text-muted text-xs">Target gross margin</p>
            <p className="font-semibold text-ink">{apb_benchmarks.target_margin_pct}%</p>
          </div>
        </div>
      </div>

      {/* New APB knowledge */}
      <div className="rounded-card border border-primary/20 bg-primary/[0.03] p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-primary">New from APB (last 14 days)</p>
          {updates.length > 0 && (
            <span className="rounded-full bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5">
              {updates.reduce((s, u) => s + u.courses.length, 0)} entries
            </span>
          )}
        </div>
        <KnowledgeUpdates updates={updates} />
      </div>

    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const PIPELINE_STAGES = [
  "enquiry",
  "qualify",
  "discovery",
  "winning_offer",
  "fee_proposal",
  "accepted",
  "tender"
];

const STAGE_LABELS = {
  enquiry: "Enquiry",
  qualify: "Qualify",
  discovery: "Discovery",
  winning_offer: "Winning Offer",
  fee_proposal: "Fee Proposal",
  accepted: "Accepted",
  tender: "Tender"
};

const STAGE_BAR_COLORS = {
  enquiry: "bg-slate-400",
  qualify: "bg-blue-500",
  discovery: "bg-violet-500",
  winning_offer: "bg-amber-500",
  fee_proposal: "bg-orange-500",
  accepted: "bg-emerald-500",
  tender: "bg-teal-500"
};

const currencyFmt = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0
});

function greetingForHour(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatTodayDate(d = new Date()) {
  return d.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

/** @param {number|null|undefined} n */
function formatCompactMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return currencyFmt.format(v);
}

function formatPct(rate) {
  if (rate == null || Number.isNaN(Number(rate))) return "—";
  return `${Math.round(Number(rate) * 100)}%`;
}

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, data: json };
    return { ok: true, data: json };
  } catch {
    return { ok: false, data: null };
  }
}

function marginBadgeClass(pct) {
  if (pct == null || Number.isNaN(pct)) return "bg-page text-muted border-hairline";
  if (pct >= 20) return "bg-green-50 text-green-800 border-green-200";
  if (pct >= 10) return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-red-50 text-red-800 border-red-200";
}

function workingMarginPct(job) {
  const cv = Number(job.contract_value);
  const cost = Number(job.estimated_total_cost);
  if (!cv || cv <= 0 || cost == null || Number.isNaN(cost)) return null;
  return ((cv - cost) / cv) * 100;
}

function KpiSkeleton() {
  return <motionless className="rounded-card bg-page animate-pulse h-16" />;
}

function KpiTile({ icon, label, value, sub }) {
  return (
    <div className="rounded-card border border-hairline bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</p>
        <span className="text-lg leading-none" aria-hidden>
          {icon}
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold text-ink tabular-nums">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

function PipelineRow({ stage, count, value, maxCount, onNavigate }) {
  const pct = maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 8 : 0) : 0;
  return (
    <button
      type="button"
      onClick={onNavigate}
      className="w-full flex items-center gap-2 py-1.5 text-left rounded-lg hover:bg-page transition-colors"
    >
      <span className="w-[7.5rem] shrink-0 text-xs text-ink truncate">
        {STAGE_LABELS[stage] || stage}
      </span>
      <span className="shrink-0 rounded-full bg-page border border-hairline px-2 py-0.5 text-[10px] font-semibold text-ink tabular-nums min-w-[1.75rem] text-center">
        {count}
      </span>
      <div className="flex-1 h-2 rounded-full bg-page overflow-hidden border border-hairline/80">
        <div
          className={`h-full rounded-full ${STAGE_BAR_COLORS[stage] || "bg-slate-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-xs text-muted text-right tabular-nums">
        {formatCompactMoney(value)}
      </span>
    </button>
  );
}

const QUICK_LINKS = [
  { label: "📋 New Lead", to: "/sales" },
  { label: "📦 New RFQ Package", to: "/tender-manager/rfq-packages" },
  { label: "📅 Schedule", to: "/operations" },
  { label: "💰 Approval Queue", to: "/finance/approvals" }
];

export default function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [scorecard, setScorecard] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [projectJobIds, setProjectJobIds] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    const [unmatchedRes, scorecardRes, jobsRes, projectsRes] = await Promise.all([
      fetchJson("/api/finance/documents/unmatched-count"),
      fetchJson("/api/sales/scorecard"),
      fetchJson("/api/finance/jobs"),
      fetchJson("/api/operations/projects")
    ]);

    const anyFailed =
      !unmatchedRes.ok ||
      !scorecardRes.ok ||
      !jobsRes.ok ||
      !projectsRes.ok;

    setLoadError(anyFailed);

    if (unmatchedRes.ok && unmatchedRes.data?.ok !== false) {
      setUnmatchedCount(Number(unmatchedRes.data?.count) || 0);
    } else {
      setUnmatchedCount(0);
    }

    if (scorecardRes.ok && scorecardRes.data?.ok) {
      setScorecard(scorecardRes.data);
    } else {
      setScorecard(null);
    }

    if (jobsRes.ok && jobsRes.data?.ok) {
      setJobs(jobsRes.data.jobs || []);
    } else {
      setJobs([]);
    }

    const ids = new Set();
    if (projectsRes.ok && projectsRes.data?.ok) {
      for (const p of projectsRes.data.projects || []) {
        const jid = p.jobs?.id;
        if (jid) ids.add(jid);
      }
    }
    setProjectJobIds(ids);

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const now = new Date();
  const pipelineByStage = Object.fromEntries(
    (scorecard?.pipeline || []).map((p) => [p.stage, p])
  );
  const visiblePipeline = PIPELINE_STAGES.filter((s) => pipelineByStage[s]?.count > 0);
  const maxStageCount = visiblePipeline.length
    ? Math.max(...visiblePipeline.map((s) => pipelineByStage[s].count))
    : 0;

  const linkedJobs = jobs
    .filter((j) => projectJobIds.has(j.id))
    .slice(0, 6);
  const hasMoreJobs = jobs.filter((j) => projectJobIds.has(j.id)).length > 6;

  const won = scorecard?.won_last_12m;
  const closeRate = scorecard?.close_rate;

  return (
    <div className="space-y-6 pb-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">
          {greetingForHour(now.getHours())}, Blue Leaf
        </h1>
        <p className="mt-1 text-sm text-muted">{formatTodayDate(now)}</p>
      </header>

      {loadError ? (
        <p className="text-sm text-red-600">Could not load live data</p>
      ) : null}

      {!loading && unmatchedCount > 0 ? (
        <div className="rounded-card border-2 border-red-300 bg-red-50 px-4 py-3 shadow-sm">
          <h2 className="text-sm font-bold text-red-900">Requires Action</h2>
          <Link
            to="/finance/approvals"
            className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-red-800 hover:underline"
          >
            ⚠ {unmatchedCount} invoice{unmatchedCount === 1 ? "" : "s"} awaiting approval
          </Link>
        </div>
      ) : null}

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : (
          <>
            <KpiTile
              icon="📊"
              label="Pipeline Value"
              value={formatCompactMoney(scorecard?.total_pipeline_value)}
              sub={
                scorecard
                  ? `${scorecard.active_lead_count ?? 0} active lead${scorecard.active_lead_count === 1 ? "" : "s"}`
                  : "—"
              }
            />
            <KpiTile
              icon="🎯"
              label="Weighted Forecast"
              value={formatCompactMoney(scorecard?.weighted_pipeline_value)}
              sub="probability-weighted"
            />
            <KpiTile
              icon="🏆"
              label="Won (12 months)"
              value={formatCompactMoney(won?.total_value)}
              sub={
                won && closeRate != null
                  ? `${won.count ?? 0} job${won.count === 1 ? "" : "s"} · ${formatPct(closeRate)} close rate`
                  : "—"
              }
            />
            <KpiTile
              icon="📋"
              label="Fee Proposal Hit Rate"
              value={formatPct(scorecard?.fp_hit_rate)}
              sub={
                scorecard?.fp_last_12m != null
                  ? `${scorecard.fp_last_12m} proposal${scorecard.fp_last_12m === 1 ? "" : "s"} last 12m`
                  : "—"
              }
            />
          </>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-card border border-hairline bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-sm font-bold text-ink">Active Jobs</h2>
            {hasMoreJobs ? (
              <Link to="/finance/jobs" className="text-xs font-semibold text-primary hover:underline">
                View all →
              </Link>
            ) : null}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-page animate-pulse" />
              ))}
            </div>
          ) : linkedJobs.length === 0 ? (
            <p className="text-sm text-muted">No active jobs</p>
          ) : (
            <ul className="space-y-3">
              {linkedJobs.map((job) => {
                const margin = workingMarginPct(job);
                return (
                  <li key={job.id}>
                    <Link
                      to={`/finance/jobs/${job.id}`}
                      className="block rounded-lg border border-hairline bg-page px-3 py-2.5 hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-sm text-ink line-clamp-1">
                          {job.address || "Unnamed job"}
                        </span>
                        {margin != null ? (
                          <span
                            className={`shrink-0 text-[10px] font-bold rounded-full border px-2 py-0.5 ${marginBadgeClass(margin)}`}
                          >
                            {Math.round(margin)}%
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Contract {currencyFmt.format(Number(job.contract_value) || 0)}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-card border border-hairline bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-bold text-ink mb-4">Pipeline</h2>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-8 rounded-lg bg-page animate-pulse" />
              ))}
            </div>
          ) : visiblePipeline.length === 0 ? (
            <p className="text-sm text-muted">No active pipeline stages</p>
          ) : (
            <div className="space-y-1">
              {visiblePipeline.map((stage) => {
                const row = pipelineByStage[stage];
                return (
                  <PipelineRow
                    key={stage}
                    stage={stage}
                    count={row.count}
                    value={row.value}
                    maxCount={maxStageCount}
                    onNavigate={() => navigate("/sales")}
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>

      <footer className="flex flex-wrap gap-2 pt-2">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="inline-flex items-center rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink shadow-sm hover:border-primary/40 hover:bg-page transition-colors"
          >
            {link.label} →
          </Link>
        ))}
      </footer>
    </div>
  );
}

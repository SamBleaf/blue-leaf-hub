import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../lib/apiFetch.js";
import { DemoBanner } from "./MarketingStateBanner.jsx";

// Marketing Intelligence dashboard (Batch 3). Read-only — content pipeline health.
// Falls back to clearly-labelled DEMO data when the API is unreachable (no staging DB).
// Named MarketingDashboard to avoid collision with legacy MarketingIntelligence (SEO tab).

const PIPELINE_LABELS = {
  drafted:   { label: "Drafting",  color: "bg-page text-muted border border-hairline" },
  inReview:  { label: "In Review", color: "bg-warning/15 text-ink" },
  approved:  { label: "Approved",  color: "bg-accent/10 text-accent" },
  scheduled: { label: "Scheduled", color: "bg-primary/10 text-primary" },
  published: { label: "Published", color: "bg-green-100 text-green-700" },
};

function PipelineTile({ label, count, colorCls }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-lg p-4 ${colorCls}`}>
      <span className="text-2xl font-bold">{count}</span>
      <span className="mt-0.5 text-xs font-medium">{label}</span>
    </div>
  );
}

function SectionHead({ title }) {
  return <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{title}</h2>;
}

export default function MarketingDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data: d } = await apiFetch("/api/marketing/intelligence");
    if (ok && d) {
      setData(d);
      setUsingDemo(!!d.demo);
    } else {
      setUsingDemo(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-6 text-sm text-muted">
        Loading…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-6 text-sm text-muted">
        Could not load intelligence data.{" "}
        <button type="button" onClick={load} className="underline">Retry</button>
      </div>
    );
  }

  const { pipeline, platformMix, mediaStats, campaignActivity, recentPublishes, nextActions } = data;

  return (
    <div className="space-y-6 pb-24">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Marketing</p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">Intelligence</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Content pipeline health at a glance. Read-only — nothing is published from here.
        </p>
      </header>

      {usingDemo && <DemoBanner />}

      {nextActions && nextActions.length > 0 && (
        <section className="space-y-2">
          <SectionHead title="Next actions" />
          <div className="space-y-1.5">
            {nextActions.map((action, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
                  {i + 1}
                </span>
                {action}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <SectionHead title="Content pipeline" />
        <div className="grid grid-cols-5 gap-2">
          {Object.entries(PIPELINE_LABELS).map(([key, { label, color }]) => (
            <PipelineTile key={key} label={label} count={pipeline?.[key] ?? 0} colorCls={color} />
          ))}
        </div>
        <p className="text-xs text-muted">Total: {pipeline?.total ?? 0} items tracked</p>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="space-y-2">
          <SectionHead title="Platform mix" />
          <div className="rounded-card border border-hairline bg-surface p-3 space-y-2">
            {(platformMix || []).length === 0 ? (
              <p className="text-sm text-muted">No content items yet.</p>
            ) : (
              platformMix.map((p) => (
                <div key={p.channel} className="flex items-center justify-between">
                  <span className="text-sm capitalize text-ink">{p.channel}</span>
                  <span className="rounded-full bg-page px-2 py-0.5 text-xs font-semibold text-muted">{p.count}</span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="space-y-2">
          <SectionHead title="Media library" />
          <div className="rounded-card border border-hairline bg-surface p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink">Total assets</span>
              <span className="text-sm font-semibold text-ink">{mediaStats?.totalAssets ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink">With analysis</span>
              <span className="text-sm font-semibold text-accent">{mediaStats?.withAnalysis ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink">New this week</span>
              <span className="text-sm font-semibold text-primary">{mediaStats?.recentUploads ?? 0}</span>
            </div>
            <Link to="/marketing/vault" className="block pt-1 text-xs font-semibold text-primary underline">
              Open Media Vault →
            </Link>
          </div>
        </section>
      </div>

      <section className="space-y-2">
        <SectionHead title="Campaign activity" />
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Active campaigns", value: campaignActivity?.activeCampaigns ?? 0 },
            { label: "Templates", value: campaignActivity?.templatesAvailable ?? 0 },
            { label: "Slots filled this week", value: campaignActivity?.weeklySlotsFilled ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-hairline bg-surface p-3 text-center">
              <p className="text-xl font-bold text-ink">{value}</p>
              <p className="text-xs text-muted">{label}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-4 pt-1">
          <Link to="/marketing/planner" className="text-xs font-semibold text-primary underline">Weekly Planner →</Link>
          <Link to="/marketing/calendar" className="text-xs font-semibold text-primary underline">Calendar →</Link>
        </div>
      </section>

      <section className="space-y-2">
        <SectionHead title="Recent publishes" />
        {(recentPublishes || []).length === 0 ? (
          <div className="rounded-card border border-hairline bg-surface p-4 text-sm text-muted">
            No published posts yet. Approve content and mark as posted in the{" "}
            <Link to="/marketing/calendar" className="underline">Calendar</Link>.
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentPublishes.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-hairline bg-surface px-3 py-2">
                <div>
                  <span className="text-xs font-semibold capitalize text-primary">{p.channel}</span>
                  <span className="mx-1.5 text-muted">·</span>
                  <span className="text-xs text-ink">{p.title}</span>
                </div>
                {p.publishedAt && (
                  <span className="text-[11px] text-muted">
                    {new Date(p.publishedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <SectionHead title="Attribution" />
        <div className="rounded-card border border-hairline bg-surface p-4">
          <p className="text-sm text-ink">
            See where your leads are coming from in the{" "}
            <Link to="/marketing/attribution" className="font-semibold text-primary underline">
              Attribution dashboard →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}

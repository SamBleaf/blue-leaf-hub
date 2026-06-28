import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../lib/apiFetch.js";
import { DemoBanner } from "./MarketingStateBanner.jsx";

// Leads & Attribution read-only dashboard (Batch 3).
// Shows where marketing enquiries appear to come from. No CRM mutation, no sales pipeline mutation.
// Falls back to clearly-labelled DEMO data when the API is unreachable (no staging DB).

const SOURCE_COLORS = {
  instagram: "bg-pink-100 text-pink-700",
  facebook:  "bg-blue-100 text-blue-700",
  google:    "bg-yellow-100 text-yellow-700",
  referral:  "bg-purple-100 text-purple-700",
  direct:    "bg-page text-muted border border-hairline",
  unknown:   "bg-red-50 text-red-600",
};

function SourceBadge({ source }) {
  const cls = SOURCE_COLORS[source] || "bg-page text-muted border border-hairline";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${cls}`}>
      {source}
    </span>
  );
}

function SectionHead({ title }) {
  return <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{title}</h2>;
}

export default function MarketingAttribution() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);
  const [days, setDays] = useState("90");

  const load = useCallback(async (d = days) => {
    setLoading(true);
    const { ok, data: res } = await apiFetch(`/api/marketing/attribution?days=${d}`);
    if (ok && res) {
      setData(res);
      setUsingDemo(!!res.demo);
    } else {
      setUsingDemo(true);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  function changeWindow(d) {
    setDays(d);
    load(d);
  }

  if (loading) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-6 text-sm text-muted">
        Loading attribution…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-6 text-sm text-muted">
        Could not load attribution data.{" "}
        <button type="button" onClick={() => load()} className="underline">Retry</button>
      </div>
    );
  }

  const { sourceBreakdown, recentLeads, unknownSourceCount, totalLeads, captureGaps } = data;
  const maxCount = Math.max(...(sourceBreakdown || []).map((s) => s.count), 1);

  return (
    <div className="space-y-6 pb-24">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Marketing</p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">Leads &amp; Attribution</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Where your enquiries appear to be coming from. Read-only — no leads are created or changed here.
        </p>
      </header>

      {usingDemo && <DemoBanner />}

      {/* Time window picker */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted">Show last:</span>
        {["30", "90", "180"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => changeWindow(d)}
            className={`rounded-full px-3 py-1 font-semibold transition-colors ${
              days === d ? "bg-primary text-white" : "border border-hairline bg-page text-ink hover:bg-surface"
            }`}
          >
            {d} days
          </button>
        ))}
        <span className="ml-auto text-muted">{totalLeads} lead{totalLeads !== 1 ? "s" : ""} total</span>
      </div>

      {/* Source breakdown */}
      <section className="space-y-2">
        <SectionHead title="Source breakdown" />
        <div className="rounded-card border border-hairline bg-surface p-4 space-y-3">
          {(sourceBreakdown || []).length === 0 ? (
            <p className="text-sm text-muted">No leads in this period.</p>
          ) : (
            sourceBreakdown.map((s) => (
              <div key={s.source} className="flex items-center gap-3">
                <div className="w-24 shrink-0">
                  <SourceBadge source={s.source} />
                </div>
                <div className="flex-1 h-2 rounded-full bg-hairline overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-primary/70"
                    style={{ width: `${Math.round((s.count / maxCount) * 100)}%` }}
                  />
                </div>
                <span className="w-6 text-right text-xs font-semibold text-ink">{s.count}</span>
              </div>
            ))
          )}
          {unknownSourceCount > 0 && (
            <p className="text-xs text-muted pt-1">
              {unknownSourceCount} lead{unknownSourceCount !== 1 ? "s" : ""} with unknown source — see data capture gaps below.
            </p>
          )}
        </div>
      </section>

      {/* Recent leads */}
      <section className="space-y-2">
        <SectionHead title="Recent enquiries" />
        {(recentLeads || []).length === 0 ? (
          <div className="rounded-card border border-hairline bg-surface p-4 text-sm text-muted">
            No leads in this period.
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentLeads.map((lead, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-hairline bg-surface px-3 py-2">
                <span className="text-sm text-ink">{lead.name || lead.firstName + " " + (lead.lastName || "")}</span>
                <div className="flex items-center gap-2">
                  <SourceBadge source={lead.source || "unknown"} />
                  <span className="rounded-full bg-page px-2 py-0.5 text-[11px] text-muted capitalize">{lead.stage}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">
          Full lead detail in{" "}
          <Link to="/sales" className="font-semibold text-primary underline">Sales Pipeline →</Link>
        </p>
      </section>

      {/* Data capture gaps */}
      {(captureGaps || []).length > 0 && (
        <section className="space-y-2">
          <SectionHead title="Data capture recommendations" />
          <div className="rounded-card border border-hairline bg-surface p-4 space-y-2">
            {captureGaps.map((gap, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-ink">
                <span className="mt-0.5 text-warning">•</span>
                {gap}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Campaign attribution note */}
      <section className="space-y-2">
        <SectionHead title="Campaign attribution" />
        <div className="rounded-card border border-hairline bg-surface p-4 space-y-2">
          <p className="text-sm text-ink">
            Full first-touch / last-touch attribution per lead is available once your website sends
            attribution events. The Blue Leaf attribution script fires <code className="rounded bg-page px-1 text-xs">POST /api/public/attribution</code> on each page view and links them to the enquiry at submission time.
          </p>
          <p className="text-sm text-muted">
            See{" "}
            <Link to="/marketing/intelligence" className="font-semibold text-primary underline">
              Intelligence dashboard
            </Link>{" "}
            for content pipeline health.
          </p>
        </div>
      </section>
    </div>
  );
}

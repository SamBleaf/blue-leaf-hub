import { useState, useEffect, useCallback } from "react";
import { apiFetch, apiPost } from "../../lib/apiFetch.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-AU");
}

function pos(p) {
  if (p == null) return "—";
  return `#${Number(p).toFixed(1)}`;
}

function EmptyCard({ text }) {
  return (
    <div className="flex items-center justify-center h-20 rounded-lg border-2 border-dashed border-hairline text-sm text-muted">
      {text}
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ─── This Month KPIs ─────────────────────────────────────────────────────────

function ThisMonth({ data }) {
  const kpis = [
    { label: "Enquiries",       value: data?.enquiries ?? "—" },
    { label: "Qualified leads", value: data?.qualified ?? "—" },
    { label: "Tenders",         value: data?.tenders   ?? "—" },
    { label: "Signed",          value: data?.signed    ?? "—" },
  ];

  return (
    <div className="bg-surface border border-hairline rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <SectionHeader title="This Month" subtitle="Marketing-attributed leads" />
        <a
          href="/sales"
          className="text-xs text-primary hover:underline font-medium shrink-0"
        >
          View pipeline →
        </a>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {kpis.map(({ label, value }) => (
          <div key={label} className="text-center">
            <p className="text-2xl font-bold text-ink">{fmt(value)}</p>
            <p className="text-xs text-muted mt-0.5">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── What's Working / Not ────────────────────────────────────────────────────

function ContentTheme({ item }) {
  const trend = item.engagementTrend ?? item.positionTrend;
  const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  const trendColour = trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-500" : "text-muted";

  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-hairline last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink font-medium truncate">{item.title || item.topic || "—"}</p>
        <p className="text-xs text-muted mt-0.5 capitalize">{item.channel}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={`text-sm font-medium ${trendColour}`}>{trendIcon}</span>
        <div className="text-right">
          <p className="text-sm font-semibold text-ink">{item.attributedEnquiries ?? 0}</p>
          <p className="text-xs text-muted">enquiries</p>
        </div>
      </div>
    </div>
  );
}

function WhatsWorking({ working, notWorking }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-surface border border-hairline rounded-xl p-5">
        <SectionHeader title="What's Working" subtitle="Top content by enquiry attribution" />
        {working?.length ? (
          <div>
            {working.map((item, i) => <ContentTheme key={i} item={item} />)}
          </div>
        ) : (
          <EmptyCard text="No attributed enquiries yet — record social publishes to start tracking" />
        )}
      </div>
      <div className="bg-surface border border-hairline rounded-xl p-5">
        <SectionHeader title="What's Not Working" subtitle="High effort, low result" />
        {notWorking?.length ? (
          <div>
            {notWorking.map((item, i) => <ContentTheme key={i} item={item} />)}
          </div>
        ) : (
          <EmptyCard text="Not enough data — needs ≥ 5 published items with social snapshots" />
        )}
      </div>
    </div>
  );
}

// ─── Google Opportunity ───────────────────────────────────────────────────────

function GoogleOpportunity({ opportunities }) {
  return (
    <div className="bg-surface border border-hairline rounded-xl p-5">
      <SectionHeader title="Google Opportunity" subtitle="Keywords in positions 6–15 with search volume — close to the top" />
      {opportunities?.length ? (
        <div className="space-y-3">
          {opportunities.map((kw) => (
            <div key={kw.id} className="flex items-center justify-between gap-4 py-3 border-b border-hairline last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">&ldquo;{kw.keyword}&rdquo;</p>
                <p className="text-xs text-muted mt-0.5">
                  Position {pos(kw.currentPosition)} · {fmt(kw.monthlyImpressions)} impressions/mo
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/marketing/intelligence?keyword=${encodeURIComponent(kw.keyword)}`}
                  onClick={(e) => e.preventDefault()}
                  className="text-xs px-3 py-1.5 rounded-lg border border-primary text-primary hover:bg-primary/5 font-medium transition-colors"
                >
                  Create content →
                </a>
                {kw.targetPageUrl && (
                  <a
                    href={kw.targetPageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs px-3 py-1.5 rounded-lg border border-hairline text-muted hover:border-primary/40 transition-colors"
                  >
                    Improve page →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyCard text="No keyword data — add keyword targets and run a GSC sync" />
      )}
    </div>
  );
}

// ─── Follow Up Now ────────────────────────────────────────────────────────────

function FollowUpNow({ contacts }) {
  return (
    <div className="bg-surface border border-hairline rounded-xl p-5">
      <SectionHeader
        title="Follow Up Now"
        subtitle="Contacts with high engagement but no recent personal interaction"
      />
      {contacts?.length ? (
        <div className="space-y-3">
          {contacts.map((c) => (
            <div key={c.contactId} className="flex items-start justify-between gap-4 py-3 border-b border-hairline last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink">{c.name}</p>
                <p className="text-xs text-muted capitalize mt-0.5">{c.contactType?.replace(/_/g, " ")}</p>
                <div className="flex gap-3 mt-1.5 text-xs text-muted flex-wrap">
                  {c.emailOpens > 0 && <span>{c.emailOpens} email opens</span>}
                  {c.websiteVisits > 0 && <span>{c.websiteVisits} site visits</span>}
                  {c.caseStudyViews > 0 && <span>{c.caseStudyViews} case study views</span>}
                  {c.lastContactDate && (
                    <span>
                      Last contact:{" "}
                      {new Date(c.lastContactDate).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/sales/contacts/${c.contactId}`}
                  className="text-xs px-3 py-1.5 rounded-lg border border-hairline text-ink hover:border-primary/40 font-medium transition-colors"
                >
                  Log interaction →
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyCard text="No high-engagement contacts — build CRM contacts with email interactions" />
      )}
    </div>
  );
}

// ─── Create Next ──────────────────────────────────────────────────────────────

const CONTENT_TYPE_LABELS = {
  faq_page:        "FAQ Page",
  client_guide:    "Client Guide",
  instagram_post:  "Instagram Post",
  journal_article: "Journal Article",
  website_page:    "Website Page",
};

function CreateNext({ suggestions }) {
  return (
    <div className="bg-surface border border-hairline rounded-xl p-5">
      <SectionHeader
        title="Create Next"
        subtitle="Based on what's converting, keyword gaps, and questions from leads"
      />
      {suggestions?.length ? (
        <div className="space-y-3">
          {suggestions.map((s, i) => (
            <div key={s.id || i} className="flex items-start justify-between gap-4 py-3 border-b border-hairline last:border-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {(s.suggestedContentType || s.contentType) && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      {CONTENT_TYPE_LABELS[s.suggestedContentType || s.contentType] || (s.suggestedContentType || s.contentType)}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-ink leading-snug">
                  {s.suggestion || s.questionText || "—"}
                </p>
                {s.reason && <p className="text-xs text-muted mt-1 leading-relaxed">{s.reason}</p>}
                {s.suggestedKeyword && (
                  <p className="text-xs text-primary mt-1 font-medium">{s.suggestedKeyword}</p>
                )}
              </div>
              <a
                href={`/marketing/create`}
                className="text-xs px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 font-medium transition-colors shrink-0"
              >
                Create →
              </a>
            </div>
          ))}
        </div>
      ) : (
        <EmptyCard text="No suggestions yet — run a Question Engine scan or add keyword targets" />
      )}
    </div>
  );
}

// ─── Sync controls ───────────────────────────────────────────────────────────

function SyncControls({ onRefresh }) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  async function runSync(endpoint, label) {
    setSyncing(true);
    setSyncMsg("");
    const { ok, data, error } = await apiPost(endpoint, {});
    setSyncing(false);
    if (ok) {
      setSyncMsg(`${label} sync complete — ${data?.updated ?? 0} updated`);
      setTimeout(() => setSyncMsg(""), 4000);
      onRefresh();
    } else {
      setSyncMsg(`${label} sync failed: ${error}`);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => runSync("/api/intelligence/sync/meta", "Social")}
        disabled={syncing}
        className="text-xs px-3 py-1.5 rounded-lg border border-hairline text-muted hover:border-primary/40 hover:text-ink disabled:opacity-50 transition-colors"
      >
        {syncing ? "Syncing…" : "Sync social data"}
      </button>
      <button
        type="button"
        onClick={() => runSync("/api/intelligence/sync/gsc", "GSC")}
        disabled={syncing}
        className="text-xs px-3 py-1.5 rounded-lg border border-hairline text-muted hover:border-primary/40 hover:text-ink disabled:opacity-50 transition-colors"
      >
        {syncing ? "Syncing…" : "Sync Search Console"}
      </button>
      {syncMsg && (
        <p className="text-xs text-muted">{syncMsg}</p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MarketingIntelligence() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { ok, data: d, error: e } = await apiFetch("/api/intelligence/dashboard");
    setLoading(false);
    if (ok) {
      setData(d);
    } else {
      setError(e || "Failed to load dashboard");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted text-sm">
        Loading intelligence dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-muted">Data updates nightly. Use sync buttons to refresh.</p>
        <SyncControls onRefresh={load} />
      </div>

      {/* Section 1 — This Month */}
      <ThisMonth data={data?.dashboard?.this_month} />

      {/* Section 2 — What's Working / Not */}
      <WhatsWorking working={data?.dashboard?.working} notWorking={data?.dashboard?.not_working} />

      {/* Section 3 — Google Opportunity */}
      <GoogleOpportunity opportunities={data?.dashboard?.opportunities} />

      {/* Section 4 — Follow Up Now */}
      <FollowUpNow contacts={data?.dashboard?.follow_up?.contacts} />

      {/* Section 5 — Create Next */}
      <CreateNext suggestions={data?.dashboard?.create_next?.questions} />
    </div>
  );
}

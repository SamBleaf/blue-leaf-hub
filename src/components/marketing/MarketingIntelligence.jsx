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

// ─── AI Summary banner ────────────────────────────────────────────────────────

function AiSummary({ summary }) {
  if (!summary) return null;
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="text-blue-500 text-lg mt-0.5 shrink-0">✦</span>
        <div>
          <p className="text-xs font-semibold text-blue-700 mb-1">This Week&apos;s Intelligence Summary</p>
          <p className="text-sm text-blue-900 leading-relaxed">{summary}</p>
        </div>
      </div>
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

// ─── Suburb Engagement ────────────────────────────────────────────────────────

function SuburbEngagement({ suburbs }) {
  if (!suburbs?.length) return null;
  const max = suburbs[0]?.enquiries || 1;

  return (
    <div className="bg-surface border border-hairline rounded-xl p-5">
      <SectionHeader
        title="Suburb Engagement"
        subtitle="Where your enquiries are coming from — last 90 days"
      />
      <div className="space-y-3">
        {suburbs.map((s) => {
          const pct = Math.round((s.enquiries / max) * 100);
          return (
            <div key={s.suburb} className="flex items-center gap-3">
              <p className="text-sm text-ink font-medium w-28 shrink-0 truncate capitalize">
                {s.suburb}
              </p>
              <div className="flex-1 bg-hairline rounded-full h-2">
                <div
                  className="bg-primary rounded-full h-2 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex items-center gap-3 text-xs text-muted shrink-0 w-32 justify-end">
                <span>{s.enquiries} enquiries</span>
                {s.qualified > 0 && (
                  <span className="text-emerald-600 font-medium">{s.qualified} qualified</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
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

// ─── Website Pages (P1.8) ─────────────────────────────────────────────────────

const PAGE_TYPE_LABELS = {
  homepage:     "Home",
  service:      "Service",
  suburb:       "Suburb",
  case_study:   "Case Study",
  client_guide: "Client Guide",
  faq:          "FAQ",
  journal:      "Journal",
  about:        "About",
  process:      "Process",
};

const PAGE_STATUS_STYLES = {
  live:         "bg-emerald-100 text-emerald-700",
  planned:      "bg-slate-100 text-slate-600",
  needs_update: "bg-amber-100 text-amber-700",
  archived:     "bg-red-100 text-red-500",
};

function WebsitePages() {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [briefLoading, setBriefLoading] = useState({});
  const [briefResults, setBriefResults] = useState({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { ok, data } = await apiFetch("/api/intelligence/pages");
      setLoading(false);
      if (ok) setPages(data?.pages || []);
    }
    load();
  }, []);

  async function generateBrief(pageId) {
    setBriefLoading((prev) => ({ ...prev, [pageId]: true }));
    const { ok, data, error } = await apiPost(`/api/intelligence/pages/${pageId}/brief`, {});
    setBriefLoading((prev) => ({ ...prev, [pageId]: false }));
    if (ok && data?.brief) {
      setBriefResults((prev) => ({ ...prev, [pageId]: data.brief }));
    } else {
      setBriefResults((prev) => ({ ...prev, [pageId]: { error: error || "Brief generation failed" } }));
    }
  }

  return (
    <div className="bg-surface border border-hairline rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <SectionHeader
          title="Website Pages"
          subtitle="Page inventory — manage SEO targets, clusters, and content briefs"
        />
        <span className="text-xs text-muted shrink-0">{pages.length} pages tracked</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-16 text-sm text-muted">
          Loading pages…
        </div>
      ) : pages.length === 0 ? (
        <EmptyCard text="No website pages tracked yet — add pages via the API or Hub settings" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline">
                <th className="text-left text-xs font-semibold text-muted pb-2 pr-4">URL / Title</th>
                <th className="text-left text-xs font-semibold text-muted pb-2 pr-4">Type</th>
                <th className="text-left text-xs font-semibold text-muted pb-2 pr-4">Status</th>
                <th className="text-left text-xs font-semibold text-muted pb-2 pr-4">Cluster</th>
                <th className="text-right text-xs font-semibold text-muted pb-2 pr-4">Position</th>
                <th className="text-right text-xs font-semibold text-muted pb-2 pr-4">Impressions</th>
                <th className="text-right text-xs font-semibold text-muted pb-2">Brief</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => {
                const brief = briefResults[page.id];
                return (
                  <>
                    <tr key={page.id} className="border-b border-hairline last:border-0">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          {page.needsRefresh && (
                            <span title="Stale — not updated in 6+ months" className="text-amber-500 shrink-0">⚠</span>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-ink truncate max-w-[200px]">
                              {page.title || page.urlPath}
                            </p>
                            <p className="text-xs text-muted truncate max-w-[200px]">{page.urlPath}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="text-xs text-muted">
                          {PAGE_TYPE_LABELS[page.pageType] || page.pageType || "—"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        {page.status ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PAGE_STATUS_STYLES[page.status] || "bg-slate-100 text-slate-600"}`}>
                            {page.status.replace(/_/g, " ")}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="text-xs text-muted">{page.cluster || "—"}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        <span className={`text-xs font-medium ${page.currentAvgPosition && page.currentAvgPosition <= 10 ? "text-emerald-600" : "text-ink"}`}>
                          {pos(page.currentAvgPosition)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        <span className="text-xs text-muted">{fmt(page.currentImpressions)}</span>
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => generateBrief(page.id)}
                          disabled={briefLoading[page.id]}
                          className="text-xs px-2.5 py-1 rounded-lg border border-hairline text-muted hover:border-primary/40 hover:text-primary disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          {briefLoading[page.id] ? "Generating…" : brief ? "Regenerate" : "Generate brief"}
                        </button>
                      </td>
                    </tr>
                    {brief && (
                      <tr key={`${page.id}-brief`} className="border-b border-hairline">
                        <td colSpan={7} className="pb-4 pt-1 pr-4">
                          {brief.error ? (
                            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{brief.error}</p>
                          ) : (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 space-y-2">
                              {brief.recommendedTitle && (
                                <div>
                                  <span className="text-xs font-semibold text-blue-700">Recommended title: </span>
                                  <span className="text-xs text-blue-900">{brief.recommendedTitle}</span>
                                </div>
                              )}
                              {brief.recommendedH1 && (
                                <div>
                                  <span className="text-xs font-semibold text-blue-700">H1: </span>
                                  <span className="text-xs text-blue-900">{brief.recommendedH1}</span>
                                </div>
                              )}
                              {brief.recommendedH2s?.length > 0 && (
                                <div>
                                  <span className="text-xs font-semibold text-blue-700">H2 headings: </span>
                                  <span className="text-xs text-blue-900">{brief.recommendedH2s.join(" · ")}</span>
                                </div>
                              )}
                              {brief.keyQuestionsToAnswer?.length > 0 && (
                                <div>
                                  <span className="text-xs font-semibold text-blue-700">Questions to answer: </span>
                                  <span className="text-xs text-blue-900">{brief.keyQuestionsToAnswer.slice(0, 3).join(" · ")}</span>
                                </div>
                              )}
                              {brief.contentAngles?.length > 0 && (
                                <div>
                                  <span className="text-xs font-semibold text-blue-700">Content angles: </span>
                                  <span className="text-xs text-blue-900">{brief.contentAngles.slice(0, 2).join(" · ")}</span>
                                </div>
                              )}
                              {brief.wordCountTarget && (
                                <div>
                                  <span className="text-xs font-semibold text-blue-700">Target length: </span>
                                  <span className="text-xs text-blue-900">{fmt(brief.wordCountTarget)} words</span>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Sync controls ───────────────────────────────────────────────────────────

function SyncControls({ onRefresh }) {
  const [syncing, setSyncing] = useState(null);
  const [syncMsg, setSyncMsg] = useState("");

  async function runSync(endpoint, label) {
    setSyncing(label);
    setSyncMsg("");
    const { ok, data, error } = await apiPost(endpoint, {});
    setSyncing(null);
    if (ok) {
      setSyncMsg(`${label} sync complete — ${data?.updated ?? 0} updated`);
      setTimeout(() => setSyncMsg(""), 5000);
      onRefresh();
    } else {
      setSyncMsg(`${label} failed: ${error}`);
      setTimeout(() => setSyncMsg(""), 6000);
    }
  }

  const buttons = [
    { label: "Social",         endpoint: "/api/intelligence/sync/meta" },
    { label: "Search Console", endpoint: "/api/intelligence/sync/gsc"  },
    { label: "GA4",            endpoint: "/api/intelligence/sync/ga4"  },
    { label: "Google Business",endpoint: "/api/intelligence/sync/gbp"  },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {buttons.map(({ label, endpoint }) => (
        <button
          key={label}
          type="button"
          onClick={() => runSync(endpoint, label)}
          disabled={syncing !== null}
          className="text-xs px-3 py-1.5 rounded-lg border border-hairline text-muted hover:border-primary/40 hover:text-ink disabled:opacity-50 transition-colors"
        >
          {syncing === label ? "Syncing…" : `Sync ${label}`}
        </button>
      ))}
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

  const dash = data?.dashboard ?? {};

  return (
    <div className="space-y-6">
      {/* Controls row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-muted">Data updates nightly. Use sync buttons to refresh.</p>
        <SyncControls onRefresh={load} />
      </div>

      {/* AI summary banner — only shown when AI has produced a summary */}
      {dash.ai_summary && <AiSummary summary={dash.ai_summary} />}

      {/* Section 1 — This Month */}
      <ThisMonth data={dash.this_month} />

      {/* Section 2 — What's Working / Not */}
      <WhatsWorking working={dash.working} notWorking={dash.not_working} />

      {/* Section 3 — Google Opportunity */}
      <GoogleOpportunity opportunities={dash.opportunities} />

      {/* Section 4 — Follow Up Now */}
      <FollowUpNow contacts={dash.follow_up?.contacts} />

      {/* Section 5 — Create Next */}
      <CreateNext suggestions={dash.create_next?.questions} />

      {/* Section 6 — Suburb Engagement (P2.8) */}
      <SuburbEngagement suburbs={dash.suburb_engagement} />

      {/* Section 7 — Website Pages (P1.8) */}
      <WebsitePages />
    </div>
  );
}

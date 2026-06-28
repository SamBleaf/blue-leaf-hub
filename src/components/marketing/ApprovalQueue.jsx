import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { apiFetch, apiPatch } from "../../lib/apiFetch.js";
import JoshLabelBadge from "./JoshLabelBadge.jsx";
import { DemoBanner, ErrorNote } from "./MarketingStateBanner.jsx";

// Approval Queue foundation (Run C1) — lists content packages awaiting review and lets Josh/Sam
// approve / request changes / reject. No publishing. Falls back to a clearly-labelled demo package
// when the API is unreachable (no staging) so the workflow is reviewable.

const RISK_STYLE = {
  low: "bg-accent/10 text-accent",
  medium: "bg-warning/15 text-ink",
  high: "bg-red-100 text-red-700",
};

const DEMO_PACKAGE = {
  id: "demo-pkg",
  demo: true,
  topic: "Why we protect homes before cladding",
  status: "in_review",
  recommendedPlatforms: ["instagram", "facebook"],
  reviewSummary: { risk: "low", labels: ["Ready for Josh review", "Good lead quality topic"] },
  items: [
    {
      id: "demo-ig",
      channel: "instagram",
      title: "Why we protect homes before cladding",
      body: "[DEMO] The part of your home you will never see — but will always feel. Here is how we weatherproof before the cladding goes on…",
      operational_labels: ["Ready for Josh review", "Good lead quality topic"],
      risk_level: "low",
    },
    {
      id: "demo-fb",
      channel: "facebook",
      title: "Why we protect homes before cladding",
      body: "[DEMO] Before the cladding goes on, there is a stage that decides how comfortable your home will be for decades…",
      operational_labels: ["Ready for Josh review"],
      risk_level: "low",
    },
  ],
};

export default function ApprovalQueue() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usingDemo, setUsingDemo] = useState(false);
  const [actingId, setActingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { ok, data, error: e } = await apiFetch("/api/marketing/packages?status=in_review");
    const list = data?.packages || [];
    if (ok) {
      // Live response (even if empty) → real queue or a true "nothing waiting" state, never demo.
      setPackages(list);
      setUsingDemo(false);
    } else {
      // API unreachable → show a demo package so the review flow is still reviewable; not actionable.
      setPackages([DEMO_PACKAGE]);
      setUsingDemo(true);
      setError(e || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(pkg, action) {
    if (pkg.demo) return; // demo packages are not actionable
    setActingId(pkg.id);
    const { ok, error: e } = await apiPatch(`/api/marketing/packages/${pkg.id}/approve`, { action });
    setActingId(null);
    if (ok) load();
    else setError(e || "Could not update the package.");
  }

  return (
    <div className="space-y-5 pb-24">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Marketing</p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">Approval Queue</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Content packages awaiting review. Approve, request changes, or reject — nothing is published from here.
          Approved packages become schedule-ready in the{" "}
          <Link to="/marketing/calendar" className="font-semibold text-primary underline">Calendar</Link>.
        </p>
      </header>

      {usingDemo && <DemoBanner note="The package below is an example so you can see the review layout." />}

      <ErrorNote error={error} />

      {loading && (
        <div className="rounded-card border border-hairline bg-surface p-6 text-sm text-muted">Loading queue…</div>
      )}

      {!loading && packages.length === 0 && (
        <div className="rounded-card border border-hairline bg-page p-6 text-sm text-muted">
          Nothing waiting for review. Create a package in the Content Studio and send it here.
        </div>
      )}

      {!loading &&
        packages.map((pkg) => (
          <div key={pkg.id} className="space-y-3 rounded-card border border-hairline bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-ink">{pkg.topic || "Untitled package"}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {(pkg.recommendedPlatforms || []).map((p) => (
                    <span key={p} className="rounded-full bg-page px-2 py-0.5 text-[11px] font-medium capitalize text-muted">
                      {p}
                    </span>
                  ))}
                  {pkg.reviewSummary?.risk && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${RISK_STYLE[pkg.reviewSummary.risk] || "bg-page text-muted"}`}>
                      Risk: {pkg.reviewSummary.risk}
                    </span>
                  )}
                  {pkg.demo && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-ink">DEMO</span>}
                </div>
              </div>
              <span className="rounded-full bg-page px-2 py-0.5 text-[11px] font-medium text-muted">{pkg.status}</span>
            </div>

            {/* Draft previews per platform */}
            <div className="space-y-2">
              {(pkg.items || []).map((it) => (
                <div key={it.id} className="rounded-lg border border-hairline bg-page p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold capitalize text-primary">{it.channel}</span>
                    {(it.operational_labels || []).map((l) => (
                      <JoshLabelBadge key={l} label={l} />
                    ))}
                    {it.risk_level && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${RISK_STYLE[it.risk_level] || "bg-page text-muted"}`}>
                        Risk: {it.risk_level}
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-3 text-xs text-ink">{it.body || it.title}</p>
                </div>
              ))}
            </div>

            {/* Decision actions (no publishing) */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pkg.demo || actingId === pkg.id}
                onClick={() => decide(pkg, "approve")}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={pkg.demo || actingId === pkg.id}
                onClick={() => decide(pkg, "request_changes")}
                className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-ink hover:bg-page disabled:opacity-50"
              >
                Request changes
              </button>
              <button
                type="button"
                disabled={pkg.demo || actingId === pkg.id}
                onClick={() => decide(pkg, "reject")}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Reject
              </button>
              {pkg.demo && <span className="self-center text-[11px] text-muted">Demo package — actions disabled</span>}
            </div>
          </div>
        ))}
    </div>
  );
}

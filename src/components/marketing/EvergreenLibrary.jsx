import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../lib/apiFetch.js";
import JoshLabelBadge from "./JoshLabelBadge.jsx";
import { DemoBanner, ErrorNote } from "./MarketingStateBanner.jsx";

// Evergreen Library (Batch 2) — high-value reusable content (evergreen_score > 0).
// Read-only foundation with demo fallback. No AI regeneration, no external publishing.

const DEMO_ITEMS = [
  {
    id: "demo-eg-1",
    demo: true,
    channel: "instagram",
    title: "What weather-tightness means for comfort",
    body: "[DEMO] Evergreen explainer on airtightness and why it matters for everyday comfort…",
    evergreen_score: 9,
    operational_labels: ["High value evergreen", "Good lead quality topic"],
  },
  {
    id: "demo-eg-2",
    demo: true,
    channel: "facebook",
    title: "How to choose a builder",
    body: "[DEMO] Evergreen buyer-education piece that consistently drives quality enquiries…",
    evergreen_score: 7,
    operational_labels: ["High value evergreen"],
  },
];

export default function EvergreenLibrary() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { ok, data, error: e } = await apiFetch("/api/marketing/evergreen");
    const list = data?.items || [];
    if (ok) {
      // Live response (even if empty) → real data or a true empty state, never demo.
      setItems(list);
      setUsingDemo(false);
    } else {
      setItems(DEMO_ITEMS);
      setUsingDemo(true);
      setError(e || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5 pb-24">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Marketing</p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">Evergreen Library</h1>
        <p className="mt-1 text-sm text-muted">High-value content worth reusing. Flag pieces as evergreen from review; resurface them here.</p>
      </header>

      {usingDemo && <DemoBanner />}
      <ErrorNote error={error} />

      {loading ? (
        <div className="rounded-card border border-hairline bg-surface p-6 text-sm text-muted">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-card border border-hairline bg-page p-6 text-sm text-muted">No evergreen content yet. Flag high-value pieces during review.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((it) => (
            <div key={it.id} className="space-y-2 rounded-card border border-hairline bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold capitalize text-primary">{it.channel}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Score {it.evergreen_score}</span>
              </div>
              {it.title && <p className="text-sm font-medium text-ink">{it.title}</p>}
              {it.body && <p className="line-clamp-3 text-xs text-muted">{it.body}</p>}
              <div className="flex flex-wrap gap-1.5">
                {(it.operational_labels || []).map((l) => (
                  <JoshLabelBadge key={l} label={l} />
                ))}
                {it.demo && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-ink">DEMO</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

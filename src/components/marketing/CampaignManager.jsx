import { useState, useEffect, useCallback } from "react";

const STATUS_COLOURS = {
  active:   "bg-emerald-100 text-emerald-700",
  paused:   "bg-amber-100 text-amber-700",
  complete: "bg-blue-100 text-blue-700",
  archived: "bg-slate-100 text-slate-500",
};

export default function CampaignManager() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", objective: "", channels: [], start_at: "", end_at: "" });

  const CHANNEL_OPTIONS = ["instagram", "facebook", "website", "email", "client_guide", "landing_page"];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/marketing/campaigns");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load");
      setCampaigns(j.campaigns || j || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleChannel(ch) {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(ch) ? f.channels.filter((c) => c !== ch) : [...f.channels, ch],
    }));
  }

  async function create(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    setError("");
    try {
      const r = await fetch("/api/marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to create");
      setCampaigns((prev) => [j.campaign || j, ...prev]);
      setShowForm(false);
      setForm({ name: "", objective: "", channels: [], start_at: "", end_at: "" });
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-48 text-muted text-sm">Loading campaigns…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink">Campaigns</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-primary text-white text-sm px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          + New Campaign
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Create form */}
      {showForm && (
        <form onSubmit={create} className="bg-surface border border-hairline rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold text-ink">New Campaign</h3>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">Campaign name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              placeholder="e.g. Winter 2026 Awareness"
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">Objective</label>
            <textarea
              value={form.objective}
              onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))}
              rows={2}
              placeholder="e.g. Drive enquiries from renovation-ready homeowners in the Adelaide Hills"
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-2">Channels</label>
            <div className="flex flex-wrap gap-2">
              {CHANNEL_OPTIONS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => toggleChannel(ch)}
                  className={[
                    "text-xs px-3 py-1.5 rounded-lg border transition-colors",
                    form.channels.includes(ch)
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-hairline text-muted hover:border-primary/40",
                  ].join(" ")}
                >
                  {ch.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Start date</label>
              <input
                type="date"
                value={form.start_at}
                onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">End date</label>
              <input
                type="date"
                value={form.end_at}
                onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={creating || !form.name.trim()}
              className="bg-primary text-white text-sm px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {creating ? "Creating…" : "Create Campaign"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-muted hover:text-ink border border-hairline px-4 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Campaign list */}
      {campaigns.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-muted text-sm border-2 border-dashed border-hairline rounded-xl">
          No campaigns yet — create one to group your content
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {campaigns.map((c) => (
            <div key={c.id} className="bg-surface border border-hairline rounded-xl p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink leading-tight">{c.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLOURS[c.status] || "bg-slate-100 text-slate-500"}`}>
                  {c.status}
                </span>
              </div>

              {c.objective && (
                <p className="text-xs text-muted leading-relaxed line-clamp-2">{c.objective}</p>
              )}

              {c.channels?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {c.channels.map((ch) => (
                    <span key={ch} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {ch.replace("_", " ")}
                    </span>
                  ))}
                </div>
              )}

              {(c.start_at || c.end_at) && (
                <p className="text-xs text-muted">
                  {c.start_at ? new Date(c.start_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—"}
                  {" → "}
                  {c.end_at ? new Date(c.end_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "ongoing"}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";

const STATUS_COLOURS = {
  draft:     "bg-slate-100 text-slate-600",
  in_review: "bg-amber-100 text-amber-700",
  approved:  "bg-blue-100 text-blue-700",
  published: "bg-emerald-100 text-emerald-700",
  archived:  "bg-red-50 text-red-500",
};

const STATUS_LABELS = {
  draft:     "Draft",
  in_review: "In Review",
  approved:  "Approved",
  published: "Published",
  archived:  "Archived",
};

const CHANNEL_LABELS = {
  instagram:    "Instagram",
  facebook:     "Facebook",
  website:      "Website",
  email:        "Email",
  client_guide: "Client Guide",
  landing_page: "Landing Page",
  other:        "Other",
};

const PILLAR_COLOURS = {
  how_we_build:    "bg-blue-100 text-blue-700",
  what_to_expect:  "bg-purple-100 text-purple-700",
  the_work:        "bg-emerald-100 text-emerald-700",
  community_craft: "bg-amber-100 text-amber-700",
};

const PILLAR_LABELS = {
  how_we_build:    "How We Build",
  what_to_expect:  "What to Expect",
  the_work:        "The Work",
  community_craft: "Community & Craft",
};

export default function ContentLibrary() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterChannel, setFilterChannel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterChannel) params.set("channel", filterChannel);
      if (filterStatus) params.set("status", filterStatus);
      const r = await fetch(`/api/marketing/content?${params}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load");
      setItems(j.items || j || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterChannel, filterStatus]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id, status) {
    setUpdating(true);
    try {
      const r = await fetch(`/api/marketing/content/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("Update failed");
      setItems((prev) => prev.map((item) => item.id === id ? { ...item, status } : item));
      if (selected?.id === id) setSelected((prev) => ({ ...prev, status }));
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdating(false);
    }
  }

  const filtered = items.filter((item) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      item.title?.toLowerCase().includes(s) ||
      item.topic?.toLowerCase().includes(s) ||
      item.body?.toLowerCase().includes(s)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted text-sm">
        Loading library…
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* List panel */}
      <div className="lg:col-span-2 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="flex-1 min-w-[180px] border border-hairline rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <select
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value)}
            className="border border-hairline rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All channels</option>
            {Object.entries(CHANNEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-hairline rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}

        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted text-sm border-2 border-dashed border-hairline rounded-xl">
            {items.length === 0 ? "No content yet — generate some in the Create tab" : "No results match your filters"}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className={[
                  "w-full text-left bg-surface border rounded-xl px-4 py-3 transition-all hover:border-primary/40",
                  selected?.id === item.id ? "border-primary shadow-sm" : "border-hairline",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs text-muted">{CHANNEL_LABELS[item.channel] || item.channel}</span>
                      {item.pillar && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PILLAR_COLOURS[item.pillar] || "bg-slate-100 text-slate-600"}`}>
                          {PILLAR_LABELS[item.pillar] || item.pillar}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-ink truncate">{item.title || item.topic}</p>
                    {item.body && (
                      <p className="text-xs text-muted mt-0.5 line-clamp-2 leading-relaxed">{item.body}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLOURS[item.status] || "bg-slate-100 text-slate-600"}`}>
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                </div>
                <div className="text-xs text-muted mt-2">
                  {item.created_at ? new Date(item.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : ""}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      <div>
        {selected ? (
          <ItemDetail
            item={selected}
            onStatusChange={(s) => updateStatus(selected.id, s)}
            updating={updating}
            onClose={() => setSelected(null)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted text-sm border-2 border-dashed border-hairline rounded-xl p-6 min-h-[200px]">
            Select an item to view details
          </div>
        )}
      </div>
    </div>
  );
}

function ItemDetail({ item, onStatusChange, updating, onClose }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    const parts = [];
    if (item.title) parts.push(item.title);
    if (item.body) parts.push(item.body);
    if (item.cta) parts.push(item.cta);
    if (item.hashtags?.length) parts.push(item.hashtags.map((h) => `#${h}`).join(" "));
    navigator.clipboard.writeText(parts.join("\n\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const nextStatuses = {
    draft:     ["in_review", "archived"],
    in_review: ["approved", "draft", "archived"],
    approved:  ["published", "in_review"],
    published: ["archived"],
    archived:  ["draft"],
  }[item.status] || [];

  return (
    <div className="bg-surface border border-hairline rounded-xl p-4 space-y-4 sticky top-4">
      <div className="flex items-center justify-between">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOURS[item.status] || "bg-slate-100 text-slate-600"}`}>
          {STATUS_LABELS[item.status] || item.status}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={copy} className="text-xs text-muted hover:text-ink transition-colors">
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button onClick={onClose} className="text-muted hover:text-ink transition-colors">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
          {CHANNEL_LABELS[item.channel] || item.channel}
        </span>
        {item.pillar && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${PILLAR_COLOURS[item.pillar] || "bg-slate-100 text-slate-600"}`}>
            {PILLAR_LABELS[item.pillar] || item.pillar}
          </span>
        )}
      </div>

      {item.title && <p className="text-sm font-semibold text-ink">{item.title}</p>}

      {item.body && (
        <div>
          <p className="text-xs text-muted mb-1">Body</p>
          <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{item.body}</p>
        </div>
      )}

      {item.cta && (
        <div>
          <p className="text-xs text-muted mb-1">CTA</p>
          <p className="text-sm text-ink font-medium">{item.cta}</p>
        </div>
      )}

      {item.hashtags?.length > 0 && (
        <div>
          <p className="text-xs text-muted mb-1">Hashtags</p>
          <div className="flex flex-wrap gap-1">
            {item.hashtags.map((h) => (
              <span key={h} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">#{h}</span>
            ))}
          </div>
        </div>
      )}

      {nextStatuses.length > 0 && (
        <div className="border-t border-hairline pt-3 space-y-2">
          <p className="text-xs text-muted font-medium">Move to</p>
          <div className="flex flex-wrap gap-2">
            {nextStatuses.map((s) => (
              <button
                key={s}
                onClick={() => onStatusChange(s)}
                disabled={updating}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50 ${
                  s === "approved" || s === "published"
                    ? "border-emerald-400 text-emerald-700 hover:bg-emerald-50"
                    : s === "archived"
                    ? "border-red-300 text-red-600 hover:bg-red-50"
                    : "border-hairline text-ink hover:bg-slate-50"
                }`}
              >
                {STATUS_LABELS[s] || s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

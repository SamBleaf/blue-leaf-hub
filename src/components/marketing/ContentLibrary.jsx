import { useState, useEffect, useCallback } from "react";
import { authFetch } from "../../lib/authFetch.js";
import { apiPost } from "../../lib/apiFetch.js";
import { getSupabase } from "../../lib/supabaseClient.js";
import { MARKETING_PLATFORMS } from "../../lib/constants.js";

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

function storageUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = sb.storage.from("marketing-media").getPublicUrl(path);
  return data?.publicUrl || null;
}

function groupItems(items) {
  const withPhoto = {};
  const standalone = [];
  items.forEach((item) => {
    if (item.media_source_id) {
      if (!withPhoto[item.media_source_id]) withPhoto[item.media_source_id] = [];
      withPhoto[item.media_source_id].push(item);
    } else {
      standalone.push(item);
    }
  });
  return { withPhoto, standalone };
}

export default function ContentLibrary() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterChannel, setFilterChannel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [groupByPhoto, setGroupByPhoto] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterChannel) params.set("channel", filterChannel);
      if (filterStatus) params.set("status", filterStatus);
      const r = await authFetch(`/api/marketing/content?${params}`);
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
      const r = await authFetch(`/api/marketing/content/${id}`, {
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

  const { withPhoto, standalone } = groupItems(filtered);

  function renderFlatItem(item) {
    return (
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
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted text-sm">
        Loading library…
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
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
          <button
            type="button"
            onClick={() => setGroupByPhoto((v) => !v)}
            className={[
              "text-xs px-3 py-2 rounded-lg border transition-colors shrink-0",
              groupByPhoto
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-hairline text-muted hover:border-primary/40",
            ].join(" ")}
          >
            Group by photo
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}

        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted text-sm border-2 border-dashed border-hairline rounded-xl">
            {items.length === 0 ? "No content yet — generate some in the Create tab" : "No results match your filters"}
          </div>
        ) : groupByPhoto ? (
          <div className="space-y-4">
            {Object.entries(withPhoto).map(([assetId, groupItemsList]) => (
              <PhotoGroup
                key={assetId}
                assetId={assetId}
                items={groupItemsList}
                selected={selected}
                onSelect={setSelected}
              />
            ))}
            {standalone.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted px-1">No photo</p>
                {standalone.map(renderFlatItem)}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(renderFlatItem)}
          </div>
        )}
      </div>

      <div>
        {selected ? (
          <ItemDetail
            item={selected}
            onStatusChange={(s) => updateStatus(selected.id, s)}
            onSaved={(updated) => {
              setItems((prev) => prev.map((i) => i.id === updated.id ? { ...i, ...updated } : i));
              setSelected((prev) => ({ ...prev, ...updated }));
            }}
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

function PhotoGroup({ assetId, items, selected, onSelect }) {
  const [asset, setAsset] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    authFetch(`/api/marketing/media/${assetId}`)
      .then((r) => r.json())
      .then((j) => setAsset(j.asset || j))
      .catch(() => {});
  }, [assetId]);

  const visible = expanded ? items : items.slice(0, 3);

  return (
    <div className="border border-hairline rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-hairline">
        {(asset?.preview_url || asset?.thumbnail_path || asset?.storage_path) ? (
          <img
            src={asset.preview_url || storageUrl(asset.thumbnail_path || asset.storage_path)}
            alt=""
            className="w-8 h-8 rounded object-cover shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded bg-slate-200 flex items-center justify-center text-sm shrink-0">🖼️</div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-ink truncate">{asset?.original_filename || assetId.slice(0, 8)}</p>
          <p className="text-xs text-muted">{items.length} piece{items.length !== 1 ? "s" : ""}</p>
        </div>
      </div>
      <div className="divide-y divide-hairline">
        {visible.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors ${selected?.id === item.id ? "bg-primary/5" : ""}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-muted shrink-0">{CHANNEL_LABELS[item.channel] || item.channel}</span>
                <p className="text-sm text-ink truncate">{item.title || item.topic}</p>
              </div>
              <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_COLOURS[item.status] || "bg-slate-100"}`}>
                {STATUS_LABELS[item.status] || item.status}
              </span>
            </div>
          </button>
        ))}
      </div>
      {items.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-xs text-muted hover:text-ink py-2 border-t border-hairline transition-colors"
        >
          {expanded ? "Show less ▲" : `Show ${items.length - 3} more ▼`}
        </button>
      )}
    </div>
  );
}

function PublishModal({ item, onConfirm, onCancel }) {
  const [platform, setPlatform] = useState(MARKETING_PLATFORMS.INSTAGRAM);
  const [postUrl, setPostUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  async function confirm() {
    setSubmitting(true);
    setErr("");
    const { ok, error } = await apiPost("/api/marketing/publishes", {
      content_item_id: item.id,
      platform,
      platform_post_url: postUrl.trim() || null,
      caption_used: caption.trim() || null,
    });
    setSubmitting(false);
    if (!ok) { setErr(error || "Failed to record publish"); return; }
    onConfirm();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">Mark as Published</h3>
          <button type="button" onClick={onCancel} className="text-muted hover:text-ink">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-muted">Record where this was published so performance data can be tracked.</p>

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Platform *</label>
          <div className="flex gap-2">
            {Object.entries(MARKETING_PLATFORMS).map(([, v]) => (
              <button
                key={v}
                type="button"
                onClick={() => setPlatform(v)}
                className={`flex-1 py-2 rounded-lg border text-xs font-medium capitalize transition-colors ${
                  platform === v
                    ? "border-primary bg-primary text-white"
                    : "border-hairline text-muted hover:border-primary/40"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Post URL <span className="font-normal">(optional — enables reach tracking)</span></label>
          <input
            value={postUrl}
            onChange={(e) => setPostUrl(e.target.value)}
            placeholder="https://www.instagram.com/p/..."
            className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Caption used <span className="font-normal">(optional — snapshot of what was actually posted)</span></label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            placeholder="If the final caption differed from the generated body, paste it here"
            className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
          />
        </div>

        {err && <p className="text-xs text-red-600">{err}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg border border-hairline text-sm text-muted hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={submitting}
            className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Recording…" : "Mark as Published"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemDetail({ item, onStatusChange, onSaved, updating, onClose }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: item.title || "",
    body: item.body || "",
    cta: item.cta || "",
    hashtags: (item.hashtags || []).join(", "),
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);

  useEffect(() => {
    setForm({
      title: item.title || "",
      body: item.body || "",
      cta: item.cta || "",
      hashtags: (item.hashtags || []).join(", "),
    });
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset form only when switching items
  }, [item.id]);

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      const r = await authFetch(`/api/marketing/content/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title || null,
          body: form.body || null,
          cta: form.cta || null,
          hashtags: form.hashtags
            ? form.hashtags.split(",").map((h) => h.trim().replace(/^#/, "")).filter(Boolean)
            : [],
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Save failed");
      onSaved?.(j.item || { ...item, ...j });
      setEditing(false);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function copy() {
    const parts = [];
    if (form.title) parts.push(form.title);
    if (form.body) parts.push(form.body);
    if (form.cta) parts.push(form.cta);
    const tags = form.hashtags ? form.hashtags.split(",").map((h) => `#${h.trim().replace(/^#/, "")}`).join(" ") : "";
    if (tags) parts.push(tags);
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
          {!editing && (
            <button type="button" onClick={copy} className="text-xs text-muted hover:text-ink transition-colors">
              {copied ? "Copied ✓" : "Copy"}
            </button>
          )}
          {!editing ? (
            <button type="button" onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">Edit</button>
          ) : (
            <button type="button" onClick={() => { setEditing(false); setSaveError(""); }} className="text-xs text-muted hover:text-ink">Cancel</button>
          )}
          <button type="button" onClick={onClose} className="text-muted hover:text-ink transition-colors">
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

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Title / Headline</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Optional headline"
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Body *</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={8}
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none leading-relaxed"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">CTA</label>
            <input
              value={form.cta}
              onChange={(e) => setForm((f) => ({ ...f, cta: e.target.value }))}
              placeholder="e.g. DM us to start your project"
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Hashtags <span className="text-muted font-normal">(comma-separated)</span>
            </label>
            <input
              value={form.hashtags}
              onChange={(e) => setForm((f) => ({ ...f, hashtags: e.target.value }))}
              placeholder="AdelaideBuilder, CustomHomes, BlueLeafBuilding"
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          {saveError && <p className="text-xs text-red-600">{saveError}</p>}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full bg-primary text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {form.title && <p className="text-sm font-semibold text-ink">{form.title}</p>}
          {form.body && (
            <div>
              <p className="text-xs text-muted mb-1">Body</p>
              <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{form.body}</p>
            </div>
          )}
          {form.cta && (
            <div>
              <p className="text-xs text-muted mb-1">CTA</p>
              <p className="text-sm text-ink font-medium">{form.cta}</p>
            </div>
          )}
          {form.hashtags && (
            <div>
              <p className="text-xs text-muted mb-1">Hashtags</p>
              <div className="flex flex-wrap gap-1">
                {form.hashtags.split(",").map((h) => h.trim()).filter(Boolean).map((h) => (
                  <span key={h} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">#{h.replace(/^#/, "")}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {nextStatuses.length > 0 && (
        <div className="border-t border-hairline pt-3 space-y-2">
          <p className="text-xs text-muted font-medium">Move to</p>
          <div className="flex flex-wrap gap-2">
            {nextStatuses.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  if (s === "published" && item.status === "approved") {
                    setShowPublishModal(true);
                  } else {
                    onStatusChange(s);
                  }
                }}
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

      {showPublishModal && (
        <PublishModal
          item={item}
          onConfirm={() => {
            setShowPublishModal(false);
            onStatusChange("published");
          }}
          onCancel={() => setShowPublishModal(false)}
        />
      )}
    </div>
  );
}

/**
 * MarketingLibrary.jsx — Searchable Dropbox asset library index (Batch 02A).
 *
 * Reads:  GET /api/marketing/library  (paginated, facet-filtered, debounced search)
 * Upload: POST /api/marketing/library (base64 JSON body — matches server pattern)
 *
 * Each row opens the live Dropbox shared link in a new tab.
 * Upload form sends file as base64 so no multipart middleware is needed.
 *
 * Sorting uses the same SortableTableHead + sheetSort pattern as CrmPeople.jsx.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch, apiPost } from "../../lib/apiFetch.js";

// ─── Constants (mirrors server/lib/marketingLibraryRoutes.mjs) ────────────────

const LIBRARY_CATEGORIES = [
  "01 COMPLETED PROJECTS",
  "02 TEAM & CULTURE",
  "03 BRAND GUIDELINES",
  "04 CLIENT TESTIMONIALS",
  "05 BEHIND THE SCENES",
  "06 REELS & SHORTS",
  "07 PAST CAMPAIGN ADS",
];

const ASSET_TYPES = ["photo", "video", "doc", "reel", "testimonial", "ad", "other"];

const PILLARS = [
  { value: "how_we_build",    label: "How We Build" },
  { value: "what_to_expect",  label: "What to Expect" },
  { value: "the_work",        label: "The Work" },
  { value: "community_craft", label: "Community & Craft" },
];

const STAGES = [
  { value: "awareness",     label: "Awareness" },
  { value: "consideration", label: "Consideration" },
  { value: "decision",      label: "Decision" },
];

const CHANNELS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook",  label: "Facebook" },
  { value: "website",   label: "Website" },
  { value: "email",     label: "Email" },
  { value: "reel",      label: "Reel" },
  { value: "ad",        label: "Ad" },
];

const PAGE_SIZE = 50;

// ─── Shared table header styles (matches CrmPeople.jsx) ──────────────────────

const tableHeadCell = {
  textAlign: "left",
  padding: "9px 10px",
  borderBottom: "1px solid #e2e8f0",
  background: "#f8fafc",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

function SortableTableHead({ label, sortKey, activeSort, onSort }) {
  const active = activeSort?.key === sortKey;
  const icon   = active ? (activeSort.direction === "asc" ? "▲" : "▼") : "↕";
  return (
    <th style={tableHeadCell}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Sort by ${label}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: "none",
          background: "transparent",
          color: active ? "#006c9b" : "#64748b",
          cursor: "pointer",
          padding: 0,
          font: "inherit",
          textTransform: "inherit",
          letterSpacing: "inherit",
        }}
      >
        <span>{label}</span>
        <span aria-hidden="true" style={{ fontSize: 10, lineHeight: 1 }}>{icon}</span>
      </button>
    </th>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

function TagChip({ tag }) {
  return (
    <span className="inline-block rounded bg-page px-1.5 py-0.5 text-[10px] font-medium text-muted border border-hairline">
      {tag}
    </span>
  );
}

function sheetSortValue(asset, key) {
  const v = asset[key];
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Array.isArray(v)) return v.join(", ");
  return String(v).toLowerCase();
}

// Convert a File to base64 string
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => {
      // result is "data:[mime];base64,[data]" — strip the prefix
      const b64 = reader.result.split(",")[1] || "";
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Upload Form ──────────────────────────────────────────────────────────────

function UploadForm({ onSuccess, onClose }) {
  const [form, setForm] = useState({
    category: "",
    title: "",
    assetType: "",
    pillar: "",
    stage: "",
    channel: "",
    tags: "",
    evergreen: false,
    notes: "",
    projectId: "",
  });
  const [file,      setFile]      = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState(null);

  const set = (field, value) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.category) { setFormError("Category is required"); return; }
    if (!file)          { setFormError("Please select a file"); return; }

    setSaving(true);
    setFormError(null);

    try {
      const dataBase64 = await fileToBase64(file);
      const tagsArray  = form.tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      const { ok: didOk, error: apiErr } = await apiPost("/api/marketing/library", {
        ...form,
        tags:     tagsArray,
        fileName: file.name,
        dataBase64,
        evergreen: form.evergreen,
      });

      if (didOk) {
        onSuccess?.();
        onClose?.();
      } else {
        setFormError(apiErr || "Upload failed");
      }
    } catch (err) {
      setFormError(err?.message || "Upload failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-card bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Upload Asset to Library</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {formError && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
          )}

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring"
              required
            >
              <option value="">Select category…</option>
              {LIBRARY_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Stirling renovation — slab pour"
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring"
            />
          </div>

          {/* Asset Type + Pillar */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Asset type</label>
              <select
                value={form.assetType}
                onChange={(e) => set("assetType", e.target.value)}
                className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring"
              >
                <option value="">Any</option>
                {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Pillar</label>
              <select
                value={form.pillar}
                onChange={(e) => set("pillar", e.target.value)}
                className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring"
              >
                <option value="">Any</option>
                {PILLARS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {/* Stage + Channel */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Stage</label>
              <select
                value={form.stage}
                onChange={(e) => set("stage", e.target.value)}
                className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring"
              >
                <option value="">Any</option>
                {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Channel</label>
              <select
                value={form.channel}
                onChange={(e) => set("channel", e.target.value)}
                className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring"
              >
                <option value="">Any</option>
                {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
              Tags <span className="font-normal text-muted/70">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="e.g. stirling, renovation, drone"
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring resize-none"
            />
          </div>

          {/* Evergreen */}
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.evergreen}
              onChange={(e) => set("evergreen", e.target.checked)}
              className="rounded border-hairline"
            />
            Mark as evergreen (high-reuse asset)
          </label>

          {/* File input */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
              File <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-primary/90"
              required
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold text-ink hover:bg-page"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Uploading…" : "Upload to Dropbox"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MarketingLibrary() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [assets,      setAssets]      = useState([]);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [showUpload,  setShowUpload]  = useState(false);
  const [page,        setPage]        = useState(0);

  // Facet filters
  const [search,      setSearch]      = useState("");
  const [filterCat,   setFilterCat]   = useState("");
  const [filterPillar,setFilterPillar]= useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterChan,  setFilterChan]  = useState("");
  const [filterEg,    setFilterEg]    = useState("");
  const [filterTag,   setFilterTag]   = useState("");

  // Sort
  const [sheetSort, setSheetSort] = useState({ key: "createdAt", direction: "desc" });

  const searchTimerRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // ── Debounce search ───────────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, filterCat, filterPillar, filterStage, filterChan, filterEg, filterTag]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      limit:  PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
    if (debouncedSearch) params.set("search",    debouncedSearch);
    if (filterCat)       params.set("category",  filterCat);
    if (filterPillar)    params.set("pillar",     filterPillar);
    if (filterStage)     params.set("stage",      filterStage);
    if (filterChan)      params.set("channel",    filterChan);
    if (filterEg)        params.set("evergreen",  filterEg);
    if (filterTag)       params.set("tag",        filterTag);

    const { ok: didOk, data, error: e } = await apiFetch(`/api/marketing/library?${params}`);
    if (didOk) {
      setAssets(data?.assets || []);
      setTotal(data?.total   ?? 0);
    } else {
      setError(e || "Could not load the asset library.");
    }
    setLoading(false);
  }, [page, debouncedSearch, filterCat, filterPillar, filterStage, filterChan, filterEg, filterTag]);

  useEffect(() => { load(); }, [load]);

  // ── Sort (client-side within the current page) ────────────────────────────
  const handleSort = (key) => {
    setSheetSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  };

  const sorted = [...assets].sort((a, b) => {
    const av = sheetSortValue(a, sheetSort.key);
    const bv = sheetSortValue(b, sheetSort.key);
    const dir = sheetSort.direction === "asc" ? 1 : -1;
    return av < bv ? -dir : av > bv ? dir : 0;
  });

  // ── Row click → open Dropbox link ─────────────────────────────────────────
  const handleRowClick = (asset) => {
    if (!asset.dropboxSharedLink) return;
    window.open(asset.dropboxSharedLink, "_blank", "noopener,noreferrer");
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Marketing</p>
          <h1 className="text-3xl font-semibold tracking-tight text-primary">Asset Library</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Dropbox-indexed creative assets. Click any row to open the live Dropbox file.
            {total > 0 && ` ${total} asset${total === 1 ? "" : "s"} found.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Upload asset
        </button>
      </header>

      {/* Filters */}
      <div className="rounded-card border border-hairline bg-surface p-4 space-y-3">
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, filename, notes…"
          className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring"
        />

        {/* Facet row */}
        <div className="flex flex-wrap gap-2">
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="rounded-lg border border-hairline px-2 py-1.5 text-xs focus-ring bg-surface"
          >
            <option value="">All categories</option>
            {LIBRARY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={filterPillar}
            onChange={(e) => setFilterPillar(e.target.value)}
            className="rounded-lg border border-hairline px-2 py-1.5 text-xs focus-ring bg-surface"
          >
            <option value="">All pillars</option>
            {PILLARS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>

          <select
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value)}
            className="rounded-lg border border-hairline px-2 py-1.5 text-xs focus-ring bg-surface"
          >
            <option value="">All stages</option>
            {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <select
            value={filterChan}
            onChange={(e) => setFilterChan(e.target.value)}
            className="rounded-lg border border-hairline px-2 py-1.5 text-xs focus-ring bg-surface"
          >
            <option value="">All channels</option>
            {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>

          <select
            value={filterEg}
            onChange={(e) => setFilterEg(e.target.value)}
            className="rounded-lg border border-hairline px-2 py-1.5 text-xs focus-ring bg-surface"
          >
            <option value="">Evergreen: any</option>
            <option value="true">Evergreen only</option>
            <option value="false">Non-evergreen</option>
          </select>

          <input
            type="text"
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value.trim().toLowerCase())}
            placeholder="Filter by tag…"
            className="rounded-lg border border-hairline px-2 py-1.5 text-xs focus-ring bg-surface w-36"
          />

          {(filterCat || filterPillar || filterStage || filterChan || filterEg || filterTag || search) && (
            <button
              type="button"
              onClick={() => {
                setSearch(""); setFilterCat(""); setFilterPillar(""); setFilterStage("");
                setFilterChan(""); setFilterEg(""); setFilterTag("");
              }}
              className="rounded-lg border border-hairline px-2 py-1.5 text-xs text-muted hover:text-ink"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-card border border-hairline bg-surface">
        {loading ? (
          <p className="px-5 py-8 text-sm text-muted">Loading assets…</p>
        ) : sorted.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted">
            {assets.length === 0 && !debouncedSearch && !filterCat
              ? "No assets yet — upload the first one."
              : "No assets match your filters."}
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <SortableTableHead label="Title"     sortKey="title"     activeSort={sheetSort} onSort={handleSort} />
                <SortableTableHead label="Category"  sortKey="category"  activeSort={sheetSort} onSort={handleSort} />
                <SortableTableHead label="Type"      sortKey="assetType" activeSort={sheetSort} onSort={handleSort} />
                <SortableTableHead label="Pillar"    sortKey="pillar"    activeSort={sheetSort} onSort={handleSort} />
                <SortableTableHead label="Stage"     sortKey="stage"     activeSort={sheetSort} onSort={handleSort} />
                <SortableTableHead label="Channel"   sortKey="channel"   activeSort={sheetSort} onSort={handleSort} />
                <SortableTableHead label="Tags"      sortKey="tags"      activeSort={sheetSort} onSort={handleSort} />
                <SortableTableHead label="Evergreen" sortKey="evergreen" activeSort={sheetSort} onSort={handleSort} />
                <SortableTableHead label="Created"   sortKey="createdAt" activeSort={sheetSort} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((asset, i) => (
                <tr
                  key={asset.id}
                  onClick={() => handleRowClick(asset)}
                  className={[
                    "border-b border-hairline last:border-0 transition-colors",
                    asset.dropboxSharedLink
                      ? "cursor-pointer hover:bg-page"
                      : "cursor-default opacity-60",
                    i % 2 === 0 ? "" : "bg-page/30",
                  ].join(" ")}
                  title={asset.dropboxSharedLink ? "Open in Dropbox" : "No Dropbox link yet"}
                >
                  {/* Title */}
                  <td className="px-2.5 py-2 font-medium text-ink max-w-[200px] truncate">
                    <span className="flex items-center gap-1.5">
                      {asset.dropboxSharedLink && (
                        <span className="text-primary/60 text-xs" aria-label="Has Dropbox link">↗</span>
                      )}
                      {asset.title || asset.originalFilename || "—"}
                    </span>
                  </td>
                  {/* Category */}
                  <td className="px-2.5 py-2 text-muted text-xs whitespace-nowrap">{asset.category || "—"}</td>
                  {/* Type */}
                  <td className="px-2.5 py-2 text-muted text-xs">{asset.assetType || "—"}</td>
                  {/* Pillar */}
                  <td className="px-2.5 py-2 text-muted text-xs">
                    {PILLARS.find((p) => p.value === asset.pillar)?.label || asset.pillar || "—"}
                  </td>
                  {/* Stage */}
                  <td className="px-2.5 py-2 text-muted text-xs">
                    {STAGES.find((s) => s.value === asset.stage)?.label || asset.stage || "—"}
                  </td>
                  {/* Channel */}
                  <td className="px-2.5 py-2 text-muted text-xs">
                    {CHANNELS.find((c) => c.value === asset.channel)?.label || asset.channel || "—"}
                  </td>
                  {/* Tags */}
                  <td className="px-2.5 py-2 max-w-[160px]">
                    <div className="flex flex-wrap gap-1">
                      {(asset.tags || []).slice(0, 4).map((t) => <TagChip key={t} tag={t} />)}
                      {(asset.tags || []).length > 4 && (
                        <span className="text-[10px] text-muted">+{asset.tags.length - 4}</span>
                      )}
                    </div>
                  </td>
                  {/* Evergreen */}
                  <td className="px-2.5 py-2 text-center text-xs">
                    {asset.evergreen
                      ? <span className="text-accent font-semibold">Yes</span>
                      : <span className="text-muted">—</span>}
                  </td>
                  {/* Created */}
                  <td className="px-2.5 py-2 text-muted text-xs whitespace-nowrap">
                    {formatDate(asset.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold disabled:opacity-40 hover:bg-page"
            >
              ← Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold disabled:opacity-40 hover:bg-page"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadForm
          onSuccess={load}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}

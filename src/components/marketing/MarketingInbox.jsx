/**
 * MarketingInbox.jsx — Triage UI for the marketing library inbox.
 *
 * INBOX-BATCH-B: photo grid with multi-select, keyboard cull, bulk ops.
 * INBOX-BATCH-C: "Auto-sort" button (quality/pHash/category/job-hint) + "Use AI" checkbox.
 *
 * Shows all marketing_library rows with status='inbox' as a photo grid.
 * Supports click-to-select multi-select, keyboard cull shortcuts, bulk operations,
 * and a bulk-assign bar for category + job assignment.
 *
 * Reads:   GET  /api/marketing/library?status=inbox
 * Jobs:    GET  /api/marketing/library/jobs
 * Scan:    POST /api/marketing/library/inbox/scan
 * Sort:    POST /api/marketing/library/inbox/sort    body { limit, useAI }
 * File:    POST /api/marketing/library/:id/file      body { category, projectId }
 * Reject:  POST /api/marketing/library/:id/reject
 * Bulk:    POST /api/marketing/library/bulk-file     body { ids, category, projectId }
 *          POST /api/marketing/library/bulk-reject   body { ids }
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

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type = "success", onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  const bg = type === "error" ? "bg-red-600" : "bg-primary";
  return (
    <div
      className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg ${bg} px-5 py-2.5 text-sm font-semibold text-white shadow-lg`}
    >
      {message}
    </div>
  );
}

// ─── Quality score badge ──────────────────────────────────────────────────────

function QualityBadge({ score }) {
  if (score == null) return null;
  const pct = Math.round(Number(score) * 100);
  const color =
    pct >= 70 ? "bg-emerald-100 text-emerald-700" :
    pct >= 40 ? "bg-amber-100 text-amber-700"     :
                "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${color}`}>
      {pct}%
    </span>
  );
}

// ─── Dup-group badge ──────────────────────────────────────────────────────────

function DupBadge({ dupGroup }) {
  if (!dupGroup) return null;
  return (
    <span className="inline-flex items-center rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">
      dup
    </span>
  );
}

// ─── GPS suggestion badge ─────────────────────────────────────────────────────

function GpsBadge({ suggestedProjectId }) {
  if (!suggestedProjectId) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700"
      title="Job suggested from photo GPS"
    >
      📍 GPS
    </span>
  );
}

// ─── Individual tile ──────────────────────────────────────────────────────────

function InboxTile({ asset, selected, onSelect, onFile, onReject, onKeyAction }) {
  const tileRef = useRef(null);

  // Keyboard handler for focused tile
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "f") { e.preventDefault(); onKeyAction("file", asset.id); }
      if (e.key === "x") { e.preventDefault(); onKeyAction("reject", asset.id); }
      if (e.key === "s") { e.preventDefault(); onKeyAction("star", asset.id); }
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); onSelect(asset.id); }
    },
    [asset.id, onSelect, onKeyAction]
  );

  const thumb = asset.dropboxSharedLink || null;

  return (
    <div
      ref={tileRef}
      tabIndex={0}
      role="checkbox"
      aria-checked={selected}
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        // Shift-click: extend selection (handled by parent via onSelect with shift flag)
        onSelect(asset.id, e.shiftKey);
      }}
      title="Click to select  ·  F = file  ·  X = reject  ·  S = star"
      className={[
        "group relative flex flex-col overflow-hidden rounded-card border-2 transition-all cursor-pointer outline-none",
        "focus:ring-2 focus:ring-primary focus:ring-offset-1",
        selected
          ? "border-primary shadow-md"
          : "border-hairline hover:border-primary/40 hover:shadow",
        asset.starred ? "ring-1 ring-warning ring-offset-1" : "",
      ].join(" ")}
    >
      {/* Thumbnail */}
      <div className="relative aspect-square w-full overflow-hidden bg-page">
        {thumb ? (
          <img
            src={thumb}
            alt={asset.originalFilename || "inbox asset"}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
            onError={(ev) => { ev.currentTarget.style.display = "none"; }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted/40">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="currentColor">
              <path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
            </svg>
          </div>
        )}

        {/* Selection overlay tick */}
        {selected && (
          <div className="absolute inset-0 bg-primary/20 flex items-start justify-end p-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2}>
                <polyline points="1.5 6 4.5 9 10.5 3" />
              </svg>
            </div>
          </div>
        )}

        {/* Star indicator */}
        {asset.starred && (
          <div className="absolute top-1.5 left-1.5 text-warning drop-shadow">
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
              <path d="M8 1l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 10.5l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1z" />
            </svg>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-col gap-0.5 p-2">
        <p className="truncate text-xs font-medium text-ink" title={asset.originalFilename}>
          {asset.originalFilename || "—"}
        </p>
        <p className="truncate text-[10px] text-muted" title={asset.category}>
          {asset.category || "—"}
        </p>
        {asset.jobName && (
          <p className="truncate text-[10px] text-accent font-medium" title={asset.jobName}>
            {asset.jobName}
          </p>
        )}
        <div className="flex items-center gap-1 pt-0.5 flex-wrap">
          <QualityBadge score={asset.qualityScore} />
          <DupBadge dupGroup={asset.dupGroup} />
          <GpsBadge suggestedProjectId={asset.suggestedProjectId} />
        </div>
      </div>

      {/* Quick action buttons (visible on hover) */}
      <div className="absolute bottom-0 inset-x-0 hidden group-hover:flex gap-px">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onFile(asset.id); }}
          className="flex-1 bg-primary/90 py-1.5 text-[10px] font-semibold text-white hover:bg-primary"
          title="File this asset (F)"
        >
          File
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onReject(asset.id); }}
          className="flex-1 bg-red-500/90 py-1.5 text-[10px] font-semibold text-white hover:bg-red-600"
          title="Reject this asset (X)"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

// ─── File single modal ────────────────────────────────────────────────────────

function FileModal({ assetId, suggestedProjectId, jobs, onDone, onClose }) {
  const [category,  setCategory]  = useState("");
  // Default the job picker to the GPS suggestion if present
  const [projectId, setProjectId] = useState(suggestedProjectId || "");
  const [saving,    setSaving]    = useState(false);
  const [modalErr,  setModalErr]  = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!category) { setModalErr("Select a category"); return; }
    setSaving(true);
    setModalErr(null);
    const { ok, error } = await apiPost(`/api/marketing/library/${assetId}/file`, {
      category,
      projectId: projectId || null,
    });
    setSaving(false);
    if (ok) {
      onDone(assetId);
    } else {
      setModalErr(error || "Filing failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-card bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="text-base font-semibold text-ink">File asset</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {modalErr && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{modalErr}</p>
          )}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring"
              required
            >
              <option value="">Select category…</option>
              {LIBRARY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">
              Job
              {suggestedProjectId && (
                <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-sky-700">
                  📍 suggested from photo GPS
                </span>
              )}
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring"
            >
              <option value="">No job / company-wide</option>
              {(jobs || []).map((j) => <option key={j.id} value={j.id}>{j.address}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold text-ink hover:bg-page">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
              {saving ? "Filing…" : "File asset"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MarketingInbox() {
  const [assets,      setAssets]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [jobs,        setJobs]        = useState([]);

  // Selection state
  const [selected,    setSelected]    = useState(new Set());

  // Bulk bar state
  const [bulkCat,     setBulkCat]     = useState("");
  const [bulkJob,     setBulkJob]     = useState("");

  // Scanning
  const [scanning,    setScanning]    = useState(false);

  // Auto-sort (INBOX-BATCH-C)
  const [sorting,     setSorting]     = useState(false);
  const [useAI,       setUseAI]       = useState(false);

  // Toast
  const [toast,       setToast]       = useState(null); // { message, type }

  // Single-file modal
  const [fileModal,   setFileModal]   = useState(null); // assetId | null

  // Bulk operation in progress
  const [bulkBusy,    setBulkBusy]    = useState(false);

  // Last click index for shift-click range selection
  const lastClickIdx  = useRef(-1);

  // ── Toast helper ────────────────────────────────────────────────────────────
  const flash = useCallback((message, type = "success") => {
    setToast({ message, type });
  }, []);

  // ── Load jobs (once) ────────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch("/api/marketing/library/jobs").then(({ ok: didOk, data }) => {
      if (didOk) setJobs(data?.jobs || []);
    });
  }, []);

  // ── Load inbox assets ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { ok: didOk, data, error: e } = await apiFetch("/api/marketing/library?status=inbox&limit=200");
    if (didOk) {
      setAssets(data?.assets || []);
    } else {
      setError(e || "Could not load inbox.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Scan inbox ───────────────────────────────────────────────────────────────
  const handleScan = async () => {
    setScanning(true);
    const { ok: didOk, data, error: e } = await apiPost("/api/marketing/library/inbox/scan", {});
    setScanning(false);
    if (didOk) {
      flash(`Scanned ${data?.scanned ?? 0} file(s) — ${data?.added ?? 0} new added.`);
      await load();
    } else {
      flash(e || "Scan failed", "error");
    }
  };

  // ── Auto-sort inbox (INBOX-BATCH-C) ─────────────────────────────────────────
  const handleSort = async () => {
    setSorting(true);
    const { ok: didOk, data, error: e } = await apiPost(
      "/api/marketing/library/inbox/sort",
      { limit: 100, useAI }
    );
    setSorting(false);
    if (didOk) {
      const { processed = 0, dupGroups = 0, aiUsed = false } = data || {};
      const aiNote = aiUsed ? " (AI categories applied)" : "";
      flash(
        `Sorted ${processed} asset${processed === 1 ? "" : "s"} — ${dupGroups} dup group${dupGroups === 1 ? "" : "s"} found.${aiNote}`
      );
      await load();
    } else {
      flash(e || "Auto-sort failed", "error");
    }
  };

  // ── Selection helpers ────────────────────────────────────────────────────────
  const toggleSelect = useCallback((id, withShift) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (withShift && lastClickIdx.current >= 0) {
        // Range-select from lastClickIdx to current
        const currentIdx = assets.findIndex((a) => a.id === id);
        if (currentIdx >= 0) {
          const lo = Math.min(lastClickIdx.current, currentIdx);
          const hi = Math.max(lastClickIdx.current, currentIdx);
          for (let i = lo; i <= hi; i++) {
            next.add(assets[i].id);
          }
        }
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
        lastClickIdx.current = assets.findIndex((a) => a.id === id);
      }
      return next;
    });
  }, [assets]);

  const selectAll   = () => setSelected(new Set(assets.map((a) => a.id)));
  const deselectAll = () => { setSelected(new Set()); lastClickIdx.current = -1; };

  // ── Auto-fill bulkJob from GPS suggestion when exactly one item is selected ──
  // When the selection changes to a single item that has a suggestedProjectId,
  // pre-fill the bulk bar job picker so the user just has to confirm.
  // Clears bulkJob when selection grows beyond one or the asset has no suggestion.
  useEffect(() => {
    if (selected.size !== 1) return;
    const [onlyId] = selected;
    const onlyAsset = assets.find((a) => a.id === onlyId);
    if (onlyAsset?.suggestedProjectId) {
      setBulkJob((prev) => prev || onlyAsset.suggestedProjectId);
    }
  }, [selected, assets]);

  // ── Remove tiles after file/reject ──────────────────────────────────────────
  const removeIds = useCallback((ids) => {
    const s = new Set(ids);
    setAssets((prev) => prev.filter((a) => !s.has(a.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  // ── Single file (via quick-action button or keyboard F) ─────────────────────
  const handleSingleFile = (id) => {
    // Pass the asset along so the modal can default the job picker to the GPS suggestion
    const asset = assets.find((a) => a.id === id);
    setFileModal({ id, suggestedProjectId: asset?.suggestedProjectId || null });
  };

  const handleFileModalDone = (id) => {
    setFileModal(null);
    removeIds([id]);
    flash("Filed successfully.");
  };

  // Derive the asset id from the fileModal state (now an object)
  const fileModalId              = fileModal?.id   || null;
  const fileModalSuggestedJob    = fileModal?.suggestedProjectId || null;

  // ── Single reject (via quick-action button or keyboard X) ───────────────────
  const handleSingleReject = async (id) => {
    const { ok: didOk, error: e } = await apiPost(`/api/marketing/library/${id}/reject`, {});
    if (didOk) {
      removeIds([id]);
      flash("Asset rejected.");
    } else {
      flash(e || "Reject failed", "error");
    }
  };

  // ── Keyboard shortcut handler (from tile) ───────────────────────────────────
  const handleKeyAction = useCallback((action, id) => {
    if (action === "file")   handleSingleFile(id);
    if (action === "reject") handleSingleReject(id);
    if (action === "star") {
      // Optimistic local star toggle — persisting star is optional (no PATCH implemented in batch A)
      setAssets((prev) =>
        prev.map((a) => a.id === id ? { ...a, starred: !a.starred } : a)
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Bulk file ────────────────────────────────────────────────────────────────
  const handleBulkFile = async () => {
    if (!bulkCat) { flash("Select a category first", "error"); return; }
    if (selected.size === 0) return;
    setBulkBusy(true);
    const ids = Array.from(selected);
    const { ok: didOk, data, error: e } = await apiPost("/api/marketing/library/bulk-file", {
      ids,
      category: bulkCat,
      projectId: bulkJob || null,
    });
    setBulkBusy(false);
    if (!didOk) {
      flash(e || "Bulk file failed", "error");
      return;
    }
    const results = data?.results || [];
    const succeeded = results.filter((r) => r.ok).map((r) => r.id);
    const failed    = results.filter((r) => !r.ok);
    removeIds(succeeded);
    if (failed.length === 0) {
      flash(`Filed ${succeeded.length} asset${succeeded.length === 1 ? "" : "s"}.`);
    } else {
      flash(`Filed ${succeeded.length}, failed ${failed.length}. Check server logs.`, "error");
    }
    setBulkCat("");
    setBulkJob("");
  };

  // ── Bulk reject ──────────────────────────────────────────────────────────────
  const handleBulkReject = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    const ids = Array.from(selected);
    const { ok: didOk, data, error: e } = await apiPost("/api/marketing/library/bulk-reject", { ids });
    setBulkBusy(false);
    if (!didOk) {
      flash(e || "Bulk reject failed", "error");
      return;
    }
    const results   = data?.results || [];
    const succeeded = results.filter((r) => r.ok).map((r) => r.id);
    const failed    = results.filter((r) => !r.ok);
    removeIds(succeeded);
    if (failed.length === 0) {
      flash(`Rejected ${succeeded.length} asset${succeeded.length === 1 ? "" : "s"}.`);
    } else {
      flash(`Rejected ${succeeded.length}, failed ${failed.length}. Check server logs.`, "error");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  const selCount = selected.size;

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Marketing</p>
          <h1 className="text-3xl font-semibold tracking-tight text-primary">Inbox</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {loading
              ? "Loading inbox…"
              : assets.length > 0
              ? `${assets.length} asset${assets.length === 1 ? "" : "s"} waiting to be filed or rejected.`
              : "Inbox is empty."}
            {selCount > 0 && (
              <span className="ml-2 font-semibold text-ink">
                {selCount} selected
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Use AI checkbox — shown alongside Auto-sort */}
          <label className="flex items-center gap-1.5 text-xs text-muted select-none cursor-pointer">
            <input
              type="checkbox"
              checked={useAI}
              onChange={(e) => setUseAI(e.target.checked)}
              className="rounded border-hairline focus-ring"
            />
            Use AI for categories
          </label>

          <button
            type="button"
            onClick={handleSort}
            disabled={sorting || scanning}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
            title="Score quality, detect duplicates, and suggest categories for all unsorted inbox assets"
          >
            {sorting ? "Sorting…" : "Auto-sort"}
          </button>

          <button
            type="button"
            onClick={handleScan}
            disabled={scanning || sorting}
            className="rounded-lg border border-hairline px-4 py-2.5 text-sm font-semibold text-ink hover:bg-page disabled:opacity-50"
          >
            {scanning ? "Scanning…" : "Scan inbox"}
          </button>
        </div>
      </header>

      {/* Error */}
      {error && (
        <p className="rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Keyboard hint */}
      {!loading && assets.length > 0 && (
        <p className="text-xs text-muted">
          Click tile to select  ·  Shift-click to range-select  ·  Focus a tile:
          {" "}<kbd className="rounded border border-hairline px-1 py-0.5 font-mono text-[10px]">F</kbd> file,
          {" "}<kbd className="rounded border border-hairline px-1 py-0.5 font-mono text-[10px]">X</kbd> reject,
          {" "}<kbd className="rounded border border-hairline px-1 py-0.5 font-mono text-[10px]">S</kbd> star
        </p>
      )}

      {/* Bulk bar */}
      {selCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-primary/30 bg-primary/5 px-4 py-3">
          <span className="text-sm font-semibold text-ink">{selCount} selected</span>

          <button
            type="button"
            onClick={deselectAll}
            className="text-xs text-muted hover:text-ink"
          >
            Clear
          </button>

          <div className="h-4 w-px bg-hairline" />

          <select
            value={bulkCat}
            onChange={(e) => setBulkCat(e.target.value)}
            className="rounded-lg border border-hairline bg-surface px-2 py-1.5 text-xs focus-ring"
          >
            <option value="">Category…</option>
            {LIBRARY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Job picker — when a single GPS-suggested item is selected, show the hint */}
          <div className="flex flex-col gap-0.5">
            {selCount === 1 && (() => {
              const onlyId  = Array.from(selected)[0];
              const onlyAsset = assets.find((a) => a.id === onlyId);
              return onlyAsset?.suggestedProjectId && !bulkJob ? (
                <span className="text-[10px] text-sky-600 font-semibold">📍 GPS suggestion available</span>
              ) : null;
            })()}
            <select
              value={bulkJob}
              onChange={(e) => setBulkJob(e.target.value)}
              className="rounded-lg border border-hairline bg-surface px-2 py-1.5 text-xs focus-ring"
            >
              <option value="">No job / company-wide</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.address}</option>)}
            </select>
          </div>

          <button
            type="button"
            onClick={handleBulkFile}
            disabled={bulkBusy || !bulkCat}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {bulkBusy ? "Filing…" : "File selected"}
          </button>

          <button
            type="button"
            onClick={handleBulkReject}
            disabled={bulkBusy}
            className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
          >
            {bulkBusy ? "Rejecting…" : "Reject selected"}
          </button>
        </div>
      )}

      {/* Select-all strip (when nothing selected but have assets) */}
      {selCount === 0 && !loading && assets.length > 0 && (
        <div className="flex items-center gap-3">
          <button type="button" onClick={selectAll} className="text-xs text-primary hover:underline">
            Select all ({assets.length})
          </button>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <p className="py-12 text-center text-sm text-muted">Loading inbox…</p>
      ) : assets.length === 0 ? (
        <div className="rounded-card border border-hairline bg-surface px-6 py-16 text-center">
          <p className="text-sm font-medium text-ink">Inbox is empty</p>
          <p className="mt-1 text-sm text-muted">
            Drop images into the Dropbox <span className="font-mono font-semibold">00 INBOX</span> folder, then click{" "}
            <strong>Scan inbox</strong>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {assets.map((asset) => (
            <InboxTile
              key={asset.id}
              asset={asset}
              selected={selected.has(asset.id)}
              onSelect={toggleSelect}
              onFile={handleSingleFile}
              onReject={handleSingleReject}
              onKeyAction={handleKeyAction}
            />
          ))}
        </div>
      )}

      {/* Single-file modal */}
      {fileModalId && (
        <FileModal
          assetId={fileModalId}
          suggestedProjectId={fileModalSuggestedJob}
          jobs={jobs}
          onDone={handleFileModalDone}
          onClose={() => setFileModal(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  );
}

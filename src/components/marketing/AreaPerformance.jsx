/**
 * AreaPerformance.jsx — G3-B1: Sales Intelligence Area Rollup.
 *
 * Answers "which AREAS produce GOOD leads (not just more)" by aggregating
 * outcome quality per suburb from the Hub's CRM leads + attribution data.
 *
 * Reads GET /api/marketing/area-performance with optional filters.
 * Sortable table via the same SortableTableHead + sheetSort pattern as
 * CrmPeople.jsx and MarketingLibrary.jsx.
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../lib/apiFetch.js";
import {
  LEAD_SOURCE_CATEGORIES,
  LEAD_SOURCE_CATEGORY_LABELS,
} from "../../lib/constants.js";

// ─── Design tokens (inline — mirrors CrmPeople / MarketingLibrary) ────────────

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

const tableBodyCell = {
  padding: "9px 10px",
  borderBottom: "1px solid #f1f5f9",
  fontSize: 13,
  color: "#1e293b",
  verticalAlign: "middle",
};

// ─── SortableTableHead ────────────────────────────────────────────────────────

function SortableTableHead({ label, sortKey, activeSort, onSort }) {
  const active = activeSort?.key === sortKey;
  const icon = active ? (activeSort.direction === "asc" ? "▲" : "▼") : "↕";
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

function fmtPct(v) {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}

function fmtMoney(v) {
  if (v == null || v === 0) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtMoneyCompact(v) {
  if (v == null || v === 0) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)    return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
}

function sortValue(area, key) {
  const v = area[key];
  if (v == null) return key.includes("Rate") || key.includes("Ratio") || key.includes("Per") ? -Infinity : 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v;
  return String(v).toLowerCase();
}

// ─── AreaPerformance ──────────────────────────────────────────────────────────

const SOURCE_OPTIONS = Object.entries(LEAD_SOURCE_CATEGORIES).map(([, value]) => ({
  value,
  label: LEAD_SOURCE_CATEGORY_LABELS[value] || value,
}));

export default function AreaPerformance() {
  const [areas, setAreas]     = useState([]);
  const [totals, setTotals]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [roiAvail, setRoiAvail] = useState(true);

  // Filters
  const [from, setFrom]               = useState("");
  const [to, setTo]                   = useState("");
  const [source, setSource]           = useState("");
  const [projectType, setProjectType] = useState("");

  // Sort
  const [sheetSort, setSheetSort] = useState({ key: "wonValue", direction: "desc" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (from)        params.set("from", from);
    if (to)          params.set("to", to);
    if (source)      params.set("source", source);
    if (projectType) params.set("projectType", projectType);

    const qs = params.toString() ? `?${params.toString()}` : "";
    const { ok: apiOk, data, error: e } = await apiFetch(`/api/marketing/area-performance${qs}`);

    if (apiOk && data) {
      setAreas(data.areas || []);
      setTotals(data.totals || null);
      setRoiAvail(data.roiAvailable !== false);
    } else {
      setError(e || "Could not load area performance data.");
    }
    setLoading(false);
  }, [from, to, source, projectType]);

  useEffect(() => {
    load();
  }, [load]);

  // Sort in-component (all data already fetched — server returns full set)
  const handleSort = (key) => {
    setSheetSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sorted = [...areas].sort((a, b) => {
    const av = sortValue(a, sheetSort.key);
    const bv = sortValue(b, sheetSort.key);
    const dir = sheetSort.direction === "asc" ? 1 : -1;
    if (av < bv) return -dir;
    if (av > bv) return dir;
    return 0;
  });

  const hasFilters = from || to || source || projectType;

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Marketing</p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">Area Performance</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Outcome quality by suburb — from your CRM leads + attribution.
          Which areas produce good leads (not just more)?
        </p>
      </header>

      {/* Cost data notice */}
      {!roiAvail && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Attribution cost data is not yet available (migration 130 pending). Win-rate and quality
          metrics are shown; cost-per-won will appear once applied.
        </div>
      )}

      {/* Filters */}
      <section className="rounded-card border border-hairline bg-surface p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted">Filters</p>
        <div className="flex flex-wrap gap-3">
          {/* Date range */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded border border-hairline bg-page px-2 py-1.5 text-sm focus-ring"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded border border-hairline bg-page px-2 py-1.5 text-sm focus-ring"
            />
          </div>

          {/* Source */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="rounded border border-hairline bg-page px-2 py-1.5 text-sm focus-ring"
            >
              <option value="">All sources</option>
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Project type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Project type</label>
            <input
              type="text"
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
              placeholder="e.g. renovation"
              className="rounded border border-hairline bg-page px-2 py-1.5 text-sm focus-ring w-40"
            />
          </div>

          {hasFilters && (
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => { setFrom(""); setTo(""); setSource(""); setProjectType(""); }}
                className="rounded border border-hairline bg-page px-3 py-1.5 text-xs text-muted hover:bg-slate-100"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Totals summary strip */}
      {totals && !loading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Suburbs", value: totals.suburbCount },
            { label: "Enquiries", value: totals.enquiries },
            { label: "Qualified", value: totals.qualified },
            { label: "Won", value: totals.won },
            { label: "Won value", value: fmtMoneyCompact(totals.wonValue) },
            {
              label: "Avg win rate",
              value: fmtPct(totals.winRate),
              muted: totals.winRate == null,
            },
          ].map((t) => (
            <div key={t.label} className="rounded-card border border-hairline bg-surface p-3">
              <p className="text-xs text-muted">{t.label}</p>
              <p className={`mt-0.5 text-xl font-semibold ${t.muted ? "text-muted" : "text-primary"}`}>
                {t.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* States */}
      {loading && (
        <div className="py-12 text-center text-sm text-muted">Loading area data…</div>
      )}
      {!loading && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      {!loading && !error && sorted.length === 0 && (
        <div className="rounded-card border border-hairline bg-surface py-12 text-center text-sm text-muted">
          No leads match the current filters.
        </div>
      )}

      {!loading && !error && sorted.length > 0 && (
        <div className="rounded-card border border-hairline bg-surface overflow-x-auto">
          {/* Low-sample legend */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-hairline text-xs text-muted">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-200 border border-slate-300 flex-shrink-0" />
            Greyed rows have fewer than {5} enquiries — treat metrics with caution (low sample).
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <SortableTableHead label="Suburb"      sortKey="suburb"       activeSort={sheetSort} onSort={handleSort} />
                <SortableTableHead label="Enquiries"   sortKey="enquiries"    activeSort={sheetSort} onSort={handleSort} />
                <SortableTableHead label="Qualified"   sortKey="qualified"    activeSort={sheetSort} onSort={handleSort} />
                <SortableTableHead label="Won"         sortKey="won"          activeSort={sheetSort} onSort={handleSort} />
                <SortableTableHead label="Won value"   sortKey="wonValue"     activeSort={sheetSort} onSort={handleSort} />
                <SortableTableHead label="Quality %"   sortKey="qualityRatio" activeSort={sheetSort} onSort={handleSort} />
                <SortableTableHead label="Win %"       sortKey="winRate"      activeSort={sheetSort} onSort={handleSort} />
                <SortableTableHead label="Cost/won"    sortKey="costPerWon"   activeSort={sheetSort} onSort={handleSort} />
                <SortableTableHead label="Top source"  sortKey="topSource"    activeSort={sheetSort} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((area) => (
                <AreaRow key={area.suburb} area={area} />
              ))}
            </tbody>
          </table>

          {/* Footer with totals */}
          {totals && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 60px 60px 50px 90px 70px 60px 80px 100px",
                padding: "9px 10px",
                borderTop: "2px solid #e2e8f0",
                background: "#f8fafc",
                fontSize: 12,
                fontWeight: 700,
                color: "#1e293b",
              }}
            >
              <span>Total ({totals.suburbCount} suburbs)</span>
              <span>{totals.enquiries}</span>
              <span>{totals.qualified}</span>
              <span>{totals.won}</span>
              <span>{fmtMoney(totals.wonValue)}</span>
              <span>{fmtPct(totals.qualityRatio)}</span>
              <span>{fmtPct(totals.winRate)}</span>
              <span>
                {totals.costPerWon != null ? fmtMoney(totals.costPerWon) : "—"}
              </span>
              <span />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AreaRow ──────────────────────────────────────────────────────────────────

function AreaRow({ area }) {
  const lowSample = area.lowSample;

  const rowStyle = {
    opacity: lowSample ? 0.55 : 1,
    background: lowSample ? "#f8fafc" : "transparent",
  };

  const cellStyle = { ...tableBodyCell };

  return (
    <tr style={rowStyle}>
      {/* Suburb */}
      <td style={cellStyle}>
        <span className="font-medium text-ink">{area.suburb}</span>
        {lowSample && (
          <span className="ml-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
            low sample
          </span>
        )}
      </td>

      {/* Enquiries */}
      <td style={cellStyle}>
        <span className="tabular-nums">{area.enquiries}</span>
      </td>

      {/* Qualified */}
      <td style={cellStyle}>
        <span className="tabular-nums">{area.qualified}</span>
      </td>

      {/* Won */}
      <td style={cellStyle}>
        <span className="tabular-nums">{area.won}</span>
      </td>

      {/* Won value */}
      <td style={cellStyle}>
        <span className="tabular-nums font-medium">
          {area.wonValue > 0 ? fmtMoney(area.wonValue) : "—"}
        </span>
      </td>

      {/* Quality % */}
      <td style={cellStyle}>
        <QualityBar value={area.qualityRatio} />
      </td>

      {/* Win % */}
      <td style={cellStyle}>
        {area.winRate != null ? (
          <span
            className={`tabular-nums font-semibold ${
              area.winRate >= 0.5 ? "text-emerald-700" :
              area.winRate >= 0.25 ? "text-amber-700" :
              "text-red-600"
            }`}
          >
            {fmtPct(area.winRate)}
          </span>
        ) : (
          <span className="text-muted text-xs">—</span>
        )}
      </td>

      {/* Cost/won — null = cost not captured */}
      <td style={cellStyle}>
        {area.costPerWon != null ? (
          <span className="tabular-nums text-sm">{fmtMoney(area.costPerWon)}</span>
        ) : (
          <span className="text-muted text-xs" title="No lead cost data captured for this suburb">—</span>
        )}
      </td>

      {/* Top source */}
      <td style={cellStyle}>
        {area.topSource ? (
          <SourceBadge source={area.topSource} />
        ) : (
          <span className="text-muted text-xs">—</span>
        )}
      </td>
    </tr>
  );
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

function QualityBar({ value }) {
  if (value == null) return <span className="text-muted text-xs">—</span>;
  const pct = Math.round(value * 100);
  const barColor = pct >= 60 ? "#059669" : pct >= 35 ? "#d97706" : "#ef4444";
  return (
    <div className="flex items-center gap-2">
      <div
        style={{
          width: 40,
          height: 6,
          borderRadius: 3,
          background: "#e2e8f0",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: `${Math.min(pct, 100)}%`,
            height: "100%",
            background: barColor,
            borderRadius: 3,
          }}
        />
      </div>
      <span style={{ fontSize: 12, color: barColor, fontWeight: 600, tabularNums: true }}>
        {pct}%
      </span>
    </div>
  );
}

const SOURCE_BADGE_COLORS = {
  website:     "bg-blue-50 text-blue-700",
  referral:    "bg-emerald-50 text-emerald-700",
  repeat:      "bg-teal-50 text-teal-700",
  social:      "bg-purple-50 text-purple-700",
  search:      "bg-sky-50 text-sky-700",
  advertising: "bg-orange-50 text-orange-700",
  walk_in:     "bg-amber-50 text-amber-700",
  other:       "bg-slate-100 text-slate-600",
};

function SourceBadge({ source }) {
  const label = LEAD_SOURCE_CATEGORY_LABELS[source] || source;
  const cls = SOURCE_BADGE_COLORS[source] || "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

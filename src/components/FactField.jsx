// FactField.jsx — the reusable provenance component (Phase 0 activation).
// See docs/agent_knowledge/UNIVERSAL_DATA_MIGRATION_PLAN.md §2.3 + CLAUDE.md Canonical Data Law.
//
// Renders a single canonical fact with its provenance (source · confidence · status) and the
// status-appropriate actions:
//   🟢 extracted_applied  → value + "auto-applied from <source>" + [Override]
//   🔴 extracted_flagged  → a SUGGESTION (not yet canonical) + [Confirm] / [Edit] / [Dismiss]
//   manual / confirmed    → value + provenance chip + [Edit]
//
// Override / Edit write a 'manual' fact via POST /api/facts/job/:jobId/:fieldKey.
// Confirm promotes the flagged suggestion via POST /api/facts/job/:jobId/:fieldKey/confirm.
// All network calls go through apiPost (CLAUDE.md). The component never reads raw snake_case.

import { useState } from "react";
import { apiPost } from "../lib/apiFetch.js";

const STATUS = {
  extracted_applied: { dot: "bg-green-500", label: "auto-applied", chip: "bg-green-50 text-green-700 border-green-200" },
  extracted_flagged: { dot: "bg-red-500", label: "needs confirmation", chip: "bg-red-50 text-red-700 border-red-200" },
  confirmed: { dot: "bg-primary", label: "confirmed", chip: "bg-blue-50 text-primary border-blue-200" },
  manual: { dot: "bg-slate-400", label: "manual entry", chip: "bg-slate-50 text-muted border-hairline" },
};

function displayValue(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (v === true) return "Yes";
  if (v === false) return "No";
  return String(v);
}

function confidencePct(conf) {
  if (conf === null || conf === undefined) return null;
  const n = Number(conf);
  if (Number.isNaN(n)) return null;
  // confidence may be stored 0-1 or 0-100; normalise to a percentage
  const pct = n <= 1 ? n * 100 : n;
  return `${Math.round(pct)}%`;
}

/** Small source · confidence · status chip. */
function ProvenanceChip({ provenance }) {
  if (!provenance) return null;
  const status = provenance.status || "manual";
  const cfg = STATUS[status] || STATUS.manual;
  const conf = confidencePct(provenance.confidence);
  const parts = [provenance.source, conf, cfg.label].filter(Boolean);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${cfg.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {parts.join(" · ")}
    </span>
  );
}

export default function FactField({ jobId, fieldKey, value, provenance, label, onChange }) {
  const status = provenance?.status || (provenance ? "confirmed" : "manual");
  const isSuggestion = status === "extracted_flagged";

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => (value == null ? "" : String(value)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function startEdit() {
    setDraft(value == null ? "" : String(value));
    setEditing(true);
    setError(null);
  }

  async function write(nextValue) {
    setBusy(true);
    setError(null);
    const { ok, data, error: apiError } = await apiPost(
      `/api/facts/job/${jobId}/${fieldKey}`,
      { value: nextValue }
    );
    setBusy(false);
    if (!ok) {
      setError(apiError || "Could not save.");
      return;
    }
    setEditing(false);
    onChange?.({ key: fieldKey, value: nextValue, fact: data?.fact, action: "override" });
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const { ok, data, error: apiError } = await apiPost(
      `/api/facts/job/${jobId}/${fieldKey}/confirm`,
      {}
    );
    setBusy(false);
    if (!ok) {
      setError(apiError || "Could not confirm.");
      return;
    }
    onChange?.({ key: fieldKey, value, fact: data?.fact, action: "confirm" });
  }

  function dismiss() {
    onChange?.({ key: fieldKey, value, action: "dismiss" });
  }

  const btn = "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50";
  const btnPrimary = `${btn} bg-primary text-white border-primary hover:bg-primary/90`;
  const btnGhost = `${btn} bg-white text-ink border-hairline hover:bg-slate-50`;

  return (
    <div className="rounded-card border border-hairline bg-surface px-3 py-2.5">
      {label && <p className="text-sm text-ink mb-1">{label}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
            className="flex-1 min-w-0 rounded-lg border border-hairline px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        ) : (
          <span className={`text-sm font-medium ${isSuggestion ? "text-red-700 italic" : "text-ink"}`}>
            {displayValue(value)}
            {isSuggestion && <span className="ml-1 text-[11px] font-normal text-muted not-italic">(suggested)</span>}
          </span>
        )}

        {!editing && <ProvenanceChip provenance={provenance} />}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <button type="button" className={btnPrimary} disabled={busy} onClick={() => write(draft)}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className={btnGhost} disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </>
        ) : status === "extracted_flagged" ? (
          <>
            <button type="button" className={btnPrimary} disabled={busy} onClick={confirm}>
              {busy ? "…" : "Confirm"}
            </button>
            <button type="button" className={btnGhost} disabled={busy} onClick={startEdit}>
              Edit
            </button>
            <button type="button" className={`${btnGhost} text-muted`} disabled={busy} onClick={dismiss}>
              Dismiss
            </button>
          </>
        ) : status === "extracted_applied" ? (
          <button type="button" className={btnGhost} disabled={busy} onClick={startEdit}>
            Override
          </button>
        ) : (
          <button type="button" className={btnGhost} disabled={busy} onClick={startEdit}>
            Edit
          </button>
        )}
      </div>

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

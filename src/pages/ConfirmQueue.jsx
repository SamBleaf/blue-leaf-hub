// ConfirmQueue.jsx — Phase 3: the portfolio-wide review screen for 🔴 fact suggestions.
// See docs/agent_knowledge/UNIVERSAL_DATA_MIGRATION_PLAN.md Phase 3 + CLAUDE.md Canonical Data Law.
//
// Lists every `extracted_flagged` (🔴 consequential) fact awaiting human confirmation across
// ALL jobs, grouped by job (address header). Each row renders with the shared <FactField>;
// on confirm / edit / dismiss the row drops out and the counts refresh. Reads
// GET /api/facts/pending via apiFetch (CLAUDE.md); FactField handles the writes.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/apiFetch.js";
import FactField from "../components/FactField.jsx";

export default function ConfirmQueue() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { ok, data, error: apiError } = await apiFetch("/api/facts/pending");
    setLoading(false);
    if (!ok) {
      setError(apiError || "Could not load suggestions.");
      setPending([]);
      return;
    }
    setPending(Array.isArray(data?.pending) ? data.pending : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Drop the row locally on confirm / override / dismiss (keeps the screen fast — no full reload).
  const handleResolved = useCallback((jobId, key) => {
    setPending((rows) => rows.filter((r) => !(r.jobId === jobId && r.key === key)));
  }, []);

  // Group by job, preserving first-seen order; address header per group.
  const groups = useMemo(() => {
    const byJob = new Map();
    for (const row of pending) {
      if (!byJob.has(row.jobId)) {
        byJob.set(row.jobId, { jobId: row.jobId, jobLabel: row.jobLabel || "Unlabelled job", facts: [] });
      }
      byJob.get(row.jobId).facts.push(row);
    }
    return [...byJob.values()];
  }, [pending]);

  const total = pending.length;

  return (
    <div className="px-4 md:px-6 py-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">Confirm Queue</h1>
          <p className="text-sm text-muted mt-0.5">
            High-consequence facts extracted from documents that need a human to confirm
            before they become canonical.
          </p>
        </div>
        {!loading && total > 0 && (
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            {total} awaiting
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="rounded-card border border-hairline bg-surface p-4 animate-pulse h-32" />
          ))}
        </div>
      )}

      {!loading && !error && total === 0 && (
        <div className="rounded-card border border-dashed border-hairline bg-page py-16 text-center">
          <p className="text-sm font-semibold text-ink">No suggestions awaiting confirmation</p>
          <p className="text-xs text-muted mt-1">
            When a plan or document is processed, any high-consequence facts it produces will
            appear here for review.
          </p>
        </div>
      )}

      {!loading && total > 0 && (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.jobId} className="rounded-card border border-hairline bg-surface overflow-hidden">
              <header className="flex items-center justify-between gap-3 border-b border-hairline bg-page px-4 py-3">
                <h2 className="text-sm font-bold text-ink truncate">{group.jobLabel}</h2>
                <span className="shrink-0 rounded-full border border-hairline bg-surface px-2 py-0.5 text-xs font-semibold text-muted">
                  {group.facts.length} fact{group.facts.length === 1 ? "" : "s"}
                </span>
              </header>
              <div className="p-4 space-y-3">
                {group.facts.map((fact) => (
                  <FactField
                    key={`${fact.jobId}::${fact.key}`}
                    jobId={fact.jobId}
                    fieldKey={fact.key}
                    value={fact.value}
                    provenance={fact.provenance}
                    label={fact.label}
                    onChange={() => handleResolved(fact.jobId, fact.key)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

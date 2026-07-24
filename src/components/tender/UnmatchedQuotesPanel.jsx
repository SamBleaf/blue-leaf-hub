// Inbound quote emails the matcher couldn't tie to a job — with a "Match to job → RFQ" triage
// modal. Extracted from the Quote Tracker's Unmatched tab (step 9b) so it can also render as a
// first-class Quote Inbox page; single source of truth for both. Resolving goes through
// POST /api/unmatched-quotes/resolve, which now dual-writes the new submission model.
import { authFetch } from "../../lib/authFetch.js";
import { useEffect, useState } from "react";
import { getSupabase, supabaseConfigured } from "../../lib/supabaseClient";

export default function UnmatchedQuotesPanel({ onCountChange }) {
  const [unmatched, setUnmatched] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [matchModal, setMatchModal] = useState(null);
  const [matchJobId, setMatchJobId] = useState("");
  const [matchRfqId, setMatchRfqId] = useState("");
  const [matchBusy, setMatchBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    authFetch("/api/quote-tracker/unmatched")
      .then((r) => r.json())
      .then((j) => { const items = j?.items || []; setUnmatched(items); onCountChange?.(items.length); })
      .catch(() => setUnmatched([]))
      .finally(() => setLoading(false));

    if (supabaseConfigured) {
      const sb = getSupabase();
      sb.from("jobs").select("id, address, rfqs(id, trade, subcontractors(business_name))").order("created_at", { ascending: false })
        .then(({ data }) => setJobs(data || []));
    }
    // onCountChange is a stable reporter; re-running on its identity would refetch needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmMatch() {
    if (!matchModal?.id || !matchRfqId) return;
    setMatchBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/unmatched-quotes/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unmatchedId: matchModal.id, rfqId: matchRfqId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || "Match failed");
      setMatchModal(null);
      setMatchJobId("");
      setMatchRfqId("");
      setUnmatched((u) => { const next = u.filter((x) => x.id !== matchModal.id); onCountChange?.(next.length); return next; });
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setMatchBusy(false);
    }
  }

  if (loading) return (
    <div className="flex min-h-[20vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-hairline border-t-primary" />
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Inbound quote emails that could not be matched to a job automatically.
      </p>
      {error && <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-2 text-sm text-danger">{error}</div>}

      {unmatched.length === 0 ? (
        <div className="rounded-card border border-hairline bg-surface p-8 text-center text-sm text-muted">None pending — all good.</div>
      ) : (
        <ul className="space-y-2">
          {unmatched.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-hairline bg-surface px-4 py-3 text-sm">
              <div>
                <span className="font-semibold text-ink">{u.subject || "(no subject)"}</span>
                <span className="ml-2 text-muted">— {u.from_email}</span>
              </div>
              <button
                type="button"
                className="rounded-lg border border-accent px-3 py-1 text-xs font-semibold text-accent hover:bg-accent/10"
                onClick={() => { setMatchModal({
                  id: u.id,
                  subject: u.subject,
                  fromEmail: u.from_email,
                  bodyPreview: u.body_preview,
                  quotePdfUrl: u.quote_pdf_url
                }); setMatchJobId(""); setMatchRfqId(""); }}
              >
                Match to job
              </button>
            </li>
          ))}
        </ul>
      )}

      {matchModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="max-w-lg w-full rounded-card border border-hairline bg-surface p-6 shadow-lg">
            <h3 className="text-lg font-bold text-primary">Match quote email to RFQ</h3>
            <p className="mt-2 text-xs text-muted">{matchModal.subject || "(no subject)"}</p>
            {matchModal.fromEmail ? (
              <p className="mt-1 text-xs text-muted">From: {matchModal.fromEmail}</p>
            ) : null}
            {matchModal.bodyPreview ? (
              <p className="mt-2 max-h-24 overflow-y-auto rounded border border-hairline bg-page p-2 text-xs text-muted whitespace-pre-wrap">
                {matchModal.bodyPreview.slice(0, 800)}
              </p>
            ) : null}
            {matchModal.quotePdfUrl ? (
              <a
                href={matchModal.quotePdfUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-xs font-semibold text-accent underline"
              >
                View quote PDF
              </a>
            ) : null}
            <label className="mt-4 block text-xs font-semibold text-ink">
              Job
              <select className="mt-1 w-full rounded border px-2 py-2 text-sm" value={matchJobId} onChange={(e) => { setMatchJobId(e.target.value); setMatchRfqId(""); }}>
                <option value="">Select job…</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.address || j.id}</option>)}
              </select>
            </label>
            <label className="mt-3 block text-xs font-semibold text-ink">
              RFQ / trade
              <select className="mt-1 w-full rounded border px-2 py-2 text-sm" value={matchRfqId} onChange={(e) => setMatchRfqId(e.target.value)} disabled={!matchJobId}>
                <option value="">Select RFQ…</option>
                {(jobs.find((j) => j.id === matchJobId)?.rfqs || []).map((r) => (
                  <option key={r.id} value={r.id}>{r.trade} — {r.subcontractors?.business_name || "sub"}</option>
                ))}
              </select>
            </label>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold" onClick={() => setMatchModal(null)} disabled={matchBusy}>Cancel</button>
              <button type="button" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={matchBusy || !matchRfqId} onClick={confirmMatch}>
                {matchBusy ? "Saving…" : "Match"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

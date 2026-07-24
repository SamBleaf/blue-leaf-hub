import { apiPost, apiFetch } from "../lib/apiFetch.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";
import FilterChips from "../components/ui/FilterChips.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import TenderKpiStrip from "../components/tender/TenderKpiStrip.jsx";
import TenderActionQueue from "../components/tender/TenderActionQueue.jsx";
import TenderJobCard from "../components/tender/TenderJobCard.jsx";
import { computeTenderKpis, buildTenderActionQueue, groupByStage, rfqStats, STATUS_META, fmtMoney } from "../lib/tenderDashboard.js";

export default function TenderBoard() {
  const nav = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [quoteSummary, setQuoteSummary] = useState({});
  const [error, setError] = useState("");
  const [view, setView] = useState("board"); // board | actions | list | scorecard
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [openJobMenu, setOpenJobMenu] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabaseConfigured) {
      setError("Configure Supabase to load tenders.");
      return;
    }
    const sb = getSupabase();
    const { data, error: err } = await sb
      .from("jobs")
      .select(
        `id, address, status, created_at, won_at, lost_at, dropbox_shared_link, dropbox_link,
         rfqs ( id, status, sent_at, received_at, reminder_sent_at )`
      )
      .order("created_at", { ascending: false });
    if (err) {
      setError(err.message);
      return;
    }
    setJobs(data || []);
    setError("");
    // Quote/award metrics from the submission model (fail-soft — pre-migration returns {}).
    try {
      const { ok, data: sum } = await apiFetch("/api/tender/board-quote-summary");
      setQuoteSummary(ok ? (sum?.summary || {}) : {});
    } catch { setQuoteSummary({}); }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function archiveJobBoard(jobId) {
    // W05-DRIFT-002: route through the audited server endpoint (reversible + job_events log).
    const { ok, error } = await apiPost("/api/tender/archive", { jobId });
    if (!ok) setError(error || "Could not archive tender.");
    else await load();
  }

  async function confirmDeleteJob() {
    if (!deleteModal?.id) return;
    setDeleteBusy(true);
    setError("");
    try {
      const { ok, error } = await apiPost("/api/tender/job-delete", { jobId: deleteModal.id });
      if (!ok) throw new Error(error || "Delete failed");
      setDeleteModal(null);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setDeleteBusy(false);
    }
  }

  const filtered = useMemo(() => {
    let rows = jobs || [];
    if (!showArchived) rows = rows.filter((j) => j.status !== "archived");
    const s = q.trim().toLowerCase();
    if (s) rows = rows.filter((j) => (j.address || "").toLowerCase().includes(s));
    return rows;
  }, [jobs, q, showArchived]);

  const kpis = useMemo(() => computeTenderKpis(jobs, quoteSummary), [jobs, quoteSummary]);
  const actions = useMemo(() => buildTenderActionQueue(jobs), [jobs]);
  const groups = useMemo(() => groupByStage(filtered), [filtered]);

  const views = [
    { value: "board", label: "Board" },
    { value: "actions", label: "Actions", count: actions.length },
    { value: "list", label: "List" },
    { value: "scorecard", label: "Scorecard" },
  ];

  if (!supabaseConfigured) {
    return (
      <div className="rounded-card border border-warning/50 bg-warning/10 p-6 text-sm text-ink">
        <h1 className="text-xl font-semibold text-primary">Tender Manager</h1>
        <p className="mt-2 text-muted">Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p>
      </div>
    );
  }

  function StageGroups({ layout }) {
    return (
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-ink">{g.label}</h2>
              <StatusBadge variant={g.variant}>{g.items.length}</StatusBadge>
            </div>
            <div className={layout === "grid" ? "grid gap-3 sm:grid-cols-2" : "space-y-3"}>
              {g.items.map((job) => (
                <TenderJobCard
                  key={job.id}
                  job={job}
                  summary={quoteSummary[job.id]}
                  onOpen={(id) => nav(`/tender-manager/board/${id}`)}
                  menuOpen={openJobMenu === job.id}
                  onToggleMenu={setOpenJobMenu}
                  onArchive={archiveJobBoard}
                  onDelete={setDeleteModal}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title text-2xl">Tenders</h1>
          <p className="mt-0.5 text-sm text-muted">What&rsquo;s missing · who to chase · what&rsquo;s ready to award.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-ink"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Show archived</label>
          <Link to="/tender-manager/rfq-engine" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95">New tender</Link>
        </div>
      </header>

      {error ? <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-2 text-sm text-danger">{error}</div> : null}

      <TenderKpiStrip kpis={kpis} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterChips options={views} value={view} onChange={setView} />
        <input type="search" placeholder="Search by address…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full max-w-sm rounded-lg border border-hairline bg-page px-3 py-2 text-sm" />
      </div>

      {!filtered.length ? (
        <EmptyState title="No tenders match" hint="Adjust the search or archived filter, or start a new tender." />
      ) : (
        <>
          {/* DESKTOP */}
          <div className="hidden lg:block">
            {view === "board" && (
              <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
                <TenderActionQueue actions={actions} />
                <StageGroups layout="grid" />
              </div>
            )}
            {view === "actions" && <TenderActionQueue actions={actions} />}
            {view === "list" && (
              <div className="overflow-x-auto rounded-card border border-hairline bg-surface">
                <table className="w-full text-left text-sm">
                  <thead className="section-label border-b border-hairline bg-page"><tr>{["Address", "Stage", "Coverage", "Missing", "Chase", "Awarded"].map((h) => <th key={h} className="px-3 py-2.5">{h}</th>)}</tr></thead>
                  <tbody>
                    {filtered.map((job) => {
                      const s = rfqStats(job); const m = STATUS_META[job.status] || STATUS_META.tendering;
                      const qs = quoteSummary[job.id];
                      return (
                        <tr key={job.id} className="border-b border-hairline hover:bg-page">
                          <td className="px-3 py-2.5"><button type="button" onClick={() => nav(`/tender-manager/board/${job.id}`)} className="font-semibold text-primary hover:underline focus-ring">{job.address}</button></td>
                          <td className="px-3 py-2.5"><StatusBadge variant={m.variant} dot>{m.label}</StatusBadge></td>
                          <td className="px-3 py-2.5 text-xs text-muted">{s.coverage}%</td>
                          <td className="px-3 py-2.5 text-xs">{s.missing > 0 ? <span className="font-semibold text-warning">{s.missing}</span> : <span className="text-green-600">—</span>}</td>
                          <td className="px-3 py-2.5 text-xs">{s.chase > 0 ? <span className="font-semibold text-danger">{s.chase}</span> : <span className="text-muted">—</span>}</td>
                          <td className="px-3 py-2.5 text-xs">{qs?.awardedCount > 0 ? <span className="font-semibold text-primary">{qs.awardedCount} · {fmtMoney(qs.acceptedTotalExGst)}</span> : <span className="text-muted">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {view === "scorecard" && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {groups.map((g) => (
                  <div key={g.key} className="rounded-card border border-hairline bg-surface p-4 text-center">
                    <div className="text-2xl font-bold text-ink">{g.items.length}</div>
                    <div className="text-xs text-muted">{g.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MOBILE/TABLET — action queue + grouped cards */}
          <div className="space-y-5 lg:hidden">
            {view === "scorecard" ? (
              <div className="grid grid-cols-2 gap-3">{groups.map((g) => (<div key={g.key} className="rounded-card border border-hairline bg-surface p-4 text-center"><div className="text-2xl font-bold text-ink">{g.items.length}</div><div className="text-xs text-muted">{g.label}</div></div>))}</div>
            ) : (
              <>
                <TenderActionQueue actions={actions} />
                {view !== "actions" && <StageGroups layout="stack" />}
              </>
            )}
          </div>
        </>
      )}

      {deleteModal ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="max-w-md rounded-card border border-hairline bg-surface p-6 shadow-lg">
            <h3 className="text-lg font-bold text-primary">Delete job</h3>
            <p className="mt-3 text-sm text-muted">Delete {deleteModal.address}? This will permanently delete the job, all RFQs, quotes, and correspondence. This cannot be undone.</p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold" onClick={() => setDeleteModal(null)} disabled={deleteBusy}>Cancel</button>
              <button type="button" className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white" disabled={deleteBusy} onClick={confirmDeleteJob}>{deleteBusy ? "Deleting…" : "Delete permanently"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

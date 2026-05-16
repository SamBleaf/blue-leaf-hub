import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";

const STATUS_BADGE = {
  tendering: { label: "Tendering", cls: "bg-[#FEF3C7] text-[#92400E]" },
  won: { label: "Won", cls: "bg-[#DCFCE7] text-[#166534]" },
  lost: { label: "Lost", cls: "bg-[#FEE2E2] text-[#991B1B]" },
  archived: { label: "Archived", cls: "bg-[#F1F5F9] text-[#475569]" }
};

function quotesRingPct(rfqs) {
  if (!rfqs?.length) return 0;
  const got = rfqs.filter((r) => ["received", "accepted"].includes(r.status)).length;
  return Math.round((got / rfqs.length) * 100);
}

function daysSinceLastActivity(job, rfqs) {
  const dates = [job.created_at, ...(rfqs || []).map((r) => r.sent_at || r.received_at || r.reminder_sent_at)].filter(
    Boolean
  );
  const t = dates.map((d) => new Date(d).getTime()).filter((n) => !Number.isNaN(n));
  if (!t.length) return "—";
  const latest = Math.max(...t);
  const days = Math.floor((Date.now() - latest) / (24 * 60 * 60 * 1000));
  return `${days}d`;
}

export default function TenderBoard() {
  const nav = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
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
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function archiveJobBoard(jobId) {
    const sb = getSupabase();
    if (!sb) return;
    const { error: u } = await sb.from("jobs").update({ status: "archived" }).eq("id", jobId);
    if (u) setError(u.message);
    else await load();
  }

  async function confirmDeleteJob() {
    if (!deleteModal?.id) return;
    setDeleteBusy(true);
    setError("");
    try {
      const res = await fetch("/api/tender/job-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: deleteModal.id })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || "Delete failed");
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
    if (tab !== "all") rows = rows.filter((j) => j.status === tab);
    const s = q.trim().toLowerCase();
    if (s) rows = rows.filter((j) => (j.address || "").toLowerCase().includes(s));
    return rows;
  }, [jobs, tab, q, showArchived]);

  if (!supabaseConfigured) {
    return (
      <div className="rounded-card border border-warning/50 bg-warning/10 p-6 text-sm text-ink">
        <h1 className="text-xl font-semibold text-primary">Tender Manager</h1>
        <p className="mt-2 text-muted">Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Tender Manager · Module 4</p>
          <h1 className="text-3xl font-semibold text-primary tracking-tight">Tenders</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">RFQs, quotes, win/lose, and handover to Operations.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-ink">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
          <Link
            to="/tender-manager/rfq-engine"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
          >
            New tender
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg border border-hairline bg-surface p-1">
          {["all", "tendering", "won", "lost", "archived"].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold capitalize ${
                tab === k ? "bg-primary text-white" : "text-muted hover:bg-page"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search by address…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-hairline bg-page px-3 py-2 text-sm"
        />
      </div>

      {error ? <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-2 text-sm text-danger">{error}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted">No tenders match these filters.</p>
        ) : (
          filtered.map((job) => {
            const rfqs = job.rfqs || [];
            const pct = quotesRingPct(rfqs);
            const badge = STATUS_BADGE[job.status] || STATUS_BADGE.tendering;
            const firstSent = rfqs.map((r) => r.sent_at).filter(Boolean).sort()[0];
            return (
              <div key={job.id} className="relative rounded-card border border-hairline bg-surface shadow-sm transition hover:border-primary/40 hover:shadow-md">
                <div className="flex w-full items-stretch">
                  <button
                    type="button"
                    onClick={() => nav(`/tender-manager/board/${job.id}`)}
                    className="min-w-0 flex-1 p-5 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-lg font-bold text-primary">{job.address || "—"}</h2>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
                      <div>RFQs sent: {firstSent ? new Date(firstSent).toLocaleDateString("en-AU") : "—"}</div>
                      <div>Trades: {rfqs.length}</div>
                      <div>Last activity: {daysSinceLastActivity(job, rfqs)} ago</div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink">Quotes</span>
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary text-[10px] font-bold text-primary">
                          {pct}%
                        </span>
                      </div>
                    </div>
                  </button>
                  <div className="flex shrink-0 flex-col border-l border-hairline bg-page/30">
                    <button
                      type="button"
                      title="Job actions"
                      className="px-3 py-5 text-lg leading-none text-muted hover:text-ink"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenJobMenu((cur) => (cur === job.id ? null : job.id));
                      }}
                    >
                      ⋯
                    </button>
                  </div>
                </div>
                {openJobMenu === job.id ? (
                  <div className="absolute right-2 top-14 z-30 min-w-[11rem] rounded-lg border border-hairline bg-surface py-1 text-sm shadow-lg">
                    {job.status !== "archived" ? (
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left hover:bg-page"
                        onClick={() => {
                          setOpenJobMenu(null);
                          if (window.confirm("Archive this tender? It becomes read-only.")) {
                            void archiveJobBoard(job.id);
                          }
                        }}
                      >
                        Archive
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left font-semibold text-danger hover:bg-danger/10"
                      onClick={() => {
                        setOpenJobMenu(null);
                        setDeleteModal({ id: job.id, address: job.address || "—" });
                      }}
                    >
                      Delete job
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {deleteModal ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-md rounded-card border border-hairline bg-surface p-6 shadow-lg">
            <h3 className="text-lg font-bold text-primary">Delete job</h3>
            <p className="mt-3 text-sm text-muted">
              Delete {deleteModal.address}? This will permanently delete the job, all RFQs, quotes, and correspondence.
              This cannot be undone.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold"
                onClick={() => setDeleteModal(null)}
                disabled={deleteBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white"
                disabled={deleteBusy}
                onClick={confirmDeleteJob}
              >
                {deleteBusy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

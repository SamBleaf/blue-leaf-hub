import { authFetch } from "../lib/authFetch.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";
import UnmatchedQuotesPanel from "../components/tender/UnmatchedQuotesPanel.jsx";
import { formatSignatureFooter, loadEmailSignature } from "../lib/rfqSettings.js";
import { useProject } from "../lib/ProjectContext.jsx";

// ── helpers ──────────────────────────────────────────────────────────────────

function isOverdueLegacy(deadline, status) {
  if (!deadline || ["received", "accepted", "declined"].includes(status)) return false;
  const d = new Date(`${deadline}T00:00:00`);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return d < t && ["sent", "reminded"].includes(status);
}

function rowVisual(r) {
  if (r.status === "queued")   return { label: "Sending…", cls: "bg-zinc-500 text-white" };
  if (r.status === "accepted") return { label: "Accepted", cls: "bg-emerald-900/90 text-white" };
  if (r.status === "declined") return { label: "Declined", cls: "bg-zinc-400 text-white" };
  if (r.status === "received") return { label: "Received", cls: "bg-success text-white" };
  if (r.status === "reminded") return { label: "Reminded", cls: "bg-warning/90 text-amber-950" };
  if (isOverdueLegacy(r.deadline, r.status)) return { label: "Overdue", cls: "bg-danger text-white" };
  if (r.status === "sent")     return { label: "Sent", cls: "bg-accent text-white" };
  return { label: r.status || "—", cls: "bg-page text-ink ring-1 ring-hairline" };
}

function completionPct(rfqs) {
  if (!rfqs?.length) return 0;
  const done = rfqs.filter((r) => ["received", "accepted"].includes(r.status)).length;
  return Math.round((done / rfqs.length) * 100);
}

// ── direct rfqs tab (legacy) ─────────────────────────────────────────────────

function DirectRfqsTab({ activeJobId, projectAddress }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [error, setError] = useState("");
  const [busyRemind, setBusyRemind] = useState(null);
  const [emailModal, setEmailModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [openJobMenu, setOpenJobMenu] = useState(null);

  const loadJobs = useCallback(async () => {
    if (!supabaseConfigured) {
      setError("Configure Supabase to load jobs.");
      setLoading(false);
      return;
    }
    const sb = getSupabase();
    const { data, error: err } = await sb
      .from("jobs")
      .select(
        `id, address, status, created_at, dropbox_link, dropbox_shared_link, dropbox_internal_path,
         rfqs ( id, trade, status, sent_at, deadline, quote_amount, reminder_sent_at, received_at, manually_entered, quote_pdf_path, dropbox_pdf_url, email_body,
                subcontractors ( business_name, email, contact, mobile ) )`
      )
      .order("created_at", { ascending: false });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setJobs(data || []);
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const visibleJobs = useMemo(() =>
    activeJobId ? jobs.filter((j) => j.id === activeJobId) : jobs,
  [jobs, activeJobId]);

  const overdueList = useMemo(() => {
    const rows = [];
    for (const job of visibleJobs) {
      for (const rfq of job.rfqs || []) {
        if (isOverdueLegacy(rfq.deadline, rfq.status)) rows.push({ job, rfq });
      }
    }
    return rows;
  }, [visibleJobs]);

  function toggle(id) {
    setOpenJobMenu(null);
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }

  async function saveQuoteAmount(rfqId, raw) {
    const sb = getSupabase();
    if (!sb) return;
    const n = raw === "" ? null : Number(raw);
    const quote_amount = raw === "" || Number.isNaN(n) ? null : n;
    const { error: uerr } = await sb.from("rfqs").update({ quote_amount, manually_entered: true }).eq("id", rfqId);
    if (uerr) { setError(uerr.message); return; }
    await loadJobs();
  }

  async function sendReminder(rfqId) {
    setBusyRemind(rfqId);
    setError("");
    try {
      const sig = loadEmailSignature();
      const res = await authFetch("/api/rfq/remind-one", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfqId, signatureFooter: formatSignatureFooter(sig), signatureLogoDataUrl: String(sig.logoDataUrl || "").trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || res.statusText);
      await loadJobs();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusyRemind(null);
    }
  }

  async function confirmDeleteJob() {
    if (!deleteModal?.id) return;
    setDeleteBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/tender/job-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: deleteModal.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || "Delete failed");
      setDeleteModal(null);
      await loadJobs();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) return (
    <div className="flex min-h-[30vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-hairline border-t-primary" />
    </div>
  );

  return (
    <div className="space-y-4">
      {overdueList.length > 0 && (
        <div className="rounded-card border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ink">
          <strong>{overdueList.length} quote(s) overdue</strong>
          <span className="text-muted"> — expand the job below to send a reminder.</span>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-2 text-sm text-danger">{error}</div>
      )}

      {activeJobId && projectAddress && (
        <span className="flex items-center gap-1.5 self-start rounded-full bg-primary/8 border border-primary/20 px-3 py-1 text-xs font-semibold text-primary">
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
          {projectAddress}
        </span>
      )}
      {visibleJobs.length === 0 ? (
        <p className="text-sm text-muted">No direct RFQs found. Use the RFQ Engine to send — a package is created automatically.</p>
      ) : (
        visibleJobs.map((job) => {
          const rfqs = job.rfqs || [];
          const pct = completionPct(rfqs);
          const open = expanded[job.id];
          return (
            <div key={job.id} className="relative rounded-card border border-hairline bg-surface shadow-sm">
              <div className="flex w-full items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => toggle(job.id)}
                  className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3 px-5 py-4 text-left"
                >
                  <div>
                    <div className="font-semibold text-primary">{job.address || "—"}</div>
                    <div className="mt-1 text-xs text-muted">
                      {rfqs.length} trade(s) · {pct}% quotes in · {job.status}
                    </div>
                    {(job.dropbox_shared_link || job.dropbox_link)?.trim() && (
                      <a
                        href={(job.dropbox_shared_link || job.dropbox_link).trim()}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 block truncate text-xs font-semibold text-accent underline"
                        target="_blank" rel="noreferrer"
                      >
                        Shared Dropbox folder
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-28 overflow-hidden rounded-full bg-page">
                      <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-muted">{open ? "Hide" : "Show"}</span>
                  </div>
                </button>
                <div className="flex shrink-0 flex-col border-l border-hairline bg-page/30">
                  <button
                    type="button"
                    className="px-3 py-4 text-lg leading-none text-muted hover:text-ink"
                    onClick={(e) => { e.stopPropagation(); setOpenJobMenu((cur) => cur === job.id ? null : job.id); }}
                  >
                    ⋯
                  </button>
                </div>
              </div>

              {openJobMenu === job.id && (
                <div className="absolute right-2 top-12 z-30 min-w-[11rem] rounded-lg border border-hairline bg-surface py-1 text-sm shadow-lg">
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left font-semibold text-danger hover:bg-danger/10"
                    onClick={() => { setOpenJobMenu(null); setDeleteModal({ id: job.id, address: job.address || "—" }); }}
                  >
                    Delete job
                  </button>
                </div>
              )}

              {open && (
                <div className="border-t border-hairline px-5 py-4">
                  <div className="space-y-4">
                    {rfqs.map((r) => {
                      const v = rowVisual(r);
                      const canRemind = r.status === "sent" && !r.reminder_sent_at && (r.subcontractors?.email || "").trim();
                      const hasEmailBody = Boolean((r.email_body || "").trim());
                      return (
                        <div key={r.id} className="rounded-lg border border-hairline bg-page p-4 text-sm">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="font-semibold text-ink">{r.trade}</div>
                              <div className="text-xs text-muted">
                                {r.subcontractors?.business_name || "—"} · {r.subcontractors?.email || "No email"}
                              </div>
                            </div>
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${v.cls}`}>{v.label}</span>
                          </div>
                          <div className="mt-2 grid gap-2 text-xs text-muted sm:grid-cols-2">
                            <div>Sent: {r.sent_at ? new Date(r.sent_at).toLocaleDateString("en-AU") : "—"}</div>
                            <div>Deadline: {r.deadline || "—"}</div>
                            <div>
                              Quote:{" "}
                              <input
                                className="ml-1 w-28 rounded border border-hairline px-1 py-0.5 text-ink"
                                defaultValue={r.quote_amount ?? ""}
                                placeholder="$"
                                onBlur={(e) => {
                                  if (e.target.value === String(r.quote_amount ?? "")) return;
                                  saveQuoteAmount(r.id, e.target.value);
                                }}
                              />
                              {r.manually_entered && <span className="ml-2 text-[10px] uppercase text-accent">manual</span>}
                            </div>
                            <div>
                              PDF:{" "}
                              {(() => {
                                const href = String(r.quote_pdf_url || r.dropbox_pdf_url || "").trim();
                                return href.startsWith("http") ? (
                                  <a href={href} className="break-all font-semibold text-accent underline" target="_blank" rel="noreferrer">View PDF</a>
                                ) : <span className="text-muted">—</span>;
                              })()}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={!hasEmailBody}
                              title={!hasEmailBody ? "No saved email body" : "View sent RFQ email"}
                              onClick={() => setEmailModal({ title: `${job.address || "Job"} · ${r.trade}`, body: (r.email_body || "").trim() })}
                              className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-page disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              View Email
                            </button>
                            <button
                              type="button"
                              disabled={!canRemind || busyRemind === r.id}
                              onClick={() => sendReminder(r.id)}
                              className="rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-40"
                            >
                              {busyRemind === r.id ? "Sending…" : "Send reminder"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {emailModal && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog" aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && setEmailModal(null)}
        >
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-card border border-hairline bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
              <h2 className="text-base font-semibold text-primary">Sent email — {emailModal.title}</h2>
              <button type="button" onClick={() => setEmailModal(null)} className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-page">Close</button>
            </div>
            <pre className="max-h-[calc(85vh-5rem)] overflow-auto whitespace-pre-wrap break-words px-5 py-4 font-mono text-[13px] leading-relaxed text-ink">
              {emailModal.body}
            </pre>
          </div>
        </div>
      )}

      {deleteModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="max-w-md rounded-card border border-hairline bg-surface p-6 shadow-lg">
            <h3 className="text-lg font-bold text-primary">Delete job</h3>
            <p className="mt-3 text-sm text-muted">
              Delete {deleteModal.address}? This will permanently delete the job and all associated RFQs. This cannot be undone.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold" onClick={() => setDeleteModal(null)} disabled={deleteBusy}>Cancel</button>
              <button type="button" className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white" disabled={deleteBusy} onClick={confirmDeleteJob}>
                {deleteBusy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ── main page ─────────────────────────────────────────────────────────────────

// Model B "Packages" tab retired (mig 155) — Quote Tracker is now Direct RFQs (Model A) + Unmatched.
const TABS = [
  { id: "direct",    label: "Direct RFQs" },
  { id: "unmatched", label: "Unmatched" },
];

export default function RfqPackageList() {
  const { project } = useProject();
  const activeJobId = project?.job_id || null;
  const projectAddress = project?.address || null;

  const [tab, setTab] = useState("direct");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">Quote Tracker</h1>
        <p className="caption mt-0.5">Track direct quotes and unmatched inbound emails.</p>
      </header>

      <div className="flex gap-1 border-b border-hairline">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "direct"    && <DirectRfqsTab activeJobId={activeJobId} projectAddress={projectAddress} />}
      {tab === "unmatched" && <UnmatchedQuotesPanel />}
    </div>
  );
}

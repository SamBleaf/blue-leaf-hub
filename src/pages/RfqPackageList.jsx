import { authFetch } from "../lib/authFetch.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";
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

const PKG_STATUS_CLS = {
  draft:    "bg-slate-100 text-slate-600",
  sent:     "bg-blue-50 text-blue-700",
  received: "bg-green-50 text-green-700",
  active:   "bg-primary/10 text-primary",
  archived: "bg-slate-100 text-muted",
};

// ── package tab sub-components ───────────────────────────────────────────────

function CoverageBar({ score }) {
  const color = score >= 75 ? "bg-green-500" : score >= 50 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted">Trade coverage</span>
        <span className={`text-xs font-bold ${score >= 75 ? "text-green-600" : score >= 50 ? "text-amber-600" : "text-red-500"}`}>{score}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-hairline overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function PackageStatusSummary({ scopes }) {
  const trades = scopes?.length || 0;
  const sent = (scopes || []).filter((s) => ["sent", "followed_up"].includes(s.status)).length;
  const received = (scopes || []).filter((s) => s.status === "received").length;
  const pending = sent - received;
  const totalRecipients = (scopes || []).reduce((n, s) => n + (s.rfq_recipients?.length || 0), 0);
  return (
    <div className="mt-3 grid grid-cols-4 gap-2 text-center">
      {[
        { label: "Trades", value: trades },
        { label: "Recipients", value: totalRecipients },
        { label: "Pending", value: pending },
        { label: "Quotes in", value: received },
      ].map(({ label, value }) => (
        <div key={label} className="rounded-lg bg-page p-2">
          <div className="text-base font-bold text-ink">{value}</div>
          <div className="text-[10px] text-muted">{label}</div>
        </div>
      ))}
    </div>
  );
}

function FollowUpAlert({ scopes }) {
  const today = new Date();
  const overdue = (scopes || []).flatMap((s) =>
    (s.rfq_recipients || []).filter((r) => {
      if (!["sent", "followed_up"].includes(r.status)) return false;
      if (!r.follow_up_due) return false;
      return new Date(r.follow_up_due) < today;
    })
  );
  if (!overdue.length) return null;
  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/8 px-3 py-2">
      <span className="text-warning text-sm">⏰</span>
      <span className="text-xs text-ink font-medium">{overdue.length} follow-up{overdue.length !== 1 ? "s" : ""} overdue</span>
    </div>
  );
}

// ── packages tab ─────────────────────────────────────────────────────────────

function PackagesTab({ packages, loading, error, activeJobId, projectAddress }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("active");

  const jobFiltered = activeJobId ? packages.filter((p) => p.job_id === activeJobId) : packages;
  const filtered = filter === "all" ? jobFiltered : jobFiltered.filter((p) => p.status === filter);

  if (loading) return (
    <div className="flex min-h-[30vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-hairline border-t-primary" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {["active", "archived", "all"].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition ${
              filter === f ? "border-primary bg-primary/10 text-primary" : "border-hairline text-muted hover:text-ink"
            }`}
          >
            {f}
          </button>
        ))}
        {activeJobId && projectAddress && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-primary/8 border border-primary/20 px-3 py-1 text-xs font-semibold text-primary">
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
            {projectAddress}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="rounded-card border border-hairline bg-surface p-12 text-center">
          <div className="text-4xl mb-3">📦</div>
          <div className="text-base font-semibold text-ink mb-1">No packages yet</div>
          <p className="text-sm text-muted max-w-xs mx-auto">
            Packages are created automatically after you send RFQs in the RFQ Engine.
          </p>
          <button
            type="button"
            onClick={() => navigate("/tender-manager/rfq-engine")}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Go to RFQ Engine
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((pkg) => (
          <div
            key={pkg.id}
            className="rounded-card border border-hairline bg-surface p-5 hover:border-primary/30 hover:shadow-sm transition cursor-pointer"
            onClick={() => navigate(`/tender-manager/rfq-packages/${pkg.id}`)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-ink text-sm leading-tight truncate">{pkg.project_address || "Unnamed project"}</div>
                {pkg.project_type && <div className="text-xs text-muted mt-0.5">{pkg.project_type}</div>}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PKG_STATUS_CLS[pkg.status] || PKG_STATUS_CLS.active}`}>
                {pkg.status}
              </span>
            </div>

            {pkg.tender_deadline && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <span>📅</span>
                <span>Tender due <span className="font-semibold text-ink">{pkg.tender_deadline}</span></span>
              </div>
            )}
            {pkg.architect_client && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                <span>🏛</span>
                <span>{pkg.architect_client}</span>
              </div>
            )}

            <PackageStatusSummary scopes={pkg.rfq_trade_scopes} />
            <CoverageBar score={pkg.coverage_score || 0} />
            <FollowUpAlert scopes={pkg.rfq_trade_scopes} />

            <div className="mt-3 pt-3 border-t border-hairline flex items-center justify-between">
              <span className="text-[10px] text-muted">
                {new Date(pkg.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              <span className="text-xs font-semibold text-primary">Open →</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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

// ── unmatched tab ─────────────────────────────────────────────────────────────

function UnmatchedTab() {
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
      .then((j) => setUnmatched(j?.items || []))
      .catch(() => setUnmatched([]))
      .finally(() => setLoading(false));

    if (supabaseConfigured) {
      const sb = getSupabase();
      sb.from("jobs").select("id, address, rfqs(id, trade, subcontractors(business_name))").order("created_at", { ascending: false })
        .then(({ data }) => setJobs(data || []));
    }
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
      setUnmatched((u) => u.filter((x) => x.id !== matchModal.id));
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
                onClick={() => { setMatchModal({ id: u.id, subject: u.subject }); setMatchJobId(""); setMatchRfqId(""); }}
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

// ── main page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "packages",  label: "Packages" },
  { id: "direct",    label: "Direct RFQs" },
  { id: "unmatched", label: "Unmatched" },
];

export default function RfqPackageList() {
  const { project } = useProject();
  const activeJobId = project?.job_id || null;
  const projectAddress = project?.address || null;

  const [tab, setTab] = useState("packages");
  const [packages, setPackages] = useState([]);
  const [pkgLoading, setPkgLoading] = useState(true);
  const [pkgError, setPkgError] = useState(null);

  async function loadPackages() {
    setPkgLoading(true);
    try {
      const res = await authFetch("/api/rfq-packages");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Load failed");
      setPackages(j.packages || []);
    } catch (e) {
      setPkgError(e.message);
    } finally {
      setPkgLoading(false);
    }
  }

  useEffect(() => { loadPackages(); }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">Quote Tracker</h1>
        <p className="caption mt-0.5">Track all RFQ packages, direct quotes, and unmatched inbound emails.</p>
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
            {t.id === "packages" && packages.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{packages.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "packages"  && <PackagesTab packages={packages} loading={pkgLoading} error={pkgError} activeJobId={activeJobId} projectAddress={projectAddress} />}
      {tab === "direct"    && <DirectRfqsTab activeJobId={activeJobId} projectAddress={projectAddress} />}
      {tab === "unmatched" && <UnmatchedTab />}
    </div>
  );
}

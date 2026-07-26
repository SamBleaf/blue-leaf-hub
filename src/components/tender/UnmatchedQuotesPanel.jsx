// Quote Inbox triage panel. Rich rows (always-on) + a suggested match with confidence + an inline
// match drawer (job/trade pre-filled from the suggestion, high-confidence pre-selected), plus dismiss,
// "it's an invoice → Finance", "new subcontractor", tabs (Pending/Matched/Dismissed), search and bulk.
// Reads GET /api/quote-tracker/unmatched?status=…; actions hit /api/unmatched-quotes/* + /api/subcontractors.
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiPost } from "../../lib/apiFetch.js";
import { getSupabase, supabaseConfigured } from "../../lib/supabaseClient";

const HIGH_CONF = 0.9;

function fmtWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  const time = d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today · ${time}`;
  if (d.toDateString() === yest.toDateString()) return `Yesterday · ${time}`;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }) + ` · ${time}`;
}

function confTier(c) {
  if (c >= HIGH_CONF) return { cls: "text-accent", bar: "bg-accent" };
  if (c >= 0.55) return { cls: "text-warning", bar: "bg-warning" };
  return { cls: "text-muted", bar: "bg-muted" };
}

function guessBusinessFromEmail(email) {
  const dom = String(email || "").split("@")[1] || "";
  const base = dom.split(".")[0] || "";
  return base ? base.replace(/[-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : "";
}

export default function UnmatchedQuotesPanel() {
  const [tab, setTab] = useState("pending");
  const [counts, setCounts] = useState({ pending: 0, matched: 0, dismissed: 0 });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [jobs, setJobs] = useState([]);

  const [openIds, setOpenIds] = useState(() => new Set());     // rows with the match drawer expanded
  const [drafts, setDrafts] = useState({});                    // id -> { jobId, rfqId, amount }
  const [busyId, setBusyId] = useState(null);
  const [dismissFor, setDismissFor] = useState(null);          // id showing the dismiss reason input
  const [dismissReason, setDismissReason] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [newSubFor, setNewSubFor] = useState(null);            // row being turned into a subcontractor
  const [newSub, setNewSub] = useState({ businessName: "", email: "", contact: "", trade: "" });
  const [subBusy, setSubBusy] = useState(false);

  const load = useCallback(async (which) => {
    setLoading(true); setError("");
    const { ok, data, error: e } = await apiFetch(`/api/quote-tracker/unmatched?status=${which}`);
    if (!ok) { setError(e || "Could not load the Quote Inbox."); setItems([]); setLoading(false); return; }
    const rows = data?.items || [];
    setItems(rows);
    if (data?.counts) setCounts(data.counts);
    // Pre-tick: auto-open the drawer for high-confidence suggestions ready to one-click match.
    if (which === "pending") {
      const open = new Set(); const seed = {};
      for (const r of rows) {
        const s = r.suggestion;
        if (s && s.confidence >= HIGH_CONF && s.rfqId) {
          open.add(r.id);
          seed[r.id] = { jobId: s.jobId || "", rfqId: s.rfqId || "", amount: "" };
        }
      }
      setOpenIds(open); setDrafts(seed);
    } else { setOpenIds(new Set()); setDrafts({}); }
    setSelected(new Set());
    setLoading(false);
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    getSupabase()
      .from("jobs").select("id, address, rfqs(id, trade, subcontractors(business_name))")
      .order("created_at", { ascending: false })
      .then(({ data }) => setJobs(data || []));
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => `${r.from_email || ""} ${r.subject || ""}`.toLowerCase().includes(q));
  }, [items, query]);

  const rfqsForJob = useCallback((jobId) => (jobs.find((j) => j.id === jobId)?.rfqs || []), [jobs]);
  const setDraft = (id, patch) => setDrafts((d) => ({ ...d, [id]: { ...(d[id] || { jobId: "", rfqId: "", amount: "" }), ...patch } }));

  function openDrawer(row) {
    setOpenIds((s) => { const n = new Set(s); n.add(row.id); return n; });
    if (!drafts[row.id]) {
      const s = row.suggestion;
      setDraft(row.id, { jobId: s?.jobId || "", rfqId: s?.rfqId || "", amount: "" });
    }
  }
  function closeDrawer(id) { setOpenIds((s) => { const n = new Set(s); n.delete(id); return n; }); }

  // Remove a pending row and keep the tab counts in sync (pending down, destination up).
  const dropRow = (id, dest) => {
    setItems((rows) => rows.filter((r) => r.id !== id));
    setCounts((c) => ({ ...c, pending: Math.max(0, c.pending - 1), ...(dest ? { [dest]: (c[dest] || 0) + 1 } : {}) }));
  };

  async function match(id) {
    const d = drafts[id] || {};
    if (!d.rfqId) { setError("Pick a job and trade to match."); return; }
    setBusyId(id); setError("");
    const body = { unmatchedId: id, rfqId: d.rfqId };
    if (d.amount && Number(d.amount) > 0) body.quotedAmount = Number(d.amount);
    const { ok, error: e } = await apiPost("/api/unmatched-quotes/resolve", body);
    setBusyId(null);
    if (!ok) { setError(e || "Match failed."); return; }
    dropRow(id, "matched");
  }
  async function doDismiss(id) {
    setBusyId(id); setError("");
    const { ok, error: e } = await apiPost("/api/unmatched-quotes/dismiss", { id, reason: dismissReason.trim() });
    setBusyId(null);
    if (!ok) { setError(e || "Could not dismiss."); return; }
    setDismissFor(null); setDismissReason(""); dropRow(id, "dismissed");
  }
  async function markInvoice(id) {
    setBusyId(id); setError("");
    const { ok, error: e } = await apiPost("/api/unmatched-quotes/mark-invoice", { id });
    setBusyId(null);
    if (!ok) { setError(e || "Couldn't send to Finance."); return; }
    dropRow(id, "dismissed");
  }
  async function bulkDismiss() {
    const ids = [...selected];
    if (!ids.length) return;
    setBulkBusy(true); setError("");
    const { ok, error: e } = await apiPost("/api/unmatched-quotes/bulk-dismiss", { ids, reason: "" });
    setBulkBusy(false);
    if (!ok) { setError(e || "Could not dismiss."); return; }
    setItems((rows) => rows.filter((r) => !selected.has(r.id)));
    setCounts((c) => ({ ...c, pending: Math.max(0, c.pending - ids.length), dismissed: (c.dismissed || 0) + ids.length }));
    setSelected(new Set());
  }
  async function createSub(row) {
    if (!newSub.businessName.trim()) { setError("Business name required."); return; }
    setSubBusy(true); setError("");
    const { ok, error: e } = await apiPost("/api/subcontractors", newSub);
    setSubBusy(false);
    if (!ok) { setError(e || "Could not create the subcontractor."); return; }
    setItems((rows) => rows.map((r) => (r.id === row.id ? { ...r, senderKnown: true } : r)));
    setNewSubFor(null);
  }

  const toggleSel = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const TAB = (key, label, n) => (
    <button
      type="button" onClick={() => setTab(key)}
      className={`flex items-center gap-2 border-b-2 px-3.5 pb-2.5 pt-2 text-sm transition ${tab === key ? "border-primary font-semibold text-primary" : "border-transparent text-muted hover:text-ink"}`}
    >
      {label}
      <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${tab === key ? "bg-primary/10 text-primary" : "bg-hairline text-muted"}`}>{n}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Tabs + search */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-hairline">
        <div className="flex flex-wrap">
          {TAB("pending", "Pending", counts.pending)}
          {TAB("matched", "Matched", counts.matched)}
          {TAB("dismissed", "Dismissed", counts.dismissed)}
        </div>
        <label className="mb-1.5 flex min-w-[220px] items-center gap-2 rounded-full border border-hairline bg-surface px-3.5 py-1.5 text-muted shadow-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sender or subject…" className="w-full bg-transparent text-xs text-ink outline-none" />
        </label>
      </div>

      {error && <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-2 text-sm text-danger">{error}</div>}

      {/* Bulk bar */}
      {tab === "pending" && selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary">
          <span>{selected.size} selected</span>
          <span className="flex-1" />
          <button type="button" disabled={bulkBusy} onClick={bulkDismiss} className="rounded-md border border-danger/40 px-3 py-1 text-xs font-semibold text-danger disabled:opacity-50">
            {bulkBusy ? "Dismissing…" : "Dismiss selected"}
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-muted">Clear</button>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[20vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-hairline border-t-primary" /></div>
      ) : visible.length === 0 ? (
        <div className="rounded-card border border-hairline bg-surface p-10 text-center text-sm text-muted">
          {tab === "pending" ? "Nothing pending — every quote's been triaged." : tab === "matched" ? "No matched quotes yet." : "Nothing dismissed."}
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => {
            const s = r.suggestion;
            const open = openIds.has(r.id);
            const draft = drafts[r.id] || { jobId: s?.jobId || "", rfqId: s?.rfqId || "", amount: "" };
            const atts = Array.isArray(r.attachments) ? r.attachments : [];
            const first = atts[0];
            const resolved = tab !== "pending";
            return (
              <li key={r.id} className={`rounded-card border bg-surface shadow-sm transition ${open ? "border-primary" : selected.has(r.id) ? "border-primary" : "border-hairline"}`}>
                <div className="grid grid-cols-[auto_1fr] gap-3 p-4">
                  {tab === "pending"
                    ? <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)} className="mt-1 h-4 w-4 accent-primary" aria-label="Select" />
                    : <span className="w-4" />}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-bold text-ink">{r.suggestion?.subName || guessBusinessFromEmail(r.from_email) || r.from_email || "(unknown sender)"}</span>
                      <span className="text-xs text-muted">{r.from_email}</span>
                      <span className="ml-auto whitespace-nowrap text-xs text-muted tabular-nums">{fmtWhen(r.created_at)}</span>
                    </div>
                    <p className="mt-0.5 text-[13.5px] font-medium text-ink">{r.subject || "(no subject)"}</p>

                    {/* chips */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {r.senderKnown
                        ? <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">Known subcontractor</span>
                        : <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">Sender not on file</span>}
                      {resolved && r.resolution === "matched" && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">Matched</span>}
                      {resolved && r.resolution === "dismissed" && <span className="rounded-full bg-hairline px-2 py-0.5 text-[11px] font-semibold text-muted">Dismissed</span>}
                      {resolved && r.resolution === "invoice" && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">→ Finance (invoice)</span>}
                    </div>

                    {/* attachments */}
                    {first && (
                      <div className="mt-2.5 flex items-center gap-2 text-[12.5px]">
                        <span className="flex h-9 w-7 items-center justify-center rounded border border-hairline bg-page text-[9px] font-bold text-muted">PDF</span>
                        {first.url
                          ? <a href={first.url} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">{first.name || first.filename || "Quote PDF"}</a>
                          : <span className="font-semibold text-ink">{first.name || first.filename || "Quote PDF"}</span>}
                        {atts.length > 1 && <span className="text-muted">+{atts.length - 1} more</span>}
                      </div>
                    )}

                    {/* suggested match (pending only) */}
                    {tab === "pending" && s && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed border-primary/30 bg-primary/[0.04] px-3 py-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary">{s.confidence >= HIGH_CONF ? "Looks like" : "Maybe"}</span>
                        <span className="min-w-0 text-[13px] text-ink">
                          <b>{s.jobAddress || "a job"}</b>
                          {s.trade ? <><span className="mx-1.5 text-muted">›</span>{s.trade}</> : null}
                          {s.subName ? <><span className="mx-1.5 text-muted">›</span>{s.subName}</> : null}
                        </span>
                        <span className={`ml-auto flex items-center gap-2 whitespace-nowrap text-xs font-bold ${confTier(s.confidence).cls}`}>
                          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-hairline"><span className={`block h-full rounded-full ${confTier(s.confidence).bar}`} style={{ width: `${Math.round(s.confidence * 100)}%` }} /></span>
                          {Math.round(s.confidence * 100)}%
                        </span>
                        {s.reason && <span className="basis-full text-[11.5px] text-muted">{s.reason}</span>}
                      </div>
                    )}

                    {/* resolved detail */}
                    {resolved && (
                      <p className="mt-2 text-xs text-muted">
                        {r.resolution === "matched" ? "Matched to a job & trade." : (r.dismiss_reason || "Cleared.")}
                        {r.resolved_by ? ` · by ${r.resolved_by}` : ""}
                      </p>
                    )}

                    {/* actions (pending only) */}
                    {tab === "pending" && dismissFor === r.id ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-page p-2">
                        <input autoFocus value={dismissReason} onChange={(e) => setDismissReason(e.target.value)} placeholder="Reason (optional) e.g. statement, spam" className="min-w-0 flex-1 rounded-md border border-hairline bg-surface px-2 py-1 text-xs" />
                        <button type="button" disabled={busyId === r.id} onClick={() => doDismiss(r.id)} className="rounded-md bg-danger px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Dismiss</button>
                        <button type="button" onClick={() => { setDismissFor(null); setDismissReason(""); }} className="rounded-md px-2 py-1 text-xs text-muted">Cancel</button>
                      </div>
                    ) : tab === "pending" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => (open ? closeDrawer(r.id) : openDrawer(r))} className="rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-white">
                          {open ? "Hide match" : (s?.rfqId ? "Match" : "Match…")}
                        </button>
                        <button type="button" onClick={() => { setDismissFor(r.id); setDismissReason(""); }} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/5">Dismiss</button>
                        <button type="button" disabled={busyId === r.id} onClick={() => markInvoice(r.id)} className="rounded-lg border border-indigo-300 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">It&apos;s an invoice → Finance</button>
                        {!r.senderKnown && (
                          <button type="button" onClick={() => { setNewSubFor(r.id); setNewSub({ businessName: guessBusinessFromEmail(r.from_email), email: r.from_email || "", contact: "", trade: s?.trade || "" }); }} className="rounded-lg border border-primary/35 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5">＋ New subcontractor</button>
                        )}
                      </div>
                    ) : null}

                    {/* new-sub inline form */}
                    {newSubFor === r.id && (
                      <div className="mt-3 rounded-lg border border-hairline bg-page p-3">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <input value={newSub.businessName} onChange={(e) => setNewSub((n) => ({ ...n, businessName: e.target.value }))} placeholder="Business name" className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm" />
                          <input value={newSub.email} onChange={(e) => setNewSub((n) => ({ ...n, email: e.target.value }))} placeholder="Email" className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm" />
                          <input value={newSub.contact} onChange={(e) => setNewSub((n) => ({ ...n, contact: e.target.value }))} placeholder="Contact name" className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm" />
                          <input value={newSub.trade} onChange={(e) => setNewSub((n) => ({ ...n, trade: e.target.value }))} placeholder="Trade" className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm" />
                        </div>
                        <div className="mt-2 flex justify-end gap-2">
                          <button type="button" onClick={() => setNewSubFor(null)} className="rounded-md px-3 py-1 text-xs text-muted">Cancel</button>
                          <button type="button" disabled={subBusy} onClick={() => createSub(r)} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">{subBusy ? "Saving…" : "Add subcontractor"}</button>
                        </div>
                      </div>
                    )}

                    {/* inline match drawer */}
                    {tab === "pending" && open && (
                      <div className="mt-3 rounded-lg border border-primary/25 bg-primary/[0.03] p-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="block text-[11px] font-bold uppercase tracking-wide text-muted">Job
                            <select value={draft.jobId} onChange={(e) => setDraft(r.id, { jobId: e.target.value, rfqId: "" })} className="mt-1 w-full rounded-md border border-hairline bg-surface px-2 py-2 text-sm font-normal text-ink">
                              <option value="">Select job…</option>
                              {jobs.map((j) => <option key={j.id} value={j.id}>{j.address || j.id}</option>)}
                            </select>
                            {jobs.length === 0 && <span className="mt-1 block text-[11px] font-normal normal-case text-warning">Jobs didn&apos;t load — refresh the page and try again.</span>}
                          </label>
                          <label className="block text-[11px] font-bold uppercase tracking-wide text-muted">Trade / RFQ
                            <select value={draft.rfqId} onChange={(e) => setDraft(r.id, { rfqId: e.target.value })} disabled={!draft.jobId} className="mt-1 w-full rounded-md border border-hairline bg-surface px-2 py-2 text-sm font-normal text-ink disabled:opacity-50">
                              <option value="">Select trade…</option>
                              {rfqsForJob(draft.jobId).map((rf) => <option key={rf.id} value={rf.id}>{rf.trade} — {rf.subcontractors?.business_name || "sub"}</option>)}
                            </select>
                          </label>
                        </div>
                        <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-muted">Quote amount (ex GST)
                          <div className="mt-1 flex items-center rounded-md border border-hairline bg-surface">
                            <span className="pl-2.5 text-muted">$</span>
                            <input value={draft.amount} onChange={(e) => setDraft(r.id, { amount: e.target.value })} inputMode="decimal" placeholder="optional" className="w-full bg-transparent px-2 py-2 text-sm font-semibold tabular-nums text-ink outline-none" />
                          </div>
                        </label>
                        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-muted">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" className="mt-0.5 shrink-0"><path d="M20 6 9 17l-5-5" /></svg>
                          Files the PDF to the job&apos;s <b className="mx-1 font-semibold text-ink">INTERNAL / QUOTES</b> folder and records it against the RFQ, feeding Cost Intelligence.
                        </p>
                        <div className="mt-3 flex items-center gap-3">
                          <button type="button" disabled={busyId === r.id || !draft.rfqId} onClick={() => match(r.id)} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
                            {busyId === r.id ? "Matching…" : "Match quote"}
                          </button>
                          <button type="button" onClick={() => closeDrawer(r.id)} className="text-xs text-muted underline">Collapse</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

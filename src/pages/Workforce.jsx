import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../lib/authFetch.js";
import { useAuth } from "../lib/useAuth.js";

const TASK_LABELS = {
  first_fix_framing:    "First fix / framing",
  cladding:             "Cladding",
  second_fix:           "Second fix",
  outdoor_works:        "Outdoor works",
  formwork_slab_prep:   "Formwork / slab prep",
  site_labouring:       "Site labouring",
  site_cleanup:         "Site cleanup",
  supervision:          "Supervision",
  other:                "Other",
};

const TASK_OPTIONS = Object.entries(TASK_LABELS).map(([value, label]) => ({ value, label }));

const STATUS_BADGE = {
  submitted: "bg-blue-100 text-blue-700",
  approved:  "bg-green-100 text-green-700",
  rejected:  "bg-red-100 text-red-700",
  draft:     "bg-gray-100 text-gray-600",
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

// ── Approvals tab ─────────────────────────────────────────────────────────────

function ApprovalsTab({ role }) {
  const isDirector = role === "admin";
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [expanded, setExpanded] = useState(new Set());
  const [busy, setBusy] = useState(new Set());
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [toast, setToast] = useState(null);
  // Carpentry job attribution
  const [carpentryJobs, setCarpentryJobs] = useState([]);
  const [attribMap, setAttribMap] = useState({});   // { [timesheetId]: carpentryJobId | "" }
  const [attribBusy, setAttribBusy] = useState(new Set());

  const load = useCallback(() => {
    setLoading(true);
    authFetch("/api/workforce/timesheets/pending")
      .then(r => r.json())
      .then(j => {
        if (j.ok) {
          const ts = j.timesheets || [];
          setTimesheets(ts);
          // Seed attribMap with any existing carpentry_job_id values
          const m = {};
          ts.forEach(t => { m[t.id] = t.carpentry_job_id || ""; });
          setAttribMap(m);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load active carpentry jobs once for the attribution dropdown
  useEffect(() => {
    authFetch("/api/carpentry/jobs?status=active")
      .then(r => r.json())
      .then(j => { if (j.ok) setCarpentryJobs(j.jobs || []); })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === timesheets.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(timesheets.map(t => t.id)));
    }
  }

  async function assignCarpentryJob(timesheetId, carpentryJobId) {
    setAttribBusy(prev => new Set(prev).add(timesheetId));
    try {
      const res = await authFetch(`/api/workforce/timesheets/${timesheetId}/carpentry-job`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carpentryJobId: carpentryJobId || null }),
      });
      const j = await res.json();
      if (j.ok) {
        setAttribMap(prev => ({ ...prev, [timesheetId]: carpentryJobId }));
        showToast("Carpentry job assigned ✓");
      } else {
        showToast(`Could not assign: ${j.error || "Unknown error"}`, "error");
      }
    } catch {
      showToast("Connection error — please try again", "error");
    } finally {
      setAttribBusy(prev => { const n = new Set(prev); n.delete(timesheetId); return n; });
    }
  }

  async function approveOne(id) {
    setBusy(prev => new Set(prev).add(id));
    try {
      const res = await authFetch(`/api/workforce/timesheets/${id}/approve`, { method: "POST" });
      const j = await res.json();
      if (j.ok) {
        showToast("Approved ✓");
        // Optimistic removal — don't wait for re-fetch to clear the row
        setTimesheets(prev => prev.filter(ts => ts.id !== id));
        setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
      } else {
        showToast(`Could not approve: ${j.error || "Unknown error"}`, "error");
      }
    } catch (e) {
      showToast("Connection error — please try again", "error");
      console.error("approveOne failed:", e);
    } finally {
      setBusy(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  async function approveSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    const res = await authFetch("/api/workforce/timesheets/mass-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timesheet_ids: ids }),
    });
    const j = await res.json();
    if (j.ok) { showToast(`${ids.length} approved`); setSelected(new Set()); load(); }
  }

  async function rejectSelected() {
    const ids = rejectModal === "selected" ? [...selected] : [rejectModal];
    let failCount = 0;
    for (const id of ids) {
      try {
        const res = await authFetch(`/api/workforce/timesheets/${id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: rejectNotes }),
        });
        const j = await res.json();
        if (!j.ok) failCount++;
      } catch { failCount++; }
    }
    const succeeded = ids.length - failCount;
    if (succeeded > 0) showToast(`${succeeded} rejected`);
    if (failCount > 0) showToast(`${failCount} rejection(s) failed — check your connection`, "error");
    setRejectModal(null);
    setRejectNotes("");
    setSelected(new Set());
    load();
  }

  const totalOtHours = ts => (ts.timesheet_entries || []).reduce((s, e) => s + Number(e.overtime_hours || 0), 0);

  return (
    <div>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm shadow-lg text-white ${toast.type === "error" ? "bg-red-600" : "bg-green-700"}`}>{toast.msg}</div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">
          Pending Approval
          {timesheets.length > 0 && (
            <span className="ml-2 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full font-semibold">{timesheets.length}</span>
          )}
        </h2>
        {selected.size > 0 && (
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={approveSelected} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 text-white">✓ Approve {selected.size}</button>
            <button type="button" onClick={() => { setRejectModal("selected"); setRejectNotes(""); }} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white">✗ Reject {selected.size}</button>
          </div>
        )}
        {timesheets.length > 0 && selected.size === 0 && (
          <button type="button" onClick={selectAll} className="ml-auto text-xs text-primary font-medium">Select all</button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-muted py-8 text-center">Loading…</div>
      ) : timesheets.length === 0 ? (
        <div className="text-sm text-muted py-8 text-center">No pending timesheets</div>
      ) : (
        <div className="border border-hairline rounded-lg overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-hairline">
              <tr>
                <th className="w-8 px-3 py-2 text-left">
                  <input type="checkbox" checked={selected.size === timesheets.length} onChange={selectAll} className="accent-primary" />
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted">Employee</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted">Project</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted">Date</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-muted">Hours</th>
                {isDirector && <th className="px-3 py-2 text-right text-xs font-semibold text-muted">Cost</th>}
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted">OT</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {timesheets.map(ts => {
                const totalHrs = (ts.timesheet_entries || []).reduce((s, e) => s + Number(e.hours || 0), 0);
                const otHrs = totalOtHours(ts);
                const expanded2 = expanded.has(ts.id);
                const isBusy = busy.has(ts.id);
                return [
                  <tr
                    key={ts.id}
                    className={`cursor-pointer hover:bg-gray-50 ${selected.has(ts.id) ? "bg-blue-50" : ""}`}
                    onClick={() => { setExpanded(prev => { const n = new Set(prev); n.has(ts.id) ? n.delete(ts.id) : n.add(ts.id); return n; }); }}
                  >
                    <td className="px-3 py-3" onClick={e => { e.stopPropagation(); toggleSelect(ts.id); }}>
                      <input type="checkbox" checked={selected.has(ts.id)} onChange={() => toggleSelect(ts.id)} className="accent-primary" />
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-ink">{ts.employees?.name}</p>
                      <p className="text-xs text-muted">{ts.employees?.trade}</p>
                    </td>
                    <td className="px-3 py-3 text-muted">{ts.carpentry_jobs ? <span>{ts.carpentry_jobs.address || ts.carpentry_jobs.reference} <span className="text-xs">({ts.carpentry_jobs.reference})</span></span> : (ts.projects?.address || "—")}</td>
                    <td className="px-3 py-3 text-muted">{fmtDate(ts.date)}</td>
                    <td className="px-3 py-3 text-right">{totalHrs}h</td>
                    {isDirector && (
                      <td
                        className="px-3 py-3 text-right text-muted"
                        title="Base-rate estimate — excludes overtime/double-time premiums. The exact cost is calculated at approval."
                      >
                        {ts.employees?.hourly_rate
                          ? `~$${(totalHrs * Number(ts.employees.hourly_rate)).toFixed(2)}${otHrs > 0 ? "+" : ""}`
                          : "—"}
                      </td>
                    )}
                    <td className="px-3 py-3">
                      {otHrs > 0 && <span className="text-xs text-amber-600 font-medium">⚠ +{otHrs}h OT</span>}
                    </td>
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button type="button" disabled={isBusy} onClick={() => approveOne(ts.id)} className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 font-medium hover:bg-green-200 disabled:opacity-50">✓</button>
                        <button type="button" onClick={() => { setRejectModal(ts.id); setRejectNotes(""); }} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 font-medium hover:bg-red-200">✗</button>
                      </div>
                    </td>
                  </tr>,
                  expanded2 && (
                    <tr key={ts.id + "-detail"}>
                      <td colSpan={isDirector ? 8 : 7} className="px-6 py-4 bg-gray-50 border-t border-hairline">
                        {/* Carpentry job attribution */}
                        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-hairline">
                          <label className="text-xs font-semibold text-muted whitespace-nowrap">Carpentry Job</label>
                          <select
                            value={attribMap[ts.id] || ""}
                            disabled={attribBusy.has(ts.id)}
                            onChange={e => assignCarpentryJob(ts.id, e.target.value)}
                            className="border border-hairline rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white disabled:opacity-50 min-w-[200px]"
                          >
                            <option value="">— None —</option>
                            {carpentryJobs.map(cj => (
                              <option key={cj.id} value={cj.id}>{cj.reference}{cj.client_name ? ` — ${cj.client_name}` : ""}</option>
                            ))}
                          </select>
                          {attribBusy.has(ts.id) && <span className="text-xs text-muted">Saving…</span>}
                        </div>
                        {/* Task entries */}
                        <div className="space-y-1">
                          {(ts.timesheet_entries || []).map(e => (
                            <div key={e.id} className="flex items-center gap-3 text-xs text-muted">
                              <span className="font-medium text-ink">{TASK_LABELS[e.task_category] || e.task_category}</span>
                              <span>{Number(e.hours)}h</span>
                              {e.overtime_hours > 0 && <span className="text-amber-600">+{Number(e.overtime_hours)}h OT</span>}
                              {isDirector && e.cost_amount != null && <span className="text-green-700">${Number(e.cost_amount).toFixed(2)}</span>}
                              {e.notes && <span className="italic">{e.notes}</span>}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRejectModal(null)} />
          <div className="relative bg-white rounded-xl p-5 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-sm font-semibold text-ink mb-3">Rejection note</h3>
            <textarea
              placeholder="Reason for rejection (shown to worker)"
              value={rejectNotes}
              onChange={e => setRejectNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 mb-3"
            />
            <div className="flex gap-2">
              <button type="button" onClick={rejectSelected} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold">Reject</button>
              <button type="button" onClick={() => setRejectModal(null)} className="px-4 py-2 rounded-lg border border-hairline text-sm text-ink">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mass Fill tab ─────────────────────────────────────────────────────────────

function MassFillTab() {
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [carpJobs, setCarpJobs] = useState([]);
  const [site, setSite] = useState("");   // "" | "project:<id>" | "carpentry:<id>"
  const [rows, setRows] = useState([{ employee_id: "", task_category: "", hours: "8", notes: "" }]);
  const [results, setResults] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    authFetch("/api/workforce/employees").then(r => r.json()).then(j => { if (j.ok) setEmployees(j.employees || []); }).catch(() => {});
    authFetch("/api/operations/projects").then(r => r.json()).then(j => {
      if (Array.isArray(j)) setProjects(j);
      else if (j.projects) setProjects(j.projects);
    }).catch(() => {});
    authFetch("/api/carpentry/jobs?status=active").then(r => r.json()).then(j => { if (j.ok) setCarpJobs(j.jobs || []); }).catch(() => {});
  }, []);

  function addRow() {
    setRows(prev => [...prev, { employee_id: "", task_category: "", hours: "8", notes: "" }]);
  }
  function removeRow(i) { setRows(prev => prev.filter((_, idx) => idx !== i)); }
  function updateRow(i, field, val) { setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r)); }
  function duplicateRow(i) { setRows(prev => { const copy = [...prev]; copy.splice(i + 1, 0, { ...prev[i] }); return copy; }); }

  async function submit() {
    if (!date) return;
    setSubmitting(true);
    try {
      const entries = rows.filter(r => r.employee_id && r.task_category && r.hours).map(r => ({
        employee_id: r.employee_id,
        task_category: r.task_category,
        hours: parseFloat(r.hours),
        notes: r.notes || undefined,
      }));
      if (!entries.length) { alert("No valid entries"); return; }
      const payload = { date, entries };
      if (site.startsWith("project:")) payload.project_id = site.slice(8);
      else if (site.startsWith("carpentry:")) payload.carpentry_job_id = site.slice(10);
      const res = await authFetch("/api/workforce/timesheets/mass-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      setResults(j.results || []);
    } catch { /* ignore */ } finally { setSubmitting(false); }
  }

  return (
    <div>
      <div className="flex gap-3 mb-4 flex-wrap">
        <div>
          <label className="text-xs text-muted block mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Site / job</label>
          <select value={site} onChange={e => setSite(e.target.value)} className="border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">— Select site —</option>
            {projects.length > 0 && (
              <optgroup label="Projects">
                {projects.map(p => <option key={p.id} value={`project:${p.id}`}>{p.address || p.name}</option>)}
              </optgroup>
            )}
            {carpJobs.length > 0 && (
              <optgroup label="Carpentry jobs">
                {carpJobs.map(j => <option key={j.id} value={`carpentry:${j.id}`}>{j.reference}{j.client_name ? ` — ${j.client_name}` : (j.address ? ` — ${j.address}` : "")}</option>)}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      <div className="border border-hairline rounded-lg overflow-hidden bg-white mb-3">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-hairline">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">Employee</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">Task</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted w-20">Hours</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted">Notes</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-2 py-2">
                  <select value={r.employee_id} onChange={e => updateRow(i, "employee_id", e.target.value)} className="w-full border border-hairline rounded px-2 py-1.5 text-sm">
                    <option value="">Employee</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <select value={r.task_category} onChange={e => updateRow(i, "task_category", e.target.value)} className="w-full border border-hairline rounded px-2 py-1.5 text-sm">
                    <option value="">Task</option>
                    {TASK_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <input type="number" min="0.5" max="24" step="0.5" value={r.hours} onChange={e => updateRow(i, "hours", e.target.value)} className="w-full border border-hairline rounded px-2 py-1.5 text-sm" />
                </td>
                <td className="px-2 py-2">
                  <input type="text" placeholder="Notes" value={r.notes} onChange={e => updateRow(i, "notes", e.target.value)} className="w-full border border-hairline rounded px-2 py-1.5 text-sm" />
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => duplicateRow(i)} title="Duplicate this row" className="text-muted hover:text-primary text-sm">⧉</button>
                    <button type="button" onClick={() => removeRow(i)} title="Remove this row" className="text-muted hover:text-red-600 text-sm">×</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {results && (
        <div className="mb-3 space-y-1">
          {results.map((r, i) => (
            <div key={i} className={`text-xs px-2 py-1 rounded ${r.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {r.ok ? "✓" : "✗"} {employees.find(e => e.id === r.employee_id)?.name || r.employee_id} — {r.ok ? "submitted" : r.error}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={addRow} className="px-4 py-2 rounded-lg border border-hairline text-sm text-ink font-medium">+ Add row</button>
        <button type="button" onClick={submit} disabled={submitting} className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50">
          {submitting ? "Submitting…" : "Submit all entries"}
        </button>
      </div>
    </div>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────

function HistoryTab({ role }) {
  const isDirector = role === "admin";
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [empFilter, setEmpFilter] = useState("");
  const [employees, setEmployees] = useState([]);
  const [unapproving, setUnapproving] = useState(null);

  useEffect(() => {
    authFetch("/api/workforce/employees").then(r => r.json()).then(j => { if (j.ok) setEmployees(j.employees || []); }).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (empFilter) p.set("employee_id", empFilter);
    authFetch(`/api/workforce/timesheets?${p}`)
      .then(r => r.json())
      .then(j => { if (j.ok) setTimesheets(j.timesheets || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, empFilter]);

  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (empFilter) p.set("employee_id", empFilter);
    window.location.href = `/api/workforce/timesheets/export.csv?${p}`;
  }

  async function unapprove(id) {
    setUnapproving(id);
    try {
      await authFetch(`/api/workforce/timesheets/${id}/unapprove`, { method: "POST" });
      load();
    } catch { /* ignore */ } finally {
      setUnapproving(null);
    }
  }

  // Retry a Buildexact push and SURFACE the result (a re-failed sync used to be silent). `force`
  // recovers a needs_review row (orphaned/empty order) — guarded because it re-creates actuals.
  async function retrySync(ts, force) {
    if (force && !window.confirm(
      "Force re-sync re-creates the Buildexact actuals for this timesheet. Only do this AFTER you've deleted or fixed the order in Buildexact, or the labour cost may be double-booked. Continue?"
    )) return;
    try {
      const res = await authFetch(`/api/workforce/timesheets/${ts.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: !!force }),
      });
      const j = await res.json().catch(() => ({}));
      if (!j.ok) alert(j.error || "Sync failed — check Buildexact and try again.");
    } catch {
      alert("Sync failed — check your connection and try again.");
    } finally {
      load();
    }
  }

  return (
    <div>
      <div className="flex gap-3 mb-4 flex-wrap items-end">
        <div>
          <label className="text-xs text-muted block mb-1">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-hairline rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-hairline rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Employee</label>
          <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} className="border border-hairline rounded-lg px-3 py-2 text-sm">
            <option value="">All employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <button type="button" onClick={exportCsv} className="ml-auto px-4 py-2 rounded-lg border border-hairline text-sm text-ink font-medium">Export CSV</button>
      </div>

      {loading ? (
        <div className="text-sm text-muted py-8 text-center">Loading…</div>
      ) : timesheets.length === 0 ? (
        <div className="text-sm text-muted py-8 text-center">No timesheets in this range</div>
      ) : (
        <div className="border border-hairline rounded-lg overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-hairline">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted">Date</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted">Employee</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted">Project</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-muted">Hours</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted">Status</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted">Sync</th>
                {isDirector && <th className="px-3 py-2 text-left text-xs font-semibold text-muted">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {timesheets.map(ts => {
                const totalHrs = (ts.timesheet_entries || []).reduce((s, e) => s + Number(e.hours || 0), 0);
                return (
                  <tr key={ts.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-muted">{fmtDate(ts.date)}</td>
                    <td className="px-3 py-2 font-medium text-ink">{ts.employees?.name}</td>
                    <td className="px-3 py-2 text-muted">
                      {ts.carpentry_jobs
                        ? <span>{ts.carpentry_jobs.reference} <span className="text-xs">({ts.carpentry_jobs.client_name})</span></span>
                        : ts.projects?.address || "—"}
                    </td>
                    <td className="px-3 py-2 text-right">{totalHrs}h</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[ts.status] || ""}`}>{ts.status}</span>
                    </td>
                    <td className="px-3 py-2">
                      {ts.buildexact_sync_error ? (
                        <span
                          title={ts.buildexact_sync_error}
                          className="inline-flex items-center gap-1 text-xs text-red-600 font-medium cursor-help"
                        >
                          ⚠ Sync failed
                          <button type="button" className="underline ml-1" onClick={() => retrySync(ts, false)}>
                            Retry
                          </button>
                          {ts.buildexact_needs_review && (
                            <button
                              type="button"
                              className="underline ml-1 text-amber-700"
                              title="Use only after deleting/fixing the order in Buildexact"
                              onClick={() => retrySync(ts, true)}
                            >
                              Force
                            </button>
                          )}
                        </span>
                      ) : ts.buildexact_synced_at ? (
                        <span className="text-xs text-green-600">✓ Synced</span>
                      ) : ts.status === "approved" ? (
                        <span className="text-xs text-muted">Not synced</span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    {isDirector && (
                      <td className="px-3 py-2">
                        {ts.status === "approved" && (
                          <button
                            type="button"
                            disabled={unapproving === ts.id}
                            onClick={() => unapprove(ts.id)}
                            className="text-xs text-amber-700 font-medium hover:underline disabled:opacity-40"
                          >
                            {unapproving === ts.id ? "…" : "Unapprove"}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Buildexact sync control (auto / manual + on-demand push) ──────────────────

function BuildexactSyncControl() {
  const [mode, setMode] = useState(null);   // 'auto' | 'manual' | null while loading
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    authFetch("/api/workforce/settings").then(r => r.json())
      .then(j => { if (j.ok) setMode(j.settings?.buildexact_sync_mode || "auto"); })
      .catch(() => {});
  }, []);

  function flash(msg, type = "success") { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); }

  async function setSyncMode(next) {
    if (next === mode) return;
    const prev = mode;
    setMode(next);            // optimistic
    setSaving(true);
    try {
      const res = await authFetch("/api/workforce/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildexact_sync_mode: next }),
      });
      const j = await res.json();
      if (!j.ok) { setMode(prev); flash(j.error || "Could not save", "error"); }
    } catch { setMode(prev); flash("Connection error", "error"); }
    finally { setSaving(false); }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await authFetch("/api/workforce/timesheets/sync-pending", { method: "POST" });
      const j = await res.json();
      if (j.ok) flash(`Synced ${j.synced} to Buildexact${j.failed ? ` · ${j.failed} failed (see History)` : ""}`, j.failed ? "error" : "success");
      else flash(j.error || "Sync failed", "error");
    } catch { flash("Connection error", "error"); }
    finally { setSyncing(false); }
  }

  if (mode === null) return null;

  return (
    <div className="flex items-center gap-3 mb-5 p-3 rounded-lg border border-hairline bg-white flex-wrap">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm shadow-lg text-white ${toast.type === "error" ? "bg-red-600" : "bg-green-700"}`}>{toast.msg}</div>
      )}
      <span className="text-xs font-semibold text-muted uppercase tracking-wide">Buildexact sync</span>
      <div className="flex rounded-lg border border-hairline overflow-hidden text-xs">
        <button type="button" disabled={saving} onClick={() => setSyncMode("auto")}
          className={`px-3 py-1.5 font-medium ${mode === "auto" ? "bg-primary text-white" : "text-muted hover:text-ink"}`}>Auto</button>
        <button type="button" disabled={saving} onClick={() => setSyncMode("manual")}
          className={`px-3 py-1.5 font-medium ${mode === "manual" ? "bg-primary text-white" : "text-muted hover:text-ink"}`}>Manual</button>
      </div>
      <span className="text-xs text-muted">
        {mode === "auto"
          ? "Approved timesheets push to Buildexact automatically."
          : "Approved timesheets wait — push them on demand."}
      </span>
      <button type="button" disabled={syncing} onClick={syncNow}
        className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent text-white disabled:opacity-50">
        {syncing ? "Syncing…" : "⟳ Sync to Buildexact"}
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

// ── Completion Snapshot tab ───────────────────────────────────────────────────
function SnapshotTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(""); // "" = current week

  useEffect(() => {
    setLoading(true);
    const q = weekStart ? `?weekStart=${encodeURIComponent(weekStart)}` : "";
    authFetch(`/api/workforce/completion-snapshot${q}`)
      .then(r => r.json())
      .then(j => { if (j.ok) setData(j); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [weekStart]);

  if (loading) return <p className="text-sm text-muted">Loading snapshot…</p>;
  if (!data) return <p className="text-sm text-muted">Could not load the snapshot.</p>;

  const dayLabel = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric" });
  const cell = (state) => {
    if (state === "done") return <span className="inline-block w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs leading-5 text-center">✓</span>;
    if (state === "returned") return <span className="inline-block w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs leading-5 text-center" title="rejected — returned">↩</span>;
    if (state === "missing") return <span className="inline-block w-5 h-5 rounded-full bg-red-50 text-red-400 text-xs leading-5 text-center">·</span>;
    if (state === "na") return <span className="inline-block w-5 h-5 text-slate-300 text-xs leading-5 text-center" title="not a working day for this employee">–</span>;
    return <span className="inline-block w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[10px] leading-5 text-center">{state[0]}</span>;
  };

  const shiftWeek = (deltaDays) => {
    const base = data.week_start;
    const d = new Date(`${base}T12:00:00`);
    d.setDate(d.getDate() + deltaDays);
    setWeekStart(d.toISOString().slice(0, 10));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shiftWeek(-7)} className="px-2.5 py-1 rounded border border-hairline text-sm">←</button>
          <span className="text-sm font-medium text-ink">Week of {data.week_start}</span>
          <button type="button" onClick={() => shiftWeek(7)} className="px-2.5 py-1 rounded border border-hairline text-sm">→</button>
          {weekStart && <button type="button" onClick={() => setWeekStart("")} className="text-xs text-primary underline ml-1">This week</button>}
        </div>
        <span className="text-xs text-muted">{data.employees.filter(e => e.missing > 0).length} of {data.employees.length} have missing days</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2 pr-3 font-medium">Employee</th>
              {data.dates.map(d => <th key={d} className="py-2 px-2 font-medium text-center whitespace-nowrap">{dayLabel(d)}</th>)}
              <th className="py-2 pl-3 font-medium text-center">Missing</th>
            </tr>
          </thead>
          <tbody>
            {data.employees.map(e => (
              <tr key={e.id} className="border-t border-hairline">
                <td className="py-2 pr-3 text-ink">{e.name}{e.employment_type === "casual" && <span className="ml-1 text-[10px] text-muted">(casual)</span>}</td>
                {data.dates.map(d => <td key={d} className="py-2 px-2 text-center">{cell(e.days[d])}</td>)}
                <td className="py-2 pl-3 text-center">{e.missing > 0 ? <span className="font-semibold text-red-600">{e.missing}</span> : <span className="text-green-600">0</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.employees.length === 0 && <p className="text-sm text-muted mt-4">No active employees.</p>}
    </div>
  );
}

const TABS = ["Approvals", "Snapshot", "Mass Fill", "History"];

export default function Workforce() {
  const { role } = useAuth();
  const [tab, setTab] = useState("Approvals");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-ink mb-5">Workforce</h1>

      {role === "admin" && <BuildexactSyncControl />}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-hairline mb-6">
        {TABS.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${tab === t ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Approvals" && <ApprovalsTab role={role} />}
      {tab === "Snapshot" && <SnapshotTab />}
      {tab === "Mass Fill" && <MassFillTab />}
      {tab === "History" && <HistoryTab role={role} />}
    </div>
  );
}

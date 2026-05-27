import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../lib/authFetch.js";
import { useAuth } from "../lib/useAuth.js";

const TRADE_OPTIONS = ["carpenter", "labourer", "leading_hand", "supervisor", "other"];
const EMPLOYMENT_OPTIONS = ["full_time", "part_time", "casual"];

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

const EMPTY_FORM = {
  name: "", trade: "carpenter", employment_type: "full_time",
  hourly_rate: "", overtime_multiplier: "1.5", double_time_multiplier: "2.0",
  is_leading_hand: false, buildexact_employee_id: "",
};

export default function WorkforceTeam() {
  const { role } = useAuth();
  const isDirector = role === "admin";
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState(null); // null | 'new' | employee object
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [toast, setToast] = useState(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const p = showInactive ? "?include_inactive=true" : "";
    authFetch(`/api/workforce/employees${p}`)
      .then(r => r.json())
      .then(j => { if (j.ok) setEmployees(j.employees || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [showInactive]);

  useEffect(() => { load(); }, [load]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  function openNew() {
    setForm(EMPTY_FORM);
    setInviteEmail("");
    setPanel("new");
  }

  function openEdit(emp) {
    setForm({
      name: emp.name || "",
      trade: emp.trade || "carpenter",
      employment_type: emp.employment_type || "full_time",
      hourly_rate: emp.hourly_rate != null ? String(emp.hourly_rate) : "",
      overtime_multiplier: emp.overtime_multiplier != null ? String(emp.overtime_multiplier) : "1.5",
      double_time_multiplier: emp.double_time_multiplier != null ? String(emp.double_time_multiplier) : "2.0",
      is_leading_hand: !!emp.is_leading_hand,
      buildexact_employee_id: emp.buildexact_employee_id || "",
    });
    setInviteEmail("");
    setPanel(emp);
  }

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.name.trim()) { alert("Name is required"); return; }
    setSaving(true);
    try {
      const body = {
        ...form,
        hourly_rate: parseFloat(form.hourly_rate) || 0,
        overtime_multiplier: parseFloat(form.overtime_multiplier) || 1.5,
        double_time_multiplier: parseFloat(form.double_time_multiplier) || 2.0,
        buildexact_employee_id: form.buildexact_employee_id || null,
      };
      let res;
      if (panel === "new") {
        res = await authFetch("/api/workforce/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        res = await authFetch(`/api/workforce/employees/${panel.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      const j = await res.json();
      if (j.ok) { showToast("Saved"); setPanel(null); load(); }
      else { alert(j.error || "Save failed"); }
    } catch { alert("Network error"); } finally { setSaving(false); }
  }

  async function deactivate(empId) {
    await authFetch(`/api/workforce/employees/${empId}`, { method: "DELETE" });
    showToast("Deactivated");
    setConfirmDeactivate(null);
    setPanel(null);
    load();
  }

  async function sendInvite(empId) {
    if (!inviteEmail.trim()) { alert("Enter an email address"); return; }
    setInviting(true);
    try {
      const res = await authFetch(`/api/workforce/employees/${empId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail }),
      });
      const j = await res.json();
      if (j.ok) { showToast("Invite sent"); load(); }
      else { alert(j.error || "Invite failed"); }
    } catch { alert("Network error"); } finally { setInviting(false); }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {toast && <div className="fixed top-4 right-4 z-50 bg-green-700 text-white px-4 py-2 rounded-lg text-sm shadow-lg">{toast}</div>}

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-ink">Team Directory</h1>
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowInactive(v => !v)} className="text-xs text-muted font-medium underline">
            {showInactive ? "Hide inactive" : "Show inactive"}
          </button>
          {isDirector && (
            <button type="button" onClick={openNew} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold">+ Add employee</button>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        {/* Employee table */}
        <div className={`flex-1 min-w-0 border border-hairline rounded-lg overflow-hidden bg-white ${panel ? "hidden md:block" : ""}`}>
          {loading ? (
            <div className="text-sm text-muted py-8 text-center">Loading…</div>
          ) : employees.length === 0 ? (
            <div className="text-sm text-muted py-8 text-center">No employees</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-hairline">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted">Trade</th>
                  {isDirector && <th className="px-3 py-2 text-right text-xs font-semibold text-muted">Rate</th>}
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted">BX ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {employees.map(emp => (
                  <tr
                    key={emp.id}
                    className={`cursor-pointer hover:bg-gray-50 ${panel?.id === emp.id ? "bg-blue-50" : ""}`}
                    onClick={() => openEdit(emp)}
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        {emp.is_leading_hand && <span title="Leading hand">⭐</span>}
                        <span className="font-medium text-ink">{emp.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted capitalize">{emp.trade?.replace(/_/g, " ")}</td>
                    {isDirector && (
                      <td className="px-3 py-3 text-right text-muted">
                        {emp.hourly_rate != null ? `$${Number(emp.hourly_rate).toFixed(0)}/h` : "—"}
                      </td>
                    )}
                    <td className="px-3 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${emp.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {emp.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {emp.buildexact_employee_id ? (
                        <span className="text-xs text-muted">{emp.buildexact_employee_id}</span>
                      ) : (
                        <span className="text-xs text-amber-600">⚠ missing</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Edit panel */}
        {panel && (
          <div className="w-full md:w-80 shrink-0 border border-hairline rounded-lg bg-white p-4 self-start">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-ink">{panel === "new" ? "New employee" : "Edit employee"}</h2>
              <button type="button" onClick={() => setPanel(null)} className="text-muted text-lg leading-none">×</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted block mb-1">Name *</label>
                <input type="text" value={form.name} onChange={e => setField("name", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Trade</label>
                <select value={form.trade} onChange={e => setField("trade", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm">
                  {TRADE_OPTIONS.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Employment type</label>
                <select value={form.employment_type} onChange={e => setField("employment_type", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm">
                  {EMPLOYMENT_OPTIONS.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              {isDirector && (
                <div>
                  <label className="text-xs text-muted block mb-1">Hourly rate ($)</label>
                  <input type="number" min="0" step="0.5" value={form.hourly_rate} onChange={e => setField("hourly_rate", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="lh" checked={form.is_leading_hand} onChange={e => setField("is_leading_hand", e.target.checked)} className="accent-primary" />
                <label htmlFor="lh" className="text-sm text-ink">Leading hand (enables photo logging)</label>
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Buildexact Employee ID</label>
                <input type="text" value={form.buildexact_employee_id} onChange={e => setField("buildexact_employee_id", e.target.value)} className="w-full border border-hairline rounded-lg px-3 py-2 text-sm" placeholder="e.g. 12345" />
                <p className="text-[11px] text-muted mt-1">Used to sync approved timesheets to Buildexact. Find this in Buildexact under Staff settings.</p>
              </div>

              {/* Invite section */}
              {panel !== "new" && panel?.is_active && (
                <div className="pt-2 border-t border-hairline">
                  <label className="text-xs text-muted block mb-1">Worker app invite</label>
                  {panel.invite_sent_at ? (
                    <p className="text-xs text-green-700">Invite sent {fmtDate(panel.invite_sent_at)}</p>
                  ) : (
                    <div className="flex gap-1">
                      <input
                        type="email"
                        placeholder="Email address"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        className="flex-1 min-w-0 border border-hairline rounded-lg px-2 py-1.5 text-sm"
                      />
                      <button type="button" onClick={() => sendInvite(panel.id)} disabled={inviting} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50">
                        {inviting ? "…" : "Send"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Preview */}
              {panel !== "new" && (
                <button
                  type="button"
                  onClick={() => window.open(`/worker?preview=true&employeeId=${panel.id}`, "_blank")}
                  className="w-full py-2 rounded-lg border border-hairline text-sm text-ink font-medium"
                >
                  Preview worker view →
                </button>
              )}

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50">
                  {saving ? "Saving…" : "Save"}
                </button>
                {panel !== "new" && panel?.is_active && (
                  <button type="button" onClick={() => setConfirmDeactivate(panel.id)} className="px-3 py-2.5 rounded-lg bg-red-50 text-red-700 text-sm font-medium border border-red-200">
                    Deactivate
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Deactivate confirm modal */}
      {confirmDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDeactivate(null)} />
          <div className="relative bg-white rounded-xl p-5 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-sm font-semibold text-ink mb-2">Deactivate employee?</h3>
            <p className="text-sm text-muted mb-4">They will no longer appear in active lists or be able to log timesheets.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => deactivate(confirmDeactivate)} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold">Deactivate</button>
              <button type="button" onClick={() => setConfirmDeactivate(null)} className="px-4 py-2 rounded-lg border border-hairline text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

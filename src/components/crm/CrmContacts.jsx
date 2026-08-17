import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch, apiPost } from "../../lib/apiFetch.js";
import {
  CRM_STATUS, CRM_STATUS_LABELS, CRM_CONTACT_TYPES,
  CRM_CONTACT_TYPE_LABELS, CRM_CONSULTANT_TYPES,
} from "../../lib/constants.js";
import ContactDrawer from "./ContactDrawer.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";

const ACTION_ICONS = { call: "📞", email: "📧", meeting: "📅", dm: "💬", none: "—", waiting: "⏳" };

function fullName(c) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "—";
}

function typeLabel(t) {
  return CRM_CONTACT_TYPE_LABELS[t] || t;
}

function dueDateColor(d) {
  if (!d) return "";
  const today = new Date().toISOString().split("T")[0];
  if (d < today) return "text-red-600 font-semibold";
  if (d === today) return "text-amber-600 font-semibold";
  return "text-muted";
}

function formatDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
}

function NewContactModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", contactType: "prospect",
    suburb: "", status: "new", budgetRange: "", interestTimeline: "",
    notes: "",
    referredByContactId: "",
    company: "", defaultConceptFee: "", defaultDesignFee: "",
  });
  const isConsultant = CRM_CONSULTANT_TYPES.includes(form.contactType);
  const [smartListDefs, setSmartListDefs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // "Referred by" searchable picker — type a name → query the contacts list
  // (the endpoint supports ?q=). Non-sensitive: shows no fees, available to all
  // CRM users. Selecting a contact sets referredByContactId on the form (the POST
  // /api/crm/contacts endpoint already accepts it).
  const [refQuery, setRefQuery] = useState("");
  const [refResults, setRefResults] = useState([]);
  const [refSelected, setRefSelected] = useState(null);
  const [refOpen, setRefOpen] = useState(false);

  useEffect(() => {
    const term = refQuery.trim();
    if (refSelected || term.length < 2) { setRefResults([]); return; }
    let active = true;
    const t = setTimeout(async () => {
      const { ok, data } = await apiFetch(`/api/crm/contacts?q=${encodeURIComponent(term)}&limit=8`);
      if (active && ok) setRefResults(data.contacts || []);
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [refQuery, refSelected]);

  function pickReferrer(c) {
    setRefSelected(c);
    setRefOpen(false);
    setRefResults([]);
    setForm(p => ({ ...p, referredByContactId: c.id }));
  }

  function clearReferrer() {
    setRefSelected(null);
    setRefQuery("");
    setForm(p => ({ ...p, referredByContactId: "" }));
  }

  // Load smart-list definitions so we can show, live, which lists this contact will
  // auto-join based on the type/status chosen (mirrors the server smart_filter logic).
  useEffect(() => {
    apiFetch("/api/crm/lists").then(({ ok, data }) => {
      if (ok) setSmartListDefs((data.lists || []).filter(l => l.listType === "smart"));
    });
  }, []);

  // smartFilter comes back camelCase (rowToCamel deep-converts the JSONB): contactType,
  // createdThisMonth. A new contact is created "this month", so those filters match by default.
  const willJoin = smartListDefs.filter((l) => {
    const ff = l.smartFilter || {};
    if (ff.status && !ff.status.includes(form.status)) return false;
    if (ff.contactType && !ff.contactType.includes(form.contactType)) return false;
    return true;
  });

  function f(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.firstName) return setError("First name is required");
    setSaving(true); setError("");
    const { ok, data, error: e2 } = await apiPost("/api/crm/contacts", form);
    setSaving(false);
    if (!ok) return setError(e2 || "Failed to create contact");
    onCreated(data.contact);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-hairline flex items-center justify-between">
          <h2 className="font-semibold text-ink">New Contact</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl">×</button>
        </div>
        <form onSubmit={submit} className="px-6 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">First name *</label>
              <input className="input w-full" value={form.firstName} onChange={e => f("firstName", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Last name</label>
              <input className="input w-full" value={form.lastName} onChange={e => f("lastName", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Email</label>
              <input type="email" className="input w-full" value={form.email} onChange={e => f("email", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Phone</label>
              <input className="input w-full" value={form.phone} onChange={e => f("phone", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Contact type</label>
              <select className="input w-full" value={form.contactType} onChange={e => f("contactType", e.target.value)}>
                {Object.entries(CRM_CONTACT_TYPES).map(([k, v]) => (
                  <option key={k} value={v}>{typeLabel(v)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Status</label>
              <select className="input w-full" value={form.status} onChange={e => f("status", e.target.value)}>
                {Object.values(CRM_STATUS).map(v => (
                  <option key={v} value={v}>{CRM_STATUS_LABELS[v]}</option>
                ))}
              </select>
            </div>
          </div>
          {willJoin.length > 0 && (
            <p className="text-xs text-primary bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              Based on this type &amp; status, this contact will automatically appear in:{" "}
              <strong>{willJoin.map(l => l.name).join(", ")}</strong>
            </p>
          )}
          {/* Consultant / design-partner details — company + default fees. Shown for architects,
              designers, interior designers + engineers (the prospect fields don't apply to them). */}
          {isConsultant && (
            <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-3">
              <p className="text-xs font-semibold text-primary">Consultant details</p>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Company</label>
                <input className="input w-full" placeholder="e.g. Colton Architecture" value={form.company} onChange={e => f("company", e.target.value)} />
                <p className="text-[11px] text-muted mt-1">Autofills into pipeline emails (e.g. “…introduce you to Mark from <em>Colton Architecture</em>”).</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Default concept fee <span className="font-normal text-muted/70">(ex GST)</span></label>
                  <input type="number" min="0" step="1" className="input w-full" placeholder="e.g. 3500" value={form.defaultConceptFee} onChange={e => f("defaultConceptFee", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Default full-design fee <span className="font-normal text-muted/70">(ex GST)</span></label>
                  <input type="number" min="0" step="1" className="input w-full" placeholder="e.g. 18000" value={form.defaultDesignFee} onChange={e => f("defaultDesignFee", e.target.value)} />
                </div>
              </div>
              <p className="text-[11px] text-muted">Defaults only — these autofill onto a lead when you select this partner, and stay editable per deal.</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted mb-1">Suburb</label>
            <input className="input w-full" value={form.suburb} onChange={e => f("suburb", e.target.value)} />
          </div>
          {!isConsultant && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Budget range</label>
                <select className="input w-full" value={form.budgetRange} onChange={e => f("budgetRange", e.target.value)}>
                  <option value="">— select —</option>
                  <option value="under_500k">Under $500k</option>
                  <option value="500k_1m">$500k–$1M</option>
                  <option value="1m_1.5m">$1M–$1.5M</option>
                  <option value="1.5m_2m">$1.5M–$2M</option>
                  <option value="over_2m">Over $2M</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Interest timeline</label>
                <select className="input w-full" value={form.interestTimeline} onChange={e => f("interestTimeline", e.target.value)}>
                  <option value="">— select —</option>
                  <option value="now">Now</option>
                  <option value="6_months">6 months</option>
                  <option value="1_year">1 year</option>
                  <option value="2_years">2 years</option>
                  <option value="just_researching">Just researching</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted mb-1">Referred by</label>
            {refSelected ? (
              <div className="flex items-center justify-between bg-page rounded-lg px-3 py-2">
                <span className="text-sm text-ink">
                  {[refSelected.firstName, refSelected.lastName].filter(Boolean).join(" ") || refSelected.email || "—"}
                </span>
                <button type="button" onClick={clearReferrer} className="text-xs text-red-500 hover:underline">
                  Clear
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  className="input w-full"
                  placeholder="Type a name to find the referrer…"
                  value={refQuery}
                  onChange={e => { setRefQuery(e.target.value); setRefOpen(true); }}
                  onFocus={() => setRefOpen(true)}
                />
                {refOpen && refResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-surface border border-hairline rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {refResults.map(c => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => pickReferrer(c)}
                        className="block w-full text-left px-3 py-2 text-sm text-ink hover:bg-page"
                      >
                        {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "—"}
                        {c.email && <span className="text-muted text-xs ml-2">{c.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">Notes</label>
            <textarea
              className="input w-full h-20 resize-none"
              placeholder="e.g. Builder, hit insurance limit — referring new jobs; acting as consultant on those clients."
              value={form.notes}
              onChange={e => f("notes", e.target.value)}
            />
          </div>

          <p className="border-t border-hairline pt-3 text-xs text-muted">
            Marketing-email consent (Spam Act 2003) is captured when you add this contact to a mailing
            list — not at contact creation.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-ink">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-white text-sm rounded-lg font-semibold disabled:opacity-50">
              {saving ? "Saving…" : "Create Contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CrmContacts() {
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [newModal, setNewModal] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const statusFilter = searchParams.get("status") || "";
  const typeFilter = searchParams.get("contact_type") || "";
  const overdueFilter = searchParams.get("overdue") === "true";
  const q = searchParams.get("q") || "";

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("contact_type", typeFilter);
    if (overdueFilter) params.set("overdue", "true");
    if (q) params.set("q", q);

    const { ok, data } = await apiFetch(`/api/crm/contacts?${params.toString()}&limit=100`);
    if (ok) { setContacts(data.contacts || []); setTotal(data.total || 0); }
    setLoading(false);
  }, [statusFilter, typeFilter, overdueFilter, q]);

  useEffect(() => { load(); }, [load]);

  function setFilter(key, val) {
    const p = new URLSearchParams(searchParams);
    if (val) p.set(key, val);
    else p.delete(key);
    setSearchParams(p);
  }

  const filters = [
    { label: "All", active: !statusFilter && !typeFilter && !overdueFilter, onClick: () => { const p = new URLSearchParams(); setSearchParams(p); } },
    { label: "New", active: statusFilter === "new", onClick: () => setFilter("status", "new") },
    { label: "Active", active: statusFilter === "active", onClick: () => setFilter("status", "active") },
    { label: "Future", active: statusFilter === "future", onClick: () => setFilter("status", "future") },
    { label: "Past Clients", active: statusFilter === "past_client", onClick: () => setFilter("status", "past_client") },
    { label: "Referrers", active: typeFilter === "referrer", onClick: () => setFilter("contact_type", "referrer") },
    { label: "⚠ Actions Overdue", active: overdueFilter, onClick: () => setFilter("overdue", overdueFilter ? "" : "true") },
  ];

  return (
    <div className="space-y-4">
      {/* Search + new */}
      <div className="flex items-center gap-3">
        <input
          type="search"
          placeholder="Search contacts…"
          className="input flex-1 max-w-sm"
          value={q}
          onChange={e => setFilter("q", e.target.value)}
        />
        <button
          onClick={() => setNewModal(true)}
          className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90"
        >
          + New Contact
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 flex-wrap">
        {filters.map(f => (
          <button
            key={f.label}
            onClick={f.onClick}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
              f.active ? "bg-primary text-white" : "bg-page text-muted hover:bg-hairline"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="py-16 text-center text-muted text-sm">Loading…</div>
        ) : contacts.length === 0 ? (
          <div className="py-16 text-center text-muted text-sm">
            No contacts found.{" "}
            <button onClick={() => setNewModal(true)} className="text-primary hover:underline">Add one →</button>
          </div>
        ) : (
          <>
            {/* Mobile: contact cards */}
            <div className="md:hidden divide-y divide-hairline">
              {contacts.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className="w-full text-left px-4 py-3 hover:bg-page transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-ink truncate">{fullName(c)}</div>
                      {c.email && <div className="text-xs text-muted truncate">{c.email}</div>}
                    </div>
                    <StatusBadge status={c.status}>{CRM_STATUS_LABELS[c.status] || c.status}</StatusBadge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{typeLabel(c.contactType)}</span>
                    <span>Score {c.relationshipScore || 0}</span>
                    {c.nextActionType && c.nextActionType !== "none" ? (
                      <span className={dueDateColor(c.nextActionDueDate)}>
                        {ACTION_ICONS[c.nextActionType]} {c.nextActionType.charAt(0).toUpperCase() + c.nextActionType.slice(1)}
                        {c.nextActionDueDate ? ` · ${formatDate(c.nextActionDueDate)}` : ""}
                      </span>
                    ) : (
                      <span>No next action</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Desktop: table */}
            <table className="hidden md:table w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-page">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Score</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Next Action</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide hidden md:table-cell">Last Contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {contacts.map(c => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="hover:bg-page cursor-pointer"
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-ink">{fullName(c)}</div>
                    {c.email && <div className="text-xs text-muted">{c.email}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{typeLabel(c.contactType)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={c.status}>{CRM_STATUS_LABELS[c.status] || c.status}</StatusBadge>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-semibold text-muted">{c.relationshipScore || 0}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {c.nextActionType && c.nextActionType !== "none" ? (
                      <div>
                        <span className="mr-1">{ACTION_ICONS[c.nextActionType]}</span>
                        <span className={`text-xs ${dueDateColor(c.nextActionDueDate)}`}>
                          {ACTION_ICONS[c.nextActionType] !== c.nextActionType ? c.nextActionType.charAt(0).toUpperCase() + c.nextActionType.slice(1) : ""}
                          {c.nextActionDueDate ? ` · ${formatDate(c.nextActionDueDate)}` : ""}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted text-xs hidden md:table-cell">
                    {c.lastContactDate ? formatDate(c.lastContactDate) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
        {total > contacts.length && (
          <div className="px-4 py-2.5 border-t border-hairline text-xs text-muted">
            Showing {contacts.length} of {total} contacts
          </div>
        )}
      </div>

      {newModal && (
        <NewContactModal
          onClose={() => setNewModal(false)}
          onCreated={(contact) => { setNewModal(false); setSelectedId(contact.id); load(); }}
        />
      )}

      {selectedId && (
        <ContactDrawer
          contactId={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

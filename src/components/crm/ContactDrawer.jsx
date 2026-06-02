import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, apiPost, apiDelete } from "../../lib/apiFetch.js";
import {
  CRM_STATUS_LABELS, CRM_NEXT_ACTION_TYPES,
  CRM_INTERACTION_TYPES, CRM_CONSENT_SOURCES,
} from "../../lib/constants.js";

const STATUS_COLORS = {
  new:         "bg-slate-100 text-slate-700",
  active:      "bg-green-100 text-green-700",
  future:      "bg-blue-100 text-blue-700",
  client:      "bg-emerald-100 text-emerald-700",
  past_client: "bg-purple-100 text-purple-700",
  lost:        "bg-red-100 text-red-700",
};

function typeLabel(t) {
  return {
    prospect: "Prospect", referrer: "Referrer", past_client: "Past Client",
    architect: "Architect", designer: "Designer", developer: "Developer",
    agent: "Agent", supplier: "Supplier", other: "Other",
  }[t] || t;
}

function fullName(c) {
  if (!c) return "";
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "—";
}

function formatDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function RelationshipBar({ score }) {
  const color = score >= 76 ? "bg-primary" : score >= 51 ? "bg-blue-400" : score >= 21 ? "bg-amber-400" : "bg-slate-300";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-page rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-semibold text-ink">{score}</span>
    </div>
  );
}

function InteractionIcon({ type }) {
  const icons = {
    call: "📞", email: "📧", sms: "💬", dm: "💬", meeting: "📅",
    site_visit: "🏗", note: "📝", follow_up: "🔁", content_sent: "📤", email_campaign: "📨",
  };
  return <span className="text-base">{icons[type] || "·"}</span>;
}

function InteractionTypeLabel({ type }) {
  const labels = {
    call: "Call", email: "Email", sms: "SMS", dm: "DM", meeting: "Meeting",
    site_visit: "Site Visit", note: "Note", follow_up: "Follow-up",
    content_sent: "Content Sent", email_campaign: "Email Campaign",
  };
  return labels[type] || type;
}

function LogInteractionForm({ contactId, onDone, onCancel }) {
  const [form, setForm] = useState({
    interactionType: "call",
    direction: "outbound",
    summary: "",
    detail: "",
    nextActionType: "call",
    nextActionDueDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
    nextActionNotes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function f(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.summary.trim()) return setError("Summary is required");
    setSaving(true); setError("");
    const { ok, error: e2 } = await apiPost(`/api/crm/contacts/${contactId}/interact`, form);
    setSaving(false);
    if (!ok) return setError(e2 || "Failed to log");
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3 border border-hairline rounded-lg p-4 bg-page">
      <h3 className="font-semibold text-sm text-ink">Log Interaction</h3>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-muted mb-1">Type</label>
          <select className="input w-full text-sm" value={form.interactionType} onChange={e => f("interactionType", e.target.value)}>
            {Object.entries(CRM_INTERACTION_TYPES).map(([k, v]) => (
              <option key={k} value={v}>{v.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Direction</label>
          <select className="input w-full text-sm" value={form.direction} onChange={e => f("direction", e.target.value)}>
            <option value="outbound">Outbound</option>
            <option value="inbound">Inbound</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">Summary *</label>
        <input
          className="input w-full text-sm"
          placeholder="e.g. Called re: Burnside site — keen to meet this month"
          value={form.summary}
          onChange={e => f("summary", e.target.value)}
        />
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">Detail (optional)</label>
        <textarea
          className="input w-full text-sm h-16 resize-none"
          value={form.detail}
          onChange={e => f("detail", e.target.value)}
        />
      </div>
      <div className="border-t border-hairline pt-3">
        <p className="text-xs font-semibold text-muted mb-2">Next action</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-muted mb-1">Type</label>
            <select className="input w-full text-sm" value={form.nextActionType} onChange={e => f("nextActionType", e.target.value)}>
              {Object.entries(CRM_NEXT_ACTION_TYPES).map(([k, v]) => (
                <option key={k} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Due date</label>
            <input type="date" className="input w-full text-sm" value={form.nextActionDueDate} onChange={e => f("nextActionDueDate", e.target.value)} />
          </div>
        </div>
        <div className="mt-2">
          <label className="block text-xs text-muted mb-1">Notes</label>
          <input className="input w-full text-sm" placeholder="e.g. Ask about the Stirling site" value={form.nextActionNotes} onChange={e => f("nextActionNotes", e.target.value)} />
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-ink px-3 py-1.5">Cancel</button>
        <button type="submit" disabled={saving} className="px-4 py-1.5 bg-primary text-white text-sm rounded-lg font-semibold disabled:opacity-50">
          {saving ? "Saving…" : "Log Interaction"}
        </button>
      </div>
    </form>
  );
}

function AddToListModal({ contactId, onClose, onAdded }) {
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState("");
  const [consentSource, setConsentSource] = useState("in_person");
  const [consentNotes, setConsentNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/crm/lists").then(({ ok, data }) => {
      if (ok) setLists(data.lists || []);
    });
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!selectedList) return setError("Select a list");
    setSaving(true); setError("");
    const { ok, error: e2 } = await apiPost(`/api/crm/lists/${selectedList}/members`, {
      contactId, consentSource, consentNotes,
    });
    setSaving(false);
    if (!ok) return setError(e2 || "Failed to add");
    onAdded();
  }

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-ink">Add to Mailing List</h3>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl">×</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <p className="text-xs text-muted bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            Smart lists (Referrers &amp; Partners, Active Prospects, Past Clients…) fill <strong>automatically</strong> from contact type &amp; status — set those on the contact, not here. This adds to a <strong>manual</strong> list only.
          </p>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Manual list *</label>
            <select className="input w-full" value={selectedList} onChange={e => setSelectedList(e.target.value)}>
              <option value="">— select list —</option>
              {lists.filter(l => l.listType === "manual").map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            {lists.length > 0 && lists.filter(l => l.listType === "manual").length === 0 && (
              <p className="text-xs text-muted mt-1">No manual lists exist yet — create one in Marketing → Lists.</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Consent source * <span className="text-muted font-normal">(Spam Act required)</span></label>
            <select className="input w-full" value={consentSource} onChange={e => setConsentSource(e.target.value)}>
              {Object.entries(CRM_CONSENT_SOURCES).map(([k, v]) => (
                <option key={k} value={v}>{v.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Notes</label>
            <input className="input w-full" placeholder="e.g. Opted in at open day 2026-04" value={consentNotes} onChange={e => setConsentNotes(e.target.value)} />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-white text-sm rounded-lg font-semibold disabled:opacity-50">
              {saving ? "Adding…" : "Add to List"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ContactDrawer({ contactId, onClose, onSaved }) {
  const [contact, setContact] = useState(null);
  const [interactions, setInteractions] = useState([]);
  const [listMemberships, setListMemberships] = useState([]);
  const [smartLists, setSmartLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const [addListOpen, setAddListOpen] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState("");
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await apiFetch(`/api/crm/contacts/${contactId}`);
    if (ok) {
      setContact(data.contact);
      setInteractions(data.interactions || []);
      setListMemberships(data.listMemberships || []);
      setSmartLists(data.smartLists || []);
    }
    setLoading(false);
  }, [contactId]);

  useEffect(() => { load(); }, [load]);

  async function convertToLead() {
    if (!contact) return;
    setConverting(true); setConvertError("");
    const { ok, data, error: e } = await apiPost(`/api/crm/contacts/${contactId}/convert`, {
      suburb: contact.suburb,
      projectType: contact.projectType,
      budgetRange: contact.budgetRange,
    });
    setConverting(false);
    if (!ok) return setConvertError(e || "Failed to convert");
    onSaved?.();
    navigate(`/sales/${data.lead.id}`);
  }

  async function removeMembership(member) {
    await apiDelete(`/api/crm/lists/${member.listId}/members/${member.id}`);
    load();
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="bg-black/30 flex-1" onClick={onClose} />
        <div className="bg-surface w-full max-w-lg shadow-xl flex items-center justify-center">
          <p className="text-muted text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="bg-black/30 flex-1" onClick={onClose} />
        <div className="bg-surface w-full max-w-lg shadow-xl flex items-center justify-center">
          <p className="text-muted text-sm">Contact not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="bg-black/30 flex-1" onClick={onClose} />
      <div className="bg-surface w-full max-w-lg shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-hairline flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-ink">{fullName(contact)}</h2>
                <span className="text-xs text-muted">{typeLabel(contact.contactType)}</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[contact.status] || "bg-slate-100 text-slate-700"}`}>
                  {CRM_STATUS_LABELS[contact.status] || contact.status}
                </span>
              </div>
              <div className="mt-2 w-48">
                <RelationshipBar score={contact.relationshipScore || 0} />
              </div>
              {contact.email && <p className="text-sm text-muted mt-1">{contact.email}</p>}
              {contact.phone && <p className="text-sm text-muted">{contact.phone}</p>}
            </div>
            <button onClick={onClose} className="text-muted hover:text-ink text-2xl ml-4">×</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Next action */}
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Next Action</p>
            {contact.nextActionType && contact.nextActionType !== "none" ? (
              <div className="flex items-center gap-2 bg-page rounded-lg px-3 py-2">
                <span className="text-lg">
                  {{ call: "📞", email: "📧", meeting: "📅", dm: "💬", waiting: "⏳" }[contact.nextActionType] || "·"}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-ink capitalize">{contact.nextActionType}</div>
                  {contact.nextActionDueDate && (
                    <div className="text-xs text-muted">Due {formatDate(contact.nextActionDueDate)}</div>
                  )}
                  {contact.nextActionNotes && (
                    <div className="text-xs text-muted mt-0.5">{contact.nextActionNotes}</div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">No action set</p>
            )}
          </div>

          {/* Actions row */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setLogOpen(true)}
              className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90"
            >
              Log Interaction
            </button>
            {!contact.convertedLeadId && (
              <button
                onClick={convertToLead}
                disabled={converting}
                className="px-3 py-1.5 border border-primary text-primary text-xs font-semibold rounded-lg hover:bg-primary/5 disabled:opacity-50"
              >
                {converting ? "Converting…" : "Convert to Lead →"}
              </button>
            )}
            {contact.convertedLeadId && (
              <button
                onClick={() => navigate(`/sales/${contact.convertedLeadId}`)}
                className="px-3 py-1.5 border border-emerald-500 text-emerald-700 text-xs font-semibold rounded-lg hover:bg-emerald-50"
              >
                View Lead →
              </button>
            )}
            <button
              onClick={() => setAddListOpen(true)}
              className="px-3 py-1.5 border border-hairline text-muted text-xs font-semibold rounded-lg hover:bg-page"
            >
              Add to List
            </button>
          </div>
          {convertError && <p className="text-xs text-red-600">{convertError}</p>}

          {/* Log form */}
          {logOpen && (
            <LogInteractionForm
              contactId={contactId}
              onDone={() => { setLogOpen(false); load(); onSaved?.(); }}
              onCancel={() => setLogOpen(false)}
            />
          )}

          {/* Project interest */}
          {(contact.suburb || contact.budgetRange || contact.projectType || contact.interestTimeline) && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Project Interest</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {contact.suburb && (
                  <div><span className="text-muted">Suburb: </span><span className="text-ink">{contact.suburb}</span></div>
                )}
                {contact.projectType && (
                  <div><span className="text-muted">Type: </span><span className="text-ink">{contact.projectType.replace(/_/g, " ")}</span></div>
                )}
                {contact.budgetRange && (
                  <div><span className="text-muted">Budget: </span><span className="text-ink">{contact.budgetRange.replace(/_/g, " – $")}</span></div>
                )}
                {contact.interestTimeline && (
                  <div><span className="text-muted">Timeline: </span><span className="text-ink">{contact.interestTimeline.replace(/_/g, " ")}</span></div>
                )}
              </div>
            </div>
          )}

          {/* Referrer stats */}
          {["referrer", "architect", "designer", "agent"].includes(contact.contactType) && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Referrer Stats</p>
              <div className="flex gap-4 text-sm">
                <div><span className="text-muted">Referrals: </span><span className="font-semibold text-ink">{contact.referralCount || 0}</span></div>
                <div><span className="text-muted">Job value: </span><span className="font-semibold text-ink">
                  {contact.referralJobValue ? `$${(Number(contact.referralJobValue) / 1000000).toFixed(1)}M` : "—"}
                </span></div>
              </div>
            </div>
          )}

          {/* Notes */}
          {contact.notes && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Notes</p>
              <p className="text-sm text-ink bg-page rounded-lg px-3 py-2">{contact.notes}</p>
            </div>
          )}

          {/* Interaction timeline */}
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              Activity ({interactions.length})
            </p>
            {interactions.length === 0 ? (
              <p className="text-sm text-muted">No interactions yet.</p>
            ) : (
              <div className="space-y-2">
                {interactions.map(i => (
                  <div key={i.id} className="flex gap-2.5 text-sm">
                    <div className="w-5 flex-shrink-0 mt-0.5">
                      <InteractionIcon type={i.interactionType} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink"><InteractionTypeLabel type={i.interactionType} /></span>
                        {i.direction && <span className="text-xs text-muted capitalize">{i.direction}</span>}
                        <span className="text-xs text-muted ml-auto">
                          {new Date(i.createdAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-muted text-xs mt-0.5">{i.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mailing lists — smart (auto) + manual memberships */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                Mailing Lists ({smartLists.length + listMemberships.length})
              </p>
              <button onClick={() => setAddListOpen(true)} className="text-xs font-semibold text-primary hover:underline">
                + Add to list
              </button>
            </div>

            {/* Smart lists — automatic, based on contact type/status. Read-only. */}
            {smartLists.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {smartLists.map(l => (
                  <div key={l.id} className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5">
                    <span className="text-sm text-ink">{l.name}</span>
                    <span className="text-[11px] font-medium text-primary bg-white border border-blue-200 rounded-full px-2 py-0.5">
                      Auto · from {typeLabel(contact.contactType)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Manual list memberships */}
            {listMemberships.length > 0 && (
              <div className="space-y-1.5">
                {listMemberships.map(m => (
                  <div key={m.id} className="flex items-center justify-between bg-page rounded-lg px-3 py-1.5">
                    <div>
                      <span className="text-sm text-ink">{m.mailingLists?.name || "—"}</span>
                      <span className="text-xs text-muted ml-2">{m.consentSource?.replace(/_/g, " ")}</span>
                    </div>
                    {m.unsubscribedAt ? (
                      <span className="text-xs text-red-600">Unsubscribed</span>
                    ) : (
                      <button
                        onClick={() => removeMembership(m)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {smartLists.length === 0 && listMemberships.length === 0 && (
              <p className="text-sm text-muted">
                Not on any list yet. Smart lists (Referrers, Active Prospects…) fill automatically from the contact type &amp; status above — or <button onClick={() => setAddListOpen(true)} className="text-primary hover:underline">add to a manual list</button>.
              </p>
            )}
          </div>
        </div>
      </div>

      {addListOpen && (
        <AddToListModal
          contactId={contactId}
          onClose={() => setAddListOpen(false)}
          onAdded={() => { setAddListOpen(false); load(); }}
        />
      )}
    </div>
  );
}

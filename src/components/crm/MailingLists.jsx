import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, apiPost } from "../../lib/apiFetch.js";

const CONSENT_SOURCES = [
  { value: "website_form", label: "Website form" },
  { value: "in_person",    label: "In person" },
  { value: "phone",        label: "Phone" },
  { value: "referral",     label: "Referral" },
  { value: "past_client",  label: "Past client" },
  { value: "event",        label: "Event" },
  { value: "manually_added", label: "Manually added" },
];

// Parse a raw CSV string into row objects
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map(line => {
    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cols[i] || ""; });
    // Normalise common aliases
    return {
      firstName:     obj.first_name || obj.firstname || obj.name || "",
      lastName:      obj.last_name  || obj.lastname  || "",
      email:         obj.email      || "",
      phone:         obj.phone      || obj.mobile    || "",
      suburb:        obj.suburb     || obj.city      || "",
      contactType:   obj.contact_type || obj.type    || "prospect",
      consentSource: obj.consent_source || obj.consent || "",
    };
  }).filter(r => r.email);
}

function CsvImportModal({ lists, onClose, onImported }) {
  const fileRef = useRef(null);
  const [rows, setRows]               = useState([]);
  const [parseError, setParseError]   = useState("");
  const [selectedList, setSelectedList] = useState(lists[0]?.id || "");
  const [consentSource, setConsentSource] = useState("manually_added");
  const [importing, setImporting]     = useState(false);
  const [result, setResult]           = useState(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = parseCsv(ev.target.result);
        if (!parsed.length) { setParseError("No valid rows found. Make sure the CSV has an 'email' column."); return; }
        setParseError("");
        // Apply consent source to rows that don't have one
        setRows(parsed.map(r => ({ ...r, consentSource: r.consentSource || consentSource })));
      } catch {
        setParseError("Could not read the file. Make sure it is a valid CSV.");
      }
    };
    reader.readAsText(file);
  }

  async function submit() {
    if (!selectedList) return;
    if (!rows.length) return;
    const payload = rows.map(r => ({ ...r, consentSource: r.consentSource || consentSource }));
    setImporting(true);
    const { ok, data, error: e } = await apiPost(`/api/crm/lists/${selectedList}/import`, { rows: payload });
    setImporting(false);
    if (!ok) { setParseError(e || "Import failed"); return; }
    setResult(data.results);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Import CSV</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl">×</button>
        </div>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
              Import complete: <strong>{result.created}</strong> new contacts, <strong>{result.updated}</strong> updated,{" "}
              <strong>{result.added}</strong> added to list.
              {result.skipped > 0 && <> <strong>{result.skipped}</strong> skipped (missing email or consent).</>}
            </div>
            {result.errors?.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 space-y-1">
                <p className="font-semibold">Skipped rows:</p>
                {result.errors.slice(0, 5).map((e, i) => <p key={i}>{e}</p>)}
                {result.errors.length > 5 && <p>… and {result.errors.length - 5} more</p>}
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={() => { onImported(); onClose(); }} className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg">
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted">
              CSV must include an <strong>email</strong> column. Optional: first_name, last_name, phone, suburb, contact_type, consent_source.
            </p>

            <div>
              <label className="block text-xs font-medium text-muted mb-1">Target list *</label>
              <select className="input w-full" value={selectedList} onChange={e => setSelectedList(e.target.value)}>
                <option value="">— select list —</option>
                {lists.filter(l => l.listType === "manual").map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1">Consent source (applies to rows without one) *</label>
              <select className="input w-full" value={consentSource} onChange={e => setConsentSource(e.target.value)}>
                {CONSENT_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1">CSV file *</label>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-hairline rounded-lg py-6 text-sm text-muted hover:border-primary hover:text-primary transition-colors"
              >
                {rows.length > 0 ? `${rows.length} rows loaded — click to change file` : "Click to select CSV file"}
              </button>
            </div>

            {rows.length > 0 && (
              <div className="rounded-lg bg-page border border-hairline p-3 text-xs text-muted">
                <p className="font-semibold text-ink mb-1">Preview ({rows.length} rows)</p>
                {rows.slice(0, 3).map((r, i) => (
                  <p key={i}>{r.email} — {[r.firstName, r.lastName].filter(Boolean).join(" ") || "no name"}</p>
                ))}
                {rows.length > 3 && <p>… and {rows.length - 3} more</p>}
              </div>
            )}

            {parseError && (
              <p className="text-xs text-red-600">{parseError}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">Cancel</button>
              <button
                onClick={submit}
                disabled={importing || !rows.length || !selectedList}
                className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-50"
              >
                {importing ? "Importing…" : `Import ${rows.length} contacts`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "2-digit" });
}

function SendStatusBadge({ status }) {
  const map = {
    draft:     "bg-slate-100 text-slate-700",
    scheduled: "bg-blue-100 text-blue-700",
    sending:   "bg-amber-100 text-amber-700",
    sent:      "bg-green-100 text-green-700",
    failed:    "bg-red-100 text-red-700",
    cancelled: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] || "bg-slate-100 text-slate-700"}`}>
      {status}
    </span>
  );
}

function NewListModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const { ok, data } = await apiPost("/api/crm/lists", { name, description: desc, listType: "manual" });
    setSaving(false);
    if (ok) onCreated(data.list);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink">New Mailing List</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl">×</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">List name *</label>
            <input className="input w-full" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Custom List" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Description</label>
            <input className="input w-full" value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">Cancel</button>
            <button type="submit" disabled={saving || !name.trim()} className="px-4 py-2 bg-primary text-white text-sm rounded-lg font-semibold disabled:opacity-50">
              {saving ? "Creating…" : "Create List"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SendEmailModal({ list, onClose, onSent }) {
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [scheduleFor, setScheduleFor] = useState("");
  const [draftId, setDraftId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function saveDraft() {
    setSaving(true); setError("");
    const { ok, data, error: e } = await apiPost("/api/crm/sends", {
      mailingListId: list.id,
      subject,
      previewText,
      htmlBody,
      scheduledAt: scheduleFor || null,
    });
    setSaving(false);
    if (!ok) { setError(e || "Failed to save draft"); return false; }
    setDraftId(data.send.id);
    return data.send.id;
  }

  async function sendNow() {
    setError("");
    const id = draftId || await saveDraft();
    if (!id) return;
    setSending(true);
    const { ok, data, error: e } = await apiPost(`/api/crm/sends/${id}/send`, {});
    setSending(false);
    if (!ok) { setError(e || "Failed to send"); return; }
    onSent(data.sent);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-hairline flex items-center justify-between">
          <h2 className="font-semibold text-ink">Send to {list.name}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl">×</button>
        </div>
        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Subject *</label>
            <input className="input w-full" value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. 5 things to ask your builder before signing" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Preview text</label>
            <input className="input w-full" value={previewText} onChange={e => setPreviewText(e.target.value)} placeholder="Shows in inbox preview…" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Email body (HTML)</label>
            <textarea
              className="input w-full h-40 font-mono text-xs resize-none"
              value={htmlBody}
              onChange={e => setHtmlBody(e.target.value)}
              placeholder="<p>Your email content here…</p>"
            />
            <p className="text-xs text-muted mt-1">Unsubscribe footer and Blue Leaf branding are added automatically.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Schedule (leave blank to send now)</label>
            <input type="datetime-local" className="input w-full" value={scheduleFor} onChange={e => setScheduleFor(e.target.value)} />
          </div>

          <div className="bg-page rounded-lg p-3 text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              <span className="text-muted">{list.activeMembers} active recipients</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              <span className="text-muted">Unsubscribe link included (Spam Act compliant)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              <span className="text-muted">Sender: Blue Leaf Building</span>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-hairline flex justify-between items-center">
          <button onClick={onClose} className="text-sm text-muted hover:text-ink">Cancel</button>
          <div className="flex gap-2">
            <button
              onClick={saveDraft}
              disabled={saving || !subject.trim()}
              className="px-4 py-2 border border-hairline text-sm rounded-lg font-semibold text-muted hover:bg-page disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Draft"}
            </button>
            <button
              onClick={sendNow}
              disabled={sending || !subject.trim() || !htmlBody.trim()}
              className="px-4 py-2 bg-primary text-white text-sm rounded-lg font-semibold disabled:opacity-50"
            >
              {sending ? "Sending…" : scheduleFor ? `Schedule Send →` : `Send to ${list.activeMembers} →`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ListDetail({ list, onBack }) {
  const [members, setMembers] = useState([]);
  const [sends, setSends] = useState([]);
  const [activeTab, setActiveTab] = useState("members");
  const [loading, setLoading] = useState(true);
  const [sendModal, setSendModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [membersRes, sendsRes] = await Promise.all([
      apiFetch(`/api/crm/lists/${list.id}`),
      apiFetch(`/api/crm/lists/${list.id}/sends`),
    ]);
    if (membersRes.ok) setMembers(membersRes.data.members || []);
    if (sendsRes.ok) setSends(sendsRes.data.sends || []);
    setLoading(false);
  }, [list.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-primary hover:underline">← Back to lists</button>
        <h2 className="font-semibold text-ink text-lg">{list.name}</h2>
        {list.listType === "smart" && (
          <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-semibold">Smart</span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {["members", "sends"].map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${
                activeTab === t ? "bg-primary text-white" : "text-muted hover:bg-page"
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSendModal(true)}
          className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90"
        >
          Send Email →
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted text-sm">Loading…</div>
      ) : activeTab === "members" ? (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-page">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Consent</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {members.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted text-sm">No members</td></tr>
              ) : members.map(m => {
                const c = list.listType === "smart" ? m : m.crmContacts;
                const name = c ? [c.firstName, c.lastName].filter(Boolean).join(" ") || "—" : "—";
                return (
                  <tr key={m.id} className="hover:bg-page">
                    <td className="px-4 py-2.5 font-medium text-ink">{name}</td>
                    <td className="px-4 py-2.5 text-muted">{c?.email || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {m.consentSource?.replace(/_/g, " ") || "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {m.unsubscribedAt ? (
                        <span className="text-xs text-red-600">Unsubscribed {formatDate(m.unsubscribedAt)}</span>
                      ) : (
                        <span className="text-xs text-green-700 font-semibold">Active</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-page">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Subject</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Sent</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Delivered</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Opened</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {sends.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted text-sm">No sends yet</td></tr>
              ) : sends.map(s => (
                <tr key={s.id} className="hover:bg-page">
                  <td className="px-4 py-2.5 font-medium text-ink">{s.subject}</td>
                  <td className="px-4 py-2.5"><SendStatusBadge status={s.status} /></td>
                  <td className="px-4 py-2.5 text-muted text-xs">{formatDate(s.sentAt)}</td>
                  <td className="px-4 py-2.5 text-ink text-xs">{s.deliveredCount || 0} / {s.totalRecipients || 0}</td>
                  <td className="px-4 py-2.5 text-ink text-xs">
                    {s.openedCount || 0}
                    {s.deliveredCount > 0 && (
                      <span className="text-muted ml-1">
                        ({Math.round((s.openedCount || 0) / s.deliveredCount * 100)}%)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sendModal && (
        <SendEmailModal
          list={list}
          onClose={() => setSendModal(false)}
          onSent={() => { setSendModal(false); load(); }}
        />
      )}
    </div>
  );
}

export default function MailingLists() {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newModal, setNewModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await apiFetch("/api/crm/lists");
    if (ok) setLists(data.lists || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (selected) {
    return (
      <ListDetail
        list={selected}
        onBack={() => { setSelected(null); load(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Marketing</p>
          <h1 className="text-3xl font-semibold tracking-tight text-primary">Mailing Lists</h1>
          <p className="mt-1 text-sm text-muted">All Australian Spam Act 2003 compliant.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportModal(true)}
            className="px-4 py-2 bg-white border border-hairline text-ink text-sm font-semibold rounded-lg hover:bg-page"
          >
            Import CSV
          </button>
          <button
            onClick={() => setNewModal(true)}
            className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90"
          >
            + New List
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted text-sm">Loading…</div>
      ) : (
        <div className="space-y-2">
          {lists.map(l => (
            <div
              key={l.id}
              className="card flex items-center justify-between hover:shadow-md cursor-pointer transition-shadow"
              onClick={() => setSelected(l)}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{l.name}</span>
                  {l.listType === "smart" && (
                    <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-semibold">Smart</span>
                  )}
                </div>
                {l.description && <p className="text-xs text-muted mt-0.5">{l.description}</p>}
              </div>
              <div className="flex items-center gap-6 text-sm mr-4">
                <div className="text-center">
                  <div className="font-semibold text-ink">{l.activeMembers}</div>
                  <div className="text-xs text-muted">active</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-ink">{l.totalMembers}</div>
                  <div className="text-xs text-muted">total</div>
                </div>
              </div>
              <button className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90">
                Send →
              </button>
            </div>
          ))}
        </div>
      )}

      {newModal && (
        <NewListModal
          onClose={() => setNewModal(false)}
          onCreated={(list) => { setNewModal(false); load(); setSelected(list); }}
        />
      )}

      {importModal && (
        <CsvImportModal
          lists={lists}
          onClose={() => setImportModal(false)}
          onImported={() => { load(); }}
        />
      )}
    </div>
  );
}

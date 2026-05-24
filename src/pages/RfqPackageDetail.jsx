import { authFetch } from "../lib/authFetch.js";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSupabase } from "../lib/supabaseClient.js";
import { generateMissingPackageScopes } from "../lib/rfqTradeIntelligence.js";

// ── Constants ────────────────────────────────────────────────────────────────

const RECIPIENT_STATUSES = [
  "not_sent", "sent", "followed_up", "received", "clarification_required",
  "accepted", "declined", "no_quote"
];

const STATUS_LABEL = {
  not_sent: "Not sent",
  sent: "Sent",
  followed_up: "Followed up",
  received: "Quote received",
  clarification_required: "Clarification req.",
  accepted: "Accepted",
  declined: "Declined",
  no_quote: "No quote",
};

const STATUS_COLOR = {
  not_sent: "bg-slate-100 text-slate-500",
  sent: "bg-blue-50 text-blue-700",
  followed_up: "bg-amber-50 text-amber-700",
  received: "bg-green-50 text-green-700",
  clarification_required: "bg-orange-50 text-orange-700",
  accepted: "bg-emerald-50 text-emerald-700",
  declined: "bg-red-50 text-red-500",
  no_quote: "bg-slate-50 text-slate-400",
};

const SCOPE_STATUS_COLOR = {
  draft: "bg-slate-100 text-slate-500",
  ready: "bg-indigo-50 text-indigo-600",
  sent: "bg-blue-50 text-blue-700",
  followed_up: "bg-amber-50 text-amber-700",
  received: "bg-green-50 text-green-700",
  clarification_required: "bg-orange-50 text-orange-700",
  accepted: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-50 text-red-500",
  no_quote: "bg-slate-50 text-slate-400",
};

// ── Small helpers ────────────────────────────────────────────────────────────

function Badge({ label, colorClass }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colorClass}`}>
      {label}
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function fmtCurrency(n) {
  if (n == null || n === "") return "—";
  return `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── Scope editor modal ───────────────────────────────────────────────────────

function ScopeEditorModal({ scope, onClose, onSave }) {
  const [bullets, setBullets] = useState((scope.scope_bullets || []).join("\n"));
  const [exclusions, setExclusions] = useState((scope.exclusions || []).join("\n"));
  const [questions, setQuestions] = useState((scope.questions || []).join("\n"));
  const [contractorNotes, setContractorNotes] = useState(scope.contractor_notes || "");
  const [internalNotes, setInternalNotes] = useState(scope.internal_notes || "");
  const [dueDate, setDueDate] = useState(scope.due_date || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({
      scope_bullets: bullets.split("\n").map((l) => l.trim()).filter(Boolean),
      exclusions: exclusions.split("\n").map((l) => l.trim()).filter(Boolean),
      questions: questions.split("\n").map((l) => l.trim()).filter(Boolean),
      contractor_notes: contractorNotes,
      internal_notes: internalNotes,
      due_date: dueDate,
    });
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-2xl rounded-card border border-hairline bg-surface shadow-xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="section-title">Edit scope — {scope.trade_label}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="section-label block mb-1">Scope (one bullet per line)</label>
            <textarea
              rows={6}
              value={bullets}
              onChange={(e) => setBullets(e.target.value)}
              className="w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="section-label block mb-1">Exclusions</label>
            <textarea
              rows={3}
              value={exclusions}
              onChange={(e) => setExclusions(e.target.value)}
              className="w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="section-label block mb-1">Questions for contractor</label>
            <textarea
              rows={3}
              value={questions}
              onChange={(e) => setQuestions(e.target.value)}
              className="w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="section-label block mb-1">Contractor-visible notes</label>
              <textarea
                rows={3}
                value={contractorNotes}
                onChange={(e) => setContractorNotes(e.target.value)}
                className="w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm focus:border-primary focus:outline-none"
                placeholder="Included in the email to contractor…"
              />
            </div>
            <div>
              <label className="section-label block mb-1">Internal notes only</label>
              <textarea
                rows={3}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                className="w-full rounded-lg border border-hairline bg-amber-50 border-amber-200 px-3 py-2 text-sm focus:outline-none"
                placeholder="Not sent to contractor…"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="section-label block mb-1">Quote due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="rounded-lg border border-hairline bg-page px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-hairline px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold text-muted hover:text-ink">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Saving…" : "Save scope"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Send additional RFQ modal ────────────────────────────────────────────────

function SendRfqModal({ scope, pkg, onClose, onSent }) {
  const [subcontractors, setSubcontractors] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [manualEmail, setManualEmail] = useState("");
  const [manualName, setManualName] = useState("");
  const [emailSubject, setEmailSubject] = useState(`RFQ — ${scope.trade_label} at ${pkg.project_address}`);
  const [emailBody, setEmailBody] = useState(buildDefaultBody(scope, pkg));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadSubs() {
      const sb = getSupabase();
      if (!sb) return;
      const { data } = await sb.from("subcontractors").select("id, business_name, email, contact, trades").order("business_name");
      setSubcontractors(data || []);
    }
    loadSubs();
  }, []);

  function buildDefaultBody(s, p) {
    const bullets = (s.scope_bullets || []).map((b) => `- ${b}`).join("\n");
    const exclusions = (s.exclusions || []).length ? `\nExclusions:\n${s.exclusions.map((e) => `- ${e}`).join("\n")}` : "";
    const questions = (s.questions || []).length ? `\nPlease clarify:\n${s.questions.map((q) => `- ${q}`).join("\n")}` : "";
    const due = s.due_date || p.tender_deadline || "";
    return [
      `Hi,`,
      ``,
      `Please find below the scope for ${s.trade_label} at ${p.project_address}.`,
      ``,
      `Scope of works:`,
      bullets,
      exclusions,
      questions,
      ``,
      due ? `Please submit your quote by ${due}.` : "",
      ``,
      s.contractor_notes || "",
      ``,
      "Please include all labour, materials, cartage, and equipment unless specifically excluded.",
      ``,
      "Thanks,",
      "Sam Morris",
      "Blue Leaf Building"
    ].filter((l) => l !== "").join("\n").trim();
  }

  const filtered = subcontractors.filter((s) =>
    s.business_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase())
  );

  function toggleSub(sub) {
    setSelected((prev) => prev.find((s) => s.id === sub.id) ? prev.filter((s) => s.id !== sub.id) : [...prev, sub]);
  }

  function addManual() {
    if (!manualEmail.trim()) return;
    setSelected((prev) => [...prev, { id: `manual-${Date.now()}`, business_name: manualName || manualEmail, email: manualEmail }]);
    setManualEmail("");
    setManualName("");
  }

  async function handleSend() {
    if (!selected.length) { setError("Select at least one recipient."); return; }
    setSending(true);
    setError(null);
    try {
      const res = await authFetch(`/api/rfq-packages/${pkg.id}/scopes/${scope.trade_id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: selected.map((s) => ({
            subcontractor_id: s.id?.startsWith?.("manual") ? null : s.id,
            business_name: s.business_name,
            email: s.email
          })),
          email_subject: emailSubject,
          email_body: emailBody,
          due_date: scope.due_date || pkg.tender_deadline || ""
        })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Send failed");
      onSent(j);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-3xl rounded-card border border-hairline bg-surface shadow-xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="section-title">Send additional RFQ — {scope.trade_label}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">×</button>
        </div>
        <div className="flex flex-1 min-h-0 divide-x divide-hairline">
          {/* Left: recipient selection */}
          <div className="w-72 shrink-0 flex flex-col">
            <div className="p-4 border-b border-hairline">
              <p className="section-label mb-2">Select recipients</p>
              <input
                type="text"
                placeholder="Search subcontractors…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {filtered.map((sub) => {
                const isSelected = !!selected.find((s) => s.id === sub.id);
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => toggleSub(sub)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-page"}`}
                  >
                    <div className="font-medium text-ink leading-tight">{sub.business_name}</div>
                    <div className="text-[11px] text-muted truncate">{sub.email}</div>
                  </button>
                );
              })}
            </div>
            <div className="border-t border-hairline p-3 space-y-2">
              <p className="section-label">Or add manually</p>
              <input
                type="text"
                placeholder="Business name"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                className="w-full rounded border border-hairline bg-page px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
              />
              <div className="flex gap-1">
                <input
                  type="email"
                  placeholder="Email address"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  className="flex-1 rounded border border-hairline bg-page px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                />
                <button type="button" onClick={addManual} className="rounded border border-hairline px-2 py-1.5 text-xs font-semibold hover:bg-page">Add</button>
              </div>
            </div>
          </div>

          {/* Right: email compose */}
          <div className="flex-1 flex flex-col p-5 gap-3 overflow-y-auto">
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((s) => (
                  <span key={s.id} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {s.business_name}
                    <button type="button" onClick={() => setSelected((p) => p.filter((x) => x.id !== s.id))} className="text-primary/60 hover:text-primary leading-none">×</button>
                  </span>
                ))}
              </div>
            )}
            <div>
              <label className="section-label block mb-1">Subject</label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex-1 min-h-0">
              <label className="section-label block mb-1">Email body</label>
              <textarea
                rows={16}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                className="w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none h-full"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-hairline px-5 py-4">
          {error && <span className="text-sm text-danger">{error}</span>}
          {!error && <span className="text-sm text-muted">{selected.length} recipient{selected.length !== 1 ? "s" : ""} selected</span>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold text-muted hover:text-ink">Cancel</button>
            <button type="button" onClick={handleSend} disabled={sending || !selected.length} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
              {sending ? "Sending…" : `Send to ${selected.length || "…"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Quote update modal ───────────────────────────────────────────────────────

function QuoteUpdateModal({ recipient, onClose, onSave }) {
  const [status, setStatus] = useState(recipient.status || "sent");
  const [amount, setAmount] = useState(recipient.quote_amount ?? "");
  const [exclusions, setExclusions] = useState(recipient.quote_exclusions || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({ status, quote_amount: amount === "" ? null : Number(amount), quote_exclusions: exclusions });
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-sm rounded-card border border-hairline bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="section-title">Update quote — {recipient.business_name}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="section-label block mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              {RECIPIENT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="section-label block mb-1">Quote amount ($)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 18400"
              className="w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="section-label block mb-1">Exclusions noted</label>
            <input
              type="text"
              value={exclusions}
              onChange={(e) => setExclusions(e.target.value)}
              placeholder="e.g. rock excavation, dewatering"
              className="w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-hairline px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold text-muted hover:text-ink">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Addendum modal ───────────────────────────────────────────────────────────

function AddendumModal({ pkg, scopes, onClose, onAdded }) {
  const [name, setName] = useState("");
  const [affected, setAffected] = useState([]);
  const [sendEmails, setSendEmails] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleAdd() {
    if (!name.trim()) { setError("Name required"); return; }
    setSaving(true);
    try {
      const res = await authFetch(`/api/rfq-packages/${pkg.id}/addenda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, affected_trades: affected, send_emails: sendEmails })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      onAdded(j);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md rounded-card border border-hairline bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="section-title">Add addendum</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="section-label block mb-1">Addendum name / description</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Revised structural drawings — 20 May 2026"
              className="w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="section-label block mb-2">Affected trades</label>
            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
              {(scopes || []).map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded-lg border border-hairline px-3 py-2 cursor-pointer hover:bg-page text-sm">
                  <input
                    type="checkbox"
                    checked={affected.includes(s.trade_id)}
                    onChange={(e) => setAffected((prev) => e.target.checked ? [...prev, s.trade_id] : prev.filter((t) => t !== s.trade_id))}
                    className="accent-primary"
                  />
                  {s.trade_label}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={sendEmails} onChange={(e) => setSendEmails(e.target.checked)} className="accent-primary" />
            <span className="text-sm text-ink">Notify affected trade recipients by email</span>
          </label>
          {error && <div className="text-sm text-danger">{error}</div>}
        </div>
        <div className="flex justify-end gap-3 border-t border-hairline px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold text-muted hover:text-ink">Cancel</button>
          <button type="button" onClick={handleAdd} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Saving…" : "Add addendum"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Trade card ───────────────────────────────────────────────────────────────

function TradeCard({ scope, pkg, onPatch, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [sendModal, setSendModal] = useState(false);
  const [quoteModal, setQuoteModal] = useState(null);
  const [followUpBusy, setFollowUpBusy] = useState(false);

  const recipients = scope.rfq_recipients || [];
  const sent = recipients.filter((r) => ["sent", "followed_up", "received", "accepted"].includes(r.status));
  const received = recipients.filter((r) => ["received", "accepted"].includes(r.status));
  const lowestQuote = received.reduce((min, r) => (r.quote_amount && (!min || r.quote_amount < min) ? r.quote_amount : min), null);

  async function handleFollowUp(recipientIds) {
    setFollowUpBusy(true);
    try {
      await authFetch(`/api/rfq-packages/${pkg.id}/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_ids: recipientIds })
      });
      onRefresh();
    } finally {
      setFollowUpBusy(false);
    }
  }

  async function handleUpdateRecipient(recipientId, patch) {
    await authFetch(`/api/rfq-packages/${pkg.id}/recipients/${recipientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    onRefresh();
  }

  async function handleDeleteRecipient(recipientId) {
    if (!confirm("Remove this recipient?")) return;
    await authFetch(`/api/rfq-packages/${pkg.id}/recipients/${recipientId}`, { method: "DELETE" });
    onRefresh();
  }

  const pendingIds = recipients.filter((r) => ["sent", "followed_up"].includes(r.status)).map((r) => r.id);

  return (
    <>
      <div className="rounded-card border border-hairline bg-surface overflow-hidden">
        {/* Card header */}
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-page transition"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="flex-1 font-semibold text-sm text-ink">{scope.trade_label}</span>
          <Badge label={scope.status} colorClass={SCOPE_STATUS_COLOR[scope.status] || "bg-slate-100 text-slate-500"} />
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>{recipients.length} recipient{recipients.length !== 1 ? "s" : ""}</span>
            {sent.length > 0 && <span className="text-blue-600">{sent.length} sent</span>}
            {received.length > 0 && <span className="text-green-600">{received.length} quote{received.length !== 1 ? "s" : ""}</span>}
            {lowestQuote && <span className="font-semibold text-ink">{fmtCurrency(lowestQuote)} low</span>}
          </div>
          <span className="text-muted text-xs">{expanded ? "▲" : "▼"}</span>
        </div>

        {/* Expanded body */}
        {expanded && (
          <div className="border-t border-hairline">
            {/* Scope bullets */}
            {(scope.scope_bullets || []).length > 0 && (
              <div className="px-4 py-3 border-b border-hairline">
                <p className="section-label mb-2">Scope</p>
                <ul className="space-y-1">
                  {scope.scope_bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-ink">
                      <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full bg-primary/50" />
                      {b}
                    </li>
                  ))}
                </ul>
                {scope.exclusions?.length > 0 && (
                  <div className="mt-2">
                    <p className="section-label mb-1">Exclusions</p>
                    <ul className="space-y-0.5">
                      {scope.exclusions.map((e, i) => <li key={i} className="text-xs text-muted">✕ {e}</li>)}
                    </ul>
                  </div>
                )}
                {scope.internal_notes && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <span className="font-semibold">Internal note:</span> {scope.internal_notes}
                  </div>
                )}
              </div>
            )}

            {/* Recipients */}
            <div className="px-4 py-3 border-b border-hairline">
              <div className="flex items-center justify-between mb-2">
                <p className="section-label">Recipients</p>
                {pendingIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleFollowUp(pendingIds)}
                    disabled={followUpBusy}
                    className="text-xs font-semibold text-amber-700 hover:text-amber-800 border border-amber-300 rounded px-2 py-1 disabled:opacity-50"
                  >
                    {followUpBusy ? "Sending…" : `Follow up all (${pendingIds.length})`}
                  </button>
                )}
              </div>
              {recipients.length === 0 ? (
                <p className="text-sm text-muted italic">No recipients yet.</p>
              ) : (
                <div className="space-y-2">
                  {recipients.map((r) => (
                    <div key={r.id} className="flex items-start gap-2 rounded-lg border border-hairline bg-page px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-ink">{r.business_name}</span>
                          <Badge label={STATUS_LABEL[r.status] || r.status} colorClass={STATUS_COLOR[r.status] || "bg-slate-100 text-slate-500"} />
                          {r.quote_amount && <span className="text-xs font-semibold text-green-700">{fmtCurrency(r.quote_amount)}</span>}
                        </div>
                        <div className="text-[11px] text-muted mt-0.5 space-y-0.5">
                          <div>{r.email}</div>
                          {r.sent_at && <div>Sent {fmtDate(r.sent_at)}</div>}
                          {r.quote_exclusions && <div className="text-amber-700">Excl: {r.quote_exclusions}</div>}
                          {r.follow_up_sent_at && <div>Followed up {fmtDate(r.follow_up_sent_at)}</div>}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setQuoteModal(r)}
                          className="text-[10px] font-semibold rounded border border-hairline px-2 py-1 hover:bg-surface"
                        >
                          Update
                        </button>
                        {["sent", "followed_up"].includes(r.status) && (
                          <button
                            type="button"
                            onClick={() => handleFollowUp([r.id])}
                            className="text-[10px] font-semibold rounded border border-amber-200 px-2 py-1 text-amber-700 hover:bg-amber-50"
                          >
                            Follow up
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteRecipient(r.id)}
                          className="text-[10px] font-semibold rounded border border-hairline px-2 py-1 text-muted hover:text-danger"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quote comparison */}
            {received.length > 1 && (
              <div className="px-4 py-3 border-b border-hairline">
                <p className="section-label mb-2">Quote comparison</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted">
                      <th className="text-left pb-1 font-semibold">Contractor</th>
                      <th className="text-right pb-1 font-semibold">Price</th>
                      <th className="text-left pb-1 font-semibold pl-4">Exclusions</th>
                      <th className="text-right pb-1 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {recipients.filter((r) => ["received", "accepted", "declined"].includes(r.status)).sort((a, b) => (a.quote_amount || 99999999) - (b.quote_amount || 99999999)).map((r) => (
                      <tr key={r.id}>
                        <td className="py-1.5 font-medium text-ink">{r.business_name}</td>
                        <td className="py-1.5 text-right font-semibold text-ink">{fmtCurrency(r.quote_amount)}</td>
                        <td className="py-1.5 pl-4 text-muted">{r.quote_exclusions || "—"}</td>
                        <td className="py-1.5 text-right">
                          <Badge label={STATUS_LABEL[r.status] || r.status} colorClass={STATUS_COLOR[r.status] || ""} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 px-4 py-3">
              <button type="button" onClick={() => setEditModal(true)} className="text-xs font-semibold rounded-lg border border-hairline px-3 py-1.5 hover:bg-page">Edit scope</button>
              <button type="button" onClick={() => setSendModal(true)} className="text-xs font-semibold rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-primary hover:bg-primary/10">+ Send additional RFQ</button>
              {scope.due_date && <span className="text-xs text-muted self-center">Due: {scope.due_date}</span>}
            </div>
          </div>
        )}
      </div>

      {editModal && (
        <ScopeEditorModal
          scope={scope}
          onClose={() => setEditModal(false)}
          onSave={(patch) => onPatch(scope.trade_id, patch)}
        />
      )}
      {sendModal && (
        <SendRfqModal
          scope={scope}
          pkg={pkg}
          onClose={() => setSendModal(false)}
          onSent={onRefresh}
        />
      )}
      {quoteModal && (
        <QuoteUpdateModal
          recipient={quoteModal}
          onClose={() => setQuoteModal(null)}
          onSave={(patch) => handleUpdateRecipient(quoteModal.id, patch)}
        />
      )}
    </>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function RfqPackageDetail() {
  const { packageId } = useParams();
  const navigate = useNavigate();
  const [pkg, setPkg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addendumModal, setAddendumModal] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaDraft, setMetaDraft] = useState({});
  const [addTradeId, setAddTradeId] = useState("");
  const [addingTrade, setAddingTrade] = useState(false);
  const [generatingMissing, setGeneratingMissing] = useState(false);
  const [banner, setBanner] = useState(null);
  const [tradeMaster, setTradeMaster] = useState([]);

  async function load() {
    setLoading(true);
    try {
      const res = await authFetch(`/api/rfq-packages/${packageId}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Load failed");
      setPkg(j.package);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [packageId]);

  useEffect(() => {
    fetch("/api/trade-master")
      .then((r) => r.json())
      .then((j) => {
        const list = j.trades || [];
        setTradeMaster(list.filter((t) => t.quote_required !== false && t.is_active !== false));
      })
      .catch(() => {});
  }, []);

  async function patchScope(tradeId, patch) {
    await authFetch(`/api/rfq-packages/${packageId}/scopes/${tradeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    await load();
  }

  async function saveMeta() {
    setSavingMeta(true);
    try {
      await authFetch(`/api/rfq-packages/${packageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metaDraft)
      });
      setEditingMeta(false);
      await load();
    } finally {
      setSavingMeta(false);
    }
  }

  async function createSuggestedTrade(tradeId, tradeLabel) {
    setAddingTrade(true);
    try {
      await authFetch(`/api/rfq-packages/${packageId}/scopes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trade_id: tradeId, trade_label: tradeLabel })
      });
      setBanner({ type: "success", text: `${tradeLabel} added — edit scope and send when ready.` });
      await load();
    } finally {
      setAddingTrade(false);
    }
  }

  async function archivePackage() {
    if (!confirm("Archive this RFQ package?")) return;
    await authFetch(`/api/rfq-packages/${packageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" })
    });
    navigate("/tender-manager/rfq-packages");
  }

  if (loading) return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-hairline border-t-primary" />
    </div>
  );

  if (error || !pkg) return (
    <div className="rounded-card border border-danger/30 bg-danger/5 p-6 text-sm text-danger">{error || "Package not found"}</div>
  );

  const scopes = (pkg.rfq_trade_scopes || []).sort((a, b) => a.trade_label.localeCompare(b.trade_label));
  const addenda = (pkg.rfq_addenda || []).sort((a, b) => a.number - b.number);
  const suggested = pkg.suggested_trades || [];
  const tradeCoverage = pkg.trade_coverage || {};
  const coveragePct = tradeCoverage.percent ?? pkg.coverage_score ?? 0;
  const coveredTrades = tradeCoverage.covered || [];
  const missingTrades =
    (tradeCoverage.missing?.length ? tradeCoverage.missing : pkg.missing_trade_analysis) || [];
  const missingToGenerate = missingTrades.filter((m) =>
    (m.actions || []).includes("generate_rfq")
  );

  const totalRecipients = scopes.reduce((n, s) => n + (s.rfq_recipients?.length || 0), 0);
  const totalSent = scopes.reduce((n, s) => n + (s.rfq_recipients || []).filter((r) => ["sent", "followed_up", "received", "accepted"].includes(r.status)).length, 0);
  const totalReceived = scopes.reduce((n, s) => n + (s.rfq_recipients || []).filter((r) => ["received", "accepted"].includes(r.status)).length, 0);
  const totalPending = totalSent - totalReceived;

  const followUpCandidates = scopes.flatMap((s) =>
    (s.rfq_recipients || []).filter((r) => {
      if (!["sent", "followed_up"].includes(r.status)) return false;
      if (!r.follow_up_due) return false;
      return new Date(r.follow_up_due) < new Date();
    })
  );

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button type="button" onClick={() => navigate("/tender-manager/rfq-packages")} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        ← All packages
      </button>

      {/* Banner */}
      {banner && (
        <div className={`rounded-lg border px-4 py-3 text-sm flex items-center justify-between ${banner.type === "success" ? "border-green-200 bg-green-50 text-green-800" : "border-danger/30 bg-danger/5 text-danger"}`}>
          {banner.text}
          <button type="button" onClick={() => setBanner(null)} className="text-inherit opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* Project header */}
      <div className="rounded-card border border-hairline bg-surface p-5">
        {editingMeta ? (
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: "project_address", label: "Project address" },
              { key: "tender_deadline", label: "Tender deadline" },
              { key: "architect_client", label: "Architect / Client" },
              { key: "dropbox_url", label: "Dropbox URL" },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="section-label block mb-1">{label}</label>
                <input
                  type="text"
                  defaultValue={pkg[key] || ""}
                  onChange={(e) => setMetaDraft((d) => ({ ...d, [key]: e.target.value }))}
                  className="w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
            ))}
            <div className="col-span-2 flex gap-3">
              <button type="button" onClick={saveMeta} disabled={savingMeta} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
                {savingMeta ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => setEditingMeta(false)} className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold text-muted hover:text-ink">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="page-title">{pkg.project_address || "Unnamed project"}</h1>
                <Badge label={pkg.status} colorClass={pkg.status === "active" ? "bg-primary/10 text-primary" : "bg-slate-100 text-muted"} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                {pkg.tender_deadline && <span>📅 Tender due <strong className="text-ink">{pkg.tender_deadline}</strong></span>}
                {pkg.architect_client && <span>🏛 {pkg.architect_client}</span>}
                {pkg.project_type && <span>🏠 {pkg.project_type}</span>}
                {pkg.dropbox_url && (
                  <a href={pkg.dropbox_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                    📁 Dropbox
                  </a>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setEditingMeta(true); setMetaDraft({}); }} className="text-xs font-semibold rounded-lg border border-hairline px-3 py-1.5 hover:bg-page">Edit</button>
              <button type="button" onClick={archivePackage} className="text-xs font-semibold rounded-lg border border-hairline px-3 py-1.5 text-muted hover:text-danger">Archive</button>
            </div>
          </div>
        )}

        {/* Coverage + stats */}
        <div className="mt-4 grid grid-cols-4 gap-3">
          {[
            { label: "Trades", value: scopes.length },
            { label: "Recipients", value: totalRecipients },
            { label: "Pending quotes", value: totalPending },
            { label: "Quotes received", value: totalReceived },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg bg-page p-3 text-center">
              <div className="text-xl font-bold text-ink">{value}</div>
              <div className="text-xs text-muted">{label}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-lg border border-hairline bg-page p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="text-sm font-semibold text-ink">Tender coverage</span>
            <span className={`text-sm font-bold ${coveragePct >= 75 ? "text-green-600" : coveragePct >= 50 ? "text-amber-600" : "text-red-500"}`}>
              {coveragePct}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-hairline overflow-hidden mb-3">
            <div
              className={`h-full rounded-full transition-all ${coveragePct >= 75 ? "bg-green-500" : coveragePct >= 50 ? "bg-amber-400" : "bg-red-400"}`}
              style={{ width: `${coveragePct}%` }}
            />
          </div>
          {coveredTrades.length > 0 ? (
            <div className="mb-2">
              <p className="text-[10px] font-bold uppercase text-muted mb-1">Covered</p>
              <div className="flex flex-wrap gap-1">
                {coveredTrades.map((t) => (
                  <span key={t.trade_id} className="text-[10px] rounded bg-green-50 text-green-800 border border-green-200 px-1.5 py-0.5">
                    ✓ {t.label || t.trade_id}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {missingToGenerate.length > 0 ? (
            <div>
              <p className="text-[10px] font-bold uppercase text-amber-800 mb-1">Missing from package</p>
              <ul className="space-y-1 text-xs text-ink mb-2">
                {missingToGenerate.slice(0, 12).map((m) => (
                  <li key={m.trade_id} className="flex items-start gap-1">
                    <span className="text-amber-600 shrink-0">⚠</span>
                    <span>
                      <strong>{m.trade_label || m.trade_id}</strong>
                      {m.reason ? <span className="text-muted"> — {m.reason}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={generatingMissing}
                onClick={async () => {
                  setGeneratingMissing(true);
                  try {
                    const json = await generateMissingPackageScopes(packageId);
                    setBanner({
                      type: "success",
                      text: `Created ${json.created_count || 0} draft scope(s) from Buildxact estimate baseline.`
                    });
                    await load();
                  } catch (e) {
                    setBanner({ type: "error", text: e.message });
                  } finally {
                    setGeneratingMissing(false);
                  }
                }}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {generatingMissing ? "Generating…" : "Generate missing RFQs"}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Follow-up alert */}
      {followUpCandidates.length > 0 && (
        <div className="rounded-card border border-warning/40 bg-warning/8 p-4 flex items-start gap-3">
          <span className="text-2xl shrink-0">⏰</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink">{followUpCandidates.length} follow-up{followUpCandidates.length !== 1 ? "s" : ""} overdue</p>
            <p className="text-xs text-muted mt-0.5">
              {followUpCandidates.map((r) => r.business_name).join(", ")}
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await authFetch(`/api/rfq-packages/${packageId}/follow-up`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recipient_ids: followUpCandidates.map((r) => r.id) })
              });
              await load();
            }}
            className="shrink-0 rounded-lg border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-warning/20"
          >
            Send all follow-ups
          </button>
        </div>
      )}

      {/* Suggested missing trades */}
      {suggested.length > 0 && (
        <div className="rounded-card border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">⚠️</span>
            <p className="text-sm font-semibold text-amber-900">Potential tender gaps</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {suggested.map((s) => (
              <div key={s.tradeId} className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2">
                <div>
                  <span className="text-xs font-semibold text-ink">{s.label}</span>
                  <span className={`ml-2 text-[10px] font-bold uppercase ${s.risk === "high" ? "text-red-500" : "text-amber-600"}`}>{s.risk} risk</span>
                </div>
                <button
                  type="button"
                  disabled={addingTrade}
                  onClick={() => createSuggestedTrade(s.tradeId, s.label)}
                  className="text-[10px] font-semibold rounded border border-primary/40 px-2 py-1 text-primary hover:bg-primary/5 disabled:opacity-50"
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trade scope cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title">Trade scopes</h2>
          <div className="flex items-center gap-2">
            <select
              value={addTradeId}
              onChange={(e) => setAddTradeId(e.target.value)}
              className="rounded-lg border border-hairline bg-page px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
            >
              <option value="">Add trade…</option>
              {(tradeMaster.length > 0
                ? tradeMaster.map((t) => ({ id: t.trade_id || t.id, label: t.trade_name || t.name || t.label }))
                : [
                    { id: "scaffolding", label: "Scaffolding" },
                    { id: "waterproofing", label: "Waterproofing" },
                    { id: "stormwater_drainage", label: "Stormwater / Drainage" },
                    { id: "painting", label: "Painting" },
                    { id: "carpentry", label: "Carpentry / Joinery" },
                    { id: "heating_cooling", label: "HVAC" },
                    { id: "balustrade", label: "Balustrade" },
                    { id: "joinery", label: "Cabinetry" },
                    { id: "stone_benchtops", label: "Stone / Benchtops" },
                    { id: "plastering_rendering", label: "Rendering" },
                    { id: "insulation", label: "Insulation" },
                    { id: "garage_door", label: "Garage Doors" },
                    { id: "site_cleaner", label: "Final Clean" },
                    { id: "fencing", label: "Site Safety / Fencing" },
                  ]
              ).map(({ id, label }) => (
                <option key={id} value={`${id}::${label}`}>{label}</option>
              ))}
            </select>
            {addTradeId && (
              <button
                type="button"
                disabled={addingTrade}
                onClick={async () => {
                  const [id, label] = addTradeId.split("::");
                  await createSuggestedTrade(id, label);
                  setAddTradeId("");
                }}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {addingTrade ? "Adding…" : "Add"}
              </button>
            )}
          </div>
        </div>
        <div className="space-y-3">
          {scopes.map((scope) => (
            <TradeCard
              key={scope.id}
              scope={scope}
              pkg={pkg}
              onPatch={patchScope}
              onRefresh={load}
            />
          ))}
          {scopes.length === 0 && (
            <div className="rounded-card border border-hairline bg-surface p-8 text-center text-sm text-muted">
              No trade scopes yet. Add a trade above or run a new extraction.
            </div>
          )}
        </div>
      </div>

      {/* Addenda */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="section-title">Addenda</h2>
          <button
            type="button"
            onClick={() => setAddendumModal(true)}
            className="text-xs font-semibold rounded-lg border border-hairline px-3 py-1.5 hover:bg-page"
          >
            + Add addendum
          </button>
        </div>
        {addenda.length === 0 ? (
          <p className="text-sm text-muted">No addenda issued.</p>
        ) : (
          <div className="space-y-2">
            {addenda.map((a) => (
              <div key={a.id} className="rounded-lg border border-hairline bg-surface px-4 py-3 flex items-center gap-4">
                <span className="text-sm font-bold text-primary shrink-0">#{a.number}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink">{a.name}</div>
                  <div className="text-xs text-muted">
                    {a.affected_trades?.length ? `Trades: ${a.affected_trades.join(", ")}` : "No trades specified"}
                    {a.sent_at ? ` · Sent ${fmtDate(a.sent_at)}` : " · Not sent"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {addendumModal && (
        <AddendumModal
          pkg={pkg}
          scopes={scopes}
          onClose={() => setAddendumModal(false)}
          onAdded={() => { setAddendumModal(false); load(); }}
        />
      )}
    </div>
  );
}

/**
 * ConsultantComms — CV-3a. The per-consultant communication thread: every message between the
 * client, Blue Leaf and this consultant, logged + threaded in the Hub (the single source of truth,
 * per Sam's rule). Blue Leaf brokers each consultant — log a relayed client remark or a reply taken
 * by phone, or email the consultant directly (real send gated by CONSULTANT_EMAIL_ENABLED; logging
 * always works). The per-message "share with client" toggle is the broker control the pre-con portal
 * (CV-3c) reads to decide what the client sees. Collapsed by default; renders inside a roster row.
 */
import { useState } from "react";
import { apiPost, apiPatch, apiDelete } from "../../../lib/apiFetch.js";

const PARTICIPANT_LABEL = { client: "Client", blue_leaf: "Blue Leaf", consultant: "Consultant" };
const PARTICIPANT_STYLE = {
  client: "bg-primary/10 text-primary",
  blue_leaf: "bg-accent/10 text-accent",
  consultant: "bg-slate-100 text-slate-600",
};
const CHANNEL_ICON = { note: "📝", email: "✉️", phone: "📞", portal: "🌐" };

function fmt(ts) {
  if (!ts) return "";
  try { return new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "short" }); } catch { return ""; }
}

export default function ConsultantComms({ leadId, role, contactId, messages, onChange }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("note");                 // note | email
  const [participant, setParticipant] = useState("consultant"); // (notes) who said it
  const [channel, setChannel] = useState("phone");          // (notes) how it came in
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [clientVisible, setClientVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const list = messages || [];
  const unshared = list.filter((m) => m.participant !== "blue_leaf" && !m.clientVisible).length;

  async function submit() {
    if (!body.trim()) { setMsg({ type: "error", text: "Write a message first." }); return; }
    if (kind === "email" && !contactId) { setMsg({ type: "error", text: "Select the consultant contact above to email them." }); return; }
    if (kind === "email" && !subject.trim()) { setMsg({ type: "error", text: "An email needs a subject." }); return; }
    setBusy(true); setMsg(null);
    const payload = kind === "email"
      ? { role, contactId, kind: "email", subject, body, clientVisible }
      : { role, contactId, kind: "note", participant, channel, body, clientVisible };
    const { ok, error } = await apiPost(`/api/sales/leads/${leadId}/consultant-comms`, payload);
    setBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Could not save." }); return; }
    setBody(""); setSubject("");
    setMsg({ type: "success", text: kind === "email" ? "Email sent + logged." : "Logged." });
    onChange && onChange();
  }
  async function toggleVisible(m) {
    const { ok } = await apiPatch(`/api/sales/leads/${leadId}/consultant-comms/${m.id}`, { clientVisible: !m.clientVisible });
    if (ok) onChange && onChange();
  }
  async function remove(m) {
    const { ok } = await apiDelete(`/api/sales/leads/${leadId}/consultant-comms/${m.id}`);
    if (ok) onChange && onChange();
  }

  return (
    <div className="mt-1.5 border-t border-hairline pt-1.5">
      <button type="button" onClick={() => setOpen(!open)} className="text-[11px] font-medium text-primary hover:underline">
        {open ? "▾" : "▸"} Comms ({list.length})
        {unshared > 0 && <span className="ml-1 text-amber-700">· {unshared} not shared</span>}
      </button>
      {open && (
        <div className="mt-1.5 space-y-2">
          {/* Thread */}
          {list.length > 0 && (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {list.map((m) => (
                <div key={m.id} className="rounded-lg border border-hairline bg-surface p-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                    <span className={`rounded-full px-1.5 py-0.5 font-semibold ${PARTICIPANT_STYLE[m.participant] || ""}`}>
                      {PARTICIPANT_LABEL[m.participant] || m.participant}
                    </span>
                    <span className="text-muted">{CHANNEL_ICON[m.channel] || ""} {m.channel}</span>
                    <span className="text-muted">{fmt(m.createdAt)}</span>
                    <button type="button" onClick={() => toggleVisible(m)}
                      className={`ml-auto rounded-full px-1.5 py-0.5 font-semibold ${m.clientVisible ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"}`}
                      title="Share this message with the client in the portal">
                      {m.clientVisible ? "👁 shared" : "hidden"}
                    </button>
                    <button type="button" onClick={() => remove(m)} className="text-red-400 hover:text-red-600" title="Delete">×</button>
                  </div>
                  {m.subject && <p className="mt-0.5 text-[11px] font-semibold text-ink">{m.subject}</p>}
                  <p className="mt-0.5 text-[11px] text-ink whitespace-pre-wrap">{m.body}</p>
                </div>
              ))}
            </div>
          )}
          {/* Composer */}
          <div className="rounded-lg border border-hairline bg-page p-1.5 space-y-1.5">
            <div className="flex gap-1.5 flex-wrap items-center text-[11px]">
              <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg border border-hairline px-1.5 py-1 bg-surface">
                <option value="note">Log a note</option>
                <option value="email">Email the consultant</option>
              </select>
              {kind === "note" && (
                <>
                  <select value={participant} onChange={(e) => setParticipant(e.target.value)} className="rounded-lg border border-hairline px-1.5 py-1 bg-surface">
                    <option value="consultant">From consultant</option>
                    <option value="client">From client</option>
                    <option value="blue_leaf">Internal note</option>
                  </select>
                  <select value={channel} onChange={(e) => setChannel(e.target.value)} className="rounded-lg border border-hairline px-1.5 py-1 bg-surface">
                    <option value="phone">Phone</option>
                    <option value="note">Note</option>
                    <option value="portal">Portal</option>
                  </select>
                </>
              )}
            </div>
            {kind === "email" && (
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject"
                className="w-full rounded-lg border border-hairline px-2 py-1 text-[11px] bg-surface" />
            )}
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2}
              placeholder={kind === "email" ? "Message to the consultant…" : "What was said…"}
              className="w-full rounded-lg border border-hairline px-2 py-1 text-[11px] bg-surface" />
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[10px] text-muted">
                <input type="checkbox" className="w-3.5 h-3.5 accent-primary" checked={clientVisible} onChange={(e) => setClientVisible(e.target.checked)} />
                Share with client (portal)
              </label>
              <button type="button" onClick={submit} disabled={busy}
                className="ml-auto rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {busy ? "…" : kind === "email" ? "Send + log" : "Log"}
              </button>
            </div>
            {msg && <p className={`text-[10px] ${msg.type === "error" ? "text-red-600" : "text-green-600"}`}>{msg.text}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

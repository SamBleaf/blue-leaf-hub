/**
 * LeadMailbox — Sales OS Slice 1 (D3). A Mail-app-style thread of the lead's correspondence
 * (inbound + outbound) with compose/reply. Sends real SMTP via the compose endpoint (mirrors to the
 * Sent mailbox), so the same mail also appears in Gmail/Outlook. Sending is behind LEAD_MAILBOX_ENABLED
 * server-side; the thread reads degrade softly before migration 175.
 */
import { useEffect, useState, useCallback } from "react";
import { apiFetch, apiPost } from "../../../lib/apiFetch.js";

function fmt(x) {
  try { return new Date(x).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; }
}

export default function LeadMailbox({ lead }) {
  const [messages, setMessages] = useState([]);
  const [columnMissing, setColumnMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [inReplyTo, setInReplyTo] = useState(null);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState(null);

  const load = useCallback(async () => {
    const { ok, data } = await apiFetch(`/api/sales/leads/${lead.id}/mailbox`);
    if (ok) { setMessages(data?.messages || []); setColumnMissing(!!data?.columnMissing); }
    setLoading(false);
  }, [lead.id]);
  useEffect(() => { load(); }, [load]);

  function startReply(m) {
    setInReplyTo(m.messageId || null);
    setSubject((m.subject || "").startsWith("Re:") ? m.subject : `Re: ${m.subject || ""}`);
    setBody("");
    setNote(null);
  }
  async function send() {
    setSending(true); setNote(null);
    const { ok, error } = await apiPost(`/api/sales/leads/${lead.id}/email`, { subject: subject.trim(), body: body.trim(), inReplyTo });
    setSending(false);
    if (!ok) { setNote({ type: "error", text: error || "Could not send." }); return; }
    setSubject(""); setBody(""); setInReplyTo(null);
    setNote({ type: "success", text: "Sent." });
    await load();
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <h3 className="section-label mb-3">Mailbox</h3>

      {columnMissing ? (
        <p className="text-xs text-muted italic">The lead mailbox activates once migration 175 is applied.</p>
      ) : loading ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-muted italic mb-3">No emails yet. Sent + received mail threads here (and still shows in your real mailbox).</p>
      ) : (
        <div className="space-y-2 mb-4 max-h-80 overflow-auto">
          {messages.map((m) => (
            <div key={m.id} className={`rounded-lg border px-3 py-2 text-sm ${m.direction === "inbound" ? "border-hairline bg-page" : "border-primary/20 bg-primary/[0.04]"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${m.direction === "inbound" ? "text-ink" : "text-primary"}`}>{m.direction === "inbound" ? "Received" : "Sent"}</span>
                <span className="text-[10px] text-muted">{fmt(m.sentAt)}</span>
              </div>
              <p className="font-medium text-ink mt-0.5">{m.subject}</p>
              <p className="text-xs text-muted whitespace-pre-wrap line-clamp-6 mt-0.5">{m.body}</p>
              <button type="button" onClick={() => startReply(m)} className="mt-1 text-xs text-primary hover:underline">Reply</button>
            </div>
          ))}
        </div>
      )}

      {!columnMissing && (
        <div className="space-y-2 border-t border-hairline pt-3">
          {inReplyTo && (
            <p className="text-[11px] text-muted">Replying to a message · <button type="button" onClick={() => setInReplyTo(null)} className="text-primary hover:underline">clear</button></p>
          )}
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Write a message…" className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink resize-none" />
          <div className="flex items-center gap-2">
            <button type="button" onClick={send} disabled={sending || !subject.trim() || !body.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {sending ? "Sending…" : "Send"}
            </button>
            {note && <span className={`text-xs ${note.type === "error" ? "text-red-600" : "text-green-600"}`}>{note.text}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

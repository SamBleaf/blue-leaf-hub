/**
 * LeadMailbox — Sales OS Slice 1 (D3). A Mail-app-style thread of the lead's correspondence (inbound + outbound)
 * with compose/reply on demand. Rendered inside LeadCorrespondence, which loads the messages. Sends real SMTP via
 * the compose endpoint (mirrors to the Sent mailbox), so the same mail also appears in Gmail/Outlook. Sending is
 * behind LEAD_MAILBOX_ENABLED server-side.
 */
import { useState } from "react";
import { apiPost } from "../../../lib/apiFetch.js";

function fmt(x) {
  try { return new Date(x).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; }
}

export default function LeadMailbox({ lead, messages = [], loading = false, sendingOff = false, onSent }) {
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [inReplyTo, setInReplyTo] = useState(null);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState(null);

  function startNew() {
    setInReplyTo(null); setSubject(""); setBody(""); setNote(null); setComposing(true);
  }
  function startReply(m) {
    setInReplyTo(m.messageId || null);
    setSubject((m.subject || "").startsWith("Re:") ? m.subject : `Re: ${m.subject || ""}`);
    setBody("");
    setNote(null);
    setComposing(true);
  }
  function cancel() {
    setComposing(false); setInReplyTo(null); setSubject(""); setBody("");
  }
  async function send() {
    setSending(true); setNote(null);
    const { ok, error } = await apiPost(`/api/sales/leads/${lead.id}/email`, { subject: subject.trim(), body: body.trim(), inReplyTo });
    setSending(false);
    if (!ok) { setNote({ type: "error", text: error || "Could not send." }); return; }
    cancel();
    setNote({ type: "success", text: "Sent. The Hub can't see whether it was delivered." });
    await onSent?.();
  }

  return (
    <div className="space-y-3 border-t border-hairline pt-3">
      {loading ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-muted italic">No emails yet. Sent and received mail threads here, and still shows in your real mailbox.</p>
      ) : (
        <>
          <p className="text-[11px] text-muted">&ldquo;Sent&rdquo; means our mail server accepted it. The Hub can&apos;t see whether it was delivered or read.</p>
          <div className="space-y-2 max-h-80 overflow-auto">
            {messages.map((m) => (
              <div key={m.id} className={`rounded-lg border px-3 py-2 text-sm ${m.direction === "inbound" ? "border-hairline bg-page" : "border-primary/20 bg-primary/[0.04]"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${m.direction === "inbound" ? "text-ink" : "text-primary"}`}>{m.direction === "inbound" ? "Received" : "Sent"}</span>
                  <span className="text-[10px] text-muted">{fmt(m.sentAt)}</span>
                </div>
                <p className="font-medium text-ink mt-0.5">{m.subject}</p>
                <p className="text-xs text-muted whitespace-pre-wrap line-clamp-6 mt-0.5">{m.body}</p>
                {!sendingOff && <button type="button" onClick={() => startReply(m)} className="mt-1 text-xs text-primary hover:underline">Reply</button>}
              </div>
            ))}
          </div>
        </>
      )}

      {sendingOff ? (
        <p className="text-[11px] font-medium text-amber-700">Sending from the Hub mailbox is turned off, so New message and Reply aren&apos;t available.</p>
      ) : composing ? (
        <div className="space-y-2">
          {inReplyTo && <p className="text-[11px] text-muted">Replying to a message</p>}
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Write a message…" className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink resize-none" />
          <div className="flex items-center gap-2">
            <button type="button" onClick={send} disabled={sending || !subject.trim() || !body.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {sending ? "Sending…" : "Send"}
            </button>
            <button type="button" onClick={cancel} disabled={sending} className="rounded-lg border border-hairline px-3 py-2 text-sm text-ink hover:bg-page">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={startNew} className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-ink hover:bg-page">New message</button>
      )}
      {note && <p role="status" className={`text-xs ${note.type === "error" ? "text-red-600" : "text-green-600"}`}>{note.text}</p>}
    </div>
  );
}

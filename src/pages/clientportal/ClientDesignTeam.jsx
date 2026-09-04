/**
 * ClientDesignTeam — CV-3c. The client's brokered window onto their design team. Blue Leaf sits in
 * the middle: the client talks to us here, and we coordinate with the architect, interior designer,
 * lighting and sanitary consultants on their behalf. The client only sees messages Blue Leaf chose to
 * share (client_visible), and their replies come straight back to us in the Hub thread. Mirrors the
 * ClientMessages pattern; JWT surface via portalGet/portalPost.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useClientPortal } from "./clientPortalContext.js";
import { portalGet, portalPost } from "../../lib/clientPortalApi.js";
import { Loading, ErrorBox, PageTitle, fmtDate } from "./clientPortalUi.jsx";

export default function ClientDesignTeam() {
  const ctx = useClientPortal();
  const projectId = ctx?.projectId;
  const [state, setState] = useState({ loading: true, disciplines: [], messages: [], error: null });
  const [draft, setDraft] = useState("");
  const [role, setRole] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState(null);
  const endRef = useRef(null);

  const load = useCallback(() => {
    if (!projectId) return;
    portalGet(projectId, "design-team").then(({ ok, data, error }) => {
      setState({ loading: false, disciplines: data?.disciplines || [], messages: data?.messages || [], error: ok ? null : error });
    });
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 20000); return () => clearInterval(id); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [state.messages.length]);

  async function send(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true); setSendErr(null);
    const { ok, error } = await portalPost(projectId, "design-team/messages", { body, role: role || undefined });
    setSending(false);
    if (!ok) { setSendErr(error); return; }
    setDraft("");
    load();
  }

  if (state.loading) return <Loading label="Loading your design team…" />;
  if (state.error) return <ErrorBox error={state.error} onRetry={load} />;

  const { disciplines, messages } = state;

  return (
    <div className="max-w-2xl mx-auto">
      <PageTitle title="Your design team" subtitle="Message us here — we coordinate with your consultants and keep everything in one place." />

      {disciplines.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {disciplines.map((d) => (
            <span key={d.role} className="rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">{d.label}</span>
          ))}
        </div>
      )}

      <div className="rounded-card border border-hairline bg-surface p-4 mb-4 min-h-[40vh] flex flex-col">
        <div className="flex-1 space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">
              No messages yet. Send us a note below — a question for the architect, a change of mind on a finish,
              anything about the design — and we’ll take it to the right consultant.
            </p>
          ) : (
            messages.map((m) => {
              const isClient = m.participant === "client";
              return (
                <div key={m.id} className={`flex ${isClient ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${isClient ? "bg-primary text-white" : "bg-page border border-hairline text-ink"}`}>
                    {!isClient && (
                      <p className="text-[10px] font-semibold text-muted mb-0.5">
                        {m.participant === "consultant" ? (m.roleLabel || "Consultant") : "Blue Leaf"}
                      </p>
                    )}
                    {m.subject && <p className="text-xs font-semibold mb-0.5">{m.subject}</p>}
                    <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                    <p className={`text-[10px] mt-1 ${isClient ? "text-white/70" : "text-muted"}`}>{fmtDate(m.createdAt)}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>
      </div>

      <form onSubmit={send} className="rounded-card border border-hairline bg-surface p-3 space-y-2">
        {disciplines.length > 0 && (
          <select value={role} onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-lg border border-hairline px-2 py-1.5 text-sm bg-page text-ink">
            <option value="">About the project generally</option>
            {disciplines.map((d) => <option key={d.role} value={d.role}>About: {d.label}</option>)}
          </select>
        )}
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3}
          placeholder="Write a message to your design team…"
          className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink focus:outline-none focus:ring-1 focus:ring-primary/40" />
        {sendErr && <p className="text-xs text-red-600">{sendErr}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={sending || !draft.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

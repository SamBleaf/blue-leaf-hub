import { useCallback, useEffect, useRef, useState } from "react";
import { useClientPortal } from "./clientPortalContext.js";
import { portalGet, portalPost } from "../../lib/clientPortalApi.js";
import { Loading, ErrorBox, PageTitle, fmtDate } from "./clientPortalUi.jsx";

export default function ClientMessages() {
  const ctx = useClientPortal();
  const projectId = ctx?.projectId;
  const [state, setState] = useState({ loading: true, messages: [], error: null });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState(null);
  const endRef = useRef(null);

  const load = useCallback(() => {
    if (!projectId) return;
    portalGet(projectId, "messages").then(({ ok, data, error }) => {
      setState({ loading: false, messages: data?.messages || [], error: ok ? null : error });
    });
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  // Light polling so the client sees Sam's replies without refreshing.
  useEffect(() => {
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [state.messages.length]);

  async function send(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true); setSendErr(null);
    const { ok, error } = await portalPost(projectId, "messages", { body });
    setSending(false);
    if (!ok) { setSendErr(error); return; }
    setDraft("");
    load();
  }

  if (state.loading) return <Loading label="Loading your messages…" />;
  if (state.error) return <ErrorBox error={state.error} onRetry={load} />;

  return (
    <div className="flex min-h-[60vh] flex-col space-y-4">
      <PageTitle sub="The one place for project conversation with Blue Leaf.">Messages</PageTitle>

      <div className="flex min-h-[22rem] flex-1 flex-col gap-3 overflow-y-auto rounded-2xl border border-hairline bg-surface p-5">
        {state.messages.length === 0 ? (
          <p className="my-auto py-10 text-center text-sm leading-relaxed text-muted">
            No messages yet. Say hello — we usually reply the same day.
          </p>
        ) : (
          state.messages.map((m) => {
            const mine = m.sender === "client";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                    mine ? "bg-accent text-white" : "border border-hairline bg-page text-ink"
                  }`}
                >
                  {!mine ? <p className="mb-0.5 text-[11px] font-semibold text-muted">{m.senderName}</p> : null}
                  <p className="whitespace-pre-line leading-relaxed">{m.body}</p>
                  <p className={`mt-1 text-[11px] ${mine ? "text-white/70" : "text-muted"}`}>{fmtDate(m.createdAt)}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) send(e); }}
          placeholder="Write a message…"
          rows={2}
          className="min-h-[44px] flex-1 resize-none rounded-2xl border border-hairline bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus-ring"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="min-h-[44px] rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
      {sendErr ? <p className="text-xs text-red-600">{sendErr}</p> : null}
    </div>
  );
}

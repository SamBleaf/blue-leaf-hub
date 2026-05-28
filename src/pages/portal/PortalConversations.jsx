import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPortalConversations,
  sendPortalMessage,
  bookSiteWalk
} from "../../lib/portalApi.js";
import { usePortal } from "./portalContext.js";
import PortalPageSkeleton from "../../components/portal/PortalPageSkeleton.jsx";
import PortalEmptyState from "../../components/portal/PortalEmptyState.jsx";
import SiteWalkBooker from "../../components/portal/SiteWalkBooker.jsx";

export default function PortalConversations() {
  const { token } = usePortal();
  const [messages, setMessages] = useState([]);
  const [siteWalks, setSiteWalks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const threadRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await getPortalConversations(token);
      setMessages(data.messages || []);
      setSiteWalks(data.siteWalks || []);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    threadRef.current?.scrollTo(0, threadRef.current.scrollHeight);
  }, [messages]);

  const handleSend = async () => {
    const body = newMessage.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError("");
    const optimistic = {
      id: `tmp-${Date.now()}`,
      sender: "client",
      body,
      createdAt: new Date().toISOString()
    };
    setMessages((m) => [...m, optimistic]);
    setNewMessage("");
    try {
      await sendPortalMessage(token, body);
      await load();
    } catch (e) {
      setSendError(e?.message || "Failed to send. Please try again.");
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <PortalPageSkeleton />;
  if (error) return <PortalEmptyState title="Could not load" message={error.message} />;

  let lastDate = "";

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 pb-32 md:pb-8 flex flex-col min-h-[70vh]">
      <div ref={threadRef} className="flex-1 overflow-y-auto mb-4 max-h-[50vh]">
        {messages.map((msg) => {
          const d = msg.createdAt?.slice(0, 10);
          const showDate = d && d !== lastDate;
          if (showDate) lastDate = d;
          const isClient = msg.sender === "client";
          return (
            <div key={msg.id}>
              {showDate && (
                <p className="text-xs text-muted text-center my-3">
                  {new Date(msg.createdAt).toLocaleDateString("en-AU")}
                </p>
              )}
              <div
                className={`px-4 py-3 text-sm max-w-[75%] mb-2 rounded-2xl ${
                  isClient
                    ? "ml-auto bg-primary text-white rounded-br-sm"
                    : "mr-auto bg-gray-100 text-ink rounded-bl-sm"
                }`}
              >
                {msg.body}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <textarea
          rows={3}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Message Sam…"
          className="w-full resize-none border border-hairline rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {sendError && <p className="text-sm text-danger">{sendError}</p>}
        <button
          type="button"
          disabled={!newMessage.trim() || sending}
          onClick={handleSend}
          className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>

      <section className="mt-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
          Book a site walk
        </p>
        <SiteWalkBooker
          siteWalks={siteWalks}
          onBook={async (id) => {
            await bookSiteWalk(token, id);
            await load();
          }}
        />
      </section>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { getPortalDecisions, respondToDecision } from "../../lib/portalApi.js";
import { formatPortalDate } from "../../lib/portalUtils.js";
import { usePortal } from "./portalContext.js";
import PortalPageSkeleton from "../../components/portal/PortalPageSkeleton.jsx";
import PortalEmptyState from "../../components/portal/PortalEmptyState.jsx";
import DecisionCard from "../../components/portal/DecisionCard.jsx";

function isUrgent(d) {
  if (d.urgency === "urgent" || d.urgency === "overdue") return true;
  if (!d.dueDate) return false;
  const due = new Date(d.dueDate);
  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  return due <= in7;
}

export default function PortalDecisions() {
  const { token } = usePortal();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await getPortalDecisions(token);
      setData(fresh);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <PortalPageSkeleton />;
  if (error && !data) return <PortalEmptyState title="Could not load" message={error.message} />;

  const pending = data?.pending || [];
  const completed = data?.completed || [];
  const urgent = pending.filter(isUrgent);
  const other = pending.filter((d) => !isUrgent(d));

  const onRespond = async (decisionId, action, payload) => {
    await respondToDecision(token, decisionId, { action, ...payload });
    await load();
    setToast({ visible: true, message: "Response saved" });
    setTimeout(() => setToast({ visible: false, message: "" }), 3000);
  };

  if (!pending.length && !completed.length) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <PortalEmptyState title="Nothing pending" message="All decisions are up to date." />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 pb-24 md:pb-8 space-y-8">
      {urgent.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest text-danger mb-3">
            Urgent — due this week
          </p>
          <div className="space-y-4">
            {urgent.map((d) => (
              <DecisionCard key={d.id} decision={d} onRespond={onRespond} />
            ))}
          </div>
        </section>
      )}
      {other.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
            For your review
          </p>
          <div className="space-y-4">
            {other.map((d) => (
              <DecisionCard key={d.id} decision={d} onRespond={onRespond} />
            ))}
          </div>
        </section>
      )}
      {completed.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowCompleted(!showCompleted)}
            className="text-xs font-semibold uppercase tracking-widest text-muted mb-3"
          >
            Completed ({completed.length}) {showCompleted ? "▾" : "▸"}
          </button>
          {showCompleted &&
            completed.map((d) => (
              <p key={d.id} className="text-sm text-muted py-2 border-b border-hairline">
                {d.status === "approved" ? "✓" : "✗"} {d.title} — {formatPortalDate(d.respondedAt)}
              </p>
            ))}
        </section>
      )}
      {toast.visible && (
        <div className="fixed bottom-6 right-6 z-50 bg-ink text-white text-sm px-4 py-3 rounded-xl shadow-lg">
          {toast.message}
        </div>
      )}
    </div>
  );
}

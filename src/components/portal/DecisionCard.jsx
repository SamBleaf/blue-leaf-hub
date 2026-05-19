import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatCurrency, formatPortalDate } from "../../lib/portalUtils.js";
import { usePortal } from "../../pages/portal/portalContext.js";

export default function DecisionCard({ decision, onRespond }) {
  const { token } = usePortal();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [responding, setResponding] = useState(false);
  const [done, setDone] = useState(false);

  const urgent = decision.urgency === "urgent" || decision.urgency === "overdue";
  const options = Array.isArray(decision.options) ? decision.options : [];

  const handleRespond = async (action, payload = {}) => {
    setResponding(true);
    try {
      await onRespond(decision.id, action, payload);
      setDone(true);
    } finally {
      setResponding(false);
    }
  };

  const dueChip =
    decision.dueDate &&
    (decision.urgency === "overdue"
      ? "bg-danger/10 text-danger"
      : "bg-warning/10 text-warning");

  if (decision.type === "selection") {
    return (
      <div
        className={`bg-surface rounded-2xl border p-6 ${
          urgent ? "border-warning/40 bg-warning/5" : "border-hairline"
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-semibold text-ink">⚡ {decision.title}</h3>
          {decision.dueDate && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${dueChip}`}>
              Due {formatPortalDate(decision.dueDate)}
            </span>
          )}
        </div>
        {decision.description && (
          <p className="text-sm text-muted mb-4">{decision.description}</p>
        )}
        {done ? (
          <p className="text-sm text-success font-medium">Done — Sam has been notified.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={responding}
                  onClick={() => handleRespond("approve", { chosenOptionId: opt.id })}
                  className="border border-hairline rounded-xl p-3 text-left hover:border-primary transition"
                >
                  {opt.image_url && (
                    <img src={opt.image_url} alt="" className="rounded-lg aspect-video object-cover w-full mb-2" />
                  )}
                  <p className="text-sm font-semibold text-ink">{opt.label}</p>
                  {opt.within_allowance ? (
                    <p className="text-xs text-success mt-0.5">(within budget)</p>
                  ) : opt.cost_delta > 0 ? (
                    <p className="text-xs text-warning mt-0.5">
                      +{formatCurrency(opt.cost_delta)} over allowance
                    </p>
                  ) : null}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => navigate(`/portal/${token}/conversations`)}
              className="text-sm text-primary underline"
            >
              I need more time — contact us
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className={`bg-surface rounded-2xl border p-6 ${
        urgent ? "border-warning/40 bg-warning/5" : "border-hairline"
      }`}
    >
      <h3 className="text-base font-semibold text-ink mb-2">📋 Variation · {decision.title}</h3>
      {decision.description && (
        <p className="text-sm text-muted leading-relaxed mb-4">{decision.description}</p>
      )}
      <div className="grid grid-cols-2 gap-2 mb-5 text-sm">
        <div>
          <p className="text-muted">Additional cost</p>
          <p className="text-ink font-medium">
            {decision.costDelta > 0 ? `+${formatCurrency(decision.costDelta)}` : "No additional cost"}
          </p>
        </div>
        <div>
          <p className="text-muted">Schedule impact</p>
          <p className="text-ink font-medium">
            {decision.scheduleDelta > 0 ? `+${decision.scheduleDelta} days` : "No schedule impact"}
          </p>
        </div>
      </div>
      {done ? (
        <p className="text-sm text-success font-medium">Done — Sam has been notified.</p>
      ) : !confirming ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="bg-success text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:opacity-90"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={responding}
            onClick={() => handleRespond("decline")}
            className="border border-hairline rounded-xl px-5 py-2.5 text-sm font-semibold"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => navigate(`/portal/${token}/conversations`)}
            className="text-primary text-sm underline"
          >
            Ask a question
          </button>
        </div>
      ) : (
        <div>
          <p className="text-sm text-ink mb-3">
            Are you sure you want to approve this variation for {formatCurrency(decision.costDelta)}?
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={responding}
              onClick={() => handleRespond("approve")}
              className="bg-success text-white rounded-xl px-5 py-2.5 text-sm font-semibold"
            >
              Yes, approve
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="border border-hairline rounded-xl px-5 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

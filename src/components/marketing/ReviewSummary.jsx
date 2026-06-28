import { useState } from "react";
import ReviewPanel from "./ReviewPanel.jsx";
import JoshLabelBadge from "./JoshLabelBadge.jsx";
import WhyThisPanel from "./WhyThisPanel.jsx";
import { deriveJoshLabels, deriveRiskLevel } from "./creatorData.js";

// ReviewSummary (Run B) — Josh-facing review: plain-English labels + risk first,
// with the existing numeric ReviewPanel scores tucked under "See quality details".
const RISK_STYLE = {
  low: "bg-accent/10 text-accent",
  medium: "bg-warning/15 text-ink",
  high: "bg-red-100 text-red-700",
};

export default function ReviewSummary({ reviewScores, hasMedia, why }) {
  const [showDetails, setShowDetails] = useState(false);
  const labels = deriveJoshLabels({ reviewScores, hasMedia });
  const risk = deriveRiskLevel(reviewScores);
  const blocked = reviewScores?.apb_reference?.pass === false;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {labels.map((l) => (
          <JoshLabelBadge key={l} label={l} />
        ))}
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${RISK_STYLE[risk]}`}>
          Risk: {risk}
        </span>
        {reviewScores?.demo && (
          <span className="rounded-full bg-page px-2 py-0.5 text-[11px] font-medium text-muted">DEMO</span>
        )}
      </div>

      <WhyThisPanel why={why} />

      {reviewScores && (
        <>
          <button
            type="button"
            onClick={() => setShowDetails((s) => !s)}
            className="text-xs font-medium text-primary underline"
          >
            {showDetails ? "Hide quality details" : "See quality details"}
          </button>
          {showDetails && (
            <ReviewPanel scores={reviewScores} blocked={blocked} blockReason={reviewScores?.block_reason} />
          )}
        </>
      )}
    </div>
  );
}

import { useState } from "react";
import JoshLabelBadge from "./JoshLabelBadge.jsx";

// Shared review legend (Completion Batch 2) — one plain-English explanation of the review
// labels + risk levels, reused in the Content Studio and the Approval Queue so the same
// concepts mean the same thing everywhere. Collapsed by default; purely explanatory.

const LABELS = [
  { name: "Ready for Josh review", meaning: "Passed the automatic checks — ready for a human look." },
  { name: "Needs Sam approval", meaning: "Flagged a claim or quality risk — Sam should approve before it goes out." },
  { name: "Needs photo", meaning: "No project photo attached yet — add proof before approving." },
  { name: "Good lead quality topic", meaning: "Likely to attract the right kind of enquiries." },
  { name: "Safe to post", meaning: "Cleared to post once approved." },
  { name: "High value evergreen", meaning: "Worth reusing later — surfaces in the Evergreen Library." },
];

const RISK = [
  { level: "low", style: "bg-accent/10 text-accent", meaning: "No issues found — standard review." },
  { level: "medium", style: "bg-warning/15 text-ink", meaning: "Thin on specifics or local relevance — tighten before posting." },
  { level: "high", style: "bg-red-100 text-red-700", meaning: "Possible over-promise or a failed reference check — needs Sam." },
];

export default function ReviewLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-card border border-hairline bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">What the labels mean</span>
        <span className="text-xs font-semibold text-primary">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-hairline px-3 py-3">
          <ul className="space-y-1.5">
            {LABELS.map((l) => (
              <li key={l.name} className="flex flex-wrap items-center gap-2">
                <JoshLabelBadge label={l.name} />
                <span className="text-xs text-muted">{l.meaning}</span>
              </li>
            ))}
          </ul>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Risk level</p>
            <ul className="space-y-1.5">
              {RISK.map((r) => (
                <li key={r.level} className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${r.style}`}>
                    Risk: {r.level}
                  </span>
                  <span className="text-xs text-muted">{r.meaning}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] text-muted">
            Flow: review → <span className="font-medium text-ink">approve</span> in the Approval Queue →{" "}
            <span className="font-medium text-ink">schedule</span> in the Calendar →{" "}
            <span className="font-medium text-ink">post manually</span> and mark as posted. Nothing is published automatically.
          </p>
        </div>
      )}
    </div>
  );
}

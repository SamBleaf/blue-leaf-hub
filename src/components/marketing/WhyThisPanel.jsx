// Plain-English "why this" rationale line (Run B).
export default function WhyThisPanel({ why }) {
  if (!why) return null;
  return (
    <div className="rounded-lg bg-page px-3 py-2 text-xs text-muted">
      <span className="font-semibold text-ink">Why this:</span> {why}
    </div>
  );
}

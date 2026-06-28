// Josh-facing operational label chip (Run B). Plain-English status, not raw enums.
const LABEL_STYLES = {
  "Needs photo": "bg-warning/15 text-ink",
  "Needs Sam approval": "bg-red-100 text-red-700",
  "Ready for Josh review": "bg-primary/10 text-primary",
  "Safe to post": "bg-accent/10 text-accent",
  "Good lead quality topic": "bg-emerald-100 text-emerald-700",
  "High value evergreen": "bg-purple-100 text-purple-700",
};

export default function JoshLabelBadge({ label }) {
  const cls = LABEL_STYLES[label] || "bg-page text-muted";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>;
}

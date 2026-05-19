const CONFIG = {
  on_track: {
    badge: "Schedule: On Track",
    className: "bg-emerald-100 text-emerald-800",
    text: "Work is progressing as planned against the current programme."
  },
  attention: {
    badge: "Schedule: Needs Attention",
    className: "bg-amber-100 text-amber-800",
    text: "A few items need coordination — your builder is on it and will update you if anything shifts."
  },
  delayed: {
    badge: "Schedule: Delayed",
    className: "bg-red-100 text-red-800",
    text: "Some dates have slipped. Your builder will explain what's changed and what happens next."
  }
};

export default function ConfidenceCard({ status }) {
  const cfg = CONFIG[status] || CONFIG.on_track;

  return (
    <section className="mt-4 rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
      <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${cfg.className}`}>
        {cfg.badge}
      </span>
      <p className="mt-3 text-sm text-muted leading-relaxed">{cfg.text}</p>
    </section>
  );
}

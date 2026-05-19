function phasePlain(phase) {
  if (!phase) return null;
  return String(phase).replace(/_/g, " ");
}

export default function TodaySummaryCard({
  currentPhase,
  daysToCompletion,
  nextMilestoneLabel,
  scheduleStatus
}) {
  const bullets = [];

  if (currentPhase) {
    bullets.push(`We're currently in the ${phasePlain(currentPhase)} stage of your build.`);
  }

  if (daysToCompletion != null && daysToCompletion >= 0) {
    bullets.push(
      daysToCompletion === 0
        ? "Your estimated completion date is today."
        : `About ${daysToCompletion} day${daysToCompletion === 1 ? "" : "s"} until your estimated completion date.`
    );
  } else if (daysToCompletion != null && daysToCompletion < 0) {
    bullets.push("We're working to align the schedule with your completion target.");
  }

  if (nextMilestoneLabel) {
    bullets.push(`Next up: ${nextMilestoneLabel}.`);
  }

  if (!bullets.length) return null;

  const statusNote =
    scheduleStatus === "delayed"
      ? "The schedule needs a small reset — your builder will keep you posted."
      : scheduleStatus === "attention"
        ? "A few dates need watching — nothing unusual at this stage."
        : null;

  return (
    <section className="mt-6 rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
        Today in 30 seconds
      </p>
      <ul className="space-y-2 text-sm text-ink leading-relaxed list-disc pl-4">
        {bullets.slice(0, 3).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {statusNote ? <p className="mt-3 text-xs text-muted">{statusNote}</p> : null}
    </section>
  );
}

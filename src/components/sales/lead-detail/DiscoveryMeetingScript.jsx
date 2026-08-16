/**
 * DiscoveryMeetingScript — Sales OS Discovery. The >1-hour deep-dive meeting checklist (advisory).
 * Points the salesperson to the existing Conversations panel to paste the transcript, which Blueprint
 * analyses and applies onto the lead + logs the timeline (no new transcript code).
 */
export default function DiscoveryMeetingScript() {
  return (
    <div className="rounded-card border border-primary/20 bg-primary/[0.03] p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">Discovery meeting — the deep dive (60+ min)</h3>
      <p className="text-xs text-muted leading-relaxed">
        Cover these before you leave. Record the meeting and paste the transcript into <strong>Conversations</strong> (below) —
        Blueprint pulls the details onto the lead and logs the timeline.
      </p>
      <ul className="mt-2 text-xs text-ink list-disc pl-4 space-y-0.5">
        <li>Their vision — what they&apos;re really trying to achieve; must-haves vs nice-to-haves</li>
        <li>Site walk-through — constraints, orientation, access, existing conditions</li>
        <li>Budget confirmed — a realistic range, funding, and what&apos;s driving it</li>
        <li>Timeline + any pressures (family, finance, lease, approvals)</li>
        <li>Decision-makers — who signs off, and are they all bought in</li>
        <li>Biggest excitement and biggest worry (so we can address it)</li>
        <li>Design pathway — the right designer / consultant stack for this project</li>
        <li>Confirm the next step: the concept design package + its fee</li>
      </ul>
    </div>
  );
}

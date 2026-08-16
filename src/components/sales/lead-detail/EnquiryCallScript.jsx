/**
 * EnquiryCallScript — Sales OS Slice 1. The Enquiry stage as a tight, guided call: a short
 * question checklist, the qualifying scorecard (passed in), the controlled-vocab client details,
 * then a Proceed / Nurture / Lost decision. Advisory — nothing here blocks. Nurture is never
 * automatic and Lost is always a manual choice.
 */
import QualificationDropdowns from "./QualificationDropdowns.jsx";

export default function EnquiryCallScript({ lead, patch, reload, scorecard }) {
  const proceed = () => patch({ stage: "qualify" }).then(reload);
  const nurture = () => patch({ stage: "nurture" }).then(reload);
  const lost = () => patch({ stage: "lost" }).then(reload);

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-primary/20 bg-primary/[0.03] p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">Enquiry call — complete the picture</h3>
        <p className="text-xs text-muted leading-relaxed">
          Run the short call to fill the essentials, then decide the next step. Keep it tight — you&apos;re checking fit and readiness, not selling.
        </p>
        <ul className="mt-2 text-xs text-ink list-disc pl-4 space-y-0.5">
          <li>What are you looking to build/renovate? Where&apos;s the property? Do you own it?</li>
          <li>Where are you up to — ideas, concept, plans, approval, ready to price?</li>
          <li>Designer involved? What documents do you have?</li>
          <li>Budget range? When would you start?</li>
          <li>What matters most in a builder? What are you most worried about?</li>
        </ul>
      </div>

      {scorecard}
      <QualificationDropdowns lead={lead} patch={patch} />

      <div className="rounded-card border border-hairline bg-surface p-4">
        <h3 className="section-label mb-2">Next step</h3>
        <p className="text-xs text-muted mb-3 leading-relaxed">
          Proceed if it fits, the budget&apos;s potentially realistic, and they&apos;re open to a structured process. Nurture (not Lost)
          if they only want a quick price, won&apos;t discuss budget, aren&apos;t the decision-maker, or aren&apos;t ready. Lost is a manual choice.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={proceed} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Proceed to Qualify →</button>
          <button type="button" onClick={nurture} className="rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink hover:bg-page">→ Nurture</button>
          <button type="button" onClick={lost} className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:border-red-400">Mark Lost</button>
        </div>
      </div>
    </div>
  );
}

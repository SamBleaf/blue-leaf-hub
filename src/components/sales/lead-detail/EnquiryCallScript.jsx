/**
 * EnquiryCallScript — Sales OS Slice 1. The Enquiry stage as a tight, guided call: a short
 * question checklist, the qualifying scorecard (passed in) and the controlled-vocab client details.
 * The outcome is decided below it: Move to Qualify in the completion panel, or Nurture / Mark Lost in
 * the header. Advisory — nothing here blocks. Nurture is never automatic and Lost is always a manual choice.
 */
import QualificationDropdowns from "./QualificationDropdowns.jsx";
import { ENQUIRY_CALL_TARGET } from "../../../lib/leadNextAction.js";

export default function EnquiryCallScript({ lead, patch, scorecard }) {
  return (
    <div className="space-y-4">
      <div data-next-target={ENQUIRY_CALL_TARGET} className="rounded-card border border-primary/20 bg-primary/[0.03] p-4 transition-shadow">
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
    </div>
  );
}

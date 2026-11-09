/**
 * EnquiryCallScript — Sales OS Slice 1. The Enquiry stage as a tight, guided call: a short
 * question checklist, the qualifying scorecard (passed in) and the controlled-vocab client details.
 * The outcome is decided below it: Move to Qualify in the completion panel, or Nurture / Mark Lost in
 * the header. Advisory — nothing here blocks. Nurture is never automatic and Lost is always a manual choice.
 */
import QualificationDropdowns from "./QualificationDropdowns.jsx";
import { ENQUIRY_CALL_TARGET } from "../../../lib/leadNextAction.js";

const shortDate = (d) => (d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : null);

/** What this enquiry still needs, read from what is on file. A fact already held is never asked for again. */
function stillToFindOut(lead) {
  return [
    ["Phone", lead.phone], ["Email", lead.email], ["Property", lead.site_address || lead.suburb], ["Project type", lead.project_type],
    ["Budget", lead.qualify_budget], ["Timeframe", lead.qualify_timeframe], ["Who decides", lead.qualify_decision_maker], ["Documents held", lead.documents_on_hand],
  ].filter(([, v]) => v == null || v === "").map(([label]) => label);
}

export default function EnquiryCallScript({ lead, patch, scorecard }) {
  const missing = stillToFindOut(lead);
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted" data-testid="enquiry-summary">
        Enquiry received <span className="font-medium text-ink">{shortDate(lead.created_at) || "recently"}</span>
        {lead.last_activity_at && <> · last activity <span className="font-medium text-ink">{shortDate(lead.last_activity_at)}</span></>}
        {" · "}with <span className="font-medium text-ink">{lead.assigned_to || "nobody yet"}</span>
      </p>
      <div data-next-target={ENQUIRY_CALL_TARGET} className="rounded-card border border-primary/20 bg-primary/[0.03] p-4 transition-shadow">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">Enquiry call — complete the picture</h3>
        <p className="mb-1 text-xs font-medium text-ink" data-testid="enquiry-missing">{missing.length ? `Still to find out: ${missing.join(", ")}.` : "The essentials are on file."}</p>
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

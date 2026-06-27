/**
 * LeadSummaryPanel — Pass 3A read-only "Key details" summary for the right rail /
 * mobile Summary tab. Pure/presentational (derived from the lead prop). Editing
 * still happens in the existing Contact/Project inline-edit blocks.
 */
import SectionCard from "../../ui/SectionCard.jsx";
import { projectTypeLabel } from "../../../lib/salesPipeline.js";

function Row({ k, v }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted">{k}</span>
      <span className="truncate text-right font-medium text-ink">{v}</span>
    </div>
  );
}

export default function LeadSummaryPanel({ lead }) {
  const money = lead.estimated_value ? `$${Number(lead.estimated_value).toLocaleString("en-AU")}` : "—";
  const owner = lead.owner_name || lead.owner;
  return (
    <SectionCard title="Key details">
      <Row k="Estimated value" v={money} />
      {lead.lead_type !== "architect_tender" && <Row k="Qualifying" v={`${lead.qualify_score ?? 0}/8`} />}
      <Row k="Suburb" v={lead.suburb || "—"} />
      <Row k="Project type" v={projectTypeLabel(lead.project_type)} />
      <Row k="Site address" v={lead.site_address || "—"} />
      {owner && <Row k="Owner" v={owner} />}
    </SectionCard>
  );
}

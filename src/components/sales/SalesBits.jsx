/**
 * Sales — small shared presentational bits (rot dot, score/money badges, stage pill).
 * Shared by SalesLeadCard (new) and the kept ListView in SalesPipeline.jsx so the two
 * stay visually identical. Logic preserved from the original page.
 */
import StatusBadge from "../ui/StatusBadge.jsx";
import { STAGES, daysSinceActivity, scoreVariant, formatValue } from "../../lib/salesPipeline.js";
import { LEAD_FIT_QUALITY_LABELS, LEAD_READINESS_LABELS } from "../../lib/constants.js";

export function RotDot({ lead }) {
  const days = daysSinceActivity(lead);
  if (days >= 30) return <span title={`No activity for ${days} days`} className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500" />;
  if (days >= 14) return <span title={`No activity for ${days} days`} className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-400" />;
  return null;
}

export function ScoreBadge({ score }) {
  if (score == null) return null;
  return <StatusBadge variant={scoreVariant(score)}>{score}/8</StatusBadge>;
}

export function MoneyBadge({ value }) {
  const f = formatValue(value);
  if (!f) return null;
  return <StatusBadge variant="money">{f}</StatusBadge>;
}

// CRM Control Spine (migration 127) — fit_quality + readiness chips. Reused in Pipeline rows,
// Lead Detail, and anywhere else a lead's fit needs to be shown at a glance. Labels come from
// constants.js (single source of truth); only the badge-colour variants live here.
const FIT_QUALITY_VARIANT = { strong: "success", possible: "info", nurture: "neutral", poor: "warning", price_shopper: "danger" };
const READINESS_VARIANT = { early_research: "neutral", not_ready_yet: "warning", ready_for_consult: "success" };

export function FitQualityBadge({ value }) {
  if (!value) return null;
  return <StatusBadge variant={FIT_QUALITY_VARIANT[value] || "neutral"}>{LEAD_FIT_QUALITY_LABELS[value] || value}</StatusBadge>;
}

export function ReadinessBadge({ value }) {
  if (!value) return null;
  return <StatusBadge variant={READINESS_VARIANT[value] || "neutral"}>{LEAD_READINESS_LABELS[value] || value}</StatusBadge>;
}

export function StagePill({ stageId }) {
  const s = STAGES.find((x) => x.id === stageId);
  if (!s) return <span className="text-xs text-muted">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${s.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

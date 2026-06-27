/**
 * Sales — small shared presentational bits (rot dot, score/money badges, stage pill).
 * Shared by SalesLeadCard (new) and the kept ListView in SalesPipeline.jsx so the two
 * stay visually identical. Logic preserved from the original page.
 */
import StatusBadge from "../ui/StatusBadge.jsx";
import { STAGES, daysSinceActivity, scoreVariant, formatValue } from "../../lib/salesPipeline.js";

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

// Procurement register item card (presentational) — mobile order/chase lookahead (not a squeezed
// table). Read-oriented summary; inline editing stays on the desktop table. No mutations here.
import StatusBadge from "../ui/StatusBadge.jsx";
import { PROCUREMENT_STATUS_LABELS, PROCUREMENT_RISK_LABELS, SUPPLY_TYPE_LABELS } from "../../lib/constants.js";

const RISK_VARIANT = { on_track: "success", watch: "warning", at_risk: "warning", critical: "danger", blocked: "blocked" };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "2-digit" }) : "—");

export default function ProcurementItemCard({ item, supplierName }) {
  const overdue = item.daysUntilOrderBy != null && item.daysUntilOrderBy < 0;
  return (
    <div className="rounded-lg border border-hairline bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-sm font-semibold text-ink">{item.itemName}</span>
        {item.riskStatus ? <StatusBadge variant={RISK_VARIANT[item.riskStatus] || "neutral"}>{PROCUREMENT_RISK_LABELS[item.riskStatus] || item.riskStatus}</StatusBadge> : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
        <span>{SUPPLY_TYPE_LABELS[item.supplyType] || item.supplyType}</span>
        <span className={overdue ? "font-semibold text-danger" : ""}>
          Order by {item.orderByDate ? fmtDate(item.orderByDate) : "needs date"}{item.daysUntilOrderBy != null ? ` · ${item.daysUntilOrderBy < 0 ? `${Math.abs(item.daysUntilOrderBy)}d overdue` : `${item.daysUntilOrderBy}d`}` : ""}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">{supplierName || "No supplier"}</span>
        <StatusBadge variant="neutral">{PROCUREMENT_STATUS_LABELS[item.status] || item.status}</StatusBadge>
      </div>
    </div>
  );
}

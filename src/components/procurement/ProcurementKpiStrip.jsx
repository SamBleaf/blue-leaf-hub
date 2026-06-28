// Procurement command-surface KPI strip (presentational) — derived from the command-centre buckets.
import KpiCard from "../ui/KpiCard.jsx";

export default function ProcurementKpiStrip({ buckets }) {
  const n = (k) => buckets?.[k]?.length || 0;
  const overdue = n("overdue");
  const dueSoon = n("dueSoon");
  const blocked = n("selectionBlockers");
  const longLead = n("longLeadCriticals");
  const needsDate = n("needsDate");
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <KpiCard label="Order-by overdue" value={String(overdue)} sub="past order-by date" tone={overdue > 0 ? "danger" : "muted"} />
      <KpiCard label="Due soon" value={String(dueSoon)} sub="within lead time" tone={dueSoon > 0 ? "warning" : "muted"} />
      <KpiCard label="Selection-blocked" value={String(blocked)} sub="awaiting decision" tone={blocked > 0 ? "danger" : "muted"} />
      <KpiCard label="Long-lead watch" value={String(longLead)} sub="order early" tone={longLead > 0 ? "warning" : "muted"} />
      <KpiCard label="Needs a date" value={String(needsDate)} sub="no order-by yet" tone={needsDate > 0 ? "warning" : "muted"} />
    </div>
  );
}

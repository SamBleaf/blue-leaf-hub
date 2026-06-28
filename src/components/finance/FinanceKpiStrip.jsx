// Finance manager home KPI strip (presentational). H4-A.
import KpiCard from "../ui/KpiCard.jsx";

export default function FinanceKpiStrip({ kpis }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <KpiCard label="Unmatched" value={String(kpis.unmatched)} sub="needs a job" tone={kpis.unmatched > 0 ? "warning" : "muted"} />
      <KpiCard label="Pending approval" value={String(kpis.pending)} sub="in the queue" tone={kpis.pending > 0 ? "primary" : "muted"} />
      <KpiCard label="Filed this month" value={String(kpis.filed)} sub="approved + filed" tone="success" />
      <KpiCard label="Total approved" value={kpis.totalApproved} sub="all jobs" tone="default" />
    </div>
  );
}

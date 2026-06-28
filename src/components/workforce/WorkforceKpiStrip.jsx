// Workforce home KPI strip (presentational). H4-A.
import KpiCard from "../ui/KpiCard.jsx";

export default function WorkforceKpiStrip({ kpis }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <KpiCard label="Pending approvals" value={String(kpis.pending)} sub="timesheets to review" tone={kpis.pending > 0 ? "warning" : "muted"} />
      <KpiCard label="Hours awaiting" value={String(kpis.hours)} sub="across pending" tone={kpis.pending > 0 ? "primary" : "muted"} />
      <KpiCard label="Crew" value={String(kpis.crew)} sub="active employees" tone="default" />
      <KpiCard label="App-linked" value={`${kpis.linked} / ${kpis.crew}`} sub="worker logins" tone="muted" />
    </div>
  );
}

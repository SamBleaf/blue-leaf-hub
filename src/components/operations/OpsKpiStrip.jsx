// Operations home KPI strip (presentational). Derives nothing — receives computed kpis.
import KpiCard from "../ui/KpiCard.jsx";

export default function OpsKpiStrip({ kpis }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <KpiCard label="Active projects" value={String(kpis.active)} sub="in build" tone="primary" />
      <KpiCard label="On track" value={String(kpis.onTrack)} sub="health green" tone="success" />
      <KpiCard label="At risk" value={String(kpis.atRisk)} sub="needs attention" tone="warning" />
      <KpiCard label="Behind" value={String(kpis.behind)} sub="4+ overdue" tone="danger" />
      <KpiCard label="Overdue tasks" value={String(kpis.overdue)} sub="across projects" tone={kpis.overdue > 0 ? "danger" : "muted"} />
    </div>
  );
}

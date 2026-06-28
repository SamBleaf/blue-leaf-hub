// Tender/RFQ home KPI strip (presentational).
import KpiCard from "../ui/KpiCard.jsx";

export default function TenderKpiStrip({ kpis }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <KpiCard label="Active tenders" value={String(kpis.active)} sub="out to market" tone="primary" />
      <KpiCard label="Missing quotes" value={String(kpis.missing)} sub="across packages" tone={kpis.missing > 0 ? "warning" : "muted"} />
      <KpiCard label="Chases due" value={String(kpis.chase)} sub="no response" tone={kpis.chase > 0 ? "danger" : "muted"} />
      <KpiCard label="Ready to award" value={String(kpis.ready)} sub="quotes complete" tone={kpis.ready > 0 ? "success" : "muted"} />
      <KpiCard label="Won" value={String(kpis.won)} sub="recent" tone="success" />
    </div>
  );
}

// Operations job KPI / health strip (presentational). Receives computed items.
import KpiCard from "../ui/KpiCard.jsx";

export default function OpsJobKpiStrip({ items = [] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((k) => (
        <KpiCard key={k.label} label={k.label} value={k.value} sub={k.sub} tone={k.tone} />
      ))}
    </div>
  );
}

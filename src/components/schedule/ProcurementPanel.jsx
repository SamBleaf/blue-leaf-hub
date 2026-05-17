import { addDaysSafe, computeOrderByDate } from "../../lib/scheduleUtils.js";

export default function ProcurementPanel({ task, onChange }) {
  if (!task || task.task_type !== "procurement") return null;
  const leadDays = task.procurement_lead_days ?? "";
  const calculated = computeOrderByDate(task);

  return (
    <section className="mt-4 rounded-lg border border-hairline bg-page p-3">
      <h3 className="text-sm font-bold text-primary">Procurement</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-muted">
          Material / item
          <input value={task.procurement_item || ""} onChange={(e) => onChange({ procurement_item: e.target.value })} className="mt-1 w-full rounded-lg border border-hairline bg-surface px-2 py-2 text-sm text-ink" />
        </label>
        <label className="block text-xs font-semibold text-muted">
          Supplier / trade
          <input value={task.procurement_supplier || ""} onChange={(e) => onChange({ procurement_supplier: e.target.value })} className="mt-1 w-full rounded-lg border border-hairline bg-surface px-2 py-2 text-sm text-ink" />
        </label>
        <label className="block text-xs font-semibold text-muted">
          Lead time (days)
          <input
            type="number"
            min={0}
            value={leadDays}
            onChange={(e) => {
              const next = e.target.value === "" ? "" : Number(e.target.value);
              const orderBy = next === "" ? "" : addDaysSafe(task.start_date, -next);
              onChange({ procurement_lead_days: next, procurement_order_by: orderBy, order_by_date: orderBy });
            }}
            className="mt-1 w-full rounded-lg border border-hairline bg-surface px-2 py-2 text-sm text-ink"
          />
        </label>
        <label className="block text-xs font-semibold text-muted">
          Order status
          <select value={task.procurement_order_status || "not_ordered"} onChange={(e) => onChange({ procurement_order_status: e.target.value })} className="mt-1 w-full rounded-lg border border-hairline bg-surface px-2 py-2 text-sm text-ink">
            <option value="not_ordered">Not ordered</option>
            <option value="ordered">Ordered</option>
            <option value="delivered">Delivered</option>
          </select>
        </label>
      </div>
      <p className="mt-3 rounded border border-hairline bg-surface px-2 py-2 text-xs text-muted">
        Order by: <span className="font-mono font-semibold text-ink">{calculated || "Set a start date and lead time"}</span>
      </p>
    </section>
  );
}

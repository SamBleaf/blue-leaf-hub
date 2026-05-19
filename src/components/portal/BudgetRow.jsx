import { formatCurrency } from "../../lib/portalUtils.js";

const STATUS_CHIP = {
  paid: "bg-success/10 text-success",
  invoiced: "bg-primary/10 text-primary",
  upcoming: "bg-gray-100 text-muted"
};

export default function BudgetRow({ label, amount, status, secondary, highlight }) {
  const chip = status ? STATUS_CHIP[status] || STATUS_CHIP.upcoming : null;
  return (
    <div
      className={`flex items-center justify-between py-2.5 ${
        highlight ? "border-t border-b border-hairline my-1 -mx-6 px-6 bg-page" : ""
      }`}
    >
      <span className={`text-sm ${secondary ? "text-muted" : "text-ink"}`}>{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm font-mono font-medium text-ink">{formatCurrency(amount)}</span>
        {status && chip && (
          <span className={`text-xs font-semibold rounded-full px-2 py-0.5 capitalize ${chip}`}>
            {status}
          </span>
        )}
      </div>
    </div>
  );
}

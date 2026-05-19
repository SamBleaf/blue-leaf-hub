import { getPortalBudget } from "../../lib/portalApi.js";
import { formatCurrency } from "../../lib/portalUtils.js";
import { usePortalData } from "../../hooks/usePortalData.js";
import { usePortal } from "./portalContext.js";
import PortalPageSkeleton from "../../components/portal/PortalPageSkeleton.jsx";
import PortalEmptyState from "../../components/portal/PortalEmptyState.jsx";
import BudgetRow from "../../components/portal/BudgetRow.jsx";

export default function PortalBudget() {
  const { token } = usePortal();
  const { data, loading, error } = usePortalData(() => getPortalBudget(token), [token]);

  if (loading) return <PortalPageSkeleton />;
  if (error) return <PortalEmptyState title="Could not load" message={error.message} />;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 pb-24 md:pb-8 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">Your investment</p>
      <div className="bg-surface rounded-2xl border border-hairline p-6">
        <BudgetRow label="Original contract value" amount={data.contractValue} />
        <BudgetRow label="Approved variations" amount={data.approvedVariationsTotal} secondary />
        {data.pendingVariationsTotal > 0 && (
          <BudgetRow
            label="Pending variations (awaiting approval)"
            amount={data.pendingVariationsTotal}
            secondary
          />
        )}
        <BudgetRow label="Current total" amount={data.currentTotal} highlight />
      </div>

      {data.claims?.length > 0 && (
        <div className="bg-surface rounded-2xl border border-hairline p-6 mt-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
            Progress claims
          </p>
          {data.claims.map((c) => (
            <BudgetRow
              key={c.id}
              label={c.stageName}
              amount={c.amount}
              status={c.status}
              secondary={c.status === "paid"}
            />
          ))}
        </div>
      )}

      {data.variationsLog?.length > 0 && (
        <div className="bg-surface rounded-2xl border border-hairline p-6 mt-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">Variations</p>
          {data.variationsLog.map((v) => (
            <div key={v.id} className="flex justify-between gap-2 py-2 text-sm border-b border-hairline last:border-0">
              <span className="text-ink flex-1">{v.title}</span>
              <span className="font-medium">{formatCurrency(v.costDelta)}</span>
              <span className="text-muted capitalize text-xs">{v.status}</span>
            </div>
          ))}
        </div>
      )}

      {data.allowances?.length > 0 && (
        <div className="bg-surface rounded-2xl border border-hairline p-6 mt-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
            Selections allowances
          </p>
          {data.allowances.map((a) => {
            const over = (a.selectedTotal || 0) - a.allowance;
            return (
              <div key={a.id} className="flex justify-between py-2 text-sm border-b border-hairline last:border-0">
                <span className="text-ink">{a.category}</span>
                <span>
                  {formatCurrency(a.allowance)}
                  {a.selectedTotal == null ? (
                    <span className="text-muted ml-2">TBC</span>
                  ) : over > 0 ? (
                    <span className="text-warning ml-2">+{formatCurrency(over)} over</span>
                  ) : (
                    <span className="text-success ml-2">+{formatCurrency(-over)} under</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

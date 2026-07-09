import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/apiFetch.js";

// Xero integration status + approval-threshold note. Extracted from FinanceManager's
// "Settings" tab (the tab keeps working — it renders this same pane) so /settings/xero
// can show it standalone without re-fetching FinanceManager's inbox/approvals data.
export default function XeroPane() {
  const [xeroStatus, setXeroStatus] = useState(null);

  useEffect(() => {
    let stop = false;
    apiFetch("/api/finance/xero/status").then(({ ok, data }) => {
      if (!stop && ok) setXeroStatus(data);
    });
    return () => { stop = true; };
  }, []);

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h3 className="text-sm font-bold text-ink mb-1">Xero Integration</h3>
        <p className="text-xs text-muted mb-4">Connect Xero to automatically create draft bills when invoices are approved and track progress claims for WIP calculations.</p>
        <div className="rounded-card border border-hairline bg-surface p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-ink">
              {xeroStatus?.connected ? `Connected — ${xeroStatus.tenant}` : "Not connected"}
            </div>
            <div className="text-xs text-muted mt-0.5">
              {xeroStatus?.connected ? "Bills will be created automatically on approval" : "Phase 2 — coming soon"}
            </div>
          </div>
          <button
            type="button"
            disabled={!xeroStatus?.connected}
            className="rounded-lg border border-hairline bg-page px-4 py-2 text-sm font-semibold text-muted cursor-not-allowed opacity-50"
          >
            {xeroStatus?.connected ? "Disconnect" : "Connect Xero"}
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-ink mb-1">Approval thresholds</h3>
        <p className="text-xs text-muted">Set <code>FINANCE_AUTO_APPROVE_BELOW</code> on the server to auto-approve exact-matched invoices under a dollar amount. Currently disabled — all invoices go to the approval queue.</p>
      </div>
    </div>
  );
}

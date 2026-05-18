import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import FinancialInbox from "../components/finance/FinancialInbox.jsx";
import ApprovalQueue from "../components/finance/ApprovalQueue.jsx";
import JobFinancials from "../components/finance/JobFinancials.jsx";

const TABS = [
  { id: "inbox", label: "Inbox" },
  { id: "approvals", label: "Approvals" },
  { id: "jobs", label: "Job View" },
  { id: "settings", label: "Settings" },
];

function fmtCurrency(n) {
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}

function StatChip({ label, value, color = "text-ink" }) {
  return (
    <div className="rounded-card border border-hairline bg-surface px-4 py-3 text-center">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function XeroSettings({ xeroStatus }) {
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

export default function FinanceManager() {
  const { tab: tabParam } = useParams();
  const navigate = useNavigate();
  const tab = TABS.find(t => t.id === tabParam)?.id || "inbox";
  const setTab = (id) => navigate(id === "inbox" ? "/finance" : `/finance/${id}`, { replace: true });
  const [stats, setStats] = useState(null);
  const [xeroStatus, setXeroStatus] = useState(null);

  const loadStats = useCallback(async () => {
    try {
      const [sr, xr] = await Promise.all([
        fetch("/api/finance/stats").then(r => r.json()),
        fetch("/api/finance/xero/status").then(r => r.json())
      ]);
      if (sr.ok) setStats(sr);
      if (xr.ok) setXeroStatus(xr);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const pendingCount = stats?.counts?.pending_approval || 0;

  return (
    <div className="space-y-6 pb-24">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Finance Manager</p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">Job cost intelligence</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Capture invoices and receipts, match them to jobs automatically, approve and file to Dropbox.
        </p>
      </header>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatChip label="Unmatched" value={stats.counts?.unmatched || 0} color="text-warning" />
          <StatChip label="Pending approval" value={pendingCount} color={pendingCount > 0 ? "text-primary" : "text-ink"} />
          <StatChip label="Filed this month" value={stats.counts?.filed || 0} color="text-accent" />
          <StatChip label="Total approved" value={fmtCurrency(stats.totalApprovedValue)} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-page p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`relative rounded-md px-4 py-1.5 text-sm font-semibold transition ${tab === t.id ? "bg-primary text-white" : "text-muted hover:bg-surface hover:text-ink"}`}
          >
            {t.label}
            {t.id === "approvals" && pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "inbox" && <FinancialInbox onUploaded={loadStats} />}
      {tab === "approvals" && <ApprovalQueue onAction={loadStats} />}
      {tab === "jobs" && <JobFinancials />}
      {tab === "settings" && <XeroSettings xeroStatus={xeroStatus} />}
    </div>
  );
}

import { authFetch } from "../lib/authFetch.js";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import FinancialInbox from "../components/finance/FinancialInbox.jsx";
import ApprovalQueue from "../components/finance/ApprovalQueue.jsx";
import FinanceKpiStrip from "../components/finance/FinanceKpiStrip.jsx";

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

function FinanceSettings() {
  // Finance settings (Xero connection + approval thresholds) live in the canonical
  // Settings → Integrations → Xero pane. This tab just points there to avoid a second,
  // drifting copy.
  return (
    <div className="space-y-4 max-w-lg">
      <div className="rounded-card border border-hairline bg-surface p-4">
        <h3 className="text-sm font-bold text-ink mb-1">Finance settings have moved</h3>
        <p className="text-xs text-muted mb-3">
          The Xero connection and invoice approval thresholds are now managed in one place under
          Settings → Integrations → Xero.
        </p>
        <Link
          to="/settings/integrations#xero"
          className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Open Settings → Integrations → Xero
        </Link>
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

  const loadStats = useCallback(async () => {
    try {
      const sr = await authFetch("/api/finance/stats").then(r => r.json());
      if (sr.ok) setStats(sr);
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

      {/* KPI strip */}
      {stats && (
        <FinanceKpiStrip
          kpis={{
            unmatched: stats.counts?.unmatched || 0,
            pending: pendingCount,
            filed: stats.counts?.filed || 0,
            totalApproved: fmtCurrency(stats.totalApprovedValue),
          }}
        />
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
      {/* "Job View" tab navigates to /finance/jobs (JobDashboardSelector — Director Portfolio);
          the legacy inline JobFinancials render was unreachable dead code (removed). */}
      {tab === "settings" && <FinanceSettings />}
    </div>
  );
}

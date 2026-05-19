import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-50 text-blue-700",
  received: "bg-green-50 text-green-700",
  active: "bg-primary/10 text-primary",
  archived: "bg-slate-100 text-muted",
};

function CoverageBar({ score }) {
  const color = score >= 75 ? "bg-green-500" : score >= 50 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted">Trade coverage</span>
        <span className={`text-xs font-bold ${score >= 75 ? "text-green-600" : score >= 50 ? "text-amber-600" : "text-red-500"}`}>{score}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-hairline overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function PackageStatusSummary({ scopes }) {
  const trades = scopes?.length || 0;
  const sent = (scopes || []).filter((s) => ["sent", "followed_up"].includes(s.status)).length;
  const received = (scopes || []).filter((s) => s.status === "received").length;
  const pending = sent - received;
  const totalRecipients = (scopes || []).reduce((n, s) => n + (s.rfq_recipients?.length || 0), 0);
  return (
    <div className="mt-3 grid grid-cols-4 gap-2 text-center">
      {[
        { label: "Trades", value: trades },
        { label: "Recipients", value: totalRecipients },
        { label: "Pending", value: pending },
        { label: "Quotes in", value: received },
      ].map(({ label, value }) => (
        <div key={label} className="rounded-lg bg-page p-2">
          <div className="text-base font-bold text-ink">{value}</div>
          <div className="text-[10px] text-muted">{label}</div>
        </div>
      ))}
    </div>
  );
}

function FollowUpAlert({ scopes }) {
  const today = new Date();
  const overdue = (scopes || []).flatMap((s) =>
    (s.rfq_recipients || []).filter((r) => {
      if (!["sent", "followed_up"].includes(r.status)) return false;
      if (!r.follow_up_due) return false;
      return new Date(r.follow_up_due) < today;
    })
  );
  if (!overdue.length) return null;
  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/8 px-3 py-2">
      <span className="text-warning text-sm">⏰</span>
      <span className="text-xs text-ink font-medium">{overdue.length} follow-up{overdue.length !== 1 ? "s" : ""} overdue</span>
    </div>
  );
}

export default function RfqPackageList() {
  const navigate = useNavigate();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("active");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/rfq-packages");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Load failed");
      setPackages(j.packages || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = filter === "all"
    ? packages
    : packages.filter((p) => p.status === filter);

  if (loading) return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-hairline border-t-primary" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">RFQ Packages</h1>
          <p className="caption mt-0.5">Persistent tender packages — reopen, edit, track, and send additional RFQs.</p>
        </div>
        <div className="flex items-center gap-2">
          {["active", "archived", "all"].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition ${
                filter === f ? "border-primary bg-primary/10 text-primary" : "border-hairline text-muted hover:text-ink"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="rounded-card border border-hairline bg-surface p-12 text-center">
          <div className="text-4xl mb-3">📦</div>
          <div className="text-base font-semibold text-ink mb-1">No RFQ packages yet</div>
          <p className="text-sm text-muted max-w-xs mx-auto">
            Packages are created automatically when you complete an RFQ send in the RFQ Engine.
          </p>
          <button
            type="button"
            onClick={() => navigate("/tender-manager/rfq-engine")}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Go to RFQ Engine
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((pkg) => (
          <div
            key={pkg.id}
            className="rounded-card border border-hairline bg-surface p-5 hover:border-primary/30 hover:shadow-sm transition cursor-pointer"
            onClick={() => navigate(`/tender-manager/rfq-packages/${pkg.id}`)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-ink text-sm leading-tight truncate">{pkg.project_address || "Unnamed project"}</div>
                {pkg.project_type && <div className="text-xs text-muted mt-0.5">{pkg.project_type}</div>}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_COLORS[pkg.status] || STATUS_COLORS.active}`}>
                {pkg.status}
              </span>
            </div>

            {pkg.tender_deadline && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <span>📅</span>
                <span>Tender due <span className="font-semibold text-ink">{pkg.tender_deadline}</span></span>
              </div>
            )}
            {pkg.architect_client && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                <span>🏛</span>
                <span>{pkg.architect_client}</span>
              </div>
            )}

            <PackageStatusSummary scopes={pkg.rfq_trade_scopes} />
            <CoverageBar score={pkg.coverage_score || 0} />
            <FollowUpAlert scopes={pkg.rfq_trade_scopes} />

            <div className="mt-3 pt-3 border-t border-hairline flex items-center justify-between">
              <span className="text-[10px] text-muted">
                {new Date(pkg.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              <span className="text-xs font-semibold text-primary">Open →</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

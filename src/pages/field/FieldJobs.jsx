import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/useAuth.js";
import { can } from "../../lib/roles.js";
import { apiFetch } from "../../lib/apiFetch.js";
import { Card, Loading, Empty, PageTitle, fmtDate } from "../clientportal/clientPortalUi.jsx";

const FILTERS = [
  { key: "active", label: "Active" },
  { key: "defects", label: "Defects" },
  { key: "on_hold", label: "On hold" },
  { key: "complete", label: "Complete" },
];

export default function FieldJobs() {
  const { role } = useAuth();
  const showCost = can.viewCostData(role);
  const [status, setStatus] = useState("active");
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stop = false;
    setLoading(true);
    apiFetch(`/api/carpentry/jobs?status=${status}`).then(({ ok, data }) => {
      if (stop) return;
      setJobs(ok ? data?.jobs || [] : []);
      setLoading(false);
    });
    return () => { stop = true; };
  }, [status]);

  const sorted = useMemo(
    () => [...jobs].sort((a, b) => (a.reference || "").localeCompare(b.reference || "")),
    [jobs]
  );

  return (
    <div className="space-y-4">
      <PageTitle sub="Build days, scope and tasks — no $ figures">Jobs</PageTitle>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`min-h-[36px] rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              status === f.key ? "bg-primary text-white" : "border border-hairline bg-surface text-muted hover:bg-page"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading label="Loading jobs…" />
      ) : sorted.length === 0 ? (
        <Empty title={`No ${status.replace("_", " ")} jobs`} />
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="divide-y divide-hairline">
            {sorted.map((j) => (
              <Link key={j.id} to={`/carpentry/${j.id}`} className="block px-4 py-3 hover:bg-page transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink truncate">{j.reference || j.clientName || "Job"}</p>
                  <span className="text-[11px] text-muted shrink-0 capitalize">{String(j.status || "").replace("_", " ")}</span>
                </div>
                {j.clientName && <p className="text-xs text-muted truncate">{j.clientName}</p>}
                <p className="text-xs text-muted truncate">{j.address}</p>
                {(j.startDate || j.endDate) && (
                  <p className="text-[11px] text-muted mt-0.5">{fmtDate(j.startDate)} → {fmtDate(j.endDate)}</p>
                )}
                {showCost && j.quotedValue != null && (
                  <p className="text-[11px] text-muted mt-0.5">Quoted ${Number(j.quotedValue).toLocaleString()} ex-GST</p>
                )}
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

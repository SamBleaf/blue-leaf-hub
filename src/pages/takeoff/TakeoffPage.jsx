// =============================================================================
// TakeoffPage — Hub entry (staff). Thin wrapper: resolves the job reference from the route and
// mounts the shared TakeoffApp with the staff API adapter inside the existing AppShell.
//   /carpentry/:jobId/takeoff                 → carpentry job
//   /operations/:projectId/takeoff            → construction project (resolves to its job)
//   /carpentry/:jobId/sites/:siteId/takeoff   → BLB Charge Up site
// =============================================================================
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import TakeoffApp from "../../components/takeoff/TakeoffApp.jsx";
import { createStaffTakeoffApi } from "../../lib/takeoffApi.js";
import { apiFetch } from "../../lib/apiFetch.js";

export default function TakeoffPage({ jobType }) {
  const params = useParams();
  const api = useMemo(() => createStaffTakeoffApi(), []);
  const jobId = jobType === "project" ? params.projectId : jobType === "charge-up" ? params.siteId : params.jobId;
  const back = jobType === "project" ? `/operations/${params.projectId}` : `/carpentry/${params.jobId}`;

  async function externalView(docId) {
    const win = window.open("about:blank", "_blank");
    const { ok, data } = await apiFetch(`/api/job-plans/${docId}/download`);
    if (ok && data?.signedUrl && win) win.location.href = data.signedUrl;
    else win?.close();
  }

  return (
    <div className="min-h-full bg-page">
      <div className="mx-auto max-w-3xl px-3 pt-3">
        <Link to={back} className="inline-flex min-h-[44px] items-center text-sm text-primary hover:underline">‹ Back to job</Link>
      </div>
      <TakeoffApp api={api} jobType={jobType} jobId={jobId} onExternalView={externalView} />
    </div>
  );
}

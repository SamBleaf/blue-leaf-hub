// =============================================================================
// WorkerTakeoff — Worker PWA entry (stays under /worker so the installed app's scope holds).
// Same TakeoffApp as the Hub, with the worker API adapter. The server decides capability
// (leading hands prepare; ordinary workers have no takeoff access; admin preview is read-only).
//   /worker/takeoff/:jobType/:jobId   jobType = carpentry | project | charge-up
// =============================================================================
import { useEffect, useMemo } from "react";
import { resetScrollLocks } from "../../components/takeoff/focusMode.js";
import { useParams } from "react-router-dom";
import WorkerLayout from "../../components/worker/WorkerLayout.jsx";
import TakeoffApp from "../../components/takeoff/TakeoffApp.jsx";
import { createWorkerTakeoffApi } from "../../lib/takeoffApi.js";
import { workerFetch } from "../../lib/workerFetch.js";

export default function WorkerTakeoff() {
  // leaving the takeoff route always gives the page its scrolling back, even mid-overlay
  useEffect(() => () => resetScrollLocks(), []);
  const { jobType, jobId } = useParams();
  const api = useMemo(() => createWorkerTakeoffApi(), []);

  async function externalView(docId) {
    const win = window.open("about:blank", "_blank");
    try {
      const r = await workerFetch(`/api/worker/plans/${docId}/download`);
      const j = await r.json();
      if (j.ok && j.signedUrl && win) win.location.href = j.signedUrl; else win?.close();
    } catch { win?.close(); }
  }

  return (
    <WorkerLayout>
      <TakeoffApp api={api} jobType={jobType} jobId={jobId} onExternalView={externalView} />
    </WorkerLayout>
  );
}

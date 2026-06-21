// Persisted "which job am I on" selection for the Worker PWA.
//
// The Site-tasks screen and the Home badge both read this so they always agree.
// We no longer infer the job from the latest timesheet (that hid freshly-added
// tasks) — the worker picks a job once and it sticks until they change it.

const KEY = "blhub_worker_job";

export function getSelectedJob() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (j && j.id && j.type) return j;
    return null;
  } catch {
    return null;
  }
}

export function setSelectedJob(job) {
  try {
    if (!job || !job.id) {
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, JSON.stringify({ id: job.id, type: job.type, address: job.address || "" }));
  } catch {
    /* ignore */
  }
}

// Query-string suffix (e.g. "jobId=…&jobType=…") for worker endpoints, or "".
export function selectedJobQuery() {
  const j = getSelectedJob();
  if (!j) return "";
  return `jobId=${encodeURIComponent(j.id)}&jobType=${encodeURIComponent(j.type)}`;
}

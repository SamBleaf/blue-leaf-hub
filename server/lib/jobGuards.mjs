/** Draft sentinel — job created from RFQ extraction before address is known. */
export const PLACEHOLDER_ADDRESS = "Address pending";

export function isAddressPending(address) {
  const a = String(address || "").trim();
  return !a || a.toLowerCase() === PLACEHOLDER_ADDRESS.toLowerCase();
}

/**
 * Block RFQ package / tender send handoff when job still has placeholder address.
 * SAM-W04-001 / P0-A3.
 */
export async function assertJobReadyForRfqHandoff(sb, jobId) {
  const id = String(jobId || "").trim();
  if (!id) {
    return { ok: false, status: 400, error: "job_id required.", code: "JOB_ID_REQUIRED" };
  }
  const { data: job, error } = await sb.from("jobs").select("id, address").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!job) {
    return { ok: false, status: 404, error: "Job not found.", code: "NOT_FOUND" };
  }
  if (isAddressPending(job.address)) {
    return {
      ok: false,
      status: 409,
      error:
        'Set a real site address on this job before RFQ or tender handoff. "Address pending" is a draft placeholder only.',
      code: "JOB_ADDRESS_PENDING",
    };
  }
  return { ok: true, job };
}

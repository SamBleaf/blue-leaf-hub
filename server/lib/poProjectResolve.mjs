/**
 * Resolve purchase_orders.project_id from job spine when client omits projectId (P0-C1).
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{ projectId?: string, jobId?: string }} opts
 * @returns {Promise<string>}
 */
export async function resolvePurchaseOrderProjectId(sb, { projectId, jobId } = {}) {
  const pid = String(projectId || "").trim();
  if (pid) return pid;

  const jid = String(jobId || "").trim();
  if (!jid) return "";

  const { data, error } = await sb
    .from("projects")
    .select("id")
    .eq("job_id", jid)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ? String(data.id) : "";
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} rfqId
 */
export async function findPurchaseOrderByRfqId(sb, rfqId) {
  const id = String(rfqId || "").trim();
  if (!id) return null;
  const { data, error } = await sb.from("purchase_orders").select("*").eq("rfq_id", id).maybeSingle();
  if (error) throw error;
  return data;
}

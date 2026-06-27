/**
 * DISC-002-FINANCE-FEE-LINK-01 — shared "stamp the accepted fee proposal back onto the lead".
 *
 * Originally only the sales accept route (POST /api/fee-proposal/:id/accept, W03-FEE-LINK-01)
 * stamped leads.fee_proposal_id; the finance accept route
 * (POST /api/finance/fee-proposals/:id/accept) did not — so finance-accepted proposals lost the
 * lead → accepted-commercial-path link that W04/tender handoff relies on.
 *
 * Both accept routes now call this helper so the behaviour can never drift again.
 *
 * Contract: resolve jobs.lead_id by jobId; if a lead is linked, set leads.fee_proposal_id.
 * Safe (returns { linked:false }) when there is no jobId, no job, or no linked lead — never
 * fabricates a link. DB errors propagate (await, no swallow) so a genuine failure still surfaces
 * to the caller exactly as the original inline sales code did.
 */
export async function stampLeadFeeProposalLink(sb, jobId, proposalId) {
  if (!sb || !jobId || !proposalId) return { linked: false, reason: "missing-args" };
  const { data: jobRow } = await sb.from("jobs").select("lead_id").eq("id", jobId).maybeSingle();
  if (!jobRow?.lead_id) return { linked: false, reason: "no-lead" };
  await sb
    .from("leads")
    .update({ fee_proposal_id: proposalId, updated_at: new Date().toISOString() })
    .eq("id", jobRow.lead_id);
  return { linked: true, leadId: jobRow.lead_id };
}

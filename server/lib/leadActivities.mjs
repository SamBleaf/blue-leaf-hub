/**
 * Unified "Lead created" audit row for all lead creation paths (W01 P0-A2).
 */
export async function insertLeadCreatedActivity(sb, leadId) {
  if (!sb || !leadId) return;
  const { error } = await sb.from("lead_activities").insert({
    lead_id: leadId,
    activity_type: "note",
    summary: "Lead created",
  });
  if (error) console.warn("[lead_activities] Lead created:", error.message || error);
}

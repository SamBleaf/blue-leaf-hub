/**
 * Best display name for a lead row — website enquiries use `name`; manual/CRM use first/last.
 * Accepts snake_case (sales API) or camelCase (rowToCamel responses).
 */
export function displayLeadName(lead, fallback = "Unnamed lead") {
  if (!lead) return fallback;

  const single = (lead.name || "").trim();
  if (single) return single;

  const first = (lead.first_name || lead.firstName || "").trim();
  const last = (lead.last_name || lead.lastName || "").trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;

  const email = (lead.email || "").trim();
  return email || fallback;
}

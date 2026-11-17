/**
 * architectNameSync.mjs — one architect, one place (Master Register owner decision 6, 17 Nov 2026).
 *
 * The architect's name lives on the design-team contact (job_contact_roles → crm_contacts). The job's architect_name
 * follows it (salesRoutes setArchitectName). When the name is typed anywhere else (the job PATCH the RFQ Engine uses, the
 * fee-proposal wizard), we don't silently end up with two architects: we flag it, and the person is asked
 * "Change it everywhere?". Yes changes the design-team contact (the existing design-team save, with `replaces`); No leaves
 * everything as it was.
 *
 *   sameArchitectName(a, b)             pure: do two typed names mean the same architect?
 *   architectNameFlag(team, name)       pure: the flag for a typed name against the design team, or null
 *   loadArchitectFlag(sb, { jobId | leadId }, name)   the same, reading the design team from the database
 */
import { loadRegisterContext } from "./registerContext.mjs";

const ARCHITECT_ROLES = new Set(["architect", "designer", "interior_designer"]);
const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\b(pty|ltd|pl|the)\b/g, " ").replace(/\s+/g, " ").trim();

/** Every way the design-team contact is rightly written: the firm, the person, "Person, Firm", "Firm (Person)". */
export function architectLabels(c) {
  const name = String(c?.name || "").trim(), company = String(c?.company || "").trim();
  return [company, name, name && company ? `${name}, ${company}` : "", name && company ? `${company} (${name})` : "", name && company ? `${name} (${company})` : ""].filter(Boolean);
}
export function sameArchitectName(a, b) { const x = norm(a), y = norm(b); return !!x && x === y; }

/**
 * The flag for a name typed outside the register, or null when there is nothing to ask: nothing typed, no architect on the
 * design team yet (the name then stays where it was typed, "Noted in Sales"), or it is the same architect.
 * team: the register context's consultants. → { current, proposed, roleId, contactId, role } | null
 */
export function architectNameFlag(team, typed) {
  const proposed = String(typed == null ? "" : typed).trim();
  if (!proposed) return null;
  const arch = (team || []).filter((c) => ARCHITECT_ROLES.has(c.role) && !["completed", "inactive"].includes(c.status)).sort((a, b) => (a.role === "architect" ? 0 : 1) - (b.role === "architect" ? 0 : 1))[0];
  if (!arch) return null;
  if (architectLabels(arch).some((l) => sameArchitectName(l, proposed))) return null;
  return { current: String(arch.company || arch.name || "").trim(), proposed, roleId: arch.roleId || null, contactId: arch.contactId || null, role: arch.role === "architect" ? "architect" : arch.role };
}

/** The same, from the database: the lead is given, or found from the job. → { leadId, flag } (flag null when nothing to ask). */
export async function loadArchitectFlag(sb, { jobId = null, leadId = null }, typed) {
  let id = leadId;
  if (!id && jobId) {
    const { data } = await sb.from("leads").select("id").eq("job_id", jobId).limit(1).maybeSingle();
    id = data?.id || null;
  }
  if (!id) return { leadId: null, flag: null };
  const ctx = await loadRegisterContext(sb, id);
  return { leadId: id, flag: architectNameFlag(ctx?.consultants, typed) };
}

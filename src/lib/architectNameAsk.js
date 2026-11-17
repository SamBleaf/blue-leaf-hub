/**
 * architectNameAsk.js — "Change it everywhere?" (Master Register owner decision 6; answer of 17 Nov 2026).
 *
 * The architect's name is kept in one place: the design-team contact on the lead and job. When someone types a different
 * name somewhere else (the fee-proposal wizard, the RFQ Engine's job update), the server flags it
 * (server/lib/architectNameSync.mjs → architectNameFlag) and this asks. Yes changes the design-team contact, through the
 * same save as the register's "Change" on the architect (which also updates the job's name). No changes nothing: the name
 * typed stays only where it was typed.
 */
// apiFetch is loaded on demand so the pure parts (and the node test) don't pull in the browser client.
const defaultPost = async (url, body) => (await import("./apiFetch.js")).apiPost(url, body);

/** The question, in the owner's words. */
export function changeEverywhereQuestion(flag) {
  const who = flag?.current ? `“${flag.current}”` : "someone else";
  return `The architect on this project's design team is ${who}. You've entered “${flag?.proposed}”.\n\nChange it everywhere?\n\nOK changes the design team (the register, the brief, the job). Cancel keeps the design team as it is.`;
}

/**
 * Ask, and on yes change the design-team contact. → { asked, changed, error? }. Never throws.
 * Injectable for tests: ask(text) → boolean, post(url, body) → { ok, error }.
 */
export async function settleArchitectName(flag, { ask = (t) => (typeof window !== "undefined" ? window.confirm(t) : false), post = defaultPost } = {}) {
  if (!flag || !flag.proposed || !flag.leadId) return { asked: false, changed: false };
  if (!ask(changeEverywhereQuestion(flag))) return { asked: true, changed: false };
  const body = { role: flag.role || "architect", name: flag.proposed, ...(flag.roleId || flag.contactId ? { replaces: { roleId: flag.roleId || null, contactId: flag.contactId || null } } : {}) };
  const r = await post(`/api/sales/leads/${flag.leadId}/design-team`, body);
  return r?.ok ? { asked: true, changed: true } : { asked: true, changed: false, error: r?.error || "Couldn't change the architect. Nothing was changed." };
}

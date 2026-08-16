// calcom.mjs — Sales OS Slice 1: shared cal.com config + the per-lead "build conversation" link.
// The client-facing meeting keeps the website's own name (a "build conversation"). The Qualify
// booking link carries metadata[leadId] so the webhook (calcomWebhook.mjs) can attach the booking
// to the EXISTING lead instead of the website's new-lead funnel minting a duplicate. Defaults match
// the site's embed (cal.com/blue-leaf-build/build-conversation); override via env for a distinct
// Qualify-only event.

export function calcomConfig() {
  return {
    username: (process.env.CAL_USERNAME || "blue-leaf-build").trim(),
    eventSlug: (process.env.CAL_EVENT_SLUG || "build-conversation").trim(),
  };
}

/** Prefilled public booking link for a lead. metadata[leadId] is appended literally (uuid is URL-safe). */
export function buildLeadBookingLink(lead = {}) {
  const { username, eventSlug } = calcomConfig();
  const name = (lead.name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "").trim();
  const p = new URLSearchParams();
  if (name) p.set("name", name);
  if (lead.email) p.set("email", String(lead.email));
  const base = p.toString();
  const parts = [];
  if (base) parts.push(base);
  if (lead.id) parts.push(`metadata[leadId]=${lead.id}`);
  const url = `https://cal.com/${username}/${eventSlug}`;
  return parts.length ? `${url}?${parts.join("&")}` : url;
}

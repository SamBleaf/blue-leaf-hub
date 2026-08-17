// calcom.mjs — sales pipeline cal.com config, the meeting-type registry, and per-lead booking links.
//
// Every pipeline meeting is a registry entry: enquiry call, build conversation, designer concept
// meeting, winning-offer presentation. Each maps to a cal.com event slug (env-overridable) + the
// stage it belongs to + a default booking mode (self = client books via a link; on_behalf = the Hub
// books via the cal.com API; both = either). Adding a meeting type = one entry here + one in
// constants.MEETING_TYPES + a cal.com event type Sam creates — no new integration code.
//
// A booking link prefills the attendee AND carries leadId + meetingType as HIDDEN BOOKING QUESTIONS
// (the reliable webhook round-trip — cal.com's `metadata` query param has an open drop bug #16140).
// metadata[leadId] is kept as a belt-and-braces fallback for the original build-conversation event.

export function calcomConfig() {
  return {
    username: (process.env.CAL_USERNAME || "blue-leaf-build").trim(),
    apiKey: (process.env.CAL_API_KEY || "").trim(),
  };
}

export const MEETING_REGISTRY = {
  enquiry_call: {
    slug: (process.env.CAL_ENQUIRY_SLUG || "enquiry-call").trim(),
    stage: "enquiry", label: "Enquiry call", mode: "on_behalf",
  },
  build_conversation: {
    slug: (process.env.CAL_EVENT_SLUG || "build-conversation").trim(),
    stage: "qualify", label: "Build conversation", mode: "self",
  },
  designer_meeting: {
    slug: (process.env.CAL_DESIGNER_SLUG || "designer-meeting").trim(),
    stage: "discovery", label: "Designer concept meeting", mode: "self",
  },
  winning_offer_presentation: {
    slug: (process.env.CAL_PRESENTATION_SLUG || "winning-offer-presentation").trim(),
    stage: "winning_offer", label: "Winning Offer presentation", mode: "both",
  },
};

/** Registry entry for a meeting type; falls back to the build conversation (the original event). */
export function meetingRegistryEntry(meetingType) {
  return MEETING_REGISTRY[meetingType] || MEETING_REGISTRY.build_conversation;
}

/**
 * Prefilled public cal.com booking link for a lead + a specific meeting type. Carries leadId +
 * meetingType as booking-question params (the reliable webhook round-trip) plus metadata[leadId] as
 * a fallback. Defaults to the build conversation for back-compat with the original single-event call.
 */
export function buildLeadBookingLink(lead = {}, meetingType = "build_conversation") {
  const { username } = calcomConfig();
  const entry = meetingRegistryEntry(meetingType);
  const name = (lead.name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "").trim();
  const p = new URLSearchParams();
  if (name) p.set("name", name);
  if (lead.email) p.set("email", String(lead.email));
  if (lead.id) { p.set("leadId", String(lead.id)); p.set("meetingType", meetingType); }
  const qs = p.toString();
  const parts = [];
  if (qs) parts.push(qs);
  if (lead.id) parts.push(`metadata[leadId]=${lead.id}`); // literal fallback (uuid is URL-safe)
  const url = `https://cal.com/${username}/${entry.slug}`;
  return parts.length ? `${url}?${parts.join("&")}` : url;
}

// meetingInviteEmail.mjs — a warm, human booking-invite email for ANY pipeline meeting, built from
// the lead + the meeting registry (so the design meeting, discovery meeting, presentations, etc. can
// each be sent from their card). Mirrors the qualify/discovery email structure: a token-filled default
// the operator can edit in the preview before sending. Grounded warmth, no jargon (brand rules).

import { buildLeadBookingLink, meetingRegistryEntry } from "./calcom.mjs";

// One friendly line per meeting type; falls back to a neutral line for anything unlisted.
const INTRO_LINES = {
  build_conversation: "Let’s find a time for a quick build conversation about your project:",
  designer_meeting: "We’re ready to get your concept design underway — grab a time to meet your designer and make a start:",
  discovery_meeting: "Let’s find a time to talk through your project properly:",
  winning_offer_presentation: "We’d love to walk you through your concept — pick a time that suits:",
  plan_presentation: "Your plans are ready to walk through together — choose a time here:",
  proposal_presentation: "We’re ready to take you through your proposal — grab a time here:",
  contract_presentation: "Let’s find a time to go through and sign your building contract:",
};

export function buildMeetingInviteEmail(lead = {}, meetingType = "build_conversation", { signatureFooter = "", designerName = null } = {}) {
  const entry = meetingRegistryEntry(meetingType);
  const first = String(lead.first_name || (lead.name || "").trim().split(/\s+/)[0] || "there").trim();
  const bookingLink = buildLeadBookingLink(lead, meetingType);
  let intro = INTRO_LINES[meetingType] || `Let’s find a time for your ${entry.label.toLowerCase()}:`;
  if (meetingType === "designer_meeting" && designerName) {
    intro = `We’re ready to get your concept design underway — grab a time to meet ${designerName} and make a start:`;
  }
  const subject = `Booking your ${entry.label.toLowerCase()} with Blue Leaf`;
  const text = `Hi ${first},\n\n${intro}\n\n${bookingLink}\n\nLooking forward to it.${signatureFooter ? `\n\n${signatureFooter}` : ""}`;
  return { subject, text, bookingLink };
}

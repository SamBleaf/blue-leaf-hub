// calcomApi.mjs — thin cal.com API v2 client for BOOK-ON-BEHALF (Phase 2). The self-book flow needs
// no API (it's a prefilled link + the inbound webhook); this is only for when the Hub creates a
// booking itself (enquiry call, winning-offer presentation). Everything is guarded: if CAL_API_KEY
// is unset, calcomApiConfigured() is false and the caller records a manual meeting instead. A failed
// call throws and the caller degrades gracefully — a bad API shape can never break scheduling.
//
// Requires a cal.com API key (CAL_API_KEY). Event-type ids are resolved from their slug once and
// cached. cal.com pins behaviour with a `cal-api-version` date header per resource.

import { calcomConfig, meetingRegistryEntry } from "./calcom.mjs";

const API_BASE = "https://api.cal.com/v2";
const EVENT_TYPES_API_VERSION = "2024-06-14";
const BOOKINGS_API_VERSION = "2024-08-13";
const DEFAULT_TZ = (process.env.CAL_TIMEZONE || "Australia/Adelaide").trim();

const _eventTypeIdCache = new Map(); // slug -> numeric id

export function calcomApiConfigured() {
  return !!calcomConfig().apiKey;
}

async function calGet(path, apiVersion) {
  const { apiKey } = calcomConfig();
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, "cal-api-version": apiVersion },
    signal: AbortSignal.timeout(10000), // a hung cal.com must throw, not stall the request
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`cal.com GET ${path} → ${r.status} ${j?.error?.message || ""}`.trim());
  return j;
}

/** Resolve a cal.com event-type slug to its numeric id (cached). Throws if not found. */
export async function resolveEventTypeId(slug) {
  if (_eventTypeIdCache.has(slug)) return _eventTypeIdCache.get(slug);
  const { username } = calcomConfig();
  const j = await calGet(`/event-types?username=${encodeURIComponent(username)}`, EVENT_TYPES_API_VERSION);
  const list = Array.isArray(j?.data) ? j.data : [];
  for (const et of list) {
    if (et?.slug) _eventTypeIdCache.set(et.slug, et.id);
  }
  const found = _eventTypeIdCache.get(slug);
  if (!found) throw new Error(`cal.com event type '${slug}' not found for user '${username}'`);
  return found;
}

function attendeeName(lead) {
  return (lead.name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Client").trim();
}

/**
 * Create a booking on the client's behalf. Returns { uid, rescheduleUrl, cancelUrl }.
 * Throws on any failure — the caller degrades to a Hub-recorded manual meeting.
 */
export async function createCalcomBooking({ lead, meetingType, startAt, durationMins }) {
  if (!calcomApiConfigured()) throw new Error("cal.com API not configured");
  if (!lead?.email) throw new Error("lead has no email to invite");
  const entry = meetingRegistryEntry(meetingType);
  const eventTypeId = await resolveEventTypeId(entry.slug);
  const { apiKey } = calcomConfig();

  // NB: we don't send a location — cal.com applies the event type's own configured location
  // (phone/video/in-person). Forcing one here would fail bookings for events not set up for it.
  const body = {
    start: startAt,
    eventTypeId,
    attendee: { name: attendeeName(lead), email: String(lead.email), timeZone: DEFAULT_TZ, language: "en" },
    metadata: { leadId: String(lead.id || "") },
    bookingFieldsResponses: { leadId: String(lead.id || ""), meetingType },
  };
  if (durationMins) body.lengthInMinutes = durationMins;

  const r = await fetch(`${API_BASE}/bookings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "cal-api-version": BOOKINGS_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`cal.com booking failed → ${r.status} ${j?.error?.message || JSON.stringify(j?.error || {})}`.trim());
  const uid = j?.data?.uid || j?.data?.booking?.uid || null;
  // A 200 with no extractable uid means we can't track/reschedule it — throw so the caller degrades
  // to a Hub-recorded manual meeting rather than persisting a phantom "booked" row it can never manage.
  if (!uid) throw new Error(`cal.com booking returned ${r.status} but no booking uid: ${JSON.stringify(j?.data ?? j).slice(0, 300)}`);
  return {
    uid,
    rescheduleUrl: `https://cal.com/reschedule/${uid}`,
    cancelUrl: `https://cal.com/booking/${uid}?cancel=true`,
  };
}

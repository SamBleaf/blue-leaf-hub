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
const SLOTS_API_VERSION = "2024-09-04";
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
 * Available booking slots for a meeting type over the next `days`, grouped by date, in DEFAULT_TZ.
 * Returns [{ date: 'YYYY-MM-DD', times: [iso, ...] }] (only days with openings). Throws if not
 * configured or the call fails — the caller (endpoint) turns that into a graceful "no live times".
 */
export async function getAvailableSlots({ meetingType, days = 14 }) {
  if (!calcomApiConfigured()) throw new Error("cal.com API not configured");
  const entry = meetingRegistryEntry(meetingType);
  const eventTypeId = await resolveEventTypeId(entry.slug);
  const q = new URLSearchParams({
    eventTypeId: String(eventTypeId),
    start: new Date().toISOString(),
    end: new Date(Date.now() + days * 86400000).toISOString(),
    timeZone: DEFAULT_TZ,
  });
  const j = await calGet(`/slots?${q.toString()}`, SLOTS_API_VERSION);
  const data = j?.data || {};
  return Object.entries(data)
    .map(([date, arr]) => ({
      date,
      times: (Array.isArray(arr) ? arr : []).map((s) => (typeof s === "string" ? s : s?.start || s?.time)).filter(Boolean),
    }))
    .filter((d) => d.times.length)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * All of a lead's cal.com bookings, matched by attendee email — the API poll behind /meetings/sync.
 * The self-book flow (client books via the emailed link) normally round-trips through the webhook;
 * this lets the Hub FETCH the booking directly instead of waiting on a webhook that may not be wired.
 * Returns a normalised list [{ uid, start, title, status, durationMins, eventSlug, eventTypeId,
 * responses, metadata }]. Throws if not configured or the call fails — the caller degrades gracefully.
 */
export async function getLeadBookings({ email, take = 50 }) {
  if (!calcomApiConfigured()) throw new Error("cal.com API not configured");
  if (!email) return [];
  const q = new URLSearchParams({ attendeeEmail: String(email).trim(), take: String(take), sortStart: "desc" });
  const j = await calGet(`/bookings?${q.toString()}`, BOOKINGS_API_VERSION);
  const list = Array.isArray(j?.data) ? j.data
    : Array.isArray(j?.data?.bookings) ? j.data.bookings
    : Array.isArray(j?.bookings) ? j.bookings : [];
  return list.map((b) => ({
    uid: b?.uid || b?.bookingUid || null,
    start: b?.start || b?.startTime || null,
    title: b?.title || null,
    status: b?.status || null,                       // 'accepted' | 'cancelled' | 'pending' | 'rejected'
    durationMins: b?.duration ?? b?.length ?? null,
    eventSlug: b?.eventType?.slug || b?.eventTypeSlug || b?.type || null,
    eventTypeId: b?.eventTypeId ?? b?.eventType?.id ?? null,
    responses: b?.bookingFieldsResponses || b?.responses || {},
    metadata: b?.metadata || {},
  })).filter((b) => b.uid);
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
  const base = {
    start: startAt,
    eventTypeId,
    attendee: { name: attendeeName(lead), email: String(lead.email), timeZone: DEFAULT_TZ, language: "en" },
    metadata: { leadId: String(lead.id || "") },
  };
  if (durationMins) base.lengthInMinutes = durationMins;

  async function postBooking(body) {
    const r = await fetch(`${API_BASE}/bookings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "cal-api-version": BOOKINGS_API_VERSION, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const j = await r.json().catch(() => ({}));
    return { r, j };
  }

  // First try WITH the leadId/meetingType hidden booking fields (the reliable webhook round-trip).
  // If the event type doesn't have those custom fields configured yet, cal.com rejects with a 4xx —
  // retry once WITHOUT them (metadata[leadId] still carries the correlation) so book-on-behalf works
  // before the event types are fully set up, instead of silently falling back to a Hub-only record.
  let { r, j } = await postBooking({ ...base, bookingFieldsResponses: { leadId: String(lead.id || ""), meetingType } });
  if (!r.ok && r.status >= 400 && r.status < 500) {
    const retry = await postBooking(base);
    if (retry.r.ok) ({ r, j } = retry);
  }
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

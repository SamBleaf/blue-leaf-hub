// calcomRoutes.mjs — sales meeting endpoints backed by lead_meetings + the cal.com booking-link
// builder / registry. Read + link endpoints (Phase 1) and book-on-behalf (Phase 2, calcomApi.mjs).
// All fail-soft if lead_meetings is pre-migration-185 (returns empty + a flag, never 500s).

import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth } from "./requireAuth.mjs";
import { ok, err, rowToCamel, translateDbError } from "./apiResponse.mjs";
import { buildLeadBookingLink, MEETING_REGISTRY, meetingRegistryEntry, meetingTypeForSlug } from "./calcom.mjs";
import { calcomApiConfigured, createCalcomBooking, getAvailableSlots, getLeadBookings, listEventTypes } from "./calcomApi.mjs";
import { projectLeadMeeting } from "./calcomProjection.mjs";
import { calcomConfig } from "./calcom.mjs";

const TABLE_MISSING = new Set(["42P01", "42703", "PGRST205"]); // table/column absent (pre-mig-185)
const CAL_TIMEZONE = (process.env.CAL_TIMEZONE || "Australia/Adelaide").trim(); // for human-readable log notes

export function registerCalcomRoutes(app) {
  const sb = () => getServiceSupabase();

  // The meeting-type registry (labels, stages, modes, slugs) for the UI + whether book-on-behalf is live.
  app.get("/api/sales/meeting-types", requireAuth, (_req, res) => {
    const meetingTypes = Object.entries(MEETING_REGISTRY).map(([key, e]) => ({
      key, label: e.label, stage: e.stage, mode: e.mode, slug: e.slug,
    }));
    ok(res, { meetingTypes, bookOnBehalf: calcomApiConfigured() });
  });

  // Diagnostics — reconcile the Hub's meeting registry against the ACTUAL cal.com account, so a wrong
  // CAL_USERNAME or an event-slug mismatch is obvious at a glance. Admin/staff-only; no secrets returned.
  app.get("/api/sales/meeting-diagnostics", requireAuth, async (_req, res) => {
    const { username } = calcomConfig();
    const timezone = (process.env.CAL_TIMEZONE || "Australia/Adelaide").trim();
    if (!calcomApiConfigured()) {
      return ok(res, { configured: false, username, timezone, message: "CAL_API_KEY is not set — the slot picker, book-on-behalf and booking poll all need it." });
    }
    let events = [], error = null;
    try { events = await listEventTypes(); }
    catch (e) { error = e?.message || "cal.com error"; }
    const slugs = new Set(events.map((e) => e.slug));
    const registry = Object.entries(MEETING_REGISTRY).map(([key, e]) => ({
      key, label: e.label, expectedSlug: e.slug, matched: slugs.has(e.slug),
    }));
    ok(res, { configured: true, username, timezone, error, events, registry, unmatched: registry.filter((r) => !r.matched).map((r) => r.expectedSlug) });
  });

  // Live open slots for a meeting type (for the on-call slot picker). Lead-independent — availability
  // is the same for every client. { configured:false } when there's no CAL_API_KEY → the UI falls
  // back to manual time entry. A cal.com error degrades to configured:true + empty slots + a message.
  app.get("/api/sales/meeting-slots", requireAuth, async (req, res) => {
    const meetingType = String(req.query.meetingType || "").trim();
    if (!Object.prototype.hasOwnProperty.call(MEETING_REGISTRY, meetingType)) return err(res, 400, "Unknown meeting type.");
    if (!calcomApiConfigured()) return ok(res, { configured: false, slots: [] });
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 60);
    try {
      const slots = await getAvailableSlots({ meetingType, days });
      ok(res, { configured: true, slots });
    } catch (e) {
      // Surface the ACTUAL cause (e.g. "event type 'design-meeting' not found for user X") so a
      // misconfigured CAL_USERNAME / event slug is diagnosable, not hidden behind a generic message.
      console.warn("[calcom slots] load failed:", e?.message || e);
      ok(res, { configured: true, slots: [], error: `Couldn't load live times: ${e?.message || "cal.com error"}` });
    }
  });

  // A lead's meetings — the per-lead Meetings card.
  app.get("/api/sales/leads/:id/meetings", requireAuth, async (req, res) => {
    const db = sb(); if (!db) return err(res, 503, "Supabase not configured");
    const { data, error } = await db.from("lead_meetings")
      .select("*").eq("lead_id", req.params.id)
      .order("scheduled_at", { ascending: true, nullsFirst: false });
    if (error) {
      if (TABLE_MISSING.has(error.code)) return ok(res, { meetings: [], tableMissing: true });
      return err(res, 400, translateDbError(error));
    }
    ok(res, { meetings: (data || []).map(rowToCamel) });
  });

  // The prefilled cal.com self-book link for a lead + meeting type (to show / copy / send).
  app.get("/api/sales/leads/:id/booking-link", requireAuth, async (req, res) => {
    const db = sb(); if (!db) return err(res, 503, "Supabase not configured");
    const meetingType = String(req.query.meetingType || "build_conversation");
    const { data: lead, error } = await db.from("leads")
      .select("id, name, first_name, last_name, email").eq("id", req.params.id).maybeSingle();
    if (error || !lead) return err(res, 404, "Lead not found");
    ok(res, { url: buildLeadBookingLink(lead, meetingType), meetingType, label: meetingRegistryEntry(meetingType).label });
  });

  // Upcoming meetings across all leads — the Sales agenda (Phase 2 UI). days window (default 21).
  app.get("/api/sales/meetings/upcoming", requireAuth, async (req, res) => {
    const db = sb(); if (!db) return err(res, 503, "Supabase not configured");
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 21, 1), 120);
    const nowIso = new Date().toISOString();
    const untilIso = new Date(Date.now() + days * 86400000).toISOString();
    const { data, error } = await db.from("lead_meetings")
      .select("*, leads(id, name, first_name, last_name, stage)")
      .in("status", ["scheduled", "rescheduled"])
      .gte("scheduled_at", nowIso)
      .lte("scheduled_at", untilIso)
      .order("scheduled_at", { ascending: true });
    if (error) {
      if (TABLE_MISSING.has(error.code)) return ok(res, { meetings: [], tableMissing: true });
      return err(res, 400, translateDbError(error));
    }
    ok(res, { meetings: (data || []).map(rowToCamel) });
  });

  // Book-on-behalf (Phase 2): schedule a meeting from the Hub. If the cal.com API is configured we
  // create a real booking (invite goes out, lands on the connected calendar); otherwise we record a
  // manual meeting so the Hub still tracks it. Either way a lead_meetings row is written.
  app.post("/api/sales/leads/:id/meetings/schedule", requireAuth, async (req, res) => {
    const db = sb(); if (!db) return err(res, 503, "Supabase not configured");
    const meetingType = String(req.body?.meetingType || "").trim();
    const startIso = String(req.body?.startAt || "").trim();
    const durationMins = Number(req.body?.durationMins) || null;
    const location = req.body?.location ? String(req.body.location) : null;
    const notes = req.body?.notes ? String(req.body.notes) : null;
    if (!Object.prototype.hasOwnProperty.call(MEETING_REGISTRY, meetingType)) return err(res, 400, "Unknown meeting type.");
    const startAt = new Date(startIso);
    if (!startIso || Number.isNaN(startAt.getTime())) return err(res, 400, "A valid start time is required.");
    const entry = meetingRegistryEntry(meetingType);

    const { data: lead, error: lErr } = await db.from("leads")
      .select("id, name, first_name, last_name, email").eq("id", req.params.id).maybeSingle();
    if (lErr || !lead) return err(res, 404, "Lead not found");

    // Don't silently clobber a client's LIVE self-booked cal.com meeting. If one exists and we won't
    // be creating a replacement cal.com booking (no API key), block + point staff at the client's
    // reschedule link instead of overwriting its cal identity to null.
    const { data: existing } = await db.from("lead_meetings")
      .select("cal_booking_uid, cal_reschedule_url, booking_source, status")
      .eq("lead_id", lead.id).eq("meeting_type", meetingType).maybeSingle();
    const hasLiveSelfBooking = existing && existing.status !== "cancelled" && existing.cal_booking_uid && existing.booking_source === "self";

    // Try a real cal.com booking first (best-effort); fall back to a Hub-recorded 'manual' meeting.
    let cal = null, bookingSource = "manual";
    if (calcomApiConfigured()) {
      try {
        cal = await createCalcomBooking({ lead, meetingType, startAt: startAt.toISOString(), durationMins });
        bookingSource = "on_behalf";
      } catch (e) {
        console.warn("[calcom schedule] API booking failed, recording manual meeting:", e?.message || e);
      }
    }

    // Would this overwrite a live client self-booking with a Hub record (losing the cal.com link)? Block it.
    if (hasLiveSelfBooking && !cal) {
      return err(res, 409, "The client has already booked this meeting via cal.com — use their reschedule/cancel link to change it.", "SELF_BOOKED");
    }

    const row = {
      lead_id: lead.id,
      meeting_type: meetingType,
      stage: entry.stage,
      title: entry.label,
      scheduled_at: startAt.toISOString(),
      duration_mins: durationMins,
      location,
      status: "scheduled",
      booking_source: bookingSource,
      cal_booking_uid: cal?.uid || null,
      cal_reschedule_url: cal?.rescheduleUrl || null,
      cal_cancel_url: cal?.cancelUrl || null,
      notes,
      created_by: req.user?.id || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await db.from("lead_meetings").upsert(row, { onConflict: "lead_id,meeting_type" }).select().single();
    if (error) {
      if (TABLE_MISSING.has(error.code)) return err(res, 400, "Meeting scheduling isn't available yet — migration 185 needs to be applied.");
      return err(res, 400, translateDbError(error));
    }
    try { await db.from("lead_activities").insert({ lead_id: lead.id, activity_type: "note", summary: `${entry.label} scheduled for ${startAt.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: CAL_TIMEZONE })}` }); } catch { /* best-effort */ }
    ok(res, { meeting: rowToCamel(data), bookedViaCalcom: bookingSource === "on_behalf" });
  });

  // Poll cal.com for a lead's bookings and project any that match a pipeline meeting — the robust
  // path when the inbound webhook isn't wired (client books via the emailed link, the Hub fetches it).
  // Matches by attendee email; maps the event slug → meeting type; projects each (which unblocks the
  // pipeline exactly like the webhook). Returns what was synced so the UI can refresh. Never 500s.
  app.post("/api/sales/leads/:id/meetings/sync", requireAuth, async (req, res) => {
    const db = sb(); if (!db) return err(res, 503, "Supabase not configured");
    if (!calcomApiConfigured()) {
      return ok(res, { configured: false, synced: 0, message: "cal.com API isn't connected yet — set CAL_API_KEY to auto-detect bookings." });
    }
    const { data: lead } = await db.from("leads").select("id, email").eq("id", req.params.id).maybeSingle();
    if (!lead) return err(res, 404, "Lead not found");
    if (!lead.email) return ok(res, { configured: true, synced: 0, message: "This lead has no email to match a cal.com booking." });

    const wanted = req.body?.meetingType ? String(req.body.meetingType).trim() : null; // optionally scope to one
    let bookings;
    try { bookings = await getLeadBookings({ email: lead.email }); }
    catch (e) { return ok(res, { configured: true, synced: 0, error: e?.message || "Couldn't reach cal.com right now." }); }

    const found = [];
    for (const b of bookings) {
      // Skip cancelled/rejected — the projection only records live bookings (a cancel comes via webhook).
      if (b.status && !["accepted", "pending", "confirmed"].includes(String(b.status).toLowerCase())) continue;
      // The booking's own leadId response (if present) must match — never project another lead's booking.
      const bookedLeadId = b.responses?.leadId?.value || b.responses?.leadId || b.metadata?.leadId;
      if (bookedLeadId && String(bookedLeadId) !== String(lead.id)) continue;
      const mt = meetingTypeForSlug(b.eventSlug)
        || (b.responses?.meetingType?.value || b.responses?.meetingType) || null;
      if (!mt || !Object.prototype.hasOwnProperty.call(MEETING_REGISTRY, mt)) continue;
      if (wanted && mt !== wanted) continue;
      await projectLeadMeeting(db, {
        leadId: lead.id, meetingType: mt, trigger: "BOOKING_CREATED",
        uid: b.uid, startTime: b.start, title: b.title, durationMins: b.durationMins,
        eventTypeId: b.eventTypeId, eventSlug: b.eventSlug,
      });
      found.push({ meetingType: mt, start: b.start, uid: b.uid });
    }
    ok(res, { configured: true, synced: found.length, found });
  });

  // Structured meeting notes (mig 189) — priorities/decisions/changes/risks/followups/owner/next_step.
  // Attaches to a real (booked/recorded) meeting of this type; won't create a phantom meeting.
  app.put("/api/sales/leads/:id/meetings/:meetingType/notes", requireAuth, async (req, res) => {
    const db = sb(); if (!db) return err(res, 503, "Supabase not configured");
    const meetingType = String(req.params.meetingType || "").trim();
    if (!Object.prototype.hasOwnProperty.call(MEETING_REGISTRY, meetingType)) return err(res, 400, "Unknown meeting type.");
    const notes = (req.body?.notes && typeof req.body.notes === "object") ? req.body.notes : {};
    const { data, error } = await db.from("lead_meetings")
      .update({ structured_notes: notes, updated_at: new Date().toISOString() })
      .eq("lead_id", req.params.id).eq("meeting_type", meetingType).select().maybeSingle();
    if (error) {
      if (TABLE_MISSING.has(error.code)) return err(res, 400, "Meeting notes need migrations 185 + 189 applied.");
      return err(res, 400, translateDbError(error));
    }
    if (!data) return err(res, 404, "Book or record this meeting before adding notes.");
    ok(res, { meeting: rowToCamel(data) });
  });
}

// calcomRoutes.mjs — sales meeting endpoints backed by lead_meetings + the cal.com booking-link
// builder / registry. Read + link endpoints (Phase 1) and book-on-behalf (Phase 2, calcomApi.mjs).
// All fail-soft if lead_meetings is pre-migration-185 (returns empty + a flag, never 500s).

import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth } from "./requireAuth.mjs";
import { ok, err, rowToCamel, translateDbError } from "./apiResponse.mjs";
import { buildLeadBookingLink, MEETING_REGISTRY, meetingRegistryEntry } from "./calcom.mjs";
import { calcomApiConfigured, createCalcomBooking, getAvailableSlots } from "./calcomApi.mjs";

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
      console.warn("[calcom slots] load failed:", e?.message || e);
      ok(res, { configured: true, slots: [], error: "Couldn't load live times right now." });
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
}

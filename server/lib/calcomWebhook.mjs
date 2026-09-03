// calcomWebhook.mjs — the cal.com webhook for EVERY sales-pipeline meeting.
//
// Mounted RAW (before the JSON body parser) so the HMAC can be verified over the exact bytes —
// mirrors the buildexact webhook. cal.com signs with X-Cal-Signature-256 = HMAC-SHA256 hex of the
// raw payload using CAL_WEBHOOK_SECRET.
//
// On BOOKING_CREATED/RESCHEDULED/CANCELLED we (1) correlate the booking to the EXISTING lead and
// (2) upsert a row in lead_meetings keyed (lead_id, meeting_type). The meeting type comes from the
// hidden `meetingType` booking question our link prefills; if absent (e.g. the original
// build-conversation event before its questions are added) it defaults to build_conversation, so
// legacy bookings keep working. For the build conversation we ALSO keep stamping the legacy
// leads.discovery_meeting_* columns so the Discovery HARD gate + QualifyActions are unaffected.
//
// Always returns 200 so cal.com never retry-storms; all DB writes are fail-soft (pre-migration the
// table/columns don't exist yet → we log and move on).

import crypto from "crypto";
import { getServiceSupabase } from "./supabaseService.mjs";
import { meetingRegistryEntry, MEETING_REGISTRY } from "./calcom.mjs";

function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a).trim().toLowerCase(), "hex");
    const bb = Buffer.from(String(b).trim().toLowerCase(), "hex");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function verifyCalSignature(rawBody, headerValue, secret) {
  if (!secret) {
    // Fail CLOSED in production (mirrors requireCronSecretOrAdmin) — an unset secret must never let a
    // public caller forge bookings against the service-role handler. A first-wire escape hatch keeps
    // dev + initial wire-up testable: CAL_WEBHOOK_ALLOW_UNVERIFIED=true.
    const allowUnverified = process.env.NODE_ENV !== "production"
      || String(process.env.CAL_WEBHOOK_ALLOW_UNVERIFIED || "").trim() === "true";
    return allowUnverified ? { ok: true, skipped: true } : { ok: false, reason: "secret_unconfigured" };
  }
  if (!headerValue || typeof headerValue !== "string") return { ok: false, reason: "missing_signature_header" };
  const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const sig = headerValue.trim().toLowerCase().startsWith("sha256=") ? headerValue.trim().slice(7) : headerValue.trim();
  return { ok: timingSafeEqualHex(sig, hmac), reason: "hmac_mismatch" };
}

function rescheduleUrl(uid) { return uid ? `https://cal.com/reschedule/${uid}` : null; }
function cancelUrl(uid) { return uid ? `https://cal.com/booking/${uid}?cancel=true` : null; }

// A booking question's answer arrives as { label, value, isHidden } (or occasionally a bare string).
function responseValue(responses, key) {
  const r = responses?.[key];
  if (r == null) return null;
  if (typeof r === "object") return r.value ?? null;
  return r;
}

// Which meeting this booking is. The hidden `meetingType` question is authoritative; if it's absent
// (a misconfigured event, or a cancel/reschedule payload without responses) disambiguate by the
// event slug the payload already carries BEFORE falling back — so a non-build meeting is never
// silently mislabeled as the build conversation (which would clobber that row + toggle the gate).
// Only the genuine build-conversation slug keeps the legacy default; anything else → "unknown".
function resolveMeetingType(payload) {
  const fromResponse = responseValue(payload?.responses, "meetingType");
  const fromMeta = payload?.metadata?.meetingType || payload?.metadata?.meetingtype;
  const t = String(fromResponse || fromMeta || "").trim();
  if (Object.prototype.hasOwnProperty.call(MEETING_REGISTRY, t)) return t;
  const slug = String(payload?.type || "").trim();
  const bySlug = Object.entries(MEETING_REGISTRY).find(([, e]) => e.slug === slug);
  if (bySlug) return bySlug[0];
  return MEETING_REGISTRY.build_conversation.slug === slug ? "build_conversation" : "unknown";
}

// Find the lead this booking belongs to. The hidden leadId question is authoritative; then the
// metadata param (fallback); then the attendee email → most-recent NON-terminal lead with that email
// (any stage, so discovery/build bookings still match — but never an old lost/won deal).
async function correlateLead(sb, payload) {
  const fromResponse = responseValue(payload?.responses, "leadId");
  const meta = payload?.metadata || {};
  const leadId = fromResponse || meta.leadId || meta.leadid || meta.lead_id;
  if (leadId) {
    const { data } = await sb.from("leads").select("id, stage, email").eq("id", leadId).maybeSingle();
    if (data) return data;
  }
  const email = payload?.attendees?.[0]?.email || responseValue(payload?.responses, "email");
  if (email) {
    const { data } = await sb.from("leads")
      .select("id, stage, email").ilike("email", String(email).trim())
      .not("stage", "in", "(lost,won)")
      .order("created_at", { ascending: false }).limit(1);
    if (data && data.length) return data[0];
  }
  return null;
}

async function logActivity(sb, leadId, summary) {
  try { await sb.from("lead_activities").insert({ lead_id: leadId, activity_type: "note", summary }); }
  catch { /* best-effort */ }
}

// Upsert the lead_meetings row for this (lead, meeting_type). Fail-soft (pre-migration-185). Returns
// nothing meaningful — the caller has already acked; this is a best-effort projection.
async function upsertLeadMeeting(sb, { leadId, meetingType, entry, trigger, uid, startTime, payload }) {
  const isCancel = trigger === "BOOKING_CANCELLED";
  const isReschedule = trigger === "BOOKING_RESCHEDULED";
  try {
    if (isCancel) {
      await sb.from("lead_meetings")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("lead_id", leadId).eq("meeting_type", meetingType);
      return;
    }
    const row = {
      lead_id: leadId,
      meeting_type: meetingType,
      stage: entry.stage,
      title: payload?.title || entry.label,
      scheduled_at: startTime,
      duration_mins: payload?.length ?? payload?.duration ?? null,
      location: typeof payload?.location === "string" ? payload.location : null,
      status: isReschedule ? "rescheduled" : "scheduled",
      booking_source: "self",
      cal_event_type_id: payload?.eventTypeId != null ? String(payload.eventTypeId) : null,
      cal_event_slug: payload?.type || entry.slug,
      cal_booking_uid: uid,
      cal_reschedule_url: rescheduleUrl(uid),
      cal_cancel_url: cancelUrl(uid),
      updated_at: new Date().toISOString(),
    };
    await sb.from("lead_meetings").upsert(row, { onConflict: "lead_id,meeting_type" });
  } catch (e) {
    console.warn("[calcom webhook] lead_meetings upsert failed (migration 185 applied?):", e?.message || e);
  }
}

// Keep the legacy leads.discovery_meeting_* columns in sync for the build conversation only, so the
// Discovery HARD gate (salesRoutes) + QualifyActions card keep working exactly as before.
async function syncLegacyBuildConversation(sb, { leadId, trigger, uid, startTime }) {
  try {
    if (trigger === "BOOKING_CANCELLED") {
      await sb.from("leads").update({ discovery_meeting_booked_at: null, discovery_meeting_at: null }).eq("id", leadId);
    } else if (trigger === "BOOKING_RESCHEDULED") {
      await sb.from("leads").update({
        discovery_meeting_at: startTime, discovery_meeting_source: "calcom",
        calcom_booking_uid: uid, calcom_reschedule_url: rescheduleUrl(uid), calcom_cancel_url: cancelUrl(uid),
      }).eq("id", leadId);
    } else {
      await sb.from("leads").update({
        discovery_meeting_at: startTime, discovery_meeting_booked_at: new Date().toISOString(),
        discovery_meeting_source: "calcom",
        calcom_booking_uid: uid, calcom_reschedule_url: rescheduleUrl(uid), calcom_cancel_url: cancelUrl(uid),
      }).eq("id", leadId);
    }
  } catch (e) {
    console.warn("[calcom webhook] legacy lead update failed (migration 174 applied?):", e?.message || e);
  }
}

export async function handleCalcomWebhook(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
  const secret = (process.env.CAL_WEBHOOK_SECRET || "").trim();
  const sigHeader = req.headers["x-cal-signature-256"] || req.headers["x-cal-signature"] || "";

  // Fail CLOSED (finding M1): reject when no secret is configured rather than accepting unverified
  // payloads — a public webhook that trusts unsigned bodies lets anyone inject bookings/leads.
  if (!secret) {
    console.warn("[calcom webhook] CAL_WEBHOOK_SECRET not set — rejecting (fail-closed). Set it in this environment.");
    return res.status(503).json({ ok: false, error: "webhook_not_configured" });
  }

  const verify = verifyCalSignature(raw, sigHeader, secret);
  if (!verify.ok) {
    console.warn("[calcom webhook] signature rejected:", verify.reason, "headers:", Object.keys(req.headers).filter(h => h.includes("cal") || h.includes("sign")));
    return res.status(200).json({ ok: false, error: "invalid_signature" });
  }

  let body;
  try { body = JSON.parse(raw.toString("utf8") || "{}"); }
  catch { return res.status(200).json({ ok: false, error: "bad_json" }); }

  const trigger = body?.triggerEvent || body?.TriggerEvent || body?.type || "";
  const payload = body?.payload || body?.data || {};
  const sb = getServiceSupabase();
  if (!sb) return res.status(200).json({ ok: false, error: "db_unavailable" });

  const lead = await correlateLead(sb, payload);
  if (!lead) {
    console.warn("[calcom webhook]", trigger, "— no matching lead (leadId + attendee email both missed)");
    return res.status(200).json({ ok: true, matched: false });
  }

  const meetingType = resolveMeetingType(payload);
  if (meetingType === "unknown") {
    // We know the lead but not which meeting (unrecognised event slug + no meetingType question).
    // Ack without projecting — never mislabel it as the build conversation.
    console.warn("[calcom webhook]", trigger, "— unmappable meeting (event slug:", payload?.type, ") — acked, not projected.");
    return res.status(200).json({ ok: true, matched: true, meetingType: "unknown" });
  }
  const entry = meetingRegistryEntry(meetingType);
  const uid = payload?.uid || payload?.bookingUid || null;
  const startTime = payload?.startTime || payload?.start || null;
  const whenLabel = startTime ? new Date(startTime).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "a scheduled time";
  const verb = trigger === "BOOKING_CANCELLED" ? "cancelled" : trigger === "BOOKING_RESCHEDULED" ? `rescheduled to ${whenLabel}` : `booked for ${whenLabel}`;

  await upsertLeadMeeting(sb, { leadId: lead.id, meetingType, entry, trigger, uid, startTime, payload });
  if (meetingType === "build_conversation") {
    await syncLegacyBuildConversation(sb, { leadId: lead.id, trigger, uid, startTime });
  }
  await logActivity(sb, lead.id, `${entry.label} ${verb}`);

  return res.status(200).json({ ok: true, matched: true, trigger, meetingType });
}

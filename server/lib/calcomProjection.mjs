// calcomProjection.mjs — the shared "record a cal.com booking against a lead" projection.
//
// A self-booked meeting must unblock the pipeline IDENTICALLY whether the Hub learned about it from
// the inbound webhook (calcomWebhook.mjs) or from the on-demand API poll (getLeadBookings →
// /meetings/sync). This is that projection, factored out so the two paths can't drift: upsert the
// lead_meetings row + (for the build conversation) keep the legacy leads.discovery_meeting_* columns
// in sync so the Discovery HARD gate + QualifyActions card react. Every write is fail-soft (pre-
// migration the table/columns may not exist yet → log + continue).
//
// NOTE: calcomWebhook.mjs carries an equivalent inline projection (it predates this module and is
// security-sensitive, so it's left untouched); keep the two in step if this logic changes.

import { meetingRegistryEntry } from "./calcom.mjs";

export function rescheduleUrl(uid) { return uid ? `https://cal.com/reschedule/${uid}` : null; }
export function cancelUrl(uid) { return uid ? `https://cal.com/booking/${uid}?cancel=true` : null; }

/**
 * Project one cal.com booking onto a lead. `trigger` is BOOKING_CREATED | BOOKING_RESCHEDULED |
 * BOOKING_CANCELLED. Returns nothing meaningful — best-effort, fail-soft.
 */
export async function projectLeadMeeting(sb, {
  leadId, meetingType, trigger = "BOOKING_CREATED", uid, startTime,
  title, durationMins, location, eventTypeId, eventSlug,
}) {
  if (!sb || !leadId || !meetingType) return;
  const entry = meetingRegistryEntry(meetingType);
  const isCancel = trigger === "BOOKING_CANCELLED";
  const isReschedule = trigger === "BOOKING_RESCHEDULED";

  // 1. lead_meetings projection.
  try {
    if (isCancel) {
      await sb.from("lead_meetings")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("lead_id", leadId).eq("meeting_type", meetingType);
    } else {
      const row = {
        lead_id: leadId,
        meeting_type: meetingType,
        stage: entry.stage,
        title: title || entry.label,
        scheduled_at: startTime || null,
        duration_mins: durationMins ?? null,
        location: typeof location === "string" ? location : null,
        status: isReschedule ? "rescheduled" : "scheduled",
        booking_source: "self",
        cal_event_type_id: eventTypeId != null ? String(eventTypeId) : null,
        cal_event_slug: eventSlug || entry.slug,
        cal_booking_uid: uid || null,
        cal_reschedule_url: rescheduleUrl(uid),
        cal_cancel_url: cancelUrl(uid),
        updated_at: new Date().toISOString(),
      };
      await sb.from("lead_meetings").upsert(row, { onConflict: "lead_id,meeting_type" });
    }
  } catch (e) {
    console.warn("[calcom projection] lead_meetings upsert failed (migration 185 applied?):", e?.message || e);
  }

  // 2. Legacy build-conversation columns — keep the Discovery gate + QualifyActions working.
  if (meetingType === "build_conversation") {
    try {
      if (isCancel) {
        await sb.from("leads").update({ discovery_meeting_booked_at: null, discovery_meeting_at: null }).eq("id", leadId);
      } else if (isReschedule) {
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
      console.warn("[calcom projection] legacy lead update failed (migration 174 applied?):", e?.message || e);
    }
  }
}

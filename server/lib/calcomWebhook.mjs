// calcomWebhook.mjs — Sales OS Slice 1, workstream C: the cal.com "build conversation" webhook.
//
// Mounted RAW (before the JSON body parser) so the HMAC can be verified over the exact bytes —
// mirrors the buildexact webhook. cal.com signs with X-Cal-Signature-256 = HMAC-SHA256 hex of the
// raw payload using CAL_WEBHOOK_SECRET. On BOOKING_CREATED we correlate the booking to the EXISTING
// lead by metadata.leadId (fallback: attendee email → most-recent qualify lead) and stamp the
// discovery-meeting columns + log the timeline — NO manual tick. Reschedule/cancel keep it in sync.
// Always returns 200 so cal.com never retry-storms; all DB writes are fail-soft (pre-migration-174
// the columns don't exist yet → we log and move on).

import crypto from "crypto";
import { getServiceSupabase } from "./supabaseService.mjs";

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
  if (!secret) return { ok: true, skipped: true }; // unconfigured secret → accept (dev/first-wire)
  if (!headerValue || typeof headerValue !== "string") return { ok: false, reason: "missing_signature_header" };
  const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const sig = headerValue.trim().toLowerCase().startsWith("sha256=") ? headerValue.trim().slice(7) : headerValue.trim();
  return { ok: timingSafeEqualHex(sig, hmac), reason: "hmac_mismatch" };
}

function rescheduleUrl(uid) { return uid ? `https://cal.com/reschedule/${uid}` : null; }
function cancelUrl(uid) { return uid ? `https://cal.com/booking/${uid}?cancel=true` : null; }

// Find the lead this booking belongs to. metadata.leadId (from our prefilled link) is authoritative;
// fall back to the attendee email → most-recent qualify-stage lead.
async function correlateLead(sb, payload) {
  const meta = payload?.metadata || {};
  const leadId = meta.leadId || meta.leadid || meta.lead_id;
  if (leadId) {
    const { data } = await sb.from("leads").select("id, stage, email").eq("id", leadId).maybeSingle();
    if (data) return data;
  }
  const email = payload?.attendees?.[0]?.email || payload?.responses?.email?.value;
  if (email) {
    const { data } = await sb.from("leads")
      .select("id, stage, email").ilike("email", String(email).trim())
      .order("created_at", { ascending: false }).limit(1);
    if (data && data.length) return data[0];
  }
  return null;
}

async function logActivity(sb, leadId, summary) {
  try { await sb.from("lead_activities").insert({ lead_id: leadId, activity_type: "note", summary }); }
  catch { /* best-effort */ }
}

export async function handleCalcomWebhook(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
  const secret = (process.env.CAL_WEBHOOK_SECRET || "").trim();
  const sigHeader = req.headers["x-cal-signature-256"] || req.headers["x-cal-signature"] || "";

  // Log the header shape once (helps confirm the exact header/scheme on first wire-up), never the value.
  if (!secret) console.warn("[calcom webhook] no CAL_WEBHOOK_SECRET set — accepting unverified (configure before go-live).");

  const verify = verifyCalSignature(raw, sigHeader, secret);
  if (!verify.ok) {
    console.warn("[calcom webhook] signature rejected:", verify.reason, "headers:", Object.keys(req.headers).filter(h => h.includes("cal") || h.includes("sign")));
    return res.status(200).json({ ok: false, error: "invalid_signature" }); // 200 so cal.com doesn't retry a bad-secret storm
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
    console.warn("[calcom webhook]", trigger, "— no matching lead (metadata.leadId + attendee email both missed)");
    return res.status(200).json({ ok: true, matched: false });
  }

  const uid = payload?.uid || payload?.bookingUid || null;
  const startTime = payload?.startTime || payload?.start || null;
  const whenLabel = startTime ? new Date(startTime).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "a scheduled time";

  try {
    if (trigger === "BOOKING_CANCELLED") {
      await sb.from("leads").update({
        discovery_meeting_booked_at: null,
        discovery_meeting_at: null,
      }).eq("id", lead.id);
      await logActivity(sb, lead.id, "Build conversation cancelled");
    } else if (trigger === "BOOKING_RESCHEDULED") {
      await sb.from("leads").update({
        discovery_meeting_at: startTime,
        discovery_meeting_source: "calcom",
        calcom_booking_uid: uid,
        calcom_reschedule_url: rescheduleUrl(uid),
        calcom_cancel_url: cancelUrl(uid),
      }).eq("id", lead.id);
      await logActivity(sb, lead.id, `Build conversation rescheduled to ${whenLabel}`);
    } else {
      // BOOKING_CREATED (and any create-like default)
      await sb.from("leads").update({
        discovery_meeting_at: startTime,
        discovery_meeting_booked_at: new Date().toISOString(),
        discovery_meeting_source: "calcom",
        calcom_booking_uid: uid,
        calcom_reschedule_url: rescheduleUrl(uid),
        calcom_cancel_url: cancelUrl(uid),
      }).eq("id", lead.id);
      await logActivity(sb, lead.id, `Build conversation booked for ${whenLabel}`);
    }
  } catch (e) {
    // Fail-soft: pre-migration-174 the columns are absent. Log so we know, but still ack 200.
    console.warn("[calcom webhook] lead update failed (migration 174 applied?):", e?.message || e);
  }

  return res.status(200).json({ ok: true, matched: true, trigger });
}

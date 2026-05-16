import crypto from "crypto";
import { getServiceSupabase } from "./supabaseService.mjs";

function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a).trim(), "hex");
    const bb = Buffer.from(String(b).trim(), "hex");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function verifyBuildexactSignature(rawBody, headerValue, secret) {
  if (!secret) return { ok: true, skipped: true };
  if (!headerValue || typeof headerValue !== "string") return { ok: false, reason: "missing_signature_header" };
  const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const trimmed = headerValue.trim();
  if (trimmed.toLowerCase().startsWith("sha256=")) {
    const hex = trimmed.slice(7).trim();
    return { ok: timingSafeEqualHex(hex, hmac), reason: "hmac_mismatch" };
  }
  return { ok: timingSafeEqualHex(trimmed, hmac), reason: "hmac_mismatch" };
}

function normalizeAddressKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function addressesLikelyMatch(a, b) {
  const A = normalizeAddressKey(a);
  const B = normalizeAddressKey(b);
  if (!A || !B) return false;
  if (A === B) return true;
  if (A.includes(B) || B.includes(A)) return true;
  const min = Math.min(A.length, B.length);
  if (min < 10) return false;
  const slice = 12;
  return A.slice(0, slice) === B.slice(0, slice);
}

function extractEventType(body) {
  return (
    body?.event_type ||
    body?.EventType ||
    body?.type ||
    body?.Type ||
    body?.event ||
    body?.Event ||
    ""
  );
}

function extractJobPayload(body) {
  return body?.payload ?? body?.Payload ?? body?.job ?? body?.Job ?? body?.data ?? body;
}

function extractJobId(payload) {
  const p = payload || {};
  return (
    p.id ||
    p.Id ||
    p.job_id ||
    p.JobId ||
    p.jobId ||
    (p.job && (p.job.id || p.job.Id)) ||
    null
  );
}

function extractJobAddress(payload) {
  const p = payload || {};
  return String(
    p.address ||
      p.Address ||
      p.job_address ||
      p.JobAddress ||
      p.site_address ||
      p.SiteAddress ||
      p.name ||
      p.Name ||
      (p.job && (p.job.address || p.job.Address)) ||
      ""
  ).trim();
}

/**
 * Express handler — must be mounted with express.raw() so req.body is a Buffer.
 */
export async function handleBuildexactWebhook(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body == null ? "" : req.body);
  const secret = process.env.BUILDEXACT_WEBHOOK_SECRET?.trim();

  const sigHeader = req.get("Buildexact-Signature") || req.get("X-Buildexact-Signature") || "";
  const v = verifyBuildexactSignature(raw, sigHeader, secret);
  if (secret && !v.ok) {
    console.warn("[buildexact webhook] signature verification failed:", v.reason);
    return res.status(401).send("invalid signature");
  }
  if (!secret) {
    console.warn("[buildexact webhook] BUILDEXACT_WEBHOOK_SECRET not set — signature verification skipped.");
  }

  let body;
  try {
    body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
  } catch (e) {
    console.warn("[buildexact webhook] invalid JSON:", e?.message);
    return res.status(200).json({ ok: true, ignored: true, reason: "invalid_json" });
  }

  const eventType = String(extractEventType(body) || "").trim() || "unknown";
  const payload = extractJobPayload(body);
  const jobId = extractJobId(payload);
  const address = extractJobAddress(payload);

  const sb = getServiceSupabase();
  if (!sb) {
    console.warn("[buildexact webhook] Supabase service role not configured — event not persisted.");
    return res.status(200).json({ ok: true, logged: false, reason: "no_supabase" });
  }

  const { data: inserted, error: insErr } = await sb
    .from("buildexact_webhook_events")
    .insert({
      event_type: eventType,
      payload: body,
      processed: false
    })
    .select("id")
    .single();

  if (insErr) {
    console.error("[buildexact webhook] insert event:", insErr.message);
    return res.status(200).json({ ok: true, logged: false, reason: insErr.message });
  }

  const eventRowId = inserted?.id;

  const et = eventType.toLowerCase();
  if (et.includes("estimate")) {
    if (eventRowId) {
      await sb.from("buildexact_webhook_events").update({ processed: true }).eq("id", eventRowId);
    }
    return res.status(200).json({ ok: true, handled: "estimate_stub" });
  }

  if (!et.includes("job")) {
    return res.status(200).json({ ok: true, ignored: true, event_type: eventType });
  }

  if (!jobId || !address) {
    console.log("[buildexact webhook] job event without id/address — stored only.", { eventType, jobId, address });
    return res.status(200).json({ ok: true, stored: true, matched: false });
  }

  const { data: projects, error: pErr } = await sb
    .from("projects")
    .select("id, address, buildexact_job_id")
    .is("buildexact_job_id", null)
    .eq("status", "active")
    .limit(50);

  if (pErr) {
    console.error("[buildexact webhook] projects query:", pErr.message);
    return res.status(200).json({ ok: true, stored: true, matched: false });
  }

  const match = (projects || []).find((p) => addressesLikelyMatch(p.address, address));
  if (!match) {
    console.log("[buildexact webhook] no address match for job", jobId, address);
    return res.status(200).json({ ok: true, stored: true, matched: false });
  }

  const now = new Date().toISOString();
  await sb
    .from("projects")
    .update({
      buildexact_job_id: String(jobId),
      buildexact_linked_at: now,
      buildexact_link_source: "webhook",
      buildexact_last_sync: now,
      updated_at: now
    })
    .eq("id", match.id);

  if (eventRowId) {
    await sb
      .from("buildexact_webhook_events")
      .update({ processed: true, matched_project_id: match.id })
      .eq("id", eventRowId);
  }

  console.log(`[buildexact webhook] Auto-linked project ${match.address} to Buildexact job ${jobId}`);
  return res.status(200).json({ ok: true, matched: true, project_id: match.id, buildexact_job_id: String(jobId) });
}

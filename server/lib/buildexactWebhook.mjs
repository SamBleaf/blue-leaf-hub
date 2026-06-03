import crypto from "crypto";
import { getServiceSupabase } from "./supabaseService.mjs";

/**
 * Buildxact signature: HMACSHA256 → Base64 (per developer portal docs).
 * The secret is UTF-8 encoded; the hash is Base64, NOT hex.
 */
function timingSafeEqualBase64(a, b) {
  try {
    const ba = Buffer.from(String(a).trim(), "base64");
    const bb = Buffer.from(String(b).trim(), "base64");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function verifyBuildexactSignature(rawBody, headerValue, secret) {
  if (!secret) return { ok: true, skipped: true };
  if (!headerValue || typeof headerValue !== "string") return { ok: false, reason: "missing_signature_header" };
  // Buildxact serialises using camelCase + signs with HMAC-SHA256, output = Base64 string (not hex).
  const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const trimmed = headerValue.trim();
  // Header may be prefixed "sha256=" — strip if present.
  const sig = trimmed.toLowerCase().startsWith("sha256=") ? trimmed.slice(7).trim() : trimmed;
  return { ok: timingSafeEqualBase64(sig, hmac), reason: "hmac_mismatch" };
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

/**
 * Buildxact uses camelCase naming policy (per developer portal docs).
 * Most likely field is `eventType`; keep PascalCase + snake_case fallbacks for safety.
 * Known event names: "Estimate Accepted", "Lead Created", "Lead Updated", etc.
 */
function extractEventType(body) {
  return (
    body?.eventType ||   // camelCase — Buildxact developer portal naming policy
    body?.EventType ||   // PascalCase fallback
    body?.event_type ||  // snake_case fallback
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

  // Log all headers in dev so we can see exactly what Buildexact sends
  const sigHeader =
    req.get("Buildexact-Signature") ||
    req.get("X-Buildexact-Signature") ||
    req.get("X-Hub-Signature-256") ||
    req.get("X-Signature") ||
    req.get("Signature") ||
    "";

  console.log("[buildexact webhook] incoming headers:", JSON.stringify({
    "buildexact-signature": req.get("Buildexact-Signature"),
    "x-buildexact-signature": req.get("X-Buildexact-Signature"),
    "x-hub-signature-256": req.get("X-Hub-Signature-256"),
    "x-signature": req.get("X-Signature"),
    "signature": req.get("Signature"),
    "content-type": req.get("Content-Type"),
  }));

  if (secret) {
    if (!sigHeader) {
      // Secret set but Buildexact sent no signature header — log but allow through so we can see what header they use
      console.warn("[buildexact webhook] BUILDEXACT_WEBHOOK_SECRET is set but no signature header found — processing anyway. Check Railway logs to identify the correct header name.");
    } else {
      const v = verifyBuildexactSignature(raw, sigHeader, secret);
      if (!v.ok) {
        console.warn("[buildexact webhook] signature verification failed:", v.reason, "header value:", sigHeader.slice(0, 40));
        return res.status(401).send("invalid signature");
      }
    }
  } else {
    console.warn("[buildexact webhook] BUILDEXACT_WEBHOOK_SECRET not set — signature verification skipped.");
  }

  let body;
  try {
    body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
  } catch (e) {
    console.warn("[buildexact webhook] invalid JSON:", e?.message);
    return res.status(200).json({ ok: true, ignored: true, reason: "invalid_json" });
  }

  // Log top-level keys so we can confirm the real field names from Railway logs.
  console.log("[buildexact webhook] top-level keys:", Object.keys(body || {}));
  console.log("[buildexact webhook] raw body (first 500 chars):", JSON.stringify(body).slice(0, 500));

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

  // Known Buildxact event categories (per developer portal docs).
  // Estimate events: "Estimate Accepted" etc. — logged, stub handler for now.
  if (et.includes("estimate")) {
    if (eventRowId) {
      await sb.from("buildexact_webhook_events").update({ processed: true }).eq("id", eventRowId);
    }
    return res.status(200).json({ ok: true, handled: "estimate_stub" });
  }

  // Lead events: "Lead Created", "Lead Updated" — log and return ok (no Hub action yet).
  if (et.includes("lead")) {
    if (eventRowId) {
      await sb.from("buildexact_webhook_events").update({ processed: true }).eq("id", eventRowId);
    }
    return res.status(200).json({ ok: true, handled: "lead_stub" });
  }

  if (!et.includes("job")) {
    console.log("[buildexact webhook] unrecognised event type:", eventType, "— stored, not processed");
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

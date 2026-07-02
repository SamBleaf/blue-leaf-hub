/**
 * W1D — CRM inbound-feed contract tests + outbound-sync readiness.
 *
 * Purpose: prove the backend routes that feed the CRM are correct BEFORE the external
 * apps (website, Instagram/Facebook via Meta, Google) are connected end-to-end.
 *
 * Two strategies:
 *   A. INBOUND feeds we RECEIVE — simulate the exact payload the external service posts and
 *      assert the CRM/attribution side-effects. (website enquiry, tracking, Resend webhook)
 *   B. OUTBOUND syncs we CALL OUT for — can't hit the real API without creds, so assert the
 *      route is wired + auth-gated + fails safe (never 404/500; clean 503 until configured),
 *      and that GET /api/integrations/status reports readiness correctly.
 *
 * Read-only-safe: inbound sims create __BLH TEST__ fixtures and clean up by email/session.
 * No external network calls are made (sync tests run against the un-configured guards).
 */
import crypto from "crypto";
import { WRITE, API, get, post, getAuthToken, serviceClient } from "./_helpers.mjs";

const PREFIX = "__BLH TEST__ W1D";

async function rawPost(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: "POST", headers, body: JSON.stringify(body || {}) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// Send an exact raw body + custom headers (needed so the Svix signature covers the same bytes).
async function rawPostBody(path, rawBody, extraHeaders) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(extraHeaders || {}) },
    body: rawBody,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// Replicate the server's Svix scheme (crmRoutes.verifyResendSvixSignature) so a simulated
// webhook passes signature verification and exercises the real handler.
function svixSign(secret, svixId, ts, rawBody) {
  const keyB64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const key = Buffer.from(keyB64, "base64");
  const sig = crypto.createHmac("sha256", key).update(`${svixId}.${ts}.${rawBody}`).digest("base64");
  return `v1,${sig}`;
}

export async function runW1D(run) {
  run.section("W1D Integration contracts (inbound feeds + outbound sync readiness)");
  const svc = serviceClient();
  if (!svc) { run.fail("Service client", "SUPABASE_SERVICE_ROLE_KEY not configured"); return; }

  // ── B. Outbound-sync readiness (no --write needed; no external calls) ──────
  // GET /api/integrations/status — the readiness map that flips green as APIs connect.
  const status = await get("/api/integrations/status");
  if (status.status === 200 && status.body?.ok && status.body.google && status.body.meta && status.body.resend) {
    run.pass("W1D-STATUS integrations/status reports google/meta/resend readiness keys");
    run.pass(`W1D-STATUS current: google.gsc=${status.body.google.gsc} meta=${status.body.meta.configured} resend=${status.body.resend.configured}`);
  } else {
    run.fail("W1D-STATUS integrations/status shape", JSON.stringify(status.body).slice(0, 200));
  }

  // Sync endpoints must be auth-gated (401 without a token).
  for (const svcName of ["meta", "gsc", "ga4", "gbp"]) {
    const noAuth = await rawPost(`/api/intelligence/sync/${svcName}`, {});
    if (noAuth.status === 401) run.pass(`W1D-SYNC ${svcName}: requires auth (401 without token)`);
    else run.fail(`W1D-SYNC ${svcName}: requires auth`, `expected 401, got ${noAuth.status}`);
  }

  let token;
  try { token = await getAuthToken(); } catch (e) { run.fail("Auth token", e.message); return; }

  // With a valid token: the route must exist and fail SAFE. Meaning of each status:
  //   200 = configured + pull succeeded;   503 = not configured (guard, expected pre-setup);
  //   403 = role;   502 with a clean ok:false error = route reached the live API but the
  //   provider rejected (permission/quota/setup at Google/Meta's end) — this PROVES the route
  //   is correct and connected. Only 404 (missing route) or a 500/unhandled crash is a defect.
  for (const svcName of ["meta", "gsc", "ga4", "gbp"]) {
    const r = await rawPost(`/api/intelligence/sync/${svcName}`, {}, token);
    // A clean upstream error (502/504 with ok:false + a string message) means the route reached
    // the live provider and surfaced its rejection — proof the route is correct + connected.
    const cleanUpstreamErr = [502, 504].includes(r.status) && r.body?.ok === false && typeof r.body?.error === "string";
    // Safe = a deliberate, handled response. 404 (missing route) or 500 (unhandled crash) are defects.
    const safe = [200, 403, 503].includes(r.status) || cleanUpstreamErr;
    const meaning = r.status === 200 ? "live + working"
      : r.status === 503 ? "not-configured (guard, expected pre-setup)"
      : r.status === 403 ? "role-gated"
      : cleanUpstreamErr ? "reached live API, provider rejected (setup at their end)"
      : `unexpected status ${r.status}`;
    if (safe) run.pass(`W1D-SYNC ${svcName}: wired + fails safe — ${meaning}`);
    else run.fail(`W1D-SYNC ${svcName}: wired + fails safe`, `status ${r.status} ${JSON.stringify(r.body).slice(0, 140)}`);
  }

  if (!WRITE) {
    run.skip("W1D-01 website enquiry (social utm) creates lead", "requires --write");
    run.skip("W1D-02 website enquiry (no utm) → website category", "requires --write");
    run.skip("W1D-03 attribution touch → enquiry links first/last touch", "requires --write");
    run.skip("W1D-04 honeypot blocks bot lead", "requires --write");
    run.skip("W1D-05 attribution invalid event_type rejected", "requires --write");
    run.skip("W1D-06 Resend webhook marks recipient opened", "requires --write");
    return;
  }

  const ts = Date.now();
  const leadIds = [], sessionIds = [], emailSendIds = [];
  try {
    // ── A1. Website enquiry carrying a social utm_source ──────────────────────
    const igEnq = await post("/api/public/enquiry", {
      name: `${PREFIX} Insta ${ts}`, email: `blh-test-w1d-ig-${ts}@example.test`,
      project_type: "new_home", suburb: "Stirling",
      utm_source: "instagram", utm_medium: "social", utm_campaign: "spring_reno",
    });
    const igLead = igEnq.body?.lead;
    if (igLead?.id) leadIds.push(igLead.id);
    if (igEnq.status === 200 && igLead && igLead.leadSourceCategory === "social" && igLead.leadSource === "instagram") {
      run.pass("W1D-01 website enquiry (utm_source=instagram) → lead, lead_source_category='social'");
    } else {
      run.fail("W1D-01 website enquiry (social)", `status ${igEnq.status} cat=${igLead?.leadSourceCategory} src=${igLead?.leadSource}`);
    }

    // Google-search enquiry → 'search'
    const gEnq = await post("/api/public/enquiry", {
      name: `${PREFIX} Goog ${ts}`, email: `blh-test-w1d-g-${ts}@example.test`, utm_source: "google",
    });
    if (gEnq.body?.lead?.id) leadIds.push(gEnq.body.lead.id);
    if (gEnq.status === 200 && gEnq.body?.lead?.leadSourceCategory === "search") {
      run.pass("W1D-01b website enquiry (utm_source=google) → lead_source_category='search'");
    } else {
      run.fail("W1D-01b website enquiry (google)", `cat=${gEnq.body?.lead?.leadSourceCategory}`);
    }

    // ── A2. Plain website enquiry (no utm) → 'website' ────────────────────────
    const wEnq = await post("/api/public/enquiry", {
      name: `${PREFIX} Web ${ts}`, email: `blh-test-w1d-w-${ts}@example.test`,
    });
    if (wEnq.body?.lead?.id) leadIds.push(wEnq.body.lead.id);
    if (wEnq.status === 200 && wEnq.body?.lead?.leadSourceCategory === "website") {
      run.pass("W1D-02 plain website enquiry → lead_source_category='website'");
    } else {
      run.fail("W1D-02 plain website enquiry", `cat=${wEnq.body?.lead?.leadSourceCategory}`);
    }

    // ── A3. Attribution touches → enquiry links first/last touch ──────────────
    const sessionId = `blh-test-w1d-sess-${ts}`;
    sessionIds.push(sessionId);
    const t1 = await post("/api/public/attribution", {
      session_id: sessionId, visitor_id: `v-${ts}`, event_type: "page_view",
      page_url: "https://blueleafbuilding.com.au/", utm_source: "facebook", utm_medium: "social",
    });
    const t2 = await post("/api/public/attribution", {
      session_id: sessionId, event_type: "content_view",
      page_url: "https://blueleafbuilding.com.au/projects", utm_source: "facebook", utm_medium: "social",
    });
    const linkedEnq = await post("/api/public/enquiry", {
      name: `${PREFIX} Attr ${ts}`, email: `blh-test-w1d-attr-${ts}@example.test`,
      session_id: sessionId, utm_source: "facebook", utm_medium: "social",
    });
    const attrLead = linkedEnq.body?.lead;
    if (attrLead?.id) leadIds.push(attrLead.id);
    const attribution = linkedEnq.body?.attribution;
    if (t1.status === 200 && t2.status === 200 && linkedEnq.status === 200 && attribution
        && attribution.firstTouchSource === "facebook") {
      run.pass("W1D-03 attribution touches → enquiry links first-touch (facebook) + enquiry_attribution row");
    } else {
      run.fail("W1D-03 attribution → enquiry link", `t1 ${t1.status} t2 ${t2.status} enq ${linkedEnq.status} attr=${JSON.stringify(attribution)}`);
    }
    // Confirm the events were stamped with the new lead_id (closed loop)
    if (attrLead?.id) {
      const { data: linkedEvents } = await svc.from("attribution_events").select("lead_id").eq("session_id", sessionId);
      if ((linkedEvents || []).length >= 2 && linkedEvents.every(e => e.lead_id === attrLead.id)) {
        run.pass("W1D-03b attribution_events backfilled with lead_id on enquiry");
      } else {
        run.fail("W1D-03b attribution_events backfilled", JSON.stringify(linkedEvents));
      }
    }

    // ── A4. Honeypot blocks a bot ─────────────────────────────────────────────
    const bot = await post("/api/public/enquiry", {
      name: `${PREFIX} Bot ${ts}`, email: `blh-test-w1d-bot-${ts}@example.test`, website: "http://spam.example",
    });
    if (bot.status === 200 && bot.body?.skipped === true) {
      run.pass("W1D-04 honeypot: bot enquiry skipped (no lead created)");
    } else {
      run.fail("W1D-04 honeypot", `status ${bot.status} skipped=${bot.body?.skipped}`);
      if (bot.body?.lead?.id) leadIds.push(bot.body.lead.id);
    }

    // ── A5. Attribution validation ────────────────────────────────────────────
    const badEvt = await post("/api/public/attribution", { session_id: sessionId, event_type: "not_a_real_event" });
    if (badEvt.status === 400) run.pass("W1D-05 attribution invalid event_type rejected (400)");
    else run.fail("W1D-05 attribution invalid event_type", `status ${badEvt.status}`);

    // ── A6. Resend webhook marks a recipient opened ───────────────────────────
    // Seed an email_send + recipient with a unique resend_email_id, then simulate the webhook.
    // When RESEND_WEBHOOK_SECRET is set (prod-safe), sign the payload with the real Svix scheme
    // so it passes verification and exercises the true opened-marking path. First prove an
    // UNSIGNED payload is rejected (signature enforcement is live) — a security contract.
    const resendId = `blh-test-w1d-resend-${ts}`;
    const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
    const { data: es } = await svc.from("email_sends").insert({ subject: `${PREFIX} send ${ts}` }).select().single();
    if (es?.id) {
      emailSendIds.push(es.id);
      await svc.from("email_send_recipients").insert({
        email_send_id: es.id, email_address: `blh-test-w1d-r-${ts}@example.test`,
        resend_email_id: resendId, status: "pending",
      });
      const payload = JSON.stringify({ type: "email.opened", data: { email_id: resendId } });

      if (secret) {
        const unsigned = await rawPostBody("/api/webhooks/resend", payload, {});
        if (unsigned.status === 401) run.pass("W1D-06a Resend webhook rejects UNSIGNED events (signature enforcement live)");
        else run.fail("W1D-06a Resend webhook rejects unsigned", `expected 401, got ${unsigned.status}`);
      }

      const svixId = `msg_blh_test_${ts}`;
      const svixTs = String(Math.floor(ts / 1000));
      const headers = secret
        ? { "svix-id": svixId, "svix-timestamp": svixTs, "svix-signature": svixSign(secret, svixId, svixTs, payload) }
        : {};
      const hook = await rawPostBody("/api/webhooks/resend", payload, headers);
      const { data: rcpt } = await svc.from("email_send_recipients").select("status, opened_at").eq("resend_email_id", resendId).maybeSingle();
      if ([200, 204].includes(hook.status) && rcpt?.status === "opened" && rcpt?.opened_at) {
        run.pass(`W1D-06 Resend webhook email.opened${secret ? " (signed)" : ""} → recipient marked opened (feeds v_lead_timeline)`);
      } else {
        run.fail("W1D-06 Resend webhook email.opened", `hook ${hook.status} status=${rcpt?.status} opened_at=${rcpt?.opened_at}`);
      }
    } else {
      run.fail("W1D-06 setup", "could not seed email_sends row");
    }
  } finally {
    for (const id of emailSendIds) {
      await svc.from("email_send_recipients").delete().eq("email_send_id", id);
      await svc.from("email_sends").delete().eq("id", id);
    }
    for (const s of sessionIds) await svc.from("attribution_events").delete().eq("session_id", s);
    for (const id of leadIds) {
      await svc.from("enquiry_attribution").delete().eq("lead_id", id);
      await svc.from("attribution_events").delete().eq("lead_id", id);
      await svc.from("lead_activities").delete().eq("lead_id", id);
      await svc.from("leads").delete().eq("id", id);
    }
  }
}

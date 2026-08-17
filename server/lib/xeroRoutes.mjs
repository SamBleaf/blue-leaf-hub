/**
 * xeroRoutes.mjs — Xero connection endpoints (P0 of the AR / client-invoice integration).
 *
 *   GET  /api/finance/xero/status      (admin)  — configured? connected? tenant + token freshness
 *   GET  /api/finance/xero/connect     (admin)  — returns the Xero authorize URL to open
 *   POST /api/finance/xero/disconnect  (admin)  — forget the stored tokens
 *   GET  /api/public/xero/callback     (public) — Xero redirects here; exchange the code + store
 *
 * /api/finance/* is already gated admin-only by the blanket guard in dev-api.mjs (:986),
 * so status/connect/disconnect need no per-route auth. The callback lives under /api/public
 * because Xero redirects to it with NO bearer token — it can't sit behind the finance guard.
 *
 * Everything is fail-soft: with XERO_* unset, status reports configured:false and nothing
 * throws. Registered by dev-api.mjs after the finance registrations.
 */
import { ok, err, rowToCamel, rowsToCamel } from "./apiResponse.mjs";
import { appBaseUrl } from "./appUrl.mjs";
import { getServiceSupabase } from "./supabaseService.mjs";
import {
  xeroConfigured, signState, verifyState, buildAuthorizeUrl,
  exchangeCodeForTokens, getConnectedTenant, disconnectXero, xeroRedirectUri,
  XeroNotConnectedError,
} from "./xeroClient.mjs";
import {
  createXeroInvoice, syncXeroInvoice, listXeroInvoices, getInvoiceRow,
  fileXeroInvoicePdf, fetchXeroInvoicePdf, getOnlineInvoiceUrl,
} from "./xeroInvoices.mjs";
import { sendPlainMail } from "./notifyMail.mjs";
import { getUserSignature } from "./emailSignature.mjs";
import { loadInvoiceEmailTemplate, buildInvoiceEmail, renderInvoiceEmail } from "./invoiceEmail.mjs";
import { emailLogoInline } from "./signatureEmailHtml.mjs";

const xeroEnabled = () => process.env.XERO_ENABLED === "1" || process.env.XERO_ENABLED === "true";

export function registerXeroRoutes(app) {
  // Connection status — drives the Settings → Xero pane.
  app.get("/api/finance/xero/status", async (_req, res) => {
    if (!xeroConfigured()) {
      return ok(res, { configured: false, enabled: xeroEnabled(), connected: false, redirectUri: xeroRedirectUri() });
    }
    let tenant = null;
    try { tenant = await getConnectedTenant(); } catch { tenant = null; }
    const expMs = tenant?.expires_at ? new Date(tenant.expires_at).getTime() : 0;
    return ok(res, {
      configured: true,
      enabled: xeroEnabled(),
      connected: !!tenant,
      tenant: tenant?.tenant_name || null,
      tenantId: tenant?.tenant_id || null,
      tokenExpiresAt: tenant?.expires_at || null,
      // Access tokens live 30 min; a stale one just triggers a silent refresh on next call.
      tokenFresh: expMs ? Date.now() < expMs - 60_000 : false,
      redirectUri: xeroRedirectUri(),
    });
  });

  // Build the authorize URL (the frontend opens it — apiFetch can't follow a cross-origin redirect).
  app.get("/api/finance/xero/connect", (_req, res) => {
    if (!xeroConfigured()) return err(res, 400, "Xero is not configured — set XERO_CLIENT_ID and XERO_CLIENT_SECRET.");
    try {
      return ok(res, { url: buildAuthorizeUrl(signState()) });
    } catch (e) {
      return err(res, 500, e?.message || "Could not build the Xero authorize URL.");
    }
  });

  app.post("/api/finance/xero/disconnect", async (_req, res) => {
    try { await disconnectXero(); return ok(res); }
    catch (e) { return err(res, 500, e?.message || "Could not disconnect Xero."); }
  });

  // ── Invoices (P1: concept fee) ──────────────────────────────────────────────
  // List a lead's Xero invoices (read-only — drives the lead-detail card).
  app.get("/api/finance/leads/:leadId/xero-invoices", async (req, res) => {
    try {
      const rows = await listXeroInvoices({ leadId: req.params.leadId });
      return ok(res, { invoices: rowsToCamel(rows) });
    } catch (e) {
      return err(res, 500, e?.message || "Could not load invoices.");
    }
  });

  // Create the concept-fee invoice in Xero (AUTHORISED). Gated by XERO_ENABLED; requires
  // the concept agreement accepted + a concept fee set. Idempotent (no duplicate on re-click).
  app.post("/api/finance/leads/:leadId/concept-fee/invoice", async (req, res) => {
    if (!xeroEnabled()) return err(res, 400, "Xero invoicing is off — set XERO_ENABLED=1 on the server.");
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database is not configured.");
    try {
      const { data: lead, error: lErr } = await sb.from("leads")
        .select("*")
        .eq("id", req.params.leadId).maybeSingle();
      if (lErr) return err(res, 500, "Could not load the lead."); // don't mislabel a query error as "not found"
      if (!lead) return err(res, 404, "Lead not found.");
      if (lead.concept_agreement_status !== "accepted") {
        return err(res, 422, "The concept agreement must be accepted before invoicing the concept fee.", "GATE_BLOCKED");
      }
      const amount = Number(req.body?.amount ?? lead.concept_fee);
      if (!Number.isFinite(amount) || amount <= 0) {
        return err(res, 400, "Set a concept fee on the lead before creating the invoice.");
      }
      let row = await createXeroInvoice({
        invoiceType: "concept_fee",
        sourceType: "lead",
        sourceId: lead.id,
        leadId: lead.id,
        client: { name: lead.name, email: lead.email },
        amountExGst: amount,
        reference: lead.name || undefined,
        address: lead.site_address || lead.suburb || undefined,
        createdBy: req.caller?.id || null,
      });
      // File the official PDF + fetch the pay link (best-effort — never fails the create).
      try { row = await fileXeroInvoicePdf({ sb, row }); } catch { /* filing best-effort */ }
      return ok(res, { invoice: rowToCamel(row) });
    } catch (e) {
      if (e instanceof XeroNotConnectedError) {
        return err(res, 400, e.message || "Connect Xero first (Settings → Integrations → Xero).", e.needsReconnect ? "XERO_RECONNECT" : "XERO_NOT_CONNECTED");
      }
      return err(res, 400, e?.message || "Could not create the invoice in Xero.");
    }
  });

  // Manually re-sync one invoice from Xero (until the webhook lands in P3).
  app.post("/api/finance/xero-invoices/:id/sync", async (req, res) => {
    try {
      const row = await syncXeroInvoice(req.params.id);
      return ok(res, { invoice: rowToCamel(row) });
    } catch (e) {
      if (e instanceof XeroNotConnectedError) return err(res, 400, e.message, "XERO_NOT_CONNECTED");
      return err(res, 400, e?.message || "Could not sync the invoice.");
    }
  });

  // ── P2: official PDF link + Hub-send ────────────────────────────────────────
  // A short-lived signed URL to the official Xero PDF (files it on demand if not yet filed).
  app.get("/api/finance/xero-invoices/:id/pdf-url", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database is not configured.");
    try {
      let row = await getInvoiceRow(sb, req.params.id);
      if (!row) return err(res, 404, "Invoice not found.");
      if (!row.pdf_storage_path) { try { row = await fileXeroInvoicePdf({ sb, row }); } catch { /* fall through */ } }
      if (!row?.pdf_storage_path) return err(res, 502, "Could not retrieve the invoice PDF from Xero.");
      const { data: signed, error: sErr } = await sb.storage.from("lead-documents").createSignedUrl(row.pdf_storage_path, 3600);
      if (sErr || !signed?.signedUrl) return err(res, 502, "Could not build the PDF link.");
      return ok(res, { url: signed.signedUrl });
    } catch (e) {
      if (e instanceof XeroNotConnectedError) return err(res, 400, e.message, "XERO_NOT_CONNECTED");
      return err(res, 400, e?.message || "Could not get the invoice PDF.");
    }
  });

  // Hub-send the official invoice (branded PDF + pay link) to the client via our SMTP.
  // Atomic anti-double-send: the send_source lock is claimed before any email is sent.
  // POST { preview:true } returns the assembled email WITHOUT claiming the lock or sending
  // (so the card can show a template preview, like the qualify/discovery emails).
  app.post("/api/finance/xero-invoices/:id/send", async (req, res) => {
    if (!xeroEnabled()) return err(res, 400, "Xero invoicing is off — set XERO_ENABLED=1.");
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database is not configured.");
    const dryRun = req.body?.preview === true;
    try {
      const row0 = await getInvoiceRow(sb, req.params.id);
      if (!row0) return err(res, 404, "Invoice not found.");
      if (!row0.xero_invoice_id) return err(res, 422, "Create the invoice in Xero before sending.");
      if (!row0.lead_id) return err(res, 422, "Sending is wired for lead-scoped invoices; job invoices arrive in P4.");

      const { data: lead } = await sb.from("leads").select("id, name, email").eq("id", row0.lead_id).maybeSingle();
      const to = String(req.body?.to || lead?.email || row0.sent_to_email || "").trim();
      if (!dryRun && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return err(res, 400, "No valid client email to send to.");

      // Assemble the email from the admin-editable template (autofilled + escaped in the module).
      const payUrl = row0.online_invoice_url || (await getOnlineInvoiceUrl(row0));
      const template = await loadInvoiceEmailTemplate(sb);
      const signature = await getUserSignature(sb, req.caller?.id || null);
      const assembled = buildInvoiceEmail(lead, row0, { template, signature, payUrl });

      if (dryRun) return ok(res, { preview: { subject: assembled.subject, text: assembled.text, html: assembled.html, to } });

      // Actual send — use the operator's EDITED copy from the preview if provided, else the template.
      const editSubject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
      const editText = typeof req.body?.text === "string" ? req.body.text : "";
      const email = (editSubject && editText) ? renderInvoiceEmail({ subject: editSubject, text: editText }) : assembled;

      // Claim the send lock atomically (0 rows ⇒ already sent).
      const { data: claimed } = await sb.from("xero_invoices")
        .update({ send_source: "hub_smtp", sent_at: new Date().toISOString(), sent_to_email: to, updated_at: new Date().toISOString() })
        .eq("id", row0.id).is("send_source", null).select("*").maybeSingle();
      if (!claimed) return err(res, 409, "This invoice has already been sent.", "ALREADY_SENT");

      const row = await fileXeroInvoicePdf({ sb, row: claimed }); // ensure filed + pay link
      let pdf = null;
      try { pdf = await fetchXeroInvoicePdf(row); } catch { pdf = null; }
      const number = row.xero_invoice_number || row.xero_invoice_id;
      // Company logo (CID inline image) in the HTML signature.
      const logo = emailLogoInline();
      const html = email.html + logo.imgHtml;
      const attachments = [
        pdf ? { filename: `Invoice-${number}.pdf`, content: pdf, mimeType: "application/pdf" } : null,
        logo.attachment,
      ].filter(Boolean);

      try {
        await sendPlainMail({ to, subject: email.subject, text: email.text, html, attachments });
      } catch (e) {
        // Release the lock so the send can be retried.
        await sb.from("xero_invoices").update({ send_source: null, sent_at: null, updated_at: new Date().toISOString() }).eq("id", row.id);
        return err(res, 502, `Could not send the invoice email: ${e?.message || e}`);
      }

      const nextStatus = ["part_paid", "paid", "void"].includes(row.status) ? row.status : "sent";
      const { data: finalRow } = await sb.from("xero_invoices").update({ status: nextStatus, updated_at: new Date().toISOString() }).eq("id", row.id).select("*").maybeSingle();
      try { await sb.from("correspondence").insert({ lead_id: row.lead_id, direction: "outbound", subject: email.subject, body: email.text, email_to: to }); } catch { /* best-effort */ }
      try { await sb.from("lead_activities").insert({ lead_id: row.lead_id, activity_type: "email", summary: `Invoice ${number} sent to client` }); } catch { /* best-effort */ }

      return ok(res, { invoice: rowToCamel(finalRow || row) });
    } catch (e) {
      if (e instanceof XeroNotConnectedError) return err(res, 400, e.message, "XERO_NOT_CONNECTED");
      return err(res, 400, e?.message || "Could not send the invoice.");
    }
  });

  // PUBLIC — Xero redirects here after the user approves (no bearer token). Validate the
  // signed state, exchange the code, then bounce back into the Settings pane with a flag.
  app.get("/api/public/xero/callback", async (req, res) => {
    const base = appBaseUrl();
    // Xero is a sub-pane of the Integrations settings category, addressed by #xero hash.
    const fail = (reason) => res.redirect(`${base}/settings/integrations?xero_error=${encodeURIComponent(reason)}#xero`);
    try {
      const { code, state, error: oauthErr } = req.query;
      if (oauthErr) return fail(String(oauthErr));
      if (!code || !verifyState(state)) return fail("invalid_state");
      await exchangeCodeForTokens(String(code));
      return res.redirect(`${base}/settings/integrations?xero_connected=1#xero`);
    } catch (e) {
      return fail(e?.message || "connect_failed");
    }
  });
}

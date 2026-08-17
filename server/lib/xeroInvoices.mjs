/**
 * xeroInvoices.mjs — the Xero accounts-receivable service + invoice-type registry.
 *
 * Build-once seam: every kind of client invoice (concept fee, design package, progress
 * claim, variation, deposit) is a registry entry — a new invoice type is a new entry,
 * not a new integration. P1 ships `concept_fee` (lead-scoped); the rest arrive in P4.
 *
 * Invariants:
 *  • Amounts are stored + sent EX-GST; Xero adds GST (LineAmountTypes=Exclusive, TaxType
 *    OUTPUT). xero_total/amount_due/amount_paid are Xero's inc-GST truth — never recomputed.
 *  • Anti-double-create (3 layers): app guard (if xero_invoice_id present → sync, don't
 *    create) + DB UNIQUE(source_type,source_id) + a persisted per-row Idempotency-Key.
 *  • Fail-soft: not-connected / not-configured throws XeroNotConnectedError; a missing
 *    account code marks the row `error` with a plain message. No invoice layout is authored
 *    here — Xero's Branding Theme renders the PDF.
 */
import { getServiceSupabase } from "./supabaseService.mjs";
import { xeroRequest, getConnectedTenant, XeroNotConnectedError } from "./xeroClient.mjs";
import { backfillLeadDocsToClientFolder } from "./dropboxClient.mjs";

// ── Invoice-type registry ─────────────────────────────────────────────────────
export const INVOICE_TYPES = {
  concept_fee: {
    scope: "lead",
    sourceType: "lead",
    accountCodeEnv: "XERO_ACCOUNT_CODE_DESIGN",
    brandingThemeEnv: "XERO_BRANDING_THEME_DESIGN", // optional — else Xero's org default theme
    dueDays: 14,
    label: "Concept design fee",
    describe: ({ address } = {}) => `Concept design fee${address ? ` — ${address}` : ""}`,
  },
  // design_package / progress_claim / job_variation / deposit — added in P4.
};

function taxType() {
  return process.env.XERO_TAX_TYPE?.trim() || "OUTPUT"; // GST on income (AU)
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function dueDateIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + (Number(days) || 0));
  return d.toISOString().slice(0, 10);
}

// Escape a value for a Xero double-quoted `where` clause (names rarely contain quotes).
function whereEsc(v) {
  return String(v || "").replace(/["\\]/g, "");
}

// Derive the Hub-side status from Xero's money fields (never guess — trust Xero).
// Exported for the P3 webhook/reconcile + unit tests.
export function hubStatusFromXero(inv) {
  const status = (inv?.Status || "").toUpperCase();
  const due = Number(inv?.AmountDue ?? 0);
  const paid = Number(inv?.AmountPaid ?? 0);
  if (status === "VOIDED" || status === "DELETED") return "void";
  if (status === "PAID" || (due === 0 && (Number(inv?.Total ?? 0) > 0 || paid > 0))) return "paid";
  if (paid > 0 && due > 0) return "part_paid";
  if (status === "AUTHORISED" || status === "SUBMITTED") return "authorised";
  return "authorised";
}

/**
 * Find (cache → Xero) or create a Xero Contact for a client; cache the mapping so we
 * never create a duplicate. Returns the ContactID.
 */
export async function ensureXeroContact({ tenantId, name, email, leadId = null, jobId = null, crmContactId = null }) {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("Database is not configured.");
  const cleanEmail = (email || "").trim();
  const emailKey = cleanEmail.toLowerCase(); // cache is keyed on the lowercased email
  const displayName = (name || "").trim() || cleanEmail || "Client";

  // 1) Local cache by EXACT email (per tenant). Must be an exact eq, not ilike — an
  // ilike pattern treats '_' and '%' in the address as wildcards and could return a
  // DIFFERENT client's cached contact (e.g. john_smith matching johnbsmith), billing
  // the wrong customer. The email is stored lowercased so eq is case-insensitive.
  if (emailKey) {
    const { data: cached } = await sb.from("xero_contacts")
      .select("xero_contact_id")
      .eq("xero_tenant_id", tenantId)
      .eq("email", emailKey)
      .limit(1)
      .maybeSingle();
    if (cached?.xero_contact_id) return cached.xero_contact_id;
  }

  // 2) Ask Xero (by email, else by exact name — Contact Name is unique in an org).
  const where = cleanEmail ? `EmailAddress=="${whereEsc(cleanEmail)}"` : `Name=="${whereEsc(displayName)}"`;
  let contactId = null;
  try {
    const found = await xeroRequest("/Contacts", { tenantId, query: { where } });
    contactId = found?.Contacts?.[0]?.ContactID || null;
  } catch { contactId = null; }

  // 3) Create it if Xero doesn't have it.
  if (!contactId) {
    const created = await xeroRequest("/Contacts", {
      method: "POST",
      tenantId,
      body: { Contacts: [{ Name: displayName, ...(cleanEmail ? { EmailAddress: cleanEmail } : {}) }] },
    });
    contactId = created?.Contacts?.[0]?.ContactID;
    if (!contactId) throw new Error("Xero did not return a contact id.");
  }

  // 4) Cache the mapping.
  await sb.from("xero_contacts").upsert({
    xero_tenant_id: tenantId,
    xero_contact_id: contactId,
    crm_contact_id: crmContactId,
    lead_id: leadId,
    job_id: jobId,
    name: displayName,
    email: emailKey || null, // stored lowercased to match the exact-eq cache lookup
    updated_at: new Date().toISOString(),
  }, { onConflict: "xero_tenant_id,xero_contact_id" });

  return contactId;
}

async function findInvoiceRow(sb, sourceType, sourceId) {
  const { data } = await sb.from("xero_invoices").select("*")
    .eq("source_type", sourceType).eq("source_id", sourceId).maybeSingle();
  return data || null;
}

/**
 * Create (or re-fetch) the Xero invoice for a source. Idempotent:
 *  • if a row already has xero_invoice_id → syncs + returns it (no duplicate);
 *  • otherwise POSTs an AUTHORISED invoice with a persisted Idempotency-Key.
 * Returns the xero_invoices row.
 */
export async function createXeroInvoice({
  invoiceType, sourceType, sourceId, leadId = null, jobId = null,
  client = {}, amountExGst, reference = null, address = null, createdBy = null,
}) {
  const registry = INVOICE_TYPES[invoiceType];
  if (!registry) throw new Error(`Unknown invoice type: ${invoiceType}`);
  const amount = Number(amountExGst);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invoice amount must be greater than zero.");

  const sb = getServiceSupabase();
  if (!sb) throw new Error("Database is not configured.");
  const tenant = await getConnectedTenant();
  if (!tenant?.tenant_id) throw new XeroNotConnectedError("Xero is not connected", { needsReconnect: true });
  const tenantId = tenant.tenant_id;

  // ── App-guard anti-double-create: reuse the row for this source ──────────────
  let row = await findInvoiceRow(sb, sourceType, sourceId);
  if (row?.xero_invoice_id) return syncXeroInvoice(row.id); // already in Xero → just refresh

  if (!row) {
    const { data: inserted, error } = await sb.from("xero_invoices").insert({
      invoice_type: invoiceType,
      source_type: sourceType,
      source_id: sourceId,
      lead_id: leadId,
      job_id: jobId,
      status: "draft",
      amount_ex_gst: amount,
      currency: "AUD",
      xero_tenant_id: tenantId,
      created_by: createdBy,
    }).select("*").maybeSingle();
    if (error || !inserted) {
      // Lost a race on UNIQUE(source_type,source_id) — re-read the winner.
      row = await findInvoiceRow(sb, sourceType, sourceId);
      if (row?.xero_invoice_id) return syncXeroInvoice(row.id);
      if (!row) throw new Error(error?.message || "Could not create the invoice row.");
    } else {
      row = inserted;
    }
  }

  // ── Account code (required; fail-soft with a clear message) ──────────────────
  const accountCode = process.env[registry.accountCodeEnv]?.trim();
  if (!accountCode) {
    await sb.from("xero_invoices").update({
      status: "error",
      error_message: `Set ${registry.accountCodeEnv} to the Xero income account code before creating this invoice.`,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    throw new Error(`Xero income account code is not configured (${registry.accountCodeEnv}).`);
  }

  // ── Build + POST the AUTHORISED invoice ──────────────────────────────────────
  const contactId = await ensureXeroContact({
    tenantId, name: client.name, email: client.email, leadId, jobId, crmContactId: client.crmContactId || null,
  });
  const brandingThemeId = registry.brandingThemeEnv ? process.env[registry.brandingThemeEnv]?.trim() : null;
  const payload = {
    Type: "ACCREC",
    Contact: { ContactID: contactId },
    LineItems: [{
      Description: registry.describe({ address, client }),
      Quantity: 1.0,
      UnitAmount: amount,
      AccountCode: accountCode,
      TaxType: taxType(),
    }],
    LineAmountTypes: "Exclusive",
    Date: todayIso(),
    DueDate: dueDateIso(registry.dueDays),
    Reference: reference || client.name || registry.label,
    Status: "AUTHORISED",
    ...(brandingThemeId ? { BrandingThemeID: brandingThemeId } : {}),
  };

  let inv;
  try {
    const resp = await xeroRequest("/Invoices", {
      method: "POST", tenantId, body: { Invoices: [payload] }, idempotencyKey: row.idempotency_key,
    });
    inv = resp?.Invoices?.[0];
    if (!inv?.InvoiceID) throw new Error("Xero did not return an invoice id.");
  } catch (e) {
    await sb.from("xero_invoices").update({
      status: "error", error_message: e?.message || "Xero create failed.", updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    throw e;
  }

  const persistPayload = {
    xero_tenant_id: tenantId,
    xero_invoice_id: inv.InvoiceID,
    xero_invoice_number: inv.InvoiceNumber || null,
    xero_status: inv.Status || null,
    xero_total: inv.Total ?? null,
    amount_due: inv.AmountDue ?? null,
    amount_paid: inv.AmountPaid ?? null,
    amount_ex_gst: amount, // keep in sync with what we actually billed (fee may have changed on an error-retry)
    xero_contact_id: contactId,
    status: hubStatusFromXero(inv),
    error_message: null,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  // The invoice now EXISTS in Xero. If we fail to persist its id, a later retry (after
  // Xero's ~24h Idempotency-Key window) would create a DUPLICATE. So retry the persist
  // once, then surface loudly with the Xero number — never leave it silently 'draft'.
  let { data: updated, error: upErr } =
    await sb.from("xero_invoices").update(persistPayload).eq("id", row.id).select("*").maybeSingle();
  if (upErr) {
    ({ data: updated, error: upErr } =
      await sb.from("xero_invoices").update(persistPayload).eq("id", row.id).select("*").maybeSingle());
    if (upErr) {
      const e = new Error(
        `Xero invoice ${inv.InvoiceNumber || inv.InvoiceID} was created but could not be saved to the Hub — do NOT re-create it; use Sync to reconcile. (${upErr.message})`
      );
      e.xeroInvoiceId = inv.InvoiceID;
      throw e;
    }
  }
  return updated || row;
}

/**
 * Refresh a row from Xero (GET the invoice → copy status/amounts). Never touches the
 * send lock. Called by the create guard, the manual re-sync, and (P3) the webhook.
 */
export async function syncXeroInvoice(rowId) {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("Database is not configured.");
  const { data: row } = await sb.from("xero_invoices").select("*").eq("id", rowId).maybeSingle();
  if (!row) throw new Error("Invoice not found.");
  if (!row.xero_invoice_id) return row;

  const tenant = await getConnectedTenant();
  const tenantId = row.xero_tenant_id || tenant?.tenant_id;
  const resp = await xeroRequest(`/Invoices/${row.xero_invoice_id}`, { tenantId });
  const inv = resp?.Invoices?.[0];
  if (!inv) return row;

  // Preserve the Hub 'sent' marker: emailing the client doesn't change Xero's status (still
  // AUTHORISED), so a plain derive would downgrade sent→authorised. Only move off 'sent' when
  // Xero shows real progress (part_paid/paid/void).
  const derived = hubStatusFromXero(inv);
  const nextStatus = (derived === "authorised" && row.status === "sent") ? "sent" : derived;
  const { data: updated } = await sb.from("xero_invoices").update({
    xero_status: inv.Status || null,
    xero_total: inv.Total ?? null,
    amount_due: inv.AmountDue ?? null,
    amount_paid: inv.AmountPaid ?? null,
    status: nextStatus,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", row.id).select("*").maybeSingle();
  // Refresh the pay link (best-effort; persists onto the row) so the card stays current.
  try { await getOnlineInvoiceUrl(updated || row); } catch { /* best-effort */ }
  return (await getInvoiceRow(sb, row.id)) || updated || row;
}

/** List invoice rows for a lead or job (newest first) — drives the lead-detail card. */
export async function listXeroInvoices({ leadId = null, jobId = null } = {}) {
  const sb = getServiceSupabase();
  if (!sb) return [];
  let q = sb.from("xero_invoices").select("*").order("created_at", { ascending: false });
  if (leadId) q = q.eq("lead_id", leadId);
  if (jobId) q = q.eq("job_id", jobId);
  const { data } = await q;
  return data || [];
}

export async function getInvoiceRow(sb, id) {
  const { data } = await (sb || getServiceSupabase()).from("xero_invoices").select("*").eq("id", id).maybeSingle();
  return data || null;
}

// ── P2: the official Xero PDF, the pay link, and filing ───────────────────────

/** The official branded invoice PDF (rendered by Xero's Branding Theme). Returns a Buffer. */
export async function fetchXeroInvoicePdf(row) {
  if (!row?.xero_invoice_id) throw new Error("Invoice not yet created in Xero.");
  return xeroRequest(`/Invoices/${row.xero_invoice_id}`, { tenantId: row.xero_tenant_id, accept: "application/pdf" });
}

/** The Xero online-invoice pay link (AUTHORISED only). Persists it on the row; null if unavailable. */
export async function getOnlineInvoiceUrl(row) {
  if (!row?.xero_invoice_id) return null;
  try {
    const resp = await xeroRequest(`/Invoices/${row.xero_invoice_id}/OnlineInvoice`, { tenantId: row.xero_tenant_id });
    const url = resp?.OnlineInvoices?.[0]?.OnlineInvoiceUrl || null;
    if (url && url !== row.online_invoice_url) {
      const sb = getServiceSupabase();
      if (sb) await sb.from("xero_invoices").update({ online_invoice_url: url, updated_at: new Date().toISOString() }).eq("id", row.id);
    }
    return url;
  } catch { return null; } // OnlineInvoice exists only for AUTHORISED invoices — ignore failures
}

/**
 * Fetch the official PDF + pay link and FILE them: upload the PDF to lead-documents storage,
 * record a lead_documents row (type 'invoice'), copy into the lead's Dropbox client folder, and
 * store pdf_storage_path + online_invoice_url on the invoice row. All best-effort (fail-soft) — a
 * filing failure never breaks invoice creation. Returns the (reloaded) invoice row.
 */
export async function fileXeroInvoicePdf({ sb, row } = {}) {
  sb = sb || getServiceSupabase();
  if (!sb || !row?.xero_invoice_id) return row;

  const onlineUrl = await getOnlineInvoiceUrl(row); // also persists it
  let pdf = null;
  try { pdf = await fetchXeroInvoicePdf(row); } catch { pdf = null; }
  if (!pdf || !row.lead_id) return (await getInvoiceRow(sb, row.id)) || row;

  const num = String(row.xero_invoice_number || row.xero_invoice_id || "invoice").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
  const filename = `${new Date().toISOString().slice(0, 10)}-invoice-${num}.pdf`;
  const storagePath = `leads/${row.lead_id}/${filename}`;
  try {
    const { error: upErr } = await sb.storage.from("lead-documents").upload(storagePath, pdf, { contentType: "application/pdf", upsert: true });
    if (upErr) return (await getInvoiceRow(sb, row.id)) || row;
    // lead_documents row (best-effort; type 'invoice' needs mig 183). Dedup on storage_path so
    // re-filing (e.g. on send) doesn't create duplicate document rows.
    try {
      const { data: existingDoc } = await sb.from("lead_documents").select("id").eq("storage_path", storagePath).maybeSingle();
      if (!existingDoc) await sb.from("lead_documents").insert({ lead_id: row.lead_id, filename, storage_path: storagePath, mime_type: "application/pdf", document_type: "invoice", uploaded_by: row.created_by || null });
    } catch { /* pre-mig-183 or dup */ }
    // Copy into the Dropbox client folder if one exists (created at concept-agreement acceptance).
    try {
      const { data: lead } = await sb.from("leads").select("client_folder_path").eq("id", row.lead_id).maybeSingle();
      if (lead?.client_folder_path) await backfillLeadDocsToClientFolder({ sb, leadId: row.lead_id, clientFolderPath: lead.client_folder_path });
    } catch { /* Dropbox best-effort */ }
    await sb.from("xero_invoices").update({ pdf_storage_path: storagePath, online_invoice_url: onlineUrl || row.online_invoice_url, updated_at: new Date().toISOString() }).eq("id", row.id);
  } catch { /* filing best-effort */ }
  return (await getInvoiceRow(sb, row.id)) || row;
}

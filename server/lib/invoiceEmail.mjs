/**
 * invoiceEmail.mjs — the client-facing invoice email (Xero AR P2). Admin-editable template
 * (user_settings key crm_invoice_email), autofilled with the client, invoice number, inc-GST
 * amount, and the Xero pay link. Mirrors discoveryEmail's template pattern so the "Send to
 * client" flow loads a preview like the qualify/discovery emails.
 */
import { formatSignatureFooter, DEFAULT_EMAIL_SIGNATURE } from "./emailSignature.mjs";
import { incGst } from "./constants.mjs";

export const INVOICE_EMAIL_TEMPLATE_KEY = "crm_invoice_email";
export const INVOICE_EMAIL_PLACEHOLDERS = [
  "{{client_salutation}}", "{{invoice_number}}", "{{amount_inc}}", "{{pay_link}}", "{{user_signature}}",
];

export const INVOICE_EMAIL_DEFAULT = {
  subject: "Invoice {{invoice_number}} from Blue Leaf Building",
  body: [
    "Hello {{client_salutation}},",
    "",
    "Please find attached invoice {{invoice_number}} for {{amount_inc}} (inc GST).",
    "",
    "You can view and pay it securely online here:",
    "{{pay_link}}",
    "",
    "If you have any questions about this invoice, just reply to this email and we'll be happy to help.",
    "",
    "Thank you,",
    "{{user_signature}}",
  ].join("\n"),
};

function firstName(lead) {
  return String(lead?.name || lead?.first_name || "").trim().split(/\s+/)[0] || "there";
}
// Address the client as entered — compound couples ("Jenna & Adam" → "Jenna and Adam") kept intact.
function clientSalutation(lead) {
  const n = String(lead?.name || "").trim();
  if (n) return n.replace(/\s+&\s+/g, " and ").replace(/\s+/g, " ");
  return firstName(lead);
}
// Client-facing amount inc GST — trust Xero's total when present, else derive from the ex-GST amount.
function moneyInc(invoice) {
  const inc = invoice?.xero_total != null ? Number(invoice.xero_total) : incGst(Number(invoice?.amount_ex_gst || 0));
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(inc);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
function invoiceTextToHtml(text) {
  const linkify = (s) => s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#3a6ea8;">$1</a>');
  const paras = String(text)
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 12px;">${block.split("\n").map((line) => linkify(escapeHtml(line))).join("<br>")}</p>`)
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#17313d;font-size:15px;line-height:1.6;">${paras}</div>`;
}

export async function loadInvoiceEmailTemplate(sb) {
  const out = { ...INVOICE_EMAIL_DEFAULT };
  if (!sb) return out;
  try {
    const { data } = await sb.from("user_settings").select("value").eq("key", INVOICE_EMAIL_TEMPLATE_KEY).maybeSingle();
    if (data?.value) {
      const saved = JSON.parse(data.value);
      if (saved?.subject) out.subject = String(saved.subject);
      if (saved?.body) out.body = String(saved.body);
    }
  } catch { /* malformed → default */ }
  return out;
}

/**
 * Assemble the invoice email. lead = the lead row; invoice = the xero_invoices row;
 * payUrl = the Xero online pay link. Literal token substitution only (no client free-text).
 */
export function buildInvoiceEmail(lead, invoice, { template, signature = null, payUrl = null } = {}) {
  const tpl = template || INVOICE_EMAIL_DEFAULT;
  const sig = { ...DEFAULT_EMAIL_SIGNATURE, ...(signature || {}) };
  const number = invoice?.xero_invoice_number || invoice?.xero_invoice_id || "";
  const tokens = {
    "{{client_salutation}}": clientSalutation(lead),
    "{{invoice_number}}": number,
    "{{amount_inc}}": moneyInc(invoice),
    "{{pay_link}}": payUrl || "(a secure pay link will be included)",
    "{{user_signature}}": formatSignatureFooter(sig),
  };
  const sub = (s) => Object.entries(tokens).reduce((acc, [k, v]) => acc.split(k).join(v), String(s || ""));
  const subject = sub(tpl.subject).trim();
  const text = sub(tpl.body);
  return {
    to: String(lead?.email || "").trim(),
    subject,
    text,
    html: invoiceTextToHtml(text),
  };
}

import { sendPlainMail } from "./notifyMail.mjs";
import { appendRfqRefToBody, rfqRefHeaders } from "./rfqSendRef.mjs";
import { getServiceSupabase } from "./supabaseService.mjs";
import { wrapPlainTextEmailHtml } from "./signatureEmailHtml.mjs";
import { getBrandingEmailLogo } from "./brandingAssets.mjs";

function formatAuDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export async function sendReminderForRfqId(rfqId, opts = {}) {
  const sb = getServiceSupabase();
  if (!sb) {
    throw new Error("Server missing SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for reminders.");
  }

  const { data: row, error } = await sb
    .from("rfqs")
    .select(
      "id, deadline, trade, reminder_sent_at, status, subcontractors (email, contact, business_name), jobs (address)"
    )
    .eq("id", rfqId)
    .maybeSingle();

  if (error) throw error;
  if (!row) throw new Error("RFQ not found.");
  if (row.reminder_sent_at) {
    throw new Error("A reminder was already sent for this RFQ.");
  }
  if (!["sent"].includes(row.status)) {
    throw new Error("Reminders can only be sent while the RFQ is still awaiting a quote (status: sent).");
  }

  const footer = String(opts?.signatureFooter || "").trim();
  // Auto-fetch email logo from Supabase Storage if not provided by caller
  const logoFromCaller = String(opts?.signatureLogoDataUrl || "").trim();
  const logo = logoFromCaller || await getBrandingEmailLogo(sb).catch(() => "");

  const sub = Array.isArray(row.subcontractors) ? row.subcontractors[0] : row.subcontractors;
  const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs;
  const to = sub?.email?.trim();
  if (!to) throw new Error("Subcontractor has no email.");

  const name = sub?.contact?.trim() || sub?.business_name?.trim() || "there";
  const address = job?.address?.trim() || "the site";
  const deadlineFmt = formatAuDate(row.deadline);
  const sigName = process.env.SAM_NAME?.trim() || "Sam Morris";
  const subject = `Reminder — quote for ${address}`;
  const baseLines = [
    `Hi ${name},`,
    "",
    `Just a quick reminder that we're hoping to receive your price for ${address} by ${deadlineFmt}.`,
    "Let us know if you need anything from us.",
  ];
  // Only add a plain sign-off when there's no real signature footer — the footer already provides
  // the sign-off, so adding "Thanks, <sigName>" here would double the signature.
  if (!footer) baseLines.push("", "Thanks,", sigName);
  const baseText = baseLines.join("\n");

  const text = footer ? `${appendRfqRefToBody(baseText, rfqId)}\n\n${footer}` : appendRfqRefToBody(baseText, rfqId);
  const html =
    logo || footer ? wrapPlainTextEmailHtml(appendRfqRefToBody(baseText, rfqId), { footerText: footer, logoDataUrl: logo }) : undefined;

  await sendPlainMail({ to, subject, text, html, headers: rfqRefHeaders(rfqId) });

  const { error: upErr } = await sb
    .from("rfqs")
    .update({
      reminder_sent_at: new Date().toISOString(),
      status: "reminded"
    })
    .eq("id", rfqId);

  if (upErr) throw upErr;
  return { ok: true, rfqId };
}

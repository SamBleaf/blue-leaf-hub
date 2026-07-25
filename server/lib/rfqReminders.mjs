import { sendPlainMail } from "./notifyMail.mjs";
import { appendRfqRefToBody, rfqRefHeaders } from "./rfqSendRef.mjs";
import { getServiceSupabase } from "./supabaseService.mjs";

function dateInDays(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

/**
 * RFQs with status sent, no reminder yet, deadline exactly `daysBefore` days from today (local).
 */
export async function runDeadlineReminders({ daysBefore = 2 } = {}) {
  const sb = getServiceSupabase();
  if (!sb) {
    return { ok: false, skipped: true, reason: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for server-side reminders." };
  }

  const target = dateInDays(daysBefore);

  const { data: rows, error } = await sb
    .from("rfqs")
    .select(
      "id, deadline, trade, subcontractors (email, contact, business_name), jobs (address)"
    )
    .eq("status", "sent")
    .is("reminder_sent_at", null)
    .eq("deadline", target);

  if (error) {
    return { ok: false, error: error.message };
  }

  const sent = [];
  const failures = [];

  for (const row of rows || []) {
    const sub = Array.isArray(row.subcontractors) ? row.subcontractors[0] : row.subcontractors;
    const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs;
    const to = sub?.email?.trim();
    if (!to) {
      failures.push({ id: row.id, error: "Missing subcontractor email" });
      continue;
    }
    const name = sub?.contact?.trim() || sub?.business_name?.trim() || "there";
    const address = job?.address?.trim() || "the site";
    const deadlineFmt = formatAuDate(row.deadline);
    const sigName = process.env.SAM_NAME?.trim() || "Sam Morris";
    const subject = `Reminder, quote for ${address}`;
    const text = [
      `Hi ${name},`,
      "",
      `Just a quick reminder that we're hoping to receive your price for ${address} by ${deadlineFmt}.`,
      "Let us know if you need anything from us.",
      "",
      "Thanks,",
      sigName
    ].join("\n");

    try {
      const stampedText = appendRfqRefToBody(text, row.id);
      await sendPlainMail({ to, subject, text: stampedText, headers: rfqRefHeaders(row.id) });
      const { error: upErr } = await sb
        .from("rfqs")
        .update({
          reminder_sent_at: new Date().toISOString(),
          status: "reminded"
        })
        .eq("id", row.id);
      if (upErr) throw upErr;
      sent.push(row.id);
    } catch (e) {
      failures.push({ id: row.id, error: e?.message || String(e) });
    }
  }

  return { ok: true, targetDeadline: target, sent: sent.length, failures };
}

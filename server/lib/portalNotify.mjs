/**
 * Client Portal v2.0 — client notifications.
 *
 * Closes the audit's hard blocker: previously the portal never told the client
 * anything (portal_notifications was never written; all email went to admin@).
 *
 * notifyClient(projectId, {...}) does two things, best-effort, never throwing:
 *   1. Writes an in-app `portal_notifications` row per active client user
 *      (deduped to one-per-day via the dedup_day unique index → upsert
 *      ignoreDuplicates, i.e. ON CONFLICT DO NOTHING).
 *   2. Emails the client at projects.portal_client_email with a deep link back
 *      to the portal (reply-to admin@ so replies reach the office; the canonical
 *      channel is still the in-portal Messages thread).
 *
 * `from` is fixed by RESEND_FROM (admin@). A dedicated noreply sender (§0.13.5)
 * is a later polish — not required for the client to actually be notified.
 */
import { getServiceSupabase } from "./supabaseService.mjs";
import { sendPlainMail } from "./notifyMail.mjs";

const DEDUP_KEY = "target_user_id,notification_type,related_entity_id,channel,dedup_day";

function appBase() {
  return (process.env.APP_URL || "https://blueleafbuilding.com.au").replace(/\/$/, "");
}

/**
 * @param {string} projectId
 * @param {{type:string, title:string, body?:string, entityType?:string, entityId?:string}} n
 */
export async function notifyClient(projectId, { type, title, body, entityType, entityId }) {
  try {
    const sb = getServiceSupabase();
    if (!sb || !projectId) return;

    const { data: project } = await sb
      .from("projects")
      .select("id, portal_client_email, portal_client_name, address, portal_v2_enabled")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) return;
    // Single chokepoint: never notify on a non-v2 project. The email deep-links to
    // /client-portal (unusable for a non-v2 client), so a staffer acting on a
    // disabled-portal project must not email/notify them. Gates ALL callers at once.
    if (project.portal_v2_enabled !== true) return;

    const today = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();

    // 1. In-app notification per active client user (deduped one-per-day).
    const { data: users } = await sb
      .from("project_client_users")
      .select("user_id")
      .eq("project_id", projectId)
      .eq("is_active", true);

    for (const u of users || []) {
      await sb.from("portal_notifications").upsert(
        {
          project_id: projectId,
          target_user_id: u.user_id,
          notification_type: type,
          title,
          body: body || null,
          related_entity_type: entityType || null,
          related_entity_id: entityId || null,
          channel: "in_app",
          dedup_day: today,
          sent_at: nowIso,
        },
        { onConflict: DEDUP_KEY, ignoreDuplicates: true }
      );
    }

    // 2. Email the client.
    if (project.portal_client_email) {
      const link = `${appBase()}/client-portal`;
      const greeting = project.portal_client_name ? `Hi ${String(project.portal_client_name).split(" ")[0]},` : "Hi,";
      const text = `${greeting}\n\n${body || title}\n\nView it in your portal: ${link}\n\nBlue Leaf Building`;
      const html =
        `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1B2B4B;line-height:1.6;max-width:520px">` +
        `<p style="margin:0 0 10px">${greeting}</p>` +
        `<p style="margin:0 0 16px">${body || title}</p>` +
        `<p style="margin:0 0 20px"><a href="${link}" style="background:#006c9b;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">View it in your portal</a></p>` +
        `<p style="margin:0;color:#888;font-size:13px">${project.address || ""}<br>Blue Leaf Building</p>` +
        `</div>`;
      await sendPlainMail({
        to: project.portal_client_email,
        subject: title,
        text,
        html,
        replyTo: "admin@blueleafbuilding.com.au",
      });
    }
  } catch (e) {
    console.warn("[portalNotify] notifyClient:", e?.message || e);
  }
}

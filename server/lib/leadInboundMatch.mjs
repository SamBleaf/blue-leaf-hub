// leadInboundMatch.mjs — Sales OS Slice 1, workstream D2: match inbound email to a LEAD.
//
// Polls the same mailbox(es) as the invoice poller but with its OWN cursor (imap_lead_last_uid[_2]),
// so the two consumers never fight. For each new message it tries to attach the reply to a lead by,
// in order: (1) In-Reply-To / References → a prior lead-keyed correspondence.message_id; (2) the
// sender's email → the most-recent active lead with that address. On a match it inserts an INBOUND
// correspondence row (lead_id) so the reply shows in the lead mailbox + timeline, and suppresses the
// 7-day qualify follow-up.
//
// Mirrors the proven ImapFlow pattern in financeRoutes (drain the fetch stream first, parse after,
// per-message try/catch, advance the cursor in finally). Gated by LEAD_MAILBOX_ENABLED. Fail-soft:
// pre-migration-175 the correspondence.lead_id column is absent → matching is skipped cleanly.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getServiceSupabase } from "./supabaseService.mjs";
import { collectInboundMessageIds } from "./imapQuoteMatch.mjs";
import { dropboxConfigured, getDropboxAccessToken, createFolderIfNotExists, dropboxUploadBuffer } from "./dropboxClient.mjs";

const norm = (id) => String(id || "").replace(/^<|>$/g, "").trim().toLowerCase();
const normEmail = (v) => String(v || "").trim().toLowerCase();
const ACTIVE_STAGES = ["enquiry", "qualify", "discovery", "winning_offer", "fee_proposal", "consultants", "nurture"];

function leadImapConfigs() {
  const host = process.env.IMAP_HOST?.trim();
  if (!host) return [];
  const port = Number(process.env.IMAP_PORT) || 993;
  const secure = process.env.IMAP_SECURE !== "false";
  const base = { host, port, secure, logger: false };
  return [
    { ...base, auth: { user: process.env.IMAP_USER?.trim(), pass: process.env.IMAP_PASS?.trim() }, cursorKey: "imap_lead_last_uid" },
    { ...base, auth: { user: process.env.IMAP2_USER?.trim(), pass: process.env.IMAP2_PASS?.trim() }, cursorKey: "imap_lead_last_uid_2" },
  ].filter((c) => c.auth.user && c.auth.pass);
}

async function loadUid(sb, key) {
  const { data } = await sb.from("user_settings").select("value").eq("key", key).maybeSingle();
  const n = Number(data?.value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}
async function saveUid(sb, key, uid) {
  const v = Math.floor(Number(uid));
  if (!Number.isFinite(v) || v < 0) return;
  await sb.from("user_settings").upsert({ key, value: String(v), updated_at: new Date().toISOString() }, { onConflict: "key" });
}

// Find the lead a reply belongs to. Returns lead id or null.
async function matchLead(sb, parsed) {
  // (1) In-Reply-To / References → our stored outbound correspondence.message_id (lead-keyed).
  const ids = collectInboundMessageIds(parsed).map(norm).filter(Boolean);
  for (const id of ids) {
    // message_id may be stored with or without angle brackets — try both.
    const { data } = await sb.from("correspondence")
      .select("lead_id, message_id").not("lead_id", "is", null)
      .or(`message_id.eq.<${id}>,message_id.eq.${id}`).limit(1);
    if (data && data.length && data[0].lead_id) return data[0].lead_id;
  }
  // (2) sender email → most-recent active lead with that address.
  const from = normEmail(parsed?.from?.value?.[0]?.address || parsed?.from?.text);
  if (from) {
    const { data } = await sb.from("leads")
      .select("id, stage, created_at").ilike("email", from)
      .in("stage", ACTIVE_STAGES).order("created_at", { ascending: false }).limit(1);
    if (data && data.length) return data[0].id;
  }
  return null;
}

const sanitiseAttName = (name) =>
  String(name || "attachment").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "attachment";

// Match an inbound email to a CONSULTANT on a lead's roster (CV-3 inbound capture). In-Reply-To to a
// Hub-sent consultant email is authoritative; else the sender's CRM contact → the lead whose roster
// lists them. Returns { leadId, role, contactId, contactName } or null. Fail-soft pre-migration-198.
async function matchConsultant(sb, parsed) {
  try {
    const ids = collectInboundMessageIds(parsed).map(norm).filter(Boolean);
    for (const rid of ids) {
      const { data } = await sb.from("consultant_messages")
        .select("lead_id, consultant_role, consultant_contact_id")
        .or(`message_id.eq.<${rid}>,message_id.eq.${rid}`).limit(1);
      if (data && data.length) {
        return { leadId: data[0].lead_id, role: data[0].consultant_role, contactId: data[0].consultant_contact_id, contactName: null };
      }
    }
  } catch { return null; } // consultant_messages absent pre-mig-198
  const from = normEmail(parsed?.from?.value?.[0]?.address || parsed?.from?.text);
  if (!from) return null;
  const { data: contact } = await sb.from("crm_contacts").select("id, first_name, last_name, company").ilike("email", from).maybeSingle();
  if (!contact) return null;
  try {
    const { data: leads } = await sb.from("leads")
      .select("id, consultant_roster")
      .contains("consultant_roster", [{ contactId: contact.id }])
      .not("stage", "in", "(lost,won)")
      .order("created_at", { ascending: false }).limit(1);
    if (leads && leads.length) {
      const roster = Array.isArray(leads[0].consultant_roster) ? leads[0].consultant_roster : [];
      const hit = roster.find((r) => String(r.contactId) === String(contact.id));
      return { leadId: leads[0].id, role: hit?.role || "other", contactId: contact.id,
        contactName: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.company || null };
    }
  } catch { /* .contains unsupported / roster absent — In-Reply-To path only */ }
  return null;
}

// Save a consultant email's attachments (plans, engineering, etc.) to the lead's SALES client folder
// under CORRESPONDENCE/<Consultant>/ — a folder per consultant. Best-effort. Won carries these across.
async function saveConsultantAttachments(sb, c, parsed) {
  const atts = (parsed.attachments || []).filter((a) => a?.content && a?.filename);
  if (!atts.length || !dropboxConfigured()) return 0;
  const { data: lead } = await sb.from("leads").select("client_folder_path").eq("id", c.leadId).maybeSingle();
  if (!lead?.client_folder_path) return 0;
  const token = await getDropboxAccessToken();
  const who = String(c.contactName || c.role || "consultant").replace(/[^\w .-]+/g, "").trim() || "consultant";
  const folder = `${lead.client_folder_path}/CORRESPONDENCE/${who}`;
  await createFolderIfNotExists(token, folder);
  const date = new Date().toISOString().slice(0, 10);
  let saved = 0;
  for (const a of atts) {
    try { await dropboxUploadBuffer(token, `${folder}/${date}-${sanitiseAttName(a.filename)}`, a.content, { autorename: true }); saved += 1; }
    catch (e) { console.warn("[lead-imap] consultant attachment save failed:", e?.message || e); }
  }
  return saved;
}

// Handle an inbound email that matched no client lead: is it from a consultant? Log it to the thread
// (CV-3) + file its attachments. Returns true if handled (so the poller counts it as matched).
async function handleConsultantInbound(sb, parsed, messageId) {
  const c = await matchConsultant(sb, parsed);
  if (!c) return false;
  // dedup against consultant_messages (this email is not stored in correspondence).
  try {
    const { data: dup } = await sb.from("consultant_messages").select("id")
      .or(`message_id.eq.<${messageId}>,message_id.eq.${messageId}`).limit(1);
    if (dup && dup.length) return true; // already captured — count as handled, not a fresh insert
  } catch { /* pre-mig-198 — can't dedup, proceed (insert will also fail-soft) */ }
  const inReplyTo = collectInboundMessageIds(parsed).map(norm)[0] || null;
  const body = (parsed.text || parsed.html || "").toString().slice(0, 20000);
  try {
    await sb.from("consultant_messages").insert({
      lead_id: c.leadId, consultant_role: c.role || "other", consultant_contact_id: c.contactId || null,
      participant: "consultant", channel: "email", direction: "inbound",
      subject: parsed.subject || null, body,
      author_name: c.contactName || parsed.from?.text || null,
      client_visible: false, message_id: `<${messageId}>`, in_reply_to: inReplyTo ? `<${inReplyTo}>` : null,
    });
  } catch (e) { console.warn("[lead-imap] consultant_messages insert failed (mig 198?):", e?.message || e); return false; }
  try { await saveConsultantAttachments(sb, c, parsed); } catch (e) { console.warn("[lead-imap] consultant attachments:", e?.message || e); }
  try { await sb.from("leads").update({ last_activity_at: new Date().toISOString() }).eq("id", c.leadId); } catch { /* best-effort */ }
  return true;
}

async function pollOne(cfg, sb) {
  const client = new ImapFlow(cfg);
  let matched = 0, skipped = 0, lastUid = null, highestUid = null;
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    lastUid = await loadUid(sb, cfg.cursorKey);
    if (lastUid == null) {
      const uidNext = Number(client.mailbox?.uidNext || 0);
      await saveUid(sb, cfg.cursorKey, uidNext > 0 ? uidNext - 1 : Number(client.mailbox?.exists || 0));
      await client.logout();
      return { account: cfg.auth.user, ok: true, initialized: true };
    }

    const rawMsgs = [];
    for await (const msg of client.fetch(`${lastUid + 1}:*`, { uid: true, source: true }, { uid: true })) {
      rawMsgs.push({ uid: msg.uid, source: msg.source });
      if (rawMsgs.length >= 50) break;
    }
    const msgs = [];
    for (const r of rawMsgs) {
      try { msgs.push({ uid: r.uid, parsed: await simpleParser(r.source) }); }
      catch (e) { console.error("[lead-imap] parse failed uid", r.uid, e?.message); msgs.push({ uid: r.uid, parsed: null }); }
    }

    highestUid = lastUid;
    for (const msg of msgs) {
      highestUid = Math.max(highestUid, Number(msg.uid) || 0);
      if (!msg.parsed) { skipped++; continue; }
      try {
        const parsed = msg.parsed;
        const messageId = norm(parsed.messageId) || `imap-lead-uid-${msg.uid}`;
        // dedup — never insert the same inbound message twice.
        const { data: existing } = await sb.from("correspondence")
          .select("id").or(`message_id.eq.<${messageId}>,message_id.eq.${messageId}`).limit(1);
        if (existing && existing.length) { skipped++; continue; }

        const leadId = await matchLead(sb, parsed);
        if (!leadId) {
          // Not a client reply — is it a consultant emailing in (CV-3)? Capture it + file attachments.
          const handled = await handleConsultantInbound(sb, parsed, messageId);
          if (handled) matched++; else skipped++;
          continue;
        }

        const inReplyTo = collectInboundMessageIds(parsed).map(norm)[0] || null;
        const body = (parsed.text || parsed.html || "").toString().slice(0, 20000);
        await sb.from("correspondence").insert({
          lead_id: leadId,
          direction: "inbound",
          subject: parsed.subject || "(no subject)",
          body,
          email_from: parsed.from?.text || null,
          email_to: parsed.to?.text || null,
          message_id: `<${messageId}>`,
          in_reply_to: inReplyTo ? `<${inReplyTo}>` : null,
          sent_at: (parsed.date || new Date()).toISOString(),
        });
        // Bump lead freshness so it surfaces as active.
        try { await sb.from("leads").update({ last_activity_at: new Date().toISOString() }).eq("id", leadId); } catch { /* best-effort */ }
        matched++;
      } catch (e) {
        console.warn("[lead-imap] insert failed uid", msg.uid, e?.message);
        skipped++;
      }
    }
    return { account: cfg.auth.user, ok: true, matched, skipped };
  } catch (e) {
    console.error("[lead-imap] poll error:", e?.message || e);
    return { account: cfg.auth.user, ok: false, error: e?.message || String(e) };
  } finally {
    // Advance the cursor even if the batch threw mid-way, so we never re-scan the same messages.
    try { if (highestUid != null && highestUid !== lastUid) await saveUid(sb, cfg.cursorKey, highestUid); } catch { /* ignore */ }
    try { await client.logout(); } catch { /* ignore */ }
  }
}

let busy = false;
export async function pollLeadReplies(sbArg) {
  if (busy) return { ok: true, skipped: "already-running" };
  const sb = sbArg || getServiceSupabase();
  if (!sb) return { ok: false, error: "No DB client" };
  const configs = leadImapConfigs();
  if (!configs.length) return { ok: true, note: "IMAP not configured" };
  busy = true;
  try {
    const results = [];
    for (const cfg of configs) results.push(await pollOne(cfg, sb));
    return { ok: true, results };
  } finally {
    busy = false;
  }
}

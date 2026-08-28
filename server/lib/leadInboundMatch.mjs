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
        if (!leadId) { skipped++; continue; }

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

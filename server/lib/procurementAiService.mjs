// Procurement Intelligence (BQ-10) — AI draft service (plan §L).
//
// HARD RULE: this module DRAFTS ONLY. It never sends an email, never places an
// order, never commits anything. Every function returns text/JSON for a human to
// review and send themselves. No notifyMail / no PO creation here.
//
// Degrades gracefully: if ANTHROPIC_API_KEY is absent, each function returns a
// deterministic fallback draft rather than throwing.

import Anthropic from "@anthropic-ai/sdk";
import { config as dotenvConfig } from "dotenv";
import { callAI } from "./aiGateway.mjs";

const { parsed: _env = {} } = dotenvConfig();
const apiKey = () => process.env.ANTHROPIC_API_KEY?.trim() || _env.ANTHROPIC_API_KEY?.trim();
export const aiConfigured = () => !!apiKey();

const SONNET = process.env.CLAUDE_MODEL?.trim() || "claude-sonnet-4-6";
const HAIKU = "claude-haiku-4-5";
const SENDER = "Blue Leaf Building";

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "TBC");

async function claudeText(prompt, { model = HAIKU, maxTokens = 600, system } = {}) {
  const key = apiKey();
  if (!key) return "";
  try {
    const client = new Anthropic({ apiKey: key, maxRetries: 1 });
    const resp = await callAI(client, {
      model, max_tokens: maxTokens,
      ...(system ? { system: [{ type: "text", text: system }] } : {}),
      messages: [{ role: "user", content: prompt }],
    }, { module: "procurementAi" });
    return resp.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  } catch (e) {
    console.warn("[procurement-ai] claudeText:", e?.message || e);
    return "";
  }
}

// split "Subject: ...\n\n<body>" into {subject, body}
function splitSubjectBody(text, fallbackSubject) {
  const m = String(text || "").match(/^\s*subject\s*:\s*(.+?)\n+([\s\S]+)$/i);
  if (m) return { subject: m[1].trim(), body: m[2].trim() };
  return { subject: fallbackSubject, body: String(text || "").trim() };
}

// ── Draft a supplier RFQ or order email (NEVER sent) ──────────────────────────
export async function draftSupplierEmail(sb, { supplierId, itemIds = [], kind = "rfq" } = {}) {
  const { data: supplier } = await sb.from("suppliers").select("*").eq("id", supplierId).maybeSingle();
  const { data: items } = await sb.from("procurement_items").select("*").in("id", itemIds);
  const list = items || [];
  let address = null, jobId = list[0]?.job_id;
  if (jobId) {
    const { data: project } = await sb.from("projects").select("address").eq("job_id", jobId).limit(1).maybeSingle();
    address = project?.address || null;
  }
  const lines = list.map((it) => `- ${it.item_name}${it.quantity ? ` ×${it.quantity}${it.uom ? " " + it.uom : ""}` : ""} — needed on site ${fmtDate(it.required_on_site_date)} (order by ${fmtDate(it.order_by_date)})${it.notes ? ` [${it.notes}]` : ""}`).join("\n");
  const verb = kind === "order" ? "place an order" : "request a quote";
  const fallbackSubject = `${kind === "order" ? "Purchase order" : "Quote request"} — ${address || "Blue Leaf Building project"}`;

  const text = await claudeText(
    `Draft a concise, professional email from ${SENDER} (a premium Adelaide residential builder) to ${supplier?.name || "the supplier"}${supplier?.contact_name ? ` (attn ${supplier.contact_name})` : ""} to ${verb} for these items${address ? ` for our project at ${address}` : ""}:\n\n${lines || "(items)"}\n\nRules: Australian builder tone, warm but businesslike. ${kind === "order" ? "Confirm we wish to proceed and ask them to confirm price, lead time and delivery date." : "Ask for unit pricing, lead time and earliest delivery."} Do NOT invent prices or quantities you weren't given. Keep it short. Start with a line "Subject: ..." then the body.`,
    { model: SONNET, maxTokens: 700 }
  );

  if (!text) {
    // deterministic fallback
    return { draft: true, sent: false, kind, to: supplier?.email || null, subject: fallbackSubject,
      body: `Hi ${supplier?.contact_name || supplier?.name || "there"},\n\nWe'd like to ${verb} for the following${address ? ` for our project at ${address}` : ""}:\n\n${lines}\n\nCould you please confirm ${kind === "order" ? "price, lead time and delivery date" : "unit pricing, lead time and earliest delivery"}?\n\nThanks,\n${SENDER}` };
  }
  const { subject, body } = splitSubjectBody(text, fallbackSubject);
  return { draft: true, sent: false, kind, to: supplier?.email || null, subject, body };
}

// ── Summarise a supplier reply (paste-in) ─────────────────────────────────────
export async function summariseSupplierReply(replyText) {
  const text = await claudeText(
    `A supplier replied to a builder's quote/order email. Summarise in 2-3 short lines and extract any quoted price (AUD, ex-GST if stated), lead time in days, and whether the builder needs to act. Reply text:\n\n"""${String(replyText || "").slice(0, 4000)}"""\n\nReturn ONLY JSON: {"summary":"...","priceExGst":number|null,"leadDays":number|null,"actionNeeded":"...|null"}`,
    { model: HAIKU, maxTokens: 300 }
  );
  try {
    const j = JSON.parse(String(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim());
    return { ...j, draft: true };
  } catch {
    return { summary: text || "Could not summarise — review the reply manually.", priceExGst: null, leadDays: null, actionNeeded: null, draft: true };
  }
}

// ── Draft a client-safe selection reminder (NEVER sent) ───────────────────────
export async function draftSelectionReminder(sb, itemId) {
  const { data: item } = await sb.from("procurement_items").select("*").eq("id", itemId).maybeSingle();
  if (!item) return null;
  let decisionTitle = null;
  if (item.selection_decision_id) {
    const { data: d } = await sb.from("portal_decisions").select("title").eq("id", item.selection_decision_id).maybeSingle();
    decisionTitle = d?.title || null;
  }
  const fallbackSubject = `Quick decision needed — ${item.item_name}`;
  const text = await claudeText(
    `Draft a short, friendly, client-safe reminder from ${SENDER} asking the client to confirm their selection for "${decisionTitle || item.item_name}". It's needed by ${fmtDate(item.order_by_date)} to keep their build on schedule. No prices, no pressure, warm premium-builder tone. Start with "Subject: ..." then the body.`,
    { model: HAIKU, maxTokens: 350 }
  );
  if (!text) {
    return { draft: true, sent: false, subject: fallbackSubject,
      body: `Hi,\n\nJust a friendly reminder that we need your selection for ${decisionTitle || item.item_name} by ${fmtDate(item.order_by_date)} so we can order in time and keep your build on track.\n\nNo rush beyond that date — just let us know when you've decided.\n\nThanks,\n${SENDER}` };
  }
  const { subject, body } = splitSubjectBody(text, fallbackSubject);
  return { draft: true, sent: false, subject, body };
}

// ── Weekly "what to order" digest — deterministic data + short AI narrative ────
export async function weeklyProcurementDigest(sb) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: items } = await sb
    .from("procurement_items").select("item_name, job_id, order_by_date, status, risk_status, selection_required, selection_status, lead_time_days")
    .eq("required", true).not("status", "in", "(closed,cancelled,delivered)");
  const list = items || [];
  const overdue = list.filter((i) => i.order_by_date && i.order_by_date < today);
  const dueSoon = list.filter((i) => i.order_by_date && i.order_by_date >= today && (new Date(i.order_by_date) - new Date(today)) / 86400000 <= 14);
  const blocked = list.filter((i) => i.selection_required && i.selection_status !== "confirmed");
  const counts = { overdue: overdue.length, dueSoon: dueSoon.length, selectionBlocked: blocked.length, totalActive: list.length };

  const narrative = await claudeText(
    `Write a 3-4 sentence weekly procurement summary for a builder. Numbers: ${counts.overdue} order-by overdue, ${counts.dueSoon} due within 14 days, ${counts.selectionBlocked} blocked on client selections, ${counts.totalActive} active items. Plain, action-oriented, no fluff. If overdue>0 stress it first.`,
    { model: HAIKU, maxTokens: 200 }
  );
  return {
    generatedFor: today, counts,
    narrative: narrative || `${counts.overdue} overdue, ${counts.dueSoon} due within 14 days, ${counts.selectionBlocked} blocked on selections.`,
    draft: true,
  };
}

// ── Explain the schedule impact of a delivery slip (client-safe note) ─────────
export async function explainScheduleImpact(sb, itemId, slipDays = 0) {
  const { data: item } = await sb.from("procurement_items").select("*").eq("id", itemId).maybeSingle();
  if (!item) return null;
  const text = await claudeText(
    `A procurement item "${item.item_name}" is delivering about ${slipDays} day(s) late (was needed on site ${fmtDate(item.required_on_site_date)}). In 2-3 plain sentences explain the likely schedule impact to the builder, and provide a short, calm, client-safe note they could share. Return JSON: {"internal":"...","clientNote":"..."}`,
    { model: HAIKU, maxTokens: 300 }
  );
  try {
    const j = JSON.parse(String(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim());
    return { ...j, draft: true };
  } catch {
    return { internal: text || `Delivery ~${slipDays}d late; review downstream tasks.`, clientNote: "", draft: true };
  }
}

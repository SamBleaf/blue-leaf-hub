#!/usr/bin/env node
/**
 * scripts/backfill-tender-submissions.mjs — Tender build step 3.
 * Backfills Model A `rfqs` quotes → `rfq_quote_submissions` (+ attachments), sets award pointers,
 * and recovers extra quote PDFs found in correspondence (e.g. the 2 Forrest Ave cabinetry quote).
 * Idempotent; DRY-RUN by default (reports the plan + the 6-point verification checklist, writes
 * nothing). `--apply` performs the writes. Spec: docs/plans/TENDER_SCHEMA_AND_MIGRATION.md §5.
 *
 *   node scripts/backfill-tender-submissions.mjs           # DRY RUN — plan + checks, no writes
 *   node scripts/backfill-tender-submissions.mjs --apply   # writes submissions/attachments/award
 */
import dotenv from "dotenv"; dotenv.config();
import crypto from "node:crypto";
import { getServiceSupabase } from "../server/lib/supabaseService.mjs";
import { dropboxConfigured, getDropboxAccessToken, dropboxDownloadBuffer } from "../server/lib/dropboxClient.mjs";

const APPLY = process.argv.includes("--apply");
const sb = getServiceSupabase();
if (!sb) { console.error("✗ no service client"); process.exit(1); }

const hasQuote = (r) => r.quoted_amount != null || r.quote_amount != null || !!(r.quote_pdf_url || r.dropbox_pdf_url);
const pdfsOf = (corr) => {
  const out = [];
  for (const c of corr || []) {
    if (c.direction !== "inbound") continue;
    const atts = Array.isArray(c.attachments) ? c.attachments : (c.attachments ? [c.attachments] : []);
    for (const a of atts) {
      const name = a.filename || a.name || "";
      const dropbox_path = a.dropbox_path || a.path || "";
      const url = a.url || a.dropbox_pdf_url || "";
      const path = dropbox_path || url;
      if (/\.pdf$/i.test(name) || /\.pdf/i.test(path)) out.push({ name, path, dropbox_path, url, sent_at: c.sent_at, correspondence_id: c.id, message_id: c.message_id });
    }
  }
  // de-dup by filename, keep earliest
  const byName = new Map();
  for (const p of out.sort((a, b) => String(a.sent_at || "").localeCompare(String(b.sent_at || "")))) {
    if (!byName.has(p.name)) byName.set(p.name, p);
  }
  return [...byName.values()];
};

const { data: rfqs } = await sb.from("rfqs")
  .select("id, job_id, trade, subcontractor_id, status, quoted_amount, quote_amount, quote_pdf_url, dropbox_pdf_url, quote_extraction, quote_extracted_at, received_at, sent_message_id, manually_entered");
const withQuote = (rfqs || []).filter(hasQuote);

// correspondence per rfq (inbound, with attachments)
const rfqIds = withQuote.map((r) => r.id);
const { data: corr } = rfqIds.length
  ? await sb.from("correspondence").select("id, rfq_id, direction, subject, attachments, sent_at, message_id").in("rfq_id", rfqIds)
  : { data: [] };
const corrByRfq = new Map();
for (const c of corr || []) { if (!corrByRfq.has(c.rfq_id)) corrByRfq.set(c.rfq_id, []); corrByRfq.get(c.rfq_id).push(c); }

// Plan
let planned = [];        // {rfq, versions:[{version, confirmed, extracted, verified, status, pdf, isPrimary, recovered}]}
let attachmentCount = 0, awardCount = 0, recoveryCount = 0, corrLinked = 0;
const multiPdf = [];

for (const r of withQuote) {
  const pdfs = pdfsOf(corrByRfq.get(r.id));
  const accepted = r.status === "accepted";
  // which PDF is "the" current quote (matches the rfq's stored pdf)? Match on filename stem,
  // case-insensitively (the stored value is a URL like …/QU-22138.PDF?rlkey=…, the correspondence
  // carries "QU-22138.pdf") — a naive substring/case match misassigns the amount.
  const storedPdf = String(r.quote_pdf_url || r.dropbox_pdf_url || "");
  const storedName = decodeURIComponent(storedPdf).toLowerCase().split(/[?#]/)[0].split("/").pop() || "";
  const foundIdx = pdfs.findIndex((p) => {
    const pn = (p.name || "").toLowerCase();
    return storedName && pn && (pn === storedName || storedName.includes(pn.replace(/\.pdf$/, "")) || pn.includes(storedName.replace(/\.pdf$/, "")));
  });
  const primaryIdx = foundIdx >= 0 ? foundIdx : 0;
  const versions = [];
  if (pdfs.length <= 1) {
    versions.push({ version: 1, confirmed: r.quote_amount, extracted: r.quoted_amount, verified: r.quote_amount != null, status: accepted ? "accepted" : "received", pdf: pdfs[0] || (storedPdf ? { name: storedPdf.split("/").pop(), path: storedPdf } : null), isPrimary: true, recovered: false });
  } else {
    // multi-PDF rfq → one submission per distinct PDF (earliest = v1). The stored/current PDF carries
    // the confirmed amount; the others are recovered (extracted-only).
    pdfs.forEach((p, i) => {
      const isCurrent = i === primaryIdx;
      versions.push({ version: i + 1, confirmed: isCurrent ? r.quote_amount : null, extracted: isCurrent ? r.quoted_amount : null, verified: isCurrent && r.quote_amount != null, status: isCurrent && accepted ? "accepted" : "received", pdf: p, isPrimary: isCurrent, recovered: !isCurrent });
      if (!isCurrent) recoveryCount++;
    });
    multiPdf.push({ rfq: r, pdfs });
  }
  for (const v of versions) { if (v.pdf) attachmentCount++; }
  if (accepted) awardCount++;
  if (corrByRfq.get(r.id)?.length) corrLinked++;
  planned.push({ rfq: r, versions });
}
const submissionCount = planned.reduce((n, p) => n + p.versions.length, 0);

console.log(`\n═══ Tender submission backfill — ${APPLY ? "APPLY" : "DRY RUN"} ═══\n`);
console.log(`rfqs total: ${(rfqs || []).length}`);
console.log(`rfqs with a quote ($ or PDF): ${withQuote.length}`);
console.log(`→ submissions planned: ${submissionCount}  (incl. ${recoveryCount} recovered from correspondence)`);
console.log(`→ attachments planned: ${attachmentCount}`);
console.log(`→ award pointers (accepted rfqs): ${awardCount}\n`);

console.log("Per-rfq plan:");
for (const p of planned) {
  const r = p.rfq;
  console.log(`  • [${r.trade}] ${r.id.slice(0, 8)} — ${r.status}${r.status === "accepted" ? " ★award" : ""}`);
  for (const v of p.versions) {
    console.log(`      v${v.version} ${v.status}/${v.verified ? "verified" : "unverified"}  conf=$${v.confirmed ?? "-"} ext=$${v.extracted ?? "-"}  pdf=${v.pdf?.name || "-"}${v.recovered ? "  ⟵ RECOVERED" : ""}`);
  }
}

console.log("\n── Verification checklist (§5) ──");
const ck = (c, m) => console.log(`  ${c ? "✓" : "✗"} ${m}`);
// 1 per-record: one v1 per rfq, no dup v1
ck(planned.every((p) => p.versions.filter((v) => v.version === 1).length === 1), `every rfq-with-quote has exactly one v1 (no duplicate v1)`);
// 2 award: every accepted rfq maps to a same-rfq accepted submission
const acc = withQuote.filter((r) => r.status === "accepted");
ck(acc.every((r) => planned.find((p) => p.rfq.id === r.id)?.versions.some((v) => v.status === "accepted")), `every accepted rfq (${acc.length}) has an accepted submission`);
// 3 amounts reconcile
const accTotal = acc.reduce((s, r) => s + Number(r.quote_amount ?? r.quoted_amount ?? 0), 0);
console.log(`  · accepted total (reconcile target): $${Math.round(accTotal * 100) / 100}`);
// 4 PDFs: every stored quote_pdf_url has a planned attachment
const pdfRfqs = withQuote.filter((r) => r.quote_pdf_url || r.dropbox_pdf_url);
ck(pdfRfqs.every((r) => planned.find((p) => p.rfq.id === r.id)?.versions.some((v) => v.pdf)), `every rfq with a stored PDF (${pdfRfqs.length}) has a planned attachment`);
// 5 duplicate source-messages flagged
ck(true, `multi-PDF rfqs flagged for split-review: ${multiPdf.length}${multiPdf.length ? " → " + multiPdf.map((m) => m.rfq.trade).join(", ") : ""}`);
// 6 counts
console.log(`  · submissions == rfqs-with-quote + recovered:  ${submissionCount} == ${withQuote.length} + ${recoveryCount}  ${submissionCount === withQuote.length + recoveryCount ? "✓" : "✗"}`);

if (multiPdf.length) {
  console.log("\nRecovery detail (the extra PDFs that were lost under one-quote-per-rfq):");
  for (const m of multiPdf) for (const p of m.pdfs) console.log(`  [${m.rfq.trade}] ${p.name}  (${String(p.sent_at).slice(0, 10)})`);
}

if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply after review.\n"); process.exit(0); }

// ── APPLY (idempotent) ───────────────────────────────────────────────────────
console.log("\n── APPLYING ──");
let dbToken = null;
if (dropboxConfigured()) { try { dbToken = await getDropboxAccessToken(); } catch { /* checksums best-effort */ } }
const sha256OfDropbox = async (p) => {
  if (!dbToken || !p?.dropbox_path) return null;
  try { return crypto.createHash("sha256").update(await dropboxDownloadBuffer(dbToken, p.dropbox_path)).digest("hex"); }
  catch { return null; }
};
const nowIso = new Date().toISOString();
let subIns = 0, attIns = 0, awards = 0, skipped = 0;
for (const p of planned) {
  const r = p.rfq;
  // idempotency: if this rfq already has any submission, skip it entirely.
  const { count: existing } = await sb.from("rfq_quote_submissions").select("id", { count: "exact", head: true }).eq("rfq_id", r.id);
  if (existing && existing > 0) { skipped++; continue; }
  for (const v of p.versions) {
    const { data: sub, error: se } = await sb.from("rfq_quote_submissions").insert({
      rfq_id: r.id, version: v.version,
      status: v.status, verification_status: v.verified ? "verified" : "unverified",
      verified_at: v.verified ? nowIso : null,
      extracted_amount_ex_gst: v.extracted ?? null,
      confirmed_amount_ex_gst: v.confirmed ?? null,
      confirmed_at: v.confirmed != null ? (r.quote_extracted_at || r.received_at || nowIso) : null,
      tax_basis: "ex_gst",
      extraction: r.quote_extraction ?? null,
      correspondence_id: v.pdf?.correspondence_id ?? null,
      source_message_id: v.pdf?.message_id ?? r.sent_message_id ?? null,
      received_at: r.received_at || v.pdf?.sent_at || null,
    }).select("id").single();
    if (se) { console.error(`  ✗ submission ${r.id.slice(0,8)} v${v.version}: ${se.message}`); continue; }
    subIns++;
    if (v.pdf) {
      const checksum = await sha256OfDropbox(v.pdf);
      const { error: ae } = await sb.from("rfq_quote_attachments").insert({
        submission_id: sub.id, filename: v.pdf.name || null,
        storage_path: v.pdf.dropbox_path || null, pdf_url: v.pdf.url || null,
        is_primary: !!v.isPrimary, role: "quote", extraction_status: "na", checksum,
      });
      if (ae) console.error(`  ✗ attachment: ${ae.message}`); else attIns++;
    }
    if (v.status === "accepted") {
      const { error: we } = await sb.from("rfqs").update({ accepted_submission_id: sub.id, accepted_at: nowIso }).eq("id", r.id);
      if (we) console.error(`  ✗ award: ${we.message}`); else awards++;
    }
  }
}
console.log(`\n✓ submissions: ${subIns}  · attachments: ${attIns}  · awards: ${awards}  · rfqs skipped (already backfilled): ${skipped}\n`);


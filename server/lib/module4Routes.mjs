import Anthropic from "@anthropic-ai/sdk";
import { callAI } from "./aiGateway.mjs";
import { buildPurchaseOrderPdfBuffer, defaultStandardConditions } from "./poPdfKit.mjs";
import { DEFAULT_PO_TERMS } from "./poDefaultTerms.mjs";
import {
  buildexactConfigured,
  buildexactLogin,
  clearBuildexactSessionOverride,
  createPurchaseOrder,
  getBuildexactTokenStatus,
  getJobs
} from "./buildexactClient.mjs";
import {
  copyDropboxFile,
  dropboxConfigured,
  ensureInternalQuoteSubfolders,
  getDropboxAccessToken,
  sharedJobRootPath,
  uploadPoPdfToJobFolder
} from "./dropboxClient.mjs";
import { getServiceSupabase } from "./supabaseService.mjs";
import { mailTransportName, sendPlainMail } from "./notifyMail.mjs";
import { wrapPlainTextEmailHtml } from "./signatureEmailHtml.mjs";
import { generateOutboundMessageId } from "./imapQuoteMatch.mjs";
import { syncAcceptedQuoteToBuildexact } from "./buildexactDeepIntegration.mjs";
import { getBrandingEmailLogo } from "./brandingAssets.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import { quarterLabel, emailPoIssued } from "./tradeCommitment.mjs";
import { setFact } from "./factsService.mjs";
import { resolveTradeCategoryId } from "./buildexactParser.mjs";
import { computeAcceptAlignment } from "./rfqAcceptAlignment.mjs";
import { computeWinQuoteReadiness } from "./rfqWinQuoteReadiness.mjs";
import {
  resolvePurchaseOrderProjectId,
  findPurchaseOrderByRfqId,
} from "./poProjectResolve.mjs";
import { resolveRfqQuotePdfForPo } from "./poQuoteAttachment.mjs";

const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";

const GST_RATE = 0.10; // Never hardcode 0.1 inline — use this constant
const gstAmount = (exGstAmt) => Math.round(Number(exGstAmt) * GST_RATE * 100) / 100;

function safeFilePart(s, max = 48) {
  return (
    String(s || "X")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, max) || "X"
  );
}

async function insertCorrespondence(sb, row) {
  const { error } = await sb.from("correspondence").insert({
    job_id: row.job_id,
    rfq_id: row.rfq_id || null,
    subcontractor_id: row.subcontractor_id || null,
    direction: row.direction || "outbound",
    subject: row.subject,
    body: row.body,
    sent_at: row.sent_at || new Date().toISOString(),
    logged_by: row.logged_by || "sam",
    message_id: row.message_id || null
  });
  if (error) throw new Error(error.message);
}

/**
 * @param {import('express').Express} app
 */
export function registerModule4Routes(app) {
  app.get("/api/buildexact/status", requireAuth, (_req, res) => {
    // Prefer an explicit API_BASE_URL (set this in Railway env vars to the Railway public URL).
    // Falls back to RAILWAY_PUBLIC_DOMAIN if injected, then localhost for local dev.
    // VERCEL_URL is the *frontend* domain and must not be used here.
    const apiBase =
      process.env.API_BASE_URL?.trim() ||
      (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "") ||
      `http://127.0.0.1:${process.env.PORT_API || 8787}`;
    res.json({
      ok: true,
      configured: buildexactConfigured(),
      webhookUrl: `${apiBase.replace(/\/$/, "")}/api/webhooks/buildexact`,
      token: getBuildexactTokenStatus()
    });
  });

  app.get("/api/buildexact/webhook-events", async (_req, res) => {
    const sb = getServiceSupabase();
    if (!sb) {
      return res.json({ ok: false, items: [], error: "SUPABASE_SERVICE_ROLE_KEY not set on API." });
    }
    const { data, error } = await sb
      .from("buildexact_webhook_events")
      .select("id, event_type, received_at, processed, matched_project_id, payload")
      .order("received_at", { ascending: false })
      .limit(10);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, items: data || [] });
  });

  app.post("/api/buildexact/test-connection", requireAuth, async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim();
      const apiKey = String(req.body?.apiKey || "").trim();
      const hasBodyCreds = Boolean(email && apiKey);
      const hasEnvCreds = Boolean(
        process.env.BUILDEXACT_USERNAME?.trim() && process.env.BUILDEXACT_API_KEY?.trim()
      );

      if (hasBodyCreds) {
        await buildexactLogin(email, apiKey);
      } else if (hasEnvCreds) {
        clearBuildexactSessionOverride();
        await buildexactLogin();
      } else {
        return res.status(400).json({
          ok: false,
          error:
            "Add BUILDEXACT_USERNAME and BUILDEXACT_API_KEY to `.env`, or send JSON body { \"email\", \"apiKey\" } for a one-off login test."
        });
      }

      let jobs_sample = null;
      try {
        jobs_sample = await getJobs("");
      } catch (probeErr) {
        console.warn("[buildexact/test] login succeeded but jobs request failed:", probeErr?.message);
      }

      return res.json({
        ok: true,
        token: getBuildexactTokenStatus(),
        jobs_sample
      });
    } catch (e) {
      console.error("[buildexact/test]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/tender/query-draft", requireAuth, async (req, res) => {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) {
      return res.status(500).json({ ok: false, error: "ANTHROPIC_API_KEY not configured." });
    }
    const address = String(req.body?.address || "").trim();
    const trade = String(req.body?.trade || "").trim();
    const context = String(req.body?.context || "").trim();
    if (!address || !trade) {
      return res.status(400).json({ ok: false, error: "address and trade required." });
    }
    try {
      const client = new Anthropic({ apiKey: key });
      const completion = await callAI(client, {
        model: MODEL,
        max_tokens: 1200,
        temperature: 0.4,
        messages: [
          {
            role: "user",
            content: `You write professional, warm, concise emails for Blue Leaf Building (Adelaide residential builder).\n\nDraft a short follow-up email to a subcontractor regarding a quote request.\nJob address: ${address}\nTrade package: ${trade}\nExtra context from Sam: ${context || "(none)"}\n\nOutput only the email body text (no subject line). Australian English.`
          }
        ]
      }, { module: "module4Routes" });
      const text = completion.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return res.json({ ok: true, body: text, model: MODEL });
    } catch (e) {
      console.error("[tender/query-draft]", e);
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/tender/outcome-mails", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const jobId = String(req.body?.jobId || "").trim();
    const jobAddress = String(req.body?.jobAddress || "").trim();
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    if (!jobId || !entries.length) {
      return res.status(400).json({ ok: false, error: "jobId and entries[] required." });
    }
    if (!mailTransportName()) {
      return res.status(503).json({ ok: false, error: "Mail not configured." });
    }
    try {
      const { saveOutcomeEmailTxtToRfqFolder } = await import("./dropboxClient.mjs");
      for (const e of entries) {
        const to = String(e?.to || "").trim();
        const subject = String(e?.subject || "").trim();
        const body = String(e?.body || "");
        const html = String(e?.html || "").trim();
        if (!to || !subject) continue;
        const msgId = generateOutboundMessageId();
        await sendPlainMail({
          to,
          subject,
          text: body,
          html: html || undefined,
          headers: { "Message-ID": msgId }
        });
        if (sb) {
          const rfqId = String(e.rfq_id || "").trim();
          if (rfqId) {
            await sb.from("rfqs").update({ sent_message_id: msgId }).eq("id", rfqId);
          }
          await insertCorrespondence(sb, {
            job_id: jobId,
            rfq_id: rfqId || null,
            subcontractor_id: e.subcontractor_id || null,
            subject,
            body,
            direction: "outbound",
            message_id: msgId.replace(/^<|>$/g, "")
          });
        }
        if (dropboxConfigured() && jobAddress) {
          await saveOutcomeEmailTxtToRfqFolder({
            jobAddress,
            tag: String(e?.tag || "EMAIL").trim(),
            trade: String(e?.trade || "TRADE").trim(),
            businessName: String(e?.businessName || "SUB").trim(),
            textBody: `${subject}\n\n${body}`
          });
        }
      }
      return res.json({ ok: true, sent: entries.length });
    } catch (e) {
      console.error("[tender/outcome-mails]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/tender/win-finalize", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) {
      return res.status(503).json({ ok: false, error: "Server needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY." });
    }
    const jobId = String(req.body?.jobId || "").trim();
    const rfqUpdates = Array.isArray(req.body?.rfqUpdates) ? req.body.rfqUpdates : [];
    const acceptedTrades = Array.isArray(req.body?.acceptedTrades) ? req.body.acceptedTrades : [];
    const quoteCopies = Array.isArray(req.body?.quoteCopies) ? req.body.quoteCopies : [];
    const emails = Array.isArray(req.body?.emails) ? req.body.emails : [];

    if (!jobId || !rfqUpdates.length) {
      return res.status(400).json({ ok: false, error: "jobId and rfqUpdates[] required." });
    }

    try {
      const { data: job, error: jErr } = await sb.from("jobs").select("*").eq("id", jobId).single();
      if (jErr || !job) {
        return res.status(404).json({ ok: false, error: jErr?.message || "Job not found." });
      }
      const addr = String(job.address || "").trim();

      for (const u of rfqUpdates) {
        const id = String(u?.id || "").trim();
        if (!id) continue;
        const patch = {};
        if (u.status != null && u.status !== "") patch.status = u.status;
        if ("quote_amount" in u) {
          if (u.quote_amount === null || u.quote_amount === "") {
            patch.quote_amount = null;
          } else {
            const n = Number(u.quote_amount);
            if (!Number.isNaN(n)) patch.quote_amount = n;
          }
        }
        if (!Object.keys(patch).length) continue;
        const { error: uErr } = await sb.from("rfqs").update(patch).eq("id", id);
        if (uErr) throw new Error(uErr.message);
        if (patch.status === "accepted") {
          const row = acceptedTrades.find((r) => String(r?.rfq_id || r?.id || "") === id)
            || rfqUpdates.find((r) => String(r?.id || "") === id);
          syncAcceptedQuoteToBuildexact({
            buildexactJobId: job.buildexact_job_id,
            trade: row?.trade,
            acceptedAmount: row?.quote_amount
          }).catch((err) => console.warn("[buildexact] win-finalize quote sync:", err?.message || err));
        }
      }

      if (dropboxConfigured() && addr) {
        await ensureInternalQuoteSubfolders(addr);
        const token = await getDropboxAccessToken();
        for (const c of quoteCopies) {
          const fromPath = String(c?.fromPath || "").trim();
          if (!fromPath.startsWith("/")) continue;
          const side = c.accepted ? "ACCEPTED" : "DECLINED";
          const fn = `${safeFilePart(c.trade, 24)}-${safeFilePart(c.businessName, 24)}-quote.pdf`;
          const sharedRoot = String(c?.sharedJobRoot || "").trim();
          const baseRoot = sharedRoot.startsWith("/") ? sharedRoot : sharedJobRootPath(addr);
          const toPath = `${baseRoot}/INTERNAL/QUOTES/${side}/${fn}`;
          try {
            await copyDropboxFile(token, fromPath, toPath);
          } catch (e) {
            console.warn("[win-finalize] quote copy skipped:", fromPath, e?.message);
          }
        }
      }

      const now = new Date().toISOString();
      const { error: jobUp } = await sb.from("jobs").update({ status: "won", won_at: now }).eq("id", jobId);
      if (jobUp) throw new Error(jobUp.message);

      // W05-DRIFT-004 (SAM-W05-004): sync the linked lead's pipeline stage to 'won'.
      // Preserve an existing won_at (only stamp it when absent) so re-running is idempotent.
      if (job.lead_id) {
        await sb.from("leads").update({ stage: "won", updated_at: now }).eq("id", job.lead_id);
        await sb.from("leads").update({ won_at: now.slice(0, 10) }).eq("id", job.lead_id).is("won_at", null);
      }

      // The status='won' update above fires trg_ensure_project_for_won_job
      // (migration 096), which guarantees a baseline projects row exists. Enrich
      // it idempotently — update the existing row if present, else insert. This
      // never creates a duplicate and is safe to re-run win-finalize.
      // Note: buildexact_job_id is deliberately NOT set here so we never clobber
      // an existing Buildexact link.
      const projectPatch = {
        job_id: jobId,
        address: addr || "Unknown",
        status: "active",
        accepted_trades: acceptedTrades,
        dropbox_shared_link: job.dropbox_shared_link || job.dropbox_link || "",
        dropbox_internal_path: job.dropbox_internal_path || "",
        buildexact_link_source: "pending",
        tentative_start_date: req.body?.tentative_start_date || null,
        notes: req.body?.project_notes || null,
        updated_at: now
      };
      // Portal v2 (WP-9): carry the client identity onto the project at win, so the
      // portal can email/notify the client even before they accept an invite (with no
      // identity, notifyClient's email leg is gated on a null portal_client_email and
      // the client is stranded). Only set non-empty values so we never clobber an
      // invite-provided name with a blank.
      if (String(job.client_name || "").trim()) projectPatch.portal_client_name = String(job.client_name).trim();
      if (String(job.client_email || "").trim()) projectPatch.portal_client_email = String(job.client_email).trim();

      let proj;
      const { data: existingProj } = await sb
        .from("projects")
        .select("id")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (existingProj?.id) {
        const { data: updProj, error: pUpd } = await sb
          .from("projects")
          .update(projectPatch)
          .eq("id", existingProj.id)
          .select("*")
          .single();
        if (pUpd) throw new Error(pUpd.message);
        proj = updProj;
      } else {
        const { data: insProj, error: pIns } = await sb
          .from("projects")
          .insert(projectPatch)
          .select("*")
          .single();
        if (pIns) throw new Error(pIns.message);
        proj = insProj;
      }

      // ── Value-carry: ensure a won job has a contract value (ex-GST) ──────────────
      // The fee-proposal-accept path historically read a non-existent `data` column, so
      // contract value was never set → jobs started at $0 (the -11,832% margin cause).
      // Derive from the proposal's TYPED totals: ex-GST = total_inc_gst - tax_amount.
      // Pick accepted (else most recent) proposal. Only fills when unset; never overwrites.
      try {
        const { data: jobCv } = await sb.from("jobs")
          .select("original_contract_value").eq("id", jobId).maybeSingle();
        if (!jobCv?.original_contract_value || Number(jobCv.original_contract_value) <= 0) {
          const { data: fps } = await sb.from("fee_proposals")
            .select("net_total, markup_amount, tax_amount, total_inc_gst, status, updated_at")
            .eq("job_id", jobId);
          const best = (fps || []).slice().sort((a, b) =>
            ((b.status === "accepted") - (a.status === "accepted")) ||
            String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
          )[0];
          const inc = Number(best?.total_inc_gst || 0);
          const tax = Number(best?.tax_amount || 0);
          const cv = inc > 0
            ? (tax > 0 ? Math.round((inc - tax) * 100) / 100 : Math.round((inc / 1.1) * 100) / 100)
            : Number(best?.net_total || 0) + Number(best?.markup_amount || 0);
          if (cv > 0) {
            // Phase 5: carry original_contract_value through the facts service so the
            // write is provenance-stamped (source='system', reason='win_finalize') in
            // job_fact_history + emits a job_events row. Value is IDENTICAL to the prior
            // ad-hoc column write. setFact handles the jobs.original_contract_value column.
            const fr = await setFact(jobId, "original_contract_value", cv, {
              source: "system",
              reason: "win_finalize",
              actorId: req.caller?.id || null,
            });
            if (!fr.ok) {
              // Defensive fallback — never leave a won job without a contract value.
              console.warn("[win-finalize] setFact original_contract_value:", fr.error);
              await sb.from("jobs").update({ original_contract_value: cv }).eq("id", jobId);
            }
            // contract_value (Generated) stays a direct column write here until migration
            // 079 drops the mig-034 sync trigger; projects mirror unchanged (portal reads it).
            await sb.from("jobs").update({ contract_value: cv }).eq("id", jobId);
            await sb.from("projects").update({ contract_value: cv, updated_at: now }).eq("id", proj.id);
          }
        }
      } catch (e) {
        console.warn("[win-finalize] contract value-carry skipped:", e?.message || e);
      }

      const ci = req.body?.costIntel || {};
      const num = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const slabM2 = num(job.slab_area_m2);
      const floorFromJob = num(job.floor_area_m2);
      const floorM2 =
        num(ci.floor_area_m2) ?? (floorFromJob != null ? floorFromJob : slabM2 != null ? slabM2 : null);
      const ciRow = {
        floor_area_m2: floorM2,
        storeys:
          num(ci.storeys) != null
            ? Math.round(num(ci.storeys))
            : job.storeys != null && Number.isFinite(Number(job.storeys))
              ? Math.round(Number(job.storeys))
              : null,
        roof_area_m2: num(ci.roof_area_m2) ?? num(job.roof_area_m2),
        wall_area_m2: num(ci.wall_area_m2),
        tile_area_floor_m2: num(ci.tile_area_floor_m2),
        tile_area_wall_m2: num(ci.tile_area_wall_m2),
        solar_system_kw: num(ci.solar_system_kw),
        wet_areas: num(ci.wet_areas) != null ? Math.round(num(ci.wet_areas)) : null,
        notes: ci.notes ? String(ci.notes).slice(0, 2000) : null,
        source: "tender"
      };
      // ── Phase 4: route the BUILDING-FACT fields through setFact (additive) ───────
      // The cost_intelligence insert below is the genuine per-trade quote row (quote_amount,
      // trade, project_type, rates) and is LEFT INTACT. But it also duplicates building facts
      // (floor/roof/wall area, storeys, wet_areas) — a second write path for canonical facts.
      // Route those registered facts through setFact into project_metrics so they carry
      // provenance (source='system', reason='win_finalize') + job_fact_history + a job_events
      // row. source='system' resolves to status 'manual' (auto-applied), matching the prior
      // direct write — value is IDENTICAL, only the provenance is added. The legacy
      // cost_intelligence building-fact columns are left in place and FLAGGED for follow-up
      // (entangled with the genuine quote row; tile_area_*/solar_system_kw are NOT canonical
      // facts and stay only in cost_intelligence). Best-effort: never breaks win-finalize.
      const storeysCanon =
        num(ci.storeys) != null
          ? Math.round(num(ci.storeys))
          : job.storeys != null && Number.isFinite(Number(job.storeys))
            ? Math.round(Number(job.storeys))
            : null;
      const buildingFacts = {
        floor_area_m2: floorM2,
        storeys: storeysCanon,
        roof_area_m2: ciRow.roof_area_m2,
        wall_area_m2: ciRow.wall_area_m2,
        wet_areas: ciRow.wet_areas,
      };
      for (const [key, value] of Object.entries(buildingFacts)) {
        if (value == null) continue;
        try {
          const fr = await setFact(jobId, key, value, {
            source: "system",
            reason: "win_finalize",
            actorId: req.caller?.id || null,
          });
          if (!fr.ok) console.warn(`[win-finalize] setFact ${key}:`, fr.error);
        } catch (e) {
          console.warn(`[win-finalize] setFact ${key}:`, e?.message || e);
        }
      }

      // DISC-WIN-01: make the per-trade cost_intelligence seed idempotent. Re-running win-finalize
      // (double-click, retry-on-timeout, or re-winning after editing accepted amounts) previously
      // appended a fresh row per trade on every run (N → 2N → 3N), inflating ops-readiness counts
      // and skewing per-trade / "latest row" cost analytics. Clear this job's prior seed rows first
      // (mirrors the job-delete cascade in jobsApiRoutes), then insert fresh below so the rows always
      // reflect the CURRENT accepted trades. Best-effort — never blocks the win flow.
      {
        const { error: ciResetErr } = await sb.from("cost_intelligence").delete().eq("job_id", jobId);
        if (ciResetErr) console.warn("[win-finalize] cost_intelligence reset:", ciResetErr.message);
      }
      for (const t of acceptedTrades) {
        const amt = t.quote_amount != null ? Number(t.quote_amount) : null;
        if (amt == null || !Number.isFinite(amt) || amt <= 0) continue;
        const { error: ciErr } = await sb.from("cost_intelligence").insert({
          job_id: jobId,
          trade: String(t.trade || "").trim() || "general",
          quote_amount: amt,
          project_type: job.project_type || "",
          recorded_at: new Date().toISOString().slice(0, 10),
          ...ciRow
        });
        if (ciErr) console.warn("[win-finalize] cost_intelligence insert:", ciErr.message);
      }

      if (emails.length && mailTransportName()) {
        const { saveOutcomeEmailTxtToRfqFolder } = await import("./dropboxClient.mjs");
        for (const e of emails) {
          const to = String(e?.to || "").trim();
          const subject = String(e?.subject || "").trim();
          const body = String(e?.body || "");
          const html = String(e?.html || "").trim();
          if (!to || !subject) continue;
          await sendPlainMail({ to, subject, text: body, html: html || undefined });
          await insertCorrespondence(sb, {
            job_id: jobId,
            rfq_id: e.rfq_id || null,
            subcontractor_id: e.subcontractor_id || null,
            subject,
            body,
            direction: "outbound"
          });
          if (dropboxConfigured() && addr) {
            await saveOutcomeEmailTxtToRfqFolder({
              jobAddress: addr,
              tag: String(e?.tag || "WIN").trim(),
              trade: String(e?.trade || "TRADE").trim(),
              businessName: String(e?.businessName || "SUB").trim(),
              textBody: `${subject}\n\n${body}`
            });
          }
        }
      }

      return res.json({ ok: true, project: proj, job_id: jobId });
    } catch (e) {
      console.error("[tender/win-finalize]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/tender/lose-finalize", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) {
      return res.status(503).json({ ok: false, error: "Server needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY." });
    }
    const jobId = String(req.body?.jobId || "").trim();
    if (!jobId) return res.status(400).json({ ok: false, error: "jobId required." });
    try {
      const { data: job } = await sb.from("jobs").select("address, lead_id").eq("id", jobId).single();
      const addr = String(job?.address || "").trim();
      const now = new Date().toISOString();
      const { error: r1 } = await sb.from("jobs").update({ status: "lost", lost_at: now }).eq("id", jobId);
      if (r1) throw new Error(r1.message);

      // W05-DRIFT-004 (SAM-W05-004): sync the linked lead's pipeline stage to 'lost'.
      // Preserve an existing lost_at (only stamp when absent) so re-running is idempotent.
      if (job?.lead_id) {
        await sb.from("leads").update({ stage: "lost", updated_at: now }).eq("id", job.lead_id);
        await sb.from("leads").update({ lost_at: now.slice(0, 10) }).eq("id", job.lead_id).is("lost_at", null);
      }
      const { error: r2 } = await sb.from("rfqs").update({ status: "declined" }).eq("job_id", jobId);
      if (r2) throw new Error(r2.message);

      const emails = Array.isArray(req.body?.emails) ? req.body.emails : [];
      if (emails.length && mailTransportName()) {
        const { saveOutcomeEmailTxtToRfqFolder } = await import("./dropboxClient.mjs");
        for (const e of emails) {
          const to = String(e?.to || "").trim();
          const subject = String(e?.subject || "").trim();
          const body = String(e?.body || "");
          const html = String(e?.html || "").trim();
          if (!to || !subject) continue;
          await sendPlainMail({ to, subject, text: body, html: html || undefined });
          await insertCorrespondence(sb, {
            job_id: jobId,
            rfq_id: e.rfq_id || null,
            subcontractor_id: e.subcontractor_id || null,
            subject,
            body,
            direction: "outbound"
          });
          if (dropboxConfigured() && addr) {
            await saveOutcomeEmailTxtToRfqFolder({
              jobAddress: addr,
              tag: "LOST",
              trade: String(e?.trade || "TRADE").trim(),
              businessName: String(e?.businessName || "SUB").trim(),
              textBody: `${subject}\n\n${body}`
            });
          }
        }
      }

      return res.json({ ok: true });
    } catch (e) {
      console.error("[tender/lose-finalize]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/po/issue", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) {
      return res.status(503).json({ ok: false, error: "Server needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY." });
    }

    const projectIdRaw = String(req.body?.projectId || "").trim();
    const jobAddress = String(req.body?.jobAddress || "").trim();
    const trade = String(req.body?.trade || "").trim();
    const prefix = String(req.body?.poPrefix || "BLB").trim() || "BLB";
    const company = req.body?.company || {};
    // Auto-fetch email logo from Supabase Storage if not provided by client
    const logoFromClient = String(req.body?.logoDataUrl || company.logoDataUrl || "").trim();
    const logoDataUrl = logoFromClient || await getBrandingEmailLogo(sb).catch(() => "");
    const vendor = req.body?.vendor || {};
    const lineItems = Array.isArray(req.body?.lineItems) ? req.body.lineItems : [];
    const scheduledCompletion = String(req.body?.scheduledCompletion || "").trim();
    const tentativeStartLabel = String(req.body?.tentativeStartLabel || "").trim();
    const toEmail = String(req.body?.toEmail || "").trim();
    const contactName = String(req.body?.contactName || "").trim();
    const buildexactJobId = String(req.body?.buildexactJobId || "").trim();
    const rfqId = String(req.body?.rfqId || "").trim();
    const subcontractorId = String(req.body?.subcontractorId || "").trim();
    const jobId = String(req.body?.jobId || "").trim();

    let projectId;
    try {
      projectId = await resolvePurchaseOrderProjectId(sb, { projectId: projectIdRaw, jobId });
    } catch (e) {
      console.error("[po/issue] project resolve:", e);
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }

    if (!projectId || !jobAddress || !trade || !toEmail) {
      return res.status(400).json({ ok: false, error: "projectId, jobAddress, trade, toEmail required." });
    }

    if (rfqId) {
      try {
        const existingPo = await findPurchaseOrderByRfqId(sb, rfqId);
        if (existingPo) {
          return res.json({
            ok: true,
            purchase_order: existingPo,
            po_number: existingPo.po_number,
            duplicate: true,
          });
        }
      } catch (e) {
        console.error("[po/issue] rfq idempotency:", e);
        return res.status(500).json({ ok: false, error: e?.message || String(e) });
      }
    }

    if (!mailTransportName()) {
      return res.status(503).json({ ok: false, error: "Mail not configured." });
    }

    try {
      const { data: seq, error: seqErr } = await sb.rpc("alloc_po_sequence");
      if (seqErr) throw new Error(seqErr.message);
      const n = Number(seq);
      if (!Number.isFinite(n)) throw new Error("Invalid PO sequence from database.");
      const year = new Date().getFullYear();
      const poNumber = `${prefix}-${year}-${String(n).padStart(3, "0")}`;

      let subtotal = 0;
      for (const li of lineItems) {
        subtotal += Number(li.lineTotal ?? li.amount ?? 0) || 0;
      }
    if (!subtotal && req.body?.totalExGst != null) {
      subtotal = Number(req.body.totalExGst) || 0;
    }
    if (!(subtotal > 0)) {
      return res.status(400).json({ ok: false, error: "PO total must be greater than zero." });
    }
      const gst = gstAmount(subtotal);
      const inc = Math.round((subtotal + gst) * 100) / 100;

      const std = defaultStandardConditions(tentativeStartLabel || "TBC");
      const terms2 = String(req.body?.termsPage2 || DEFAULT_PO_TERMS).trim();

      let quoteAttachment = null;
      let quoteReference = null;
      let quoteAttachmentWarning = null;
      if (rfqId) {
        try {
          const resolved = await resolveRfqQuotePdfForPo(sb, rfqId);
          quoteAttachment = resolved.attachment;
          quoteReference = resolved.reference;
          quoteAttachmentWarning = resolved.warning;
          if (quoteAttachmentWarning) {
            console.warn("[po/issue] quote attachment skipped:", quoteAttachmentWarning);
          }
        } catch (e) {
          quoteAttachmentWarning = e?.message || String(e);
          console.warn("[po/issue] quote attachment resolve:", quoteAttachmentWarning);
        }
        if (!quoteReference) {
          quoteReference = {
            fileName: "Unavailable",
            attachmentStatus: "Not available",
            acceptedAmountExGst:
              req.body?.totalExGst != null ? Number(req.body.totalExGst) || null : null,
          };
        }
      }

      const pdfBuf = await buildPurchaseOrderPdfBuffer({
        poNumber,
        dateCreatedIso: new Date().toLocaleDateString("en-AU"),
        company: {
          companyName: company.companyName || "Blue Leaf Building",
          abn: company.abn || "",
          address: company.address || "",
          phone: company.phone || "",
          email: company.email || "",
          website: company.website || ""
        },
        vendor: {
          lines: [
            vendor.businessName || "Vendor",
            vendor.contact ? `Attn: ${vendor.contact}` : "",
            vendor.email || "",
            vendor.phone || ""
          ].filter(Boolean)
        },
        jobAddress,
        tradeTitle: trade,
        scheduledCompletionIso: scheduledCompletion || "TBC",
        tentativeStartLabel,
        lineItems:
          lineItems.length > 0
            ? lineItems
            : [{ description: trade, qty: "1", unit: "lot", unitCost: subtotal, lineTotal: subtotal }],
        subtotalExGst: subtotal,
        gstAmount: gst,
        totalIncGst: inc,
        standardConditions: std,
        termsPage2: terms2,
        logoDataUrl,
        quoteReference: quoteReference || undefined,
      });

      let dropboxPath = "";
      if (dropboxConfigured()) {
        const fileName = `${poNumber}-${safeFilePart(trade, 32)}.pdf`;
        const up = await uploadPoPdfToJobFolder(jobAddress, fileName, pdfBuf);
        dropboxPath = up?.path_display || up?.path_lower || fileName;
      }

      const { data: poRow, error: poIns } = await sb
        .from("purchase_orders")
        .insert({
          project_id: projectId,
          job_id: jobId || null,
          subcontractor_id: subcontractorId || null,
          rfq_id: rfqId || null,
          po_number: poNumber,
          trade,
          scope_of_work: std.join("\n"),
          line_items: lineItems,
          total_amount: subtotal,
          gst_amount: gst,
          total_inc_gst: inc,
          status: "issued",
          scheduled_completion: scheduledCompletion || null,
          tentative_start_date: req.body?.tentative_start_date || null,
          issued_at: new Date().toISOString(),
          dropbox_pdf_path: dropboxPath
        })
        .select("*")
        .single();
      if (poIns) throw new Error(poIns.message);

      // Phase 6 — stamp the canonical trade_category_id by EXACT name match.
      // Additive + non-breaking: done as a tolerant follow-up update (NOT in the
      // insert above) so PO creation still works before migration 081 adds the
      // column. No exact match → left NULL for manual review, never guessed
      // (spend attribution). The `trade` text column is the unchanged source/fallback.
      try {
        const tradeCategoryId = await resolveTradeCategoryId(sb, trade);
        if (tradeCategoryId) {
          const { error: tcErr } = await sb
            .from("purchase_orders")
            .update({ trade_category_id: tradeCategoryId })
            .eq("id", poRow.id);
          if (tcErr) console.warn("[po/issue] trade_category_id set skipped:", tcErr.message);
        }
      } catch (e) {
        console.warn("[po/issue] trade_category_id resolve skipped:", e?.message || e);
      }

      // Check if subcontractor is familiar (prior completed/accepted PO on different project)
      let familiar = false;
      if (subcontractorId && projectId) {
        const { count: priorCount } = await sb
          .from("purchase_orders")
          .select("id", { count: "exact", head: true })
          .eq("subcontractor_id", subcontractorId)
          .neq("project_id", projectId)
          .in("status", ["complete", "accepted"]);
        familiar = (priorCount || 0) > 0;
      }

      const quarterTiming = quarterLabel(req.body?.tentative_start_date);
      const logoSig = String(req.body?.signatureLogoDataUrl || logoDataUrl || "").trim();
      const poTmpl = emailPoIssued({
        contactName: contactName || "there",
        jobAddress,
        trade,
        poNumber,
        quarterTiming,
        familiar,
        logo: logoSig
      });

      const mailAttachments = [
        { filename: `${poNumber}.pdf`, content: pdfBuf, mimeType: "application/pdf" },
      ];
      if (quoteAttachment?.content?.length) {
        mailAttachments.push({
          filename: quoteAttachment.filename,
          content: quoteAttachment.content,
          mimeType: quoteAttachment.mimeType || "application/pdf",
        });
      }

      await sendPlainMail({
        to: toEmail,
        subject: poTmpl.subject,
        text: poTmpl.text,
        html: poTmpl.html,
        attachments: mailAttachments,
      });

      let buildexact_po_id = null;
      if (buildexactJobId && buildexactConfigured()) {
        try {
          // POST /jobs/purchaseorders/create — PurchaseOrderCreateOptionsDto (jobId in body).
          const remote = await createPurchaseOrder({
            jobId: buildexactJobId,
            orderType: "Purchase",
            description: trade,
            items: [{
              costItemType: "SubContractor",
              description: trade,
              quantity: 1,
              unitCost: subtotal,
              totalCost: subtotal,
              uom: "ea"
            }]
          });
          buildexact_po_id =
            remote?.purchaseOrderId != null ? String(remote.purchaseOrderId)
              : remote?.id != null ? String(remote.id) : null;
        } catch (e) {
          console.warn("[po/issue] Buildexact sync skipped:", e?.message);
        }
      }
      if (buildexact_po_id) {
        await sb.from("purchase_orders").update({ buildexact_po_id }).eq("id", poRow.id);
      }

      await sb
        .from("projects")
        .update({ buildexact_last_sync: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", projectId);

      // Trade Commitment Engine — record PO issued event (fire-and-forget)
      const nowIso = new Date().toISOString();
      sb.from("purchase_orders")
        .update({ po_sent_at: nowIso, last_contact_at: nowIso })
        .eq("id", poRow.id)
        .then(() => {})
        .catch(e => console.warn("[po/issue] tcl po update:", e.message));
      sb.from("trade_communication_log")
        .insert({
          purchase_order_id: poRow.id,
          project_id: projectId,
          subcontractor_id: subcontractorId || null,
          event_type: "po_issued",
          email_subject: poTmpl.subject,
          tentative_start_label: quarterTiming,
        })
        .then(() => {})
        .catch(e => console.warn("[po/issue] tcl insert:", e.message));

      return res.json({
        ok: true,
        purchase_order: { ...poRow, buildexact_po_id },
        po_number: poNumber,
        po_email_attachment_count: mailAttachments.length,
        quote_attachment_included: Boolean(quoteAttachment?.content?.length),
        ...(quoteAttachmentWarning ? { quote_attachment_warning: quoteAttachmentWarning } : {}),
      });
    } catch (e) {
      console.error("[po/issue]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  /**
   * GET /api/tender/batch-po-check/:jobId
   * Returns accepted RFQs for the job that have no linked purchase_order row.
   */
  app.get("/api/tender/batch-po-check/:jobId", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { jobId } = req.params;
    if (!jobId) return res.status(400).json({ ok: false, error: "jobId required" });
    try {
      // Find all accepted RFQs for this job
      const { data: rfqs, error: rfqErr } = await sb
        .from("rfqs")
        .select(`
          id, trade, subcontractor_id, quote_amount,
          subcontractors ( id, business_name, contact, email, mobile )
        `)
        .eq("job_id", jobId)
        .eq("status", "accepted");
      if (rfqErr) throw new Error(rfqErr.message);

      if (!rfqs || rfqs.length === 0) return res.json({ ok: true, trades: [] });

      // Find which already have a PO (by rfq_id)
      const rfqIds = rfqs.map(r => r.id);
      const { data: existingPos } = await sb
        .from("purchase_orders")
        .select("rfq_id")
        .in("rfq_id", rfqIds)
        .not("rfq_id", "is", null);
      const issuedRfqIds = new Set((existingPos || []).map(p => p.rfq_id));

      const trades = rfqs
        .filter(r => !issuedRfqIds.has(r.id))
        .map(r => {
          const sub = r.subcontractors || {};
          return {
            rfq_id: r.id,
            trade: r.trade,
            subcontractor_id: r.subcontractor_id,
            business_name: sub.business_name || r.trade,
            contact: sub.contact || "",
            email: sub.email || "",
            phone: sub.mobile || "",
            total_amount: r.quote_amount || 0,
          };
        });

      return res.json({ ok: true, trades });
    } catch (e) {
      console.error("[batch-po-check]", e);
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  /**
   * GET /api/tender/:jobId/accept-alignment
   * Read-only cross-check: accepted package recipients vs accepted rfqs (P0-B2).
   */
  app.get("/api/tender/:jobId/accept-alignment", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const jobId = String(req.params.jobId || "").trim();
    if (!jobId) return res.status(400).json({ ok: false, error: "jobId required" });
    try {
      const { data: job, error: jErr } = await sb.from("jobs").select("id").eq("id", jobId).maybeSingle();
      if (jErr) throw jErr;
      if (!job) return res.status(404).json({ ok: false, error: "Job not found" });
      const alignment = await computeAcceptAlignment(sb, jobId);
      return res.json({ ok: true, ...alignment });
    } catch (e) {
      console.error("[accept-alignment]", e);
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  /**
   * GET /api/tender/:jobId/win-quote-readiness
   * Read-only: accepted rfqs missing staff-confirmed quote_amount (P0-B4).
   */
  app.get("/api/tender/:jobId/win-quote-readiness", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const jobId = String(req.params.jobId || "").trim();
    if (!jobId) return res.status(400).json({ ok: false, error: "jobId required" });
    try {
      const { data: job, error: jErr } = await sb.from("jobs").select("id").eq("id", jobId).maybeSingle();
      if (jErr) throw jErr;
      if (!job) return res.status(404).json({ ok: false, error: "Job not found" });
      const readiness = await computeWinQuoteReadiness(sb, jobId);
      return res.json({ ok: true, ...readiness });
    } catch (e) {
      console.error("[win-quote-readiness]", e);
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}

/**
 * rfqPackageRoutes.mjs
 * Persistent RFQ Package — CRUD, additional sends, follow-ups, addenda.
 */
import { getServiceSupabase } from "./supabaseService.mjs";
import { sendPlainMail } from "./notifyMail.mjs";
import { wrapPlainTextEmailHtml } from "./signatureEmailHtml.mjs";

const STANDARD_TRADES = [
  "excavation", "demolition", "termite_protection", "footings_concrete_formwork",
  "plumbing", "electrical", "internal_linings", "stairs", "tiling", "flooring",
  "metal_roofing", "scaffolding", "waterproofing", "stormwater", "painting",
  "plastering", "carpentry_joinery", "glazing_windows", "landscaping", "hvac",
  "balustrade", "garage_doors", "cabinetry", "stone_benchtops", "shower_screens",
  "rendering", "insulation", "suspended_ceilings", "skylights", "blinds_curtains",
  "cleaning", "site_safety"
];

const TRADE_LABEL_MAP = {
  excavation: "Excavation",
  demolition: "Demolition",
  termite_protection: "Termite Protection",
  footings_concrete_formwork: "Footings / Concrete / Formwork",
  plumbing: "Plumbing",
  electrical: "Electrical",
  internal_linings: "Internal Linings",
  stairs: "Stairs",
  tiling: "Tiling",
  flooring: "Flooring",
  metal_roofing: "Metal Roofing",
  scaffolding: "Scaffolding",
  waterproofing: "Waterproofing",
  stormwater: "Stormwater / Drainage",
  painting: "Painting",
  plastering: "Plastering",
  carpentry_joinery: "Carpentry / Joinery",
  glazing_windows: "Glazing / Windows",
  landscaping: "Landscaping",
  hvac: "HVAC",
  balustrade: "Balustrade",
  garage_doors: "Garage Doors",
  cabinetry: "Cabinetry",
  stone_benchtops: "Stone / Benchtops",
  shower_screens: "Shower Screens",
  rendering: "Rendering",
  insulation: "Insulation",
  suspended_ceilings: "Suspended Ceilings",
  skylights: "Skylights",
  blinds_curtains: "Blinds / Curtains",
  cleaning: "Final Clean",
  site_safety: "Site Safety / Fencing"
};

/** Estimate category mapping — rough buckets for cost planning. */
const ESTIMATE_CATEGORY = {
  excavation: "site_works",
  demolition: "site_works",
  stormwater: "site_works",
  landscaping: "site_works",
  termite_protection: "site_works",
  footings_concrete_formwork: "substructure",
  scaffolding: "substructure",
  plumbing: "services",
  electrical: "services",
  hvac: "services",
  metal_roofing: "external_envelope",
  waterproofing: "external_envelope",
  glazing_windows: "external_envelope",
  rendering: "external_envelope",
  internal_linings: "internal_fitout",
  stairs: "internal_fitout",
  tiling: "internal_fitout",
  flooring: "internal_fitout",
  carpentry_joinery: "internal_fitout",
  painting: "internal_fitout",
  plastering: "internal_fitout",
  cabinetry: "internal_fitout",
  stone_benchtops: "internal_fitout",
  shower_screens: "internal_fitout",
  balustrade: "internal_fitout",
  insulation: "internal_fitout",
  suspended_ceilings: "internal_fitout",
  skylights: "internal_fitout",
  blinds_curtains: "internal_fitout",
  garage_doors: "external_works",
  cleaning: "completion",
  site_safety: "preliminaries",
};

function computeSuggestedTrades(coveredTradeIds) {
  const covered = new Set(coveredTradeIds);
  const HIGH_RISK = ["waterproofing", "scaffolding", "stormwater", "painting", "metal_roofing"];
  const MEDIUM_RISK = ["glazing_windows", "rendering", "insulation", "balustrade", "carpentry_joinery", "cabinetry"];
  const suggestions = [];
  for (const t of HIGH_RISK) {
    if (!covered.has(t)) suggestions.push({ tradeId: t, label: TRADE_LABEL_MAP[t] || t, risk: "high" });
  }
  for (const t of MEDIUM_RISK) {
    if (!covered.has(t)) suggestions.push({ tradeId: t, label: TRADE_LABEL_MAP[t] || t, risk: "medium" });
  }
  return suggestions;
}

function computeCoverageScore(coveredCount) {
  if (coveredCount === 0) return 0;
  // Based on total standard trades as denominator
  return Math.min(100, Math.round((coveredCount / STANDARD_TRADES.length) * 100));
}

function buildFollowUpText({ name, address, deadline, trade, sigName, footer }) {
  const lines = [
    `Hi ${name},`,
    "",
    `Following up on our RFQ for ${trade} at ${address}.`,
    deadline ? `We are hoping to receive your quote by ${deadline}.` : "",
    "Please let us know if you need anything from us or if you have any questions.",
    "",
    "Thanks,",
    sigName || "Blue Leaf Building",
  ].filter((l) => l !== undefined);
  return footer ? lines.join("\n") + `\n\n${footer}` : lines.join("\n");
}

export function registerRfqPackageRoutes(app) {
  const sb = () => getServiceSupabase();

  // ── List all packages ────────────────────────────────────────────────────
  app.get("/api/rfq-packages", async (_req, res) => {
    const db = sb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { data, error } = await db
        .from("rfq_packages")
        .select(`
          id, project_address, project_type, tender_deadline, architect_client,
          dropbox_url, coverage_score, suggested_trades, status, created_at, updated_at, job_id,
          rfq_trade_scopes (
            id, trade_id, trade_label, status,
            rfq_recipients ( id, status, quote_amount )
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      res.json({ ok: true, packages: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Create package (called from RfqEngine after successful send) ─────────
  app.post("/api/rfq-packages", async (req, res) => {
    const db = sb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const {
        job_id, project_address, project_type, tender_deadline, architect_client,
        dropbox_url, extraction_data, pdf_meta, trade_scopes
      } = req.body;

      if (!project_address) return res.status(400).json({ error: "project_address required" });

      const coveredIds = (trade_scopes || []).map((t) => t.trade_id);
      const suggested = computeSuggestedTrades(coveredIds);
      const score = computeCoverageScore(coveredIds.length);

      const { data: pkg, error: pkgErr } = await db
        .from("rfq_packages")
        .insert({
          job_id: job_id || null,
          project_address,
          project_type: project_type || "",
          tender_deadline: tender_deadline || "",
          architect_client: architect_client || "",
          dropbox_url: dropbox_url || "",
          extraction_data: extraction_data || {},
          pdf_meta: pdf_meta || [],
          coverage_score: score,
          suggested_trades: suggested,
          status: "active"
        })
        .select("id")
        .single();
      if (pkgErr) throw pkgErr;

      // Insert trade scopes + recipients in batch
      for (const scope of trade_scopes || []) {
        const { data: ts, error: tsErr } = await db
          .from("rfq_trade_scopes")
          .insert({
            package_id: pkg.id,
            trade_id: scope.trade_id,
            trade_label: scope.trade_label || TRADE_LABEL_MAP[scope.trade_id] || scope.trade_id,
            scope_bullets: scope.scope_bullets || [],
            exclusions: scope.exclusions || [],
            questions: scope.questions || [],
            contractor_notes: scope.contractor_notes || "",
            due_date: scope.due_date || tender_deadline || "",
            attachments: scope.attachments || [],
            status: scope.recipients?.length ? "sent" : "draft",
            estimate_category: ESTIMATE_CATEGORY[scope.trade_id] || ""
          })
          .select("id")
          .single();
        if (tsErr) throw tsErr;

        for (const r of scope.recipients || []) {
          await db.from("rfq_recipients").insert({
            trade_scope_id: ts.id,
            package_id: pkg.id,
            subcontractor_id: r.subcontractor_id || null,
            business_name: r.business_name,
            email: r.email,
            status: r.status || "sent",
            sent_at: r.sent_at || new Date().toISOString(),
            email_subject: r.email_subject || "",
            email_body: r.email_body || "",
            rfq_id: r.rfq_id || null
          });
        }
      }

      res.json({ ok: true, packageId: pkg.id });
    } catch (e) {
      console.error("[rfq-packages] create", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Get single package with all detail ──────────────────────────────────
  app.get("/api/rfq-packages/:id", async (req, res) => {
    const db = sb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { data: pkg, error } = await db
        .from("rfq_packages")
        .select(`
          *,
          rfq_trade_scopes (
            *,
            rfq_recipients (*)
          ),
          rfq_addenda (*)
        `)
        .eq("id", req.params.id)
        .single();
      if (error) throw error;
      if (!pkg) return res.status(404).json({ error: "Package not found" });
      res.json({ ok: true, package: pkg });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Update package metadata ──────────────────────────────────────────────
  app.patch("/api/rfq-packages/:id", async (req, res) => {
    const db = sb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const allowed = ["tender_deadline", "architect_client", "dropbox_url", "status", "project_type"];
      const patch = {};
      for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
      patch.updated_at = new Date().toISOString();
      const { error } = await db.from("rfq_packages").update(patch).eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Update trade scope ───────────────────────────────────────────────────
  app.patch("/api/rfq-packages/:packageId/scopes/:tradeId", async (req, res) => {
    const db = sb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const allowed = [
        "scope_bullets", "exclusions", "questions", "internal_notes",
        "contractor_notes", "due_date", "attachments", "status", "estimate_category"
      ];
      const patch = {};
      for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
      patch.updated_at = new Date().toISOString();
      const { error } = await db
        .from("rfq_trade_scopes")
        .update(patch)
        .eq("package_id", req.params.packageId)
        .eq("trade_id", req.params.tradeId);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Add a new trade scope (for suggested/missing trades) ─────────────────
  app.post("/api/rfq-packages/:packageId/scopes", async (req, res) => {
    const db = sb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { trade_id, trade_label, scope_bullets, due_date } = req.body;
      if (!trade_id) return res.status(400).json({ error: "trade_id required" });

      // Fetch package for deadline fallback
      const { data: pkg } = await db
        .from("rfq_packages")
        .select("id, tender_deadline, suggested_trades")
        .eq("id", req.params.packageId)
        .single();

      const { data: ts, error } = await db
        .from("rfq_trade_scopes")
        .insert({
          package_id: req.params.packageId,
          trade_id,
          trade_label: trade_label || TRADE_LABEL_MAP[trade_id] || trade_id,
          scope_bullets: scope_bullets || [],
          due_date: due_date || pkg?.tender_deadline || "",
          status: "draft",
          estimate_category: ESTIMATE_CATEGORY[trade_id] || ""
        })
        .select("*")
        .single();
      if (error) throw error;

      // Remove from suggested_trades
      if (pkg) {
        const newSuggested = (pkg.suggested_trades || []).filter((s) => s.tradeId !== trade_id);
        await db.from("rfq_packages")
          .update({ suggested_trades: newSuggested, updated_at: new Date().toISOString() })
          .eq("id", req.params.packageId);
      }

      res.json({ ok: true, scope: ts });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Send RFQ to additional recipients for a trade ────────────────────────
  app.post("/api/rfq-packages/:packageId/scopes/:tradeId/send", async (req, res) => {
    const db = sb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { recipients, email_subject, email_body, due_date } = req.body;
      if (!recipients?.length) return res.status(400).json({ error: "recipients required" });

      // Fetch scope
      const { data: scope, error: scopeErr } = await db
        .from("rfq_trade_scopes")
        .select("*, rfq_packages(project_address, tender_deadline, job_id)")
        .eq("package_id", req.params.packageId)
        .eq("trade_id", req.params.tradeId)
        .single();
      if (scopeErr || !scope) return res.status(404).json({ error: "Trade scope not found" });

      const pkg = Array.isArray(scope.rfq_packages) ? scope.rfq_packages[0] : scope.rfq_packages;
      const address = pkg?.project_address || "";
      const sentAt = new Date().toISOString();
      const results = [];

      for (const r of recipients) {
        const to = r.email?.trim();
        if (!to) { results.push({ email: to, ok: false, error: "No email" }); continue; }

        try {
          await sendPlainMail({ to, subject: email_subject, text: email_body });

          // Insert recipient row
          const { data: rec } = await db.from("rfq_recipients").insert({
            trade_scope_id: scope.id,
            package_id: req.params.packageId,
            subcontractor_id: r.subcontractor_id || null,
            business_name: r.business_name || to,
            email: to,
            status: "sent",
            sent_at: sentAt,
            email_subject: email_subject || "",
            email_body: email_body || ""
          }).select("id").single();

          // Also create an rfqs row so it appears in quote-tracker
          if (pkg?.job_id) {
            const { data: rfqRow } = await db.from("rfqs").insert({
              job_id: pkg.job_id,
              subcontractor_id: r.subcontractor_id || null,
              trade: scope.trade_label,
              status: "sent",
              sent_at: sentAt,
              deadline: due_date || scope.due_date || pkg.tender_deadline || null,
              email_body: `Subject: ${email_subject || ""}\n\n${email_body || ""}`
            }).select("id").single();
            if (rfqRow && rec) {
              await db.from("rfq_recipients").update({ rfq_id: rfqRow.id }).eq("id", rec.id);
            }
          }

          results.push({ email: to, ok: true });
        } catch (sendErr) {
          results.push({ email: to, ok: false, error: sendErr.message });
        }
      }

      // Update scope status
      const allSent = results.every((r) => r.ok);
      if (allSent) {
        await db.from("rfq_trade_scopes")
          .update({ status: "sent", updated_at: sentAt })
          .eq("id", scope.id);
      }

      // Recalculate coverage
      await recomputePackageCoverage(db, req.params.packageId);

      const anyFailed = results.some((r) => !r.ok);
      res.json({ ok: !anyFailed, partial: anyFailed, results });
    } catch (e) {
      console.error("[rfq-packages] send-scope", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Update recipient (quote amount, status, etc.) ────────────────────────
  app.patch("/api/rfq-packages/:packageId/recipients/:recipientId", async (req, res) => {
    const db = sb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const allowed = [
        "status", "quote_amount", "quote_exclusions", "quote_pdf_path",
        "quote_received_at", "follow_up_due", "follow_up_sent_at"
      ];
      const patch = {};
      for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
      patch.updated_at = new Date().toISOString();

      // Auto-set quote_received_at when marking received
      if (patch.status === "received" && !patch.quote_received_at) {
        patch.quote_received_at = new Date().toISOString();
      }

      const { data: rec, error } = await db
        .from("rfq_recipients")
        .update(patch)
        .eq("id", req.params.recipientId)
        .eq("package_id", req.params.packageId)
        .select("rfq_id, quote_amount, status")
        .single();
      if (error) throw error;

      // Mirror to rfqs table if linked
      if (rec?.rfq_id) {
        const rfqPatch = {};
        if (patch.status === "received") rfqPatch.status = "received";
        if (patch.status === "declined") rfqPatch.status = "declined";
        if (patch.quote_amount !== undefined) rfqPatch.quote_amount = patch.quote_amount;
        if (patch.quote_received_at) rfqPatch.received_at = patch.quote_received_at;
        if (Object.keys(rfqPatch).length) {
          await db.from("rfqs").update(rfqPatch).eq("id", rec.rfq_id);
        }
      }

      // Propagate "received" status to parent trade scope
      if (patch.status === "received") {
        await db.from("rfq_trade_scopes")
          .update({ status: "received", updated_at: new Date().toISOString() })
          .eq("id", (await db.from("rfq_recipients").select("trade_scope_id").eq("id", req.params.recipientId).single())?.data?.trade_scope_id);
      }

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Send follow-up emails ────────────────────────────────────────────────
  app.post("/api/rfq-packages/:packageId/follow-up", async (req, res) => {
    const db = sb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { recipient_ids } = req.body;
      if (!recipient_ids?.length) return res.status(400).json({ error: "recipient_ids required" });

      const { data: recipients, error } = await db
        .from("rfq_recipients")
        .select("*, rfq_trade_scopes(trade_label, rfq_packages(project_address, tender_deadline))")
        .in("id", recipient_ids)
        .eq("package_id", req.params.packageId);
      if (error) throw error;

      const sigName = process.env.SAM_NAME?.trim() || "Blue Leaf Building";
      const results = [];

      for (const r of recipients || []) {
        const scope = Array.isArray(r.rfq_trade_scopes) ? r.rfq_trade_scopes[0] : r.rfq_trade_scopes;
        const pkg = scope ? (Array.isArray(scope.rfq_packages) ? scope.rfq_packages[0] : scope.rfq_packages) : null;
        const to = r.email?.trim();
        if (!to) { results.push({ id: r.id, ok: false, error: "No email" }); continue; }

        try {
          const text = buildFollowUpText({
            name: r.business_name?.split(" ")[0] || "there",
            address: pkg?.project_address || "the project",
            deadline: r.follow_up_due
              ? new Date(r.follow_up_due).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })
              : pkg?.tender_deadline || "",
            trade: scope?.trade_label || "your trade",
            sigName
          });
          const subject = `Follow-up — ${scope?.trade_label || "quote"} at ${pkg?.project_address || "project"}`;
          await sendPlainMail({ to, subject, text, html: wrapPlainTextEmailHtml(text, {}) });
          await db.from("rfq_recipients")
            .update({ status: "followed_up", follow_up_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", r.id);
          results.push({ id: r.id, ok: true });
        } catch (sendErr) {
          results.push({ id: r.id, ok: false, error: sendErr.message });
        }
      }

      res.json({ ok: results.every((r) => r.ok), results });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Addenda: create + send ───────────────────────────────────────────────
  app.post("/api/rfq-packages/:packageId/addenda", async (req, res) => {
    const db = sb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { name, affected_trades, send_emails } = req.body;
      if (!name) return res.status(400).json({ error: "name required" });

      // Auto-number
      const { data: existing } = await db
        .from("rfq_addenda")
        .select("number")
        .eq("package_id", req.params.packageId)
        .order("number", { ascending: false })
        .limit(1);
      const nextNum = (existing?.[0]?.number || 0) + 1;

      const { data: addendum, error } = await db
        .from("rfq_addenda")
        .insert({
          package_id: req.params.packageId,
          number: nextNum,
          name,
          affected_trades: affected_trades || []
        })
        .select("*")
        .single();
      if (error) throw error;

      const results = [];
      if (send_emails && affected_trades?.length) {
        // Fetch recipients for affected trades in this package
        const { data: scopes } = await db
          .from("rfq_trade_scopes")
          .select("id, trade_label, rfq_recipients(id, email, business_name, status)")
          .eq("package_id", req.params.packageId)
          .in("trade_id", affected_trades);

        const { data: pkg } = await db
          .from("rfq_packages")
          .select("project_address")
          .eq("id", req.params.packageId)
          .single();

        const sigName = process.env.SAM_NAME?.trim() || "Blue Leaf Building";
        for (const scope of scopes || []) {
          for (const r of scope.rfq_recipients || []) {
            if (!["sent", "reminded", "followed_up"].includes(r.status)) continue;
            const to = r.email?.trim();
            if (!to) continue;
            try {
              const text = [
                `Hi ${r.business_name?.split(" ")[0] || "there"},`,
                "",
                `Please note Addendum ${nextNum} — ${name} has been issued for ${pkg?.project_address || "this project"}.`,
                "This addendum affects your trade scope. Please review and update your quote if necessary.",
                "",
                `If you have any questions, don't hesitate to contact us.`,
                "",
                "Thanks,",
                sigName
              ].join("\n");
              await sendPlainMail({
                to,
                subject: `Addendum ${nextNum} — ${pkg?.project_address || "project"}`,
                text
              });
              results.push({ email: to, ok: true });
            } catch (e) {
              results.push({ email: to, ok: false, error: e.message });
            }
          }
        }
        await db.from("rfq_addenda")
          .update({ sent_at: new Date().toISOString() })
          .eq("id", addendum.id);
      }

      res.json({ ok: true, addendum, emailResults: results });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Delete a recipient ───────────────────────────────────────────────────
  app.delete("/api/rfq-packages/:packageId/recipients/:recipientId", async (req, res) => {
    const db = sb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { error } = await db
        .from("rfq_recipients")
        .delete()
        .eq("id", req.params.recipientId)
        .eq("package_id", req.params.packageId);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Delete a package ─────────────────────────────────────────────────────
  app.delete("/api/rfq-packages/:id", async (req, res) => {
    const db = sb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });
    try {
      const { error } = await db.from("rfq_packages").delete().eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

async function recomputePackageCoverage(db, packageId) {
  try {
    const { data: scopes } = await db
      .from("rfq_trade_scopes")
      .select("trade_id")
      .eq("package_id", packageId);
    const count = (scopes || []).length;
    await db.from("rfq_packages").update({
      coverage_score: Math.min(100, Math.round((count / 32) * 100)),
      updated_at: new Date().toISOString()
    }).eq("id", packageId);
  } catch { /* non-fatal */ }
}

import Anthropic from "@anthropic-ai/sdk";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import expressions from "angular-expressions";
import { config as dotenvConfig } from "dotenv";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth } from "./requireAuth.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Blueprint-agent knowledge directory (sibling project)
const KNOWLEDGE_DIR = join(__dirname, "../../../blueprint-agent/src/blueprint/knowledge");

const { parsed: _env = {} } = dotenvConfig();
const _apiKey = process.env.ANTHROPIC_API_KEY?.trim() || _env.ANTHROPIC_API_KEY?.trim();
const CLAUDE_MODEL = _env.CLAUDE_MODEL || process.env.CLAUDE_MODEL || "claude-opus-4-5";

const TRANSCRIPT_ANALYSIS_PROMPT = `You are an expert builder sales consultant trained in the APB (Association of Professional Builders) framework. You have been given a transcript of a client meeting for a residential building company.

Analyse the transcript carefully and extract structured data to update the lead record. Return ONLY valid JSON with this exact shape — do not include any explanation or markdown:

{
  "summary": "2-3 sentence summary of the meeting",
  "lead": {
    "first_name": null,
    "last_name": null,
    "email": null,
    "phone": null,
    "suburb": null
  },
  "project": {
    "project_type": null,
    "estimated_value": null,
    "floor_area_m2": null,
    "design_stage": null,
    "desired_start_date": null,
    "discovery_notes": null
  },
  "qualifying": {
    "qualify_budget": null,
    "qualify_timeframe": null,
    "qualify_site": null,
    "qualify_decision_maker": null
  },
  "activity": {
    "type": "meeting",
    "summary": "one sentence summary for the activity log"
  },
  "next_action": null,
  "next_action_date": null,
  "winning_offer": {
    "preconstruction_fee": null,
    "inclusions_summary": null
  }
}

Rules:
- Only include fields where you found clear evidence in the transcript — use null for fields you cannot determine
- project_type must be one of: new_build, extension, renovation, knockdown_rebuild — or null
- estimated_value must be a number in dollars (no $ sign) — or null
- floor_area_m2 must be a number — or null
- design_stage must be one of: concept, da_approved, construction_drawings — or null
- desired_start_date must be ISO date format YYYY-MM-DD if determinable — or null
- Qualifying scores use the APB framework:
  - qualify_budget: 0 = No budget/cant afford, 1 = Unsure/vague, 2 = Yes clear budget that matches project
  - qualify_timeframe: 0 = 18+ months away, 1 = 6-18 months, 2 = under 6 months ready to go
  - qualify_site: 0 = No site and no plan to buy, 1 = Under contract or searching, 2 = Owns site already
  - qualify_decision_maker: 0 = Not the decision maker, 1 = One of two decision makers, 2 = Sole decision maker
- next_action_date must be ISO date YYYY-MM-DD — or null
- preconstruction_fee must be a number — or null`;

async function analyseTranscriptWithBlueprint(transcript, lead) {
  if (!_apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const client = new Anthropic({ apiKey: _apiKey, maxRetries: 1 });

  const contextBlock = lead
    ? `\nExisting lead context:\n- Name: ${lead.first_name || ""} ${lead.last_name || ""}`.trim() +
      `\n- Stage: ${lead.stage || "enquiry"}` +
      `\n- Project type: ${lead.project_type || "unknown"}` +
      `\n- Suburb: ${lead.suburb || "unknown"}\n`
    : "";

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    temperature: 0.1,
    messages: [
      {
        role: "user",
        content: `${TRANSCRIPT_ANALYSIS_PROMPT}\n${contextBlock}\n\nTRANSCRIPT:\n${transcript}`
      }
    ]
  });

  const raw = response.content.find(b => b.type === "text")?.text?.trim() || "";
  // Strip markdown code fences if present
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    throw new Error(`Blueprint returned non-JSON: ${raw.slice(0, 200)}`);
  }
}

// ── APB stage probability weights ────────────────────────────────────────────
const STAGE_PROB = {
  enquiry: 0.05, qualify: 0.10, discovery: 0.20,
  winning_offer: 0.40, fee_proposal: 0.60,
  accepted: 0.80, tender: 0.90, won: 1.00
};

// ── APB benchmarks (from Pricing 4 Profit + presales knowledge) ──────────────
const APB_BENCHMARKS = {
  close_rate_min: 0.25,
  close_rate_max: 0.33,
  min_margin_pct: 33,       // minimum gross margin % (NOT markup)
  target_margin_pct: 40,    // APB ideal margin
  fp_hit_rate_min: 0.33,    // fee proposals → won
};

// ─── PTSA helpers ─────────────────────────────────────────────────────────────

function _makeAngularParser(tag) {
  if (tag === ".") return { get: (s) => s };
  const expr = expressions.compile(tag.replace(/('|')/g, "'").replace(/("|")/g, '"'));
  return {
    get(scope, context) {
      let obj = {};
      const list = context.scopeList;
      for (let i = 0; i <= context.num; i++) Object.assign(obj, list[i]);
      return expr(scope, obj);
    }
  };
}

function _normaliseDocxTemplate(zip) {
  const xmlFiles = Object.keys(zip.files).filter(
    (n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n) && !zip.files[n].dir
  );
  for (const name of xmlFiles) {
    let text = zip.files[name].asText();
    text = text.replace(/\{\{([A-Z_][A-Z_0-9]*)\}\}/g, "{$1}");
    zip.file(name, text);
  }
  return zip;
}

const PTSA_SERVICES = [
  { value: "site_analysis",        label: "Site Analysis and Survey Review" },
  { value: "cost_planning",        label: "Detailed Preliminary Cost Planning by Trade Category" },
  { value: "design_coordination",  label: "Design Coordination and Architectural Review" },
  { value: "engineering_review",   label: "Engineering Review and Certification Coordination" },
  { value: "specification_prep",   label: "Specification Preparation and Inclusion Schedule" },
  { value: "council_liaison",      label: "Council and Authority Liaison" },
  { value: "tender_report",        label: "Comprehensive Tender Report" },
];

const PTSA_DEFAULT_SERVICES = [
  "site_analysis", "cost_planning", "design_coordination",
  "engineering_review", "specification_prep"
];

const PROJECT_TYPE_LABELS = {
  new_build: "New Build",
  extension: "Extension",
  renovation: "Renovation",
  knockdown_rebuild: "Knockdown Rebuild",
};

// Embedded minimal DOCX template with docxtemplater {VAR} placeholders.
// Generated from /tmp/ptsa-template.docx via gen_ptsa_template.mjs
const PTSA_TEMPLATE_B64 = "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";

export function registerSalesRoutes(app) {

  // ── Sales Scorecard ─────────────────────────────────────────────────────────
  app.get("/api/sales/scorecard", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });

    const { data: leads, error } = await sb
      .from("leads")
      .select("id,stage,estimated_value,target_gp_pct,lead_source,won_at,created_at,stage_entered_at")
      .eq("archived", false);

    if (error) return res.status(500).json({ ok: false, error: error.message });

    const now = new Date();
    const cutoff12m = new Date(now);
    cutoff12m.setFullYear(cutoff12m.getFullYear() - 1);

    // Per-stage breakdown (excludes lost)
    const stageMap = {};
    for (const l of leads) {
      if (l.stage === "lost") continue;
      if (!stageMap[l.stage]) stageMap[l.stage] = { count: 0, value: 0, weighted: 0 };
      const val = Number(l.estimated_value) || 0;
      const prob = STAGE_PROB[l.stage] || 0;
      stageMap[l.stage].count++;
      stageMap[l.stage].value += val;
      stageMap[l.stage].weighted += val * prob;
    }

    const stageOrder = Object.keys(STAGE_PROB);
    const pipeline = stageOrder
      .filter(s => s !== "won" && stageMap[s])
      .map(s => ({ stage: s, ...stageMap[s] }));

    const total_pipeline_value = pipeline.reduce((s, p) => s + p.value, 0);
    const weighted_pipeline_value = pipeline.reduce((s, p) => s + p.weighted, 0);
    const active_lead_count = pipeline.reduce((s, p) => s + p.count, 0);

    // Won in last 12m
    const wonLeads = leads.filter(l => l.stage === "won" && l.won_at && new Date(l.won_at) >= cutoff12m);
    const wonFallback = leads.filter(l => l.stage === "won" && (!l.won_at) && new Date(l.stage_entered_at) >= cutoff12m);
    const allWon12m = wonLeads.length ? wonLeads : wonFallback;
    const won_count = allWon12m.length;
    const won_total = allWon12m.reduce((s, l) => s + (Number(l.estimated_value) || 0), 0);
    const avg_value = won_count ? Math.round(won_total / won_count) : 0;

    // Enquiries in last 12m (denominator for close rate)
    const enquiries_12m = leads.filter(l => new Date(l.created_at) >= cutoff12m).length;
    const close_rate = enquiries_12m > 0 ? won_count / enquiries_12m : 0;

    // Fee proposals → won (last 12m)
    const fp_stages = new Set(["fee_proposal", "accepted", "tender", "won"]);
    const fp_12m = leads.filter(l => fp_stages.has(l.stage) && new Date(l.stage_entered_at) >= cutoff12m).length;
    const fp_hit_rate = fp_12m > 0 ? won_count / fp_12m : 0;

    // By lead source (active pipeline)
    const sourceMap = {};
    for (const l of leads) {
      if (l.stage === "lost") continue;
      const src = l.lead_source || "unknown";
      if (!sourceMap[src]) sourceMap[src] = { count: 0, value: 0 };
      sourceMap[src].count++;
      sourceMap[src].value += Number(l.estimated_value) || 0;
    }
    const by_source = Object.entries(sourceMap)
      .map(([source, d]) => ({ source, ...d }))
      .sort((a, b) => b.value - a.value);

    // Margin health across leads with target_gp_pct set
    const pricedLeads = leads.filter(l => l.target_gp_pct != null && !["lost", "won"].includes(l.stage));
    const below_min_margin = pricedLeads.filter(l => l.target_gp_pct < APB_BENCHMARKS.min_margin_pct).length;

    res.json({
      ok: true,
      pipeline,
      total_pipeline_value,
      weighted_pipeline_value,
      active_lead_count,
      won_last_12m: { count: won_count, total_value: won_total, avg_value },
      enquiries_last_12m: enquiries_12m,
      close_rate,
      fp_last_12m: fp_12m,
      fp_hit_rate,
      by_source,
      margin_health: { priced_count: pricedLeads.length, below_min_margin },
      apb_benchmarks: APB_BENCHMARKS,
    });
  });

  // ── APB knowledge updates (surfaces new content from blueprint-agent) ────────
  app.get("/api/sales/knowledge-updates", requireAuth, (req, res) => {
    if (!existsSync(KNOWLEDGE_DIR)) return res.json({ ok: true, updates: [] });

    const cutoffDays = Number(req.query.days || 14);
    const cutoff = Date.now() - cutoffDays * 24 * 60 * 60 * 1000;
    const updates = [];

    for (const file of readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith(".md"))) {
      const fpath = join(KNOWLEDGE_DIR, file);
      const stat = statSync(fpath);
      if (stat.mtimeMs < cutoff) continue;

      const content = readFileSync(fpath, "utf8");
      // Extract each H2 block as a course entry
      const sections = content.split(/^## /m).slice(1);
      const courses = sections.map(s => {
        const firstLine = s.split("\n")[0].trim();
        // Title | Category: X | Level: Y | Course: Z
        const catM = firstLine.match(/Category:\s*([^|]+)/i);
        const courseM = firstLine.match(/Course:\s*([^|]+)/i);
        const title = firstLine.split("|")[0].trim().split(" — ")[0].trim();
        return {
          title,
          category: catM?.[1]?.trim() || "general",
          course: courseM?.[1]?.trim() || title,
        };
      }).filter(c => c.title);

      updates.push({ file, modified: stat.mtime, courses });
    }

    updates.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    res.json({ ok: true, updates });
  });

  app.get("/api/sales/leads", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { data, error } = await sb
      .from("leads")
      .select("*")
      .eq("archived", false)
      .order("last_activity_at", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, leads: data || [] });
  });

  app.get("/api/sales/leads/:id", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { data: lead, error } = await sb
      .from("leads")
      .select("*")
      .eq("id", req.params.id)
      .single();
    if (error) return res.status(404).json({ ok: false, error: error.message });
    const { data: activities } = await sb
      .from("lead_activities")
      .select("*")
      .eq("lead_id", req.params.id)
      .order("created_at", { ascending: false });
    res.json({ ok: true, lead, activities: activities || [] });
  });

  app.post("/api/sales/leads", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const now = new Date().toISOString();
    const body = req.body;
    if (body.first_name) body.first_name = body.first_name.trim().replace(/\b\w/g, c => c.toUpperCase());
    if (body.last_name) body.last_name = body.last_name.trim().replace(/\b\w/g, c => c.toUpperCase());
    const insert = { ...body, created_at: now, updated_at: now, stage: body.stage || "enquiry", stage_entered_at: now, last_activity_at: now };
    const { data, error } = await sb.from("leads").insert(insert).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    await sb.from("lead_activities").insert({ lead_id: data.id, activity_type: "note", summary: "Lead created" });
    res.json({ ok: true, lead: data });
  });

  app.patch("/api/sales/leads/:id", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const body = req.body;
    if (body.first_name) body.first_name = body.first_name.trim().replace(/\b\w/g, c => c.toUpperCase());
    if (body.last_name) body.last_name = body.last_name.trim().replace(/\b\w/g, c => c.toUpperCase());
    const updates = { ...body, updated_at: new Date().toISOString() };
    const { data: current } = await sb.from("leads").select("stage").eq("id", req.params.id).single();
    if (updates.stage && current?.stage && updates.stage !== current.stage) {
      updates.stage_entered_at = new Date().toISOString();
      updates.last_activity_at = new Date().toISOString();
      await sb.from("lead_activities").insert({
        lead_id: req.params.id,
        activity_type: "stage_change",
        summary: `Moved from ${current.stage} to ${updates.stage}`
      });
    }
    const { data, error } = await sb.from("leads").update(updates).eq("id", req.params.id).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    res.json({ ok: true, lead: data });
  });

  app.post("/api/sales/leads/:id/activities", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { activity_type, summary, detail, next_action, next_action_date } = req.body;
    if (!summary) return res.status(400).json({ ok: false, error: "summary required" });
    const { data, error } = await sb.from("lead_activities").insert({
      lead_id: req.params.id, activity_type: activity_type || "note", summary, detail: detail || null, next_action: next_action || null, next_action_date: next_action_date || null
    }).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    const upd = { last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (next_action) upd.next_action = next_action;
    if (next_action_date) upd.next_action_date = next_action_date;
    await sb.from("leads").update(upd).eq("id", req.params.id);
    res.json({ ok: true, activity: data });
  });

  app.delete("/api/sales/leads/:id", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { error } = await sb.from("leads").update({ archived: true, updated_at: new Date().toISOString() }).eq("id", req.params.id);
    if (error) return res.status(400).json({ ok: false, error: error.message });
    res.json({ ok: true });
  });

  // ─── Conversations ────────────────────────────────────────────────────────

  // List conversations for a lead
  app.get("/api/sales/leads/:id/conversations", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { data, error } = await sb
      .from("lead_conversations")
      .select("id, lead_id, title, created_at, applied_at, bp_suggestions")
      .eq("lead_id", req.params.id)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, conversations: data || [] });
  });

  // Get a single conversation (includes full transcript)
  app.get("/api/sales/leads/:id/conversations/:convId", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { data, error } = await sb
      .from("lead_conversations")
      .select("*")
      .eq("id", req.params.convId)
      .eq("lead_id", req.params.id)
      .single();
    if (error) return res.status(404).json({ ok: false, error: error.message });
    res.json({ ok: true, conversation: data });
  });

  // Analyse a transcript — returns suggestions without saving yet
  app.post("/api/sales/leads/:id/conversations/analyse", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { transcript } = req.body;
    if (!transcript?.trim()) return res.status(400).json({ ok: false, error: "transcript required" });

    const { data: lead } = await sb.from("leads").select("*").eq("id", req.params.id).single();
    try {
      const suggestions = await analyseTranscriptWithBlueprint(transcript.trim(), lead);
      res.json({ ok: true, suggestions });
    } catch (e) {
      console.error("[sales/conversations/analyse]", e);
      res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Save conversation + optionally apply suggestions
  app.post("/api/sales/leads/:id/conversations", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { title, transcript, bp_suggestions, applied_fields } = req.body;
    if (!transcript?.trim()) return res.status(400).json({ ok: false, error: "transcript required" });

    const now = new Date().toISOString();
    const hasApplied = applied_fields && Object.keys(applied_fields).length > 0;

    const { data: conv, error: convErr } = await sb
      .from("lead_conversations")
      .insert({
        lead_id: req.params.id,
        title: title?.trim() || null,
        transcript_text: transcript.trim(),
        bp_suggestions: bp_suggestions || null,
        applied_suggestions: hasApplied ? applied_fields : null,
        applied_at: hasApplied ? now : null
      })
      .select()
      .single();
    if (convErr) return res.status(400).json({ ok: false, error: convErr.message });

    // Apply selected lead field updates
    if (hasApplied) {
      const leadUpdates = { updated_at: now };

      // Flatten the applied_fields object (it may be nested by section)
      const flat = {};
      for (const [section, fields] of Object.entries(applied_fields)) {
        if (typeof fields === "object" && fields !== null && !Array.isArray(fields)) {
          Object.assign(flat, fields);
        } else {
          flat[section] = fields;
        }
      }

      const LEAD_FIELDS = ["first_name","last_name","email","phone","suburb"];
      const PROJECT_FIELDS = ["project_type","estimated_value","floor_area_m2","design_stage","desired_start_date","discovery_notes"];
      const QUALIFY_FIELDS = ["qualify_budget","qualify_timeframe","qualify_site","qualify_decision_maker"];
      const WINNING_FIELDS = ["preconstruction_fee","inclusions_summary"];

      for (const field of [...LEAD_FIELDS, ...PROJECT_FIELDS, ...QUALIFY_FIELDS, ...WINNING_FIELDS]) {
        if (flat[field] != null && flat[field] !== "") {
          leadUpdates[field] = flat[field];
        }
      }
      if (flat.next_action) leadUpdates.next_action = flat.next_action;
      if (flat.next_action_date) leadUpdates.next_action_date = flat.next_action_date;
      leadUpdates.last_activity_at = now;

      await sb.from("leads").update(leadUpdates).eq("id", req.params.id);

      // Add to activity log
      const activitySummary = bp_suggestions?.activity?.summary
        || (title ? `Meeting: ${title}` : "Meeting transcript analysed and applied");
      await sb.from("lead_activities").insert({
        lead_id: req.params.id,
        activity_type: bp_suggestions?.activity?.type || "meeting",
        summary: activitySummary,
        detail: bp_suggestions?.summary || null,
        next_action: flat.next_action || null,
        next_action_date: flat.next_action_date || null
      });
    }

    res.json({ ok: true, conversation: conv });
  });

  // ─── PTSA Document Generation ─────────────────────────────────────────────

  app.post("/api/sales/leads/:id/ptsa/generate-docx", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });

    const { data: lead, error } = await sb.from("leads").select("*").eq("id", req.params.id).single();
    if (error || !lead) return res.status(404).json({ ok: false, error: "Lead not found" });

    const today = new Date();
    const validDays = lead.ptsa_validity_days || 14;
    const validUntil = new Date(today.getTime() + validDays * 86400000);

    const fmtDate = (d) =>
      d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

    const services = Array.isArray(lead.ptsa_services) && lead.ptsa_services.length > 0
      ? lead.ptsa_services
      : PTSA_DEFAULT_SERVICES;

    const serviceLabels = Object.fromEntries(PTSA_SERVICES.map(s => [s.value, s.label]));
    const servicesList = services.map(s => `• ${serviceLabels[s] || s}`).join("\n");

    const fee = lead.preconstruction_fee ?? lead.pretender_deposit_amount;
    const feeFormatted = fee != null
      ? `$${Number(fee).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (inc. GST)`
      : "[TO BE DETERMINED]";

    const creditClause = lead.ptsa_credit_to_contract !== false
      ? `This fee is credited in full against the construction contract if executed and returned to Blue Leaf Building within ${validDays} days of the tender price being issued.`
      : "This fee is non-refundable.";

    const agreementRef = `PTSA-${today.getFullYear()}-${String(lead.id).slice(0, 6).toUpperCase()}`;

    const data = {
      agreement_ref:    agreementRef,
      date_issued:      fmtDate(today),
      valid_until:      fmtDate(validUntil),
      client_name:      [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "[CLIENT NAME]",
      client_email:     lead.email || "—",
      client_phone:     lead.phone || "—",
      site_address:     lead.site_address || lead.suburb || "[SITE ADDRESS]",
      project_type:     PROJECT_TYPE_LABELS[lead.project_type] || lead.project_type || "[PROJECT TYPE]",
      services_list:    servicesList,
      scope_notes:      lead.ptsa_scope_notes || lead.discovery_notes || lead.key_requirements || "[Scope to be confirmed with client]",
      fee_formatted:    feeFormatted,
      credit_clause:    creditClause,
      builder_abn:      "XX XXX XXX XXX",
      validity_days:    String(validDays),
      extra_deliverables: "",
      special_terms:    lead.ptsa_special_terms || "",
    };

    try {
      const zip = _normaliseDocxTemplate(new PizZip(Buffer.from(PTSA_TEMPLATE_B64, "base64")));
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        parser: _makeAngularParser,
        nullGetter: () => "",
      });
      doc.render(data);
      const out = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
      const safeName = (lead.first_name || "client").replace(/[^\w]+/g, "-");
      const filename = `PTSA-${safeName}-${today.toISOString().slice(0, 10)}.docx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(out);
    } catch (e) {
      console.error("[ptsa/generate-docx]", e);
      const msg = e?.properties?.errors ? JSON.stringify(e.properties.errors) : e?.message || String(e);
      return res.status(502).json({ ok: false, error: msg });
    }
  });
}

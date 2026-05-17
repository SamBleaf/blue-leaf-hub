import Anthropic from "@anthropic-ai/sdk";
import { config as dotenvConfig } from "dotenv";
import { getServiceSupabase } from "./supabaseService.mjs";

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

export function registerSalesRoutes(app) {

  app.get("/api/sales/leads", async (req, res) => {
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

  app.get("/api/sales/leads/:id", async (req, res) => {
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

  app.post("/api/sales/leads", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const now = new Date().toISOString();
    const insert = { ...req.body, created_at: now, updated_at: now, stage: req.body.stage || "enquiry", stage_entered_at: now, last_activity_at: now };
    const { data, error } = await sb.from("leads").insert(insert).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message });
    await sb.from("lead_activities").insert({ lead_id: data.id, activity_type: "note", summary: "Lead created" });
    res.json({ ok: true, lead: data });
  });

  app.patch("/api/sales/leads/:id", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const updates = { ...req.body, updated_at: new Date().toISOString() };
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

  app.post("/api/sales/leads/:id/activities", async (req, res) => {
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

  app.delete("/api/sales/leads/:id", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured" });
    const { error } = await sb.from("leads").update({ archived: true, updated_at: new Date().toISOString() }).eq("id", req.params.id);
    if (error) return res.status(400).json({ ok: false, error: error.message });
    res.json({ ok: true });
  });

  // ─── Conversations ────────────────────────────────────────────────────────

  // List conversations for a lead
  app.get("/api/sales/leads/:id/conversations", async (req, res) => {
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
  app.get("/api/sales/leads/:id/conversations/:convId", async (req, res) => {
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
  app.post("/api/sales/leads/:id/conversations/analyse", async (req, res) => {
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
  app.post("/api/sales/leads/:id/conversations", async (req, res) => {
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
}
